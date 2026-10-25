import { describe, expect, it } from "vitest";
import { createProviderEvalPlan, executeProviderEval, providerEvalDigest, reconcileProviderEvalAttempt, validatePlan, type EvalJournalRecord } from "../../scripts/lib/provider-eval-runner";
import { taxProviderModelEvalFixtures } from "../../packages/engine/src/provider-eval-fixtures";
import { providerModelCandidates } from "../../packages/engine/src/provider-model-eval";
import { AI_TASKS } from "../../packages/engine/src/ai-task-registry";
import { PROVIDER_EVAL_CONTRACT } from "../../scripts/lib/provider-eval-contract";
const at = "2026-10-25T12:00:00.000Z";
function setup(maximumProviderUsd = "1") {
  const plan = createProviderEvalPlan({ runId: "test-run", purpose: "smoke", profileIds: ["luna-high"],
    fixtureIds: ["case-income-w2-zero-withholding"], maximumProviderUsd, maximumRequests: 4,
    createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" });
  const approval = { version: 1, planDigest: providerEvalDigest(plan), authorizedBy: "synthetic-test-owner",
    authorizationReference: "test-only-not-live-authority", approvedAt: at, expiresAt: plan.expiresAt,
    maximumProviderUsd, maximumRequests: 4, accountReference: "test-account", syntheticOnly: true };
  const records: EvalJournalRecord[] = [];
  return { plan, approval, records, append: async (record: EvalJournalRecord) => { records.push(structuredClone(record)); }, now: () => at };
}
const good = { status: "completed" as const, usage: { inputTokens: 100, outputTokens: 100 }, elapsedMs: 50,
  reportedModel: "gpt-6-luna", responseReference: "response:test", payload: { probe: "ok" } };
describe("guarded repeated provider executor", () => {
  it("requires exact current approval before any paid dispatch", async () => {
    const state = setup(); let calls = 0;
    const transport = async () => { calls++; return good; };
    await expect(executeProviderEval({ ...state, approval: null, transport })).rejects.toThrow(/approval/i);
    await expect(executeProviderEval({ ...state, approval: { ...state.approval, planDigest: "wrong" }, transport })).rejects.toThrow(/approval/i);
    await expect(executeProviderEval({ ...state, approval: { ...state.approval, expiresAt: "2026-10-24T00:00:00Z" }, transport })).rejects.toThrow(/approval/i);
    expect(calls).toBe(0); expect(state.records).toEqual([]);
  });
  it("bounds failed and repeated attempts with exact Decimal costs", async () => {
    const state = setup("0.0044"); let calls = 0;
    const result = await executeProviderEval({ ...state, transport: async () => { calls++; return { ...good, payload: calls === 1 ? { probe: "ok" } : { invalid: true } }; } });
    expect(calls).toBe(1);
    expect(result.knownProviderCostUsd).toBe("0.00006");
    expect(result.stoppedReason).toBe("budget");
    expect(result.template.availability?.[0]?.status).toBe("available");
  });
  it("retains unknown usage and never repeats a dispatched request on resume", async () => {
    const state = setup(); let calls = 0;
    const transport = async () => { calls++; throw new Error("secret raw provider error"); };
    const first = await executeProviderEval({ ...state, transport });
    const second = await executeProviderEval({ ...state, transport });
    expect(calls).toBe(1);
    expect(first.stoppedReason).toBe("unknown-usage");
    expect(second.stoppedReason).toBe("unknown-usage");
    expect(first.unknownMaximumUsd).not.toBe("0");
    expect(JSON.stringify(state.records)).not.toContain("secret raw");
  });
  it("keeps expected answers private and normalization gaps unqualified", async () => {
    const state = setup(); const requests: unknown[] = [];
    const result = await executeProviderEval({ ...state, transport: async request => { requests.push(request);
      return { ...good, payload: requests.length === 1 ? { probe: "ok" } : { applicationOutput: JSON.stringify({ disposition: "answer", sourceIds: ["case-income-w2-zero-withholding:source"], facts: [], label: "Statement", payer: "[organization-1]", documentPeriod: "2026", summary: "Unconfirmed extraction", suggestions: [] }), disposition: "answer", fields: [], category: null, sourceIds: ["case-income-w2-zero-withholding:source"], engineValues: [], filingReady: false } }; } });
    expect(requests).toHaveLength(4);
    expect(JSON.stringify(requests)).not.toContain("reviewCriteria");
    expect(JSON.stringify(requests)).not.toContain('"expected"');
    expect(result.template.entries).toHaveLength(3);
    expect(result.template.entries.every(entry => entry.independentReview === null)).toBe(true);
    expect(result.bindingBlockers.length).toBeGreaterThan(0);
    expect(result.productionPromotion).toBe(false);
  });
  it("retains failed-output charges and resumes without additional requests", async () => {
    const state = setup(); let calls = 0;
    const transport = async () => { calls++; return { ...good, payload: calls === 1 ? { probe: "ok" } : { invalid: true } }; };
    const first = await executeProviderEval({ ...state, transport });
    const resumed = await executeProviderEval({ ...state, transport });
    expect(calls).toBe(4); expect(first.knownProviderCostUsd).toBe("0.00024");
    expect(resumed.knownProviderCostUsd).toBe("0.00024");
    expect(first.template.entries.map(entry => entry.repeat)).toEqual([1, 2, 3]);
    expect(first.template.entries.every(entry => entry.applicationSchemaValid === false)).toBe(true);
  });
  it("resumes after referenced usage reconciliation without repeating the uncertain case", async () => {
    const state = setup(); const seen: string[] = [];
    const transport = async (request: { attemptId: string }) => {
      seen.push(request.attemptId); if (seen.length === 2) throw new Error("transport ambiguity");
      return good;
    };
    const first = await executeProviderEval({ ...state, transport });
    expect(first.stoppedReason).toBe("unknown-usage");
    const attemptId = "luna-high:case-income-w2-zero-withholding:1";
    await state.append(reconcileProviderEvalAttempt(state.plan, state.records, { attemptId, evidenceReference: "synthetic-usage-statement-1", usage: { inputTokens: 100, outputTokens: 200 }, at }));
    const resumed = await executeProviderEval({ ...state, transport });
    expect(seen).toHaveLength(4); expect(new Set(seen).size).toBe(4);
    expect(resumed.knownProviderCostUsd).toBe("0.00029"); expect(resumed.unknownMaximumUsd).toBe("0");
    expect(resumed.template.entries[0]?.output).toBeNull();
    expect(() => reconcileProviderEvalAttempt(state.plan, state.records, { attemptId, evidenceReference: "second", usage: good.usage, at })).toThrow(/once/);
  });
  it("requires durable dispatch and current capability evidence before more calls", async () => {
    let calls = 0;
    const transport = async () => { calls++; return good; };
    await expect(executeProviderEval({ ...setup(), append: async () => {}, transport })).rejects.toThrow(/persist|durable/i);
    expect(calls).toBe(0);
    const state = setup();
    const plan = { ...state.plan, expiresAt: "2026-10-28T13:00:00.000Z" };
    const approval = { ...state.approval, planDigest: providerEvalDigest(plan), expiresAt: plan.expiresAt };
    let time = at;
    const result = await executeProviderEval({ ...state, plan, approval, now: () => time, transport: async () => { calls++; time = "2026-10-26T12:00:00.000Z"; return good; } });
    expect(calls).toBe(1); expect(result.stoppedReason).toBe("capability-expired");
  });
  it("preserves overrun costs and stops cancellation and request ceilings", async () => {
    const overrun = await executeProviderEval({ ...setup(), transport: async () => ({ ...good, usage: { inputTokens: 100000, outputTokens: 100000 } }) });
    expect(overrun.knownProviderCostUsd).toBe("0.06"); expect(overrun.stoppedReason).toBe("provider-overrun");
    const state = setup(); const controller = new AbortController();
    const cancelled = await executeProviderEval({ ...state, signal: controller.signal, transport: async () => { controller.abort(); return good; } });
    expect(cancelled.dispatchedRequests).toBe(1); expect(cancelled.stoppedReason).toBe("cancelled");
    const limited = setup(); const plan = { ...limited.plan, maximumRequests: 1 };
    const result = await executeProviderEval({ ...limited, plan, approval: { ...limited.approval, planDigest: providerEvalDigest(plan), maximumRequests: 1 }, transport: async () => good });
    expect(result.dispatchedRequests).toBe(1); expect(result.stoppedReason).toBe("request-limit");
    expect(() => validatePlan({ ...plan, pricingDigest: "old" })).toThrow(/stale/);
    expect(() => createProviderEvalPlan({ runId: "qualification", purpose: "qualification", profileIds: ["luna-high"], maximumProviderUsd: "1", maximumRequests: 1, createdAt: at, expiresAt: plan.expiresAt })).toThrow(/reviewed corpus/);
  });
  it("reserves held-out cases for reviewed qualification plans", () => {
    const heldOut = taxProviderModelEvalFixtures.find(fixture => fixture.split === "held-out");
    if (!heldOut) throw new Error("Missing declared held-out case.");
    const input = { runId: "smoke", purpose: "smoke" as const, profileIds: ["luna-high"], maximumProviderUsd: "1", maximumRequests: 1000,
      createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" };
    expect(() => createProviderEvalPlan({ ...input, fixtureIds: [heldOut.id] })).toThrow(/held-out/i);
    expect(createProviderEvalPlan(input).fixtureIds).toHaveLength(160);
  });
  it("rejects qualification planning while production bindings are unsupported", () => {
    const reviewed = taxProviderModelEvalFixtures.map(fixture => ({ ...fixture, review: { ...fixture.review,
      status: "reviewed" as const, reviewer: "synthetic-independent-reviewer", reviewedAt: at } }));
    expect(() => createProviderEvalPlan({ runId: "qualification", purpose: "qualification", profileIds: ["luna-high"],
      maximumProviderUsd: "1", maximumRequests: 1000, createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" }, reviewed)).toThrow(/binding/i);
  });
  it("rejects same-ID model and request policy changes after planning", () => {
    const { plan } = setup(); const selected = providerModelCandidates.find(item => item.id === "luna-high");
    if (!selected) throw new Error("Missing profile.");
    const originalModel = selected.model;
    try { Object.assign(selected, { model: "gpt-6.1-sol" }); expect(() => validatePlan(plan)).toThrow(/policy|contract|stale/i); }
    finally { Object.assign(selected, { model: originalModel }); }
    const timeoutMs = PROVIDER_EVAL_CONTRACT.capability.timeoutMs;
    try { Object.assign(PROVIDER_EVAL_CONTRACT.capability, { timeoutMs: 31000 }); expect(() => validatePlan(plan)).toThrow(/policy|contract|stale/i); }
    finally { Object.assign(PROVIDER_EVAL_CONTRACT.capability, { timeoutMs }); }
    // The frozen registry cannot be mutated in a process; a changed saved digest
    // represents a configuration update and must reject too.
    expect(() => validatePlan({ ...plan, executionDigest: "old-timeout-or-output-budget" })).toThrow();
    expect(AI_TASKS["income-extraction"].maxOutputTokens).toBe(8192);
  });
});
