import { describe, expect, it, vi } from "vitest";
// Synthetic availability lets this suite exercise Stripe adapter behavior.
// The real disabled production gate is covered in ai-credit-sales-readiness.
vi.mock("../../../apps/web/src/lib/hosted-ai-availability", () => ({ canPurchaseHostedAiCredits: () => true }));
import {
  createHostedAiCreditCheckoutRouteHandlers,
  createHostedBillingCheckoutRouteHandlers,
  getHostedBillingConfig
} from "../../../apps/web/src/lib/hosted-billing";
import { hasManagedBillingSubscription } from "../../../apps/web/src/components/billing-page-panel";
import { createInMemoryHostedBillingSubscriptionStore } from "../../../apps/web/src/lib/hosted-billing-state";
import {
  createHostedBillingWebhookRouteHandlers,
  signHostedBillingWebhookPayload
} from "../../../apps/web/src/lib/hosted-billing-webhook";

describe("hosted billing", () => {
  it("loads the hosted plan catalog when hosted billing preview is enabled", () => {
    const config = getHostedBillingConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_BILLING_MODE: "test",
      TAX_ENGINE_APP_URL: "https://tax.example"
    });

    expect(config.deploymentMode).toBe("hosted");
    expect(config.provider).toBe("stripe");
    expect(config.mode).toBe("test");
    expect(config.checkoutEnabled).toBe(true);
    expect(config.planCatalog.map((plan) => plan.id)).toEqual([
      "starter",
      "plus",
      "review"
    ]);
  });

  it("blocks hosted billing in production when TAX_ENGINE_APP_URL is missing", () => {
    const config = getHostedBillingConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_BILLING_MODE: "live",
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: "sk_test_configured",
      STRIPE_WEBHOOK_SECRET: "whsec_configured",
      STRIPE_PRICE_ID_STARTER_MONTHLY: "price_starter",
      STRIPE_PRICE_ID_PLUS_MONTHLY: "price_plus"
    });

    expect(config.blocked).toBe(true);
  });

  it("blocks hosted billing in production when STRIPE_WEBHOOK_SECRET is missing", () => {
    const config = getHostedBillingConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_BILLING_MODE: "live",
      NODE_ENV: "production",
      TAX_ENGINE_APP_URL: "https://tax.example",
      STRIPE_SECRET_KEY: "sk_test_configured",
      STRIPE_PRICE_ID_STARTER_MONTHLY: "price_starter",
      STRIPE_PRICE_ID_PLUS_MONTHLY: "price_plus"
    });

    expect(config.blocked).toBe(true);
  });

  it("creates a Stripe checkout session for Plus in hosted test mode", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        TAX_ENGINE_APP_URL: "https://tax.example",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "checkout-user-1"
      },
      createCheckoutSession: async ({ request }) => ({
        id: `cs_test_${request.planId}`,
        url: `https://checkout.stripe.com/pay/${request.planId}`
      })
    });

    const response = await POST(new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        planId: "plus",
        workspaceId: "workspace-123",
        successUrl: "https://tax.example/billing/success",
        cancelUrl: "https://tax.example/billing/cancel"
      })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      provider: "stripe",
      mode: "test",
      planId: "plus",
      sessionId: "cs_test_plus",
      checkoutUrl: "https://checkout.stripe.com/pay/plus",
      bypassed: false,
      message: "Redirecting to Stripe Checkout."
    });
  });

  it("creates a Stripe checkout session for Starter in hosted live mode", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "live",
        TAX_ENGINE_APP_URL: "https://tax.example",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "checkout-user-2"
      },
      createCheckoutSession: async ({ request }) => ({
        id: `cs_live_${request.planId}`,
        url: `https://checkout.stripe.com/live/${request.planId}`
      })
    });

    const response = await POST(new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        planId: "starter",
        workspaceId: "workspace-456",
        successUrl: "https://tax.example/billing/success",
        cancelUrl: "https://tax.example/billing/cancel"
      })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      provider: "stripe",
      mode: "live",
      planId: "starter",
      sessionId: "cs_live_starter",
      checkoutUrl: "https://checkout.stripe.com/live/starter",
      bypassed: false,
      message: "Redirecting to Stripe Checkout."
    });
  });

  it("creates a one-time Stripe checkout session for an AI helper credit pack", async () => {
    const { POST } = createHostedAiCreditCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        TAX_ENGINE_APP_URL: "https://tax.example",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "checkout-ai-top-up-user"
      },
      createCheckoutSession: async () => ({
        id: "cs_ai_top_up",
        url: "https://checkout.stripe.com/pay/ai-top-up"
      })
    });

    const response = await POST(new Request("https://tax.example/api/billing/ai-credits/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        successUrl: "https://tax.example/billing?checkout=ai-top-up-success",
        cancelUrl: "https://tax.example/billing?checkout=ai-top-up-cancel"
      })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.com/pay/ai-top-up",
      sessionId: "cs_ai_top_up",
      purchaseKind: "ai-credit-pack",
      creditedBudgetCents: 1000,
      priceCents: 1500
    });
  });

  it("rejects duplicate self-serve checkout when a managed subscription already exists", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        TAX_ENGINE_APP_URL: "https://tax.example",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "checkout-user-existing"
      },
      getExistingSubscription: async () => ({
        subscriptionId: "sub_existing",
        customerId: "cus_existing",
        workspaceOwnerId: "checkout-user-existing",
        planId: "starter",
        status: "active",
        lastEventId: "evt_existing",
        lastEventType: "checkout.session.completed",
        updatedAt: "2026-03-12T00:00:00.000Z",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: "2026-04-12T00:00:00.000Z"
      })
    });

    const response = await POST(new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        planId: "plus",
        successUrl: "https://tax.example/billing/success",
        cancelUrl: "https://tax.example/billing/cancel"
      })
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "This account already has a managed subscription. Use Manage Billing to update or change plans."
    });
  });

  it("bypasses hosted billing entirely in self-host mode", async () => {
    const config = getHostedBillingConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "self-host",
      TAX_ENGINE_BILLING_MODE: "test"
    });
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host",
        TAX_ENGINE_BILLING_MODE: "test"
      }
    });

    expect(config.mode).toBe("disabled");
    expect(config.checkoutEnabled).toBe(false);

    const response = await POST(new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        planId: "starter",
        successUrl: "http://localhost/success",
        cancelUrl: "http://localhost/cancel"
      })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      provider: "stripe",
      mode: "disabled",
      planId: null,
      sessionId: null,
      checkoutUrl: null,
      bypassed: true,
      message: "Self-host deployment bypasses hosted billing."
    });
  });

  it("lets canceled users start checkout again", () => {
    expect(hasManagedBillingSubscription("starter", "canceled")).toBe(false);
    expect(hasManagedBillingSubscription("plus", "active")).toBe(true);
    expect(hasManagedBillingSubscription(null, null)).toBe(false);
  });

  it("verifies webhook signatures and normalizes subscription state changes", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const payload = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      created: 1773273600,
      data: {
        object: {
          id: "cs_test_1",
          customer: "cus_123",
          subscription: "sub_123",
          metadata: {
            workspaceOwnerId: "user_123",
            planId: "starter"
          }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, "whsec_test");
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_test"
      },
      now: "2026-03-12T00:00:00.000Z",
      nowUnixSeconds: 1773273600,
      subscriptionStore
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature
      },
      body: payload
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      acknowledged: true
    });
    expect(subscriptionStore.list()).toEqual([
      {
        subscriptionId: "sub_123",
        customerId: "cus_123",
        workspaceOwnerId: "user_123",
        planId: "starter",
        status: "active",
        lastEventId: "evt_1",
        lastEventType: "checkout.session.completed",
        updatedAt: "2026-03-12T00:00:00.000Z"
      }
    ]);
  });

  it("rejects hosted webhook calls with an invalid signature", async () => {
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_test"
      }
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "invalid"
      },
      body: JSON.stringify({
        id: "evt_invalid",
        type: "checkout.session.completed",
        data: {
          object: {}
        }
      })
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid webhook request."
    });
  });

  it("persists hosted subscription state transitions and preserves prior metadata", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const initialPayload = JSON.stringify({
      id: "evt_checkout",
      type: "checkout.session.completed",
      created: 1773273600,
      data: {
        object: {
          customer: "cus_transition",
          subscription: "sub_transition",
          metadata: {
            workspaceOwnerId: "user_transition",
            planId: "plus"
          }
        }
      }
    });
    const updatePayload = JSON.stringify({
      id: "evt_update",
      type: "customer.subscription.updated",
      created: 1773277200,
      data: {
        object: {
          id: "sub_transition",
          customer: "cus_transition",
          status: "past_due",
          metadata: {}
        }
      }
    });
    const deletePayload = JSON.stringify({
      id: "evt_delete",
      type: "customer.subscription.deleted",
      created: 1773280800,
      data: {
        object: {
          id: "sub_transition",
          customer: "cus_transition",
          metadata: {}
        }
      }
    });

    const firstHandlers = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_test"
      },
      now: "2026-03-12T00:00:00.000Z",
      nowUnixSeconds: 1773273600,
      subscriptionStore
    });

    await firstHandlers.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signHostedBillingWebhookPayload(initialPayload, "whsec_test")
      },
      body: initialPayload
    }));

    const secondHandlers = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_test"
      },
      now: "2026-03-12T01:00:00.000Z",
      nowUnixSeconds: 1773277200,
      subscriptionStore
    });

    const updateResponse = await secondHandlers.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signHostedBillingWebhookPayload(updatePayload, "whsec_test")
      },
      body: updatePayload
    }));

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual({
      acknowledged: true
    });

    const thirdHandlers = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_test"
      },
      now: "2026-03-12T02:00:00.000Z",
      nowUnixSeconds: 1773280800,
      subscriptionStore
    });

    const deleteResponse = await thirdHandlers.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signHostedBillingWebhookPayload(deletePayload, "whsec_test")
      },
      body: deletePayload
    }));

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({
      acknowledged: true
    });
    expect(subscriptionStore.list()).toEqual([
      {
        subscriptionId: "sub_transition",
        customerId: "cus_transition",
        workspaceOwnerId: "user_transition",
        planId: "plus",
        status: "canceled",
        lastEventId: "evt_delete",
        lastEventType: "customer.subscription.deleted",
        updatedAt: "2026-03-12T02:00:00.000Z"
      }
    ]);
  });

  it("derives the hosted plan from Stripe subscription price items during plan changes", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const secret = "whsec_plan_change";
    const checkoutPayload = JSON.stringify({
      id: "evt_plan_checkout",
      type: "checkout.session.completed",
      created: 1773273600,
      data: {
        object: {
          object: "checkout.session",
          customer: "cus_plan_change",
          subscription: "sub_plan_change",
          metadata: {
            workspaceOwnerId: "user_plan_change",
            planId: "starter"
          }
        }
      }
    });
    const updatePayload = JSON.stringify({
      id: "evt_plan_update",
      type: "customer.subscription.updated",
      created: 1773277200,
      data: {
        object: {
          object: "subscription",
          id: "sub_plan_change",
          customer: "cus_plan_change",
          status: "active",
          metadata: {
            workspaceOwnerId: "user_plan_change",
            planId: "starter"
          },
          items: {
            data: [
              {
                price: {
                  id: "price_plus_monthly"
                }
              }
            ]
          }
        }
      }
    });

    const checkoutHandlers = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: secret,
        STRIPE_PRICE_ID_STARTER_MONTHLY: "price_starter_monthly",
        STRIPE_PRICE_ID_PLUS_MONTHLY: "price_plus_monthly"
      },
      now: "2026-03-12T00:00:00.000Z",
      nowUnixSeconds: 1773273600,
      subscriptionStore
    });
    await checkoutHandlers.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signHostedBillingWebhookPayload(checkoutPayload, secret)
      },
      body: checkoutPayload
    }));

    const updateHandlers = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: secret,
        STRIPE_PRICE_ID_STARTER_MONTHLY: "price_starter_monthly",
        STRIPE_PRICE_ID_PLUS_MONTHLY: "price_plus_monthly"
      },
      now: "2026-03-12T01:00:00.000Z",
      nowUnixSeconds: 1773277200,
      subscriptionStore
    });

    const response = await updateHandlers.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signHostedBillingWebhookPayload(updatePayload, secret)
      },
      body: updatePayload
    }));

    expect(response.status).toBe(200);
    expect(subscriptionStore.get("sub_plan_change")).toMatchObject({
      planId: "plus",
      status: "active",
      lastEventId: "evt_plan_update"
    });
  });

  it("does not mark a persistent webhook event as processed before the subscription write succeeds", async () => {
    const secret = "whsec_retry";
    const env = {
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_BILLING_MODE: "test",
      STRIPE_WEBHOOK_SECRET: secret,
      DATABASE_URL: "postgres://tax_engine:test@localhost:5432/tax_engine"
    };
    const payload = JSON.stringify({
      id: "evt_retry",
      type: "checkout.session.completed",
      created: 1773273600,
      data: {
        object: {
          object: "checkout.session",
          customer: "cus_retry",
          subscription: "sub_retry",
          metadata: {
            workspaceOwnerId: "user_retry",
            planId: "starter"
          }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, secret);
    const markedEvents: string[] = [];
    let persistAttempts = 0;
    const persistSubscription = vi.fn(async () => {
      persistAttempts += 1;

      if (persistAttempts === 1) {
        throw new Error("transient postgres failure");
      }
    });
    const markEventProcessed = vi.fn(async (
      _env: Record<string, string | undefined>,
      event: { id: string }
    ) => {
      markedEvents.push(event.id);
      return true;
    });
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env,
      now: "2026-03-12T00:00:00.000Z",
      nowUnixSeconds: 1773273600,
      getExistingPersistedSubscription: async () => null,
      getExistingPersistedSubscriptionByCustomerId: async () => null,
      deletePersistedSubscription: async () => {},
      persistSubscription,
      markEventProcessed
    });

    await expect(POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature
      },
      body: payload
    }))).rejects.toThrow("transient postgres failure");
    expect(markedEvents).toEqual([]);

    const retryResponse = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature
      },
      body: payload
    }));

    expect(retryResponse.status).toBe(200);
    await expect(retryResponse.json()).resolves.toEqual({
      acknowledged: true
    });
    expect(persistSubscription).toHaveBeenCalledTimes(2);
    expect(markEventProcessed).toHaveBeenCalledTimes(1);
    expect(markedEvents).toEqual(["evt_retry"]);
  });

  it("removes a canceled subscription row before persisting a replacement subscription for the same customer", async () => {
    const secret = "whsec_replacement";
    const env = {
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_BILLING_MODE: "test",
      STRIPE_WEBHOOK_SECRET: secret,
      DATABASE_URL: "postgres://tax_engine:test@localhost:5432/tax_engine"
    };
    const payload = JSON.stringify({
      id: "evt_replacement",
      type: "checkout.session.completed",
      created: 1773273600,
      data: {
        object: {
          object: "checkout.session",
          customer: "cus_replacement",
          subscription: "sub_new",
          metadata: {
            workspaceOwnerId: "user_replacement",
            planId: "starter"
          }
        }
      }
    });
    const deletePersistedSubscription = vi.fn(async () => {});
    const persistSubscription = vi.fn(async () => ({
      subscriptionId: "sub_new",
      customerId: "cus_replacement",
      workspaceOwnerId: "user_replacement",
      planId: "starter",
      status: "active",
      lastEventId: "evt_replacement",
      lastEventType: "checkout.session.completed",
      updatedAt: "2026-03-12T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null
    }));
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env,
      now: "2026-03-12T00:00:00.000Z",
      nowUnixSeconds: 1773273600,
      getExistingPersistedSubscription: async () => null,
      getExistingPersistedSubscriptionByCustomerId: async () => ({
        subscriptionId: "sub_old",
        customerId: "cus_replacement",
        workspaceOwnerId: "user_replacement",
        planId: "starter",
        status: "canceled",
        lastEventId: "evt_old",
        lastEventType: "customer.subscription.deleted",
        updatedAt: "2026-03-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null
      }),
      deletePersistedSubscription,
      persistSubscription,
      markEventProcessed: async () => true
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signHostedBillingWebhookPayload(payload, secret)
      },
      body: payload
    }));

    expect(response.status).toBe(200);
    expect(deletePersistedSubscription).toHaveBeenCalledWith(env, "sub_old");
    expect(persistSubscription).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        stripeSubscriptionId: "sub_new",
        stripeCustomerId: "cus_replacement"
      })
    );
  });

  it("keeps hosted billing subscription storage untouched in self-host webhook bypass mode", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore([
      {
        subscriptionId: "sub_existing",
        customerId: "cus_existing",
        workspaceOwnerId: "user_existing",
        planId: "starter",
        status: "active",
        lastEventId: "evt_existing",
        lastEventType: "checkout.session.completed",
        updatedAt: "2026-03-11T23:59:59.000Z"
      }
    ]);
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_test"
      },
      subscriptionStore
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "ignored"
      },
      body: JSON.stringify({ id: "evt_bypass", type: "checkout.session.completed", data: { object: {} } })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      acknowledged: true,
      provider: "stripe",
      bypassed: true,
      message: "Self-host deployment bypasses hosted billing webhooks."
    });
    expect(subscriptionStore.list()).toEqual([
      {
        subscriptionId: "sub_existing",
        customerId: "cus_existing",
        workspaceOwnerId: "user_existing",
        planId: "starter",
        status: "active",
        lastEventId: "evt_existing",
        lastEventType: "checkout.session.completed",
        updatedAt: "2026-03-11T23:59:59.000Z"
      }
    ]);
  });

  it("records AI helper credit purchases from checkout.session.completed webhooks", async () => {
    const payload = JSON.stringify({
      id: "evt_ai_credit_pack",
      type: "checkout.session.completed",
      created: 1_775_000_000,
      data: {
        object: {
          object: "checkout.session",
          id: "cs_ai_credit_pack",
          customer: "cus_ai_credit_pack",
          amount_total: 1500,
          currency: "usd",
          metadata: {
            purchaseKind: "ai-credit-pack",
            hostedOwnerId: "owner-ai-credit-pack",
            aiCreditCents: "1000"
          }
        }
      }
    });
    const recordedPurchases: Array<Record<string, unknown>> = [];
    const processedEvents: string[] = [];
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_ai_credit_pack"
      },
      nowUnixSeconds: 1_775_000_000,
      constructEvent: (rawPayload) => JSON.parse(rawPayload),
      recordAiCreditPurchase: async (_env, input) => {
        recordedPurchases.push(input);
        return true;
      },
      markEventProcessed: async (_env, event) => {
        processedEvents.push(event.id);
        return true;
      }
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signHostedBillingWebhookPayload(payload, "whsec_ai_credit_pack", 1_775_000_000)
      },
      body: payload
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ acknowledged: true });
    expect(recordedPurchases).toEqual([
      {
        checkoutSessionId: "cs_ai_credit_pack",
        ownerId: "owner-ai-credit-pack",
        stripeCustomerId: "cus_ai_credit_pack",
        amountPaidCents: 1500,
        creditedBudgetCents: 1000,
        currency: "usd",
        createdAt: new Date(1_775_000_000 * 1000).toISOString()
      }
    ]);
    expect(processedEvents).toEqual(["evt_ai_credit_pack"]);
  });
});
