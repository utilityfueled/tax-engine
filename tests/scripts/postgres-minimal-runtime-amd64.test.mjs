import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {MinimalRuntimeController, LIMITS, validateImageConfig, buildArguments} from '../../scripts/qualify-postgres-minimal-runtime-amd64.mjs';

test('separate bounded controller retains inherited custody and unchanged image config',()=>{
 const c=new MinimalRuntimeController('/unused',{});
 assert.equal(c.cleanupReserve,LIMITS.cleanupMinutes*60000);
 assert.equal(c.limit.controllerMinutes,55);
 const base={Entrypoint:['docker-entrypoint.sh'],Cmd:['postgres'],Env:['PG_MAJOR=16'],User:'',Volumes:{'/var/lib/postgresql/data':{}},Labels:{old:'value'}};
 const candidate=globalThis.structuredClone(base); candidate.Labels={...base.Labels,'io.vivalatax.qualification.operation':c.operation};
 assert.equal(validateImageConfig(base,candidate,c.operation),true);
 for(const mutate of [v=>v.Entrypoint=['sh'],v=>v.Cmd=['true'],v=>v.Env=[],v=>v.User='root',v=>v.Volumes={},v=>v.Labels.old='changed']) {const x=globalThis.structuredClone(candidate);mutate(x);assert.throws(()=>validateImageConfig(base,x,c.operation));}
 const args=buildArguments('/context','/id','base@sha256:'+'a'.repeat(64),c.operation);
 assert.ok(args.includes('--network=none')); assert.ok(args.includes('--pull=false')); assert.ok(!args.includes('--privileged'));
 assert.equal(args[args.indexOf('--tag')+1],`tax-source-${c.operation}:package`);
});

test('actual build path rejects low deadline before any Docker build',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'minimal-inert-'));
 try {
  const c=new MinimalRuntimeController(dir,{});c.private=join(dir,'private');c.evidence=join(dir,'evidence');await mkdir(c.private);await mkdir(c.evidence);
  c.deadline=performance.now()+c.cleanupReserve+1000;
  const calls=[];c.docker=async(...args)=>{calls.push(args);return '';};
  await assert.rejects(()=>c.build());assert.deepEqual(calls,[]);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('full actual build protocol requests offline build, exports, inventories and both scans without DB start',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'minimal-protocol-'));
 try {
  const c=new MinimalRuntimeController(dir,{});c.private=join(dir,'private');c.evidence=join(dir,'evidence');await mkdir(c.private);await mkdir(c.evidence);
  c.identity={source:'1'.repeat(40)};c.preexistingImages=new Set();const calls=[];
  c.prepare=async()=>({base:'postgres@sha256:'+'a'.repeat(64),context:'/context',policy:{}});
  const config={Entrypoint:['docker-entrypoint.sh'],Cmd:['postgres'],Env:[],User:'',Volumes:{'/var/lib/postgresql/data':{}},Labels:{}};
  const base={Id:c.BASE_CONFIG,Size:1000,Os:'linux',Architecture:'amd64',Config:config,RepoDigests:['postgres@sha256:f45d631d050c2fe068f384ed6c4faac506e9cd7f4da605ce703648e4b0985848']};
  const candidate={...base,Id:'sha256:'+'b'.repeat(64),RepoTags:[`tax-source-${c.operation}:package`],RepoDigests:[],Config:{...config,Labels:{'io.vivalatax.qualification.operation':c.operation}}};
  c.inspect=async(step)=>step==='minimal-base-image'?base:candidate;
  c.docker=async(step,args,seconds)=>{calls.push({step,args,seconds});if(args[0]==='build')await writeFile(join(c.private,'candidate.id'),candidate.Id);return '';};
  c.inventory=async(variant,image)=>{calls.push({inventory:variant,image});return {variant};};
  c.pair=async()=>{calls.push({pair:true});return {pairedInventoryPassed:true};};
  c.setupScanners=async()=>{calls.push({setupScanners:true});};
  c.scanVariant=async(variant,image)=>{calls.push({scan:variant,image});};
  await c.build();
  const built=calls.find(x=>x.args?.[0]==='build');assert.equal(built.seconds,600);assert.ok(built.args.includes('--network=none'));
  assert.deepEqual(calls.filter(x=>x.inventory).map(x=>x.inventory),['baseline','candidate']);
  assert.deepEqual(calls.filter(x=>x.scan).map(x=>x.scan),['baseline','candidate']);
  assert.ok(calls.find(x=>x.pair));assert.ok(!calls.some(x=>['start','exec','run'].includes(x.args?.[0])));
  const result=JSON.parse(await readFile(join(c.evidence,'minimal-stage.json'),'utf8'));
  assert.equal(result.databaseStarted,false);assert.equal(result.candidateReleaseQualified,false);assert.equal(result.runtimeIntegrationExecuted,false);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('actual inventory uses only never-started isolated export and propagates parser failure',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'minimal-export-'));
 try {
  const c=new MinimalRuntimeController(dir,{});c.private=join(dir,'private');c.evidence=join(dir,'evidence');await mkdir(c.private);await mkdir(c.evidence);c.identity={source:'1'.repeat(40)};
  const image='sha256:'+'b'.repeat(64),calls=[];
  const state={Image:image,Config:{Labels:{'io.vivalatax.qualification.operation':c.operation}},State:{Status:'created',Running:false,ExitCode:0,OOMKilled:false,Error:''},HostConfig:{NetworkMode:'none',ReadonlyRootfs:true,Privileged:false,CapAdd:null,CapDrop:['ALL'],SecurityOpt:['no-new-privileges']},Mounts:[{Type:'tmpfs',Destination:'/var/lib/postgresql/data'}]};
  c.docker=async(step,args)=>{calls.push(args);if(args[0]==='export')await writeFile(args[args.indexOf('--output')+1],'synthetic archive never interpreted');return args[0]==='inspect'?JSON.stringify([state]):'';};
  c.command=async()=>{throw Error('synthetic parser error');};
  await assert.rejects(()=>c.inventory('candidate',image),/synthetic parser error/);
  assert.deepEqual(calls.map(a=>a[0]),['create','inspect','export','inspect']);
  assert.ok(calls[0].includes('--read-only'));assert.ok(calls[0].includes('ALL'));assert.ok(calls[0].includes('no-new-privileges'));
 } finally {await rm(dir,{recursive:true,force:true});}
});

const execute=promisify(execFile);
async function syntheticSavedArchive(path,{architecture='amd64',corruptConfig=false}={}){
 const script=String.raw`import sys,tarfile,io,json,hashlib
p,arch,corrupt=sys.argv[1:]
inner=io.BytesIO()
with tarfile.open(fileobj=inner,mode='w') as t:
 b=b'actual synthetic layer bytes';m=tarfile.TarInfo('fixture.txt');m.size=len(b);t.addfile(m,io.BytesIO(b))
layer=inner.getvalue();layers=['sha256:'+hashlib.sha256(layer).hexdigest()]
raw=json.dumps({'os':'linux','architecture':arch,'rootfs':{'type':'layers','diff_ids':layers}},sort_keys=True).encode();image=hashlib.sha256(raw).hexdigest()
if corrupt=='true':raw=raw+b' '
with tarfile.open(p,'x') as t:
 for name,b in [('manifest.json',json.dumps([{'Config':image+'.json','Layers':['layer0/layer.tar']}]).encode()),(image+'.json',raw),('layer0/layer.tar',layer)]:
  m=tarfile.TarInfo(name);m.size=len(b);t.addfile(m,io.BytesIO(b))
print(json.dumps({'image':image,'layers':layers}))`;
 return JSON.parse((await execute('python3',['-I','-B','-c',script,path,architecture,String(corruptConfig)])).stdout);
}

async function scanControl(scenario){
 const dir=await mkdtemp(join(tmpdir(),'minimal-real-archive-'));
 try {
  const c=new MinimalRuntimeController(dir,{});c.private=join(dir,'private');c.evidence=join(dir,'evidence');await mkdir(c.private);await mkdir(c.evidence);await mkdir(join(c.evidence,'baseline'));c.identity={source:'1'.repeat(40)};
  const archive=join(c.private,'baseline-image.tar'),fixture=await syntheticSavedArchive(archive,{architecture:scenario==='wrong-architecture'?'arm64':'amd64',corruptConfig:scenario==='corrupt-config'});
  const expected=scenario==='wrong-image'?'f'.repeat(64):fixture.image;
  const listing={status:'active',schemaVersion:'v6.1.10',path:'vulnerability-db_v6.1.10_2026-11-18T00:00:00Z.tar.zst',checksum:'sha256:'+'a'.repeat(64),built:new Date().toISOString()};
  c.scanners={tools:'/fake-tools',syft:'/fake-syft-config',grype:'/fake-grype-config',env:{},listing};
  const digest='sha256:'+'c'.repeat(64),opaque='opaque-scanner-catalog-id',calls=[];let scannerCalls=0,identityCalls=0,inspectCalls=0;
  c.inspect=async()=>{inspectCalls++;return {Id:'sha256:'+expected,Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:scenario==='wrong-layers'||(scenario==='changed-native-layers'&&inspectCalls>1)?['sha256:'+'d'.repeat(64)]:fixture.layers}};};
  c.docker=async(step,args)=>{calls.push(args);assert.equal(args[0],'save');assert.equal(args.at(-1),'sha256:'+expected);return '';};
  c.command=async(step,exe,args)=>{
   if(step.startsWith('archive-identity-')){identityCalls++;const r=await execute(exe,args,{timeout:5000,maxBuffer:65536});if(scenario==='changed-during-identity')await writeFile(archive,'changed during identity verification');return r.stdout;}
   scannerCalls++;
   if(step.endsWith('-sbom')){const target=args.find(a=>a.startsWith('cyclonedx-json=')).slice('cyclonedx-json='.length);await writeFile(target,JSON.stringify({bomFormat:'CycloneDX',metadata:{component:{type:'container',name:archive,version:digest,'bom-ref':opaque},tools:{components:[{name:'syft',version:'1.57.1'}]}}}));return '';}
   if(scenario==='changed-archive')await writeFile(archive,'changed after archive identity verification');
   return JSON.stringify({descriptor:{name:'grype',version:'0.121.3',configuration:{ignore:scenario==='ignored-cve'?[{vulnerability:'CVE-ignored'}]:[],'match-upstream-kernel-headers':true,'include-matcher-suppressions':true}},source:{type:'image',target:{userInput:archive,manifestDigest:digest,imageID:opaque}},matches:[{vulnerability:{severity:'Critical'}}],ignoredMatches:[]});
  };
  let error;try{await c.scanVariant('baseline','sha256:'+expected);}catch(e){error=e;}
  const binding=await readFile(join(c.evidence,'baseline/scan-binding.json'),'utf8').then(JSON.parse).catch(()=>null);
  return {error,binding,scannerCalls,identityCalls,fixture,expected,calls};
 } finally {await rm(dir,{recursive:true,force:true});}
}

test('real valid synthetic archive binds actual config and layers while retaining critical findings',async()=>{
 const r=await scanControl('valid');assert.equal(r.error,undefined);assert.equal(r.identityCalls,1);assert.equal(r.scannerCalls,2);
 assert.deepEqual(r.binding.archiveIdentity,{image:r.fixture.image,layers:r.fixture.layers});
 assert.equal(r.binding.image,r.fixture.image);assert.deepEqual(r.binding.nativeImageBefore.layers,r.fixture.layers);assert.deepEqual(r.binding.nativeImageAfter.layers,r.fixture.layers);
 assert.equal(r.binding.archiveUnchangedBeforeAndAfterScan,true);assert.equal(r.binding.critical,1);assert.equal(r.binding.otherCveReadinessQualified,false);assert.equal(r.binding.candidateReleaseQualified,false);
});

test('wrong actual config image architecture or layers fail before any scanner invocation',async()=>{
 for(const scenario of ['wrong-image','corrupt-config','wrong-architecture','wrong-layers','changed-during-identity']){
  const r=await scanControl(scenario);assert.ok(r.error,scenario+' must fail');assert.equal(r.identityCalls,1);assert.equal(r.scannerCalls,0);assert.equal(r.binding,null);
 }
});

test('archive mutation and scan ignore rules cannot publish accepted binding',async()=>{
 for(const scenario of ['changed-archive','changed-native-layers','ignored-cve']){const r=await scanControl(scenario);assert.ok(r.error,scenario+' must fail');assert.equal(r.identityCalls,1);assert.equal(r.binding,null);}
});
