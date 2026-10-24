import { NextResponse } from "next/server";
import type { WorkspaceDeploymentMode } from "@tax-engine/contracts";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies, toNextJsHandler } from "better-auth/next-js";
import { resolveDeploymentMode } from "./deployment-mode";
import {
  ensureHostedAppSchema,
  getHostedServerDatabase,
  getHostedServerDatabaseConfig,
  type HostedServerDatabase
} from "./hosted-server-db";
import { getHostedEntitlementByOwnerId } from "./hosted-billing-db";
import {
  checkRateLimitForEnvironment,
  rateLimitUnavailableResponse,
  createRateLimitStore,
  rateLimitTiers,
  registerStoreForCleanup,
  resolveClientIdentifier,
  type RateLimitStore
} from "./rate-limit";
import {
  isLoopbackAppUrl,
  isLoopbackHostname,
  resolveHostedAppBaseUrl
} from "./hosted-runtime-safety";
import type { HostedWorkspaceActor } from "./workspace-persistence";

type AuthEnvironment = Record<string, string | undefined>;

const hostedAuthPreviewFallbackSecret =
  "tax-engine-hosted-auth-preview-secret-not-for-production";
const hostedAuthBasePath = "/api/auth";
const hostedAuthSessionPath = `${hostedAuthBasePath}/get-session`;
const hostedAuthUiPath = "/account";

export type HostedAuthMode =
  | "disabled"
  | "preview"
  | "live";

export type HostedAuthSecretSource =
  | "env"
  | "preview-fallback";

export interface HostedAuthConfig {
  deploymentMode: WorkspaceDeploymentMode;
  provider: "better-auth";
  mode: HostedAuthMode;
  routeEnabled: boolean;
  baseURL: string;
  basePath: string;
  sessionPath: string;
  trustedOrigins: string[];
  secret: string;
  secretSource: HostedAuthSecretSource;
  authUiPath: string;
  databaseConfigured: boolean;
  /** True when hosted production is missing BETTER_AUTH_SECRET — auth must be blocked. */
  blocked: boolean;
}

export type HostedWorkspaceEntryState =
  | "self-host-open"
  | "hosted-auth-required"
  | "hosted-authenticated-preview";

export interface HostedWorkspaceEntryGate {
  state: HostedWorkspaceEntryState;
  canCreateWorkspace: boolean;
  title: string;
  summary: string;
  statusNotes: string[];
  configurationNotes: string[];
  sessionPath: string;
  routeEnabled: boolean;
  userLabel: string | null;
  primaryActionHref?: string | null;
  primaryActionLabel?: string | null;
}

function isNonProductionEnvironment(env: AuthEnvironment) {
  return (env.NODE_ENV?.trim().toLowerCase() || "development") !== "production";
}

function resolveRequestHostname(
  requestHeaders: Headers,
  env: AuthEnvironment
) {
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const directHost = requestHeaders.get("host")?.trim();

  for (const candidate of [forwardedHost, directHost]) {
    if (!candidate) {
      continue;
    }

    try {
      return new URL(`http://${candidate}`).hostname;
    } catch {
      continue;
    }
  }

  const configuredUrl = env.TAX_ENGINE_APP_URL?.trim();

  if (configuredUrl && isLoopbackAppUrl(configuredUrl)) {
    try {
      return new URL(configuredUrl).hostname;
    } catch {
      return null;
    }
  }

  return null;
}

export function shouldAllowLocalWorkspaceDraftBypass({
  env = process.env,
  requestHeaders = new Headers(),
  localDraftRequested = false
}: {
  env?: AuthEnvironment;
  requestHeaders?: Headers;
  localDraftRequested?: boolean;
} = {}) {
  if (!localDraftRequested) {
    return false;
  }

  if (resolveDeploymentMode(env) !== "hosted") {
    return false;
  }

  if (!isNonProductionEnvironment(env)) {
    return false;
  }

  const requestHostname = resolveRequestHostname(requestHeaders, env);

  return requestHostname ? isLoopbackHostname(requestHostname) : false;
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function resolveTrustedOrigins(
  baseURL: string | null,
  env: AuthEnvironment
): string[] {
  const trustedOrigins = new Set<string>();
  const baseOrigin = baseURL ? normalizeOrigin(baseURL) : null;

  if (baseOrigin) {
    trustedOrigins.add(baseOrigin);
  }

  const configuredOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    ?? [];

  for (const origin of configuredOrigins) {
    const normalizedOrigin = normalizeOrigin(origin);

    if (normalizedOrigin) {
      trustedOrigins.add(normalizedOrigin);
    } else {
      console.warn(
        `[security] Ignoring invalid BETTER_AUTH_TRUSTED_ORIGINS entry: "${origin}". ` +
        "Each entry must be a valid URL (e.g. https://example.com)."
      );
    }
  }

  return Array.from(trustedOrigins);
}

function resolveHostedAuthSecret(env: AuthEnvironment): {
  secret: string;
  secretSource: HostedAuthSecretSource;
  blocked: boolean;
} {
  const configuredSecret = env.BETTER_AUTH_SECRET?.trim();

  if (configuredSecret) {
    return {
      secret: configuredSecret,
      secretSource: "env",
      blocked: false
    };
  }

  const deploymentMode = env.TAX_ENGINE_DEPLOYMENT_MODE?.trim().toLowerCase();
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();

  if (deploymentMode === "hosted" && nodeEnv === "production") {
    console.error(
      "[security] CRITICAL: BETTER_AUTH_SECRET is not set in hosted production mode. " +
      "Auth routes are blocked. Set BETTER_AUTH_SECRET to a strong random value."
    );

    return {
      secret: hostedAuthPreviewFallbackSecret,
      secretSource: "preview-fallback",
      blocked: true
    };
  }

  if (deploymentMode === "hosted") {
    console.warn(
      "[security] BETTER_AUTH_SECRET is not set in hosted mode. " +
      "Using a well-known preview fallback secret. " +
      "Set BETTER_AUTH_SECRET to a strong random value before deploying to production."
    );
  }

  return {
    secret: hostedAuthPreviewFallbackSecret,
    secretSource: "preview-fallback",
    blocked: false
  };
}

function resolveHostedAuthBlocked(
  deploymentMode: WorkspaceDeploymentMode,
  env: AuthEnvironment,
  secretBlocked: boolean
) {
  if (deploymentMode !== "hosted") {
    return false;
  }

  if (secretBlocked) {
    return true;
  }

  return getHostedServerDatabaseConfig(env).blocked;
}

export function getHostedAuthConfig(
  env: AuthEnvironment = process.env
): HostedAuthConfig {
  const deploymentMode = resolveDeploymentMode(env);
  const { secret, secretSource, blocked } = resolveHostedAuthSecret(env);
  const appBaseUrl = resolveHostedAppBaseUrl(env);
  const baseURL = appBaseUrl.appBaseUrl;
  const hostedDb = getHostedServerDatabaseConfig(env);

  return {
    deploymentMode,
    provider: "better-auth",
    mode: deploymentMode !== "hosted"
      ? "disabled"
      : hostedDb.databaseUrl
        ? "live"
        : "preview",
    routeEnabled: deploymentMode === "hosted",
    baseURL,
    basePath: hostedAuthBasePath,
    sessionPath: hostedAuthSessionPath,
    trustedOrigins: resolveTrustedOrigins(
      appBaseUrl.hasValidConfiguredUrl ? baseURL : null,
      env
    ),
    secret,
    secretSource,
    authUiPath: hostedAuthUiPath,
    databaseConfigured: Boolean(hostedDb.databaseUrl),
    blocked: resolveHostedAuthBlocked(deploymentMode, env, blocked)
      || appBaseUrl.blocked
  };
}

const hostedAuthRuntimeCache = globalThis as typeof globalThis & {
  __tax_engine_hosted_auth_promises__?: Map<string, Promise<ReturnType<typeof betterAuth>>>;
  __tax_engine_hosted_auth_migrations__?: Map<string, Promise<void>>;
};

function getHostedAuthPromiseCache() {
  if (!hostedAuthRuntimeCache.__tax_engine_hosted_auth_promises__) {
    hostedAuthRuntimeCache.__tax_engine_hosted_auth_promises__ = new Map();
  }

  return hostedAuthRuntimeCache.__tax_engine_hosted_auth_promises__;
}

function getHostedAuthMigrationCache() {
  if (!hostedAuthRuntimeCache.__tax_engine_hosted_auth_migrations__) {
    hostedAuthRuntimeCache.__tax_engine_hosted_auth_migrations__ = new Map();
  }

  return hostedAuthRuntimeCache.__tax_engine_hosted_auth_migrations__;
}

export function resetHostedAuthRuntimeCachesForTests() {
  getHostedAuthPromiseCache().clear();
  getHostedAuthMigrationCache().clear();
}

function buildHostedAuthOptions(
  config: HostedAuthConfig,
  database?: HostedServerDatabase
): BetterAuthOptions {
  const baseOptions = {
    baseURL: config.baseURL,
    basePath: config.basePath,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: {
      enabled: true
    },
    plugins: [nextCookies()]
  };

  if (!database) {
    return baseOptions as BetterAuthOptions;
  }

  return {
    ...baseOptions,
    database: {
      db: database,
      type: "postgres"
    }
  } as BetterAuthOptions;
}

async function ensureHostedAuthSchema(config: HostedAuthConfig, env: AuthEnvironment) {
  if (!config.databaseConfigured) {
    return;
  }

  const databaseUrl = getHostedServerDatabaseConfig(env).databaseUrl;

  if (!databaseUrl) {
    return;
  }

  const cache = getHostedAuthMigrationCache();
  const existing = cache.get(databaseUrl);

  if (existing) {
    await existing;
    return;
  }

  const promise = (async () => {
    await ensureHostedAppSchema(env);
    const { db } = await getHostedServerDatabase(env);
    const migrations = await getMigrations(buildHostedAuthOptions(config, db));

    await migrations.runMigrations();
  })();

  cache.set(databaseUrl, promise);

  try {
    await promise;
  } catch (error) {
    cache.delete(databaseUrl);
    throw error;
  }
}

interface HostedAuthRuntimeDependencies {
  createAuthInstance?: typeof betterAuth;
  ensureAuthSchema?: typeof ensureHostedAuthSchema;
  getServerDatabase?: typeof getHostedServerDatabase;
}

async function createHostedAuth(
  config: HostedAuthConfig,
  env: AuthEnvironment = process.env,
  dependencies: HostedAuthRuntimeDependencies = {}
) {
  const cacheKey = [
    config.baseURL,
    config.secret,
    config.mode,
    getHostedServerDatabaseConfig(env).databaseUrl ?? "memory"
  ].join("|");
  const cache = getHostedAuthPromiseCache();
  const existing = cache.get(cacheKey);

  if (existing) {
    return existing;
  }

  const promise = (async () => {
    if (config.databaseConfigured) {
      await (dependencies.ensureAuthSchema ?? ensureHostedAuthSchema)(config, env);
      const { db } = await (dependencies.getServerDatabase ?? getHostedServerDatabase)(env);

      return (dependencies.createAuthInstance ?? betterAuth)(buildHostedAuthOptions(config, db));
    }

    return (dependencies.createAuthInstance ?? betterAuth)(buildHostedAuthOptions(config));
  })();

  cache.set(cacheKey, promise);

  try {
    return await promise;
  } catch (error) {
    cache.delete(cacheKey);
    throw error;
  }
}

export function createHostedAuthForTests(
  config: HostedAuthConfig,
  env: AuthEnvironment,
  dependencies: HostedAuthRuntimeDependencies
) {
  return createHostedAuth(config, env, dependencies);
}

function getRequestedAuthPath(request: Request, basePath: string): string {
  const { pathname } = new URL(request.url);

  if (!pathname.startsWith(basePath)) {
    return pathname.replace(/^\/+/, "");
  }

  const trimmedPath = pathname.slice(basePath.length).replace(/^\/+/, "");

  return trimmedPath || "root";
}

function buildBypassResponse(
  config: HostedAuthConfig,
  request: Request
) {
  return {
    provider: config.provider,
    mode: config.mode,
    path: getRequestedAuthPath(request, config.basePath),
    bypassed: true,
    message: "Self-host deployment bypasses hosted account auth."
  };
}

async function validateSignUpTermsAcceptance(request: Request) {
  const payload = await request.clone().json().catch(() => null);

  const acceptedTerms = typeof payload === "object"
    && payload !== null
    && "acceptedTerms" in payload
    && (payload as { acceptedTerms?: unknown }).acceptedTerms === true;

  if (acceptedTerms) {
    return null;
  }

  return NextResponse.json(
    { error: "You must accept the Terms of Service before creating an account." },
    { status: 400 }
  );
}

function getSessionUserLabel(session: unknown): string | null {
  if (typeof session !== "object" || session === null || !("user" in session)) {
    return null;
  }

  const { user } = session as {
    user?: {
      name?: unknown;
      email?: unknown;
    };
  };

  if (typeof user?.name === "string" && user.name.trim().length > 0) {
    return user.name.trim();
  }

  if (typeof user?.email === "string" && user.email.trim().length > 0) {
    return user.email.trim();
  }

  return null;
}

function getSessionUserEmail(session: unknown): string | null {
  if (typeof session !== "object" || session === null || !("user" in session)) {
    return null;
  }

  const { user } = session as {
    user?: {
      email?: unknown;
    };
  };

  return typeof user?.email === "string" && user.email.trim().length > 0
    ? user.email.trim()
    : null;
}

function getSessionUserId(session: unknown): string | null {
  if (typeof session !== "object" || session === null || !("user" in session)) {
    return null;
  }

  const { user } = session as {
    user?: {
      id?: unknown;
    };
  };

  return typeof user?.id === "string" && user.id.trim().length > 0
    ? user.id.trim()
    : null;
}

function buildHostedAuthConfigurationNotes(
  config: HostedAuthConfig
): string[] {
  if (config.deploymentMode === "self-host") {
    return [
      "Account features are not active in local mode."
    ];
  }

  const secretNote = config.secretSource === "env"
    ? "Cloud accounts are configured and ready."
    : "Cloud accounts require additional server setup before sign-in will work.";
  const databaseNote = config.databaseConfigured
    ? "The database is configured for hosted accounts."
    : "A database connection must be configured before hosted sign-in can go live.";
  const originsNote = config.trustedOrigins.length > 0
    ? `Allowed sign-in domains: ${config.trustedOrigins.join(", ")}`
    : "Allowed sign-in domains are not configured yet.";

  return [secretNote, databaseNote, originsNote];
}

function hasHostedSession(session: unknown): boolean {
  if (typeof session !== "object" || session === null) {
    return false;
  }

  return "session" in session && "user" in session;
}

async function getHostedSession(
  config: HostedAuthConfig,
  env: AuthEnvironment,
  requestHeaders: Headers
) {
  const auth = await createHostedAuth(config, env);
  return auth.api.getSession({
    headers: requestHeaders
  });
}

export async function resolveHostedWorkspaceActor({
  env = process.env,
  requestHeaders = new Headers(),
  sessionOverride
}: {
  env?: AuthEnvironment;
  requestHeaders?: Headers;
  sessionOverride?: unknown;
} = {}): Promise<HostedWorkspaceActor | null> {
  const config = getHostedAuthConfig(env);

  if (config.deploymentMode !== "hosted") {
    return null;
  }

  const previewActorId = env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID?.trim();

  if (previewActorId) {
    const nodeEnv = env.NODE_ENV?.trim().toLowerCase();

    if (nodeEnv === "production") {
      console.error(
        "[security] CRITICAL: TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID is set in production. " +
        "This bypasses session authentication and must not be used in production. " +
        "Remove TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID from your production environment."
      );

      return null;
    }

    return {
      id: previewActorId,
      label: env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL?.trim() || null
    };
  }

  const session = sessionOverride ?? await getHostedSession(config, env, requestHeaders);
  const userId = getSessionUserId(session);

  if (!userId) {
    return null;
  }

  return {
    id: userId,
    label: getSessionUserLabel(session),
    email: getSessionUserEmail(session)
  };
}

type HostedAuthRouteMethod =
  | "GET"
  | "POST"
  | "PATCH"
  | "PUT"
  | "DELETE";

interface HostedAuthRouteDependencies {
  env?: AuthEnvironment;
  rateLimitStore?: RateLimitStore;
}

function buildRateLimitResponse(retryAfterMs: number | null) {
  const retryAfterSeconds = Math.ceil((retryAfterMs ?? rateLimitTiers.auth.windowMs) / 1000);

  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds)
      }
    }
  );
}

export function createHostedAuthRouteHandlers(
  dependencies: HostedAuthRouteDependencies = {}
) {
  const store = dependencies.rateLimitStore ?? createRateLimitStore();

  if (!dependencies.rateLimitStore) {
    registerStoreForCleanup(store, rateLimitTiers.auth.windowMs);
  }

  async function handle(
    method: HostedAuthRouteMethod,
    request: Request
  ) {
    const env = dependencies.env ?? process.env;
    const config = getHostedAuthConfig(env);

    if (config.deploymentMode === "self-host") {
      return NextResponse.json(buildBypassResponse(config, request));
    }

    if (config.blocked) {
      return NextResponse.json(
        { error: "Authentication service is unavailable. Please contact the administrator." },
        { status: 503 }
      );
    }

    if (method !== "GET") {
      const clientId = resolveClientIdentifier(request.headers);
      const result = await checkRateLimitForEnvironment(
        store,
        `auth:${clientId}`,
        rateLimitTiers.auth,
        env
      );

      if (result.unavailable) return rateLimitUnavailableResponse();

      if (!result.allowed) {
        return buildRateLimitResponse(result.retryAfterMs);
      }
    }

    if (method === "POST" && getRequestedAuthPath(request, config.basePath) === "sign-up/email") {
      const validationError = await validateSignUpTermsAcceptance(request);

      if (validationError) {
        return validationError;
      }
    }

    const handler = toNextJsHandler(await createHostedAuth(config, env))[method];

    return handler(request);
  }

  return {
    GET(request: Request) {
      return handle("GET", request);
    },
    POST(request: Request) {
      return handle("POST", request);
    },
    PATCH(request: Request) {
      return handle("PATCH", request);
    },
    PUT(request: Request) {
      return handle("PUT", request);
    },
    DELETE(request: Request) {
      return handle("DELETE", request);
    }
  };
}

export async function getHostedWorkspaceEntryGate({
  env = process.env,
  requestHeaders = new Headers(),
  sessionOverride,
  localDraftRequested = false
}: {
  env?: AuthEnvironment;
  requestHeaders?: Headers;
  sessionOverride?: unknown;
  localDraftRequested?: boolean;
} = {}): Promise<HostedWorkspaceEntryGate> {
  const config = getHostedAuthConfig(env);

  if (
    config.deploymentMode === "self-host"
    || shouldAllowLocalWorkspaceDraftBypass({
      env,
      requestHeaders,
      localDraftRequested
    })
  ) {
    return {
      state: "self-host-open",
      canCreateWorkspace: true,
      title: "Start a local tax return",
      summary: config.deploymentMode === "self-host"
        ? "Local mode stores returns in your browser by default. No account needed."
        : "You're running on localhost, so you can open a device-local draft without creating a hosted account.",
      statusNotes: [
        "Your returns are saved in your browser's local storage.",
        "No sign-in required — calculations run locally on your device.",
        "Optional AI features may send selected data to providers you configure."
      ],
      configurationNotes: buildHostedAuthConfigurationNotes(config),
      sessionPath: config.sessionPath,
      routeEnabled: config.routeEnabled,
      userLabel: null,
      primaryActionHref: "/",
      primaryActionLabel: "Open My Returns"
    };
  }

  const session = sessionOverride ?? await getHostedSession(config, env, requestHeaders);
  const actor = await resolveHostedWorkspaceActor({
    env,
    requestHeaders,
    sessionOverride: session
  });
  const userLabel = actor?.label ?? getSessionUserLabel(session);

  if (actor) {
    const usesPreviewActor = Boolean(env.TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID?.trim());
    const entitlement = usesPreviewActor
      ? { workspaceAccess: true }
      : await getHostedEntitlementByOwnerId(env, actor.id)
          .then((result) => result.entitlement)
          .catch(() => ({ workspaceAccess: false }));

    return {
      state: "hosted-authenticated-preview",
      canCreateWorkspace: entitlement.workspaceAccess,
      title: entitlement.workspaceAccess ? "You're signed in" : "Choose a hosted plan",
      summary: entitlement.workspaceAccess
        ? "Your account is active. You can create hosted workspaces while raw forms stay out of durable server storage."
        : "Your account is active, but hosted workspaces are locked until you choose a Starter or Plus plan.",
      statusNotes: [
        userLabel
          ? `Signed in as ${userLabel}.`
          : "Your account session is active.",
        "Hosted mode stores workspace shells, progress markers, and billing state.",
        "Raw uploads and extracted tax form contents are processed transiently and are not stored on the server.",
        entitlement.workspaceAccess
          ? "Open billing any time to manage your software subscription."
          : "Open billing to choose Starter or Plus before creating a hosted workspace."
      ],
      configurationNotes: buildHostedAuthConfigurationNotes(config),
      sessionPath: config.sessionPath,
      routeEnabled: config.routeEnabled,
      userLabel,
      primaryActionHref: entitlement.workspaceAccess ? "/" : "/billing",
      primaryActionLabel: entitlement.workspaceAccess ? "Open My Returns" : "Choose A Plan"
    };
  }

  if (hasHostedSession(session)) {
    return {
      state: "hosted-authenticated-preview",
      canCreateWorkspace: false,
      title: "Account setup in progress",
      summary: "Your account is recognized but still being set up. Please try again shortly.",
      statusNotes: [
        userLabel
          ? `Signed in as ${userLabel}.`
          : "Your account session is active.",
        "Account setup is still in progress — creating new returns is not yet available.",
        "Please try signing out and back in, or email support@vivalatax.com if this continues."
      ],
      configurationNotes: buildHostedAuthConfigurationNotes(config),
      sessionPath: config.sessionPath,
      routeEnabled: config.routeEnabled,
      userLabel,
      primaryActionHref: "/billing",
      primaryActionLabel: "Open Billing"
    };
  }

  return {
    state: "hosted-auth-required",
    canCreateWorkspace: false,
    title: "Choose a hosted plan",
    summary: "Create an account or sign in to unlock hosted software features like synced workspaces, reminders, and AI helper access.",
    statusNotes: [
      "You're not signed in yet.",
      "Create an account or sign in to manage billing and hosted access.",
      "Starter is for synced workspace shells and AI helper budgets. Plus adds reminder and continuity tools.",
      "Raw uploads and extracted tax form contents are processed transiently and are not stored in durable hosted storage.",
      "Prefer to keep storage local? Use local mode instead."
    ],
    configurationNotes: buildHostedAuthConfigurationNotes(config),
    sessionPath: config.sessionPath,
    routeEnabled: config.routeEnabled,
    userLabel,
    primaryActionHref: null,
    primaryActionLabel: null
  };
}
