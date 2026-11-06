import { describe, expect, it, vi } from "vitest";
import { getHostedRecoveryMailConfig, sendHostedRecoveryMail } from "@/lib/hosted-recovery-mail";
function required<T>(value: T | null | undefined): T { if (value === null || value === undefined) throw new Error("Expected actual captured recovery message"); return value; }
const env = { NODE_ENV: "production", TAX_ENGINE_DEPLOYMENT_MODE: "hosted", VERCEL_ENV: "preview", VERCEL_URL: "Tax-Review-AbC.vercel.app", TAX_ENGINE_APP_URL: "https://shared-production.example.test", TAX_ENGINE_AUTH_SMTP_HOST: "smtp.example.test", TAX_ENGINE_AUTH_SMTP_PORT: "587", TAX_ENGINE_AUTH_SMTP_USER: "synthetic-independent-user", TAX_ENGINE_AUTH_SMTP_PASSWORD: "synthetic-independent-password", TAX_ENGINE_AUTH_MAIL_FROM: "support@example.test" };
const message = { email: "owned-synthetic@example.test", token: "IndependentRecoveryToken123456789" };
describe("independent Preview recovery boundary", () => {
  it("uses only normalized platform origin in the actual plain message", async () => {
    const sent: Record<string, unknown>[] = [];
    const close = vi.fn();
    await sendHostedRecoveryMail(message, env, { createTransport: () => ({ sendMail: async value => { sent.push({ ...value }); return { accepted: [message.email], rejected: [] }; }, close }) });
    expect(getHostedRecoveryMailConfig(env)?.appOrigin).toBe("https://tax-review-abc.vercel.app");
    expect(sent).toHaveLength(1);
    const captured = required(sent[0]);
    expect(Object.keys(captured).sort()).toEqual(["from", "subject", "text", "to"]);
    expect(captured).toMatchObject({ from: env.TAX_ENGINE_AUTH_MAIL_FROM, to: message.email, subject: "Reset your Viva La Tax password" });
    const links = String(captured.text).match(/https:\/\/\S+/gu);
    expect(links).toEqual([`https://tax-review-abc.vercel.app/account/recover#token=${message.token}`]);
    const url = new URL(required(required(links)[0]));
    expect(url.search).toBe(""); expect(url.hash).toBe(`#token=${message.token}`);
    for (const secret of [env.TAX_ENGINE_APP_URL, env.TAX_ENGINE_AUTH_SMTP_USER, env.TAX_ENGINE_AUTH_SMTP_PASSWORD]) expect(JSON.stringify(sent)).not.toContain(secret);
    expect(close).toHaveBeenCalledOnce();
  });
  it.each([undefined, "https://tax-review.vercel.app", "tax-review.vercel.app/path", "tax-review.vercel.app\n", ".vercel.app", "tax-review.vercel.app.evil.test", "user@tax-review.vercel.app", "tax-review..vercel.app"])("denies ambiguous platform authority before transport: %s", async host => {
    const createTransport = vi.fn();
    const changed = { ...env, VERCEL_URL: host };
    expect(getHostedRecoveryMailConfig(changed)).toBeNull();
    await expect(sendHostedRecoveryMail(message, changed, { createTransport })).rejects.toThrow("Account recovery delivery is unavailable.");
    expect(createTransport).not.toHaveBeenCalled();
  });
  it("never treats Preview as a plaintext loopback deployment", () => {
    expect(getHostedRecoveryMailConfig({ ...env, NODE_ENV: "development", TAX_ENGINE_APP_URL: "http://127.0.0.1:3107", TAX_ENGINE_AUTH_SMTP_HOST: "127.0.0.1", TAX_ENGINE_AUTH_SMTP_PORT: "2525", TAX_ENGINE_AUTH_SMTP_ALLOW_INSECURE_LOOPBACK: "true" })).toBeNull();
  });
  it("preserves nonpreview origin and silent invalid configuration", () => {
    expect(getHostedRecoveryMailConfig({ ...env, VERCEL_ENV: "production" })?.appOrigin).toBe("https://shared-production.example.test");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(getHostedRecoveryMailConfig({ ...env, VERCEL_ENV: "development", NODE_ENV: "development", TAX_ENGINE_APP_URL: "bad-private-config-secret" })).toBeNull();
      expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); error.mockRestore(); }
  });
});
