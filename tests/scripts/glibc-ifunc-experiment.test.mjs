import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,mkdtemp,mkdir,writeFile,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,URL} from 'node:url';
import {deriveRecipe,prepareXfdExperiment} from '../../infra/postgres-glibc-xfd-experiment/experiment.mjs';
import {deriveIfuncRecipe,prepareIfuncExperiment} from '../../infra/postgres-glibc-ifunc-experiment/experiment.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),P=join(ROOT,'infra/postgres-glibc-ifunc-experiment'),sha=b=>createHash('sha256').update(b).digest('hex');
const original=await readFile(join(ROOT,'infra/postgres-glibc-backport/build-packages.sh'),'utf8'),xfd=deriveRecipe(original);
test('four-only source correction preserves all assertions and six strict holds',async()=>{const b=await readFile(join(P,'ifunc-before.mk'),'utf8'),a=await readFile(join(P,'ifunc-after.mk'),'utf8');let inverse=a;for(const i of [1,2]){const after=`ifneq (no, $(with-lld))\ntest-xfail-tst-ifunc-isa-${i} = yes\ntest-xfail-tst-ifunc-isa-${i}-static = yes\nendif\n`;assert.equal(inverse.split(after).length,2);inverse=inverse.replace(after,`test-xfail-tst-ifunc-isa-${i} = $(with-lld)\ntest-xfail-tst-ifunc-isa-${i}-static = $(with-lld)\n`);}assert.equal(inverse,b);const s=deriveIfuncRecipe(xfd);assert.ok(s.includes('stage=ifunc-debian-conditional-backport'));assert.ok(s.includes("'^(FAIL|XPASS|UNRESOLVED|ERROR):'"));});
test('exact original whole recipe inverse retains every original operation',async()=>{const m=await import('../../infra/postgres-glibc-ifunc-experiment/experiment.mjs');const s=m.deriveIfuncRecipe(xfd);assert.equal(s.replace(m.IFUNC_INSERT,'').replace(m.EXPORT_INSERT,'').replace(',"fourIfuncConditionalsRetained":true,"sourceProfilesExportRequired":true',''),xfd);assert.throws(()=>m.deriveIfuncRecipe(xfd+'\n'));});
async function fixture(){const r=await mkdtemp(join(tmpdir(),'glibc-ifunc-prepared-')),prepared=join(r,'prepared'),evidence=join(r,'evidence');await mkdir(prepared);await mkdir(evidence);await mkdir(join(prepared,'inputs'));await writeFile(join(prepared,'build-packages.sh'),original);await writeFile(join(prepared,'inputs/known'),'x');await writeFile(join(prepared,'inputs/SHA256SUMS'),`${sha('x')}  known\n`);const first=await prepareXfdExperiment({prepared,evidence,manifest:{recipeFiles:{'build-packages.sh':{bytes:Buffer.byteLength(original),sha256:sha(original)}}}});return {r,prepared,evidence,manifest:first.manifest};}
test('prepared context binds exact new inputs and effective recipe without replacing authority',async()=>{const f=await fixture();try{const v=await prepareIfuncExperiment(f),s=await readFile(join(f.prepared,'build-packages.sh'));assert.deepEqual(v.manifest.recipeFiles['build-packages.sh'],{bytes:s.length,sha256:sha(s)});assert.equal(await readFile(join(f.prepared,'build-packages.xfd.sh'),'utf8'),xfd);assert.equal(await readFile(join(f.prepared,'build-packages.original.sh'),'utf8'),original);const rows=(await readFile(join(f.prepared,'inputs/SHA256SUMS'),'utf8')).trim().split('\n');assert.equal(rows.length,9);for(const l of rows){const[h,n]=l.split('  ');assert.equal(sha(await readFile(join(f.prepared,'inputs',n))),h);}assert.equal((await readdir(join(f.prepared,'inputs'))).length,10);assert.equal(v.binding.sixOtherExpectedFailuresUnchanged,true);assert.equal(v.binding.correctingUpstreamCommitClaim,false);assert.equal(v.binding.packageQualificationClaim,false);}finally{await rm(f.r,{recursive:true,force:true});}});
for(const scenario of ['recipe-drift','extra-input','existing-backup'])test('invalid input holds before modification: '+scenario,async()=>{const f=await fixture();try{if(scenario==='recipe-drift')await writeFile(join(f.prepared,'build-packages.sh'),xfd+'\n');if(scenario==='extra-input')await writeFile(join(f.prepared,'inputs/foreign'),'x');if(scenario==='existing-backup')await writeFile(join(f.prepared,'build-packages.xfd.sh'),'foreign');const before=await readFile(join(f.prepared,'build-packages.sh'));await assert.rejects(prepareIfuncExperiment(f));assert.deepEqual(await readFile(join(f.prepared,'build-packages.sh')),before);assert.equal((await readFile(join(f.prepared,'inputs/SHA256SUMS'),'utf8')).trim().split('\n').length,4);}finally{await rm(f.r,{recursive:true,force:true});}});
test('real source exporter inert controls',()=>{const r=spawnSync('python3',['-B',join(ROOT,'tests/scripts/glibc-ifunc-export.py')],{encoding:'utf8',timeout:5000,maxBuffer:1024*1024});assert.equal(r.status,0,r.stdout+r.stderr);});
test('source export admission requires complete per-suite hashes and both variants',async()=>{
 const {verifyProfileExport}=await import('../../infra/postgres-glibc-ifunc-experiment/experiment.mjs');
 for(const scenario of ['positive','hash-drift','missing-variant','unavailable','extra-profile']){
  const d=await mkdtemp(join(tmpdir(),'glibc-profile-admission-'));try{
   const profiles=[];
   for(const variant of ['baseline','candidate']){
    await mkdir(join(d,variant),{recursive:true});await writeFile(join(d,variant,'suite-paths.txt'),'build-tree/amd64-libc/tests.sum\n');
    const t=join(d,'build-profiles',variant,'amd64-libc');await mkdir(t,{recursive:true});const files={};for(const name of ['config.make','configparms','config.log']){const data='fixed '+name;await writeFile(join(t,name),data);files[name]={bytes:Buffer.byteLength(data),sha256:sha(data)};}
    profiles.push({variant,flavour:'amd64-libc',files,available:true,unavailableReasons:[],configuredWithLld:'no',configuredLd:'ld',configparmsOverrides:{},configurationWithOverrides:{'with-lld':'no',LD:'ld'},makeEvaluationPerformed:false,identityBasis:'literal-config-with-plain-configparms-overrides-only',linker:{available:true,configured:'ld',exit:0,bytes:100,sha256:'1'.repeat(64),observedAt:'export-time'}});
   }
   const value={passed:true,profiles,missingVariants:[],packageQualificationClaim:false,historicalLinkerExecutionProven:false};
   if(scenario==='hash-drift')profiles[0].files['config.make'].sha256='0'.repeat(64);
   if(scenario==='missing-variant')profiles.pop();if(scenario==='unavailable')profiles[0].available=false;if(scenario==='extra-profile')profiles.push({...profiles[0],flavour:'amd64-x32'});
   await writeFile(join(d,'build-profiles/summary.json'),JSON.stringify(value));
   if(scenario==='positive')assert.equal(await verifyProfileExport(d),true);else await assert.rejects(verifyProfileExport(d));
  }finally{await rm(d,{recursive:true,force:true});}
 }
});
test('real EXIT export hook preserves failure and holds success when evidence is unavailable',async()=>{
 const {EXPORT_INSERT}=await import('../../infra/postgres-glibc-ifunc-experiment/experiment.mjs');
 for(const [oldExit,exportExit,want]of [[0,0,0],[0,1,1],[23,0,23],[23,1,23]]){
  const r=spawnSync('/bin/bash',['-c',`set -euo pipefail\nresult=${oldExit}\npython3(){ return ${exportExit}; }\n${EXPORT_INSERT}printf '%s' "$result"\n`],{encoding:'utf8',timeout:2000,maxBuffer:1024});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,String(want));
 }
 const derived=deriveIfuncRecipe(xfd);assert.ok(derived.indexOf(EXPORT_INSERT)<derived.indexOf('ARTIFACTS.sha256'));
});
test('real two-hunk conditional patch applies exactly without fuzz or offset',async()=>{
 const d=await mkdtemp(join(tmpdir(),'glibc-ifunc-patch-'));try{
  await mkdir(join(d,'sysdeps/x86'),{recursive:true});await writeFile(join(d,'sysdeps/x86/Makefile'),await readFile(join(P,'ifunc-before.mk')));
  const r=spawnSync('/usr/bin/patch',['--batch','--forward','--fuzz=0','-p1'],{cwd:d,input:await readFile(join(P,'ifunc.patch')),encoding:'utf8',timeout:3000,maxBuffer:65536});assert.equal(r.status,0,r.stdout+r.stderr);assert.ok(!/fuzz|offset/i.test(r.stdout+r.stderr));assert.deepEqual(await readFile(join(d,'sysdeps/x86/Makefile')),await readFile(join(P,'ifunc-after.mk')));
 }finally{await rm(d,{recursive:true,force:true});}
});
