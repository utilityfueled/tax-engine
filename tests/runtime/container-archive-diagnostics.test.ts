import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// Spec: spec/federal/runtime-scanner-source-contract.yaml archive-info-diagnostics.
const imageId=`sha256:${'a'.repeat(64)}`,revision='b'.repeat(40);
type Mode='failure'|'oversized'|'invalid'|'valid'|'malformed'|'remote'|'wrongroot'|'wrongarch'|'containers'|'wrongid';
type Receipt={stage:string;archiveImportVerified:boolean;scratchRemoved:boolean;storeInfoDiagnostics?:{command:string;exitCode:number;stderr:string;truncated:boolean}};
function exercise(mode:Mode){
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'tax-archive-diagnostic-'))),bin=join(dir,'bin'),temp=join(dir,'temp');mkdirSync(bin);mkdirSync(temp);
 const candidate=[{Id:imageId,Os:'linux',Architecture:'amd64',Size:1024,RootFS:{Type:'layers',Layers:[`sha256:${'c'.repeat(64)}`]},Config:{User:'1001',Cmd:['node','server.js'],Entrypoint:null,Env:['NODE_ENV=production'],Labels:{'org.opencontainers.image.revision':revision}}}];
 writeFileSync(join(dir,'container-candidate.json'),JSON.stringify(candidate));
 const executable=(name:string,code:string)=>writeFileSync(join(bin,name),`#!${process.execPath}\n${code}`,{mode:0o700});
 executable('uname',"process.stdout.write('Linux x86_64\\n');");
 executable('docker',`const fs=require('node:fs'),a=process.argv.slice(2);if(a.includes('version'))process.stdout.write('linux/amd64\\n');else if(a.includes('save'))fs.writeFileSync(a[a.indexOf('--output')+1],'synthetic offline archive');else process.exit(91);`);
 executable('sudo',`const fs=require('node:fs'),cp=require('node:child_process'),a=process.argv.slice(2);if(a.shift()!=='-n'||a.shift()!=='--')process.exit(92);if(a[0]==='rm'){const target=a.at(-1);if(!target.startsWith(process.env.FAKE_ROOT+'/temp/tax-engine-archive.'))process.exit(93);fs.rmSync(target,{recursive:true,force:true});process.exit(0)}if(a.shift()!=='env')process.exit(94);const env={...process.env};while(a[0]?.includes('=')){const s=a.shift(),at=s.indexOf('=');env[s.slice(0,at)]=s.slice(at+1)}const r=cp.spawnSync(a.shift(),a,{env,stdio:'inherit'});process.exit(r.status??95);`);
 executable('podman',`const fs=require('node:fs'),a=process.argv.slice(2),get=x=>a.find(v=>v.startsWith(x+'='))?.slice(x.length+1)??a[a.indexOf(x)+1],root=get('--root'),run=get('--runroot');if(!a.includes('--remote=false')||get('--storage-driver')!=='vfs'||!root.startsWith(process.env.FAKE_ROOT+'/temp/tax-engine-archive.'))process.exit(96);if(a.includes('info')){fs.writeSync(2,process.env.FAKE_MODE==='oversized'?'Z'.repeat(100000):'owned-store diagnostic '+root+' /unrelated/private-user/socket '+'d'.repeat(64)+'\\n');if(['failure','oversized'].includes(process.env.FAKE_MODE))process.exit(125);if(process.env.FAKE_MODE==='malformed'){process.stdout.write('not-json');process.exit(0)}process.stdout.write(JSON.stringify({host:{os:'linux',arch:process.env.FAKE_MODE==='wrongarch'?'arm64':'amd64',serviceIsRemote:process.env.FAKE_MODE==='remote'},store:{graphRoot:process.env.FAKE_MODE==='wrongroot'?'/unowned/store':root,runRoot:run,graphDriverName:'vfs',imageStore:{number:process.env.FAKE_MODE==='invalid'?1:0},containerStore:{number:process.env.FAKE_MODE==='containers'?1:0}}}));}else if(a.includes('load'))fs.writeFileSync(process.env.FAKE_ROOT+'/called-load','yes');else if(a.includes('images'))process.stdout.write((process.env.FAKE_MODE==='wrongid'?'sha256:'+'e'.repeat(64):'${imageId}')+'\\n');else if(a.includes('inspect'))process.stdout.write(fs.readFileSync(process.env.FAKE_ROOT+'/container-candidate.json'));else process.exit(97);`);
 try{
  const result=spawnSync('bash',[resolve('scripts/verify-container-archive.sh')],{cwd:dir,encoding:'utf8',timeout:5000,killSignal:'SIGKILL',env:{PATH:bin+':'+process.env.PATH,RUNNER_TEMP:temp,GITHUB_SHA:revision,CANDIDATE_IMAGE_ID:imageId,FAKE_ROOT:dir,FAKE_MODE:mode}});
  if(result.error)throw result.error;
  const receipt=JSON.parse(readFileSync(join(dir,'container-archive-verification.json'),'utf8'))as Receipt;
  return{exit:result.status,receipt,loaded:existsSync(join(dir,'called-load')),dir};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
describe('Independent archive owned-store diagnostics',()=>{
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
 it('retains successful info warnings and all unchanged import verification gates',()=>{
  const x=exercise('valid');expect(x.exit).toBe(0);expect(x.loaded).toBe(true);expect(x.receipt).toMatchObject({stage:'verified',archiveImportVerified:true,scratchRemoved:true,storeInfoDiagnostics:{command:'podman-info',exitCode:0,truncated:false}});
 });
});
