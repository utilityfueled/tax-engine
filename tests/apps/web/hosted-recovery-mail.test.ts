import { describe, expect, it, vi } from "vitest";
import { getHostedRecoveryMailConfig, sendHostedRecoveryMail } from "@/lib/hosted-recovery-mail";

const environment = {
  NODE_ENV: "production", TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_APP_URL: "https://tax.example",
  TAX_ENGINE_AUTH_SMTP_HOST: "smtp.example", TAX_ENGINE_AUTH_SMTP_PORT: "587",
  TAX_ENGINE_AUTH_SMTP_USER: "synthetic-smtp-user", TAX_ENGINE_AUTH_SMTP_PASSWORD: "synthetic-smtp-password",
  TAX_ENGINE_AUTH_MAIL_FROM: "recovery@tax.example",
};
const message = { email: "synthetic@example.test", token: "SyntheticResetToken123456" };

describe("hosted password recovery delivery", () => {
  it("requires complete hosted delivery configuration and preserves TLS verification", () => {
    expect(getHostedRecoveryMailConfig(environment)).toMatchObject({ host: "smtp.example", port: 587, secure: false, requireTLS: true });
    expect(getHostedRecoveryMailConfig({ ...environment, TAX_ENGINE_AUTH_SMTP_PORT: "465" })).toMatchObject({ secure: true, requireTLS: true });
    for (const field of ["TAX_ENGINE_AUTH_SMTP_HOST", "TAX_ENGINE_AUTH_SMTP_PORT", "TAX_ENGINE_AUTH_SMTP_USER", "TAX_ENGINE_AUTH_SMTP_PASSWORD", "TAX_ENGINE_AUTH_MAIL_FROM"]) {
      expect(getHostedRecoveryMailConfig({ ...environment, [field]: "" }), field).toBeNull();
    }
    for (const changed of [
      { TAX_ENGINE_DEPLOYMENT_MODE: "self-host" }, { TAX_ENGINE_AUTH_SMTP_HOST: "smtp://user:secret@smtp.example" },
      { TAX_ENGINE_AUTH_SMTP_PORT: "587x" }, { TAX_ENGINE_AUTH_SMTP_PORT: "70000" },
      { TAX_ENGINE_AUTH_MAIL_FROM: "recovery@tax.example\r\nBcc: another@example.test" },
      { TAX_ENGINE_AUTH_MAIL_FROM: "First <one@example.test>, second@example.test" },
      { TAX_ENGINE_APP_URL: "http://tax.example" }, { TAX_ENGINE_AUTH_SMTP_ALLOW_INSECURE_LOOPBACK: "true" },
    ]) expect(getHostedRecoveryMailConfig({ ...environment, ...changed })).toBeNull();
  });

  it("allows plaintext only for explicit nonproduction loopback mail and application tests", () => {
    const local = { ...environment, NODE_ENV: "test", TAX_ENGINE_APP_URL: "http://127.0.0.1:3107", TAX_ENGINE_AUTH_SMTP_HOST: "127.0.0.1", TAX_ENGINE_AUTH_SMTP_PORT: "2525", TAX_ENGINE_AUTH_SMTP_ALLOW_INSECURE_LOOPBACK: "true" };
    expect(getHostedRecoveryMailConfig(local)).toMatchObject({ secure: false, requireTLS: false });
    for (const changed of [{ NODE_ENV: "production" }, { TAX_ENGINE_AUTH_SMTP_HOST: "mail.example" }, { TAX_ENGINE_APP_URL: "http://tax.example" }]) {
      expect(getHostedRecoveryMailConfig({ ...local, ...changed })).toBeNull();
    }
  });

  it("sends one fixed plain-text recovery message with the token only in a same-origin fragment", async () => {
    const sendMail = vi.fn(async () => ({ accepted: [message.email], rejected: [] }));
    const close = vi.fn(); const createTransport = vi.fn(() => ({ sendMail, close }));
    await sendHostedRecoveryMail(message, environment, { createTransport });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.example", port: 587, secure: false, requireTLS: true, logger: false, debug: false,
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true }, disableFileAccess: true, disableUrlAccess: true,
    }));
    const sent = sendMail.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(sent).toMatchObject({ from: "recovery@tax.example", to: message.email, subject: "Reset your Viva La Tax password" });
    const link = String(sent.text).match(/https:\/\/\S+/)?.[0];
    expect(link).toBe(`https://tax.example/account/recover#token=${message.token}`);
    expect(new URL(String(link)).search).toBe("");
    expect(sent).not.toHaveProperty("html"); expect(sent).not.toHaveProperty("attachments");
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects invalid recipient or token before creating a connection", async () => {
    const createTransport = vi.fn();
    for (const changed of [{ email: "one@example.test,two@example.test" }, { email: "one@example.test\r\nBcc:x@example.test" }, { token: "" }, { token: "a/b?secret=true" }]) {
      await expect(sendHostedRecoveryMail({ ...message, ...changed }, environment, { createTransport })).rejects.toThrow("Account recovery delivery is unavailable.");
    }
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("contains transport failures and closes rejected or stalled delivery without exposing secrets", async () => {
    for (const sendMail of [
      vi.fn(async () => { throw new Error("smtp://private-user:private-password@private-host recipient@example.test token-secret"); }),
      vi.fn(async () => ({ accepted: [], rejected: [message.email] })),
      vi.fn(async () => ({ accepted: ["someone-else@example.test"], rejected: [] })),
    ]) {
      const close = vi.fn();
      await expect(sendHostedRecoveryMail(message, environment, { createTransport: () => ({ sendMail, close }) })).rejects.toThrow("Account recovery delivery is unavailable.");
      expect(close).toHaveBeenCalledOnce();
    }
    vi.useFakeTimers();
    try {
      const close = vi.fn();
      const pending = sendHostedRecoveryMail(message, environment, { createTransport: () => ({ sendMail: () => new Promise(() => {}), close }) });
      const assertion = expect(pending).rejects.toThrow("Account recovery delivery is unavailable.");
      await vi.advanceTimersByTimeAsync(15_001); await assertion;
      expect(close).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});
