import { z } from "zod";

const rejection = "Hosted E2E requires an acknowledged isolated sandbox target before client setup.";
const targetSchema = z.strictObject({
  kind: z.literal("isolated-synthetic"),
  appOrigin: z.string().min(1).max(2048),
  databaseHost: z.string().min(1).max(253),
  databasePort: z.number().int().min(1).max(65535),
  databaseName: z.string().min(1).max(63),
  databaseUser: z.string().min(1).max(63),
  authorizationReference: z.string().trim().min(1).max(500),
});
const databaseOptions = new Set([
  "sslmode", "sslrootcert", "sslcert", "sslkey", "sslpassword", "application_name", "connect_timeout", "channel_binding",
]);
const loopback = (host: string) => ["127.0.0.1", "localhost", "[::1]"].includes(host);

function appOrigin(raw: string) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback(url.hostname)))) throw new Error(rejection);
  return url.origin;
}

/**
 * Admission before Stripe/Pool construction. This nonsecret descriptor binds a
 * separately authorized isolated target; it is not proof of external ownership
 * or permission to change production. Missing settings retain the normal skip.
 */
export function admitHostedHappyPathTests(env: Record<string, string | undefined>): boolean {
  const value = (key: string) => env[key]?.trim() ?? "";
  const required = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "DATABASE_URL",
    "STRIPE_PRICE_ID_STARTER_MONTHLY", "STRIPE_PRICE_ID_PLUS_MONTHLY"];
  if (required.some(key => !value(key))) return false;
  try {
    if (value("TAX_ENGINE_DEPLOYMENT_MODE").toLowerCase() !== "hosted"
      || value("TAX_ENGINE_BILLING_MODE").toLowerCase() !== "test") throw new Error(rejection);
    if (!/^(?:sk|rk)_test_[A-Za-z0-9]+$/u.test(value("STRIPE_SECRET_KEY"))
      || !/^whsec_[A-Za-z0-9]+$/u.test(value("STRIPE_WEBHOOK_SECRET"))) throw new Error(rejection);
    for (const key of ["STRIPE_PRICE_ID_STARTER_MONTHLY", "STRIPE_PRICE_ID_PLUS_MONTHLY", "STRIPE_PRICE_ID_AI_HELPER_TOP_UP"]) {
      if (value(key) && !/^price_[A-Za-z0-9]+$/u.test(value(key))) throw new Error(rejection);
    }
    const rawTarget = value("TAX_ENGINE_HOSTED_E2E_TARGET");
    if (!rawTarget || rawTarget.length > 4096) throw new Error(rejection);
    const target = targetSchema.parse(JSON.parse(rawTarget));
    const actualOrigin = appOrigin(value("PLAYWRIGHT_BASE_URL") || "http://127.0.0.1:3099");
    if (appOrigin(target.appOrigin) !== actualOrigin) throw new Error(rejection);
    const database = new URL(value("DATABASE_URL"));
    if (!["postgres:", "postgresql:"].includes(database.protocol) || database.hash
      || !database.pathname.startsWith("/") || database.pathname.slice(1).includes("/")
      || database.hostname !== target.databaseHost.toLowerCase()
      || Number(database.port || "5432") !== target.databasePort
      || decodeURIComponent(database.pathname.slice(1)) !== target.databaseName
      || decodeURIComponent(database.username) !== target.databaseUser) throw new Error(rejection);
    const seen = new Set<string>();
    for (const [key] of database.searchParams) {
      if (!databaseOptions.has(key) || seen.has(key)) throw new Error(rejection);
      seen.add(key);
    }
    // pg URL options override the Pool's explicit ssl object. Even an implicit
    // TLS host must not admit a URL that disables verification or encryption.
    const sslMode = database.searchParams.get("sslmode");
    if (!loopback(database.hostname) && (sslMode
      ? !["require", "verify-ca", "verify-full"].includes(sslMode)
      : !database.hostname.endsWith(".psdb.cloud"))) throw new Error(rejection);
    return true;
  } catch {
    // Do not echo parser errors, acknowledgements, secrets or connection URLs.
    throw new Error(rejection);
  }
}

/** Keep accepted legacy Neon aliases explicitly verifying in pg's next major. */
export function normalizeHostedHappyPathDatabaseUrl(connectionString: string): string {
  if (!connectionString) return connectionString;
  try {
    const parsed = new URL(connectionString);
    if (parsed.searchParams.get("sslrootcert") === "system") parsed.searchParams.delete("sslrootcert");
    if (["require", "verify-ca"].includes(parsed.searchParams.get("sslmode") ?? "")) parsed.searchParams.set("sslmode", "verify-full");
    return parsed.toString();
  } catch { return connectionString; }
}
