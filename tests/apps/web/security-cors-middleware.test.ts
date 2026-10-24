import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  CORS_EXEMPT_PREFIXES,
  CORS_PROTECTED_PREFIXES,
  PREFLIGHT_MAX_AGE,
  evaluateCors,
  getAllowedOrigins,
  isCorsExemptPath,
  isCorsProtectedPath,
} from "../../../apps/web/src/lib/cors";
import { middleware } from "../../../apps/web/src/middleware";

// Next is owned by the web workspace, not the engine package.
const requireWeb = createRequire(new URL("../../../apps/web/package.json", import.meta.url));

const TEST_ENV = {
  TAX_ENGINE_APP_URL: "https://tax.example",
  BETTER_AUTH_TRUSTED_ORIGINS: "https://preview.tax.example",
};

describe("security: CORS origin allowlist", () => {
  it("includes the app URL origin", () => {
    const origins = getAllowedOrigins(TEST_ENV);

    expect(origins.has("https://tax.example")).toBe(true);
  });

  it("includes BETTER_AUTH_TRUSTED_ORIGINS entries", () => {
    const origins = getAllowedOrigins(TEST_ENV);

    expect(origins.has("https://preview.tax.example")).toBe(true);
  });

  it("falls back to http://localhost:3000 when no URLs are configured", () => {
    const origins = getAllowedOrigins({});

    expect(origins.has("http://localhost:3000")).toBe(true);
    expect(origins.size).toBe(1);
  });

  it("does not fall back to localhost in hosted production when TAX_ENGINE_APP_URL is missing", () => {
    const origins = getAllowedOrigins({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "production"
    });

    expect(origins.has("http://localhost:3000")).toBe(false);
    expect(origins.size).toBe(0);
  });

  it("never includes wildcard *", () => {
    const origins = getAllowedOrigins(TEST_ENV);

    expect(origins.has("*")).toBe(false);
  });

  it("skips invalid URLs without crashing", () => {
    const origins = getAllowedOrigins({
      TAX_ENGINE_APP_URL: "not-a-url",
      BETTER_AUTH_TRUSTED_ORIGINS: "also-invalid, https://valid.example",
    });

    expect(origins.has("https://valid.example")).toBe(true);
    expect(origins.size).toBe(1);
  });

  it("deduplicates origins across app URL and trusted origins", () => {
    const origins = getAllowedOrigins({
      TAX_ENGINE_APP_URL: "https://tax.example",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://tax.example",
    });

    expect(origins.size).toBe(1);
  });
});

describe("security: CORS path classification", () => {
  describe("protected paths", () => {
    const protectedPaths = [
      "/api/hosted/workspaces",
      "/api/hosted/workspaces/ws-1",
      "/api/hosted/workspaces/ws-1/documents",
      "/api/provider/workspace",
      "/api/provider/interview",
      "/api/provider/export-draft",
      "/api/billing/checkout",
    ];

    for (const path of protectedPaths) {
      it(`marks ${path} as CORS-protected`, () => {
        expect(isCorsProtectedPath(path)).toBe(true);
      });
    }
  });

  describe("exempt paths", () => {
    it("exempts auth routes (BetterAuth manages its own CORS)", () => {
      expect(isCorsExemptPath("/api/auth/session")).toBe(true);
      expect(isCorsExemptPath("/api/auth/callback")).toBe(true);
    });

    it("exempts webhook routes (server-to-server)", () => {
      expect(isCorsExemptPath("/api/billing/webhook")).toBe(true);
    });
  });

  it("does not protect non-API paths", () => {
    expect(isCorsProtectedPath("/dashboard")).toBe(false);
    expect(isCorsProtectedPath("/")).toBe(false);
  });
});

describe("security: CORS preflight enforcement", () => {
  it("allows preflight from trusted origin", () => {
    const decision = evaluateCors(
      "/api/hosted/workspaces",
      "OPTIONS",
      "https://tax.example",
      TEST_ENV
    );

    expect(decision).toEqual({
      action: "preflight-allow",
      origin: "https://tax.example",
    });
  });

  it("allows preflight from trusted origin in BETTER_AUTH_TRUSTED_ORIGINS", () => {
    const decision = evaluateCors(
      "/api/provider/workspace",
      "OPTIONS",
      "https://preview.tax.example",
      TEST_ENV
    );

    expect(decision).toEqual({
      action: "preflight-allow",
      origin: "https://preview.tax.example",
    });
  });

  it("denies preflight from untrusted origin", () => {
    const decision = evaluateCors(
      "/api/hosted/workspaces",
      "OPTIONS",
      "https://evil.example",
      TEST_ENV
    );

    expect(decision).toEqual({ action: "preflight-deny" });
  });

  it("denies preflight when no origin is sent", () => {
    const decision = evaluateCors(
      "/api/hosted/workspaces",
      "OPTIONS",
      null,
      TEST_ENV
    );

    expect(decision).toEqual({ action: "preflight-deny" });
  });
});

describe("security: CORS cross-origin rejection", () => {
  it("rejects POST from untrusted origin", () => {
    const decision = evaluateCors(
      "/api/hosted/workspaces",
      "POST",
      "https://evil.example",
      TEST_ENV
    );

    expect(decision.action).toBe("reject");
  });

  it("rejects GET from untrusted origin", () => {
    const decision = evaluateCors(
      "/api/hosted/workspaces",
      "GET",
      "https://evil.example",
      TEST_ENV
    );

    expect(decision.action).toBe("reject");
  });

  it("rejects cross-origin requests to provider routes", () => {
    const decision = evaluateCors(
      "/api/provider/interview",
      "POST",
      "https://evil.example",
      TEST_ENV
    );

    expect(decision.action).toBe("reject");
  });

  it("rejects cross-origin requests to billing checkout", () => {
    const decision = evaluateCors(
      "/api/billing/checkout",
      "POST",
      "https://evil.example",
      TEST_ENV
    );

    expect(decision.action).toBe("reject");
  });

  it("rejects cross-origin DELETE requests", () => {
    const decision = evaluateCors(
      "/api/hosted/workspaces/ws-1",
      "DELETE",
      "https://evil.example",
      TEST_ENV
    );

    expect(decision.action).toBe("reject");
  });
});

describe("security: CORS same-origin and trusted-origin pass-through", () => {
  it("allows requests from the app origin", () => {
    const decision = evaluateCors(
      "/api/hosted/workspaces",
      "GET",
      "https://tax.example",
      TEST_ENV
    );

    expect(decision).toEqual({
      action: "allow",
      origin: "https://tax.example",
    });
  });

  it("allows requests without an origin header (same-origin or non-browser)", () => {
    const decision = evaluateCors(
      "/api/hosted/workspaces",
      "GET",
      null,
      TEST_ENV
    );

    expect(decision).toEqual({ action: "allow-no-origin" });
  });

  it("allows POST requests from trusted origin", () => {
    const decision = evaluateCors(
      "/api/hosted/workspaces",
      "POST",
      "https://preview.tax.example",
      TEST_ENV
    );

    expect(decision).toEqual({
      action: "allow",
      origin: "https://preview.tax.example",
    });
  });
});

describe("security: CORS exempt routes pass through", () => {
  it("passes through auth routes (BetterAuth manages CORS)", () => {
    const decision = evaluateCors(
      "/api/auth/session",
      "GET",
      "https://evil.example",
      TEST_ENV
    );

    expect(decision).toEqual({ action: "pass-through" });
  });

  it("passes through webhook routes (server-to-server)", () => {
    const decision = evaluateCors(
      "/api/billing/webhook",
      "POST",
      "https://hooks.stripe.com",
      TEST_ENV
    );

    expect(decision).toEqual({ action: "pass-through" });
  });

  it("passes through non-API routes", () => {
    const decision = evaluateCors(
      "/dashboard",
      "GET",
      "https://evil.example",
      TEST_ENV
    );

    expect(decision).toEqual({ action: "pass-through" });
  });

  it("passes through root path", () => {
    const decision = evaluateCors(
      "/",
      "GET",
      "https://evil.example",
      TEST_ENV
    );

    expect(decision).toEqual({ action: "pass-through" });
  });
});

describe("security: CORS route coverage for all protected endpoints", () => {
  const protectedPaths = [
    "/api/hosted/workspaces",
    "/api/hosted/workspaces/ws-1",
    "/api/hosted/workspaces/ws-1/documents",
    "/api/provider/workspace",
    "/api/provider/interview",
    "/api/provider/export-draft",
    "/api/billing/checkout",
  ];

  for (const path of protectedPaths) {
    it(`rejects untrusted cross-origin POST to ${path}`, () => {
      const decision = evaluateCors(
        path,
        "POST",
        "https://evil.example",
        TEST_ENV
      );

      expect(decision.action).toBe("reject");
    });
  }
});

describe("security: CORS constants are suitable for production", () => {
  it("exports protected path prefixes covering all browser-facing API routes", () => {
    expect(CORS_PROTECTED_PREFIXES).toContain("/api/hosted/");
    expect(CORS_PROTECTED_PREFIXES).toContain("/api/provider/");
    expect(CORS_PROTECTED_PREFIXES).toContain("/api/billing/checkout");
  });

  it("exports exempt path prefixes for auth and webhook", () => {
    expect(CORS_EXEMPT_PREFIXES).toContain("/api/auth/");
    expect(CORS_EXEMPT_PREFIXES).toContain("/api/billing/webhook");
  });

  it("includes standard HTTP methods in allowed methods", () => {
    expect(ALLOWED_METHODS).toContain("GET");
    expect(ALLOWED_METHODS).toContain("POST");
    expect(ALLOWED_METHODS).toContain("PUT");
    expect(ALLOWED_METHODS).toContain("DELETE");
    expect(ALLOWED_METHODS).toContain("PATCH");
    expect(ALLOWED_METHODS).toContain("OPTIONS");
  });

  it("allows Content-Type and Authorization headers", () => {
    expect(ALLOWED_HEADERS).toContain("Content-Type");
    expect(ALLOWED_HEADERS).toContain("Authorization");
  });

  it("sets preflight max-age to 24 hours", () => {
    expect(PREFLIGHT_MAX_AGE).toBe("86400");
  });
});

describe("security: CORS origin allowlist with no config falls back safely", () => {
  it("rejects untrusted origin when only localhost is allowed", () => {
    const decision = evaluateCors(
      "/api/hosted/workspaces",
      "POST",
      "https://evil.example",
      {}
    );

    expect(decision.action).toBe("reject");
  });

  it("allows localhost:3000 when no config is set", () => {
    const decision = evaluateCors(
      "/api/hosted/workspaces",
      "GET",
      "http://localhost:3000",
      {}
    );

    expect(decision).toEqual({
      action: "allow",
      origin: "http://localhost:3000",
    });
  });

  it("allows loopback origins during local hosted development even when app URL is remote", () => {
    const decision = evaluateCors(
      "/api/provider/workspace",
      "POST",
      "http://localhost:3000",
      {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        NODE_ENV: "development",
        TAX_ENGINE_APP_URL: "https://tax.example"
      }
    );

    expect(decision).toEqual({
      action: "allow",
      origin: "http://localhost:3000",
    });
  });

  it("allows 127.0.0.1 loopback origins during local development", () => {
    const decision = evaluateCors(
      "/api/provider/workspace",
      "POST",
      "http://127.0.0.1:3001",
      {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        NODE_ENV: "development",
        TAX_ENGINE_APP_URL: "https://tax.example"
      }
    );

    expect(decision).toEqual({
      action: "allow",
      origin: "http://127.0.0.1:3001",
    });
  });

  it("does not allow loopback origins in hosted production", () => {
    const decision = evaluateCors(
      "/api/provider/workspace",
      "POST",
      "http://localhost:3000",
      {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        NODE_ENV: "production",
        TAX_ENGINE_APP_URL: "https://tax.example"
      }
    );

    expect(decision).toEqual({ action: "reject", origin: "http://localhost:3000" });
  });
});

// ---------------------------------------------------------------------------
// Vary: Origin header — prevents CDN/proxy cache poisoning
// ---------------------------------------------------------------------------

describe("security: CORS Vary header prevents cache poisoning", () => {
  function buildNextRequest(
    path: string,
    method: string,
    origin: string | null
  ) {
    const url = `http://localhost:3000${path}`;
    const headers = new Headers();

    if (origin) {
      headers.set("origin", origin);
    }

    // next/server's NextRequest expects a full Request-like object.
    const { NextRequest } = requireWeb("next/server");
    return new NextRequest(new Request(url, { method, headers }));
  }

  it("sets Vary: Origin on preflight-allow responses", () => {
    const request = buildNextRequest(
      "/api/hosted/workspaces",
      "OPTIONS",
      "http://localhost:3000"
    );

    const response = middleware(request);

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("sets Vary: Origin on allow (actual request) responses", () => {
    const request = buildNextRequest(
      "/api/hosted/workspaces",
      "GET",
      "http://localhost:3000"
    );

    const response = middleware(request);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("sets Vary: Origin on preflight-deny responses to prevent cache poisoning", () => {
    const request = buildNextRequest(
      "/api/hosted/workspaces",
      "OPTIONS",
      "https://evil.example"
    );

    const response = middleware(request);

    // Deny returns 204 with no CORS Allow headers, but Vary: Origin is
    // required so CDN/proxy caches key on Origin and don't serve this
    // response to legitimate origins.
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("sets Vary: Origin on reject responses to prevent cache poisoning", () => {
    const request = buildNextRequest(
      "/api/hosted/workspaces",
      "POST",
      "https://evil.example"
    );

    const response = middleware(request);

    // A 403 without Vary: Origin could be cached by a CDN and served
    // to a legitimate origin, blocking that user.
    expect(response.status).toBe(403);
    expect(response.headers.get("Vary")).toBe("Origin");
  });
});
declare const require: (id: string) => { NextRequest: typeof import("next/server").NextRequest };
