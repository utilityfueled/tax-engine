import type { Pool } from "pg";
import { z } from "zod";
import {
  isIssuedHostedCheckoutSessionId,
  matchesHostedAiCreditIssuance,
  readHostedAiCreditIssuanceCandidates,
  type HostedAiCreditIssuance,
} from "./hosted-ai-credit-issuance";
import type { StripeBillingMode } from "./hosted-ai-storage-mode";

const stripeId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_]{1,255}$`));
const cents = z.number().int().nonnegative();
const timestamp = z.number().int().positive().max(253402300799);
const currency = z.string().regex(/^[a-z]{3}$/);
const customer = stripeId("cus");
const paymentId = stripeId("pi");
const chargeId = stripeId("ch");

const evidence = z.object({
  event: z.object({
    id: stripeId("evt"), object: z.literal("event"), livemode: z.boolean(), created: timestamp,
    account: z.null().optional(), context: z.null().optional(),
    type: z.enum(["checkout.session.completed", "checkout.session.async_payment_succeeded"]),
    data: z.object({ object: z.object({
      id: stripeId("cs"), object: z.literal("checkout.session"), mode: z.literal("payment"),
      livemode: z.boolean(), created: timestamp, expires_at: timestamp,
      payment_status: z.literal("paid"), payment_intent: paymentId, customer,
      amount_total: cents.positive(), amount_subtotal: cents.nullable(), currency,
      client_reference_id: z.string().min(1).max(255).nullable(),
      metadata: z.record(z.string(), z.string()).nullable(),
    }) }),
  }),
  paymentIntent: z.object({
    id: paymentId, object: z.literal("payment_intent"), customer: customer.nullable(),
    currency, livemode: z.boolean(), amount: cents, amount_received: cents,
    status: z.string(), latest_charge: chargeId.nullable(),
  }),
  latestCharge: z.object({
    id: chargeId, object: z.literal("charge"), customer: customer.nullable(),
    currency, livemode: z.boolean(), payment_intent: paymentId.nullable(),
    amount: cents, amount_captured: cents, amount_refunded: cents,
    status: z.string(), paid: z.boolean(), captured: z.boolean(), refunded: z.boolean(), disputed: z.boolean(),
  }).nullable(),
});

interface RetainedRecords {
  purchase_present: boolean;
  purchase_matches: boolean;
  receipt_present: boolean;
  receipt_identity_matches: boolean;
  receipt_product: string | null;
  receipt_session_matches: boolean;
  receipt_session_absent: boolean;
}

function classifyIssuance(candidates: HostedAiCreditIssuance[], sessionId: string) {
  if (candidates.length > 1) return "ambiguous";
  const [original] = candidates;
  if (!original) return "missing";
  if (original.checkoutSessionId === null) return "unbound";
  return original.checkoutSessionId === sessionId ? "bound" : "bound-to-another-session";
}

function classifyPurchase(records: RetainedRecords, bound: boolean) {
  if (!records.purchase_present) return "missing";
  if (!bound) return "unverified";
  return records.purchase_matches ? "matches-issuance" : "conflict";
}

function classifyReceipt(records: RetainedRecords) {
  if (!records.receipt_present) return "missing";
  if (!records.receipt_identity_matches) return "conflict";
  if (records.receipt_product === null && records.receipt_session_absent) return "historical-unbound";
  return records.receipt_product === "ai-credit" && records.receipt_session_matches ? "matches-event" : "conflict";
}

/** Operator evidence only. Inputs must come from the same authoritative Stripe account. */
export async function inspectHostedAiCreditConflict(pool: Pick<Pool, "connect">, mode: StripeBillingMode, input: unknown) {
  const parsed = evidence.safeParse(input);
  if (!parsed.success) throw new Error("Invalid paid Checkout evidence.");
  const { event, paymentIntent, latestCharge } = parsed.data;
  const session = event.data.object;
  const livemode = mode === "live";
  if (event.livemode !== livemode || session.livemode !== livemode || !isIssuedHostedCheckoutSessionId(session.id, livemode)) {
    throw new Error("Paid Checkout evidence has the wrong billing mode.");
  }

  const intentLinked = paymentIntent.id === session.payment_intent && paymentIntent.livemode === livemode;
  const linkedCharge = latestCharge !== null && intentLinked && latestCharge.livemode === livemode
    && paymentIntent.latest_charge === latestCharge.id && latestCharge.payment_intent === paymentIntent.id
    ? latestCharge : null;
  const intentMatchesEvent = intentLinked && paymentIntent.customer === session.customer
    && paymentIntent.currency === session.currency && paymentIntent.status === "succeeded"
    && paymentIntent.amount === session.amount_total && paymentIntent.amount_received === session.amount_total;
  const chargeMatchesEvent = linkedCharge !== null && linkedCharge.customer === session.customer
    && linkedCharge.currency === session.currency && linkedCharge.status === "succeeded" && linkedCharge.paid
    && linkedCharge.captured && linkedCharge.amount === session.amount_total && linkedCharge.amount_captured === session.amount_total;

  const client = await pool.connect();
  let discard = false;
  const lost = () => { discard = true; };
  client.on("error", lost);
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const binding = await client.query<{ mode: string }>("SELECT mode FROM hosted_ai_storage_mode WHERE singleton");
    if (binding.rows[0]?.mode !== mode) throw new Error("Hosted AI storage mode is unverified or mismatched.");
    const candidates = await readHostedAiCreditIssuanceCandidates(client, session.id, session.client_reference_id);
    const original = candidates.length === 1 ? candidates[0] : undefined;
    const issuance = classifyIssuance(candidates, session.id);
    const originalMatches = original && matchesHostedAiCreditIssuance(original, {
      checkoutSessionId: session.id, ownerId: original.ownerId, stripeCustomerId: session.customer,
      amountPaidCents: session.amount_total, creditedBudgetCents: original.creditedBudgetCents, currency: session.currency,
      checkoutProof: { clientReferenceId: session.client_reference_id, livemode: session.livemode,
        created: session.created, expiresAt: session.expires_at, amountSubtotal: session.amount_subtotal, metadata: session.metadata },
    });
    const { rows: [records] } = await client.query<RetainedRecords>(`
      SELECT purchase.checkout_session_id IS NOT NULL AS purchase_present,
        COALESCE(purchase.owner_id = $4 AND purchase.stripe_customer_id = $5 AND purchase.currency = 'usd'
          AND purchase.amount_paid_cents = $6 AND purchase.credited_budget_cents = $7, false) AS purchase_matches,
        receipt.event_id IS NOT NULL AS receipt_present,
        COALESCE(receipt.event_type = $2 AND receipt.created_at = to_timestamp($3), false) AS receipt_identity_matches,
        receipt.event_product AS receipt_product,
        COALESCE(receipt.credit_checkout_session_id = $8, false) AS receipt_session_matches,
        receipt.credit_checkout_session_id IS NULL AS receipt_session_absent
      FROM (SELECT 1) anchor
      LEFT JOIN hosted_ai_credit_purchases purchase ON purchase.checkout_session_id = $8
      LEFT JOIN hosted_billing_events receipt ON receipt.event_id = $1
    `, [event.id, event.type, event.created, original?.ownerId, original?.stripeCustomerId,
      original?.amountPaidCents, original?.creditedBudgetCents, session.id]);

    if (discard) throw new Error("Hosted AI database connection was lost.");
    await client.query("COMMIT");
    return {
      issuance,
      eventMatchesIssuance: originalMatches ?? null,
      purchase: classifyPurchase(records, issuance === "bound"),
      receipt: classifyReceipt(records),
      intentMatchesEvent,
      chargeMatchesEvent,
      refundObserved: linkedCharge ? linkedCharge.refunded || linkedCharge.amount_refunded > 0 : null,
      disputeObserved: linkedCharge?.disputed ?? null,
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally {
    try { client.release(discard); } finally { client.removeListener("error", lost); }
  }
}
