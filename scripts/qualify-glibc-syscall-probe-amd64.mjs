// Isolated causal syscall experiment. Never installs a package or qualifies an image.
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFile,writeFile,mkdir}from'node:fs/promises';
import{join,resolve}from'node:path';
import{URL,fileURLToPath,pathToFileURL}from'node:url';import{createHash}from'node:crypto';import{performance}from'node:perf_hooks';
const REPO=process.cwd(),DATA=fileURLToPath(new URL('../infra/glibc-syscall-probe/',import.meta.url));
const {GlibcCandidateController}=await import(pathToFileURL(join(REPO,'scripts/qualify-postgres-glibc-candidate-amd64.mjs')).href);
const {assertOwnedImage,labelRecipe}=await import(pathToFileURL(join(REPO,'scripts/qualify-postgres-source-candidates-amd64.mjs')).href);
const {verifyPinnedFile}=await import(pathToFileURL(join(REPO,'scripts/build-postgres-libxml2-backport.mjs')).href);
const LABEL='io.vivalatax.qualification.operation',sha=x=>createHash('sha256').update(x).digest('hex');
const save=(p,d)=>writeFile(p,JSON.stringify(d,null,2)+'\n',{flag:'wx',mode:0o600});
export const PROBE_LIMITS={jobMinutes:20,controllerMinutes:17,cleanupMinutes:3};
export const DEFAULT_PROFILE_SHA='9c1025c88ccaa517b648da571961838744ea2137f176bfe6a48b21294cae9c76';
const additions=()=>[{names:['personality'],action:'SCMP_ACT_ALLOW',args:[{index:0,value:4294967274,op:'SCMP_CMP_EQ'}]},{names:['clock_settime'],action:'SCMP_ACT_ALLOW',args:[{index:0,value:1,op:'SCMP_CMP_EQ'}]}];
export function narrowProfile(raw){assert.equal(sha(raw),DEFAULT_PROFILE_SHA);const p=JSON.parse(raw);p.syscalls.push(...additions());return p;}
export function validateProfile(raw,p){assert.equal(sha(raw),DEFAULT_PROFILE_SHA);assert.deepEqual(p,narrowProfile(raw));return true;}
export function validateSecurityOptions(options,expected){if(expected===null){assert.deepEqual(options,null);return true;}assert.ok(Array.isArray(options)&&options.length===1&&typeof options[0]==='string'&&options[0].startsWith('seccomp=')&&Buffer.byteLength(options[0])<256*1024);assert.deepEqual(JSON.parse(options[0].slice('seccomp='.length)),expected);return true;}
export function validateEngine(d){assert.equal(d.ServerVersion,'28.0.4');assert.equal(d.OSType,'linux');assert.ok(['amd64','x86_64'].includes(d.Architecture));assert.ok(d.SecurityOptions.includes('name=seccomp,profile=builtin'));return true;}
export function validateInventory(expected,actual){assert.ok(expected.length>0);assert.equal(actual,expected,'Toolchain package drift holds; no claim to reproduce previous binaries.');return true;}
export function validateObservations(d){assert.deepEqual(Object.keys(d).sort(),['builtin','narrow','official']);for(const[k,v]of Object.entries(d)){const narrow=k==='narrow';assert.deepEqual(v,{initialPersonaZero:true,restoreZero:true,monotonicRead:true,personalityReturnedSaved:narrow,personalityErrno:narrow?0xdefaced:1,queryMatchesRequested:narrow,errnoSentinelUnchanged:narrow,clockReturnedMinusOne:true,clockErrno:narrow?22:1});}return true;}
export class SyscallProbeController extends GlibcCandidateController{
 constructor(output,env=process.env){super(output,env);this.sourceCandidate='glibc-syscall-probe';this.limit={...PROBE_LIMITS};this.deadline=performance.now()+17*60_000;this.cleanupReserve=3*60_000;}
 async initialize(){await super.initialize();validateEngine(JSON.parse(await this.docker('probe-exact-engine',['info','--format','{{json .}}'])));}
 async build(){
  this.stage='probe-toolchain';
  const manifest=JSON.parse(await readFile(join(REPO,'infra/postgres-glibc-backport/sources.json'),'utf8'));
  const recipe=join(REPO,'infra/postgres-glibc-backport/Dockerfile.toolchain');await verifyPinnedFile(recipe,manifest.recipeFiles['Dockerfile.toolchain']);
  const profile=await readFile(join(DATA,'default-seccomp.json'),'utf8'),narrow=narrowProfile(profile);validateProfile(profile,narrow);
  const context=join(this.private,'probe-context');await mkdir(context,{mode:0o700});
  const inputNames=['probe.c','expected-packages.tsv','reference-tst-personality.c','reference-tst-clock2.c'];const inputPins={};
  for(const name of inputNames){const b=await readFile(join(DATA,name));inputPins[name]={bytes:b.length,sha256:sha(b)};}
  const source=await readFile(join(DATA,'probe.c'));await writeFile(join(context,'probe.c'),source,{flag:'wx',mode:0o600});
  const dockerfile=labelRecipe(await readFile(recipe,'utf8'),this.operation)+'\nCOPY probe.c /qualification-probe.c\nRUN cc -std=c11 -D_POSIX_C_SOURCE=200809L -Wall -Wextra -Werror -O2 /qualification-probe.c -o /qualification-probe\n';
  await writeFile(join(context,'Dockerfile'),dockerfile,{flag:'wx',mode:0o600});
  const base='docker.io/library/postgres@'+manifest.postgres.platforms.amd64.digest;
  await this.docker('probe-base-pull',['pull','--platform','linux/amd64',base],180);await this.inspect('probe-base-native',base);
  const iid=join(this.private,'probe-toolchain.id');this.nativeBuildCommandAttempted=true;
  await this.docker('probe-toolchain-build',['build','--rm=true','--force-rm=false','--platform','linux/amd64','--build-arg','BASE='+base,'--build-arg','EXPECTED_ARCH=amd64','--iidfile',iid,'--tag',`tax-source-${this.operation}:toolchain`,context],8*60);
  const toolchain=(await readFile(iid,'utf8')).trim();assert.match(toolchain,/^sha256:[a-f0-9]{64}$/);assertOwnedImage(await this.inspect('probe-toolchain-native',toolchain),this.operation,this.preexistingImages);
  const officialPath=join(this.private,'official-profile.json'),narrowPath=join(this.private,'narrow-profile.json');await writeFile(officialPath,profile,{flag:'wx',mode:0o600});await save(narrowPath,narrow);
  await save(join(this.evidence,'probe-source-binding.json'),{source:this.identity.source,base,toolchain,officialProfileSha256:sha(profile),narrowProfileSha256:sha(JSON.stringify(narrow,null,2)+'\n'),recipeSha256:sha(await readFile(recipe)),contextDockerfileSha256:sha(dockerfile),inputPins,originalTestSourcesAreReferenceOnly:true,unchangedOriginalTestBinariesExecuted:false,packageQualificationClaim:false});
  const observations={};
  for(const variant of ['builtin','official','narrow']){
   this.stage='probe-'+variant;
   const name=`tax-source-${this.operation}-${variant}`;const args=['create','--name',name,'--label',`${LABEL}=${this.operation}`,'--network','none','--read-only','--mount','type=tmpfs,destination=/var/lib/postgresql/data'];
   if(variant!=='builtin')args.push('--security-opt','seccomp='+(variant==='official'?officialPath:narrowPath));
   args.push('--entrypoint','/qualification-probe',toolchain);await this.docker('probe-create-'+variant,args);
   const [before]=JSON.parse(await this.docker('probe-before-'+variant,['inspect',name]));assert.equal(before.Image,toolchain);assert.equal(before.Config.Labels[LABEL],this.operation);assert.equal(before.State.Running,false);assert.equal(before.HostConfig.NetworkMode,'none');assert.equal(before.HostConfig.Privileged,false);assert.equal(before.HostConfig.ReadonlyRootfs,true);assert.deepEqual(before.HostConfig.CapAdd,null);assert.deepEqual(before.HostConfig.CapDrop,null);assert.ok(before.Mounts.every(m=>m.Type==='tmpfs'&&m.Destination==='/var/lib/postgresql/data'));
   validateSecurityOptions(before.HostConfig.SecurityOpt,variant==='builtin'?null:variant==='official'?JSON.parse(profile):narrow);
   const inventory=join(this.private,'inventory-'+variant+'.tsv');await this.docker('probe-inventory-'+variant,['cp',name+':/qualification-toolchain/packages.tsv',inventory]);validateInventory(await readFile(join(DATA,'expected-packages.tsv'),'utf8'),await readFile(inventory,'utf8'));
   const output=await this.docker('probe-run-'+variant,['start','--attach',name],30);assert.ok(Buffer.byteLength(output)<=4096);observations[variant]=JSON.parse(output);
   const [after]=JSON.parse(await this.docker('probe-after-'+variant,['inspect',name]));assert.equal(after.Image,toolchain);assert.equal(after.Config.Labels[LABEL],this.operation);assert.equal(after.State.Status,'exited');assert.equal(after.State.Running,false);assert.equal(after.State.ExitCode,0);assert.equal(after.State.OOMKilled,false);assert.equal(after.State.Error,'');await save(join(this.evidence,'probe-'+variant+'.json'),observations[variant]);
  }
  validateObservations(observations);await save(join(this.evidence,'paired-probe.json'),{passed:true,observations,toolchainInventoryExactlyMatchesPrior:true,originalFullTestsStillRequired:true,unchangedOriginalTestBinariesExecuted:false,packageQualified:false,candidateReleaseQualified:false,riskAccepted:false});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert.equal(process.argv.length,3);const result=await new SyscallProbeController(resolve(process.argv[2])).run();console.log(JSON.stringify({passed:result.passed,causalProbeOnly:true,candidateReleaseQualified:false,riskAccepted:false}));if(!result.passed)process.exitCode=1;}
