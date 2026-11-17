import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {constants} from 'node:fs';
import {copyFile,lstat,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
const P=fileURLToPath(new URL('./',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
export const EXPECTED_ORIGINAL_RECIPE_SHA='a07789523acde85029d60a6ea1f172b6438fc9e3b302b4f47be21a083921f63d';
export const EXPECTED_PATCH_SHA='2d828dfe3dee8f48174707cdc3bf0f08ed9803bb989fb43dceb98c04a0aee48f';
export const INSERT=`# Exact upstream branch test-only oracle correction; both named tests remain.
stage=xfd-upstream-test-backport
cd baseline
cmp sysdeps/x86/tst-cpu-features-cpuinfo.c /qualification-inputs/xfd-oracle-before.c
mkdir -p debian/patches/local
test ! -e debian/patches/local/vivalatax-upstream-xfd-test.patch
cp /qualification-inputs/upstream-xfd-test.patch debian/patches/local/vivalatax-upstream-xfd-test.patch
printf '\\nlocal/vivalatax-upstream-xfd-test.patch\\n' >> debian/patches/series
QUILT_PATCHES=debian/patches quilt --quiltrc=- push --fuzz=0 > /qualification-out/xfd-test-backport.log 2>&1
cmp sysdeps/x86/tst-cpu-features-cpuinfo.c /qualification-inputs/xfd-oracle-after.c
cd /qualification-work
`;
export function deriveRecipe(original){
 assert.equal(sha(original),EXPECTED_ORIGINAL_RECIPE_SHA,'Exact original recipe required.');
 const marker='cp -a baseline candidate\n';assert.equal(original.split(marker).length,2);
 assert.equal(original.split('fullOriginalSuitesRetained').length,2);
 return original.replace(marker,INSERT+marker).replace('fullOriginalSuitesRetained','fullSuitesWithExactXfdOracleBackportRetained');
}
async function bytes(path,max=1024*1024){const s=await lstat(path);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&s.size<=max);return readFile(path);}
export async function prepareXfdExperiment({prepared,manifest,evidence}){
 const original=await bytes(join(prepared,'build-packages.sh'));assert.equal(sha(original),EXPECTED_ORIGINAL_RECIPE_SHA);
 assert.deepEqual(manifest.recipeFiles['build-packages.sh'],{bytes:original.length,sha256:EXPECTED_ORIGINAL_RECIPE_SHA});
 const inputs=join(prepared,'inputs'),oldLedger=await bytes(join(inputs,'SHA256SUMS'));
 const oldRows=new Map();
 for(const line of oldLedger.toString().trimEnd().split('\n')){const m=/^([a-f0-9]{64}) {2}([A-Za-z0-9_.+~-]+)$/.exec(line);assert.ok(m&&!oldRows.has(m[2]));oldRows.set(m[2],m[1]);}
 assert.deepEqual((await readdir(inputs)).sort(),['SHA256SUMS',...oldRows.keys()].sort());
 for(const [name,digest]of oldRows)assert.equal(sha(await bytes(join(inputs,name),32*1024*1024)),digest);
 const sourcePins={'upstream.patch':EXPECTED_PATCH_SHA,'xfd-oracle-before.c':'f5b68cc950a49835e2f629dbb6c7dec8a147f4e93014d8a406948056d2e57ad2','xfd-oracle-after.c':'f9d94c7fbbe811323382b37ee882753ef1aed663e0e29cd368e6b7288da7e7ac'};
 for(const [name,digest]of Object.entries(sourcePins))assert.equal(sha(await bytes(join(P,name))),digest);
 for(const name of ['build-packages.original.sh','SHA256SUMS.original'])await assert.rejects(lstat(join(prepared,name)),{code:'ENOENT'});
 await assert.rejects(lstat(join(evidence,'xfd-experiment-binding.json')),{code:'ENOENT'});
 const additions=[['upstream.patch','upstream-xfd-test.patch'],['xfd-oracle-before.c','xfd-oracle-before.c'],['xfd-oracle-after.c','xfd-oracle-after.c']];
 for(const [,name] of additions)await assert.rejects(lstat(join(inputs,name)),{code:'ENOENT'});
 // Original authenticated preparation receipts and original bytes are preserved.
 await rename(join(prepared,'build-packages.sh'),join(prepared,'build-packages.original.sh'));
 const effective=deriveRecipe(original.toString());
 await writeFile(join(prepared,'build-packages.sh'),effective,{flag:'wx',mode:0o600});
 for(const [source,name]of additions){await copyFile(join(P,source),join(inputs,name),constants.COPYFILE_EXCL);assert.equal(sha(await bytes(join(inputs,name))),sourcePins[source]);oldRows.set(name,sourcePins[source]);}
 await rename(join(inputs,'SHA256SUMS'),join(prepared,'SHA256SUMS.original'));
 await writeFile(join(inputs,'SHA256SUMS'),[...oldRows].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([n,h])=>`${h}  ${n}\n`).join(''),{flag:'wx',mode:0o600});
 const binding={experimentOnly:true,originalRecipeSha256:EXPECTED_ORIGINAL_RECIPE_SHA,effectiveRecipeSha256:sha(effective),officialUpstreamPatchSha256:EXPECTED_PATCH_SHA,upstreamBranchCommit:'8c7c188d62d76acda1b273b0d4d9c3b32983b28d',upstreamBranch:'arm/gcs',upstreamSecurityOrStableBackportClaim:false,exactOnlyOracleFile:'sysdeps/x86/tst-cpu-features-cpuinfo.c',bothNamedTestsRetained:true,allOtherRecipeBytesRetainedExceptHonestStatusField:true,strictXpassGateRetained:true,originalAuthenticatedPreparationReceiptUnchanged:true,candidateReleaseQualified:false,genericAbiApproval:false,riskAccepted:false};
 await writeFile(join(evidence,'xfd-experiment-binding.json'),JSON.stringify(binding,null,2)+'\n',{flag:'wx',mode:0o600});
 const derived=globalThis.structuredClone(manifest);derived.recipeFiles['build-packages.sh']={bytes:Buffer.byteLength(effective),sha256:sha(effective)};
 return {manifest:derived,binding};
}
