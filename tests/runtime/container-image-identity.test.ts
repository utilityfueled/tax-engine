import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
const webWorkflow=parse(readFileSync('.github/workflows/web.yml','utf8')).jobs.container.steps;
const armWorkflow=parse(readFileSync('.github/workflows/arm64-recovery.yml','utf8')).jobs.recovery.steps;
// Spec: spec/federal/runtime-scanner-source-contract.yaml image-identity-chain.
const sha=(x:string)=>`sha256:${createHash('sha256').update(x).digest('hex')}`;
const rev='b'.repeat(40),layer='synthetic layer bytes';
type ArchiveFormat='index'|'manifest'|'legacy';
function fixture(mode='valid',architecture='amd64',format:ArchiveFormat=mode==='manifest'?'manifest':'index',configVariant?:string,descriptorVariant?:string) {
 const config=JSON.stringify({os:'linux',architecture:mode==='wrong-config-arch'?(architecture==='arm64'?'amd64':'arm64'):architecture,...(configVariant===undefined?{}:{variant:configVariant}),rootfs:{type:'layers',diff_ids:[sha(layer)]},config:{User:'1001',Cmd:['node','server.js'],Env:['NODE_ENV=production'],Labels:{'org.opencontainers.image.revision':rev}}});
 const desc=(body:string,mediaType:string)=>({mediaType,digest:sha(body),size:Buffer.byteLength(body)});
 const manifest=JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:desc(config,'application/vnd.oci.image.config.v1+json'),layers:[desc(layer,'application/vnd.oci.image.layer.v1.tar')]});
 const native={...desc(manifest,'application/vnd.oci.image.manifest.v1+json'),platform:{os:'linux',architecture:mode==='wrong-platform'?(architecture==='arm64'?'amd64':'arm64'):architecture,...(descriptorVariant!==undefined?{variant:descriptorVariant}:mode==='v8'?{variant:'v8'}:mode==='wrong-variant'?{variant:'v9'}:{})}};
 const entries=[native];
 if(mode==='ambiguous')entries.push(native);
 if(mode==='missing-platform')entries.push({...native,platform:{} as typeof native.platform});
 if(mode==='unknown-platform'||mode==='attestation')entries.push({...native,platform:{os:'unknown',architecture:'unknown'},...(mode==='attestation'?{annotations:{'vnd.docker.reference.type':'attestation-manifest','vnd.docker.reference.digest':native.digest}}:{})});
 const index=JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:entries});
 const target=format==='legacy'?config:format==='manifest'?manifest:index;
 const candidate=[{Id:sha(target),Descriptor:format==='legacy'?undefined:desc(target,format==='manifest'?'application/vnd.oci.image.manifest.v1+json':'application/vnd.oci.image.index.v1+json'),Os:'linux',Architecture:architecture,RootFS:{Type:'layers',Layers:[sha(layer)]},Config:JSON.parse(config).config}];
 const bodies:Record<string,string>={};for(const body of [index,manifest,config,layer])bodies[`blobs/sha256/${sha(body).slice(7)}`]=body;
 if(format==='legacy')Object.assign(bodies,{[sha(config).slice(7)+'.json']:config,'manifest.json':JSON.stringify([{Config:sha(config).slice(7)+'.json',Layers:['layer.tar']}]),'layer.tar':layer});
 if(mode==='missing-config')delete bodies[`blobs/sha256/${sha(config).slice(7)}`];
 if(mode==='corrupt-layer')bodies[`blobs/sha256/${sha(layer).slice(7)}`]='corrupt';
 if(mode==='wrong-config')candidate[0].Config.User='foreign';
 if(mode==='wrong-revision')candidate[0].Config.Labels['org.opencontainers.image.revision']='c'.repeat(40);
 if(mode==='duplicate-member')bodies['DUPLICATE']=Object.keys(bodies)[0];
 if(mode==='traversal')bodies['../foreign']='x';
 return {candidate,bodies,config,configDigest:sha(config),targetDigest:sha(target)};
}
function run(mode='valid',architecture='amd64',requiredArchitecture?:string,format?:ArchiveFormat,configVariant?:string,descriptorVariant?:string) {
 const dir=mkdtempSync(join(tmpdir(),'tax-image-chain-'));
 try {
  const f=fixture(mode,architecture,format,configVariant,descriptorVariant),archive=join(dir,'archive.tar'),candidate=join(dir,'candidate.json'),receipt=join(dir,'identity.json');
  writeFileSync(candidate,JSON.stringify(f.candidate));
  const tar=spawnSync('python3',['-c',`import io,json,sys,tarfile\na=json.load(sys.stdin)\nwith tarfile.open(sys.argv[1],'w') as t:\n for n,s in a.items():\n  if n=='DUPLICATE':\n   n=s;s=a[n]\n  b=s.encode();x=tarfile.TarInfo(n);x.size=len(b);t.addfile(x,io.BytesIO(b))\n`,archive],{input:JSON.stringify(f.bodies),encoding:'utf8'});
  if(tar.status!==0)throw new Error(tar.stderr);
  const result=spawnSync('python3',[resolve('scripts/lib/container-image-identity.py'),archive,candidate,rev,receipt,...(requiredArchitecture===undefined?[]:[requiredArchitecture])],{encoding:'utf8',timeout:5000});
  return {status:result.status,stderr:result.stderr,receipt:result.status===0?JSON.parse(readFileSync(receipt,'utf8')):null,...f};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
describe('Native image content identity chain',()=>{
 it('verifies an OCI index and its distinct native config without conflating their digests',()=>{
  const x=run();expect(x.status,x.stderr).toBe(0);expect(x.configDigest).not.toBe(x.targetDigest);expect(x.receipt).toMatchObject({version:1,targetDigest:x.targetDigest,configDigest:x.configDigest,platform:'linux/amd64',source:rev,chainVerified:true});
 });
 it('accepts only an explicitly related non-native attestation',()=>{const x=run('attestation');expect(x.status,x.stderr).toBe(0);});
 it('verifies a directly addressed native image manifest',()=>{const x=run('manifest');expect(x.status,x.stderr).toBe(0);expect(x.receipt.configDigest).toBe(x.configDigest);});
 it.each(['missing-platform','unknown-platform','ambiguous','wrong-platform','missing-config','corrupt-layer','wrong-config','wrong-revision','duplicate-member','traversal'])('rejects %s instead of accepting RootFS alone',mode=>{const x=run(mode);expect(x.status).not.toBe(0);expect(x.receipt).toBeNull();});
});

function scannerChain(mode='valid',architecture:'amd64'|'arm64'='amd64') {
 const variant=architecture==='arm64'?'v8':undefined;
 const f=run('valid',architecture,architecture,'index',variant,variant);if(f.status!==0)throw new Error(f.stderr);
 const dir=mkdtempSync(join(tmpdir(),'tax-chain-scanner-'));
 try {
  const config=JSON.parse(f.config),labels=config.config.Labels;
  const target={imageID:f.configDigest,userInput:f.targetDigest,os:'linux',architecture,labels,config:Buffer.from(f.config).toString('base64')};
  const identity={...f.receipt};
  const files:Record<string,unknown>={
   'container-candidate.json':f.candidate,
   'container.syft.json':{descriptor:{name:'syft',version:'1.57.1'},source:{type:'image',metadata:target}},
   'container.cdx.json':{bomFormat:'CycloneDX',metadata:{component:{type:'container',name:'sha256',version:f.targetDigest.slice(7)},properties:[{name:'syft:image:labels:org.opencontainers.image.revision',value:rev}],tools:{components:[{name:'syft',version:'1.57.1'}]}}},
   'container-image-identity.json':identity,
  };
  if(mode==='foreign-config')target.imageID=f.targetDigest;
  if(mode==='foreign-input')target.userInput=f.configDigest;
  if(mode==='corrupt-manifest')identity.manifestBytes=Buffer.from('{}').toString('base64');
  if(mode==='corrupt-target')identity.targetBytes=Buffer.from('{}').toString('base64');
  if(mode==='wrong-receipt-platform')identity.platform='linux/amd64';
  for(const [name,body] of Object.entries(files))if(!(mode==='missing-chain'&&name==='container-image-identity.json'))writeFileSync(join(dir,name),JSON.stringify(body));
  // This binds the exact JSON bytes, as the archive script does after checking them.
  identity.candidateSha256=createHash('sha256').update(readFileSync(join(dir,'container-candidate.json'))).digest('hex');
  if(mode!=='missing-chain')writeFileSync(join(dir,'container-image-identity.json'),JSON.stringify(identity));
  writeFileSync(join(dir,'container-archive-verification.json'),JSON.stringify({
   source:rev,imageId:f.targetDigest,platform:mode==='wrong-archive-platform'?'linux/amd64':`linux/${architecture}`,
   archiveSha256:identity.archiveSha256,imageIdentitySha256:mode==='substituted-chain'?'0'.repeat(64):createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
  }));
  const workflow=architecture==='arm64'?armWorkflow:webWorkflow;
  const action=workflow.find((x:{uses?:string})=>x.uses==='./.github/actions/container-runtime-scan');
  if(!action)throw new Error('Missing the shared container scanner action');
  const steps=parse(readFileSync(join(action.uses,'action.yml'),'utf8')).runs.steps;
  const step=steps.find((x:{name?:string})=>x.name==='Verify immutable SBOM source');
  if(!step)throw new Error('Missing workflow SBOM verification');
  const result=spawnSync('bash',['-e','-c',step.run],{
   cwd:dir,encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,CANDIDATE_IMAGE_ID:f.targetDigest,GITHUB_SHA:rev,
    GITHUB_WORKSPACE:resolve('.'),EXPECTED_ARCHITECTURE:action.with['expected-architecture'],REQUIRE_SCAN:'false',GITHUB_OUTPUT:join(dir,'output')},
  });
  return {status:result.status,stderr:result.stderr};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
describe('Workflow selected native config binding',()=>{
 it('executes the real SBOM gate with distinct index and config identities',()=>{const x=scannerChain();expect(x.status,x.stderr).toBe(0);});
 it.each(['foreign-config','foreign-input','corrupt-manifest','corrupt-target','missing-chain','substituted-chain'])('rejects %s at the real SBOM gate',mode=>{expect(scannerChain(mode).status).not.toBe(0);});
 it('binds a native v8 ARM64 OCI index without conflating its config digest',()=>{
  const x=scannerChain('valid','arm64');expect(x.status,x.stderr).toBe(0);
 });
 it.each(['wrong-receipt-platform','wrong-archive-platform'])('rejects %s for a native ARM64 OCI index',mode=>{
  expect(scannerChain(mode,'arm64').status).not.toBe(0);
 });
});

// Spec: spec/federal/runtime-scanner-source-contract.yaml archive-native-platform.
describe('Explicit native archive architecture',()=>{
 it.each(['valid','manifest','v8'])('verifies the explicitly required ARM64 %s identity',mode=>{
  const x=run(mode,'arm64','arm64');expect(x.status,x.stderr).toBe(0);expect(x.receipt.platform).toBe('linux/arm64');
 });
 it.each(['wrong-platform','wrong-config-arch','wrong-variant','ambiguous'])('rejects ARM64 %s',mode=>{expect(run(mode,'arm64','arm64').status).not.toBe(0);});
 it('does not infer ARM64 permission from candidate metadata',()=>{expect(run('valid','arm64').status).not.toBe(0);});
 it('rejects an unsupported requested architecture',()=>{expect(run('valid','amd64','riscv64').status).not.toBe(0);});
 it('keeps AMD64 variant rejection',()=>{expect(run('v8').status).not.toBe(0);});
});

// Spec: spec/federal/runtime-scanner-source-contract.yaml archive-config-variant.
describe('Resolved archive config variant',()=>{
 it.each(['legacy','manifest','index']as const)('rejects an explicit ARM64 v9 config in %s archives',format=>{
  const x=run('valid','arm64','arm64',format,'v9');expect(x.status).not.toBe(0);expect(x.receipt).toBeNull();
 });
 it('rejects a v9 config even when its ARM64 index descriptor declares v8',()=>{
  const x=run('valid','arm64','arm64','index','v9','v8');expect(x.status).not.toBe(0);expect(x.receipt).toBeNull();
 });
 it.each(['legacy','manifest','index']as const)('retains allowed ARM64 config variants in %s archives',format=>{
  for(const variant of[undefined,'','v8']){const x=run('valid','arm64','arm64',format,variant);expect(x.status,x.stderr).toBe(0);expect(x.receipt.platform).toBe('linux/arm64');}
 });
 it.each(['legacy','manifest','index']as const)('retains default AMD64 selection and rejects nonempty config variants in %s archives',format=>{
  for(const variant of[undefined,'']){const x=run('valid','amd64',undefined,format,variant);expect(x.status,x.stderr).toBe(0);expect(x.receipt.platform).toBe('linux/amd64');}
  for(const variant of['v8','v9'])expect(run('valid','amd64',undefined,format,variant).status).not.toBe(0);
 });
});
