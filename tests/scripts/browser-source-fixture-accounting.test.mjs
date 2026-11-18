// Spec Browser-Source-Fixture-Accounting. Pure source reads; never launches a browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {URL,fileURLToPath} from 'node:url';
import {verifyAudit,snapshot} from '../../scripts/run-browser-tests.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),FIXTURE='tests/fixtures/glibc-mandatory-pass/positive-output.json',PIN='990ec3aa9bf540846db27bcffa888af20d1dc2eda0458423a2f005a0924d682e';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function audited(){return JSON.parse(await readFile(join(ROOT,'scripts/browser-request-budgets.json'),'utf8'));}
test('reviewed glibc fixture is pinned in the complete original source audit',async()=>{
 const audit=await audited(),bytes=await readFile(join(ROOT,FIXTURE));assert.equal(bytes.length,7375);assert.equal(hash(bytes),PIN);assert.equal(audit.sourceHashes[FIXTURE],PIN);await verifyAudit(ROOT,audit);
});
test('strict source verifier still rejects omitted changed and additional fixture bytes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'browser-source-accounting-'));try{
  const {sourceDirs,sourceFiles}=await audited();for(const dir of sourceDirs)await mkdir(join(root,dir),{recursive:true});for(const name of sourceFiles){await mkdir(dirname(join(root,name)),{recursive:true});await writeFile(join(root,name),'synthetic-source-boundary');}
  const audit={sourceDirs,sourceFiles,sourceHashes:await snapshot(root,sourceDirs,sourceFiles)};await verifyAudit(root,audit);
  await mkdir(dirname(join(root,FIXTURE)),{recursive:true});const data=await readFile(join(ROOT,FIXTURE));await writeFile(join(root,FIXTURE),data);await assert.rejects(()=>verifyAudit(root,audit),/Changed.new source/);
  audit.sourceHashes=Object.fromEntries(Object.entries({...audit.sourceHashes,[FIXTURE]:PIN}).sort(([a],[b])=>a<b?-1:a>b?1:0));await verifyAudit(root,audit);
  await writeFile(join(root,FIXTURE),'changed bytes');await assert.rejects(()=>verifyAudit(root,audit),/Changed.new source/);await writeFile(join(root,FIXTURE),data);await writeFile(join(root,'tests/fixtures/unreviewed.json'),'new unaudited bytes');await assert.rejects(()=>verifyAudit(root,audit),/Changed.new source/);
 }finally{await rm(root,{recursive:true,force:true});}
});
