import type { Pool } from "pg";

/** Additive migration. Legacy charges remain in the original ledger, never re-priced. */
export async function ensureHostedAiLedgerSchema(pool: Pick<Pool, "query">) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosted_ai_reservations (
      owner_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      payload_digest TEXT NOT NULL,
      cycle_key TEXT NOT NULL,
      included_budget_cents BIGINT NOT NULL CHECK (included_budget_cents >= 0),
      included_reserved_cents BIGINT NOT NULL CHECK (included_reserved_cents >= 0),
      purchased_reserved_cents BIGINT NOT NULL CHECK (purchased_reserved_cents >= 0),
      included_charge_cents BIGINT NOT NULL DEFAULT 0 CHECK (included_charge_cents >= 0),
      purchased_charge_cents BIGINT NOT NULL DEFAULT 0 CHECK (purchased_charge_cents >= 0),
      included_refund_cents BIGINT NOT NULL DEFAULT 0 CHECK (included_refund_cents >= 0),
      purchased_refund_cents BIGINT NOT NULL DEFAULT 0 CHECK (purchased_refund_cents >= 0),
      state TEXT NOT NULL CHECK (state IN ('reserved', 'running', 'reconciliation-required', 'settled', 'cancelled', 'refunded')),
      refund_reference TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (owner_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS hosted_ai_reservations_owner_cycle_idx
      ON hosted_ai_reservations (owner_id, cycle_key);
    CREATE TABLE IF NOT EXISTS hosted_ai_attempts (
      owner_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      attempt INTEGER NOT NULL CHECK (attempt IN (1, 2)),
      task TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('running', 'unknown', 'accepted', 'rejected')),
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      usage JSONB,
      provider_cost_usd NUMERIC,
      pricing_effective_from TEXT,
      provider_request_id TEXT,
      reconciliation_reference TEXT,
      PRIMARY KEY (owner_id, request_id, attempt),
      FOREIGN KEY (owner_id, request_id) REFERENCES hosted_ai_reservations (owner_id, request_id),
      CHECK (provider_cost_usd IS NULL OR provider_cost_usd >= 0)
    );
  `);
}
