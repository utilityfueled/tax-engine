import type { ProviderWorkspaceRequest, ProviderWorkspaceResponse } from "./provider-workspace-request";
import {
  estimateHostedAiUsageCost,
  resolveHostedAiHelperModelId,
  resolveHostedAiMaxOutputTokens
} from "./hosted-ai-helper-billing";
import { parseJsonFromModelText } from "./business-expense-analysis";

/** Maximum time to wait for an external model provider response before aborting. */
const PROVIDER_REQUEST_TIMEOUT_MS = 30_000;

/** Maximum response body size from the model provider (1 MB). */
const PROVIDER_RESPONSE_MAX_SIZE = 1024 * 1024;

/** Maximum character length for provider-generated summary text. */
const PROVIDER_SUMMARY_MAX_LENGTH = 2_000;
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

interface ProviderWorkspaceResponderDependencies {
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
  /** Skip URL safety checks (for testing only). */
  skipUrlValidation?: boolean;
}

export function hasConfiguredWorkspaceHelpProvider(
  env: Record<string, string | undefined> = process.env
) {
  return Boolean(getOpenAIApiKey(env) || getGeminiApiKey(env));
}

/**
 * Returns true if the IPv4 address (in standard dotted notation) is a blocked address.
 */
function isBlockedIPv4(ipv4: string): boolean {
  if (ipv4 === "0.0.0.0") return true;
  if (/^127\./.test(ipv4)) return true; // entire 127.0.0.0/8 is loopback
  if (/^10\./.test(ipv4)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ipv4)) return true;
  if (/^192\.168\./.test(ipv4)) return true;
  if (/^169\.254\./.test(ipv4)) return true;
  // CGNAT / shared address space (RFC 6598) — used by cloud providers for internal services
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ipv4)) return true;
  // Benchmark testing (RFC 2544) — sometimes used for internal infrastructure
  if (/^198\.1[89]\./.test(ipv4)) return true;
  return false;
}

/**
 * Extracts the embedded IPv4 from an IPv4-mapped IPv6 address.
 *
 * The WHATWG URL parser normalizes `::ffff:a.b.c.d` into hex form
 * `::ffff:XXYY:ZZWW` where XXYY and ZZWW encode octet pairs.
 * This function converts that hex form back to dotted IPv4 for validation.
 */
function extractMappedIPv4(bare: string): string | null {
  const match = bare.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!match) return null;

  const high = parseInt(match[1], 16);
  const low = parseInt(match[2], 16);

  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

/**
 * Validates that a provider base URL is safe to fetch from.
 * Blocks private/internal network addresses to prevent SSRF.
 *
 * Note: The WHATWG URL parser (used by `new URL()`) normalizes numeric IP
 * notations (decimal, hex, octal) to standard dotted IPv4 before we see them,
 * so those bypass vectors are handled automatically.
 */
export function isAllowedProviderUrl(raw: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }

  // Block URLs with embedded credentials (info leakage risk)
  if (parsed.username || parsed.password) {
    return false;
  }

  // The parser returns IPv6 with brackets: "[fe80::1]". Strip for regex checks.
  // Strip trailing dots — "localhost." is the FQDN form of "localhost" and
  // resolves identically, so we must normalize before checking blocked names.
  const rawHostname = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  const isIPv6 = rawHostname.startsWith("[") && rawHostname.endsWith("]");
  const hostname = isIPv6 ? rawHostname.slice(1, -1) : rawHostname;

  // Block loopback and unspecified addresses
  if (hostname === "localhost" || hostname === "::1" || hostname === "::") {
    return false;
  }

  // Block standard dotted IPv4 private/reserved ranges
  // (also catches decimal/hex/octal notations which the URL parser normalizes)
  if (isBlockedIPv4(hostname)) {
    return false;
  }

  // Block IPv4-mapped IPv6 addresses (::ffff:XXYY:ZZWW) — check the embedded IPv4
  const mappedIPv4 = extractMappedIPv4(hostname);
  if (mappedIPv4 !== null) {
    return !isBlockedIPv4(mappedIPv4);
  }

  // Block IPv6 private and link-local ranges
  // ULA (fc00::/7 = fc00:: through fdff::)
  if (/^f[cd]/i.test(hostname)) return false;
  // Link-local (fe80::/10 = fe80:: through febf::)
  if (/^fe[89ab]/i.test(hostname)) return false;

  // Block link-local / metadata endpoints (IPv4)
  if (/^169\.254\./.test(hostname)) return false;

  // Block common cloud metadata hostnames
  if (hostname === "metadata.google.internal") return false;

  return true;
}

interface ProviderWorkspaceSummaryShape {
  summary: string;
}

interface ProviderWorkspaceHelpShape {
  answer: string;
}

interface ProviderWorkspaceSummaryHints {
  pendingQuestionCount: number;
  advisoryReviewOnly: boolean;
  returnBundleReady: boolean;
}

interface OpenAIResponsesApiResult {
  output_text?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
  output?: Array<{
    type?: unknown;
    content?: Array<{
      type?: unknown;
      text?: unknown;
    }>;
  }>;
  error?: {
    message?: unknown;
  };
}

interface GeminiGenerateContentResult {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: unknown;
  };
}

const workspaceSummarySchema = {
  name: "workspace_summary",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "A concise summary of the redacted workspace state."
      }
    },
    required: ["summary"],
    additionalProperties: false
  }
} as const;

const workspaceHelpSchema = {
  name: "workspace_help",
  strict: true,
  schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description: "A concise answer to the user's question using the redacted workspace context."
      }
    },
    required: ["answer"],
    additionalProperties: false
  }
} as const;

function buildWorkspaceSummaryHints(request: ProviderWorkspaceRequest): ProviderWorkspaceSummaryHints {
  const pendingQuestionCount = request.workspace.seededReturn.interviewQuestions
    .filter((question) => question.status === "pending")
    .length;
  const advisoryReviewOnly = pendingQuestionCount === 0
    && request.unsupportedRoutes.length > 0
    && request.unsupportedRoutes.every((route) =>
      route.id === "review-filing-pack" || route.id === "partner-review-later"
    );
  const returnBundleReady = request.workspace.returnSummary.status === "ready-to-recompute"
    || advisoryReviewOnly;

  return {
    pendingQuestionCount,
    advisoryReviewOnly,
    returnBundleReady
  };
}

function readUsageTokens(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function buildMockSummary(request: ProviderWorkspaceRequest): ProviderWorkspaceResponse {
  const summaryHints = buildWorkspaceSummaryHints(request);
  const pendingQuestionCount = summaryHints.pendingQuestionCount;
  const readyForRecompute = request.workspace.returnSummary.status === "ready-to-recompute";
  const totalDocuments = request.workspace.summary.totalDocuments;
  const primaryUnsupportedRoute = request.unsupportedRoutes[0];
  const primaryUnsupportedReason = primaryUnsupportedRoute?.reasons[0] ?? primaryUnsupportedRoute?.description;

  return {
    requestId: request.requestId,
    provider: "mock-local",
    summary: summaryHints.returnBundleReady && summaryHints.advisoryReviewOnly
      ? `Return bundle is ready to download. ${request.unsupportedRoutes.length} advisory follow-up route${request.unsupportedRoutes.length === 1 ? "" : "s"} remain for uploaded documents that were not deterministically mapped into the return.`
      : readyForRecompute
      ? `Workspace is ready for deterministic recompute across ${totalDocuments} document(s).`
      : primaryUnsupportedRoute
        ? [
          `Workspace has ${request.unsupportedRoutes.length} active unsupported route(s).`,
          `Start with ${primaryUnsupportedRoute.title}.`,
          primaryUnsupportedReason ? `Primary blocker: ${primaryUnsupportedReason}` : null
        ].filter(Boolean).join(" ")
        : `Workspace still needs ${pendingQuestionCount} interview confirmation(s) before deterministic recompute can run.`,
    totalDocuments,
    pendingQuestionCount,
    readyForRecompute,
    redactionCount: request.redactions.length,
  };
}

function buildProviderWorkspaceInput(request: ProviderWorkspaceRequest) {
  const summaryHints = buildWorkspaceSummaryHints(request);

  return {
    task: request.task,
    requestId: request.requestId,
    requestedAt: request.requestedAt,
    replacementCount: request.replacementCount,
    summaryHints,
    redactions: request.redactions,
    unsupportedRoutes: request.unsupportedRoutes,
    workspace: request.workspace,
    ...(request.task === "workspace-help"
      ? {
          question: request.question ?? "",
          assistantContext: request.assistantContext ?? null
        }
      : {})
  };
}

function buildMockHelpAnswer(request: ProviderWorkspaceRequest): ProviderWorkspaceResponse {
  const summaryHints = buildWorkspaceSummaryHints(request);
  const question = request.question?.trim() || "your return";
  const sectionLabel = request.assistantContext?.currentSectionLabel;
  const nextRoute = request.unsupportedRoutes[0];

  return {
    task: "workspace-help",
    requestId: request.requestId,
    provider: "mock-local",
    modelId: null,
    answer: [
      sectionLabel
        ? `You're asking about ${sectionLabel}.`
        : "You're asking about your current return workspace.",
      summaryHints.returnBundleReady
        ? "Your return looks ready to download, with only advisory follow-ups left."
        : summaryHints.pendingQuestionCount > 0
          ? `There are still ${summaryHints.pendingQuestionCount} unresolved interview confirmation${summaryHints.pendingQuestionCount === 1 ? "" : "s"} affecting the return.`
          : "There are no pending interview confirmations blocking the current return snapshot.",
      nextRoute
        ? `Best next step: ${nextRoute.title}.`
        : `Question received: ${question}. Review the uploaded documents and confirm any highlighted values before relying on them.`
    ].join(" "),
    totalDocuments: request.workspace.summary.totalDocuments,
    pendingQuestionCount: summaryHints.pendingQuestionCount,
    readyForRecompute: request.workspace.returnSummary.status === "ready-to-recompute",
    redactionCount: request.redactions.length,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostCents: 0
    }
  };
}

function getGeminiApiKey(env: Record<string, string | undefined>) {
  return env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim() || "";
}

function getOpenAIApiKey(env: Record<string, string | undefined>) {
  return env.MODEL_PROVIDER_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || "";
}

function getGeminiModel(env: Record<string, string | undefined>) {
  return env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

function getGeminiOutputText(result: GeminiGenerateContentResult) {
  return result.candidates?.[0]?.content?.parts
    ?.map((part) => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim() || null;
}

function getOutputText(result: OpenAIResponsesApiResult) {
  if (typeof result.output_text === "string" && result.output_text.trim().length > 0) {
    return result.output_text;
  }

  for (const item of result.output ?? []) {
    if (item.type !== "message") {
      continue;
    }

    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim().length > 0) {
        return content.text;
      }
    }
  }

  return null;
}

function parseProviderWorkspaceSummary(result: OpenAIResponsesApiResult): ProviderWorkspaceSummaryShape {
  if (typeof result.error?.message === "string" && result.error.message.trim().length > 0) {
    throw new Error("Model provider returned an error.");
  }

  const outputText = getOutputText(result);

  if (!outputText) {
    throw new Error("Model provider response did not include output text.");
  }

  const parsed = parseJsonFromModelText(outputText) as Partial<ProviderWorkspaceSummaryShape>;

  if (typeof parsed.summary !== "string" || parsed.summary.trim().length === 0) {
    throw new Error("Model provider response did not include a valid workspace summary.");
  }

  const trimmedSummary = parsed.summary.trim();
  const truncated = trimmedSummary.length > PROVIDER_SUMMARY_MAX_LENGTH
    ? trimmedSummary.slice(0, PROVIDER_SUMMARY_MAX_LENGTH)
    : trimmedSummary;

  // Sanitize HTML entities to prevent stored XSS when rendered in the frontend.
  // The AI model controls this text; a compromised or adversarial model response
  // could include <script> or event handler payloads.
  return {
    summary: sanitizeHtmlEntities(truncated)
  };
}

function parseProviderWorkspaceHelp(result: OpenAIResponsesApiResult): ProviderWorkspaceHelpShape {
  if (typeof result.error?.message === "string" && result.error.message.trim().length > 0) {
    throw new Error("Model provider returned an error.");
  }

  const outputText = getOutputText(result);

  if (!outputText) {
    throw new Error("Model provider response did not include output text.");
  }

  const parsed = parseJsonFromModelText(outputText) as Partial<ProviderWorkspaceHelpShape>;

  if (typeof parsed.answer !== "string" || parsed.answer.trim().length === 0) {
    throw new Error("Model provider response did not include a valid workspace answer.");
  }

  const trimmedAnswer = parsed.answer.trim();
  const truncated = trimmedAnswer.length > PROVIDER_SUMMARY_MAX_LENGTH
    ? trimmedAnswer.slice(0, PROVIDER_SUMMARY_MAX_LENGTH)
    : trimmedAnswer;

  return {
    answer: sanitizeHtmlEntities(truncated)
  };
}

export function sanitizeHtmlEntities(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Reads a Response body with a streaming size limit.
 *
 * Unlike `response.text()` which buffers the entire body before any check,
 * this reads the body in chunks and aborts as soon as the cumulative size
 * exceeds the limit — preventing memory exhaustion from oversized responses.
 */
async function readResponseWithSizeLimit(
  response: Response,
  maxSize: number
): Promise<string> {
  const contentLength = response.headers.get("content-length");

  if (contentLength) {
    const declaredSize = parseInt(contentLength, 10);

    if (!Number.isNaN(declaredSize) && declaredSize > maxSize) {
      throw new Error("Model provider response exceeded the maximum allowed size.");
    }
  }

  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxSize) {
        throw new Error("Model provider response exceeded the maximum allowed size.");
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }

    // Flush the decoder
    chunks.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }

  return chunks.join("");
}

async function requestOpenAIWorkspaceSummary(
  request: ProviderWorkspaceRequest,
  dependencies: ProviderWorkspaceResponderDependencies
) {
  const env = dependencies.env ?? process.env;
  const apiKey = getOpenAIApiKey(env);

  if (!apiKey) {
    return null;
  }

  const fetchFn = dependencies.fetchFn ?? fetch;
  const baseUrl = (env.MODEL_PROVIDER_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = resolveHostedAiHelperModelId(env);

  if (!dependencies.skipUrlValidation && !isAllowedProviderUrl(baseUrl)) {
    throw new Error("Model provider base URL is not allowed (SSRF protection).");
  }

  const controller = new AbortController();
  const timeoutMs = PROVIDER_REQUEST_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      signal: controller.signal,
      redirect: "error",
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "minimal" },
        instructions: [
          "You summarize tax workspace state for a privacy-first filing assistant.",
          "All direct identifiers are already redacted or tokenized.",
          "Never infer or restore any redacted identifier.",
          "If summaryHints.returnBundleReady is true and summaryHints.advisoryReviewOnly is true, describe the return as ready to download with advisory follow-ups rather than blocked.",
          "Return JSON that matches the supplied schema exactly."
        ].join(" "),
        input: JSON.stringify(buildProviderWorkspaceInput(request)),
        text: {
          format: {
            type: "json_schema",
            ...workspaceSummarySchema
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Model provider request failed with status ${response.status}.`);
    }

    const providerInput = buildProviderWorkspaceInput(request);
    const responseText = await readResponseWithSizeLimit(response, PROVIDER_RESPONSE_MAX_SIZE);
    const result = JSON.parse(responseText) as OpenAIResponsesApiResult;
    const parsed = parseProviderWorkspaceSummary(result);

    return {
      modelId: model,
      ...parsed,
      usage: estimateHostedAiUsageCost({
        requestPayload: providerInput,
        responseText: parsed.summary,
        modelId: model,
        inputTokens: readUsageTokens(result.usage?.input_tokens),
        outputTokens: readUsageTokens(result.usage?.output_tokens)
      }, env)
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestOpenAIWorkspaceHelp(
  request: ProviderWorkspaceRequest,
  dependencies: ProviderWorkspaceResponderDependencies
) {
  const env = dependencies.env ?? process.env;
  const apiKey = getOpenAIApiKey(env);

  if (!apiKey) {
    return null;
  }

  const fetchFn = dependencies.fetchFn ?? fetch;
  const baseUrl = (env.MODEL_PROVIDER_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = resolveHostedAiHelperModelId(env);

  if (!dependencies.skipUrlValidation && !isAllowedProviderUrl(baseUrl)) {
    throw new Error("Model provider base URL is not allowed (SSRF protection).");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_REQUEST_TIMEOUT_MS);

  try {
    const providerInput = buildProviderWorkspaceInput(request);
    const response = await fetchFn(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      signal: controller.signal,
      redirect: "error",
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "minimal" },
        max_output_tokens: resolveHostedAiMaxOutputTokens(env),
        instructions: [
      "You answer tax software questions using a privacy-safe, redacted return workspace payload.",
      "Treat the filer as asking about software use and return workflow, not for legal or CPA representation.",
      "Use the current section context when present.",
      "When assistantContext.selectedDocuments is present, explain how those selected documents relate to the current section or question before broadening out to the rest of the workspace.",
      "Do not fabricate values that are not present in the workspace.",
          "If the workspace is missing data needed to answer precisely, say what is missing and state the safest next step.",
          "Never infer or restore any redacted identifier.",
          "Keep the answer concise, practical, and specific to the question.",
          "Return JSON that matches the supplied schema exactly."
        ].join(" "),
        input: JSON.stringify(providerInput),
        text: {
          format: {
            type: "json_schema",
            ...workspaceHelpSchema
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Model provider request failed with status ${response.status}.`);
    }

    const responseText = await readResponseWithSizeLimit(response, PROVIDER_RESPONSE_MAX_SIZE);
    const result = JSON.parse(responseText) as OpenAIResponsesApiResult;
    const parsed = parseProviderWorkspaceHelp(result);

    return {
      modelId: model,
      ...parsed,
      usage: estimateHostedAiUsageCost({
        requestPayload: providerInput,
        responseText: parsed.answer,
        modelId: model,
        inputTokens: readUsageTokens(result.usage?.input_tokens),
        outputTokens: readUsageTokens(result.usage?.output_tokens)
      }, env)
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestGeminiWorkspaceSummary(
  request: ProviderWorkspaceRequest,
  dependencies: ProviderWorkspaceResponderDependencies
) {
  const env = dependencies.env ?? process.env;
  const apiKey = getGeminiApiKey(env);

  if (!apiKey) {
    return null;
  }

  const summaryHints = buildWorkspaceSummaryHints(request);
  const payload = {
    requestId: request.requestId,
    summaryHints,
    unsupportedRoutes: request.unsupportedRoutes,
    workspace: request.workspace,
  };
  const response = await fetch(
    `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(getGeminiModel(env))}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
              "Summarize the current tax-return workspace for the filer.",
              "Return strict JSON with keys:",
              "{",
              '  "summary": string',
              "}",
              "Rules:",
              "- Write 2 to 4 short sentences in plain English.",
              "- Mention the readiness state of the return, any remaining blockers, and the clearest next action.",
              "- If summaryHints.returnBundleReady is true and summaryHints.advisoryReviewOnly is true, describe the return as ready to download with advisory follow-ups rather than blocked.",
              "- Never infer any direct identifier from redaction tokens.",
              "- Keep the summary concise and practical.",
              "",
              "Redacted workspace payload:",
              JSON.stringify(payload)
            ].join("\n"),
          }],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    }
  );

  const result = await response.json().catch(() => null) as GeminiGenerateContentResult | null;

  if (!response.ok) {
    const errorMessage = typeof result?.error?.message === "string" && result.error.message.trim()
      ? result.error.message
      : `Gemini request failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  const outputText = getGeminiOutputText(result ?? {});

  if (!outputText) {
    throw new Error("Gemini response did not include output text.");
  }

  const parsed = JSON.parse(outputText) as Partial<ProviderWorkspaceSummaryShape>;

  if (typeof parsed.summary !== "string" || parsed.summary.trim().length === 0) {
    throw new Error("Gemini response did not include a valid workspace summary.");
  }

  return {
    modelId: getGeminiModel(env),
    summary: sanitizeHtmlEntities(parsed.summary.trim().slice(0, PROVIDER_SUMMARY_MAX_LENGTH)),
    usage: estimateHostedAiUsageCost({
      requestPayload: payload,
      responseText: parsed.summary,
      modelId: getGeminiModel(env)
    }, env)
  };
}

async function requestGeminiWorkspaceHelp(
  request: ProviderWorkspaceRequest,
  dependencies: ProviderWorkspaceResponderDependencies
) {
  const env = dependencies.env ?? process.env;
  const apiKey = getGeminiApiKey(env);

  if (!apiKey) {
    return null;
  }

  const payload = {
    requestId: request.requestId,
    question: request.question ?? "",
    assistantContext: request.assistantContext ?? null,
    unsupportedRoutes: request.unsupportedRoutes,
    workspace: request.workspace
  };
  const response = await fetch(
    `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(getGeminiModel(env))}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
              "Answer the user's question about their current tax-return workspace.",
              "Return strict JSON with keys:",
              "{",
              '  "answer": string',
              "}",
              "Rules:",
              "- Use the redacted workspace and current section context when present.",
              "- When assistantContext.selectedDocuments is present, focus first on how those selected documents relate to the current section and question.",
              "- Treat this as software workflow help, not legal or CPA representation.",
              "- Do not fabricate values or restore redacted identifiers.",
              "- If key information is missing, say what is missing and the safest next step.",
              "- Keep the answer concise, practical, and directly responsive to the user's question.",
              "",
              "Redacted workspace help payload:",
              JSON.stringify(payload)
            ].join("\n"),
          }],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    }
  );

  const result = await response.json().catch(() => null) as GeminiGenerateContentResult | null;

  if (!response.ok) {
    const errorMessage = typeof result?.error?.message === "string" && result.error.message.trim()
      ? result.error.message
      : `Gemini request failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  const outputText = getGeminiOutputText(result ?? {});

  if (!outputText) {
    throw new Error("Gemini response did not include output text.");
  }

  const parsed = JSON.parse(outputText) as Partial<ProviderWorkspaceHelpShape>;

  if (typeof parsed.answer !== "string" || parsed.answer.trim().length === 0) {
    throw new Error("Gemini response did not include a valid workspace answer.");
  }

  return {
    modelId: getGeminiModel(env),
    answer: sanitizeHtmlEntities(parsed.answer.trim().slice(0, PROVIDER_SUMMARY_MAX_LENGTH)),
    usage: estimateHostedAiUsageCost({
      requestPayload: payload,
      responseText: parsed.answer,
      modelId: getGeminiModel(env)
    }, env)
  };
}

export function createProviderWorkspaceResponder(
  dependencies: ProviderWorkspaceResponderDependencies = {}
) {
  return async function respondToProviderWorkspaceRequest(
    request: ProviderWorkspaceRequest
  ): Promise<ProviderWorkspaceResponse> {
    const pendingQuestionCount = request.workspace.seededReturn.interviewQuestions
      .filter((question) => question.status === "pending")
      .length;
    const readyForRecompute = request.workspace.returnSummary.status === "ready-to-recompute";
    const totalDocuments = request.workspace.summary.totalDocuments;
    if (request.task === "workspace-help") {
      const openAiHelp = await requestOpenAIWorkspaceHelp(request, dependencies);

      if (openAiHelp) {
        return {
          task: "workspace-help",
          requestId: request.requestId,
          provider: "openai-responses",
          modelId: openAiHelp.modelId,
          answer: openAiHelp.answer,
          totalDocuments,
          pendingQuestionCount,
          readyForRecompute,
          redactionCount: request.redactions.length,
          usage: openAiHelp.usage
        };
      }

      const geminiHelp = await requestGeminiWorkspaceHelp(request, dependencies);

      if (geminiHelp) {
        return {
          task: "workspace-help",
          requestId: request.requestId,
          provider: "gemini",
          modelId: geminiHelp.modelId,
          answer: geminiHelp.answer,
          totalDocuments,
          pendingQuestionCount,
          readyForRecompute,
          redactionCount: request.redactions.length,
          usage: geminiHelp.usage
        };
      }

      return buildMockHelpAnswer(request);
    }

    const openAiSummary = await requestOpenAIWorkspaceSummary(request, dependencies);

    if (openAiSummary) {
      return {
        task: "workspace-summary",
        requestId: request.requestId,
        provider: "openai-responses",
        modelId: openAiSummary.modelId,
        summary: openAiSummary.summary,
        totalDocuments,
        pendingQuestionCount,
        readyForRecompute,
        redactionCount: request.redactions.length,
        usage: openAiSummary.usage
      };
    }

    const geminiSummary = await requestGeminiWorkspaceSummary(request, dependencies);

    if (geminiSummary) {
      return {
        task: "workspace-summary",
        requestId: request.requestId,
        provider: "gemini",
        modelId: geminiSummary.modelId,
        summary: geminiSummary.summary,
        totalDocuments,
        pendingQuestionCount,
        readyForRecompute,
        redactionCount: request.redactions.length,
        usage: geminiSummary.usage
      };
    }

    return buildMockSummary(request);
  };
}
