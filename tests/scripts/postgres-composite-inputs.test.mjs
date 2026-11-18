import assert from 'node:assert/strict';
import test from 'node:test';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {URL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeHandoff,Controller} from '../../scripts/qualify-postgres-backports-amd64.mjs';
import {admitCompositionInputs} from '../../scripts/lib/postgres-composite-inputs.mjs';
import {CompositeRuntimeController} from '../../scripts/qualify-postgres-composite-runtime-amd64.mjs';
const H=b=>createHash('sha256').update(b).digest('hex'),identity={source:'1'.repeat(40),runId:'7',attempt:'1'};
const packageStatus={baselinePackageBuildExit:0,baselineOptimizedCheckExit:0,candidatePackageBuildExit:0,candidateOptimizedCheckExit:0,baselineSanitizerExit:0,candidateSanitizerExit:0,packageOrSanitizerFailure:0,abidiffExit:4,genericAbiApproval:false};
const gosuStatus={moduleDownloadExit:0,moduleVerifyExit:0,compileCheckExit:0,buildExit:0,metadataCheckExit:0,functionalCheckExit:0,candidateReleaseQualified:false,riskAccepted:false};
const metadata='gosu: go1.27.4\npath\tgithub.com/tianon/gosu\nmod\tgithub.com/tianon/gosu\t(devel)\ndep\tgithub.com/moby/sys/user\tv0.4.1\th1:RgjRlaDKi/Xmyrz4t8lyzXT6v2ooFeO/7xtchmhVWE0=\ndep\tgolang.org/x/sys\tv0.1.0\th1:kunALQeHf1/185U1i0GOB/fy1IPRDDpuoOOqRReG57U=\nbuild\tCGO_ENABLED=0\nbuild\tGOOS=linux\nbuild\tGOARCH=amd64\n';
async function pair(root,change=()=>{}){
 const pkg=join(root,'package'),runtime=join(root,'runtime');await mkdir(pkg);await mkdir(runtime);
 const elf=Buffer.alloc(120);elf.set([127,69,76,70,2,1]);elf.writeUInt16LE(62,18);elf.writeBigUInt64LE(64n,32);elf.writeUInt16LE(56,54);elf.writeUInt16LE(1,56);elf.writeUInt32LE(1,64);
 const manifest={package:await readFile(new URL('../../infra/postgres-libxml2-backport/sources.json',import.meta.url)),runtime:await readFile(new URL('../../infra/postgres-gosu-backport/sources.json',import.meta.url))};
 const packageId='a'.repeat(64),runtimeId='b'.repeat(64),deb=Buffer.from('synthetic .deb admitted only for JS lineage controls');
 const value={packageId,runtimeId,packageIdentity:{...identity,kind:'package'},runtimeIdentity:{...identity,kind:'runtime'},summary:{baseImage:packageId,image:runtimeId,sixConsumersUnchanged:true,privilegeChecks:true,postgresRecoveryChecks:true,noticesSha256:H('synthetic notices'),consumerHashesSha256:'c'.repeat(64)},packageStatus:globalThis.structuredClone(packageStatus),gosuStatus:globalThis.structuredClone(gosuStatus),baseImage:packageId};change(value);
 for(const [directory,kind,id] of [[pkg,'package',packageId],[runtime,'runtime',runtimeId]]){
  const ident=value[kind+'Identity'];const receipt={candidateImage:id,success:true,architecture:'amd64',cleanupErrors:[],deadlineExceeded:false,candidateReleaseQualified:false,riskAccepted:false,operation:'11111111-1111-1111-1111-111111111111',sourceManifestSha256:H(manifest[kind])};
  if(kind==='package')receipt.runtimePackageSha256=H(deb);else{receipt.baseImage=value.baseImage;receipt.requestedBase='sha256:'+value.baseImage;receipt.artifacts={binarySha256:H(elf),manifestSha256:H('synthetic artifact manifest')};}
  const files={'candidate.tar':Buffer.from('inert archive; original import must separately validate bytes'),'source-manifest.json':manifest[kind],'build-receipt.json':JSON.stringify(receipt),'result.json':JSON.stringify({...ident,image:id,passed:true,failure:false,cleanupErrors:[],deadlineExceeded:false,candidateReleaseQualified:false,riskAccepted:false})};
  if(kind==='package')Object.assign(files,{'candidate-package.deb':deb,'package-status.json':JSON.stringify(value.packageStatus)});
  else Object.assign(files,{'gosu':elf,'go-metadata.txt':metadata,'LICENSE':'synthetic','THIRD-PARTY-LICENSES.txt':'synthetic notices','gosu-status.json':JSON.stringify(value.gosuStatus),'runtime-summary.json':JSON.stringify(value.summary),'artifact-hashes.txt':'synthetic artifact manifest'});
  for(const [name,raw] of Object.entries(files))await writeFile(join(directory,name),raw);
  await writeHandoff(directory,{...ident,image:id},Object.keys(files));
 }
 return {pkg,runtime};
}

test('real original handoff validators reject foreign identities lineage status and content',async()=>{
 const edits=[null,v=>v.runtimeIdentity.source='2'.repeat(40),v=>v.runtimeIdentity.runId='8',v=>v.runtimeIdentity.attempt='2',v=>v.runtimeIdentity.kind='package',v=>v.baseImage='c'.repeat(64),v=>v.summary.baseImage='c'.repeat(64),v=>v.summary.sixConsumersUnchanged=false,v=>v.packageStatus.candidateSanitizerExit=1,v=>v.gosuStatus.moduleVerifyExit=1,v=>v.summary.noticesSha256='e'.repeat(64),v=>v.summary.consumerHashesSha256='unknown'];
 for(const edit of edits){const dir=await mkdtemp(join(tmpdir(),'composite-handoff-'));try{const f=await pair(dir,edit??(()=>{}));const act=()=>admitCompositionInputs(f.pkg,f.runtime,identity);if(edit)await assert.rejects(act);else{const a=await act();assert.equal(a.authority.packageImage,'a'.repeat(64));assert.equal(a.authority.runtimeImage,'b'.repeat(64));assert.equal(a.authority.attempt,'1');}}finally{await rm(dir,{recursive:true,force:true});}}
});

test('extra handoff leaves and a mutated already-hashed package are rejected',async()=>{
 for(const extra of [false,true]){const dir=await mkdtemp(join(tmpdir(),'composite-handoff-custody-'));try{const f=await pair(dir);await writeFile(join(f.pkg,extra?'unexpected.json':'candidate-package.deb'),'mutation');await assert.rejects(()=>admitCompositionInputs(f.pkg,f.runtime,identity));}finally{await rm(dir,{recursive:true,force:true});}}
});

async function absent(path,secret){for(const name of await readdir(path,{withFileTypes:true})){assert.ok(!name.name.includes(secret));const p=join(path,name.name);if(name.isDirectory())await absent(p,secret);else assert.ok(!(await readFile(p)).includes(Buffer.from(secret)));}}
test('runtime wrapper retains original runtime build and keeps failure cleanup logs private',async()=>{
 for(const fail of [false,true]){const dir=await mkdtemp(join(tmpdir(),'composite-runtime-privacy-'));try{
  const c=new CompositeRuntimeController(dir,'unused',{});assert.equal(c.runtimeBuild,Controller.prototype.runtimeBuild);const secret='private-adversarial-runtime-secret-727';c.identity={...identity,kind:'runtime',extra:secret};
  c.initialize=async()=>{await mkdir(c.private,{recursive:true});await mkdir(c.public);};c.runtimeBuild=async()=>{await writeFile(join(c.private,'inspect.stdout'),secret);c.candidate='b'.repeat(64);c.checks.push({step:secret,exit:0,args:[secret]});if(fail)throw Error(secret);};c.command=async()=>'';c.cleanup=async()=>{await writeFile(join(c.private,'cleanup.stdout'),secret);};
  const ok=await c.run();assert.equal(ok,!fail);await absent(c.public,secret);const r=JSON.parse(await readFile(join(c.public,'result.json'),'utf8'));assert.ok(!('checks'in r));assert.equal(r.commandCounts.total,1);assert.equal(r.candidateReleaseQualified,false);
 }finally{await rm(dir,{recursive:true,force:true});}}
});

test('runtime wrapper enters original DB private scope and fresh volume guard before auth',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'composite-runtime-volume-'));try{
  const c=new CompositeRuntimeController(dir,'unused',{});await mkdir(c.private);c.connection={args:[]};c.command=async()=>'';c.candidate='b'.repeat(64);const old=Controller.prototype.databaseChecks;
  try{Controller.prototype.databaseChecks=async function(base){assert.equal(this.private,this.databasePrivate);assert.ok(this.preexistingVolumes instanceof Set);assert.ok(this.dbImages.has('sha256:'+base));const name=`tax-amd-${this.operation}-data`;this.preexistingVolumes.add(name);await assert.rejects(()=>this.docker('volume',['volume','create','--label','io.vivalatax.qualification.operation='+this.operation,name]));};await c.databaseChecks('a'.repeat(64));}finally{Controller.prototype.databaseChecks=old;}
 }finally{await rm(dir,{recursive:true,force:true});}
});
