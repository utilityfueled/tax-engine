import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL,URL} from 'node:url';
import {SourceCandidateController,SOURCE_LIMITS} from './qualify-postgres-source-candidates-amd64.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const LABEL='io.vivalatax.qualification.operation';
export const INDEX='sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca';
export const PLATFORM='sha256:f45d631d050c2fe068f384ed6c4faac506e9cd7f4da605ce703648e4b0985848';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=(file,value)=>writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
export function validateBase(compose,manifest){
 const references=[...compose.matchAll(/image:\s*(postgres:[^\s]+)/gu)].map(r=>r[1]);
 assert.deepEqual(references,['postgres:16.16-bookworm@'+INDEX]);
 assert.equal(manifest.postgres.repository,'docker.io/library/postgres:16.16-bookworm');
 assert.equal(manifest.postgres.index,INDEX);assert.equal(manifest.postgres.platforms.amd64.digest,PLATFORM);
 return 'docker.io/library/postgres@'+PLATFORM;
}
export function validateContainer(v,image,operation){
 assert.equal(v.Image,image);assert.equal(v.Config.Labels[LABEL],operation);
 assert.equal(v.State.Status,'created');assert.equal(v.State.Running,false);assert.equal(v.State.ExitCode,0);assert.equal(v.State.OOMKilled,false);assert.equal(v.State.Error,'');
 assert.equal(v.HostConfig.NetworkMode,'none');assert.equal(v.HostConfig.ReadonlyRootfs,true);assert.equal(v.HostConfig.Privileged,false);assert.equal(v.HostConfig.CapAdd,null);assert.deepEqual(v.HostConfig.CapDrop,['ALL']);assert.deepEqual(v.HostConfig.SecurityOpt,['no-new-privileges']);
 assert.equal(v.Mounts.length,1);assert.equal(v.Mounts[0].Type,'tmpfs');assert.equal(v.Mounts[0].Destination,'/var/lib/postgresql/data');return true;
}
export class SqliteConsumerDiscovery extends SourceCandidateController{
 constructor(output,env=process.env){super('sqlite',output,env);this.sourceCandidate='sqlite-direct-elf-discovery';this.limit={...SOURCE_LIMITS,jobMinutes:15,controllerMinutes:12,cleanupMinutes:3};this.deadline=performance.now()+12*60000;this.cleanupReserve=3*60000;}
 async build(){
  this.stage='immutable-base';
  const compose=await readFile(join(ROOT,'compose.yaml'));
  const manifestBytes=await readFile(join(ROOT,'infra/postgres-libxml2-backport/sources.json'));
  const base=validateBase(compose.toString('utf8'),JSON.parse(manifestBytes));
  await this.docker('discovery-base-pull',['pull','--platform','linux/amd64',base],180);
  const image=await this.inspect('discovery-base-native',base);
  assert.match(image.Id,/^sha256:[a-f0-9]{64}$/u);
  assert.ok(Number.isSafeInteger(image.Size)&&image.Size>0&&image.Size<=1024**3,'Immutable base exceeds the declared export bound.');
  assert.ok(image.RepoDigests.some(value=>value.endsWith('@'+PLATFORM)),'Missing immutable platform reference.');
  const name='tax-source-'+this.operation+'-elf-export';
  await this.docker('discovery-created',['create','--name',name,'--label',LABEL+'='+this.operation,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','65534:65534','--mount','type=tmpfs,destination=/var/lib/postgresql/data','--entrypoint','/bin/true',image.Id]);
  const inspect=async step=>{const [v]=JSON.parse(await this.docker(step,['inspect',name]));validateContainer(v,image.Id,this.operation);return v;};
  const before=await inspect('discovery-created-proof');this.stage='stopped-export';
  const archive=join(this.private,'immutable-rootfs.tar');await this.docker('discovery-export',['export','--output',archive,name],180);
  const after=await inspect('discovery-never-started-proof');
  this.stage='direct-elf-discovery';
  const helper=join(ROOT,'infra/sqlite-runtime-consumers/inspect.py');
  await this.command('discovery-inspect','python3',['-I','-B',helper,archive,this.private,join(this.evidence,'elf-inventory.json')],120000);
  const report=JSON.parse(await readFile(join(this.evidence,'elf-inventory.json'),'utf8'));
  assert.equal(report.status,'DISCOVERED');assert.equal(report.allRuntimeUsesDiscovered,false);assert.equal(report.runtimeCompatibilityQualified,false);assert.equal(report.temporaryPayloadsRemoved,true);
  await save(join(this.evidence,'immutable-binding.json'),{source:this.identity.source,composeSha256:sha(compose),manifestSha256:sha(manifestBytes),helperSha256:sha(await readFile(helper)),index:INDEX,platformManifest:PLATFORM,imageId:image.Id,archiveSha256:report.archiveSha256,archiveBytes:report.archiveBytes,before,after,containerStarted:false,publicImmutableBaseOnly:true,scope:'regular-ELF-DT_NEEDED-only',allRuntimeUsesDiscovered:false,runtimeCompatibilityQualified:false,genericAbiApproval:false});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert.equal(process.argv.length,3);const result=await new SqliteConsumerDiscovery(resolve(process.argv[2])).run();process.stdout.write(JSON.stringify({passed:result.passed,discoveryOnly:true,runtimeCompatibilityQualified:false})+'\n');if(!result.passed)process.exitCode=1;}
