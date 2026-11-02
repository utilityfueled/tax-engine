// Spec: spec/federal/hosted-preview-database-selection.yaml
import { createRequire } from "node:module";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getHostedServerDatabase, getHostedServerDatabaseConfig } from "../../../apps/web/src/lib/hosted-server-db";
import { getHostedAuthConfig } from "../../../apps/web/src/lib/hosted-auth";

const require = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { Pool } = require("pg") as typeof import("../../../apps/web/node_modules/pg");
// These controls inspect real Pool configuration only. Any attempted connection
// fails locally before a socket, including when exercising the unchanged red.
const connect = vi.spyOn(Pool.prototype, "connect").mockImplementation(() => {
  throw new Error("Synthetic selector tests forbid database connections");
});
const diagnostics = vi.spyOn(console, "error").mockImplementation(() => {});
const shared = "postgresql://synthetic_shared:shared_secret@shared.invalid:5432/legacy";
const staging = "postgresql://synthetic_preview:preview_secret@isolated.invalid:5432/staging?sslmode=require";
const preview = {
  TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production", VERCEL_ENV: "preview",
  DATABASE_URL: shared, TAX_ENGINE_STAGING_DATABASE_DATABASE_URL: staging,
};
const runtimes: Awaited<ReturnType<typeof getHostedServerDatabase>>[] = [];
beforeEach(() => { diagnostics.mockClear(); });
afterAll(async () => {
  await Promise.all(runtimes.map(runtime => runtime.db.destroy()));
  expect(connect).not.toHaveBeenCalled();
  connect.mockRestore(); diagnostics.mockRestore();
});

describe("isolated hosted preview database selection", () => {
  it("selects only the confirmed pooled preview variable", () => {
    const env = { ...preview,
      TAX_ENGINE_STAGING_DATABASE_DATABASE_URL_UNPOOLED: "postgresql://unused.invalid/unpooled",
      TAX_ENGINE_STAGING_DATABASE_POSTGRES_URL: "postgresql://unused.invalid/alias",
    };
    expect(getHostedServerDatabaseConfig(env)).toEqual({
      deploymentMode: "hosted", nodeEnv: "production", databaseUrl: staging, blocked: false,
    });
    expect(env.DATABASE_URL).toBe(shared);
  });

  it("accepts a trimmed isolated URL without any shared DATABASE_URL", () => {
    expect(getHostedServerDatabaseConfig({ ...preview, DATABASE_URL: undefined,
      TAX_ENGINE_STAGING_DATABASE_DATABASE_URL: `  ${staging}  `,
    })).toMatchObject({ databaseUrl: staging, blocked: false });
  });

  it.each([
    ["missing", undefined], ["blank", "  "], ["malformed", "not-a-database-url"],
    ["wrong protocol", "https://preview_secret@isolated.invalid/staging"],
    ["missing host", "postgresql:///staging"], ["missing database", "postgresql://isolated.invalid/"],
  ] as const)("blocks invalid isolated preview configuration without shared fallback (%s)", async (_label, value) => {
    const env = { ...preview, TAX_ENGINE_STAGING_DATABASE_DATABASE_URL: value,
      TAX_ENGINE_STAGING_DATABASE_DATABASE_URL_UNPOOLED: staging,
      TAX_ENGINE_STAGING_DATABASE_POSTGRES_URL: staging,
    };
    expect(getHostedServerDatabaseConfig(env)).toMatchObject({ databaseUrl: null, blocked: true });
    const attempted = getHostedServerDatabase(env).then(runtime => { runtimes.push(runtime); return runtime; });
    await expect(attempted).rejects.toThrow(/preview|isolated/i);
    const output = JSON.stringify(diagnostics.mock.calls);
    for (const secret of [shared, staging, "preview_secret", "shared_secret", "isolated.invalid", "shared.invalid"]) {
      expect(output).not.toContain(secret);
    }
    expect(connect).not.toHaveBeenCalled();
  });

  it("propagates preview isolation to actual auth configuration", () => {
    const env = { ...preview, DATABASE_URL: undefined,
      BETTER_AUTH_SECRET: "synthetic-preview-auth-secret-at-least32-characters",
      TAX_ENGINE_APP_URL: "https://preview.tax.invalid",
    };
    expect(getHostedAuthConfig(env)).toMatchObject({ mode: "live", databaseConfigured: true, blocked: false });
    expect(getHostedAuthConfig({ ...env, NODE_ENV: "development", DATABASE_URL: shared,
      TAX_ENGINE_STAGING_DATABASE_DATABASE_URL: undefined,
    })).toMatchObject({ databaseConfigured: false, blocked: true });
    expect(getHostedAuthConfig({ ...env, BETTER_AUTH_SECRET: undefined }).blocked).toBe(true);
    expect(getHostedAuthConfig({ ...env, TAX_ENGINE_APP_URL: undefined }).blocked).toBe(true);
  });

  it.each(["production", "development", "Preview", undefined])(
    "preserves non-preview hosted DATABASE_URL selection (%s)", value => {
      expect(getHostedServerDatabaseConfig({ ...preview, VERCEL_ENV: value })).toEqual({
        deploymentMode: "hosted", nodeEnv: "production", databaseUrl: shared, blocked: false,
      });
      expect(getHostedServerDatabaseConfig({ ...preview, VERCEL_ENV: value, DATABASE_URL: undefined }))
        .toMatchObject({ databaseUrl: null, blocked: true });
    });

  it("preserves self-host config and rejects hosted pool allocation in self-host mode", async () => {
    const env = { ...preview, TAX_ENGINE_DEPLOYMENT_MODE: "self-host" };
    expect(getHostedServerDatabaseConfig(env)).toEqual({
      deploymentMode: "self-host", nodeEnv: "production", databaseUrl: shared, blocked: false,
    });
    expect(getHostedServerDatabaseConfig({ ...env, DATABASE_URL: undefined }))
      .toMatchObject({ databaseUrl: null, blocked: false });
    await expect(getHostedServerDatabase(env)).rejects.toThrow(/disabled outside hosted mode/);
    expect(connect).not.toHaveBeenCalled();
  });

  it("retains TLS deadlines and runtime identity for the selected preview pool", async () => {
    const env = { ...preview,
      TAX_ENGINE_STAGING_DATABASE_DATABASE_URL: `${staging}&sslrootcert=system&application_name=synthetic-selector`,
    };
    const runtime = await getHostedServerDatabase(env);runtimes.push(runtime);
    const repeated = await getHostedServerDatabase(env);
    expect(repeated).toBe(runtime);
    const normalized = new URL(env.TAX_ENGINE_STAGING_DATABASE_DATABASE_URL);
    normalized.searchParams.delete("sslrootcert");
    expect(runtime.pool.options).toMatchObject({
      connectionString: normalized.toString(), ssl: { rejectUnauthorized: true },
      max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000, lock_timeout: 3_000,
      idle_in_transaction_session_timeout: 15_000, query_timeout: 15_000,
      keepAlive: true, keepAliveInitialDelayMillis: 10_000,
    });
    expect(connect).not.toHaveBeenCalled();
  });
});
