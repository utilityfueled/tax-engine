// Nonqualifying measurement only. The existing browser runner owns all case execution.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {environment,main,rowsFromReport} from './run-browser-tests.mjs';

const exec=promisify(execFile),ORIGIN='http://127.0.0.1:3109';
const FILE='oh-business-part-year-native.spec.ts';
const TITLE='originates212-day business and header originals through real save review reopen and delete';
const PHASES=['pdf-click','pdf-response-wait','pdf-download-wait','pdf-save','pdf-read-file','pdf-response-body','pdf-child-call','pdf-result-json','pdf-result-validation','pdf-report-write'];
const viewport=row=>{assert.equal(row.file,FILE);assert.equal(row.project,'chromium');assert.equal(row.titles.length,2);assert.equal(row.titles[1],TITLE);const width=[1280,390].find(w=>row.titles[0]===`Actual NEW212 source lifecycle ${w}px`);assert.ok(width);return width;};
export function replayArguments(){return [FILE,'--project=chromium','--workers=2','--retries=0','--timeout=30000','--trace=retain-on-failure'];}
export function admitReplay(env,event,head){
 if(env.TAX_ENGINE_TEST_NEW212_TIMING!=='1')return false;
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');
 assert.equal(event.repository.private,false);assert.equal(event.repository.fork,false);
 assert.equal(env.GITHUB_REF,`refs/heads/${event.repository.default_branch}`);
 assert.match(env.GITHUB_SHA,/^[a-f0-9]{40}$/);assert.equal(event.inputs.source_sha,env.GITHUB_SHA);assert.equal(head,env.GITHUB_SHA);
 assert.ok(event.inputs.enable_timing===true||event.inputs.enable_timing==='true');
 assert.equal(env.PLAYWRIGHT_DISABLE_WEBSERVER,'true');assert.equal(env.PLAYWRIGHT_BASE_URL,ORIGIN);assert.match(env.CANDIDATE_IMAGE_ID,/^sha256:[a-f0-9]{64}$/);
 return true;
}
export function assertReplayCases(rows){assert.equal(rows.length,2);assert.deepEqual(rows.map(viewport).sort((a,b)=>a-b),[390,1280]);for(const row of rows){assert.equal(row.timeout,30000);assert.equal(row.expectedStatus,'passed');}return true;}
export function projectTiming(rows){
 return rows.flatMap(row=>row.results.map((result,attempt)=>{
  assert.equal(attempt,0);assert.ok(['passed','failed','timedOut','skipped','interrupted'].includes(result.status));
  const records=[];
  for(const chunk of result.stdout??[])for(const line of (chunk.text??'').split('\n')){
   let value;try{value=JSON.parse(line);}catch{continue;}
   if(value?.v!==1||!Object.hasOwn(value,'phase'))continue;
   assert.ok(PHASES.includes(value.phase));assert.ok(['start','finish'].includes(value.boundary));
   assert.deepEqual(Object.keys(value).sort(),(value.boundary==='start'?['v','phase','boundary','elapsedMs']:['v','phase','boundary','elapsedMs','ok']).sort());
   assert.equal(typeof value.elapsedMs,'number');assert.ok(Number.isFinite(value.elapsedMs)&&value.elapsedMs>=0&&value.elapsedMs<=1e9);
   if(value.boundary==='start')assert.equal(value.elapsedMs,0);else assert.equal(typeof value.ok,'boolean');
   records.push(value);
  }
  return {viewport:viewport(row),attempt,status:result.status,records};
 }));
}
async function collect(root,args,env){const result=await exec(process.execPath,[join(root,'apps/web/node_modules/@playwright/test/cli.js'),'test',...args,'--list','--reporter=json'],{cwd:join(root,'apps/web'),env,timeout:60000,maxBuffer:4*1024*1024});return rowsFromReport(JSON.parse(result.stdout));}
export async function executeReplay({root,env,event,io={}}){
 const result={diagnosticOnly:true,candidateReleaseQualified:false,originalFailuresSuperseded:false,enabled:false};
 if(env.TAX_ENGINE_TEST_NEW212_TIMING!=='1')return result;
 const childEnv={...environment(env),PLAYWRIGHT_BASE_URL:ORIGIN,PLAYWRIGHT_DISABLE_WEBSERVER:'true',CANDIDATE_IMAGE_ID:env.CANDIDATE_IMAGE_ID};
 const head=await (io.head??(async()=> (await exec('git',['rev-parse','HEAD'],{cwd:root,env:childEnv,timeout:10000})).stdout.trim()))();
 assert.equal(admitReplay(env,event,head),true);
 const python=env.TAX_ENGINE_PDF_TEST_PYTHON||join(root,'.local/pdf-test-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 await (io.probe??(p=>exec(p,['-c',"import pypdf; assert pypdf.__version__ == '6.10.0'"],{cwd:root,env:childEnv,timeout:10000,maxBuffer:65536})))(python);
 childEnv.TAX_ENGINE_PDF_TEST_PYTHON=python;
 const args=replayArguments(),rows=await (io.collect??((a,e)=>collect(root,a,e)))(args,childEnv);assertReplayCases(rows);
 const browserExit=await (io.run??main)(args,{root,parentEnv:childEnv});assert.ok(browserExit===0||browserExit===1);
 return {...result,enabled:true,source:head,imageId:env.CANDIDATE_IMAGE_ID,browserExit,selectedCaseCount:2,workers:2,retries:0,caseDeadlineMs:30000};
}
async function names(dir){try{return await readdir(dir);}catch(error){if(error.code==='ENOENT')return [];throw error;}}
async function cli(){
 assert.equal(process.argv.length,2);const root=process.cwd(),env=process.env;
 const output=join(env.RUNNER_TEMP,'new212-container-timing');await mkdir(output,{mode:0o700});
 const save=(name,data)=>writeFile(join(output,name),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
 const resultsDir=join(root,'apps/web/test-results'),before=new Set(await names(resultsDir));
 let outcome;
 try{
  const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8'));
  outcome=await executeReplay({root,env,event});
  const fresh=(await names(resultsDir)).filter(n=>/^rate-window-\d+-\d+$/.test(n)&&!before.has(n));assert.equal(fresh.length,1);
  const window=join(resultsDir,fresh[0]),plan=JSON.parse(await readFile(join(window,'plan.json'),'utf8'));assert.equal(plan.selected.length,2);
  const reports=(await names(window)).filter(n=>/^batch-\d+\.json$/.test(n));const timing=[];
  for(const name of reports)timing.push(...projectTiming(rowsFromReport(JSON.parse(await readFile(join(window,name),'utf8')))));
  const fixedPhasesComplete=timing.length===2&&timing.every(c=>c.records.length===20&&PHASES.every((phase,i)=>c.records[i*2].phase===phase&&c.records[i*2].boundary==='start'&&c.records[i*2+1].phase===phase&&c.records[i*2+1].boundary==='finish'&&c.records[i*2+1].ok===true));
  await save('timing.json',{diagnosticOnly:true,source:outcome.source,imageId:outcome.imageId,fixedPhasesComplete,observedCaseResults:timing.length,cases:timing,limitations:['Elapsed intervals include wall time and callback argument construction; they are not child or server CPU accounting.','Missing finishes remain incomplete; original deadlines and failures are not superseded.']});
  await save('result.json',outcome);process.exitCode=outcome.browserExit;
 }catch{
  await save('unavailable.json',{diagnosticOnly:true,status:'unavailable',originalFailuresSuperseded:false,candidateReleaseQualified:false});
  if(outcome)await save('browser-outcome.json',outcome);process.exitCode=1;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await cli();
