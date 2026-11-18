import {derive,compoundMode,helperPlan} from './compound-prefilter.mjs';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {spawnSync} from 'node:child_process';
import {readFile,mkdir,mkdtemp,rm,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,URL} from 'node:url';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const HERE=fileURLToPath(new URL('.',import.meta.url));
const HASH=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=ok=>{if(!ok)throw Error('comparison-held');};
const inputBytes=await readFile(new URL('./inputs.json',import.meta.url));
export const INPUTS=JSON.parse(inputBytes);
const INPUT_HASH='165c9039960393949b7ae12322cc4db24b4e8b520110762e5eff35731bca1bc3';
export function validateInputs(value){need(HASH(JSON.stringify(value))===HASH(JSON.stringify(INPUTS))&&HASH(inputBytes)===INPUT_HASH);}
export function validateArtifact(value){
 const a=INPUTS.artifact,w=value.workflow_run;
 need(value.id===a.id&&value.name==='container-runtime-evidence'&&value.expired===false&&value.size_in_bytes===a.bytes&&value.digest==='sha256:'+a.sha256);
 need(w?.id===a.run&&w.head_sha===a.source&&w.head_branch==='main'&&w.repository_id===a.repositoryId&&w.head_repository_id===a.repositoryId);
}
export function assetHost(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^productionresults[a-z0-9]+\.blob\.core\.windows\.net$/u.test(u.hostname);}catch{return false;}}
export function schedule(){
 const rows=[];
 for(const width of [1280,390]){
  for(const branch of ['A','B'])for(let position=0;position<2;position++)rows.push({width,branch,phase:'warmup',block:-1,position});
  for(let block=0;block<12;block++)for(const [position,branch]of [...'ABBA'].entries())rows.push({width,branch,phase:'measured',block,position});
 }
 return rows;
}
export function childOptions(parent,input){
 const env={};for(const key of ['PATH','SystemRoot','WINDIR','TMPDIR','TMP','TEMP','LANG','LC_ALL'])if(parent[key]!==undefined)env[key]=parent[key];
 return{encoding:'utf8',input,timeout:4000,maxBuffer:65536,killSignal:'SIGTERM',env,stdio:['pipe','pipe','pipe','pipe']};
}
export function validOutput(stdout,expected){try{const row=JSON.parse(stdout);return row&&Object.keys(row).length===8&&Object.keys(expected).every(k=>Object.hasOwn(row,k)&&row[k]===expected[k]);}catch{return false;}}
export function validateVersions(versions){
 for(const branch of ['A','B']){const v=versions[branch];need(v&&v.version===(branch==='A'?'3.13.18':'3.14.10')&&v.implementation==='CPython'&&v.system==='Linux'&&v.machine==='x86_64'&&v.gilDisabled===false&&v.jitEnabled===false&&v.pypdf==='6.10.0'&&/^[a-f0-9]{64}$/u.test(v.packageSha256));}
 need(versions.A.packageSha256===versions.B.packageSha256);
}
export function projectAttempt(row,r,wallNs,expected){
 const timeout=r.error?.code==='ETIMEDOUT';
 const passed=!r.error&&r.status===0&&!r.signal&&!r.stderr&&typeof r.stdout==='string'&&Buffer.byteLength(r.stdout)<=65536&&validOutput(r.stdout,expected);
 return{...row,wallNs,passed,timeout,exit:Number.isInteger(r.status)?r.status:null,signal:r.signal==='SIGTERM'?'SIGTERM':r.signal?'other':null,errorCategory:r.error?(timeout?'timeout':r.error.code==='ENOBUFS'?'output-bound':'child-error'):null,stdoutSha256:HASH(r.stdout??''),stderrBytes:Buffer.byteLength(r.stderr??'')};
}
const median=xs=>{const a=[...xs].sort((a,b)=>a-b),n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;};
export function assess(rows,controlsPassed){
 const fixed=schedule(),complete=rows.length===fixed.length&&rows.every((r,i)=>Object.keys(fixed[i]).every(k=>r[k]===fixed[i][k]));
 const allPassed=complete&&controlsPassed&&rows.every(r=>r.passed===true&&r.timeout===false&&Number.isSafeInteger(r.wallNs)&&r.wallNs>0);
 const results=[];
 if(allPassed)for(const width of [1280,390]){
  const pairs=[];
  for(let block=0;block<12;block++){
   const r=rows.filter(x=>x.width===width&&x.phase==='measured'&&x.block===block);
   for(const[a,b]of[[0,1],[3,2]])pairs.push((r[a].wallNs-r[b].wallNs)/r[a].wallNs*100);
  }
  results.push({width,pairs:pairs.length,pairedMedianImprovementPercent:median(pairs),thresholdPercent:10,thresholdPassed:median(pairs)>=10});
 }
 return{status:allPassed?'COMPLETE':'HOLD',allAttemptsRetained:complete,comparisonChildren:rows.length,controlsPassed,thresholdPassedBoth:allPassed&&results.every(r=>r.thresholdPassed),results,noStrictRuntimeQualification:true,noCpuCauseClaim:true,noVersionAdoption:true};
}
async function boundedBody(response,max){
 need(response.body);let size=0;const chunks=[];
 for await(const chunk of response.body){size+=chunk.length;need(size<=max);chunks.push(chunk);}
 return Buffer.concat(chunks);
}
async function artifact(work,token){
 const base=`https://api.github.com/repos/utilityfueled/tax-engine/actions/artifacts/${INPUTS.artifact.id}`;
 const headers={Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'};
 const meta=await fetch(base,{headers,redirect:'error',signal:globalThis.AbortSignal.timeout(15000)});need(meta.ok);validateArtifact(JSON.parse(await boundedBody(meta,65536)));
 const redirect=await fetch(base+'/zip',{headers,redirect:'manual',signal:globalThis.AbortSignal.timeout(15000)});need(redirect.status===302);const location=redirect.headers.get('location');need(assetHost(location));await redirect.body?.cancel();
 // Credentials NEVER follow the signed download redirect.
 const response=await fetch(location,{redirect:'error',signal:globalThis.AbortSignal.timeout(180000)});need(response.ok&&Number(response.headers.get('content-length'))<=500000000);
 const file=path.join(work,'archive.zip');const handle=await import('node:fs/promises').then(m=>m.open(file,'wx',0o600));let bytes=0;const hash=createHash('sha256');
 try{for await(const chunk of response.body){bytes+=chunk.length;need(bytes<=500000000);hash.update(chunk);await handle.writeFile(chunk);}await handle.sync();}finally{await handle.close();}
 need(bytes===INPUTS.artifact.bytes&&hash.digest('hex')===INPUTS.artifact.sha256);
 return file;
}
export const VERSION_PROBE=`import sys,sysconfig,platform,json,hashlib,pathlib,pypdf
p=pathlib.Path(pypdf.__file__).parent
h=hashlib.sha256()
for f in sorted(p.rglob('*.py')):h.update(str(f.relative_to(p)).encode());h.update(hashlib.sha256(f.read_bytes()).digest())
flags={k:sysconfig.get_config_var(k)for k in ['ABIFLAGS','MULTIARCH','Py_DEBUG','Py_ENABLE_SHARED','Py_GIL_DISABLED','Py_JIT','Py_STATS','Py_TRACE_REFS','SOABI','WITH_PYMALLOC']}
assert all(v is None or type(v)is int or isinstance(v,str)and len(v)<=256 for v in flags.values())
options={k:hashlib.sha256(str(sysconfig.get_config_var(k)).encode()).hexdigest()for k in ['CFLAGS','CONFIG_ARGS','CPPFLAGS','LDFLAGS']}
print(json.dumps(dict(version=platform.python_version(),implementation=platform.python_implementation(),system=platform.system(),machine=platform.machine(),gilDisabled=bool(sysconfig.get_config_var('Py_GIL_DISABLED')),jitEnabled=bool(getattr(getattr(sys,'_jit',None),'is_enabled',lambda:False)()),pypdf=pypdf.__version__,packageSha256=h.hexdigest(),compiler=platform.python_compiler(),build=platform.python_build(),sysconfigFlags=flags,optionHashes=options)))`;
function runChecked(python,args,{input='',timeout=30000}={}){
 const r=spawnSync(python,args,{...childOptions(process.env,input),timeout,maxBuffer:65536});need(!r.error&&r.status===0&&!r.signal&&!r.stderr&&typeof r.stdout==='string'&&Buffer.byteLength(r.stdout)<=65536);return r.stdout;
}
async function privateJson(file,value){await writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
export async function main(){
 const env=process.env,token=env.GH_TOKEN;delete env.GH_TOKEN;
 const args=process.argv.slice(2);need(args.length===2&&args.every(path.isAbsolute));
 need(process.platform==='linux'&&process.arch==='x64'&&env.GITHUB_ACTIONS==='true'&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_RUN_ATTEMPT==='1'&&env.GITHUB_REPOSITORY==='utilityfueled/tax-engine'&&env.GITHUB_REF==='refs/heads/main');
 need(/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA)&&typeof token==='string'&&token.length>0);
 const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH));need(event.repository?.private===false&&event.repository.fork===false&&event.inputs?.source_sha===env.GITHUB_SHA);
 const compound=compoundMode(env.RRTA_COMPOUND_PREFILTER,event.inputs?.compound_prefilter);
 const git=spawnSync('git',['rev-parse','HEAD'],childOptions(env,''));need(!git.error&&git.status===0&&!git.signal&&git.stdout.trim()===env.GITHUB_SHA);
 validateInputs(INPUTS);need(HASH(await readFile(path.join(ROOT,INPUTS.helper)))===INPUTS.helperSha256);need(HASH(await readFile(path.join(ROOT,'requirements-test.txt')))===INPUTS.requirementsSha256);
 const out=path.join(ROOT,'artifacts/rrta-python-versions');await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{mode:0o700});
 const work=await mkdtemp(path.join(tmpdir(),'rrta-python-versions-'));let result={status:'HOLD',noStrictRuntimeQualification:true},failed,stage='artifact';
 try{
  const zip=await artifact(work,token);
  stage='exact-extraction';
  runChecked(args[0],['-I','-B',path.join(HERE,'extract.py'),zip,work],{input:JSON.stringify(INPUTS),timeout:10000});
  const wheelDir=path.join(work,'wheel');await mkdir(wheelDir);
  stage='hash-locked-wheel';
  const pipEnv={...childOptions(env,'').env,PIP_DISABLE_PIP_VERSION_CHECK:'1',PYTHONDONTWRITEBYTECODE:'1'};
  const download=spawnSync(args[0],['-I','-B','-m','pip','--isolated','download','--index-url','https://pypi.org/simple','--no-deps','--only-binary=:all:','--require-hashes','-r',path.join(ROOT,'requirements-test.txt'),'--dest',wheelDir],{env:pipEnv,encoding:'utf8',timeout:30000,maxBuffer:65536});need(!download.error&&download.status===0&&!download.signal);
  const names=await readdir(wheelDir);need(names.length===1&&names[0]==='pypdf-6.10.0-py3-none-any.whl');const wheel=path.join(wheelDir,names[0]);need(HASH(await readFile(wheel))===INPUTS.wheelSha256);
  const pythons={},versions={};
  for(const [i,branch]of ['A','B'].entries()){
   stage='isolated-environment-'+branch;
   const venv=path.join(work,branch);runChecked(args[i],['-I','-B','-m','venv',venv]);pythons[branch]=path.join(venv,'bin/python');
   const install=spawnSync(pythons[branch],['-I','-B','-m','pip','--isolated','install','--no-index','--no-deps',wheel],{env:pipEnv,encoding:'utf8',timeout:30000,maxBuffer:65536});need(!install.error&&install.status===0&&!install.signal);
   versions[branch]=JSON.parse(runChecked(pythons[branch],['-I','-B','-c',VERSION_PROBE],{timeout:4000}));
  }
  stage='helper-binding';const helper=path.join(ROOT,INPUTS.helper),helpers=helperPlan(helper,work,compound);
  if(compound)await writeFile(helpers.paths.B,derive(await readFile(helper,'utf8')),{flag:'wx',mode:0o600});
  validateVersions(versions);await privateJson(path.join(out,'versions.json'),{versions,helperSha256:INPUTS.helperSha256,artifactSha256:INPUTS.artifact.sha256,inputSha256:INPUT_HASH,helperHashes:helpers.hashes,experimentMode:compound?'compound-runtime-prefilter':'runtime-only'});
  stage='synthetic-parity';
  const controls={};for(const branch of ['A','B'])controls[branch]=JSON.parse(runChecked(pythons[branch],['-I','-B',path.join(HERE,'controls.py'),helpers.paths[branch]],{timeout:4000}));
  const controlsPassed=controls.A.passed&&controls.B.passed&&JSON.stringify(controls.A)===JSON.stringify(controls.B);await privateJson(path.join(out,'controls.json'),{controls,controlsPassed});
  const rows=[],input=JSON.stringify(INPUTS.markers);
  stage='fixed-comparison';
  for(const row of schedule()){
   const pdf=INPUTS.pdfs.find(x=>x.width===row.width),started=process.hrtime.bigint();
   const r=spawnSync(pythons[row.branch],['-I','-B',helpers.paths[row.branch],path.join(work,`actual-${row.width}.pdf`),'--phase-fd3'],childOptions(env,input));
   rows.push(projectAttempt(row,r,Number(process.hrtime.bigint()-started),pdf.expected));
   await writeFile(path.join(out,'attempts.json'),JSON.stringify(rows,null,2)+'\n',{mode:0o600});
  }
  stage='final-integrity';need(HASH(await readFile(helper))===INPUTS.helperSha256&&HASH(await readFile(path.join(HERE,'inputs.json')))===INPUT_HASH);
  for(const branch of ['A','B'])need(HASH(await readFile(helpers.paths[branch]))===helpers.hashes[branch]);
  for(const branch of ['A','B'])need(JSON.stringify(JSON.parse(runChecked(pythons[branch],['-I','-B','-c',VERSION_PROBE],{timeout:4000})))===JSON.stringify(versions[branch]));
  result=assess(rows,controlsPassed);result.sourceAndPackagesUnchangedAfter=true;failed=result.status!=='COMPLETE';
 }catch{failed=true;result={status:'HOLD',reason:'fixed-comparison-contract-unavailable',stage,noStrictRuntimeQualification:true,noCpuCauseClaim:true,noVersionAdoption:true};}
 finally{result.experimentMode=compound?'compound-runtime-prefilter':'runtime-only';result.noAutomaticAdoption=true;result.noComponentCauseClaim=true;try{await rm(work,{recursive:true,force:true});result.temporaryInputsRemoved=true;}catch{result.temporaryInputsRemoved=false;failed=true;result.status='HOLD';}await privateJson(path.join(out,'result.json'),result);}
 process.stdout.write(JSON.stringify({status:result.status,thresholdPassedBoth:result.thresholdPassedBoth??false,temporaryInputsRemoved:result.temporaryInputsRemoved})+'\n');return failed?1:0;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;},()=>{process.stderr.write('RRTA version comparison held.\n');process.exitCode=1;});
