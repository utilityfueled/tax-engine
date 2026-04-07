import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  hostedPlanCatalog,
  type HostedPlanDefinition,
  type HostedPlanId,
  type WorkspaceDeploymentMode
} from "@tax-engine/contracts";
import { resolveDeploymentMode } from "./deployment-mode";
import { resolveHostedWorkspaceActor } from "./hosted-auth";
import { getHostedEntitlementByOwnerId, getHostedSubscriptionByOwnerId } from "./hosted-billing-db";
import type { HostedBillingWebhookStatus } from "./hosted-billing-state";
import { getHostedServerDatabaseConfig } from "./hosted-server-db";
import {
  resolveHostedAiTopUpCreditCents,
  resolveHostedAiTopUpPriceCents
} from "./hosted-ai-helper-billing";
import {
  checkRateLimitForEnvironment,
  createRateLimitStore,
  rateLimitTiers,
  registerStoreForCleanup,
  resolveClientIdentifier,
  type RateLimitStore
} from "./rate-limit";
import { safeParseJsonBody } from "./safe-body-parser";
import { resolveHostedAppBaseUrl } from "./hosted-runtime-safety";

type BillingEnvironment = Record<string, string | undefined>;

export type HostedBillingMode =
  | "disabled"
  | "test"
  | "live";

export interface HostedBillingConfig {
  deploymentMode: WorkspaceDeploymentMode;
  provider: "stripe";
  mode: HostedBillingMode;
  appBaseUrl: string;
  planCatalog: HostedPlanDefinition[];
  checkoutEnabled: boolean;
  webhookEnabled: boolean;
  customerPortalEnabled: boolean;
  blocked: boolean;
}

export interface HostedBillingCheckoutRequest {
  planId: HostedPlanId;
  workspaceId?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface HostedBillingCheckoutResponse {
  provider: "stripe";
  mode: HostedBillingMode;
  planId: HostedPlanId | null;
  sessionId: string | null;
  checkoutUrl: string | null;
  bypassed: boolean;
  message: string;
}

export interface HostedBillingPortalRequest {
  returnUrl: string;
}

export interface HostedAiCreditCheckoutRequest {
  successUrl: string;
  cancelUrl: string;
}

function resolveHostedBillingMode(
  deploymentMode: WorkspaceDeploymentMode,
  env: BillingEnvironment
): HostedBillingMode {
  if (deploymentMode === "self-host") {
    return "disabled";
  }

  return env.TAX_ENGINE_BILLING_MODE?.trim().toLowerCase() === "live"
    ? "live"
    : "test";
}

function isHostedPlanId(value: string): value is HostedPlanId {
  return hostedPlanCatalog.some((plan) => plan.id === value);
}

const WORKSPACE_ID_MAX_LENGTH = 128;
const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function isValidWorkspaceId(workspaceId: string): boolean {
  return workspaceId.length > 0
    && workspaceId.length <= WORKSPACE_ID_MAX_LENGTH
    && WORKSPACE_ID_PATTERN.test(workspaceId);
}

function isSafeRedirectUrl(url: string, appBaseUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const appOrigin = new URL(appBaseUrl).origin;

    return parsed.origin === appOrigin
      && (parsed.protocol === "https:" || parsed.protocol === "http:");
  } catch {
    return false;
  }
}

function isCheckoutRequest(value: unknown, appBaseUrl: string): value is HostedBillingCheckoutRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<HostedBillingCheckoutRequest>;

  return typeof candidate.planId === "string"
    && isHostedPlanId(candidate.planId)
    && typeof candidate.successUrl === "string"
    && isSafeRedirectUrl(candidate.successUrl, appBaseUrl)
    && typeof candidate.cancelUrl === "string"
    && isSafeRedirectUrl(candidate.cancelUrl, appBaseUrl)
    && (candidate.workspaceId === undefined || isValidWorkspaceId(candidate.workspaceId));
}

function isPortalRequest(value: unknown, appBaseUrl: string): value is HostedBillingPortalRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<HostedBillingPortalRequest>;
  return typeof candidate.returnUrl === "string"
    && isSafeRedirectUrl(candidate.returnUrl, appBaseUrl);
}

function getStripePriceId(planId: HostedPlanId, env: BillingEnvironment) {
  switch (planId) {
    case "starter":
      return env.STRIPE_PRICE_ID_STARTER_MONTHLY?.trim() || null;
    case "plus":
      return env.STRIPE_PRICE_ID_PLUS_MONTHLY?.trim() || null;
    case "review":
      return null;
  }
}

function getStripeAiTopUpPriceId(env: BillingEnvironment) {
  return env.STRIPE_PRICE_ID_AI_HELPER_TOP_UP?.trim() || null;
}

function getStripeCheckoutPaymentMethodTypes(env: BillingEnvironment) {
  const configured = env.TAX_ENGINE_STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES?.trim();

  if (!configured) {
    return undefined;
  }

  const parsed = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is Stripe.Checkout.SessionCreateParams.PaymentMethodType => {
      return value === "card"
        || value === "link"
        || value === "cashapp";
    });

  return parsed.length > 0 ? parsed : undefined;
}

function getStripeSecretKey(env: BillingEnvironment) {
  return env.STRIPE_SECRET_KEY?.trim() || null;
}

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: "2026-03-25.dahlia"
  });
}

type ExistingHostedSubscription = Awaited<ReturnType<typeof getHostedSubscriptionByOwnerId>>;

function hasManagedHostedSubscription(status: HostedBillingWebhookStatus | null | undefined) {
  return status === "checkout-pending" || status === "active" || status === "past-due";
}

async function lookupExistingHostedSubscription(
  env: BillingEnvironment,
  ownerId: string
): Promise<ExistingHostedSubscription> {
  if (!getHostedServerDatabaseConfig(env).databaseUrl) {
    return null;
  }

  return getHostedSubscriptionByOwnerId(env, ownerId);
}

async function ensureStripeCustomerId(
  stripe: Stripe,
  actor: NonNullable<Awaited<ReturnType<typeof resolveHostedWorkspaceActor>>>,
  existingSubscription: ExistingHostedSubscription
) {
  let customerId = existingSubscription?.customerId ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: actor.email ?? undefined,
      name: actor.label ?? undefined,
      metadata: {
        hostedOwnerId: actor.id
      }
    });
    customerId = customer.id;
  }

  return customerId;
}

function buildPreviewCheckoutSession(
  request: HostedBillingCheckoutRequest
): Pick<Stripe.Checkout.Session, "id" | "url"> {
  return {
    id: `cs_preview_${request.planId}`,
    url: `${request.successUrl}?checkout=preview&plan=${encodeURIComponent(request.planId)}`
  };
}

export function getHostedBillingConfig(
  env: BillingEnvironment = process.env
): HostedBillingConfig {
  const deploymentMode = resolveDeploymentMode(env);
  const mode = resolveHostedBillingMode(deploymentMode, env);
  const appBaseUrl = resolveHostedAppBaseUrl(env);
  const hasSecret = Boolean(getStripeSecretKey(env));
  const hasStarterPrice = Boolean(getStripePriceId("starter", env));
  const hasPlusPrice = Boolean(getStripePriceId("plus", env));
  const hasWebhookSecret = Boolean(env.STRIPE_WEBHOOK_SECRET?.trim());
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase() || "development";
  const blocked = deploymentMode === "hosted"
    && nodeEnv === "production"
    && (!hasSecret || !hasStarterPrice || !hasPlusPrice || !hasWebhookSecret || appBaseUrl.blocked);

  if (blocked) {
    console.error(
      "[security] CRITICAL: hosted billing is missing Stripe configuration. " +
      "Set TAX_ENGINE_APP_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, " +
      "STRIPE_PRICE_ID_STARTER_MONTHLY, and STRIPE_PRICE_ID_PLUS_MONTHLY."
    );
  }

  return {
    deploymentMode,
    provider: "stripe",
    mode,
    appBaseUrl: appBaseUrl.appBaseUrl,
    planCatalog: hostedPlanCatalog,
    checkoutEnabled: deploymentMode === "hosted",
    webhookEnabled: deploymentMode === "hosted",
    customerPortalEnabled: deploymentMode === "hosted",
    blocked
  };
}

function buildBypassResponse(config: HostedBillingConfig): HostedBillingCheckoutResponse {
  return {
    provider: config.provider,
    mode: config.mode,
    planId: null,
    sessionId: null,
    checkoutUrl: null,
    bypassed: true,
    message: "Self-host deployment bypasses hosted billing."
  };
}

interface HostedBillingCheckoutRouteDependencies {
  env?: BillingEnvironment;
  rateLimitStore?: RateLimitStore;
  getExistingSubscription?: (input: {
    env: BillingEnvironment;
    ownerId: string;
  }) => Promise<ExistingHostedSubscription>;
  createCheckoutSession?: (input: {
    actor: NonNullable<Awaited<ReturnType<typeof resolveHostedWorkspaceActor>>>;
    request: HostedBillingCheckoutRequest;
    config: HostedBillingConfig;
    env: BillingEnvironment;
    existingSubscription: ExistingHostedSubscription;
  }) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
}

async function createStripeCheckoutSession(
  env: BillingEnvironment,
  actor: NonNullable<Awaited<ReturnType<typeof resolveHostedWorkspaceActor>>>,
  request: HostedBillingCheckoutRequest,
  existingSubscription: ExistingHostedSubscription
) {
  const secretKey = getStripeSecretKey(env);

  if (request.planId === "review") {
    throw new Error("Review is handled as a custom quote and is not available through self-serve checkout.");
  }

  const priceId = getStripePriceId(request.planId, env);
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase() || "development";

  if ((!secretKey || !priceId) && nodeEnv !== "production") {
    return buildPreviewCheckoutSession(request);
  }

  if (!secretKey) {
    throw new Error("Hosted billing is not configured yet. Please contact the administrator.");
  }

  if (!priceId) {
    throw new Error("The selected hosted plan is not configured for Stripe checkout yet.");
  }

  const stripe = createStripeClient(secretKey);
  const customerId = await ensureStripeCustomerId(stripe, actor, existingSubscription);

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    payment_method_types: getStripeCheckoutPaymentMethodTypes(env),
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    allow_promotion_codes: false,
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    subscription_data: {
      metadata: {
        hostedOwnerId: actor.id,
        planId: request.planId,
        workspaceId: request.workspaceId ?? ""
      }
    },
    metadata: {
      hostedOwnerId: actor.id,
      planId: request.planId,
      workspaceId: request.workspaceId ?? ""
    }
  });
}

function isAiCreditCheckoutRequest(value: unknown, appBaseUrl: string): value is HostedAiCreditCheckoutRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<HostedAiCreditCheckoutRequest>;
  return typeof candidate.successUrl === "string"
    && isSafeRedirectUrl(candidate.successUrl, appBaseUrl)
    && typeof candidate.cancelUrl === "string"
    && isSafeRedirectUrl(candidate.cancelUrl, appBaseUrl);
}

export function createHostedBillingCheckoutRouteHandlers(
  dependencies: HostedBillingCheckoutRouteDependencies = {}
) {
  const store = dependencies.rateLimitStore ?? createRateLimitStore();

  if (!dependencies.rateLimitStore) {
    registerStoreForCleanup(store, rateLimitTiers.api.windowMs);
  }

  return {
    async POST(request: Request) {
      const env = dependencies.env ?? process.env;
      const config = getHostedBillingConfig(env);

      if (config.deploymentMode === "self-host") {
        return NextResponse.json(buildBypassResponse(config));
      }

      if (config.blocked) {
        return NextResponse.json(
          { error: "Hosted billing is unavailable. Please contact the administrator." },
          { status: 503 }
        );
      }

      const clientId = resolveClientIdentifier(request.headers);
      const rateCheck = await checkRateLimitForEnvironment(
        store,
        `checkout:${clientId}`,
        rateLimitTiers.api,
        env
      );

      if (!rateCheck.allowed) {
        const retryAfterSeconds = Math.ceil(
          (rateCheck.retryAfterMs ?? rateLimitTiers.api.windowMs) / 1000
        );

        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfterSeconds) }
          }
        );
      }

      const actor = await resolveHostedWorkspaceActor({
        env,
        requestHeaders: request.headers
      });

      if (!actor) {
        return NextResponse.json(
          { error: "Authentication required for hosted billing checkout." },
          { status: 401 }
        );
      }

      const parsed = await safeParseJsonBody(request);

      if (!parsed.ok) {
        return NextResponse.json(
          { error: parsed.error },
          { status: parsed.status }
        );
      }

      if (!isCheckoutRequest(parsed.data, config.appBaseUrl)) {
        return NextResponse.json(
          { error: "Invalid hosted billing checkout request." },
          { status: 400 }
        );
      }

      if (parsed.data.planId === "review") {
        return NextResponse.json(
          { error: "Review is handled through a custom quote and cannot be purchased through self-serve checkout." },
          { status: 400 }
        );
      }

      const existingSubscription = await (dependencies.getExistingSubscription
        ? dependencies.getExistingSubscription({
            env,
            ownerId: actor.id
          })
        : lookupExistingHostedSubscription(env, actor.id));

      if (hasManagedHostedSubscription(existingSubscription?.status)) {
        return NextResponse.json(
          {
            error:
              "This account already has a managed subscription. Use Manage Billing to update or change plans."
          },
          { status: 409 }
        );
      }

      try {
        const session = await (dependencies.createCheckoutSession
          ? dependencies.createCheckoutSession({
              actor,
              request: parsed.data,
              config,
              env,
              existingSubscription
            })
          : createStripeCheckoutSession(env, actor, parsed.data, existingSubscription));

        return NextResponse.json({
          provider: config.provider,
          mode: config.mode,
          planId: parsed.data.planId,
          sessionId: session.id,
          checkoutUrl: session.url,
          bypassed: false,
          message: "Redirecting to Stripe Checkout."
        } satisfies HostedBillingCheckoutResponse);
      } catch (error) {
        return NextResponse.json(
          {
            error: error instanceof Error
              ? error.message
              : "Could not create a hosted billing checkout session."
          },
          { status: 400 }
        );
      }
    }
  };
}

interface HostedAiCreditCheckoutRouteDependencies {
  env?: BillingEnvironment;
  rateLimitStore?: RateLimitStore;
  createCheckoutSession?: (input: {
    actor: NonNullable<Awaited<ReturnType<typeof resolveHostedWorkspaceActor>>>;
    request: HostedAiCreditCheckoutRequest;
    env: BillingEnvironment;
    existingSubscription: ExistingHostedSubscription;
  }) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
}

async function createStripeAiCreditCheckoutSession(
  env: BillingEnvironment,
  actor: NonNullable<Awaited<ReturnType<typeof resolveHostedWorkspaceActor>>>,
  request: HostedAiCreditCheckoutRequest,
  existingSubscription: ExistingHostedSubscription
) {
  const secretKey = getStripeSecretKey(env);
  const priceId = getStripeAiTopUpPriceId(env);
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase() || "development";

  if ((!secretKey || !priceId) && nodeEnv !== "production") {
    return {
      id: "cs_preview_ai_top_up",
      url: `${request.successUrl}?checkout=preview-ai-top-up`
    };
  }

  if (!secretKey) {
    throw new Error("Hosted billing is not configured yet. Please contact the administrator.");
  }

  if (!priceId) {
    throw new Error("AI helper credit packs are not configured yet.");
  }

  const stripe = createStripeClient(secretKey);
  const customerId = await ensureStripeCustomerId(stripe, actor, existingSubscription);
  const creditedBudgetCents = resolveHostedAiTopUpCreditCents(env);

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    payment_method_types: getStripeCheckoutPaymentMethodTypes(env),
    line_items: [{
      price: priceId,
      quantity: 1
    }],
    allow_promotion_codes: false,
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    metadata: {
      purchaseKind: "ai-credit-pack",
      hostedOwnerId: actor.id,
      aiCreditCents: String(creditedBudgetCents)
    },
    payment_intent_data: {
      metadata: {
        purchaseKind: "ai-credit-pack",
        hostedOwnerId: actor.id,
        aiCreditCents: String(creditedBudgetCents)
      }
    }
  });
}

export function createHostedAiCreditCheckoutRouteHandlers(
  dependencies: HostedAiCreditCheckoutRouteDependencies = {}
) {
  const store = dependencies.rateLimitStore ?? createRateLimitStore();

  if (!dependencies.rateLimitStore) {
    registerStoreForCleanup(store, rateLimitTiers.api.windowMs);
  }

  return {
    async POST(request: Request) {
      const env = dependencies.env ?? process.env;
      const config = getHostedBillingConfig(env);

      if (config.deploymentMode === "self-host") {
        return NextResponse.json({ checkoutUrl: null, bypassed: true });
      }

      if (config.blocked) {
        return NextResponse.json(
          { error: "Hosted billing is unavailable. Please contact the administrator." },
          { status: 503 }
        );
      }

      const clientId = resolveClientIdentifier(request.headers);
      const rateCheck = await checkRateLimitForEnvironment(
        store,
        `checkout-ai-top-up:${clientId}`,
        rateLimitTiers.api,
        env
      );

      if (!rateCheck.allowed) {
        const retryAfterSeconds = Math.ceil(
          (rateCheck.retryAfterMs ?? rateLimitTiers.api.windowMs) / 1000
        );

        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfterSeconds) }
          }
        );
      }

      const actor = await resolveHostedWorkspaceActor({
        env,
        requestHeaders: request.headers
      });
      const previewBypassActive = Boolean(env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID?.trim());

      if (!actor) {
        return NextResponse.json(
          { error: "Authentication required for hosted billing checkout." },
          { status: 401 }
        );
      }

      const { entitlement } = previewBypassActive
        ? {
            entitlement: {
              plan: "starter" as const,
              workspaceAccess: true,
              reminderAutomationAccess: false,
              reviewAccess: false
            }
          }
        : await getHostedEntitlementByOwnerId(env, actor.id);

      if (!entitlement.workspaceAccess) {
        return NextResponse.json(
          { error: "An active Starter or Plus plan is required before purchasing extra AI helper credits." },
          { status: 403 }
        );
      }

      const parsed = await safeParseJsonBody(request);

      if (!parsed.ok) {
        return NextResponse.json(
          { error: parsed.error },
          { status: parsed.status }
        );
      }

      if (!isAiCreditCheckoutRequest(parsed.data, config.appBaseUrl)) {
        return NextResponse.json(
          { error: "Invalid hosted billing checkout request." },
          { status: 400 }
        );
      }

      const existingSubscription = await lookupExistingHostedSubscription(env, actor.id);

      try {
        const session = await (dependencies.createCheckoutSession
          ? dependencies.createCheckoutSession({
              actor,
              request: parsed.data,
              env,
              existingSubscription
            })
          : createStripeAiCreditCheckoutSession(env, actor, parsed.data, existingSubscription));

        return NextResponse.json({
          checkoutUrl: session.url,
          sessionId: session.id,
          purchaseKind: "ai-credit-pack",
          creditedBudgetCents: resolveHostedAiTopUpCreditCents(env),
          priceCents: resolveHostedAiTopUpPriceCents(env)
        });
      } catch (error) {
        return NextResponse.json(
          {
            error: error instanceof Error
              ? error.message
              : "Could not create an AI helper credit checkout session."
          },
          { status: 400 }
        );
      }
    }
  };
}

interface HostedBillingPortalRouteDependencies {
  env?: BillingEnvironment;
  rateLimitStore?: RateLimitStore;
  createPortalSession?: (input: {
    actor: NonNullable<Awaited<ReturnType<typeof resolveHostedWorkspaceActor>>>;
    returnUrl: string;
    env: BillingEnvironment;
  }) => Promise<{ url: string }>;
}

async function createStripePortalSession(
  env: BillingEnvironment,
  actor: NonNullable<Awaited<ReturnType<typeof resolveHostedWorkspaceActor>>>,
  returnUrl: string
) {
  const secretKey = getStripeSecretKey(env);

  if (!secretKey) {
    throw new Error("Hosted billing is not configured yet. Please contact the administrator.");
  }

  const existingSubscription = await getHostedSubscriptionByOwnerId(env, actor.id);

  if (!existingSubscription?.customerId) {
    throw new Error("No Stripe billing account was found for this user yet.");
  }

  const stripe = createStripeClient(secretKey);
  return stripe.billingPortal.sessions.create({
    customer: existingSubscription.customerId,
    return_url: returnUrl
  });
}

export function createHostedBillingPortalRouteHandlers(
  dependencies: HostedBillingPortalRouteDependencies = {}
) {
  const store = dependencies.rateLimitStore ?? createRateLimitStore();

  if (!dependencies.rateLimitStore) {
    registerStoreForCleanup(store, rateLimitTiers.api.windowMs);
  }

  return {
    async POST(request: Request) {
      const env = dependencies.env ?? process.env;
      const config = getHostedBillingConfig(env);

      if (config.deploymentMode === "self-host") {
        return NextResponse.json({ url: null, bypassed: true });
      }

      if (config.blocked) {
        return NextResponse.json(
          { error: "Hosted billing is unavailable. Please contact the administrator." },
          { status: 503 }
        );
      }

      const clientId = resolveClientIdentifier(request.headers);
      const rateCheck = await checkRateLimitForEnvironment(
        store,
        `portal:${clientId}`,
        rateLimitTiers.api,
        env
      );

      if (!rateCheck.allowed) {
        const retryAfterSeconds = Math.ceil(
          (rateCheck.retryAfterMs ?? rateLimitTiers.api.windowMs) / 1000
        );

        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfterSeconds) }
          }
        );
      }

      const actor = await resolveHostedWorkspaceActor({
        env,
        requestHeaders: request.headers
      });

      if (!actor) {
        return NextResponse.json(
          { error: "Authentication required for hosted billing management." },
          { status: 401 }
        );
      }

      const parsed = await safeParseJsonBody(request);

      if (!parsed.ok) {
        return NextResponse.json(
          { error: parsed.error },
          { status: parsed.status }
        );
      }

      if (!isPortalRequest(parsed.data, config.appBaseUrl)) {
        return NextResponse.json(
          { error: "Invalid hosted billing portal request." },
          { status: 400 }
        );
      }

      try {
        const session = await (dependencies.createPortalSession
          ? dependencies.createPortalSession({
              actor,
              returnUrl: parsed.data.returnUrl,
              env
            })
          : createStripePortalSession(env, actor, parsed.data.returnUrl));

        return NextResponse.json({ url: session.url });
      } catch (error) {
        return NextResponse.json(
          {
            error: error instanceof Error
              ? error.message
              : "Could not open the hosted billing portal."
          },
          { status: 400 }
        );
      }
    }
  };
}
