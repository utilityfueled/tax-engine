import { describe, expect, it } from "vitest";
import { evaluationRequestContent, providerEvalBindingManifest, validateProviderEvalOutput, prepareProviderEvalCase, PROVIDER_EVAL_BINDING_VERSION } from "../../packages/engine/src/provider-eval-application";
import { taxProviderModelEvalFixtures } from "../../packages/engine/src/provider-eval-fixtures";
import { scoreProviderEvalEntry, parseProviderModelLiveEvalTemplate, summarizeProviderModelLiveEvalTemplate, type ProviderModelLiveEvalEntry, type ProviderModelLiveEvalTemplate } from "../../packages/engine/src/provider-model-eval";
import { createProviderEvalPlan, executeProviderEval, providerEvalDigest, validateProviderEvalJournal, type EvalJournalRecord } from "../../scripts/lib/provider-eval-runner";
const fixture = (id: string) => { const value = taxProviderModelEvalFixtures.find(item => item.id === id); if (!value) throw new Error("Missing fixture."); return value; };
const income = () => ({ disposition: "answer", sourceIds: ["case-income-w2-zero-withholding:source"], label: "W-2", payer: "[organization-1]", documentPeriod: "2026", summary: "Unconfirmed printed source facts.", suggestions: [], facts: [
  { name: "wages", kind: "money", value: "48222.19", sourceId: "case-income-w2-zero-withholding:source", sourceQuote: "W-2 box 1: 48,222.19; box 2: 0.00." },
  { name: "withholding", kind: "money", value: "0", sourceId: "case-income-w2-zero-withholding:source", sourceQuote: "W-2 box 1: 48,222.19; box 2: 0.00." },
] });
const at = "2026-10-25T12:00:00.000Z";
function provenance(f: ReturnType<typeof fixture>) {
  const plan = createProviderEvalPlan({ runId: "unit-provenance", purpose: "capability", profileIds: ["luna-high"], maximumProviderUsd: "1", maximumRequests: 1, createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" });
  const { review: _review, ...content } = f;
  return { planDigest: providerEvalDigest(plan), corpusDigest: plan.corpusDigest, fixtureDigest: providerEvalDigest(content) };
}
describe("actual application evaluation", () => {
  it("uses actual task JSON and derives observations without a sidecar", () => {
    const f = fixture("case-income-w2-zero-withholding");
    const result = validateProviderEvalOutput(f, income());
    expect(result).toMatchObject({ applicationSchemaValid: true, normalizationStatus: "bound", blocker: null,
      output: { fields: { wages: "48222.19", withholding: "0" }, disposition: "answer" } });
    expect(providerEvalBindingManifest.every(binding => binding.normalizationStatus === "bound")).toBe(true);
    expect(validateProviderEvalOutput(f, { applicationOutput: JSON.stringify(income()), fields: { wages: "48222.19" } }).applicationSchemaValid).toBe(false);
    const unsupported = fixture("case-unsupported-final2026");
    expect(validateProviderEvalOutput(unsupported, { disposition: "abstain", sourceIds: unsupported.sourceIds, reasonCode: "missing-facts" }).output?.disposition).toBe("abstain");
  });
  it("refuses forged passing flags and normalized fields without valid actual output", () => {
    const f = fixture("case-income-w2-zero-withholding"); const result = validateProviderEvalOutput(f, income());
    const entry: ProviderModelLiveEvalEntry = { profileId: "luna-high", fixtureId: f.id, fixtureVersion: 1, repeat: 1, elapsedMs: 1,
      applicationSchemaValid: true, output: result.output, independentReview: { method: "human", reviewer: "unit-test-only", grounded: true, qualityAccepted: true, piiLeak: false },
      attempts: [{ profileId: "luna-high", startedAt: at, usage: { inputTokens: 100, outputTokens: 100 } }],
      measurement: { runPurpose: "qualification", ...provenance(f), bindingVersion: PROVIDER_EVAL_BINDING_VERSION, promptVersion: "income-extraction/2", schemaVersion: "income-extraction/2", normalizationStatus: "bound", applicationOutput: {}, privacyFailure: false, responseReference: "test-only", reportedModel: "gpt-6-luna" } };
    expect(scoreProviderEvalEntry(entry, f)).toMatchObject({ accepted: false, schemaValid: false });
    if (!entry.measurement) throw new Error("Missing measurement.");
    entry.measurement.applicationOutput = income();
    expect(scoreProviderEvalEntry(entry, f).accepted).toBe(true);
    if (!entry.output) throw new Error("Missing output.");
    entry.output.fields.wages = "1";
    expect(scoreProviderEvalEntry(entry, f)).toMatchObject({ accepted: false, schemaValid: true, observationsConsistent: false });
  });
  it("keeps authored request context independent from expected answers", () => {
    const f = fixture("case-explain-income-versus-agi"); const request = evaluationRequestContent(f);
    const changed = structuredClone(f); changed.expected.engineValues["1040:9"] = "1";
    expect(evaluationRequestContent(changed)).toEqual(request);
    expect(JSON.stringify(request)).not.toContain("reviewCriteria");
    expect(JSON.stringify(request)).not.toContain('"expected"');
    expect(prepareProviderEvalCase(f).kind).toBe("provider");
    expect(prepareProviderEvalCase(fixture("case-explain-stale-year"))).toMatchObject({ kind: "preflight", reason: "invalid-verified-context" });
  });
  it("requires the final attempted model identity while retaining incurred costs", () => {
    const f = fixture("case-income-w2-zero-withholding"); const result = validateProviderEvalOutput(f, income());
    const entry: ProviderModelLiveEvalEntry = { profileId: "luna-high", fixtureId: f.id, fixtureVersion: 1, repeat: 1, elapsedMs: 1,
      applicationSchemaValid: true, output: result.output, independentReview: { method: "human", reviewer: "unit-test-only-not-real-review", grounded: true, qualityAccepted: true, piiLeak: false },
      attempts: [{ profileId: "luna-high", startedAt: at, usage: { inputTokens: 100, outputTokens: 100 } }],
      measurement: { runPurpose: "qualification", ...provenance(f), bindingVersion: PROVIDER_EVAL_BINDING_VERSION, promptVersion: "income-extraction/2", schemaVersion: "income-extraction/2", normalizationStatus: "bound", applicationOutput: income(), privacyFailure: false, responseReference: "test-only", reportedModel: "gpt-6-luna" } };
    if (!entry.measurement) throw new Error("Missing test measurement.");
    expect(scoreProviderEvalEntry(entry, f)).toMatchObject({ accepted: true, actualCostUsd: "0.00006" });
    for (const reportedModel of [null, "a-different-provider-model", "gpt-6-luna-unverified-snapshot", "gpt-6-luna-2026-10-25"]) {
      entry.measurement.reportedModel = reportedModel;
      expect(scoreProviderEvalEntry(entry, f)).toMatchObject({ accepted: false, complete: false, criticalCorrect: false, actualCostUsd: "0.00006" });
    }
    entry.attempts.push({ profileId: "sol-high", startedAt: at, usage: { inputTokens: 100, outputTokens: 100 } });
    entry.measurement.reportedModel = "gpt-6-luna";
    expect(scoreProviderEvalEntry(entry, f)).toMatchObject({ accepted: false, actualCostUsd: "0.00126" });
    entry.measurement.reportedModel = "gpt-6.1-sol";
    expect(scoreProviderEvalEntry(entry, f)).toMatchObject({ accepted: true, actualCostUsd: "0.00126" });
    entry.attempts = [{ profileId: "baseline-gpt-5-mini", startedAt: at, usage: { inputTokens: 100, outputTokens: 100 } }];
    entry.profileId = "baseline-gpt-5-mini";
    entry.measurement.reportedModel = "gpt-5-mini-2025-08-07";
    expect(scoreProviderEvalEntry(entry, f)).toMatchObject({ accepted: true, actualCostUsd: "0.000225" });
    entry.measurement.reportedModel = "gpt-5-mini-2026-10-25";
    expect(scoreProviderEvalEntry(entry, f)).toMatchObject({ accepted: false, actualCostUsd: "0.000225" });
    entry.measurement.reportedModel = "gpt-5-mini";
    entry.profileId = "luna-high";
    expect(scoreProviderEvalEntry(entry, f)).toMatchObject({ accepted: false, actualCostUsd: "0.000225" });
  });
  it("rejects stale corpus and changed request context for model and preflight results", () => {
    const f = fixture("case-explain-income-versus-agi"); const original = structuredClone(f.requestContext);
    const context = f.requestContext?.taxContext;
    if (!context) throw new Error("Missing synthetic context.");
    const payload = { disposition: "answer", sourceIds: [...f.sourceIds, ...context.excerpts.map(item => item.id), ...context.auditEntries.map(item => item.id)], answer: "These are the supplied audited values.", engineValues: [{ id: "1040:9", value: "75000" }, { id: "1040:10", value: "2000" }, { id: "1040:11", value: "73000" }] };
    const validated = validateProviderEvalOutput(f, payload);
    const entry: ProviderModelLiveEvalEntry = { profileId: "luna-high", fixtureId: f.id, fixtureVersion: 1, repeat: 1, elapsedMs: 1, applicationSchemaValid: true, output: validated.output,
      independentReview: { method: "human", reviewer: "unit-test-only-not-real-review", grounded: true, qualityAccepted: true, piiLeak: false },
      attempts: [{ profileId: "luna-high", startedAt: at, usage: { inputTokens: 100, outputTokens: 100 } }],
      measurement: { runPurpose: "qualification", ...provenance(f), bindingVersion: PROVIDER_EVAL_BINDING_VERSION, promptVersion: "tax-explanation/3", schemaVersion: "tax-explanation/3", normalizationStatus: "bound", applicationOutput: payload, privacyFailure: false, responseReference: "test-only", reportedModel: "gpt-6-luna" } };
    expect(scoreProviderEvalEntry(entry, f).accepted).toBe(true);
    const stale = structuredClone(entry);
    if (!stale.measurement) throw new Error("Missing measurement.");
    stale.measurement.corpusDigest = "stale-unrelated-corpus";
    stale.measurement.planDigest = "not-a-real-plan";
    expect(scoreProviderEvalEntry(stale, f)).toMatchObject({ accepted: false, complete: false, schemaValid: false, provenanceMatches: false });
    const staleFixture = structuredClone(entry);
    if (!staleFixture.measurement) throw new Error("Missing measurement.");
    staleFixture.measurement.fixtureDigest = "0".repeat(64);
    expect(scoreProviderEvalEntry(staleFixture, f).accepted).toBe(false);
    delete staleFixture.measurement.fixtureDigest;
    expect(scoreProviderEvalEntry(staleFixture, f).accepted).toBe(false);
    try {
      context.excerpts[0].text += " A changed request-side source with identical numeric oracles.";
      expect(scoreProviderEvalEntry(entry, f)).toMatchObject({ accepted: false, complete: false });
    } finally { f.requestContext = original; }

    const preflightCase = fixture("case-explain-stale-year"); const oldContext = structuredClone(preflightCase.requestContext);
    const preflight: NonNullable<ProviderModelLiveEvalTemplate["preflightEntries"]>[number] = { profileId: "luna-high", fixtureId: preflightCase.id, repeat: 1, reason: "invalid-verified-context", at, runPurpose: "qualification", ...provenance(preflightCase), bindingVersion: PROVIDER_EVAL_BINDING_VERSION };
    const summary = (record = preflight) => summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [], preflightEntries: [record] }).groups.find(item => item.profileId === "luna-high" && item.task === "tax-explanation");
    expect(summary()?.deterministicPreflightPassed).toBe(1);
    expect(summary({ ...preflight, corpusDigest: "stale-unrelated-corpus" })?.deterministicPreflightPassed).toBe(0);
    expect(summary({ ...preflight, fixtureDigest: "0".repeat(64) })?.deterministicPreflightPassed).toBe(0);
    expect(summary({ ...preflight, fixtureDigest: undefined })?.deterministicPreflightPassed).toBe(0);
    try {
      const old = preflightCase.requestContext?.taxContext;
      if (!old) throw new Error("Missing deliberately stale context.");
      old.excerpts[0].text += " Changed stale context.";
      expect(summary()?.deterministicPreflightPassed).toBe(0);
    } finally { preflightCase.requestContext = oldContext; }
  });
  it("records deterministic preflight separately without any paid request", async () => {
    const f = fixture("case-explain-income-versus-agi"); const original = f.requestContext;
    try {
      f.requestContext = { provenance: "synthetic-application-context", taxContext: null };
      const plan = createProviderEvalPlan({ runId: "preflight-test", purpose: "smoke", profileIds: ["luna-high"], fixtureIds: [f.id], maximumProviderUsd: "1", maximumRequests: 4, createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" });
      const records: EvalJournalRecord[] = []; let calls = 0;
      const result = await executeProviderEval({ plan, approval: { version: 1, planDigest: providerEvalDigest(plan), authorizedBy: "unit-test-only", authorizationReference: "not-live-authorization", approvedAt: at, expiresAt: plan.expiresAt, maximumProviderUsd: "1", maximumRequests: 4, accountReference: "unit-test", syntheticOnly: true }, records, append: async record => { records.push(record); }, now: () => at,
        transport: async () => { calls++; throw new Error("must not dispatch"); } });
      expect(calls).toBe(0); expect(result.knownProviderCostUsd).toBe("0"); expect(result.template.entries).toEqual([]);
      expect(result.template.preflightEntries).toHaveLength(3); expect(result.dispatchedRequests).toBe(0);
      expect(result.template.preflightEntries?.every(entry => entry.reason === "missing-verified-context")).toBe(true);
    } finally { f.requestContext = original; }
  });
  it("checks every draft against its application contract without simulating a provider review", () => {
    let preflights = 0;
    for (const f of taxProviderModelEvalFixtures) {
      expect(f.review.status).toBe("pending");
      const prepared = prepareProviderEvalCase(f);
      if (prepared.kind === "preflight") { preflights++; expect(f.expected.disposition).toBe("abstain"); continue; }
      // This constructs a test-only oracle shape, not a provider response or a qualification record.
      const envelope = { disposition: f.expected.disposition, sourceIds: [...f.sourceIds, ...(prepared.context.taxContext?.excerpts.map(row => row.id) ?? []), ...(prepared.context.taxContext?.auditEntries.map(row => row.id) ?? [])] };
      const facts = Object.entries(f.expected.fields).map(([name, field]) => ({ name, kind: field.kind, value: field.value, sourceId: f.sourceIds[0], sourceQuote: f.input }));
      const engineValues = Object.entries(f.expected.engineValues).map(([id, value]) => ({ id, value }));
      let payload: unknown;
      switch (f.task) {
        case "income-extraction": payload = { ...envelope, label: "Source", payer: "", documentPeriod: "", summary: "Review source.", facts, suggestions: [] }; break;
        case "expense-categorization": payload = { ...envelope, label: "Source", institution: "", statementPeriod: "", summary: "Review source.", facts, suggestions: [], reviewCategory: f.expected.category }; break;
        case "document-classification": payload = { ...envelope, title: "Source", documentType: f.expected.fields.documentType?.value ?? "unknown", summary: "Review source.", suggestedNextStep: "Confirm sources.", relevantTaxTopics: [], bankStatementLike: false }; break;
        case "workspace-summary": case "interview-wording": payload = { ...envelope, summary: "Confirm the supplied source facts before using a calculation." }; break;
        case "unsupported-route": payload = { ...envelope, reasonCode: "unsupported-scenario" }; break;
        case "tax-explanation": payload = { ...envelope, answer: "These are the supplied audited values.", engineValues }; break;
        case "complex-reconciliation": payload = { ...envelope, summary: "These are the supplied reconciled source facts.", facts, engineValues }; break;
      }
      const validation = validateProviderEvalOutput(f, payload);
      expect.soft(validation.normalizationStatus, f.id).toBe("bound");
      expect.soft(validation.applicationSchemaValid, f.id).toBe(true);
      expect.soft(validation.output?.fields, f.id).toEqual(Object.fromEntries(Object.entries(f.expected.fields).map(([name, field]) => [name, field.value])));
    }
    expect(preflights).toBe(12);
  });
  it("rejects forged preflight evidence and resumes without fabricated measurements", async () => {
    const f = fixture("case-explain-stale-year");
    expect(() => parseProviderModelLiveEvalTemplate({ version: 2, entries: [], preflightEntries: [{ profileId: "luna-high", fixtureId: f.id, repeat: 1, reason: "missing-verified-context", at, runPurpose: "qualification", planDigest: "test", corpusDigest: "test", bindingVersion: PROVIDER_EVAL_BINDING_VERSION }] })).toThrow(/preflight/i);
    const input = { profileId: "luna-high", fixtureId: f.id, repeat: 1, reason: "invalid-verified-context", at, runPurpose: "qualification", planDigest: "test", corpusDigest: "test", bindingVersion: PROVIDER_EVAL_BINDING_VERSION };
    expect(() => parseProviderModelLiveEvalTemplate({ version: 2, entries: [], preflightEntries: [input, input] })).toThrow(/duplicate/i);
    const regular = fixture("case-income-w2-zero-withholding");
    const plan = createProviderEvalPlan({ runId: "forged-preflight", purpose: "smoke", profileIds: ["luna-high"], fixtureIds: [regular.id], maximumProviderUsd: "1", maximumRequests: 4, createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" });
    expect(() => validateProviderEvalJournal(plan, [{ type: "start", planDigest: providerEvalDigest(plan), approvalDigest: "test" }, { type: "preflight", profileId: "luna-high", fixtureId: regular.id, repeat: 1, reason: "missing-verified-context", at }])).toThrow(/preflight/i);
    const replayFixture = fixture("case-explain-income-versus-agi"); const original = replayFixture.requestContext;
    try {
      replayFixture.requestContext = { provenance: "synthetic-application-context", taxContext: null };
      const replayPlan = createProviderEvalPlan({ runId: "preflight-replay", purpose: "smoke", profileIds: ["luna-high"], fixtureIds: [replayFixture.id], maximumProviderUsd: "1", maximumRequests: 4, createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" });
      const records: EvalJournalRecord[] = []; let calls = 0;
      const execution = { plan: replayPlan, approval: { version: 1, planDigest: providerEvalDigest(replayPlan), authorizedBy: "unit-test-only", authorizationReference: "not-live-authorization", approvedAt: at, expiresAt: replayPlan.expiresAt, maximumProviderUsd: "1", maximumRequests: 4, accountReference: "unit-test", syntheticOnly: true }, records,
        append: async (record: EvalJournalRecord) => { records.push(record); }, now: () => at,
        transport: async () => { calls++; throw new Error("must not dispatch"); } };
      const initial = await executeProviderEval(execution);
      const savedJournal = JSON.stringify(records);
      const resumed = await executeProviderEval(execution);
      expect(JSON.stringify(records)).toBe(savedJournal);
      expect(resumed).toEqual(initial);
      expect(resumed.template.preflightEntries).toHaveLength(3);
      expect(resumed.template.entries).toEqual([]);
      expect(resumed.knownProviderCostUsd).toBe("0");
      expect(calls).toBe(0);
    } finally { replayFixture.requestContext = original; }
  });
  it("retains real usage when application grounding fails", async () => {
    const f = fixture("case-income-w2-zero-withholding"); const plan = createProviderEvalPlan({ runId: "billed-source-test", purpose: "smoke", profileIds: ["luna-high"], fixtureIds: [f.id], maximumProviderUsd: "1", maximumRequests: 4, createdAt: at, expiresAt: "2026-10-25T13:00:00.000Z" });
    const records: EvalJournalRecord[] = []; let calls = 0;
    const result = await executeProviderEval({ plan, approval: { version: 1, planDigest: providerEvalDigest(plan), authorizedBy: "unit-test-only", authorizationReference: "not-live-authorization", approvedAt: at, expiresAt: plan.expiresAt, maximumProviderUsd: "1", maximumRequests: 4, accountReference: "unit-test", syntheticOnly: true }, records, append: async record => { records.push(record); }, now: () => at,
      transport: async () => { calls++; const payload = income(); payload.facts[0].value = "48223.19"; return { status: "completed", usage: { inputTokens: 100, outputTokens: 100 }, elapsedMs: 10, reportedModel: "gpt-6-luna", responseReference: "test", payload: calls === 1 ? { probe: "ok" } : payload }; } });
    expect(result.knownProviderCostUsd).toBe("0.00024");
    expect(result.template.entries.every(entry => entry.measurement?.normalizationStatus === "failed")).toBe(true);
    expect(validateProviderEvalOutput(f, { ...income(), summary: "SSN 123-45-6789" })).toMatchObject({ privacyFailure: true, applicationOutput: null, output: null });
  });
});
