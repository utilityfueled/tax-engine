/**
 * CORS origin enforcement for browser-facing API routes.
 *
 * Validates the Origin header against a set of trusted origins derived
 * from TAX_ENGINE_APP_URL and BETTER_AUTH_TRUSTED_ORIGINS.
 */

import {
  isHostedProductionEnvironment,
  isLoopbackHostname,
  resolveHostedAppBaseUrl
} from "./hosted-runtime-safety";

type CorsEnvironment = Record<string, string | undefined>;

/**
 * API path prefixes that need CORS enforcement.
 *
 * These serve browser-initiated requests carrying session cookies, so
 * cross-origin requests from untrusted origins must be blocked.
 */
export const CORS_PROTECTED_PREFIXES = [
  "/api/hosted/",
  "/api/provider/",
  "/api/billing/checkout",
];

/**
 * API path prefixes exempt from CORS enforcement.
 *
 * - /api/auth/* — BetterAuth manages its own CORS via trustedOrigins.
 * - /api/billing/webhook — server-to-server from Stripe (no browser origin).
 */
export const CORS_EXEMPT_PREFIXES = [
  "/api/auth/",
  "/api/billing/webhook",
];

export function isCorsProtectedPath(pathname: string): boolean {
  return CORS_PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isCorsExemptPath(pathname: string): boolean {
  return CORS_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function getAllowedOrigins(env: CorsEnvironment = process.env): Set<string> {
  const origins = new Set<string>();
  const appBaseUrl = resolveHostedAppBaseUrl(env);

  if (appBaseUrl.hasValidConfiguredUrl) {
    origins.add(new URL(appBaseUrl.appBaseUrl).origin);
  }

  const trusted =
    env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
      .map((o) => o.trim())
      .filter(Boolean) ?? [];

  for (const entry of trusted) {
    try {
      origins.add(new URL(entry).origin);
    } catch {
      // Invalid URL — skip (hosted-auth.ts already logs a warning).
    }
  }

  if (origins.size === 0 && !isHostedProductionEnvironment(env)) {
    origins.add("http://localhost:3000");
  }

  return origins;
}

function isAllowedLoopbackOrigin(
  origin: string | null,
  env: CorsEnvironment = process.env
) {
  if (!origin || isHostedProductionEnvironment(env)) {
    return false;
  }

  try {
    return isLoopbackHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export type CorsDecision =
  | { action: "pass-through" }
  | { action: "preflight-allow"; origin: string }
  | { action: "preflight-deny" }
  | { action: "reject"; origin: string }
  | { action: "allow"; origin: string }
  | { action: "allow-no-origin" };

export const ALLOWED_METHODS = "GET, POST, PUT, DELETE, PATCH, OPTIONS";
export const ALLOWED_HEADERS = "Content-Type, Authorization";
export const PREFLIGHT_MAX_AGE = "86400";

/**
 * Evaluates the CORS decision for an incoming API request.
 *
 * Returns a decision object that the middleware translates into an HTTP response.
 */
export function evaluateCors(
  pathname: string,
  method: string,
  origin: string | null,
  env: CorsEnvironment = process.env
): CorsDecision {
  // Skip non-API routes and CORS-exempt routes entirely.
  if (!pathname.startsWith("/api/") || isCorsExemptPath(pathname)) {
    return { action: "pass-through" };
  }

  // Only enforce on browser-facing API routes.
  if (!isCorsProtectedPath(pathname)) {
    return { action: "pass-through" };
  }

  const allowedOrigins = getAllowedOrigins(env);

  // --- Preflight (OPTIONS) ---
  if (method === "OPTIONS") {
    if (origin && isAllowedLoopbackOrigin(origin, env)) {
      return { action: "preflight-allow", origin };
    }

    if (origin && allowedOrigins.has(origin)) {
      return { action: "preflight-allow", origin };
    }

    return { action: "preflight-deny" };
  }

  // --- Actual request ---

  if (origin && isAllowedLoopbackOrigin(origin, env)) {
    return { action: "allow", origin };
  }

  // Cross-origin Origin header present but not in the allowlist.
  if (origin && !allowedOrigins.has(origin)) {
    return { action: "reject", origin };
  }

  // Trusted origin.
  if (origin && allowedOrigins.has(origin)) {
    return { action: "allow", origin };
  }

  // No Origin header — same-origin or non-browser client.
  return { action: "allow-no-origin" };
}
