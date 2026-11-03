// Spec: federal/hosted-preview-recovery-origin.yaml. No actual SMTP/provider calls.
import { describe, expect, it, vi } from "vitest";
import { getHostedRecoveryMailConfig, sendHostedRecoveryMail } from "@/lib/hosted-recovery-mail";
import { resolveHostedAppBaseUrl } from "@/lib/hosted-runtime-safety";

const hostname = "tax-engine-synthetic-recovery.example-team.vercel.app";
const previewOrigin = `https://${hostname}`;
const environment = {
  NODE_ENV: "production", TAX_ENGINE_DEPLOYMENT_MODE: "hosted", VERCEL_ENV: "preview",
  VERCEL_URL: hostname, TAX_ENGINE_APP_URL: "https://staging.example.test",
  TAX_ENGINE_AUTH_SMTP_HOST: "smtp.example.test", TAX_ENGINE_AUTH_SMTP_PORT: "587",
  TAX_ENGINE_AUTH_SMTP_USER: "synthetic-preview-user", TAX_ENGINE_AUTH_SMTP_PASSWORD: "synthetic-preview-password",
  TAX_ENGINE_AUTH_MAIL_FROM: "recovery@example.test",
};
const message = { email: "synthetic-recipient@example.test", token: "SyntheticPreviewRecoveryToken123456" };
const deliveryError = "Account recovery delivery is unavailable.";

describe("Preview recovery origin parity", () => {
  it.each([
    "https://staging.example.test", "https://production.example.test", undefined,
    "https://unused.example.test/private?unused=true#unused",
  ])("uses the validated Preview origin despite the unused configured URL: %s", configuredUrl => {
    const env = { ...environment, TAX_ENGINE_APP_URL: configuredUrl };
    const before = { ...env };
    expect(resolveHostedAppBaseUrl(env)).toEqual({ appBaseUrl: previewOrigin, blocked: false, hasValidConfiguredUrl: true });
    expect(getHostedRecoveryMailConfig(env)).toMatchObject({ appOrigin: previewOrigin, requireTLS: true });
    expect(env).toEqual(before);
  });

  it("sends the actual recovery fragment on exactly the selected Preview origin", async () => {
    const sent: Array<{ from: string; to: string; subject: string; text: string }> = [];
    const sendMail = vi.fn(async (value: typeof sent[number]) => {
      sent.push(value); return { accepted: [message.email], rejected: [] };
    });
    const close = vi.fn();
    const createTransport = vi.fn(() => ({ sendMail, close }));
    const beforeEnv = { ...environment }, beforeMessage = { ...message };
    await sendHostedRecoveryMail(message, environment, { createTransport });
    expect(createTransport).toHaveBeenCalledOnce();
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      secure: false, requireTLS: true, ignoreTLS: false, logger: false, debug: false,
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true }, disableFileAccess: true, disableUrlAccess: true,
    }));
    expect(sent).toHaveLength(1);
    const mail = sent[0]; if (!mail) throw new Error("The actual captured message is missing");
    expect(mail.from).toBe(environment.TAX_ENGINE_AUTH_MAIL_FROM);
    expect(mail.to).toBe(message.email);
    expect(mail.subject).toBe("Reset your Viva La Tax password");
    const link = mail.text.match(/https:\/\/\S+/u)?.[0];
    expect(link).toBe(`${previewOrigin}/account/recover#token=${message.token}`);
    if (!link) throw new Error("The actual recovery link is missing");
    const parsed = new URL(link);
    expect(parsed.origin).toBe(resolveHostedAppBaseUrl(environment).appBaseUrl);
    expect(parsed.pathname).toBe("/account/recover"); expect(parsed.search).toBe("");
    expect(parsed.hash).toBe(`#token=${message.token}`);
    expect(mail.text).not.toContain(environment.TAX_ENGINE_APP_URL);
    expect(mail).not.toHaveProperty("html"); expect(mail).not.toHaveProperty("attachments");
    expect(close).toHaveBeenCalledOnce();
    expect(environment).toEqual(beforeEnv); expect(message).toEqual(beforeMessage);
  });

  it.each([
    undefined, "", " ", "https://preview.vercel.app", "preview.vercel.app/", "preview.vercel.app/path",
    "preview.vercel.app?secret=private", "preview.vercel.app#private", "preview.vercel.app:443",
    "owner@preview.vercel.app", "*.vercel.app", "vercel.app", "preview.vercel.app.attacker.test",
    "localhost", "127.0.0.1", "preview..vercel.app", "-preview.vercel.app", "preview-.vercel.app",
    "preview\n.vercel.app", "preview.vercel.app.", "préview.vercel.app",
  ])("blocks invalid Preview metadata before any SMTP transport: %s", async metadata => {
    for (const nodeEnv of ["production", "development"]) {
      const env = { ...environment, NODE_ENV: nodeEnv, VERCEL_URL: metadata };
      const sendMail = vi.fn(async () => ({ accepted: [message.email], rejected: [] }));
      const createTransport = vi.fn(() => ({ sendMail, close: vi.fn() }));
      expect(resolveHostedAppBaseUrl(env).blocked).toBe(true);
      expect(getHostedRecoveryMailConfig(env)).toBeNull();
      await expect(sendHostedRecoveryMail(message, env, { createTransport })).rejects.toThrow(deliveryError);
      expect(createTransport).not.toHaveBeenCalled(); expect(sendMail).not.toHaveBeenCalled();
    }
  });

  it.each(["production", "development", undefined, "PREVIEW"])(
    "preserves configured recovery origin outside exact Preview: %s", value => {
      const env = { ...environment, VERCEL_ENV: value, VERCEL_URL: "invalid-metadata" };
      expect(getHostedRecoveryMailConfig(env)).toMatchObject({ appOrigin: environment.TAX_ENGINE_APP_URL });
    },
  );

  it.each([
    { TAX_ENGINE_APP_URL: "https://user:secret@app.example.test" },
    { TAX_ENGINE_APP_URL: "https://app.example.test/path" },
    { TAX_ENGINE_APP_URL: "https://app.example.test?private=true" },
    { TAX_ENGINE_APP_URL: "https://app.example.test#private" },
    { TAX_ENGINE_APP_URL: "http://app.example.test" },
    { TAX_ENGINE_AUTH_SMTP_ALLOW_INSECURE_LOOPBACK: "true" },
  ])("preserves existing recovery URL and TLS boundaries: %s", patch => {
    expect(getHostedRecoveryMailConfig({ ...environment, VERCEL_ENV: "production", ...patch })).toBeNull();
  });

  it("preserves explicit nonproduction loopback while denying insecure Preview delivery", () => {
    const local = { ...environment, NODE_ENV: "test", VERCEL_ENV: undefined,
      TAX_ENGINE_APP_URL: "http://127.0.0.1:3107", TAX_ENGINE_AUTH_SMTP_HOST: "127.0.0.1",
      TAX_ENGINE_AUTH_SMTP_PORT: "2525", TAX_ENGINE_AUTH_SMTP_ALLOW_INSECURE_LOOPBACK: "true" };
    expect(getHostedRecoveryMailConfig(local)).toMatchObject({ appOrigin: "http://127.0.0.1:3107", requireTLS: false });
    expect(getHostedRecoveryMailConfig({ ...local, VERCEL_ENV: "preview" })).toBeNull();
  });

  it("normalizes the existing resolver hostname case without inventing another origin", () => {
    const env = { ...environment, VERCEL_URL: hostname.toUpperCase() };
    expect(getHostedRecoveryMailConfig(env)?.appOrigin).toBe(resolveHostedAppBaseUrl(env).appBaseUrl);
    expect(getHostedRecoveryMailConfig(env)?.appOrigin).toBe(previewOrigin);
  });

  it("keeps blocked Preview failures private without mutating caller facts", async () => {
    const env = { ...environment, VERCEL_URL: "private-user:private-password@preview.vercel.app" };
    const beforeEnv = { ...env }, beforeMessage = { ...message }, createTransport = vi.fn();
    const spies = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
    try {
      await expect(sendHostedRecoveryMail(message, env, { createTransport })).rejects.toThrow(deliveryError);
      expect(createTransport).not.toHaveBeenCalled();
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      expect(env).toEqual(beforeEnv); expect(message).toEqual(beforeMessage);
    } finally { for (const spy of spies) spy.mockRestore(); }
  });

  it.each([undefined, "not-a-url?private=synthetic", "ftp://private-user:private-password@private-host"])(
    "preserves silent rejection of invalid non-Preview development URLs: %s", value => {
      const env = { ...environment, NODE_ENV: "development", VERCEL_ENV: undefined, TAX_ENGINE_APP_URL: value };
      const spies = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
      try {
        expect(getHostedRecoveryMailConfig(env)).toBeNull();
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      } finally { for (const spy of spies) spy.mockRestore(); }
    },
  );
});
