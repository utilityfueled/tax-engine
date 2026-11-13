import type { Pool } from "pg";

/** Leave the product and Session unknown on receipts written by older code. */
export async function ensureHostedBillingEventBindingSchema(pool: Pick<Pool, "query">) {
  await pool.query(`
    ALTER TABLE hosted_billing_events
      ADD COLUMN IF NOT EXISTS event_product TEXT,
      ADD COLUMN IF NOT EXISTS credit_checkout_session_id TEXT;
  `);
}
