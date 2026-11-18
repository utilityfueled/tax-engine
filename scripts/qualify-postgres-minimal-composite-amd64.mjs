// Explicit same-source composite admission; original raw profile stays unchanged.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {lstat,mkdir,open,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {URL,fileURLToPath,pathToFileURL} from 'node:url';
import {MinimalDbCompatibilityController} from './qualify-postgres-minimal-db-amd64.mjs';
import {Controller} from './qualify-postgres-backports-amd64.mjs';
import {assertScanBinding,validateDatabaseListing} from './qualify-postgres-backports-amd64.mjs';
import {assertOwnedImage,labelRecipe} from './qualify-postgres-source-candidates-amd64.mjs';
import {buildArguments} from './qualify-postgres-minimal-runtime-amd64.mjs';
import {validateBase,validateContainer} from './sqlite-runtime-consumers.mjs';
import {admitCompositionInputs,RAW_IMAGE} from './lib/postgres-composite-inputs.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),LABEL='io.vivalatax.qualification.operation',sha=b=>createHash('sha256').update(b).digest('hex');
const save=(p,v)=>writeFile(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
export const PROFILE='libxml2-gosu-composite-v1';
export const POLICY_FILES=['infra/postgres-minimal-runtime/Dockerfile','infra/postgres-minimal-runtime/remove-runtime-packages.sh','infra/postgres-minimal-runtime/inspect.py','infra/sqlite-runtime-consumers/inspect.py','scripts/qualify-postgres-backports-amd64.mjs','scripts/qualify-postgres-source-candidates-amd64.mjs','scripts/qualify-postgres-minimal-runtime-amd64.mjs','scripts/qualify-postgres-minimal-db-amd64.mjs','scripts/qualify-postgres-composite-runtime-amd64.mjs','scripts/lib/postgres-composite-inputs.mjs','scripts/lib/postgres-minimal-db-fixtures.mjs','infra/postgres-minimal-composite/seal.py','infra/postgres-minimal-composite/inspect.py'];
async function hashFile(path,max=2*1024**3){
 const before=await lstat(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size>0&&before.size<=max);const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 const sig=x=>[x.dev,x.ino,x.nlink,x.size,x.mtimeMs,x.ctimeMs];
 try{assert.deepEqual(sig(await h.stat()),sig(before));const d=createHash('sha256');for await(const b of h.createReadStream({autoClose:false}))d.update(b);assert.deepEqual(sig(await h.stat()),sig(before));assert.deepEqual(sig(await lstat(path)),sig(before));return {sha256:d.digest('hex'),bytes:before.size};}finally{await h.close();}
}
async function json(path,max=24*1024**2){const p=await hashFile(path,max);const b=await readFile(path);assert.equal(sha(b),p.sha256);return JSON.parse(b);}
function nativeIdentity(v,image){assert.equal(v.Id,image);assert.equal(v.Os,'linux');assert.equal(v.Architecture,'amd64');assert.equal(v.RootFS.Type,'layers');assert.ok(v.RootFS.Layers.length>0&&v.RootFS.Layers.length<=128);for(const l of v.RootFS.Layers)assert.match(l,/^sha256:[a-f0-9]{64}$/);return {image:image.slice(7),layers:v.RootFS.Layers};}
export function validateCompositeConfig(base,candidate,operation){
 const strip=v=>{const x=globalThis.structuredClone(v);delete x.Image;delete x.Labels;return x;};assert.deepEqual(strip(base),strip(candidate));assert.deepEqual(base.Entrypoint,['docker-entrypoint.sh']);assert.deepEqual(base.Cmd,['postgres']);
 assert.equal(candidate.Labels[LABEL],operation);for(const [k,v] of Object.entries(base.Labels??{}))if(k!==LABEL)assert.equal(candidate.Labels[k],v);for(const k of Object.keys(candidate.Labels))assert.ok(k===LABEL||Object.hasOwn(base.Labels??{},k));
 assert.equal(candidate.Labels['io.vivalatax.candidate-release-qualified'],'false');assert.equal(candidate.Labels['io.vivalatax.risk-accepted'],'false');return true;
}
export function sealedBuildContext(dockerfile,script,statusSha){
 assert.match(statusSha,/^[a-f0-9]{64}$/);const line='expected_status=115f014bc7b114c49ee0321b01f9cd3b3f1bdd608cc97812010c9452970c4806';assert.equal(script.split(line).length,2);
 const marker='LABEL io.vivalatax.qualification';assert.equal(dockerfile.split(marker).length,2);
 return {dockerfile:dockerfile.slice(0,dockerfile.indexOf(marker)),script:script.replace(line,'expected_status='+statusSha)};
}
export class MinimalCompositeController extends MinimalDbCompatibilityController{
 constructor(output,packageInput,runtimeInput,env=process.env){super(output,env);this.packageInput=packageInput;this.input=runtimeInput;this.sourceCandidate='minimal-libxml2-gosu-composite-db';this.compositionComplete=false;}
 async verifyPolicy(){
  const policy=await json(join(ROOT,'infra/postgres-minimal-composite/policy.json'));assert.equal(policy.profile,PROFILE);assert.equal(policy.rawOfficialBaseOnly,false);assert.deepEqual(Object.keys(policy.files).sort(),[...POLICY_FILES].sort());
  for(const [name,pin] of Object.entries(policy.files))assert.equal((await hashFile(join(ROOT,name),2*1024**2)).sha256,pin);
  await save(join(this.evidence,'composition-source-binding.json'),{source:this.identity.source,profile:PROFILE,policy,rawOfficialBaseOnly:false});
 }
 async inputs(){return admitCompositionInputs(this.packageInput,this.input,this.identity);}
 async loadComposite(){return Controller.prototype.loadInput.call(this,'runtime');}
 async inventory(variant,image){
  assert.ok(['raw','composite','candidate'].includes(variant));const directory=join(this.evidence,variant),name=`tax-source-${this.operation}-${variant}-export`;await mkdir(directory,{mode:0o700});
  await this.docker(variant+'-export-create',['create','--name',name,'--label',LABEL+'='+this.operation,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','65534:65534','--mount','type=tmpfs,destination=/var/lib/postgresql/data','--entrypoint','/bin/true',image]);
  const inspect=async step=>{const [v]=JSON.parse(await this.docker(step,['inspect',name]));validateContainer(v,image,this.operation);return v;};const before=await inspect(variant+'-created-proof');const archive=join(directory,'rootfs.tar');await this.docker(variant+'-rootfs-export',['export','--output',archive,name],180);const after=await inspect(variant+'-never-started-proof'),pin=await hashFile(archive);
  const helper=join(ROOT,'infra/postgres-minimal-composite/inspect.py');await this.command(variant+'-inventory','python3',['-I','-B',helper,'inventory',archive,this.private,variant==='candidate'?'absent':variant,join(this.packageInput,'candidate-package.deb'),join(directory,'elf-inventory.json'),'strict'],120000);
  const report=await json(join(directory,'elf-inventory.json'));assert.equal(report.archiveSha256,pin.sha256);assert.equal(report.archiveBytes,pin.bytes);await save(join(directory,'immutable-export-binding.json'),{source:this.identity.source,profile:PROFILE,image,archive:pin,before,after,containerStarted:false,helperSha256:(await hashFile(helper)).sha256,runtimeCompatibilityQualified:false});return report;
 }
 async deriveSeal(inputs){
  const authority=join(this.private,'composition-authority.json');await save(authority,inputs.authority);const destination=join(this.evidence,'composition-seal.json');await this.command('derive-composite-seal','python3',['-I','-B',join(ROOT,'infra/postgres-minimal-composite/inspect.py'),'derive',join(this.evidence,'raw/elf-inventory.json'),join(this.evidence,'composite/elf-inventory.json'),join(this.packageInput,'candidate-package.deb'),join(this.input,'gosu'),authority,destination],120000);
  const derived=await json(destination);assert.deepEqual(derived.authority,inputs.authority);assert.equal(derived.derivedOnlyFromQualifiedInputs,true);assert.match(derived.statusSha256,/^[a-f0-9]{64}$/);return derived;
 }
 async pair(){
  const output=join(this.evidence,'paired-inventory.json');await this.command('composition-strict-pair','python3',['-I','-B',join(ROOT,'infra/postgres-minimal-composite/inspect.py'),'pair',join(this.evidence,'composite/elf-inventory.json'),join(this.evidence,'candidate/elf-inventory.json'),join(this.evidence,'composition-seal.json'),output],60000);return json(output);
 }
 async build(){
  assert.ok(this.deadline-performance.now()-this.cleanupReserve>40*60000,'Insufficient original stage/cleanup window');
  await this.verifyPolicy();this.stage='composition-inputs';const inputs=await this.inputs();const imported=await this.loadComposite();assert.equal(imported.image,inputs.runtime.image);const original=await this.inspect('composition-runtime-image','sha256:'+imported.image);this.compositeBaseline=original.Id;assert.ok(original.Size>0&&original.Size<=1024**3);
  const base=validateBase(await readFile(join(ROOT,'compose.yaml'),'utf8'),await json(join(ROOT,'infra/postgres-libxml2-backport/sources.json')));await this.docker('composition-raw-pull',['pull','--platform','linux/amd64',base],180);const raw=await this.inspect('composition-raw-image',base);assert.equal(raw.Id,'sha256:'+RAW_IMAGE);
  this.stage='composition-inventory';await this.inventory('raw',raw.Id);await this.inventory('composite',original.Id);const derived=await this.deriveSeal(inputs);
  const context=join(this.private,'composite-build-context');await mkdir(context,{mode:0o700});const source=join(ROOT,'infra/postgres-minimal-runtime');const generated=sealedBuildContext(await readFile(join(source,'Dockerfile'),'utf8'),await readFile(join(source,'remove-runtime-packages.sh'),'utf8'),derived.statusSha256);
  await save(join(context,'Dockerfile'),labelRecipe(generated.dockerfile,this.operation));await save(join(context,'remove-runtime-packages.sh'),generated.script);await save(join(context,'composition-seal.json'),derived);
  const iid=join(this.private,'composite-minimal.id');this.stage='composition-offline-purge';this.nativeBuildCommandAttempted=true;await this.docker('composition-offline-build',buildArguments(context,iid,original.Id,this.operation),600);
  const candidateId=(await readFile(iid,'utf8')).trim();assert.match(candidateId,/^sha256:[a-f0-9]{64}$/);const candidate=await this.inspect('composition-candidate-image',candidateId);assert.equal(candidate.Id,candidateId);assert.ok(candidate.Size>0&&candidate.Size<=1024**3);assertOwnedImage(candidate,this.operation,this.preexistingImages);validateCompositeConfig(original.Config,candidate.Config,this.operation);
  await this.inventory('candidate',candidate.Id);const pair=await this.pair();assert.equal(pair.pairedInventoryPassed,true);await this.setupScanners();await this.scanVariant('composite',original.Id);await this.scanVariant('candidate',candidate.Id);
  assert.ok(this.deadline-performance.now()-this.cleanupReserve>20*60000,'Insufficient original DB admission window');this.dbImages=new Set([original.Id,candidate.Id]);this.candidate=candidate.Id.slice(7);this.stage='db-admission';await this.enterDatabaseScope();this.matrix=[];
  for(const [variant,image] of [['baseline',original.Id],['candidate',candidate.Id]]){this.stage='db-init-'+variant;await this.initMatrix(variant,image);}
  this.stage='db-native-recovery';await this.nativeRecovery(original.Id.slice(7));const dump=await hashFile(join(this.private,'recovery.dump'),16*1024**2);this.databaseCompatibilityCompleted=true;this.compositionComplete=true;this.stage='db-completed';
  await save(join(this.evidence,'composite-db-compatibility.json'),{source:this.identity.source,profile:PROFILE,rawOfficialBaseOnly:false,packageImage:'sha256:'+inputs.package.image,baselineImage:original.Id,candidateImage:candidate.Id,qualifiedHandoffLineagePassed:true,derivedSealSha256:(await hashFile(join(this.evidence,'composition-seal.json'))).sha256,pairedInventory:pair,initMatrices:this.matrix,nativeDatabaseChecksVerbatim:true,precisionXmlByteaAssertionsPassed:true,persistenceRestartPassed:true,dumpRestorePassed:true,sameRunComponentBaselineRollbackPassed:true,dumpSha256:dump.sha256,dumpBytes:dump.bytes,fullServiceQualified:false,otherCveReadinessQualified:false,candidateReleaseQualified:false,riskAccepted:false});
 }
 async scanVariant(variant,image){
  assert.match(image,/^sha256:[a-f0-9]{64}$/);const expectedImage=image.slice(7);
  const {tools,syft,grype,env,listing}=this.scanners;validateDatabaseListing(listing);const directory=join(this.evidence,variant),archive=join(this.private,variant+'-image.tar');
  const nativeImageBefore=nativeIdentity(await this.inspect(variant+'-save-image-before',image),image);
  await this.docker(variant+'-immutable-save',['save','--output',archive,image],180);const pin=await hashFile(archive);
  // Use the inherited independent byte reader before either scanner. Catalog
  // identifiers are not a substitute for this config SHA/image identity check.
  const archiveIdentity=await this.archiveIdentity(archive,expectedImage);
  assert.equal(archiveIdentity.image,expectedImage);assert.deepEqual(archiveIdentity.layers,nativeImageBefore.layers);
  assert.deepEqual(await hashFile(archive),pin,'Archive changed during identity verification');
  const sbom=join(directory,'runtime-image.cdx.json');
  await this.command(variant+'-sbom',join(tools,'syft'),['--config',syft,'docker-archive:'+archive,'-o','cyclonedx-json='+sbom],120000,{env});
  const output=await this.command(variant+'-raw-scan',join(tools,'grype'),['--config',grype,'sbom:'+sbom,'-o','json'],120000,{env});await save(join(directory,'runtime-scan.json'),output);
  const cdx=await json(sbom),scan=JSON.parse(output);assert.deepEqual(await hashFile(archive),pin);
  const nativeImageAfter=nativeIdentity(await this.inspect(variant+'-save-image-after',image),image);assert.deepEqual(nativeImageAfter,nativeImageBefore);
  const binding={source:this.identity.source,image:expectedImage,archiveSha256:pin.sha256,archiveBytes:pin.bytes,archiveIdentity,nativeImageBefore,nativeImageAfter,archiveUnchangedBeforeAndAfterScan:true,manifestDigest:cdx.metadata.component.version,imageId:cdx.metadata.component['bom-ref']};
  const result=assertScanBinding(cdx,scan,binding,archive);
  await save(join(directory,'scan-binding.json'),{...binding,...result,sbomSha256:(await hashFile(sbom)).sha256,rawScanSha256:sha(output),database:listing,profile:PROFILE,rawOfficialBaseOnly:false,sqlitePatched:false,otherCveReadinessQualified:false});
 }
 async cleanup(){
  await super.cleanup();if(this.unconfirmedChild){this.cleanupErrors.push('unconfirmed-owned-child');this.cleanupVerified=false;return;}if(this.cleanupErrors.length)return;
  if(this.imported){this.volumes=[];await Controller.prototype.cleanup.call(this);this.cleanupVerified=!this.cleanupErrors.length&&!this.unconfirmedChild;}
 }
 async run(){
  let failed=true;try{await this.initialize();await this.build();await this.command('composition-source-unchanged','git',['-C',ROOT,'diff','--exit-code','HEAD','--']);failed=false;}catch{/* Keep raw auth and diagnostics private. */}
  finally{if(await lstat(this.private).catch(()=>null)){try{await this.cleanup();}catch{this.cleanupErrors.push('owned-cleanup-unverified');}}}
  const allowed=['admission','composition-inputs','composition-inventory','composition-offline-purge','db-admission','db-init-baseline','db-init-candidate','db-native-recovery','db-completed'];
  const result={source:/^[a-f0-9]{40}$/.test(this.identity.source??'')?this.identity.source:null,runId:/^\d+$/.test(this.identity.runId??'')?this.identity.runId:null,attempt:/^\d+$/.test(this.identity.attempt??'')?this.identity.attempt:null,operation:this.operation,profile:PROFILE,sourceCandidate:'minimal-libxml2-gosu-composite-db',failure:failed,failureStage:failed?(allowed.includes(this.stage)?this.stage:'admission'):null,commandCounts:{total:this.checks.length,zero:this.checks.filter(x=>x.exit===0).length,nonzero:this.checks.filter(x=>Number.isInteger(x.exit)&&x.exit!==0).length,unavailable:this.checks.filter(x=>!Number.isInteger(x.exit)).length},cleanupErrorCount:this.cleanupErrors.length,cleanupVerified:this.cleanupVerified===true,unconfirmedChild:this.unconfirmedChild===true,deadlineExceeded:performance.now()>this.deadline,compositionComplete:this.compositionComplete===true,databaseCompatibilityCompleted:this.databaseCompatibilityCompleted===true,rawOfficialBaseOnly:false,fullServiceQualified:false,otherCveReadinessQualified:false,genericAbiApproval:false,candidateReleaseQualified:false,riskAccepted:false};
  result.passed=!failed&&result.compositionComplete&&result.databaseCompatibilityCompleted&&result.cleanupVerified&&!result.cleanupErrorCount&&!result.unconfirmedChild&&!result.deadlineExceeded;if(this.evidence)await save(join(this.evidence,'result.json'),result);return result;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{assert.equal(process.argv.length,5);const r=await new MinimalCompositeController(resolve(process.argv[2]),resolve(process.argv[3]),resolve(process.argv[4])).run();console.log(JSON.stringify({passed:r.passed,fullServiceQualified:false,candidateReleaseQualified:false}));if(!r.passed)process.exitCode=1;}catch{console.error('Composite qualification held; private diagnostics retained.');process.exitCode=1;}}
