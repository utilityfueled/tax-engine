import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * In-memory sliding-window rate limiter for local development and tests.
 *
 * Hosted deployments can also use Upstash Redis by setting
 * `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or the Vercel KV
 * aliases) together with an optional `TAX_ENGINE_RATE_LIMIT_PREFIX`.
 */

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window. */
  maxRequests: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

interface RateLimitEntry {
  timestamps: number[];
}

export interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
  delete(key: string): void;
  keys(): IterableIterator<string>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | null;
}

export interface RateLimitBackendConfig {
  backend: "memory" | "upstash-redis";
  prefix: string;
  url: string | null;
  token: string | null;
}

type RateLimitEnvironment = Record<string, string | undefined>;

const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;
const DEFAULT_RATE_LIMIT_PREFIX = "tax-engine:ratelimit";

const rateLimitRuntimeCache = globalThis as typeof globalThis & {
  __tax_engine_redis_rate_limiters__?: Map<string, Ratelimit>;
  __tax_engine_rate_limit_warning_keys__?: Set<string>;
};

function getRedisRateLimiterCache() {
  if (!rateLimitRuntimeCache.__tax_engine_redis_rate_limiters__) {
    rateLimitRuntimeCache.__tax_engine_redis_rate_limiters__ = new Map();
  }

  return rateLimitRuntimeCache.__tax_engine_redis_rate_limiters__;
}

function getRateLimitWarningCache() {
  if (!rateLimitRuntimeCache.__tax_engine_rate_limit_warning_keys__) {
    rateLimitRuntimeCache.__tax_engine_rate_limit_warning_keys__ = new Set();
  }

  return rateLimitRuntimeCache.__tax_engine_rate_limit_warning_keys__;
}

export function createRateLimitStore(): RateLimitStore {
  return new Map<string, RateLimitEntry>();
}

export function resolveRateLimitBackendConfig(
  env: RateLimitEnvironment = process.env
): RateLimitBackendConfig {
  const url = env.UPSTASH_REDIS_REST_URL?.trim()
    || env.KV_REST_API_URL?.trim()
    || null;
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim()
    || env.KV_REST_API_TOKEN?.trim()
    || null;

  return {
    backend: url && token ? "upstash-redis" : "memory",
    prefix: env.TAX_ENGINE_RATE_LIMIT_PREFIX?.trim() || DEFAULT_RATE_LIMIT_PREFIX,
    url,
    token
  };
}

function formatWindowDuration(windowMs: number) {
  if (windowMs % 86_400_000 === 0) {
    return `${windowMs / 86_400_000} d` as const;
  }

  if (windowMs % 3_600_000 === 0) {
    return `${windowMs / 3_600_000} h` as const;
  }

  if (windowMs % 60_000 === 0) {
    return `${windowMs / 60_000} m` as const;
  }

  if (windowMs % 1_000 === 0) {
    return `${windowMs / 1_000} s` as const;
  }

  return `${windowMs} ms` as const;
}

function warnOnce(key: string, message: string) {
  const warnings = getRateLimitWarningCache();

  if (warnings.has(key)) {
    return;
  }

  warnings.add(key);
  console.warn(message);
}

function getRedisRateLimiter(
  config: RateLimitConfig,
  backend: RateLimitBackendConfig
) {
  const cacheKey = [
    backend.prefix,
    backend.url ?? "",
    config.maxRequests,
    config.windowMs
  ].join("|");
  const cache = getRedisRateLimiterCache();
  const existing = cache.get(cacheKey);

  if (existing) {
    return existing;
  }

  if (!backend.url || !backend.token) {
    throw new Error("Upstash Redis rate limit configuration is incomplete.");
  }

  const limiter = new Ratelimit({
    redis: new Redis({
      url: backend.url,
      token: backend.token
    }),
    limiter: Ratelimit.slidingWindow(
      config.maxRequests,
      formatWindowDuration(config.windowMs)
    ),
    prefix: backend.prefix,
    ephemeralCache: new Map()
  });

  cache.set(cacheKey, limiter);
  return limiter;
}

function pruneTimestamps(timestamps: number[], windowStart: number): number[] {
  return timestamps.filter((t) => t > windowStart);
}

export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  config: RateLimitConfig,
  now: number = Date.now()
): RateLimitResult {
  const windowStart = now - config.windowMs;
  const entry = store.get(key);
  const timestamps = entry
    ? pruneTimestamps(entry.timestamps, windowStart)
    : [];

  if (timestamps.length >= config.maxRequests) {
    const oldestInWindow = timestamps[0] ?? now;
    const retryAfterMs = oldestInWindow + config.windowMs - now;

    store.set(key, { timestamps });

    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 1)
    };
  }

  timestamps.push(now);
  store.set(key, { timestamps });

  return {
    allowed: true,
    remaining: config.maxRequests - timestamps.length,
    retryAfterMs: null
  };
}

export function cleanupExpiredEntries(
  store: RateLimitStore,
  windowMs: number,
  now: number = Date.now()
): number {
  const windowStart = now - windowMs;
  let cleaned = 0;

  for (const key of store.keys()) {
    const entry = store.get(key);

    if (!entry) {
      continue;
    }

    const active = pruneTimestamps(entry.timestamps, windowStart);

    if (active.length === 0) {
      store.delete(key);
      cleaned++;
    } else {
      store.set(key, { timestamps: active });
    }
  }

  return cleaned;
}

function mapRedisRateLimitResult(
  result: Awaited<ReturnType<Ratelimit["limit"]>>,
  now: number
): RateLimitResult {
  void result.pending.catch(() => {});

  return {
    allowed: result.success,
    remaining: result.remaining,
    retryAfterMs: result.success
      ? null
      : Math.max(result.reset - now, 1)
  };
}

export async function checkRateLimitForEnvironment(
  store: RateLimitStore,
  key: string,
  config: RateLimitConfig,
  env: RateLimitEnvironment = process.env,
  now: number = Date.now()
): Promise<RateLimitResult> {
  const backend = resolveRateLimitBackendConfig(env);

  if (backend.backend !== "upstash-redis") {
    if ((backend.url && !backend.token) || (!backend.url && backend.token)) {
      warnOnce(
        "rate-limit-partial-upstash-config",
        "[security] Incomplete Upstash Redis rate limit configuration detected. " +
          "Set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or the Vercel KV aliases) " +
          "to enable shared hosted rate limiting. Falling back to in-memory limits."
      );
    }

    return checkRateLimit(store, key, config, now);
  }

  try {
    const limiter = getRedisRateLimiter(config, backend);
    return mapRedisRateLimitResult(await limiter.limit(key), now);
  } catch (error) {
    warnOnce(
      "rate-limit-upstash-fallback",
      `[security] Upstash Redis rate limiting is unavailable. Falling back to in-memory limits. ${
        error instanceof Error ? error.message : "Unknown error."
      }`
    );

    return checkRateLimit(store, key, config, now);
  }
}

/**
 * Resolves the client IP for rate limiting purposes.
 *
 * Uses the **rightmost** IP from X-Forwarded-For, which is the one added by
 * the last trusted reverse proxy. The leftmost IP is client-controlled and
 * trivially spoofable — using it would let attackers bypass rate limits by
 * rotating the X-Forwarded-For value on every request.
 *
 * For deployments behind multiple proxies, operators should configure
 * the outermost proxy to set X-Real-IP to the true client IP.
 */
let warnedUnknownClient = false;

export function resolveClientIdentifier(requestHeaders: Headers): string {
  const realIp = requestHeaders.get("x-real-ip");

  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  const forwarded = requestHeaders.get("x-forwarded-for");

  if (forwarded) {
    const parts = forwarded.split(",");
    const rightmostIp = parts[parts.length - 1]?.trim();

    if (rightmostIp && rightmostIp.length > 0) {
      return rightmostIp;
    }
  }

  if (typeof globalThis !== "undefined" && !warnedUnknownClient) {
    warnedUnknownClient = true;
    console.warn(
      "[security] Rate-limit client identifier fell back to 'unknown' — " +
      "no X-Real-IP or X-Forwarded-For header found. " +
      "All clients without proxy headers share a single rate-limit bucket. " +
      "Configure your reverse proxy to set X-Real-IP for accurate per-client limiting."
    );
  }

  return "unknown";
}

/** Pre-configured rate limit tiers for different route types. */
export const rateLimitTiers = {
  /** Auth routes: 20 requests per 15 minutes per IP. */
  auth: { maxRequests: 20, windowMs: 15 * 60 * 1000 } satisfies RateLimitConfig,
  /** Standard API routes: 100 requests per minute per IP. */
  api: { maxRequests: 100, windowMs: 60 * 1000 } satisfies RateLimitConfig,
  /** Provider routes that fan out to external AI model APIs: 20 requests per minute per IP. */
  provider: { maxRequests: 20, windowMs: 60 * 1000 } satisfies RateLimitConfig,
  /** Upload routes: 240 requests per minute per IP to allow large multi-file batches. */
  upload: { maxRequests: 240, windowMs: 60 * 1000 } satisfies RateLimitConfig,
  /** Webhook routes: 60 requests per minute (from payment processor). */
  webhook: { maxRequests: 60, windowMs: 60 * 1000 } satisfies RateLimitConfig
} as const;

let globalCleanupTimer: ReturnType<typeof setInterval> | null = null;
const registeredStores: Array<{ store: RateLimitStore; windowMs: number }> = [];

export function registerStoreForCleanup(
  store: RateLimitStore,
  windowMs: number,
  intervalMs: number = DEFAULT_CLEANUP_INTERVAL_MS
): void {
  registeredStores.push({ store, windowMs });

  if (!globalCleanupTimer) {
    globalCleanupTimer = setInterval(() => {
      for (const { store: s, windowMs: w } of registeredStores) {
        cleanupExpiredEntries(s, w);
      }
    }, intervalMs);

    if (globalCleanupTimer && typeof globalCleanupTimer === "object" && "unref" in globalCleanupTimer) {
      globalCleanupTimer.unref();
    }
  }
}
