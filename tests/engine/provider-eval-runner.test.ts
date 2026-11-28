import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProviderEvalPlan, executeProviderEval, providerEvalDigest, providerEvalExecutionContract, reconcileProviderEvalAttempt, summarizeProviderEvalJournal, validatePlan, validateProviderEvalJournal, type EvalJournalRecord } from "../../scripts/lib/provider-eval-runner";
import { openProviderEvalJournal } from "../../scripts/lib/provider-eval-journal";
import { taxProviderModelEvalFixtures } from "../../packages/engine/src/provider-eval-fixtures";
import { buildProviderModelEvalFixturePack, providerModelCandidates, scoreProviderEvalEntry, summarizeProviderModelLiveEvalTemplate } from "../../packages/engine/src/provider-model-eval";
import { AI_TASKS } from "../../packages/engine/src/ai-task-registry";
import { PROVIDER_EVAL_CONTRACT } from "../../scripts/lib/provider-eval-contract";
const at = "2026-10-25T12:00:00.000Z";
function setup(maximumProviderUsd = "1", start = at, expiresAt = "2026-10-25T13:00:00.000Z") {
  const plan = createProviderEvalPlan({ runId: "test-run", purpose: "smoke", profileIds: ["luna-high"],
    fixtureIds: ["case-income-w2-zero-withholding"], maximumProviderUsd, maximumRequests: 4,
    createdAt: start, expiresAt });
  const approval = { version: 1, planDigest: providerEvalDigest(plan), authorizedBy: "synthetic-test-owner",
    authorizationReference: "test-only-not-live-authority", approvedAt: start, expiresAt: plan.expiresAt,
    maximumProviderUsd, maximumRequests: 4, accountReference: "test-account", syntheticOnly: true };
  const records: EvalJournalRecord[] = [];
  return { plan, approval, records, append: async (record: EvalJournalRecord) => { records.push(structuredClone(record)); }, now: () => start };
}
const good = { status: "completed" as const, usage: { inputTokens: 100, outputTokens: 100 }, elapsedMs: 50,
  reportedModel: "gpt-6-luna", responseReference: "response:test", payload: { probe: "ok" } };

async function priorVerifiedReceiptAndNextHold() {
  const state = setup();
  const transport = vi.fn().mockResolvedValueOnce(good)
    .mockRejectedValueOnce(new Error("first synthetic timeout"))
    .mockRejectedValueOnce(new Error("second synthetic timeout")).mockResolvedValue(good);
  const evidence = (repeat: number, evidenceReference: string) => ({
    attemptId: `luna-high:case-income-w2-zero-withholding:${repeat}`, evidenceReference,
    billedModel: "gpt-6-luna", usage: good.usage, at,
  });
  expect((await executeProviderEval({ ...state, transport })).stoppedReason).toBe("unknown-usage");
  const firstReceipt = reconcileProviderEvalAttempt(state.plan, state.records, evidence(1, "  synthetic-invoice-line  "));
  await state.append(firstReceipt);
  expect(await executeProviderEval({ ...state, transport })).toMatchObject({
    stoppedReason: "unknown-usage", knownProviderCostUsd: "0.00012", unknownMaximumUsd: "0.0111056",
  });
  expect(transport).toHaveBeenCalledTimes(3);
  return { state, transport, evidence, firstReceipt };
}

async function priorResponseAndNextHold() {
  const state = setup();
  const references = { capability: "synthetic-capability-response", case: "shared-id", own: "synthetic-timeout-response" };
  const payload = { disposition: "answer", sourceIds: ["case-income-w2-zero-withholding:source"], facts: [],
    label: "Statement", payer: "[organization-1]", documentPeriod: "2026", summary: "Unconfirmed extraction", suggestions: [] };
  const transport = vi.fn()
    .mockResolvedValueOnce({ ...good, responseReference: references.capability })
    .mockResolvedValueOnce({ ...good, responseReference: ` \t${references.case}\n`, payload })
    .mockResolvedValueOnce({ ...good, status: "failed", reportedModel: null, usage: null, responseReference: references.own, payload: null })
    .mockResolvedValue({ ...good, payload });
  const evidence = (evidenceReference: string) => ({
    attemptId: "luna-high:case-income-w2-zero-withholding:2", evidenceReference,
    billedModel: "gpt-6-luna", usage: good.usage, at,
  });
  expect(await executeProviderEval({ ...state, transport })).toMatchObject({
    stoppedReason: "unknown-usage", knownProviderCostUsd: "0.00012", unknownMaximumUsd: "0.0111056",
  });
  return { state, transport, references, evidence };
}

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
  it("reports shared capability spend once alongside all case attempts", async () => {
    const state = setup();
    const result = await executeProviderEval({ ...state, transport: async () => good });
    const template = JSON.parse(JSON.stringify(result.template));
    const report = summarizeProviderModelLiveEvalTemplate(template, undefined, at);
    expect(result.knownProviderCostUsd).toBe("0.00024");
    expect(report.capabilityAccounting).toEqual([{ profileId: "luna-high", startedAt: at,
      providerCostUsd: "0.00006", filingSeasonCostUsd: "0.00006", unknownMaximumUsd: "0" }]);
    const fixture = taxProviderModelEvalFixtures.find(item => item.id === state.plan.fixtureIds[0]);
    expect(report.groups.find(group => group.profileId === "luna-high" && group.task === fixture?.task)?.providerCostUsd)
      .toBe("0.00018");
    delete template.capabilityAccounting;
    expect(summarizeProviderModelLiveEvalTemplate(template, undefined, at).capabilityAccounting).toBeNull();
  });
  it("holds a capability charge in reports preceding authoritative reconciliation", async () => {
    const state = setup();
    const first = await executeProviderEval({ ...state, transport: async () => ({ ...good, usage: null }) });
    const settledAt = "2026-10-25T12:00:00.000001Z";
    await state.append(reconcileProviderEvalAttempt(state.plan, state.records, {
      attemptId: "luna-high:capability:0", evidenceReference: "synthetic-capability-receipt",
      billedModel: "gpt-6-luna", usage: good.usage, at: settledAt,
    }));
    const { template } = summarizeProviderEvalJournal(state.plan, state.records);
    const report = (cutoff: string) => summarizeProviderModelLiveEvalTemplate(template, undefined, cutoff);
    expect(report(at).capabilityAccounting?.[0]).toMatchObject({ providerCostUsd: null, unknownMaximumUsd: first.unknownMaximumUsd });
    expect(report(settledAt).capabilityAccounting?.[0]).toMatchObject({ providerCostUsd: "0.00006", unknownMaximumUsd: "0" });
    expect(report(settledAt).productionPromotion).toBe(false);
  });
  it("reports directly measured probe costs only after observing the response", async () => {
    const state = setup();
    const observedAt = "2026-10-25T12:00:05.000Z";
    let currentTime = at;
    const result = await executeProviderEval({ ...state, now: () => currentTime, transport: async () => {
      currentTime = observedAt;
      return { ...good, elapsedMs: 5000 };
    } });
    const report = (cutoff: string) => summarizeProviderModelLiveEvalTemplate(result.template, undefined, cutoff);
    expect(report(at).capabilityAccounting?.[0]).toMatchObject({ providerCostUsd: null, unknownMaximumUsd: "0.0016896" });
    expect(report(observedAt).capabilityAccounting?.[0]).toMatchObject({ providerCostUsd: "0.00006", unknownMaximumUsd: "0" });
    const legacyRecords = state.records.map(record => {
      if (record.type !== "result") return record;
      const { observedAt: _observedAt, ...legacy } = record;
      return legacy;
    });
    const historical = summarizeProviderEvalJournal(state.plan, legacyRecords);
    expect(historical.knownProviderCostUsd).toBe("0.00024");
    expect(summarizeProviderModelLiveEvalTemplate(historical.template, undefined, observedAt).capabilityAccounting?.[0])
      .toMatchObject({ providerCostUsd: null, unknownMaximumUsd: "0.0016896",
        undatedCost: { providerCostUsd: "0.00006", filingSeasonCostUsd: "0.00006" } });
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
    expect(summarizeProviderModelLiveEvalTemplate(first.template, undefined, at).capabilityAccounting).toEqual([
      { profileId: "luna-high", startedAt: at, providerCostUsd: null, filingSeasonCostUsd: null,
        unknownMaximumUsd: first.unknownMaximumUsd },
    ]);
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
  it("requires a strictly positive exact plan duration", () => {
    const creation = "2026-10-25T12:00:00.000001Z";
    const expiry = "2026-10-25T12:00:00.0000011Z";
    const { plan } = setup("1", creation, expiry);
    expect(plan.expiresAt).toBe(expiry);
    expect(() => validatePlan({ ...plan, expiresAt: "2026-10-25T12:00:00.0000010Z" })).toThrow(/within seven days/i);
    expect(() => validatePlan({ ...plan, expiresAt: "2026-10-25T12:00:00.0000009Z" })).toThrow(/within seven days/i);
  });
  it("caps the exact plan duration at seven days", () => {
    const creation = "2026-10-25T12:00:00.000001Z";
    const expiry = "2026-11-01T12:00:00.0000010Z";
    const { plan } = setup("1", creation, expiry);
    expect(plan.expiresAt).toBe(expiry);
    expect(() => validatePlan({ ...plan, expiresAt: "2026-11-01T12:00:00.0000011Z" })).toThrow(/within seven days/i);
  });
  it("rejects durable dispatch outside the exact plan window", async () => {
    const creation = "2026-10-25T12:00:00.000001Z";
    const expiry = "2026-10-25T13:00:00.000002Z";
    const beforeExpiry = "2026-10-25T13:00:00.0000019Z";
    const state = setup("1", creation, expiry);
    let now = creation;
    const transport = vi.fn(async () => {
      if (transport.mock.calls.length === 3) now = beforeExpiry;
      if (transport.mock.calls.length === 4) now = "2026-10-25T13:00:01.000Z";
      return good;
    });
    const result = await executeProviderEval({ ...state, now: () => now, transport });
    expect(result).toMatchObject({ stoppedReason: "completed", knownProviderCostUsd: "0.00024", productionPromotion: false });
    expect(now).toBe("2026-10-25T13:00:01.000Z");
    expect(state.records.at(-2)).toMatchObject({ type: "dispatch", startedAt: beforeExpiry });
    expect(state.records.at(-1)).toMatchObject({ type: "result", status: "completed" });
    expect(state.records[1]).toMatchObject({ type: "dispatch", startedAt: creation });
    validateProviderEvalJournal(state.plan, state.records);

    // Isolate the completed capability probe from the later case attempts.
    const capabilityJournalAt = (startedAt: string) => state.records.slice(0, 3)
      .map(record => {
        if (record.type === "dispatch") return { ...record, startedAt };
        if (record.type === "result") return { ...record, observedAt: startedAt };
        return record;
      });
    for (const startedAt of [creation, "2026-10-25T12:00:00.0000010Z", beforeExpiry]) {
      const records = capabilityJournalAt(startedAt);
      validateProviderEvalJournal(state.plan, records);
      expect(summarizeProviderEvalJournal(state.plan, records).template.availability).toMatchObject([{ status: "available", checkedAt: startedAt }]);
    }
    for (const startedAt of ["2026-10-25T12:00:00.0000009Z", expiry, "2026-10-25T13:00:00.0000021Z"]) {
      const records = capabilityJournalAt(startedAt);
      expect(() => validateProviderEvalJournal(state.plan, records)).toThrow(/dispatch timestamp is outside the plan window/i);
      expect(() => summarizeProviderEvalJournal(state.plan, records)).toThrow(/dispatch timestamp is outside the plan window/i);
    }
    expect(() => validateProviderEvalJournal(state.plan, capabilityJournalAt("2026-10-25T08:00:00.000001-04:00")))
      .toThrow(/Invalid ISO datetime/);
  });
  it("blocks a dispatch before exact plan creation after recording its run identity", async () => {
    const creation = "2026-10-25T12:00:00.000001Z";
    const state = setup("1", creation);
    const now = vi.fn(() => "2026-10-25T12:00:00.0000009Z").mockReturnValueOnce(creation);
    const transport = vi.fn().mockResolvedValue(good);
    await expect(executeProviderEval({ ...state, now, transport })).rejects.toThrow(/approval/i);
    expect(transport).not.toHaveBeenCalled();
    expect(state.records.map(record => record.type)).toEqual(["start"]);
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
  it("refuses a reused reconciliation reference and resumes on distinct evidence", async () => {
    const { state, transport, evidence, firstReceipt } = await priorVerifiedReceiptAndNextHold();
    for (const reference of ["synthetic-invoice-line", "\tsynthetic-invoice-line\n"]) {
      expect(() => reconcileProviderEvalAttempt(state.plan, state.records, evidence(2, reference))).toThrow(/reference.*another attempt/i);
    }
    expect(firstReceipt).toMatchObject({ type: "reconcile", evidenceReference: "synthetic-invoice-line" });
    const held = await executeProviderEval({ ...state, transport });
    expect(held).toMatchObject({ stoppedReason: "unknown-usage", knownProviderCostUsd: "0.00012", unknownMaximumUsd: "0.0111056" });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(held.template.entries[0]?.attempts[0]?.billingEvidence?.evidenceReference).toBe(providerEvalDigest("synthetic-invoice-line"));

    const distinctReceipt = reconcileProviderEvalAttempt(state.plan, state.records, evidence(2, "Synthetic-Invoice-Line"));
    await state.append(distinctReceipt);
    expect(await executeProviderEval({ ...state, transport })).toMatchObject({
      stoppedReason: "completed", unknownMaximumUsd: "0", knownProviderCostUsd: "0.00024", legacyUnverifiedProviderCostUsd: "0",
    });
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it("rejects receipts that reuse another response and accepts the same attempt's reference", async () => {
    const { state, transport, references, evidence } = await priorResponseAndNextHold();
    for (const reference of [references.capability, references.case]) {
      expect(() => reconcileProviderEvalAttempt(state.plan, state.records, evidence(reference))).toThrow(/reference.*another attempt/i);
    }
    expect(transport).toHaveBeenCalledTimes(3);
    const ownReceipt = reconcileProviderEvalAttempt(state.plan, state.records, evidence(references.own));
    await state.append(ownReceipt);
    expect(await executeProviderEval({ ...state, transport })).toMatchObject({
      stoppedReason: "completed", knownProviderCostUsd: "0.00024", unknownMaximumUsd: "0", bindingBlockers: [],
    });
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it.each(["case", "capability"] as const)("preserves charges and holds when a historical receipt reuses a %s response", async kind => {
    const { state, transport, references, evidence } = await priorResponseAndNextHold();
    const dir = await mkdtemp(join(tmpdir(), "provider-eval-reused-response-"));
    const file = join(dir, "run.jsonl");
    try {
      const journal = await openProviderEvalJournal(file);
      try {
        for (const record of state.records) await journal.append(record);
        await journal.append({ type: "reconcile", ...evidence(references[kind]) });
      } finally { await journal.close(); }
      const original = await readFile(file, "utf8");
      const reopened = await openProviderEvalJournal(file);
      try {
        validateProviderEvalJournal(state.plan, reopened.records);
        const result = await executeProviderEval({ ...state, ...reopened, transport });
        expect(result).toMatchObject({
          stoppedReason: "unknown-usage", knownProviderCostUsd: "0.00012", unknownMaximumUsd: "0.0111056",
          legacyUnverifiedProviderCostUsd: "0.00006", bindingBlockers: ["reconciliation-evidence-reference-reused"],
        });
        expect(result.template.entries.map(entry => entry.attempts[0]?.usage)).toEqual([good.usage, null]);
        expect(result.template.entries[1]?.attempts[0]?.billingEvidence?.evidenceReference).toBe(providerEvalDigest(references[kind]));
        expect(transport).toHaveBeenCalledTimes(3);
        expect(await readFile(file, "utf8")).toBe(original);
      } finally { await reopened.close(); }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("corrects a selected collision after an older unverified receipt", async () => {
    const { state, transport, references, evidence } = await priorResponseAndNextHold();
    const priorAt = "2026-10-25T12:00:01.000001Z";
    await state.append({ type: "reconcile", attemptId: evidence(references.case).attemptId, evidenceReference: "legacy-unverified-invoice", usage: good.usage, at });
    await state.append({ type: "reconcile", ...evidence(references.case), at: priorAt });
    const original = structuredClone(state.records);
    const input = { ...evidence("  corrected-invoice-row  "), at: "2026-10-25T08:00:01.000001-04:00", usage: { inputTokens: 200, outputTokens: 100 } };
    const reconcile = (supersedesEvidenceReference?: string) => reconcileProviderEvalAttempt(state.plan, state.records, { ...input, supersedesEvidenceReference });
    expect(() => reconcile()).toThrow(/once/i);
    expect(() => reconcile("legacy-unverified-invoice")).toThrow(/prior model-bound receipt/i);
    for (const evidenceReference of ["legacy-unverified-invoice", references.own]) {
      expect(() => reconcileProviderEvalAttempt(state.plan, state.records, { ...input, evidenceReference, supersedesEvidenceReference: references.case }))
        .toThrow(/unused reference/i);
    }
    const correction = reconcile(`\t${references.case}\n`);
    expect(correction).toMatchObject({ type: "reconcile-correction", evidenceReference: "corrected-invoice-row",
      supersedesEvidenceDigest: providerEvalDigest(references.case), billedModel: "gpt-6-luna", usage: input.usage });
    await state.append(correction);
    expect(state.records.slice(0, -1)).toEqual(original);
    validateProviderEvalJournal(state.plan, state.records);
    const report = summarizeProviderEvalJournal(state.plan, state.records);
    expect(report).toMatchObject({ knownProviderCostUsd: "0.00019", unknownMaximumUsd: "0", legacyUnverifiedProviderCostUsd: "0",
      dispatchedRequests: 3, bindingBlockers: [], productionPromotion: false });
    expect(report.template.entries[1]).toMatchObject({ output: null, independentReview: null,
      attempts: [{ usage: input.usage, billingEvidence: { evidenceReference: providerEvalDigest("corrected-invoice-row"), recordedAt: input.at } }] });
    expect(() => reconcile(references.case)).toThrow(/only one correction/i);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(await executeProviderEval({ ...state, transport })).toMatchObject({ stoppedReason: "completed", knownProviderCostUsd: "0.00025", unknownMaximumUsd: "0" });
    expect(transport).toHaveBeenCalledTimes(4);
    expect(transport.mock.calls[3]?.[0]).toMatchObject({ attemptId: "luna-high:case-income-w2-zero-withholding:3" });
  });
  it("keeps the other attempt held and rejects corrections without prior collision proof", async () => {
    const { state, transport, evidence } = await priorVerifiedReceiptAndNextHold();
    const previousReference = "synthetic-invoice-line";
    const correctionInput = { ...evidence(1, "replacement-invoice-row"), supersedesEvidenceReference: previousReference,
      at: "2026-10-25T12:00:00.000001Z" };
    expect(() => reconcileProviderEvalAttempt(state.plan, state.records, correctionInput)).toThrow(/cross-attempt collision/i);
    const collision = { type: "reconcile", ...evidence(2, previousReference) } as const;
    await state.append(collision);
    const correction = reconcileProviderEvalAttempt(state.plan, state.records, correctionInput);
    const prefix = state.records.slice(0, -1);
    expect(() => validateProviderEvalJournal(state.plan, [...prefix, correction, collision])).toThrow(/cross-attempt collision/i);
    const early = state.records.map(record => record.type === "reconcile" && record.attemptId === correctionInput.attemptId
      ? { ...record, at: "2026-10-25T11:59:59.999999Z" } : record);
    expect(() => validateProviderEvalJournal(state.plan, [...early, correction])).toThrow(/cross-attempt collision/i);
    for (const [change, error] of [
      [{ supersedesEvidenceDigest: providerEvalDigest("other-reference") }, /prior model-bound receipt/i],
      [{ evidenceReference: previousReference }, /unused reference/i],
      [{ evidenceReference: "response:test" }, /unused reference/i],
      [{ billedModel: "gpt-6.1-sol" }, /billed model.*approved profile/i],
      [{ at: "2026-10-25T11:59:59.999999Z" }, /before the prior receipt/i],
    ] as const) {
      expect(() => validateProviderEvalJournal(state.plan, [...state.records, { ...correction, ...change }])).toThrow(error);
    }
    expect(() => validateProviderEvalJournal(state.plan, [...state.records, correction, correction])).toThrow(/only one correction/i);
    await state.append(correction);
    expect(await executeProviderEval({ ...state, transport })).toMatchObject({ stoppedReason: "unknown-usage", knownProviderCostUsd: "0.00012",
      unknownMaximumUsd: "0.0111056", legacyUnverifiedProviderCostUsd: "0.00006", bindingBlockers: ["reconciliation-evidence-reference-reused"] });
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it("reconciles only at or after dispatch with exact fractional seconds and UTC offsets", async () => {
    const start = "2026-10-25T12:00:00.000001Z";
    const state = setup("1", start);
    const transport = vi.fn().mockResolvedValueOnce(good).mockRejectedValueOnce(new Error("synthetic timeout")).mockResolvedValue(good);
    expect(await executeProviderEval({ ...state, transport })).toMatchObject({
      stoppedReason: "unknown-usage", knownProviderCostUsd: "0.00006", unknownMaximumUsd: "0.0111056",
    });
    const evidence = { attemptId: "luna-high:case-income-w2-zero-withholding:1",
      evidenceReference: "synthetic-precisely-dated-receipt", billedModel: "gpt-6-luna", usage: good.usage };
    for (const at of ["2026-10-25T12:00:00.000000Z", "2026-10-25T08:00:00.000000-04:00"]) {
      expect(() => reconcileProviderEvalAttempt(state.plan, state.records, { ...evidence, at })).toThrow(/before dispatch/i);
    }
    const justAfter = "2026-10-25T08:00:00.000002-04:00";
    expect(reconcileProviderEvalAttempt(state.plan, state.records, { ...evidence, at: justAfter })).toMatchObject({ at: justAfter });
    const equivalent = "2026-10-25T08:00:00.0000010-04:00";
    const receipt = reconcileProviderEvalAttempt(state.plan, state.records, { ...evidence, at: equivalent });
    await state.append(receipt);
    validateProviderEvalJournal(state.plan, state.records);
    expect(await executeProviderEval({ ...state, transport })).toMatchObject({
      stoppedReason: "completed", knownProviderCostUsd: "0.00024", unknownMaximumUsd: "0",
    });
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it("retains reconciliation after plan expiry for an in-window dispatch", async () => {
    const { state, evidence } = await priorVerifiedReceiptAndNextHold();
    const at = "2026-10-25T09:00:00.000001-04:00";
    const receipt = reconcileProviderEvalAttempt(state.plan, state.records, { ...evidence(2, "synthetic-post-expiry-receipt"), at });
    await state.append(receipt);
    validateProviderEvalJournal(state.plan, state.records);
    expect(summarizeProviderEvalJournal(state.plan, state.records)).toMatchObject({
      knownProviderCostUsd: "0.00018", unknownMaximumUsd: "0", bindingBlockers: [], productionPromotion: false,
    });
  });
  it("keeps a historical early receipt readable and holds further dispatch", async () => {
    const state = setup("1", "2026-10-25T12:00:00.000001Z");
    const transport = vi.fn().mockResolvedValueOnce(good).mockRejectedValueOnce(new Error("synthetic timeout")).mockResolvedValue(good);
    expect(await executeProviderEval({ ...state, transport })).toMatchObject({ stoppedReason: "unknown-usage" });
    const earlyReceipt = {
      type: "reconcile", attemptId: "luna-high:case-income-w2-zero-withholding:1",
      evidenceReference: "synthetic-impossible-receipt", billedModel: "gpt-6-luna", usage: good.usage,
      at: "2026-10-25T12:00:00.000000Z",
    } as const;
    await state.append(earlyReceipt);
    validateProviderEvalJournal(state.plan, state.records);
    const previous = structuredClone(state.records);
    const result = await executeProviderEval({ ...state, transport });
    expect(result).toMatchObject({ stoppedReason: "unknown-usage", knownProviderCostUsd: "0.00006",
      unknownMaximumUsd: "0.0111056", legacyUnverifiedProviderCostUsd: "0.00006",
      bindingBlockers: ["reconciliation-recorded-before-dispatch"] });
    expect(result.template.entries[0]?.attempts[0]).toMatchObject({ usage: null,
      billingEvidence: { evidenceReference: providerEvalDigest(earlyReceipt.evidenceReference), recordedAt: earlyReceipt.at } });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(state.records).toEqual(previous);
  });
  it("retains every affected hold when a durable historical journal reuses a verified receipt", async () => {
    const { state, transport, evidence } = await priorVerifiedReceiptAndNextHold();
    const dir = await mkdtemp(join(tmpdir(), "provider-eval-duplicate-receipt-"));
    const file = join(dir, "run.jsonl");
    try {
      const prior = await openProviderEvalJournal(file);
      try {
        for (const record of state.records) await prior.append(record);
        await prior.append({ type: "reconcile", ...evidence(2, "synthetic-invoice-line") });
      } finally { await prior.close(); }
      const original = await readFile(file, "utf8");
      const reopened = await openProviderEvalJournal(file);
      try {
        validateProviderEvalJournal(state.plan, reopened.records);
        const summary = summarizeProviderEvalJournal(state.plan, reopened.records);
        expect(summary).toMatchObject({ unknownMaximumUsd: "0.0222112", knownProviderCostUsd: "0.00006",
          legacyUnverifiedProviderCostUsd: "0.00012", bindingBlockers: ["reconciliation-evidence-reference-reused"] });
        expect(summary.template.entries.map(entry => entry.attempts[0]?.usage)).toEqual([null, null]);
        expect(await executeProviderEval({ ...state, ...reopened, transport })).toMatchObject({
          stoppedReason: "unknown-usage", unknownMaximumUsd: "0.0222112", knownProviderCostUsd: "0.00006",
        });
        expect(transport).toHaveBeenCalledTimes(3);
        expect(await readFile(file, "utf8")).toBe(original);
      } finally { await reopened.close(); }
    } finally { await rm(dir, { recursive: true, force: true }); }
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
  it.each([
    ["unchanged rate", "2026-12-31T23:59:59.999Z", false],
    ["new rate", "2027-01-01T00:00:00.000Z", true],
  ] as const)("checks the effective price after durable dispatch (%s)", async (_label, afterAppend, changed) => {
    const startedAt = "2026-12-31T23:59:59.900Z";
    const expiresAt = "2027-01-01T01:00:00.000Z";
    const state = setup("1", startedAt, expiresAt);
    const plan = createProviderEvalPlan({ runId: "gemini-rate-cutoff", purpose: "capability", profileIds: ["gemini-flash-high"],
      maximumProviderUsd: "1", maximumRequests: 1, createdAt: startedAt, expiresAt });
    const approval = { ...state.approval, planDigest: providerEvalDigest(plan), maximumRequests: 1 };
    let now = startedAt;
    const transport = vi.fn().mockResolvedValue({ ...good, reportedModel: "gemini-3.8-flash" });
    const result = await executeProviderEval({ ...state, plan, approval, now: () => now, transport,
      append: async record => {
        await state.append(record);
        if (record.type === "dispatch") now = afterAppend;
      } });
    expect(state.records[1]).toMatchObject({ type: "dispatch", startedAt });
    expect(result.unknownMaximumUsd).toBe("0");
    validateProviderEvalJournal(plan, state.records);
    if (changed) {
      expect(transport).not.toHaveBeenCalled();
      expect(result).toMatchObject({ stoppedReason: "price-changed", knownProviderCostUsd: "0", dispatchedRequests: 0, notSentRequests: 1 });
      expect(state.records.at(-1)).toEqual({ type: "not-sent", attemptId: "gemini-flash-high:capability:0", reason: "price-changed-before-send" });
      const resumed = await executeProviderEval({ ...state, plan, approval, now: () => now, transport });
      expect(resumed).toMatchObject({ knownProviderCostUsd: "0", unknownMaximumUsd: "0", dispatchedRequests: 0, notSentRequests: 1 });
      expect(transport).not.toHaveBeenCalled();
    } else {
      expect(transport).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ stoppedReason: "completed", knownProviderCostUsd: "0.00045", dispatchedRequests: 1, notSentRequests: 0 });
    }
  });
  it.each([
    ["approval expiry", "luna-high", at, "2026-10-25T12:00:00.0000001Z", "2026-10-25T13:00:00.000Z", "approval-window-closed"],
    ["plan expiry", "luna-high", at, "2026-10-25T12:00:00.0000001Z", "2026-10-25T12:00:00.0000001Z", "approval-window-closed"],
    ["model shutdown", "baseline-gpt-5-mini", "2026-12-10T23:59:59.999Z", "2026-12-11T00:00:00.000Z", "2026-12-11T01:00:00.000Z", "model-shutdown"],
  ] as const)("holds a durable attempt when its send window closes (%s)", async (_label, profileId, startedAt, afterAppend, expiresAt, reason) => {
    const state = setup("1", startedAt, expiresAt);
    const plan = createProviderEvalPlan({ runId: "model-send-window", purpose: "capability", profileIds: [profileId],
      maximumProviderUsd: "1", maximumRequests: 1, createdAt: startedAt, expiresAt });
    const approval = { ...state.approval, planDigest: providerEvalDigest(plan), maximumRequests: 1,
      expiresAt: reason === "approval-window-closed" ? afterAppend : expiresAt };
    let now = startedAt;
    const transport = vi.fn().mockResolvedValue(good);
    const result = await executeProviderEval({ ...state, plan, approval, now: () => now, transport,
      append: async record => {
        await state.append(record);
        if (record.type === "dispatch") now = afterAppend;
      } });
    expect(transport).not.toHaveBeenCalled();
    expect(result).toMatchObject({ stoppedReason: reason, knownProviderCostUsd: "0", unknownMaximumUsd: "0", dispatchedRequests: 0, notSentRequests: 1 });
    const attemptId = `${profileId}:capability:0`;
    expect(state.records[1]).toMatchObject({ type: "dispatch", attemptId, startedAt });
    expect(state.records[2]).toEqual({ type: "not-sent", attemptId, reason: `${reason}-before-send` });
    validateProviderEvalJournal(plan, state.records);
  });
  it.each([
    ["approval expires inside sampled millisecond", "2026-10-25T12:00:00.0000001Z", "2026-10-25T13:00:00.000Z", false, false],
    ["plan and approval expire inside sampled millisecond", "2026-10-25T12:00:00.0000001Z", "2026-10-25T12:00:00.0000001Z", false, false],
    ["both expire at next millisecond", "2026-10-25T12:00:00.001Z", "2026-10-25T12:00:00.001Z", false, true],
    ["exact injected clock", "2026-10-25T12:00:00.0000001Z", "2026-10-25T12:00:00.0000001Z", true, true],
  ] as const)("admits a durable send only within the default clock precision (%s)", async (_label, approvalExpiry, planExpiry, exactClock, allowed) => {
    const startedAt = "2026-10-25T11:59:59.999Z";
    const { approval: syntheticApproval, records, append } = setup("1", startedAt, planExpiry);
    const plan = createProviderEvalPlan({ runId: "default-send-clock", purpose: "capability", profileIds: ["luna-high"],
      maximumProviderUsd: "1", maximumRequests: 1, createdAt: startedAt, expiresAt: planExpiry });
    const approval = { ...syntheticApproval, planDigest: providerEvalDigest(plan), maximumRequests: 1, expiresAt: approvalExpiry };
    const transport = vi.fn().mockResolvedValue(good);
    let exactAt = startedAt;
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(startedAt));
      const result = await executeProviderEval({ plan, approval, records, transport,
        ...(exactClock ? { now: () => exactAt } : {}),
        append: async record => {
          await append(record);
          if (record.type === "dispatch") {
            vi.setSystemTime(new Date(at));
            exactAt = "2026-10-25T12:00:00.00000005Z";
          }
        } });
      expect(transport).toHaveBeenCalledTimes(allowed ? 1 : 0);
      expect(result.unknownMaximumUsd).toBe("0");
      if (allowed) {
        expect(result).toMatchObject({ stoppedReason: "completed", knownProviderCostUsd: "0.00006", dispatchedRequests: 1, notSentRequests: 0 });
      } else {
        expect(result).toMatchObject({ stoppedReason: "approval-window-closed", knownProviderCostUsd: "0", dispatchedRequests: 0, notSentRequests: 1 });
        expect(records[2]).toEqual({ type: "not-sent", attemptId: "luna-high:capability:0", reason: "approval-window-closed-before-send" });
      }
      validateProviderEvalJournal(plan, records);
    } finally {
      vi.useRealTimers();
    }
  });
  it("holds a durable case when capability evidence expires during its write", async () => {
    const state = setup("1", at, "2026-10-26T13:00:00.000Z");
    const caseStartedAt = "2026-10-26T11:59:59.999Z";
    let now = at;
    const transport = vi.fn(async () => { now = caseStartedAt; return good; });
    const result = await executeProviderEval({ ...state, now: () => now, transport,
      append: async record => {
        await state.append(record);
        if (record.type === "dispatch" && record.kind === "case") now = "2026-10-26T12:00:00.000Z";
      } });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ stoppedReason: "capability-expired", knownProviderCostUsd: "0.00006", unknownMaximumUsd: "0", dispatchedRequests: 1, notSentRequests: 1 });
    const attemptId = "luna-high:case-income-w2-zero-withholding:1";
    expect(state.records[3]).toMatchObject({ type: "dispatch", attemptId, startedAt: caseStartedAt });
    expect(state.records[4]).toEqual({ type: "not-sent", attemptId, reason: "capability-expired-before-send" });
    validateProviderEvalJournal(state.plan, state.records);
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
  it("treats a blank provider reference as missing", async () => {
    const state = setup();
    const result = await executeProviderEval({ ...state, transport: async () => ({ ...good,
      status: "failed", usage: null, responseReference: " \t\n", payload: null }) });
    expect(result).toMatchObject({ stoppedReason: "unknown-usage", knownProviderCostUsd: "0", dispatchedRequests: 1 });
    expect(state.records.at(-1)).toMatchObject({ type: "result", responseReference: null });
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
  it("keeps held-out cases out of smoke plans after a fixture pack is edited", () => {
    const pack = buildProviderModelEvalFixturePack();
    const fixture = pack.fixtures.find(item => item.id === "case-income-nec-k-overlap");
    if (!fixture || fixture.split !== "held-out") throw new Error("The test requires a frozen held-out case.");
    const { plan } = setup();
    const originalAuthor = fixture.review.author;
    const planForFixture = () => createProviderEvalPlan({ ...plan, fixtureIds: [fixture.id] });
    expect(planForFixture).toThrow(/held-out/i);
    try {
      fixture.split = "development";
      fixture.review.author = "synthetic-replacement-author";
      expect(planForFixture).toThrow(/held-out/i);
      expect(setup().plan.corpusDigest).toBe(plan.corpusDigest);
      pack.fixtures.pop();
      const freshPack = buildProviderModelEvalFixturePack();
      expect(freshPack.fixtures).toHaveLength(240);
      expect(freshPack.fixtures.find(item => item.id === fixture.id)).toMatchObject({
        split: "held-out", review: { author: originalAuthor },
      });
    } finally {
      fixture.split = "held-out";
      fixture.review.author = originalAuthor;
    }
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
