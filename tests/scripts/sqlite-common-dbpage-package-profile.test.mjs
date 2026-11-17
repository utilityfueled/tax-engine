// Spec: spec/federal/sqlite-common-dbpage-package-profile.yaml
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import {URL} from 'node:url';
const root=new URL('../../',import.meta.url),recipe=new URL('infra/postgres-sqlite-backport/',root);
const digest=b=>createHash('sha256').update(b).digest('hex');
const prefix='DEB_CFLAGS_APPEND=-DSQLITE_ENABLE_DBPAGE_VTAB ';
test('declares the one common feature delta without changing any original recipe gates',async()=>{
 const text=await readFile(new URL('build-packages.sh',recipe),'utf8');
 assert.equal(text.split(prefix).length-1,1);
 assert.ok(text.indexOf(prefix)>text.indexOf('for variant in baseline candidate; do'));
 assert.equal(digest(text.replace(prefix,'')),'68969e7c2bcd95cb1b95222bc567b41917ca9df24229b8b1607cbacc45b205c7');
 assert.ok(text.includes('as_test_user make -j2 USE_AMALGAMATION=1 fulltest'));
 assert.ok(text.includes("candidateRegressionCasesPassed']==v['candidateSanitizerRegressionCasesPassed']==5"));
});
test('retains actual package command arguments common flags and every failing status',async()=>{
 const text=await readFile(new URL('build-packages.sh',recipe),'utf8');
 const slice=text.match(/ {4}set \+e\n {4}DEB_CFLAGS_APPEND=-DSQLITE_ENABLE_DBPAGE_VTAB dpkg-buildpackage -B -uc -us[^\n]*\n {4}result=\$\?\n {4}set -e\n {4}record [^\n]*\n {4}test "\$result" = 0/);
 assert.ok(slice);const command=slice[0].replace(' > "/qualification-out/$variant/package-build.log" 2>&1','');
 for(const code of [0,2]){
  const script=['set -euo pipefail',
   `dpkg-buildpackage() { test "$DEB_CFLAGS_APPEND" = -DSQLITE_ENABLE_DBPAGE_VTAB; test "$*" = '-B -uc -us'; return ${code}; }`,
   'record() { printf "%s:%s\\n" "$1" "$2"; }',
   'for variant in baseline candidate; do',command,'done','printf "completed\\n"'].join('\n');
  if(code===0)assert.equal(execFileSync('bash',['-c',script],{encoding:'utf8',timeout:5000}),'baselinePackageBuildExit:0\ncandidatePackageBuildExit:0\ncompleted\n');
  else assert.throws(()=>execFileSync('bash',['-c',script],{encoding:'utf8',timeout:5000,stdio:'pipe'}),error=>error.status===1&&error.stdout==='baselinePackageBuildExit:2\n');
 }
});
test('binds the explicit profile and preserves the source-only component provenance',async()=>{
 const manifest=JSON.parse(await readFile(new URL('sources.json',recipe))),provenance=JSON.parse(await readFile(new URL('provenance.json',recipe)));
 assert.deepEqual(manifest.commonPackageBuildProfile,provenance.commonPackageBuildProfile);
 const profile=manifest.commonPackageBuildProfile;
 assert.equal(profile.environment.DEB_CFLAGS_APPEND,'-DSQLITE_ENABLE_DBPAGE_VTAB');
 assert.equal(profile.appliesTo,'baseline-and-candidate');assert.equal(profile.actualPackageFeatureDelta,true);
 assert.equal(profile.fullPackageQualificationClaim,false);assert.equal(profile.genericAbiApproval,false);assert.equal(profile.runtimeIntegrationExecuted,false);
 assert.equal(manifest.commonCompatibilityPrerequisites.compilerFlagsChanged,false);
 assert.equal(manifest.commonCompatibilityPrerequisites.changesSha256,digest(await readFile(new URL('compatibility-changes.json',recipe))));
 for(const name of ['build-packages.sh','provenance.json']){const b=await readFile(new URL(name,recipe));assert.deepEqual(manifest.recipeFiles[name],{bytes:b.length,sha256:digest(b)});}
});
