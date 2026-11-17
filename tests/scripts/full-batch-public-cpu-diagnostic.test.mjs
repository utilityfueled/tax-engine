// Spec: spec/browser/full-batch-public-cpu-diagnostic.yaml
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
const moduleUrl=new URL('../../scripts/browser-cpu-diagnostics/full-batch.mjs',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('../../scripts/browser-cpu-diagnostics/full-batches.json',import.meta.url),'utf8'));
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
test('remaining-job-budget',async()=>{
 const {remainingJobBudget}=await import(moduleUrl);
 const exact=start+5400000-1200000;assert.equal(remainingJobBudget(job(),env(),exact).allowed,true);assert.equal(remainingJobBudget(job(),env(),exact+1).allowed,false);
 for(const change of [{run_id:54321},{run_attempt:2},{head_sha:'b'.repeat(40)},{name:'foreign'},{status:'completed'},{completed_at:new Date(start).toISOString()},{started_at:'foreign'},{started_at:new Date(start+60000).toISOString()}])assert.throws(()=>remainingJobBudget({...job(),...change},env(),start));
 for(const now of [NaN,Infinity,-1])assert.throws(()=>remainingJobBudget(job(),env(),now));
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
