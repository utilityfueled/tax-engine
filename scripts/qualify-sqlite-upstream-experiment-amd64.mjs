// Nonqualifying experiment: preserve baseline; separately test declared upstream source/oracle hunks.
import assert from'node:assert/strict';import{readFile,writeFile,mkdir,chmod}from'node:fs/promises';
import{join,resolve}from'node:path';import{URL,fileURLToPath,pathToFileURL}from'node:url';import{createHash}from'node:crypto';import{performance}from'node:perf_hooks';
const REPO=process.cwd(),DATA=fileURLToPath(new URL('../infra/sqlite-upstream-experiment/',import.meta.url));
const{SourceCandidateController,assertOwnedImage,labelRecipe,publishArtifacts}=await import(pathToFileURL(join(REPO,'scripts/qualify-postgres-source-candidates-amd64.mjs')).href);
const{prepareBuildContext}=await import(pathToFileURL(join(REPO,'scripts/build-postgres-sqlite-backport.mjs')).href);
const sha=x=>createHash('sha256').update(x).digest('hex'),LABEL='io.vivalatax.qualification.operation';
const save=(p,d)=>writeFile(p,JSON.stringify(d,null,2)+'\n',{flag:'wx',mode:0o600});
// Only this committed, nonsecret observer is read by the nonroot test user.
// COPY preserves its mode; explicitly set read bits despite a private host umask.
export async function stageDiagnosticInputs(context) {
 const pins={};
 for(const n of ['run.sh','project.py','core-link.c','oom-observe.tcl','changes.json','apply-experiment.py']) {
  const b=await readFile(join(DATA,n));pins[n]={bytes:b.length,sha256:sha(b)};
  const target=join(context,n);await writeFile(target,b,{flag:'wx',mode:0o600});
  if(n==='oom-observe.tcl')await chmod(target,0o444);
 }
 return pins;
}
export const LIMITS={jobMinutes:30,controllerMinutes:27,cleanupMinutes:3,initialDiskGiB:20,reserveDiskGiB:2};
export function validateInventory(a,b){assert.ok(a.length>0);assert.equal(b,a,'Original toolchain inventory drift holds.');return true;}
export function validateLinkedCore(d,variant){assert.ok(['baseline','dbpage'].includes(variant));assert.equal(d.variant,variant);assert.equal(d.version,'3.40.1');assert.match(d.path,new RegExp('^/qualification-work/'+variant+'/\\.libs/libsqlite3\\.so\\.0(?:\\.8\\.6)?$'));assert.equal(typeof d.dbpage,'boolean');assert.ok(Array.isArray(d.options)&&d.options.every(v=>typeof v==='string'&&(v.startsWith('COMPILER=')?v==='COMPILER=gcc-12.2.0':v.startsWith('MAX_MMAP_SIZE=')?v==='MAX_MMAP_SIZE=0x7fff0000':/^[A-Z0-9_=.,()+-]+$/.test(v))));assert.match(d.sourceId,/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d [a-f0-9]{60}(?:[a-f0-9]{4}|alt[0-9])$/);if(d.cliLoaderSelectedLocalLibrary!==undefined)assert.equal(d.cliLoaderSelectedLocalLibrary,true);return true;}
export function validateOomMetadata(d){assert.deepEqual(Object.keys(d).sort(),['case','oracleChanged','sqlChanged','statementCount','statements']);assert.equal(d.case,'recoverfault2-2-oom-transient.2330');assert.equal(d.sqlChanged,false);assert.equal(d.oracleChanged,false);assert.ok(Number.isInteger(d.statementCount)&&d.statementCount>0&&d.statementCount<=256);assert.ok(Array.isArray(d.statements)&&d.statements.length===d.statementCount);for(const v of d.statements){assert.deepEqual(Object.keys(v).sort(),['characters','class','hasNullToken','startsNullToken']);assert.ok(['OTHER','BEGIN','COMMIT','PRAGMA','CREATE','INSERT','SELECT','NULL'].includes(v.class));assert.ok(Number.isInteger(v.characters)&&v.characters>=0&&v.characters<=1000000);assert.equal(typeof v.hasNullToken,'boolean');assert.equal(typeof v.startsNullToken,'boolean');}return true;}
export function validateDiagnosticStatus(v){
 const fields=['diagnosticScriptExit','baselinePackageExit','baselineFixtureBuildExit','baselineCoreExit','baselineCliExit'];for(const n of fields)assert.equal(v[n],0,n);
 for(const n of ['join8Exit','originalOomExit','instrumentedOomExit','baselineRecoverExit'])assert.ok(Number.isInteger(v[n])&&v[n]>=0&&v[n]<=125,n);
 assert.equal(v.originalSourcesUnchanged,true);assert.equal(v.diagnosticMeasurementCompleted,true);
 assert.equal(v.fullOriginalSuitesExecuted,false);assert.equal(v.candidateReleaseQualified,false);assert.equal(v.riskAccepted,false);assert.equal(typeof v.pairedDbpageAttempted,'boolean');
 if(v.pairedDbpageAttempted){assert.equal(v.flagDeltaVerified,true);for(const n of ['dbpagePackageExit','dbpageCoreExit','dbpageCliExit'])assert.equal(v[n],0,n);assert.ok(Number.isInteger(v.dbpageRecoverExit)&&v.dbpageRecoverExit>=0&&v.dbpageRecoverExit<=125);}else assert.equal(v.flagDeltaVerified,false);return true;
}
export class SqliteDiagnosticController extends SourceCandidateController{
 constructor(output,env=process.env){super('sqlite',output,env);this.sourceCandidate='sqlite-upstream-experiment';this.limit={minutes:30,controllerMinutes:27,cleanupMinutes:3};this.deadline=performance.now()+27*60_000;this.cleanupReserve=3*60_000;}
 async initialize(){await super.initialize();const d=JSON.parse(await this.docker('diagnostic-engine',['info','--format','{{json .}}']));assert.equal(d.ServerVersion,'28.0.4');assert.equal(d.OSType,'linux');assert.ok(['x86_64','amd64'].includes(d.Architecture));}
 async build(){
  const{recipe}=await this.sources();this.stage='diagnostic-toolchain';
  const base='docker.io/library/postgres@sha256:f45d631d050c2fe068f384ed6c4faac506e9cd7f4da605ce703648e4b0985848';
  await this.docker('diagnostic-base-pull',['pull','--platform','linux/amd64',base],180);await this.inspect('diagnostic-base-native',base);
  const tc=join(this.private,'diagnostic-toolchain');await mkdir(tc,{mode:0o700});
  await writeFile(join(tc,'Dockerfile'),labelRecipe(await readFile(join(recipe,'Dockerfile.toolchain'),'utf8'),this.operation),{flag:'wx',mode:0o600});
  const iid=join(this.private,'diagnostic-toolchain.id');this.nativeBuildCommandAttempted=true;
  await this.docker('diagnostic-toolchain-build',['build','--rm=true','--force-rm=false','--platform','linux/amd64','--build-arg','BASE='+base,'--build-arg','EXPECTED_ARCH=amd64','--iidfile',iid,'--tag',`tax-source-${this.operation}:toolchain`,tc],8*60);
  const toolchain=(await readFile(iid,'utf8')).trim();assertOwnedImage(await this.inspect('diagnostic-toolchain-native',toolchain),this.operation,this.preexistingImages);
  const inventoryName=`tax-source-${this.operation}-inventory`;await this.docker('diagnostic-inventory-create',['create','--name',inventoryName,'--label',`${LABEL}=${this.operation}`,'--network','none','--read-only','--mount','type=tmpfs,destination=/var/lib/postgresql/data','--entrypoint','/bin/true',toolchain]);
  const inv=join(this.private,'inventory.tsv');await this.docker('diagnostic-inventory-copy',['cp',inventoryName+':/qualification-toolchain/packages.tsv',inv]);validateInventory(await readFile(join(DATA,'expected-packages.tsv'),'utf8'),await readFile(inv,'utf8'));
  this.stage='diagnostic-context';const prepared=join(this.private,'diagnostic-prepared');
  const plan=await prepareBuildContext({architecture:'amd64',sourceCache:this.cache,output:prepared,toolchain},{run:(exe,args,o)=>this.command('diagnostic-verifier-'+this.checks.length,exe,args,o.timeoutMs).then(stdout=>({stdout}))});
  const context=join(prepared,'context');const pins=await stageDiagnosticInputs(context);
  const dockerfile=labelRecipe('ARG TOOLCHAIN\nFROM ${TOOLCHAIN}\nUSER root\nARG EXPECTED_ARCH\nENV EXPECTED_ARCH=${EXPECTED_ARCH}\nCOPY inputs /qualification-inputs\nCOPY run.sh project.py core-link.c oom-observe.tcl changes.json apply-experiment.py /qualification-diagnostics/\nRUN /bin/bash /qualification-diagnostics/run.sh\n',this.operation);
  await writeFile(join(context,'Dockerfile.diagnostic'),dockerfile,{flag:'wx',mode:0o600});
  await save(join(this.evidence,'diagnostic-source-binding.json'),{source:this.identity.source,base,toolchain,plan,inputPins:pins,expectedInventorySha256:sha(await readFile(join(DATA,'expected-packages.tsv'))),contextDockerfileSha256:sha(dockerfile),originalTestsReferenceOnlyUntilActual:true,packageQualificationClaim:false});
  await save(join(this.evidence,'diagnostic-source-plan.json'),{...plan,diagnosticInputPins:pins,source:this.identity.source,toolchain,toolchainInventoryExactlyMatchesPrior:true,originalRecipeNotExecuted:true,originalSourcesAuthenticated:true,originalTestsUnchanged:true,upstreamTestSourceChangesDeclared:true,fullOriginalSuitesExecuted:false,candidateReleaseQualified:false,riskAccepted:false});
  this.stage='diagnostic-measurement';const outid=join(this.private,'diagnostic.id');
  await this.docker('diagnostic-build',['build','--rm=true','--force-rm=false','--network=none','--platform','linux/amd64','--build-arg','TOOLCHAIN='+toolchain,'--build-arg','EXPECTED_ARCH=amd64','--iidfile',outid,'--tag',`tax-source-${this.operation}:package`,'--file',join(context,'Dockerfile.diagnostic'),context],14*60);
  const image=(await readFile(outid,'utf8')).trim();assertOwnedImage(await this.inspect('diagnostic-image-native',image),this.operation,this.preexistingImages);
  this.stage='diagnostic-export';const name=`tax-source-${this.operation}-export`;
  await this.docker('diagnostic-export-create',['create','--name',name,'--label',`${LABEL}=${this.operation}`,'--network','none','--read-only','--mount','type=tmpfs,destination=/var/lib/postgresql/data','--entrypoint','/bin/true',image]);
  const[container]=JSON.parse(await this.docker('diagnostic-export-identity',['inspect',name]));assert.equal(container.Image,image);assert.equal(container.Config.Labels[LABEL],this.operation);assert.equal(container.State.Running,false);
  const raw=join(this.private,'diagnostic-artifacts');await this.docker('diagnostic-export',['cp',name+':/qualification-out',raw],120);await publishArtifacts(raw,join(this.evidence,'artifacts'));
  const status=JSON.parse(await readFile(join(raw,'status.json'),'utf8'));await save(join(this.evidence,'actual-status.json'),status);validateDiagnosticStatus(status);for(const n of ['upstreamPackageExit','upstreamFixtureBuildExit','upstreamJoin8Exit','upstreamOomExit'])assert.equal(status[n],0,n);for(const n of ['upstreamBuildFlagsUnchanged','upstreamOomTestBytesUnchanged','upstreamSelectedSourceHunksOnly'])assert.equal(status[n],true,n);assert.equal(status.historicalOom2330CauseConfirmed,false);
  const oom=JSON.parse(await readFile(join(raw,'oom-2330-metadata.json'),'utf8'));validateOomMetadata(oom);
  const cores={};for(const v of(status.pairedDbpageAttempted?['baseline','dbpage']:['baseline'])){cores[v]=JSON.parse(await readFile(join(raw,v+'-core.json'),'utf8'));validateLinkedCore(cores[v],v);assert.equal(cores[v].cliLoaderSelectedLocalLibrary,true);}
  assert.equal(status.pairedDbpageAttempted,!cores.baseline.dbpage);if(cores.dbpage)assert.equal(cores.dbpage.dbpage,true);
  await save(join(this.evidence,'measurement-summary.json'),{diagnosticMeasurementCompleted:true,status,cores,originalTestsPassed:status.join8Exit===0&&status.originalOomExit===0,upstreamPairedTestsPassed:true,upstreamFlagDependentOracleUsed:true,originalFullSuitesStillRequired:true,fullOriginalSuitesExecuted:false,candidateReleaseQualified:false,riskAccepted:false});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert.equal(process.argv.length,3);const r=await new SqliteDiagnosticController(resolve(process.argv[2])).run();console.log(JSON.stringify({passed:r.passed,diagnosticOnly:true,candidateReleaseQualified:false,riskAccepted:false}));if(!r.passed)process.exitCode=1;}
