// Spec: spec/ops/sqlite-exported-abi-native-amd64.yaml
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm,mkdir,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import originalAuthority from '../../infra/sqlite-exported-abi/original-distribution.json' with {type:'json'};
import {validateArtifactMetadata,projectAbiResult,artifactLocation,retrieveArtifact} from '../../scripts/lib/sqlite-abi-artifact.mjs';
import {publishProjection} from '../../scripts/qualify-sqlite-exported-abi-amd64.mjs';
const source='a'.repeat(40), digest='b'.repeat(64),run=123,artifact=456;
const request={source,runId:run,artifactId:artifact,archiveSha256:digest,archiveBytes:1200};
const repository={id:1,full_name:'utilityfueled/tax-engine',private:false,fork:false};
const workflow={id:7,path:'.github/workflows/postgres-source-candidates-amd64.yml'};
const record={id:run,head_sha:source,run_attempt:1,status:'completed',conclusion:'failure',event:'workflow_dispatch',path:workflow.path,workflow_id:7,repository,head_repository:repository};
const meta={id:artifact,name:`source-candidate-amd64-sqlite-${source}-${run}-1`,expired:false,size_in_bytes:1200,digest:'sha256:'+digest,workflow_run:{id:run,head_sha:source,repository_id:1,head_repository_id:1}};
test('retains artifact-source Git history without persisted credentials',async()=>{
 const text=await readFile(new URL('../../.github/workflows/sqlite-exported-abi-amd64.yml',import.meta.url),'utf8');
 assert.match(text,/fetch-depth: 0/);assert.match(text,/persist-credentials: false/);
});
test('requires exact closed workflow run source and immutable artifact metadata',()=>{
 assert.equal(validateArtifactMetadata(request,record,workflow,meta),true);
 for(const [key,mutate]of [['run',v=>v.run_attempt=2],['run',v=>v.status='in_progress'],['run',v=>v.head_sha='c'.repeat(40)],['run',v=>v.repository.private=true],['run',v=>v.workflow_id=8],['workflow',v=>v.path='wrong'],['artifact',v=>v.id++],['artifact',v=>v.digest='sha256:'+'f'.repeat(64)],['artifact',v=>v.size_in_bytes++],['artifact',v=>v.name+='foreign'],['artifact',v=>v.expired=true],['artifact',v=>v.workflow_run.id++]]){
  const rows={run:globalThis.structuredClone(record),workflow:globalThis.structuredClone(workflow),artifact:globalThis.structuredClone(meta)};mutate(rows[key]);assert.throws(()=>validateArtifactMetadata(request,rows.run,rows.workflow,rows.artifact));
 }
 assert.equal(artifactLocation('https://productionresultssa7.blob.core.windows.net/actions/file?secret=not-output').protocol,'https:');
 for(const url of ['http://productionresultssa7.blob.core.windows.net/a','https://evil.example/a','https://u:p@productionresultssa7.blob.core.windows.net/a'])assert.throws(()=>artifactLocation(url));
});
test('never publishes raw ABI or arbitrary command text',()=>{
 const row=version=>({version,architecture:'amd64',libraryPackage:'libsqlite3-0',debugPackage:'libsqlite3-0-dbgsym',library:'usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6',buildId:'1'.repeat(40),debugBuildId:'1'.repeat(40),debug:'usr/lib/debug/.build-id/11/'+('1'.repeat(38))+'.debug',debuglinkCrcMatches:true,alternateDebugInfoRequired:false,debugInfoBytes:3,debugAbbrevBytes:4,soname:['libsqlite3.so.0'],needed:['libm.so.6','libc.so.6'],librarySha256:digest,debugSha256:digest,libraryPackageSha256:digest,debugPackageSha256:digest});
 const inputs={source,originalDistribution:originalAuthority.projection,runId:'123',archiveSha256:digest,artifactLedgerSha256:digest,originalQualificationPassed:false,originalStatus:{baselinePackageBuildExit:0,candidatePackageBuildExit:0,baselineFullTestExit:2},baseline:row('3.40.1-2+deb12u2'),candidate:row('3.40.1-2+deb12u2+vivalatax1')};
 const result=projectAbiResult({passed:true,failure:false,cleanupErrors:[],checks:[{step:'abidiff',exit:0}],source,operation:'11111111-2222-3333-4444-555555555555',runId:'789',attempt:'1'}, {passed:true,comparisons:{commonBaselineToCandidate:true,originalDistributionToCandidate:true},inputs,checks:[{step:'abidiff',bytes:8,stdoutSha256:digest}],toolBinarySha256:{'/usr/bin/abidiff':digest,'/usr/bin/readelf':digest,'/usr/bin/dpkg-query':digest},secret:'NEVER-EXPORT-RAW'});
 assert.equal(result.rawIndependentAbiReviewAvailable,false);assert.equal(result.genericAbiApproval,false);assert.equal(result.runtimeIntegrationExecuted,false);assert.equal(JSON.stringify(result).includes('NEVER-EXPORT-RAW'),false);
 assert.equal(result.diagnosticPassed,true);assert.equal(result.originalPackageQualificationSuperseded,false);
 assert.equal(result.originalQualificationPassed,false);assert.equal(result.packageBinding.baseline.librarySha256,digest);
 assert.deepEqual(result.originalGateOutcomes,inputs.originalStatus);
 assert.throws(()=>projectAbiResult({passed:true,cleanupErrors:['unknown']},{}));
});
test('sends authentication only to fixed API and privately verifies every downloaded byte',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'abi-download-control-'));
 try{
  const raw=Buffer.alloc(1200,7),sha=createHash('sha256').update(raw).digest('hex'),calls=[];
  const request2={...request,archiveSha256:sha};const meta2={...meta,digest:'sha256:'+sha};
  const fetchImpl=async(url,options)=>{calls.push({url:String(url),options});
   if(String(url).endsWith('/zip'))return new globalThis.Response(null,{status:302,headers:{location:'https://productionresultssa7.blob.core.windows.net/private?never-print-this'}});
   if(String(url).startsWith('https://productionresultssa')){assert.equal(options.headers,undefined);assert.equal(options.redirect,'error');return new globalThis.Response(raw);}
   assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_TOKEN');assert.equal(options.redirect,'manual');
   return new globalThis.Response(JSON.stringify(String(url).includes('/workflows/')?workflow:String(url).includes('/artifacts/')?meta2:record));
  };
  const destination=join(tmp,'artifact.zip');const result=await retrieveArtifact(request2,destination,{token:'SYNTHETIC_TOKEN',deadlineMs:100000,now:()=>0,fetchImpl});
  assert.equal(calls.length,5);assert.deepEqual(await readFile(destination),raw);assert.equal(result.sha256,sha);assert.equal(JSON.stringify(result).includes('never-print-this'),false);
  const prior=calls.length;await assert.rejects(()=>retrieveArtifact(request2,destination,{token:'SYNTHETIC_TOKEN',deadlineMs:100000,now:()=>0,fetchImpl}));assert.equal(calls.length,prior+5);
 }finally{await rm(tmp,{recursive:true,force:true});}
});
test('publisher writes only its fixed projection and hash files after a held diagnostic',async()=>{
 const output=await mkdtemp(join(tmpdir(),'abi-publisher-control-'));
 try{
  const evidence=join(output,'evidence');await mkdir(evidence);await writeFile(join(evidence,'raw.stdout'),'SYNTHETIC_PRIVATE_NEVER_UPLOAD');
  const controller={output,evidence,identity:{source,runId:'789',attempt:'1'},operation:'11111111-2222-3333-4444-555555555555',checks:[],cleanupErrors:[]};
  const result=await publishProjection(controller,{passed:false,failureStage:'abi-pair-preflight'});
  assert.equal(result.controllerPassed,false);assert.equal(result.diagnosticPassed,false);assert.equal(result.rawIndependentAbiReviewAvailable,false);
  assert.deepEqual((await readdir(join(output,'publish'))).sort(),['hashes.json','result.json']);
  assert.equal((await readFile(join(output,'publish/result.json'),'utf8')).includes('SYNTHETIC_PRIVATE'),false);
  const hashes=JSON.parse(await readFile(join(output,'publish/hashes.json'),'utf8'));
  assert.equal(hashes.rawFilesPublished,0);assert.equal(hashes.result.sha256,createHash('sha256').update(await readFile(join(output,'publish/result.json'))).digest('hex'));
 }finally{await rm(output,{recursive:true,force:true});}
});
