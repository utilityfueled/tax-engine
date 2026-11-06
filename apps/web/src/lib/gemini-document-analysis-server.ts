import "server-only";
import { AI_PROFILES } from "@tax-engine/engine/src/ai-task-registry";
import { createDocumentAiExecutor, type DocumentAiExecutor, type DocumentAiTask } from "./document-ai-tasks";

import type { ParsedUploadedDocument } from "@/lib/uploaded-document-detection";
import { containsUnsafeDirectIdentifier } from "@/lib/provider-request-privacy";
import {
  buildFallbackBankStatementAnalysis,
  buildTransactionLevelBankStatementAnalysis,
  compactRedactedAiDocumentText,
  normalizeBankStatementAnalysis,
  normalizeSelfEmploymentIncomeDocumentAnalysis,
  normalizeUnsupportedDocumentAiInsight,
} from "@/lib/business-expense-analysis";
import type {
  GuidedReviewIssue,
  ScheduleCBankStatementAnalysis,
  SelfEmploymentIncomeDocumentAnalysis,
} from "@/lib/guided-interview-flow";
import type { ProviderWorkspaceRequest } from "@/lib/provider-workspace-request";

/** Compatibility name retained for existing routes; no preview model is selected implicitly. */
export function resolveGeminiAnalysisModelId(env: NodeJS.ProcessEnv = process.env) {
  return AI_PROFILES[env.TAX_ENGINE_AI_PROVIDER === "google" ? "gemini-flash-high" : "luna-high"].model;
}

const productionExecutor = createDocumentAiExecutor();

function requireBusinessPurposeReview(analysis: ScheduleCBankStatementAnalysis | null) {
  return analysis && { ...analysis, suggestions: analysis.suggestions.map(row => ({
    ...row, suggestedBusinessUse: false,
    suggestedCategory: row.suggestedCategory === "not-business" ? "not-business" as const : "needs-review" as const,
    confidence: "low" as const,
  })) };
}

async function callDocumentTask(
  task: DocumentAiTask, prompt: string, fileName: string, redactedText: string,
  executor: DocumentAiExecutor,
) {
  if (!redactedText.trim()) throw new Error(`${fileName} did not produce readable text.`);
  if (containsUnsafeDirectIdentifier(redactedText)) throw new Error("Document analysis was blocked because direct identifiers remain.");
  return executor(task, prompt, redactedText);
}

export async function analyzeUnsupportedDocumentWithGemini(
  fileName: string,
  redactedText: string,
  _env: NodeJS.ProcessEnv = process.env,
  executor: DocumentAiExecutor = productionExecutor,
): Promise<ParsedUploadedDocument | null> {
  const payload = await callDocumentTask(
    "document-classification",
    [
      "Review this uploaded tax-adjacent document.",
      "Use the supplied versioned schema, including explicit disposition, citations and unknown source facts.",
      "Rules:",
      "- Never invent fields that are not visible in the document.",
      "- Keep the summary concise and factual.",
      "- bankStatementLike should be true only for bank or card statements that could help categorize business expenses.",
      "- If the document is a brokerage packet, 1095-C, paystub, or other unsupported tax document, explain that plainly.",
    ].join("\n"),
    fileName,
    redactedText,
    executor,
  );
  const insight = normalizeUnsupportedDocumentAiInsight(payload, fileName);

  if (!insight) {
    return null;
  }

  return {
    kind: "unknown",
    coverage: "reviewed",
    label: insight.title,
    notes: `${insight.documentType}. ${insight.summary} Next step: ${insight.suggestedNextStep}`,
    seededFactIds: insight.bankStatementLike ? ["schedule-c-expense-review"] : [],
    detectedFacts: [],
  } satisfies ParsedUploadedDocument;
}

export async function analyzeBusinessExpenseStatementWithGemini(
  fileName: string,
  redactedText: string,
  _env: NodeJS.ProcessEnv = process.env,
  executor: DocumentAiExecutor = productionExecutor,
): Promise<ScheduleCBankStatementAnalysis | null> {
  const parsedTransactions = buildTransactionLevelBankStatementAnalysis(fileName, redactedText);

  if (parsedTransactions?.suggestions.length) {
    // Deterministic transactions are already extracted. Business purpose remains unconfirmed.
    return requireBusinessPurposeReview(parsedTransactions);
  }

  const compactedText = compactRedactedAiDocumentText(redactedText, {
    includeAmountsOnly: false,
    maxLines: 260,
    maxChars: 26000,
  });
  const payload = await callDocumentTask(
    "expense-categorization",
    [
      "Analyze this bank or card statement for possible Schedule C business expenses.",
      "Use the supplied versioned schema, including explicit disposition, citations and unknown source facts.",
      "Rules:",
      "- Only include outgoing charges or debits, not deposits, payments received, or obvious transfers.",
      "- Never guess an amount or merchant if it is not readable.",
      "- If the document is a year-end summary or category summary instead of a transaction ledger, still return candidate expense suggestions from the readable category totals or month totals.",
      "- Ambiguous business use must remain needs-review, with suggestedBusinessUse=false.",
      "- Use suggestedCategory=\"not-business\" only when a charge looks clearly personal or non-deductible.",
      "- A merchant name does not establish business purpose or tax deductibility.",
      "- Keep reasons short and concrete.",
      "- Only return an empty suggestions array if the document is not actually a bank/card statement or no readable charge/category totals exist.",
    ].join("\n"),
    fileName,
    compactedText,
    executor,
  );

  const normalized = normalizeBankStatementAnalysis(payload, fileName);

  if (normalized?.suggestions.length) {
    return requireBusinessPurposeReview(normalized);
  }

  return requireBusinessPurposeReview(buildFallbackBankStatementAnalysis(fileName, compactedText) ?? normalized);
}

export async function analyzeSelfEmploymentIncomeDocumentWithGemini(
  fileName: string,
  redactedText: string,
  _env: NodeJS.ProcessEnv = process.env,
  executor: DocumentAiExecutor = productionExecutor,
): Promise<SelfEmploymentIncomeDocumentAnalysis | null> {
  const compactedText = compactRedactedAiDocumentText(redactedText, {
    includeAmountsOnly: false,
    maxLines: 240,
    maxChars: 22000,
  });
  const payload = await callDocumentTask(
    "income-extraction",
    [
      "Extract actual source facts from this income document. Suggest Schedule C receipts only when the source explicitly identifies self-employment receipts.",
      "Use the supplied versioned schema, including explicit disposition, citations and unknown source facts.",
      "Rules:",
      "- Only include amounts that likely represent self-employment income earned by the taxpayer.",
      "- For invoices, prefer the invoice total or services subtotal when that is clearly the amount earned.",
      "- Employee paystubs are wage source facts, never Schedule C receipt suggestions. Do not infer worker classification.",
      "- Preserve a visible net payment as a source fact; do not substitute it for unknown gross receipts.",
      "- Never guess or add fallback amounts when the document is ambiguous.",
      "- If the document is too ambiguous to support a suggested amount, return an empty suggestions array and say that in summary.",
      "- Keep reasons short and factual.",
    ].join("\n"),
    fileName,
    compactedText,
    executor,
  );

  return normalizeSelfEmploymentIncomeDocumentAnalysis(payload, fileName);
}

export async function summarizeGuidedReviewIssuesWithGemini(
  issues: GuidedReviewIssue[],
  _env: NodeJS.ProcessEnv = process.env,
  executor: DocumentAiExecutor = productionExecutor,
): Promise<string | null> {
  if (issues.length === 0) {
    return null;
  }

  const payload = await callDocumentTask(
    "interview-wording",
    [
      "Summarize what a tax filer still needs to review in their guided interview.",
      "Use the supplied versioned schema, including explicit disposition, citations and unknown source facts.",
      "Rules:",
      "- Write 1 to 3 short sentences in plain English.",
      "- Mention the exact section labels that need attention.",
      "- Explain what the filer should do next in those sections.",
      "- Do not invent new issues beyond the provided list.",
    ].join("\n"),
    "guided-review-summary",
    JSON.stringify(issues),
    executor,
  );

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const summary = typeof (payload as { summary?: unknown }).summary === "string"
    ? (payload as { summary: string }).summary.trim()
    : "";

  return summary || null;
}

export async function summarizeProviderWorkspaceWithGemini(
  request: ProviderWorkspaceRequest,
  _env: NodeJS.ProcessEnv = process.env,
  executor: DocumentAiExecutor = productionExecutor,
): Promise<string | null> {
  const payload = await callDocumentTask(
    "workspace-summary",
    [
      "Summarize the current tax-return workspace for the filer.",
      "Use the supplied versioned schema, including explicit disposition, citations and unknown source facts.",
      "Rules:",
      "- Write 2 to 4 short sentences in plain English.",
      "- Mention the readiness state of the return, any remaining blockers, and the clearest next action.",
      "- Never infer any direct identifier from redaction tokens.",
      "- Keep the summary concise and practical.",
    ].join("\n"),
    "provider-workspace-summary",
    JSON.stringify({
      requestId: request.requestId,
      unsupportedRoutes: request.unsupportedRoutes,
      workspace: request.workspace,
    }),
    executor,
  );

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const summary = typeof (payload as { summary?: unknown }).summary === "string"
    ? (payload as { summary: string }).summary.trim()
    : "";

  return summary || null;
}
