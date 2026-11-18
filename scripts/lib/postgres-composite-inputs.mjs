import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {URL,fileURLToPath} from 'node:url';
import {verifyHandoff,assertAmdGosu} from '../qualify-postgres-backports-amd64.mjs';
import {assertPackageChecksPassed} from '../build-postgres-libxml2-backport.mjs';
import {assertGosuChecksPassed} from '../build-postgres-gosu-backport.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),H=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
export const RAW_IMAGE='68beac29d3dda63428173674fa868d5544913658694cd4b09f6f15230a0ba1bb';
export const RAW_STATUS='115f014bc7b114c49ee0321b01f9cd3b3f1bdd608cc97812010c9452970c4806';
export async function admitCompositionInputs(packageDirectory,runtimeDirectory,identity){
 const expected={source:identity.source,runId:identity.runId,attempt:identity.attempt};assert.match(expected.source,/^[a-f0-9]{40}$/);assert.match(expected.runId,/^\d+$/);assert.equal(expected.attempt,'1');
 const pkg=await verifyHandoff(packageDirectory,{...expected,kind:'package'}),runtime=await verifyHandoff(runtimeDirectory,{...expected,kind:'runtime'});
 for(const [directory,kind] of [[packageDirectory,'libxml2'],[runtimeDirectory,'gosu']])assert.equal(H(await readFile(join(directory,'source-manifest.json'))),H(await readFile(join(ROOT,`infra/postgres-${kind}-backport/sources.json`))),'Foreign source manifest');
 const packageReceipt=await json(join(packageDirectory,'build-receipt.json')),runtimeReceipt=await json(join(runtimeDirectory,'build-receipt.json')),summary=await json(join(runtimeDirectory,'runtime-summary.json'));
 assert.equal(runtimeReceipt.baseImage,pkg.image);assert.equal(runtimeReceipt.requestedBase,'sha256:'+pkg.image);assert.equal(summary.baseImage,pkg.image);assert.equal(summary.image,runtime.image);
 for(const k of ['sixConsumersUnchanged','privilegeChecks','postgresRecoveryChecks'])assert.equal(summary[k],true);
 assertPackageChecksPassed(await json(join(packageDirectory,'package-status.json')));assertGosuChecksPassed(await json(join(runtimeDirectory,'gosu-status.json')));
 const deb=await readFile(join(packageDirectory,'candidate-package.deb')),gosu=await readFile(join(runtimeDirectory,'gosu'));assert.equal(packageReceipt.runtimePackageSha256,H(deb));assert.equal(runtimeReceipt.artifacts.binarySha256,H(gosu));
 assert.equal(runtimeReceipt.artifacts.manifestSha256,H(await readFile(join(runtimeDirectory,'artifact-hashes.txt'))));assert.equal(summary.noticesSha256,H(await readFile(join(runtimeDirectory,'THIRD-PARTY-LICENSES.txt'))));assert.match(summary.consumerHashesSha256,/^[a-f0-9]{64}$/);
 assertAmdGosu(gosu,await readFile(join(runtimeDirectory,'go-metadata.txt'),'utf8'));
 const libxml=await json(join(packageDirectory,'source-manifest.json'));assert.equal(typeof libxml.privateCandidateVersion,'string');assert.ok(libxml.privateCandidateVersion.length>0);
 return {package:pkg,runtime,packageReceipt,runtimeReceipt,summary,packageDirectory,runtimeDirectory,
  authority:{...expected,packageImage:pkg.image,runtimeImage:runtime.image,rawImage:RAW_IMAGE,rawStatusSha256:RAW_STATUS,debSha256:H(deb),gosuSha256:H(gosu),privateVersion:libxml.privateCandidateVersion,providerPath:'usr/lib/x86_64-linux-gnu/libxml2.so.2.9.14'}};
}
