// Opt-in raw-base build/inventory experiment. No database startup or release claim.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {copyFile,lstat,mkdir,open,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {URL,fileURLToPath,pathToFileURL} from 'node:url';
import {SourceCandidateController,assertOwnedImage,labelRecipe} from './qualify-postgres-source-candidates-amd64.mjs';
import {assertScanBinding,validateDatabaseListing} from './qualify-postgres-backports-amd64.mjs';
import {validateBase,validateContainer,PLATFORM} from './sqlite-runtime-consumers.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)), LABEL='io.vivalatax.qualification.operation';
const BASE_CONFIG='sha256:68beac29d3dda63428173674fa868d5544913658694cd4b09f6f15230a0ba1bb';
export const LIMITS={jobMinutes:60,controllerMinutes:55,cleanupMinutes:10,buildMinutes:10,initialDiskGiB:20,reserveDiskGiB:2};
const SCANNERS=[
 {name:'syft',version:'1.57.1',url:'https://github.com/anchore/syft/releases/download/v1.57.1/syft_1.57.1_linux_amd64.tar.gz',sha256:'bf52519eb57f675d47c07d43213cb6dff6449f3d6d1147ff6701ed91f44eef0c'},
 {name:'grype',version:'0.121.3',url:'https://github.com/anchore/grype/releases/download/v0.121.3/grype_0.121.3_linux_amd64.tar.gz',sha256:'e9da18cc1429e786722e32161288103600efffd8e483c90761f90485bd1bec85'}
];
const sha=v=>createHash('sha256').update(v).digest('hex');
const save=(p,v)=>writeFile(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
async function hashFile(path,max=2*1024**3){
 const before=await lstat(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size>0&&before.size<=max);
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try {const current=await handle.stat();assert.equal(current.ino,before.ino);assert.equal(current.dev,before.dev);const digest=createHash('sha256');for await(const chunk of handle.createReadStream({autoClose:false}))digest.update(chunk);return {sha256:digest.digest('hex'),bytes:before.size};}finally{await handle.close();}
}
async function json(path,max=16*1024**2){await hashFile(path,max);return JSON.parse(await readFile(path,'utf8'));}
export function validateImageConfig(base,candidate,operation){
 const strip=v=>{const copy=globalThis.structuredClone(v);delete copy.Image;delete copy.Labels;return copy;};
 assert.deepEqual(strip(candidate),strip(base),'Original runtime Config changed');
 assert.deepEqual(base.Entrypoint,['docker-entrypoint.sh']);assert.deepEqual(base.Cmd,['postgres']);
 assert.equal(candidate.Labels?.[LABEL],operation);
 for(const [key,value] of Object.entries(base.Labels??{}))assert.equal(candidate.Labels[key],value);
 for(const key of Object.keys(candidate.Labels??{}))assert.ok(Object.hasOwn(base.Labels??{},key)||[LABEL,'io.vivalatax.qualification','io.vivalatax.candidate-release-qualified','io.vivalatax.risk-accepted'].includes(key));
 return true;
}
export function buildArguments(context,iid,base,operation){return ['build','--rm=true','--force-rm=false','--network=none','--pull=false','--platform','linux/amd64','--build-arg','BASE='+base,'--iidfile',iid,'--tag',`tax-source-${operation}:package`,context];}
function nativeIdentity(value,image){
 assert.equal(value.Id,image);assert.equal(value.Os,'linux');assert.equal(value.Architecture,'amd64');assert.equal(value.RootFS.Type,'layers');
 assert.ok(Array.isArray(value.RootFS.Layers)&&value.RootFS.Layers.length>0&&value.RootFS.Layers.length<=128);
 for(const layer of value.RootFS.Layers)assert.match(layer,/^sha256:[a-f0-9]{64}$/);
 return {image:image.slice(7),layers:value.RootFS.Layers};
}
export class MinimalRuntimeController extends SourceCandidateController{
 constructor(output,env=process.env){super('sqlite',output,env);this.sourceCandidate='minimal-postgres-runtime-raw-base';this.BASE_CONFIG=BASE_CONFIG;this.limit={...this.limit,minutes:LIMITS.jobMinutes,controllerMinutes:LIMITS.controllerMinutes,cleanupMinutes:LIMITS.cleanupMinutes};this.deadline=performance.now()+LIMITS.controllerMinutes*60000;this.cleanupReserve=LIMITS.cleanupMinutes*60000;}
 async prepare(){
  const recipe=join(ROOT,'infra/postgres-minimal-runtime'),policy=await json(join(recipe,'policy.json'));
  assert.equal(policy.rawOfficialBaseOnly,true);assert.equal(policy.baseConfig,BASE_CONFIG);assert.equal(policy.platformManifest,PLATFORM);
  assert.deepEqual(Object.keys(policy.files).sort(),['infra/postgres-minimal-runtime/Dockerfile','infra/postgres-minimal-runtime/inspect.py','infra/postgres-minimal-runtime/remove-runtime-packages.sh','infra/sqlite-runtime-consumers/inspect.py']);
  for(const [name,pin] of Object.entries(policy.files)){const file=join(ROOT,name);assert.equal((await hashFile(file,1024**2)).sha256,pin);}
  const compose=await readFile(join(ROOT,'compose.yaml'),'utf8'),manifest=await json(join(ROOT,'infra/postgres-libxml2-backport/sources.json'));
  const base=validateBase(compose,manifest);const context=join(this.private,'minimal-build-context');await mkdir(context,{mode:0o700});
  await save(join(context,'Dockerfile'),labelRecipe(await readFile(join(recipe,'Dockerfile'),'utf8'),this.operation));
  await copyFile(join(recipe,'remove-runtime-packages.sh'),join(context,'remove-runtime-packages.sh'),constants.COPYFILE_EXCL);
  await save(join(this.evidence,'source-policy-binding.json'),{source:this.identity.source,policy,composeSha256:sha(compose),baseManifestSha256:sha(await readFile(join(ROOT,'infra/postgres-libxml2-backport/sources.json'))),rawOfficialBaseOnly:true,composedLibxmlGosuRuntimeQualified:false});
  return {base,context,policy};
 }
 async build(){
  assert.ok(this.deadline-performance.now()-this.cleanupReserve>40*60000,'Insufficient initial stage/cleanup window');
  this.stage='minimal-source-pins';const {base,context}=await this.prepare();
  this.stage='minimal-immutable-base';await this.docker('minimal-base-pull',['pull','--platform','linux/amd64',base],180);
  const original=await this.inspect('minimal-base-image',base);assert.equal(original.Id,BASE_CONFIG);assert.ok(original.Size>0&&original.Size<=1024**3);
  assert.ok(original.RepoDigests.some(value=>value.endsWith('@'+PLATFORM)),'Immutable platform reference absent');
  assert.deepEqual(original.Config.Entrypoint,['docker-entrypoint.sh']);assert.deepEqual(original.Config.Cmd,['postgres']);
  this.stage='minimal-offline-purge-build';const iid=join(this.private,'candidate.id');this.nativeBuildCommandAttempted=true;
  await this.docker('minimal-image-build',buildArguments(context,iid,base,this.operation),LIMITS.buildMinutes*60);
  const candidateId=(await readFile(iid,'utf8')).trim();assert.match(candidateId,/^sha256:[a-f0-9]{64}$/);
  const candidate=await this.inspect('minimal-candidate-image',candidateId);assert.equal(candidate.Id,candidateId);assertOwnedImage(candidate,this.operation,this.preexistingImages);assert.ok(candidate.Size>0&&candidate.Size<=1024**3);
  validateImageConfig(original.Config,candidate.Config,this.operation);
  this.stage='minimal-paired-rootfs';await this.inventory('baseline',original.Id);await this.inventory('candidate',candidate.Id);
  const pair=await this.pair();assert.equal(pair.pairedInventoryPassed,true);
  this.stage='minimal-fresh-advisories';await this.setupScanners();await this.scanVariant('baseline',original.Id);await this.scanVariant('candidate',candidate.Id);
  await save(join(this.evidence,'minimal-stage.json'),{source:this.identity.source,baselineImage:original.Id,candidateImage:candidate.Id,rawOfficialBaseOnly:true,originalConfigVerified:true,pairedInventory:pair,databaseStarted:false,runtimeIntegrationExecuted:false,genericAbiApproval:false,sqlitePatched:false,otherCveReadinessQualified:false,candidateReleaseQualified:false,riskAccepted:false,remainingGates:['DB/init/recovery/Compose override','retained-runtime vulnerability gates','fresh composition pins for libxml2/gosu','custom hooks and indirect loading','lower OCI layer bytes']});
 }
 async inventory(variant,image){
  const name=`tax-source-${this.operation}-${variant}-export`,directory=join(this.evidence,variant);await mkdir(directory,{mode:0o700});
  await this.docker(variant+'-export-create',['create','--name',name,'--label',LABEL+'='+this.operation,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','65534:65534','--mount','type=tmpfs,destination=/var/lib/postgresql/data','--entrypoint','/bin/true',image]);
  const inspect=async step=>{const [v]=JSON.parse(await this.docker(step,['inspect',name]));validateContainer(v,image,this.operation);return v;};
  const before=await inspect(variant+'-created-proof');const archive=join(directory,'rootfs.tar');await this.docker(variant+'-rootfs-export',['export','--output',archive,name],180);const after=await inspect(variant+'-never-started-proof');
  const pin=await hashFile(archive);const helper=join(ROOT,'infra/postgres-minimal-runtime/inspect.py');
  await this.command(variant+'-strict-elf-inventory','python3',['-I','-B',helper,archive,this.private,variant==='baseline'?'baseline':'absent',join(directory,'elf-inventory.json')],120000);
  const report=await json(join(directory,'elf-inventory.json'));assert.equal(report.archiveSha256,pin.sha256);assert.equal(report.archiveBytes,pin.bytes);
  await save(join(directory,'immutable-export-binding.json'),{source:this.identity.source,image,archive:pin,before,after,containerStarted:false,helperSha256:(await hashFile(helper,1024**2)).sha256,allRuntimeUsesDiscovered:false,runtimeCompatibilityQualified:false});return report;
 }
 async pair(){
  const output=join(this.evidence,'paired-inventory.json');await this.command('minimal-strict-pair','python3',['-I','-B',join(ROOT,'infra/postgres-minimal-runtime/inspect.py'),'--pair',join(this.evidence,'baseline/elf-inventory.json'),join(this.evidence,'candidate/elf-inventory.json'),output],60000);return json(output);
 }
 async setupScanners(){
  const tools=join(this.private,'scanner-tools');await mkdir(tools,{mode:0o700});
  for(const pin of SCANNERS){const file=join(tools,pin.name+'.tar.gz');await this.download(pin.url,file,pin);await this.command(pin.name+'-extract','tar',['--extract','--gzip','--file',file,'--directory',tools,pin.name]);}
  const listingPath=join(this.evidence,'database-listing.json');await this.download('https://grype.anchore.io/databases/v6/latest.json',listingPath,undefined,8192);const listing=validateDatabaseListing(await json(listingPath,8192));
  const db=join(tools,'db.tar.zst');await this.download('https://grype.anchore.io/databases/v6/'+listing.path,db,{sha256:listing.checksum.slice(7)},512*1024**2);
  const empty=join(this.private,'scanner-config');await mkdir(empty,{mode:0o700});const syft=join(empty,'syft.yaml'),grype=join(empty,'grype.yaml');await save(syft,'{}\n');await save(grype,'ignore: []\nmatch-upstream-kernel-headers: true\ninclude-matcher-suppressions: true\n');
  const env={...this.commandEnv,XDG_CONFIG_HOME:empty,SYFT_CHECK_FOR_APP_UPDATE:'false',GRYPE_CHECK_FOR_APP_UPDATE:'false',GRYPE_DB_AUTO_UPDATE:'false',GRYPE_DB_VALIDATE_AGE:'true',GRYPE_DB_MAX_ALLOWED_BUILT_AGE:'120h',GRYPE_DB_CACHE_DIR:join(tools,'db')};
  await this.command('minimal-db-import',join(tools,'grype'),['--config',grype,'db','import',db],60000,{env});const status=JSON.parse(await this.command('minimal-db-status',join(tools,'grype'),['--config',grype,'db','status','-o','json'],30000,{env}));assert.equal(status.valid,true);assert.equal(status.built,listing.built);assert.equal(status.schemaVersion,listing.schemaVersion);
  this.scanners={tools,syft,grype,env,listing};await save(join(this.evidence,'scanner-config-binding.json'),{source:this.identity.source,tools:SCANNERS,database:listing,status,syftConfigSha256:(await hashFile(syft)).sha256,grypeConfigSha256:(await hashFile(grype)).sha256,ignoreRules:[]});
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
  await save(join(directory,'scan-binding.json'),{...binding,...result,sbomSha256:(await hashFile(sbom)).sha256,rawScanSha256:sha(output),database:listing,rawOfficialBaseOnly:true,sqlitePatched:false,otherCveReadinessQualified:false});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert.equal(process.argv.length,3);const result=await new MinimalRuntimeController(resolve(process.argv[2])).run();console.log(JSON.stringify({passed:result.passed,buildAndInventoryOnly:true,candidateReleaseQualified:false,riskAccepted:false}));if(!result.passed)process.exitCode=1;}
