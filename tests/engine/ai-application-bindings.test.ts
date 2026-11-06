import { describe, expect, it } from "vitest";
import { applicationSchemaForTask, parseApplicationTaskOutput, normalizeApplicationTaskOutput, unsupportedRouteMessage } from "../../packages/engine/src/ai-application-bindings";
import { AI_TASKS } from "../../packages/engine/src/ai-task-registry";

const source = { id: "document:1", text: "2026-02-03 proceeds 10.00; basis 12.37; loss (2.37); withholding 0.00; uncertain date 04/05/26." };
const context = { sources: [source], requestedFields: [{ name: "loss", kind: "money" as const }, { name: "withholding", kind: "money" as const }, { name: "date", kind: "date" as const }] };
const fact = { name: "loss", kind: "money", value: "-2.37", sourceId: source.id, sourceQuote: "loss (2.37)" };
const income = { disposition: "answer", sourceIds: [source.id], label: "Source", payer: "", documentPeriod: "", summary: "Review the source amounts.", suggestions: [], facts: [fact] };
const taxContext = { taxYear: 2026, ruleVersion: "2026-synthetic", excerpts: [{ id: "spec:1", taxYear: 2026, text: "Allowed credit is limited by available tax." }], auditEntries: [{ id: "audit:credit", taxYear: 2026, value: "1234.56", explanation: "Actual allowed credit." }] };

describe("actual application task bindings", () => {
  it("rejects invented and empty text values despite a valid quote", () => {
    const payer = { id: source.id, text: "Payer Acme Corp; payment 50.00." };
    for (const value of ["Invented Paying Company", "", "   "]) {
      expect(() => parseApplicationTaskOutput("income-extraction", { ...income, facts: [{ name: "payer", kind: "text", value, sourceId: payer.id, sourceQuote: payer.text }] }, { sources: [payer] })).toThrow(/text/i);
    }
    expect(() => parseApplicationTaskOutput("income-extraction", { ...income, facts: [{ name: "payer", kind: "text", value: "Acme Corp", sourceId: payer.id, sourceQuote: payer.text }] }, { sources: [payer] })).not.toThrow();
  });
  it("renders unsupported messages only from constrained reason codes", () => {
    expect(() => parseApplicationTaskOutput("unsupported-route", { disposition: "abstain", sourceIds: [source.id], message: "You can submit this completed return to the IRS now." }, { sources: [source] })).toThrow();
    const value = parseApplicationTaskOutput("unsupported-route", { disposition: "abstain", sourceIds: [source.id], reasonCode: "unsupported-scenario" }, { sources: [source] });
    expect(unsupportedRouteMessage(value)).toBe("This scenario needs review before the return can be calculated. Check the support details and provide the required source facts.");
    expect(() => unsupportedRouteMessage({ ...value, reasonCode: "file-now" })).toThrow();
  });
  it("preserves exact signed source amounts and explicit unknowns", () => {
    const value = { ...income, facts: [fact,
      { name: "withholding", kind: "money", value: "0.00", sourceId: source.id, sourceQuote: "withholding 0.00" },
      { name: "date", kind: "date", value: null, sourceId: source.id, sourceQuote: null }] };
    const accepted = parseApplicationTaskOutput("income-extraction", value, context);
    expect(accepted).toEqual(value);
    expect(normalizeApplicationTaskOutput("income-extraction", accepted)).toMatchObject({ fields: { loss: "-2.37", withholding: "0.00" }, disposition: "answer" });
    expect(normalizeApplicationTaskOutput("income-extraction", accepted).fields).not.toHaveProperty("date");
    const huge = { id: "large", text: "Amount 9007199254740993.01" };
    const payload = { ...income, sourceIds: [huge.id], facts: [{ ...fact, value: "9007199254740993.01", sourceId: huge.id, sourceQuote: huge.text }] };
    expect(() => parseApplicationTaskOutput("income-extraction", payload, { sources: [huge] })).not.toThrow();
    expect(() => parseApplicationTaskOutput("income-extraction", { ...payload, facts: [{ ...payload.facts[0], value: "9007199254740993.02" }] }, { sources: [huge] })).toThrow();
  });
  it("rejects fabricated values and source references before accepting proposals", () => {
    for (const changed of [{ ...fact, value: "2.37" }, { ...fact, sourceId: "other" }, { ...fact, sourceQuote: "invented 2.37" }, { ...fact, kind: "text" },
      { name: "date", kind: "date", value: "2026-04-05", sourceId: source.id, sourceQuote: "uncertain date 04/05/26" }]) {
      expect(() => parseApplicationTaskOutput("income-extraction", { ...income, facts: [changed] }, context)).toThrow();
    }
    expect(() => parseApplicationTaskOutput("income-extraction", { ...income, facts: [fact, fact] }, context)).toThrow(/Duplicate/);
    expect(() => parseApplicationTaskOutput("income-extraction", { ...income, sourceIds: ["other"] }, context)).toThrow(/source/i);
    expect(() => parseApplicationTaskOutput("income-extraction", income, { sources: [source, source] })).toThrow(/Duplicate/);
  });
  it("keeps extraction proposals unconfirmed and abstention nonactionable", () => {
    const row = { date: "2026-02-03", description: "proceeds", amount: "10", confidence: "high", reason: "Review", sourceQuote: source.text,
      suggestedCategory: "officeExpense", suggestedBusinessUse: true };
    const expense = { disposition: "answer", sourceIds: [source.id], label: "Source", institution: "", statementPeriod: "", summary: "Review", facts: [], reviewCategory: "needs-review", suggestions: [row] };
    expect(parseApplicationTaskOutput("expense-categorization", expense, { sources: [source] })).toMatchObject({ suggestions: [{ suggestedCategory: "needs-review", suggestedBusinessUse: false, confidence: "low" }] });
    expect(() => parseApplicationTaskOutput("expense-categorization", { ...expense, disposition: "abstain" }, { sources: [source] })).toThrow(/Abstention/);
  });
  it("binds each task to its actual schema without an evaluation sidecar", () => {
    for (const task of Object.keys(AI_TASKS) as (keyof typeof AI_TASKS)[]) expect(applicationSchemaForTask(task)).toBeDefined();
    expect(applicationSchemaForTask("income-extraction").safeParse({ ...income, fields: { loss: "-2.37" } }).success).toBe(false);
    expect(applicationSchemaForTask("workspace-summary").safeParse(income).success).toBe(false);
    const unsupported = { disposition: "abstain", sourceIds: [source.id], reasonCode: "unsupported-scenario" };
    expect(parseApplicationTaskOutput("unsupported-route", unsupported, { sources: [source] })).toEqual(unsupported);
    expect(() => parseApplicationTaskOutput("unsupported-route", { ...unsupported, disposition: "answer" }, { sources: [source] })).toThrow();
    expect(() => parseApplicationTaskOutput("unsupported-route", { ...unsupported, message: "Ready to file" }, { sources: [source] })).toThrow();
  });
  it("requires verified matching-year context and unchanged engine values", () => {
    const payload = { disposition: "answer", answer: "The allowed credit is $1,234.56.", sourceIds: ["spec:1", "audit:credit"], engineValues: [{ id: "audit:credit", value: "1234.56" }] };
    const grounded = { sources: [source], taxContext };
    expect(parseApplicationTaskOutput("tax-explanation", payload, grounded)).toEqual(payload);
    expect(() => parseApplicationTaskOutput("tax-explanation", payload, { sources: [source] })).toThrow(/verified/i);
    expect(() => parseApplicationTaskOutput("tax-explanation", payload, { ...grounded, taxContext: { ...taxContext, taxYear: 2025 } })).toThrow(/year/i);
    expect(() => parseApplicationTaskOutput("tax-explanation", { ...payload, engineValues: [{ id: "audit:credit", value: "1234.57" }] }, grounded)).toThrow(/audit/i);
    expect(() => parseApplicationTaskOutput("tax-explanation", { ...payload, answer: "The credit is $2000." }, grounded)).toThrow(/monetary/i);
    expect(() => parseApplicationTaskOutput("tax-explanation", { ...payload, sourceIds: ["audit:credit"] }, grounded)).toThrow(/source.*audit/i);
  });
});
