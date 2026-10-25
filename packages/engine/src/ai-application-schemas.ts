import { z } from "zod";
/** Actual application contracts. Evaluation must not substitute a sidecar schema. */
const shortText = z.string().max(2000);
const sourceId = z.string().min(1).max(200);
const sourceIds = z.array(sourceId).min(1).max(50);
const disposition = z.enum(["answer", "abstain"]);
const envelope = { disposition, sourceIds };
const categories = z.enum(["advertising", "carAndTruck", "insurance", "officeExpense", "supplies", "travel", "meals", "utilities", "otherExpenses", "not-business", "needs-review"]);
export const sourceFactSchema = z.strictObject({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/), kind: z.enum(["money", "date", "text"]),
  value: z.string().max(2000).nullable(), sourceId, sourceQuote: z.string().min(1).max(4000).nullable(),
});
export type AiSourceFact = z.infer<typeof sourceFactSchema>;
const facts = z.array(sourceFactSchema).max(100);
export const documentSuggestionSchema = z.strictObject({ date: shortText, description: shortText,
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/), confidence: z.enum(["high", "low"]), reason: shortText,
  sourceQuote: z.string().min(1).max(4000) });
export const documentIncomeSchema = z.strictObject({ ...envelope, label: shortText, payer: shortText, documentPeriod: shortText, summary: shortText,
  facts, suggestions: z.array(documentSuggestionSchema).max(150) });
export const documentExpenseSchema = z.strictObject({ ...envelope, label: shortText, institution: shortText, statementPeriod: shortText, summary: shortText,
  facts, reviewCategory: z.enum(["needs-review", "not-business"]).nullable(),
  suggestions: z.array(documentSuggestionSchema.extend({ suggestedCategory: categories, suggestedBusinessUse: z.boolean() })).max(150) });
export const documentClassificationSchema = z.strictObject({ ...envelope, title: shortText, documentType: shortText, summary: shortText,
  suggestedNextStep: shortText, relevantTaxTopics: z.array(shortText).max(20), bankStatementLike: z.boolean() });
export const documentSummarySchema = z.strictObject({ ...envelope, summary: z.string().trim().min(1).max(2000) });
export const workspaceSummarySchema = documentSummarySchema;
const engineValues = z.array(z.strictObject({ id: sourceId, value: z.string().regex(/^-?\d+(?:\.\d+)?$/).max(100) })).max(50);
export const workspaceHelpSchema = z.strictObject({ ...envelope, answer: z.string().trim().min(1).max(2000), engineValues });
export const unsupportedRouteSchema = z.strictObject({ disposition: z.literal("abstain"), sourceIds,
  reasonCode: z.enum(["unsupported-scenario", "missing-facts", "conflicting-sources", "missing-verified-audit", "privacy-boundary"]) });
export const complexReconciliationSchema = z.strictObject({ ...envelope, summary: z.string().trim().min(1).max(2000), facts, engineValues });
