import { open, mkdir, readFile, unlink, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseEvalJournalRecord, providerEvalDigest, type EvalJournalRecord } from "./provider-eval-runner";
const maximumBytes = 128 * 1024 * 1024;
const rowSchema = z.strictObject({ sequence: z.number().int().nonnegative(), previousDigest: z.string().nullable(), record: z.unknown(), digest: z.string() });
const lockSchema = z.strictObject({ pid: z.number().int().positive(), host: z.string(), token: z.string() });
/** A local single-writer journal. An uncertain paid attempt survives every restart. */
export async function openProviderEvalJournal(file: string) {
  const requested = path.resolve(file);
  await mkdir(path.dirname(requested), { recursive: true, mode: 0o700 });
  const directory = await realpath(path.dirname(requested));
  const filename = path.join(directory, path.basename(requested)); const lockPath = `${filename}.lock`;
  const token = randomUUID();
  try {
    const lock = await open(lockPath, "wx", 0o600);
    try { await lock.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), token })); await lock.sync(); } finally { await lock.close(); }
  } catch {
    // A stale lock needs explicit operator inspection/removal. Never auto-unlink:
    // two recoverers could otherwise remove a newly acquired process lock.
    throw new Error("Evaluation journal is locked; inspect the owning process and preserve the journal before removing a stale lock.");
  }

  const release = async () => {
    const current = lockSchema.parse(JSON.parse(await readFile(lockPath, "utf8")));
    if (current.token !== token) throw new Error("Journal lock ownership changed.");
    await unlink(lockPath);
  };
  try {
    const handle = await open(filename, constants.O_CREAT | constants.O_APPEND | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
    try {
      const stats = await handle.stat();
      if (!stats.isFile() || stats.nlink !== 1 || (stats.mode & 0o077) !== 0 || stats.size > maximumBytes) throw new Error("Journal must be a bounded private regular file with one link.");
      // Persist the directory entry as well as later record contents before any
      // paid request. A host crash must not erase a newly created journal name.
      const parent = await open(directory, constants.O_RDONLY);
      try { await parent.sync(); } finally { await parent.close(); }
      const content = await handle.readFile("utf8");
      if (content && !content.endsWith("\n")) throw new Error("Torn journal record; preserve file for reconciliation.");
      const records: EvalJournalRecord[] = []; let previousDigest: string | null = null; let size = stats.size;
      for (const line of content ? content.split("\n").slice(0, -1) : []) {
        const row = rowSchema.parse(JSON.parse(line));
        if (row.sequence !== records.length || row.previousDigest !== previousDigest
          || row.digest !== providerEvalDigest({ sequence: row.sequence, previousDigest: row.previousDigest, record: row.record })) throw new Error("Journal hash chain is damaged; preserve all paid attempts.");
        records.push(parseEvalJournalRecord(row.record)); previousDigest = row.digest;
      }
      let closed = false; let appending = false;
      return { records,
        async append(raw: EvalJournalRecord) {
          if (closed || appending) throw new Error("Journal is closed or already writing.");
          appending = true;
          try {
            const record = parseEvalJournalRecord(raw); const base = { sequence: records.length, previousDigest, record };
            const digest = providerEvalDigest(base); const text = `${JSON.stringify({ ...base, digest })}\n`;
            if (size + Buffer.byteLength(text) > maximumBytes) throw new Error("Journal size budget exceeded.");
            await handle.writeFile(text, "utf8"); await handle.sync();
            records.push(record); previousDigest = digest; size += Buffer.byteLength(text);
          } finally { appending = false; }
        },
        async close() { if (closed) return; if (appending) throw new Error("Cannot close during durable append."); closed = true; await handle.close(); await release(); },
      };
    } catch (error) { await handle.close(); throw error; }
  } catch (error) { await release(); throw error; }
}
