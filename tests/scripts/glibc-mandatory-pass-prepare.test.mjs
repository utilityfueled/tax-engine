// Spec: spec/ops/glibc-six-mandatory-pass.yaml.
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFileSync,mkdtempSync,writeFileSync,rmSync,mkdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {URL} from 'node:url';
import {createHash} from 'node:crypto';
import {deriveRecipe} from '../../infra/postgres-glibc-xfd-experiment/experiment.mjs';
import {deriveIfuncRecipe} from '../../infra/postgres-glibc-ifunc-experiment/experiment.mjs';
const baseline=process.argv.includes('--baseline');
const authority=readFileSync(new URL('../../infra/postgres-glibc-ifunc-experiment/debian-xfail-authority.mk',import.meta.url),'utf8');
const M=baseline?{deriveMandatoryInclude:x=>x}:await import('../../infra/postgres-glibc-mandatory-pass/experiment.mjs');
const names=['tst-create-detached','tst-robust8','tst-cpuclock2','tst-cputimer1','tst-timer','tst-support_descriptors'];
function values(data,obj,arch='x86_64',effective=false){
 const dir=mkdtempSync(join(tmpdir(),'mandatory-make-'));
 try{
  const inc=join(dir,'include.mk');writeFileSync(inc,data);
  const makefile=join(dir,'Makefile');writeFileSync(makefile,`config-machine := ${arch}\nconfig-os := linux-gnu\ncommon-objpfx := ${obj}\ninclude ${inc}\n.PHONY: show\nshow:\n\t@printf '%s\\n' ${names.map(n=>`'${n}=${effective?`$(if $(test-xfail-${n}),true,false)`:`$(test-xfail-${n})`}'`).join(' ')}\n`);
  const r=spawnSync('make',['--no-print-directory','-f',makefile,'show'],{encoding:'utf8',timeout:1000});assert.equal(r.status,0,r.stderr);return r.stdout;
 }finally{rmSync(dir,{recursive:true});}
}
for(const variant of ['baseline','candidate'])test(`${variant} original amd64-libc removes exactly six allowances`,()=>{
 const text=M.deriveMandatoryInclude(authority);assert.ok(text.startsWith(authority));const r=values(text,`/qualification-work/${variant}/build-tree/amd64-libc/`);for(const n of names)assert.ok(r.includes(n+'=\n'));
});
for(const obj of ['/qualification-work/baseline/build-tree/amd64-i386/','/qualification-work/candidate/build-tree/amd64-x32/','/unknown/amd64-libc/','/qualification-work/baseline/build-tree/amd64-libc','/qualification-work/baseline/build-tree/amd64-libc//','/qualification-work/other/build-tree/amd64-libc/','','/qualification-work/baseline/build-tree/amd64-libc/ extra'])test(`unselected scope exact inverse ${obj}`,()=>assert.equal(values(M.deriveMandatoryInclude(authority),obj),values(authority,obj)));
test('altered authority is rejected',()=>assert.throws(()=>M.deriveMandatoryInclude(authority+'#drift\n')));

// The signed Makeconfig tests nonemptiness, not the literal word yes.
const makeconfig=JSON.parse(readFileSync(new URL('../../infra/postgres-glibc-mandatory-pass/authority.json',import.meta.url))).sources.Makeconfig.text;
assert.ok(makeconfig.includes('$(if $(test-xfail-$(test-xfail-name)),true,false)'));
for(const variant of ['baseline','candidate'])test(`${variant} actual Makeconfig nonempty evaluator disables all six`,()=>{const r=values(M.deriveMandatoryInclude(authority),`/qualification-work/${variant}/build-tree/amd64-libc/`,'x86_64',true);for(const n of names)assert.ok(r.includes(n+'=false\n'));});

if(!baseline){
 test('explicit mandatory profile defaults off and rejects unknown modes',()=>{assert.equal(M.mandatoryPassEnabled({}),false);assert.equal(M.mandatoryPassEnabled({TAX_GLIBC_MANDATORY_PASS:'0'}),false);assert.equal(M.mandatoryPassEnabled({TAX_GLIBC_MANDATORY_PASS:'1'}),true);for(const value of ['yes','true','',1])assert.throws(()=>M.mandatoryPassEnabled({TAX_GLIBC_MANDATORY_PASS:value}));});
}

if(!baseline){
 const hash=b=>createHash('sha256').update(b).digest('hex');
 const originalRecipe=deriveIfuncRecipe(deriveRecipe(readFileSync(new URL('../../infra/postgres-glibc-backport/build-packages.sh',import.meta.url),'utf8')));
 test('opt-in recipe has exact inverse and original full gates/resources',()=>{const changed=M.deriveMandatoryRecipe(originalRecipe);const inverse=changed.replace(M.INSERT,'').replace(' --mandatory-pass /qualification-inputs/profile.py','').replace('# six fixed native failure allowances are disabled by the separate profile; no skipped architecture pass or forced success.','# expected-failure-list edit, skipped architecture pass or forced success.');assert.equal(inverse,originalRecipe);assert.ok(changed.includes("grep -Eq '^(FAIL|XPASS|UNRESOLVED|ERROR):'"));assert.ok(changed.includes('DEB_BUILD_OPTIONS=parallel=2 dpkg-buildpackage -b -uc -us'));assert.throws(()=>M.deriveMandatoryRecipe(originalRecipe+'drift'));});
 test('fresh prepared context retains old ledger and pins all three additive inputs',async()=>{const dir=mkdtempSync(join(tmpdir(),'mandatory-prepare-'));try{const prepared=join(dir,'prepared'),evidence=join(dir,'evidence');mkdirSync(prepared);mkdirSync(evidence);mkdirSync(join(prepared,'inputs'));writeFileSync(join(prepared,'build-packages.sh'),originalRecipe);writeFileSync(join(prepared,'inputs/debian-xfail-authority.mk'),authority);const old=hash(authority)+'  debian-xfail-authority.mk\n';writeFileSync(join(prepared,'inputs/SHA256SUMS'),old);const manifest={recipeFiles:{'build-packages.sh':{bytes:Buffer.byteLength(originalRecipe),sha256:hash(originalRecipe)}}};const result=await M.prepareMandatoryProfile({prepared,manifest,evidence});assert.equal(readFileSync(join(prepared,'build-packages.ifunc.sh'),'utf8'),originalRecipe);assert.equal(readFileSync(join(prepared,'SHA256SUMS.ifunc'),'utf8'),old);for(const [name,pin]of Object.entries(M.SOURCE_PINS))assert.equal(hash(readFileSync(join(prepared,'inputs',name))),pin);assert.equal(result.binding.sixFailureAllowancesDisabled,true);assert.equal(result.binding.strictXpassGateRetained,true);assert.equal(result.binding.historicalExecutionIdentityProven,false);assert.ok(existsSync(join(evidence,'mandatory-pass-binding.json')));}finally{rmSync(dir,{recursive:true});}});
}
