import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { sanitizeWorkspaceForHostedStorage } from "./hosted-privacy";
import { ensureHostedAppSchema, getHostedServerDatabase } from "./hosted-server-db";
import type {
  HostedWorkspaceStore,
  WorkspaceOwnerScope,
  HostedWorkspaceStoreFactory
} from "./workspace-persistence";

type HostedWorkspaceStoreEnvironment = Record<string, string | undefined>;

function sortByUpdatedAtDescending(workspaces: ReturnWorkspaceRecord[]) {
  return [...workspaces].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function normalizeHostedWorkspace(workspace: ReturnWorkspaceRecord): ReturnWorkspaceRecord {
  return {
    ...workspace,
    storageMode: "hosted-postgres"
  };
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
    const result = await pool.query(
      `
        INSERT INTO hosted_workspace_shells (
          owner_id,
          workspace_id,
          created_at,
          updated_at,
          workspace
        )
        VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5::jsonb)
        ON CONFLICT (owner_id, workspace_id) DO UPDATE
        SET
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          workspace = EXCLUDED.workspace
        RETURNING workspace;
      `,
      [
        ownerId,
        sanitized.id,
        sanitized.createdAt,
        sanitized.updatedAt,
        JSON.stringify(sanitized)
      ]
    );

    return normalizeHostedWorkspace(result.rows[0]?.workspace as ReturnWorkspaceRecord);
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
