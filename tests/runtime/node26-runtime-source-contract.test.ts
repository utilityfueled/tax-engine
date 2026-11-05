import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
// spec/federal/node26-runtime-source-contract.yaml; source-only controls.
const read = (name: string) => readFileSync(resolve(process.cwd(), name), "utf8");
const base = "node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39";
const integrity = "sha512-9ieo6XE0Ov5J39D2PQKCNCAd+oMdXLWIcz4eX42ya/FpiaMhYatcG02zsf28NzFgYGtbieAC323RmoWt+R/FqA==";
describe("Node 26 runtime source contract", () => {
  it("declares Node 26 at both deployable package roots without changing retained pins", () => {
    const root = JSON.parse(read("package.json"));
    const web = JSON.parse(read("apps/web/package.json"));
    expect(root.engines.node).toBe(">=26.13.0 <27");
    expect(web.engines.node).toBe(">=26.13.0 <27");
    expect(root.packageManager).toBe("pnpm@10.34.8");
    expect(root.devDependencies.typescript).toBe("5.9.3");
    expect(web.devDependencies.typescript).toBe("5.9.3");
    expect(root.dependencies["decimal.js"]).toBe("10.6.0");
    expect(root.dependencies["pdf-lib"]).toBe("1.17.1");
    expect(root.devDependencies["@types/node"]).toBe("24.19.2");
    expect(web.devDependencies["@types/node"]).toBe("24.19.2");
  });
  it("pins local and inherited CI Node versions consistently", () => {
    expect(read(".node-version").trim()).toBe("26.13.0");
    expect(read(".nvmrc").trim()).toBe("26.13.0");
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
  it("retains source guards for actual runtime identity and Linux dependency proof", () => {
    const smoke = read("scripts/smoke-container.mjs");
    expect(smoke).toContain('assert.equal(processEvidence.node, "v26.13.0")');
    expect(smoke).toContain('assert.equal(processEvidence.undici, "8.12.2")');
    expect(smoke).toContain('"libatomic1"');
    expect(smoke).toContain(`assert.equal(runnerBaseReference, "${base}"`);
    expect(smoke).toContain('const targets = new Set(["apt", "libapt-pkg7.0"])');
    expect(smoke).toContain("beforePackages.filter");
    expect(smoke).toContain('assert.equal(processEvidence.uid, 1001)');
    expect(smoke).toContain('assert.equal(processEvidence.packageTools, false)');
  });
  it("preserves the reviewed dependency lock exactly", () => {
    expect(createHash("sha256").update(read("pnpm-lock.yaml")).digest("hex")).toBe("268026058217dd84aee4e9b1c691fa1bac7d3049e6cb68d7fd16ef3af7a76dea");
  });
  it("updates active operational prerequisites without rewriting historical receipts", () => {
    expect(read("README.md")).toContain("Node.js 26.13.0");
    expect(read("docs/self-hosting.md")).toContain("Node 26.13.0");
    expect(read("docs/hosted-metadata-migration.md")).toContain("Node 26");
    expect(read("docs/upgrade-2026-runtime-package-minimization-work.md")).toContain("fixed Node 24.22.1 base");
  });
});
