import {Buffer} from 'node:buffer';
// Opt-in experiment: synthetic raw-base DB compatibility, never release qualification.
import assert from 'node:assert/strict';
import {chmod,lstat,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {URL,fileURLToPath,pathToFileURL} from 'node:url';
import {MinimalRuntimeController} from './qualify-postgres-minimal-runtime-amd64.mjs';
import {Controller,cleanupOwned} from './qualify-postgres-backports-amd64.mjs';
import {fixtureFiles,INIT_ASSERTION} from './lib/postgres-minimal-db-fixtures.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),LABEL='io.vivalatax.qualification.operation';
const sha=v=>createHash('sha256').update(v).digest('hex');
const save=(path,value)=>writeFile(path,(typeof value==='string'||Buffer.isBuffer(value))?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
export const DB_LIMITS={jobMinutes:75,controllerMinutes:65,cleanupMinutes:10,databaseAdmissionMinutes:20};
const stages=['admission','minimal-source-pins','minimal-immutable-base','minimal-offline-purge-build','minimal-paired-rootfs','minimal-fresh-advisories','db-admission','db-init-baseline','db-init-candidate','db-native-recovery','db-completed'];
function names(text){const rows=text.trim().split('\n').filter(Boolean);for(const v of rows)assert.match(v,/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,255}$/);assert.equal(new Set(rows).size,rows.length);return new Set(rows);}
function volumeIdentity(v,name,operation){
 assert.equal(v.Name,name);assert.equal(v.Driver,'local');assert.equal(v.Scope,'local');assert.deepEqual(v.Options??{},{});assert.equal(v.Labels?.[LABEL],operation);assert.equal(typeof v.Mountpoint,'string');assert.ok(v.Mountpoint.startsWith('/'));
 return {Name:v.Name,Driver:v.Driver,Scope:v.Scope,Options:v.Options??{},Labels:v.Labels,Mountpoint:v.Mountpoint,CreatedAt:v.CreatedAt??null};
}
export class MinimalDbCompatibilityController extends MinimalRuntimeController{
 constructor(output,env=process.env){
  super(output,env);this.sourceCandidate='minimal-postgres-raw-base-db-compatibility';this.limit={...this.limit,minutes:DB_LIMITS.jobMinutes,controllerMinutes:DB_LIMITS.controllerMinutes,cleanupMinutes:DB_LIMITS.cleanupMinutes};this.deadline=performance.now()+DB_LIMITS.controllerMinutes*60000;this.cleanupReserve=DB_LIMITS.cleanupMinutes*60000;this.registeredVolumes=new Map();this.attemptedVolumes=new Set();this.databaseCompatibilityCompleted=false;this.cleanupVerified=false;
 }
 async verifyPolicy(){
  const p=JSON.parse(await readFile(join(ROOT,'infra/postgres-minimal-runtime/db-policy.json'),'utf8'));
  assert.equal(p.rawOfficialBaseOnly,true);assert.equal(p.databaseChecksVerbatim,true);
  assert.deepEqual(Object.keys(p.files).sort(),['scripts/lib/postgres-minimal-db-fixtures.mjs','scripts/qualify-postgres-backports-amd64.mjs','scripts/qualify-postgres-minimal-runtime-amd64.mjs','scripts/qualify-postgres-source-candidates-amd64.mjs']);
  for(const [name,pin] of Object.entries(p.files)){assert.match(pin,/^[a-f0-9]{64}$/);assert.equal(sha(await readFile(join(ROOT,name))),pin);}
  await save(join(this.evidence,'db-source-binding.json'),{source:this.identity.source,policy:p,rawOfficialBaseOnly:true});
 }
 async build(){
  await this.verifyPolicy();await super.build();this.stage='db-admission';
  assert.ok(this.deadline-performance.now()-this.cleanupReserve>DB_LIMITS.databaseAdmissionMinutes*60000,'Insufficient remaining synthetic DB window');
  const pair=JSON.parse(await readFile(join(this.evidence,'minimal-stage.json'),'utf8'));
  assert.equal(pair.source,this.identity.source);assert.equal(pair.rawOfficialBaseOnly,true);assert.equal(pair.pairedInventory.pairedInventoryPassed,true);
  for(const image of [pair.baselineImage,pair.candidateImage])assert.match(image,/^sha256:[a-f0-9]{64}$/);
  this.dbImages=new Set([pair.baselineImage,pair.candidateImage]);this.candidate=pair.candidateImage.slice(7);
  await this.enterDatabaseScope();
  this.matrix=[];for(const [variant,image] of [['baseline',pair.baselineImage],['candidate',pair.candidateImage]]){this.stage='db-init-'+variant;await this.initMatrix(variant,image);}
  this.stage='db-native-recovery';await this.nativeRecovery(pair.baselineImage.slice(7));
  const dump=await lstat(join(this.private,'recovery.dump'));assert.ok(dump.isFile()&&!dump.isSymbolicLink()&&dump.nlink===1&&dump.size>0&&dump.size<=16*1024**2);
  this.databaseCompatibilityCompleted=true;this.stage='db-completed';
  await save(join(this.evidence,'db-compatibility.json'),{source:this.identity.source,baselineImage:pair.baselineImage,candidateImage:pair.candidateImage,rawOfficialBaseOnly:true,initMatrices:this.matrix,nativeDatabaseChecksVerbatim:true,precisionXmlByteaAssertionsPassed:true,persistenceRestartPassed:true,dumpRestorePassed:true,originalBaselineRollbackPassed:true,dumpSha256:sha(await readFile(join(this.private,'recovery.dump'))),dumpBytes:dump.size,fullServiceQualified:false,candidateReleaseQualified:false,riskAccepted:false});
 }
 async enterDatabaseScope(){
  assert.ok(!this.databasePrivate);this.basePrivate=this.private;this.databasePrivate=join(this.basePrivate,'database-scope');await mkdir(this.databasePrivate,{mode:0o700});this.private=this.databasePrivate;
  // Scope changes BEFORE even the snapshot: failure and all cleanup remain private.
  this.preexistingVolumes=names(await this.docker('db-before-volumes',['volume','ls','--quiet']));
 }
 async docker(step,args,seconds=60,options){
  if(this.databasePrivate&&args[0]==='volume'&&args[1]==='create'){
   assert.ok(!this.unconfirmedChild);const name=args.at(-1),allowed=['data','restore','init-baseline','init-candidate'].map(x=>`tax-amd-${this.operation}-${x}`);
   assert.ok(allowed.includes(name));assert.deepEqual(args,['volume','create','--label',LABEL+'='+this.operation,name]);assert.ok(!this.preexistingVolumes.has(name));assert.ok(!this.attemptedVolumes.has(name));
   assert.equal((await super.docker(step+'-freshness',['volume','ls','--quiet','--filter','name='+name],seconds,options)).trim(),'');
   this.attemptedVolumes.add(name);const result=await super.docker(step,args,seconds,options);assert.equal(result.trim(),name);
   const [v]=JSON.parse(await super.docker(step+'-identity',['volume','inspect',name],seconds,options));this.registeredVolumes.set(name,volumeIdentity(v,name,this.operation));return result;
  }
  if(this.databasePrivate&&args[0]==='create'){
   assert.ok(this.dbImages?.has(args.at(-1)));assert.ok(args.includes('--network')&&args[args.indexOf('--network')+1]==='none');assert.ok(args.includes('--label')&&args[args.indexOf('--label')+1]===LABEL+'='+this.operation);
   const envFile=args[args.indexOf('--env-file')+1];assert.ok(args.includes('--env-file')&&envFile.startsWith(this.databasePrivate+'/'));assert.ok(!args.some(v=>['--privileged','--publish','-p','--pid','--network=host'].includes(v)));
   const volume=args[args.indexOf('--volume')+1];assert.ok(args.includes('--volume'));const name=volume.split(':')[0];assert.equal(volume,name+':/var/lib/postgresql/data');assert.ok(this.registeredVolumes.has(name));
   const [current]=JSON.parse(await super.docker(step+'-volume-current',['volume','inspect',name],seconds,options));assert.deepEqual(volumeIdentity(current,name,this.operation),this.registeredVolumes.get(name));
  }
  return super.docker(step,args,seconds,options);
 }
 async initMatrix(variant,image){
  assert.ok(['baseline','candidate'].includes(variant));const fixtures=join(this.private,'init-'+variant);await mkdir(fixtures,{mode:0o755});const bindings=[];
  for(const f of fixtureFiles()){await save(join(fixtures,f.name),f.bytes);await chmod(join(fixtures,f.name),f.mode);bindings.push({name:f.name,mode:f.mode,sha256:sha(f.bytes)});}
  const envFile=join(this.private,'init-'+variant+'.env');await save(envFile,'POSTGRES_USER=qualification\nPOSTGRES_DB=qualification_init\nPOSTGRES_PASSWORD='+randomBytes(32).toString('hex')+'\nPOSTGRES_HOST_AUTH_METHOD=scram-sha-256\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n');
  const volume=`tax-amd-${this.operation}-init-${variant}`,name=`tax-amd-${this.operation}-init-${variant}`;
  await this.docker('init-'+variant+'-volume',['volume','create','--label',LABEL+'='+this.operation,volume]);
  await this.docker('init-'+variant+'-create',['create','--name',name,'--label',LABEL+'='+this.operation,'--network','none','--env-file',envFile,'--volume',volume+':/var/lib/postgresql/data','--mount','type=bind,source='+fixtures+',destination=/docker-entrypoint-initdb.d,readonly',image]);
  await this.docker('init-'+variant+'-start',['start',name]);
  const ready=()=>this.docker('init-'+variant+'-ready-'+this.checks.length,['exec',name,'sh','-ec','for n in $(seq 1 45); do pg_isready -h 127.0.0.1 -U qualification -d qualification_init >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'],50);
  await ready();await this.docker('init-'+variant+'-nonroot',['exec',name,'sh','-ec','test "$(sed -n "s/^Uid:[[:space:]]*\\([0-9]*\\).*/\\1/p" /proc/1/status)" = "$(id -u postgres)"; test "$(cat /proc/1/comm)" = postgres']);
  const sql=(step,statement)=>this.docker('init-'+variant+'-'+step,['exec',name,'sh','-ec','PGPASSWORD="$POSTGRES_PASSWORD" exec psql -X --no-password -h 127.0.0.1 -U qualification -d qualification_init -v ON_ERROR_STOP=1 -c "$1"','sh',statement]);
  await sql('scram',"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_authid WHERE rolname='qualification' AND rolpassword LIKE 'SCRAM-SHA-256$%') THEN RAISE EXCEPTION 'SCRAM mismatch'; END IF; END $$;");await sql('assert',INIT_ASSERTION);
  for(const [kind,assignment,message] of [['missing','unset PGPASSWORD','no password supplied'],['wrong','export PGPASSWORD=synthetic-deliberately-wrong','password authentication failed']]){
   await this.docker('init-'+variant+'-auth-'+kind,['exec',name,'sh','-ec',assignment+'; export PGPASSFILE=/dev/null; if psql -X -w -h 127.0.0.1 -U qualification -d qualification_init -c "SELECT 1" > /tmp/auth-'+kind+'.log 2>&1; then exit 1; fi; grep -F "'+message+'" /tmp/auth-'+kind+'.log >/dev/null']);
  }
  await this.normalStop('init-'+variant+'-stop',name);await this.docker('init-'+variant+'-restart',['start',name]);await ready();await sql('persist',INIT_ASSERTION);await this.normalStop('init-'+variant+'-final-stop',name);
  this.matrix.push({variant,fixtureCount:7,rowCount:6,fixtures:bindings,nonroot:true,scram:true,missingPasswordRejected:true,wrongPasswordRejected:true,persistedAfterRestart:true});
 }
 async nativeRecovery(base){return Controller.prototype.databaseChecks.call(this,base);}
 async cleanupVolumes(){
  assert.ok(!this.unconfirmedChild);assert.ok(this.preexistingVolumes instanceof Set);
  for(const name of this.attemptedVolumes)assert.ok(this.registeredVolumes.has(name),'Created volume custody unavailable');
  for(const [name,previous] of this.registeredVolumes){
   assert.ok(!this.preexistingVolumes.has(name));const [v]=JSON.parse(await this.docker('db-cleanup-volume-current-'+this.checks.length,['volume','inspect',name],60,{cleanup:true}));assert.deepEqual(volumeIdentity(v,name,this.operation),previous);
   assert.equal((await this.docker('db-cleanup-volume-users-'+this.checks.length,['ps','--all','--quiet','--filter','volume='+name],60,{cleanup:true})).trim(),'');
   await this.docker('db-cleanup-volume-remove-'+this.checks.length,['volume','rm',name],60,{cleanup:true});
  }
  const after=names(await this.docker('db-cleanup-preserved-volumes',['volume','ls','--quiet'],60,{cleanup:true}));for(const before of this.preexistingVolumes)assert.ok(after.has(before));for(const name of this.attemptedVolumes)assert.ok(!after.has(name));
  assert.equal((await this.docker('db-cleanup-no-owned-volumes',['volume','ls','--quiet','--filter','label='+LABEL+'='+this.operation],60,{cleanup:true})).trim(),'');
 }
 async cleanup(){
  if(!this.databasePrivate){await super.cleanup();this.cleanupVerified=Boolean(this.connection)&&!this.unconfirmedChild&&!this.cleanupErrors.length;return;}
  if(!this.connection||this.unconfirmedChild){this.cleanupErrors.push('owned-cleanup-unverified');return;}
  const command=(step,args)=>this.docker('db-close-'+step+'-'+this.checks.length,args,60,{cleanup:true});
  const io={
   list:async()=>{const ids=(await command('containers',['ps','--all','--quiet','--filter','label='+LABEL+'='+this.operation])).trim().split('\n').filter(Boolean);const rows=[];for(const id of ids){const [v]=JSON.parse(await command('inspect',['inspect',id]));rows.push({id:v.Id,operation:v.Config.Labels[LABEL],running:v.State.Running});}return rows;},
   stop:id=>command('stop',['stop','--timeout','-1',id]),
   inspect:async id=>{const [v]=JSON.parse(await command('stopped',['inspect',id]));return {operation:v.Config.Labels[LABEL],running:v.State.Running,exitCode:v.State.ExitCode,oomKilled:v.State.OOMKilled};},
   remove:id=>command('remove',['rm','--volumes',id]),isUncertain:()=>this.unconfirmedChild
  };
  this.cleanupErrors.push(...await cleanupOwned(io,this.operation));if(this.cleanupErrors.length||this.unconfirmedChild)return;
  await this.cleanupVolumes();await super.cleanup();this.cleanupVerified=!this.cleanupErrors.length&&!this.unconfirmedChild;
 }
 async run(){
  let failed=true;
  try{await this.initialize();await this.build();await this.command('db-source-unchanged-final','git',['-C',ROOT,'diff','--exit-code','HEAD','--']);failed=false;}catch{/* Never publish exception strings or raw DB diagnostics. */}
  finally{if(await lstat(this.private).catch(()=>null)){try{await this.cleanup();}catch{this.cleanupErrors.push('owned-cleanup-unverified');}}}
  // Do not call Source.run: its command-log copier would publish inspect Env.
  const result={source:/^[a-f0-9]{40}$/.test(this.identity.source??'')?this.identity.source:null,runId:/^\d+$/.test(this.identity.runId??'')?this.identity.runId:null,attempt:/^\d+$/.test(this.identity.attempt??'')?this.identity.attempt:null,operation:this.operation,sourceCandidate:'minimal-postgres-raw-base-db-compatibility',failure:failed,failureStage:failed?(stages.includes(this.stage)?this.stage:'admission'):null,commandCounts:{total:this.checks.length,zero:this.checks.filter(c=>c.exit===0).length,nonzero:this.checks.filter(c=>Number.isInteger(c.exit)&&c.exit!==0).length,unavailable:this.checks.filter(c=>!Number.isInteger(c.exit)).length},cleanupErrorCount:this.cleanupErrors.length,cleanupVerified:this.cleanupVerified===true,unconfirmedChild:this.unconfirmedChild===true,deadlineExceeded:performance.now()>this.deadline,databaseCompatibilityCompleted:this.databaseCompatibilityCompleted===true,rawOfficialBaseOnly:true,fullServiceQualified:false,composedLibxmlGosuRuntimeQualified:false,otherCveReadinessQualified:false,genericAbiApproval:false,candidateReleaseQualified:false,riskAccepted:false};
  result.passed=!failed&&result.databaseCompatibilityCompleted&&result.cleanupVerified&&!result.cleanupErrorCount&&!result.unconfirmedChild&&!result.deadlineExceeded;
  if(this.evidence)await save(join(this.evidence,'result.json'),result);return result;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert.equal(process.argv.length,3);const result=await new MinimalDbCompatibilityController(resolve(process.argv[2])).run();console.log(JSON.stringify({passed:result.passed,fullServiceQualified:false,candidateReleaseQualified:false}));if(!result.passed)process.exitCode=1;}
