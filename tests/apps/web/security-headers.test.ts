import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../../apps/web/next.config";

async function getHeaders() {
  return (await nextConfig.headers!())[0].headers;
}

function findHeader(headers: { key: string; value: string }[], key: string) {
  return headers.find((h) => h.key === key);
}

describe("security: framework fingerprinting", () => {
  it("disables X-Powered-By header to prevent framework fingerprinting", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("security: HTTP response headers", () => {
  it("configures security headers for all routes", async () => {
    expect(nextConfig.headers).toBeDefined();

    const headerRules = await nextConfig.headers!();

    expect(headerRules.map(rule => rule.source)).toEqual(["/(.*)", "/account/recover"]);
    expect(headerRules[0].source).toBe("/(.*)");

    const headerKeys = headerRules[0].headers.map((h) => h.key);

    expect(headerKeys).toContain("X-Content-Type-Options");
    expect(headerKeys).toContain("X-Frame-Options");
    expect(headerKeys).toContain("X-XSS-Protection");
    expect(headerKeys).toContain("Referrer-Policy");
    expect(headerKeys).toContain("Permissions-Policy");
    expect(headerKeys).toContain("Content-Security-Policy");
  });

  it("adds private recovery headers without replacing the global security policy", async () => {
    const rules = await nextConfig.headers!();
    const recovery = rules.find(rule => rule.source === "/account/recover");
    expect(recovery?.headers).toEqual([
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ]);
    // No route-specific CSP or framing override may relax the all-route policy.
    expect(recovery?.headers.some(header => ["Content-Security-Policy", "X-Frame-Options"].includes(header.key))).toBe(false);
  });

  it("sets X-Content-Type-Options to nosniff", async () => {
    const header = findHeader(await getHeaders(), "X-Content-Type-Options");

    expect(header?.value).toBe("nosniff");
  });

  it("sets X-Frame-Options to DENY to prevent clickjacking", async () => {
    const header = findHeader(await getHeaders(), "X-Frame-Options");

    expect(header?.value).toBe("DENY");
  });

  it("sets Referrer-Policy to limit referrer leakage", async () => {
    const header = findHeader(await getHeaders(), "Referrer-Policy");

    expect(header?.value).toBe("strict-origin-when-cross-origin");
  });

  it("disables X-XSS-Protection to prevent XSS auditor side-channel attacks", async () => {
    const header = findHeader(await getHeaders(), "X-XSS-Protection");

    // XSS Auditor is removed from modern browsers. In older browsers,
    // "1; mode=block" can enable side-channel attacks. OWASP recommends "0".
    // CSP provides the real XSS protection.
    expect(header?.value).toBe("0");
  });

  it("restricts camera, microphone, and geolocation via Permissions-Policy", async () => {
    const header = findHeader(await getHeaders(), "Permissions-Policy");

    expect(header?.value).toContain("camera=()");
    expect(header?.value).toContain("microphone=()");
    expect(header?.value).toContain("geolocation=()");
  });
});

describe("security: Content-Security-Policy", () => {
  it("includes a Content-Security-Policy header", async () => {
    const header = findHeader(await getHeaders(), "Content-Security-Policy");

    expect(header).toBeDefined();
    expect(header!.value.length).toBeGreaterThan(0);
  });

  it("restricts default-src to self", async () => {
    const header = findHeader(await getHeaders(), "Content-Security-Policy");

    expect(header!.value).toContain("default-src 'self'");
  });

  it("blocks object embeds to prevent plugin-based attacks", async () => {
    const header = findHeader(await getHeaders(), "Content-Security-Policy");

    expect(header!.value).toContain("object-src 'none'");
  });

  it("restricts frame-ancestors to none (defense-in-depth with X-Frame-Options)", async () => {
    const header = findHeader(await getHeaders(), "Content-Security-Policy");

    expect(header!.value).toContain("frame-ancestors 'none'");
  });

  it("restricts form-action to self to prevent form submission hijacking", async () => {
    const header = findHeader(await getHeaders(), "Content-Security-Policy");

    expect(header!.value).toContain("form-action 'self'");
  });

  it("restricts base-uri to self to prevent base tag injection", async () => {
    const header = findHeader(await getHeaders(), "Content-Security-Policy");

    expect(header!.value).toContain("base-uri 'self'");
  });

  it("restricts connect-src to self for API calls", async () => {
    const header = findHeader(await getHeaders(), "Content-Security-Policy");

    expect(header!.value).toContain("connect-src 'self'");
  });

  it("does not include strict-dynamic without nonce infrastructure", async () => {
    const header = findHeader(await getHeaders(), "Content-Security-Policy");

    // strict-dynamic without nonces causes CSP3 browsers to ignore 'self' and
    // 'unsafe-inline', blocking all scripts. Only add strict-dynamic when
    // Next.js middleware is generating nonces for trusted scripts.
    expect(header!.value).not.toContain("'strict-dynamic'");
  });

  it("allows self and unsafe-inline for script-src (Next.js SSR requirement)", async () => {
    const header = findHeader(await getHeaders(), "Content-Security-Policy");

    expect(header!.value).toMatch(/script-src 'self' 'unsafe-inline'/);
  });

  it("excludes upgrade-insecure-requests in development (http://localhost breaks)", async () => {
    const header = findHeader(await getHeaders(), "Content-Security-Policy");

    // In test/development NODE_ENV, upgrade-insecure-requests must NOT be present.
    // It tells browsers to upgrade HTTP to HTTPS, which breaks http://localhost.
    expect(header!.value).not.toContain("upgrade-insecure-requests");
  });

  it("includes upgrade-insecure-requests in production mode", async () => {
    const originalEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = "production";
      vi.resetModules();

      const { default: prodConfig } = await import("../../../apps/web/next.config");
      const headers = (await prodConfig.headers!())[0].headers;
      const header = findHeader(headers, "Content-Security-Policy");

      expect(header!.value).toContain("upgrade-insecure-requests");
    } finally {
      process.env.NODE_ENV = originalEnv;
      vi.resetModules();
    }
  });
});

describe("security: HSTS configuration", () => {
  it("includes Strict-Transport-Security in production mode", async () => {
    const originalEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = "production";
      vi.resetModules();

      const { default: prodConfig } = await import("../../../apps/web/next.config");
      const headers = (await prodConfig.headers!())[0].headers;
      const hsts = findHeader(headers, "Strict-Transport-Security");

      expect(hsts).toBeDefined();
      expect(hsts!.value).toContain("max-age=63072000");
      expect(hsts!.value).toContain("includeSubDomains");
      expect(hsts!.value).toContain("preload");
    } finally {
      process.env.NODE_ENV = originalEnv;
      vi.resetModules();
    }
  });
});

describe("security: .gitignore excludes environment files", () => {
  const gitignorePath = path.resolve(__dirname, "../../../.gitignore");
  const gitignore = fs.readFileSync(gitignorePath, "utf-8");

  const requiredPatterns = [
    ".env",
    ".env.local",
    ".env.docker",
    ".env.production",
    ".env.*.local",
  ];

  for (const pattern of requiredPatterns) {
    it(`excludes ${pattern} from version control`, () => {
      const lines = gitignore.split("\n").map((l) => l.trim());
      expect(lines).toContain(pattern);
    });
  }
});
