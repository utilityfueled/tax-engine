import { NextResponse } from "next/server";
import { analyzeBusinessExpenseStatementWithGemini } from "@/lib/gemini-document-analysis-server";
import { reserveHostedAiBudget } from "@/lib/hosted-ai-route";
import { containsUnsafeDirectIdentifier } from "@/lib/provider-request-privacy";
import { safeParseJsonBody } from "@/lib/safe-body-parser";

export const runtime = "nodejs";

interface RedactedAiDocumentInput {
  fileName: string;
  redactedText: string;
}

function isRedactedAiDocumentInput(value: unknown): value is RedactedAiDocumentInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RedactedAiDocumentInput>;
  return typeof candidate.fileName === "string"
    && candidate.fileName.trim().length > 0
    && typeof candidate.redactedText === "string"
    && candidate.redactedText.trim().length > 0;
}

export async function POST(request: Request) {
  const parsed = await safeParseJsonBody(request, 2 * 1024 * 1024);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const documents = Array.isArray((parsed.data as { documents?: unknown[] }).documents)
    ? (parsed.data as { documents: unknown[] }).documents.filter(isRedactedAiDocumentInput)
    : [];

  if (documents.length === 0) {
    return NextResponse.json({ error: "Select at least one bank statement to analyze." }, { status: 400 });
  }

  if (documents.some((document) => containsUnsafeDirectIdentifier(document.redactedText))) {
    return NextResponse.json({
      error: "Document analysis was blocked because redaction left direct identifiers in the request.",
    }, { status: 400 });
  }

  // Candidate profiles are evaluation-only; production uses deterministic analysis.
  const modelId = null;
  const budgetGuard = await reserveHostedAiBudget(request, { task: "business-expense-analysis", documents }, modelId);

  if (budgetGuard.response) {
    return budgetGuard.response;
  }

  try {
    const analyses = await Promise.all(
      documents.map((document) => analyzeBusinessExpenseStatementWithGemini(
        document.fileName,
        document.redactedText,
      )),
    );
    const responsePayload = {
      analyses: analyses.filter((analysis): analysis is NonNullable<typeof analysis> => analysis !== null),
    };
    return NextResponse.json({ ...responsePayload, mode: "deterministic", aiStatus: "qualification-pending" });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error
        ? error.message
        : "Could not analyze the uploaded statement with AI.",
    }, { status: 500 });
  }
}
