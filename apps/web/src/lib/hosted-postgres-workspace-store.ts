import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { sanitizeWorkspaceForHostedStorage } from "./hosted-privacy";
import { ensureHostedAppSchema, getHostedServerDatabase } from "./hosted-server-db";
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
    await ensureHostedAppSchema(this.#env);
    const { pool } = await getHostedServerDatabase(this.#env);
    const result = await pool.query(
      `
        SELECT workspace
        FROM hosted_workspace_shells
        WHERE owner_id = $1 AND workspace_id = $2
        LIMIT 1;
      `,
      [ownerId, workspaceId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return normalizeHostedWorkspace(result.rows[0]?.workspace as ReturnWorkspaceRecord);
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
      // Update an existing row in place. If a concurrent delete wins, the fresh
      // insertion statement must still prove capacity for the now absent ID.
      const updated = await client.query<{ workspace: ReturnWorkspaceRecord }>(
        `
          UPDATE hosted_workspace_shells
          SET created_at = $3::timestamptz, updated_at = $4::timestamptz, workspace = $5::jsonb
          WHERE owner_id = $1 AND workspace_id = $2
          RETURNING workspace;
        `,
        values
      );
      const row = updated.rows[0] ?? (await client.query<{ workspace: ReturnWorkspaceRecord }>(
        `
          INSERT INTO hosted_workspace_shells (
            owner_id,
            workspace_id,
            created_at,
            updated_at,
            workspace
          )
          SELECT $1, $2, $3::timestamptz, $4::timestamptz, $5::jsonb
          WHERE (SELECT COUNT(*) FROM (SELECT 1 FROM hosted_workspace_shells WHERE owner_id = $1 LIMIT $6) AS owned) < $6
          RETURNING workspace;
        `,
        [...values, MAX_WORKSPACES_PER_USER]
      )).rows[0];
      if (!row) throw new HostedWorkspaceLimitError();
      const saved = normalizeHostedWorkspace(row.workspace);
      if (discard) throw new Error("Hosted workspace database connection was lost.");
      await client.query("COMMIT");
      return saved;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { discard = true; }
      throw error;
    } finally {
      try { client.release(discard); } finally { client.removeListener("error", lost); }
    }
  }

  async delete(ownerId: string, workspaceId: string) {
    await ensureHostedAppSchema(this.#env);
    const { pool } = await getHostedServerDatabase(this.#env);
    await pool.query(
      `
        DELETE FROM hosted_workspace_shells
        WHERE owner_id = $1 AND workspace_id = $2;
      `,
      [ownerId, workspaceId]
    );

    return this.listByOwner(ownerId);
  }
}

export function createHostedPostgresWorkspaceStoreFactory(
  env: HostedWorkspaceStoreEnvironment
): HostedWorkspaceStoreFactory {
  return (_ownerScope: WorkspaceOwnerScope) => new PostgresHostedWorkspaceStore(env);
}
