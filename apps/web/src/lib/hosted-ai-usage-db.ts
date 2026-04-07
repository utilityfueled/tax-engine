import { ensureHostedAppSchema, getHostedServerDatabase } from "./hosted-server-db";

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

export interface RecordHostedAiUsageInput {
  requestId: string;
  ownerId: string;
  cycleKey: string;
  task: string;
  provider: string;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  includedChargeCents: number;
  purchasedChargeCents: number;
  createdAt: string;
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
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number(value ?? 0) || 0;
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
          COALESCE(SUM(CASE WHEN cycle_key = $2 THEN included_charge_cents ELSE 0 END), 0) AS included_used_cents,
          COALESCE(SUM(purchased_charge_cents), 0) AS purchased_used_cents
        FROM hosted_ai_usage_ledger
        WHERE owner_id = $1;
      `,
      [ownerId, cycleKey]
    )
  ]);

  const purchasedBudgetCents = coerceCount(purchaseResult.rows[0]?.purchased_budget_cents);
  const includedUsedCents = coerceCount(usageResult.rows[0]?.included_used_cents);
  const purchasedUsedCents = coerceCount(usageResult.rows[0]?.purchased_used_cents);
  const includedRemainingCents = Math.max(0, includedBudgetCents - includedUsedCents);
  const purchasedRemainingCents = Math.max(0, purchasedBudgetCents - purchasedUsedCents);

  return {
    ownerId,
    cycleKey,
    includedBudgetCents,
    includedUsedCents,
    includedRemainingCents,
    purchasedBudgetCents,
    purchasedUsedCents,
    purchasedRemainingCents,
    totalRemainingCents: includedRemainingCents + purchasedRemainingCents
  };
}

export async function recordHostedAiUsage(
  env: HostedAiEnvironment,
  input: RecordHostedAiUsageInput
) {
  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  const result = await pool.query(
    `
      INSERT INTO hosted_ai_usage_ledger (
        request_id,
        owner_id,
        cycle_key,
        task,
        provider,
        model_id,
        input_tokens,
        output_tokens,
        estimated_cost_cents,
        included_charge_cents,
        purchased_charge_cents,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz
      )
      ON CONFLICT (request_id) DO NOTHING
      RETURNING request_id;
    `,
    [
      input.requestId,
      input.ownerId,
      input.cycleKey,
      input.task,
      input.provider,
      input.modelId,
      input.inputTokens,
      input.outputTokens,
      input.estimatedCostCents,
      input.includedChargeCents,
      input.purchasedChargeCents,
      input.createdAt
    ]
  );

  return (result.rowCount ?? 0) > 0;
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
