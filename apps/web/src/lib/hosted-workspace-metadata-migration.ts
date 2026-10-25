import type { Pool } from "pg";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { sanitizeWorkspaceForHostedStorage } from "./hosted-privacy";

export interface WorkspaceMetadataMigrationReport {
  mode: "dry-run" | "apply";
  examined: number;
  changed: number;
  unchanged: number;
}

/** Explicit operator migration, never part of startup or a user-facing route.
 * A dry run leaves all rows intact. Apply is atomic, preserves database identity
 * and timestamps, and refuses malformed rows rather than silently discarding them.
 * Existing backups/WAL/object storage require separate retention handling.
 */
export async function migrateHostedWorkspaceMetadata(
  pool: Pool,
  { apply = false, maximumRows = 1000 }: { apply?: boolean; maximumRows?: number } = {},
): Promise<WorkspaceMetadataMigrationReport> {
  if (!Number.isSafeInteger(maximumRows) || maximumRows < 1 || maximumRows > 10000) {
    throw new Error("Metadata migration requires a row limit between 1 and 10000.");
  }
  const client = await pool.connect().catch(() => {
    throw new Error("Workspace metadata migration could not connect. No migration transaction was started.");
  });
  let commitAttempted = false;
  const report: WorkspaceMetadataMigrationReport = { mode: apply ? "apply" : "dry-run", examined: 0, changed: 0, unchanged: 0 };
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    // Bound memory and transaction scope before loading legacy JSON. A bigger
    // dataset requires an operator-reviewed batched migration, not an auto-loop.
    const count = await client.query("SELECT count(*)::text AS count, COALESCE(sum(octet_length(workspace::text)),0)::text AS bytes FROM hosted_workspace_shells");
    if (BigInt(count.rows[0].count) > BigInt(maximumRows) || BigInt(count.rows[0].bytes) > 64n * 1024n * 1024n) {
      throw new Error("Metadata migration exceeds its approved row limit.");
    }
    const rows = await client.query(`SELECT owner_id, workspace_id, workspace FROM hosted_workspace_shells ORDER BY owner_id, workspace_id${apply ? " FOR UPDATE" : ""}`);
    for (const row of rows.rows) {
      let sanitized: ReturnWorkspaceRecord;
      try {
        sanitized = sanitizeWorkspaceForHostedStorage(row.workspace as ReturnWorkspaceRecord);
        if (sanitized.id !== row.workspace_id) throw new Error("identity mismatch");
      } catch {
        throw new Error("Metadata migration found invalid legacy metadata; no changes were committed.");
      }
      const parameters = [row.owner_id, row.workspace_id, JSON.stringify(sanitized)];
      const result = apply
        ? await client.query("UPDATE hosted_workspace_shells SET workspace=$3::jsonb WHERE owner_id=$1 AND workspace_id=$2 AND workspace IS DISTINCT FROM $3::jsonb RETURNING workspace_id", parameters)
        : await client.query("SELECT workspace_id FROM hosted_workspace_shells WHERE owner_id=$1 AND workspace_id=$2 AND workspace IS DISTINCT FROM $3::jsonb", parameters);
      report.examined++;
      if (result.rowCount === 1) report.changed++;
      else report.unchanged++;
    }
    commitAttempted = apply;
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return report;
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    // Never include row values, identifiers, SQL parameters or upstream messages
    // in a report which operators may copy into logs or incident tickets.
    throw new Error(commitAttempted
      ? "Workspace metadata migration could not confirm commit. Run a new dry run to establish the stored state before retrying."
      : "Workspace metadata migration failed before commit. Inspect the database privately and retry after resolving invalid rows, limits or availability.");
  } finally {
    client.release();
  }
}
