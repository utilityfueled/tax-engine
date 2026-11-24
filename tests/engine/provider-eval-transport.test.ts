import { describe, expect, it } from "vitest";
import { createLiveProviderEvalTransport } from "../../scripts/lib/provider-eval-transport";
import { providerModelCandidates } from "../../packages/engine/src/provider-model-eval";
import type { ProviderEvalRequest } from "../../scripts/lib/provider-eval-runner";
function request(id = "luna-high"): ProviderEvalRequest {
  const profile = providerModelCandidates.find(item => item.id === id);
  if (!profile) throw new Error("Missing synthetic profile.");
  return { attemptId: `${id}:capability:0`, kind: "capability", profile, task: null, content: { probe: "ok" },
    jsonSchema: { type: "object", properties: { probe: { type: "string" } }, required: ["probe"], additionalProperties: false }, maxInputTokens: 4096, maxOutputTokens: 1024, timeoutMs: 30000 };
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const openai = { model: "gpt-6-luna", id: "synthetic-response", status: "completed", service_tier: "default", output_text: '{"probe":"ok"}',
  usage: { input_tokens: 100, output_tokens: 50, input_tokens_details: { cached_tokens: 20 } } };
describe("official evaluation transport", () => {
  it("captures actual capability responses without inferring availability from configuration", async () => {
    const calls: { url: string; options: RequestInit }[] = [];
    const transport = createLiveProviderEvalTransport({ profileIds: ["luna-high"], apiKeys: { openai: "test-secret" },
      fetchFn: async (url, options) => { calls.push({ url: String(url), options: options ?? {} }); return response(openai); } });
    const result = await transport(request());
    expect(result).toMatchObject({ status: "completed", reportedModel: "gpt-6-luna", usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 20 }, payload: { probe: "ok" } });
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0]?.options.redirect).toBe("error");
    expect(JSON.parse(String(calls[0]?.options.body))).toMatchObject({ store: false, service_tier: "default", reasoning: { effort: "high" }, max_output_tokens: 1024, text: { format: { strict: true } } });
    expect(JSON.stringify(result)).not.toContain("test-secret");
  });
  it("preserves known billed usage for invalid JSON and refusal", async () => {
    for (const payload of [{ ...openai, output_text: "not json" }, { ...openai, status: "incomplete", output_text: "" }]) {
      const transport = createLiveProviderEvalTransport({ profileIds: ["luna-high"], apiKeys: { openai: "synthetic" }, fetchFn: async () => response(payload) });
      expect(await transport(request())).toMatchObject({ usage: { inputTokens: 100, outputTokens: 50 }, payload: null });
    }
  });
  it("sends a valid client trace only to OpenAI and retains a timeout as unknown", async () => {
    const trace = "e341945d-1b77-4315-9720-a6761ebd0b11";
    const headers: Headers[] = [];
    const transport = createLiveProviderEvalTransport({ profileIds: ["luna-high", "gemini-flash-high"],
      apiKeys: { openai: "synthetic", google: "synthetic" }, fetchFn: async (_url, options) => {
        headers.push(new Headers(options?.headers));
        throw new Error("synthetic network timeout");
      } });
    const timeout = await transport({ ...request(), clientRequestId: trace });
    expect(timeout).toMatchObject({
      status: "failed", usage: null, responseReference: null,
    });
    expect(timeout.httpStatus).toBeUndefined();
    expect(headers[0]?.get("X-Client-Request-Id")).toBe(trace);
    await transport(request());
    expect(headers[1]?.has("X-Client-Request-Id")).toBe(false);
    await transport(request("gemini-flash-high"));
    expect(headers[2]?.has("X-Client-Request-Id")).toBe(false);
    await expect(transport({ ...request(), clientRequestId: "x\r\ninvalid" })).rejects.toThrow(/trace/i);
    await expect(transport({ ...request("gemini-flash-high"), clientRequestId: trace })).rejects.toThrow(/trace/i);
    expect(headers).toHaveLength(3);
  });
  it("preserves the OpenAI request identifier when the response body fails after headers", async () => {
    const responseReference = "req_synthetic_body_failure";
    const headers = { "x-request-id": responseReference };
    const failedBodies = [
      new Response(new ReadableStream({ start: stream => stream.error(new DOMException("private body timeout", "AbortError")) }), { status: 202, headers }),
      new Response(JSON.stringify({ secret: "private invalid envelope" }), { headers }),
      new Response("{}", { headers: { ...headers, "content-length": "1048577" } }),
    ];
    for (const failedBody of failedBodies) {
      const transport = createLiveProviderEvalTransport({ profileIds: ["luna-high"], apiKeys: { openai: "synthetic" },
        fetchFn: async () => failedBody });
      const result = await transport(request());
      expect(result).toMatchObject({ status: "failed", httpStatus: failedBody.status, usage: null, responseReference, reportedModel: null, payload: null });
      expect(JSON.stringify(result)).not.toContain("private");
    }
  });
  it("preserves a body-only provider reference when the response omits the model", async () => {
    const openAiBody = { ...openai, model: undefined };
    const googleBody = { responseId: "synthetic-gemini-response", candidates: [{ finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } };
    for (const [profileId, body, responseReference] of [["luna-high", openAiBody, openAiBody.id],
      ["gemini-flash-high", googleBody, googleBody.responseId]] as const) {
      const transport = createLiveProviderEvalTransport({ profileIds: [profileId], apiKeys: { openai: "synthetic", google: "synthetic" },
        fetchFn: async () => response(body) });
      await expect(transport(request(profileId))).resolves.toMatchObject({ reportedModel: null, usage: null, responseReference });
    }
  });
  it("records unavailable or unknown usage without echoing raw service errors", async () => {
    for (const [payload, status] of [[{ secret: "sensitive provider error" }, 403], [{ ...openai, service_tier: "priority" }, 200], [{ ...openai, usage: { input_tokens: 10, output_tokens: 10, input_tokens_details: { cache_write_tokens: 5 } } }, 200]] as const) {
      const transport = createLiveProviderEvalTransport({ profileIds: ["luna-high"], apiKeys: { openai: "synthetic" }, fetchFn: async () => response(payload, status) });
      const result = await transport(request());
      expect(result.usage).toBeNull(); expect(JSON.stringify(result)).not.toContain("sensitive provider error");
    }
  });
  it("counts Gemini reasoning once and uses its explicitly selected profile", async () => {
    let body: Record<string, unknown> = {};
    const transport = createLiveProviderEvalTransport({ profileIds: ["gemini-flash-high"], apiKeys: { google: "synthetic" }, fetchFn: async (url, options) => {
      expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
      body = JSON.parse(String(options?.body));
      return response({ modelVersion: "gemini-3.8-flash", responseId: "synthetic", candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "hidden reasoning" }, { text: '{"probe":"ok"}' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30, cachedContentTokenCount: 10 } });
    } });
    expect(await transport(request("gemini-flash-high"))).toMatchObject({ usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 10 }, payload: { probe: "ok" } });
    expect(body).toMatchObject({ generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "HIGH", includeThoughts: false } } });
  });
  it("applies Gemini billing checks to blocked evaluation responses", async () => {
    const usageMetadata = { promptTokenCount: 100, candidatesTokenCount: 0, cachedContentTokenCount: 10,
      totalTokenCount: 100, toolUsePromptTokenCount: 0, serviceTier: "standard" };
    const blocked = { modelVersion: "gemini-3.8-flash", promptFeedback: { blockReason: "SAFETY" }, usageMetadata };
    const evaluate = (payload: unknown) => createLiveProviderEvalTransport({ profileIds: ["gemini-flash-high"],
      apiKeys: { google: "synthetic" }, fetchFn: async () => response(payload),
    })(request("gemini-flash-high"));

    for (const candidates of [undefined, []]) {
      await expect.soft(evaluate({ ...blocked, candidates })).resolves.toMatchObject({
        status: "incomplete", usage: { inputTokens: 100, outputTokens: 0, cachedInputTokens: 10 }, payload: null,
      });
    }
    const invalidUsage = [
      { serviceTier: "priority" }, { toolUsePromptTokenCount: 5, totalTokenCount: 105 },
      { totalTokenCount: 99 }, { candidatesTokenCount: 1, totalTokenCount: 101 },
    ];
    for (const details of invalidUsage) {
      await expect.soft(evaluate({ ...blocked, candidates: [], usageMetadata: { ...usageMetadata, ...details } }), JSON.stringify(details))
        .resolves.toMatchObject({ status: "failed", usage: null, payload: null });
    }
    await expect(evaluate({ ...blocked, candidates: [], usageMetadata: { promptTokenCount: 100 } }))
      .resolves.toMatchObject({ status: "failed", usage: null, payload: null });
  });
  it("refuses missing keys, unselected models, oversized responses and cancellation", async () => {
    expect(() => createLiveProviderEvalTransport({ profileIds: ["luna-high"], apiKeys: {} })).toThrow(/configured key/);
    let calls = 0;
    const transport = createLiveProviderEvalTransport({ profileIds: ["luna-high"], apiKeys: { openai: "synthetic" }, fetchFn: async () => { calls++; return new Response("{}", { headers: { "content-length": "1048577" } }); } });
    await expect(transport(request("sol-low"))).rejects.toThrow(/Unapproved/);
    const controller = new AbortController(); controller.abort(); await expect(transport(request(), controller.signal)).rejects.toThrow();
    expect(calls).toBe(0);
    expect(await transport(request())).toMatchObject({ status: "failed", usage: null }); expect(calls).toBe(1);
  });
});
