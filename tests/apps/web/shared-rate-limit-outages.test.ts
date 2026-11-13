vi.mock("server-only", () => ({}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimitForEnvironment, createRateLimitStore, rateLimitUnavailableResponse,
  validateHostedRateLimitConfig
} from "../../../apps/web/src/lib/rate-limit";
import { createProviderWorkspaceRouteHandlers } from "../../../apps/web/src/lib/provider-workspace-route";

const redisLimit = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/web/node_modules/@upstash/redis", () => ({ Redis: class {} }));
vi.mock("../../../apps/web/node_modules/@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() { return {}; }
    limit = redisLimit;
  }
}));

const hosted = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production" };
const redisEnv = {
  ...hosted, UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "test-token",
  BETTER_AUTH_SECRET: "shared-test-secret-with-enough-entropy"
};
const config = { maxRequests: 2, windowMs: 60_000 };

beforeEach(() => { redisLimit.mockReset(); });

describe("hosted shared rate-limit outage policy", () => {
  it.each([hosted, { ...hosted, UPSTASH_REDIS_REST_URL: "https://redis.example" }])(
    "blocks missing or partial shared configuration without using local memory", async (env) => {
      const store = createRateLimitStore();
      expect(() => validateHostedRateLimitConfig(env)).toThrow("requires shared rate limits");
      expect(await checkRateLimitForEnvironment(store, "actor", config, env)).toMatchObject({ allowed: false, unavailable: true });
      expect(store.get("actor")).toBeUndefined();
      expect(redisLimit).not.toHaveBeenCalled();
    }
  );

  it("fails closed on Redis errors across independent process-local stores", async () => {
    redisLimit.mockRejectedValue(new Error("unreachable"));
    const stores = [createRateLimitStore(), createRateLimitStore()];
    const results = await Promise.all(stores.map(store => checkRateLimitForEnvironment(store, "actor", config, redisEnv)));
    expect(results.every(result => !result.allowed && result.unavailable)).toBe(true);
    expect(stores.every(store => store.get("actor") === undefined)).toBe(true);
  });

  it("rejects the provider's fail-open timeout response", async () => {
    redisLimit.mockResolvedValue({ success: true, reason: "timeout", remaining: 2, reset: Date.now(), pending: Promise.resolve() });
    expect(await checkRateLimitForEnvironment(createRateLimitStore(), "actor", config, redisEnv)).toMatchObject({ allowed: false, unavailable: true });
  });

  it("uses the shared decision and recovers after an outage", async () => {
    const store = createRateLimitStore();
    redisLimit.mockRejectedValueOnce(new Error("outage")).mockResolvedValueOnce({ success: true, remaining: 1, reset: 2000, pending: Promise.resolve() });
    expect((await checkRateLimitForEnvironment(store, "actor", config, redisEnv, 1000)).allowed).toBe(false);
    expect(await checkRateLimitForEnvironment(store, "actor", config, redisEnv, 1000)).toEqual({ allowed: true, remaining: 1, retryAfterMs: null });
    expect(redisLimit).toHaveBeenCalledTimes(2);
  });

  it("uses stable pseudonyms across workers and separates routes and deployments", async () => {
    redisLimit.mockResolvedValue({ success: true, remaining: 1, reset: 2000, pending: Promise.resolve() });
    const key = "workspace:198.51.100.23";
    const alternative = { ...redisEnv, BETTER_AUTH_SECRET: "another-independent-deployment-secret" };
    const requests = [
      [key, redisEnv],
      [key, redisEnv],
      ["auth:198.51.100.23", redisEnv],
      ["workspace:198.51.100.24", redisEnv],
      [key, alternative]
    ] as const;
    for (const [identifier, env] of requests) {
      expect((await checkRateLimitForEnvironment(createRateLimitStore(), identifier, config, env)).allowed).toBe(true);
    }

    const identifiers = redisLimit.mock.calls.map(([value]) => value);
    expect(identifiers).toHaveLength(5);
    expect(identifiers.every(value => /^v1:[0-9a-f]{64}$/.test(value))).toBe(true);
    expect(identifiers[0]).toBe(identifiers[1]);
    expect(new Set(identifiers).size).toBe(4);
  });

  it("blocks configured Redis without the app-side secret before sending an identifier", async () => {
    const env = { ...redisEnv, BETTER_AUTH_SECRET: " " };
    const store = createRateLimitStore();
    expect(() => validateHostedRateLimitConfig(env)).toThrow("BETTER_AUTH_SECRET");
    expect(await checkRateLimitForEnvironment(store, "auth:198.51.100.23", config, env))
      .toMatchObject({ allowed: false, unavailable: true });
    expect(store.size).toBe(0);
    expect(redisLimit).not.toHaveBeenCalled();
  });

  it("distinguishes a shared quota rejection from an outage", async () => {
    redisLimit.mockResolvedValue({ success: false, remaining: 0, reset: 2500, pending: Promise.resolve() });
    expect(await checkRateLimitForEnvironment(createRateLimitStore(), "actor", config, redisEnv, 1000)).toEqual({ allowed: false, remaining: 0, retryAfterMs: 1500 });
  });

  it("keeps self-hosting functional without Redis or AI", async () => {
    const env = { TAX_ENGINE_DEPLOYMENT_MODE: "self-host", NODE_ENV: "production" };
    expect(() => validateHostedRateLimitConfig(env)).not.toThrow();
    const store = createRateLimitStore();
    expect((await checkRateLimitForEnvironment(store, "actor", config, env)).allowed).toBe(true);
    expect((await checkRateLimitForEnvironment(store, "actor", config, env)).allowed).toBe(true);
    expect((await checkRateLimitForEnvironment(store, "actor", config, env)).allowed).toBe(false);
  });

  it("stops paid provider work with a retryable 503", async () => {
    const { POST } = createProviderWorkspaceRouteHandlers({ env: hosted });
    const response = await POST(new Request("https://tax.example/api/provider/workspace", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "rate-limit-unavailable" });
    expect(redisLimit).not.toHaveBeenCalled();
    expect(rateLimitUnavailableResponse().headers.get("Cache-Control")).toBe("no-store");
  });
});
