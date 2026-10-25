import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, stat, symlink, link, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createProviderEvalPlan } from "../../scripts/lib/provider-eval-runner";
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
