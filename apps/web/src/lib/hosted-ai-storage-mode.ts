import type { Pool, PoolClient } from "pg";

export type StripeBillingMode = "test" | "live";

export function configuredStripeBillingMode(env: Record<string, string | undefined>): StripeBillingMode {
  return env.TAX_ENGINE_BILLING_MODE?.trim().toLowerCase() === "live" ? "live" : "test";
}

export class HostedAiStorageModeError extends Error {}

export async function ensureHostedAiStorageModeSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosted_ai_storage_mode (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
      mode TEXT NOT NULL CHECK (mode IN ('test', 'live'))
    );
    CREATE OR REPLACE FUNCTION hosted_ai_storage_mode_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'Hosted AI database mode is immutable';
      END $$;
    CREATE OR REPLACE TRIGGER hosted_ai_storage_mode_immutable
      BEFORE UPDATE OR DELETE OR TRUNCATE ON hosted_ai_storage_mode FOR EACH STATEMENT
      EXECUTE FUNCTION hosted_ai_storage_mode_immutable();
  `);
}

/** Run inside the caller's transaction before observing or changing any AI accounting. */
async function requireHostedAiStorageMode(client: PoolClient, mode: StripeBillingMode, initialize: boolean) {
  const read = () => client.query<{ mode: StripeBillingMode }>("SELECT mode FROM hosted_ai_storage_mode WHERE singleton");
  let { rows: [binding] } = await read();
  if (!binding) {
    // First-use work must observe committed rows after any competing initializer.
    await client.query("LOCK TABLE hosted_ai_storage_mode IN SHARE ROW EXCLUSIVE MODE");
    ({ rows: [binding] } = await read());
  }
  if (binding) {
    if (binding.mode !== mode) throw new HostedAiStorageModeError("Hosted AI database mode does not match the configured Stripe mode.");
    return;
  }
  const { rows: [history] } = await client.query<{ present: boolean }>(`
    SELECT EXISTS (SELECT 1 FROM hosted_ai_credit_issuances)
        OR EXISTS (SELECT 1 FROM hosted_ai_credit_purchases)
        OR EXISTS (SELECT 1 FROM hosted_ai_usage_ledger)
        OR EXISTS (SELECT 1 FROM hosted_ai_reservations)
        OR EXISTS (SELECT 1 FROM hosted_ai_attempts) AS present
  `);
  if (history.present) throw new HostedAiStorageModeError("Unclassified historical AI accounting requires a reviewed database migration.");
  if (initialize) await client.query("INSERT INTO hosted_ai_storage_mode (mode) VALUES ($1)", [mode]);
}

export async function withHostedAiStorageMode<T>(pool: Pick<Pool, "connect">, mode: StripeBillingMode, initialize: boolean, operation: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  let discard = false;
  const lost = () => { discard = true; };
  client.on("error", lost);
  try {
    await client.query("BEGIN");
    await requireHostedAiStorageMode(client, mode, initialize);
    const result = await operation(client);
    if (discard) throw new Error("Hosted AI database connection was lost.");
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally {
    try { client.release(discard); } finally { client.removeListener("error", lost); }
  }
}
