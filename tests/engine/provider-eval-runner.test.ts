import { describe, expect, it, vi } from "vitest";
import { createProviderEvalPlan, executeProviderEval, providerEvalDigest, providerEvalExecutionContract, reconcileProviderEvalAttempt, summarizeProviderEvalJournal, validatePlan, validateProviderEvalJournal, type EvalJournalRecord } from "../../scripts/lib/provider-eval-runner";
import { taxProviderModelEvalFixtures } from "../../packages/engine/src/provider-eval-fixtures";
import { providerModelCandidates, scoreProviderEvalEntry, summarizeProviderModelLiveEvalTemplate } from "../../packages/engine/src/provider-model-eval";
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
  it("journals an opaque OpenAI trace before each provider dispatch", async () => {
    const state = setup();
    const traces: string[] = [];
    const result = await executeProviderEval({ ...state, transport: async request => {
      const trace = request.clientRequestId;
      expect(trace).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
      expect(state.records.at(-1)).toMatchObject({ type: "dispatch", attemptId: request.attemptId, clientRequestId: trace });
      traces.push(trace ?? "");
      return good;
    } });
    expect(traces).toHaveLength(4);
    expect(new Set(traces).size).toBe(4);
    expect(JSON.stringify(result.template)).not.toContain(traces[0]);
    validateProviderEvalJournal(state.plan, state.records);
    const reused = state.records.map(record => record.type === "dispatch" ? { ...record, clientRequestId: traces[0] } : record);
    expect(() => validateProviderEvalJournal(state.plan, reused)).toThrow(/trace/i);
    const absent = state.records.map(record => record.type === "dispatch" ? { ...record, clientRequestId: undefined } : record);
    expect(() => validateProviderEvalJournal(state.plan, absent)).toThrow(/trace/i);
  });
  it("keeps historical traces absent and rejects a mismatched journal policy", async () => {
    const state = setup();
    const executionContract = providerEvalExecutionContract(state.plan.profileIds, "provider-eval-request/2");
    const plan = { ...state.plan, executionContract, executionDigest: providerEvalDigest(executionContract) };
    const approval = { ...state.approval, planDigest: providerEvalDigest(plan) };
    const traces: (string | undefined)[] = [];
    const result = await executeProviderEval({ ...state, plan, approval, transport: async request => {
      traces.push(request.clientRequestId);
      return { ...good, usage: null };
    } });
    expect(result.stoppedReason).toBe("unknown-usage");
    expect(traces).toEqual([undefined]);
    expect(state.records.some(record => record.type === "dispatch" && !("clientRequestId" in record))).toBe(true);
    validateProviderEvalJournal(plan, state.records);
    const mislabelled = state.records.map(record => record.type === "dispatch"
      ? { ...record, clientRequestId: "e341945d-1b77-4315-9720-a6761ebd0b11" } : record);
    expect(() => validateProviderEvalJournal(plan, mislabelled)).toThrow(/trace/i);
  });
  it("keeps expected answers private and derives actual application observations", async () => {
    const state = setup(); const requests: unknown[] = [];
    const result = await executeProviderEval({ ...state, transport: async request => { requests.push(request);
      return { ...good, payload: requests.length === 1 ? { probe: "ok" } : { disposition: "answer", sourceIds: ["case-income-w2-zero-withholding:source"], facts: [], label: "Statement", payer: "[organization-1]", documentPeriod: "2026", summary: "Unconfirmed extraction", suggestions: [] } }; } });
    expect(requests).toHaveLength(4);
    expect(JSON.stringify(requests)).not.toContain("reviewCriteria");
    expect(JSON.stringify(requests)).not.toContain('"expected"');
    expect(result.template.entries).toHaveLength(3);
    expect(result.template.entries.every(entry => entry.independentReview === null)).toBe(true);
    expect(result.bindingBlockers).toEqual([]);
    expect(result.template.entries.every(entry => entry.measurement?.normalizationStatus === "bound")).toBe(true);
    expect(result.productionPromotion).toBe(false);
  });
  it("retains failed-output charges and resumes without additional requests", async () => {
    const state = setup(); let calls = 0;
    const transport = async () => { calls++; return { ...good, status: calls === 2 ? "incomplete" as const : "completed" as const,
      payload: calls === 1 ? { probe: "ok" } : { invalid: true } }; };
    const first = await executeProviderEval({ ...state, transport });
    const resumed = await executeProviderEval({ ...state, transport });
    expect(calls).toBe(4); expect(first.knownProviderCostUsd).toBe("0.00024");
    expect(resumed.knownProviderCostUsd).toBe("0.00024");
    expect(first.template.entries.map(entry => entry.repeat)).toEqual([1, 2, 3]);
    expect(first.template.entries.map(entry => entry.applicationSchemaValid)).toEqual([null, false, false]);
    expect(() => reconcileProviderEvalAttempt(state.plan, state.records, { attemptId: "luna-high:case-income-w2-zero-withholding:1",
      evidenceReference: "would-duplicate-matched-usage", billedModel: "gpt-6-luna", usage: good.usage, at })).toThrow(/once/);
  });
  it.each([null, "gpt-6.1-sol", "gpt-6-luna-unverified-snapshot"])("holds live usage without matching model evidence and resumes without repeating it (%s)", async reportedModel => {
    const state = setup("0.015");
    const responseReference = "synthetic-unverified-response";
    const transport = vi.fn().mockResolvedValueOnce(good).mockResolvedValueOnce({ ...good, reportedModel, responseReference,
      usage: { inputTokens: 100, outputTokens: 4096 } }).mockResolvedValue(good);
    const first = await executeProviderEval({ ...state, transport });
    expect(first).toMatchObject({ stoppedReason: "unknown-usage", unknownMaximumUsd: "0.0111056", knownProviderCostUsd: "0.00006",
      legacyUnverifiedProviderCostUsd: "0" });
    const attemptId = "luna-high:case-income-w2-zero-withholding:1";
    const hashedReference = providerEvalDigest(responseReference);
    expect(state.records.at(-1)).toMatchObject({ type: "result", attemptId, reportedModel: null, usage: null, evaluation: null,
      responseReference: hashedReference });
    expect(first.template.entries[0]).toMatchObject({ output: null, attempts: [{ usage: null }], measurement: { responseReference: hashedReference } });
    expect(await executeProviderEval({ ...state, transport })).toMatchObject({ stoppedReason: "unknown-usage" });
    expect(transport).toHaveBeenCalledTimes(2);
    const evidence = { attemptId, evidenceReference: "verified-invoice-row", billedModel: "gpt-6-luna", usage: good.usage,
      at: "2026-10-25T12:00:00.000001Z" };
    await state.append(reconcileProviderEvalAttempt(state.plan, state.records, evidence));
    const resumed = await executeProviderEval({ ...state, transport });
    expect(resumed).toMatchObject({ stoppedReason: "completed", unknownMaximumUsd: "0", knownProviderCostUsd: "0.00024" });
    expect(resumed.template.entries[0]).toMatchObject({ output: null, attempts: [{ usage: good.usage,
      billingEvidence: { billedModel: evidence.billedModel, evidenceReference: providerEvalDigest(evidence.evidenceReference),
        recordedAt: evidence.at, usageSource: "reconciliation" } }],
    measurement: { responseReference: hashedReference, reportedModel: null } });
    const [reconciled] = resumed.template.entries;
    const fixture = taxProviderModelEvalFixtures.find(item => item.id === reconciled?.fixtureId);
    if (!reconciled || !fixture) throw new Error("Missing reconciled test entry or fixture.");
    expect(scoreProviderEvalEntry(reconciled, fixture)).toMatchObject({ accepted: false, complete: false, actualCostUsd: "0.00006",
      knownActualCostUsd: "0.00006", assumedActualCostUsd: "0" });
    const groupAt = (cutoff: string) => summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [reconciled] },
      taxProviderModelEvalFixtures, cutoff).groups.find(group => group.profileId === reconciled.profileId && group.task === fixture.task);
    expect(groupAt(at)).toMatchObject({ providerCostUsd: null, knownProviderCostUsd: "0", assumedProviderCostUsd: "0" });
    expect(groupAt(evidence.at)).toMatchObject({ providerCostUsd: "0.00006", knownProviderCostUsd: "0.00006",
      assumedProviderCostUsd: "0", completedRuns: 0 });
    expect(transport.mock.calls.map(([request]) => request.attemptId)).toEqual(["luna-high:capability:0", attemptId,
      "luna-high:case-income-w2-zero-withholding:2", "luna-high:case-income-w2-zero-withholding:3"]);
  });
  it("keeps reconciliation-only usage unknown before its dated receipt even when the original model matches", async () => {
    const state = setup();
    const transport = vi.fn().mockResolvedValueOnce(good).mockResolvedValueOnce({ ...good, usage: null });
    const first = await executeProviderEval({ ...state, transport });
    expect(first.stoppedReason).toBe("unknown-usage");
    const attemptId = "luna-high:case-income-w2-zero-withholding:1";
    expect(state.records.at(-1)).toMatchObject({ type: "result", attemptId, reportedModel: "gpt-6-luna", usage: null });
    const groupAt = (cutoff: string) => summarizeProviderModelLiveEvalTemplate(summarizeProviderEvalJournal(state.plan, state.records).template,
      taxProviderModelEvalFixtures, cutoff).groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction");
    const unknown = { completedRuns: 0, acceptedRuns: 0, providerCostUsd: null, knownProviderCostUsd: "0", assumedProviderCostUsd: "0" };
    expect(groupAt(at)).toMatchObject(unknown);

    const recordedAt = "2026-10-25T12:01:00.000001Z";
    await state.append(reconcileProviderEvalAttempt(state.plan, state.records, { attemptId,
      evidenceReference: "synthetic-matching-original-model-receipt", billedModel: "gpt-6-luna", usage: good.usage, at: recordedAt }));
    expect(groupAt("2026-10-25T12:01:00.000000Z")).toMatchObject(unknown);
    expect(groupAt(recordedAt)).toMatchObject({ completedRuns: 0, acceptedRuns: 0, providerCostUsd: "0.00006",
      knownProviderCostUsd: "0.00006", assumedProviderCostUsd: "0" });
    expect(transport).toHaveBeenCalledTimes(2);
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
    await state.append(reconcileProviderEvalAttempt(state.plan, state.records, { attemptId, evidenceReference: "synthetic-usage-statement-1", billedModel: "gpt-6-luna", usage: { inputTokens: 100, outputTokens: 200 }, at }));
    const resumed = await executeProviderEval({ ...state, transport });
    expect(seen).toHaveLength(4); expect(new Set(seen).size).toBe(4);
    expect(resumed.knownProviderCostUsd).toBe("0.00029"); expect(resumed.unknownMaximumUsd).toBe("0");
    expect(resumed.template.entries[0]?.output).toBeNull();
    expect(() => reconcileProviderEvalAttempt(state.plan, state.records, { attemptId, evidenceReference: "second", billedModel: "gpt-6-luna", usage: good.usage, at })).toThrow(/once/);
  });
  it("keeps a timed-out attempt held when reconciliation names a different billed model", async () => {
    const state = setup("0.015");
    const transport = vi.fn().mockResolvedValueOnce(good).mockRejectedValueOnce(new Error("synthetic timeout")).mockResolvedValue(good);
    const stopped = await executeProviderEval({ ...state, transport });
    expect(stopped).toMatchObject({ stoppedReason: "unknown-usage", unknownMaximumUsd: "0.0111056", knownProviderCostUsd: "0.00006" });
    const record = { attemptId: "luna-high:case-income-w2-zero-withholding:1", evidenceReference: "synthetic-invoice-row",
      billedModel: "gpt-6.1-sol", usage: { inputTokens: 100, outputTokens: 4096 }, at };
    expect(() => reconcileProviderEvalAttempt(state.plan, state.records, record)).toThrow(/billed model.*approved profile/i);
    const mismatched: EvalJournalRecord = { type: "reconcile", ...record };
    expect(() => validateProviderEvalJournal(state.plan, [...state.records, mismatched])).toThrow(/billed model.*approved profile/i);
    expect(await executeProviderEval({ ...state, transport })).toMatchObject({ stoppedReason: "unknown-usage",
      unknownMaximumUsd: "0.0111056", knownProviderCostUsd: "0.00006" });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("keeps old reconciliation costs visible and awaits verified model evidence before resuming", async () => {
    const state = setup();
    const transport = vi.fn().mockResolvedValueOnce(good).mockRejectedValueOnce(new Error("synthetic timeout")).mockResolvedValue(good);
    await executeProviderEval({ ...state, transport });
    const legacy = { attemptId: "luna-high:case-income-w2-zero-withholding:1", evidenceReference: "legacy-statement",
      usage: { inputTokens: 100, outputTokens: 200 }, at };
    await state.append({ type: "reconcile", ...legacy });
    validateProviderEvalJournal(state.plan, state.records);
    const historical = summarizeProviderEvalJournal(state.plan, state.records);
    expect(historical).toMatchObject({ unknownMaximumUsd: "0.0111056", knownProviderCostUsd: "0.00006",
      legacyUnverifiedProviderCostUsd: "0.00011" });
    expect(historical.template.entries[0]?.attempts[0]?.usage).toBeNull();
    expect(await executeProviderEval({ ...state, transport })).toMatchObject({ stoppedReason: "unknown-usage" });
    expect(transport).toHaveBeenCalledTimes(2);
    await state.append(reconcileProviderEvalAttempt(state.plan, state.records, { ...legacy, billedModel: "gpt-6-luna",
      evidenceReference: "verified-invoice-row", usage: { inputTokens: 100, outputTokens: 300 } }));
    const resumed = await executeProviderEval({ ...state, transport });
    expect(resumed).toMatchObject({ stoppedReason: "completed", unknownMaximumUsd: "0", knownProviderCostUsd: "0.00034",
      legacyUnverifiedProviderCostUsd: "0" });
    expect(resumed.template.entries[0]?.attempts[0]?.usage).toEqual({ inputTokens: 100, outputTokens: 300 });
    expect(resumed.template.entries[0]?.output).toBeNull();
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it.each([null, "gpt-6.1-sol"])("keeps older result usage without matching identity held until verified reconciliation (%s)", async reportedModel => {
    const state = setup();
    const transport = vi.fn().mockResolvedValueOnce(good).mockResolvedValueOnce({ ...good, reportedModel, usage: null }).mockResolvedValue(good);
    await executeProviderEval({ ...state, transport });
    const attemptId = "luna-high:case-income-w2-zero-withholding:1";
    const result = state.records.pop();
    if (result?.type !== "result" || result.attemptId !== attemptId) throw new Error("Missing synthetic result");
    await state.append({ ...result, reportedModel, usage: { inputTokens: 100, outputTokens: 200 } });
    validateProviderEvalJournal(state.plan, state.records);
    const historical = await executeProviderEval({ ...state, transport });
    expect(historical).toMatchObject({ stoppedReason: "unknown-usage", unknownMaximumUsd: "0.0111056", knownProviderCostUsd: "0.00006",
      legacyUnverifiedProviderCostUsd: "0.00011" });
    expect(historical.template.entries[0]).toMatchObject({ output: null, attempts: [{ usage: null }], measurement: { reportedModel: null } });
    expect(transport).toHaveBeenCalledTimes(2);
    const evidence = { attemptId, evidenceReference: "verified-invoice-row", billedModel: "gpt-6-luna",
      usage: { inputTokens: 100, outputTokens: 300 }, at };
    await state.append(reconcileProviderEvalAttempt(state.plan, state.records, evidence));
    expect(() => reconcileProviderEvalAttempt(state.plan, state.records, evidence)).toThrow(/once/);
    const resumed = await executeProviderEval({ ...state, transport });
    expect(resumed).toMatchObject({ stoppedReason: "completed", unknownMaximumUsd: "0", knownProviderCostUsd: "0.00034",
      legacyUnverifiedProviderCostUsd: "0" });
    expect(resumed.template.entries[0]).toMatchObject({ output: null, attempts: [{ usage: evidence.usage }], measurement: { reportedModel: null } });
    expect(transport).toHaveBeenCalledTimes(4);
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
  it("records cancellation during dispatch persistence without sending or reserving provider usage", async () => {
    const state = setup();
    const controller = new AbortController();
    let transportCalls = 0;
    const cancelled = await executeProviderEval({ ...state, signal: controller.signal,
      append: async record => {
        await state.append(record);
        if (record.type === "dispatch") controller.abort();
      },
      transport: async (_request, signal) => {
        transportCalls++;
        signal?.throwIfAborted();
        return good;
      } });
    expect(cancelled).toMatchObject({ stoppedReason: "cancelled", knownProviderCostUsd: "0",
      unknownMaximumUsd: "0", dispatchedRequests: 0, notSentRequests: 1 });
    expect(transportCalls).toBe(0);
    expect(cancelled.template).toMatchObject({ entries: [], availability: [] });
    const marker = state.records.at(-1);
    expect(marker).toEqual({ type: "not-sent", attemptId: "luna-high:capability:0", reason: "cancelled-before-send" });
    if (!marker) throw new Error("Missing cancellation marker");
    validateProviderEvalJournal(state.plan, state.records);
    expect(() => validateProviderEvalJournal(state.plan, [...state.records, marker])).toThrow(/unsent/i);
    expect(() => reconcileProviderEvalAttempt(state.plan, state.records, {
      attemptId: "luna-high:capability:0", evidenceReference: "test-only", billedModel: "gpt-6-luna", usage: good.usage, at,
    })).toThrow(/unresolved/);
    const resumed = await executeProviderEval({ ...state, transport: async () => { transportCalls++; return good; } });
    expect(resumed).toMatchObject({ dispatchedRequests: 0, notSentRequests: 1, unknownMaximumUsd: "0" });
    expect(transportCalls).toBe(0);
  });
  it("holds durable dispatch when cancellation could not be persisted", async () => {
    const state = setup();
    const controller = new AbortController();
    const transport = async () => { throw new Error("should not reach transport"); };
    await expect(executeProviderEval({ ...state, signal: controller.signal, transport,
      append: async record => {
        if (record.type === "not-sent") throw new Error("synthetic fsync failure");
        await state.append(record);
        if (record.type === "dispatch") controller.abort();
      } })).rejects.toThrow("synthetic fsync failure");
    const resumed = await executeProviderEval({ ...state, transport });
    expect(resumed).toMatchObject({ stoppedReason: "unknown-usage", knownProviderCostUsd: "0",
      unknownMaximumUsd: "0.0016896", dispatchedRequests: 1, notSentRequests: 0 });
  });
  it("leaves unsent case repetitions out of the scorer", async () => {
    const state = setup();
    const controller = new AbortController();
    const attempts: string[] = [];
    const transport = async (request: { attemptId: string }) => { attempts.push(request.attemptId); return good; };
    const cancelled = await executeProviderEval({ ...state, signal: controller.signal, transport,
      append: async record => {
        await state.append(record);
        if (record.type === "dispatch" && record.kind === "case") controller.abort();
      } });
    expect(cancelled).toMatchObject({ dispatchedRequests: 1, notSentRequests: 1, knownProviderCostUsd: "0.00006", unknownMaximumUsd: "0" });
    expect(cancelled.template.entries).toEqual([]);
    const resumed = await executeProviderEval({ ...state, transport });
    expect(resumed.template.entries.map(entry => entry.repeat)).toEqual([2, 3]);
    expect(attempts).toEqual(["luna-high:capability:0", "luna-high:case-income-w2-zero-withholding:2", "luna-high:case-income-w2-zero-withholding:3"]);
  });
  it("retains status and hashes an observed request identifier while holding unknown usage", async () => {
    const state = setup();
    const reference = "req_syntheticrequest";
    const result = await executeProviderEval({ ...state, transport: async () => ({ ...good,
      status: "failed", httpStatus: 202, usage: null, responseReference: reference, payload: null }) });
    expect(result).toMatchObject({ stoppedReason: "unknown-usage", knownProviderCostUsd: "0", dispatchedRequests: 1 });
    expect(state.records.at(-1)).toMatchObject({ type: "result", attemptId: "luna-high:capability:0",
      status: "failed", httpStatus: 202, usage: null, responseReference: providerEvalDigest(reference) });
    expect(JSON.stringify(state.records)).not.toContain(reference);
    validateProviderEvalJournal(state.plan, state.records);
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
  it("requires full independent corpus review even with complete application bindings", () => {
    const reviewed = taxProviderModelEvalFixtures.map(fixture => ({ ...fixture, review: { ...fixture.review,
      status: "reviewed" as const, reviewer: "synthetic-independent-reviewer", reviewedAt: at } }));
    const input = { runId: "qualification", purpose: "qualification" as const, profileIds: ["luna-high"], maximumProviderUsd: "1", maximumRequests: 1000, createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" };
    expect(createProviderEvalPlan(input, reviewed).fixtureIds).toHaveLength(240);
    expect(() => createProviderEvalPlan(input, taxProviderModelEvalFixtures)).toThrow(/review/i);
  });
  it("rejects qualification review after plan creation even with a matching approval digest", async () => {
    const reviewed = taxProviderModelEvalFixtures.map(fixture => ({ ...fixture, review: { ...fixture.review,
      status: "reviewed" as const, reviewer: "synthetic-independent-reviewer", reviewedAt: at } }));
    const input = { runId: "qualification-review-by-cutoff", purpose: "qualification" as const, profileIds: ["luna-high"],
      maximumProviderUsd: "1", maximumRequests: 1000, createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" };
    const pastPlan = createProviderEvalPlan(input, reviewed);
    const later = "2026-10-25T12:05:00.000Z";
    const reviewedLater = reviewed.map(fixture => ({ ...fixture, review: { ...fixture.review, reviewedAt: later } }));
    expect(() => createProviderEvalPlan(input, reviewedLater)).toThrow(/independent human review/i);

    const plan = { ...pastPlan, reviewedCorpusDigest: providerEvalDigest(reviewedLater) };
    const transport = vi.fn(async () => good);
    const state = setup();
    await expect(executeProviderEval({ ...state, plan, approval: { ...state.approval, planDigest: providerEvalDigest(plan),
      maximumRequests: 1, maximumProviderUsd: "1" }, reviewedFixtures: reviewedLater, transport, now: () => later,
    })).rejects.toThrow(/independent human review/i);
    expect(transport).not.toHaveBeenCalled();
    expect(state.records).toEqual([]);
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
