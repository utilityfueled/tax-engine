import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {open} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {URL} from 'node:url';
import {validateProjection} from '../sqlite-exported-package-abi.mjs';
const REPOSITORY='utilityfueled/tax-engine';
const WORKFLOW='.github/workflows/postgres-source-candidates-amd64.yml';
const hash=/^[a-f0-9]{64}$/;
const integer=x=>assert.ok(Number.isSafeInteger(x)&&x>0);
export function validateArtifactMetadata(input,run,workflow,artifact){
 assert.deepEqual(Object.keys(input).sort(),['archiveBytes','archiveSha256','artifactId','runId','source']);
 assert.match(input.source,/^[a-f0-9]{40}$/);assert.match(input.archiveSha256,hash);
 for(const key of ['runId','artifactId','archiveBytes'])integer(input[key]);assert.ok(input.archiveBytes<=4*1024**3);
 assert.equal(workflow.path,WORKFLOW);integer(workflow.id);
 assert.equal(run.id,input.runId);assert.equal(run.workflow_id,workflow.id);assert.equal(run.path,WORKFLOW);
 assert.equal(run.head_sha,input.source);assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.event,'workflow_dispatch');
 assert.ok(['success','failure'].includes(run.conclusion));
 for(const repo of [run.repository,run.head_repository]){assert.equal(repo.full_name,REPOSITORY);assert.equal(repo.private,false);assert.equal(repo.fork,false);}
 assert.equal(artifact.id,input.artifactId);assert.equal(artifact.name,`source-candidate-amd64-sqlite-${input.source}-${input.runId}-1`);
 assert.equal(artifact.expired,false);assert.equal(artifact.size_in_bytes,input.archiveBytes);assert.equal(artifact.digest,'sha256:'+input.archiveSha256);
 assert.equal(artifact.workflow_run.id,input.runId);assert.equal(artifact.workflow_run.head_sha,input.source);
 integer(run.repository.id);assert.equal(artifact.workflow_run.repository_id,run.repository.id);
 assert.equal(artifact.workflow_run.head_repository_id,run.head_repository.id);assert.equal(run.head_repository.id,run.repository.id);
 return true;
}
export function artifactLocation(text){
 const url=new URL(text);assert.equal(url.protocol,'https:');assert.ok(!url.username&&!url.password&&!url.hash&&!url.port);
 assert.ok(/^productionresultssa\d+\.blob\.core\.windows\.net$/.test(url.hostname)||url.hostname==='results-receiver.actions.githubusercontent.com');
 return url;
}
export async function retrieveArtifact(input,destination,{token,deadlineMs,fetchImpl=globalThis.fetch,now=()=>performance.now()}){
 assert.equal(typeof token,'string');assert.ok(token.length>0);assert.ok(deadlineMs>now()&&deadlineMs-now()<=180000);
 const signal=()=>globalThis.AbortSignal.timeout(Math.max(1,Math.min(20000,Math.floor(deadlineMs-now()))));
 const request=async path=>{
  assert.ok(/^\/repos\/utilityfueled\/tax-engine\/actions\//.test(path));assert.ok(now()<deadlineMs);
  return fetchImpl('https://api.github.com'+path,{redirect:'manual',signal:signal(),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
 };
 const json=async path=>{
  const response=await request(path);assert.equal(response.status,200);assert.ok(response.body);
  const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;assert.ok(bytes<=2*1024**2&&now()<deadlineMs);chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 };
 // Validate caller types before putting identifiers into fixed API paths.
 for(const key of ['runId','artifactId'])integer(input[key]);assert.match(input.source,/^[a-f0-9]{40}$/);
 const run=await json(`/repos/${REPOSITORY}/actions/runs/${input.runId}`);
 const workflow=await json(`/repos/${REPOSITORY}/actions/workflows/postgres-source-candidates-amd64.yml`);
 const artifact=await json(`/repos/${REPOSITORY}/actions/artifacts/${input.artifactId}`);
 validateArtifactMetadata(input,run,workflow,artifact);
 const redirect=await request(`/repos/${REPOSITORY}/actions/artifacts/${input.artifactId}/zip`);
 assert.equal(redirect.status,302);const location=artifactLocation(redirect.headers.get('location'));await redirect.body?.cancel();
 // No Authorization, cookies, referrer or inherited request headers on storage.
 const response=await fetchImpl(location,{redirect:'error',signal:globalThis.AbortSignal.timeout(Math.max(1,Math.floor(deadlineMs-now())))});
 assert.equal(response.status,200);assert.ok(response.body);
 const file=await open(destination,'wx',0o600);let count=0;const digest=createHash('sha256');
 try{for await(const chunk of response.body){count+=chunk.length;assert.ok(count<=input.archiveBytes&&now()<deadlineMs);digest.update(chunk);let at=0;while(at<chunk.length){const write=await file.write(chunk,at);assert.ok(write.bytesWritten>0);at+=write.bytesWritten;}}await file.sync();}finally{await file.close();}
 assert.equal(count,input.archiveBytes);assert.equal(digest.digest('hex'),input.archiveSha256);
 return {source:input.source,runId:input.runId,artifactId:input.artifactId,name:artifact.name,bytes:count,sha256:input.archiveSha256,workflow:WORKFLOW,attempt:1,completed:true,publicRepository:true};
}
export function projectAbiResult(result,abi={},selection=null){
 assert.equal(typeof result.passed,'boolean');assert.ok(Array.isArray(result.cleanupErrors)&&result.cleanupErrors.length<=100);
 if(result.passed)assert.equal(result.cleanupErrors.length,0);
 assert.match(result.source,/^[a-f0-9]{40}$/);assert.match(result.operation,/^[a-f0-9-]{36}$/);assert.match(result.runId,/^\d+$/);assert.equal(result.attempt,'1');
 assert.ok(Array.isArray(result.checks)&&result.checks.length<=500);
 const checks=result.checks.map(row=>{assert.match(row.step,/^[a-z0-9-]{1,100}$/);assert.ok((Number.isInteger(row.exit)&&row.exit>=0&&row.exit<=255)||['unavailable','BOUNDED_COMMAND_TERMINATED','SIGTERM','SIGKILL'].includes(row.exit));return {step:row.step,exit:row.exit};});
 const rawChecks=abi.checks??[];assert.ok(Array.isArray(rawChecks)&&rawChecks.length<=30);
 const outputHashes=rawChecks.map(row=>{assert.match(row.step,/^[a-z-]{1,40}$/);assert.match(row.stdoutSha256,hash);assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>=0&&row.bytes<=1048576);return {step:row.step,bytes:row.bytes,sha256:row.stdoutSha256};});
 const toolHashes={};for(const [path,value]of Object.entries(abi.toolBinarySha256??{})){assert.ok(['/usr/bin/readelf','/usr/bin/abidiff','/usr/bin/dpkg-query'].includes(path));assert.match(value,hash);toolHashes[path]=value;}
 let packageBinding=null,originalGateOutcomes=null;
 if(abi.inputs){
  assert.match(abi.inputs.source,/^[a-f0-9]{40}$/);validateProjection(abi.inputs,abi.inputs.source);assert.match(abi.inputs.archiveSha256,hash);assert.match(abi.inputs.artifactLedgerSha256,hash);assert.match(abi.inputs.runId,/^\d+$/);
  packageBinding={source:abi.inputs.source,runId:abi.inputs.runId,archiveSha256:abi.inputs.archiveSha256,artifactLedgerSha256:abi.inputs.artifactLedgerSha256};
  for(const name of ['baseline','candidate']){const row=abi.inputs[name];assert.match(row.libraryPackageSha256,hash);assert.match(row.debugPackageSha256,hash);packageBinding[name]={version:row.version,architecture:'amd64',libraryPackage:'libsqlite3-0',debugPackage:'libsqlite3-0-dbgsym',buildId:row.buildId,librarySha256:row.librarySha256,debugSha256:row.debugSha256,libraryPackageSha256:row.libraryPackageSha256,debugPackageSha256:row.debugPackageSha256,debugInfoBytes:row.debugInfoBytes,debugAbbrevBytes:row.debugAbbrevBytes,soname:row.soname,needed:row.needed,debuglinkCrcMatches:true};}
  originalGateOutcomes={};const keys=new Set(['baselinePackageBuildExit','candidatePackageBuildExit','baselineFullTestExit','candidateFullTestExit','baselineRegressionExit','candidateRegressionExit','candidateSanitizerRegressionExit','candidateRegressionCasesPassed','baselineRegressionReproduced','candidateSanitizerRegressionCasesPassed','genericAbiApproval','candidateReleaseQualified','riskAccepted','recipeExit']);
  assert.ok(abi.inputs.originalStatus&&typeof abi.inputs.originalStatus==='object');
  for(const [key,value]of Object.entries(abi.inputs.originalStatus)){assert.ok(keys.has(key));assert.ok(typeof value==='boolean'||(Number.isInteger(value)&&value>=0&&value<=255));originalGateOutcomes[key]=value;}
 }
 if(abi.passed){assert.ok(packageBinding);assert.equal(Object.keys(toolHashes).length,3);}
 const failureStage=result.failureStage??null;if(failureStage!==null)assert.match(failureStage,/^[a-z0-9-]{1,100}$/);
 let artifactBinding=null;
 if(selection){assert.match(selection.source,/^[a-f0-9]{40}$/);assert.match(selection.sha256,hash);for(const key of ['runId','artifactId','bytes'])integer(selection[key]);assert.ok(selection.bytes<=4*1024**3);assert.equal(selection.name,`source-candidate-amd64-sqlite-${selection.source}-${selection.runId}-1`);assert.equal(selection.workflow,WORKFLOW);assert.equal(selection.attempt,1);assert.equal(selection.completed,true);assert.equal(selection.publicRepository,true);artifactBinding={source:selection.source,runId:selection.runId,artifactId:selection.artifactId,bytes:selection.bytes,sha256:selection.sha256,name:selection.name,workflow:WORKFLOW,attempt:1};if(packageBinding){assert.equal(packageBinding.source,selection.source);assert.equal(packageBinding.archiveSha256,selection.sha256);assert.equal(packageBinding.runId,String(selection.runId));}}
 return {schemaVersion:1,source:result.source,operation:result.operation,runId:result.runId,attempt:1,diagnosticPassed:result.passed&&abi.passed===true,controllerPassed:result.passed,failureStage,checks,cleanupErrorCount:result.cleanupErrors.length,outputHashes,toolHashes,toolPackageVersions:Object.keys(toolHashes).length===3?{'abigail-tools':'2.2-2',binutils:'2.40-2'}:null,packageBinding,artifactBinding,originalGateOutcomes,originalQualificationPassed:typeof abi.inputs?.originalQualificationPassed==='boolean'?abi.inputs.originalQualificationPassed:null,rawIndependentAbiReviewAvailable:false,rawCommandOutputsPublished:false,originalPackageQualificationSuperseded:false,genericAbiApproval:false,runtimeIntegrationExecuted:false,candidateReleaseQualified:false,riskAccepted:false};
}
