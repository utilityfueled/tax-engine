import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
// spec/federal/node26-runtime-source-contract.yaml; source-only controls.
const read = (name: string) => readFileSync(resolve(process.cwd(), name), "utf8");
const base = "node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc";
const integrity = "sha512-9ieo6XE0Ov5J39D2PQKCNCAd+oMdXLWIcz4eX42ya/FpiaMhYatcG02zsf28NzFgYGtbieAC323RmoWt+R/FqA==";
const oldZlib = "1:1.3.dfsg+really1.3.1-1+b1";
const fixedZlib = "1:1.3.dfsg+really1.3.1-1+deb13u1";
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
    expect(read(".github/workflows/ci.yml").match(/node-version-file: \.node-version/g)).toHaveLength(6);
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
  it("installs the exact Debian zlib fix in both image stages", () => {
    const docker = read("Dockerfile");
    const install = "node /tmp/install-debian-zlib.mjs";
    expect(docker.match(/source=scripts\/install-debian-zlib\.mjs,target=\/tmp\/install-debian-zlib\.mjs,readonly/g)).toHaveLength(2);
    const [buildStage, runnerStage] = docker.split(`FROM ${base} AS runner`);
    expect(buildStage.indexOf(install)).toBeGreaterThan(buildStage.indexOf(`FROM ${base} AS base`));
    expect(buildStage.indexOf(install)).toBeLessThan(buildStage.indexOf("npm pack"));
    expect(runnerStage.indexOf(install)).toBeGreaterThanOrEqual(0);
    expect(runnerStage.indexOf(install)).toBeLessThan(runnerStage.indexOf("dpkg --purge apt libapt-pkg7.0"));

    const helper = read("scripts/install-debian-zlib.mjs");
    expect(helper).toContain(fixedZlib);
    expect(helper).toContain('https://snapshot.debian.org/file/');
    for (const [architecture, snapshot, size, hash] of [
      ["amd64", "d2eca18b98f94b9179c90e09da4760a27ad1e107", 88720, "8c27c342230503b73dfde629642c3b352e87b554e06d60cf58772f236a305ceb"],
      ["arm64", "3ba1e9072e91c9d9034c778b94c58e40047ac566", 85028, "0e41b3d7ad8ad7fcd36dd4d61ca91a70018478fc4af652e044f4be770784ddff"],
      ["ppc64el", "9bb7bc7fd22cb73ca85eb7163277e97a6218d4ae", 87340, "b78324aed52229bf4b984553f68bf710b2faa41da43250355d072d2ab2f2d11c"],
      ["s390x", "a1b69065c75effb594bdd7b972e0241b16e3a70d", 86816, "b1ba54fa14d8bd9ecb4ef322ca4bc5abb67a68ce5914712bacd401b122d959e5"],
    ] as const) {
      expect(helper).toContain(`${architecture}: { snapshot: "${snapshot}", bytes: ${size}, sha256: "${hash}" }`);
    }
    expect(helper).toContain('redirect: "error"');
    expect(helper).toContain("AbortSignal.timeout(");
    expect(helper).toContain("createHash(\"sha256\")");
    expect(helper).toContain('execFileSync("dpkg", ["--install", archive]');
    expect(helper).toContain('execFileSync("dpkg-query"');
  });
  it("retains source guards for actual runtime identity and Linux dependency proof", () => {
    const smoke = read("scripts/smoke-container.mjs");
    expect(smoke).toContain('assert.equal(processEvidence.node, "v26.13.1")');
    expect(smoke).toContain('assert.equal(processEvidence.undici, "8.12.4")');
    expect(smoke).toContain('"libatomic1"');
    expect(smoke).toContain(`assert.equal(runnerBaseReference, "${base}"`);
    expect(smoke).toContain('const targets = new Set(["apt", "libapt-pkg7.0", "mount"])');
    expect(smoke).toContain("beforePackages.filter");
    expect(smoke).toContain(`assert.deepEqual(zlibBefore.slice(1), ["${oldZlib}", "installed"])`);
    expect(smoke).toContain(`const zlibAfter = [zlibBefore[0], "${fixedZlib}", "installed"]`);
    expect(smoke).toContain(".map(row => row === zlibBefore ? zlibAfter : row)");
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
