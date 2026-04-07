import { redactTextForAiAnalysis } from "@/lib/ai-document-redaction";
import type {
  ScheduleCBankStatementAnalysis,
  ScheduleCBankStatementSuggestion,
  ScheduleCExpenseData,
  ScheduleCExpenseSuggestionCategory,
  SelfEmploymentIncomeDocumentAnalysis,
  SelfEmploymentIncomeDocumentSuggestion,
} from "@/lib/guided-interview-flow";
import { extractPdfTextFromFile } from "@/lib/uploaded-document-detection";

const expenseSuggestionCategories: ScheduleCExpenseSuggestionCategory[] = [
  "advertising",
  "carAndTruck",
  "insurance",
  "officeExpense",
  "supplies",
  "travel",
  "meals",
  "utilities",
  "otherExpenses",
  "not-business",
  "needs-review",
];

const fallbackExpenseCategoryMatchers: Array<{
  pattern: RegExp;
  category: ScheduleCExpenseSuggestionCategory;
  businessUse: boolean;
}> = [
  { pattern: /\badvertis/i, category: "advertising", businessUse: true },
  { pattern: /\belectronic|computer|laptop|monitor|printer|apple|best buy|k tronix|tech/i, category: "officeExpense", businessUse: true },
  { pattern: /\bcomm(?:unication)?s?\b|internet|phone|wireless|cell/i, category: "utilities", businessUse: true },
  { pattern: /\bmail|shipping|postage|ups|fedex|dhl/i, category: "officeExpense", businessUse: true },
  { pattern: /\bsuppl(?:y|ies)\b|office depot|staples|merchandise/i, category: "supplies", businessUse: true },
  { pattern: /\btravel\b|hotel|airfare|airline|uber|lyft|taxi|parking|toll/i, category: "travel", businessUse: true },
  { pattern: /\brestaurant\b|\bmeals?\b|dining|coffee/i, category: "meals", businessUse: true },
  { pattern: /\binsurance\b/i, category: "insurance", businessUse: true },
  { pattern: /\bcar\b|fuel|gas|repair|maintenance/i, category: "carAndTruck", businessUse: true },
  { pattern: /\boffice\b|software|subscription|saas|professional services/i, category: "officeExpense", businessUse: true },
  { pattern: /\bfees?\b|adjustments?\b|processing fee|membership/i, category: "otherExpenses", businessUse: true },
  { pattern: /\bentertainment\b/i, category: "not-business", businessUse: false },
  { pattern: /\bclothing|apparel|fashion|calvin klein|carhartt/i, category: "not-business", businessUse: false },
  { pattern: /\bfitness|gym|smart fit\b/i, category: "not-business", businessUse: false },
];

export interface UnsupportedDocumentAiInsight {
  title: string;
  documentType: string;
  summary: string;
  suggestedNextStep: string;
  relevantTaxTopics: string[];
  bankStatementLike: boolean;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCurrencyAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[$,\s]/g, "").trim();

  return /^\d+(\.\d{1,2})?$/.test(normalized)
    ? Number(normalized).toFixed(2)
    : null;
}

function normalizeConfidence(value: unknown): ScheduleCBankStatementSuggestion["confidence"] {
  return value === "high" ? "high" : "low";
}

function normalizeCategory(value: unknown): ScheduleCExpenseSuggestionCategory {
  return typeof value === "string" && expenseSuggestionCategories.includes(value as ScheduleCExpenseSuggestionCategory)
    ? value as ScheduleCExpenseSuggestionCategory
    : "needs-review";
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function extractJsonObjectFromText(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const root = trimmed[0];
    const closing = root === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = 0; index < trimmed.length; index += 1) {
      const char = trimmed[index];

      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }

        if (char === "\\") {
          escaping = true;
          continue;
        }

        if (char === "\"") {
          inString = false;
        }

        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === root) {
        depth += 1;
        continue;
      }

      if (char === closing) {
        depth -= 1;

        if (depth === 0) {
          return trimmed.slice(0, index + 1);
        }
      }
    }

    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");

  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }

  return trimmed;
}

export function parseJsonFromModelText(text: string) {
  const candidate = extractJsonObjectFromText(text);
  return JSON.parse(candidate) as unknown;
}

function uniqueNonEmptyLines(text: string) {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();

    if (!line) {
      continue;
    }

    const key = line.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    lines.push(line);
  }

  return lines;
}

function nonEmptyLinesPreserveOrder(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const monthNamePattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)$/i;
const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
const amountLinePattern = /^\$[\d,]+\.\d{2}$/;
const summaryBoundaryPattern = /^(Subtotal\b|Total .* Spending\b|.* Subtotal\b|Credits\b|Charges\b|Account Number\b|Date\b|Month Billed\b|Transaction\b|Page \d+\b|Includes charges from\b|Prepared for\b|\d{4} Year-End Summary\b)/i;

function isLikelyHeading(line: string) {
  return /^[A-Za-z][A-Za-z&/,\- ]{2,80}$/.test(line)
    && !monthNamePattern.test(line)
    && !summaryBoundaryPattern.test(line)
    && !/\b(?:Card Member|ATLANTA|AUSTIN|CHICAGO|DALLAS|DENVER|CA|CT|IL|OH|NY)\b/i.test(line);
}

function normalizeTransactionDescription(lines: string[]) {
  const filtered = lines
    .filter((line) => !monthNamePattern.test(line))
    .filter((line) => !summaryBoundaryPattern.test(line))
    .filter((line) => !/^XXXX-/.test(line))
    .filter((line) => !/^[A-Z]{2}$/.test(line))
    .filter((line) => !/^[A-Z][a-z]+(?: [A-Z][a-z]+){0,2}$/.test(line));

  return filtered
    .filter((line, index) => filtered.indexOf(line) === index)
    .slice(0, 3)
    .join(" ")
    .trim();
}

export function compactRedactedAiDocumentText(text: string, options?: {
  includeAmountsOnly?: boolean;
  maxLines?: number;
  maxChars?: number;
}) {
  const includeAmountsOnly = options?.includeAmountsOnly ?? false;
  const maxLines = options?.maxLines ?? 220;
  const maxChars = options?.maxChars ?? 22000;
  const lines = uniqueNonEmptyLines(text);
  const kept: string[] = [];
  let totalChars = 0;

  const shouldKeepLine = (line: string, index: number) => {
    if (index < 40) {
      return true;
    }

    if (/\$[\d,]+\.\d{2}|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/.test(line)) {
      return true;
    }

    if (/\b(summary|statement|account|invoice|charges|gross|earnings|business|restaurant|travel|communications|supplies|fees|total|subtotal|period|prepared for)\b/i.test(line)) {
      return true;
    }

    return !includeAmountsOnly && /^[A-Za-z][A-Za-z&/,\- ]{2,80}$/.test(line);
  };

  for (const [index, line] of lines.entries()) {
    if (!shouldKeepLine(line, index)) {
      continue;
    }

    const nextChars = totalChars + line.length + 1;
    if (kept.length >= maxLines || nextChars > maxChars) {
      break;
    }

    kept.push(line);
    totalChars = nextChars;
  }

  return kept.join("\n");
}

function mapFallbackExpenseCategory(label: string) {
  const normalized = label.trim();

  for (const matcher of fallbackExpenseCategoryMatchers) {
    if (matcher.pattern.test(normalized)) {
      return matcher;
    }
  }

  return {
    category: "otherExpenses" as const,
    businessUse: true,
  };
}

function mapTransactionSectionToCategory(sectionLabel: string, description: string) {
  const source = `${sectionLabel} ${description}`.trim();
  return mapFallbackExpenseCategory(source);
}

export function buildTransactionLevelBankStatementAnalysis(
  fileName: string,
  redactedText: string,
): ScheduleCBankStatementAnalysis | null {
  const lines = nonEmptyLinesPreserveOrder(redactedText);
  const suggestions: ScheduleCBankStatementSuggestion[] = [];
  let activeSection: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (/^Card Member\b/i.test(line)) {
      for (let lookback = index - 1; lookback >= Math.max(0, index - 6); lookback -= 1) {
        const candidate = lines[lookback] ?? "";
        if (isLikelyHeading(candidate)) {
          activeSection = candidate;
          break;
        }
      }
      continue;
    }

    if (!datePattern.test(line) || !activeSection) {
      continue;
    }

    const date = line;
    const detailLines: string[] = [];
    let amount: string | null = null;
    let cursor = index + 1;

    while (cursor < lines.length) {
      const candidate = lines[cursor] ?? "";

      if (datePattern.test(candidate) || /^Card Member\b/i.test(candidate)) {
        break;
      }

      if (summaryBoundaryPattern.test(candidate)) {
        cursor += 1;
        continue;
      }

      if (amountLinePattern.test(candidate)) {
        if (!amount) {
          amount = candidate;
        }
        cursor += 1;
        continue;
      }

      if (/^\f?\d{4} Year-End Summary$/i.test(candidate)) {
        break;
      }

      detailLines.push(candidate);
      cursor += 1;
    }

    const description = normalizeTransactionDescription(detailLines);

    if (!amount || !description) {
      continue;
    }

    const normalizedAmount = normalizeCurrencyAmount(amount);
    if (!normalizedAmount || Number(normalizedAmount) <= 0) {
      continue;
    }

    const mapped = mapTransactionSectionToCategory(activeSection, description);
    suggestions.push({
      id: `${slugify(fileName) || "statement"}-tx-${suggestions.length + 1}`,
      date,
      description,
      amount: normalizedAmount,
      sourceSection: activeSection,
      suggestedCategory: mapped.category,
      suggestedBusinessUse: mapped.businessUse,
      confidence: mapped.businessUse ? "low" : "high",
      reason: `Detected as a specific purchase from the ${activeSection} section of the statement.`,
      appliedCategory: null,
    });

    index = Math.max(index, cursor - 1);
  }

  if (suggestions.length === 0) {
    return null;
  }

  return {
    id: `statement-${slugify(fileName) || "upload"}-transactions`,
    fileName,
    label: fileName,
    uploadedAt: new Date().toISOString(),
    summary: `Parsed ${suggestions.length} transaction-level purchases from the statement. Review each suggested expense before accepting.`,
    suggestions,
  };
}

export function buildFallbackBankStatementAnalysis(
  fileName: string,
  redactedText: string,
): ScheduleCBankStatementAnalysis | null {
  const lines = uniqueNonEmptyLines(redactedText);
  const suggestions: ScheduleCBankStatementSuggestion[] = [];
  const amountPattern = /^\$?([\d,]+\.\d{2})$/;

  for (let index = 0; index < lines.length; index += 1) {
    const label = lines[index] ?? "";

    if (!/^[A-Za-z][A-Za-z&/,\- ]{2,80}$/.test(label) || /\b(january|february|march|april|may|june|july|august|september|october|november|december|page|total|account summary)\b/i.test(label)) {
      continue;
    }

    const amounts: string[] = [];
    let lookahead = index + 1;

    while (lookahead < lines.length && lookahead < index + 18) {
      const candidate = lines[lookahead] ?? "";
      const amountMatch = candidate.match(amountPattern);

      if (amountMatch) {
        amounts.push(amountMatch[1].replace(/,/g, ""));
        lookahead += 1;
        continue;
      }

      if (/^[A-Za-z][A-Za-z&/,\- ]{2,80}$/.test(candidate)) {
        break;
      }

      lookahead += 1;
    }

    if (amounts.length < 2) {
      continue;
    }

    const totalAmount = [...amounts].reverse().find((value) => Number(value) > 0);
    if (!totalAmount) {
      continue;
    }

    const mapped = mapFallbackExpenseCategory(label);
    suggestions.push({
      id: `${slugify(fileName) || "statement"}-fallback-${suggestions.length + 1}`,
      date: "",
      description: `${label} annual summary total`,
      amount: Number(totalAmount).toFixed(2),
      sourceSection: label,
      suggestedCategory: mapped.category,
      suggestedBusinessUse: mapped.businessUse,
      confidence: "low",
      reason: "Derived from a readable category-summary total when transaction-level OCR review was inconclusive.",
      appliedCategory: null,
    });
  }

  if (suggestions.length === 0) {
    return null;
  }

  return {
    id: `statement-${slugify(fileName) || "upload"}-fallback`,
    fileName,
    label: fileName,
    uploadedAt: new Date().toISOString(),
    summary: "Read from statement summary totals because transaction-level AI review did not yield line items. Review each suggestion before accepting.",
    suggestions,
  };
}

export function normalizeUnsupportedDocumentAiInsight(payload: unknown, fileName: string): UnsupportedDocumentAiInsight | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const summary = normalizeText(candidate.summary);

  if (!summary) {
    return null;
  }

  const title = normalizeText(candidate.title) || fileName;
  const documentType = normalizeText(candidate.documentType) || "Unsupported upload";
  const suggestedNextStep = normalizeText(candidate.suggestedNextStep) || "Review this document manually before relying on it.";
  const relevantTaxTopics = Array.isArray(candidate.relevantTaxTopics)
    ? candidate.relevantTaxTopics.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
    : [];

  return {
    title,
    documentType,
    summary,
    suggestedNextStep,
    relevantTaxTopics,
    bankStatementLike: candidate.bankStatementLike === true,
  };
}

export function normalizeBankStatementAnalysis(payload: unknown, fileName: string): ScheduleCBankStatementAnalysis | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const suggestions = Array.isArray(candidate.suggestions) ? candidate.suggestions : [];
  const normalizedSuggestions: ScheduleCBankStatementSuggestion[] = suggestions.flatMap((item, index) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const suggestion = item as Record<string, unknown>;
    const description = normalizeText(suggestion.description);
    const amount = normalizeCurrencyAmount(suggestion.amount);

    if (!description || !amount) {
      return [];
    }

    const date = normalizeText(suggestion.date);
    const suggestedCategory = normalizeCategory(suggestion.suggestedCategory);
    const suggestedBusinessUse = suggestion.suggestedBusinessUse === true;
    const reason = normalizeText(suggestion.reason) || "AI OCR flagged this line for review.";

    return [{
      id: `${slugify(fileName) || "statement"}-${index + 1}`,
      date,
      description,
      amount,
      suggestedCategory,
      suggestedBusinessUse,
      confidence: normalizeConfidence(suggestion.confidence),
      reason,
      appliedCategory: null,
    }];
  });

  const summary = normalizeText(candidate.summary) || `AI reviewed ${fileName} for potential Schedule C expenses.`;

  return {
    id: `statement-${slugify(fileName) || "upload"}`,
    fileName,
    label: normalizeText(candidate.label) || fileName,
    uploadedAt: new Date().toISOString(),
    summary,
    institution: normalizeText(candidate.institution) || undefined,
    statementPeriod: normalizeText(candidate.statementPeriod) || undefined,
    suggestions: normalizedSuggestions,
  };
}

export function normalizeSelfEmploymentIncomeDocumentAnalysis(
  payload: unknown,
  fileName: string,
): SelfEmploymentIncomeDocumentAnalysis | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const suggestions = Array.isArray(candidate.suggestions) ? candidate.suggestions : [];
  const normalizedSuggestions: SelfEmploymentIncomeDocumentSuggestion[] = suggestions.flatMap((item, index) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const suggestion = item as Record<string, unknown>;
    const description = normalizeText(suggestion.description);
    const amount = normalizeCurrencyAmount(suggestion.amount);

    if (!description || !amount) {
      return [];
    }

    return [{
      id: `${slugify(fileName) || "income-doc"}-${index + 1}`,
      date: normalizeText(suggestion.date),
      description,
      amount,
      confidence: normalizeConfidence(suggestion.confidence),
      reason: normalizeText(suggestion.reason) || "AI review found a likely income amount.",
      applied: false,
    }];
  });

  const summary = normalizeText(candidate.summary) || `AI reviewed ${fileName} for self-employment income.`;

  return {
    id: `income-doc-${slugify(fileName) || "upload"}`,
    fileName,
    label: normalizeText(candidate.label) || fileName,
    uploadedAt: new Date().toISOString(),
    summary,
    payer: normalizeText(candidate.payer) || undefined,
    documentPeriod: normalizeText(candidate.documentPeriod) || undefined,
    suggestions: normalizedSuggestions,
  };
}

export function addAmountToCurrencyValue(currentValue: string, amount: string) {
  const current = Number(currentValue || "0");
  const next = current + Number(amount || "0");

  return next > 0 ? next.toFixed(2) : "";
}

export function addAmountToExpenseValue(currentValue: string, amount: string) {
  return addAmountToCurrencyValue(currentValue, amount);
}

export function summarizeBankStatementSuggestionsByCategory(
  analyses: ScheduleCBankStatementAnalysis[],
) {
  const totals = new Map<keyof ScheduleCExpenseData, number>();

  for (const analysis of analyses) {
    for (const suggestion of analysis.suggestions) {
      if (
        suggestion.dismissed
        || suggestion.appliedCategory
        || !suggestion.suggestedBusinessUse
        || suggestion.suggestedCategory === "not-business"
        || suggestion.suggestedCategory === "needs-review"
      ) {
        continue;
      }

      const category = suggestion.suggestedCategory;
      totals.set(category, (totals.get(category) ?? 0) + Number(suggestion.amount));
    }
  }

  return Array.from(totals.entries()).map(([category, total]) => ({
    category,
    total: total.toFixed(2),
  }));
}

export async function analyzeBusinessExpenseStatements(files: File[]) {
  if (files.length === 0) {
    return [];
  }

  const documents = await Promise.all(files.map(async (file) => {
    const looksLikePdf = /\.pdf$/i.test(file.name) || /pdf/i.test(file.type || "");

    if (!looksLikePdf) {
      throw new Error(`${file.name} must be a PDF so we can redact sensitive text locally before AI analysis.`);
    }

    const extractedText = await extractPdfTextFromFile(file);
    const { redactedText } = redactTextForAiAnalysis(extractedText);

    return {
      fileName: file.name,
      redactedText,
    };
  }));

  const response = await fetch("/api/business-expense-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ documents }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `Business expense analysis failed with status ${response.status}.`);
  }

  const payload = await response.json() as { analyses?: ScheduleCBankStatementAnalysis[] };
  return Array.isArray(payload.analyses) ? payload.analyses : [];
}

export function summarizeSelfEmploymentIncomeSuggestions(
  analyses: SelfEmploymentIncomeDocumentAnalysis[],
) {
  let total = 0;

  for (const analysis of analyses) {
    for (const suggestion of analysis.suggestions) {
      if (suggestion.applied || suggestion.dismissed) {
        continue;
      }

      total += Number(suggestion.amount || "0");
    }
  }

  return total.toFixed(2);
}

export async function analyzeSelfEmploymentIncomeDocuments(files: File[]) {
  if (files.length === 0) {
    return [];
  }

  const documents = await Promise.all(files.map(async (file) => {
    const looksLikePdf = /\.pdf$/i.test(file.name) || /pdf/i.test(file.type || "");

    if (!looksLikePdf) {
      throw new Error(`${file.name} must be a PDF so we can redact sensitive text locally before AI analysis.`);
    }

    const extractedText = await extractPdfTextFromFile(file);
    const { redactedText } = redactTextForAiAnalysis(extractedText);

    return {
      fileName: file.name,
      redactedText,
    };
  }));

  const response = await fetch("/api/self-employment-income-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ documents }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `Income document analysis failed with status ${response.status}.`);
  }

  const payload = await response.json() as { analyses?: SelfEmploymentIncomeDocumentAnalysis[] };
  return Array.isArray(payload.analyses) ? payload.analyses : [];
}
