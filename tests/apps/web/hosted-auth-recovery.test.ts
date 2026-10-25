import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHostedAuthForTests, createHostedAuthRouteHandlers, getHostedAuthConfig, resetHostedAuthRuntimeCachesForTests } from "@/lib/hosted-auth";
import { createRateLimitStore } from "@/lib/rate-limit";

const env = { NODE_ENV: "test", TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_APP_URL: "https://tax.example",
  BETTER_AUTH_SECRET: "synthetic-recovery-secret-with-more-than-32-bytes",
  TAX_ENGINE_AUTH_SMTP_HOST: "smtp.example", TAX_ENGINE_AUTH_SMTP_PORT: "587",
  TAX_ENGINE_AUTH_SMTP_USER: "synthetic", TAX_ENGINE_AUTH_SMTP_PASSWORD: "synthetic",
  TAX_ENGINE_AUTH_MAIL_FROM: "recovery@tax.example" };
const token = "SyntheticResetToken123456";
function request(path: string, body: unknown, ip = "192.0.2.1") {
  return new Request(`https://tax.example/api/auth/${path}`, { method: "POST",
    headers: { "content-type": "application/json", origin: "https://tax.example", "x-real-ip": ip }, body: JSON.stringify(body) });
}

beforeEach(() => resetHostedAuthRuntimeCachesForTests());
describe("hosted account recovery security boundary", () => {
  it("enables single-use short-lived recovery with session revocation and retained background delivery", async () => {
    const createAuthInstance = vi.fn(() => ({ handler: vi.fn() }));
    const scheduleBackgroundTask = vi.fn(); const sendRecoveryMail = vi.fn(async () => {});
    await createHostedAuthForTests(getHostedAuthConfig(env), env, { createAuthInstance, scheduleBackgroundTask, sendRecoveryMail } as never);
    const options = createAuthInstance.mock.calls[0]?.[0] as unknown as {
      emailAndPassword: { resetPasswordTokenExpiresIn: number; revokeSessionsOnPasswordReset: boolean; sendResetPassword: (data: unknown) => Promise<void> },
      advanced: { backgroundTasks: { handler: (task: Promise<void>) => void } }, logger: { disabled: boolean }, verification: { storeIdentifier: string }
    };
    expect(options.emailAndPassword.resetPasswordTokenExpiresIn).toBe(900);
    expect(options.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
    expect(options.logger.disabled).toBe(true);
    expect(options.verification.storeIdentifier).toBe("hashed");
    await options.emailAndPassword.sendResetPassword({ user: { email: "synthetic@example.test", name: "Private Name" }, token, url: "https://attacker.example/ignored" });
    expect(sendRecoveryMail).toHaveBeenCalledWith({ email: "synthetic@example.test", token }, env);
    const task = Promise.resolve(); options.advanced.backgroundTasks.handler(task);
    expect(scheduleBackgroundTask).toHaveBeenCalledWith(task);
  });

  it("does not cache a disabled delivery configuration after credentials are supplied", async () => {
    const createAuthInstance = vi.fn(() => ({ handler: vi.fn() }));
    const withoutMail = { ...env, TAX_ENGINE_AUTH_SMTP_HOST: "" };
    await createHostedAuthForTests(getHostedAuthConfig(withoutMail), withoutMail, { createAuthInstance } as never);
    await createHostedAuthForTests(getHostedAuthConfig(env), env, { createAuthInstance } as never);
    expect(createAuthInstance).toHaveBeenCalledTimes(2);
    expect((createAuthInstance.mock.calls[0]?.[0] as unknown as { emailAndPassword: object }).emailAndPassword).not.toHaveProperty("sendResetPassword");
  });

  it("forces the configured reset destination, retains cookies and removes private response caching", async () => {
    const handler = vi.fn(async () => new Response(JSON.stringify({ message: "generic" }), { headers: [["set-cookie", "first=value; HttpOnly"], ["set-cookie", "second=value; HttpOnly"]] }));
    const POST = createHostedAuthRouteHandlers({ env, rateLimitStore: createRateLimitStore(), authFactory: async () => ({ handler }) } as never).POST;
    const response = await POST(request("request-password-reset", { email: "synthetic@example.test", redirectTo: "https://attacker.example/steal" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.getSetCookie()).toHaveLength(2);
    const forwarded = await (handler.mock.calls[0]?.[0] as unknown as Request).json();
    expect(forwarded).toEqual({ email: "synthetic@example.test", redirectTo: "https://tax.example/account/recover" });
  });

  it("limits the same recipient across IP changes using a keyed opaque identifier", async () => {
    const store = createRateLimitStore(); const handler = vi.fn(async () => new Response("{}"));
    const POST = createHostedAuthRouteHandlers({ env, rateLimitStore: store, authFactory: async () => ({ handler }) } as never).POST;
    for (let i = 0; i < 3; i++) expect((await POST(request("request-password-reset", { email: "synthetic@example.test" }, `192.0.2.${i + 1}`))).status).toBe(200);
    const response = await POST(request("request-password-reset", { email: "SYNTHETIC@example.test" }, "192.0.2.9"));
    expect(response.status).toBe(429);
    expect(handler).toHaveBeenCalledTimes(3);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(Array.from(store.keys()).join(" ")).not.toContain("synthetic");
  });

  it("rejects malformed, oversized, query-token and unconfigured recovery before invoking auth", async () => {
    const handler = vi.fn(async () => new Response("{}"));
    const routes = createHostedAuthRouteHandlers({ env, rateLimitStore: createRateLimitStore(), authFactory: async () => ({ handler }) } as never);
    for (const [path, body] of [["request-password-reset", { email: "bad,email@example.test" }],
      ["reset-password?token=" + token, { newPassword: "Synthetic valid password" }],
      ["reset-password", { token, newPassword: "short" }],
      ["request-password-reset", { email: "synthetic@example.test", padding: "x".repeat(9000) }]] as const) {
      const response = await routes.POST(request(path, body));
      expect([400, 413]).toContain(response.status);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    const missing = createHostedAuthRouteHandlers({ env: { ...env, TAX_ENGINE_AUTH_SMTP_PASSWORD: "" }, authFactory: async () => ({ handler }) } as never);
    expect((await missing.POST(request("request-password-reset", { email: "synthetic@example.test" }))).status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it("contains database and auth errors without returning private diagnostics", async () => {
    const routes = createHostedAuthRouteHandlers({ env, rateLimitStore: createRateLimitStore(), authFactory: async () => { throw new Error("postgres://private:password@host/synthetic@example.test"); } } as never);
    const response = await routes.POST(request("reset-password", { token, newPassword: "Synthetic valid password" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/postgres|password@|synthetic@/);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects cross-origin and legacy URL-token routes before auth and fails closed without shared protection", async () => {
    const handler = vi.fn(async () => new Response("{}"));
    const routes = createHostedAuthRouteHandlers({ env, rateLimitStore: createRateLimitStore(), authFactory: async () => ({ handler }) } as never);
    const foreign = request("request-password-reset", { email: "synthetic@example.test" });
    foreign.headers.set("origin", "https://attacker.example");
    expect((await routes.POST(foreign)).status).toBe(403);
    expect((await routes.GET(new Request(`https://tax.example/api/auth/reset-password/${token}?callbackURL=https://attacker.example`))).status).toBe(404);
    const cancelled = new AbortController(); cancelled.abort();
    expect((await routes.POST(new Request(request("reset-password", { token, newPassword: "Synthetic password" }), { signal: cancelled.signal }))).status).toBe(499);
    const production = createHostedAuthRouteHandlers({ env: { ...env, NODE_ENV: "production", DATABASE_URL: "postgresql://synthetic:synthetic@localhost:5432/synthetic" }, rateLimitStore: createRateLimitStore(), authFactory: async () => ({ handler }) } as never);
    const unavailable = await production.POST(request("request-password-reset", { email: "synthetic@example.test" }));
    expect(unavailable.status).toBe(503); expect(await unavailable.text()).toContain("Request protection");
    expect(handler).not.toHaveBeenCalled();
  });
});
