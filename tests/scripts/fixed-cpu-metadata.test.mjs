// Spec: spec/browser/fixed-cpu-metadata.yaml
import test from 'node:test';import assert from 'node:assert/strict';
import{readFile}from'node:fs/promises';import{URL}from'node:url';
import{summarizeProfile,sanitizeStoredRecord}from'../../scripts/browser-cpu-diagnostics/profile.mjs';
const options={origin:'http://127.0.0.1:3109',inventory:{'/_next/static/a.js':{sha256:'a'.repeat(64),bytes:1}}};
const profile=()=>({startTime:0,endTime:10000,nodes:[{id:1,callFrame:{functionName:'(idle)',url:''}}],samples:[1,1,1,1,1,1,1],timeDeltas:[1,-1,.5,Number.MAX_SAFE_INTEGER+1,Infinity,'private',0]});
test('fixed interval rejection counts preserve rejection and weights',()=>{const raw=profile(),old=summarizeProfile(raw,options),next=summarizeProfile(raw,{...options,fixedRejectionMetadata:true});assert.equal(next.status,'unavailable');assert.equal(next.reason,'sample-interval');assert.deepEqual(next.intervalRejections,{scope:'bounded-interval-array',intervalCount:7,counts:{valid:2,negative:1,fractional:1,unsafe:1,nonfinite:1,nonnumeric:1,unknown:0}});assert.equal(old.intervalRejections,undefined);assert.deepEqual(raw,profile());const good=profile();good.timeDeltas.fill(1);assert.deepEqual(summarizeProfile(good,options),summarizeProfile(good,{...options,fixedRejectionMetadata:true}));assert.equal(JSON.stringify(next).includes('private'),false);});
test('interval metadata avoids accessors and preserves historical upload projection',()=>{let calls=0;const raw=profile();Object.defineProperty(raw.timeDeltas,'6',{get(){calls++;return'private';},enumerable:true});const next=summarizeProfile(raw,{...options,fixedRejectionMetadata:true});assert.equal(calls,0);assert.equal(next.intervalRejections.counts.unknown,1);assert.deepEqual(sanitizeStoredRecord(next,options),next);const old=summarizeProfile(profile(),options);assert.deepEqual(sanitizeStoredRecord(old,options),old);for(const mutate of[r=>r.intervalRejections.counts.negative=-1,r=>r.intervalRejections.counts.private='secret',r=>r.intervalRejections.intervalCount++,r=>r.intervalRejections.scope='private',r=>r.reason='private']){const x=globalThis.structuredClone(next);mutate(x);assert.equal(sanitizeStoredRecord(x,options).code,'invalid-artifact');}});
test('sampled browser categories never expose raw errors',async()=>{const{projectDiagnosticCases}=await import('../../scripts/browser-cpu-diagnostics/fixed-metadata.mjs');const project=rows=>rows.map(r=>({id:r.id,status:r.results[0].status,durationMs:1,retry:0}));const row=(status,error)=>({id:'fixed',results:[{status,error}]});for(const[status,error,category]of[['timedOut',{message:'secret'},'timeout'],['failed',{message:'Error: expect(locator).toBeVisible()'},'assertion'],['failed',{message:'Error: page.evaluate: Target page, context or browser has been closed'},'browserclosed'],['failed',{name:'TimeoutError',message:'private'},'timeout'],['failed',{message:'private taxpayer name'},'other']]){const r=row(status,error);const out=projectDiagnosticCases([r],project);assert.equal(out[0].failureCategory,category);assert.equal(JSON.stringify(out).includes('private'),false);assert.deepEqual(out[0],{...project([r])[0],failureCategory:category,failureClue:{category:['assertion','timeout'].includes(category)?category:'unknown',location:null}});}assert.equal(projectDiagnosticCases([row('passed',{})],project)[0].failureCategory,null);});
test('unknown and mixed browser errors remain other without invoking getters',async()=>{const{projectDiagnosticCases}=await import('../../scripts/browser-cpu-diagnostics/fixed-metadata.mjs');const project=rows=>rows.map(()=>({status:'failed'}));let calls=0;const accessor={};Object.defineProperty(accessor,'message',{get(){calls++;return'secret';},enumerable:true});for(const result of[{status:'failed'},{status:'failed',error:accessor},{status:'failed',errors:[{message:'Error: expect(x)'},{name:'TimeoutError'}]},{status:'failed',errors:Array(17).fill({name:'TimeoutError'})},{status:'failed',error:{message:'x'.repeat(4097)}}])assert.equal(projectDiagnosticCases([{results:[result]}],project)[0].failureCategory,'other');assert.equal(calls,0);});
test('full batch records only sampled categories with original baseline and exits untouched',async()=>{const s=await readFile(new URL('../../scripts/browser-cpu-diagnostics/full-batch.mjs',import.meta.url),'utf8');assert.ok(s.includes('projectDiagnosticCases(value.result.rows,projectCaseResults)'));assert.ok(s.includes('const actual=projectCaseResults')||s.includes('projectCaseResults(actual)'));assert.ok(s.includes('originalFailureSuperseded: false'));for(const fixed of['MAX_TOTAL_MS = 600000','--workers=2','--retries=0','--timeout=30000','--trace=retain-on-failure'])assert.ok(s.includes(fixed));});

test('fixed metadata rejects accessor and private fields without reading them',()=>{const record=summarizeProfile(profile(),{...options,fixedRejectionMetadata:true});let calls=0;for(const target of['root','counts']){const altered=globalThis.structuredClone(record);const obj=target==='root'?altered:altered.intervalRejections.counts;const key=target==='root'?'intervalRejections':'negative';Object.defineProperty(obj,key,{get(){calls++;return'secret';},enumerable:true});assert.equal(sanitizeStoredRecord(altered,options).code,'invalid-artifact');}assert.equal(calls,0);});
test('profile acceptance and wall weights remain unchanged across finite boundary controls',()=>{for(const value of[-1,-.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'secret',null,undefined]){const raw=profile();raw.timeDeltas.fill(1);raw.timeDeltas[0]=value;const old=summarizeProfile(raw,options),next=summarizeProfile(raw,{...options,fixedRejectionMetadata:true});assert.equal(old.status,next.status);assert.equal(old.code,next.code);assert.equal(old.reason,next.reason);assert.equal(next.status,'unavailable');}for(const value of[0,1,100]){const raw=profile();raw.timeDeltas.fill(value);assert.deepEqual(summarizeProfile(raw,options),summarizeProfile(raw,{...options,fixedRejectionMetadata:true}));}});
test('real profiler path emits fixed metadata while preserving body failure and CDP cleanup',async()=>{const{withProfile}=await import('../../scripts/browser-cpu-diagnostics/profile.mjs');const calls=[];let saved;const session={send:async name=>{calls.push(name);return name==='Profiler.stop'?{profile:profile()}:{};},detach:async()=>calls.push('detach')};const body=new Error('private body');await assert.rejects(withProfile({enabled:true,...options,createSession:async()=>session,use:async()=>{throw body;},save:async r=>{saved=r;}}),e=>e===body);assert.equal(saved.status,'unavailable');assert.equal(saved.intervalRejections.counts.negative,1);assert.equal(JSON.stringify(saved).includes('private'),false);assert.deepEqual(calls,['Profiler.enable','Profiler.setSamplingInterval','Profiler.start','Profiler.stop','Profiler.disable','detach']);});


// Bounded failure clues are diagnostic metadata, not a replacement qualification.
const sourceFile='apps/web/tests/helpers/known-native-control.ts';
const sourceLocation={file:sourceFile,line:5,column:2};
const fixedProject=rows=>rows.map(r=>({id:r.id,status:r.results[0].status,durationMs:1,retry:0}));
const failedRow=error=>({id:'fixed',results:[{status:'failed',error}]});
test('non-timeout failures retain a verified first source location without actual values',async()=>{
 const{projectDiagnosticCases}=await import('../../scripts/browser-cpu-diagnostics/fixed-metadata.mjs');
 const row=failedRow({message:'Error: expect(received).toBe(expected)\nExpected: PRIVATE-900-11-2222\nReceived: private value',stack:`Error: private\n    at framework (/private/secret/helper.ts:1:1)\n    at ${sourceFile}:5:2\n    at tests/scripts/fixed-cpu-metadata.test.mjs:1:1`});
 const before=globalThis.structuredClone(row),out=projectDiagnosticCases([row],fixedProject);
 assert.deepEqual(out[0].failureClue,{category:'assertion',location:sourceLocation});
 assert.deepEqual(row,before);assert.doesNotMatch(JSON.stringify(out),/PRIVATE|private|Expected|Received|stack|secret|900-11/);
});
test('failed case clues classify only proven assertion timeout and HTTP evidence',async()=>{
 const{projectDiagnosticCases}=await import('../../scripts/browser-cpu-diagnostics/fixed-metadata.mjs');
 for(const[error,category]of[
  [{name:'TimeoutError',message:'private'},'timeout'],
  [{message:'Error: Test timeout of 30000ms exceeded.'},'timeout'],
  [{message:'apiRequestContext.post: 503 Service Unavailable\nCall log: private URL'},'http'],
  [{message:'Error: expect(response.status()).toBe(200)\nReceived: 500'},'assertion'],
  [{message:'private HTTP 500 status'},'unknown'],
  [{message:'apiRequestContext.post: 503 private secret'},'unknown'],
  [{message:'Expected private actual value'},'unknown'],
 ])assert.deepEqual(projectDiagnosticCases([failedRow(error)],fixedProject)[0].failureClue,{category,location:null});
 const row=failedRow({message:'private'});row.results[0].status='timedOut';assert.equal(projectDiagnosticCases([row],fixedProject)[0].failureClue.category,'timeout');
 for(const status of['passed','skipped']){row.results[0].status=status;assert.equal(Object.hasOwn(projectDiagnosticCases([row],fixedProject)[0],'failureClue'),false);}
});
test('failure locations reject malformed foreign absolute traversal URL and secret paths',async()=>{
 const{projectDiagnosticCases}=await import('../../scripts/browser-cpu-diagnostics/fixed-metadata.mjs');
 const bad=['/private/secret/test.ts','/apps/web/tests/helpers/known-native-control.ts','C:\\secret\\test.ts','../'+sourceFile,'apps/web/tests/../tests/helpers/known-native-control.ts','file://'+sourceFile,sourceFile+'?secret=taxpayer',sourceFile+'#private','apps/web/tests/PRIVATE-900-11-2222.ts',sourceFile+'\nprivate',sourceFile.replaceAll('/','\\')];
 for(const file of bad){const row=failedRow({message:'private',location:{file,line:5,column:2}});assert.deepEqual(projectDiagnosticCases([row],fixedProject)[0].failureClue,{category:'unknown',location:null});}
 for(const location of[{file:sourceFile,line:0,column:2},{file:sourceFile,line:5,column:0},{file:sourceFile,line:1.5,column:2},{file:sourceFile,line:999999,column:2},{file:sourceFile,line:5,column:999999},{file:sourceFile,line:'5',column:2}])assert.equal(projectDiagnosticCases([failedRow({location})],fixedProject)[0].failureClue.location,null);
});
test('reporter absolute locations become verified repository relative locations only',async()=>{
 const{projectDiagnosticCases}=await import('../../scripts/browser-cpu-diagnostics/fixed-metadata.mjs');
 const row=failedRow({message:'private'});row.results[0].errorLocation={...sourceLocation,file:new URL('../../'+sourceFile,import.meta.url).pathname};
 assert.deepEqual(projectDiagnosticCases([row],fixedProject)[0].failureClue.location,sourceLocation);
 assert.doesNotMatch(JSON.stringify(projectDiagnosticCases([row],fixedProject)),/Users|Programming|private/);
});
test('failure clues never invoke getters and bound hostile error records',async()=>{
 const{projectDiagnosticCases}=await import('../../scripts/browser-cpu-diagnostics/fixed-metadata.mjs');let reads=0;
 for(const key of['message','name','location','stack']){const error={};Object.defineProperty(error,key,{get(){reads++;throw Error('private');}});assert.deepEqual(projectDiagnosticCases([failedRow(error)],fixedProject)[0].failureClue,{category:'unknown',location:null});}
 const location={...sourceLocation};Object.defineProperty(location,'file',{get(){reads++;return sourceFile;}});assert.equal(projectDiagnosticCases([failedRow({location})],fixedProject)[0].failureClue.location,null);
 for(const error of[{message:'x'.repeat(4097)},{stack:'x'.repeat(16385)},{location:{...sourceLocation,line:NaN}}])assert.deepEqual(projectDiagnosticCases([failedRow(error)],fixedProject)[0].failureClue,{category:'unknown',location:null});
 const row=failedRow(undefined);row.results[0].errors=Array(17).fill({location:sourceLocation});assert.equal(projectDiagnosticCases([row],fixedProject)[0].failureClue.location,null);assert.equal(reads,0);
});
test('failure clues use first verified helper frame and do not invent missing source locations',async()=>{
 const{projectDiagnosticCases}=await import('../../scripts/browser-cpu-diagnostics/fixed-metadata.mjs');
 const row=failedRow({message:'Error: expect(x)',location:{file:'apps/web/src/lib/private.ts',line:1,column:1},stack:`Error: private\n    at apps/web/tests/not-a-real-file.spec.ts:1:1\n    at helper (${sourceFile}:5:2)\n    at tests/scripts/fixed-cpu-metadata.test.mjs:1:1`});
 assert.deepEqual(projectDiagnosticCases([row],fixedProject)[0].failureClue,{category:'assertion',location:sourceLocation});
 row.results[0].error={message:'private',stack:'at private customer value'};assert.deepEqual(projectDiagnosticCases([row],fixedProject)[0].failureClue,{category:'unknown',location:null});
});
test('primary assertion clues survive Playwright formatted secondary error records',async()=>{
 const{projectDiagnosticCases}=await import('../../scripts/browser-cpu-diagnostics/fixed-metadata.mjs');
 const row=failedRow({message:'Error: expect(received).toEqual(expected)',stack:`Error: private\n    at ${sourceFile}:5:2`});
 row.results[0].errors=[{message:'  1) PRIVATE TEST NAME\nExpected secret\nReceived private amount',snippet:'private source'}];
 const out=projectDiagnosticCases([row],fixedProject)[0];
 assert.equal(out.failureCategory,'other'); // Historical projection remains intact.
 assert.deepEqual(out.failureClue,{category:'assertion',location:sourceLocation});
 assert.doesNotMatch(JSON.stringify(out),/PRIVATE|private|amount|snippet|Expected|Received/);
});
test('all diagnostic writers retain bounded clues before deleting raw reports',async()=>{
 for(const file of['runner.mjs','full-batch.mjs','trace-pair.mjs']){
  const source=await readFile(new URL('../../scripts/browser-cpu-diagnostics/'+file,import.meta.url),'utf8');
  assert.match(source,/projectDiagnosticCases\((?:value\.result\.rows|result\.rows),\s*projectCaseResults\)/u,file);
 }
});
