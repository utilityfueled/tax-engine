import { reserveHostedAiBudget } from "./hosted-ai-route";
import { containsUnsafeDirectIdentifier } from "./provider-request-privacy";
import {
  cancelledDocumentRequest, createDocumentRequestProtection, privateJson, privateResponse,
} from "./protected-document-request";
import { safeParseJsonBody } from "./safe-body-parser";

interface RedactedDocument { fileName: string; redactedText: string }
const OPAQUE_DOCUMENT_NAME = /^upload-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.pdf$/i;

function isRedactedDocument(value: unknown): value is RedactedDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<RedactedDocument>;
  return Object.keys(candidate).every(key => key === "fileName" || key === "redactedText")
    && typeof candidate.fileName === "string" && OPAQUE_DOCUMENT_NAME.test(candidate.fileName)
    && typeof candidate.redactedText === "string" && candidate.redactedText.trim().length > 0;
}

export function createDocumentAnalysisRoute<T>(
  task: "business-expense-analysis" | "self-employment-income-analysis",
  analyze: (fileName: string, redactedText: string) => Promise<T | null>,
) {
  const protect = createDocumentRequestProtection(task);
  return async (request: Request): Promise<Response> => {
    const protectedResponse = await protect(request);
    if (protectedResponse) return protectedResponse;
    try {
      const parsed = await safeParseJsonBody(request, 2 * 1024 * 1024);
      if (request.signal.aborted) return cancelledDocumentRequest();
      if (!parsed.ok) return privateJson({ error: parsed.error }, parsed.status);
      const documents: unknown = parsed.data && typeof parsed.data === "object"
        ? (parsed.data as { documents?: unknown }).documents : undefined;
      if (!Array.isArray(documents) || documents.length === 0) {
        return privateJson({ error: "Select at least one document to analyze." }, 400);
      }
      if (documents.length > 10) return privateJson({ error: "Analyze at most 10 documents per request." }, 413);
      // Reject the whole batch. Filtering malformed entries silently loses source facts.
      if (!documents.every(isRedactedDocument)
        || new Set(documents.map(document => document.fileName)).size !== documents.length) {
        return privateJson({ error: "Invalid document batch. Use redacted text and unique upload identifiers." }, 400);
      }
      if (documents.some(document => document.redactedText.length > 100_000)) {
        return privateJson({ error: "A document exceeds the analysis text limit." }, 413);
      }
      if (documents.some(document => containsUnsafeDirectIdentifier(document.redactedText))) {
        return privateJson({ error: "Document analysis was blocked because redaction left direct identifiers in the request." }, 400);
      }
      // Candidate profiles remain evaluation-only. Deterministic analysis has no model charge.
      const guard = await reserveHostedAiBudget(request, { task, documents }, null);
      if (request.signal.aborted) return cancelledDocumentRequest();
      if (guard.response) return privateResponse(guard.response);
      const analyses: T[] = [];
      // Bound concurrent work and check cancellation before each document and before publishing.
      for (const document of documents) {
        if (request.signal.aborted) return cancelledDocumentRequest();
        const result = await analyze(document.fileName, document.redactedText);
        if (request.signal.aborted) return cancelledDocumentRequest();
        if (result !== null) analyses.push(result);
      }
      return privateJson({ analyses, mode: "deterministic", aiStatus: "qualification-pending" });
    } catch {
      if (request.signal.aborted) return cancelledDocumentRequest();
      return privateJson({ error: "Document analysis is temporarily unavailable. Please try again later." }, 503);
    }
  };
}
