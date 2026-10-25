import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { createHostedAiLedger } from "../../../apps/web/src/lib/hosted-ai-ledger";
import { ensureHostedAiLedgerSchema } from "../../../apps/web/src/lib/hosted-ai-ledger-schema";

const base = { ownerId: "synthetic-owner", requestId: "request-1", payloadDigest: "a".repeat(64), cycleKey: "2026-10", includedBudgetCents: 3, maximumChargeCents: 2 };
describe("AI ledger input boundary", () => {
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects invalid reserve cents %s before DB access", async cents => {
    const connect = vi.fn();
    await expect(createHostedAiLedger({ connect } as never).reserve({ ...base, maximumChargeCents: cents })).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });
  it.each([{ ownerId: "" }, { payloadDigest: "raw taxpayer contents" }, { cycleKey: "" }, { maximumChargeCents: 0 }])("rejects invalid metadata %j", async fields => {
    const connect = vi.fn();
    await expect(createHostedAiLedger({ connect } as never).reserve({ ...base, ...fields })).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });
});

// Explicit isolated PostgreSQL only. No default or staging DATABASE_URL is reused.
const databaseUrl = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
describe.skipIf(!databaseUrl)("AI credits against isolated PostgreSQL", () => {
  const require = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
  const { Pool } = require("pg") as typeof import("../../../apps/web/node_modules/pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const ledger = createHostedAiLedger(pool);
  const usage = { inputTokens: 1000, outputTokens: 1000, cachedInputTokens: 200 };
  const first = { ownerId: base.ownerId, requestId: base.requestId, attempt: 1 as const };
  async function start(fields = {}) {
    return ledger.start({ ...first, task: "workspace-summary", profileId: "luna-high", startedAt: "2026-10-25T02:00:00Z", ...fields });
  }
  beforeAll(async () => {
    if (!databaseUrl || !/^postgres(?:ql)?:\/\/(?:ai_test@)?(?:127\.0\.0\.1|localhost):/.test(databaseUrl)) throw new Error("Use a disposable loopback PostgreSQL database.");
    await pool.query(`CREATE TABLE IF NOT EXISTS hosted_ai_credit_purchases (checkout_session_id TEXT PRIMARY KEY, owner_id TEXT, credited_budget_cents BIGINT);
      CREATE TABLE IF NOT EXISTS hosted_ai_usage_ledger (request_id TEXT PRIMARY KEY, owner_id TEXT, cycle_key TEXT, included_charge_cents BIGINT, purchased_charge_cents BIGINT);`);
    await ensureHostedAiLedgerSchema(pool);
  });
  beforeEach(async () => { await pool.query("TRUNCATE hosted_ai_attempts, hosted_ai_reservations, hosted_ai_credit_purchases, hosted_ai_usage_ledger"); });
  afterAll(async () => { await pool.end(); });
  it("serializes concurrent spend and releases the unused hold after exact settlement", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => ledger.reserve({ ...base, requestId: `parallel-${i}` })));
    expect(results.filter(result => result.accepted)).toHaveLength(1);
    const requestId = results.find(result => result.accepted)?.reservation?.requestId;
    if (!requestId) throw new Error("Expected one accepted reservation.");
    await start({ requestId });
    const settled = await ledger.settle({ ...first, requestId, usage, accepted: true, final: true });
    expect(settled).toMatchObject({ state: "settled", reservedCents: 0, chargedCents: 1 });
    expect((await ledger.reserve(base)).accepted).toBe(true);
    const cost = await pool.query("SELECT provider_cost_usd::text FROM hosted_ai_attempts");
    expect(cost.rows[0].provider_cost_usd).toBe("0.000582");
  });
  it("scopes idempotency to the owner and binds it to the content digest", async () => {
    const results = await Promise.all([ledger.reserve(base), ledger.reserve(base)]);
    expect(results.filter(value => value.created)).toHaveLength(1);
    expect((await ledger.reserve({ ...base, ownerId: "other-owner" })).created).toBe(true);
    await expect(ledger.reserve({ ...base, payloadDigest: "b".repeat(64) })).rejects.toThrow(/different content/);
    await expect(ledger.cancel({ ...first, ownerId: "unknown-owner" })).rejects.toThrow(/not found/);
  });
  it("holds unknown usage across cancellation and reconciles it only with evidence", async () => {
    await ledger.reserve(base); await start();
    expect(await start()).toBe(false);
    await ledger.unknown(first);
    await expect(ledger.cancel(first)).rejects.toThrow(/settled or reconciled/);
    await expect(ledger.settle({ ...first, usage, accepted: false, final: true })).rejects.toThrow(/reference/);
    expect((await ledger.reserve({ ...base, requestId: "blocked" })).accepted).toBe(false);
    const settled = await ledger.settle({ ...first, usage, accepted: false, final: true, reconciliationReference: "synthetic-provider-report:1" });
    expect(settled.chargedCents).toBe(1);
    expect(await ledger.settle({ ...first, usage, accepted: false, final: true })).toEqual(settled);
    await expect(ledger.settle({ ...first, usage: { ...usage, outputTokens: 9 }, accepted: false, final: true })).rejects.toThrow(/Conflicting/);
    await expect(ledger.settle({ ...first, usage, accepted: true, final: true })).rejects.toThrow(/Conflicting/);
  });
  it("includes a failed attempt and one explicit escalation in one minimum retail charge", async () => {
    await ledger.reserve({ ...base, maximumChargeCents: 3 }); await start();
    await ledger.settle({ ...first, usage, accepted: false, final: false });
    await expect(start({ attempt: 2 })).rejects.toThrow(/Sol High/);
    await start({ attempt: 2, task: "complex-reconciliation", profileId: "sol-high" });
    const result = await ledger.settle({ ...first, attempt: 2, usage: { inputTokens: 1000, outputTokens: 1000 }, accepted: true, final: true });
    expect(result).toMatchObject({ state: "settled", chargedCents: 2, reservedCents: 0 });
    const total = await pool.query("SELECT SUM(provider_cost_usd)::text AS cost FROM hosted_ai_attempts");
    expect(total.rows[0].cost).toBe("0.012582");
  });
  it("preserves exact overrun cost without charging beyond the authorized hold", async () => {
    await ledger.reserve(base); await start();
    const result = await ledger.settle({ ...first, usage: { inputTokens: 1000, outputTokens: 100000 }, accepted: false, final: true });
    expect(result).toMatchObject({ state: "reconciliation-required", chargedCents: 2, reservedCents: 0 });
    const cost = await pool.query("SELECT provider_cost_usd::text FROM hosted_ai_attempts");
    expect(cost.rows[0].provider_cost_usd).toBe("0.0501");
  });
  it("releases only unstarted requests, and preserves original charges on idempotent refund", async () => {
    await ledger.reserve(base);
    expect((await ledger.cancel(base)).state).toBe("cancelled");
    expect((await ledger.cancel(base)).reservedCents).toBe(0);
    await ledger.reserve({ ...base, requestId: "charge" }); await start({ requestId: "charge" });
    await ledger.settle({ ...first, requestId: "charge", usage, accepted: true, final: true });
    await expect(ledger.refund({ ...first, requestId: "charge", reference: "" })).rejects.toThrow();
    const refund = await ledger.refund({ ...first, requestId: "charge", reference: "authorized-refund:1" });
    expect(refund).toMatchObject({ state: "refunded", chargedCents: 1 });
    expect(await ledger.refund({ ...first, requestId: "charge", reference: "authorized-refund:1" })).toEqual(refund);
    await expect(ledger.refund({ ...first, requestId: "charge", reference: "other" })).rejects.toThrow(/Conflicting/);
    expect((await ledger.reserve({ ...base, requestId: "after-refund", maximumChargeCents: 3 })).accepted).toBe(true);
  });
  it("shares purchased credits across billing cycles and includes historical charges", async () => {
    await pool.query("INSERT INTO hosted_ai_credit_purchases VALUES ('purchase','synthetic-owner',3)");
    await pool.query("INSERT INTO hosted_ai_usage_ledger VALUES ('legacy','synthetic-owner','old',0,1)");
    const results = await Promise.all(["cycle-1", "cycle-2"].map(cycleKey => ledger.reserve({ ...base, cycleKey, requestId: cycleKey, includedBudgetCents: 0, maximumChargeCents: 2 })));
    expect(results.filter(value => value.accepted)).toHaveLength(1);
  });
  it("can finalize a known rejection without taking the reserved optional escalation", async () => {
    await ledger.reserve(base); await start();
    await ledger.settle({ ...first, usage, accepted: false, final: false });
    const result = await ledger.settle({ ...first, usage, accepted: false, final: true });
    expect(result).toMatchObject({ state: "settled", chargedCents: 1, reservedCents: 0 });
  });
});
