import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, stat, symlink, link, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createProviderEvalPlan, executeProviderEval, providerEvalDigest } from "../../scripts/lib/provider-eval-runner";
import { openProviderEvalJournal } from "../../scripts/lib/provider-eval-journal";
const exec = promisify(execFile);
describe("offline evaluation CLI", () => {
  it("creates a private unapproved offline plan and rejects incomplete execution", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ai-eval-cli-"));
    const plan = path.join(directory, "plan.json"); const approval = path.join(directory, "approval.json");
    const journal = path.join(directory, "run.jsonl");
    const env = { ...process.env, OPENAI_API_KEY: "", GEMINI_API_KEY: "", GOOGLE_API_KEY: "" };
    const invoke = (...args: string[]) => exec(process.execPath, ["--import", "tsx", "scripts/run-provider-eval.ts", ...args], { env });
    try {
      const result = await invoke("plan", "--run-id=offline-test", "--purpose=capability", "--profiles=luna-high", "--max-usd=0.01", "--max-requests=1",
        `--expires-at=${new Date(Date.now() + 3600000).toISOString()}`, `--plan=${plan}`, `--approval-template=${approval}`);
      expect(JSON.parse(result.stdout)).toMatchObject({ liveRequests: 0, approval: "not-approved", qualification: false });
      expect((await stat(plan)).mode & 0o077).toBe(0); expect((await stat(approval)).mode & 0o077).toBe(0);
      expect(JSON.parse(await readFile(approval, "utf8"))).toMatchObject({ authorizedBy: null, authorizationReference: null });
      await expect(invoke("execute", `--plan=${plan}`, `--approval=${approval}`, `--journal=${journal}`, "--live-authorized")).rejects.toMatchObject({ stderr: expect.stringContaining("--output") });
      await expect(stat(journal)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(invoke("execute", `--plan=${plan}`, `--approval=${approval}`, `--journal=${journal}`, `--output=${path.join(directory, "result.json")}`)).rejects.toMatchObject({ stderr: expect.stringContaining("--live-authorized") });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("requires the evidenced billed model for offline reconciliation", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ai-eval-cli-"));
    const planFile = path.join(directory, "plan.json"); const journalFile = path.join(directory, "run.jsonl");
    const usageFile = path.join(directory, "usage.json"); const outputFile = path.join(directory, "result.json");
    const at = "2026-10-25T12:00:00.000Z";
    const plan = createProviderEvalPlan({ runId: "reconciliation", purpose: "capability", profileIds: ["baseline-gpt-5-mini"],
      maximumProviderUsd: "1", maximumRequests: 1, createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" });
    const approval = { version: 1, planDigest: providerEvalDigest(plan), authorizedBy: "synthetic-only",
      authorizationReference: "synthetic-only", approvedAt: at, expiresAt: plan.expiresAt, maximumProviderUsd: "1",
      maximumRequests: 1, accountReference: "synthetic-only", syntheticOnly: true };
    const invoke = (...args: string[]) => exec(process.execPath, ["--import", "tsx", "scripts/run-provider-eval.ts", ...args,
      `--plan=${planFile}`, `--journal=${journalFile}`], { env: { PATH: process.env.PATH } });
    try {
      await writeFile(planFile, JSON.stringify(plan));
      await writeFile(usageFile, JSON.stringify({ inputTokens: 100, outputTokens: 100 }));
      const journal = await openProviderEvalJournal(journalFile);
      try {
        const stopped = await executeProviderEval({ plan, approval, ...journal, now: () => at,
          transport: async () => { throw new Error("synthetic timeout"); } });
        expect(stopped.stoppedReason).toBe("unknown-usage");
        await journal.append({ type: "reconcile", attemptId: "baseline-gpt-5-mini:capability:0", evidenceReference: "legacy-invoice-row",
          usage: { inputTokens: 100, outputTokens: 50 }, at });
      } finally { await journal.close(); }
      const original = await readFile(journalFile, "utf8");
      const historical = await invoke("report", `--output=${outputFile}`);
      expect(JSON.parse(historical.stdout)).toMatchObject({ knownProviderCostUsd: "0", legacyUnverifiedProviderCostUsd: "0.000125",
        dispatchedRequests: 1 });
      expect(JSON.parse(await readFile(outputFile, "utf8")).availability).toMatchObject([{ status: "failed", reportedUsage: false }]);
      const reconcile = (...args: string[]) => invoke("reconcile", "--attempt=baseline-gpt-5-mini:capability:0",
        `--usage=${usageFile}`, "--reference=synthetic-invoice-row", ...args);
      await expect(reconcile()).rejects.toMatchObject({ stderr: expect.stringContaining("--billed-model") });
      await expect(reconcile("--billed-model=gpt-6.1-sol")).rejects.toMatchObject({ stderr: expect.stringMatching(/billed model.*approved profile/i) });
      expect(await readFile(journalFile, "utf8")).toBe(original);
      const accepted = await reconcile("--billed-model=gpt-5-mini-2025-08-07");
      expect(JSON.parse(accepted.stdout)).toMatchObject({ reconciled: "baseline-gpt-5-mini:capability:0", liveRequests: 0 });
      expect(await readFile(journalFile, "utf8")).toContain('"billedModel":"gpt-5-mini-2025-08-07"');
      const reported = await invoke("report", `--output=${outputFile}`);
      expect(JSON.parse(reported.stdout)).toMatchObject({ knownProviderCostUsd: "0.000225", unknownMaximumUsd: "0" });
      expect(JSON.parse(await readFile(outputFile, "utf8")).availability).toMatchObject([{ status: "failed" }]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("appends one explicit receipt correction offline", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ai-eval-correction-"));
    const planFile = path.join(directory, "plan.json"); const journalFile = path.join(directory, "run.jsonl");
    const usageFile = path.join(directory, "usage.json"); const outputFile = path.join(directory, "result.json");
    const at = "2026-10-25T12:00:00.000Z";
    const plan = createProviderEvalPlan({ runId: "receipt-correction", purpose: "capability", profileIds: ["luna-high", "sol-high"],
      maximumProviderUsd: "1", maximumRequests: 2, createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" });
    const approval = { version: 1, planDigest: providerEvalDigest(plan), authorizedBy: "synthetic-only",
      authorizationReference: "synthetic-only", approvedAt: at, expiresAt: plan.expiresAt, maximumProviderUsd: "1",
      maximumRequests: 2, accountReference: "synthetic-only", syntheticOnly: true };
    const invoke = (...args: string[]) => exec(process.execPath, ["--import", "tsx", "scripts/run-provider-eval.ts", ...args,
      `--plan=${planFile}`, `--journal=${journalFile}`], { env: { PATH: process.env.PATH } });
    const usage = { inputTokens: 100, outputTokens: 100 };
    const attemptId = "sol-high:capability:0";
    const sharedReference = "synthetic-probe-reference";
    try {
      await writeFile(planFile, JSON.stringify(plan));
      await writeFile(usageFile, JSON.stringify(usage));
      const journal = await openProviderEvalJournal(journalFile);
      try {
        const stopped = await executeProviderEval({ plan, approval, ...journal, now: () => at,
          transport: async request => {
            if (request.profile.id === "sol-high") throw new Error("synthetic timeout");
            return { status: "completed", reportedModel: "gpt-6-luna", usage, elapsedMs: 1, responseReference: sharedReference, payload: { probe: "ok" } };
          } });
        expect(stopped).toMatchObject({ stoppedReason: "unknown-usage", knownProviderCostUsd: "0.00006", dispatchedRequests: 2 });
        await journal.append({ type: "reconcile", attemptId, evidenceReference: sharedReference, billedModel: "gpt-6.1-sol", usage, at });
      } finally { await journal.close(); }
      const before = await readFile(journalFile, "utf8");
      const reconcile = (...args: string[]) => invoke("reconcile", `--attempt=${attemptId}`, `--usage=${usageFile}`,
        "--reference=distinct-authoritative-row", "--billed-model=gpt-6.1-sol", ...args);
      await expect(reconcile()).rejects.toMatchObject({ stderr: expect.stringMatching(/once/i) });
      await expect(reconcile("--supersedes-reference=wrong")).rejects.toMatchObject({ stderr: expect.stringMatching(/prior model-bound receipt/i) });
      await expect(invoke("report", `--output=${outputFile}`, `--supersedes-reference=${sharedReference}`))
        .rejects.toMatchObject({ stderr: expect.stringMatching(/only with reconcile/i) });
      expect(await readFile(journalFile, "utf8")).toBe(before);
      const corrected = await reconcile(`--supersedes-reference=${sharedReference}`);
      expect(JSON.parse(corrected.stdout)).toMatchObject({ reconciled: attemptId, corrected: true, liveRequests: 0 });
      const after = await readFile(journalFile, "utf8");
      expect(after.startsWith(before)).toBe(true);
      expect(JSON.parse(after.slice(before.length)).record).toMatchObject({ type: "reconcile-correction", attemptId,
        supersedesEvidenceDigest: providerEvalDigest(sharedReference), evidenceReference: "distinct-authoritative-row" });
      await expect(reconcile(`--supersedes-reference=${sharedReference}`)).rejects.toMatchObject({ stderr: expect.stringMatching(/only one correction/i) });
      expect(await readFile(journalFile, "utf8")).toBe(after);
      const report = await invoke("report", `--output=${outputFile}`);
      expect(JSON.parse(report.stdout)).toMatchObject({ knownProviderCostUsd: "0.00126", unknownMaximumUsd: "0", bindingBlockers: [], dispatchedRequests: 2 });
      expect(JSON.parse(await readFile(outputFile, "utf8")).availability).toMatchObject([
        { status: "available", reportedUsage: true }, { status: "failed", reportedUsage: true },
      ]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("rejects canonical and inode output aliases before touching the journal", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ai-eval-alias-")); const alias = `${directory}-alias`;
    try {
      await symlink(directory, alias, "dir");
      const journalFile = path.join(directory, "run.jsonl"); const planFile = path.join(directory, "plan.json");
      const plan = createProviderEvalPlan({ runId: "aliases", purpose: "capability", profileIds: ["luna-high"], maximumProviderUsd: "1", maximumRequests: 1,
        createdAt: "2026-10-25T12:00:00.000Z", expiresAt: "2026-10-25T13:00:00.000Z" });
      await writeFile(planFile, JSON.stringify(plan));
      const journal = await openProviderEvalJournal(journalFile); await journal.close();
      const original = await readFile(journalFile, "utf8");
      const hardlink = path.join(directory, "hardlink.jsonl");
      const targetLink = path.join(directory, "target-link.jsonl"); await symlink(journalFile, targetLink);
      for (const output of [path.join(alias, "run.jsonl"), targetLink, path.join(directory, "RUN.JSONL"), `${journalFile}.lock`, hardlink]) {
        if (output === hardlink) await link(journalFile, hardlink);
        await expect(exec(process.execPath, ["--import", "tsx", "scripts/run-provider-eval.ts", "report", `--plan=${planFile}`, `--journal=${journalFile}`, `--output=${output}`]))
          .rejects.toMatchObject({ stderr: expect.stringContaining("distinct") });
        expect(await readFile(journalFile, "utf8")).toBe(original);
        await expect(stat(`${journalFile}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally { await rm(alias, { force: true }); await rm(directory, { recursive: true, force: true }); }
  });
});
