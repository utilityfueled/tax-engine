// Exact public distribution bytes; no package execution and no credential input.
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,stat,realpath} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {diagnose} from '../sqlite-exported-package-abi.mjs';
const authorityPath=fileURLToPath(new URL('../../infra/sqlite-exported-abi/original-distribution.json',import.meta.url));
const inspector=fileURLToPath(new URL('./inspect-sqlite-exported-package-abi.py',import.meta.url));
const stager=fileURLToPath(new URL('./stage-sqlite-original-abi.py',import.meta.url));
const urls=['https://deb.debian.org/debian/pool/main/s/sqlite3/libsqlite3-0_3.40.1-2+deb12u2_amd64.deb','https://deb.debian.org/debian-debug/pool/main/s/sqlite3/libsqlite3-0-dbgsym_3.40.1-2+deb12u2_amd64.deb'];
const digest=x=>createHash('sha256').update(x).digest('hex');
function admitAuthority(a){assert.equal(a.schema,1);assert.equal(a.version,'3.40.1-2+deb12u2');assert.equal(a.packages.length,2);assert.equal(a.projection.libraryPackageSha256,a.packages[0].sha256);assert.equal(a.projection.debugPackageSha256,a.packages[1].sha256);assert.equal(a.immutableOriginalProviderSha256,a.projection.librarySha256);for(const [i,row]of a.packages.entries()){assert.equal(row.name,['library.deb','debug.deb'][i]);assert.equal(row.url,urls[i]);assert.match(row.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=32*1024**2);}return true;}
export function validateOriginal(value,authority){admitAuthority(authority);assert.deepEqual(value,authority.projection);return true;}
export async function retrieveOriginalDistribution(output,authority,{fetchImpl=globalThis.fetch,deadlineMs,now=()=>performance.now()}={}){
 admitAuthority(authority);assert.equal(typeof fetchImpl,'function');assert.ok(isAbsolute(output));assert.ok(Number.isFinite(deadlineMs)&&deadlineMs>now());const parent=join(output,'..');assert.equal(await realpath(parent),parent);const s=await stat(parent);assert.equal(s.uid,process.getuid());assert.equal(s.mode&0o022,0);await mkdir(output,{mode:0o700});const records=[];
 for(const row of authority.packages){const left=Math.floor(deadlineMs-now());assert.ok(left>0);const response=await fetchImpl(row.url,{redirect:'error',signal:globalThis.AbortSignal.timeout(Math.min(30000,left))});assert.equal(response.status,200);if(response.url)assert.equal(response.url,row.url);assert.ok(response.body);const reader=response.body.getReader(),chunks=[];let bytes=0;try{while(true){assert.ok(now()<deadlineMs);const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;assert.ok(bytes<=row.bytes);chunks.push(Buffer.from(item.value));}}finally{await reader.cancel();reader.releaseLock();}assert.ok(now()<deadlineMs);assert.equal(bytes,row.bytes);const body=Buffer.concat(chunks);assert.equal(digest(body),row.sha256);await writeFile(join(output,row.name),body,{flag:'wx',mode:0o600});records.push({name:row.name,bytes,sha256:digest(body)});}
 return {packages:records,exactSourcePinnedBytes:true,freshSignatureVerificationAtRuntimeClaimed:false};
}
export async function diagnoseOriginal(config,{run,now=()=>performance.now()}={}){
 let result={passed:false,genericAbiApproval:false,candidateReleaseQualified:false,riskAccepted:false,runtimeIntegrationExecuted:false,checks:[],comparisons:{commonBaselineToCandidate:false,originalDistributionToCandidate:false}},stage='admission';
 try{assert.ok(isAbsolute(config.originalInput)&&config.originalInput!==config.work);const authority=JSON.parse(await readFile(authorityPath,'utf8'));admitAuthority(authority);
 const originalRun=async(name,exe,args,timeout)=>{if(name!=='stage')return run(name,exe,args,timeout);const output=await run(name,exe,['-I','-B',stager,inspector,authorityPath,config.originalInput,...args.slice(3)],timeout);validateOriginal(JSON.parse(output).originalDistribution,authority);return output;};
 result=await diagnose(config,{run:originalRun,now});result.comparisons={commonBaselineToCandidate:result.passed,originalDistributionToCandidate:false};if(!result.passed)return result;result.passed=false;
 const command=async(name,exe,args,limit)=>{stage=name;const remaining=Math.floor(config.deadlineMs-now());assert.ok(remaining>0);const output=await run(name,exe,args,Math.min(limit,remaining));assert.equal(typeof output,'string');assert.ok(Buffer.byteLength(output)<=1048576);assert.ok(now()<config.deadlineMs);result.checks.push({step:name,stdoutSha256:digest(output),bytes:Buffer.byteLength(output),successfulSupervisedCallback:true});return output;};
 const library=join(config.work,'original-distribution',result.inputs.originalDistribution.library);
 for(const [name,args]of [['header',['--file-header']],['dynamic',['--dynamic']],['symbols',['--dyn-syms','--wide']],['versions',['--version-info','--wide']],['notes',['--notes']]])await command('original-distribution-'+name,'/usr/bin/readelf',[...args,library],10000);
 await command('original-distribution-abidiff','/usr/bin/abidiff',['--fail-no-debug-info','--no-default-suppression','--debug-info-dir1',join(config.work,'original-distribution/usr/lib/debug'),'--debug-info-dir2',join(config.work,'candidate/usr/lib/debug'),library,join(config.work,'candidate',result.inputs.candidate.library)],120000);
 result.comparisons.originalDistributionToCandidate=true;result.passed=true;
 }catch{result.passed=false;result.failureStage=stage;}return result;
}
