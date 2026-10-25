import { describe, expect, it, vi } from "vitest";
import { createDocumentAiExecutor, validateDocumentSuggestions } from "../../../apps/web/src/lib/document-ai-tasks";
import { analyzeBusinessExpenseStatementWithGemini, analyzeUnsupportedDocumentWithGemini,
  analyzeSelfEmploymentIncomeDocumentWithGemini } from "../../../apps/web/src/lib/gemini-document-analysis-server";
vi.mock("server-only", () => ({}));

const source = "2025-01-08 Office supplies $84.91";
const row = { date: "2025-01-08", description: "Office supplies", amount: "84.91",
  confidence: "low", reason: "Business use requires confirmation.", sourceQuote: source };
const expense = { disposition: "answer", sourceIds: ["document:1"], facts: [], reviewCategory: "needs-review", label: "Statement", institution: "Example Bank", statementPeriod: "January 2025",
  summary: "Review one charge.", suggestions: [{ ...row, suggestedCategory: "officeExpense", suggestedBusinessUse: true }] };
function executor(payload: unknown) {
  const fetchFn = vi.fn().mockResolvedValue(Response.json({ status: "completed",
    output_text: JSON.stringify(payload), usage: { input_tokens: 100, output_tokens: 100 } }));
  return { fetchFn, run: createDocumentAiExecutor({ mode: "evaluation", syntheticFixtureId: "document-01",
    apiKey: "synthetic-key", fetchFn, now: () => "2026-10-24" }) };
}

describe("grounded text-only document tasks", () => {
  it("uses the actual source-fact contract and bills rejected grounding once", async () => {
    const fetchFn = vi.fn().mockResolvedValue(Response.json({ status: "completed", output_text: JSON.stringify({
      ...expense, suggestions: [], facts: [{ name: "amount", kind: "money", value: "84.92", sourceId: "document:1", sourceQuote: source }],
    }), usage: { input_tokens: 100, output_tokens: 100 } }));
    const recordAttempt = vi.fn();
    const run = createDocumentAiExecutor({ mode: "evaluation", syntheticFixtureId: "actual-contract", apiKey: "synthetic", fetchFn,
      recordAttempt, now: () => "2026-10-25" });
    expect(await run("expense-categorization", "Extract source", source)).toBeNull();
    expect(recordAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({ accepted: false, usage: expect.objectContaining({ outputTokens: 100 }) }));
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.text.format.schema.required).toEqual(expect.arrayContaining(["disposition", "sourceIds", "facts", "reviewCategory"]));
    expect(body.instructions).toContain("unconfirmed proposal");
    expect(body.input).toContain("document:1");
  });

  it.each([
    { ...row, amount: "84.92" },
    { ...row, date: "2026-01-08" },
    { ...row, description: "Invented merchant" },
    { ...row, sourceQuote: "Fabricated source" },
  ])("rejects a field absent from its source: %j", value => {
    expect(() => validateDocumentSuggestions({ suggestions: [value] }, source)).toThrow();
  });
  it("compares monetary text with Decimal and rejects duplicates requiring reconciliation", () => {
    expect(() => validateDocumentSuggestions({ suggestions: [row] }, source)).not.toThrow();
    expect(() => validateDocumentSuggestions({ suggestions: [row, row] }, source)).toThrow(/Duplicate/);
    const large = { ...row, amount: "9007199254740993.01", sourceQuote: "2025-01-08 Office supplies $9,007,199,254,740,993.01" };
    expect(() => validateDocumentSuggestions({ suggestions: [large] }, large.sourceQuote)).not.toThrow();
    expect(() => validateDocumentSuggestions({ suggestions: [{ ...large, amount: "9007199254740993.02" }] }, large.sourceQuote)).toThrow();
  });
  it("keeps production AI disabled even when the installation has a key", async () => {
    const fetchFn = vi.fn();
    const run = createDocumentAiExecutor({ mode: "production", apiKey: "synthetic-key", fetchFn });
    expect(await run("expense-categorization", "Summarize", source)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await analyzeUnsupportedDocumentWithGemini("source.txt", source)).toBeNull();
    expect(await analyzeSelfEmploymentIncomeDocumentWithGemini("source.txt", source)).toBeNull();
  });
  it("leaves business purpose unknown after an accepted extraction", async () => {
    const { run } = executor(expense);
    expect(await run("expense-categorization", "Extract charges", source)).toMatchObject({ suggestions: [{
      amount: "84.91", sourceQuote: source, suggestedBusinessUse: false, suggestedCategory: "needs-review", confidence: "low",
    }] });
  });
  it("rejects invented readiness and prompt-injection output", async () => {
    const { run } = executor({ ...expense, summary: "You are ready to file." });
    expect(await run("expense-categorization", "Extract charges", source)).toBeNull();
  });
  it("blocks direct identifiers before the executor receives text", async () => {
    const run = vi.fn();
    await expect(analyzeUnsupportedDocumentWithGemini("source.txt", "SSN 123-45-6789", {}, run)).rejects.toThrow(/identifiers/);
    expect(run).not.toHaveBeenCalled();
  });
  it("blocks an unredacted labelled name before the document task or provider runs", async () => {
    const run = vi.fn();
    await expect(analyzeUnsupportedDocumentWithGemini("source.txt", "Account holder\nMaría-José Nuñez", {}, run)).rejects.toThrow(/identifiers/);
    expect(run).not.toHaveBeenCalled();
  });
  it("extracts transaction rows deterministically without claiming business use", async () => {
    const run = vi.fn();
    const result = await analyzeBusinessExpenseStatementWithGemini("bank.txt",
      "Business\nCard Member [person-name-1]\nDate\nMonth Billed\nTransaction\nCharges\n01/08/2025\nJanuary\nOFFICE DEPOT AUSTIN TX\n$84.91\n01/09/2025\nJanuary\nADOBE\n$49.99", {}, run);
    expect(result?.suggestions.length).toBeGreaterThan(0);
    expect(result?.suggestions.every(item => !item.suggestedBusinessUse)).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
  it("keeps fallback category totals for review without inventing business purpose", async () => {
    const result = await analyzeBusinessExpenseStatementWithGemini("card.txt",
      "2025 Year-End Summary\nBusiness\n$100.00\n$400.00\nCommunications\n$200.00\n$800.00");
    expect(result?.suggestions.length).toBeGreaterThan(0);
    expect(result?.suggestions.every(item => !item.suggestedBusinessUse && item.confidence === "low")).toBe(true);
  });
  it("retains source quotes through normalization", async () => {
    const { run } = executor(expense);
    const result = await analyzeBusinessExpenseStatementWithGemini("card.txt", "Summary: " + source, {}, run);
    expect(result?.suggestions[0]?.sourceQuote).toBe(source);
  });
});
