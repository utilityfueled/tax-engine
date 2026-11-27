import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeAiTask, type AiTaskExecution, type AiTaskRequest } from "../../../apps/web/src/lib/ai-task-adapter";
vi.mock("server-only", () => ({}));

const schema = z.object({ summary: z.string().max(300) }).strict();
const geminiUsage = { promptTokenCount: 1000, cachedContentTokenCount: 200, candidatesTokenCount: 100, thoughtsTokenCount: 900 };
function request(overrides: Partial<AiTaskRequest<z.infer<typeof schema>>> = {}) {
  return { task: "workspace-summary" as const, redactedText: "One W-2 requires confirmation.",
    instructions: "Describe the next step.", schema, validateGrounding: vi.fn(), ...overrides };
}
function envelope(output = '{"summary":"Confirm the W-2."}', overrides = {}) {
  return { status: "completed", model: "gpt-6-luna", output: [{ type: "message", content: [{ type: "output_text", text: output }] }],
    usage: { input_tokens: 100, output_tokens: 2000, input_tokens_details: { cached_tokens: 40 } }, ...overrides };
}
function execution(payload = envelope()): AiTaskExecution & { fetchFn: ReturnType<typeof vi.fn> } {
  return { mode: "evaluation", syntheticFixtureId: "synthetic-w2-1", apiKey: "fixture-key",
    now: () => "2027-01-15T12:00:00Z", fetchFn: vi.fn().mockResolvedValue(Response.json(payload)) };
}

describe("task-based candidate AI adapter", () => {
  it.each([
    ["openai", envelope(undefined, { model: "gpt-6.1-sol", service_tier: "default" }), "req_fixture"],
    ["openai", envelope(undefined, { model: undefined }), "req_fixture"],
    ["google", { modelVersion: "gemini-3-flash-preview", candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"summary":"Confirm the W-2."}' }] } }], usageMetadata: geminiUsage }, undefined],
    ["google", { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"summary":"Confirm the W-2."}' }] } }], usageMetadata: geminiUsage }, undefined],
  ] as const)("holds %s usage when the response does not establish the authorized model", async (provider, payload, providerRequestId) => {
    const deps = execution();
    const beforeAttempt = vi.fn();
    const recordUnknownAttempt = vi.fn();
    const recordAttempt = vi.fn();
    deps.fetchFn.mockResolvedValue(Response.json(payload, { headers: { "x-request-id": "req_fixture" } }));
    await expect(executeAiTask(request(), { ...deps, provider, beforeAttempt, recordAttempt, recordUnknownAttempt })).rejects.toThrow(/reconciliation/);
    expect(beforeAttempt).toHaveBeenCalledOnce();
    expect(deps.fetchFn).toHaveBeenCalledOnce();
    expect(recordAttempt).not.toHaveBeenCalled();
    expect(recordUnknownAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(), { providerRequestId });
  });

  it("keeps production and opt-out deterministic even with credentials", async () => {
    const deps = execution();
    expect(await executeAiTask(request(), { ...deps, mode: "production" })).toBeNull();
    expect(await executeAiTask(request({ optedOut: true }), deps)).toBeNull();
    expect(deps.fetchFn).not.toHaveBeenCalled();
  });
  it("requires an explicitly named synthetic evaluation", async () => {
    const deps = execution();
    await expect(executeAiTask(request(), { ...deps, syntheticFixtureId: undefined })).rejects.toThrow(/synthetic fixture/);
    expect(deps.fetchFn).not.toHaveBeenCalled();
  });
  it("uses Luna high, structured output, enforced total output and no storage", async () => {
    const deps = execution();
    const result = await executeAiTask(request(), deps);
    expect(result).toMatchObject({ accepted: true, value: { summary: "Confirm the W-2." },
      accounting: { profileId: "luna-high", providerCostUsd: "0.0010064", retailChargeCents: 1 } });
    const [url, options] = deps.fetchFn.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options).toMatchObject({ redirect: "error" });
    expect(JSON.parse(options.body)).toMatchObject({ model: "gpt-6-luna", store: false,
      reasoning: { effort: "high" }, max_output_tokens: 4096,
      text: { format: { type: "json_schema", strict: true } } });
    expect(JSON.parse(options.body).instructions).toContain("untrusted data");
  });
  it("uses Google only when selected and counts its reasoning once at January prices", async () => {
    const deps = execution();
    const recordAttempt = vi.fn();
    deps.fetchFn.mockResolvedValue(Response.json({
      modelVersion: "gemini-3.8-flash",
      candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "private reasoning" }, { text: '{"summary":"Review W-2."}' }] } }],
      usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 200, candidatesTokenCount: 100, thoughtsTokenCount: 900 },
    }, { headers: { "x-request-id": "req_undocumented" } }));
    const result = await executeAiTask(request(), { ...deps, provider: "google", recordAttempt });
    expect(result).toMatchObject({ accepted: true, accounting: { providerCostUsd: "0.00873", pricingEffectiveFrom: "2027-01-01",
      usage: { outputTokens: 1000 } } });
    const [url, options] = deps.fetchFn.mock.calls[0];
    expect(url).toContain("gemini-3.8-flash:generateContent");
    expect(recordAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ providerRequestId: undefined }));
    expect(url).not.toContain("fixture-key");
    expect(JSON.parse(options.body).generationConfig).toMatchObject({ thinkingConfig: { thinkingLevel: "HIGH" }, maxOutputTokens: 4096 });
  });
  it("settles exact Gemini usage for rejected or missing candidate content", async () => {
    const candidates = [
      { finishReason: "SAFETY" },
      { finishReason: "STOP" },
      { finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"summary":"Review the W-2."}' }] } },
    ];
    for (const candidate of candidates) {
      const deps = execution();
      const recordAttempt = vi.fn();
      const recordUnknownAttempt = vi.fn();
      const validateGrounding = vi.fn();
      deps.fetchFn.mockResolvedValueOnce(Response.json({
        modelVersion: "gemini-3.8-flash",
        candidates: [candidate],
        usageMetadata: geminiUsage,
      }));

      const result = await executeAiTask(request({ validateGrounding }), {
        ...deps, provider: "google", now: () => "2026-11-19T12:00:00Z", recordAttempt, recordUnknownAttempt,
      });

      expect(result).toMatchObject({ accepted: false, value: null, requiresUserConfirmation: true,
        accounting: { providerCostUsd: "0.004365", retailChargeCents: 1 } });
      expect(recordAttempt).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ attempt: 1 }), {
        accepted: false, usage: { inputTokens: 1000, outputTokens: 1000, cachedInputTokens: 200 }, providerRequestId: undefined,
      });
      expect(recordUnknownAttempt).not.toHaveBeenCalled();
      expect(validateGrounding).not.toHaveBeenCalled();
      expect(deps.fetchFn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("/models/gemini-3.8-flash:generateContent"), expect.anything());
    }
  });
  it("keeps missing or malformed Gemini usage unknown after one dispatch", async () => {
    for (const usageMetadata of [undefined, { promptTokenCount: 1000 }, { promptTokenCount: 1000, candidatesTokenCount: -1 }]) {
      const deps = execution();
      const recordAttempt = vi.fn();
      const recordUnknownAttempt = vi.fn();
      deps.fetchFn.mockResolvedValueOnce(Response.json({ modelVersion: "gemini-3.8-flash", candidates: [{ finishReason: "SAFETY" }], usageMetadata }));

      await expect(executeAiTask(request(), { ...deps, provider: "google", recordAttempt, recordUnknownAttempt }))
        .rejects.toThrow("AI provider request failed; usage requires reconciliation.");

      expect(recordUnknownAttempt).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ attempt: 1 }), { providerRequestId: undefined });
      expect(recordAttempt).not.toHaveBeenCalled();
      expect(deps.fetchFn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("/models/gemini-3.8-flash:generateContent"), expect.anything());
    }
  });
  it("reconciles reported Gemini tier and totals before settling usage", async () => {
    for (const serviceTier of ["standard", "unspecified"]) {
      const deps = execution();
      const recordAttempt = vi.fn();
      const recordUnknownAttempt = vi.fn();
      deps.fetchFn.mockResolvedValueOnce(Response.json({ modelVersion: "gemini-3.8-flash", candidates: [{ finishReason: "SAFETY" }],
        usageMetadata: { ...geminiUsage, serviceTier, toolUsePromptTokenCount: 0, totalTokenCount: 2000 },
      }));
      const result = await executeAiTask(request(), { ...deps, provider: "google", now: () => "2026-11-19T12:00:00Z",
        recordAttempt, recordUnknownAttempt });
      expect(result).toMatchObject({ accepted: false, accounting: { providerCostUsd: "0.004365", retailChargeCents: 1 } });
      expect(recordAttempt).toHaveBeenCalledOnce();
      expect(recordUnknownAttempt).not.toHaveBeenCalled();
      expect(deps.fetchFn).toHaveBeenCalledOnce();
    }

    const invalidMetadata = [
      { serviceTier: "flex" }, { serviceTier: "priority" }, { serviceTier: "STANDARD" }, { serviceTier: null },
      { toolUsePromptTokenCount: 1, totalTokenCount: 2001 }, { toolUsePromptTokenCount: -1 },
      { totalTokenCount: 2200 }, { totalTokenCount: "2000" },
      { promptTokenCount: Number.MAX_SAFE_INTEGER, totalTokenCount: Number.MAX_SAFE_INTEGER },
    ];
    for (const supplied of invalidMetadata) {
      const deps = execution();
      const recordAttempt = vi.fn();
      const recordUnknownAttempt = vi.fn();
      deps.fetchFn.mockResolvedValueOnce(Response.json({ modelVersion: "gemini-3.8-flash", candidates: [{ finishReason: "SAFETY" }],
        usageMetadata: { ...geminiUsage, ...supplied },
      }));
      await expect.soft(executeAiTask(request(), { ...deps, provider: "google", recordAttempt, recordUnknownAttempt }), JSON.stringify(supplied))
        .rejects.toThrow(/usage requires reconciliation/);
      expect.soft(recordUnknownAttempt).toHaveBeenCalledOnce();
      expect.soft(recordAttempt).not.toHaveBeenCalled();
      expect(deps.fetchFn).toHaveBeenCalledOnce();
    }
  });
  it("settles reported usage on a documented Gemini prompt block", async () => {
    const promptFeedback = { blockReason: "SAFETY" };
    const usageMetadata = { promptTokenCount: 1000, cachedContentTokenCount: 200, totalTokenCount: 1000 };
    for (const candidatesTokenCount of [0, undefined]) {
      const deps = execution();
      const recordAttempt = vi.fn();
      const recordUnknownAttempt = vi.fn();
      deps.fetchFn.mockResolvedValueOnce(Response.json({ modelVersion: "gemini-3.8-flash", promptFeedback,
        candidates: candidatesTokenCount === undefined ? [] : undefined, usageMetadata: { ...usageMetadata, candidatesTokenCount },
      }));
      const result = await executeAiTask(request(), { ...deps, provider: "google", now: () => "2026-11-19T12:00:00Z",
        recordAttempt, recordUnknownAttempt });
      expect(result).toMatchObject({ accepted: false, value: null,
        accounting: { providerCostUsd: "0.000615", retailChargeCents: 1 } });
      expect(recordAttempt).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ attempt: 1 }), {
        accepted: false, usage: { inputTokens: 1000, outputTokens: 0, cachedInputTokens: 200 }, providerRequestId: undefined,
      });
      expect(recordUnknownAttempt).not.toHaveBeenCalled();
      expect(deps.fetchFn).toHaveBeenCalledOnce();
    }

    const invalidBlocks = [
      { candidates: [] }, { promptFeedback: { blockReason: "BLOCK_REASON_UNSPECIFIED" } },
      { promptFeedback: { blockReason: "UNDOCUMENTED" } },
      { promptFeedback, candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"summary":"ok"}' }] } }] },
      { promptFeedback, usageMetadata: { promptTokenCount: 1000 } },
      { promptFeedback, usageMetadata: { ...usageMetadata, totalTokenCount: 1001 } },
      { promptFeedback, usageMetadata: { ...usageMetadata, candidatesTokenCount: 1, totalTokenCount: 1001 } },
    ];
    for (const supplied of invalidBlocks) {
      const deps = execution();
      const recordAttempt = vi.fn();
      const recordUnknownAttempt = vi.fn();
      deps.fetchFn.mockResolvedValueOnce(Response.json({ modelVersion: "gemini-3.8-flash",
        usageMetadata: { ...usageMetadata, candidatesTokenCount: 0 }, ...supplied,
      }));
      await expect(executeAiTask(request(), { ...deps, provider: "google", recordAttempt, recordUnknownAttempt }))
        .rejects.toThrow(/usage requires reconciliation/);
      expect(recordUnknownAttempt).toHaveBeenCalledOnce();
      expect(recordAttempt).not.toHaveBeenCalled();
      expect(deps.fetchFn).toHaveBeenCalledOnce();
    }
  });
  it.each([
    ['{"summary":"SSN 123-45-6789"}', "PII"],
    ['{"summary":"ok","filingReady":true}', "extra fields"],
    ["not JSON", "malformed output"],
  ])("rejects %s and retains incurred usage (%s)", async (output) => {
    const deps = execution(envelope(output));
    const result = await executeAiTask(request(), deps);
    expect(result).toMatchObject({ accepted: false, value: null, accounting: { usage: { outputTokens: 2000 } } });
    expect(deps.fetchFn).toHaveBeenCalledTimes(1);
  });
  it("retains costs for truncated reasoning output", async () => {
    const result = await executeAiTask(request(), execution(envelope("", { status: "incomplete" })));
    expect(result).toMatchObject({ accepted: false, accounting: { providerCostUsd: "0.0010064" } });
  });
  it("does not accept a schema-valid answer that fails grounding", async () => {
    const result = await executeAiTask(request({ validateGrounding: () => { throw new Error("invented audit value"); } }), execution());
    expect(result?.accepted).toBe(false);
  });
  it("blocks PII and oversized input before network access", async () => {
    const deps = execution();
    await expect(executeAiTask(request({ redactedText: "SSN 123-45-6789" }), deps)).rejects.toThrow(/identifiers/);
    await expect(executeAiTask(request({ redactedText: "x".repeat(24000) }), deps)).rejects.toThrow(/token budget/);
    expect(deps.fetchFn).not.toHaveBeenCalled();
  });
  it("requires matching year-specific sources for Sol tax explanations", async () => {
    const deps = execution(envelope(undefined, { model: "gpt-6.1-sol" }));
    await expect(executeAiTask(request({ task: "tax-explanation" }), deps)).rejects.toThrow(/year-specific/);
    const taxContext = { taxYear: 2025, ruleVersion: "2025.3", excerpts: [{ id: "spec:a", taxYear: 2025, text: "A supplied spec." }],
      auditEntries: [{ id: "audit:1", taxYear: 2025, value: "2200", explanation: "Verified engine result." }] };
    await executeAiTask(request({ task: "tax-explanation", taxContext }), deps);
    expect(JSON.parse(deps.fetchFn.mock.calls[0][1].body)).toMatchObject({ model: "gpt-6.1-sol", reasoning: { effort: "low" } });
    await expect(executeAiTask(request({ task: "tax-explanation", taxContext: { ...taxContext, taxYear: 2026 } }), deps)).rejects.toThrow(/conflicting years/);
  });
  it("never switches providers or retries on failure", async () => {
    const deps = execution();
    deps.fetchFn.mockResolvedValue(new Response("secret provider error", { status: 429 }));
    await expect(executeAiTask(request(), deps)).rejects.toThrow("AI provider request failed; usage requires reconciliation.");
    expect(deps.fetchFn).toHaveBeenCalledTimes(1);
  });
  it("bounds streamed response size", async () => {
    const deps = execution();
    deps.fetchFn.mockResolvedValue(new Response("x".repeat(1024 * 1024 + 1)));
    await expect(executeAiTask(request(), deps)).rejects.toThrow(/usage requires reconciliation/);
  });
  it("honors cancellation before sending data", async () => {
    const deps = execution();
    const controller = new AbortController();
    controller.abort();
    await expect(executeAiTask(request({ signal: controller.signal }), deps)).rejects.toThrow();
    expect(deps.fetchFn).not.toHaveBeenCalled();
  });
  it("records an undispatched cancellation after reservation without invoking transport", async () => {
    const deps = execution();
    const controller = new AbortController();
    const recordUndispatchedAttempt = vi.fn();
    const recordUnknownAttempt = vi.fn();
    await expect(executeAiTask(request({ signal: controller.signal }), { ...deps, recordUndispatchedAttempt,
      recordUnknownAttempt, beforeAttempt: async () => controller.abort(),
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(deps.fetchFn).not.toHaveBeenCalled();
    expect(recordUndispatchedAttempt).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ attempt: 1 }));
    expect(recordUnknownAttempt).not.toHaveBeenCalled();
  });
  it("propagates cancellation during an escalation refusal without writing an undispatched attempt", async () => {
    const controller = new AbortController();
    const deps = execution();
    const recordUndispatchedAttempt = vi.fn();
    const recordUnknownAttempt = vi.fn();
    await expect(executeAiTask(request({ task: "document-classification", signal: controller.signal }), {
      ...deps, escalationCount: 1, recordUndispatchedAttempt, recordUnknownAttempt,
      beforeAttempt: async () => {
        controller.abort();
        return "use-fallback";
      },
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(deps.fetchFn).not.toHaveBeenCalled();
    expect(recordUndispatchedAttempt).not.toHaveBeenCalled();
    expect(recordUnknownAttempt).not.toHaveBeenCalled();
  });
  it("keeps cancellation after transport invocation on the unknown-usage path", async () => {
    const deps = execution();
    const controller = new AbortController();
    const recordUndispatchedAttempt = vi.fn();
    const recordUnknownAttempt = vi.fn();
    deps.fetchFn.mockImplementationOnce(async () => {
      controller.abort();
      controller.signal.throwIfAborted();
    });
    await expect(executeAiTask(request({ signal: controller.signal }), { ...deps, recordUndispatchedAttempt,
      recordUnknownAttempt,
    })).rejects.toThrow(/usage requires reconciliation/u);
    expect(deps.fetchFn).toHaveBeenCalledOnce();
    expect(recordUnknownAttempt).toHaveBeenCalledOnce();
    expect(recordUndispatchedAttempt).not.toHaveBeenCalled();
  });
  it("reserves before dispatch and settles provider usage even when grounding fails", async () => {
    const order: string[] = [];
    const deps = execution();
    const fetchFn = vi.fn(async () => { order.push("dispatch"); return Response.json(envelope()); });
    const result = await executeAiTask(request({ validateGrounding: () => { throw new Error("bad citation"); } }), { ...deps, fetchFn,
      beforeAttempt: async metadata => { order.push("reserve"); expect(metadata).toMatchObject({ profileId: "luna-high", attempt: 1, maximumChargeCents: 1 }); },
      recordAttempt: async (_metadata, outcome) => { order.push("settle"); expect(outcome).toMatchObject({ accepted: false, usage: { inputTokens: 100, outputTokens: 2000 } }); },
    });
    expect(result?.accepted).toBe(false);
    expect(order).toEqual(["reserve", "dispatch", "settle"]);
  });
  it("reserves the highest priced Sol usage before dispatch", async () => {
    const taxContext = { taxYear: 2026, ruleVersion: "synthetic", excerpts: [{ id: "s", taxYear: 2026, text: "Synthetic excerpt" }], auditEntries: [{ id: "a", taxYear: 2026, value: "0", explanation: "Synthetic audit" }] };
    const beforeAttempt = vi.fn();
    const result = await executeAiTask(request({ task: "tax-explanation", taxContext }), { ...execution(envelope(undefined, { model: "gpt-6.1-sol" })), beforeAttempt });
    expect(beforeAttempt).toHaveBeenCalledWith(expect.objectContaining({ modelId: "gpt-6.1-sol", maximumChargeCents: 23 }));
    expect(result?.accounting).toMatchObject({ providerCostUsd: "0.020124", retailChargeCents: 3 });
  });
  it("does not dispatch when reservation fails, and does not return success when settlement fails", async () => {
    const deps = execution();
    await expect(executeAiTask(request(), { ...deps, beforeAttempt: async () => { throw new Error("credit exhausted"); } })).rejects.toThrow(/credit exhausted/);
    expect(deps.fetchFn).not.toHaveBeenCalled();
    await expect(executeAiTask(request(), { ...deps, recordAttempt: async () => { throw new Error("database unavailable"); } })).rejects.toThrow(/database unavailable/);
  });
  it("records unknown usage after failed transport without exposing provider details", async () => {
    const deps = execution(); const recordUnknownAttempt = vi.fn();
    deps.fetchFn.mockRejectedValue(new Error("provider echoed SSN 123-45-6789 and secret-key"));
    await expect(executeAiTask(request(), { ...deps, recordUnknownAttempt })).rejects.toThrow("AI provider request failed; usage requires reconciliation.");
    expect(recordUnknownAttempt).toHaveBeenCalledOnce();
  });
  it("uses only a safe provider identifier without losing known usage", async () => {
    const deps = execution();
    const recordAttempt = vi.fn();
    const runs = [
      { header: "req_ab123cd", id: "resp_e456fg", expected: "req_ab123cd" },
      { header: "synthetic-person@example.com", id: "resp_e456fg", expected: "resp_e456fg" },
      { header: `req_${"a".repeat(200)}`, id: "resp_123-45-6789", expected: undefined },
      { header: "req_x123456789z", id: { raw: "synthetic-person@example.com" }, expected: undefined },
    ];
    for (const { header, id, expected } of runs) {
      deps.fetchFn.mockResolvedValueOnce(Response.json(envelope(undefined, { id }), { headers: { "x-request-id": header } }));
      const result = await executeAiTask(request(), { ...deps, recordAttempt });
      expect(result?.accounting.providerCostUsd).toBe("0.0010064");
      expect(recordAttempt).toHaveBeenLastCalledWith(expect.anything(), {
        accepted: true, usage: { inputTokens: 100, outputTokens: 2000, cachedInputTokens: 40 }, providerRequestId: expected,
      });
    }
  });
  it("holds unknown usage without retaining arbitrary error response headers", async () => {
    const deps = execution();
    const recordUnknownAttempt = vi.fn();
    for (const [header, expected] of [["req_good", "req_good"], ["Bearer synthetic-secret", undefined]] as const) {
      deps.fetchFn.mockResolvedValueOnce(new Response(null, { status: 503, headers: { "x-request-id": header } }));
      await expect(executeAiTask(request(), { ...deps, recordUnknownAttempt })).rejects.toThrow(/usage requires reconciliation/);
      expect(recordUnknownAttempt).toHaveBeenLastCalledWith(expect.anything(), { providerRequestId: expected });
    }
  });
  it("reconciles reported OpenAI totals before settling usage", async () => {
    const base = envelope();
    const id = "resp_fixtureTotal";
    for (const reported of [{}, { total_tokens: 2100, output_tokens_details: {} },
      { output_tokens_details: { reasoning_tokens: 0 } },
      { total_tokens: 2100, output_tokens_details: { reasoning_tokens: 1900 } }]) {
      const deps = execution(envelope(undefined, { id, usage: { ...base.usage, ...reported } }));
      const recordAttempt = vi.fn();
      const recordUnknownAttempt = vi.fn();
      await expect(executeAiTask(request(), { ...deps, recordAttempt, recordUnknownAttempt })).resolves.toMatchObject({
        accepted: true, accounting: { providerCostUsd: "0.0010064", retailChargeCents: 1 },
      });
      expect(recordAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
        accepted: true, providerRequestId: id, usage: { inputTokens: 100, outputTokens: 2000, cachedInputTokens: 40 },
      });
      expect(recordUnknownAttempt).not.toHaveBeenCalled();
      expect(deps.fetchFn).toHaveBeenCalledOnce();
    }

    const invalidUsage = [
      ...[2099, "2100", null, -1, 2100.5, Number.MAX_SAFE_INTEGER + 1].map(total => ({ ...base.usage, total_tokens: total })),
      { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1, total_tokens: Number.MAX_SAFE_INTEGER },
      ...[2001, "1", null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1].map(reasoning => ({
        ...base.usage, total_tokens: 2100, output_tokens_details: { reasoning_tokens: reasoning },
      })),
      { ...base.usage, output_tokens_details: null },
    ];
    for (const usage of invalidUsage) {
      const deps = execution(envelope(undefined, { id, usage }));
      const beforeAttempt = vi.fn();
      const recordAttempt = vi.fn();
      const recordUnknownAttempt = vi.fn();
      await expect(executeAiTask(request(), { ...deps, beforeAttempt, recordAttempt, recordUnknownAttempt })).rejects.toThrow(/usage requires reconciliation/);
      expect(beforeAttempt).toHaveBeenCalledOnce();
      expect(deps.fetchFn).toHaveBeenCalledOnce();
      expect(recordAttempt).not.toHaveBeenCalled();
      expect(recordUnknownAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(), { providerRequestId: id });
    }
  });
  it("holds completed provider text with provably zero visible output tokens", async () => {
    const id = "resp_fixtureVisibleTokens";
    const cases = [
      ["openai", envelope(undefined, { id, usage: { input_tokens: 100, output_tokens: 0, total_tokens: 100 } }), id],
      ["openai", envelope(undefined, { id, usage: { input_tokens: 100, output_tokens: 3,
        output_tokens_details: { reasoning_tokens: 3 } } }), id],
      ["google", { modelVersion: "gemini-3.8-flash", candidates: [{ finishReason: "STOP",
        content: { parts: [{ text: '{"summary":"Confirm the W-2."}' }] } }], usageMetadata: {
        promptTokenCount: 100, candidatesTokenCount: 0, thoughtsTokenCount: 3, totalTokenCount: 103,
      } }, undefined],
    ] as const;
    for (const [provider, payload, providerRequestId] of cases) {
      const deps = execution();
      deps.fetchFn.mockResolvedValueOnce(Response.json(payload));
      const recordAttempt = vi.fn();
      const recordUnknownAttempt = vi.fn();
      await expect.soft(executeAiTask(request(), { ...deps, provider, recordAttempt, recordUnknownAttempt }))
        .rejects.toThrow(/^AI provider request failed; usage requires reconciliation\.$/);
      expect.soft(recordAttempt).not.toHaveBeenCalled();
      expect.soft(recordUnknownAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(), { providerRequestId });
      expect(deps.fetchFn).toHaveBeenCalledOnce();
    }
  });
  it("preserves consistent usage when reported visible output is permitted", async () => {
    const cases = [
      ["openai", envelope(undefined, { usage: { input_tokens: 100, output_tokens: 3 } }), true, 3],
      ["openai", envelope(undefined, { usage: { input_tokens: 100, output_tokens: 3,
        output_tokens_details: { reasoning_tokens: 2 } } }), true, 3],
      ["openai", envelope(undefined, { output: [{ type: "message", content: [{ type: "refusal" }] }],
        usage: { input_tokens: 100, output_tokens: 0, output_tokens_details: { reasoning_tokens: 0 } } }), false, 0],
      ["openai", envelope(" ", { usage: { input_tokens: 100, output_tokens: 3,
        output_tokens_details: { reasoning_tokens: 3 } } }), false, 3],
      ["google", { modelVersion: "gemini-3.8-flash", candidates: [{ finishReason: "STOP",
        content: { parts: [{ thought: true, text: "Synthetic thought" }, { text: " " }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 0, thoughtsTokenCount: 3 } }, false, 3],
      ["google", { modelVersion: "gemini-3.8-flash", candidates: [{ finishReason: "STOP",
        content: { parts: [{ text: '{"summary":"Confirm the W-2."}' }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 1, thoughtsTokenCount: 3 } }, true, 4],
    ] as const;
    for (const [provider, payload, accepted, outputTokens] of cases) {
      const deps = execution();
      deps.fetchFn.mockResolvedValueOnce(Response.json(payload));
      const recordAttempt = vi.fn();
      const recordUnknownAttempt = vi.fn();
      await expect(executeAiTask(request(), { ...deps, provider, recordAttempt, recordUnknownAttempt }))
        .resolves.toMatchObject({ accepted, accounting: { usage: { outputTokens } } });
      expect(recordAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({
        accepted, usage: expect.objectContaining({ outputTokens }),
      }));
      expect(recordUnknownAttempt).not.toHaveBeenCalled();
    }
  });
  it("uses official cache-write detail fields and counts both lifetimes exactly once", async () => {
    const deps = execution(envelope(undefined, { usage: { input_tokens: 12000, output_tokens: 100,
      input_tokens_details: { cached_tokens: 4000, cache_write_tokens: 7000, cache_write_tokens_details: { ttl_30m_tokens: 3000, ttl_12h_tokens: 4000 } } } }));
    expect((await executeAiTask(request(), deps))?.accounting.providerCostUsd).toBe("0.001565");
  });
  it("holds OpenAI usage for an unpriced reported service tier", async () => {
    const id = "resp_fixtureTier";
    for (const serviceTier of [undefined, "default"]) {
      const deps = execution(envelope(undefined, { id, service_tier: serviceTier }));
      const recordAttempt = vi.fn();
      const recordUnknownAttempt = vi.fn();
      await expect(executeAiTask(request(), { ...deps, recordAttempt, recordUnknownAttempt })).resolves.toMatchObject({
        accepted: true, accounting: { providerCostUsd: "0.0010064", retailChargeCents: 1 },
      });
      expect(recordAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
        accepted: true, providerRequestId: id, usage: { inputTokens: 100, outputTokens: 2000, cachedInputTokens: 40 },
      });
      expect(recordUnknownAttempt).not.toHaveBeenCalled();
      expect(deps.fetchFn).toHaveBeenCalledOnce();
    }

    const deps = execution(envelope(undefined, { id, service_tier: "" }));
    const recordAttempt = vi.fn();
    const recordUnknownAttempt = vi.fn();
    const validateGrounding = vi.fn();
    await expect(executeAiTask(request({ validateGrounding }), { ...deps, recordAttempt, recordUnknownAttempt })).rejects.toThrow(/usage requires reconciliation/);
    expect(validateGrounding).not.toHaveBeenCalled();
    expect(recordAttempt).not.toHaveBeenCalled();
    expect(recordUnknownAttempt).toHaveBeenCalledExactlyOnceWith(expect.anything(), { providerRequestId: id });
    expect(deps.fetchFn).toHaveBeenCalledOnce();
  });
  it.each([
    { service_tier: "priority" },
    { usage: { input_tokens: 100, output_tokens: 2, input_tokens_details: { cache_write_tokens: 50 } } },
    { usage: { input_tokens: 100, output_tokens: 2, input_tokens_details: { cached_tokens: 101 } } },
  ])("retains unpriced or inconsistent reported usage for reconciliation: %j", async details => {
    const recordUnknownAttempt = vi.fn();
    await expect(executeAiTask(request(), { ...execution(envelope(undefined, details)), recordUnknownAttempt })).rejects.toThrow(/reconciliation/);
    expect(recordUnknownAttempt).toHaveBeenCalledOnce();
  });
  it("prices at dispatch time across the January boundary and requires cancellation for complex tasks", async () => {
    const taxContext = { taxYear: 2026, ruleVersion: "synthetic", excerpts: [{ id: "s", taxYear: 2026, text: "Synthetic excerpt" }], auditEntries: [{ id: "a", taxYear: 2026, value: "0", explanation: "Synthetic audit" }] };
    const deps = execution(envelope(undefined, { model: "gpt-6.1-sol" }));
    await expect(executeAiTask(request({ task: "complex-reconciliation", taxContext }), { ...deps, escalationCount: 1 })).rejects.toThrow(/cancellable/);
    const result = await executeAiTask(request({ task: "complex-reconciliation", taxContext, signal: new AbortController().signal }), { ...deps, escalationCount: 1 });
    expect(result?.accounting.profileId).toBe("sol-high");
    expect(JSON.parse(deps.fetchFn.mock.calls[0][1].body)).toMatchObject({ max_output_tokens: 16384, reasoning: { effort: "high" } });
  });
});
