import type { Pool } from "pg";

// Match String.trim() for reconciliation references written before normalization.
export const normalizedReconciliationReferenceSql = String.raw`btrim(reconciliation_reference, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')`;

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
      reconciliation_reference TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (owner_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS hosted_ai_reservations_owner_cycle_idx
      ON hosted_ai_reservations (owner_id, cycle_key);
    ALTER TABLE hosted_ai_reservations ADD COLUMN IF NOT EXISTS reconciliation_reference TEXT;
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
    ALTER TABLE hosted_ai_attempts ADD COLUMN IF NOT EXISTS undispatched_at TIMESTAMPTZ
      CHECK (undispatched_at IS NULL OR (state = 'rejected' AND completed_at IS NOT NULL
        AND provider_cost_usd IS NOT DISTINCT FROM 0::numeric AND usage IS NULL
        AND pricing_effective_from IS NULL AND provider_request_id IS NULL AND reconciliation_reference IS NULL));
    CREATE INDEX IF NOT EXISTS hosted_ai_attempt_reconciliation_reference_idx
      ON hosted_ai_attempts (md5(${normalizedReconciliationReferenceSql}))
      WHERE reconciliation_reference IS NOT NULL;
  `);
}
