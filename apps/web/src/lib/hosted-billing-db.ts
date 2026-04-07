import type { HostedPlanId } from "@tax-engine/contracts";
import { ensureHostedAppSchema, getHostedServerDatabase } from "./hosted-server-db";
import type {
  HostedBillingSubscriptionRecord,
  HostedBillingWebhookStatus
} from "./hosted-billing-state";
import { resolveHostedEntitlement, type HostedSubscriptionSnapshot } from "./hosted-plan-access";

type HostedBillingEnvironment = Record<string, string | undefined>;

export interface PersistHostedStripeSubscriptionInput {
  ownerId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  planId: HostedPlanId | null;
  status: HostedBillingWebhookStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  eventId: string;
  eventType: string;
  eventCreatedAt: string;
  updatedAt: string;
}

export interface HostedReminderSettingsRecord {
  ownerId: string;
  quarterlyEstimateEmail: boolean;
  filingDeadlineEmail: boolean;
  productUpdatesEmail: boolean;
  createdAt: string;
  updatedAt: string;
}

function normalizeSubscriptionRow(row: Record<string, unknown>): HostedBillingSubscriptionRecord & {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
} {
  return {
    subscriptionId: String(row.stripe_subscription_id),
    customerId: typeof row.stripe_customer_id === "string" ? row.stripe_customer_id : null,
    workspaceOwnerId: typeof row.owner_id === "string" ? row.owner_id : null,
    planId: typeof row.plan_id === "string" ? row.plan_id as HostedPlanId : null,
    status: String(row.status) as HostedBillingWebhookStatus,
    lastEventId: String(row.last_event_id),
    lastEventType: "",
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    currentPeriodEnd: row.current_period_end ? new Date(String(row.current_period_end)).toISOString() : null
  };
}

export async function markStripeEventProcessed(
  env: HostedBillingEnvironment,
  event: {
    id: string;
    type: string;
    createdAt: string;
  }
) {
  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  const inserted = await pool.query(
    `
      INSERT INTO hosted_billing_events (event_id, event_type, created_at)
      VALUES ($1, $2, $3::timestamptz)
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id;
    `,
    [event.id, event.type, event.createdAt]
  );

  return (inserted.rowCount ?? 0) > 0;
}

export async function persistHostedStripeSubscription(
  env: HostedBillingEnvironment,
  input: PersistHostedStripeSubscriptionInput
) {
  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  const result = await pool.query(
    `
      INSERT INTO hosted_billing_subscriptions (
        stripe_subscription_id,
        owner_id,
        stripe_customer_id,
        plan_id,
        status,
        current_period_end,
        cancel_at_period_end,
        last_event_id,
        last_event_created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6::timestamptz, $7, $8, $9::timestamptz, $10::timestamptz
      )
      ON CONFLICT (stripe_subscription_id) DO UPDATE
      SET
        owner_id = EXCLUDED.owner_id,
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, hosted_billing_subscriptions.stripe_customer_id),
        plan_id = COALESCE(EXCLUDED.plan_id, hosted_billing_subscriptions.plan_id),
        status = EXCLUDED.status,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        last_event_id = EXCLUDED.last_event_id,
        last_event_created_at = EXCLUDED.last_event_created_at,
        updated_at = EXCLUDED.updated_at
      RETURNING
        stripe_subscription_id,
        owner_id,
        stripe_customer_id,
        plan_id,
        status,
        cancel_at_period_end,
        current_period_end,
        last_event_id,
        updated_at;
    `,
    [
      input.stripeSubscriptionId,
      input.ownerId,
      input.stripeCustomerId,
      input.planId,
      input.status,
      input.currentPeriodEnd,
      input.cancelAtPeriodEnd,
      input.eventId,
      input.eventCreatedAt,
      input.updatedAt
    ]
  );

  return normalizeSubscriptionRow(result.rows[0] as Record<string, unknown>);
}

export async function getHostedSubscriptionByOwnerId(
  env: HostedBillingEnvironment,
  ownerId: string
): Promise<(HostedBillingSubscriptionRecord & {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}) | null> {
  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  const result = await pool.query(
    `
      SELECT
        stripe_subscription_id,
        owner_id,
        stripe_customer_id,
        plan_id,
        status,
        cancel_at_period_end,
        current_period_end,
        last_event_id,
        updated_at
      FROM hosted_billing_subscriptions
      WHERE owner_id = $1
      ORDER BY updated_at DESC
      LIMIT 1;
    `,
    [ownerId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return normalizeSubscriptionRow(result.rows[0] as Record<string, unknown>);
}

export async function getHostedSubscriptionBySubscriptionId(
  env: HostedBillingEnvironment,
  subscriptionId: string
): Promise<(HostedBillingSubscriptionRecord & {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}) | null> {
  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  const result = await pool.query(
    `
      SELECT
        stripe_subscription_id,
        owner_id,
        stripe_customer_id,
        plan_id,
        status,
        cancel_at_period_end,
        current_period_end,
        last_event_id,
        updated_at
      FROM hosted_billing_subscriptions
      WHERE stripe_subscription_id = $1
      LIMIT 1;
    `,
    [subscriptionId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return normalizeSubscriptionRow(result.rows[0] as Record<string, unknown>);
}

export async function getHostedSubscriptionByCustomerId(
  env: HostedBillingEnvironment,
  customerId: string
): Promise<(HostedBillingSubscriptionRecord & {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}) | null> {
  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  const result = await pool.query(
    `
      SELECT
        stripe_subscription_id,
        owner_id,
        stripe_customer_id,
        plan_id,
        status,
        cancel_at_period_end,
        current_period_end,
        last_event_id,
        updated_at
      FROM hosted_billing_subscriptions
      WHERE stripe_customer_id = $1
      ORDER BY updated_at DESC
      LIMIT 1;
    `,
    [customerId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return normalizeSubscriptionRow(result.rows[0] as Record<string, unknown>);
}

export async function deleteHostedSubscriptionBySubscriptionId(
  env: HostedBillingEnvironment,
  subscriptionId: string
) {
  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  await pool.query(
    `
      DELETE FROM hosted_billing_subscriptions
      WHERE stripe_subscription_id = $1;
    `,
    [subscriptionId]
  );
}

export async function getHostedEntitlementByOwnerId(
  env: HostedBillingEnvironment,
  ownerId: string
) {
  const subscription = await getHostedSubscriptionByOwnerId(env, ownerId);
  const snapshot: HostedSubscriptionSnapshot | null = subscription
    ? {
        planId: subscription.planId,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd
      }
    : null;

  return {
    subscription,
    entitlement: resolveHostedEntitlement(snapshot)
  };
}

export async function upsertHostedReminderSettings(
  env: HostedBillingEnvironment,
  ownerId: string,
  settings: Pick<
    HostedReminderSettingsRecord,
    "quarterlyEstimateEmail" | "filingDeadlineEmail" | "productUpdatesEmail"
  >
) {
  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  const result = await pool.query(
    `
      INSERT INTO hosted_reminder_settings (
        owner_id,
        quarterly_estimate_email,
        filing_deadline_email,
        product_updates_email
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (owner_id) DO UPDATE
      SET
        quarterly_estimate_email = EXCLUDED.quarterly_estimate_email,
        filing_deadline_email = EXCLUDED.filing_deadline_email,
        product_updates_email = EXCLUDED.product_updates_email,
        updated_at = NOW()
      RETURNING
        owner_id,
        quarterly_estimate_email,
        filing_deadline_email,
        product_updates_email,
        created_at,
        updated_at;
    `,
    [
      ownerId,
      settings.quarterlyEstimateEmail,
      settings.filingDeadlineEmail,
      settings.productUpdatesEmail
    ]
  );

  const row = result.rows[0] as Record<string, unknown>;
  return {
    ownerId: String(row.owner_id),
    quarterlyEstimateEmail: Boolean(row.quarterly_estimate_email),
    filingDeadlineEmail: Boolean(row.filing_deadline_email),
    productUpdatesEmail: Boolean(row.product_updates_email),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  } satisfies HostedReminderSettingsRecord;
}

export async function getHostedReminderSettings(
  env: HostedBillingEnvironment,
  ownerId: string
): Promise<HostedReminderSettingsRecord | null> {
  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  const result = await pool.query(
    `
      SELECT
        owner_id,
        quarterly_estimate_email,
        filing_deadline_email,
        product_updates_email,
        created_at,
        updated_at
      FROM hosted_reminder_settings
      WHERE owner_id = $1
      LIMIT 1;
    `,
    [ownerId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0] as Record<string, unknown>;
  return {
    ownerId: String(row.owner_id),
    quarterlyEstimateEmail: Boolean(row.quarterly_estimate_email),
    filingDeadlineEmail: Boolean(row.filing_deadline_email),
    productUpdatesEmail: Boolean(row.product_updates_email),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}
