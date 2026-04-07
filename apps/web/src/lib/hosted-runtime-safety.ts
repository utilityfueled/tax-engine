import type { WorkspaceDeploymentMode } from "@tax-engine/contracts";
import { resolveDeploymentMode } from "./deployment-mode";

type HostedRuntimeEnvironment = Record<string, string | undefined>;

export const localhostAppUrl = "http://localhost:3000";
export const defaultCanonicalHostname = "vivalatax.com";

export interface HostedAppUrlResolution {
  appBaseUrl: string;
  blocked: boolean;
  hasValidConfiguredUrl: boolean;
}

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/\.$/u, "");
}

function isHostedProduction(env: HostedRuntimeEnvironment) {
  return resolveDeploymentMode(env) === "hosted"
    && (env.NODE_ENV?.trim().toLowerCase() || "development") === "production";
}

function isValidAppUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);

  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "[::1]";
}

export function isLoopbackAppUrl(value: string): boolean {
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function resolveHostedAppBaseUrl(
  env: HostedRuntimeEnvironment = process.env
): HostedAppUrlResolution {
  const configuredUrl = env.TAX_ENGINE_APP_URL?.trim();
  const hostedProduction = isHostedProduction(env);

  if (configuredUrl && isValidAppUrl(configuredUrl)) {
    return {
      appBaseUrl: configuredUrl,
      blocked: false,
      hasValidConfiguredUrl: true
    };
  }

  if (hostedProduction) {
    console.error(
      configuredUrl
        ? "[security] CRITICAL: TAX_ENGINE_APP_URL is invalid in hosted production mode. " +
            "Set TAX_ENGINE_APP_URL to the public HTTPS origin for this deployment."
        : "[security] CRITICAL: TAX_ENGINE_APP_URL is not configured in hosted production mode. " +
            "Set TAX_ENGINE_APP_URL to the public HTTPS origin for this deployment."
    );

    return {
      appBaseUrl: localhostAppUrl,
      blocked: true,
      hasValidConfiguredUrl: false
    };
  }

  if (configuredUrl) {
    console.warn(
      `[security] Ignoring invalid TAX_ENGINE_APP_URL value: "${configuredUrl}". ` +
      `Using ${localhostAppUrl} until a valid app URL is configured.`
    );
  }

  return {
    appBaseUrl: localhostAppUrl,
    blocked: false,
    hasValidConfiguredUrl: false
  };
}

export function isHostedProductionEnvironment(
  env: HostedRuntimeEnvironment = process.env
) {
  return isHostedProduction(env);
}

export function resolveCanonicalHostname(
  env: HostedRuntimeEnvironment = process.env
) {
  const configured = env.TAX_ENGINE_CANONICAL_HOSTNAME?.trim();
  return normalizeHostname(configured || defaultCanonicalHostname);
}

export function shouldAllowSearchIndexing(
  env: HostedRuntimeEnvironment = process.env
) {
  const appUrl = resolveHostedAppBaseUrl(env);

  if (!appUrl.hasValidConfiguredUrl) {
    return false;
  }

  try {
    const appHostname = normalizeHostname(new URL(appUrl.appBaseUrl).hostname);
    const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
    const runtimeIsProduction = vercelEnv
      ? vercelEnv === "production"
      : isHostedProduction(env);

    return runtimeIsProduction && appHostname === resolveCanonicalHostname(env);
  } catch {
    return false;
  }
}

export function shouldPreferLocalWorkspaceDraft(
  env: HostedRuntimeEnvironment = process.env
) {
  if (resolveDeploymentMode(env) !== "hosted") {
    return false;
  }

  if (isHostedProduction(env)) {
    return false;
  }

  const configuredUrl = env.TAX_ENGINE_APP_URL?.trim();

  return configuredUrl ? isLoopbackAppUrl(configuredUrl) : false;
}

export function shouldAllowLoopbackLocalWorkspaceResume(
  env: HostedRuntimeEnvironment = process.env,
  hostname?: string | null
) {
  if (resolveDeploymentMode(env) !== "hosted") {
    return false;
  }

  if (isHostedProduction(env)) {
    return false;
  }

  if (!hostname) {
    return false;
  }

  return isLoopbackHostname(hostname);
}

export function shouldAllowLoopbackLocalAiAccess(
  env: HostedRuntimeEnvironment = process.env,
  hostname?: string | null,
  storageMode?: string | null
) {
  return shouldAllowLoopbackLocalWorkspaceApiAccess(env, hostname, storageMode);
}

export function shouldAllowLoopbackLocalWorkspaceApiAccess(
  env: HostedRuntimeEnvironment = process.env,
  hostname?: string | null,
  storageMode?: string | null
) {
  if (storageMode !== "local-browser") {
    return false;
  }

  return shouldAllowLoopbackLocalWorkspaceResume(env, hostname);
}

export function resolveBrowserWorkspaceDeploymentMode(
  env: HostedRuntimeEnvironment = process.env
): WorkspaceDeploymentMode {
  return resolveDeploymentMode(env);
}
