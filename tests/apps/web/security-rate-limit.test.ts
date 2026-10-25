vi.mock("server-only", () => ({}));
import { describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  cleanupExpiredEntries,
  createRateLimitStore,
  rateLimitTiers,
  resolveClientIdentifier,
  type RateLimitConfig
} from "../../../apps/web/src/lib/rate-limit";
import {
  safeParseJsonBody
} from "../../../apps/web/src/lib/safe-body-parser";
import {
  createHostedAuthRouteHandlers
} from "../../../apps/web/src/lib/hosted-auth";
import {
  createHostedBillingCheckoutRouteHandlers
} from "../../../apps/web/src/lib/hosted-billing";

// Exercise the application's request limiter without Better Auth's deliberate
// password timing delay. Real auth behavior is covered in hosted-auth.test.ts.
const authHandler = vi.hoisted(() => vi.fn(async () => new Response(null, { status: 401 })));
vi.mock("../../../apps/web/node_modules/better-auth/next-js", () => ({
  toNextJsHandler: () => ({
    GET: authHandler, POST: authHandler, PATCH: authHandler,
    PUT: authHandler, DELETE: authHandler
  })
}));

describe("security: rate limiter core", () => {
  const config: RateLimitConfig = { maxRequests: 3, windowMs: 10_000 };

  it("allows requests within the limit", () => {
    const store = createRateLimitStore();
    const now = 1000000;

    const r1 = checkRateLimit(store, "ip1", config, now);
    const r2 = checkRateLimit(store, "ip1", config, now + 100);
    const r3 = checkRateLimit(store, "ip1", config, now + 200);

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("rejects requests that exceed the limit", () => {
    const store = createRateLimitStore();
    const now = 1000000;

    checkRateLimit(store, "ip1", config, now);
    checkRateLimit(store, "ip1", config, now + 100);
    checkRateLimit(store, "ip1", config, now + 200);
    const r4 = checkRateLimit(store, "ip1", config, now + 300);

    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows requests again after the window expires", () => {
    const store = createRateLimitStore();
    const now = 1000000;

    checkRateLimit(store, "ip1", config, now);
    checkRateLimit(store, "ip1", config, now + 100);
    checkRateLimit(store, "ip1", config, now + 200);

    // All three timestamps must fall outside the window, so advance past the latest (now + 200)
    const afterWindow = now + 200 + config.windowMs + 1;
    const result = checkRateLimit(store, "ip1", config, afterWindow);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("tracks different keys independently", () => {
    const store = createRateLimitStore();
    const now = 1000000;

    checkRateLimit(store, "ip1", config, now);
    checkRateLimit(store, "ip1", config, now + 100);
    checkRateLimit(store, "ip1", config, now + 200);

    const r1 = checkRateLimit(store, "ip1", config, now + 300);
    const r2 = checkRateLimit(store, "ip2", config, now + 300);

    expect(r1.allowed).toBe(false);
    expect(r2.allowed).toBe(true);
  });

  it("provides correct retry-after value", () => {
    const store = createRateLimitStore();
    const now = 1000000;

    checkRateLimit(store, "ip1", config, now);
    checkRateLimit(store, "ip1", config, now + 1000);
    checkRateLimit(store, "ip1", config, now + 2000);

    const r4 = checkRateLimit(store, "ip1", config, now + 3000);

    expect(r4.allowed).toBe(false);
    expect(r4.retryAfterMs).toBeLessThanOrEqual(config.windowMs);
    expect(r4.retryAfterMs).toBeGreaterThan(0);
  });
});

describe("security: rate limit store cleanup", () => {
  it("removes expired entries during cleanup", () => {
    const store = createRateLimitStore();
    const config: RateLimitConfig = { maxRequests: 5, windowMs: 10_000 };
    const now = 1000000;

    checkRateLimit(store, "ip1", config, now);
    checkRateLimit(store, "ip2", config, now);

    const cleaned = cleanupExpiredEntries(store, config.windowMs, now + config.windowMs + 1);

    expect(cleaned).toBe(2);
    expect(store.get("ip1")).toBeUndefined();
    expect(store.get("ip2")).toBeUndefined();
  });

  it("preserves active entries during cleanup", () => {
    const store = createRateLimitStore();
    const config: RateLimitConfig = { maxRequests: 5, windowMs: 10_000 };
    const now = 1000000;

    checkRateLimit(store, "ip1", config, now);
    checkRateLimit(store, "ip2", config, now + config.windowMs);

    const cleaned = cleanupExpiredEntries(store, config.windowMs, now + config.windowMs + 1);

    expect(cleaned).toBe(1);
    expect(store.get("ip1")).toBeUndefined();
    expect(store.get("ip2")).toBeDefined();
  });
});

describe("security: client identifier resolution", () => {
  it("uses rightmost IP from x-forwarded-for (proxy-added, not client-spoofable)", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });

    expect(resolveClientIdentifier(headers)).toBe("5.6.7.8");
  });

  it("uses single x-forwarded-for value when only one present", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4" });

    expect(resolveClientIdentifier(headers)).toBe("1.2.3.4");
  });

  it("falls back to x-forwarded-for when x-real-ip is absent", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });

    expect(resolveClientIdentifier(headers)).toBe("5.6.7.8");
  });

  it("uses x-real-ip header when present", () => {
    const headers = new Headers({ "x-real-ip": "9.10.11.12" });

    expect(resolveClientIdentifier(headers)).toBe("9.10.11.12");
  });

  it("returns unknown when no IP headers present", () => {
    const headers = new Headers();

    expect(resolveClientIdentifier(headers)).toBe("unknown");
  });

  it("prefers x-real-ip over x-forwarded-for (proxy-set single source of truth)", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4",
      "x-real-ip": "5.6.7.8"
    });

    expect(resolveClientIdentifier(headers)).toBe("5.6.7.8");
  });

  it("spoofed leftmost x-forwarded-for does NOT change resolved client identifier", () => {
    // Attacker sends X-Forwarded-For: fake-ip — proxy appends real IP
    const headers1 = new Headers({ "x-forwarded-for": "spoofed-ip-1, 10.0.0.99" });
    const headers2 = new Headers({ "x-forwarded-for": "spoofed-ip-2, 10.0.0.99" });

    // Both resolve to the same IP (rightmost = proxy-added)
    expect(resolveClientIdentifier(headers1)).toBe("10.0.0.99");
    expect(resolveClientIdentifier(headers2)).toBe("10.0.0.99");
  });

  it("rate limiting cannot be bypassed by rotating spoofed x-forwarded-for values", () => {
    const store = createRateLimitStore();
    const config: RateLimitConfig = { maxRequests: 3, windowMs: 60_000 };
    const now = 1000000;

    // Attacker sends requests with different spoofed leftmost IPs,
    // but behind a proxy that always appends the real IP "10.0.0.99"
    for (let i = 0; i < 3; i++) {
      const headers = new Headers({ "x-forwarded-for": `spoofed-${i}, 10.0.0.99` });
      const clientId = resolveClientIdentifier(headers);
      checkRateLimit(store, `test:${clientId}`, config, now + i * 100);
    }

    // 4th request with yet another spoofed IP — should still be rate limited
    const headers = new Headers({ "x-forwarded-for": "spoofed-new, 10.0.0.99" });
    const clientId = resolveClientIdentifier(headers);
    const result = checkRateLimit(store, `test:${clientId}`, config, now + 400);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("security: safe JSON body parser", () => {
  it("parses valid JSON within size limit", async () => {
    const body = JSON.stringify({ key: "value" });
    const request = new Request("https://example.com", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" }
    });

    const result = await safeParseJsonBody(request);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data).toEqual({ key: "value" });
    }
  });

  it("rejects body exceeding declared content-length", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "application/json",
        "content-length": "2000000"
      }
    });

    const result = await safeParseJsonBody(request, 1024);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.error).toContain("too large");
    }
  });

  it("rejects body exceeding actual size limit", async () => {
    const largeBody = "x".repeat(2048);
    const request = new Request("https://example.com", {
      method: "POST",
      body: largeBody,
      headers: { "content-type": "application/json" }
    });

    const result = await safeParseJsonBody(request, 1024);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.status).toBe(413);
    }
  });

  it("rejects invalid JSON", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: "not json {{{",
      headers: { "content-type": "application/json" }
    });

    const result = await safeParseJsonBody(request);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("Invalid JSON");
    }
  });
});

describe("security: auth route rate limiting", () => {
  it("returns 429 after exceeding POST request limit", async () => {
    const store = createRateLimitStore();
    const handlers = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        BETTER_AUTH_SECRET: "test-secret-for-rate-limit-tests-1234567890"
      },
      rateLimitStore: store
    });

    const makeRequest = () => new Request("https://tax.example/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.1"
      },
      body: JSON.stringify({ email: "test@example.com", password: "password" })
    });

    // Auth tier allows 20 per 15 min. Send 20 requests to exhaust the limit.
    const responses: Response[] = [];

    for (let i = 0; i < 21; i++) {
      responses.push(await handlers.POST(makeRequest()));
    }

    const lastResponse = responses[responses.length - 1]!;

    expect(responses.slice(0, 20).every((response) => response.status === 401)).toBe(true);
    expect(lastResponse.status).toBe(429);

    const body = await lastResponse.json() as { error: string };

    expect(body.error).toContain("Too many requests");
    expect(lastResponse.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 429 after exceeding PATCH request limit", async () => {
    const store = createRateLimitStore();
    const handlers = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        BETTER_AUTH_SECRET: "test-secret-for-rate-limit-tests-1234567890"
      },
      rateLimitStore: store
    });

    const makeRequest = () => new Request("https://tax.example/api/auth/update-user", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.1"
      },
      body: JSON.stringify({ name: "New Name" })
    });

    const responses: Response[] = [];

    for (let i = 0; i < 21; i++) {
      responses.push(await handlers.PATCH(makeRequest()));
    }

    const lastResponse = responses[responses.length - 1]!;

    expect(lastResponse.status).toBe(429);

    const body = await lastResponse.json() as { error: string };

    expect(body.error).toContain("Too many requests");
    expect(lastResponse.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 429 after exceeding PUT request limit", async () => {
    const store = createRateLimitStore();
    const handlers = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        BETTER_AUTH_SECRET: "test-secret-for-rate-limit-tests-1234567890"
      },
      rateLimitStore: store
    });

    const makeRequest = () => new Request("https://tax.example/api/auth/update-user", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.1"
      },
      body: JSON.stringify({ name: "New Name" })
    });

    const responses: Response[] = [];

    for (let i = 0; i < 21; i++) {
      responses.push(await handlers.PUT(makeRequest()));
    }

    const lastResponse = responses[responses.length - 1]!;

    expect(lastResponse.status).toBe(429);

    const body = await lastResponse.json() as { error: string };

    expect(body.error).toContain("Too many requests");
    expect(lastResponse.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 429 after exceeding DELETE request limit", async () => {
    const store = createRateLimitStore();
    const handlers = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        BETTER_AUTH_SECRET: "test-secret-for-rate-limit-tests-1234567890"
      },
      rateLimitStore: store
    });

    const makeRequest = () => new Request("https://tax.example/api/auth/delete-user", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.1"
      },
      body: JSON.stringify({})
    });

    const responses: Response[] = [];

    for (let i = 0; i < 21; i++) {
      responses.push(await handlers.DELETE(makeRequest()));
    }

    const lastResponse = responses[responses.length - 1]!;

    expect(lastResponse.status).toBe(429);

    const body = await lastResponse.json() as { error: string };

    expect(body.error).toContain("Too many requests");
    expect(lastResponse.headers.get("Retry-After")).toBeTruthy();
  });

  it("shares rate limit budget across all mutation methods (POST, PATCH, PUT, DELETE)", async () => {
    const store = createRateLimitStore();
    const handlers = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        BETTER_AUTH_SECRET: "test-secret-for-rate-limit-tests-1234567890"
      },
      rateLimitStore: store
    });

    const ip = "10.0.0.99";

    // Send 5 of each mutation method (20 total = auth tier limit)
    for (let i = 0; i < 5; i++) {
      await handlers.POST(new Request("https://tax.example/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email: "test@example.com", password: "password" })
      }));
    }

    for (let i = 0; i < 5; i++) {
      await handlers.PATCH(new Request("https://tax.example/api/auth/update-user", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ name: "New" })
      }));
    }

    for (let i = 0; i < 5; i++) {
      await handlers.PUT(new Request("https://tax.example/api/auth/update-user", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ name: "New" })
      }));
    }

    for (let i = 0; i < 5; i++) {
      await handlers.DELETE(new Request("https://tax.example/api/auth/delete-user", {
        method: "DELETE",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({})
      }));
    }

    // 21st mutation request should be rate-limited regardless of method
    const response = await handlers.POST(new Request("https://tax.example/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: "test@example.com", password: "password" })
    }));

    expect(response.status).toBe(429);
  });

  it("does not rate limit GET requests", async () => {
    const store = createRateLimitStore();
    const handlers = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        BETTER_AUTH_SECRET: "test-secret-for-rate-limit-tests-1234567890"
      },
      rateLimitStore: store
    });

    const makeRequest = () => new Request("https://tax.example/api/auth/get-session", {
      method: "GET",
      headers: { "x-forwarded-for": "10.0.0.1" }
    });

    // Send many GET requests — they should not be rate limited
    const responses: Response[] = [];

    for (let i = 0; i < 25; i++) {
      responses.push(await handlers.GET(makeRequest()));
    }

    // None should be 429
    const rateLimited = responses.filter((r) => r.status === 429);

    expect(rateLimited.length).toBe(0);
  });

  it("bypasses rate limiting in self-host mode", async () => {
    const store = createRateLimitStore();
    const handlers = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
      },
      rateLimitStore: store
    });

    const makeRequest = () => new Request("https://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.1"
      },
      body: JSON.stringify({ email: "test@example.com", password: "password" })
    });

    // Send more than the limit — should all succeed (bypassed)
    const responses: Response[] = [];

    for (let i = 0; i < 25; i++) {
      responses.push(await handlers.POST(makeRequest()));
    }

    const rateLimited = responses.filter((r) => r.status === 429);

    expect(rateLimited.length).toBe(0);
  });
});

describe("security: billing checkout rate limiting", () => {
  it("returns 429 after exceeding checkout request limit", async () => {
    const store = createRateLimitStore();
    const { POST } = createHostedBillingCheckoutRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_BILLING_MODE: "test",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "hosted-auth-secret-for-tests-1234567890"
      },
      now: "2026-03-26T00:00:00.000Z",
      rateLimitStore: store
    });

    const makeRequest = () => new Request("https://tax.example/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.2"
      },
      body: JSON.stringify({
        planId: "starter",
        successUrl: "https://tax.example/billing/success",
        cancelUrl: "https://tax.example/billing/cancel"
      })
    });

    // API tier allows 100 per minute. Send 101 requests.
    const responses: Response[] = [];

    for (let i = 0; i < 101; i++) {
      responses.push(await POST(makeRequest()));
    }

    const lastResponse = responses[responses.length - 1]!;

    expect(lastResponse.status).toBe(429);

    const body = await lastResponse.json() as { error: string };

    expect(body.error).toContain("Too many requests");
    expect(lastResponse.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("security: provider route rate limiting", () => {
  it("provider workspace route uses tighter provider tier (20/min) and returns 429 after exceeding limit", async () => {
    const { createProviderWorkspaceRouteHandlers } = await import(
      "../../../apps/web/src/lib/provider-workspace-route"
    );

    const store = createRateLimitStore();
    const { POST } = createProviderWorkspaceRouteHandlers({
      env: { TAX_ENGINE_DEPLOYMENT_MODE: "self-host" },
      rateLimitStore: store
    });

    const makeRequest = () => new Request("https://localhost:3000/api/provider/workspace", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.3"
      },
      body: JSON.stringify({ task: "workspace-summary" })
    });

    // Provider tier allows 20/min. Send 21 requests.
    const responses: Response[] = [];

    for (let i = 0; i < 21; i++) {
      responses.push(await POST(makeRequest()));
    }

    const lastResponse = responses[responses.length - 1]!;

    expect(lastResponse.status).toBe(429);

    const body = await lastResponse.json() as { error: string };

    expect(body.error).toContain("Too many requests");
    expect(lastResponse.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("security: workspace route rate limiting", () => {
  it("workspace list route returns 429 after exceeding limit", async () => {
    const { createHostedWorkspaceRouteHandlers } = await import(
      "../../../apps/web/src/lib/hosted-workspace-route"
    );

    const store = createRateLimitStore();
    const handlers = createHostedWorkspaceRouteHandlers({
      env: { TAX_ENGINE_DEPLOYMENT_MODE: "hosted" },
      rateLimitStore: store
    });

    const makeRequest = () => new Request("https://tax.example/api/hosted/workspaces", {
      method: "GET",
      headers: { "x-forwarded-for": "10.0.0.4" }
    });

    const responses: Response[] = [];

    for (let i = 0; i < 101; i++) {
      responses.push(await handlers.list(makeRequest()));
    }

    const lastResponse = responses[responses.length - 1]!;

    expect(lastResponse.status).toBe(429);

    const body = await lastResponse.json() as { error: string };

    expect(body.error).toContain("Too many requests");
    expect(lastResponse.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("security: webhook route rate limiting", () => {
  it("webhook route returns 429 after exceeding limit", async () => {
    const { createHostedBillingWebhookRouteHandlers } = await import(
      "../../../apps/web/src/lib/hosted-billing-webhook"
    );

    const store = createRateLimitStore();
    const { POST } = createHostedBillingWebhookRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        STRIPE_WEBHOOK_SECRET: "test-webhook-secret"
      },
      rateLimitStore: store
    });

    const makeRequest = () => new Request("https://tax.example/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.5"
      },
      body: "{}"
    });

    const responses: Response[] = [];

    for (let i = 0; i < 61; i++) {
      responses.push(await POST(makeRequest()));
    }

    const lastResponse = responses[responses.length - 1]!;

    expect(lastResponse.status).toBe(429);

    const body = await lastResponse.json() as { error: string };

    expect(body.error).toContain("Too many requests");
    expect(lastResponse.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("security: workspace save body size protection", () => {
  it("rejects workspace save with oversized body", async () => {
    const { createHostedWorkspaceRouteHandlers } = await import(
      "../../../apps/web/src/lib/hosted-workspace-route"
    );

    const store = createRateLimitStore();
    const handlers = createHostedWorkspaceRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "test-actor"
      },
      rateLimitStore: store
    });

    const oversizedBody = JSON.stringify({
      workspace: { id: "ws-1", padding: "x".repeat(6 * 1024 * 1024) }
    });

    const response = await handlers.save(
      new Request("https://tax.example/api/hosted/workspaces/ws-1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(oversizedBody.length)
        },
        body: oversizedBody
      }),
      { workspaceId: "ws-1" }
    );

    expect(response.status).toBe(413);

    const body = await response.json() as { error: string };

    expect(body.error).toContain("too large");
  });
});

describe("security: body size protection on provider routes", () => {
  it("provider workspace route rejects oversized JSON body", async () => {
    const { createProviderWorkspaceRouteHandlers } = await import(
      "../../../apps/web/src/lib/provider-workspace-route"
    );

    const { POST } = createProviderWorkspaceRouteHandlers({
      env: { TAX_ENGINE_DEPLOYMENT_MODE: "self-host" }
    });

    const oversizedBody = JSON.stringify({
      padding: "x".repeat(2 * 1024 * 1024)
    });

    const response = await POST(new Request("https://localhost:3000/api/provider/workspace", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(oversizedBody.length)
      },
      body: oversizedBody
    }));

    expect(response.status).toBe(413);

    const body = await response.json() as { error: string };

    expect(body.error).toContain("too large");
  });
});

describe("security: external API call timeout protection", () => {
  it("provider workspace route aborts external fetch that exceeds timeout", async () => {
    const { createProviderWorkspaceResponder } = await import(
      "../../../apps/web/src/lib/provider-workspace-responder"
    );

    let receivedSignal: AbortSignal | undefined;

    const hangingFetch: typeof fetch = async (_url, init) => {
      receivedSignal = init?.signal as AbortSignal | undefined;

      return new Promise<Response>((_resolve, reject) => {
        if (receivedSignal) {
          receivedSignal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }
      });
    };

    const respond = createProviderWorkspaceResponder({
      execution: { mode: "evaluation", syntheticFixtureId: "timeout-fixture", now: () => "2026-10-25T02:00:00Z" },
      env: {
        MODEL_PROVIDER_API_KEY: "test-key-for-timeout-test"
      },
      fetchFn: hangingFetch
    });

    const request = {
      task: "workspace-summary" as const,
      requestId: "timeout-test",
      requestedAt: "2026-03-27T00:00:00.000Z",
      replacementCount: 0,
      redactions: [],
      unsupportedRoutes: [],
      workspace: {
        summary: { totalDocuments: 0 },
        seededReturn: { interviewQuestions: [] },
        returnSummary: { status: "ready-to-recompute" }
      }
    };

    // The responder should catch the abort and still return (via mock fallback or error handling)
    // We verify the signal is passed to fetch
    const resultPromise = respond(request as never);

    // Give the abort time to fire (timeout is 30s in production, but we verify the signal exists)
    // The actual abort will happen via AbortController — we verify the signal is wired
    await Promise.resolve();
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal!.aborted).toBe(false);

    // Manually abort to simulate timeout without waiting 30s
    receivedSignal!.dispatchEvent(new Event("abort"));

    // The promise should reject (since the fetch was aborted), and the route handler catches it
    await expect(resultPromise).rejects.toThrow();
  });

  it("provider workspace route passes AbortSignal to external fetch", async () => {
    const { createProviderWorkspaceResponder } = await import(
      "../../../apps/web/src/lib/provider-workspace-responder"
    );

    let capturedInit: RequestInit | undefined;

    const capturingFetch: typeof fetch = async (_url, init) => {
      capturedInit = init;

      return new Response(JSON.stringify({
        status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
        output_text: JSON.stringify({ sourceIds: ["workspace:status"], summary: "test summary" })
      }), { status: 200 });
    };

    const respond = createProviderWorkspaceResponder({
      execution: { mode: "evaluation", syntheticFixtureId: "timeout-fixture", now: () => "2026-10-25T02:00:00Z" },
      env: {
        MODEL_PROVIDER_API_KEY: "test-key-for-signal-test"
      },
      fetchFn: capturingFetch
    });

    const request = {
      task: "workspace-summary" as const,
      requestId: "signal-test",
      requestedAt: "2026-03-27T00:00:00.000Z",
      replacementCount: 0,
      redactions: [],
      unsupportedRoutes: [],
      workspace: {
        summary: { totalDocuments: 0 },
        seededReturn: { interviewQuestions: [] },
        returnSummary: { status: "ready-to-recompute" }
      }
    };

    await respond(request as never);

    expect(capturedInit).toBeDefined();
    expect(capturedInit!.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("security: provider rate limit tier is stricter than standard API tier", () => {
  it("provider tier allows fewer requests than api tier", () => {
    expect(rateLimitTiers.provider.maxRequests).toBeLessThan(rateLimitTiers.api.maxRequests);
    expect(rateLimitTiers.provider.maxRequests).toBe(20);
  });
});

describe("security: all provider routes use the stricter provider rate limit tier", () => {
  it("provider interview route enforces provider tier (20/min), not api tier (100/min)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "apps/web/src/app/api/provider/interview/route.ts",
      "utf-8"
    );

    expect(source).toContain("rateLimitTiers.provider");
    expect(source).not.toContain("rateLimitTiers.api");
  });

  it("provider export-draft route enforces provider tier (20/min), not api tier (100/min)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "apps/web/src/app/api/provider/export-draft/route.ts",
      "utf-8"
    );

    expect(source).toContain("rateLimitTiers.provider");
    expect(source).not.toContain("rateLimitTiers.api");
  });

  it("provider workspace route also uses provider tier", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "apps/web/src/lib/provider-workspace-route.ts",
      "utf-8"
    );

    expect(source).toContain("rateLimitTiers.provider");
    expect(source).not.toContain("rateLimitTiers.api");
  });
});

describe("security: provider route modules share rate limit stores", () => {
  it("all provider route files import from shared-rate-limit module", async () => {
    const { readFileSync } = await import("node:fs");

    const workspaceRoute = readFileSync(
      "apps/web/src/app/api/provider/workspace/route.ts",
      "utf-8"
    );
    const interviewRoute = readFileSync(
      "apps/web/src/app/api/provider/interview/route.ts",
      "utf-8"
    );
    const exportDraftRoute = readFileSync(
      "apps/web/src/app/api/provider/export-draft/route.ts",
      "utf-8"
    );

    // All three route files should import the shared rate limit store
    expect(workspaceRoute).toContain("shared-rate-limit");
    expect(interviewRoute).toContain("shared-rate-limit");
    expect(exportDraftRoute).toContain("shared-rate-limit");

    // None should create their own stores
    expect(interviewRoute).not.toContain("createRateLimitStore");
    expect(exportDraftRoute).not.toContain("createRateLimitStore");
  });

  it("provider routes use a shared key prefix so limits are enforced across endpoints", async () => {
    const { readFileSync } = await import("node:fs");

    const interviewRoute = readFileSync(
      "apps/web/src/app/api/provider/interview/route.ts",
      "utf-8"
    );
    const exportDraftRoute = readFileSync(
      "apps/web/src/app/api/provider/export-draft/route.ts",
      "utf-8"
    );

    // Both routes should use the same "provider:" key prefix so they share
    // the rate limit budget within the single shared store
    expect(interviewRoute).toContain("`provider:");
    expect(exportDraftRoute).toContain("`provider:");
  });
});

describe("security: workspace route modules share rate limit stores", () => {
  it("workspace route files import from shared-handlers module", async () => {
    const { readFileSync } = await import("node:fs");

    const listRoute = readFileSync(
      "apps/web/src/app/api/hosted/workspaces/route.ts",
      "utf-8"
    );
    const idRoute = readFileSync(
      "apps/web/src/app/api/hosted/workspaces/[id]/route.ts",
      "utf-8"
    );
    const documentsRoute = readFileSync(
      "apps/web/src/app/api/hosted/workspaces/[id]/documents/route.ts",
      "utf-8"
    );

    // All three route files should import from the shared module
    expect(listRoute).toContain("shared-handlers");
    expect(idRoute).toContain("shared-handlers");
    expect(documentsRoute).toContain("shared-handlers");

    // None should create their own handlers
    expect(listRoute).not.toContain("createHostedWorkspaceRouteHandlers");
    expect(idRoute).not.toContain("createHostedWorkspaceRouteHandlers");
    expect(documentsRoute).not.toContain("createHostedWorkspaceRouteHandlers");
  });
});
