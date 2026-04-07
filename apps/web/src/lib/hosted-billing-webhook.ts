import Stripe from "stripe";
import { NextResponse } from "next/server";
import type { HostedPlanId } from "@tax-engine/contracts";
import { getHostedBillingConfig } from "./hosted-billing";
import {
  deleteHostedSubscriptionBySubscriptionId,
  getHostedSubscriptionByCustomerId,
  getHostedSubscriptionBySubscriptionId,
  markStripeEventProcessed,
  persistHostedStripeSubscription
} from "./hosted-billing-db";
import { recordHostedAiCreditPurchase } from "./hosted-ai-usage-db";
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
  createRateLimitStore,
  rateLimitTiers,
  registerStoreForCleanup,
  resolveClientIdentifier,
  type RateLimitStore
} from "./rate-limit";
import { safeReadTextBody } from "./safe-body-parser";

type BillingEnvironment = Record<string, string | undefined>;

/**
 * Maximum age (in seconds) for a webhook event to be considered valid.
 * Events older than this are rejected to reduce replay risk.
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

function isWebhookEventTimestampValid(
  createdUnixSeconds: number,
  nowUnixSeconds: number,
  maxAgeSeconds: number = WEBHOOK_EVENT_MAX_AGE_SECONDS,
  maxFutureSeconds: number = WEBHOOK_EVENT_MAX_FUTURE_SECONDS
): boolean {
  const age = nowUnixSeconds - createdUnixSeconds;

  if (age > maxAgeSeconds) {
    return false;
  }

  if (age < -maxFutureSeconds) {
    return false;
  }

  return true;
}

function isStripeEventShape(event: Stripe.Event): boolean {
  return typeof event.id === "string"
    && typeof event.type === "string"
    && typeof event.created === "number"
    && Number.isFinite(event.created)
    && typeof event.data === "object"
    && event.data !== null
    && "object" in event.data;
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

function readPositiveIntegerString(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  return Number.parseInt(value, 10);
}

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

function normalizeAiCreditPurchase(event: Stripe.Event) {
  if (event.type !== "checkout.session.completed") {
    return null;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = session.metadata ?? {};

  if (metadata.purchaseKind !== "ai-credit-pack") {
    return null;
  }

  const checkoutSessionId = readOptionalString(session.id);
  const ownerId = readOptionalString(metadata.hostedOwnerId ?? metadata.workspaceOwnerId);
  const stripeCustomerId = readOptionalString(session.customer);
  const creditedBudgetCents = readPositiveIntegerString(metadata.aiCreditCents);
  const amountPaidCents = typeof session.amount_total === "number" && Number.isFinite(session.amount_total)
    ? session.amount_total
    : null;
  const currency = readOptionalString(session.currency)?.toLowerCase() ?? "usd";

  if (!checkoutSessionId || !ownerId || creditedBudgetCents === null || amountPaidCents === null) {
    return null;
  }

  return {
    checkoutSessionId,
    ownerId,
    stripeCustomerId,
    creditedBudgetCents,
    amountPaidCents,
    currency
  };
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
}

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: "2026-03-25.dahlia"
  });
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
              .webhooks.constructEvent(payload, signature, secret);
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

      if (!isWebhookEventTimestampValid(event.created, nowUnixSeconds)) {
        return NextResponse.json(
          { error: "Invalid webhook request." },
          { status: 400 }
        );
      }

      const aiCreditPurchase = normalizeAiCreditPurchase(event);

      if (aiCreditPurchase) {
        await (dependencies.recordAiCreditPurchase ?? recordHostedAiCreditPurchase)(env, {
          checkoutSessionId: aiCreditPurchase.checkoutSessionId,
          ownerId: aiCreditPurchase.ownerId,
          stripeCustomerId: aiCreditPurchase.stripeCustomerId,
          amountPaidCents: aiCreditPurchase.amountPaidCents,
          creditedBudgetCents: aiCreditPurchase.creditedBudgetCents,
          currency: aiCreditPurchase.currency,
          createdAt: new Date(event.created * 1000).toISOString()
        });

        const newlyProcessed = await (dependencies.markEventProcessed ?? markStripeEventProcessed)(env, {
          id: event.id,
          type: event.type,
          createdAt: new Date(event.created * 1000).toISOString()
        });

        if (!newlyProcessed) {
          return NextResponse.json({ acknowledged: true });
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

      const getExistingPersistedSubscription = dependencies.getExistingPersistedSubscription
        ?? getHostedSubscriptionBySubscriptionId;
      const getExistingPersistedSubscriptionByCustomerId = dependencies.getExistingPersistedSubscriptionByCustomerId
        ?? getHostedSubscriptionByCustomerId;
      const deletePersistedSubscription = dependencies.deletePersistedSubscription
        ?? deleteHostedSubscriptionBySubscriptionId;
      const persistSubscription = dependencies.persistSubscription
        ?? persistHostedStripeSubscription;
      const markEventProcessedFn = dependencies.markEventProcessed
        ?? markStripeEventProcessed;

      const existingRecord = await getExistingPersistedSubscription(env, subscriptionChange.subscriptionId);

      if (existingRecord && subscriptionChange.status !== "canceled") {
        const existingUpdatedAt = new Date(existingRecord.updatedAt).getTime();
        const incomingUpdatedAt = event.created * 1000;

        if (incomingUpdatedAt < existingUpdatedAt) {
          return NextResponse.json({ acknowledged: true });
        }
      }

      if (subscriptionChange.customerId && subscriptionChange.status !== "canceled") {
        const existingCustomerRecord = await getExistingPersistedSubscriptionByCustomerId(
          env,
          subscriptionChange.customerId
        );

        if (
          existingCustomerRecord
          && existingCustomerRecord.subscriptionId !== subscriptionChange.subscriptionId
          && existingCustomerRecord.status === "canceled"
        ) {
          await deletePersistedSubscription(env, existingCustomerRecord.subscriptionId);
        }
      }

      await persistSubscription(env, {
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
        updatedAt: dependencies.now ?? new Date().toISOString()
      });

      const newlyProcessed = await markEventProcessedFn(env, {
        id: event.id,
        type: event.type,
        createdAt: new Date(event.created * 1000).toISOString()
      });

      if (!newlyProcessed) {
        return NextResponse.json({ acknowledged: true });
      }

      return NextResponse.json({
        acknowledged: true
      });
    }
  };
}
