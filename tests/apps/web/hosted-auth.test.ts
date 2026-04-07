import { describe, expect, it, vi } from "vitest";
import {
  createHostedAuthForTests,
  createHostedAuthRouteHandlers,
  getHostedAuthConfig,
  resetHostedAuthRuntimeCachesForTests
} from "../../../apps/web/src/lib/hosted-auth";

describe("hosted auth", () => {
  it("enables the Better Auth preview route only in hosted mode", () => {
    const hostedConfig = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_APP_URL: "https://tax.example",
      BETTER_AUTH_SECRET: "hosted-auth-secret-for-tests-1234567890"
    });
    const selfHostConfig = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
    });

    expect(hostedConfig).toMatchObject({
      deploymentMode: "hosted",
      provider: "better-auth",
      mode: "preview",
      routeEnabled: true,
      basePath: "/api/auth",
      sessionPath: "/api/auth/get-session",
      secretSource: "env"
    });
    expect(hostedConfig.trustedOrigins).toEqual(["https://tax.example"]);
    expect(selfHostConfig).toMatchObject({
      deploymentMode: "self-host",
      provider: "better-auth",
      mode: "disabled",
      routeEnabled: false,
      basePath: "/api/auth",
      sessionPath: "/api/auth/get-session",
      secretSource: "preview-fallback"
    });
  });

  it("uses the preview fallback secret in hosted mode only when BETTER_AUTH_SECRET is unset", () => {
    const config = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_APP_URL: "https://tax.example",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://tax.example, https://preview.tax.example/path "
    });

    expect(config.secretSource).toBe("preview-fallback");
    expect(config.trustedOrigins).toEqual([
      "https://tax.example",
      "https://preview.tax.example"
    ]);
  });

  it("delegates hosted get-session requests through the Better Auth route", async () => {
    const { GET } = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "hosted-auth-secret-for-tests-1234567890"
      }
    });

    const response = await GET(new Request("https://tax.example/api/auth/get-session"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.text()).resolves.toBe("null");
  });

  it("bypasses hosted auth requests entirely in self-host mode", async () => {
    const { GET } = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
      }
    });

    const response = await GET(new Request("http://localhost:3000/api/auth/get-session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      provider: "better-auth",
      mode: "disabled",
      path: "get-session",
      bypassed: true,
      message: "Self-host deployment bypasses hosted account auth."
    });
  });

  it("wires the app route module to the hosted Better Auth handler", async () => {
    const originalMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    const originalUrl = process.env.TAX_ENGINE_APP_URL;
    const originalSecret = process.env.BETTER_AUTH_SECRET;

    vi.resetModules();
    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "hosted";
    process.env.TAX_ENGINE_APP_URL = "https://tax.example";
    process.env.BETTER_AUTH_SECRET = "hosted-auth-secret-for-tests-1234567890";

    try {
      const routeModule = await import("../../../apps/web/src/app/api/auth/[...all]/route");
      const response = await routeModule.GET(new Request("https://tax.example/api/auth/get-session"));

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe("null");
    } finally {
      vi.resetModules();

      if (originalMode === undefined) {
        delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;
      } else {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalMode;
      }

      if (originalUrl === undefined) {
        delete process.env.TAX_ENGINE_APP_URL;
      } else {
        process.env.TAX_ENGINE_APP_URL = originalUrl;
      }

      if (originalSecret === undefined) {
        delete process.env.BETTER_AUTH_SECRET;
      } else {
        process.env.BETTER_AUTH_SECRET = originalSecret;
      }
    }
  });

  it("retries hosted auth initialization after a transient startup failure", async () => {
    resetHostedAuthRuntimeCachesForTests();

    const env = {
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_APP_URL: "https://tax.example",
      BETTER_AUTH_SECRET: "hosted-auth-secret-for-tests-1234567890",
      DATABASE_URL: "postgres://tax_engine:test@localhost:5432/tax_engine"
    };
    const config = getHostedAuthConfig(env);
    const createAuthInstance = vi.fn(() => ({
      api: {
        getSession: vi.fn(async () => null)
      }
    }));
    const ensureAuthSchema = vi.fn();
    const getServerDatabase = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary database outage"))
      .mockResolvedValue({
        db: {} as never,
        pool: {} as never
      });

    await expect(createHostedAuthForTests(config, env, {
      createAuthInstance,
      ensureAuthSchema,
      getServerDatabase
    })).rejects.toThrow("temporary database outage");

    await expect(createHostedAuthForTests(config, env, {
      createAuthInstance,
      ensureAuthSchema,
      getServerDatabase
    })).resolves.toMatchObject({
      api: {
        getSession: expect.any(Function)
      }
    });

    expect(getServerDatabase).toHaveBeenCalledTimes(2);
    expect(createAuthInstance).toHaveBeenCalledTimes(1);
  });
});
