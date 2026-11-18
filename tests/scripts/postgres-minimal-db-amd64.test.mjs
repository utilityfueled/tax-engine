import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {gunzipSync,zstdDecompressSync} from 'node:zlib';
import {MinimalDbCompatibilityController,DB_LIMITS} from '../../scripts/qualify-postgres-minimal-db-amd64.mjs';
import {Controller} from '../../scripts/qualify-postgres-backports-amd64.mjs';
import {MinimalRuntimeController} from '../../scripts/qualify-postgres-minimal-runtime-amd64.mjs';
import {fixtureFiles,ROWS,INIT_ASSERTION} from '../../scripts/lib/postgres-minimal-db-fixtures.mjs';
const exec=promisify(execFile),SECRET='adversarial-synthetic-auth-sentinel-281690';

async function assertAbsent(root,secret){
 for(const name of await readdir(root,{withFileTypes:true})){
  assert.ok(!name.name.includes(secret));const p=join(root,name.name);
  if(name.isDirectory())await assertAbsent(p,secret);else assert.ok(!(await readFile(p)).includes(Buffer.from(secret)),p+' leaked private auth');
 }
}

test('fixture bytes cover original executable/source/compression semantics and exact values offline',async()=>{
 const f=fixtureFiles();assert.equal(f.length,7);assert.equal(f.find(x=>x.name==='01-sourced.sh').mode,0o644);assert.equal(f.find(x=>x.name==='02-executable.sh').mode,0o755);
 assert.equal(ROWS.length,6);assert.ok(INIT_ASSERTION.includes('9007199254740991.01000001'));assert.ok(INIT_ASSERTION.includes('00010aff00f1'));
 assert.ok(gunzipSync(f.find(x=>x.name.endsWith('.gz')).bytes).toString().includes('gzip-sql'));
 assert.ok(zstdDecompressSync(f.find(x=>x.name.endsWith('.zst')).bytes).toString().includes('zstd-sql'));
 const dir=await mkdtemp(join(tmpdir(),'db-fixture-control-'));
 try{const p=join(dir,'fixture.xz');await writeFile(p,f.find(x=>x.name.endsWith('.xz')).bytes);const r=await exec('python3',['-I','-B','-c','import pathlib,sys,lzma;print(lzma.decompress(pathlib.Path(sys.argv[1]).read_bytes()).decode())',p]);assert.ok(r.stdout.includes('xz-sql'));}finally{await rm(dir,{recursive:true,force:true});}
});

test('existing native DB recovery method and global bounds remain unchanged',()=>{
 const c=new MinimalDbCompatibilityController('/not-used',{});
 assert.equal(c.databaseChecks,Controller.prototype.databaseChecks);
 assert.equal(c.limit.controllerMinutes,DB_LIMITS.controllerMinutes);assert.equal(c.cleanupReserve,DB_LIMITS.cleanupMinutes*60000);
 assert.ok(Controller.prototype.databaseChecks.toString().includes('9007199254740991.01000001'));
 assert.ok(Controller.prototype.databaseChecks.toString().includes('SCRAM mismatch'));
 assert.ok(Controller.prototype.databaseChecks.toString().includes('rollback-assert'));
});

test('actual publication excludes auth recursively through success partial failures and cleanup',async()=>{
 for(const failure of ['none','after-auth','after-inspect','cleanup']){
  const dir=await mkdtemp(join(tmpdir(),'db-publication-control-'));
  try{
   const c=new MinimalDbCompatibilityController(dir,{});c.identity={source:'1'.repeat(40),runId:'17',attempt:'1',kind:'package',extra:{env:SECRET}};
   c.initialize=async()=>{await mkdir(c.private,{recursive:true});c.evidence=join(dir,'evidence');await mkdir(c.evidence);};
   c.build=async()=>{await c.enterDatabaseScope();await writeFile(join(c.private,'database.env'),'POSTGRES_PASSWORD='+SECRET);await writeFile(join(c.private,'inspect.stdout'),JSON.stringify({Config:{Env:[SECRET]},args:[SECRET],metadata:SECRET}));c.checks.push({step:SECRET,exit:0,args:[SECRET],env:{PGPASSWORD:SECRET},metadata:SECRET});if(failure!=='none'&&failure!=='cleanup')throw Error(SECRET);c.databaseCompatibilityCompleted=true;};
   c.cleanup=async()=>{assert.equal(c.private,c.databasePrivate);await writeFile(join(c.private,'cleanup.stdout'),SECRET);if(failure==='cleanup')c.cleanupErrors.push(SECRET);else c.cleanupVerified=true;};
   c.connection={args:[]};c.command=async()=>'';
   const r=await c.run();assert.equal(r.passed,failure==='none');await assertAbsent(c.evidence,SECRET);
   assert.ok(!JSON.stringify(r).includes(SECRET));assert.equal(r.fullServiceQualified,false);assert.equal(r.candidateReleaseQualified,false);
   assert.equal(await readFile(join(c.databasePrivate,'cleanup.stdout'),'utf8'),SECRET);
  }finally{await rm(dir,{recursive:true,force:true});}
 }
});

function daemon(c,{preexisting=[],collision=false,foreign=false,referenced=false,uncertain=false}={}){
 const calls=[],volumes=new Map(preexisting.map(name=>[name,{Name:name,Driver:'local',Scope:'local',Options:null,Labels:{foreign:'true'},Mountpoint:'/docker/volumes/'+name+'/_data'}]));
 c.connection={args:[]};c.commandEnv={};c.command=async(step,exe,args)=>{
  calls.push(args);
  if(uncertain){c.unconfirmedChild=true;throw Error('uncertain');}
  if(args[0]==='volume'&&args[1]==='ls')return [...volumes.keys()].filter(n=>!args.includes('--filter')||n.includes(args.at(-1).replace(/^name=/,''))).join('\n')+(collision?'\ncollision':'');
  if(args[0]==='volume'&&args[1]==='create'){const name=args.at(-1);volumes.set(name,{Name:name,Driver:'local',Scope:'local',Options:null,Labels:{'io.vivalatax.qualification.operation':foreign?'foreign':c.operation},Mountpoint:'/docker/volumes/'+name+'/_data'});return name;}
  if(args[0]==='volume'&&args[1]==='inspect')return JSON.stringify([volumes.get(args.at(-1))]);
  if(args[0]==='volume'&&args[1]==='rm'){volumes.delete(args.at(-1));return args.at(-1);}
  if(args[0]==='ps')return referenced?'owned-reference':'';
  return '';
 };
 return {calls,volumes};
}

test('fresh named-volume admission rejects preexisting or foreign volumes before mounting',async()=>{
 for(const scenario of ['valid','preexisting','collision','foreign']){
  const dir=await mkdtemp(join(tmpdir(),'db-volume-admission-'));
  try{
   const c=new MinimalDbCompatibilityController(dir,{});await mkdir(c.private,{recursive:true});const name=`tax-amd-${c.operation}-data`;
   const d=daemon(c,{preexisting:scenario==='preexisting'?[name]:[],collision:scenario==='collision',foreign:scenario==='foreign'});
   await c.enterDatabaseScope();
   const act=()=>c.docker('volume-create-control',['volume','create','--label','io.vivalatax.qualification.operation='+c.operation,name]);
   if(scenario==='valid'){await act();assert.ok(c.registeredVolumes.has(name));}else await assert.rejects(act);
   if(['preexisting','collision'].includes(scenario))assert.equal(d.calls.filter(x=>x[1]==='create').length,0);
  }finally{await rm(dir,{recursive:true,force:true});}
 }
});

test('volume removal preserves preexisting foreign referenced and uncertain resources',async()=>{
 for(const scenario of ['valid','preexisting','foreign','referenced','uncertain']){
  const dir=await mkdtemp(join(tmpdir(),'db-volume-cleanup-'));
  try{
   const c=new MinimalDbCompatibilityController(dir,{});await mkdir(c.private,{recursive:true});const d=daemon(c);await c.enterDatabaseScope();const name=`tax-amd-${c.operation}-data`;
   await c.docker('volume-create-control',['volume','create','--label','io.vivalatax.qualification.operation='+c.operation,name]);
   if(scenario==='preexisting')c.preexistingVolumes.add(name);
   if(scenario==='foreign')d.volumes.get(name).Labels['io.vivalatax.qualification.operation']='foreign';
   if(scenario==='referenced'){const old=c.command;c.command=async(...a)=>a[2][0]==='ps'?'reference':old(...a);}
   if(scenario==='uncertain')c.unconfirmedChild=true;
   if(scenario==='valid'){await c.cleanupVolumes();assert.equal(d.volumes.size,0);}else{await assert.rejects(()=>c.cleanupVolumes());assert.equal(d.calls.filter(x=>x[1]==='rm').length,0);assert.ok(d.volumes.has(name));}
  }finally{await rm(dir,{recursive:true,force:true});}
 }
});

test('actual unchanged native recovery sequence executes complete assertions through fake Docker only',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'db-native-recovery-protocol-'));
 try{
  const c=new MinimalDbCompatibilityController(dir,{});await mkdir(c.private,{recursive:true});c.connection={args:[]};c.command=async()=>'';await c.enterDatabaseScope();c.candidate='b'.repeat(64);const calls=[];let actualSecret;
  c.docker=async(step,args)=>{
   calls.push({step,args,private:c.private});
   if(step==='primary-create'){const text=await readFile(args[args.indexOf('--env-file')+1],'utf8');actualSecret=text.match(/POSTGRES_PASSWORD=(.+)/)[1];assert.ok(text.includes('POSTGRES_HOST_AUTH_METHOD=scram-sha-256'));assert.ok(!text.includes('trust'));}
   if(step.endsWith('-ready-0'))return 'ready';
   if(step==='dump-copy-out')await writeFile(args.at(-1),'synthetic exact recovery dump');
   if(step.endsWith('-verified'))return JSON.stringify([{Config:{Labels:{'io.vivalatax.qualification.operation':c.operation},Env:[actualSecret]},State:{Running:false,ExitCode:0,OOMKilled:false}}]);
   await writeFile(join(c.private,step+'.stdout'),JSON.stringify({env:actualSecret,args}));return '';
  };
  await c.nativeRecovery('a'.repeat(64));
  for(const step of ['scram','seed','initial-assert','primary-restart','restart-assert','dump','restore','restore-assert','rollback-assert'])assert.ok(calls.some(x=>x.step===step),step);
  assert.ok(calls.every(x=>x.private===c.databasePrivate));assert.ok(actualSecret.length>=32);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('actual DB build follows fresh paired source stage and holds an insufficient DB window',async()=>{
 const original=MinimalRuntimeController.prototype.build;
 try{for(const low of [false,true]){
  const dir=await mkdtemp(join(tmpdir(),'db-build-order-'));const events=[];
  try{
   const c=new MinimalDbCompatibilityController(dir,{});c.identity.source='1'.repeat(40);c.evidence=join(dir,'evidence');await mkdir(c.evidence);await mkdir(c.private);c.verifyPolicy=async()=>events.push('policy');
   MinimalRuntimeController.prototype.build=async function(){events.push('fresh-source');if(low)this.deadline=0;await writeFile(join(this.evidence,'minimal-stage.json'),JSON.stringify({source:this.identity.source,rawOfficialBaseOnly:true,pairedInventory:{pairedInventoryPassed:true},baselineImage:'sha256:'+'a'.repeat(64),candidateImage:'sha256:'+'b'.repeat(64)}));};
   c.enterDatabaseScope=async()=>{events.push('private');c.databasePrivate=join(c.private,'database-scope');await mkdir(c.databasePrivate);c.private=c.databasePrivate;};
   c.initMatrix=async(v,image)=>{assert.equal(c.private,c.databasePrivate);assert.equal(image,'sha256:'+(v==='baseline'?'a':'b').repeat(64));events.push(v);};
   c.nativeRecovery=async(base)=>{assert.equal(base,'a'.repeat(64));assert.equal(c.candidate,'b'.repeat(64));events.push('recovery');await writeFile(join(c.private,'recovery.dump'),'synthetic dump');};
   if(low){await assert.rejects(()=>c.build());assert.deepEqual(events,['policy','fresh-source']);}else{await c.build();assert.deepEqual(events,['policy','fresh-source','private','baseline','candidate','recovery']);assert.equal(c.databaseCompatibilityCompleted,true);}
  }finally{await rm(dir,{recursive:true,force:true});}
 }}finally{MinimalRuntimeController.prototype.build=original;}
});

test('actual init matrix retains authenticated exact assertions and restart protocol on both images',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'db-init-protocol-'));
 try{
  const c=new MinimalDbCompatibilityController(dir,{});await mkdir(c.private);c.connection={args:[]};c.command=async()=>'';await c.enterDatabaseScope();c.matrix=[];const calls=[];
  c.docker=async(step,args)=>{calls.push({step,args});if(step.endsWith('-create')){const env=await readFile(args[args.indexOf('--env-file')+1],'utf8');assert.ok(env.includes('POSTGRES_HOST_AUTH_METHOD=scram-sha-256'));assert.ok(!env.includes('trust'));assert.ok(args.includes('--mount'));}
   if(step.endsWith('-verified'))return JSON.stringify([{Config:{Labels:{'io.vivalatax.qualification.operation':c.operation},Env:[SECRET]},State:{Running:false,ExitCode:0,OOMKilled:false}}]);return '';};
  for(const variant of ['baseline','candidate'])await c.initMatrix(variant,'sha256:'+'a'.repeat(64));
  assert.equal(c.matrix.length,2);
  for(const variant of ['baseline','candidate']){
   for(const suffix of ['nonroot','scram','assert','auth-missing','auth-wrong','restart','persist','final-stop'])assert.ok(calls.some(x=>x.step==='init-'+variant+'-'+suffix));
   for(const suffix of ['assert','persist'])assert.ok(calls.find(x=>x.step==='init-'+variant+'-'+suffix).args.includes(INIT_ASSERTION));
   assert.ok(calls.find(x=>x.step==='init-'+variant+'-auth-missing').args.at(-1).includes('unset PGPASSWORD'));
   assert.ok(calls.find(x=>x.step==='init-'+variant+'-auth-wrong').args.at(-1).includes('password authentication failed'));
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('real cleanup keeps inspect Env private and closes containers before named volumes and images',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'db-cleanup-protocol-'));
 try{
  const c=new MinimalDbCompatibilityController(dir,{});await mkdir(c.private);const d=daemon(c);await c.enterDatabaseScope();const name=`tax-amd-${c.operation}-data`;await c.docker('volume-create-control',['volume','create','--label','io.vivalatax.qualification.operation='+c.operation,name]);c.preexistingImages=new Set();let exists=true,running=true;const events=[],old=c.command;
  c.command=async(step,exe,args,...rest)=>{
   assert.equal(c.private,c.databasePrivate);await writeFile(join(c.private,step+'.stdout'),SECRET);events.push(args.slice(0,2).join(' '));
   if(args[0]==='ps'&&args.at(-1).startsWith('label='))return exists?'owned-container':'';
   if(args[0]==='inspect')return JSON.stringify([{Id:'owned-container',Config:{Labels:{'io.vivalatax.qualification.operation':c.operation},Env:[SECRET]},State:{Running:running,ExitCode:0,OOMKilled:false}}]);
   if(args[0]==='stop'){running=false;return '';}
   if(args[0]==='rm'){exists=false;return '';}
   return old(step,exe,args,...rest);
  };
  await c.cleanup();assert.equal(c.cleanupVerified,true);assert.equal(c.cleanupErrors.length,0);assert.ok(events.indexOf('rm --volumes')<events.indexOf('volume rm'));assert.ok(events.indexOf('volume rm')<events.indexOf('image ls'));assert.equal(d.volumes.size,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
