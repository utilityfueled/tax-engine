// Explicit fixed consumer contract, never generic ABI or release qualification.
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath,pathToFileURL,URL} from 'node:url';
import {retrieveArtifact} from './lib/sqlite-abi-artifact.mjs';
import {assertSqliteChecksPassed} from './build-postgres-sqlite-backport.mjs';
import {SqliteGpgTofuRuntime,BASE,BASE_FILES,LIMITS} from './sqlite-gpg-tofu-runtime.mjs';
import {admitQualifiedPair,regularBytes,hash} from './lib/sqlite-gpg-tofu-evidence.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SHA=/^[a-f0-9]{64}$/u,COMMIT=/^[a-f0-9]{40}$/u;
const save=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
export function admitRuntimeRequest(env,event){
 assert.equal(env.GPG_TOFU_ENABLED,'true');assert.equal(event.inputs?.enable_runtime,'true');
 assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_REPOSITORY,'utilityfueled/tax-engine');
 assert.equal(event.repository?.full_name,'utilityfueled/tax-engine');assert.equal(event.repository.private,false);assert.equal(event.repository.fork,false);assert.equal(event.repository.default_branch,'main');
 assert.equal(env.GITHUB_REF,'refs/heads/main');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.match(env.GITHUB_SHA,COMMIT);assert.equal(event.inputs.source_sha,env.GITHUB_SHA);return true;
}
export const PUBLIC_SOURCE_PATHS=Object.freeze([".github/workflows/sqlite-exported-abi-amd64.yml",".github/workflows/sqlite-gpg-tofu-amd64.yml",".node-version","infra/sqlite-gpg-tofu-runtime/README.md","infra/sqlite-gpg-tofu-runtime/command.sh","infra/sqlite-gpg-tofu-runtime/extract-provider.py","infra/sqlite-gpg-tofu-runtime/prepare-pair.py","infra/sqlite-runtime-consumers/inspect.py","scripts/build-postgres-gosu-backport.mjs","scripts/build-postgres-libxml2-backport.mjs","scripts/build-postgres-sqlite-backport.mjs","scripts/lib/inspect-sqlite-exported-package-abi.py","scripts/lib/sqlite-abi-artifact.mjs","scripts/lib/sqlite-gpg-tofu-evidence.mjs","scripts/local-container-runtime.mjs","scripts/qualify-postgres-backports-amd64.mjs","scripts/qualify-postgres-source-candidates-amd64.mjs","scripts/qualify-sqlite-exported-abi-amd64.mjs","scripts/qualify-sqlite-gpg-tofu-amd64.mjs","scripts/sqlite-exported-package-abi.mjs","scripts/sqlite-gpg-tofu-runtime.mjs","spec/ops/sqlite-gpg-tofu-public-layout.yaml","spec/ops/sqlite-gpg-tofu-runtime.yaml","tests/scripts/sqlite-exported-abi-artifact.test.mjs","tests/scripts/sqlite-exported-package-abi-parser.py","tests/scripts/sqlite-gpg-tofu-public-layout.test.mjs","tests/scripts/sqlite-gpg-tofu-public-layout.test.py","tests/scripts/sqlite-gpg-tofu-runtime.test.mjs"]);
export async function verifySourceClosure(root,authority,{requiredPaths=PUBLIC_SOURCE_PATHS}={}){
 assert.deepEqual(Object.keys(authority).sort(),['files','schema']);assert.equal(authority.schema,1);
 assert.ok(authority.files&&Object.getPrototypeOf(authority.files)===Object.prototype);assert.deepEqual(Object.keys(authority.files).sort(),[...requiredPaths].sort());const files=Object.entries(authority.files);assert.ok(files.length>0&&files.length<=100);
 for(const [name,pin]of files){assert.match(name,/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/u);assert.ok(!name.split('/').some(s=>s==='.'||s==='..'));assert.deepEqual(Object.keys(pin).sort(),['bytes','sha256']);assert.ok(Number.isSafeInteger(pin.bytes)&&pin.bytes>0&&pin.bytes<=1048576);assert.match(pin.sha256,SHA);const body=await regularBytes(join(root,name),1048576);assert.equal(body.length,pin.bytes);assert.equal(hash(body),pin.sha256);}
 return true;
}
const stages=new Set(['admission','public-source-admission','public-artifact-admission','qualified-original-package-pair','hash-bound-provider-extraction','immutable-fixture-container','fixed-fixture-assessment']);
for(const s of ['init','identity-before','version','agent-signer','agent-baseline','agent-candidate','generate','public','sign-a','sign-b','fingerprint','baseline-import','candidate-import','identity-after','close','export'])stages.add('fixture-'+s);
for(const p of ['baseline','candidate'])for(const c of ['a1','a2','b','tamper'])for(const a of ['verify','list'])stages.add(`fixture-${p}-${a}-${c}`);
function selectionProjection(s){
 if(s===null)return null;
 assert.match(s.source,COMMIT);assert.match(s.sha256,SHA);for(const k of ['runId','artifactId','bytes'])assert.ok(Number.isSafeInteger(s[k])&&s[k]>0);assert.ok(s.bytes<=4*1024**3);
 assert.equal(s.workflow,'.github/workflows/postgres-source-candidates-amd64.yml');assert.equal(s.attempt,1);assert.equal(s.completed,true);assert.equal(s.publicRepository,true);assert.equal(s.name,`source-candidate-amd64-sqlite-${s.source}-${s.runId}-1`);
 return {source:s.source,runId:s.runId,artifactId:s.artifactId,bytes:s.bytes,sha256:s.sha256,workflow:s.workflow,attempt:1};
}
export function projectRuntimeResult(result,summary={},selection=null){
 assert.equal(typeof result.passed,'boolean');assert.match(result.source,COMMIT);assert.match(result.operation,/^[a-f0-9-]{36}$/u);assert.match(result.runId,/^[1-9][0-9]{0,19}$/u);assert.equal(result.attempt,'1');
 assert.ok(Array.isArray(result.cleanupErrors)&&result.cleanupErrors.length<=100);assert.ok(Array.isArray(result.checks)&&result.checks.length<=500);assert.equal(typeof result.deadlineExceeded,'boolean');
 let failures=0;for(const row of result.checks){if(row.exit!==0)failures++;assert.ok(Number.isInteger(row.exit)&&row.exit>=0&&row.exit<=255||['unavailable','BOUNDED_COMMAND_TERMINATED','SIGTERM','SIGKILL'].includes(row.exit));}
 const artifactBinding=selectionProjection(selection);let consumer=null,pairBinding=null;
 if(Object.keys(summary).length){
  assert.equal(summary.consumerFixturePassed,true);assert.equal(summary.originalQualificationPassed,true);
  for(const k of ['rawKeyMaterialExported','genericAbiApproval','candidateReleaseQualified','riskAccepted','allRuntimeUsesDiscovered','runtimeCompatibilityQualified'])assert.equal(summary[k],false);
  assert.equal(summary.rawMachineEvidencePrivate,true);assert.match(summary.pairSource,COMMIT);assert.match(summary.pairRunId,/^[1-9][0-9]{0,19}$/u);
  for(const k of ['providerSha256','packageSha256','fixtureCodeSha256','fingerprintSha256'])assert.match(summary[k],SHA);
  assert.ok(Number.isInteger(summary.fixtureCommands)&&summary.fixtureCommands>0&&summary.fixtureCommands<=LIMITS.fixtureCommands);
  const receiptHashes={};for(const key of ['result','status','packageChecks','exportBinding']){assert.match(summary.receiptHashes[key],SHA);receiptHashes[key]=summary.receiptHashes[key];}
  for(const phase of ['baseline','candidate'])assert.deepEqual(summary.phases[phase],{signatureCounts:[1,1,2,2],validSignatures:3,tamperRejected:true,actualProcessProviderBindings:4,sqliteHeaderVerified:true});
  assert.ok(artifactBinding);assert.equal(summary.pairSource,artifactBinding.source);assert.equal(summary.pairRunId,String(artifactBinding.runId));
  pairBinding={source:summary.pairSource,runId:summary.pairRunId,originalQualificationPassed:true,receiptHashes,providerSha256:summary.providerSha256,packageSha256:summary.packageSha256,fixtureCodeSha256:summary.fixtureCodeSha256};
  consumer={signatureCountsPerPhase:[1,1,2,2],validSignaturesPerPhase:3,tamperRejectedEach:true,actualProcessProviderBindings:8,sqliteHeadersVerified:2,ownedAgentsClosed:3,fixtureCommands:summary.fixtureCommands,fingerprintSha256:summary.fingerprintSha256,base:BASE,immutableFiles:BASE_FILES};
 }
 for(const key of ['genericAbiApproval','candidateReleaseQualified','riskAccepted','runtimeIntegrationExecuted'])if(result.passed||result[key]!==undefined)assert.equal(result[key],false);
 if(result.passed){assert.equal(result.failure,false);assert.ok(consumer&&artifactBinding);assert.equal(result.cleanupErrors.length,0);assert.equal(result.deadlineExceeded,false);assert.equal(failures,0);assert.equal(result.nativeBuildCommandAttempted,false);}
 return {schema:1,source:result.source,operation:result.operation,runId:result.runId,attempt:1,consumerFixturePassed:result.passed&&consumer!==null,controllerPassed:result.passed,deadlineExceeded:result.deadlineExceeded,failureStage:result.failureStage===null?null:stages.has(result.failureStage)?result.failureStage:'unclassified-stage',checkCount:result.checks.length,failedCheckCount:failures,cleanupErrorCount:result.cleanupErrors.length,artifactBinding,pairBinding,consumer,runtimeContractScope:'immutable-postgres-amd64-gpg-2.2.40-local-tofu-only',rawFilesPublished:0,rawKeyMaterialExported:false,genericAbiApproval:false,runtimeCompatibilityQualified:false,candidateReleaseQualified:false,riskAccepted:false};
}
export class PublicSqliteGpgTofuRuntime extends SqliteGpgTofuRuntime{
 constructor(output,env=process.env){super(output,{},env);this.githubToken=env.GITHUB_TOKEN;delete env.GITHUB_TOKEN;}
 async initialize(){
  this.stage='public-source-admission';const event=JSON.parse(await readFile(this.env.GITHUB_EVENT_PATH,'utf8'));admitRuntimeRequest(this.env,event);
  await verifySourceClosure(ROOT,JSON.parse(await regularBytes(join(ROOT,'infra/sqlite-gpg-tofu-runtime/inputs.json'),65536)));
  await super.initialize();
 }
 async admitPair(){
  this.stage='public-artifact-admission';const event=JSON.parse(await readFile(this.env.GITHUB_EVENT_PATH,'utf8')),s=event.inputs;
  for(const k of ['artifact_run','artifact_id','artifact_bytes'])assert.match(s[k],/^[1-9][0-9]{0,15}$/u);
  const request={source:s.artifact_source,runId:Number(s.artifact_run),artifactId:Number(s.artifact_id),archiveBytes:Number(s.artifact_bytes),archiveSha256:s.artifact_sha256};
  const archive=join(this.private,'qualified-original.zip');let selected;
  try{selected=await retrieveArtifact(request,archive,{token:this.githubToken,deadlineMs:Math.min(performance.now()+180000,this.deadline-this.cleanupReserve-2000)});}finally{this.githubToken=undefined;}
  await save(join(this.evidence,'gpg-artifact-binding.json'),selected);
  this.stage='qualified-original-package-pair';
  const value=JSON.parse(await this.command('gpg-original-pair-prepare','python3',['-I','-B',join(ROOT,'infra/sqlite-gpg-tofu-runtime/prepare-pair.py'),join(ROOT,'scripts/lib/inspect-sqlite-exported-package-abi.py'),archive,request.archiveSha256,request.source,String(request.runId),join(this.private,'original-pair')],60000));
  assert.equal(value.originalQualificationPassed,true);assertSqliteChecksPassed(value.originalStatus);
  assert.equal(value.directory,join(this.private,'original-pair'));assert.equal(value.expected.source,request.source);assert.equal(value.expected.runId,String(request.runId));
  return admitQualifiedPair(value.directory,value.expected);
 }
}
export async function publishProjection(controller,result){
 const directory=join(controller.output,'publish');await mkdir(directory,{mode:0o700});let summary={},selected=null;
 if(typeof controller.evidence==='string')for(const [name,set]of [['gpg-tofu-summary.json',v=>summary=v],['gpg-artifact-binding.json',v=>selected=v]]){try{set(JSON.parse(await regularBytes(join(controller.evidence,name),1048576)));}catch(e){if(e.code!=='ENOENT')throw e;}}
 const safe=projectRuntimeResult({...controller.identity,operation:controller.operation,checks:controller.checks,cleanupErrors:controller.cleanupErrors,deadlineExceeded:performance.now()>controller.deadline,nativeBuildCommandAttempted:controller.nativeBuildCommandAttempted===true,failureStage:controller.stage,...result},summary,selected);
 const body=JSON.stringify(safe,null,2)+'\n';assert.ok(Buffer.byteLength(body)<=1048576);await writeFile(join(directory,'result.json'),body,{flag:'wx',mode:0o600});await save(join(directory,'hashes.json'),{files:1,result:{bytes:Buffer.byteLength(body),sha256:hash(body)},rawFilesPublished:0});return safe;
}
export async function main(argv=process.argv,env=process.env){
 assert.equal(argv.length,3);const controller=new PublicSqliteGpgTofuRuntime(resolve(argv[2]),env);let result;
 try{result=await controller.run();await publishProjection(controller,result);}finally{controller.githubToken=undefined;}
 process.stdout.write(JSON.stringify({passed:result.passed,consumerContractOnly:true,genericAbiApproval:false,candidateReleaseQualified:false})+'\n');return result.passed?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().then(code=>{process.exitCode=code;},()=>{process.stderr.write('GPG consumer contract held.\n');process.exitCode=1;});
