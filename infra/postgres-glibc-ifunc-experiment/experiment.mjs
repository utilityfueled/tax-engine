import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {constants} from 'node:fs';
import {copyFile,lstat,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
const P=fileURLToPath(new URL('./',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
export const EXPECTED_XFD_RECIPE_SHA='cc720b4183c2d96cba943ee6f90cc45098756d18969a97aae9197991367d7434';
export const SOURCE_PINS={
 'debian-xfail-authority.mk':'c75938bb76320623f776b29f67bd21bc4d0a782c8495093998ee390db7ed3903',
 'ifunc-before.mk':'0140e6fb8e5b07a2879f9cc65ac34fe290f01dbd60a476ace728abdefdc450f5',
 'ifunc-after.mk':'c92ace019719eee098249b27d7473028f896861d4434258c3aa6325c4feb4117',
 'ifunc.patch':'5b9d174c51d343e270529147f57478ca324b97fc65987466daf5aebc15f4bddd',
 'export-build-profiles.py':'600dbbdd654ac87d178b54648bb8174962fc2704875ea0023c441da146f24cf6',
};
export const IFUNC_INSERT=`# Local four-only conditional correction derived from authenticated Debian 2.44.
# Target remains pinned Debian 2.36; no correcting-upstream-commit claim.
stage=ifunc-debian-conditional-backport
cd baseline
cmp sysdeps/x86/Makefile /qualification-inputs/ifunc-before.mk
mkdir -p debian/patches/local
test ! -e debian/patches/local/vivalatax-ifunc-conditions.patch
cp /qualification-inputs/ifunc.patch debian/patches/local/vivalatax-ifunc-conditions.patch
printf '\\nlocal/vivalatax-ifunc-conditions.patch\\n' >> debian/patches/series
QUILT_PATCHES=debian/patches quilt --quiltrc=- push --fuzz=0 > /qualification-out/ifunc-condition-backport.log 2>&1
cmp sysdeps/x86/Makefile /qualification-inputs/ifunc-after.mk
cd /qualification-work
`;
export const EXPORT_INSERT=`    # Export literal configuration before the unchanged artifact ledger.
    # Preserve the original failing exit; an unavailable export holds success.
    if ! python3 /qualification-inputs/export-build-profiles.py --work /qualification-work --output /qualification-out; then
        if [ "$result" = 0 ]; then result=1; fi
    fi
`;
export function deriveIfuncRecipe(original){
 assert.equal(sha(original),EXPECTED_XFD_RECIPE_SHA,'Exact XFD intermediate recipe required.');
 const marker='cp -a baseline candidate\n',finish='    python3 - "$stage" "$result" <<\'PY\'\n',status='"riskAccepted":false';
 for(const m of [marker,finish,status])assert.equal(original.split(m).length,2);
 return original.replace(marker,IFUNC_INSERT+marker).replace(finish,EXPORT_INSERT+finish).replace(status,status+',"fourIfuncConditionalsRetained":true,"sourceProfilesExportRequired":true');
}
async function bytes(path,max=1024*1024){const s=await lstat(path);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&s.size<=max);return readFile(path);}
export async function prepareIfuncExperiment({prepared,manifest,evidence}){
 const original=await bytes(join(prepared,'build-packages.sh'));assert.equal(sha(original),EXPECTED_XFD_RECIPE_SHA);
 assert.deepEqual(manifest.recipeFiles['build-packages.sh'],{bytes:original.length,sha256:EXPECTED_XFD_RECIPE_SHA});
 const inputs=join(prepared,'inputs'),oldLedger=await bytes(join(inputs,'SHA256SUMS')),rows=new Map();
 for(const line of oldLedger.toString().trimEnd().split('\n')){const m=/^([a-f0-9]{64}) {2}([A-Za-z0-9_.+~-]+)$/.exec(line);assert.ok(m&&!rows.has(m[2]));rows.set(m[2],m[1]);}
 assert.deepEqual((await readdir(inputs)).sort(),['SHA256SUMS',...rows.keys()].sort());
 for(const [name,digest]of rows)assert.equal(sha(await bytes(join(inputs,name),32*1024*1024)),digest);
 // Check every source input and every destination before any context mutation.
 for(const [name,digest]of Object.entries(SOURCE_PINS)){assert.equal(sha(await bytes(join(P,name))),digest);await assert.rejects(lstat(join(inputs,name)),{code:'ENOENT'});}
 for(const name of ['build-packages.xfd.sh','SHA256SUMS.xfd'])await assert.rejects(lstat(join(prepared,name)),{code:'ENOENT'});
 await assert.rejects(lstat(join(evidence,'ifunc-experiment-binding.json')),{code:'ENOENT'});
 const effective=deriveIfuncRecipe(original.toString());
 // Exclusively owned prepared context only; no atomic rollback or hostile-writer guarantee.
 await rename(join(prepared,'build-packages.sh'),join(prepared,'build-packages.xfd.sh'));
 await writeFile(join(prepared,'build-packages.sh'),effective,{flag:'wx',mode:0o600});
 for(const [name,digest]of Object.entries(SOURCE_PINS)){await copyFile(join(P,name),join(inputs,name),constants.COPYFILE_EXCL);assert.equal(sha(await bytes(join(inputs,name))),digest);rows.set(name,digest);}
 await rename(join(inputs,'SHA256SUMS'),join(prepared,'SHA256SUMS.xfd'));
 await writeFile(join(inputs,'SHA256SUMS'),[...rows].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([n,h])=>`${h}  ${n}\n`).join(''),{flag:'wx',mode:0o600});
 const binding={experimentOnly:true,targetDebianSource:'2.36-9+deb12u14',authorityDebianSource:'2.44-1',authorityManifestSha256:'7c5c5fc859225cca222d2cd25127ac6d973445296f2e893fa0ca2f0bb39df5a7',xfdIntermediateRecipeSha256:EXPECTED_XFD_RECIPE_SHA,effectiveRecipeSha256:sha(effective),sourceInputs:SOURCE_PINS,exactOnlyOracleFile:'sysdeps/x86/Makefile',fourOnlyConditionalCorrection:true,sixOtherExpectedFailuresUnchanged:true,everyTestBodyAndAssertionUnchanged:true,strictXpassGateRetained:true,sourceProfilesExportRequired:true,linkerIdentityObservation:'export-time-not-historical-execution-proof',originalAuthenticatedPreparationReceiptUnchanged:true,correctingUpstreamCommitClaim:false,packageQualificationClaim:false,candidateReleaseQualified:false,genericAbiApproval:false,riskAccepted:false};
 await writeFile(join(evidence,'ifunc-experiment-binding.json'),JSON.stringify(binding,null,2)+'\n',{flag:'wx',mode:0o600});
 const derived=globalThis.structuredClone(manifest);derived.recipeFiles['build-packages.sh']={bytes:Buffer.byteLength(effective),sha256:sha(effective)};
 return {manifest:derived,binding};
}
export async function verifyProfileExport(root){
 const summary=JSON.parse(await bytes(join(root,'build-profiles/summary.json')));
 assert.equal(summary.passed,true);assert.equal(summary.packageQualificationClaim,false);assert.equal(summary.historicalLinkerExecutionProven,false);
 assert.deepEqual(summary.missingVariants,[]);assert.ok(Array.isArray(summary.profiles)&&summary.profiles.length>0&&summary.profiles.length<=16);
 const expected=[];
 for(const variant of ['baseline','candidate'])for(const p of (await bytes(join(root,variant,'suite-paths.txt'))).toString().trim().split('\n')){assert.match(p,/^build-tree\/amd64-(?:libc|i386|x32)\/tests\.sum$/);expected.push(variant+'/'+p.split('/')[1]);}
 assert.deepEqual(summary.profiles.map(p=>p.variant+'/'+p.flavour).sort(),expected.sort());
 for(const row of summary.profiles){
  assert.equal(row.available,true);assert.deepEqual(row.unavailableReasons,[]);assert.equal(row.linker.available,true);assert.equal(row.linker.exit,0);assert.match(row.linker.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(row.linker.bytes)&&row.linker.bytes>0&&row.linker.bytes<=64*1024*1024);assert.equal(row.linker.observedAt,'export-time');
  assert.equal(typeof row.configuredWithLld,'string');assert.equal(typeof row.configuredLd,'string');
  assert.equal(row.makeEvaluationPerformed,false);assert.deepEqual(row.configurationWithOverrides,{'with-lld':row.configuredWithLld,LD:row.configuredLd,...row.configparmsOverrides});assert.equal(row.linker.configured,row.configurationWithOverrides.LD);
  assert.equal(row.identityBasis,'literal-config-with-plain-configparms-overrides-only');
  assert.deepEqual(Object.keys(row.files).sort(),['config.log','config.make','configparms']);
  for(const [name,pin]of Object.entries(row.files)){const data=await bytes(join(root,'build-profiles',row.variant,row.flavour,name),4*1024*1024);assert.deepEqual(pin,{bytes:data.length,sha256:sha(data)});}
 }
 return true;
}
