import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
const workflowSteps=parse(readFileSync('.github/workflows/web.yml','utf8')).jobs.container.steps;
// Spec: spec/federal/runtime-scanner-source-contract.yaml image-identity-chain.
const sha=(x:string)=>`sha256:${createHash('sha256').update(x).digest('hex')}`;
const rev='b'.repeat(40),layer='synthetic layer bytes';
function fixture(mode='valid') {
 const config=JSON.stringify({os:'linux',architecture:'amd64',rootfs:{type:'layers',diff_ids:[sha(layer)]},config:{User:'1001',Cmd:['node','server.js'],Env:['NODE_ENV=production'],Labels:{'org.opencontainers.image.revision':rev}}});
 const desc=(body:string,mediaType:string)=>({mediaType,digest:sha(body),size:Buffer.byteLength(body)});
 const manifest=JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:desc(config,'application/vnd.oci.image.config.v1+json'),layers:[desc(layer,'application/vnd.oci.image.layer.v1.tar')]});
 const native={...desc(manifest,'application/vnd.oci.image.manifest.v1+json'),platform:{os:'linux',architecture:mode==='wrong-platform'?'arm64':'amd64'}};
 const entries=[native];
 if(mode==='ambiguous')entries.push(native);
 if(mode==='missing-platform')entries.push({...native,platform:{} as typeof native.platform});
 if(mode==='unknown-platform'||mode==='attestation')entries.push({...native,platform:{os:'unknown',architecture:'unknown'},...(mode==='attestation'?{annotations:{'vnd.docker.reference.type':'attestation-manifest','vnd.docker.reference.digest':native.digest}}:{})});
 const index=JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:entries});
 const target=mode==='manifest'?manifest:index;
 const candidate=[{Id:sha(target),Descriptor:desc(target,mode==='manifest'?'application/vnd.oci.image.manifest.v1+json':'application/vnd.oci.image.index.v1+json'),Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:[sha(layer)]},Config:JSON.parse(config).config}];
 const bodies:Record<string,string>={};for(const body of [index,manifest,config,layer])bodies[`blobs/sha256/${sha(body).slice(7)}`]=body;
 if(mode==='missing-config')delete bodies[`blobs/sha256/${sha(config).slice(7)}`];
 if(mode==='corrupt-layer')bodies[`blobs/sha256/${sha(layer).slice(7)}`]='corrupt';
 if(mode==='wrong-config')candidate[0].Config.User='foreign';
 if(mode==='wrong-revision')candidate[0].Config.Labels['org.opencontainers.image.revision']='c'.repeat(40);
 if(mode==='duplicate-member')bodies['DUPLICATE']=Object.keys(bodies)[0];
 if(mode==='traversal')bodies['../foreign']='x';
 return {candidate,bodies,config,configDigest:sha(config),targetDigest:sha(target)};
}
function run(mode='valid') {
 const dir=mkdtempSync(join(tmpdir(),'tax-image-chain-'));
 try {
  const f=fixture(mode),archive=join(dir,'archive.tar'),candidate=join(dir,'candidate.json'),receipt=join(dir,'identity.json');
  writeFileSync(candidate,JSON.stringify(f.candidate));
  const tar=spawnSync('python3',['-c',`import io,json,sys,tarfile\na=json.load(sys.stdin)\nwith tarfile.open(sys.argv[1],'w') as t:\n for n,s in a.items():\n  if n=='DUPLICATE':\n   n=s;s=a[n]\n  b=s.encode();x=tarfile.TarInfo(n);x.size=len(b);t.addfile(x,io.BytesIO(b))\n`,archive],{input:JSON.stringify(f.bodies),encoding:'utf8'});
  if(tar.status!==0)throw new Error(tar.stderr);
  const result=spawnSync('python3',[resolve('scripts/lib/container-image-identity.py'),archive,candidate,rev,receipt],{encoding:'utf8',timeout:5000});
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

function scannerChain(mode='valid') {
 const f=run();if(f.status!==0)throw new Error(f.stderr);
 const dir=mkdtempSync(join(tmpdir(),'tax-chain-scanner-'));
 try {
  const config=JSON.parse(f.config),labels=config.config.Labels;
  const target={imageID:f.configDigest,userInput:f.targetDigest,os:'linux',architecture:'amd64',labels,config:Buffer.from(f.config).toString('base64')};
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
  for(const [name,body] of Object.entries(files))if(!(mode==='missing-chain'&&name==='container-image-identity.json'))writeFileSync(join(dir,name),JSON.stringify(body));
  // This binds the exact JSON bytes, as the archive script does after checking them.
  identity.candidateSha256=createHash('sha256').update(readFileSync(join(dir,'container-candidate.json'))).digest('hex');
  if(mode!=='missing-chain')writeFileSync(join(dir,'container-image-identity.json'),JSON.stringify(identity));
  writeFileSync(join(dir,'container-archive-verification.json'),JSON.stringify({source:rev,imageId:f.targetDigest,archiveSha256:identity.archiveSha256,imageIdentitySha256:mode==='substituted-chain'?'0'.repeat(64):createHash('sha256').update(JSON.stringify(identity)).digest('hex')}));
  const step=workflowSteps.find((x:{name?:string})=>x.name==='Verify immutable SBOM source');
  const result=spawnSync('bash',['-e','-c',step.run],{cwd:dir,encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,CANDIDATE_IMAGE_ID:f.targetDigest,GITHUB_SHA:rev,REQUIRE_SCAN:'false',GITHUB_OUTPUT:join(dir,'output')}});
  return {status:result.status,stderr:result.stderr};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
describe('Workflow selected native config binding',()=>{
 it('executes the real SBOM gate with distinct index and config identities',()=>{const x=scannerChain();expect(x.status,x.stderr).toBe(0);});
 it.each(['foreign-config','foreign-input','corrupt-manifest','corrupt-target','missing-chain','substituted-chain'])('rejects %s at the real SBOM gate',mode=>{expect(scannerChain(mode).status).not.toBe(0);});
});
