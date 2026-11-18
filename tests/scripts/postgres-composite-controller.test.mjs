import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {URL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Controller} from '../../scripts/qualify-postgres-backports-amd64.mjs';
import {MinimalRuntimeController} from '../../scripts/qualify-postgres-minimal-runtime-amd64.mjs';
import {MinimalDbCompatibilityController} from '../../scripts/qualify-postgres-minimal-db-amd64.mjs';
import {MinimalCompositeController,validateCompositeConfig,sealedBuildContext} from '../../scripts/qualify-postgres-minimal-composite-amd64.mjs';

test('actual original recipe derives only status pin and retains component labels/config',async()=>{
 const dockerfile=await readFile(new URL('../../infra/postgres-minimal-runtime/Dockerfile',import.meta.url),'utf8'),script=await readFile(new URL('../../infra/postgres-minimal-runtime/remove-runtime-packages.sh',import.meta.url),'utf8');
 const generated=sealedBuildContext(dockerfile,script,'d'.repeat(64));assert.equal(generated.script.replace('expected_status='+'d'.repeat(64),'expected_status=115f014bc7b114c49ee0321b01f9cd3b3f1bdd608cc97812010c9452970c4806'),script);
 assert.equal(generated.dockerfile,dockerfile.slice(0,dockerfile.indexOf('LABEL ')));assert.throws(()=>sealedBuildContext(dockerfile,script+'\n'+script,'d'.repeat(64)));assert.throws(()=>sealedBuildContext(dockerfile,script,'unknown'));
 const base={Entrypoint:['docker-entrypoint.sh'],Cmd:['postgres'],User:'root',Env:['PG_MAJOR=16'],Labels:{'io.vivalatax.qualification.operation':'prior','io.vivalatax.source-manifest-sha256':'f'.repeat(64),'io.vivalatax.candidate-release-qualified':'false','io.vivalatax.risk-accepted':'false'}};
 const candidate=globalThis.structuredClone(base);candidate.Labels['io.vivalatax.qualification.operation']='current';assert.equal(validateCompositeConfig(base,candidate,'current'),true);
 for(const edit of [x=>x.Env=[],x=>x.Cmd=['true'],x=>x.Labels['io.vivalatax.source-manifest-sha256']='foreign',x=>x.Labels['unexpected']='yes',x=>x.Labels['io.vivalatax.candidate-release-qualified']='true']){const changed=globalThis.structuredClone(candidate);edit(changed);assert.throws(()=>validateCompositeConfig(base,changed,'current'));}
});

async function absent(root,secret){for(const item of await readdir(root,{withFileTypes:true})){assert.ok(!item.name.includes(secret));const path=join(root,item.name);if(item.isDirectory())await absent(path,secret);else assert.ok(!(await readFile(path)).includes(secret));}}
test('composite actual publication has truthful profile and no private success/failure/cleanup surfaces',async()=>{
 for(const failure of ['none','db','cleanup']){const dir=await mkdtemp(join(tmpdir(),'composite-publication-'));try{
  const c=new MinimalCompositeController(dir,'unused-package','unused-runtime',{}),secret='composite-auth-adversarial-538';c.identity={source:'1'.repeat(40),runId:'7',attempt:'1',extra:secret};
  c.initialize=async()=>{await mkdir(c.private);c.evidence=join(dir,'evidence');await mkdir(c.evidence);};c.command=async()=>'';
  c.build=async()=>{c.databasePrivate=join(c.private,'database-scope');await mkdir(c.databasePrivate);c.private=c.databasePrivate;await writeFile(join(c.private,'unexpected-inspect.stdout'),secret);c.checks.push({step:secret,exit:0,args:[secret],env:secret});if(failure==='db')throw Error(secret);c.databaseCompatibilityCompleted=true;c.compositionComplete=true;};
  c.cleanup=async()=>{await writeFile(join(c.private,'cleanup.stderr'),secret);if(failure==='cleanup')throw Error(secret);c.cleanupVerified=true;};
  const r=await c.run();assert.equal(r.passed,failure==='none');assert.equal(r.rawOfficialBaseOnly,false);assert.equal(r.profile,'libxml2-gosu-composite-v1');assert.ok(!('checks'in r));assert.equal(r.candidateReleaseQualified,false);await absent(c.evidence,secret);assert.ok(!JSON.stringify(r).includes(secret));
 }finally{await rm(dir,{recursive:true,force:true});}}
});

test('after stronger volume cleanup original import cleanup excludes duplicate volume removal',async()=>{
 const old=MinimalDbCompatibilityController.prototype.cleanup;
 try{const dir=await mkdtemp(join(tmpdir(),'composite-import-cleanup-'));try{
  const c=new MinimalCompositeController(dir,'unused-package','unused-runtime',{});c.connection={args:[]};c.commandEnv={};c.imported='b'.repeat(64);c.importedOperation='prior-qualified-builder';c.volumes=['already-removed'];const calls=[];
  MinimalDbCompatibilityController.prototype.cleanup=async function(){calls.push('strong-parent-cleanup');this.cleanupVerified=true;};
  c.command=async(step,exe,args)=>{calls.push(args);if(args[0]==='image'&&args[1]==='inspect')return JSON.stringify([{Id:'sha256:'+c.imported,Config:{Labels:{'io.vivalatax.qualification.operation':c.importedOperation}}}]);return '';};
  await c.cleanup();assert.equal(calls[0],'strong-parent-cleanup');assert.ok(calls.some(x=>Array.isArray(x)&&x[0]==='image'&&x[1]==='rm'&&x.at(-1)==='sha256:'+c.imported));assert.ok(!calls.some(x=>Array.isArray(x)&&x[0]==='volume'));assert.equal(c.cleanupVerified,true);
  c.unconfirmedChild=true;calls.length=0;await c.cleanup();assert.ok(!calls.some(x=>Array.isArray(x)));assert.ok(c.cleanupErrors.length>0);
 }finally{await rm(dir,{recursive:true,force:true});}}finally{MinimalDbCompatibilityController.prototype.cleanup=old;}
});

test('native database SQL and init assertions remain inherited unchanged',()=>{
 const c=new MinimalCompositeController('/not-used','package','runtime',{});assert.equal(c.databaseChecks,Controller.prototype.databaseChecks);assert.equal(c.initMatrix,MinimalDbCompatibilityController.prototype.initMatrix);assert.equal(c.nativeRecovery,MinimalDbCompatibilityController.prototype.nativeRecovery);assert.equal(c.limit.controllerMinutes,65);assert.equal(c.cleanupReserve,600000);
});

test('immutable scanner binding and every original scan assertion differ only truthful profile fields',()=>{
 const original=MinimalRuntimeController.prototype.scanVariant.toString();const explicit=MinimalCompositeController.prototype.scanVariant.toString().replace('profile:PROFILE,rawOfficialBaseOnly:false','rawOfficialBaseOnly:true');assert.equal(explicit,original);
});

test('full composite build admits inputs and derived seal before purge, scans before unchanged DB calls',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'composite-build-protocol-'));try{
  const c=new MinimalCompositeController(dir,'package','runtime',{});await mkdir(c.private);c.evidence=join(dir,'evidence');await mkdir(c.evidence);c.identity={source:'1'.repeat(40),runId:'7',attempt:'1'};const order=[];
  const config={Entrypoint:['docker-entrypoint.sh'],Cmd:['postgres'],Labels:{'io.vivalatax.qualification.operation':'prior','io.vivalatax.candidate-release-qualified':'false','io.vivalatax.risk-accepted':'false'}};
  const baseId='b'.repeat(64),id='c'.repeat(64);c.preexistingImages=new Set();c.verifyPolicy=async()=>order.push('policy');c.inputs=async()=>{order.push('inputs');return {runtime:{image:baseId},package:{image:'a'.repeat(64)}};};c.loadComposite=async()=>{order.push('original-import');return {image:baseId};};
  c.inspect=async step=>({Id:'sha256:'+(step==='composition-raw-image'?'68beac29d3dda63428173674fa868d5544913658694cd4b09f6f15230a0ba1bb':step==='composition-runtime-image'?baseId:id),Os:'linux',Architecture:'amd64',Size:1000,Config:{...config,Labels:{...config.Labels,'io.vivalatax.qualification.operation':step==='composition-candidate-image'?c.operation:'prior'}},RepoTags:[],RepoDigests:[],Parent:''});
  c.inventory=async variant=>order.push('inventory-'+variant);c.deriveSeal=async()=>{order.push('seal');await writeFile(join(c.evidence,'composition-seal.json'),'synthetic protocol only');return {statusSha256:'d'.repeat(64)};};
  c.docker=async(step,args)=>{order.push(step);if(args[0]==='build'){assert.ok(order.indexOf('seal')<order.length-1);await writeFile(args[args.indexOf('--iidfile')+1],'sha256:'+id);}return '';};
  c.pair=async()=>{order.push('strict-pair');return {pairedInventoryPassed:true};};c.setupScanners=async()=>order.push('fresh-scanners');c.scanVariant=async variant=>order.push('scan-'+variant);c.enterDatabaseScope=async()=>order.push('private-before-auth');c.initMatrix=async variant=>{order.push('init-'+variant);c.matrix.push({variant});};c.nativeRecovery=async base=>{assert.equal(base,baseId);order.push('original-recovery');await writeFile(join(c.private,'recovery.dump'),'synthetic');};
  await c.build();assert.deepEqual(order,['policy','inputs','original-import','composition-raw-pull','inventory-raw','inventory-composite','seal','composition-offline-build','inventory-candidate','strict-pair','fresh-scanners','scan-composite','scan-candidate','private-before-auth','init-baseline','init-candidate','original-recovery']);assert.equal(c.compositionComplete,true);
  const report=JSON.parse(await readFile(join(c.evidence,'composite-db-compatibility.json'),'utf8'));assert.equal(report.rawOfficialBaseOnly,false);assert.equal(report.sameRunComponentBaselineRollbackPassed,true);assert.equal(report.candidateReleaseQualified,false);
  c.deadline=0;await assert.rejects(()=>c.build(),/Insufficient/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('source policy checks every fixed dependency and records explicit nonraw authority',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'composite-policy-'));try{const c=new MinimalCompositeController(dir,'p','r',{});c.evidence=join(dir,'evidence');await mkdir(c.evidence);c.identity={source:'1'.repeat(40)};await c.verifyPolicy();const binding=JSON.parse(await readFile(join(c.evidence,'composition-source-binding.json'),'utf8'));assert.equal(binding.rawOfficialBaseOnly,false);assert.equal(binding.policy.derivedOnlyFromQualifiedInputs,true);assert.equal(Object.keys(binding.policy.files).length,13);}finally{await rm(dir,{recursive:true,force:true});}
});

test('workflow original three jobs inverse exact and fourth job is current-run strict dependency',async()=>{
 const original=await readFile(new URL('../../.github/workflows/postgres-backports-amd64.yml',import.meta.url),'utf8');const candidate=await readFile(new URL('../../.github/workflows/postgres-minimal-composite-amd64.yml',import.meta.url),'utf8');
 const prefix=candidate.slice(0,candidate.indexOf('  minimal-composite:')).replace('Native AMD64 PostgreSQL minimal composite (opt-in)','Native AMD64 PostgreSQL backports (opt-in)').replace('group: postgres-minimal-composite-amd64-','group: postgres-backports-amd64-').replace('node scripts/qualify-postgres-composite-runtime-amd64.mjs ','node scripts/qualify-postgres-backports-amd64.mjs runtime ');assert.equal(prefix,original);
 const job=candidate.slice(candidate.indexOf('  minimal-composite:'));for(const value of ['needs: [package, runtime, independent]','timeout-minutes: 75','contents: read','persist-credentials: false','${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}'])assert.ok(job.includes(value));for(const value of ['continue-on-error','retry','secrets: write','contents: write'])assert.ok(!job.includes(value));
});
