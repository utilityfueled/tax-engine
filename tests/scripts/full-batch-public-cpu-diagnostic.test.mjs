// Spec: spec/browser/full-batch-public-cpu-diagnostic.yaml
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {delimiter,join} from 'node:path';
import {URL} from 'node:url';
const moduleUrl=new URL('../../scripts/browser-cpu-diagnostics/full-batch.mjs',import.meta.url);
const traceUrl=new URL('../../scripts/browser-cpu-diagnostics/trace-pair.mjs',import.meta.url);
const runnerUrl=new URL('../../scripts/browser-cpu-diagnostics/runner.mjs',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('../../scripts/browser-cpu-diagnostics/full-batches.json',import.meta.url),'utf8'));
test('each frozen replay source digest still matches the checkout', async () => {
 const root = new URL('../../', import.meta.url);
 for (const [file, expected] of Object.entries(manifest.sourceSha256)) {
  const actual = createHash('sha256').update(await readFile(new URL(file, root))).digest('hex');
  assert.equal(actual, expected, file);
 }
});
const sha='a'.repeat(40),run='12345',start=Date.UTC(2026,10,17,20);
const env=()=>({TAX_BROWSER_CPU_BATCH_DIAGNOSTICS:'1',TAX_BROWSER_CPU_BATCH:'6',TAX_BROWSER_CPU_ORIGINAL_OUTCOME:'failure',GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:run,GITHUB_REPOSITORY:'utilityfueled/tax-engine',GITHUB_JOB:'container',GITHUB_SHA:sha,GITHUB_REF:'refs/heads/main',CANDIDATE_IMAGE_ID:'sha256:'+'b'.repeat(64),PLAYWRIGHT_BASE_URL:'http://127.0.0.1:3109'});
const event=()=>({inputs:{cpu_full_batches:'true'},repository:{private:false,fork:false,default_branch:'main'}});
const job=()=>({id:678,run_id:Number(run),run_attempt:1,head_sha:sha,name:'Container Recovery, Browser Flows and SBOM',status:'in_progress',started_at:new Date(start).toISOString(),completed_at:null});
const batches=()=>Array.from({length:8},(_,i)=>manifest.batches[String(i+1)]?globalThis.structuredClone(manifest.batches[String(i+1)]):{rows:[],bounds:{}});
test('explicit-same-job-admission',async()=>{
 const {admitBatch,main}=await import(moduleUrl);
 assert.equal(await main({env:{},root:'/synthetic-must-not-be-accessed'}),0);
 assert.equal(admitBatch(env(),event(),sha,'linux','x64'),6);
 assert.equal(admitBatch({...env(),TAX_BROWSER_CPU_BATCH:'7'},event(),sha,'linux','x64'),7);
 for(const flag of [undefined,'','0','true',' 1'])assert.equal(admitBatch({...env(),TAX_BROWSER_CPU_BATCH_DIAGNOSTICS:flag},event(),sha,'linux','x64'),false);
 for(const delta of [{GITHUB_SHA:'b'.repeat(40)},{GITHUB_REF:'refs/heads/foreign'},{GITHUB_EVENT_NAME:'push'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_JOB:'browser'},{GITHUB_REPOSITORY:'foreign/repo'},{TAX_BROWSER_CPU_BATCH:'8'},{TAX_BROWSER_CPU_ORIGINAL_OUTCOME:'success'},{PLAYWRIGHT_BASE_URL:'https://foreign.invalid'},{CANDIDATE_IMAGE_ID:'foreign'}])assert.throws(()=>admitBatch({...env(),...delta},event(),sha,'linux','x64'));
 assert.throws(()=>admitBatch(env(),event(),sha,'darwin','arm64'));
 for(const change of [{inputs:{cpu_full_batches:'false'}},{repository:{private:true,fork:false,default_branch:'main'}},{repository:{private:false,fork:true,default_branch:'main'}}])assert.throws(()=>admitBatch(env(),{...event(),...change},sha,'linux','x64'));
});
test('original-whole-batch-selection',async()=>{
 const {selectOriginalBatch}=await import(moduleUrl);
 for(const n of [6,7]){const bs=batches();assert.deepEqual(selectOriginalBatch(bs,manifest,n),bs[n-1]);}
 for(const mutate of [bs=>bs.pop(),bs=>bs[5].rows.pop(),bs=>bs[5].rows.reverse(),bs=>bs[5].rows[0].timeout=90000,bs=>bs[5].rows[0].id='foreign',bs=>bs[5].bounds['filled-return']++,bs=>bs[5].rows[0].expectedStatus='skipped']){const bs=batches();mutate(bs);assert.throws(()=>selectOriginalBatch(bs,manifest,6));}
 assert.throws(()=>selectOriginalBatch(batches(),manifest,8));
});
test('original-browser-contract',async()=>{
 const {browserArguments,executeBatch}=await import(moduleUrl);const batch={...batches()[5],list:'/private/synthetic/list.txt'},calls=[];
 const args=['test','--workers=2','--retries=0','--timeout=30000','--project=chromium','--trace=retain-on-failure','--test-list',batch.list];assert.deepEqual(browserArguments(batch.list),args);
 const result=await executeBatch(batch,{collect:async()=>batch.rows,execute:async actual=>{calls.push(actual);return{exit:1,report:{synthetic:true}};}});assert.equal(result.exit,1);assert.deepEqual(calls,[args]);
 calls.length=0;await assert.rejects(executeBatch(batch,{collect:async()=>batch.rows.slice(1),execute:async()=>calls.push('forbidden')}));assert.equal(calls.length,0);
 const drift=globalThis.structuredClone(batch.rows);drift[0].timeout=90000;await assert.rejects(executeBatch(batch,{collect:async()=>drift,execute:async()=>calls.push('forbidden')}));assert.equal(calls.length,0);
});
test('binds pinned PDF test Python before optional browser children with no host fallback', {skip:process.platform==='win32'}, async () => {
 const {preparePdfBrowserEnvironment}=await import(runnerUrl);
 const root=await mkdtemp(join(tmpdir(),'tax-browser-pdf-test-'));
 try {
  const host=join(root,'host'),checkout=join(root,'.local','pdf-test-venv','bin');
  const web=join(root,'apps','web');
  await mkdir(host);
  await mkdir(checkout,{recursive:true});
  await mkdir(web,{recursive:true});
  const hostFallback='#!/bin/sh\nprintf host > host-python-used\nexit 0\n';
  await writeFile(join(host,'python3'),hostFallback,{mode:0o700});
  await writeFile(join(host,'python'),hostFallback,{mode:0o700});
  const signal=new AbortController().signal,childEnv={PATH:host,PLAYWRIGHT_BASE_URL:'http://127.0.0.1:3109'};
  assert.equal(await preparePdfBrowserEnvironment(root,childEnv,signal),null);
  const valid='#!/bin/sh\nif [ "$1" = read-pdf ]; then printf "checkout Python"; exit 0; fi\n[ "$1" = -c ]\n';
  const python=join(checkout,'python');
  await writeFile(python,valid,{mode:0o700});
  const bound=await preparePdfBrowserEnvironment(root,childEnv,signal);
  assert.deepEqual(bound,{...childEnv,TAX_ENGINE_PDF_TEST_PYTHON:python});
  assert.equal(execFileSync(bound?.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['read-pdf'],{cwd:web,env:bound,encoding:'utf8'}),'checkout Python');
  await writeFile(python,'#!/bin/sh\nprintf "synthetic interpreter detail" >&2\nexit 6\n',{mode:0o700});
  assert.equal(await preparePdfBrowserEnvironment(root,childEnv,signal),null);
  const override=join(root,'overridden-python');
  await writeFile(override,valid,{mode:0o700});
  assert.equal((await preparePdfBrowserEnvironment(root,{...childEnv,TAX_ENGINE_PDF_TEST_PYTHON:override},signal))?.TAX_ENGINE_PDF_TEST_PYTHON,override);
  const relativeOverride=await preparePdfBrowserEnvironment(root,{...childEnv,TAX_ENGINE_PDF_TEST_PYTHON:'./overridden-python'},signal);
  assert.equal(relativeOverride?.TAX_ENGINE_PDF_TEST_PYTHON,override);
  assert.equal(execFileSync(relativeOverride.TAX_ENGINE_PDF_TEST_PYTHON,['read-pdf'],{cwd:web,env:relativeOverride,encoding:'utf8'}),'checkout Python');
  await writeFile(join(host,'chosen-python'),valid,{mode:0o700});
  const bareOverride=await preparePdfBrowserEnvironment(root,{...childEnv,TAX_ENGINE_PDF_TEST_PYTHON:'chosen-python'},signal);
  assert.equal(bareOverride?.TAX_ENGINE_PDF_TEST_PYTHON,'chosen-python');
  assert.equal(execFileSync(bareOverride.TAX_ENGINE_PDF_TEST_PYTHON,['read-pdf'],{cwd:web,env:bareOverride,encoding:'utf8'}),'checkout Python');
  await writeFile(join(host,'chosen-python'),hostFallback,{mode:0o700});
  await writeFile(join(root,'chosen-python'),valid,{mode:0o700});
  await mkdir(join(root,'launchers'));
  await writeFile(join(root,'launchers','chosen-python'),valid,{mode:0o700});
  for(const entry of ['','launchers']) {
   const relativePath=await preparePdfBrowserEnvironment(root,{...childEnv,PATH:[entry,host].join(delimiter),TAX_ENGINE_PDF_TEST_PYTHON:'chosen-python'},signal);
   assert.equal(execFileSync(relativePath.TAX_ENGINE_PDF_TEST_PYTHON,['read-pdf'],{cwd:web,env:relativePath,encoding:'utf8'}),'checkout Python');
  }
  for(const cwd of [root,web])await assert.rejects(readFile(join(cwd,'host-python-used')),{code:'ENOENT'});
 } finally {
  await rm(root,{recursive:true,force:true});
 }
});
test('requires the exact pypdf version under Python optimization', {skip:process.platform==='win32'}, async () => {
 const {preparePdfBrowserEnvironment}=await import(runnerUrl);
 const root=await mkdtemp(join(tmpdir(),'tax-browser-optimized-python-'));
 try {
  const fakePypdf=join(root,'pypdf.py');
  const env={PATH:process.env.PATH,PYTHONDONTWRITEBYTECODE:'1',PYTHONOPTIMIZE:'1',TAX_ENGINE_PDF_TEST_PYTHON:'python3'};
  const signal=new AbortController().signal;
  await writeFile(fakePypdf,"__version__ = '6.10.1'\n");
  assert.ok((await preparePdfBrowserEnvironment(root,env,signal)) === null,'reject the wrong version');
  await writeFile(fakePypdf,"__version__ = '6.10.0'\n");
  assert.equal((await preparePdfBrowserEnvironment(root,env,signal))?.TAX_ENGINE_PDF_TEST_PYTHON,'python3');
 } finally {
  await rm(root,{recursive:true,force:true});
 }
});
test('per-case browser children require the admitted PDF environment', async () => {
 const source=await readFile(runnerUrl,'utf8');
 const original=source.indexOf('const original = await originalQualification');
 const prepare=source.indexOf('const browserEnv = await preparePdfBrowserEnvironment(root, childEnv, abort.signal)');
 const collect=source.indexOf('const collect = async');
 assert.ok(original>=0&&original<prepare&&prepare<collect);
 assert.match(source.slice(prepare,collect),/if \(!browserEnv\) \{[\s\S]+code: 'pdf-test-prerequisite-unavailable'[\s\S]+originalFailureSuperseded: false[\s\S]+return 1;/);
 assert.match(source,/const profilerEnv = \{ \.\.\.browserEnv,/);
 assert.match(source.slice(collect),/env: enabled \? profilerEnv : browserEnv/);
 assert.match(source.slice(collect),/env: \{ \.\.\.profilerEnv, PLAYWRIGHT_JSON_OUTPUT_FILE:/);
});
test('remaining-job-budget',async()=>{
 const {remainingJobBudget}=await import(moduleUrl);
 const exact=start+5400000-1200000;assert.equal(remainingJobBudget(job(),env(),exact).allowed,true);assert.equal(remainingJobBudget(job(),env(),exact+1).allowed,false);
 for(const change of [{run_id:54321},{run_attempt:2},{head_sha:'b'.repeat(40)},{name:'foreign'},{status:'completed'},{completed_at:new Date(start).toISOString()},{started_at:'foreign'},{started_at:new Date(start+60000).toISOString()}])assert.throws(()=>remainingJobBudget({...job(),...change},env(),start));
 for(const now of [NaN,Infinity,-1])assert.throws(()=>remainingJobBudget(job(),env(),now));
});
test('public job budget reports only bounded failure reasons', async () => {
 const { readOriginalJobBudget } = await import(moduleUrl);
 const signal = new AbortController().signal;
 const read = fetchResponse => readOriginalJobBudget(env(), signal, { fetchResponse, now: () => start });
 assert.deepEqual(await read(async (url, init) => {
  assert.equal(url, `https://api.github.com/repos/utilityfueled/tax-engine/actions/runs/${run}/jobs?filter=latest&per_page=100`);
  assert.equal(init.redirect, 'error');
  assert.equal(Object.hasOwn(init.headers, 'Authorization'), false);
  return globalThis.Response.json({ total_count: 1, jobs: [job()] });
 }), { budget: { jobId: 678, deadlineEpochMs: start + 5400000, remainingMs: 5400000, controllerMs: 600000, postStepReserveMs: 600000, allowed: true } });
 assert.deepEqual(await read(async () => { throw Error('synthetic private transport details'); }),
  { reason: 'original-job-request-unavailable' });
 assert.deepEqual(await read(async () => new globalThis.Response('synthetic private refusal', { status: 403 })),
  { reason: 'original-job-http-status', httpStatus: 403 });
 assert.deepEqual(await read(async () => new globalThis.Response('synthetic malformed data')),
  { reason: 'original-job-response-invalid' });
 assert.deepEqual(await read(async () => globalThis.Response.json({ total_count: 1, jobs: [{ ...job(), head_sha: 'b'.repeat(40) }] })),
  { reason: 'original-job-identity-mismatch' });
});
test('observed case failure never becomes a successful diagnostic exit',async()=>{
 const {diagnosticExit}=await import(moduleUrl);const summary={caseCount:10,error:null,cleanup:true,failed:0};
 assert.equal(diagnosticExit(summary,10,0),0);
 for(const[s,n,missing]of [[{...summary,failed:1},10,0],[summary,10,1],[{...summary,cleanup:false},10,0],[{...summary,error:'synthetic'},10,0],[summary,15,0]])assert.equal(diagnosticExit(s,n,missing),1);
});
test('sanitized-only-artifacts',async()=>{
 const s=await readFile(new URL('../../.github/actions/browser-cpu-full-batches/action.yml',import.meta.url),'utf8');
 for(const text of ["default: 'false'",'batch:',"TAX_BROWSER_CPU_BATCH: ${{ inputs.batch }}",'artifacts/browser-cpu-full-batch-${{ inputs.batch }}/','retention-days: 3'])assert.ok(s.includes(text),text);
 assert.ok(!/timeout-minutes:|trace\.zip|profiles\/|test-results\/|secrets\./.test(s));
 const code=await readFile(moduleUrl,'utf8');for(const text of ['sanitizeStoredRecord','validateInventory','publicChunkMetadata','projectCaseResults','verifyAudit','MAX_TOTAL_MS = 600000','originalFailureSuperseded: false','paSampled: false'])assert.ok(code.includes(text),text);
 assert.ok(!code.includes('--trace=off'));assert.ok(!/'docker',\s*\[\s*'(?:stop|rm|run|build)'/.test(code));
});

test('trace pairing requires its own manual opt-in and preserves original qualification', async () => {
 const {admitBatch,main,remainingJobBudget}=await import(moduleUrl);
 const {TRACE_PAIR_MS}=await import(traceUrl);
 const pairEnv={...env(),TAX_BROWSER_TRACE_PAIR:'true',TAX_BROWSER_CPU_BATCH:'7'};
 const pairEvent={...event(),inputs:{ohio_trace_pair:'true'}};
 assert.equal(await main({env:{TAX_BROWSER_TRACE_PAIR:'true'},root:'/synthetic-must-not-be-accessed'}),0);
 assert.equal(admitBatch(pairEnv,pairEvent,sha,'linux','x64'),7);
 assert.throws(()=>admitBatch(pairEnv,event(),sha,'linux','x64'));
 assert.throws(()=>admitBatch({...pairEnv,TAX_BROWSER_CPU_ORIGINAL_OUTCOME:'success'},pairEvent,sha,'linux','x64'));
 for(const name of ['cpu_diagnostics','cpu_full_batches','cpu_phase_metrics','compare_ohio_runtimes']){
  assert.throws(()=>admitBatch(pairEnv,{...pairEvent,inputs:{...pairEvent.inputs,[name]:'true'}},sha,'linux','x64'));
 }
 const cutoff=start+5400000-TRACE_PAIR_MS-600000;
 assert.equal(remainingJobBudget(job(),pairEnv,cutoff,TRACE_PAIR_MS).allowed,true);
 assert.equal(remainingJobBudget(job(),pairEnv,cutoff+1,TRACE_PAIR_MS).allowed,false);
 const workflow=await readFile(new URL('../../.github/workflows/web.yml',import.meta.url),'utf8');
 assert.match(workflow,/ohio_trace_pair:\s+description:[^\n]+\s+type: boolean\s+required: false\s+default: false/);
 assert.match(workflow,/id: container_browser[\s\S]+?run: pnpm test:web --retries=0 --timeout=30000 --trace=retain-on-failure/);
 assert.match(workflow,/Compare trace capture in the original failing Ohio window\s+if: [^\n]+inputs.ohio_trace_pair[^\n]+steps.container_browser.outcome == 'failure'/);
});

test('trace pairing chooses a complete original Ohio window with an observed timeout', async () => {
 const {selectTraceWindow}=await import(traceUrl);
 const {selectOriginalBatch}=await import(moduleUrl);
 const original=batches();
 const ids=[original[5].rows[0].id,original[6].rows[0].id];
 const timeouts=ids.map(id=>({id,failureCategory:'timeout'}));
 assert.equal(selectTraceWindow(original,timeouts,new Set(ids)),7);
 const n=selectTraceWindow(original,timeouts.slice(0,1),new Set(ids));
 assert.equal(n,6);
 assert.deepEqual(selectOriginalBatch(original,manifest,n).rows,manifest.batches[6].rows);
 assert.equal(selectTraceWindow(original,timeouts,new Set()),undefined);
 assert.equal(selectTraceWindow(original,[{id:ids[1],failureCategory:'assertion'}],new Set(ids)),undefined);
});

function traceFixture() {
 const file='oh-fixture.spec.ts';
 const report=(status,timeout=30000)=>({errors:[],config:{workers:2,projects:[{retries:0,repeatEach:1}]},suites:[{title:file,specs:['a','b'].map((label,i)=>({title:label,file,id:`${label.repeat(20)}-${label.repeat(20)}`,tests:[{projectName:'chromium',timeout,expectedStatus:'passed',results:[{status:i===0?status:'passed',retry:0,duration:27,errors:[]}]}]}))}]});
 const waits=[],calls=[],saved=new Map();
 let clock=0;
 const io={now:()=>({mono:clock,wall:clock}),sleep:async ms=>{waits.push(ms);clock+=ms;},identity:async()=>{},alive:()=>true,cleanup:async()=>true,
  run:async trace=>{calls.push(trace);clock+=37;const failing=trace==='retain-on-failure';return{exit:failing?1:0,report:report(failing?'timedOut':'passed'),executionMs:28};}};
 return{report,waits,calls,saved,io,save:async(name,record)=>saved.set(name,record),audit:{files:{[file]:{}}},binding:{originalQualification:{failed:7}}};
}

test('trace legs differ only in capture mode and preserve totals across consecutive natural windows', async () => {
 const {runTracePair}=await import(traceUrl);
 const {browserArguments}=await import(moduleUrl);
 const {rowsFromReport}=await import('../../scripts/run-browser-tests.mjs');
 const f=traceFixture(),list='/private/synthetic/list.txt';
 const baseline=browserArguments(list);
 assert.deepEqual(browserArguments(list,'off'),baseline.map(arg=>arg==='--trace=retain-on-failure'?'--trace=off':arg));
 assert.throws(()=>browserArguments(list,'on'));
 const rows=rowsFromReport(f.report('passed'));
 assert.equal(await runTracePair({...f,batch:{rows,bounds:{}}}),true);
 assert.deepEqual(f.calls,['retain-on-failure','off']);
 assert.deepEqual(f.waits,[61000,61000]);
 const result=f.saved.get('result.json');
 assert.equal(result.originalFailureSuperseded,false);
 assert.deepEqual(result.originalQualification,{failed:7});
 assert.deepEqual(result.executionOrder,['retain-on-failure','off']);
 assert.match(result.limitation,/run order.*cache.*timing/u);
 assert.deepEqual(result.legs.map(leg=>[leg.passed,leg.failed,leg.skipped,leg.wallMs,leg.executionMs]),[[1,1,0,37,28],[2,0,0,37,28]]);
 assert.deepEqual(result.legs.map(leg=>leg.cases.map(row=>row.id)),[rows.map(row=>row.id),rows.map(row=>row.id)]);
 assert.equal(result.legs[0].cases[0].failureCategory,'timeout');
});

test('a trace leg with deadline drift cannot be reported as a completed comparison', async () => {
 const {runTracePair}=await import(traceUrl);
 const {rowsFromReport}=await import('../../scripts/run-browser-tests.mjs');
 const f=traceFixture(),rows=rowsFromReport(f.report('passed'));
 f.io.run=async trace=>{f.calls.push(trace);return{exit:0,report:f.report('passed',90000),executionMs:28};};
 assert.equal(await runTracePair({...f,batch:{rows,bounds:{}}}),false);
 assert.deepEqual(f.calls,['retain-on-failure']);
 assert.equal(f.saved.get('result.json').complete,false);
 assert.equal(f.saved.get('result.json').legs[0].incompleteReason,'schedule-or-result-verification-failed');
});

test('an incomplete collection exposes only a fixed failure reason', async () => {
 const {runTracePair}=await import(traceUrl);
 const {executeBatch}=await import(moduleUrl);
 const {rowsFromReport}=await import('../../scripts/run-browser-tests.mjs');
 const f=traceFixture(),rows=rowsFromReport(f.report('passed'));
 const batch={rows,bounds:{},list:'/private/synthetic/list.txt'};
 f.io.run=trace=>executeBatch(batch,{
  collect:async()=>{f.calls.push(trace);throw Error('synthetic private collection detail');},
  execute:async()=>f.calls.push('forbidden'),
 },trace);
 assert.equal(await runTracePair({...f,batch}),false);
 assert.deepEqual(f.calls,['retain-on-failure']);
 const result=f.saved.get('result.json');
 assert.deepEqual(result.executionOrder,['retain-on-failure','off']);
 assert.deepEqual(result.legs,[{trace:'retain-on-failure',complete:false,incompleteReason:'schedule-or-result-verification-failed'}]);
 assert.ok(!JSON.stringify([...f.saved]).includes('synthetic private collection detail'));
});
