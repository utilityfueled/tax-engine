import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// Spec: spec/federal/runtime-scanner-source-contract.yaml archive-info-diagnostics.
const revision='b'.repeat(40);
type Mode='index'|'failure'|'oversized'|'invalid'|'valid'|'malformed'|'remote'|'wrongroot'|'wrongarch'|'containers'|'wrongid'|'runroot-limit'|'foreign-root'|'symlink-root'|'changed-identity'|'duplicateids'|'mismatch-env'|'mismatch-layers'|'mismatch-entrypoint'|'mismatch-labels';
type Receipt={platform:string|null;stage:string;archiveImportVerified:boolean;scratchRemoved:boolean;storeInfoDiagnostics?:{command:string;exitCode:number;stderr:string;truncated:boolean};loadedImageDiagnostics?:{imageListMatches:boolean;signatureMatches:boolean|null;signatureFields:Record<string,boolean>|null;archiveHashMatches:boolean|null}};
function exercise(mode:Mode,architecture:'amd64'|'arm64'='amd64',mismatch?:'host'|'docker'|'candidate'|'config'|'loaded'){
 const other=architecture==='amd64'?'arm64':'amd64';
 const rawConfig=JSON.stringify({os:'linux',architecture:mismatch==='config'?other:architecture,rootfs:{type:'layers',diff_ids:[`sha256:${'c'.repeat(64)}`]},config:{User:'1001',Cmd:['node','server.js'],Entrypoint:null,Env:['NODE_ENV=production'],Labels:{'org.opencontainers.image.revision':revision}}});
const imageId=`sha256:${createHash('sha256').update(rawConfig).digest('hex')}`;

 const dir=realpathSync(mkdtempSync(join(tmpdir(),'tax-archive-diagnostic-'))),bin=join(dir,'bin'),temp=join(dir,'temp');mkdirSync(bin);mkdirSync(temp);const longTemp=join(temp,'long-runner-parent-'.repeat(8));mkdirSync(longTemp);const victim=join(dir,'unowned-victim');mkdirSync(victim);writeFileSync(join(victim,'sentinel'),'preserve');
 const candidate=[{Id:imageId,Os:'linux',Architecture:mismatch==='candidate'?other:architecture,Size:1024,RootFS:{Type:'layers',Layers:[`sha256:${'c'.repeat(64)}`]},Config:{User:'1001',Cmd:['node','server.js'],Entrypoint:null,Env:['NODE_ENV=production'],Labels:{'org.opencontainers.image.revision':revision}}}];
 writeFileSync(join(dir,'container-candidate.json'),JSON.stringify(candidate));
 const archiveBodies:Record<string,string>={[imageId.slice(7)+'.json']:rawConfig,'manifest.json':JSON.stringify([{Config:imageId.slice(7)+'.json',Layers:['layer.tar']}]),'layer.tar':'offline synthetic layer'};
 if(mode==='index'){
  const digest=(body:string)=>'sha256:'+createHash('sha256').update(body).digest('hex');
  const desc=(body:string,mediaType:string)=>({mediaType,digest:digest(body),size:Buffer.byteLength(body)});
  const layer='offline synthetic layer';
  const manifest=JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:desc(rawConfig,'application/vnd.oci.image.config.v1+json'),layers:[desc(layer,'application/vnd.oci.image.layer.v1.tar')]});
  const index=JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:[{...desc(manifest,'application/vnd.oci.image.manifest.v1+json'),platform:{os:'linux',architecture}}]});
  Object.assign(candidate[0],{Id:digest(index),Descriptor:desc(index,'application/vnd.oci.image.index.v1+json')});
  for(const body of [layer,rawConfig,manifest,index])archiveBodies['blobs/sha256/'+digest(body).slice(7)]=body;
  writeFileSync(join(dir,'container-candidate.json'),JSON.stringify(candidate));
 }
 const archive=spawnSync('python3',['-c',`import io,json,sys,tarfile
with tarfile.open(sys.argv[1],'w') as t:
 for name,body in json.load(sys.stdin).items():
  raw=body.encode();info=tarfile.TarInfo(name);info.size=len(raw);t.addfile(info,io.BytesIO(raw))
`,join(dir,'archive-fixture.tar')],{input:JSON.stringify(archiveBodies),encoding:'utf8'});
 if(archive.status!==0)throw new Error(archive.stderr);
 const executable=(name:string,code:string)=>writeFileSync(join(bin,name),`#!${process.execPath}\n${code}`,{mode:0o700});
 executable('mktemp',`const fs=require('node:fs'),cp=require('node:child_process'),a=process.argv.slice(2);if(process.env.FAKE_MODE==='foreign-root'){process.stdout.write(process.env.FAKE_ROOT+'/unowned-victim\\n');process.exit(0)}if(process.env.FAKE_MODE==='symlink-root'){const p=process.env.FAKE_ROOT+'/foreign-link';fs.symlinkSync(process.env.FAKE_ROOT+'/unowned-victim',p);process.stdout.write(p+'\\n');process.exit(0)}const r=cp.spawnSync('/usr/bin/mktemp',a,{encoding:'utf8'});if(r.status===0){fs.writeFileSync(process.env.FAKE_ROOT+'/created-root',fs.realpathSync(r.stdout.trim()));process.stdout.write(r.stdout)}else process.stderr.write(r.stderr);process.exit(r.status??98);`);
 executable('stat',`const fs=require('node:fs'),f=process.argv.at(-1),s=fs.lstatSync(f),changed=process.env.FAKE_MODE==='changed-identity'&&fs.existsSync(process.env.FAKE_ROOT+'/info-ran');process.stdout.write([s.dev,s.ino+(changed?1:0),s.uid,(s.mode&0o777).toString(8)].join(':')+'\\n');`);
 executable('uname',`process.stdout.write('${mismatch==='host'?'Linux riscv64':architecture==='arm64'?'Linux aarch64':'Linux x86_64'}\\n');`);
 executable('docker',`const fs=require('node:fs'),a=process.argv.slice(2);if(a.includes('version'))process.stdout.write('linux/${mismatch==='docker'?other:architecture}\\n');else if(a.includes('save')){fs.writeFileSync(process.env.FAKE_ROOT+'/called-export','yes');fs.copyFileSync(process.env.FAKE_ROOT+'/archive-fixture.tar',a[a.indexOf('--output')+1]);}else process.exit(91);`);
 executable('sudo',`const fs=require('node:fs'),cp=require('node:child_process'),a=process.argv.slice(2);if(a.shift()!=='-n'||a.shift()!=='--')process.exit(92);if(a[0]==='rm'){const target=a.at(-1);if(target!==fs.readFileSync(process.env.FAKE_ROOT+'/created-root','utf8'))process.exit(93);fs.rmSync(target,{recursive:true,force:true});process.exit(0)}if(a.shift()!=='env')process.exit(94);const env={...process.env};while(a[0]?.includes('=')){const s=a.shift(),at=s.indexOf('=');env[s.slice(0,at)]=s.slice(at+1)}const r=cp.spawnSync(a.shift(),a,{env,stdio:'inherit'});process.exit(r.status??95);`);
 executable('podman',`const fs=require('node:fs'),a=process.argv.slice(2),get=x=>a.find(v=>v.startsWith(x+'='))?.slice(x.length+1)??a[a.indexOf(x)+1],root=get('--root'),run=get('--runroot');if(!a.includes('--remote=false')||get('--storage-driver')!=='vfs'||root!==fs.readFileSync(process.env.FAKE_ROOT+'/created-root','utf8')+'/storage')process.exit(96);if(a.includes('info')){fs.writeFileSync(process.env.FAKE_ROOT+'/info-ran','yes');fs.writeFileSync(process.env.FAKE_ROOT+'/observed-runroot',run);if(process.env.FAKE_MODE==='runroot-limit'&&run.length>50){fs.writeSync(2,'Error: the specified runroot is longer than 50 characters\\n');process.exit(125)}fs.writeSync(2,process.env.FAKE_MODE==='oversized'?'Z'.repeat(100000):'owned-store diagnostic '+root+' /unrelated/private-user/socket '+'d'.repeat(64)+'\\n');if(['failure','oversized'].includes(process.env.FAKE_MODE))process.exit(125);if(process.env.FAKE_MODE==='malformed'){process.stdout.write('not-json');process.exit(0)}process.stdout.write(JSON.stringify({host:{os:'linux',arch:process.env.FAKE_MODE==='wrongarch'?'${other}':'${architecture}',serviceIsRemote:process.env.FAKE_MODE==='remote'},store:{graphRoot:process.env.FAKE_MODE==='wrongroot'?'/unowned/store':root,runRoot:run,graphDriverName:'vfs',imageStore:{number:process.env.FAKE_MODE==='invalid'?1:0},containerStore:{number:process.env.FAKE_MODE==='containers'?1:0}}}));}else if(a.includes('load'))fs.writeFileSync(process.env.FAKE_ROOT+'/called-load','yes');else if(a.includes('images'))process.stdout.write((process.env.FAKE_MODE==='wrongid'?'sha256:'+'e'.repeat(64):'${imageId}')+(process.env.FAKE_MODE==='duplicateids'?'\\nsha256:'+'f'.repeat(64):'')+'\\n');else if(a.includes('inspect')){const x=JSON.parse(fs.readFileSync(process.env.FAKE_ROOT+'/container-candidate.json'));const mode=process.env.FAKE_MODE;if('${mismatch??''}'==='loaded')x[0].Architecture='${other}';if(mode==='index')x[0].Id='${imageId}';if(mode==='mismatch-env')x[0].Config.Env.push('PRIVATE_TOKEN=DO-NOT-EXPOSE');if(mode==='mismatch-layers')x[0].RootFS.Layers=['sha256:'+'9'.repeat(64)];if(mode==='mismatch-entrypoint')x[0].Config.Entrypoint=['private/entrypoint'];if(mode==='mismatch-labels')x[0].Config.Labels.extra='PRIVATE-LABEL-VALUE';process.stdout.write(JSON.stringify(x));}else process.exit(97);`);
 try{
  const result=spawnSync('bash',[resolve('scripts/verify-container-archive.sh')],{cwd:dir,encoding:'utf8',timeout:5000,killSignal:'SIGKILL',env:{PATH:bin+':'+process.env.PATH,RUNNER_TEMP:mode==='runroot-limit'?longTemp:temp,TMPDIR:longTemp,GITHUB_SHA:revision,CANDIDATE_IMAGE_ID:candidate[0].Id,FAKE_ROOT:dir,FAKE_MODE:mode}});
  if(result.error)throw result.error;
  const receipt=JSON.parse(readFileSync(join(dir,'container-archive-verification.json'),'utf8'))as Receipt;
  return{exit:result.status,receipt,loaded:existsSync(join(dir,'called-load')),exported:existsSync(join(dir,'called-export')),dir,runroot:existsSync(join(dir,'observed-runroot'))?readFileSync(join(dir,'observed-runroot'),'utf8'):undefined,victimPreserved:existsSync(join(victim,'sentinel'))};
 }finally{const record=join(dir,'created-root');if(existsSync(record)){const owned=readFileSync(record,'utf8');if(/^\/(?:private\/)?tmp\/tax26archive\.[A-Za-z0-9]{8}$/.test(owned))rmSync(owned,{recursive:true,force:true});}rmSync(dir,{recursive:true,force:true});}
}
describe('Independent archive owned-store diagnostics',()=>{
 it('loads the uniquely bound config while retaining the original OCI index identity',()=>{
  const x=exercise('index');expect(x.exit).toBe(0);expect(x.loaded).toBe(true);expect(x.receipt).toMatchObject({archiveImportVerified:true,scratchRemoved:true,loadedImageDiagnostics:{imageListMatches:true,signatureMatches:true,archiveHashMatches:true}});
 });
 it('uses a short exclusively owned runroot despite long runner and temporary paths',()=>{
  const x=exercise('runroot-limit');expect(x.exit).toBe(0);expect(x.runroot?.length).toBeLessThanOrEqual(50);expect(x.runroot).toMatch(/^\/(?:private\/)?tmp\/tax26archive\.[A-Za-z0-9]{8}\/run$/);expect(x.loaded).toBe(true);expect(x.receipt).toMatchObject({stage:'verified',archiveImportVerified:true,scratchRemoved:true});
 });
 it.each(['foreign-root','symlink-root'] as const)('rejects %s without deleting or loading its contents',mode=>{
  const x=exercise(mode);expect(x.exit).not.toBe(0);expect(x.loaded).toBe(false);expect(x.victimPreserved).toBe(true);expect(x.exported).toBe(false);expect(x.receipt).toMatchObject({archiveImportVerified:false,scratchRemoved:false});
 });
 it('does not remove a root after its recorded filesystem identity changes',()=>{
  const x=exercise('changed-identity');expect(x.exit).not.toBe(0);expect(x.receipt).toMatchObject({archiveImportVerified:false,scratchRemoved:false});
 });
 it('retains bounded owned info failure diagnostics without loading the archive',()=>{
  const x=exercise('failure');expect(x.exit).toBe(125);expect(x.loaded).toBe(false);expect(x.receipt).toMatchObject({stage:'verify-empty-store',archiveImportVerified:false,scratchRemoved:true,storeInfoDiagnostics:{command:'podman-info',exitCode:125,truncated:false}});expect(x.receipt.storeInfoDiagnostics?.stderr).toContain('owned-store diagnostic <owned-scratch><path>');expect(JSON.stringify(x.receipt)).not.toContain(x.dir);expect(JSON.stringify(x.receipt)).not.toContain('/unrelated/private-user');expect(JSON.stringify(x.receipt)).not.toContain('d'.repeat(64));
 });
 it('drains oversized stderr while retaining only its fixed bounded prefix and original failure',()=>{
  const x=exercise('oversized');expect(x.exit).toBe(125);expect(x.loaded).toBe(false);expect(x.receipt.storeInfoDiagnostics).toMatchObject({exitCode:125,truncated:true,stderr:'Z'.repeat(8192)});
 });
 it('does not accept nonempty store metadata merely because info exited successfully',()=>{
  const x=exercise('invalid');expect(x.exit).not.toBe(0);expect(x.loaded).toBe(false);expect(x.receipt).toMatchObject({stage:'verify-empty-store',archiveImportVerified:false,scratchRemoved:true,storeInfoDiagnostics:{exitCode:0}});
 });
 it.each(['malformed','remote','wrongroot','wrongarch','containers'] as const)('keeps fresh-store %s rejection before any load',mode=>{
  const x=exercise(mode);expect(x.exit).not.toBe(0);expect(x.loaded).toBe(false);expect(x.receipt).toMatchObject({stage:'verify-empty-store',archiveImportVerified:false,scratchRemoved:true,storeInfoDiagnostics:{exitCode:0}});
 });
 it('retains actual loaded image ID rejection after otherwise valid store info',()=>{
  const x=exercise('wrongid');expect(x.exit).not.toBe(0);expect(x.loaded).toBe(true);expect(x.receipt).toMatchObject({stage:'verify-loaded-image',archiveImportVerified:false,scratchRemoved:true});
 });
 it.each(['wrongid','duplicateids'] as const)('records a failed %s loaded-ID predicate without signature claims',mode=>{
  const x=exercise(mode);expect(x.exit).not.toBe(0);expect(x.receipt).toMatchObject({archiveImportVerified:false,scratchRemoved:true,loadedImageDiagnostics:{imageListMatches:false,signatureMatches:null,signatureFields:null,archiveHashMatches:null}});
 });
 it.each([['mismatch-env','Env'],['mismatch-layers','RootFS'],['mismatch-entrypoint','Entrypoint'],['mismatch-labels','Labels']] as const)('retains exact signature mismatch predicates without exposing config values', (mode,field)=>{
  const x=exercise(mode);expect(x.exit).not.toBe(0);expect(x.loaded).toBe(true);expect(x.receipt).toMatchObject({archiveImportVerified:false,scratchRemoved:true,loadedImageDiagnostics:{imageListMatches:true,signatureMatches:false,signatureFields:{[field]:false},archiveHashMatches:null}});expect(Object.keys(x.receipt.loadedImageDiagnostics?.signatureFields??{}).sort()).toEqual(['Architecture','Cmd','Entrypoint','Env','Id','Labels','Os','RootFS','User']);expect(Object.entries(x.receipt.loadedImageDiagnostics?.signatureFields??{}).filter(([,v])=>v===false).map(([k])=>k)).toEqual([field]);for(const secret of ['DO-NOT-EXPOSE','PRIVATE_TOKEN','private/entrypoint','PRIVATE-LABEL-VALUE'])expect(JSON.stringify(x.receipt)).not.toContain(secret);
 });
 it('records only true fixed predicates for an exactly verified image',()=>{
  const x=exercise('valid');expect(x.exit).toBe(0);expect(x.receipt).toMatchObject({archiveImportVerified:true,loadedImageDiagnostics:{imageListMatches:true,signatureMatches:true,archiveHashMatches:true}});expect(Object.values(x.receipt.loadedImageDiagnostics?.signatureFields??{})).toEqual(Array(9).fill(true));
 });
 it('retains successful info warnings and all unchanged import verification gates',()=>{
  const x=exercise('valid');expect(x.exit).toBe(0);expect(x.loaded).toBe(true);expect(x.receipt).toMatchObject({stage:'verified',archiveImportVerified:true,scratchRemoved:true,storeInfoDiagnostics:{command:'podman-info',exitCode:0,truncated:false}});
 });
});

// Spec: spec/federal/runtime-scanner-source-contract.yaml archive-native-platform.
describe('Native archive platform admission',()=>{
 it('verifies a native ARM64 archive in a fresh independent store',()=>{
  const x=exercise('valid','arm64');expect(x.exit).toBe(0);expect(x.loaded).toBe(true);expect(x.receipt).toMatchObject({platform:'linux/arm64',archiveImportVerified:true,scratchRemoved:true});
 });
 it('verifies the distinct native ARM64 OCI index and config identities',()=>{
  const x=exercise('index','arm64');expect(x.exit).toBe(0);expect(x.receipt).toMatchObject({platform:'linux/arm64',archiveImportVerified:true,scratchRemoved:true});
 });
 it.each(['host','docker','candidate','config']as const)('rejects ARM64 %s disagreement before any store load',mismatch=>{
  const x=exercise('valid','arm64',mismatch);expect(x.exit).not.toBe(0);expect(x.loaded).toBe(false);expect(x.receipt).toMatchObject({archiveImportVerified:false,scratchRemoved:true});
 });
 it('rejects a foreign Podman host for an ARM64 candidate',()=>{
  const x=exercise('wrongarch','arm64');expect(x.exit).not.toBe(0);expect(x.loaded).toBe(false);expect(x.receipt).toMatchObject({platform:'linux/arm64',archiveImportVerified:false,scratchRemoved:true});
 });
 it('rejects an imported foreign architecture after ARM64 admission',()=>{
  const x=exercise('valid','arm64','loaded');expect(x.exit).not.toBe(0);expect(x.receipt).toMatchObject({platform:'linux/arm64',archiveImportVerified:false,scratchRemoved:true,loadedImageDiagnostics:{signatureFields:{Architecture:false}}});
 });
 it('keeps the original native AMD64 receipt contract',()=>{
  const x=exercise('valid');expect(x.exit).toBe(0);expect(x.receipt.platform).toBe('linux/amd64');
 });
});
