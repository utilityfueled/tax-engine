import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { createHostedAiLedger } from "../../../apps/web/src/lib/hosted-ai-ledger";
import { ensureHostedAiLedgerSchema } from "../../../apps/web/src/lib/hosted-ai-ledger-schema";
import { ensureHostedAiStorageModeSchema } from "../../../apps/web/src/lib/hosted-ai-storage-mode";

const base = { ownerId: "synthetic-owner", requestId: "request-1", payloadDigest: "a".repeat(64), cycleKey: "2026-10", includedBudgetCents: 3, maximumChargeCents: 2 };
describe("AI ledger input boundary", () => {
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects invalid reserve cents %s before DB access", async cents => {
    const connect = vi.fn();
    await expect(createHostedAiLedger({ connect } as never, "test").reserve({ ...base, maximumChargeCents: cents })).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });
  it.each([{ ownerId: "" }, { payloadDigest: "raw taxpayer contents" }, { cycleKey: "" }, { maximumChargeCents: 0 }])("rejects invalid metadata %j", async fields => {
    const connect = vi.fn();
    await expect(createHostedAiLedger({ connect } as never, "test").reserve({ ...base, ...fields })).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });
});

// Explicit isolated PostgreSQL only. No default or staging DATABASE_URL is reused.
const databaseUrl = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
describe.skipIf(!databaseUrl)("AI credits against isolated PostgreSQL", () => {
  const require = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
  const { Pool } = require("pg") as typeof import("../../../apps/web/node_modules/pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const ledger = createHostedAiLedger(pool, "test");
  const usage = { inputTokens: 1000, outputTokens: 1000, cachedInputTokens: 200 };
  const first = { ownerId: base.ownerId, requestId: base.requestId, attempt: 1 as const };
  async function start(fields = {}) {
    return ledger.start({ ...first, task: "workspace-summary", profileId: "luna-high", startedAt: "2026-10-25T02:00:00Z", ...fields });
  }
  beforeAll(async () => {
    if (!databaseUrl || !/^postgres(?:ql)?:\/\/(?:ai_test@)?(?:127\.0\.0\.1|localhost):/.test(databaseUrl)) throw new Error("Use a disposable loopback PostgreSQL database.");
    await pool.query(`CREATE TABLE IF NOT EXISTS hosted_ai_credit_purchases (checkout_session_id TEXT PRIMARY KEY, owner_id TEXT, credited_budget_cents BIGINT);
      CREATE TABLE IF NOT EXISTS hosted_ai_usage_ledger (request_id TEXT PRIMARY KEY, owner_id TEXT, cycle_key TEXT, included_charge_cents BIGINT, purchased_charge_cents BIGINT);
      CREATE TABLE IF NOT EXISTS hosted_ai_credit_issuances (issuance_id TEXT PRIMARY KEY);`);
    await ensureHostedAiLedgerSchema(pool);
    await ensureHostedAiStorageModeSchema(pool);
    // This disposable fixture's existing grants and charges are synthetic test rows.
    await pool.query("INSERT INTO hosted_ai_storage_mode (mode) VALUES ('test') ON CONFLICT DO NOTHING");
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
  // Spec: federal/ai-provider-refresh.yaml, pricing-utc-day.
  it.each([
    { startedAt: "2026-12-31T23:30:00+01:00", effectiveFrom: "2026-10-24", providerCostUsd: "0.00075" },
    { startedAt: "2026-12-31T23:30:00-01:00", effectiveFrom: "2027-01-01", providerCostUsd: "0.0015" },
  ])("settles exact Gemini cost using the UTC rate for $startedAt", async ({ startedAt, effectiveFrom, providerCostUsd }) => {
    expect(await ledger.reserve({ ...base, cycleKey: "2026-12" })).toMatchObject({ accepted: true, created: true });
    expect(await start({ profileId: "gemini-flash-high", startedAt })).toBe(true);
    const settled = await ledger.settle({ ...first, usage: { inputTokens: 1000, outputTokens: 0 }, accepted: true, final: true });
    expect(settled).toMatchObject({ state: "settled", reservedCents: 0, chargedCents: 1 });

    const { rows } = await pool.query(`SELECT a.pricing_effective_from, a.provider_cost_usd::text,
      r.included_charge_cents::text, r.purchased_charge_cents::text
      FROM hosted_ai_attempts a JOIN hosted_ai_reservations r USING (owner_id, request_id)
      WHERE a.owner_id = $1 AND a.request_id = $2`, [first.ownerId, first.requestId]);
    expect(rows).toEqual([{
      pricing_effective_from: effectiveFrom, provider_cost_usd: providerCostUsd,
      included_charge_cents: "1", purchased_charge_cents: "0",
    }]);
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
    const evidence = { ...first, usage, accepted: false, final: true, reconciliationReference: "synthetic-provider-report:1" };
    await expect(ledger.settle(evidence)).rejects.toThrow(/authorized model/);
    await expect(ledger.settle({ ...evidence, reconciledModelId: "gpt-6.1-sol" })).rejects.toThrow(/authorized model/);
    expect((await ledger.reserve({ ...base, requestId: "still-held" })).accepted).toBe(false);
    const settled = await ledger.settle({ ...evidence, reconciledModelId: "gpt-6-luna" });
    expect(settled.chargedCents).toBe(1);
    expect(await ledger.settle({ ...first, usage, accepted: false, final: true })).toEqual(settled);
    await expect(ledger.settle({ ...first, usage: { ...usage, outputTokens: 9 }, accepted: false, final: true })).rejects.toThrow(/Conflicting/);
    await expect(ledger.settle({ ...first, usage, accepted: true, final: true })).rejects.toThrow(/Conflicting/);
  });
  it("retains a provider identifier while reconciling unknown usage", async () => {
    await ledger.reserve(base); await start();
    await ledger.unknown(first);
    await ledger.unknown({ ...first, providerRequestId: "req_synthetic_original" });
    await ledger.unknown(first);
    const readAttempt = async () => (await pool.query("SELECT state, provider_request_id, reconciliation_reference, provider_cost_usd::text FROM hosted_ai_attempts")).rows[0];
    expect(await readAttempt()).toMatchObject({ state: "unknown", provider_request_id: "req_synthetic_original", provider_cost_usd: null });
    await expect(ledger.unknown({ ...first, providerRequestId: "req_synthetic_conflict" })).rejects.toThrow(/Conflicting.*identifier/);
    const outcome = { ...first, usage, accepted: false, final: true, reconciliationReference: "synthetic-provider-report:2", reconciledModelId: "gpt-6-luna" };
    await expect(ledger.settle({ ...outcome, providerRequestId: "req_synthetic_conflict" })).rejects.toThrow(/Conflicting.*identifier/);
    expect((await readAttempt()).state).toBe("unknown");
    const settled = await ledger.settle(outcome);
    expect(settled).toMatchObject({ chargedCents: 1, reservedCents: 0 });
    expect(await readAttempt()).toMatchObject({ state: "rejected", provider_request_id: "req_synthetic_original",
      reconciliation_reference: "synthetic-provider-report:2", provider_cost_usd: "0.000582" });
    expect(await ledger.settle({ ...outcome, providerRequestId: "req_synthetic_original" })).toEqual(settled);
    await expect(ledger.settle({ ...outcome, reconciliationReference: "synthetic-provider-report:other" })).rejects.toThrow(/Conflicting.*reference/);
  });
  it("requires model evidence when interruption leaves an attempt running", async () => {
    await ledger.reserve(base);
    await start();
    const outcome = { ...first, usage, accepted: false, final: true };
    const reconciliationReference = "synthetic-provider-report:interrupted";
    await expect(ledger.settle({ ...outcome, reconciliationReference })).rejects.toThrow(/authorized model/);
    await expect(ledger.settle({ ...outcome, reconciledModelId: "gpt-6-luna" })).rejects.toThrow(/reference/);
    await expect(ledger.settle({ ...outcome, reconciliationReference, reconciledModelId: "gpt-6-luna" }))
      .resolves.toMatchObject({ chargedCents: 1, reservedCents: 0 });
    await expect(ledger.settle(outcome)).resolves.toMatchObject({ chargedCents: 1, reservedCents: 0 });
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
  it("releases an undispatched hold while preserving any exact first attempt cost", async () => {
    await ledger.reserve(base); await start();
    const cancelled = await ledger.cancelUndispatched(first);
    expect(cancelled).toMatchObject({ state: "cancelled", reservedCents: 0, chargedCents: 0 });
    expect(await ledger.cancelUndispatched(first)).toEqual(cancelled);
    await expect(ledger.settle({ ...first, usage, accepted: false, final: true })).rejects.toThrow(/never dispatched/u);
    const next = { ...base, requestId: "second-request", maximumChargeCents: 3 };
    expect((await ledger.reserve(next)).created).toBe(true);
    await start(next);
    await ledger.settle({ ...first, requestId: next.requestId, usage, accepted: false, final: false });
    await start({ ...next, attempt: 2, task: "complex-reconciliation", profileId: "sol-high" });
    const second = { ...first, requestId: next.requestId, attempt: 2 as const };
    const settled = await ledger.cancelUndispatched(second);
    expect(settled).toMatchObject({ state: "settled", reservedCents: 0, chargedCents: 1 });
    expect(await ledger.cancelUndispatched(second)).toEqual(settled);
    const result = await pool.query(`SELECT request_id, attempt, undispatched_at IS NOT NULL AS undispatched,
      provider_cost_usd::text AS exact_cost FROM hosted_ai_attempts ORDER BY request_id, attempt`);
    expect(result.rows).toEqual([
      { request_id: first.requestId, attempt: 1, undispatched: true, exact_cost: "0" },
      { request_id: next.requestId, attempt: 1, undispatched: false, exact_cost: "0.000582" },
      { request_id: next.requestId, attempt: 2, undispatched: true, exact_cost: "0" },
    ]);
  });
  it("keeps potentially dispatched usage held after an undispatched cancellation claim", async () => {
    await ledger.reserve(base); await start();
    await ledger.unknown({ ...first, providerRequestId: "req_synthetic" });
    await expect(ledger.cancelUndispatched(first)).rejects.toThrow(/provider usage/u);
    expect((await ledger.reserve({ ...base, requestId: "held" })).accepted).toBe(false);
  });
  it("keeps a known first attempt overrun reconcilable after refusing the second dispatch", async () => {
    await ledger.reserve(base); await start();
    await ledger.settle({ ...first, usage: { inputTokens: 1000, outputTokens: 100000 }, accepted: false, final: false });
    await start({ attempt: 2, task: "complex-reconciliation", profileId: "sol-high" });
    expect(await ledger.cancelUndispatched({ ...first, attempt: 2 })).toMatchObject({
      state: "reconciliation-required", chargedCents: 2, reservedCents: 0,
    });
    expect(await ledger.reconcileOverrun({ ...first, reference: "synthetic-operator:prior-attempt" })).toMatchObject({
      state: "settled", chargedCents: 2, reservedCents: 0,
    });
    const costs = await pool.query("SELECT provider_cost_usd::text AS cost FROM hosted_ai_attempts ORDER BY attempt");
    expect(costs.rows).toEqual([{ cost: "0.0501" }, { cost: "0" }]);
  });
  it("adds the undispatched marker without changing historical settled attempts", async () => {
    await ledger.reserve(base); await start();
    await ledger.settle({ ...first, usage, accepted: true, final: true });
    await pool.query("ALTER TABLE hosted_ai_attempts DROP COLUMN undispatched_at");
    try {
      await ensureHostedAiLedgerSchema(pool);
      await ensureHostedAiLedgerSchema(pool);
      const result = await pool.query("SELECT state, provider_cost_usd::text AS cost, usage, undispatched_at FROM hosted_ai_attempts");
      expect(result.rows).toEqual([{ state: "accepted", cost: "0.000582", usage, undispatched_at: null }]);
      await expect(pool.query("UPDATE hosted_ai_attempts SET undispatched_at=NOW()")).rejects.toMatchObject({ code: "23514" });
    } finally {
      await ensureHostedAiLedgerSchema(pool);
    }
  });
  it("closes an investigated known overrun without another debit and permits its refund", async () => {
    await ledger.reserve(base); await start();
    await ledger.settle({ ...first, usage: { inputTokens: 1000, outputTokens: 100000 }, accepted: false, final: true });
    await expect(ledger.refund({ ...first, reference: "too-soon" })).rejects.toThrow(/settled/);
    await expect(ledger.reconcileOverrun({ ...first, reference: "" })).rejects.toThrow(/reference/);
    const closed = await ledger.reconcileOverrun({ ...first, reference: "synthetic-operator:overrun" });
    expect(closed).toMatchObject({ state: "settled", chargedCents: 2, reservedCents: 0 });
    expect(await ledger.reconcileOverrun({ ...first, reference: "synthetic-operator:overrun" })).toEqual(closed);
    await expect(ledger.reconcileOverrun({ ...first, reference: "conflict" })).rejects.toThrow(/Conflicting/);
    expect((await pool.query("SELECT provider_cost_usd::text FROM hosted_ai_attempts")).rows[0].provider_cost_usd).toBe("0.0501");
    await ledger.refund({ ...first, reference: "synthetic-refund:overrun" });
    expect((await ledger.reserve({ ...base, requestId: "after-overrun-refund", maximumChargeCents: 3 })).accepted).toBe(true);
    await ensureHostedAiLedgerSchema(pool);
    expect((await pool.query("SELECT reconciliation_reference FROM hosted_ai_reservations WHERE request_id=$1", [first.requestId])).rows[0].reconciliation_reference).toBe("synthetic-operator:overrun");
  });
  it("cannot close unknown usage or unstarted work as an overrun", async () => {
    await ledger.reserve(base);
    await expect(ledger.reconcileOverrun({ ...first, reference: "synthetic" })).rejects.toThrow(/final known-usage/);
    await start(); await ledger.unknown(first);
    await expect(ledger.reconcileOverrun({ ...first, reference: "synthetic" })).rejects.toThrow(/final known-usage/);
    expect((await ledger.reserve({ ...base, requestId: "hold-still-active" })).accepted).toBe(false);
  });
});
