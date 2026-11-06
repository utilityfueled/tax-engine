import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  validate: vi.fn(), server: vi.fn(), edge: vi.fn(),
}));
vi.mock("../../../apps/web/src/lib/rate-limit", () => ({ validateHostedRateLimitConfig: hooks.validate }));
vi.mock("../../../apps/web/src/sentry.server.config", () => { hooks.server(); return {}; });
vi.mock("../../../apps/web/src/sentry.edge.config", () => { hooks.edge(); return {}; });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  hooks.validate.mockReset();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("TAX_ENGINE_DEPLOYMENT_MODE", "hosted");
  vi.stubEnv("VERCEL_ENV", "preview");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

// Source contract: nov04-hosted-runtime-identity-source-audit/source-contract-before-tests.json.
// These local observations never establish a hosted deployment's runtime identity.
describe("hosted Preview startup runtime privacy", () => {
  it("reports observed built-ins only after validation without copying environment or unrelated versions", async () => {
    const secret = "synthetic-credential-not-for-log";
    vi.stubEnv("DATABASE_URL", secret);
    vi.stubEnv("VERCEL_URL", secret);
    vi.stubEnv("SMTP_PASSWORD", secret);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { register } = await import("../../../apps/web/src/instrumentation");
    await register();
    expect(hooks.validate).toHaveBeenCalledExactlyOnceWith();
    expect(hooks.server).toHaveBeenCalledExactlyOnceWith();
    expect(info).toHaveBeenCalledTimes(1);
    const message: unknown = info.mock.calls[0]?.[0];
    expect(typeof message).toBe("string");
    if (typeof message !== "string") throw new Error("Expected one structured startup record");
    const record: unknown = JSON.parse(message);
    expect(record).toEqual({ event: "hosted-preview-runtime-identity-v1", node: process.versions.node,
      undici: process.versions.undici ?? null, arch: process.arch });
    expect(message).not.toContain(secret);
    expect(message).not.toContain("openssl");
    expect(info.mock.invocationCallOrder[0]).toBeGreaterThan(hooks.validate.mock.invocationCallOrder[0] ?? Infinity);
    expect(hooks.edge).not.toHaveBeenCalled();
  });

  it("records an unavailable bundled Undici as null without substituting installed packages or pins", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.versions, "undici");
    Object.defineProperty(process.versions, "undici", { value: undefined, configurable: true });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const { register } = await import("../../../apps/web/src/instrumentation");
      await register();
      expect(info).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: "hosted-preview-runtime-identity-v1",
        node: process.versions.node, undici: null, arch: process.arch }));
    } finally {
      if (descriptor) Object.defineProperty(process.versions, "undici", descriptor);
      else Reflect.deleteProperty(process.versions, "undici");
    }
  });

  it.each([
    { label: "self-host Preview", mode: "self-host", stage: "preview", runtime: "nodejs" },
    { label: "missing hosted mode", mode: undefined, stage: "preview", runtime: "nodejs" },
    { label: "production", mode: "hosted", stage: "production", runtime: "nodejs" },
    { label: "development", mode: "hosted", stage: "development", runtime: "nodejs" },
    { label: "unknown deployment stage", mode: "hosted", stage: undefined, runtime: "nodejs" },
    { label: "noncanonical Preview stage", mode: "hosted", stage: "Preview", runtime: "nodejs" },
    { label: "unknown runtime", mode: "hosted", stage: "preview", runtime: undefined },
  ])("does not publish an identity record for $label", async ({ mode, stage, runtime }) => {
    vi.stubEnv("TAX_ENGINE_DEPLOYMENT_MODE", mode);
    vi.stubEnv("VERCEL_ENV", stage);
    vi.stubEnv("NEXT_RUNTIME", runtime);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { register } = await import("../../../apps/web/src/instrumentation");
    await register();
    expect(info).not.toHaveBeenCalled();
  });

  it("propagates validation failure without logging the private error or a successful-start record", async () => {
    const failure = new Error("synthetic-private-validation-details");
    hooks.validate.mockImplementation(() => { throw failure; });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { register } = await import("../../../apps/web/src/instrumentation");
    await expect(register()).rejects.toBe(failure);
    expect(info).not.toHaveBeenCalled();
    expect(hooks.server).not.toHaveBeenCalled();
    expect(hooks.edge).not.toHaveBeenCalled();
  });

  it("keeps Edge registration separate and silent", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { register } = await import("../../../apps/web/src/instrumentation");
    await register();
    expect(hooks.edge).toHaveBeenCalledExactlyOnceWith();
    expect(hooks.validate).not.toHaveBeenCalled();
    expect(hooks.server).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("does not publish runtime fields in the public health response", async () => {
    const { GET } = await import("../../../apps/web/src/app/api/health/route");
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
