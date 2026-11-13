import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Spec: spec/federal/runtime-scanner-source-contract.yaml.
type WorkflowStep = {
  uses?: string;
  id?: string;
  run?: string;
  with?: Record<string, unknown>;
};

const { steps } = parse(readFileSync(".github/workflows/web.yml", "utf8")).jobs.container as { steps: WorkflowStep[] };

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
});
