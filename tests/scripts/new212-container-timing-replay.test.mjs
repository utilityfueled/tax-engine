// Spec: spec/browser/new212-container-timing-replay.yaml
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
const moduleUrl=new URL('../../scripts/replay-new212-container-timing.mjs',import.meta.url);
const sha='a'.repeat(40);
const env=()=>({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:sha,GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',TAX_ENGINE_TEST_NEW212_TIMING:'1',PLAYWRIGHT_DISABLE_WEBSERVER:'true',PLAYWRIGHT_BASE_URL:'http://127.0.0.1:3109',CANDIDATE_IMAGE_ID:'sha256:'+'b'.repeat(64)});
const event=()=>({inputs:{source_sha:sha,enable_timing:'true'},repository:{private:false,fork:false,default_branch:'main'}});
const rows=()=>[1280,390].map(width=>({project:'chromium',file:'oh-business-part-year-native.spec.ts',titles:[`Actual NEW212 source lifecycle ${width}px`,'originates212-day business and header originals through real save review reopen and delete'],timeout:30000,expectedStatus:'passed',id:'case'+width,results:[]}));
test('explicit-source-admission',async()=>{
 const {admitReplay}=await import(moduleUrl);
 for(const flag of [undefined,'','0','true',' 1','1 '])assert.equal(admitReplay({...env(),TAX_ENGINE_TEST_NEW212_TIMING:flag},event(),sha),false);
 assert.equal(admitReplay(env(),event(),sha),true);
 for(const change of [{GITHUB_ACTIONS:'false'},{GITHUB_EVENT_NAME:'push'},{GITHUB_SHA:'b'.repeat(40)},{GITHUB_REF:'refs/heads/foreign'},{GITHUB_RUN_ATTEMPT:'2'},{PLAYWRIGHT_BASE_URL:'https://foreign.invalid'},{PLAYWRIGHT_DISABLE_WEBSERVER:'false'},{CANDIDATE_IMAGE_ID:'foreign'}])assert.throws(()=>admitReplay({...env(),...change},event(),sha));
 for(const change of [{inputs:{source_sha:sha,enable_timing:'false'}},{inputs:{source_sha:'b'.repeat(40),enable_timing:'true'}},{repository:{private:true,fork:false,default_branch:'main'}},{repository:{private:false,fork:true,default_branch:'main'}}])assert.throws(()=>admitReplay(env(),{...event(),...change},sha));
});
test('exact-two-original-cases',async()=>{
 const {assertReplayCases,replayArguments}=await import(moduleUrl);
 assertReplayCases(rows());
 for(const bad of [rows().slice(0,1),[...rows(),rows()[0]],[rows()[0],rows()[0]],rows().map(r=>({...r,timeout:90000})),rows().map(r=>({...r,expectedStatus:'skipped'})),rows().map(r=>({...r,project:'firefox'})),rows().map(r=>({...r,titles:['foreign',r.titles[1]]}))])assert.throws(()=>assertReplayCases(bad));
 assert.deepEqual(replayArguments(),['oh-business-part-year-native.spec.ts','--project=chromium','--workers=2','--retries=0','--timeout=30000','--trace=retain-on-failure']);
});
test('fixed-timing-projection',async()=>{
 const {projectTiming}=await import(moduleUrl);
 const line={v:1,phase:'pdf-child-call',boundary:'finish',elapsedMs:937.125,ok:true};
 assert.deepEqual(projectTiming([{...rows()[0],results:[{status:'timedOut',stdout:[{text:JSON.stringify(line)+'\n'}]}]}]),[{viewport:1280,attempt:0,status:'timedOut',records:[line]}]);
 for(const bad of [{...line,secret:'private'},{...line,phase:'foreign'},{...line,elapsedMs:Infinity},{...line,ok:'true'},{...line,boundary:'start'}])assert.throws(()=>projectTiming([{...rows()[0],results:[{status:'passed',stdout:[{text:JSON.stringify(bad)}]}]}]));
 assert.deepEqual(projectTiming([{...rows()[0],results:[{status:'timedOut',stdout:[{text:'unrelated stdout'}]}]}])[0].records,[]);
});
test('replay actually forwards exact admission through collection to original runner',async()=>{
 const {executeReplay,replayArguments}=await import(moduleUrl);const calls=[];
 const io={head:async()=>sha,probe:async python=>assert.equal(python,'/synthetic/.local/pdf-test-venv/bin/python'),collect:async(args,e)=>{assert.equal(e.TAX_ENGINE_PDF_TEST_PYTHON,'/synthetic/.local/pdf-test-venv/bin/python');calls.push(['collect',args,e.TAX_ENGINE_TEST_NEW212_TIMING]);return rows();},run:async(args,options)=>{assert.equal(options.parentEnv.OPENAI_API_KEY,undefined);assert.equal(options.parentEnv.NODE_OPTIONS,undefined);calls.push(['run',args,options.parentEnv.TAX_ENGINE_TEST_NEW212_TIMING]);return 1;}};
 const actual=await executeReplay({root:'/synthetic',env:{...env(),OPENAI_API_KEY:'synthetic-secret',NODE_OPTIONS:'--inspect'},event:event(),io});assert.equal(actual.browserExit,1);assert.equal(actual.selectedCaseCount,2);assert.equal(actual.candidateReleaseQualified,false);assert.equal(actual.originalFailuresSuperseded,false);assert.deepEqual(calls,[['collect',replayArguments(),'1'],['run',replayArguments(),'1']]);
 calls.length=0;await executeReplay({root:'/synthetic',env:{...env(),TAX_ENGINE_TEST_NEW212_TIMING:'0'},event:event(),io});assert.equal(calls.length,0);
 await assert.rejects(executeReplay({root:'/synthetic',env:env(),event:event(),io:{...io,collect:async()=>rows().slice(0,1)}}));
 await assert.rejects(executeReplay({root:'/synthetic',env:env(),event:event(),io:{...io,probe:async()=>{throw Error('synthetic wrong pypdf');}}}));
});
test('bounded-isolated-workflow',async()=>{
 const s=await readFile(new URL('../../.github/workflows/new212-container-timing-amd64.yml',import.meta.url),'utf8');
 for(const text of ['workflow_dispatch:','default: false','cancel-in-progress: false','github.run_id','timeout-minutes: 35','timeout-minutes: 8','contents: read','persist-credentials: false','--read-only --cap-drop ALL','--security-opt no-new-privileges','size=64m,mode=1777','127.0.0.1:3109:3000','docker build --label org.opencontainers.image.revision=','node scripts/replay-new212-container-timing.mjs','retention-days: 3'])assert.ok(s.includes(text),text);
 assert.ok(!/\bpush:|pull_request:|docker push|--privileged|--cap-add|seccomp=unconfined|secrets\./.test(s));
 assert.ok([...s.matchAll(/uses: \S+@(\S+)/g)].every(m=>/^[a-f0-9]{40}$/.test(m[1])));
});
