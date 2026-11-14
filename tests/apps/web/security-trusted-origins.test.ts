import { afterEach, describe, expect, it, vi } from "vitest";
import { getHostedAuthConfig } from "../../../apps/web/src/lib/hosted-auth";

describe("security: trusted origins validation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("warns for malformed trusted origins without logging their values", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const invalid = "https://private-user:private-token@invalid.example";

    const config = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "production",
      TAX_ENGINE_APP_URL: "https://tax.example",
      BETTER_AUTH_SECRET: "synthetic-test-secret-1234567890-0987654321",
      BETTER_AUTH_TRUSTED_ORIGINS: `https://valid.example, ${invalid}, not-a-url, https://also-valid.example`
    });

    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(
      "[security] Ignoring invalid BETTER_AUTH_TRUSTED_ORIGINS entries. Use public HTTPS origins for hosted deployments."
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toMatch(/private-user|private-token|invalid\.example|not-a-url/u);
    expect(config.trustedOrigins).toEqual(["https://tax.example", "https://valid.example", "https://also-valid.example"]);
  });

  it("does not warn when all trusted origins are valid", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "production",
      TAX_ENGINE_APP_URL: "https://tax.example",
      BETTER_AUTH_SECRET: "synthetic-test-secret-1234567890-0987654321",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://preview.tax.example"
    });

    const originWarnings = warnSpy.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("BETTER_AUTH_TRUSTED_ORIGINS")
    );
    expect(originWarnings).toHaveLength(0);
  });

  it("always includes the app base URL as a trusted origin", () => {
    const config = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_APP_URL: "https://tax.example",
      BETTER_AUTH_SECRET: "test-secret-1234567890"
    });

    expect(config.trustedOrigins).toContain("https://tax.example");
  });

  it("deduplicates the app base URL when also listed in trusted origins", () => {
    const config = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_APP_URL: "https://tax.example",
      BETTER_AUTH_SECRET: "test-secret-1234567890",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://tax.example, https://other.example"
    });

    const appOriginCount = config.trustedOrigins.filter(
      (o) => o === "https://tax.example"
    ).length;
    expect(appOriginCount).toBe(1);
    expect(config.trustedOrigins).toContain("https://other.example");
  });
});
