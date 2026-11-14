import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { sanitizeWorkspaceForHostedStorage } from "./hosted-privacy";
import { ensureHostedAppSchema, getHostedServerDatabase } from "./hosted-server-db";
import { HostedWorkspaceWriteRejectedError, type HostedWorkspaceWritePrecondition } from "./hosted-workspace-revision";
import {
  HostedWorkspaceLimitError,
  MAX_WORKSPACES_PER_USER,
  type HostedWorkspaceStore,
  type WorkspaceOwnerScope,
  type HostedWorkspaceStoreFactory
} from "./workspace-persistence";

type HostedWorkspaceStoreEnvironment = Record<string, string | undefined>;

function sortByUpdatedAtDescending(workspaces: ReturnWorkspaceRecord[]) {
  return [...workspaces].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function normalizeHostedWorkspace(workspace: ReturnWorkspaceRecord): ReturnWorkspaceRecord {
  // Old rows may predate the shell allowlist. Never return their filenames,
  // free text or extra private fields to a new browser session.
  return sanitizeWorkspaceForHostedStorage(workspace);
}

class PostgresHostedWorkspaceStore implements HostedWorkspaceStore {
  readonly #env: HostedWorkspaceStoreEnvironment;

  constructor(env: HostedWorkspaceStoreEnvironment) {
    this.#env = env;
  }

  async get(ownerId: string, workspaceId: string) {
    return (await this.getVersioned(ownerId, workspaceId))?.workspace ?? null;
  }

  async getVersioned(ownerId: string, workspaceId: string) {
    await ensureHostedAppSchema(this.#env);
    const { pool } = await getHostedServerDatabase(this.#env);
    const result = await pool.query<{ workspace: ReturnWorkspaceRecord; revision: string }>(
      `
        SELECT workspace, revision
        FROM hosted_workspace_shells
        WHERE owner_id = $1 AND workspace_id = $2
        LIMIT 1;
      `,
      [ownerId, workspaceId]
    );

    const row = result.rows[0];
    return row ? { workspace: normalizeHostedWorkspace(row.workspace), revision: row.revision } : null;
  }

  async listByOwner(ownerId: string) {
    await ensureHostedAppSchema(this.#env);
    const { pool } = await getHostedServerDatabase(this.#env);
    const result = await pool.query(
      `
        SELECT workspace
        FROM hosted_workspace_shells
        WHERE owner_id = $1
        ORDER BY updated_at DESC;
      `,
      [ownerId]
    );

    return sortByUpdatedAtDescending(
      result.rows.map((row) => normalizeHostedWorkspace(row.workspace as ReturnWorkspaceRecord))
    );
  }

  async save(ownerId: string, workspace: ReturnWorkspaceRecord) {
    return (await this.#write(ownerId, workspace)).workspace;
  }

  async writeVersioned(ownerId: string, workspace: ReturnWorkspaceRecord, precondition: HostedWorkspaceWritePrecondition) {
    return this.#write(ownerId, workspace, precondition);
  }

  async #write(ownerId: string, workspace: ReturnWorkspaceRecord, precondition?: HostedWorkspaceWritePrecondition) {
    await ensureHostedAppSchema(this.#env);
    const { pool } = await getHostedServerDatabase(this.#env);
    const sanitized = sanitizeWorkspaceForHostedStorage(workspace);
    const client = await pool.connect();
    let discard = false;
    const lost = () => { discard = true; };
    client.on("error", lost);
    try {
      // Acquire the owner lock in a separate statement. Admission must see the
      // committed writes of any previous holder after waiting for the lock.
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('tax-engine:hosted-workspace-quota:' || $1, 0))", [ownerId]);
      const values = [ownerId, sanitized.id, sanitized.createdAt, sanitized.updatedAt, JSON.stringify(sanitized)];
      type Row = { workspace: ReturnWorkspaceRecord; revision: string };
      let row: Row | undefined;
      if (precondition?.kind !== "create") {
        const expectedRevision = precondition?.revision ?? null;
        row = (await client.query<Row>(
          `
            UPDATE hosted_workspace_shells
            SET created_at = $3::timestamptz, updated_at = $4::timestamptz, workspace = $5::jsonb,
                revision = gen_random_uuid()
            WHERE owner_id = $1 AND workspace_id = $2 AND ($6::uuid IS NULL OR revision = $6::uuid)
            RETURNING workspace, revision;
          `,
          [...values, expectedRevision]
        )).rows[0];
        if (precondition && !row) throw new HostedWorkspaceWriteRejectedError();
      }
      if (!row) {
        if (precondition?.kind === "create") {
          const existing = await client.query(
            "SELECT workspace_id FROM hosted_workspace_shells WHERE owner_id = $1 AND workspace_id = $2;",
            values.slice(0, 2)
          );
          if (existing.rows.length) throw new HostedWorkspaceWriteRejectedError();
        }
        row = (await client.query<Row>(
          `
            INSERT INTO hosted_workspace_shells (
              owner_id, workspace_id, created_at, updated_at, workspace
            )
            SELECT $1, $2, $3::timestamptz, $4::timestamptz, $5::jsonb
            WHERE (SELECT COUNT(*) FROM (SELECT 1 FROM hosted_workspace_shells WHERE owner_id = $1 LIMIT $6) AS owned) < $6
            RETURNING workspace, revision;
          `,
          [...values, MAX_WORKSPACES_PER_USER]
        )).rows[0];
        if (!row) throw new HostedWorkspaceLimitError();
      }
      const saved = normalizeHostedWorkspace(row.workspace);
      if (discard) throw new Error("Hosted workspace database connection was lost.");
      await client.query("COMMIT");
      return { workspace: saved, revision: row.revision };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { discard = true; }
      throw error;
    } finally {
      try { client.release(discard); } finally { client.removeListener("error", lost); }
    }
  }

  async delete(ownerId: string, workspaceId: string, expectedRevision?: string) {
    await ensureHostedAppSchema(this.#env);
    const { pool } = await getHostedServerDatabase(this.#env);
    const deleted = await pool.query(
      `
        DELETE FROM hosted_workspace_shells
        WHERE owner_id = $1 AND workspace_id = $2
          AND ($3::uuid IS NULL OR revision = $3::uuid);
      `,
      [ownerId, workspaceId, expectedRevision ?? null]
    );
    if (expectedRevision && deleted.rowCount !== 1) throw new HostedWorkspaceWriteRejectedError();

    return this.listByOwner(ownerId);
  }
}

export function createHostedPostgresWorkspaceStoreFactory(
  env: HostedWorkspaceStoreEnvironment
): HostedWorkspaceStoreFactory {
  return (_ownerScope: WorkspaceOwnerScope) => new PostgresHostedWorkspaceStore(env);
}
