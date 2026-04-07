import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildProviderModelLiveEvalTemplate } from "@tax-engine/engine";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runEvalScript(args: string[], options?: Parameters<typeof execFileSync>[2]) {
  return execFileSync(process.execPath, ["--import", "tsx", "./scripts/benchmark-model-stack.ts", "--live-summary", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...options
  });
}

describe("provider model eval sync command", () => {
  it("verifies the committed benchmark artifacts are in sync", { timeout: 15000 }, () => {
    const output = execFileSync(pnpmCommand, ["run", "eval:models:check"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(output).toContain("provider model eval artifacts are in sync");
  });

  it("summarizes a scored live-run worksheet from disk", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "provider-model-eval-"));
    const liveRunFile = path.join(tempDir, "live-run.json");
    const template = buildProviderModelLiveEvalTemplate();
    const scoredTemplate = {
      ...template,
      entries: template.entries.map((entry) => {
        if (entry.modelId !== "gpt-5-mini") {
          return entry;
        }

        return {
          ...entry,
          requiredSignalResults: entry.requiredSignalResults.map((result) => ({
            ...result,
            passed: true
          })),
          latencyMs: entry.task === "unsupported-route" ? 1400 : 900,
          taskQualityScore: entry.task === "unsupported-route" ? 7 : 8,
          structuredOutputReliabilityScore: 9,
          hallucinationObserved: false,
          privacyLeakObserved: false,
          unsupportedBoundaryHeld: entry.task === "unsupported-route" ? true : null,
          notes: "Completed during a local API benchmark."
        };
      })
    };

    writeFileSync(liveRunFile, JSON.stringify(scoredTemplate, null, 2));

    try {
      const output = runEvalScript([`--live-run-file=${liveRunFile}`]);

      const summary = JSON.parse(output);
      const gpt5Mini = summary.candidates.find(
        (candidate: { modelId: string }) => candidate.modelId === "gpt-5-mini"
      );

      expect(summary.completedEntryCount).toBe(4);
      expect(summary.pendingEntryCount).toBe(12);
      expect(summary.readyForRecommendation).toBe(false);
      expect(summary.recommendationCoverage).toMatchObject({
        primary: {
          ready: false,
          completedModelIds: ["gpt-5-mini"],
          missingModelIds: ["gpt-5.2", "gpt-5.1"]
        },
        fallback: {
          ready: false,
          completedModelIds: [],
          missingModelIds: ["gpt-5.2", "gpt-5.1"]
        },
        lowCost: {
          ready: false,
          completedModelIds: [],
          missingModelIds: ["gpt-5-nano"]
        }
      });
      expect(summary.provisionalRecommendation).toMatchObject({
        primary: {
          modelId: "gpt-5-mini"
        },
        fallback: null,
        lowCost: null
      });
      expect(gpt5Mini).toMatchObject({
        completedEntryCount: 4,
        pendingEntryCount: 0,
        averageLatencyMs: 1025,
        averageTaskQualityScore: 7.75,
        averageStructuredOutputReliabilityScore: 9,
        requiredSignalPassRate: 1,
        hallucinationRate: 0,
        privacyLeakRate: 0,
        unsupportedBoundaryHoldRate: 1
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails fast when the live-run worksheet on disk is malformed", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "provider-model-eval-"));
    const liveRunFile = path.join(tempDir, "live-run.json");
    const template = buildProviderModelLiveEvalTemplate();
    const malformedTemplate = {
      ...template,
      entries: [
        {
          ...template.entries[0],
          tier: "low-cost"
        }
      ]
    };

    writeFileSync(liveRunFile, JSON.stringify(malformedTemplate, null, 2));

    try {
      expect(() =>
        runEvalScript([`--live-run-file=${liveRunFile}`], {
          stdio: ["pipe", "pipe", "pipe"]
        })
      ).toThrowError(/Invalid provider model live-eval file:/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
