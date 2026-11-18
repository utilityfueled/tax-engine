// Spec: spec/ops/sqlite-exported-abi-native-amd64.yaml
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {materializationRecipe, validateToolContainer, executeFixedTool, orchestrate, ABI_IMAGE_BASE, SqliteAbiAdapter} from '../../scripts/qualify-sqlite-exported-abi-amd64.mjs';
import {SourceCandidateController} from '../../scripts/qualify-postgres-source-candidates-amd64.mjs';
const id='sha256:'+'a'.repeat(64),op='11111111-2222-3333-4444-555555555555';
test('preserves original tool recipe and appends only tool verification',()=>{
 const original='ARG BASE\nFROM ${BASE}\nUSER root\nRUN true\n';
 const text=materializationRecipe(original,op);
 assert.ok(text.startsWith(original.replace('FROM ${BASE}\n',`FROM \${BASE}\nLABEL io.vivalatax.qualification.operation="${op}"\n`)));
 assert.ok(text.includes('COPY verify-tools.py'));
 assert.ok(text.includes('abigail-tools=2.2-2')); assert.ok(text.includes('binutils-x86-64-linux-gnu=2.40-2'));
 assert.ok(!text.includes('dpkg-buildpackage'));assert.ok(!text.includes('make '));
 assert.match(ABI_IMAGE_BASE,/^docker\.io\/library\/postgres@sha256:[a-f0-9]{64}$/);
});
const state=()=>({Image:id,Config:{Labels:{'io.vivalatax.qualification.operation':op},Entrypoint:['/usr/bin/abidiff']},State:{Status:'created',Running:false,ExitCode:0,OOMKilled:false,Error:''},HostConfig:{NetworkMode:'none',ReadonlyRootfs:true,Privileged:false,CapAdd:null,CapDrop:['ALL'],SecurityOpt:['no-new-privileges'],Binds:null},Mounts:[{Type:'bind',Source:'/owned/payloads',Destination:'/owned/payloads',RW:false},{Type:'tmpfs',Destination:'/tmp'},{Type:'tmpfs',Destination:'/var/lib/postgresql/data'}]});
test('runs fixed tools only in new owned hardened containers',async()=>{
 assert.equal(validateToolContainer(state(),id,op,'/owned/payloads','/usr/bin/abidiff',true),true);
 for(const mutate of [v=>v.Image='foreign',v=>v.State.Running=true,v=>v.State.ExitCode=4,v=>v.State.OOMKilled=true,v=>v.Config.Labels={},v=>v.HostConfig.NetworkMode='bridge',v=>v.Mounts[0].RW=true,v=>v.HostConfig.CapAdd=['SYS_ADMIN']]){
  const v=globalThis.structuredClone(state());mutate(v);assert.throws(()=>validateToolContainer(v,id,op,'/owned/payloads','/usr/bin/abidiff',true));
 }
 const calls=[];const io={operation:op,image:id,work:'/owned/payloads',uid:1001,docker:async(step,args)=>{calls.push(args);return args[0]==='inspect'?JSON.stringify([state()]):args[0]==='start'?'bounded output':'';}};
 assert.equal(await executeFixedTool(io,'abidiff','/usr/bin/abidiff',['--version'],1000),'bounded output');
 assert.deepEqual(calls.map(x=>x[0]),['create','inspect','start','inspect','rm']);
 assert.equal(calls[2][1],'--attach');assert.equal(calls[4].includes('--force'),false);assert.equal(calls.some(x=>x[0]==='exec'),false);
 await assert.rejects(()=>executeFixedTool(io,'foreign','/bin/sh',['-c','echo bad'],1000));
});
test('refuses missing pairs before native materialization',async()=>{
 const calls=[];const failure=new Error('missing candidate');
 const io={preflight:async()=>{calls.push('preflight');throw failure;},materialize:async()=>calls.push('materialize')};
 await assert.rejects(()=>orchestrate(io,{}, {diagnoseFn:async()=>calls.push('diagnose')}),e=>e===failure);
 assert.deepEqual(calls,['preflight']);
 const input={archive:'/safe.zip',archiveSha256:'a'.repeat(64),source:'b'.repeat(40)};
 io.preflight=async value=>{assert.equal(value,input);calls.push('verified-pairs');return {verified:true};};
 io.materialize=async(value,before)=>{assert.equal(value,input);assert.equal(before.verified,true);calls.push('new-tools');return id;};
 io.work='/owned/payloads';
 const result=await orchestrate(io,input,{diagnoseFn:async(value,options)=>{assert.equal(value.work,io.work);assert.equal(typeof options.run,'function');calls.push('diagnose');return {passed:true};}});
 assert.equal(result.passed,true);assert.deepEqual(calls,['preflight','verified-pairs','new-tools','diagnose']);
});
test('normal tool failure stops before success inspection or removal',async()=>{
 const calls=[];const io={operation:op,image:id,work:'/owned/payloads',uid:1001,docker:async(step,args)=>{calls.push(args[0]);if(args[0]==='inspect')return JSON.stringify([state()]);if(args[0]==='start')throw new Error('nonzero');return '';}};
 await assert.rejects(()=>executeFixedTool(io,'abidiff','/usr/bin/abidiff',[],1000));
 assert.deepEqual(calls,['create','inspect','start']);
});
test('inherits native admission supervision and normal cleanup without replacements',()=>{
 for(const name of ['initialize','command','docker','inspect','capacity','cleanup','run'])assert.equal(SqliteAbiAdapter.prototype[name],SourceCandidateController.prototype[name]);
 const adapter=new SqliteAbiAdapter('/unused',{});
 assert.equal(adapter.limit.controllerMinutes,32);assert.equal(adapter.limit.cleanupMinutes,3);assert.equal(adapter.limit.jobMinutes,35);
 assert.equal(adapter.cleanupReserve,180000);
});
