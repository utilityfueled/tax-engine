import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
// spec/federal/node26-runtime-source-contract.yaml; source-only controls.
const read = (name: string) => readFileSync(resolve(process.cwd(), name), "utf8");
const base = "node:26.13.1-trixie-slim@sha256:615a27817f7b9508f0de73eb1cc8fc8894ab122bee56c1a7a568b72cd1032067";
const integrity = "sha512-9ieo6XE0Ov5J39D2PQKCNCAd+oMdXLWIcz4eX42ya/FpiaMhYatcG02zsf28NzFgYGtbieAC323RmoWt+R/FqA==";
const fixedZlib = "1:1.3.dfsg+really1.3.1-1+deb13u1";
const fixedGlibc = "2.41-12+deb13u5";
describe("Node 26 runtime source contract", () => {
  it("declares Node 26 at both deployable package roots without changing retained pins", () => {
    const root = JSON.parse(read("package.json"));
    const web = JSON.parse(read("apps/web/package.json"));
    expect(root.engines.node).toBe(">=26.13.1 <27");
    expect(web.engines.node).toBe(">=26.13.1 <27");
    expect(root.packageManager).toBe("pnpm@10.34.8");
    expect(root.devDependencies.typescript).toBe("5.9.3");
    expect(web.devDependencies.typescript).toBe("5.9.3");
    expect(root.dependencies["decimal.js"]).toBe("10.6.0");
    expect(root.dependencies["pdf-lib"]).toBe("1.17.1");
    expect(root.devDependencies["@types/node"]).toBe("24.19.2");
    expect(web.devDependencies["@types/node"]).toBe("24.19.2");
  });
  it("pins local and inherited CI Node versions consistently", () => {
    expect(read(".node-version").trim()).toBe("26.13.1");
    expect(read(".nvmrc").trim()).toBe("26.13.1");
    expect(read(".github/workflows/ci.yml").match(/node-version-file: \.node-version/g)).toHaveLength(5);
    expect(read(".github/workflows/unit-tests.yml").match(/node-version-file: \.node-version/g)).toHaveLength(1);
    expect(read(".github/workflows/web.yml").match(/node-version-file: \.node-version/g)).toHaveLength(3);
  });
  it("binds both image stages and CI preload to the reviewed multiarch index", () => {
    const docker = read("Dockerfile");
    expect(docker).toContain(`FROM ${base} AS base`);
    expect(docker).toContain(`FROM ${base} AS runner`);
    expect(read(".github/workflows/web.yml")).toContain(`docker pull ${base}`);
  });
  it("verifies the pinned pnpm archive before installing without lifecycle scripts", () => {
    const docker = read("Dockerfile");
    expect(docker).not.toContain("RUN corepack enable");
    expect(docker).toContain("npm pack --ignore-scripts --pack-destination /tmp pnpm@10.34.8");
    expect(docker).toContain(integrity);
    expect(docker).toContain('createHash("sha512")');
    expect(docker).toContain('digest("base64")');
    expect(docker).toContain("npm install --global --ignore-scripts --no-audit --no-fund /tmp/pnpm-10.34.8.tgz");
    expect(docker.indexOf('createHash("sha512")')).toBeLessThan(docker.indexOf("npm install --global"));
  });
  it("requires the platform-specific Debian package versions and pins", () => {
    const docker = read("Dockerfile");
    expect(docker.match(/^FROM node:\S+ AS (?:base|runner)$/gmu)).toEqual([
      `FROM ${base} AS base`, `FROM ${base} AS runner`,
    ]);
    const install = "node /tmp/install-debian-zlib.mjs";
    expect(docker.match(/source=scripts\/install-debian-zlib\.mjs,target=\/tmp\/install-debian-zlib\.mjs,readonly/g)).toHaveLength(2);
    const [buildStage, runnerStage] = docker.split(`FROM ${base} AS runner`);
    expect(buildStage.indexOf(install)).toBeGreaterThan(buildStage.indexOf(`FROM ${base} AS base`));
    expect(buildStage.indexOf(install)).toBeLessThan(buildStage.indexOf("npm pack"));
    expect(runnerStage.indexOf(install)).toBeGreaterThanOrEqual(0);
    expect(runnerStage.indexOf(install)).toBeLessThan(runnerStage.indexOf("dpkg --purge apt libapt-pkg7.0"));

    const helper = read("scripts/install-debian-zlib.mjs");
    expect(helper).toContain('architecture === "amd64" || architecture === "arm64"');
    expect(helper).toContain(fixedZlib);
    expect(helper).toContain('installedPackage() !== `${expectedVersion}\\tinstall ok installed`');
    expect(helper.indexOf('if (hasUpstreamFix) process.exit(0)')).toBeLessThan(helper.indexOf('await fetch('));
    for (const [architecture, snapshot, size, hash] of [
      ["ppc64el", "9bb7bc7fd22cb73ca85eb7163277e97a6218d4ae", 87340, "b78324aed52229bf4b984553f68bf710b2faa41da43250355d072d2ab2f2d11c"],
      ["s390x", "a1b69065c75effb594bdd7b972e0241b16e3a70d", 86816, "b1ba54fa14d8bd9ecb4ef322ca4bc5abb67a68ce5914712bacd401b122d959e5"],
    ] as const) {
      expect(helper).toContain(`${architecture}: { snapshot: "${snapshot}", bytes: ${size}, sha256: "${hash}" }`);
    }
    expect(helper).toContain('https://snapshot.debian.org/file/');
    expect(helper).toContain('redirect: "error"');
    expect(helper).toContain("AbortSignal.timeout(");
    expect(helper).toContain('createHash("sha256")');
    expect(helper).toContain('execFileSync("dpkg", ["--install", archive]');

    const smoke = read("scripts/smoke-container.mjs");
    expect(smoke).toContain(`const expectedGlibcVersion = hasUpstreamFixes ? "${fixedGlibc}" : "2.41-12+deb13u4"`);
    expect(smoke).toContain(`const fixedZlibVersion = "${fixedZlib}"`);
    expect(smoke).toContain('["libc-bin", expectedGlibcVersion]');
    expect(smoke).toContain('["libc6", expectedGlibcVersion]');
    expect(smoke).toContain('["zlib1g", hasUpstreamFixes ? fixedZlibVersion : "1:1.3.dfsg+really1.3.1-1+b1"]');
    expect(smoke).toContain('assert.deepEqual(matchingRows.map(row => row.slice(1)), [[version, "installed"]]');
    expect(smoke).toContain('updatedPackages: hasUpstreamFixes ? [] : [{ before: zlibBefore, after: zlibAfter }]');
  });
  it("retains source guards for actual runtime identity and Linux dependency proof", () => {
    const smoke = read("scripts/smoke-container.mjs");
    expect(smoke).toContain('assert.equal(processEvidence.node, "v26.13.1")');
    expect(smoke).toContain('assert.equal(processEvidence.undici, "8.12.4")');
    expect(smoke).toContain('"libatomic1"');
    expect(smoke).toContain(`assert.equal(runnerBaseReference, "${base}"`);
    expect(smoke).toContain('const targets = new Set(["apt", "libapt-pkg7.0", "mount"])');
    expect(smoke).toContain("beforePackages.filter");
    expect(smoke).toContain('const expectedPackages = beforePackages.filter(([name]) => !targets.has(name.split(":")[0]))');
    expect(smoke).toContain("assert.deepEqual(afterPackages, expectedPackages");
    expect(smoke).toContain('assert.equal(processEvidence.uid, 1001)');
    expect(smoke).toContain('assert.equal(processEvidence.packageTools, false)');
  });
  it("removes the unused mount executables without weakening package proof", () => {
    const docker = read("Dockerfile");
    const [builder, runner] = docker.split(`FROM ${base} AS runner`);
    expect(builder).not.toMatch(/dpkg --purge/u);
    expect(runner).toContain("dpkg --purge apt libapt-pkg7.0 mount");
    expect(runner).not.toMatch(/dpkg[^\n]*--force/u);

    const smoke = read("scripts/smoke-container.mjs");
    expect(smoke).toContain(`baseline.Id, "--no-act", "--purge", ...targets`);
    expect(smoke).toContain(`mountBinaries: ['mount', 'umount']`);
    expect(smoke).toContain("assert.deepEqual(processEvidence.mountBinaries, []");
    expect(smoke).toContain("assert.deepEqual(afterPackages, expectedPackages");
  });
  it("excludes only infocmp while retaining terminal metadata and tools", () => {
    const [builder, runner] = read("Dockerfile").split(`FROM ${base} AS runner`);
    const exclusion = "path-exclude=/usr/bin/infocmp";
    expect(builder).not.toContain(exclusion);
    expect(builder).not.toContain("rm -f /usr/bin/infocmp");
    expect(runner.match(/path-exclude=[^'\s]+/g)).toEqual([exclusion]);
    expect(runner).toContain("/etc/dpkg/dpkg.cfg.d/99tax-engine-infocmp");
    expect(runner).toContain("rm -f /usr/bin/infocmp");
    expect(runner).toContain("test ! -e /usr/bin/infocmp && test ! -L /usr/bin/infocmp");
    expect(runner.indexOf("rm -f /usr/bin/infocmp")).toBeLessThan(runner.indexOf("USER appuser"));
    expect(runner).not.toMatch(/dpkg[^\n]*(?:purge|remove)[^\n]*(?:ncurses|libtinfo)/u);

    const smoke = read("scripts/smoke-container.mjs");
    expect(smoke).toContain("fs.lstatSync('/usr/bin/infocmp', { throwIfNoEntry: false })");
    expect(smoke).toContain(`"${exclusion}\\n"`);
    expect(smoke).toContain("['ncurses-bin', 'ncurses-base', 'libtinfo6'].every");
    expect(smoke).toContain("execFileSync('/usr/bin/tput', ['-T', 'xterm', 'colors']");
    expect(smoke).toContain("assert.equal(processEvidence.infocmpPresent, false");
    expect(smoke).toContain("assert.equal(processEvidence.terminalPackagesInstalled, true");
    expect(smoke).toContain('assert.equal(processEvidence.xtermColors, "8"');
    expect(smoke).toContain("assert.deepEqual(afterPackages, expectedPackages");
  });
  it("preserves the reviewed dependency lock exactly", () => {
    expect(createHash("sha256").update(read("pnpm-lock.yaml")).digest("hex")).toBe("4a30d16012713f30ef5a88f71dd4b52923448452b97fc7290ac9f505ed8e1376");
  });
  it("updates active operational prerequisites without rewriting historical receipts", () => {
    expect(read("README.md")).toContain("Node.js 26.13.1");
    expect(read("docs/self-hosting.md")).toContain("Node 26.13.1");
    expect(read("docs/hosted-metadata-migration.md")).toContain("Node 26");
    expect(read("docs/upgrade-2026-runtime-package-minimization-work.md")).toContain("fixed Node 24.22.1 base");
  });
});
