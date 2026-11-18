// Original runtimeBuild, guarded fresh named volumes, and fixed private publication.
import assert from 'node:assert/strict';
import {lstat,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {URL,fileURLToPath,pathToFileURL} from 'node:url';
import {Controller,cleanupOwned,writeHandoff} from './qualify-postgres-backports-amd64.mjs';
import {MinimalDbCompatibilityController} from './qualify-postgres-minimal-db-amd64.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),LABEL='io.vivalatax.qualification.operation';
const save=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
export class CompositeRuntimeController extends Controller{
 constructor(output,input,env=process.env){super('runtime',output,input,env);this.registeredVolumes=new Map();this.attemptedVolumes=new Set();}
 async docker(...args){if(this.databasePrivate)return MinimalDbCompatibilityController.prototype.docker.apply(this,args);return super.docker(...args);}
 async databaseChecks(base){
  assert.ok(!this.databasePrivate);this.dbImages=new Set(['sha256:'+base,'sha256:'+this.candidate]);
  await MinimalDbCompatibilityController.prototype.enterDatabaseScope.call(this);
  return Controller.prototype.databaseChecks.call(this,base);
 }
 async cleanup(){
  if(!this.databasePrivate)return super.cleanup();
  if(!this.connection||this.unconfirmedChild){this.cleanupErrors.push('owned-cleanup-unverified');return;}
  const command=(step,args)=>this.docker('runtime-close-'+step+'-'+this.checks.length,args,45,{cleanup:true});
  for(const operation of [this.operation,this.builderOperation].filter(Boolean)){
   const io={isUncertain:()=>this.unconfirmedChild,
    list:async()=>{const ids=(await command('containers',['ps','--all','--quiet','--filter',`label=${LABEL}=${operation}`])).trim().split('\n').filter(Boolean);const rows=[];for(const id of ids){const [v]=JSON.parse(await command('inspect',['inspect',id]));rows.push({id:v.Id,operation:v.Config.Labels[LABEL],running:v.State.Running});}return rows;},
    stop:id=>command('stop',['stop','--timeout','-1',id]),
    inspect:async id=>{const [v]=JSON.parse(await command('stopped',['inspect',id]));return {operation:v.Config.Labels[LABEL],running:v.State.Running,exitCode:v.State.ExitCode,oomKilled:v.State.OOMKilled};},
    remove:id=>command('remove',['rm','--volumes',id])};
   this.cleanupErrors.push(...await cleanupOwned(io,operation));if(this.cleanupErrors.length||this.unconfirmedChild)return;
  }
  await MinimalDbCompatibilityController.prototype.cleanupVolumes.call(this);
  // Volumes have passed the stronger fresh-identity cleanup. Original image
  // lineage/import cleanup is retained; do not ask it to re-remove the volumes.
  this.volumes=[];await super.cleanup();
 }
 async run(){
  let failure=true;
  try{await this.initialize();await this.runtimeBuild();await this.command('source-drift-final','git',['-C',ROOT,'diff','--exit-code','HEAD','--']);failure=false;}catch{/* Raw errors/auth remain private. */}
  finally{if(await lstat(this.public).catch(()=>null)){try{await this.cleanup();}catch{this.cleanupErrors.push('owned-cleanup-unverified');}}}
  const identity={source:/^[a-f0-9]{40}$/.test(this.identity.source??'')?this.identity.source:null,runId:/^\d+$/.test(this.identity.runId??'')?this.identity.runId:null,attempt:/^\d+$/.test(this.identity.attempt??'')?this.identity.attempt:null,kind:'runtime'};
  const result={...identity,operation:this.operation,image:this.candidate??null,commandCounts:{total:this.checks.length,zero:this.checks.filter(x=>x.exit===0).length,nonzero:this.checks.filter(x=>Number.isInteger(x.exit)&&x.exit!==0).length,unavailable:this.checks.filter(x=>!Number.isInteger(x.exit)).length},failure,cleanupErrors:this.cleanupErrors.length?['owned-cleanup-unverified']:[],deadlineExceeded:performance.now()>this.deadline,candidateReleaseQualified:false,riskAccepted:false,genericAbiApproval:false};
  result.passed=!result.failure&&!result.cleanupErrors.length&&!result.deadlineExceeded&&!this.unconfirmedChild;
  if(await lstat(this.public).catch(()=>null)){await save(join(this.public,'result.json'),result);if(result.passed)await writeHandoff(this.public,{...identity,image:this.candidate},await readdir(this.public));}
  return result.passed;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{assert.equal(process.argv.length,4);const passed=await new CompositeRuntimeController(resolve(process.argv[2]),resolve(process.argv[3])).run();console.log(JSON.stringify({passed,candidateReleaseQualified:false}));if(!passed)process.exitCode=1;}catch{console.error('Composite runtime held; private diagnostics retained.');process.exitCode=1;}
}
