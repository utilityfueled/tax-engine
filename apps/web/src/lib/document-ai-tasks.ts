import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import type { AiTask } from "@tax-engine/engine/src/ai-task-registry";
import { executeAiTask, type AiTaskExecution } from "./ai-task-adapter";

const shortText = z.string().max(2000);
const categories = z.enum(["advertising", "carAndTruck", "insurance", "officeExpense", "supplies", "travel", "meals", "utilities", "otherExpenses", "not-business", "needs-review"]);
const amount = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const suggestion = z.object({ date: shortText, description: shortText, amount,
  confidence: z.enum(["high", "low"]), reason: shortText, sourceQuote: z.string().min(1).max(4000) }).strict();
const income = z.object({ label: shortText, payer: shortText, documentPeriod: shortText, summary: shortText,
  suggestions: z.array(suggestion).max(150) }).strict();
const expenses = z.object({ label: shortText, institution: shortText, statementPeriod: shortText, summary: shortText,
  suggestions: z.array(suggestion.extend({ suggestedCategory: categories, suggestedBusinessUse: z.boolean() })).max(150) }).strict();
const classification = z.object({ title: shortText, documentType: shortText, summary: shortText,
  suggestedNextStep: shortText, relevantTaxTopics: z.array(shortText).max(20), bankStatementLike: z.boolean() }).strict();
const summary = z.object({ summary: shortText }).strict();

export type DocumentAiTask = Extract<AiTask, "document-classification" | "income-extraction" | "expense-categorization" | "workspace-summary" | "interview-wording">;
export type DocumentAiExecutor = (task: DocumentAiTask, prompt: string, redactedText: string) => Promise<unknown | null>;

/** Ground amounts, dates and descriptions in exact extracted text before normalization. */
export function validateDocumentSuggestions(value: unknown, redactedText: string): void {
  if (!value || typeof value !== "object" || !("suggestions" in value)) return;
  const rows = z.array(suggestion.passthrough()).parse(value.suggestions);
  const seen = new Set<string>();
  for (const row of rows) {
    if (!redactedText.includes(row.sourceQuote) || !row.sourceQuote.includes(row.description)
      || (row.date && !row.sourceQuote.includes(row.date))) throw new Error("Document fields lack a literal source quote.");
    const sourceAmounts = row.sourceQuote.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g) ?? [];
    if (!sourceAmounts.some(value => new Decimal(value.replaceAll(",", "")).equals(row.amount))) throw new Error("Amount is absent from the quoted source.");
    const key = JSON.stringify([row.date, row.description, new Decimal(row.amount).toFixed()]);
    if (seen.has(key)) throw new Error("Duplicate document suggestion requires reconciliation.");
    seen.add(key);
  }
}

/** Evaluation is injected by a trusted harness; application callers default to gated production. */
export function createDocumentAiExecutor(execution: AiTaskExecution = { mode: "production" }): DocumentAiExecutor {
  return async (task, prompt, redactedText) => {
    const schema = task === "document-classification" ? classification
      : task === "income-extraction" ? income : task === "expense-categorization" ? expenses : summary;
    const result = await executeAiTask<unknown>({ task, redactedText, schema,
      instructions: `${prompt}\nEach extracted suggestion must include sourceQuote copied verbatim from the source. Its date, description and amount must appear in that quote. Leave ambiguous business use for review.`,
      validateGrounding(value) {
        validateDocumentSuggestions(value, redactedText);
        if (/ready (?:to|for) fil(?:e|ing)|filing[- ]ready|guaranteed (?:refund|deduction)/i.test(JSON.stringify(value))) {
          throw new Error("Document analysis cannot establish filing readiness.");
        }
      },
    }, execution);
    if (!result?.accepted) return null;
    // Merchant/category evidence does not establish business purpose. Confirmation stays explicit.
    if (task === "expense-categorization") {
      const parsed = expenses.parse(result.value);
      return { ...parsed, suggestions: parsed.suggestions.map(row => ({ ...row, suggestedBusinessUse: false,
        suggestedCategory: row.suggestedCategory === "not-business" ? "not-business" : "needs-review", confidence: "low" })) };
    }
    return result.value;
  };
}
