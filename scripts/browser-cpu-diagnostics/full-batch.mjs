import {bindPhaseReceipt,sanitizePhaseRecord,phaseAdmission} from './phase.mjs';
import {projectDiagnosticCases} from './fixed-metadata.mjs';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {readFile,writeFile,readdir,lstat,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {setTimeout as pause} from 'node:timers/promises';
import {auditCollection,containerProof,environment,exactUnion,noEnvFiles,planBatches,reconcile,rowsFromReport,runSchedule,snapshot,testList,verifyAudit} from '../run-browser-tests.mjs';
import {collectionHash,selectCases} from './selection.mjs';
import {command,preparePdfBrowserEnvironment,projectCaseResults} from './runner.mjs';
import {LIMITS,ORIGIN,unavailable,validateInventory,publicChunkMetadata,sanitizeStoredRecord} from './profile.mjs';
import {TRACE_PAIR_MS,runTracePair,selectTraceWindow} from './trace-pair.mjs';

const MAX_TOTAL_MS = 600000;
const POST_STEP_RESERVE_MS=600000;
const JOB_MS=90*60*1000;
const need=ok=>{if(!ok)throw Error('full-batch-diagnostic-unavailable');};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const canonical=r=>({key:r.key,id:r.id,file:r.file,titles:r.titles,project:r.project,timeout:r.timeout,expectedStatus:r.expectedStatus});

export function admitBatch(env,event,head,platform=process.platform,arch=process.arch){
 if(env.TAX_BROWSER_CPU_BATCH_DIAGNOSTICS!=='1')return false;
 need(platform==='linux'&&arch==='x64'&&env.GITHUB_ACTIONS==='true'&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_RUN_ATTEMPT==='1');
 need(env.GITHUB_REPOSITORY==='utilityfueled/tax-engine'&&env.GITHUB_JOB==='container'&&/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID));
 need(/^[a-f0-9]{40}$/u.test(head)&&env.GITHUB_SHA===head&&env.TAX_BROWSER_CPU_ORIGINAL_OUTCOME==='failure');
 need(event?.repository?.private===false&&event.repository.fork===false&&event.repository.default_branch==='main'&&env.GITHUB_REF==='refs/heads/main');
 if(env.TAX_BROWSER_TRACE_PAIR==='true'){
  need(event.inputs?.ohio_trace_pair==='true'&&env.TAX_BROWSER_CPU_BATCH==='7');
  need(['cpu_diagnostics','cpu_full_batches','cpu_phase_metrics','compare_ohio_runtimes'].every(key=>event.inputs[key]!=='true'));
 }else need(event.inputs?.cpu_full_batches==='true');
 need(env.PLAYWRIGHT_BASE_URL===ORIGIN&&/^sha256:[a-f0-9]{64}$/u.test(env.CANDIDATE_IMAGE_ID));
 need(env.TAX_BROWSER_CPU_BATCH==='6'||env.TAX_BROWSER_CPU_BATCH==='7');
 return Number(env.TAX_BROWSER_CPU_BATCH);
}
export function remainingJobBudget(job,env,now=Date.now(),controllerMs=MAX_TOTAL_MS){
 need(Number.isSafeInteger(now)&&now>=0&&job&&Number.isSafeInteger(job.id)&&job.id>0);
 need(String(job.run_id)===env.GITHUB_RUN_ID&&job.run_attempt===1&&job.head_sha===env.GITHUB_SHA);
 need(job.name==='Container Recovery, Browser Flows and SBOM'&&job.status==='in_progress'&&job.completed_at===null);
 const started=Date.parse(job.started_at);need(Number.isSafeInteger(started)&&started>=0&&started<=now);
 const deadlineEpochMs=started+JOB_MS,remainingMs=deadlineEpochMs-now;
 return{jobId:job.id,deadlineEpochMs,remainingMs,controllerMs,postStepReserveMs:POST_STEP_RESERVE_MS,allowed:remainingMs>=controllerMs+POST_STEP_RESERVE_MS};
}
export function selectOriginalBatch(batches,manifest,number){
 need(manifest.version===1&&manifest.fullCaseCount===655&&manifest.totalBatches===8&&manifest.paSampled===false);
 need((number===6||number===7)&&batches.length===8);
 const batch=batches[number-1],frozen=manifest.batches[number];
 need(batch&&frozen&&batch.rows.length===(number===6?10:15));
 need(equal(batch.rows.map(canonical),frozen.rows)&&equal(batch.bounds,frozen.bounds));
 need(batch.rows.every(r=>r.timeout===30000&&r.project==='chromium'&&r.expectedStatus==='passed'));
 return batch;
}
export function browserArguments(list,trace='retain-on-failure'){
 need(typeof list==='string'&&path.isAbsolute(list)&&!/[\r\n\0]/u.test(list));
 need(trace==='retain-on-failure'||trace==='off');
 return['test','--workers=2','--retries=0','--timeout=30000','--project=chromium',`--trace=${trace}`,'--test-list',list];
}
export async function executeBatch(batch,io,trace){
 const collected=await io.collect(batch.list);
 need(equal(collected.map(canonical),batch.rows.map(canonical)));
 return io.execute(browserArguments(batch.list,trace));
}
export function diagnosticExit(summary,expected,missing){
 return summary.caseCount===expected&&!summary.error&&summary.cleanup&&summary.failed===0&&missing===0?0:1;
}
async function readJson(file,max=LIMITS.bytes){
 const stat=await lstat(file);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=max);
 const bytes=await readFile(file);need(bytes.length<=max);return JSON.parse(bytes.toString('utf8'));
}
export async function readOriginalJobBudget(env, signal, { fetchResponse = globalThis.fetch, now = Date.now, controllerMs = MAX_TOTAL_MS } = {}) {
 // Read the public GitHub endpoint for the admitted run without credentials.
 let response;
 try {
  response = await fetchResponse(
   `https://api.github.com/repos/utilityfueled/tax-engine/actions/runs/${env.GITHUB_RUN_ID}/jobs?filter=latest&per_page=100`,
   {
    redirect: 'error',
    signal: globalThis.AbortSignal.any([signal, globalThis.AbortSignal.timeout(10000)]),
    headers: {
     Accept: 'application/vnd.github+json',
     'X-GitHub-Api-Version': '2022-11-28',
     'User-Agent': 'tax-engine-public-cpu-diagnostic',
    },
   },
  );
 } catch {
  return { reason: 'original-job-request-unavailable' };
 }
 if (!response.ok) return { reason: 'original-job-http-status', httpStatus: response.status };

 let job;
 try {
  need(response.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
   size += chunk.length;
   need(size <= 2 * 1024 * 1024);
   chunks.push(chunk);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  need(Number.isSafeInteger(data.total_count) && data.total_count <= 100 && Array.isArray(data.jobs));
  const jobs = data.jobs.filter(job => job.name === 'Container Recovery, Browser Flows and SBOM');
  need(jobs.length === 1);
  [job] = jobs;
 } catch {
  return { reason: 'original-job-response-invalid' };
 }
 try {
  return { budget: remainingJobBudget(job, env, now(), controllerMs) };
 } catch {
  return { reason: 'original-job-identity-mismatch' };
 }
}
async function originalQualification(root,directory,manifest,audit,image){
 const base=path.join(root,'apps/web/test-results');
 const candidates=directory?[directory]:(await readdir(base)).filter(n=>/^rate-window-\d+-\d+$/u.test(n));need(candidates.length<=128);
 const found=[];
 for(const relative of candidates){
  need(/^rate-window-\d+-\d+$/u.test(relative));const dir=path.join(base,relative);
  try{
   const summary=await readJson(path.join(dir,'summary.json')),source=await readJson(path.join(dir,'source-build.json'));
   if(source.externalImageId!==image||summary.caseCount!==manifest.currentFullCaseCount||summary.status!=='FAIL'||summary.failed<1||summary.skipped!==5||summary.error||!summary.cleanup)continue;
   const full=rowsFromReport(await readJson(path.join(dir,'full-list.stdout')));selectCases(full,manifest,manifest.auditSha256);auditCollection(full,audit);
   const batches=planBatches(full,audit),actual=[];need(summary.batchesCompleted===batches.length);
   for(let i=0;i<batches.length;i++){
    const report=await readJson(path.join(dir,`batch-${i+1}.json`)),exit=await readJson(path.join(dir,`batch-${i+1}-exit.json`));need(!exit.signal&&!exit.captureFailed);
    actual.push(...reconcile(report,batches[i].rows,audit,exit.exit).rows);
   }
   exactUnion([actual],full);need(projectCaseResults(actual).filter(r=>r.status==='failed'||r.status==='timedOut').length===summary.failed);
   need(equal(await snapshot(root,[],Object.keys(source.source)),source.source));
   found.push({source,full,batches,actual,summary:{passed:full.length-summary.failed-summary.skipped,failed:summary.failed,skipped:summary.skipped}});
  }catch{/* Ignore incomplete/foreign directories without exposing rows or errors. */}
 }
 need(found.length===1);return found[0];
}

export async function main({env=process.env,root=fileURLToPath(new URL('../../',import.meta.url))}={}){
 if(env.TAX_BROWSER_CPU_BATCH_DIAGNOSTICS!=='1')return 0;
 const tracePair=env.TAX_BROWSER_TRACE_PAIR==='true',controllerMs=tracePair?TRACE_PAIR_MS:MAX_TOTAL_MS;
 // Reserve 30 seconds of the outer step for owned-child and temporary-file cleanup.
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),controllerMs-30000),interrupt=()=>abort.abort();
 process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
 let temporary,save,exit=1;
 try{
  const childEnv={...environment(env),PLAYWRIGHT_BASE_URL:ORIGIN};
  const exec=(file,args,options={})=>command(file,args,{cwd:root,env:childEnv,signal:abort.signal,...options});
  const head=await exec('git',['rev-parse','HEAD']);need(head.exit===0);
  const event=await readJson(env.GITHUB_EVENT_PATH,2*1024*1024);
  const number=admitBatch(env,event,head.stdout.trim());
  const phaseEnabled=phaseAdmission(env,event);
  const out=path.join(root,'artifacts',tracePair?'browser-ohio-trace-pair':`browser-cpu-full-batch-${number}`);await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{mode:0o700});
  save=async(name,record)=>{need(/^[a-z0-9-]+\.json$/u.test(name));const bytes=JSON.stringify(record,null,2)+'\n';need(Buffer.byteLength(bytes)<=LIMITS.bytes);await writeFile(path.join(out,name),bytes,{flag:'wx',mode:0o600});};
  const { budget, ...unavailableJob } = await readOriginalJobBudget(env, abort.signal, {controllerMs});
  if (!budget) {
   await save('unavailable.json', { qualification: 'NONQUALIFYING_DIAGNOSTIC', status: 'unavailable', ...unavailableJob, originalFailureSuperseded: false, paSampled: false });
   return 1;
  }
  await save('job-budget.json',budget);
  if(!budget.allowed){await save('result.json',{qualification:'NONQUALIFYING_DIAGNOSTIC',status:'HOLD',reason:'insufficient-original-job-budget',originalFailureSuperseded: false,paSampled: false});return 0;}
  await noEnvFiles(root);
  const manifest=await readJson(path.join(root,'scripts/browser-cpu-diagnostics/cases.json')),frozen=await readJson(path.join(root,'scripts/browser-cpu-diagnostics/full-batches.json'));
  const auditBytes=await readFile(path.join(root,'scripts/browser-request-budgets.json')),audit=JSON.parse(auditBytes);need(sha(auditBytes)===manifest.auditSha256);await verifyAudit(root,audit);
  for(const[file,hash]of Object.entries(frozen.sourceSha256))need(sha(await readFile(path.join(root,file)))===hash);
  const inspect=async()=>{const r=await exec('docker',['inspect','--format','{{.Id}} {{.Image}} {{.State.Running}} {{index .Config.Labels "org.opencontainers.image.revision"}}','tax-engine-browser-ci'],{timeout:10000});need(r.exit===0);return containerProof(r.stdout,env.CANDIDATE_IMAGE_ID,env.GITHUB_SHA);};
  const proof=await inspect(),original=await originalQualification(root,env.TAX_BROWSER_CPU_QUALIFICATION_DIRECTORY,manifest,audit,env.CANDIDATE_IMAGE_ID);
  need(equal(original.source.externalProof,proof)&&collectionHash(original.full)===frozen.fullCollectionSha256);
  const originalCases=tracePair?projectDiagnosticCases(original.actual,projectCaseResults):[];
  const selected=tracePair?selectTraceWindow(original.batches,originalCases,new Set(manifest.targets.map(row=>row.id))):undefined;
  if(tracePair&&selected===undefined){
   await save('result.json',{qualification:'NONQUALIFYING_DIAGNOSTIC',status:'HOLD',reason:'no-original-ohio-timeout',originalQualification:original.summary,originalFailureSuperseded: false});
   return 0;
  }
  const browserEnv=await preparePdfBrowserEnvironment(root,childEnv,abort.signal);
  if(!browserEnv){
   await save('unavailable.json',{qualification:'NONQUALIFYING_DIAGNOSTIC',status:'unavailable',reason:'pdf-test-prerequisite-unavailable',originalFailureSuperseded: false,paSampled: false});
   return 1;
  }
  const identity=async()=>{need(!abort.signal.aborted);await verifyAudit(root,audit);need(equal(await snapshot(root,[],Object.keys(original.source.source)),original.source.source)&&equal(await inspect(),proof));};
  temporary=await mkdtemp(path.join(tmpdir(),'tax-full-batch-cpu-'));
  const app=path.join(root,'apps/web'),cli=path.join(app,'node_modules/@playwright/test/cli.js');
  if(selected!==undefined){
   const batch=selectOriginalBatch(original.batches,frozen,selected);
   batch.list=path.join(temporary,'original-batch.txt');
   await writeFile(batch.list,testList(batch.rows),{flag:'wx',mode:0o600});
   const binding={sourceSha:proof[3],imageId:proof[1],originalBatch:selected,originalQualification:original.summary,
    configuredWorkers:2,retries:0,deadlineMs:30000};
   const ids=new Set(batch.rows.map(row=>row.id));
   await save('plan.json',{qualification:'NONQUALIFYING_DIAGNOSTIC',...binding,rows:batch.rows.map(canonical),bounds:batch.bounds,
    originalCases:originalCases.filter(row=>ids.has(row.id)),originalFailureSuperseded: false});
   const complete=await runTracePair({batch,audit,binding,save,io:{
    now:()=>({mono:performance.now(),wall:Date.now()}),sleep:ms=>pause(ms,null,{signal:abort.signal}),
    identity,alive:()=>!abort.signal.aborted,cleanup:async()=>true,
    run:trace=>executeBatch(batch,{
     collect:async list=>{
      const r=await exec(process.execPath,[cli,...browserArguments(list,trace),'--list','--reporter=json'],{cwd:app,env:browserEnv});
      need(r.exit===0);
      return rowsFromReport(JSON.parse(r.stdout));
     },
     execute:async args=>{
      const file=path.join(temporary,`${trace}.json`);
      const start=performance.now();
      const r=await exec(process.execPath,[cli,...args,'--output',path.join(temporary,`${trace}-artifacts`),'--reporter=json'],{
       cwd:app,env:{...browserEnv,PLAYWRIGHT_JSON_OUTPUT_FILE:file,PLAYWRIGHT_LAST_RUN_OUTPUT_FILE:path.join(temporary,`${trace}-last-run.json`)},
       timeout:batch.rows.length*30000+10000,
      });
      const executionMs=performance.now()-start;
      return {exit:r.exit,report:await readJson(file),executionMs};
     },
    },trace),
   }});
   return complete?0:1;
  }
  const profiles=path.join(temporary,'profiles');await mkdir(profiles);
  const inventoryProgram=await readFile(path.join(root,'scripts/browser-cpu-diagnostics/image-public-chunks.mjs'),'utf8');
  const inventoryResult=await exec('docker',['exec','tax-engine-browser-ci','node','--input-type=module','-e',inventoryProgram,'--','--image-public-chunks'],{timeout:15000,max:2*1024*1024});need(inventoryResult.exit===0);
  const inventory=JSON.parse(inventoryResult.stdout);validateInventory(inventory);await identity();
  const inventoryFile=path.join(temporary,'public-chunks.json');await writeFile(inventoryFile,JSON.stringify(inventory),{flag:'wx',mode:0o600});
  // Phase counters remain a separate opt-in; their source/image provenance closes with this runner.
  const phaseBinding={sourceSha:proof[3],imageId:proof[1],inventorySha256:sha(inventoryResult.stdout),chromiumRevision:'f842f52ef39fd97b449eb27cff414bf05a98ddce'};
  const phaseBindingFile=path.join(temporary,'phase-binding.json');
  if(phaseEnabled)await writeFile(phaseBindingFile,JSON.stringify(phaseBinding),{flag:'wx',mode:0o600});
  const profilerEnv={...browserEnv,TAX_BROWSER_CPU_DIAGNOSTICS:'1',TAX_BROWSER_CPU_OUTPUT:profiles,TAX_BROWSER_CPU_INVENTORY:inventoryFile,...(phaseEnabled?{TAX_BROWSER_PHASE_DIAGNOSTICS:'1',TAX_BROWSER_PHASE_BINDING:phaseBindingFile}:{})};
  const collect=async(enabled,list)=>{const args=list?browserArguments(list):['test','--workers=2','--retries=0','--timeout=30000','--project=chromium','--trace=retain-on-failure'];const r=await exec(process.execPath,[cli,...args,'--list','--reporter=json'],{cwd:app,env:enabled?profilerEnv:browserEnv});need(r.exit===0);return rowsFromReport(JSON.parse(r.stdout));};
  const plain=await collect(false),instrumented=await collect(true);selectCases(plain,manifest,sha(auditBytes));selectCases(instrumented,manifest,sha(auditBytes));auditCollection(plain,audit);
  need(collectionHash(plain)===collectionHash(instrumented)&&collectionHash(plain)===frozen.fullCollectionSha256);
  const batch=selectOriginalBatch(planBatches(plain,audit),frozen,number);batch.list=path.join(temporary,'original-batch.txt');await writeFile(batch.list,testList(batch.rows),{flag:'wx',mode:0o600});
  const sampled=manifest.targets.filter(r=>batch.rows.some(b=>b.id===r.id));need(sampled.length===(number===6?6:8));
  await save('plan.json',{qualification:'NONQUALIFYING_DIAGNOSTIC',originalQualification:original.summary,originalBatch:number,rows:batch.rows.map(canonical),bounds:batch.bounds,sampledIds:sampled.map(r=>r.id),unsampledNeighborCount:batch.rows.length-sampled.length,configuredWorkers:2,retries:0,deadlineMs:30000,trace:'retain-on-failure',controllerMs:MAX_TOTAL_MS,imageId:proof[1],revision:proof[3],publicChunks:publicChunkMetadata(inventory),inventorySha256:sha(inventoryResult.stdout),originalFailureSuperseded: false,paSampled: false});
  const outcomes=[];let observedWorkers=[];let observedParallel=[];
  const summary=await runSchedule({batches:[batch],expected:batch.rows,audit,io:{now:()=>({mono:performance.now(),wall:Date.now()}),sleep:ms=>pause(ms,null,{signal:abort.signal}),identity,alive:()=>!abort.signal.aborted,cleanup:async()=>true,
   record:async value=>{outcomes.push(...projectDiagnosticCases(value.result.rows,projectCaseResults));for(const row of value.result.rows){const r=row.results[0];need(Number.isSafeInteger(r.workerIndex)&&r.workerIndex>=0&&Number.isSafeInteger(r.parallelIndex)&&r.parallelIndex>=0&&r.parallelIndex<2);observedWorkers.push(r.workerIndex);observedParallel.push(r.parallelIndex);}await save('batch-result.json',{cases:outcomes,bounds:value.bounds,start:value.start,close:value.close});},
   run:async current=>executeBatch(current,{collect:list=>collect(true,list),execute:async args=>{const file=path.join(temporary,'result.json');const r=await exec(process.execPath,[cli,...args,'--output',path.join(temporary,'test-artifacts'),'--reporter=json'],{cwd:app,env:{...profilerEnv,PLAYWRIGHT_JSON_OUTPUT_FILE:file,PLAYWRIGHT_LAST_RUN_OUTPUT_FILE:path.join(temporary,'last-run.json')},timeout:current.rows.length*30000+10000});return{exit:r.exit,report:await readJson(file)};}})
  }});
  let missing=0;for(const row of sampled){let record;try{record=sanitizeStoredRecord(await readJson(path.join(profiles,`${row.id}.json`)),{origin:ORIGIN,inventory});}catch{record=unavailable('profile-not-recovered');}if(record.status!=='available')missing++;await save(`profile-${row.id}.json`,record);}
  await identity();const complete=summary.caseCount===batch.rows.length&&!summary.error&&summary.cleanup;
  if(phaseEnabled){
   for(const row of sampled.filter(r=>r.file==='oh-resident-credit-native.spec.ts')){
    let record,receipt;
    try{
     const file=path.join(profiles,`${row.id}.phase.json`);
     record=sanitizePhaseRecord(await readJson(file,4096),phaseBinding);
     const bytes=await readFile(file);need(bytes.length<=4096);
     // Only an exact validated projection is uploaded; receipt hashes those exact uploaded bytes.
     const canonical=JSON.stringify(record)+'\n';need(bytes.toString('utf8')===canonical);
     receipt=bindPhaseReceipt({recordSha256:sha(JSON.stringify(record,null,2)+'\n'),binding:phaseBinding,outerIdentityValidated:complete});
    }catch{record={version:1,qualification:'NONQUALIFYING_DIAGNOSTIC',phase:'ohio-resident-credit-type-originals',status:'unavailable',code:'phase-not-recovered'};receipt=bindPhaseReceipt({binding:phaseBinding,outerIdentityValidated:false});}
    await save(`phase-${row.id}.json`,record);await save(`phase-receipt-${row.id}.json`,receipt);
   }
  }
  await save('result.json',{qualification:'NONQUALIFYING_DIAGNOSTIC',originalQualification:original.summary,originalBatch:number,cases:outcomes,complete,failed:summary.failed,missingProfiles:missing,configuredWorkers:2,observedWorkerIndices:[...new Set(observedWorkers)].sort((a,b)=>a-b),observedParallelIndices:[...new Set(observedParallel)].sort((a,b)=>a-b),sampling:'wall-weights-not-process-cpu',originalFailureSuperseded: false,paSampled: false});
  exit=diagnosticExit(summary,batch.rows.length,missing);
 }catch{
  if(save)await save('unavailable.json',{qualification:'NONQUALIFYING_DIAGNOSTIC',status:'unavailable',reason:'diagnostic-contract-unavailable',originalFailureSuperseded: false,paSampled: false});
 }finally{
  if(temporary)await rm(temporary,{recursive:true,force:true});clearTimeout(timer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
 }
 return exit;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;},()=>{process.stderr.write('Full-batch CPU diagnostic unavailable; original qualification unchanged.\n');process.exitCode=1;});
