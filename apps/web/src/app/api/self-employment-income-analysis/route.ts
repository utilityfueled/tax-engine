import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { analyzeSelfEmploymentIncomeDocumentWithGemini, resolveGeminiAnalysisModelId } from "@/lib/gemini-document-analysis-server";
import { reserveHostedAiBudget, recordHostedAiRouteUsage } from "@/lib/hosted-ai-route";
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
    return NextResponse.json({ error: "Select at least one paystub or invoice to analyze." }, { status: 400 });
  }

  if (documents.some((document) => containsUnsafeDirectIdentifier(document.redactedText))) {
    return NextResponse.json({
      error: "Document analysis was blocked because redaction left direct identifiers in the request.",
    }, { status: 400 });
  }

  const modelId = resolveGeminiAnalysisModelId(process.env);
  const budgetGuard = await reserveHostedAiBudget(request, { task: "self-employment-income-analysis", documents }, modelId);

  if (budgetGuard.response) {
    return budgetGuard.response;
  }

  try {
    const analyses = await Promise.all(
      documents.map((document) => analyzeSelfEmploymentIncomeDocumentWithGemini(
        document.fileName,
        document.redactedText,
      )),
    );
    const responsePayload = {
      analyses: analyses.filter((analysis): analysis is NonNullable<typeof analysis> => analysis !== null),
    };
    const budget = await recordHostedAiRouteUsage(
      budgetGuard.reservation,
      {
        requestId: randomUUID(),
        task: "self-employment-income-analysis",
        provider: "google-gemini",
        modelId,
        requestPayload: documents,
        responsePayload,
      },
    );

    return NextResponse.json(budget ? { ...responsePayload, budget } : responsePayload);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error
        ? error.message
        : "Could not analyze the uploaded income documents with AI.",
    }, { status: 500 });
  }
}
