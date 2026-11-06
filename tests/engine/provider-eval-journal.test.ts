import { mkdtemp, readFile, writeFile, rm, stat, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openProviderEvalJournal } from "../../scripts/lib/provider-eval-journal";
describe("durable evaluation journal", () => {
  it("rejects concurrent and damaged journals without discarding paid attempts", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-journal-test-")); const file = path.join(dir, "run.jsonl");
    try {
      const first = await openProviderEvalJournal(file);
      await first.append({ type: "start", planDigest: "test-plan", approvalDigest: "test-approval" });
      await expect(openProviderEvalJournal(file)).rejects.toThrow(/locked/);
      expect((await stat(file)).mode & 0o077).toBe(0);
      await first.close();
      const resumed = await openProviderEvalJournal(file); expect(resumed.records).toHaveLength(1); await resumed.close();
      const original = await readFile(file, "utf8");
      await writeFile(file, original.replace("test-plan", "other-plan"));
      await expect(openProviderEvalJournal(file)).rejects.toThrow(/damaged/);
      expect(await readFile(file, "utf8")).toContain("other-plan");
      await writeFile(file, original.slice(0, -1));
      await expect(openProviderEvalJournal(file)).rejects.toThrow(/Torn/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("does not keep an unpersisted record or reuse a closed writer", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-journal-test-"));
    try { const journal = await openProviderEvalJournal(path.join(dir, "run.jsonl"));
      await expect(journal.append({ type: "start", planDigest: "test", approvalDigest: "test", extra: true } as never)).rejects.toThrow();
      expect(journal.records).toEqual([]); await journal.close();
      await expect(journal.append({ type: "start", planDigest: "test", approvalDigest: "test" })).rejects.toThrow(/closed/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("locks directory aliases and rejects multiply linked histories", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-journal-test-")); const alias = `${dir}-alias`;
    try {
      await symlink(dir, alias, "dir");
      const file = path.join(dir, "run.jsonl"); const journal = await openProviderEvalJournal(file);
      await expect(openProviderEvalJournal(path.join(alias, "run.jsonl"))).rejects.toThrow(/locked/);
      await journal.close();
      await link(file, path.join(dir, "second.jsonl"));
      await expect(openProviderEvalJournal(file)).rejects.toThrow(/regular file/);
    } finally { await rm(alias, { force: true }); await rm(dir, { recursive: true, force: true }); }
  });
});
