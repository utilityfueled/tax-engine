import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { NextResponse } from "next/server";
import type { HostedPlanId } from "@tax-engine/contracts";
import { getHostedBillingConfig, isHostedStripeKeyModeCompatible } from "./hosted-billing";
import type {
  deleteHostedSubscriptionBySubscriptionId,
  getHostedSubscriptionByCustomerId,
  getHostedSubscriptionBySubscriptionId,
  persistHostedStripeSubscription
} from "./hosted-billing-db";
import type { markStripeEventProcessed } from "./hosted-billing-db";
import {
  reconcileHostedStripeSubscriptionEvent,
  type ReconcileHostedSubscriptionInput,
  type HostedSubscriptionReconciliationResult,
  type VerifiedCurrentHostedSubscription
} from "./hosted-billing-reconciliation";
import { retainHostedAiCreditCheckout, findHostedAiCreditIssuance, hasHostedAiCreditReference, HOSTED_AI_CREDIT_KIND, type HostedAiCreditIssuance } from "./hosted-ai-credit-issuance";
import { recordHostedAiCreditPurchase } from "./hosted-ai-usage-db";
import { isPositiveHostedCreditCents } from "./hosted-ai-helper-billing";
import { getHostedServerDatabaseConfig } from "./hosted-server-db";
import {
  hostedBillingSubscriptionStore,
  persistHostedBillingSubscriptionChange,
  type HostedBillingSubscriptionChange,
  type HostedBillingSubscriptionStore,
  type HostedBillingWebhookStatus
} from "./hosted-billing-state";
import {
  checkRateLimitForEnvironment,
  rateLimitUnavailableResponse,
  createRateLimitStore,
  rateLimitTiers,
  registerStoreForCleanup,
  resolveClientIdentifier,
  type RateLimitStore
} from "./rate-limit";
import { safeReadTextBody } from "./safe-body-parser";

type BillingEnvironment = Record<string, string | undefined>;

/**
 * Maximum age (in seconds) of the signed delivery timestamp, verified by Stripe.
 * event.created is immutable and may precede a legitimate retry by days.
 * The existing exported name is retained for compatibility.
 */
const WEBHOOK_EVENT_MAX_AGE_SECONDS = 300;

/**
 * Maximum clock skew tolerance (in seconds) for future-dated events.
 */
const WEBHOOK_EVENT_MAX_FUTURE_SECONDS = 60;

function isHostedPlanId(value: string): value is HostedPlanId {
  return value === "starter" || value === "plus" || value === "review";
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const STRIPE_ID_PATTERN = /^[a-zA-Z]{2,20}_[a-zA-Z0-9_]{1,255}$/;
const OWNER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function isValidStripeId(value: string | null): boolean {
  return value === null || STRIPE_ID_PATTERN.test(value);
}

function isValidOwnerId(value: string | null): boolean {
  return value === null || OWNER_ID_PATTERN.test(value);
}

function readPlanId(value: unknown): HostedPlanId | null {
  return typeof value === "string" && isHostedPlanId(value) ? value : null;
}

function getPlanIdForStripePriceId(
  priceId: string | null,
  env: BillingEnvironment
): HostedPlanId | null {
  if (!priceId) {
    return null;
  }

  if (priceId === env.STRIPE_PRICE_ID_STARTER_MONTHLY?.trim()) {
    return "starter";
  }

  if (priceId === env.STRIPE_PRICE_ID_PLUS_MONTHLY?.trim()) {
    return "plus";
  }

  return null;
}

function readPlanIdFromSubscriptionItems(
  subscription: Stripe.Subscription,
  env: BillingEnvironment
): HostedPlanId | null {
  const items = Array.isArray(subscription.items?.data)
    ? subscription.items.data
    : [];

  for (const item of items) {
    const priceId = readOptionalString(item.price?.id);
    const planId = getPlanIdForStripePriceId(priceId, env);

    if (planId) {
      return planId;
    }
  }

  return null;
}

function isWebhookEventCreationTimeValid(
  createdUnixSeconds: number,
  nowUnixSeconds: number,
  maxFutureSeconds: number = WEBHOOK_EVENT_MAX_FUTURE_SECONDS
): boolean {
  // Authentication and replay recency belong to the signed delivery header.
  // Keep the independent future-created guard without rejecting old retries.
  return createdUnixSeconds <= nowUnixSeconds + maxFutureSeconds;
}

function isStripeEventShape(event: Stripe.Event): boolean {
  return typeof event.id === "string"
    && typeof event.type === "string"
    && typeof event.created === "number"
    && Number.isSafeInteger(event.created)
    && event.created >= 0
    && typeof event.data === "object"
    && event.data !== null
    && typeof event.data.object === "object"
    && event.data.object !== null;
}

function mapStripeSubscriptionStatus(status: string | null): HostedBillingWebhookStatus {
  switch (status) {
    case "trialing":
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past-due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "checkout-pending";
  }
}

const EXPECTED_STRIPE_OBJECT_TYPE: Record<string, string> = {
  "checkout.session.completed": "checkout.session",
  "customer.subscription.updated": "subscription",
  "customer.subscription.deleted": "subscription"
};

function buildSubscriptionChange(
  customerId: string | null,
  workspaceOwnerId: string | null,
  subscriptionId: string | null,
  planId: HostedPlanId | null,
  status: HostedBillingWebhookStatus,
  cancelAtPeriodEnd: boolean,
  currentPeriodEnd: string | null
) {
  if (!isValidStripeId(customerId) || !isValidStripeId(subscriptionId) || !isValidOwnerId(workspaceOwnerId)) {
    return null;
  }

  return {
    customerId,
    workspaceOwnerId,
    subscriptionId,
    planId,
    status,
    cancelAtPeriodEnd,
    currentPeriodEnd
  };
}

type HostedStripeSubscriptionChange = HostedBillingSubscriptionChange & {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

function normalizeCurrentSubscription(
  subscription: Stripe.Subscription,
  env: BillingEnvironment
): VerifiedCurrentHostedSubscription {
  const items = subscription.items?.data;
  const item = Array.isArray(items) && items.length === 1 ? items[0] : undefined;
  const planId = getPlanIdForStripePriceId(readOptionalString(item?.price?.id), env);
  const metadataPlan = subscription.metadata?.planId;
  const owner = readOptionalString(subscription.metadata?.hostedOwnerId ?? subscription.metadata?.workspaceOwnerId);
  const customer = readOptionalString(subscription.customer);
  const status = readOptionalString(subscription.status);
  if (subscription.object !== "subscription" || !planId
    || (metadataPlan !== undefined && readPlanId(metadataPlan) !== planId)
    || !owner || !isValidOwnerId(owner) || !customer || !isValidStripeId(customer)
    || !isValidStripeId(subscription.id) || typeof subscription.livemode !== "boolean"
    || typeof subscription.cancel_at_period_end !== "boolean" || !status
    || !["active", "trialing", "past_due", "unpaid", "canceled", "incomplete_expired", "incomplete", "paused"].includes(status)) {
    throw new Error("Invalid or unsupported authoritative subscription metadata, owner or plan.");
  }
  // The pinned Stripe SDK places current_period_end on the subscription item.
  // Missing dates remain unknown, never a date inferred from event creation.
  const period: unknown = item?.current_period_end;
  if (period !== undefined && period !== null
    && (typeof period !== "number" || !Number.isSafeInteger(period) || period < 0
      || !Number.isFinite(new Date(period * 1000).getTime()))) {
    throw new Error("Invalid authoritative subscription period.");
  }
  return {
    subscriptionId: subscription.id,
    customerId: customer,
    ownerId: owner,
    planId,
    status: mapStripeSubscriptionStatus(status),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: typeof period === "number" ? new Date(period * 1000).toISOString() : null,
    livemode: subscription.livemode
  };
}

function normalizeSubscriptionChange(
  event: Stripe.Event,
  env: BillingEnvironment
): HostedStripeSubscriptionChange | null {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const expectedObjectType = EXPECTED_STRIPE_OBJECT_TYPE[event.type];
    const actualObjectType = readOptionalString((session as { object?: unknown }).object);

    if (actualObjectType !== null && actualObjectType !== expectedObjectType) {
      return null;
    }

    const metadata = session.metadata ?? {};

    if (metadata.purchaseKind === "ai-credit-pack") {
      return null;
    }

    return buildSubscriptionChange(
      readOptionalString(session.customer),
      readOptionalString(metadata.hostedOwnerId ?? metadata.workspaceOwnerId),
      readOptionalString(session.subscription),
      readPlanId(metadata.planId),
      "active",
      false,
      null
    );
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const expectedObjectType = EXPECTED_STRIPE_OBJECT_TYPE[event.type];
    const actualObjectType = readOptionalString((subscription as { object?: unknown }).object);

    if (actualObjectType !== null && actualObjectType !== expectedObjectType) {
      return null;
    }

    const metadata = subscription.metadata ?? {};
    const planId = readPlanIdFromSubscriptionItems(subscription, env)
      ?? readPlanId(metadata.planId);

    const currentPeriodEnd = (subscription as { current_period_end?: unknown }).current_period_end;

    return buildSubscriptionChange(
      readOptionalString(subscription.customer),
      readOptionalString(metadata.hostedOwnerId ?? metadata.workspaceOwnerId),
      readOptionalString(subscription.id),
      planId,
      event.type === "customer.subscription.deleted"
        ? "canceled"
        : mapStripeSubscriptionStatus(readOptionalString(subscription.status)),
      Boolean(subscription.cancel_at_period_end),
      typeof currentPeriodEnd === "number"
        ? new Date(currentPeriodEnd * 1000).toISOString()
        : null
    );
  }

  return null;
}

function normalizeAiCreditPurchase(event: Stripe.Event, issuance: HostedAiCreditIssuance | null) {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return null;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = session.metadata ?? {};

  if (!issuance && (hasHostedAiCreditReference(session.client_reference_id) || metadata.purchaseKind === HOSTED_AI_CREDIT_KIND)) return { status: "invalid" } as const;
  if (!issuance && metadata.purchaseKind !== "ai-credit-pack") return null;

  const checkoutSessionId = readOptionalString(session.id);
  const ownerId = issuance?.ownerId ?? readOptionalString(metadata.hostedOwnerId ?? metadata.workspaceOwnerId);
  const stripeCustomerId = readOptionalString(session.customer);
  const creditedBudgetCents = issuance?.creditedBudgetCents ?? (typeof metadata.aiCreditCents === "string" && /^\d{1,10}$/.test(metadata.aiCreditCents)
    ? Number(metadata.aiCreditCents) : null);
  const amountPaidCents = session.amount_total;
  if (session.object !== "checkout.session" || session.mode !== "payment" || session.currency !== "usd"
    || !checkoutSessionId?.startsWith("cs_") || !isValidStripeId(checkoutSessionId)
    || !stripeCustomerId?.startsWith("cus_") || !isValidStripeId(stripeCustomerId)
    || !ownerId || !isValidOwnerId(ownerId) || !event.id.startsWith("evt_") || !isValidStripeId(event.id)
    || !isPositiveHostedCreditCents(creditedBudgetCents) || !isPositiveHostedCreditCents(amountPaidCents)) {
    return { status: "invalid" } as const;
  }
  const pending = session.payment_status === "unpaid" && event.type === "checkout.session.completed";
  if (!pending && session.payment_status !== "paid") return { status: "invalid" } as const;

  return {
    status: pending ? "pending" : "paid",
    purchase: { checkoutSessionId, ownerId, stripeCustomerId, amountPaidCents, creditedBudgetCents,
      currency: session.currency, eventId: event.id, eventType: event.type,
      ...(issuance ? { checkoutProof: { clientReferenceId: readOptionalString(session.client_reference_id),
        livemode: session.livemode, created: session.created, expiresAt: session.expires_at,
        amountSubtotal: session.amount_subtotal, metadata: session.metadata } } : {}) }
  } as const;
}

export {
  WEBHOOK_EVENT_MAX_AGE_SECONDS,
  WEBHOOK_EVENT_MAX_FUTURE_SECONDS,
  STRIPE_ID_PATTERN,
  OWNER_ID_PATTERN
};

export function signHostedBillingWebhookPayload(payload: string, secret: string, timestamp?: number) {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp
  });
}

interface HostedBillingWebhookRouteDependencies {
  env?: BillingEnvironment;
  now?: string;
  nowUnixSeconds?: number;
  subscriptionStore?: HostedBillingSubscriptionStore;
  rateLimitStore?: RateLimitStore;
  constructEvent?: (payload: string, signature: string, secret: string) => Stripe.Event;
  markEventProcessed?: typeof markStripeEventProcessed;
  persistSubscription?: typeof persistHostedStripeSubscription;
  getExistingPersistedSubscription?: typeof getHostedSubscriptionBySubscriptionId;
  getExistingPersistedSubscriptionByCustomerId?: typeof getHostedSubscriptionByCustomerId;
  deletePersistedSubscription?: typeof deleteHostedSubscriptionBySubscriptionId;
  recordAiCreditPurchase?: typeof recordHostedAiCreditPurchase;
  findAiCreditIssuance?: typeof findHostedAiCreditIssuance;
  retainAiCreditCheckout?: typeof retainHostedAiCreditCheckout;
  reconcileSubscription?: (
    env: BillingEnvironment,
    input: Readonly<ReconcileHostedSubscriptionInput>
  ) => Promise<HostedSubscriptionReconciliationResult>;
}

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: "2026-09-30.endive"
  });
}

function subscriptionReconciliationResponse(status: 200 | 503, deliveryReceipt: string | undefined) {
  const body = status === 200 ? { acknowledged: true } : { error: "Hosted billing is temporarily unavailable." };
  if (deliveryReceipt) {
    const logEntry = JSON.stringify({ event: "stripe_sandbox_delivery", deliveryReceipt, status });
    if (status === 200) console.info(logEntry);
    else console.warn(logEntry);
    return NextResponse.json({ ...body, deliveryReceipt }, { status, headers: { "Cache-Control": "no-store" } });
  }
  if (status === 503) {
    console.warn("Hosted Stripe subscription reconciliation failed.");
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(body);
}

export function createHostedBillingWebhookRouteHandlers(
  dependencies: HostedBillingWebhookRouteDependencies = {}
) {
  const rateLimitStore = dependencies.rateLimitStore ?? createRateLimitStore();

  if (!dependencies.rateLimitStore) {
    registerStoreForCleanup(rateLimitStore, rateLimitTiers.webhook.windowMs);
  }

  return {
    async POST(request: Request) {
      const env = dependencies.env ?? process.env;
      const clientId = resolveClientIdentifier(request.headers);
      const rateCheck = await checkRateLimitForEnvironment(
        rateLimitStore,
        `webhook:${clientId}`,
        rateLimitTiers.webhook,
        env
      );

      if (rateCheck.unavailable) return rateLimitUnavailableResponse();

      if (!rateCheck.allowed) {
        const retryAfterSeconds = Math.ceil(
          (rateCheck.retryAfterMs ?? rateLimitTiers.webhook.windowMs) / 1000
        );

        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfterSeconds) }
          }
        );
      }

      const config = getHostedBillingConfig(env);

      if (config.deploymentMode === "self-host") {
        return NextResponse.json({
          acknowledged: true,
          provider: config.provider,
          bypassed: true,
          message: "Self-host deployment bypasses hosted billing webhooks."
        });
      }

      if (config.blocked || getHostedServerDatabaseConfig(env).blocked
        || !isHostedStripeKeyModeCompatible(env, config.mode)) {
        return NextResponse.json(
          { error: "Hosted billing is unavailable. Please contact the administrator." },
          { status: 503 }
        );
      }

      const secret = env.STRIPE_WEBHOOK_SECRET?.trim();

      if (!secret) {
        console.error(
          "[security] STRIPE_WEBHOOK_SECRET is not configured. " +
          "Webhook requests cannot be verified."
        );

        return NextResponse.json(
          { error: "Invalid webhook request." },
          { status: 400 }
        );
      }

      const contentType = request.headers.get("content-type");

      if (!contentType || !contentType.toLowerCase().trimStart().startsWith("application/json")) {
        return NextResponse.json(
          { error: "Content-Type must be application/json." },
          { status: 415 }
        );
      }

      const WEBHOOK_MAX_BODY_SIZE = 64 * 1024;
      const bodyResult = await safeReadTextBody(request, WEBHOOK_MAX_BODY_SIZE);

      if (!bodyResult.ok) {
        return NextResponse.json(
          { error: bodyResult.error },
          { status: bodyResult.status }
        );
      }

      const payload = bodyResult.text;
      const signature = request.headers.get("stripe-signature")
        ?? request.headers.get("x-tax-engine-signature");

      if (!signature) {
        return NextResponse.json(
          { error: "Invalid webhook request." },
          { status: 400 }
        );
      }

      let event: Stripe.Event;

      try {
        event = dependencies.constructEvent
          ? dependencies.constructEvent(payload, signature, secret)
          : createStripeClient(env.STRIPE_SECRET_KEY?.trim() || "sk_test_placeholder")
              .webhooks.constructEvent(payload, signature, secret, WEBHOOK_EVENT_MAX_AGE_SECONDS);
      } catch {
        return NextResponse.json(
          { error: "Invalid webhook request." },
          { status: 400 }
        );
      }

      if (!isStripeEventShape(event)) {
        return NextResponse.json(
          { error: "Invalid hosted billing webhook payload." },
          { status: 400 }
        );
      }

      const nowUnixSeconds = dependencies.nowUnixSeconds ?? Math.floor(Date.now() / 1000);

      if (!isWebhookEventCreationTimeValid(event.created, nowUnixSeconds)) {
        return NextResponse.json(
          { error: "Invalid webhook request." },
          { status: 400 }
        );
      }

      if (typeof event.livemode !== "boolean" || event.livemode !== (config.mode === "live")) {
        return NextResponse.json(
          { error: "Invalid webhook request." },
          { status: 400 }
        );
      }

      let issuance: HostedAiCreditIssuance | null = null;
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment" || hasHostedAiCreditReference(session.client_reference_id)
          || session.metadata?.purchaseKind === HOSTED_AI_CREDIT_KIND) {
          try {
            issuance = await (dependencies.findAiCreditIssuance ?? findHostedAiCreditIssuance)(env,
              readOptionalString(session.id) ?? "", readOptionalString(session.client_reference_id));
          } catch {
            return NextResponse.json({ error: "Hosted billing is temporarily unavailable." },
              { status: 503, headers: { "Cache-Control": "no-store" } });
          }
        }
      }
      const creditPurchase = normalizeAiCreditPurchase(event, issuance);
      if (creditPurchase) {
        if (creditPurchase.status === "invalid") {
          return NextResponse.json({ error: "Invalid hosted billing webhook payload." }, { status: 400 });
        }
        if (creditPurchase.status === "pending" && issuance) {
          try {
            await (dependencies.retainAiCreditCheckout ?? retainHostedAiCreditCheckout)(env, creditPurchase.purchase);
          } catch {
            return NextResponse.json({ error: "Hosted billing is temporarily unavailable." },
              { status: 503, headers: { "Cache-Control": "no-store" } });
          }
        }
        if (creditPurchase.status === "paid") {
          try {
            await (dependencies.recordAiCreditPurchase ?? recordHostedAiCreditPurchase)(env, {
              ...creditPurchase.purchase, createdAt: new Date(event.created * 1000).toISOString()
            });
          } catch {
            console.warn("Hosted Stripe credit purchase reconciliation failed.");
            return NextResponse.json({ error: "Hosted billing is temporarily unavailable." },
              { status: 503, headers: { "Cache-Control": "no-store" } });
          }
        }
        return NextResponse.json({ acknowledged: true });
      }

      const subscriptionChange = normalizeSubscriptionChange(event, env);

      if (!subscriptionChange) {
        return NextResponse.json({ acknowledged: true });
      }

      const fallbackStore = dependencies.subscriptionStore
        ?? (!getHostedServerDatabaseConfig(env).databaseUrl ? hostedBillingSubscriptionStore : null);

      if (fallbackStore) {
        if (subscriptionChange.subscriptionId) {
          const existingRecord = fallbackStore.get(subscriptionChange.subscriptionId);

          if (existingRecord?.lastEventId === event.id) {
            return NextResponse.json({ acknowledged: true });
          }

          if (existingRecord && subscriptionChange.status !== "canceled") {
            const existingUpdatedAt = new Date(existingRecord.updatedAt).getTime();
            const incomingUpdatedAt = event.created * 1000;

            if (incomingUpdatedAt < existingUpdatedAt) {
              return NextResponse.json({ acknowledged: true });
            }
          }
        }

        persistHostedBillingSubscriptionChange(
          fallbackStore,
          subscriptionChange,
          {
            eventId: event.id,
            eventType: event.type,
            updatedAt: dependencies.now ?? new Date().toISOString()
          }
        );

        return NextResponse.json({ acknowledged: true });
      }

      if (!subscriptionChange.subscriptionId || !subscriptionChange.workspaceOwnerId) {
        return NextResponse.json({ acknowledged: true });
      }

      // Workbench can display this response body. Keep the correlation value
      // independent of all provider and account identifiers, even on failure.
      const deliveryReceipt = env.VERCEL_ENV === "preview" && config.mode === "test"
        && env.TAX_ENGINE_BILLING_MODE === "test"
        && env.TAX_ENGINE_STAGING_STRIPE_DELIVERY_RECEIPTS === "true"
        && event.type === "customer.subscription.updated" && event.data.object.object === "subscription"
        && event.id.startsWith("evt_") && isValidStripeId(event.id) && subscriptionChange.customerId
        ? randomUUID() : undefined;
      try {
        if (!subscriptionChange.customerId) {
          throw new Error("A signed subscription customer is required for reconciliation.");
        }
        let reconcile = dependencies.reconcileSubscription;
        if (!reconcile) {
          const key = env.STRIPE_SECRET_KEY?.trim();
          if (!key) throw new Error("A configured Stripe key is required for subscription reconciliation.");
          const stripe = createStripeClient(key);
          reconcile = (facts, input) => reconcileHostedStripeSubscriptionEvent(facts, input, async () => {
            const current = await stripe.subscriptions.retrieve(input.stripeSubscriptionId, {}, {
              timeout: 2000,
              maxNetworkRetries: 0
            });
            return normalizeCurrentSubscription(current, facts);
          });
        }
        await reconcile(env, {
          ownerId: subscriptionChange.workspaceOwnerId,
          stripeSubscriptionId: subscriptionChange.subscriptionId,
          stripeCustomerId: subscriptionChange.customerId,
          planId: subscriptionChange.planId,
          status: subscriptionChange.status,
          cancelAtPeriodEnd: subscriptionChange.cancelAtPeriodEnd,
          currentPeriodEnd: subscriptionChange.currentPeriodEnd,
          eventId: event.id,
          eventType: event.type,
          eventCreatedAt: new Date(event.created * 1000).toISOString(),
          updatedAt: dependencies.now ?? new Date().toISOString(),
          livemode: event.livemode
        });
      } catch {
        return subscriptionReconciliationResponse(503, deliveryReceipt);
      }
      return subscriptionReconciliationResponse(200, deliveryReceipt);
    }
  };
}
