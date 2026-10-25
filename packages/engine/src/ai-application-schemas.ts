import { z } from "zod";
/** Shared with actual application callers. Evaluation must not substitute its own output schema. */
const shortText = z.string().max(2000);
const categories = z.enum(["advertising", "carAndTruck", "insurance", "officeExpense", "supplies", "travel", "meals", "utilities", "otherExpenses", "not-business", "needs-review"]);
export const documentSuggestionSchema = z.object({ date: shortText, description: shortText,
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/), confidence: z.enum(["high", "low"]), reason: shortText,
  sourceQuote: z.string().min(1).max(4000) }).strict();
export const documentIncomeSchema = z.object({ label: shortText, payer: shortText, documentPeriod: shortText, summary: shortText,
  suggestions: z.array(documentSuggestionSchema).max(150) }).strict();
export const documentExpenseSchema = z.object({ label: shortText, institution: shortText, statementPeriod: shortText, summary: shortText,
  suggestions: z.array(documentSuggestionSchema.extend({ suggestedCategory: categories, suggestedBusinessUse: z.boolean() })).max(150) }).strict();
export const documentClassificationSchema = z.object({ title: shortText, documentType: shortText, summary: shortText,
  suggestedNextStep: shortText, relevantTaxTopics: z.array(shortText).max(20), bankStatementLike: z.boolean() }).strict();
export const documentSummarySchema = z.object({ summary: shortText }).strict();
const sourceIds = z.array(z.string().min(1).max(200)).min(1).max(30);
export const workspaceSummarySchema = z.strictObject({ summary: z.string().trim().min(1).max(2000), sourceIds });
export const workspaceHelpSchema = z.strictObject({ answer: z.string().trim().min(1).max(2000), sourceIds,
  engineValues: z.array(z.strictObject({ id: z.string(), value: z.string() })).max(30) });
