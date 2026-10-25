import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHostedAuthForTests, createHostedAuthRouteHandlers, getHostedAuthConfig, resetHostedAuthRuntimeCachesForTests } from "@/lib/hosted-auth";
import { getHostedServerDatabase } from "@/lib/hosted-server-db";
import { createRateLimitStore } from "@/lib/rate-limit";
import { createLoopbackSmtpSink } from "../../fixtures/loopback-smtp-sink";
import { sendHostedRecoveryMail } from "@/lib/hosted-recovery-mail";

const testDatabaseUrl = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
describe.skipIf(!testDatabaseUrl)("hosted recovery with actual PostgreSQL and synthetic loopback SMTP", () => {
  const require = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
  const { Pool } = require("pg") as typeof import("../../../apps/web/node_modules/pg");
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  const schema = `auth_recovery_${randomUUID().replaceAll("-", "")}`;
  const scopedUrl = new URL(testDatabaseUrl ?? "postgresql://localhost:1/unused");
  scopedUrl.searchParams.set("options", `-csearch_path=${schema}`);
  const env = { NODE_ENV: "test", TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_APP_URL: "http://127.0.0.1:3107",
    BETTER_AUTH_SECRET: "synthetic-local-recovery-secret-with-at-least-32-bytes", DATABASE_URL: scopedUrl.toString(),
    TAX_ENGINE_AUTH_SMTP_HOST: "127.0.0.1", TAX_ENGINE_AUTH_SMTP_PORT: "0", TAX_ENGINE_AUTH_SMTP_USER: "synthetic",
    TAX_ENGINE_AUTH_SMTP_PASSWORD: "synthetic", TAX_ENGINE_AUTH_MAIL_FROM: "recovery@example.test",
    TAX_ENGINE_AUTH_SMTP_ALLOW_INSECURE_LOOPBACK: "true" };
  let sink: Awaited<ReturnType<typeof createLoopbackSmtpSink>> | undefined;
  let routes: ReturnType<typeof createHostedAuthRouteHandlers>;
  let auth: Awaited<ReturnType<typeof createHostedAuthForTests>>;
  const tasks: Promise<unknown>[] = [];
  let created = false;
  beforeAll(async () => {
    if (!testDatabaseUrl || !/^postgres(?:ql)?:\/\/(?:ai_test@)?(?:127\.0\.0\.1|localhost):/.test(testDatabaseUrl)) throw new Error("Use an explicitly disposable loopback PostgreSQL database.");
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    sink = await createLoopbackSmtpSink(); env.TAX_ENGINE_AUTH_SMTP_PORT = String(sink.port);
    resetHostedAuthRuntimeCachesForTests();
    auth = await createHostedAuthForTests(getHostedAuthConfig(env), env, { scheduleBackgroundTask: task => { tasks.push(task); } });
  }, 20_000);
  beforeEach(() => {
    // Independent scenarios use independent request windows; limiter behavior
    // is exercised separately with a shared store in hosted-auth-recovery.
    routes = createHostedAuthRouteHandlers({ env, rateLimitStore: createRateLimitStore(), authFactory: async () => auth });
  });
  afterAll(async () => {
    await Promise.allSettled(tasks); await sink?.close();
    if (created) { const { db } = await getHostedServerDatabase(env); await db.destroy(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); }
    await admin.end(); resetHostedAuthRuntimeCachesForTests();
  });
  function request(path: string, body: unknown) { return new Request(`${env.TAX_ENGINE_APP_URL}/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json", origin: env.TAX_ENGINE_APP_URL }, body: JSON.stringify(body) }); }
  async function signup(email: string) {
    const response = await routes.POST(request("sign-up/email", { name: "Synthetic Account", email, password: "Original synthetic password", acceptedTerms: true }));
    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
    return { cookie, payload: await response.json() as { user: { id: string } } };
  }
  async function resetToken(email: string) {
    const before = sink?.messages.length ?? 0;
    const response = await routes.POST(request("request-password-reset", { email })); expect(response.status).toBe(200);
    await Promise.all(tasks.splice(0));
    expect(sink?.messages.length).toBe(before + 1);
    const mail = sink?.messages.at(-1)?.replace(/=\r?\n/g, "").replace(/=3D/g, "=") ?? "";
    expect(mail).not.toContain("Synthetic Account"); expect(mail).not.toContain("Original synthetic password");
    const link = mail.match(/http:\/\/127\.0\.0\.1:3107\/account\/recover#token=([A-Za-z0-9_-]+)/);
    if (!link) throw new Error("Synthetic sink did not receive the fragment-only recovery URL");
    return link[1];
  }

  it("responds identically for absent accounts and delivers only synthetic existing-account mail", async () => {
    await signup("existing@example.test");
    const existing = await routes.POST(request("request-password-reset", { email: "existing@example.test" }));
    const absent = await routes.POST(request("request-password-reset", { email: "absent@example.test" }));
    expect(existing.status).toBe(200); expect(absent.status).toBe(200);
    expect(await existing.json()).toEqual(await absent.json());
    await Promise.all(tasks.splice(0)); expect(sink?.messages).toHaveLength(1);
  });
  it("consumes the actual token once and revokes old sessions while retaining unrelated accounts", async () => {
    const first = await signup("reset@example.test"), other = await signup("untouched@example.test");
    const token = await resetToken("reset@example.test");
    const { pool } = await getHostedServerDatabase(env);
    const expiry = await pool.query('SELECT identifier, "expiresAt", "createdAt" FROM verification WHERE value=$1', [first.payload.user.id]);
    expect(expiry.rows).toHaveLength(1);
    expect(JSON.stringify(expiry.rows)).not.toContain(token);
    expect(new Date(expiry.rows[0].expiresAt).getTime() - new Date(expiry.rows[0].createdAt).getTime()).toBeLessThanOrEqual(900_000);
    expect((await routes.POST(request("reset-password", { token, newPassword: "short" }))).status).toBe(400);
    const reset = await routes.POST(request("reset-password", { token, newPassword: "New synthetic password" })); expect(reset.status).toBe(200);
    expect((await routes.POST(request("reset-password", { token, newPassword: "Replay synthetic password" }))).status).toBe(400);
    const oldSession = await routes.GET(new Request(`${env.TAX_ENGINE_APP_URL}/api/auth/get-session`, { headers: { cookie: first.cookie } })); expect(await oldSession.json()).toBeNull();
    const otherSession = await routes.GET(new Request(`${env.TAX_ENGINE_APP_URL}/api/auth/get-session`, { headers: { cookie: other.cookie } })); expect((await otherSession.json()).user.id).toBe(other.payload.user.id);
    expect((await routes.POST(request("sign-in/email", { email: "reset@example.test", password: "Original synthetic password" }))).status).toBe(401);
    expect((await routes.POST(request("sign-in/email", { email: "reset@example.test", password: "New synthetic password" }))).status).toBe(200);
  });
  it("rejects expired tokens and admits only one concurrent reset", async () => {
    const account = await signup("race@example.test");
    const expired = await resetToken("race@example.test"), { pool } = await getHostedServerDatabase(env);
    await pool.query('UPDATE verification SET "expiresAt"=NOW()-INTERVAL \'1 minute\' WHERE value=$1', [account.payload.user.id]);
    expect((await routes.POST(request("reset-password", { token: expired, newPassword: "Expired synthetic password" }))).status).toBe(400);
    const token = await resetToken("race@example.test");
    const results = await Promise.all(["Concurrent password one", "Concurrent password two"].map(newPassword => routes.POST(request("reset-password", { token, newPassword }))));
    expect(results.map(result => result.status).sort()).toEqual([200, 400]);
  });
  it("rolls back token consumption and session revocation when the password write fails", async () => {
    const account = await signup("rollback@example.test"), token = await resetToken("rollback@example.test");
    const { pool } = await getHostedServerDatabase(env);
    await pool.query("CREATE FUNCTION fail_recovery_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic recovery write outage'; END $$");
    await pool.query('CREATE TRIGGER synthetic_recovery_failure BEFORE UPDATE OF password ON account FOR EACH ROW EXECUTE FUNCTION fail_recovery_write()');
    const diagnostic = vi.spyOn(console, "error");
    try {
      const failed = await routes.POST(request("reset-password", { token, newPassword: "New rollback password" }));
      expect([500, 503]).toContain(failed.status); expect(await failed.text()).not.toContain("Synthetic recovery write outage");
      expect((await pool.query('SELECT count(*) FROM verification WHERE value=$1', [account.payload.user.id])).rows[0].count).toBe("1");
      const session = await routes.GET(new Request(`${env.TAX_ENGINE_APP_URL}/api/auth/get-session`, { headers: { cookie: account.cookie } }));
      expect((await session.json()).user.id).toBe(account.payload.user.id);
      expect(diagnostic).not.toHaveBeenCalled();
    } finally { diagnostic.mockRestore(); await pool.query('DROP TRIGGER synthetic_recovery_failure ON account'); }
    expect((await routes.POST(request("reset-password", { token, newPassword: "New rollback password" }))).status).toBe(200);
  });
  it("refuses actual plaintext SMTP when configured for production TLS", async () => {
    const before = sink?.messages.length;
    await expect(sendHostedRecoveryMail({ email: "tls@example.test", token: "SyntheticTlsCheckToken1234" }, {
      ...env, NODE_ENV: "production", TAX_ENGINE_APP_URL: "https://tax.example", TAX_ENGINE_AUTH_SMTP_ALLOW_INSECURE_LOOPBACK: "false",
    })).rejects.toThrow("Account recovery delivery is unavailable.");
    expect(sink?.messages.length).toBe(before);
  });
});
