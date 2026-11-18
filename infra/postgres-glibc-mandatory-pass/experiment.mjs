// Spec: spec/ops/glibc-six-mandatory-pass.yaml. Separate default-off contract.
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {constants} from 'node:fs';
import {copyFile,lstat,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
const P=fileURLToPath(new URL('./',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
export const ORIGINAL_INCLUDE_SHA='c75938bb76320623f776b29f67bd21bc4d0a782c8495093998ee390db7ed3903';
export const ORIGINAL_RECIPE_SHA='288031a8d4d786aadc9fd0b16ae84f9b87169c39bc31d9c856dc587343d0eec6';
const names=['tst-create-detached','tst-robust8','tst-cpuclock2','tst-cputimer1','tst-timer','tst-support_descriptors'];
export const OVERRIDES=`\n# Distinct mandatory-PASS profile: six failure allowances disabled only for
# the original selected native full-suite profile, both paired source trees.
# No test body, assertion, workload or other flavour expectation changes.
ifneq (,$(filter /qualification-work/baseline/build-tree/amd64-libc/ /qualification-work/candidate/build-tree/amd64-libc/,$(common-objpfx)))
ifeq ($(words $(common-objpfx)),1)
${names.map(n=>`test-xfail-${n} =`).join('\n')}
endif
endif
`;
export function mandatoryPassEnabled(env){const value=env.TAX_GLIBC_MANDATORY_PASS??'0';assert.ok(['0','1'].includes(value),'Explicit known mandatory profile selection required.');return value==='1';}
export function deriveMandatoryInclude(original){
 assert.equal(sha(original),ORIGINAL_INCLUDE_SHA,'Exact authenticated Debian include required.');
 return original+OVERRIDES;
}
export const INSERT=`# Separate six-case mandatory native PASS contract, both paired variants.
stage=six-mandatory-pass-profile
cmp baseline/debian/testsuite-xfail-debian.mk /qualification-inputs/debian-xfail-authority.mk
cp /qualification-inputs/mandatory-xfail-authority.mk baseline/debian/testsuite-xfail-debian.mk
`;
export function deriveMandatoryRecipe(original){
 assert.equal(sha(original),ORIGINAL_RECIPE_SHA,'Exact original derived IFUNC recipe required.');
 const marker='cp -a baseline candidate\n';
 const command='python3 /qualification-inputs/export-build-profiles.py --work /qualification-work --output /qualification-out';
 for(const token of [marker,command])assert.equal(original.split(token).length,2);
 return original.replace(marker,INSERT+marker).replace(command,command+' --mandatory-pass /qualification-inputs/profile.py').replace('# expected-failure-list edit, skipped architecture pass or forced success.','# six fixed native failure allowances are disabled by the separate profile; no skipped architecture pass or forced success.');
}
// Exact additive inputs; preceding authenticated preparation remains retained.
export const SOURCE_PINS={
 "authority.json": "bcb167212f4c0be899a00148252462b19c840d21dcdfffde092d7e8fce8901ee",
 "profile.py": "eb39d4a060c9aa8c187284ae6f4f80eeec8a4debc7c79aedd1fbb6359d4c50b2",
 "mandatory-xfail-authority.mk": "5d97ea45b34b2b6daf7a10c85fbad879e66e37495a3b78a5c5cc5c8a79a90b1a"
};
async function bytes(path,max=2*1024*1024){
 const info=await lstat(path);assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&info.uid===process.getuid()&&info.size<=max);
 return readFile(path);
}
export async function prepareMandatoryProfile({prepared,manifest,evidence}){
 const original=await bytes(join(prepared,'build-packages.sh'));
 assert.equal(sha(original),ORIGINAL_RECIPE_SHA);
 assert.deepEqual(manifest.recipeFiles['build-packages.sh'],{bytes:original.length,sha256:ORIGINAL_RECIPE_SHA});
 assert.equal(Object.keys(SOURCE_PINS).length,3,'Complete frozen mandatory profile pins required.');
 const inputs=join(prepared,'inputs'),ledger=await bytes(join(inputs,'SHA256SUMS')),rows=new Map();
 for(const line of ledger.toString().trimEnd().split('\n')){const m=/^([a-f0-9]{64}) {2}([A-Za-z0-9_.+~-]+)$/.exec(line);assert.ok(m&&!rows.has(m[2]));rows.set(m[2],m[1]);}
 assert.equal(rows.get('debian-xfail-authority.mk'),ORIGINAL_INCLUDE_SHA);
 assert.deepEqual((await readdir(inputs)).sort(),['SHA256SUMS',...rows.keys()].sort());
 for(const [name,pin]of rows)assert.equal(sha(await bytes(join(inputs,name),32*1024*1024)),pin);
 for(const [name,pin]of Object.entries(SOURCE_PINS)){assert.equal(sha(await bytes(join(P,name))),pin);await assert.rejects(lstat(join(inputs,name)),{code:'ENOENT'});}
 for(const name of ['build-packages.ifunc.sh','SHA256SUMS.ifunc'])await assert.rejects(lstat(join(prepared,name)),{code:'ENOENT'});
 await assert.rejects(lstat(join(evidence,'mandatory-pass-binding.json')),{code:'ENOENT'});
 const effective=deriveMandatoryRecipe(original.toString());
 // Exclusively owned prepared context only; partial writes are possible.
 await rename(join(prepared,'build-packages.sh'),join(prepared,'build-packages.ifunc.sh'));
 await writeFile(join(prepared,'build-packages.sh'),effective,{flag:'wx',mode:0o600});
 for(const [name,pin]of Object.entries(SOURCE_PINS)){await copyFile(join(P,name),join(inputs,name),constants.COPYFILE_EXCL);assert.equal(sha(await bytes(join(inputs,name))),pin);rows.set(name,pin);}
 await rename(join(inputs,'SHA256SUMS'),join(prepared,'SHA256SUMS.ifunc'));
 await writeFile(join(inputs,'SHA256SUMS'),[...rows].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,pin])=>`${pin}  ${name}\n`).join(''),{flag:'wx',mode:0o600});
 const binding={profile:'six-mandatory-native-pass',selectedOriginalFlavour:'amd64-libc',variants:['baseline','candidate'],defaultOff:true,oldFailurePreserved:true,originalRecipeSha256:ORIGINAL_RECIPE_SHA,effectiveRecipeSha256:sha(effective),sourceInputs:SOURCE_PINS,sixFailureAllowancesDisabled:true,allOriginalBodiesAndOtherFlavoursUnchanged:true,strictXpassGateRetained:true,originalResourcesAndPairedGatesRetained:true,historicalExecutionIdentityProven:false,candidateReleaseQualified:false,riskAccepted:false};
 await writeFile(join(evidence,'mandatory-pass-binding.json'),JSON.stringify(binding,null,2)+'\n',{flag:'wx',mode:0o600});
 const derived=globalThis.structuredClone(manifest);derived.recipeFiles['build-packages.sh']={bytes:Buffer.byteLength(effective),sha256:sha(effective)};
 return {manifest:derived,binding};
}
