import "server-only";
import Decimal from "decimal.js";
import { AI_PROFILES } from "@tax-engine/engine/src/ai-task-registry";
import { workspaceSummarySchema as summarySchema, workspaceHelpSchema as helpSchema } from "@tax-engine/engine/src/ai-application-schemas";
import { AI_APPLICATION_INSTRUCTIONS, parseApplicationTaskOutput } from "@tax-engine/engine/src/ai-application-bindings";
import { z } from "zod";
import { executeAiTask, type AiTaskExecution, type VerifiedAiTaxContext } from "./ai-task-adapter";
import type { ProviderWorkspaceRequest, ProviderWorkspaceResponse } from "./provider-workspace-request";
import { resolveServerAiTaxContext } from "./ai-tax-context";
import { buildLocalProviderWorkspaceResponse } from "./provider-workspace-local";

export interface ProviderWorkspaceResponderDependencies {
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
  /** Trusted harness/server configuration only; never accepted from request JSON. */
  execution?: AiTaskExecution;
  resolveTaxContext?: (request: ProviderWorkspaceRequest) => VerifiedAiTaxContext | undefined;
  /** Request-local known-identity check for a private calculation, never from request JSON. */
  assertResponsePrivacy?: (text: string) => void;
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


export function sanitizeHtmlEntities(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

/** The legacy responder now uses the same bounded, schema-validated task adapter as document analysis. */
export function createProviderWorkspaceResponder(dependencies: ProviderWorkspaceResponderDependencies = {}) {
  return async function respond(request: ProviderWorkspaceRequest, signal?: AbortSignal, accounting: Partial<AiTaskExecution> = {}): Promise<ProviderWorkspaceResponse> {
    const fallback = buildLocalProviderWorkspaceResponse(request);
    const execution = dependencies.execution ?? { mode: "production" as const };
    if ((execution.mode === "production" && !execution.productionRollout) || request.optedOut) return fallback;
    const env = dependencies.env ?? process.env;
    if (env.MODEL_PROVIDER_BASE_URL?.trim() && env.MODEL_PROVIDER_BASE_URL.replace(/\/+$/, "") !== "https://api.openai.com/v1") {
      throw new Error("Only the fixed official AI provider endpoint is supported.");
    }
    const taxContext = dependencies.resolveTaxContext?.(request) ?? resolveServerAiTaxContext({
      taxYear: request.workspace.returnSummary.targetTaxYear, workspaceId: request.workspace.id,
      workspaceRevision: request.workspace.updatedAt, ownerScope: execution.productionRollout?.ownerScope ?? "",
    }).context;
    // Client preview values, alleged audit entries and year assertions are never verified context.
    if (request.task === "workspace-help" && !taxContext) return fallback;
    if (taxContext && taxContext.taxYear !== request.workspace.returnSummary.targetTaxYear) throw new Error("Verified tax context does not match the workspace year.");
    const permittedSources = new Set(["workspace:status", "workspace:questions", "workspace:routes",
      ...(taxContext?.excerpts.map(entry => entry.id) ?? []), ...(taxContext?.auditEntries.map(entry => entry.id) ?? [])]);
    const redactedText = JSON.stringify({ taxYear: request.workspace.returnSummary.targetTaxYear,
      status: { sourceId: "workspace:status", totalDocuments: fallback.totalDocuments, readyForRecompute: fallback.readyForRecompute },
      questions: { sourceId: "workspace:questions", pendingCount: fallback.pendingQuestionCount,
        prompts: request.workspace.seededReturn.interviewQuestions.filter(question => question.status === "pending").map(question => question.prompt) },
      unsupportedRoutes: { sourceId: "workspace:routes", routes: request.unsupportedRoutes },
      question: request.question ?? null, assistantContext: request.assistantContext ?? null });
    const schema: z.ZodType<z.infer<typeof summarySchema> | z.infer<typeof helpSchema>> = request.task === "workspace-summary" ? summarySchema : helpSchema;
    const result = await executeAiTask({ task: request.task === "workspace-summary" ? "workspace-summary" : "tax-explanation",
      redactedText, taxContext, schema, signal,
      instructions: `${AI_APPLICATION_INSTRUCTIONS} Describe the supplied workflow state or explain the verified audit values. Include sourceIds for every claim. Preserve all audit values exactly. Never describe a return as ready to download or file. Return source IDs, not invented links.`,
      validateGrounding(value) {
        parseApplicationTaskOutput(request.task === "workspace-summary" ? "workspace-summary" : "tax-explanation", value, {
          sources: ["workspace:status", "workspace:questions", "workspace:routes"].map(id => ({ id, text: redactedText })), taxContext,
        });
        if (value.sourceIds.some(id => !permittedSources.has(id))) throw new Error("Unverified source citation.");
        const text = "summary" in value ? value.summary : value.answer;
        dependencies.assertResponsePrivacy?.(text);
        if (/ready (?:to|for) (?:download|fil(?:e|ing))|filing[- ]ready|guaranteed (?:refund|deduction)/i.test(text)) throw new Error("Invented readiness claim.");
        if ("engineValues" in value) {
          if (!value.sourceIds.some(id => taxContext?.excerpts.some(entry => entry.id === id))
            || !value.sourceIds.some(id => taxContext?.auditEntries.some(entry => entry.id === id))) throw new Error("Tax explanation requires both source and audit citations.");
          for (const entry of value.engineValues) {
            const original = taxContext?.auditEntries.find(audit => audit.id === entry.id);
            if (!original || !/^-?\d+(?:\.\d+)?$/.test(entry.value) || !new Decimal(original.value).eq(entry.value)) throw new Error("Engine value override.");
          }
        }
        for (const amount of text.match(/(?:\$|USD\s*)[\d,]+(?:\.\d+)?/g) ?? []) {
          const value = new Decimal(amount.replace(/USD|\$|,|\s/g, ""));
          if (!taxContext?.auditEntries.some(entry => new Decimal(entry.value).eq(value))) throw new Error("Unverified monetary claim.");
        }
        const allowedNumbers = [request.workspace.returnSummary.targetTaxYear, fallback.totalDocuments, fallback.pendingQuestionCount,
          request.unsupportedRoutes.length, ...(taxContext?.auditEntries.map(entry => entry.value) ?? [])].filter(value => value !== null);
        for (const number of text.match(/(?<![\w])[-+]?\d[\d,]*(?:\.\d+)?/g) ?? []) {
          if (!allowedNumbers.some(value => new Decimal(value).eq(number.replaceAll(",", "")))) throw new Error("Unverified numeric claim.");
        }
      },
    }, { ...execution, ...accounting, apiKeys: execution.apiKeys ?? {
      google: env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY, openai: env.OPENAI_API_KEY ?? env.MODEL_PROVIDER_API_KEY,
    }, fetchFn: dependencies.fetchFn ?? execution.fetchFn });
    if (!result) return fallback;
    const usage = { providerCostUsd: result.accounting.providerCostUsd, usageKind: "reported" as const,
      pricingEffectiveFrom: result.accounting.pricingEffectiveFrom, inputTokens: result.accounting.usage.inputTokens,
      outputTokens: result.accounting.usage.outputTokens, estimatedCostCents: result.accounting.retailChargeCents };
    if (!result.accepted || result.value.disposition === "abstain") return { ...fallback, usage };
    return { ...fallback, provider: AI_PROFILES[result.accounting.profileId].provider === "google" ? "gemini" : "openai-responses",
      modelId: AI_PROFILES[result.accounting.profileId].model,
      ...("summary" in result.value ? { summary: sanitizeHtmlEntities(result.value.summary) } : { answer: sanitizeHtmlEntities(result.value.answer) }),
      sourceIds: result.value.sourceIds, usage };
  };
}
