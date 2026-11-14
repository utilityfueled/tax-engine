import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Spec: spec/federal/runtime-scanner-source-contract.yaml.
type WorkflowStep = {
  name?: string;
  uses?: string;
  id?: string;
  run?: string;
  with?: Record<string, unknown>;
};

const { steps } = parse(readFileSync(".github/workflows/web.yml", "utf8")).jobs.container as { steps: WorkflowStep[] };

const revisionKey = "org.opencontainers.image.revision";
const commit = "d".repeat(40);
const digest = (data: string) => createHash("sha256").update(data).digest("hex");
const rootfs = [`sha256:${digest("test root filesystem layer")}`];
const labels = { [revisionKey]: commit };
const config = JSON.stringify({ os: "linux", architecture: "amd64", rootfs: { diff_ids: rootfs }, config: { Labels: labels } });
const imageId = `sha256:${digest(config)}`;

function scannerArtifacts() {
  const target = {
    imageID: imageId, os: "linux", architecture: "amd64", labels,
    config: Buffer.from(config).toString("base64"),
    userInput: imageId, manifestDigest: `sha256:${digest("test Docker manifest")}`,
  };
  return {
    candidate: [{ Id: imageId, Os: "linux", Architecture: "amd64", Config: { Labels: labels }, RootFS: { Layers: rootfs } }],
    sbom: {
      source: { type: "image", name: "sha256", version: imageId.slice(7), metadata: target },
      descriptor: { name: "syft", version: "1.57.1" },
      artifacts: [] as { name: string }[],
    },
    cdx: {
      bomFormat: "CycloneDX",
      metadata: {
        component: { type: "container", name: "sha256", version: imageId.slice(7) },
        properties: [{ name: `syft:image:labels:${revisionKey}`, value: commit }],
        tools: { components: [{ type: "application", name: "syft", version: "1.57.1" }] },
      },
    },
    scan: { descriptor: { name: "grype", version: "0.121.3" }, source: { type: "image", target: { ...target } }, matches: [] },
    archive: {
      version: 1, stage: "verified", archiveImportVerified: true, scratchRemoved: true,
      platform: "linux/amd64", imageId, source: commit, archiveSha256: digest("test archive"), archiveBytes: 512,
    },
  };
}

type ScannerArtifacts = ReturnType<typeof scannerArtifacts>;
type BindingReceipt = { scanVerified: boolean; archiveImportVerified?: boolean; sha256: Record<string, string> };

function exerciseVerifier(
  change?: (artifacts: ScannerArtifacts) => void,
  afterScan = false,
  changeBytes?: (file: string, bytes: string) => string,
  archiveOutcome = "success",
  rewritePrior = false,
) {
  const cwd = mkdtempSync(join(tmpdir(), "tax-engine-scanner-"));
  try {
    const files = scannerArtifacts();
    const write = (name: string, value: unknown) => {
      const bytes = JSON.stringify(value);
      writeFileSync(join(cwd, name), changeBytes?.(name, bytes) ?? bytes);
    };
    const writeInventory = () => {
      write("container-candidate.json", files.candidate);
      write("container.syft.json", files.sbom);
      write("container.cdx.json", files.cdx);
    };
    const run = (name: string, requireScan: boolean) => {
      const script = steps.find(step => step.name === name)?.run;
      if (!script) throw new Error(`Missing workflow step ${name}`);
      const output = join(cwd, "step-output");
      const receiptDigest = requireScan && existsSync(output)
        ? readFileSync(output, "utf8").trim().split("=")[1] : "";
      const result = spawnSync("bash", ["-e", "-c", script], {
        cwd, encoding: "utf8", timeout: 5000,
        env: {
          PATH: process.env.PATH, CANDIDATE_IMAGE_ID: imageId, GITHUB_SHA: commit,
          REQUIRE_SCAN: requireScan ? "true" : "false", ARCHIVE_OUTCOME: archiveOutcome,
          GITHUB_OUTPUT: output, PRIOR_BINDING_SHA256: receiptDigest,
        },
      });
      if (result.error) throw result.error;
      return { status: result.status, stderr: result.stderr };
    };
    const receipt = (): BindingReceipt | undefined => {
      const path = join(cwd, "container-source-binding.json");
      return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as BindingReceipt : undefined;
    };

    if (!afterScan) change?.(files);
    writeInventory();
    const before = run("Verify immutable SBOM source", false);
    const beforeReceipt = receipt();
    if (before.status !== 0) return { before, beforeReceipt };
    if (afterScan) change?.(files);
    writeInventory();
    if (rewritePrior && beforeReceipt) {
      beforeReceipt.sha256["container.syft.json"] = digest(readFileSync(join(cwd, "container.syft.json"), "utf8"));
      write("container-source-binding.json", beforeReceipt);
    }
    write("container-vulnerabilities.json", files.scan);
    write("container-archive-verification.json", files.archive);
    return { before, beforeReceipt, after: run("Verify scan source against the immutable candidate", true), afterReceipt: receipt() };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("Runtime scanner workflow contract", () => {
  it("pins and checks the exact patched Syft and Grype versions", () => {
    const syft = steps.find(step => step.id === "syft");
    expect(syft).toMatchObject({ uses: "anchore/sbom-action/download-syft@v0", with: { "syft-version": "v1.57.1" } });
    expect(steps.find(step => step.id === "sbom")?.run).toContain("grep -Eq '^Version:[[:space:]]+1[.]57[.]1$'");

    const grype = steps.find(step => step.id === "scan");
    expect(grype).toMatchObject({ uses: "anchore/scan-action@v7", with: { "grype-version": "v0.121.3" } });
    const verifyScan = steps.find(step => step.run?.includes('os.environ["REQUIRE_SCAN"]') && step.run.includes('scan["descriptor"]'));
    expect(verifyScan?.run).toContain('scan["descriptor"]["version"] == "0.121.3"');
  });

  it("retains the immutable image binding and critical vulnerability policy", () => {
    const sbom = steps.find(step => step.id === "sbom");
    expect(sbom?.run).toContain('scan "docker:$CANDIDATE_IMAGE_ID" -o json=container.syft.json -o cyclonedx-json=container.cdx.json');
    expect(steps.find(step => step.id === "scan")?.with).toMatchObject({
      sbom: "container.syft.json",
      "output-format": "json",
      "output-file": "container-vulnerabilities.json",
      "fail-build": true,
      "severity-cutoff": "critical",
    });
    expect(steps.find(step => step.id === "scan")?.with?.["only-fixed"] ?? false).toBe(false);
    expect(steps.filter(step => step.run?.includes('assert config["rootfs"]["diff_ids"] == expected["RootFS"]["Layers"]'))).toHaveLength(2);
    expect(steps.find(step => step.with?.name === "container-runtime-evidence")?.with?.path).toContain("container-vulnerabilities.json");
  });

  it("executes both checks and records only verified SBOM, scan and archive bytes", () => {
    const result = exerciseVerifier();
    expect(result.before).toEqual({ status: 0, stderr: "" });
    expect(result.beforeReceipt).toMatchObject({ scanVerified: false, sha256: { "container.cdx.json": expect.any(String) } });
    expect(result.after).toEqual({ status: 0, stderr: "" });
    expect(result.afterReceipt).toMatchObject({
      scanVerified: true, archiveImportVerified: true,
      sha256: { "container.cdx.json": expect.any(String), "container-vulnerabilities.json": expect.any(String),
                "container-archive-verification.json": expect.any(String) },
    });
    const unverifiedArchive = exerciseVerifier(undefined, false, undefined, "failure");
    expect(unverifiedArchive.afterReceipt).toMatchObject({ scanVerified: true, archiveImportVerified: false });
    expect(unverifiedArchive.afterReceipt?.sha256).not.toHaveProperty(["container-archive-verification.json"]);
  });

  it.each([
    ["foreign image", (f: ScannerArtifacts) => { f.cdx.metadata.component.version = "a".repeat(64); }],
    ["wrong revision", (f: ScannerArtifacts) => { f.cdx.metadata.properties[0].value = "e".repeat(40); }],
    ["duplicate revision", (f: ScannerArtifacts) => {
      f.cdx.metadata.properties.push({ name: `syft:image:labels:${revisionKey}`, value: "e".repeat(40) });
    }],
    ["different generator version", (f: ScannerArtifacts) => { f.cdx.metadata.tools.components[0].version = "1.42.3"; }],
  ] as const)("rejects CycloneDX %s before scanning", (_case, change) => {
    const result = exerciseVerifier(change);
    expect(result.before.status, result.before.stderr).toBe(1);
    expect(result.beforeReceipt).toBeUndefined();
  });

  it("rejects a duplicate JSON key even when the final value matches the candidate", () => {
    const result = exerciseVerifier(undefined, false, (name, bytes) => name === "container.cdx.json"
      ? bytes.replace('"name":"sha256"', '"name":"foreign","name":"sha256"')
      : bytes);
    expect(result.before.status, result.before.stderr).toBe(1);
    expect(result.beforeReceipt).toBeUndefined();
  });

  it.each([
    ["CycloneDX bytes", (f: ScannerArtifacts) => { f.cdx.metadata.properties.push({ name: "unrelated", value: "changed" }); }],
    ["Syft bytes", (f: ScannerArtifacts) => { f.sbom.artifacts = [{ name: "changed-package" }]; }],
    ["Grype source metadata", (f: ScannerArtifacts) => { f.scan.source.target.manifestDigest = `sha256:${"e".repeat(64)}`; }],
    ["Grype source architecture", (f: ScannerArtifacts) => { f.scan.source.target.architecture = "arm64"; }],
    ["archive source revision", (f: ScannerArtifacts) => { f.archive.source = "e".repeat(40); }],
  ] as const)("rejects changed %s at final binding", (_case, change) => {
    const result = exerciseVerifier(change, true);
    expect(result.before, result.before.stderr).toEqual({ status: 0, stderr: "" });
    expect(result.after?.status, result.after?.stderr).toBe(1);
    expect(result.afterReceipt?.scanVerified).toBe(false);
  });

  it("rejects changed input even when the writable receipt is rewritten to agree", () => {
    const result = exerciseVerifier(f => { f.sbom.artifacts = [{ name: "substituted-package" }]; }, true, undefined, "success", true);
    expect(result.before, result.before.stderr).toEqual({ status: 0, stderr: "" });
    expect(result.after?.status, result.after?.stderr).toBe(1);
    expect(result.afterReceipt?.scanVerified).toBe(false);
  });
});
