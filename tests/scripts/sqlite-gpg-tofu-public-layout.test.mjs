// Spec: spec/ops/sqlite-gpg-tofu-public-layout.yaml
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import test from 'node:test';
import {mkdtemp,writeFile,rm,symlink,readFile,mkdir,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const target=new URL('../../scripts/qualify-sqlite-gpg-tofu-amd64.mjs',import.meta.url);
const source='a'.repeat(40),H='b'.repeat(64),op='12345678-1234-1234-1234-123456789abc';
const env=()=>({GITHUB_SHA:source,GITHUB_REPOSITORY:'utilityfueled/tax-engine',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',GPG_TOFU_ENABLED:'true'});
const event=()=>({repository:{full_name:'utilityfueled/tax-engine',default_branch:'main',private:false,fork:false},inputs:{source_sha:source,enable_runtime:'true'}});
test('requires explicit canonical exact-source public admission',async()=>{
 const {admitRuntimeRequest}=await import(target);assert.equal(admitRuntimeRequest(env(),event()),true);
 for(const value of [undefined,'false','True',true,'1','']){const e=env();e.GPG_TOFU_ENABLED=value;assert.throws(()=>admitRuntimeRequest(e,event()));const ev=event();ev.inputs.enable_runtime=value;assert.throws(()=>admitRuntimeRequest(env(),ev));}
 for(const [k,v]of [['GITHUB_REF','refs/heads/other'],['GITHUB_SHA','c'.repeat(40)],['GITHUB_RUN_ATTEMPT','2'],['GITHUB_EVENT_NAME','push'],['GITHUB_REPOSITORY','other/tax-engine']])assert.throws(()=>admitRuntimeRequest({...env(),[k]:v},event()));
 for(const [k,v]of [['private',true],['fork',true],['full_name','other/tax-engine'],['default_branch','other']]){const ev=event();ev.repository[k]=v;assert.throws(()=>admitRuntimeRequest(env(),ev));}
});
test('refuses missing changed or aliased closure files',async()=>{
 const {verifySourceClosure}=await import(target),dir=await mkdtemp(join(tmpdir(),'gpg-closure-'));
 try{const b=Buffer.from('fixed public source'),pin={bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};await writeFile(join(dir,'fixed.mjs'),b);const authority={schema:1,files:{'fixed.mjs':pin}};
  assert.equal(await verifySourceClosure(dir,authority,{requiredPaths:['fixed.mjs']}),true);await assert.rejects(()=>verifySourceClosure(dir,authority));await writeFile(join(dir,'fixed.mjs'),'changed');await assert.rejects(()=>verifySourceClosure(dir,authority,{requiredPaths:['fixed.mjs']}));await rm(join(dir,'fixed.mjs'));await assert.rejects(()=>verifySourceClosure(dir,authority,{requiredPaths:['fixed.mjs']}));await symlink('/etc/hosts',join(dir,'fixed.mjs'));await assert.rejects(()=>verifySourceClosure(dir,authority,{requiredPaths:['fixed.mjs']}));await assert.rejects(()=>verifySourceClosure(dir,{schema:1,files:{'../escape':pin}}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
function result(){return {source,runId:'123',attempt:'1',operation:op,passed:false,deadlineExceeded:false,checks:[{step:'private-socket-path',exit:0}],cleanupErrors:[],failureStage:'PRIVATE SENTINEL',nativeBuildCommandAttempted:false,failure:true,genericAbiApproval:false,candidateReleaseQualified:false,riskAccepted:false,runtimeIntegrationExecuted:false};}
function summary(){return {consumerFixturePassed:true,originalQualificationPassed:true,pairSource:source,pairRunId:'456',providerSha256:H,packageSha256:H,receiptHashes:{result:H,status:H,packageChecks:H,exportBinding:H},fixtureCodeSha256:H,fixtureCommands:46,fingerprintSha256:H,phases:Object.fromEntries(['baseline','candidate'].map(k=>[k,{signatureCounts:[1,1,2,2],validSignatures:3,tamperRejected:true,actualProcessProviderBindings:4,sqliteHeaderVerified:true}])),rawKeyMaterialExported:false,rawMachineEvidencePrivate:true,genericAbiApproval:false,candidateReleaseQualified:false,riskAccepted:false,allRuntimeUsesDiscovered:false,runtimeCompatibilityQualified:false};}
function binding(){return {source,runId:456,artifactId:789,bytes:100,sha256:H,name:`source-candidate-amd64-sqlite-${source}-456-1`,workflow:'.github/workflows/postgres-source-candidates-amd64.yml',attempt:1,completed:true,publicRepository:true};}
test('projects only fixed facts and refuses unqualified success',async()=>{
 const {projectRuntimeResult}=await import(target),s=summary();s.rawPrivateKey='PRIVATE SENTINEL';const r=result();r.exception='PRIVATE SENTINEL';const projected=projectRuntimeResult(r,s,binding()),raw=JSON.stringify(projected);assert.ok(!raw.includes('PRIVATE SENTINEL')&&!raw.includes('private-socket-path'));assert.equal(projected.failureStage,'unclassified-stage');assert.equal(projected.consumerFixturePassed,false);assert.equal(projected.genericAbiApproval,false);assert.equal(projected.candidateReleaseQualified,false);
 const passing={...result(),passed:true,failure:false,failureStage:null};assert.equal(projectRuntimeResult(passing,summary(),binding()).consumerFixturePassed,true);
 for(const altered of [{...summary(),originalQualificationPassed:false},{...summary(),genericAbiApproval:true},{...summary(),fixtureCommands:49},{...summary(),providerSha256:'private'}])assert.throws(()=>projectRuntimeResult(passing,altered,binding()));
 for(const key of ['genericAbiApproval','candidateReleaseQualified','riskAccepted','runtimeIntegrationExecuted','failure'])assert.throws(()=>projectRuntimeResult({...passing,[key]:true},summary(),binding()));
 assert.throws(()=>projectRuntimeResult({...passing,cleanupErrors:['raw private error']},summary(),binding()));assert.throws(()=>projectRuntimeResult(passing,summary(),null));assert.throws(()=>projectRuntimeResult(passing,summary(),{...binding(),source:'c'.repeat(40)}));
});
test('public layout retains original runtime and workflow bounds',async()=>{
 const w=await readFile(new URL('../../.github/workflows/sqlite-gpg-tofu-amd64.yml',import.meta.url),'utf8'),cli=await readFile(target,'utf8'),prep=await readFile(new URL('../../infra/sqlite-gpg-tofu-runtime/prepare-pair.py',import.meta.url),'utf8');
 assert.match(w,/default: false/u);assert.match(w,/timeout-minutes: 15/u);assert.match(w,/cancel-in-progress: false/u);assert.match(w,/actions: read/u);assert.match(w,/contents: read/u);assert.match(w,/\/publish\//u);assert.ok(!w.includes('/private/')&&!w.includes('/evidence/'));assert.match(cli,/retrieveArtifact/u);assert.match(cli,/delete env.GITHUB_TOKEN/u);assert.match(cli,/finally.*githubToken=undefined/su);assert.match(prep,/originalQualificationPassed.*is True/u);assert.match(prep,/module.stage/u);assert.ok(!prep.includes('extractall'));
 const runtime=await readFile(new URL('../../scripts/sqlite-gpg-tofu-runtime.mjs',import.meta.url),'utf8');assert.match(runtime,/fixtureCommands: 48/u);assert.match(runtime,/controllerMinutes: 12/u);assert.match(runtime,/cleanupMinutes: 3/u);
});

test('captures token privately and rejects default before inherited daemon admission',async()=>{
 const {PublicSqliteGpgTofuRuntime}=await import(target),{SqliteGpgTofuRuntime}=await import(new URL('../../scripts/sqlite-gpg-tofu-runtime.mjs',import.meta.url)),dir=await mkdtemp(join(tmpdir(),'gpg-token-'));let calls=0;
 const inherited=Object.getOwnPropertyDescriptor(SqliteGpgTofuRuntime.prototype,'initialize');SqliteGpgTofuRuntime.prototype.initialize=async()=>{calls++;};
 try{const eventFile=join(dir,'event.json');await writeFile(eventFile,JSON.stringify(event()));const environment={...env(),GITHUB_TOKEN:'PRIVATE SENTINEL',GITHUB_EVENT_PATH:eventFile,GPG_TOFU_ENABLED:'false'};const controller=new PublicSqliteGpgTofuRuntime(join(dir,'unused'),environment);assert.equal(environment.GITHUB_TOKEN,undefined);assert.equal(controller.githubToken,'PRIVATE SENTINEL');await assert.rejects(()=>controller.initialize());assert.equal(calls,0);controller.githubToken=undefined;}finally{if(inherited)Object.defineProperty(SqliteGpgTofuRuntime.prototype,'initialize',inherited);else delete SqliteGpgTofuRuntime.prototype.initialize;await rm(dir,{recursive:true,force:true});}
});
test('publisher exports only two fixed files and preserves failure truth',async()=>{
 const {publishProjection}=await import(target),dir=await mkdtemp(join(tmpdir(),'gpg-projection-'));
 try{await mkdir(join(dir,'evidence'));await writeFile(join(dir,'evidence','gpg-tofu-summary.json'),JSON.stringify({...summary(),arbitrary:'PRIVATE SENTINEL'}));await writeFile(join(dir,'evidence','gpg-artifact-binding.json'),JSON.stringify(binding()));await writeFile(join(dir,'evidence','unrelated-secret'),'PRIVATE SENTINEL');const r={...result(),failureStage:'fixture-baseline-verify-a1'};const controller={output:dir,evidence:join(dir,'evidence'),identity:{source,runId:'123',attempt:'1'},operation:op,checks:r.checks,cleanupErrors:[],deadline:Infinity,stage:r.failureStage};const safe=await publishProjection(controller,r);assert.equal(safe.controllerPassed,false);assert.equal(safe.consumerFixturePassed,false);assert.equal(safe.failureStage,r.failureStage);assert.deepEqual((await readdir(join(dir,'publish'))).sort(),['hashes.json','result.json']);for(const n of ['hashes.json','result.json']){const body=await readFile(join(dir,'publish',n),'utf8');assert.ok(!body.includes('PRIVATE SENTINEL')&&!body.includes('private-socket-path'));}const hashes=JSON.parse(await readFile(join(dir,'publish','hashes.json'))),body=await readFile(join(dir,'publish','result.json'));assert.equal(hashes.result.sha256,createHash('sha256').update(body).digest('hex'));assert.equal(hashes.result.bytes,body.length);await assert.rejects(()=>publishProjection(controller,r));}finally{await rm(dir,{recursive:true,force:true});}
});

test('private public-archive receipts satisfy the unchanged opaque original gate',async()=>{
 const {admitQualifiedPair,qualifiedPairData}=await import(new URL('../../scripts/lib/sqlite-gpg-tofu-evidence.mjs',import.meta.url)),dir=await mkdtemp(join(tmpdir(),'gpg-archive-gate-'));
 try{const fixture=fileURLToPath(new URL('./sqlite-gpg-tofu-public-layout.test.py',import.meta.url));const program="import importlib.util,sys,json;from pathlib import Path;s=importlib.util.spec_from_file_location('fixture',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);r=Path(sys.argv[2]).resolve();z,h=m.archive(r);print(json.dumps(m.prep.prepare(m.INSPECTOR,str(z),h,m.fixtures.SOURCE,'123',str(r/'pair'))))";const p=spawnSync('python3',['-I','-B','-c',program,fixture,dir],{encoding:'utf8',timeout:10000,maxBuffer:65536,env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});assert.equal(p.status,0,p.stderr);assert.equal(p.stderr,'');const value=JSON.parse(p.stdout),token=await admitQualifiedPair(value.directory,value.expected),bound=qualifiedPairData(token);assert.equal(bound.providerSha256,value.expected.provider);assert.equal(bound.packageSha256,value.expected.package);assert.equal(bound.pairSource,value.expected.source);assert.throws(()=>qualifiedPairData({...token}));}finally{await rm(dir,{recursive:true,force:true});}
});
