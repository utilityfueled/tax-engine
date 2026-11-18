// Private source-only integration. No action occurs on import.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {retrieveArtifact,projectAbiResult} from './lib/sqlite-abi-artifact.mjs';
import {copyFile,mkdir,readFile,writeFile,open} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath,URL,pathToFileURL} from 'node:url';
import {SourceCandidateController,assertOwnedImage,labelRecipe} from './qualify-postgres-source-candidates-amd64.mjs';
import {diagnose} from './sqlite-exported-package-abi.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const HERE=join(ROOT,'infra/sqlite-exported-abi');
const INSPECTOR=join(ROOT,'scripts/lib/inspect-sqlite-exported-package-abi.py');
const LABEL='io.vivalatax.qualification.operation';
export const ABI_IMAGE_BASE='docker.io/library/postgres@sha256:f45d631d050c2fe068f384ed6c4faac506e9cd7f4da605ce703648e4b0985848';
const sha=x=>createHash('sha256').update(x).digest('hex');
const save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n',{flag:'wx',mode:0o600});
const imageId=x=>{assert.match(x,/^sha256:[a-f0-9]{64}$/);return x;};
async function projectionInput(path){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const before=await file.stat();assert.ok(before.isFile()&&before.size<=1048576&&before.nlink===1);const raw=await file.readFile();assert.ok(raw.length<=1048576);const after=await file.stat();assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);return JSON.parse(raw);}finally{await file.close();}
}
export function materializationRecipe(original,operation){
 return labelRecipe(original,operation)+`\n# New tools materialization, not restoration of an old image. No SQLite build.\nCOPY inspect-deb.py /abi-inspect-deb.py\nCOPY verify-tools.py /abi-verify-tools.py\nRUN set -eu; mkdir -m 700 -p /abi-tools-proof/debs /abi-tools-proof/metadata; \\\n    apt-get -o APT::Get::AllowUnauthenticated=false -o Acquire::AllowInsecureRepositories=false update; \\\n    cd /abi-tools-proof/debs; \\\n    apt-get -o APT::Get::AllowUnauthenticated=false download abigail-tools=2.2-2 binutils=2.40-2 binutils-x86-64-linux-gnu=2.40-2 libabigail0=2.2-2 dpkg=1.21.23; \\\n    for pair in abigail-tools=2.2-2 binutils=2.40-2 binutils-x86-64-linux-gnu=2.40-2 libabigail0=2.2-2 dpkg=1.21.23; do apt-cache show "$pair" > "/abi-tools-proof/metadata/\${pair%%=*}.txt"; done; \\\n    cp -a /var/lib/apt/lists /abi-tools-proof/apt-lists; \\\n    dpkg-query -W -f='\${Package}\\t\${Version}\\t\${Architecture}\\n' > /abi-tools-proof/installed-packages.tsv; \\\n    python3 -I -B /abi-verify-tools.py /abi-inspect-deb.py /abi-tools-proof\n`;
}
export function validateToolContainer(v,image,operation,work,exe,finished){
 assert.equal(v.Image,image);assert.equal(v.Config.Labels[LABEL],operation);assert.deepEqual(v.Config.Entrypoint,[exe]);
 assert.equal(v.State.Running,false);assert.equal(v.State.OOMKilled,false);assert.equal(v.State.Error,'');
 assert.equal(v.State.ExitCode,0);if(!finished)assert.equal(v.State.Status,'created');
 assert.equal(v.HostConfig.NetworkMode,'none');assert.equal(v.HostConfig.ReadonlyRootfs,true);assert.equal(v.HostConfig.Privileged,false);assert.equal(v.HostConfig.CapAdd,null);assert.deepEqual(v.HostConfig.CapDrop,['ALL']);assert.deepEqual(v.HostConfig.SecurityOpt,['no-new-privileges']);assert.equal(v.HostConfig.Binds,null);
 assert.equal(v.Mounts.length,3);
 const bind=v.Mounts.filter(x=>x.Type==='bind');assert.equal(bind.length,1);assert.equal(bind[0].Source,work);assert.equal(bind[0].Destination,work);assert.equal(bind[0].RW,false);
 assert.deepEqual(v.Mounts.filter(x=>x.Type==='tmpfs').map(x=>x.Destination).sort(),['/tmp','/var/lib/postgresql/data']);return true;
}
export async function executeFixedTool(io,step,exe,args,timeout){
 assert.match(step,/^[a-z-]+$/);assert.ok(['/usr/bin/dpkg-query','/usr/bin/sha256sum','/usr/bin/readelf','/usr/bin/abidiff'].includes(exe));
 assert.ok(Number.isInteger(timeout)&&timeout>0&&timeout<=120000);assert.match(io.work,/^\/[A-Za-z0-9_./-]+$/);assert.ok(Number.isSafeInteger(io.uid)&&io.uid>=0);
 const name=`tax-source-${io.operation}-${step}`;
 await io.docker(step+'-create',['create','--name',name,'--label',LABEL+'='+io.operation,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user',String(io.uid)+':'+String(io.uid),'--workdir','/tmp','--mount','type=tmpfs,destination=/var/lib/postgresql/data','--mount','type=tmpfs,destination=/tmp,tmpfs-size=67108864','--mount',`type=bind,source=${io.work},destination=${io.work},readonly`,'--entrypoint',exe,io.image,...args]);
 const inspect=async(finished)=>{const [v]=JSON.parse(await io.docker(step+(finished?'-after':'-before'),['inspect',name]));validateToolContainer(v,io.image,io.operation,io.work,exe,finished);};
 await inspect(false);
 const output=await io.docker(step+'-run',['start','--attach',name],timeout/1000);
 await inspect(true);await io.docker(step+'-remove',['rm','--volumes',name]);return output;
}
export async function orchestrate(io,input,{diagnoseFn=diagnose}={}){
 // The first operation fully validates both .deb+debug pairs, in temporary host
 // files only. Missing real candidates stop before any native materialization.
 const before=await io.preflight(input);
 const image=await io.materialize(input,before);
 return diagnoseFn({...input,work:io.work,deadlineMs:performance.now()+240000},{run:async(step,exe,args,timeout)=>step==='stage'?io.hostStage(step,exe,args,timeout):executeFixedTool({...io,image},step,exe,args,timeout)});
}
export class SqliteAbiAdapter extends SourceCandidateController{
 constructor(output,env=process.env){super('sqlite',output,env);this.githubToken=env.GITHUB_TOKEN;delete env.GITHUB_TOKEN;this.sourceCandidate='sqlite-exported-abi-only';this.limit={...this.limit,jobMinutes:35,controllerMinutes:32,cleanupMinutes:3};this.deadline=performance.now()+32*60000;this.cleanupReserve=3*60000;}
 async build(){
  this.stage='abi-source-admission';
  const authority=JSON.parse(await readFile(join(HERE,'inputs.json'),'utf8'));
  for(const [name,pin]of Object.entries(authority.files)){const body=await readFile(join(ROOT,name));assert.equal(body.length,pin.bytes);assert.equal(sha(body),pin.sha256);}
  const event=JSON.parse(await readFile(this.env.GITHUB_EVENT_PATH,'utf8'));
  const selected=event.inputs;
  for(const key of ['artifact_run','artifact_id','artifact_bytes'])assert.match(selected[key],/^[1-9][0-9]{0,15}$/);
  const request={source:selected.artifact_source,runId:Number(selected.artifact_run),artifactId:Number(selected.artifact_id),archiveSha256:selected.artifact_sha256,archiveBytes:Number(selected.artifact_bytes)};
  const archive=join(this.private,'source-artifact.zip');
  const retrieved=await retrieveArtifact(request,archive,{token:this.githubToken,deadlineMs:Math.min(performance.now()+180000,this.deadline-this.cleanupReserve-2000)});this.githubToken=undefined;
  await save(join(this.evidence,'artifact-binding.json'),retrieved);
  const input={source:request.source,archive,archiveSha256:request.archiveSha256};
  const work=join(this.private,'abi-payloads');let toolsProof;
  const io={operation:this.operation,work,uid:process.getuid(),docker:(...args)=>this.docker(...args),hostStage:(step,exe,args,timeout)=>this.command('abi-'+step,exe,args,timeout),
   preflight:async value=>{this.stage='abi-pair-preflight';return JSON.parse(await this.command('abi-pair-preflight','python3',['-I','-B',join(HERE,'preflight.py'),INSPECTOR,value.archive,value.archiveSha256,value.source,this.private],60000));},
   materialize:async(value,before)=>{
    this.stage='abi-tools-materialization';
    const original=await this.command('abi-source-toolchain','git',['-C',ROOT,'show',value.source+':infra/postgres-sqlite-backport/Dockerfile.toolchain']);
    assert.equal(original,await readFile(join(ROOT,'infra/postgres-sqlite-backport/Dockerfile.toolchain'),'utf8'));
    await this.docker('abi-base-pull',['pull','--platform','linux/amd64',ABI_IMAGE_BASE],180);await this.inspect('abi-base-native',ABI_IMAGE_BASE);
    const context=join(this.private,'abi-tools-context');await mkdir(context,{mode:0o700});
    await writeFile(join(context,'Dockerfile'),materializationRecipe(original,this.operation),{flag:'wx',mode:0o600});
    await copyFile(INSPECTOR,join(context,'inspect-deb.py'),constants.COPYFILE_EXCL);await copyFile(join(HERE,'verify-tools.py'),join(context,'verify-tools.py'),constants.COPYFILE_EXCL);
    const iid=join(this.private,'abi-toolchain.id');this.nativeBuildCommandAttempted=true;
    await this.docker('abi-tools-build',['build','--rm=true','--force-rm=false','--platform','linux/amd64','--build-arg','BASE='+ABI_IMAGE_BASE,'--build-arg','EXPECTED_ARCH=amd64','--iidfile',iid,'--tag',`tax-source-${this.operation}:toolchain`,context],20*60);
    const image=imageId((await readFile(iid,'utf8')).trim());assertOwnedImage(await this.inspect('abi-tools-native',image),this.operation,this.preexistingImages);
    const name=`tax-source-${this.operation}-tools-proof`;
    await this.docker('abi-proof-create',['create','--name',name,'--label',LABEL+'='+this.operation,'--network','none','--read-only','--mount','type=tmpfs,destination=/var/lib/postgresql/data','--entrypoint','/bin/true',image]);
    await this.docker('abi-proof-copy',['cp',name+':/abi-tools-proof',join(this.private,'tools-proof')],120);
    const proof=JSON.parse(await readFile(join(this.private,'tools-proof/binary-binding.json'),'utf8'));assert.equal(proof.passed,true);assert.equal(proof.independentDebMemberBinding,true);toolsProof=proof;
    await save(join(this.evidence,'tool-materialization.json'),{archiveSource:value.source,originalImageId:before.originalToolchainImageId,newImageId:image,restoredOriginalImage:false,newToolsMaterialization:true,sqliteCompilation:false,base:ABI_IMAGE_BASE,originalRecipeSha256:sha(original),binaryBinding:proof,sourcePreflight:before});
    return image;
   }};
  this.stage='abi-diagnostics';const report=await orchestrate(io,input);await save(join(this.evidence,'abi-diagnostic.json'),report);assert.equal(report.passed,true);
  for(const path of ['/usr/bin/readelf','/usr/bin/abidiff','/usr/bin/dpkg-query'])assert.equal(report.toolBinarySha256[path],toolsProof.binaries[path]);
 }
}
export async function publishProjection(controller,result){
 const destination=join(controller.output,'publish');await mkdir(destination,{mode:0o700});
 let abi={},selection=null;try{abi=await projectionInput(join(controller.evidence,'abi-diagnostic.json'));}catch{/* A pre-diagnostic HOLD publishes no raw ABI input or output. */}
 try{selection=await projectionInput(join(controller.evidence,'artifact-binding.json'));}catch{/* Pre-download admission failures have no artifact binding. */}
 const safe=projectAbiResult({...controller.identity,operation:controller.operation,checks:controller.checks,cleanupErrors:controller.cleanupErrors,...result},abi,selection);
 if(result.passed){assert.equal(safe.diagnosticPassed,true);assert.ok(safe.artifactBinding);}
 assert.ok(Buffer.byteLength(JSON.stringify(safe))<=1048576);
 await save(join(destination,'result.json'),safe);
 const bytes=await readFile(join(destination,'result.json'));await save(join(destination,'hashes.json'),{files:1,result:{bytes:bytes.length,sha256:sha(bytes)},rawFilesPublished:0});return safe;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert.equal(process.argv.length,3);const controller=new SqliteAbiAdapter(resolve(process.argv[2]));let result;
 try{result=await controller.run();await publishProjection(controller,result);}finally{controller.githubToken=undefined;}
 process.stdout.write(JSON.stringify({passed:result.passed,abiDiagnosticOnly:true,genericAbiApproval:false})+'\n');if(!result.passed)process.exitCode=1;
}
