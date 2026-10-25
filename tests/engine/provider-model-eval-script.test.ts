import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
function run(args: string[]) {
  return execFileSync(process.execPath, ["--import", "tsx", "./scripts/benchmark-model-stack.ts", ...args], { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}
describe("evaluation CLI", () => {
  it("checks frozen artifacts without calling a provider", () => {
    expect(run(["--check"])).toContain("provider model eval artifacts are in sync");
  });
  it("reports the empty template as unqualified", () => {
    const result = JSON.parse(run(["--live-summary"]));
    expect(result.entries).toBe(0);
    expect(result.productionPromotion).toBe(false);
    expect(result.groups.every((group: { eligibleForPromotionReview: boolean }) => !group.eligibleForPromotionReview)).toBe(true);
  });
  it("rejects obsolete hand-scored worksheets", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "provider-eval-"));
    try {
      const file = path.join(dir, "run.json");
      writeFileSync(file, JSON.stringify({ version: 1, entries: [{ modelId: "gpt-5.2", taskQualityScore: 10 }] }));
      expect(() => run(["--live-summary", `--live-run-file=${file}`])).toThrow(/Invalid provider model live-eval file/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
