// Spec: spec/browser/thread-tick-phase.yaml
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setImmediate} from 'node:timers';
import {URL} from 'node:url';
import yaml from 'yaml';
import * as phaseModule from '../../scripts/browser-cpu-diagnostics/phase.mjs';
import {EventEmitter} from 'node:events';
import {withPhaseMetrics, NAMES, bindPhaseReceipt, sanitizePhaseRecord, SUPPORTED_CHROMIUM_REVISION} from '../../scripts/browser-cpu-diagnostics/phase.mjs';
import {withOriginalEntryMetrics,registerOriginalEntryMetrics} from '../../scripts/browser-cpu-diagnostics/phase-hook.mjs';
import {measureRendererScheduler, readRendererScheduler, rendererSchedulerDelta} from '../../apps/web/tests/helpers/renderer-scheduler.mjs';

test('Ohio scheduler observations report matching renderer deltas and exclude process identifiers', async () => {
 const renderer = {type:'renderer', id:42};
 async function sample(stats, pressure, enabled = '1', info = [renderer, {type:'browser', id:50}]) {
  const data = new Map([
   ['/proc/sys/kernel/sched_schedstats', enabled],
   ['/proc/pressure/cpu', `some avg10=1.02 avg60=0.40 avg300=0.45 total=${pressure}\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`],
   [`/proc/${info[0].id}/schedstat`, stats],
  ]);
  return readRendererScheduler(info, async file => {
   assert.ok(data.has(file), 'Expected only the scheduler counters');
   return data.get(file);
  });
 }
 const before = await sample('9007199254740993 50 19\n', '500');
 const after = await sample('9007199254741093 70 26\n', '610');
 assert.deepEqual(rendererSchedulerDelta(before, after), {
  status:'measured', rendererMainThreads:1, cpuNanoseconds:'100',
  runnableWaitNanoseconds:'20', timeslices:'7', hostCpuPressureMicroseconds:'110',
 });
 const disabled = await sample('9007199254741093 70 26', '610', '0');
 assert.deepEqual(rendererSchedulerDelta(before, disabled), {status:'host-pressure-only', hostCpuPressureMicroseconds:'110'});
 const disabledBefore = await sample('0 0 0', '500', '0');
 const disabledAfter = await sample('0 0 0', '610', '0');
 assert.deepEqual(rendererSchedulerDelta(disabledBefore, disabledAfter), {status:'host-pressure-only', hostCpuPressureMicroseconds:'110'});
 const replaced = await sample('9007199254741093 70 26', '610', '1', [{type:'renderer', id:43}]);
 assert.deepEqual(rendererSchedulerDelta(before, replaced), {status:'host-pressure-only', hostCpuPressureMicroseconds:'110'});
 assert.deepEqual(rendererSchedulerDelta(after, before), {status:'unavailable'});
 await assert.rejects(sample('unparseable', '610'));
});

test('a stalled scheduler snapshot cannot prevent header entry or replace its error', {timeout:2000}, async () => {
 const never = new Promise(() => {});
 const original = new Error('original header entry failure');
 let detached = 0;
 const session = {send: () => never, detach: () => { detached++; return never; }};
 const reports = [];
 await assert.rejects(
  measureRendererScheduler({newBrowserCDPSession: async () => session}, async () => { throw original; }, report => reports.push(report)),
  error => error === original,
 );
 assert.equal(detached, 1);
 assert.deepEqual(reports, [{status:'unavailable'}]);
});

test('late scheduler session acquisition still detaches after the original action returns', {timeout:2000}, async () => {
 const pending = Promise.withResolvers();
 let detached = 0;
 const reports = [];
 assert.equal(
  await measureRendererScheduler({newBrowserCDPSession: () => pending.promise}, async () => 'original result', report => reports.push(report)),
  'original result',
 );
 pending.resolve({detach: async () => { detached++; }});
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(detached, 1);
 assert.deepEqual(reports, [{status:'unavailable'}]);
});

const binding={sourceSha:'a'.repeat(40),imageId:'sha256:'+'b'.repeat(64),inventorySha256:'c'.repeat(64),chromiumRevision:SUPPORTED_CHROMIUM_REVISION};
const context={id:1,uniqueId:'PRIVATE-CONTEXT',auxData:{isDefault:true,frameId:'PRIVATE-FRAME'}};
test('entry wrapper inverts to exact original test source bytes',async()=>{
 const source=await readFile(new URL('../../apps/web/tests/oh-resident-credit-native.spec.ts',import.meta.url),'utf8');
 const importLine="\nimport {withOriginalEntryMetrics} from '../../../scripts/browser-cpu-diagnostics/phase-hook.mjs';";
 const wrapper='await withOriginalEntryMetrics(page, async () => {\n          await typeOriginals(page, facts, viewport.width === 1280);\n        });';
 assert.equal(source.split(importLine).length,2);assert.equal(source.split(wrapper).length,2);
 const original=source.replace(importLine,'').replace(wrapper,'await typeOriginals(page, facts, viewport.width === 1280);');
 assert.equal(createHash('sha256').update(original).digest('hex'),'6d52ee9b7e33b63d7ec37a1ab23452e0657307dcd61e8b7bd83ea5884a7476fb');
});
function harness(overrides={}) {
 const session=new EventEmitter(), commands=[],records=[];let n=0,body=0;
 session.send=async(name,args)=>{commands.push([name,args]);
  if(name==='Browser.getVersion')return{revision:'@'+binding.chromiumRevision,product:'PRIVATE-PRODUCT'};
  if(name==='Page.getFrameTree')return{frameTree:{frame:{id:'PRIVATE-FRAME'}}};
  if(name==='Runtime.enable')session.emit('Runtime.executionContextCreated',{context});
  if(name==='Runtime.evaluate')return{result:{type:'number',value:0}};
  if(name==='Performance.getMetrics'){n++;overrides.metricsEvent?.(session,n);return{metrics:NAMES.map((name,i)=>({name,value:10+i+n/10})).concat([{name:'PRIVATE-IGNORED',value:12}])};}
  return{};
 };
 session.detach=async()=>{commands.push(['detach']);};
 const options={enabled:true,origin:'http://127.0.0.1:3109',binding,createSession:async()=>session,use:async()=>{body++;return 42;},save:async r=>records.push(r),...overrides};
 return{session,commands,records,options,counts:()=>({body})};
}
test('positive fixed threadTicks deltas, no raw metadata',async()=>{
 const h=harness();assert.equal(await withPhaseMetrics(h.options),42);assert.equal(h.records[0].status,'observed-unbound');
 assert.deepEqual(h.commands.find(([n])=>n==='Performance.enable'),['Performance.enable',{timeDomain:'threadTicks'}]);
 assert.deepEqual(Object.keys(h.records[0].deltaSeconds),NAMES);
 for(const value of Object.values(h.records[0].deltaSeconds))assert.ok(Math.abs(value-.1)<1e-9);
 assert.doesNotMatch(JSON.stringify(h.records),/PRIVATE|ProcessTime|idle/);assert.deepEqual(h.counts(),{body:1});
});
test('default-off touches only use; preserves return and thrown identity',async()=>{
 const error={private:'body'};const options=new Proxy({enabled:false,use:()=>42},{get(o,k){assert.ok(['enabled','use'].includes(k));return o[k];}});
 assert.equal(await withPhaseMetrics(options),42);
 await assert.rejects(withPhaseMetrics({enabled:false,use:async()=>{throw error;}}),e=>e===error);
});
for(const event of ['Runtime.executionContextsCleared','Runtime.executionContextDestroyed','Page.frameStartedNavigating','Page.frameNavigated','Page.frameDetached','Inspector.detached']){
 for(const when of ['body','snapshot'])test(event+' rejects during '+when,async()=>{
  const h=harness(when==='snapshot'?{metricsEvent:(s,n)=>{if(n===2)s.emit(event,{PRIVATE:'secret'});}}:{});
  if(when==='body')h.options.use=async()=>h.session.emit(event,{PRIVATE:'secret'});
  await withPhaseMetrics(h.options);assert.equal(h.records[0].status,'unavailable');assert.equal(h.records[0].code,'epoch-changed');
 });
}
test('default-context replacement and missing uniqueId reject',async()=>{
 for(const replacement of [{...context,uniqueId:'replacement'},{...context,uniqueId:undefined}]){
  const h=harness();h.options.use=async()=>h.session.emit('Runtime.executionContextCreated',{context:replacement});
  await withPhaseMetrics(h.options);assert.equal(h.records[0].status,'unavailable');
 }
});
for(const kind of ['missing','duplicate','nan','infinity','negative','negative-delta','overlong'])test('metrics reject '+kind,async()=>{
 const h=harness(),send=h.session.send;let n=0;
 h.session.send=async(name,args)=>{const r=await send(name,args);if(name==='Performance.getMetrics'){
  n++;if(kind==='missing')r.metrics.shift();if(kind==='duplicate')r.metrics.push(r.metrics[0]);
  if(kind==='nan')r.metrics[0].value=NaN;if(kind==='infinity')r.metrics[0].value=Infinity;if(kind==='negative')r.metrics[0].value=-1;
  if(kind==='negative-delta'&&n===2)r.metrics[1].value=0;if(kind==='overlong')r.metrics=Array(129).fill(r.metrics[0]);
 }return r;};await withPhaseMetrics(h.options);assert.equal(h.records[0].status,'unavailable');
});
test('unsupported threadTicks and unknown revision fail closed; body always runs',async()=>{
 for(const kind of ['unsupported','revision','unreviewed-binding']){
  const h=harness(),send=h.session.send;
  if(kind==='unreviewed-binding')h.options.binding={...binding,chromiumRevision:'e'.repeat(40)};
  h.session.send=async(name,args)=>{if(name==='Performance.enable'&&kind==='unsupported')throw Error('PRIVATE');if(name==='Browser.getVersion'&&kind==='revision')return{revision:'@'+'e'.repeat(40)};return send(name,args);};
  await withPhaseMetrics(h.options);assert.equal(h.records[0].status,'unavailable');assert.equal(h.counts().body,1);
  assert.equal(h.commands.filter(([name])=>name==='Performance.enable').length<=1,true);
 }
});
test('actual hook default-off return, body-error identity and registered cleanup',async()=>{
 const page=new Proxy({}, {get(){throw Error('page touched');}}),value={token:1},error={original:1};
 assert.equal(withOriginalEntryMetrics(page,()=>value),value);
 assert.throws(()=>withOriginalEntryMetrics(page,()=>{throw error;}),e=>e===error);
 const h=harness(),remove=registerOriginalEntryMetrics(page,h.options);
 assert.equal(await withOriginalEntryMetrics(page,()=>42),42);assert.equal(h.records[0].status,'observed-unbound');
 remove();assert.equal(withOriginalEntryMetrics(page,()=>value),value);
});
test('outer receipt seals only independently validated source/image/inventory and file hash',()=>{
 const recordSha256='e'.repeat(64);
 assert.equal(bindPhaseReceipt({recordSha256,binding,outerIdentityValidated:true}).status,'bound');
 for(const outerIdentityValidated of [false,undefined,'true'])assert.equal(bindPhaseReceipt({recordSha256,binding,outerIdentityValidated}).code,'provenance-unavailable');
 assert.equal(bindPhaseReceipt({recordSha256:'PRIVATE',binding,outerIdentityValidated:true}).code,'provenance-unavailable');
});
test('stored projection rejects extra private keys, binding mismatch and counter tampering',async()=>{
 const h=harness();await withPhaseMetrics(h.options);const record=h.records[0];
 assert.deepEqual(sanitizePhaseRecord(record,binding),record);
 for(const mutation of [r=>r.PRIVATE='secret',r=>r.binding.imageId='sha256:'+'e'.repeat(64),r=>r.deltaSeconds.ThreadTime=-1,r=>r.deltaSeconds.EXTRA=1,r=>r.scope='whole-renderer-cpu']){
  const clone=globalThis.structuredClone(record);mutation(clone);assert.equal(sanitizePhaseRecord(clone,binding).code,'invalid-phase-artifact');
 }
});
test('post-snapshot guard addresses original unique context and failure rejects',async()=>{
 const h=harness();await withPhaseMetrics(h.options);
 assert.deepEqual(h.commands.find(([name])=>name==='Runtime.evaluate'),['Runtime.evaluate',{expression:'0',uniqueContextId:context.uniqueId,silent:true,returnByValue:true}]);
 const bad=harness(),send=bad.session.send;bad.session.send=async(name,args)=>name==='Runtime.evaluate'?{exceptionDetails:{PRIVATE:'secret'}}:send(name,args);
 await withPhaseMetrics(bad.options);assert.equal(bad.records[0].code,'epoch-changed');
});
test('missing, non-default and duplicate initial contexts reject',async()=>{
 for(const kind of ['missing','nondefault','duplicate']){
  const h=harness(),send=h.session.send;h.session.send=async(name,args)=>{
   if(name!=='Runtime.enable')return send(name,args);
   if(kind==='nondefault')h.session.emit('Runtime.executionContextCreated',{context:{...context,auxData:{isDefault:false,frameId:'PRIVATE-FRAME'}}});
   if(kind==='duplicate'){h.session.emit('Runtime.executionContextCreated',{context});h.session.emit('Runtime.executionContextCreated',{context});}
   return{};
  };
  await withPhaseMetrics(h.options);assert.equal(h.records[0].code,'epoch-changed');assert.equal(h.counts().body,1);
 }
});
test('late acquisition is bounded, body runs once, late session detaches',async()=>{
 const h=harness();let resolve,detached=0;h.session.detach=async()=>{detached++;};
 h.options.createSession=()=>new Promise(r=>{resolve=r;});
 await withPhaseMetrics(h.options);assert.equal(h.records[0].code,'command-unavailable');assert.equal(h.counts().body,1);
 resolve(h.session);await new Promise(r=>setImmediate(r));assert.equal(detached,1);
});
test('original body failure propagates while rejected record remains separate',async()=>{
 const h=harness(),error=new Error('PRIVATE');h.options.use=async()=>{throw error;};
 await assert.rejects(withPhaseMetrics(h.options),e=>e===error);assert.equal(h.records[0].status,'unavailable');assert.equal(h.records[0].code,'phase-incomplete');
});
test('cleanup failures are unavailable and detach is always issued',async()=>{
 for(const mode of ['disable-reject','disable-timeout','detach-reject','detach-timeout']){
  const h=harness(),send=h.session.send;let detaches=0;
  h.session.send=async(name,args)=>{
   const result=await send(name,args);
   if(name==='Performance.disable'&&mode==='disable-reject')throw Error('PRIVATE cleanup');
   if(name==='Performance.disable'&&mode==='disable-timeout')return new Promise(()=>{});
   return result;
  };
  h.session.detach=async()=>{detaches++;if(mode==='detach-reject')throw Error('PRIVATE detach');if(mode==='detach-timeout')return new Promise(()=>{});};
  assert.equal(await withPhaseMetrics(h.options),42);assert.equal(detaches,1);
  assert.equal(h.records[0].status,'unavailable',mode);assert.equal(h.records[0].code,'cleanup-unconfirmed',mode);
  assert.deepEqual(sanitizePhaseRecord(h.records[0],binding),h.records[0]);
  assert.doesNotMatch(JSON.stringify(h.records),/PRIVATE|deltaSeconds/);
 }
});
test('cleanup rejection preserves original body error identity',async()=>{
 const h=harness(),error={original:'PRIVATE body'},send=h.session.send;let detaches=0;
 h.options.use=async()=>{throw error;};
 h.session.send=async(name,args)=>{const result=await send(name,args);if(name==='Performance.disable')throw Error('PRIVATE cleanup');return result;};
 h.session.detach=async()=>{detaches++;};
 await assert.rejects(withPhaseMetrics(h.options),e=>e===error);assert.equal(detaches,1);
 assert.equal(h.records[0].code,'cleanup-unconfirmed');assert.doesNotMatch(JSON.stringify(h.records),/PRIVATE/);
});
test('workflow phase observer requires explicit full-batch dispatch opt-in',async()=>{
 const source=await readFile(new URL('../../.github/workflows/web.yml',import.meta.url),'utf8'),workflow=yaml.parse(source);
 assert.deepEqual(workflow.on.workflow_dispatch.inputs.cpu_phase_metrics,{description:'Observe original resident-entry threadTicks inside approved full-batch diagnostics',type:'boolean',required:false,default:false});
 const steps=Object.values(workflow.jobs).flatMap(job=>job.steps??[]),batchSteps=steps.filter(s=>s.uses==='./.github/actions/browser-cpu-full-batches'&&s.with?.['trace-pair']!=='true');
 assert.equal(batchSteps.length,2);
 for(const step of steps){
  if(batchSteps.includes(step)){
   assert.ok(step.if.includes('inputs.cpu_full_batches'));
   assert.equal(step.env.TAX_BROWSER_PHASE_DIAGNOSTICS,"${{ inputs.cpu_full_batches && inputs.cpu_phase_metrics && '1' || '0' }}");
  }else assert.equal(step.env?.TAX_BROWSER_PHASE_DIAGNOSTICS,undefined);
 }
 const {phaseAdmission}=phaseModule,env={TAX_BROWSER_CPU_BATCH_DIAGNOSTICS:'1',TAX_BROWSER_PHASE_DIAGNOSTICS:'1'},event={inputs:{cpu_full_batches:'true',cpu_phase_metrics:'true'}};
 assert.equal(phaseAdmission({},event),false);assert.equal(phaseAdmission(env,event),true);
 for(const inputs of [{},{cpu_full_batches:'true'},{cpu_phase_metrics:'true'},{cpu_full_batches:'false',cpu_phase_metrics:'true'},{cpu_full_batches:'true',cpu_phase_metrics:'false'},{cpu_full_batches:true,cpu_phase_metrics:true}])assert.throws(()=>phaseAdmission(env,{inputs}));
 assert.throws(()=>phaseAdmission({...env,TAX_BROWSER_CPU_BATCH_DIAGNOSTICS:'0'},event));
 const input="      cpu_phase_metrics:\n        description: Observe original resident-entry threadTicks inside approved full-batch diagnostics\n        type: boolean\n        required: false\n        default: false\n";
 const forwarding="          TAX_BROWSER_PHASE_DIAGNOSTICS: ${{ inputs.cpu_full_batches && inputs.cpu_phase_metrics && '1' || '0' }}\n";
 assert.equal(source.split(input).length,2);assert.equal(source.split(forwarding).length,3);
 let original=source.replace(input,'').replaceAll(forwarding,'');
 const traceInput=/^ {6}ohio_trace_pair:\n(?:^ {8}[^\n]*\n){4}/m;
 const traceBlock=/^ {6}- name: Compare trace capture in the original failing Ohio window\n[\s\S]*?(?=^ {6}- name: Compare focused Ohio journeys)/m;
 const traceGroup="github.event_name == 'workflow_dispatch' && inputs.ohio_trace_pair && format('web-ohio-trace-pair-{0}', github.run_id) || ";
 const ohioInput=/^ {6}compare_ohio_runtimes:\n(?:^ {8}[^\n]*\n){4}/m;
 const ohioBlock=/^ {6}- name: Compare focused Ohio journeys on the same runner\n[\s\S]*?(?=^ {6}- name: Verify Docker archive)/m;
 const ohioGroup="github.event_name == 'workflow_dispatch' && inputs.compare_ohio_runtimes && format('web-ohio-comparison-{0}', github.run_id) || ";
 const comparison=workflow.jobs.container.steps.filter(step=>step.name==='Compare focused Ohio journeys on the same runner');
 assert.equal(comparison.length,1);
 assert.equal(workflow.on.workflow_dispatch.inputs.compare_ohio_runtimes.default,false);
 assert.match(comparison[0].if,/github.event_name == 'workflow_dispatch' && inputs.compare_ohio_runtimes/u);
 assert.equal(comparison[0].id,'ohio_runtime_comparison');
 assert.equal(comparison[0]['timeout-minutes'],18);
 assert.equal(comparison[0]['continue-on-error'],undefined);
 assert.match(comparison[0].run,/--workers=2 --retries=0 --timeout=30000/u);
 assert.match(comparison[0].run,/TAX_BROWSER_OHIO_SCHEDULER_MODE=container PLAYWRIGHT_DISABLE_WEBSERVER=true/u);
 assert.match(comparison[0].run,/TAX_BROWSER_OHIO_SCHEDULER_MODE=managed pnpm test:web/u);
 for(const delta of [traceInput,traceBlock,traceGroup,ohioInput,ohioBlock,ohioGroup,'            ohio-same-runner-*.log\n            ohio-same-runner-status.txt\n']){
  assert.equal(original.split(delta).length,2);
  original=original.replace(delta,'');
 }
 // Separately reviewed lint fixes and CI retention preserve the prior workflow.
 const reviewedDeltas=[
  ["git rev-parse HEAD 'HEAD^{tree}'",'git rev-parse HEAD HEAD^{tree}'],
  ['for ((attempt=1; attempt<=60; attempt++)); do','for attempt in $(seq 1 60); do'],
  ['      - name: Verify original-entry timing contracts\n        run: node --test tests/scripts/thread-tick-phase.test.mjs tests/scripts/full-batch-public-cpu-diagnostic.test.mjs\n',''],
  ['node:26.13.1-trixie-slim@sha256:615a27817f7b9508f0de73eb1cc8fc8894ab122bee56c1a7a568b72cd1032067','node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc'],
 ];
 for(const[after,before]of reviewedDeltas){
  assert.equal(original.split(after).length,2);
  original=original.replace(after,before);
 }
 // The reviewed scanner extraction in 5380da8c replaces one AMD64 scanner block.
 assert.equal(createHash('sha256').update(original).digest('hex'),'38c2c8eb8997b35d0121f33e75b817d73f186ceb225d66a8d5f26ad90405ed4b');
});

test('diagnostic source pins refresh without changing original budgets or collection',async()=>{
 const read=async name=>readFile(new URL('../../'+name,import.meta.url),'utf8'),sha=text=>createHash('sha256').update(text).digest('hex');
 const [auditText,casesText,fullText,source]=await Promise.all([read('scripts/browser-request-budgets.json'),read('scripts/browser-cpu-diagnostics/cases.json'),read('scripts/browser-cpu-diagnostics/full-batches.json'),read('apps/web/tests/oh-resident-credit-native.spec.ts')]);
 const audit=JSON.parse(auditText),cases=JSON.parse(casesText),full=JSON.parse(fullText),path='apps/web/tests/oh-resident-credit-native.spec.ts';
 assert.equal(audit.sourceHashes[path],sha(source));assert.equal(full.sourceSha256[path],sha(source));assert.equal(cases.auditSha256,sha(auditText));
 assert.equal(cases.targetSourceSha256['oh-resident-credit-native.spec.ts'],sha(source.replace('../scripts/browser-cpu-diagnostics/fixture','@playwright/test')));
 const project=(data,keys)=>Object.fromEntries(Object.entries(data).filter(([key])=>!keys.includes(key)));
 // The current audit adds two deductions cases and moves two request call sites.
 assert.equal(sha(JSON.stringify(project(audit,['sourceHashes']))),'f0b4f93c11260d72e39ea769b87028195048a765ef647e02fb316c1938312198');
 assert.equal(sha(JSON.stringify(project(cases,['auditSha256','targetSourceSha256']))),'f5b67f03b7c03f5b92635aa2cb2725d0fdf04006509a0dab81f104580657d1bb');
 // The full-batch pin refers to its historical 655-case source selection.
 assert.equal(sha(JSON.stringify(project(full,['sourceSha256']))),'b08c9c74fca59e0f25c9f88fa8b00c7d10eac463f22b32d547252f2ba88378f2');
 assert.equal(full.fullCaseCount,655);assert.equal(cases.workers,2);assert.equal(cases.retries,0);assert.equal(cases.targetDeadlineMs,30000);
});
