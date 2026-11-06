import { describe, expect, it, vi } from "vitest";
import { executeEvidenceAssistance } from "../../../apps/web/src/lib/ai-evidence-tasks";
vi.mock("server-only", () => ({}));
const source = { id: "source:1", text: "Source total 120.00. Actual audit:income=120." };
const taxContext = { taxYear: 2026, ruleVersion: "synthetic", excerpts: [{ id: "spec:1", taxYear: 2026, text: "Preserve actual distinct source receipts." }],
  auditEntries: [{ id: "audit:income", taxYear: 2026, value: "120", explanation: "Actual computed income." }] };
const payload = { disposition: "answer", summary: "The verified income is $120.", sourceIds: [source.id, "spec:1", "audit:income"],
  facts: [{ name: "total", kind: "money", value: "120", sourceId: source.id, sourceQuote: source.text }], engineValues: [{ id: "audit:income", value: "120" }] };
describe("bounded evidence assistance", () => {
  it("requires an explicit cancellable reconciliation with verified sources", async () => {
    const fetchFn = vi.fn().mockResolvedValue(Response.json({ status: "completed", output_text: JSON.stringify(payload), usage: { input_tokens: 100, output_tokens: 100 } }));
    const execution = { mode: "evaluation" as const, syntheticFixtureId: "reconciliation-1", apiKey: "synthetic", fetchFn, now: () => "2026-10-25" };
    const request = { task: "complex-reconciliation" as const, sources: [source], taxContext, signal: new AbortController().signal };
    await expect(executeEvidenceAssistance(request, execution)).rejects.toThrow(/explicit escalation/i);
    await expect(executeEvidenceAssistance({ ...request, signal: undefined }, { ...execution, escalationCount: 1 })).rejects.toThrow(/cancell/i);
    await expect(executeEvidenceAssistance({ ...request, taxContext: undefined }, { ...execution, escalationCount: 1 })).rejects.toThrow(/verified/i);
    expect(fetchFn).not.toHaveBeenCalled();
    const result = await executeEvidenceAssistance(request, { ...execution, escalationCount: 1 });
    expect(result).toMatchObject({ accepted: true, requiresUserConfirmation: true, value: payload });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toMatchObject({ model: "gpt-6.1-sol", reasoning: { effort: "high" }, store: false });
  });
  it("keeps production and opt-out deterministic without evaluating evidence", async () => {
    const fetchFn = vi.fn();
    const request = { task: "unsupported-route" as const, sources: [source] };
    expect(await executeEvidenceAssistance(request, { mode: "production", apiKey: "synthetic", fetchFn })).toBeNull();
    expect(await executeEvidenceAssistance({ ...request, optedOut: true }, { mode: "evaluation", syntheticFixtureId: "case", apiKey: "synthetic", fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
