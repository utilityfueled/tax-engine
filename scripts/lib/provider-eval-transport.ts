import { performance } from "node:perf_hooks";
import { z } from "zod";
import { providerModelCandidates } from "../../packages/engine/src/provider-model-eval";
import { evalUsageSchema, type ProviderEvalRequest, type ProviderEvalTransport, type ProviderEvalTransportResult } from "./provider-eval-runner";
import { PROVIDER_EVAL_CONTRACT as contract } from "./provider-eval-contract";
const token = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const openAiEnvelope = z.object({ model: z.string(), id: z.string().optional(), service_tier: z.string().optional(), status: z.string(),
  output_text: z.string().optional(), output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })).optional(),
  usage: z.object({ input_tokens: token, output_tokens: token, input_tokens_details: z.object({ cached_tokens: token.optional(),
    cache_write_tokens: token.optional(), cache_write_tokens_details: z.object({ ttl_30m_tokens: token, ttl_12h_tokens: token }).optional() }).optional() }) });
const googleEnvelope = z.object({ modelVersion: z.string(), responseId: z.string().optional(), candidates: z.array(z.object({ finishReason: z.string(),
  content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional() })).max(1),
  usageMetadata: z.object({ promptTokenCount: token, candidatesTokenCount: token, thoughtsTokenCount: token.optional(), cachedContentTokenCount: token.optional() }) });
async function readBounded(response: Response) {
  if (!response.body || Number(response.headers.get("content-length")) > contract.responseByteLimit) throw new Error("Bounded response unavailable.");
  const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > contract.responseByteLimit) { await reader.cancel(); throw new Error("Response too large."); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)) as unknown;
}
/** Fixed official endpoints, one attempt, no tools, redirects, persisted conversation, automatic retries or continuations. */
export function createLiveProviderEvalTransport(options: { profileIds: string[]; apiKeys: { openai?: string; google?: string }; fetchFn?: typeof fetch }): ProviderEvalTransport {
  for (const id of options.profileIds) {
    const profile = providerModelCandidates.find(item => item.id === id);
    if (!profile || !options.apiKeys[profile.provider]?.trim()) throw new Error("Every selected evaluation provider needs an explicitly configured key.");
  }
  const allowed = new Set(options.profileIds);
  return async (request: ProviderEvalRequest, outerSignal?: AbortSignal): Promise<ProviderEvalTransportResult> => {
    if (!allowed.has(request.profile.id)) throw new Error("Unapproved evaluation profile.");
    const signal = outerSignal ? AbortSignal.any([outerSignal, AbortSignal.timeout(request.timeoutMs)]) : AbortSignal.timeout(request.timeoutMs);
    signal.throwIfAborted();
    const started = performance.now(); const openai = request.profile.provider === "openai";
    const url = openai ? contract.openai.endpoint : `${contract.google.endpoint}${encodeURIComponent(request.profile.model)}${contract.google.methodSuffix}`;
    const instructions = contract.safetyInstructions;
    const body = openai ? { model: request.profile.model, store: contract.openai.store, service_tier: contract.openai.serviceTier, reasoning: { effort: request.profile.effort },
      ...(request.profile.model.startsWith(contract.openai.cache.modelPrefix) ? { prompt_cache_options: { mode: contract.openai.cache.mode, ttl: contract.openai.cache.ttl } } : {}),
      max_output_tokens: request.maxOutputTokens, instructions, input: JSON.stringify(request.content),
      text: { format: { type: "json_schema", name: contract.openai.formatName, strict: contract.openai.strict, schema: request.jsonSchema } } }
      : { systemInstruction: { parts: [{ text: instructions }] }, contents: [{ role: "user", parts: [{ text: JSON.stringify(request.content) }] }],
        generationConfig: { responseMimeType: contract.google.mimeType, responseJsonSchema: request.jsonSchema,
          maxOutputTokens: request.maxOutputTokens, thinkingConfig: { thinkingLevel: contract.google.thinkingLevel, includeThoughts: contract.google.includeThoughts } } };
    try {
      const response = await (options.fetchFn ?? fetch)(url, { method: contract.method, redirect: contract.redirect, signal,
        headers: openai ? { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKeys.openai}` } : { "Content-Type": "application/json", "x-goog-api-key": options.apiKeys.google ?? "" },
        body: JSON.stringify(body) });
      if (!response.ok) return { status: [401, 403, 404].includes(response.status) ? "unavailable" : "failed", usage: null,
        elapsedMs: performance.now() - started, reportedModel: null, responseReference: response.headers.get("x-request-id"), payload: null };
      const payload = await readBounded(response);
      let outputText: string; let usage; let complete: boolean; let reportedModel: string; let responseReference: string | null;
      if (openai) {
        const envelope = openAiEnvelope.parse(payload);
        if (envelope.service_tier && envelope.service_tier !== "default") throw new Error("Unpriced tier.");
        const details = envelope.usage.input_tokens_details; const writes = details?.cache_write_tokens_details;
        if ((details?.cache_write_tokens ?? 0) !== (writes?.ttl_30m_tokens ?? 0) + (writes?.ttl_12h_tokens ?? 0)) throw new Error("Unpriced cache duration.");
        usage = evalUsageSchema.parse({ inputTokens: envelope.usage.input_tokens, outputTokens: envelope.usage.output_tokens,
          cachedInputTokens: details?.cached_tokens ?? 0, cacheWrite30mTokens: writes?.ttl_30m_tokens ?? 0, cacheWrite12hTokens: writes?.ttl_12h_tokens ?? 0 });
        complete = envelope.status === "completed" && !envelope.output?.some(item => item.content?.some(part => part.type === "refusal"));
        outputText = envelope.output_text ?? envelope.output?.flatMap(item => item.type === "message" ? item.content?.filter(part => part.type === "output_text").map(part => part.text ?? "") ?? [] : []).join("") ?? "";
        reportedModel = envelope.model; responseReference = response.headers.get("x-request-id") ?? envelope.id ?? null;
      } else {
        const envelope = googleEnvelope.parse(payload); const candidate = envelope.candidates[0];
        usage = evalUsageSchema.parse({ inputTokens: envelope.usageMetadata.promptTokenCount,
          outputTokens: envelope.usageMetadata.candidatesTokenCount + (envelope.usageMetadata.thoughtsTokenCount ?? 0), cachedInputTokens: envelope.usageMetadata.cachedContentTokenCount ?? 0 });
        complete = candidate?.finishReason === "STOP";
        outputText = candidate?.content?.parts.filter(part => !part.thought).map(part => part.text ?? "").join("") ?? "";
        reportedModel = envelope.modelVersion; responseReference = envelope.responseId ?? null;
      }
      let parsedOutput: unknown = null;
      try { parsedOutput = JSON.parse(outputText); } catch { /* Known usage remains billable even when output is invalid. */ }
      return { status: complete ? "completed" : "incomplete", usage, elapsedMs: performance.now() - started, reportedModel, responseReference, payload: parsedOutput };
    } catch {
      // Never echo provider bodies, keys, transport errors or partial private-looking output.
      return { status: "failed", usage: null, elapsedMs: performance.now() - started, reportedModel: null, responseReference: null, payload: null };
    }
  };
}
