import { describe, expect, it, vi } from "vitest";
import { getHostedAuthConfig } from "../../../apps/web/src/lib/hosted-auth";

describe("security: trusted origins validation", () => {
  it("warns when BETTER_AUTH_TRUSTED_ORIGINS contains an invalid entry", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_APP_URL: "https://tax.example",
      BETTER_AUTH_SECRET: "test-secret-1234567890",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://valid.example, not-a-url, https://also-valid.example"
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Ignoring invalid BETTER_AUTH_TRUSTED_ORIGINS entry")
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not-a-url")
    );
    expect(config.trustedOrigins).toContain("https://valid.example");
    expect(config.trustedOrigins).toContain("https://also-valid.example");
    expect(config.trustedOrigins).not.toContain("not-a-url");

    warnSpy.mockRestore();
  });

  it("does not warn when all trusted origins are valid", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_APP_URL: "https://tax.example",
      BETTER_AUTH_SECRET: "test-secret-1234567890",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://preview.tax.example"
    });

    const originWarnings = warnSpy.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("BETTER_AUTH_TRUSTED_ORIGINS")
    );
    expect(originWarnings).toHaveLength(0);

    warnSpy.mockRestore();
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
