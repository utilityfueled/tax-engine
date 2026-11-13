import type { Pool } from "pg";

export async function ensureHostedAiCreditIssuanceSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hosted_ai_credit_issuances (
      issuance_id TEXT PRIMARY KEY,
      checkout_session_id TEXT UNIQUE,
      owner_id TEXT NOT NULL,
      stripe_customer_id TEXT NOT NULL,
      livemode BOOLEAN NOT NULL,
      amount_paid_cents INTEGER NOT NULL CHECK (amount_paid_cents > 0),
      credited_budget_cents INTEGER NOT NULL CHECK (credited_budget_cents > 0),
      currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS hosted_ai_credit_unbound_expiry_idx
      ON hosted_ai_credit_issuances(expires_at) WHERE checkout_session_id IS NULL;
    CREATE OR REPLACE FUNCTION hosted_ai_credit_issuance_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
      IF ROW(OLD.issuance_id,OLD.owner_id,OLD.stripe_customer_id,OLD.livemode,
             OLD.amount_paid_cents,OLD.credited_budget_cents,OLD.currency,OLD.created_at,OLD.expires_at)
        IS DISTINCT FROM ROW(NEW.issuance_id,NEW.owner_id,NEW.stripe_customer_id,NEW.livemode,
             NEW.amount_paid_cents,NEW.credited_budget_cents,NEW.currency,NEW.created_at,NEW.expires_at)
        OR (OLD.checkout_session_id IS NOT NULL AND OLD.checkout_session_id IS DISTINCT FROM NEW.checkout_session_id)
      THEN RAISE EXCEPTION 'AI credit issuance terms are immutable'; END IF;
      RETURN NEW; END $$;
    CREATE OR REPLACE TRIGGER hosted_ai_credit_issuance_immutable
      BEFORE UPDATE ON hosted_ai_credit_issuances FOR EACH ROW
      EXECUTE FUNCTION hosted_ai_credit_issuance_immutable();
  `);
}
