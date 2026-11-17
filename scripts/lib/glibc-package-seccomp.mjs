// Exact two-argument prerequisite policy, only for the owned glibc source-build container.
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
const DEFAULT_SHA='9c1025c88ccaa517b648da571961838744ea2137f176bfe6a48b21294cae9c76';
export function buildGlibcProfile(raw){
 assert.equal(createHash('sha256').update(raw).digest('hex'),DEFAULT_SHA);
 const profile=JSON.parse(raw);
 profile.syscalls.push({names:['personality'],action:'SCMP_ACT_ALLOW',args:[{index:0,value:4294967274,op:'SCMP_CMP_EQ'}]},{names:['clock_settime'],action:'SCMP_ACT_ALLOW',args:[{index:0,value:1,op:'SCMP_CMP_EQ'}]});
 return profile;
}
export function validateGlibcEngine(d){assert.equal(d.ServerVersion,'28.0.4');assert.equal(d.OSType,'linux');assert.ok(['amd64','x86_64'].includes(d.Architecture));assert.ok(Array.isArray(d.SecurityOptions)&&d.SecurityOptions.includes('name=seccomp,profile=builtin'));return true;}
export function glibcEnvironment(inherited){
 assert.ok(Array.isArray(inherited));const entries=new Map();
 for(const v of inherited){assert.equal(typeof v,'string');const at=v.indexOf('=');assert.ok(at>0);const key=v.slice(0,at);assert.ok(!entries.has(key));assert.ok(!['LD_PRELOAD','LD_LIBRARY_PATH','GLIBC_TUNABLES'].includes(key));entries.set(key,v.slice(at+1));}
 for(const[key,value]of[['EXPECTED_ARCH','amd64'],['LC_ALL','C'],['LANG','C']])entries.set(key,value);
 return [...entries].map(([k,v])=>k+'='+v);
}
export function validateGlibcSandbox(v,inputs,profile,expectedEnv=['EXPECTED_ARCH=amd64','LC_ALL=C','LANG=C']){
 const h=v.HostConfig;assert.equal(h.NetworkMode,'none');assert.equal(h.Privileged,false);assert.equal(h.ReadonlyRootfs,false);assert.deepEqual(h.CapAdd,null);assert.deepEqual(h.CapDrop,null);
 assert.ok(Array.isArray(h.SecurityOpt)&&h.SecurityOpt.length===1&&typeof h.SecurityOpt[0]==='string'&&h.SecurityOpt[0].startsWith('seccomp=')&&Buffer.byteLength(h.SecurityOpt[0])<256*1024);assert.deepEqual(JSON.parse(h.SecurityOpt[0].slice(8)),profile);
 assert.ok(Array.isArray(v.Mounts)&&v.Mounts.length===2);
 const [bind]=v.Mounts.filter(m=>m.Type==='bind');const [tmp]=v.Mounts.filter(m=>m.Type==='tmpfs');assert.ok(bind&&tmp);
 assert.equal(bind.Source,inputs);assert.equal(bind.Destination,'/qualification-inputs');assert.equal(bind.RW,false);assert.equal(tmp.Destination,'/var/lib/postgresql/data');assert.equal(tmp.RW,true);
 assert.deepEqual(v.Config.Entrypoint,['/bin/bash']);assert.deepEqual(v.Config.Cmd,['/qualification-build.sh']);
 assert.ok(Array.isArray(v.Config.Env)&&v.Config.Env.every(x=>typeof x==='string'));assert.deepEqual([...v.Config.Env].sort(),[...expectedEnv].sort());assert.equal(new Set(v.Config.Env.map(x=>x.slice(0,x.indexOf('=')))).size,v.Config.Env.length);
 return true;
}
