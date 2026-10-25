import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createHostedBillingCheckoutRouteHandlers,
} from "../../../apps/web/src/lib/hosted-billing";
import { createInMemoryHostedBillingSubscriptionStore } from "../../../apps/web/src/lib/hosted-billing-state";
import {
  createHostedBillingWebhookRouteHandlers,
  signHostedBillingWebhookPayload,
  WEBHOOK_EVENT_MAX_AGE_SECONDS,
  WEBHOOK_EVENT_MAX_FUTURE_SECONDS,
  STRIPE_ID_PATTERN,
  OWNER_ID_PATTERN
} from "../../../apps/web/src/lib/hosted-billing-webhook";

describe("security: billing checkout authentication", () => {
  it("rejects unauthenticated checkout requests in hosted mode with 401", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "hosted-auth-secret-for-tests-1234567890"
      },
      now: "2026-03-26T00:00:00.000Z"
    });

    const response = await POST(new Request("https://tax.example/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        planId: "starter",
        successUrl: "https://tax.example/billing/success",
        cancelUrl: "https://tax.example/billing/cancel"
      })
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required for hosted billing checkout."
    });
  });

  it("allows authenticated checkout requests in hosted mode", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        TAX_ENGINE_APP_URL: "https://tax.example",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "user-checkout-1"
      },
      now: "2026-03-26T00:00:00.000Z"
    });

    const response = await POST(new Request("https://tax.example/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        planId: "starter",
        successUrl: "https://tax.example/billing/success",
        cancelUrl: "https://tax.example/billing/cancel"
      })
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.planId).toBe("starter");
    expect(body.bypassed).toBe(false);
  });

  it("still bypasses checkout in self-host mode without requiring auth", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
      }
    });

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
    const body = await response.json();
    expect(body.bypassed).toBe(true);
  });
});

describe("security: checkout redirect URL validation", () => {
  it("rejects checkout with successUrl pointing to an external origin", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        TAX_ENGINE_APP_URL: "https://tax.example",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "user-redirect-1"
      },
      now: "2026-03-26T00:00:00.000Z"
    });

    const response = await POST(new Request("https://tax.example/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        planId: "starter",
        successUrl: "https://evil.example/steal-session",
        cancelUrl: "https://tax.example/billing/cancel"
      })
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid hosted billing checkout request."
    });
  });

  it("rejects checkout with cancelUrl pointing to an external origin", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        TAX_ENGINE_APP_URL: "https://tax.example",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "user-redirect-2"
      },
      now: "2026-03-26T00:00:00.000Z"
    });

    const response = await POST(new Request("https://tax.example/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        planId: "starter",
        successUrl: "https://tax.example/billing/success",
        cancelUrl: "https://evil.example/phishing"
      })
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid hosted billing checkout request."
    });
  });

  it("rejects checkout with javascript: protocol URL", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        TAX_ENGINE_APP_URL: "https://tax.example",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "user-redirect-3"
      },
      now: "2026-03-26T00:00:00.000Z"
    });

    const response = await POST(new Request("https://tax.example/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        planId: "starter",
        successUrl: "javascript:alert(1)",
        cancelUrl: "https://tax.example/billing/cancel"
      })
    }));

    expect(response.status).toBe(400);
  });
});

describe("security: webhook signature enforcement", () => {
  it("rejects webhooks with no signature header", async () => {
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
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "evt_no_sig",
        type: "checkout.session.completed",
        data: { object: {} }
      })
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid webhook request."
    });
  });

  it("returns generic error when webhook secret is not configured (no config probing)", async () => {
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test"
      }
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": "any-signature"
      },
      body: JSON.stringify({
        id: "evt_no_secret",
        type: "checkout.session.completed",
        data: { object: {} }
      })
    }));

    // Returns 400 (same as invalid signature) — NOT 503 — so attackers
    // cannot distinguish "secret not configured" from "wrong signature".
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid webhook request."
    });
  });

  it("rejects webhooks signed with a different secret", async () => {
    const payload = JSON.stringify({
      id: "evt_wrong_key",
      type: "checkout.session.completed",
      data: { object: {} }
    });
    const wrongSignature = signHostedBillingWebhookPayload(payload, "whsec_wrong");
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_correct"
      }
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": wrongSignature
      },
      body: payload
    }));

    expect(response.status).toBe(400);
  });
});

describe("security: webhook response does not leak internal state", () => {
  it("returns only an acknowledgment without subscription details", async () => {
    const payload = JSON.stringify({
      id: "evt_leak_check",
      type: "checkout.session.completed",
      created: 1774483200,
      data: {
        object: {
          customer: "cus_secret_123",
          subscription: "sub_secret_456",
          metadata: {
            workspaceOwnerId: "user_secret_789",
            planId: "starter"
          }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, "whsec_leak_test");
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_leak_test"
      },
      now: "2026-03-26T00:00:00.000Z",
      nowUnixSeconds: 1774483200
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toEqual({ acknowledged: true });
    expect(body).not.toHaveProperty("subscriptionChange");
    expect(body).not.toHaveProperty("storedSubscription");
    expect(body).not.toHaveProperty("eventId");
    expect(body).not.toHaveProperty("eventType");
    expect(JSON.stringify(body)).not.toContain("cus_secret_123");
    expect(JSON.stringify(body)).not.toContain("user_secret_789");
  });
});

describe("security: webhook body size limit", () => {
  it("rejects webhook payloads exceeding the 64 KB body size limit", async () => {
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_size_test"
      }
    });

    const oversizedBody = "x".repeat(65 * 1024);

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(oversizedBody.length),
        "x-tax-engine-signature": "any-signature"
      },
      body: oversizedBody
    }));

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toContain("too large");
  });

  it("accepts webhook payloads within the 64 KB body size limit", async () => {
    const secret = "whsec_size_ok";
    const payload = JSON.stringify({
      id: "evt_size_ok",
      type: "checkout.session.completed",
      created: 1774569600,
      data: {
        object: {
          customer: "cus_ok",
          subscription: "sub_ok",
          metadata: { workspaceOwnerId: "user_ok", planId: "starter" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, secret);

    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: secret
      },
      now: "2026-03-27T00:00:00.000Z",
      nowUnixSeconds: 1774569600
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ acknowledged: true });
  });
});

describe("security: webhook event idempotency", () => {
  it("deduplicates a replayed webhook event with the same event ID", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const payload = JSON.stringify({
      id: "evt_replay_1",
      type: "checkout.session.completed",
      created: 1774483200,
      data: {
        object: {
          customer: "cus_replay",
          subscription: "sub_replay",
          metadata: {
            workspaceOwnerId: "user_replay",
            planId: "starter"
          }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, "whsec_replay_test");
    const webhookEnv = {
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_BILLING_MODE: "test",
      STRIPE_WEBHOOK_SECRET: "whsec_replay_test"
    };

    const first = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      now: "2026-03-26T00:00:00.000Z",
      nowUnixSeconds: 1774483200,
      subscriptionStore
    });

    const firstResponse = await first.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.json()).toEqual({ acknowledged: true });

    const second = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      now: "2026-03-26T00:01:00.000Z",
      nowUnixSeconds: 1774483260,
      subscriptionStore
    });

    const replayResponse = await second.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(replayResponse.status).toBe(200);
    const replayBody = await replayResponse.json();
    // Deduplicated events return a generic acknowledgment — no "deduplicated" flag
    // to prevent attackers from probing which event IDs have been processed.
    expect(replayBody).toEqual({ acknowledged: true });
    expect(replayBody).not.toHaveProperty("deduplicated");

    expect(subscriptionStore.list()).toHaveLength(1);
    expect(subscriptionStore.list()[0]?.updatedAt).toBe("2026-03-26T00:00:00.000Z");
  });

  it("processes a new event for the same subscription after a different event was already stored", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const checkoutPayload = JSON.stringify({
      id: "evt_first",
      type: "checkout.session.completed",
      created: 1774483200,
      data: {
        object: {
          customer: "cus_multi",
          subscription: "sub_multi",
          metadata: { workspaceOwnerId: "user_multi", planId: "plus" }
        }
      }
    });
    const updatePayload = JSON.stringify({
      id: "evt_second",
      type: "customer.subscription.updated",
      created: 1774486800,
      data: {
        object: {
          id: "sub_multi",
          customer: "cus_multi",
          status: "past_due",
          metadata: {}
        }
      }
    });
    const webhookEnv = {
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_BILLING_MODE: "test",
      STRIPE_WEBHOOK_SECRET: "whsec_multi_test"
    };

    const first = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      now: "2026-03-26T00:00:00.000Z",
      nowUnixSeconds: 1774483200,
      subscriptionStore
    });

    await first.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signHostedBillingWebhookPayload(checkoutPayload, "whsec_multi_test")
      },
      body: checkoutPayload
    }));

    const second = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      now: "2026-03-26T01:00:00.000Z",
      nowUnixSeconds: 1774486800,
      subscriptionStore
    });

    const updateResponse = await second.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signHostedBillingWebhookPayload(updatePayload, "whsec_multi_test")
      },
      body: updatePayload
    }));

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({ acknowledged: true });

    const record = subscriptionStore.get("sub_multi");
    expect(record?.status).toBe("past-due");
    expect(record?.lastEventId).toBe("evt_second");
    expect(record?.updatedAt).toBe("2026-03-26T01:00:00.000Z");
  });
});

describe("security: webhook event timestamp replay protection", () => {
  const webhookSecret = "whsec_timestamp_test";
  const webhookEnv = {
    TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
    TAX_ENGINE_BILLING_MODE: "test",
    STRIPE_WEBHOOK_SECRET: webhookSecret
  };

  function buildSignedWebhookRequest(eventCreated: number, eventId: string) {
    const payload = JSON.stringify({
      id: eventId,
      type: "checkout.session.completed",
      created: eventCreated,
      data: {
        object: {
          customer: "cus_ts",
          subscription: "sub_ts",
          metadata: { workspaceOwnerId: "user_ts", planId: "starter" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, webhookSecret);

    return new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    });
  }

  it("accepts a webhook event within the timestamp tolerance window", async () => {
    const now = 1774483200;
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: now,
      now: new Date(now * 1000).toISOString(),
      subscriptionStore: createInMemoryHostedBillingSubscriptionStore()
    });

    const response = await POST(buildSignedWebhookRequest(now - 60, "evt_ts_ok"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ acknowledged: true });
  });

  it("rejects a webhook event older than the max age window (replay attack)", async () => {
    const now = 1774483200;
    const staleCreated = now - WEBHOOK_EVENT_MAX_AGE_SECONDS - 1;
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: now,
      subscriptionStore: createInMemoryHostedBillingSubscriptionStore()
    });

    const response = await POST(buildSignedWebhookRequest(staleCreated, "evt_ts_stale"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid webhook request."
    });
  });

  it("rejects a webhook event with a timestamp far in the future", async () => {
    const now = 1774483200;
    const futureCreated = now + WEBHOOK_EVENT_MAX_FUTURE_SECONDS + 10;
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: now,
      subscriptionStore: createInMemoryHostedBillingSubscriptionStore()
    });

    const response = await POST(buildSignedWebhookRequest(futureCreated, "evt_ts_future"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid webhook request."
    });
  });

  it("accepts a webhook event with minor clock skew (within future tolerance)", async () => {
    const now = 1774483200;
    const slightlyFuture = now + WEBHOOK_EVENT_MAX_FUTURE_SECONDS - 5;
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: now,
      now: new Date(now * 1000).toISOString(),
      subscriptionStore: createInMemoryHostedBillingSubscriptionStore()
    });

    const response = await POST(buildSignedWebhookRequest(slightlyFuture, "evt_ts_skew_ok"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ acknowledged: true });
  });

  it("rejects a webhook event with no created field", async () => {
    const payload = JSON.stringify({
      id: "evt_no_created",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_nc",
          subscription: "sub_nc",
          metadata: { workspaceOwnerId: "user_nc", planId: "starter" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, webhookSecret);
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: 1774483200
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid hosted billing webhook payload."
    });
  });

  it("rejects a webhook event with non-numeric created field", async () => {
    const payload = JSON.stringify({
      id: "evt_bad_created",
      type: "checkout.session.completed",
      created: "2026-03-26T00:00:00.000Z",
      data: {
        object: {
          customer: "cus_bc",
          subscription: "sub_bc",
          metadata: { workspaceOwnerId: "user_bc", planId: "starter" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, webhookSecret);
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: 1774483200
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid hosted billing webhook payload."
    });
  });
});

describe("security: webhook Content-Type enforcement", () => {
  it("rejects webhook with text/plain Content-Type (CSRF defense-in-depth)", async () => {
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_ct_test"
      }
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-tax-engine-signature": "any"
      },
      body: JSON.stringify({ id: "evt_ct", type: "test", created: 0, data: { object: {} } })
    }));

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: "Content-Type must be application/json."
    });
  });

  it("rejects webhook with form-encoded Content-Type (CSRF defense-in-depth)", async () => {
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_ct_test"
      }
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-tax-engine-signature": "any"
      },
      body: "id=evt_form&type=test"
    }));

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: "Content-Type must be application/json."
    });
  });

  it("rejects webhook with no Content-Type header", async () => {
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: "whsec_ct_test"
      }
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "x-tax-engine-signature": "any"
      },
      body: JSON.stringify({ id: "evt_noct", type: "test", created: 0, data: { object: {} } })
    }));

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: "Content-Type must be application/json."
    });
  });

  it("accepts webhook with application/json; charset=utf-8 Content-Type", async () => {
    const now = 1774483200;
    const secret = "whsec_ct_charset";
    const payload = JSON.stringify({
      id: "evt_charset",
      type: "checkout.session.completed",
      created: now,
      data: {
        object: {
          customer: "cus_ct",
          subscription: "sub_ct",
          metadata: { workspaceOwnerId: "user_ct", planId: "starter" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, secret);
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: secret
      },
      nowUnixSeconds: now
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ acknowledged: true });
  });
});

describe("security: webhook metadata ID format validation", () => {
  it("STRIPE_ID_PATTERN accepts valid Stripe IDs", () => {
    expect(STRIPE_ID_PATTERN.test("cus_abc123")).toBe(true);
    expect(STRIPE_ID_PATTERN.test("sub_ABCDEF1234567890")).toBe(true);
    expect(STRIPE_ID_PATTERN.test("evt_liveTestId9999")).toBe(true);
    expect(STRIPE_ID_PATTERN.test("cs_test_a1b2c3d4")).toBe(true);
  });

  it("STRIPE_ID_PATTERN rejects path traversal in Stripe IDs", () => {
    expect(STRIPE_ID_PATTERN.test("../../etc/passwd")).toBe(false);
    expect(STRIPE_ID_PATTERN.test("cus_../../../secret")).toBe(false);
    expect(STRIPE_ID_PATTERN.test("sub_foo/bar")).toBe(false);
  });

  it("STRIPE_ID_PATTERN rejects SQL injection fragments", () => {
    expect(STRIPE_ID_PATTERN.test("cus_' OR 1=1 --")).toBe(false);
    expect(STRIPE_ID_PATTERN.test("sub_; DROP TABLE users;")).toBe(false);
  });

  it("STRIPE_ID_PATTERN rejects empty strings and strings without prefix", () => {
    expect(STRIPE_ID_PATTERN.test("")).toBe(false);
    expect(STRIPE_ID_PATTERN.test("noprefixjusttext")).toBe(false);
    expect(STRIPE_ID_PATTERN.test("_leadingunderscore")).toBe(false);
  });

  it("OWNER_ID_PATTERN accepts valid workspace owner IDs", () => {
    expect(OWNER_ID_PATTERN.test("user_abc123")).toBe(true);
    expect(OWNER_ID_PATTERN.test("usr-1234-abcd")).toBe(true);
    expect(OWNER_ID_PATTERN.test("a")).toBe(true);
    expect(OWNER_ID_PATTERN.test("user123")).toBe(true);
  });

  it("OWNER_ID_PATTERN rejects path traversal and injection", () => {
    expect(OWNER_ID_PATTERN.test("../../../etc/passwd")).toBe(false);
    expect(OWNER_ID_PATTERN.test("user<script>alert(1)</script>")).toBe(false);
    expect(OWNER_ID_PATTERN.test("user'; DROP TABLE --")).toBe(false);
    expect(OWNER_ID_PATTERN.test("")).toBe(false);
  });

  it("OWNER_ID_PATTERN rejects overly long IDs", () => {
    expect(OWNER_ID_PATTERN.test("a".repeat(129))).toBe(false);
    expect(OWNER_ID_PATTERN.test("a".repeat(128))).toBe(true);
  });

  it("rejects webhook event with path traversal in customerId", async () => {
    const now = 1774483200;
    const secret = "whsec_id_validation";
    const payload = JSON.stringify({
      id: "evt_bad_cust",
      type: "checkout.session.completed",
      created: now,
      data: {
        object: {
          customer: "../../etc/passwd",
          subscription: "sub_valid123",
          metadata: { workspaceOwnerId: "user_valid", planId: "starter" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, secret);
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: secret
      },
      nowUnixSeconds: now,
      subscriptionStore
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    // Event acknowledged but change silently dropped due to invalid ID format
    expect(response.status).toBe(200);
    expect(subscriptionStore.list()).toHaveLength(0);
  });

  it("rejects webhook event with script injection in workspaceOwnerId", async () => {
    const now = 1774483200;
    const secret = "whsec_id_validation";
    const payload = JSON.stringify({
      id: "evt_bad_owner",
      type: "checkout.session.completed",
      created: now,
      data: {
        object: {
          customer: "cus_valid123",
          subscription: "sub_valid456",
          metadata: { workspaceOwnerId: "<script>alert(1)</script>", planId: "starter" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, secret);
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        STRIPE_WEBHOOK_SECRET: secret
      },
      nowUnixSeconds: now,
      subscriptionStore
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(response.status).toBe(200);
    expect(subscriptionStore.list()).toHaveLength(0);
  });
});

describe("security: webhook event ordering protection", () => {
  it("rejects a stale event that would overwrite a newer subscription state", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const secret = "whsec_ordering";
    const webhookEnv = {
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_BILLING_MODE: "test",
      STRIPE_WEBHOOK_SECRET: secret
    };

    // First: process a recent checkout event at T=100
    const baseTime = 1774483200;
    const recentPayload = JSON.stringify({
      id: "evt_recent",
      type: "checkout.session.completed",
      created: baseTime + 100,
      data: {
        object: {
          customer: "cus_order1",
          subscription: "sub_order1",
          metadata: { workspaceOwnerId: "user_order1", planId: "plus" }
        }
      }
    });
    const recentSig = signHostedBillingWebhookPayload(recentPayload, secret);
    const firstHandler = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: baseTime + 100,
      now: "2026-03-26T00:01:40.000Z",
      subscriptionStore
    });
    await firstHandler.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-tax-engine-signature": recentSig },
      body: recentPayload
    }));

    expect(subscriptionStore.get("sub_order1")?.lastEventId).toBe("evt_recent");

    // Second: an older event (created at T=0) arrives late, delivered at T=120
    // It's within the 5-min timestamp window but older than what we stored.
    const stalePayload = JSON.stringify({
      id: "evt_stale",
      type: "customer.subscription.updated",
      created: baseTime,
      data: {
        object: {
          id: "sub_order1",
          customer: "cus_order1",
          status: "past_due",
          metadata: { workspaceOwnerId: "user_order1" }
        }
      }
    });
    const staleSig = signHostedBillingWebhookPayload(stalePayload, secret);
    const secondHandler = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: baseTime + 120,
      now: "2026-03-26T00:02:00.000Z",
      subscriptionStore
    });

    const response = await secondHandler.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-tax-engine-signature": staleSig },
      body: stalePayload
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    // Stale events return a generic acknowledgment — no "stale" flag
    // to prevent attackers from mapping subscription event timelines.
    expect(body).toEqual({ acknowledged: true });
    expect(body).not.toHaveProperty("stale");

    // Verify the newer state was NOT overwritten
    const record = subscriptionStore.get("sub_order1");
    expect(record?.lastEventId).toBe("evt_recent");
    expect(record?.status).toBe("active");
  });

  it("always applies cancellation even if it arrives out of order", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const secret = "whsec_ordering";
    const webhookEnv = {
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_BILLING_MODE: "test",
      STRIPE_WEBHOOK_SECRET: secret
    };

    // First: process a checkout event at T=100
    const baseTime = 1774483200;
    const checkoutPayload = JSON.stringify({
      id: "evt_checkout_ord",
      type: "checkout.session.completed",
      created: baseTime + 100,
      data: {
        object: {
          customer: "cus_cancel1",
          subscription: "sub_cancel1",
          metadata: { workspaceOwnerId: "user_cancel1", planId: "starter" }
        }
      }
    });
    const checkoutSig = signHostedBillingWebhookPayload(checkoutPayload, secret);
    const firstHandler = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: baseTime + 100,
      now: "2026-03-26T00:01:40.000Z",
      subscriptionStore
    });
    await firstHandler.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-tax-engine-signature": checkoutSig },
      body: checkoutPayload
    }));

    // Second: cancellation arrives with an OLDER timestamp (T=0), delivered at T=120
    // Within 5-min window but older than stored record. Cancellations should always apply.
    const cancelPayload = JSON.stringify({
      id: "evt_cancel_ord",
      type: "customer.subscription.deleted",
      created: baseTime,
      data: {
        object: {
          id: "sub_cancel1",
          customer: "cus_cancel1",
          metadata: { workspaceOwnerId: "user_cancel1", planId: "starter" }
        }
      }
    });
    const cancelSig = signHostedBillingWebhookPayload(cancelPayload, secret);
    const secondHandler = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: baseTime + 120,
      now: "2026-03-26T00:02:00.000Z",
      subscriptionStore
    });

    const response = await secondHandler.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-tax-engine-signature": cancelSig },
      body: cancelPayload
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ acknowledged: true });

    // Cancellation MUST be applied despite older timestamp
    const record = subscriptionStore.get("sub_cancel1");
    expect(record?.status).toBe("canceled");
    expect(record?.lastEventId).toBe("evt_cancel_ord");
  });
});

describe("security: webhook Stripe object type validation", () => {
  const secret = "whsec_objtype_test";
  const webhookEnv = {
    TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
    TAX_ENGINE_BILLING_MODE: "test",
    STRIPE_WEBHOOK_SECRET: secret
  };
  const now = 1774483200;

  it("rejects checkout event with mismatched object type (e.g. customer instead of checkout.session)", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const payload = JSON.stringify({
      id: "evt_wrong_obj_type",
      type: "checkout.session.completed",
      created: now,
      data: {
        object: {
          object: "customer",
          customer: "cus_fake",
          subscription: "sub_fake",
          metadata: { workspaceOwnerId: "user_fake", planId: "starter" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, secret);
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: now,
      subscriptionStore
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ acknowledged: true });
    // Event silently dropped — mismatched object type not persisted
    expect(subscriptionStore.list()).toHaveLength(0);
  });

  it("rejects subscription.updated event with checkout.session object type", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const payload = JSON.stringify({
      id: "evt_sub_wrong_obj",
      type: "customer.subscription.updated",
      created: now,
      data: {
        object: {
          object: "checkout.session",
          id: "sub_mismatch",
          customer: "cus_mismatch",
          status: "active",
          metadata: { workspaceOwnerId: "user_mismatch", planId: "plus" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, secret);
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: now,
      subscriptionStore
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(response.status).toBe(200);
    expect(subscriptionStore.list()).toHaveLength(0);
  });

  it("accepts checkout event with correct object type (checkout.session)", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const payload = JSON.stringify({
      id: "evt_correct_obj",
      type: "checkout.session.completed",
      created: now,
      data: {
        object: {
          object: "checkout.session",
          customer: "cus_correct",
          subscription: "sub_correct",
          metadata: { workspaceOwnerId: "user_correct", planId: "starter" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, secret);
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: now,
      now: "2026-03-26T00:00:00.000Z",
      subscriptionStore
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(response.status).toBe(200);
    expect(subscriptionStore.list()).toHaveLength(1);
    expect(subscriptionStore.get("sub_correct")?.status).toBe("active");
  });

  it("accepts event without object type field (backwards compatibility with existing events)", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const payload = JSON.stringify({
      id: "evt_no_obj_field",
      type: "checkout.session.completed",
      created: now,
      data: {
        object: {
          customer: "cus_nofield",
          subscription: "sub_nofield",
          metadata: { workspaceOwnerId: "user_nofield", planId: "plus" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, secret);
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv,
      nowUnixSeconds: now,
      now: "2026-03-26T00:00:00.000Z",
      subscriptionStore
    });

    const response = await POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tax-engine-signature": signature
      },
      body: payload
    }));

    expect(response.status).toBe(200);
    expect(subscriptionStore.list()).toHaveLength(1);
  });

  it("webhook responses are indistinguishable for valid, deduplicated, and stale events", async () => {
    const subscriptionStore = createInMemoryHostedBillingSubscriptionStore();
    const payload = JSON.stringify({
      id: "evt_indistinguish",
      type: "checkout.session.completed",
      created: now,
      data: {
        object: {
          object: "checkout.session",
          customer: "cus_indist",
          subscription: "sub_indist",
          metadata: { workspaceOwnerId: "user_indist", planId: "starter" }
        }
      }
    });
    const signature = signHostedBillingWebhookPayload(payload, secret);

    // First request — new event
    const handler1 = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv, nowUnixSeconds: now, now: "2026-03-26T00:00:00.000Z", subscriptionStore
    });
    const r1 = await handler1.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-tax-engine-signature": signature },
      body: payload
    }));

    // Second request — deduplicated (same event ID)
    const handler2 = createHostedBillingWebhookRouteHandlers({
      env: webhookEnv, nowUnixSeconds: now + 10, subscriptionStore
    });
    const r2 = await handler2.POST(new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-tax-engine-signature": signature },
      body: payload
    }));

    // All responses must be byte-identical — no leakage of internal state
    const body1 = await r1.json();
    const body2 = await r2.json();
    expect(body1).toEqual({ acknowledged: true });
    expect(body2).toEqual({ acknowledged: true });
    expect(r1.status).toBe(r2.status);
  });
});
