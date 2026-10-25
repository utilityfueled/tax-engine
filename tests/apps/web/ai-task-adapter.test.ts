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
    await expect(executeAiTask(request(), deps)).rejects.toThrow("AI provider returned HTTP 429.");
    expect(deps.fetchFn).toHaveBeenCalledTimes(1);
  });
  it("bounds streamed response size", async () => {
    const deps = execution();
    deps.fetchFn.mockResolvedValue(new Response("x".repeat(1024 * 1024 + 1)));
    await expect(executeAiTask(request(), deps)).rejects.toThrow(/size limit/);
  });
  it("honors cancellation before sending data", async () => {
    const deps = execution();
    const controller = new AbortController();
    controller.abort();
    await expect(executeAiTask(request({ signal: controller.signal }), deps)).rejects.toThrow();
    expect(deps.fetchFn).not.toHaveBeenCalled();
  });
});
