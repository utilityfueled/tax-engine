import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "../../../apps/web/node_modules/pg";
vi.mock("server-only", () => ({}));
import { createHostedAiCreditIssuance } from "../../../apps/web/src/lib/hosted-ai-credit-issuance";
import { getHostedAiBudgetSnapshot, recordHostedAiCreditPurchase } from "../../../apps/web/src/lib/hosted-ai-usage-db";
import { hostedAiTaskAccounting } from "../../../apps/web/src/lib/hosted-ai-task-accounting";
import { ensureHostedAppSchema, getHostedServerDatabase } from "../../../apps/web/src/lib/hosted-server-db";

const localDatabase = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
describe.skipIf(!localDatabase)("hosted AI database mode on actual PostgreSQL", () => {
  let admin: Pool;
  let schema: string;
  let testEnv: Record<string, string>;
  let liveEnv: Record<string, string>;
  const terms = { ownerId: "fictional_owner", stripeCustomerId: "cus_synthetic", amountPaidCents: 1500, creditedBudgetCents: 1000 };
  const budget = { ownerId: terms.ownerId, cycleKey: "2026-11", includedBudgetCents: 0 };
  const attempt = { task: "workspace-summary" as const, profileId: "luna-high" as const, modelId: "gpt-6-luna", startedAt: "2026-11-12T12:00:00Z", maximumChargeCents: 1000, attempt: 1 as const };

  beforeEach(async () => {
    const base = new URL(localDatabase ?? "postgresql://ai_test@127.0.0.1:1/postgres");
    if (base.hostname !== "127.0.0.1" || base.username !== "ai_test" || !base.port || base.password || base.search || base.hash) throw new Error("Dedicated local database required.");
    admin = new Pool({ connectionString: base.toString(), max: 1 });
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^16\.16(?:\s|$)/);
    schema = `ai_mode_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    base.searchParams.set("options", `-csearch_path=${schema}`);
    testEnv = { DATABASE_URL: base.toString(), TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "test", TAX_ENGINE_BILLING_MODE: "test" };
    liveEnv = { ...testEnv, TAX_ENGINE_BILLING_MODE: "live" };
    await ensureHostedAppSchema(testEnv);
  });
  afterEach(async () => {
    const { db, pool } = await getHostedServerDatabase(testEnv);
    await db.destroy();
    if (!pool.ending && !pool.ended) await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  it("rejects live access to exact test grants on the same schema", async () => {
    const purchase = { ...terms, checkoutSessionId: "cs_test_mode", currency: "usd", createdAt: "2026-11-12T12:00:00Z", eventId: "evt_mode_test", eventType: "checkout.session.completed" as const };
    expect(await recordHostedAiCreditPurchase(testEnv, purchase)).toBe(true);
    expect(await getHostedAiBudgetSnapshot(testEnv, budget)).toMatchObject({ purchasedRemainingCents: 1000 });
    await expect(getHostedAiBudgetSnapshot(liveEnv, budget)).rejects.toThrow(/database mode/i);
    const liveAccounting = hostedAiTaskAccounting({ ...budget, requestId: "wrong_mode", requestPayload: { synthetic: true } }, liveEnv);
    await expect(liveAccounting.beforeAttempt?.(attempt)).rejects.toThrow(/database mode/i);
    await expect(createHostedAiCreditIssuance(liveEnv, { ...terms, livemode: true })).rejects.toThrow(/database mode/i);
    await expect(recordHostedAiCreditPurchase(liveEnv, { ...purchase, checkoutSessionId: "cs_live_mode", eventId: "evt_mode_live" })).rejects.toThrow(/database mode/i);
    expect((await admin.query(`SELECT count(*)::text AS count FROM ${schema}.hosted_ai_reservations`)).rows).toEqual([{ count: "0" }]);
    expect((await admin.query(`SELECT count(*)::text AS count FROM ${schema}.hosted_billing_events`)).rows).toEqual([{ count: "1" }]);
    const testAccounting = hostedAiTaskAccounting({ ...budget, requestId: "right_mode", requestPayload: { synthetic: true } }, testEnv);
    await testAccounting.beforeAttempt?.(attempt);
    expect(await getHostedAiBudgetSnapshot(testEnv, budget)).toMatchObject({ purchasedUsedCents: 1000, purchasedRemainingCents: 0 });
    await testAccounting.recordAttempt?.(attempt, { accepted: true, usage: { inputTokens: 1, outputTokens: 1 } });
    expect(await getHostedAiBudgetSnapshot(testEnv, budget)).toMatchObject({ purchasedUsedCents: 1, purchasedRemainingCents: 999 });
  });

  it("chooses one database mode under concurrent first use", async () => {
    const outcomes = await Promise.allSettled([
      createHostedAiCreditIssuance(testEnv, { ...terms, livemode: false }),
      createHostedAiCreditIssuance(liveEnv, { ...terms, livemode: true }),
    ]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    const loser = outcomes.find(outcome => outcome.status === "rejected");
    expect(loser?.reason).toBeInstanceOf(Error);
    expect(loser?.reason.message).toMatch(/database mode/i);
    const mode = outcomes[0].status === "fulfilled" ? "test" : "live";
    expect((await admin.query(`SELECT mode FROM ${schema}.hosted_ai_storage_mode`)).rows).toEqual([{ mode }]);
    await expect(admin.query(`UPDATE ${schema}.hosted_ai_storage_mode SET mode='live'`)).rejects.toThrow(/immutable/i);
    await expect(admin.query(`DELETE FROM ${schema}.hosted_ai_storage_mode`)).rejects.toThrow(/immutable/i);
    await expect(admin.query(`TRUNCATE ${schema}.hosted_ai_storage_mode`)).rejects.toThrow(/immutable/i);
  });

  it("holds historical AI rows without assigning either mode", async () => {
    const seed = `INSERT INTO ${schema}.hosted_ai_credit_purchases (checkout_session_id,owner_id,amount_paid_cents,credited_budget_cents)
      VALUES ('cs_live_uncorroborated',$1,1500,1000)`;
    await admin.query(seed, [terms.ownerId]);
    for (const env of [testEnv, liveEnv]) {
      await expect(getHostedAiBudgetSnapshot(env, budget)).rejects.toThrow(/historical AI accounting/i);
    }
    expect((await admin.query(`SELECT mode FROM ${schema}.hosted_ai_storage_mode`)).rows).toEqual([]);
    expect((await admin.query(`SELECT credited_budget_cents FROM ${schema}.hosted_ai_credit_purchases`)).rows).toEqual([{ credited_budget_cents: 1000 }]);
    expect((await admin.query(`INSERT INTO ${schema}.hosted_reminder_settings (owner_id) VALUES ($1)`, [terms.ownerId])).rowCount).toBe(1);
  });

  it("keeps an empty budget read neutral and prevents test access to a live binding", async () => {
    expect(await getHostedAiBudgetSnapshot(testEnv, budget)).toMatchObject({ totalRemainingCents: 0 });
    expect((await admin.query(`SELECT mode FROM ${schema}.hosted_ai_storage_mode`)).rows).toEqual([]);
    expect((await createHostedAiCreditIssuance(liveEnv, { ...terms, livemode: true })).livemode).toBe(true);
    expect(await getHostedAiBudgetSnapshot(liveEnv, budget)).toMatchObject({ purchasedRemainingCents: 0 });
    await expect(getHostedAiBudgetSnapshot(testEnv, budget)).rejects.toThrow(/database mode/i);
    await expect(createHostedAiCreditIssuance(liveEnv, { ...terms, livemode: false })).rejects.toThrow(/issuance terms/i);
  });
});
