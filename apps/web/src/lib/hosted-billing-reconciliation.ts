import type { HostedPlanId } from "@tax-engine/contracts";
import type { PersistHostedStripeSubscriptionInput } from "./hosted-billing-db";
import type { HostedBillingWebhookStatus } from "./hosted-billing-state";
import { getHostedBillingConfig } from "./hosted-billing";
import { ensureHostedAppSchema, getHostedServerDatabase } from "./hosted-server-db";

export interface ReconcileHostedSubscriptionInput extends PersistHostedStripeSubscriptionInput {
  livemode: boolean;
}

export interface VerifiedCurrentHostedSubscription {
  subscriptionId: string;
  customerId: string;
  ownerId: string;
  planId: HostedPlanId;
  status: HostedBillingWebhookStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  livemode: boolean;
}

export type HostedSubscriptionReconciliationResult = {
  outcome: "applied" | "duplicate" | "superseded";
};

export type LoadCurrentHostedSubscription = (
  input: Readonly<ReconcileHostedSubscriptionInput>
) => Promise<VerifiedCurrentHostedSubscription>;

const stripeId = /^[a-zA-Z]{2,20}_[a-zA-Z0-9_]{1,255}$/;
const ownerId = /^[a-zA-Z0-9_-]{1,128}$/;
const statuses = new Set(["checkout-pending", "active", "past-due", "canceled"]);
const eventTypes = new Set(["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"]);
const validDate = (value: string) => Number.isFinite(Date.parse(value));

/**
 * One receipt and entitlement transaction, with the authoritative read inside
 * the customer/subscription serialization boundary. Event creation is audit
 * data, never an ordering key. The route authenticates the original payload.
 */
export async function reconcileHostedStripeSubscriptionEvent(
  env: Record<string, string | undefined>,
  input: Readonly<ReconcileHostedSubscriptionInput>,
  loadCurrent: LoadCurrentHostedSubscription
): Promise<HostedSubscriptionReconciliationResult> {
  const config = getHostedBillingConfig(env);
  if (config.deploymentMode !== "hosted" || config.mode === "disabled"
    || typeof input.livemode !== "boolean" || input.livemode !== (config.mode === "live")) {
    throw new Error("Invalid hosted subscription mode.");
  }
  if (!input.stripeCustomerId || !stripeId.test(input.stripeCustomerId)) {
    throw new Error("A signed subscription customer is required for reconciliation.");
  }
  if (!stripeId.test(input.stripeSubscriptionId) || !stripeId.test(input.eventId)
    || !ownerId.test(input.ownerId) || !eventTypes.has(input.eventType)
    || !validDate(input.eventCreatedAt) || !validDate(input.updatedAt)) {
    throw new Error("Invalid subscription reconciliation identity or event.");
  }

  await ensureHostedAppSchema(env);
  const { pool } = await getHostedServerDatabase(env);
  const client = await pool.connect();
  let discard = false;
  let connectionError: Error | null = null;
  const onClientError = (error: Error) => {
    connectionError = error;
    discard = true;
  };
  // pg-pool removes its idle error listener while the client is checked out.
  // A server disconnect during the awaited provider read must not become an
  // unhandled EventEmitter error or permit reuse of the uncertain connection.
  client.on("error", onClientError);
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '2000ms'");
    await client.query("SET LOCAL statement_timeout = '4000ms'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '5000ms'");
    // Lock missing rows as well as existing rows, and always acquire both
    // namespaces in the same order. Hash collisions only serialize extra work.
    const keys = [`hosted-billing:customer:${input.stripeCustomerId}`, `hosted-billing:subscription:${input.stripeSubscriptionId}`].sort();
    for (const key of keys) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
    }
    const claimed = await client.query(
      `INSERT INTO hosted_billing_events (event_id, event_type, created_at)
       VALUES ($1, $2, $3::timestamptz)
       ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [input.eventId, input.eventType, input.eventCreatedAt]
    );
    if ((claimed.rowCount ?? 0) === 0) {
      await client.query("COMMIT");
      return { outcome: "duplicate" };
    }

    const existing = await client.query<{
      stripe_subscription_id: string;
      stripe_customer_id: string | null;
      owner_id: string;
      status: string;
    }>(
      `SELECT stripe_subscription_id, stripe_customer_id, owner_id, status
       FROM hosted_billing_subscriptions
       WHERE stripe_subscription_id = $1 OR stripe_customer_id = $2 FOR UPDATE`,
      [input.stripeSubscriptionId, input.stripeCustomerId]
    );
    for (const row of existing.rows) {
      if (row.owner_id !== input.ownerId
        || (row.stripe_subscription_id === input.stripeSubscriptionId
          && row.stripe_customer_id !== null && row.stripe_customer_id !== input.stripeCustomerId)) {
        throw new Error("Subscription owner or customer identity conflicts with retained state.");
      }
    }

    const current = await loadCurrent(input);
    if (connectionError) throw connectionError;
    if (current.subscriptionId !== input.stripeSubscriptionId || current.customerId !== input.stripeCustomerId
      || current.ownerId !== input.ownerId || current.livemode !== input.livemode) {
      throw new Error("Authoritative subscription identity or mode does not match the signed source.");
    }
    if (!["starter", "plus", "review"].includes(current.planId) || !statuses.has(current.status)
      || typeof current.cancelAtPeriodEnd !== "boolean"
      || (current.currentPeriodEnd !== null && !validDate(current.currentPeriodEnd))) {
      throw new Error("Invalid authoritative subscription metadata or period.");
    }
    const other = existing.rows.filter((row) => row.stripe_subscription_id !== current.subscriptionId);
    if (other.some((row) => row.status !== "canceled")) {
      if (current.status !== "canceled") throw new Error("Conflicting active customer subscription.");
      // Do not refresh canceled history and eclipse the active replacement in
      // the existing owner lookup, which orders by local processing timestamp.
      await client.query("COMMIT");
      return { outcome: "superseded" };
    }
    if (current.status !== "canceled") {
      for (const row of other) {
        await client.query(
          "DELETE FROM hosted_billing_subscriptions WHERE stripe_subscription_id = $1 AND owner_id = $2 AND status = 'canceled'",
          [row.stripe_subscription_id, input.ownerId]
        );
      }
    }

    await client.query(
      `INSERT INTO hosted_billing_subscriptions (
         stripe_subscription_id, owner_id, stripe_customer_id, plan_id, status,
         current_period_end, cancel_at_period_end, last_event_id, last_event_created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9::timestamptz, $10::timestamptz)
       ON CONFLICT (stripe_subscription_id) DO UPDATE SET
         owner_id = EXCLUDED.owner_id, stripe_customer_id = EXCLUDED.stripe_customer_id,
         plan_id = EXCLUDED.plan_id, status = EXCLUDED.status,
         current_period_end = EXCLUDED.current_period_end, cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         last_event_id = EXCLUDED.last_event_id, last_event_created_at = EXCLUDED.last_event_created_at,
         updated_at = EXCLUDED.updated_at`,
      [current.subscriptionId, current.ownerId, current.customerId, current.planId, current.status,
        current.currentPeriodEnd, current.cancelAtPeriodEnd, input.eventId, input.eventCreatedAt, input.updatedAt]
    );
    await client.query("COMMIT");
    return { outcome: "applied" };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally {
    // Existing pool query-timeout handling discards an uncertain client too;
    // failed rollback must never return a broken connection for another request.
    try { client.release(discard); } finally { client.removeListener("error", onClientError); }
  }
}
