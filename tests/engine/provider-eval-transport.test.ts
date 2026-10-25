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
