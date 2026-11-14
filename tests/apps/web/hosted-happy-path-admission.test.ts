import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { admitHostedHappyPathTests, normalizeHostedHappyPathDatabaseUrl } from "../../../apps/web/tests/hosted-happy-path-admission";

const message = "Hosted E2E requires an acknowledged isolated sandbox target before client setup.";
function target(overrides = {}) {
  return JSON.stringify({ kind: "isolated-synthetic", appOrigin: "https://qa.example.invalid",
    databaseHost: "db.qa.example.invalid", databasePort: 5432, databaseName: "synthetic", databaseUser: "qa_test",
    authorizationReference: "synthetic-review-approval", ...overrides });
}
function config(overrides: Record<string, string | undefined> = {}) {
  return { STRIPE_SECRET_KEY: "sk_test_SYNTHETIC", STRIPE_WEBHOOK_SECRET: "whsec_SYNTHETIC",
    DATABASE_URL: "postgresql://qa_test:private-synthetic-marker@db.qa.example.invalid:5432/synthetic?sslmode=verify-full",
    STRIPE_PRICE_ID_STARTER_MONTHLY: "price_syntheticA", STRIPE_PRICE_ID_PLUS_MONTHLY: "price_syntheticB",
    PLAYWRIGHT_BASE_URL: "https://qa.example.invalid", TAX_ENGINE_BILLING_MODE: "test", TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_HOSTED_E2E_TARGET: target(), ...overrides };
}
// Spec: spec/federal/hosted-e2e-admission.yaml

describe("hosted browser rehearsal admission", () => {
  it("admits an explicitly acknowledged isolated sandbox target", () => {
    expect(admitHostedHappyPathTests(config())).toBe(true);
    expect(admitHostedHappyPathTests(config({ STRIPE_SECRET_KEY: "rk_test_SYNTHETIC" }))).toBe(true);
    expect(admitHostedHappyPathTests(config({ PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3099",
      TAX_ENGINE_HOSTED_E2E_TARGET: target({ appOrigin: "http://127.0.0.1:3099" }) }))).toBe(true);
    expect(admitHostedHappyPathTests(config({ DATABASE_URL: "postgresql://qa_test@db.qa.example.invalid/synthetic?sslmode=require&channel_binding=require" }))).toBe(true);
    expect(admitHostedHappyPathTests(config({ PLAYWRIGHT_BASE_URL: undefined,
      DATABASE_URL: "postgresql://qa_test@localhost:6432/synthetic", TAX_ENGINE_HOSTED_E2E_TARGET: target({ appOrigin: "http://127.0.0.1:3099", databaseHost: "localhost", databasePort: 6432 }) }))).toBe(true);
    expect(admitHostedHappyPathTests({})).toBe(false);
    expect(admitHostedHappyPathTests(config({ STRIPE_SECRET_KEY: undefined }))).toBe(false);
  });
  it("rejects live and unknown Stripe namespaces before client setup", () => {
    for (const mode of [undefined, "", "live", "other"]) {
      expect(() => admitHostedHappyPathTests(config({ TAX_ENGINE_BILLING_MODE: mode }))).toThrow(message);
    }
    for (const mode of [undefined, "", "self-hosted", "other"]) {
      expect(() => admitHostedHappyPathTests(config({ TAX_ENGINE_DEPLOYMENT_MODE: mode }))).toThrow(message);
    }
    for (const key of ["sk_live_SYNTHETIC", "rk_live_SYNTHETIC", "unknown", "sk_test_", "sk_test_bad key"]) {
      expect(() => admitHostedHappyPathTests(config({ STRIPE_SECRET_KEY: key }))).toThrow(message);
    }
    for (const overrides of [{ STRIPE_WEBHOOK_SECRET: "wrong_SYNTHETIC" }, { STRIPE_PRICE_ID_STARTER_MONTHLY: "prod_wrong" },
      { STRIPE_PRICE_ID_PLUS_MONTHLY: "price_bad value" }, { STRIPE_PRICE_ID_AI_HELPER_TOP_UP: "prod_wrong" }]) {
      expect(() => admitHostedHappyPathTests(config(overrides))).toThrow(message);
    }
  });
  it("rejects absent or mismatched target custody", () => {
    for (const value of [undefined, "", "not-json", "{}", target({ kind: "production" }), target({ authorizationReference: " " }),
      target({ appOrigin: "https://other.example.invalid" }), target({ databaseHost: "other.example.invalid" }),
      target({ databasePort: 6432 }), target({ databaseName: "different" }), target({ databaseUser: "other" }),
      target({ password: "private-synthetic-marker" })]) {
      expect(() => admitHostedHappyPathTests(config({ TAX_ENGINE_HOSTED_E2E_TARGET: value }))).toThrow(message);
    }
  });
  it("rejects query overrides and unsafe app origins without logging inputs", () => {
    const unsafe = [config({ DATABASE_URL: "not-a-database-url" }), config({ DATABASE_URL: "https://db.qa.example.invalid/synthetic" }),
      config({ DATABASE_URL: "postgresql://qa_test@db.qa.example.invalid:5432/synthetic" }),
      config({ DATABASE_URL: "postgresql://qa_test@db.qa.example.invalid:5432/synthetic?sslmode=disable" }),
      config({ DATABASE_URL: "postgresql://qa_test@db.qa.example.invalid:5432/synthetic?sslmode=require&sslmode=disable" }),
      ...["host=other.example.invalid", "port=6432", "user=other", "dbname=different", "options=-csearch_path%3Dother"].map(query =>
        config({ DATABASE_URL: `postgresql://qa_test@db.qa.example.invalid:5432/synthetic?${query}` })),
      ...["http://qa.example.invalid", "https://user:private-synthetic-marker@qa.example.invalid", "https://qa.example.invalid/path",
        "https://qa.example.invalid?private-synthetic-marker=1", "https://qa.example.invalid/#private-synthetic-marker"].map(origin =>
        config({ PLAYWRIGHT_BASE_URL: origin, TAX_ENGINE_HOSTED_E2E_TARGET: target({ appOrigin: origin }) }))];
    for (const env of unsafe) {
      let error: unknown;
      try { admitHostedHappyPathTests(env); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(Error);
      expect(error instanceof Error ? error.message : "").toBe(message);
      expect(String(error)).not.toContain("private-synthetic-marker");
    }
  });
  it("preserves verifying effective pg TLS despite connection URL precedence", async () => {
    const require = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
    type ConnectionOptions = { connectionString: string; ssl: { rejectUnauthorized: boolean } };
    const { Client, Pool } = require("pg") as {
      Client: new (config: ConnectionOptions) => { connectionParameters: { ssl: false | { rejectUnauthorized?: boolean } } };
      Pool: new (config: ConnectionOptions) => { options: ConnectionOptions; end: () => Promise<void> };
    };
    const unsafe = "postgresql://qa_test@db.qa.psdb.cloud/synthetic?sslmode=disable";
    // The actual installed driver proves URL precedence without any connection.
    expect(new Client({ connectionString: unsafe, ssl: { rejectUnauthorized: true } }).connectionParameters.ssl).toBe(false);
    for (const mode of ["disable", "allow", "prefer", "no-verify"]) {
      expect(() => admitHostedHappyPathTests(config({ DATABASE_URL: `postgresql://qa_test@db.qa.psdb.cloud/synthetic?sslmode=${mode}`,
        TAX_ENGINE_HOSTED_E2E_TARGET: target({ databaseHost: "db.qa.psdb.cloud" }) }))).toThrow(message);
    }
    for (const mode of ["require", "verify-ca", "verify-full"]) {
      const connectionString = normalizeHostedHappyPathDatabaseUrl(`postgresql://qa_test@db.qa.example.invalid/synthetic?sslmode=${mode}&channel_binding=require&sslrootcert=system`);
      expect(new URL(connectionString).searchParams.get("sslmode")).toBe("verify-full");
      expect(new URL(connectionString).searchParams.get("channel_binding")).toBe("require");
      expect(new URL(connectionString).searchParams.has("sslrootcert")).toBe(false);
      const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: true } });
      try {
        const ssl = new Client(pool.options).connectionParameters.ssl;
        expect(ssl).not.toBe(false);
        if (ssl !== false) expect(ssl.rejectUnauthorized).not.toBe(false);
      } finally { await pool.end(); }
    }
  });
  it("checks admission before creating either mutation-capable client", () => {
    const source = readFileSync(new URL("../../../apps/web/tests/hosted-happy-paths.spec.ts", import.meta.url), "utf8");
    const admission = source.indexOf("const hasHostedE2eConfig = admitHostedHappyPathTests(process.env)");
    expect(admission).toBeGreaterThanOrEqual(0);
    expect(source.indexOf("new Stripe(")).toBeGreaterThan(admission);
    expect(source.indexOf("new Pool(")).toBeGreaterThan(admission);
    // Import the actual suite with inert module-boundary sentinels. No Stripe,
    // Pool, browser or document fixture code can issue a real operation here.
    const script = `
      import { registerHooks } from 'node:module';
      import { pathToFileURL } from 'node:url';
      const client = 'data:text/javascript,' + encodeURIComponent('export default class Stripe {constructor(){throw new Error("CLIENT_CONSTRUCTION_REACHED")}};export class Pool {constructor(){throw new Error("CLIENT_CONSTRUCTION_REACHED")}}');
      const browser = 'data:text/javascript,' + encodeURIComponent('export const expect=()=>{};export const test={describe(){throw new Error("SUITE_STARTED")}}');
      const fixture = 'data:text/javascript,' + encodeURIComponent('export const fillRequiredTaxpayerFacts=()=>{}');
      registerHooks({resolve(name,context,next){
        if (['stripe','pg'].includes(name)) return {url:client,shortCircuit:true};
        if (name==='@playwright/test') return {url:browser,shortCircuit:true};
        if (name==='./guided-fixtures') return {url:fixture,shortCircuit:true};
        return next(name,context);
      }});
      try { await import(pathToFileURL(process.cwd()+'/apps/web/tests/hosted-happy-paths.spec.ts')); throw new Error('UNEXPECTED_COMPLETE'); }
      catch(error){
        if(error.message===${JSON.stringify(message)}) console.log('BLOCKED_BEFORE_CLIENT');
        else if(error.message==='CLIENT_CONSTRUCTION_REACHED') console.log('CLIENT_CONSTRUCTION_REACHED');
        else throw new Error('Unexpected boundary result');
      }
    `;
    for (const overrides of [{ STRIPE_SECRET_KEY: "sk_live_SYNTHETIC" }, { TAX_ENGINE_BILLING_MODE: "live" }, { TAX_ENGINE_HOSTED_E2E_TARGET: "" },
      { TAX_ENGINE_HOSTED_E2E_TARGET: target({ databaseName: "another" }) }, {}]) {
      const stdout = execFileSync(process.execPath, ["--input-type=module", "--import", "tsx", "--eval", script], {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        env: config(overrides), encoding: "utf8", timeout: 5_000,
      });
      expect(stdout.trim()).toBe(Object.keys(overrides).length ? "BLOCKED_BEFORE_CLIENT" : "CLIENT_CONSTRUCTION_REACHED");
    }
  });
});
