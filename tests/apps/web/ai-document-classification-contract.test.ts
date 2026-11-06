import { describe, expect, it, vi } from "vitest";
import { analyzeUnsupportedDocumentWithGemini } from "../../../apps/web/src/lib/gemini-document-analysis-server";
import { normalizeUnsupportedDocumentAiInsight } from "../../../apps/web/src/lib/business-expense-analysis";
import { createDocumentAiExecutor } from "../../../apps/web/src/lib/document-ai-tasks";
vi.mock("server-only", () => ({}));
const source = "Form W-2c Corrected Wage and Tax Statement; previous and corrected amounts.";
const payload = { disposition: "answer", sourceIds: ["document:1"], title: "Corrected wage statement", documentType: "w2c", summary: "The source is a correction form.", suggestedNextStep: "Review original corrections and confirm the facts.", relevantTaxTopics: [], bankStatementLike: false };
function setup(value: unknown) {
  const fetchFn = vi.fn().mockResolvedValue(Response.json({ status: "completed", output_text: JSON.stringify(value), usage: { input_tokens: 100, output_tokens: 100 } }));
  const recordAttempt = vi.fn();
  return { fetchFn, recordAttempt, run: createDocumentAiExecutor({ mode: "evaluation", syntheticFixtureId: "canonical-classification", apiKey: "synthetic-no-live-key", fetchFn, recordAttempt, now: () => "2026-11-05" }) };
}
describe("prospective actual document classification caller", () => {
  it("sends the canonical schema through the actual document executor", async () => {
    const { run, fetchFn, recordAttempt } = setup(payload);
    expect(await run("document-classification", "Classify this document.", source)).toEqual(payload);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.text.format.schema.properties.documentType.enum).toContain("w2c");
    expect(body.text.format.schema.properties.documentType.description).toContain("w2c: Form W-2c");
    expect(body.instructions).toContain("canonical documentType ID");
    expect(recordAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({ accepted: true }));
  });
  it("rejects historical freeform output once without converting or retrying", async () => {
    const { run, fetchFn, recordAttempt } = setup({ ...payload, documentType: "Form W-2c" });
    expect(await run("document-classification", "Classify.", source)).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(recordAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({ accepted: false, usage: expect.objectContaining({ inputTokens: 100, outputTokens: 100 }) }));
  });
  it("keeps an actual descriptive caller from applying upload facts or tax-year support", async () => {
    const { run, fetchFn } = setup(payload);
    const value = await analyzeUnsupportedDocumentWithGemini("correction.txt", source, {}, run);
    expect(value).toMatchObject({ kind: "unknown", coverage: "reviewed", seededFactIds: [], detectedFacts: [] });
    expect(value?.notes).toContain("w2c");
    expect(value).not.toHaveProperty("taxYear");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it("leaves a retained historical display label unchanged outside new execution", () => {
    const historical = { ...payload, documentType: "Form W-2c" };
    expect(normalizeUnsupportedDocumentAiInsight(historical, "old.txt")?.documentType).toBe("Form W-2c");
    expect(historical.documentType).toBe("Form W-2c");
  });
  it("keeps unknown abstention nonactionable and production execution disabled", async () => {
    const unknown = setup({ ...payload, disposition: "abstain", documentType: "unknown" });
    expect(await unknown.run("document-classification", "Classify.", source)).toBeNull();
    expect(unknown.fetchFn).toHaveBeenCalledTimes(1);
    const { run, fetchFn } = setup({ ...payload, documentType: "unknown" });
    expect(await run("document-classification", "Classify.", source)).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const never = vi.fn(); const production = createDocumentAiExecutor({ mode: "production", apiKey: "synthetic", fetchFn: never });
    expect(await production("document-classification", "Classify.", source)).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });
});
