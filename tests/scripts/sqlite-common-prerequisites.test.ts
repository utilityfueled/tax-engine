import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const recipe = new URL("../../infra/postgres-sqlite-backport/", import.meta.url);
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
describe("SQLite common compatibility prerequisites", () => {
  it("applies the exact common prerequisites before the CVE split without changing qualification gates", async () => {
    const shell = await readFile(new URL("build-packages.sh", recipe), "utf8");
    const call = "python3 /qualification-inputs/apply-compatibility.py --source /qualification-work/baseline --record /qualification-out/common-compatibility.json";
    expect(shell).toContain(call);
    expect(shell.indexOf(call)).toBeLessThan(shell.indexOf("cp -a baseline candidate"));
    expect(shell.indexOf(call)).toBeGreaterThan(shell.indexOf("dpkg-source --no-check -x"));
    expect(shell).toContain("Compatibility-repaired vulnerable baseline and CVE candidate");
    expect(shell).toContain("as_test_user make -j2 USE_AMALGAMATION=1 fulltest");
    expect(shell).toContain("dpkg-buildpackage -B -uc -us");
    expect(shell).toContain("candidateRegressionCasesPassed']==v['candidateSanitizerRegressionCasesPassed']==5");
    expect(shell).not.toContain("-DSQLITE_ENABLE_DBPAGE_VTAB");
  });
  it("pins the same three official hunks that passed the complete paired diagnostic", async () => {
    const bytes = await readFile(new URL("compatibility-changes.json", recipe));
    expect(bytes).toEqual(await readFile(new URL("../../infra/sqlite-upstream-experiment/changes.json", import.meta.url)));
    const changes = JSON.parse(bytes.toString()).changes;
    expect(changes.map((r: { path: string }) => r.path)).toEqual(["src/test_config.c", "test/join8.test", "ext/recover/sqlite3recover.c"]);
    expect(changes.map((r: { upstreamCommit: string }) => r.upstreamCommit)).toEqual(["f891ef8d6111c8c8aa7de74bcd36aaf2f4569c47", "f891ef8d6111c8c8aa7de74bcd36aaf2f4569c47", "73a50fa42cbc2ddd1bf9e795a1407c3c746896e9"]);
  });
  it("binds every added prerequisite in the pinned Docker context and source plan", async () => {
    const manifest = JSON.parse(await readFile(new URL("sources.json", recipe), "utf8"));
    const docker = await readFile(new URL("Dockerfile.packages", recipe), "utf8");
    for (const name of ["apply-compatibility.py", "compatibility-changes.json"]) {
      const bytes = await readFile(new URL(name, recipe));
      expect(manifest.recipeFiles[name]).toEqual({ bytes: bytes.length, sha256: sha(bytes) });
      expect(docker).toContain(`COPY ${name} /qualification-inputs/${name}`);
    }
    const builder = await readFile(new URL("../../scripts/build-postgres-sqlite-backport.mjs", import.meta.url), "utf8");
    expect(builder).toContain("commonCompatibilityPrerequisites: manifest.commonCompatibilityPrerequisites");
    expect(manifest.commonCompatibilityPrerequisites.originalBaselineUnmodified).toBe(false);
    expect(manifest.commonCompatibilityPrerequisites.changesSha256).toBe(sha(await readFile(new URL("compatibility-changes.json", recipe))));
  });
  for (const scenario of ["pass", "changed", "alias", "repeat", "result-hash", "extra-path"] as const) {
    it(`checks exact hashes and custody before any common-tree write: ${scenario}`, () => {
      // The real production helper operates on three tiny synthetic files here.
      // Production hashes/hunks are independently pinned above, not bypassed in a build.
      const program = String.raw`
import importlib.util,tempfile,pathlib,json,hashlib,os
spec=importlib.util.spec_from_file_location('compat',${JSON.stringify(fileURLToPath(new URL("apply-compatibility.py", recipe)))})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha=lambda b:hashlib.sha256(b).hexdigest()
with tempfile.TemporaryDirectory(prefix='sqlite-common-controls-') as t:
 root=pathlib.Path(t).resolve();source=root/'source';source.mkdir();inputs=root/'inputs';inputs.mkdir();m.E=inputs
 rows=[]
 for n,p in enumerate(sorted(m.PATHS)):
  f=source/p;f.parent.mkdir(parents=True,exist_ok=True);a=('before%d\n'%n).encode();b=('after%d\n'%n).encode();f.write_bytes(a)
  rows.append(dict(path=p,beforeSha256=sha(a),afterSha256=sha(b),hunks=[dict(before=a.decode(),after=b.decode())],upstreamCommit='synthetic-only'))
 case=${JSON.stringify(scenario)}
 if case=='changed':(source/rows[-1]['path']).write_text('altered')
 if case=='alias':os.link(source/rows[-1]['path'],root/'alias')
 if case=='result-hash':rows[-1]['afterSha256']='0'*64
 if case=='extra-path':rows.append(dict(rows[0],path='foreign'))
 (inputs/'compatibility-changes.json').write_text(json.dumps(dict(schema=1,changes=rows)))
 snapshot={p:p.read_bytes() for p in source.rglob('*') if p.is_file()};record=root/'receipt.json'
 if case in ('pass','repeat'):
  result=m.apply(source,record);assert result['commonPrerequisitesAppliedBeforeCveSplit'] is True;assert result['originalBaselineUnmodified'] is False
  if case=='repeat':
   try:m.apply(source,root/'second.json')
   except AssertionError:pass
   else:raise AssertionError('repeat admitted')
 else:
  try:m.apply(source,record)
  except AssertionError:pass
  else:raise AssertionError('invalid input admitted')
  assert not record.exists();assert all(p.read_bytes()==b for p,b in snapshot.items())
print('control passed')
`;
      expect(execFileSync("python3", ["-B", "-c", program], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 }).trim()).toBe("control passed");
    });
  }
});
