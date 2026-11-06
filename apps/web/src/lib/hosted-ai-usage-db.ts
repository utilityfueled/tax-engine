import { ensureHostedAppSchema, getHostedServerDatabase } from "./hosted-server-db";
import Decimal from "decimal.js";

type HostedAiEnvironment = Record<string, string | undefined>;

export interface HostedAiBudgetSnapshot {
  ownerId: string;
  cycleKey: string;
  includedBudgetCents: number;
  includedUsedCents: number;
  includedRemainingCents: number;
  purchasedBudgetCents: number;
  purchasedUsedCents: number;
  purchasedRemainingCents: number;
  totalRemainingCents: number;
}

export interface RecordHostedAiCreditPurchaseInput {
  checkoutSessionId: string;
  ownerId: string;
  stripeCustomerId: string | null;
  amountPaidCents: number;
  creditedBudgetCents: number;
  currency: string;
  createdAt: string;
}

function coerceCount(value: unknown) {
  const amount = new Decimal(String(value ?? 0));
  if (!amount.isFinite() || amount.isNegative() || !amount.isInteger() || amount.gt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid AI budget cents.");
  return amount.toNumber();
}

export async function getHostedAiBudgetSnapshot(
  env: HostedAiEnvironment,
  {
    ownerId,
    cycleKey,
    includedBudgetCents
  }: {
    ownerId: string;
    cycleKey: string;
    includedBudgetCents: number;
  }
): Promise<HostedAiBudgetSnapshot> {
  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  const [purchaseResult, usageResult] = await Promise.all([
    pool.query(
      `
        SELECT
          COALESCE(SUM(credited_budget_cents), 0) AS purchased_budget_cents
        FROM hosted_ai_credit_purchases
        WHERE owner_id = $1;
      `,
      [ownerId]
    ),
    pool.query(
      `
        SELECT
          (SELECT COALESCE(SUM(included_charge_cents), 0) FROM hosted_ai_usage_ledger WHERE owner_id=$1 AND cycle_key=$2)
            + (SELECT COALESCE(SUM(included_charge_cents - included_refund_cents + included_reserved_cents),0) FROM hosted_ai_reservations WHERE owner_id=$1 AND cycle_key=$2) AS included_used_cents,
          (SELECT COALESCE(SUM(purchased_charge_cents), 0) FROM hosted_ai_usage_ledger WHERE owner_id=$1)
            + (SELECT COALESCE(SUM(purchased_charge_cents - purchased_refund_cents + purchased_reserved_cents),0) FROM hosted_ai_reservations WHERE owner_id=$1) AS purchased_used_cents;
      `,
      [ownerId, cycleKey]
    )
  ]);

  const purchasedBudgetCents = coerceCount(purchaseResult.rows[0]?.purchased_budget_cents);
  const includedUsedCents = coerceCount(usageResult.rows[0]?.included_used_cents);
  const purchasedUsedCents = coerceCount(usageResult.rows[0]?.purchased_used_cents);
  const includedRemainingCents = coerceCount(Decimal.max(0, new Decimal(includedBudgetCents).minus(includedUsedCents)).toFixed());
  const purchasedRemainingCents = coerceCount(Decimal.max(0, new Decimal(purchasedBudgetCents).minus(purchasedUsedCents)).toFixed());

  return {
    ownerId,
    cycleKey,
    includedBudgetCents,
    includedUsedCents,
    includedRemainingCents,
    purchasedBudgetCents,
    purchasedUsedCents,
    purchasedRemainingCents,
    totalRemainingCents: coerceCount(new Decimal(includedRemainingCents).plus(purchasedRemainingCents).toFixed())
  };
}

export async function recordHostedAiCreditPurchase(
  env: HostedAiEnvironment,
  input: RecordHostedAiCreditPurchaseInput
) {
  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  const result = await pool.query(
    `
      INSERT INTO hosted_ai_credit_purchases (
        checkout_session_id,
        owner_id,
        stripe_customer_id,
        amount_paid_cents,
        credited_budget_cents,
        currency,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7::timestamptz
      )
      ON CONFLICT (checkout_session_id) DO NOTHING
      RETURNING checkout_session_id;
    `,
    [
      input.checkoutSessionId,
      input.ownerId,
      input.stripeCustomerId,
      input.amountPaidCents,
      input.creditedBudgetCents,
      input.currency,
      input.createdAt
    ]
  );

  return (result.rowCount ?? 0) > 0;
}
