import { Kysely, PostgresDialect } from "kysely";
import { Pool, type PoolClient } from "pg";
import { resolveDeploymentMode } from "./deployment-mode";
import { ensureHostedAiLedgerSchema } from "./hosted-ai-ledger-schema";

type HostedDbEnvironment = Record<string, string | undefined>;

export interface HostedServerDatabaseConfig {
  deploymentMode: "self-host" | "hosted";
  nodeEnv: string;
  databaseUrl: string | null;
  blocked: boolean;
}

export type HostedServerDatabase = Kysely<Record<string, never>>;

interface HostedServerDatabaseRuntime {
  pool: Pool;
  db: HostedServerDatabase;
}

const hostedServerDatabaseCache = globalThis as typeof globalThis & {
  __tax_engine_hosted_server_databases__?: Map<string, HostedServerDatabaseRuntime>;
  __tax_engine_hosted_schema_promises__?: Map<string, Promise<void>>;
};

function getDatabaseRuntimeCache() {
  if (!hostedServerDatabaseCache.__tax_engine_hosted_server_databases__) {
    hostedServerDatabaseCache.__tax_engine_hosted_server_databases__ = new Map();
  }

  return hostedServerDatabaseCache.__tax_engine_hosted_server_databases__;
}

function getSchemaPromiseCache() {
  if (!hostedServerDatabaseCache.__tax_engine_hosted_schema_promises__) {
    hostedServerDatabaseCache.__tax_engine_hosted_schema_promises__ = new Map();
  }

  return hostedServerDatabaseCache.__tax_engine_hosted_schema_promises__;
}

function normalizeHostedDatabaseUrl(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);

    if (parsed.searchParams.get("sslrootcert") === "system") {
      parsed.searchParams.delete("sslrootcert");
    }

    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

function resolveHostedPoolSsl(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);
    const sslMode = parsed.searchParams.get("sslmode");
    const requiresTls = parsed.hostname.endsWith(".psdb.cloud")
      || sslMode === "require"
      || sslMode === "verify-ca"
      || sslMode === "verify-full";

    return requiresTls
      ? { rejectUnauthorized: true }
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeHostedSchemaError(error: unknown) {
  if (error instanceof Error && /permission denied for schema/i.test(error.message)) {
    return new Error(
      "Hosted database setup failed: the configured database role can query the database but cannot create tables in the target schema. " +
      "Grant CREATE on the schema or pre-provision the hosted auth/billing tables before enabling hosted mode."
    );
  }

  return error;
}

function discardClientAfterReadTimeout(client: PoolClient) {
  const query = client.query.bind(client);
  const discard = (error: unknown) => {
    if (error instanceof Error && error.message === "Query read timeout"
      && (!("code" in error) || error.code === undefined)) {
      // pg's client-side timeout does not cancel a sent non-pipelined query.
      // End through the public API before Kysely releases without an error:
      // this marks the client ending synchronously and disconnects the pending
      // query, so a transaction rolls back and the pool cannot reuse it.
      void client.end().catch(() => {});
    }
  };
  client.query = ((...args: unknown[]) => {
    const callback = args.at(-1);
    if (typeof callback === "function") {
      args[args.length - 1] = function(this: unknown, error: unknown, ...values: unknown[]) {
        discard(error);
        return Reflect.apply(callback, this, [error, ...values]);
      };
    }
    const result: unknown = Reflect.apply(query, client, args);
    return result instanceof Promise ? result.catch((error: unknown) => { discard(error); throw error; }) : result;
  }) as typeof client.query;
}

export function getHostedServerDatabaseConfig(
  env: HostedDbEnvironment = process.env
): HostedServerDatabaseConfig {
  const deploymentMode = resolveDeploymentMode(env);
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase() || "development";
  const databaseUrl = env.DATABASE_URL?.trim() || null;
  const blocked = deploymentMode === "hosted" && nodeEnv === "production" && !databaseUrl;

  if (blocked) {
    console.error(
      "[security] CRITICAL: DATABASE_URL is not configured for hosted production mode. " +
      "Hosted auth, billing, and workspace persistence are blocked."
    );
  }

  return {
    deploymentMode,
    nodeEnv,
    databaseUrl,
    blocked
  };
}

export async function getHostedServerDatabase(
  env: HostedDbEnvironment = process.env
): Promise<HostedServerDatabaseRuntime> {
  const config = getHostedServerDatabaseConfig(env);

  if (config.deploymentMode !== "hosted") {
    throw new Error("Server configuration error: hosted database access is disabled outside hosted mode.");
  }

  if (!config.databaseUrl) {
    throw new Error(
      "Server configuration error: DATABASE_URL is required for hosted account, billing, and persistence features."
    );
  }

  const normalizedDatabaseUrl = normalizeHostedDatabaseUrl(config.databaseUrl);
  const cache = getDatabaseRuntimeCache();
  const existing = cache.get(normalizedDatabaseUrl);

  if (existing) {
    return existing;
  }

  const pool = new Pool({
    connectionString: normalizedDatabaseUrl,
    ssl: resolveHostedPoolSsl(normalizedDatabaseUrl),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // The server cancels ordinary slow writes before the client read deadline.
    // Never replay a mutation merely because its response timed out.
    statement_timeout: 10_000,
    lock_timeout: 3_000,
    idle_in_transaction_session_timeout: 15_000,
    query_timeout: 15_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  pool.on("connect", discardClientAfterReadTimeout);
  // pg has already discarded an idle client before emitting this event.
  // An absent listener crashes Node; raw driver errors can contain private data.
  pool.on("error", () => {
    console.error("[availability] Hosted database connection lost; a new connection will be required.");
  });
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({ pool })
  });
  const runtime = { pool, db };

  cache.set(normalizedDatabaseUrl, runtime);
  return runtime;
}

async function createHostedAppTables(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosted_account_profiles (
      user_id TEXT PRIMARY KEY,
      billing_email TEXT,
      plan_override TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT hosted_account_profiles_plan_override_check
        CHECK (plan_override IS NULL OR plan_override IN ('starter', 'plus', 'review'))
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosted_workspace_shells (
      owner_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      workspace JSONB NOT NULL,
      PRIMARY KEY (owner_id, workspace_id)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS hosted_workspace_shells_owner_updated_idx
      ON hosted_workspace_shells (owner_id, updated_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosted_billing_subscriptions (
      stripe_subscription_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      stripe_customer_id TEXT,
      plan_id TEXT,
      status TEXT NOT NULL,
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      last_event_id TEXT NOT NULL,
      last_event_created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT hosted_billing_subscriptions_plan_id_check
        CHECK (plan_id IS NULL OR plan_id IN ('starter', 'plus', 'review')),
      CONSTRAINT hosted_billing_subscriptions_status_check
        CHECK (status IN ('checkout-pending', 'active', 'past-due', 'canceled'))
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS hosted_billing_subscriptions_owner_idx
      ON hosted_billing_subscriptions (owner_id, updated_at DESC);
  `);

  await pool.query(`
    DROP INDEX IF EXISTS hosted_billing_subscriptions_customer_idx;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS hosted_billing_subscriptions_active_customer_idx
      ON hosted_billing_subscriptions (stripe_customer_id)
      WHERE stripe_customer_id IS NOT NULL AND status <> 'canceled';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosted_billing_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosted_reminder_settings (
      owner_id TEXT PRIMARY KEY,
      quarterly_estimate_email BOOLEAN NOT NULL DEFAULT FALSE,
      filing_deadline_email BOOLEAN NOT NULL DEFAULT FALSE,
      product_updates_email BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosted_ai_credit_purchases (
      checkout_session_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      stripe_customer_id TEXT,
      amount_paid_cents INTEGER NOT NULL CHECK (amount_paid_cents >= 0),
      credited_budget_cents INTEGER NOT NULL CHECK (credited_budget_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'usd',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS hosted_ai_credit_purchases_owner_idx
      ON hosted_ai_credit_purchases (owner_id, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosted_ai_usage_ledger (
      request_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      cycle_key TEXT NOT NULL,
      task TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_id TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
      output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
      estimated_cost_cents INTEGER NOT NULL CHECK (estimated_cost_cents >= 0),
      included_charge_cents INTEGER NOT NULL DEFAULT 0 CHECK (included_charge_cents >= 0),
      purchased_charge_cents INTEGER NOT NULL DEFAULT 0 CHECK (purchased_charge_cents >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS hosted_ai_usage_ledger_owner_cycle_idx
      ON hosted_ai_usage_ledger (owner_id, cycle_key, created_at DESC);
  `);
  await ensureHostedAiLedgerSchema(pool);
}

export async function ensureHostedAppSchema(
  env: HostedDbEnvironment = process.env
): Promise<void> {
  const config = getHostedServerDatabaseConfig(env);

  if (config.deploymentMode !== "hosted" || !config.databaseUrl) {
    return;
  }

  const schemaPromiseCache = getSchemaPromiseCache();
  const existing = schemaPromiseCache.get(config.databaseUrl);

  if (existing) {
    await existing;
    return;
  }

  const promise = (async () => {
    const { pool } = await getHostedServerDatabase(env);
    await createHostedAppTables(pool);
  })();

  schemaPromiseCache.set(config.databaseUrl, promise);

  try {
    await promise;
  } catch (error) {
    schemaPromiseCache.delete(config.databaseUrl);
    throw normalizeHostedSchemaError(error);
  }
}
