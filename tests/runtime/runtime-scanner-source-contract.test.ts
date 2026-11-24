import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Spec: spec/federal/runtime-scanner-source-contract.yaml.
type WorkflowStep = {
  name?: string;
  uses?: string;
  id?: string;
  if?: string;
  run?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
};

const webSteps = parse(readFileSync(".github/workflows/web.yml", "utf8")).jobs.container.steps as WorkflowStep[];
const armSteps = parse(readFileSync(".github/workflows/arm64-recovery.yml", "utf8")).jobs.recovery.steps as WorkflowStep[];
const scannerAction = "./.github/actions/container-runtime-scan";

function scannerSteps(workflow: WorkflowStep[]): WorkflowStep[] {
  const action = workflow.find(step => step.uses === scannerAction);
  if (!action) throw new Error("Missing the shared container scanner action");
  return parse(readFileSync(join(scannerAction, "action.yml"), "utf8")).runs.steps as WorkflowStep[];
}

const steps = scannerSteps(webSteps);
type Architecture = "amd64" | "arm64";

const revisionKey = "org.opencontainers.image.revision";
const commit = "d".repeat(40);
const digest = (data: string) => createHash("sha256").update(data).digest("hex");
const rootfs = [`sha256:${digest("test root filesystem layer")}`];
const labels = { [revisionKey]: commit };

function scannerArtifacts(architecture: Architecture, variant?: string, configArchitecture = architecture) {
  const config = JSON.stringify({
    os: "linux", architecture: configArchitecture, variant, rootfs: { diff_ids: rootfs }, config: { Labels: labels },
  });
  const imageId = `sha256:${digest(config)}`;
  const target = {
    imageID: imageId, os: "linux", architecture, labels,
    config: Buffer.from(config).toString("base64"),
    userInput: imageId, manifestDigest: `sha256:${digest("test Docker manifest")}`,
  };
  return {
    candidate: [{ Id: imageId, Os: "linux", Architecture: architecture, Config: { Labels: labels }, RootFS: { Layers: rootfs } }],
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
      platform: `linux/${architecture}`, imageId, source: commit, archiveSha256: digest("test archive"), archiveBytes: 512,
    },
  };
}

type ScannerArtifacts = ReturnType<typeof scannerArtifacts>;
type BindingReceipt = { scanVerified: boolean; archiveImportVerified?: boolean; sha256: Record<string, string> };

type VerifierPlatform = {
  workflow?: Architecture;
  fixture?: Architecture;
  configArchitecture?: Architecture;
  variant?: string;
  requested?: string;
};

function exerciseVerifier(
  change?: (artifacts: ScannerArtifacts) => void,
  afterScan = false,
  changeBytes?: (file: string, bytes: string) => string,
  archiveOutcome = "success",
  rewritePrior = false,
  { workflow = "amd64", fixture = workflow, configArchitecture, variant, requested }: VerifierPlatform = {},
) {
  const workflowSteps = workflow === "arm64" ? armSteps : webSteps;
  const configSteps = scannerSteps(workflowSteps);
  const expectedArchitecture = requested ?? workflowSteps.find(step => step.uses === scannerAction)?.with?.["expected-architecture"];
  const cwd = mkdtempSync(join(tmpdir(), "tax-engine-scanner-"));
  try {
    const files = scannerArtifacts(fixture, variant, configArchitecture);
    const imageId = files.candidate[0].Id;
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
      const script = configSteps.find(step => step.name === name)?.run;
      if (!script) throw new Error(`Missing workflow step ${name}`);
      const output = join(cwd, "step-output");
      const receiptDigest = requireScan && existsSync(output)
        ? readFileSync(output, "utf8").trim().split("=")[1] : "";
      const result = spawnSync("bash", ["-e", "-c", script], {
        cwd, encoding: "utf8", timeout: 5000,
        env: {
          PATH: process.env.PATH, CANDIDATE_IMAGE_ID: imageId, GITHUB_SHA: commit, GITHUB_WORKSPACE: resolve("."),
          EXPECTED_ARCHITECTURE: typeof expectedArchitecture === "string" ? expectedArchitecture : undefined,
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
  it("uses the shared scanner with explicit native architecture in each workflow", () => {
    expect(webSteps.find(step => step.uses === scannerAction)).toMatchObject({
      with: { "expected-architecture": "amd64", "candidate-image-id": "${{ steps.candidate.outputs.image_id }}", "archive-outcome": "${{ steps.archive.outcome }}" },
    });
    expect(armSteps.find(step => step.uses === scannerAction)).toMatchObject({
      with: { "expected-architecture": "arm64", "candidate-image-id": "${{ steps.images.outputs.candidate }}", "archive-outcome": "${{ steps.arm_archive.outcome }}" },
    });
    const artifact = armSteps.find(step => step.with?.name === "native-arm64-archive-evidence");
    expect(artifact?.if).toContain("steps.arm_archive.outcome == 'failure'");
    expect(armSteps.find(step => step.name === "Enforce the ARM64 archive result")?.run).toContain('test "$ARCHIVE_OUTCOME" = success');
    for (const file of ["container.cdx.json", "container.syft.json", "container-syft-tool.txt", "container-source-binding.json",
      "container-image-identity.json", "container-archive-verification.json", "container-candidate.json", "container-vulnerabilities.json"]) {
      expect(artifact?.with?.path).toContain(file);
    }
  });

  it("binds native ARM64 inventories and scan using the real verifier", () => {
    const result = exerciseVerifier(undefined, false, undefined, "success", false, { workflow: "arm64", variant: "v8" });
    expect(result.before, result.before.stderr).toEqual({ status: 0, stderr: "" });
    expect(result.beforeReceipt).toMatchObject({ platform: "linux/arm64", scanVerified: false });
    expect(result.after, result.after?.stderr).toEqual({ status: 0, stderr: "" });
    expect(result.afterReceipt).toMatchObject({
      platform: "linux/arm64", scanVerified: true, archiveImportVerified: true,
      sha256: { "container.cdx.json": expect.any(String), "container-vulnerabilities.json": expect.any(String),
        "container-archive-verification.json": expect.any(String) },
    });
  });

  it.each([
    ["candidate architecture", (f: ScannerArtifacts) => { f.candidate[0].Architecture = "amd64"; }, false],
    ["Syft architecture", (f: ScannerArtifacts) => { f.sbom.source.metadata.architecture = "amd64"; }, false],
    ["Grype architecture", (f: ScannerArtifacts) => { f.scan.source.target.architecture = "amd64"; }, true],
    ["archive architecture", (f: ScannerArtifacts) => { f.archive.platform = "linux/amd64"; }, true],
  ] as const)("rejects a substituted ARM64 %s", (_case, change, afterScan) => {
    const result = exerciseVerifier(change, afterScan, undefined, "success", false, { workflow: "arm64" });
    if (afterScan) {
      expect(result.before.status, result.before.stderr).toBe(0);
      expect(result.after?.status, result.after?.stderr).toBe(1);
      expect(result.afterReceipt?.scanVerified).toBe(false);
    } else {
      expect(result.before.status, result.before.stderr).toBe(1);
      expect(result.beforeReceipt).toBeUndefined();
    }
  });

  it.each([
    { workflow: "arm64", fixture: "amd64" },
    { workflow: "amd64", fixture: "arm64" },
    { workflow: "arm64", configArchitecture: "amd64" },
    { workflow: "arm64", variant: "v9" },
    { workflow: "amd64", variant: "v8" },
    { workflow: "amd64", requested: "" },
    { workflow: "amd64", requested: "riscv64" },
  ] as const)("rejects wrong platform or variant %j", platform => {
    const result = exerciseVerifier(undefined, false, undefined, "success", false, platform);
    expect(result.before.status, result.before.stderr).toBe(1);
    expect(result.beforeReceipt).toBeUndefined();
  });

  it("pins and checks the exact patched Syft and Grype versions", () => {
    const syft = steps.find(step => step.id === "syft");
    expect(syft).toMatchObject({ uses: "anchore/sbom-action/download-syft@v0", with: { "syft-version": "v1.57.1" } });
    expect(steps.find(step => step.id === "sbom")?.run).toContain("grep -Eq '^Version:[[:space:]]+1[.]57[.]1$'");

    const grype = steps.find(step => step.id === "scan");
    expect(grype).toMatchObject({ uses: "anchore/scan-action@v7", with: { "grype-version": "v0.121.3" } });
    expect(readFileSync("scripts/lib/verify-container-scanner-binding.py", "utf8")).toContain('scan["descriptor"]["version"] == "0.121.3"');
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
    const before = steps.find(step => step.name === "Verify immutable SBOM source");
    const after = steps.find(step => step.name === "Verify scan source against the immutable candidate");
    expect(before?.run).toContain("python3 -E");
    expect(after?.run).toBe(before?.run);
    expect(before?.env).toMatchObject({ REQUIRE_SCAN: "false", EXPECTED_ARCHITECTURE: "${{ inputs.expected-architecture }}" });
    expect(after?.env).toMatchObject({
      REQUIRE_SCAN: "true", EXPECTED_ARCHITECTURE: "${{ inputs.expected-architecture }}",
      PRIOR_BINDING_SHA256: "${{ steps.source_binding.outputs.receipt_sha256 }}",
    });
    expect(after?.if).toContain("steps.scan.outcome != 'skipped'");
    expect(webSteps.find(step => step.with?.name === "container-runtime-evidence")?.with?.path).toContain("container-vulnerabilities.json");
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
