import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeAiTask, type AiTaskExecution, type AiTaskRequest } from "../../../apps/web/src/lib/ai-task-adapter";
vi.mock("server-only", () => ({}));

const schema = z.object({ summary: z.string().max(300) }).strict();
function request(overrides: Partial<AiTaskRequest<z.infer<typeof schema>>> = {}) {
  return { task: "workspace-summary" as const, redactedText: "One W-2 requires confirmation.",
    instructions: "Describe the next step.", schema, validateGrounding: vi.fn(), ...overrides };
}
function envelope(output = '{"summary":"Confirm the W-2."}', overrides = {}) {
  return { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: output }] }],
    usage: { input_tokens: 100, output_tokens: 2000, input_tokens_details: { cached_tokens: 40 } }, ...overrides };
}
function execution(payload = envelope()): AiTaskExecution & { fetchFn: ReturnType<typeof vi.fn> } {
  return { mode: "evaluation", syntheticFixtureId: "synthetic-w2-1", apiKey: "fixture-key",
    now: () => "2027-01-15T12:00:00Z", fetchFn: vi.fn().mockResolvedValue(Response.json(payload)) };
}

describe("task-based candidate AI adapter", () => {
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
    deps.fetchFn.mockResolvedValue(Response.json({
      candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "private reasoning" }, { text: '{"summary":"Review W-2."}' }] } }],
      usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 200, candidatesTokenCount: 100, thoughtsTokenCount: 900 },
    }));
    const result = await executeAiTask(request(), { ...deps, provider: "google" });
    expect(result).toMatchObject({ accepted: true, accounting: { providerCostUsd: "0.00873", pricingEffectiveFrom: "2027-01-01",
      usage: { outputTokens: 1000 } } });
    const [url, options] = deps.fetchFn.mock.calls[0];
    expect(url).toContain("gemini-3.8-flash:generateContent");
    expect(url).not.toContain("fixture-key");
    expect(JSON.parse(options.body).generationConfig).toMatchObject({ thinkingConfig: { thinkingLevel: "HIGH" }, maxOutputTokens: 4096 });
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
    const deps = execution();
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
  it("uses official cache-write detail fields and counts both lifetimes exactly once", async () => {
    const deps = execution(envelope(undefined, { usage: { input_tokens: 12000, output_tokens: 100,
      input_tokens_details: { cached_tokens: 4000, cache_write_tokens: 7000, cache_write_tokens_details: { ttl_30m_tokens: 3000, ttl_12h_tokens: 4000 } } } }));
    expect((await executeAiTask(request(), deps))?.accounting.providerCostUsd).toBe("0.001565");
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
    const deps = execution();
    await expect(executeAiTask(request({ task: "complex-reconciliation", taxContext }), { ...deps, escalationCount: 1 })).rejects.toThrow(/cancellable/);
    const result = await executeAiTask(request({ task: "complex-reconciliation", taxContext, signal: new AbortController().signal }), { ...deps, escalationCount: 1 });
    expect(result?.accounting.profileId).toBe("sol-high");
    expect(JSON.parse(deps.fetchFn.mock.calls[0][1].body)).toMatchObject({ max_output_tokens: 16384, reasoning: { effort: "high" } });
  });
});
