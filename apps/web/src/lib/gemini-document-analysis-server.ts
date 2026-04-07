import "server-only";

import type { ParsedUploadedDocument } from "@/lib/uploaded-document-detection";
import { containsUnsafeDirectIdentifier } from "@/lib/provider-request-privacy";
import {
  buildFallbackBankStatementAnalysis,
  buildTransactionLevelBankStatementAnalysis,
  compactRedactedAiDocumentText,
  normalizeBankStatementAnalysis,
  normalizeSelfEmploymentIncomeDocumentAnalysis,
  normalizeUnsupportedDocumentAiInsight,
  parseJsonFromModelText,
} from "@/lib/business-expense-analysis";
import type {
  GuidedReviewIssue,
  ScheduleCBankStatementAnalysis,
  ScheduleCBankStatementSuggestion,
  SelfEmploymentIncomeDocumentAnalysis,
} from "@/lib/guided-interview-flow";
import type { ProviderWorkspaceRequest } from "@/lib/provider-workspace-request";

const geminiApiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
const defaultGeminiModel = "gemini-3-flash-preview";

function getGeminiApiKey(env: NodeJS.ProcessEnv = process.env) {
  return env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim() || "";
}

function getGeminiModel(env: NodeJS.ProcessEnv = process.env) {
  return env.GEMINI_MODEL?.trim() || defaultGeminiModel;
}

export function resolveGeminiAnalysisModelId(env: NodeJS.ProcessEnv = process.env) {
  return getGeminiModel(env);
}

function getCandidateText(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return "";
  }

  const candidates = (payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  }).candidates;

  return candidates?.[0]?.content?.parts
    ?.map((part) => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim() || "";
}

const maxAiExpenseClassifications = 150;
const aiExpenseClassificationBatchSize = 50;

async function callGeminiForJson(
  prompt: string,
  fileName: string,
  redactedText: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const apiKey = getGeminiApiKey(env);

  if (!apiKey) {
    throw new Error("Set GEMINI_API_KEY or GOOGLE_API_KEY to enable AI document analysis.");
  }

  if (!redactedText.trim()) {
    throw new Error(`${fileName} did not produce any readable text for AI analysis.`);
  }

  if (containsUnsafeDirectIdentifier(redactedText)) {
    throw new Error(`${fileName} still contains direct identifiers after redaction, so AI analysis was blocked.`);
  }

  const model = getGeminiModel(env);
  const response = await fetch(
    `${geminiApiBaseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: `${prompt}\n\nRedacted extracted document text:\n${redactedText}` },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    },
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage = typeof payload === "object" && payload !== null && "error" in payload
      ? JSON.stringify((payload as { error?: unknown }).error)
      : `Gemini request failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  const modelText = getCandidateText(payload);

  if (!modelText) {
    throw new Error("Gemini returned no analysis text.");
  }

  return parseJsonFromModelText(modelText);
}

async function classifyExpenseSuggestionsWithGemini(
  fileName: string,
  suggestions: ScheduleCBankStatementSuggestion[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const apiKey = getGeminiApiKey(env);
  if (!apiKey || suggestions.length === 0) {
    return suggestions;
  }

  const model = getGeminiModel(env);
  const sorted = [...suggestions]
    .sort((left, right) => Number(right.amount) - Number(left.amount))
    .slice(0, maxAiExpenseClassifications);
  const byId = new Map<string, ScheduleCBankStatementSuggestion>();

  for (const suggestion of sorted) {
    byId.set(suggestion.id, suggestion);
  }

  for (let start = 0; start < sorted.length; start += aiExpenseClassificationBatchSize) {
    const batch = sorted.slice(start, start + aiExpenseClassificationBatchSize);
    const response = await fetch(
      `${geminiApiBaseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: [
                "Classify each bank/card transaction into the best Schedule C expense bucket.",
                "Return strict JSON:",
                "{",
                '  "classifications": [',
                "    {",
                '      "id": string,',
                '      "suggestedCategory": "advertising" | "carAndTruck" | "insurance" | "officeExpense" | "supplies" | "travel" | "meals" | "utilities" | "otherExpenses" | "not-business" | "needs-review",',
                '      "suggestedBusinessUse": boolean,',
                '      "confidence": "high" | "low",',
                '      "reason": string',
                "    }",
                "  ]",
                "}",
                "Rules:",
                "- Choose the most specific deductible category instead of defaulting to otherExpenses when a more specific bucket fits.",
                "- officeExpense is appropriate for electronics, software, postage, office services, and computer equipment used in the business.",
                "- supplies is appropriate for physical business supplies and merchandise consumed or resold in the business.",
                "- meals is for restaurants, cafes, and business meals.",
                "- travel is for airfare, hotels, rideshare, taxis, transit, and other travel costs.",
                "- carAndTruck is only for vehicle operating costs like gas, parking, tolls, repairs, or local auto use.",
                "- not-business is for clearly personal purchases like clothing, fitness, entertainment, or personal shopping.",
                "- needs-review is only when the transaction is too ambiguous to place confidently.",
                "- Keep reasons short and concrete.",
                "",
                "Transactions:",
                JSON.stringify(batch.map((suggestion) => ({
                  id: suggestion.id,
                  date: suggestion.date,
                  amount: suggestion.amount,
                  description: suggestion.description,
                  sourceSection: suggestion.sourceSection ?? "",
                }))),
              ].join("\n"),
            }],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      },
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      continue;
    }

    const modelText = getCandidateText(payload);
    if (!modelText) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseJsonFromModelText(modelText);
    } catch {
      continue;
    }

    const classifications = typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { classifications?: unknown[] }).classifications)
      ? (parsed as { classifications: unknown[] }).classifications
      : [];

    for (const item of classifications) {
      if (typeof item !== "object" || item === null) {
        continue;
      }

      const classification = item as Record<string, unknown>;
      const id = typeof classification.id === "string" ? classification.id : "";
      if (!id || !byId.has(id)) {
        continue;
      }

      const current = byId.get(id);

      if (!current) {
        continue;
      }

      byId.set(id, {
        ...current,
        suggestedCategory: typeof classification.suggestedCategory === "string" ? classification.suggestedCategory as ScheduleCBankStatementSuggestion["suggestedCategory"] : current.suggestedCategory,
        suggestedBusinessUse: typeof classification.suggestedBusinessUse === "boolean"
          ? classification.suggestedBusinessUse
          : current.suggestedBusinessUse,
        confidence: classification.confidence === "high" ? "high" : "low",
        reason: typeof classification.reason === "string" && classification.reason.trim()
          ? classification.reason.trim()
          : current.reason,
      });
    }
  }

  return suggestions.map((suggestion) => byId.get(suggestion.id) ?? suggestion);
}

export async function analyzeUnsupportedDocumentWithGemini(
  fileName: string,
  redactedText: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ParsedUploadedDocument | null> {
  const payload = await callGeminiForJson(
    [
      "Review this uploaded tax-adjacent document.",
      "Return strict JSON with keys:",
      "{",
      '  "title": string,',
      '  "documentType": string,',
      '  "summary": string,',
      '  "suggestedNextStep": string,',
      '  "relevantTaxTopics": string[],',
      '  "bankStatementLike": boolean',
      "}",
      "Rules:",
      "- Never invent fields that are not visible in the document.",
      "- Keep the summary concise and factual.",
      "- bankStatementLike should be true only for bank or card statements that could help categorize business expenses.",
      "- If the document is a brokerage packet, 1095-C, paystub, or other unsupported tax document, explain that plainly.",
    ].join("\n"),
    fileName,
    redactedText,
    env,
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
  env: NodeJS.ProcessEnv = process.env,
): Promise<ScheduleCBankStatementAnalysis | null> {
  const parsedTransactions = buildTransactionLevelBankStatementAnalysis(fileName, redactedText);

  if (parsedTransactions?.suggestions.length) {
    try {
      return {
        ...parsedTransactions,
        suggestions: await classifyExpenseSuggestionsWithGemini(
          fileName,
          parsedTransactions.suggestions,
          env,
        ),
      };
    } catch {
      return parsedTransactions;
    }
  }

  const compactedText = compactRedactedAiDocumentText(redactedText, {
    includeAmountsOnly: false,
    maxLines: 260,
    maxChars: 26000,
  });
  const payload = await callGeminiForJson(
    [
      "Analyze this bank or card statement for possible Schedule C business expenses.",
      "Return strict JSON with keys:",
      "{",
      '  "label": string,',
      '  "institution": string,',
      '  "statementPeriod": string,',
      '  "summary": string,',
      '  "suggestions": [',
      "    {",
      '      "date": string,',
      '      "description": string,',
      '      "amount": string,',
      '      "suggestedCategory": "advertising" | "carAndTruck" | "insurance" | "officeExpense" | "supplies" | "travel" | "meals" | "utilities" | "otherExpenses" | "not-business" | "needs-review",',
      '      "suggestedBusinessUse": boolean,',
      '      "confidence": "high" | "low",',
      '      "reason": string',
      "    }",
      "  ]",
      "}",
      "Rules:",
      "- Only include outgoing charges or debits, not deposits, payments received, or obvious transfers.",
      "- Never guess an amount or merchant if it is not readable.",
      "- If the document is a year-end summary or category summary instead of a transaction ledger, still return candidate expense suggestions from the readable category totals or month totals.",
      "- When a charge or summary line could plausibly be business-related but you are not sure, return your best expense category with confidence=\"low\" instead of dropping it.",
      "- Use suggestedCategory=\"not-business\" only when a charge looks clearly personal or non-deductible.",
      "- Use suggestedCategory=\"needs-review\" only when the line is too unreadable to classify, not merely because confidence is low.",
      "- Keep reasons short and concrete.",
      "- Only return an empty suggestions array if the document is not actually a bank/card statement or no readable charge/category totals exist.",
    ].join("\n"),
    fileName,
    compactedText,
    env,
  );

  const normalized = normalizeBankStatementAnalysis(payload, fileName);

  if (normalized?.suggestions.length) {
    return normalized;
  }

  return buildFallbackBankStatementAnalysis(fileName, compactedText) ?? normalized;
}

export async function analyzeSelfEmploymentIncomeDocumentWithGemini(
  fileName: string,
  redactedText: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SelfEmploymentIncomeDocumentAnalysis | null> {
  const compactedText = compactRedactedAiDocumentText(redactedText, {
    includeAmountsOnly: false,
    maxLines: 240,
    maxChars: 22000,
  });
  const payload = await callGeminiForJson(
    [
      "Analyze this uploaded paystub, invoice, earnings statement, or other self-employment income document for Schedule C gross receipts.",
      "Return strict JSON with keys:",
      "{",
      '  "label": string,',
      '  "payer": string,',
      '  "documentPeriod": string,',
      '  "summary": string,',
      '  "suggestions": [',
      "    {",
      '      "date": string,',
      '      "description": string,',
      '      "amount": string,',
      '      "confidence": "high" | "low",',
      '      "reason": string',
      "    }",
      "  ]",
      "}",
      "Rules:",
      "- Only include amounts that likely represent self-employment income earned by the taxpayer.",
      "- For invoices, prefer the invoice total or services subtotal when that is clearly the amount earned.",
      "- For paystubs or earnings statements, prefer gross pay or gross earnings when clearly labeled.",
      "- If only a net payment amount is visible and gross earnings are not, you may include the net amount only when that is clearly the payment amount and explain that in the reason with low confidence.",
      "- Never guess or add fallback amounts when the document is ambiguous.",
      "- If the document is too ambiguous to support a suggested amount, return an empty suggestions array and say that in summary.",
      "- Keep reasons short and factual.",
    ].join("\n"),
    fileName,
    compactedText,
    env,
  );

  return normalizeSelfEmploymentIncomeDocumentAnalysis(payload, fileName);
}

export async function summarizeGuidedReviewIssuesWithGemini(
  issues: GuidedReviewIssue[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  if (issues.length === 0) {
    return null;
  }

  const payload = await callGeminiForJson(
    [
      "Summarize what a tax filer still needs to review in their guided interview.",
      "Return strict JSON with keys:",
      "{",
      '  "summary": string',
      "}",
      "Rules:",
      "- Write 1 to 3 short sentences in plain English.",
      "- Mention the exact section labels that need attention.",
      "- Explain what the filer should do next in those sections.",
      "- Do not invent new issues beyond the provided list.",
    ].join("\n"),
    "guided-review-summary",
    JSON.stringify(issues),
    env,
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
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const payload = await callGeminiForJson(
    [
      "Summarize the current tax-return workspace for the filer.",
      "Return strict JSON with keys:",
      "{",
      '  "summary": string',
      "}",
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
    env,
  );

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const summary = typeof (payload as { summary?: unknown }).summary === "string"
    ? (payload as { summary: string }).summary.trim()
    : "";

  return summary || null;
}
