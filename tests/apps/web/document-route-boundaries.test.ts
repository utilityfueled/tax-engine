import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), expense: vi.fn(), income: vi.fn(), rate: vi.fn(), actor: vi.fn(), pdf: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../apps/web/src/lib/hosted-ai-route", () => ({ reserveHostedAiBudget: mocks.guard }));
vi.mock("../../../apps/web/src/lib/gemini-document-analysis-server", () => ({ analyzeBusinessExpenseStatementWithGemini: mocks.expense, analyzeSelfEmploymentIncomeDocumentWithGemini: mocks.income }));
vi.mock("../../../apps/web/src/lib/hosted-auth", () => ({ resolveHostedWorkspaceActor: mocks.actor }));
vi.mock("../../../apps/web/src/lib/workspace-filled-return", () => ({ buildWorkspaceFilledReturnDownload: mocks.pdf }));
vi.mock("../../../apps/web/src/lib/rate-limit", async original => ({ ...await original<typeof import("../../../apps/web/src/lib/rate-limit")>(), checkRateLimitForEnvironment: mocks.rate }));
import { POST as expense } from "../../../apps/web/src/app/api/business-expense-analysis/route";
import { POST as income } from "../../../apps/web/src/app/api/self-employment-income-analysis/route";
import { POST as pdf } from "../../../apps/web/src/app/api/workspace/filled-return/route";

const document = { fileName: "upload-12345678-1234-4321-8123-123456789abc.pdf", redactedText: "2025-03-01 Office supplies 45.00" };
const privateError = new Error("postgresql://private:secret@database/private; customer SSN 111-22-3333");
function request(body: unknown, signal?: AbortSignal) { return new Request("https://tax.example/api/test", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "192.0.2.20" }, body: JSON.stringify(body), signal }); }
const workspace = { id: "synthetic", documents: [], returnSummary: {}, seededReturn: {}, structuredFacts: [], storageMode: "hosted" };

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("TAX_ENGINE_DEPLOYMENT_MODE", "self-host");
  mocks.guard.mockResolvedValue({ response: null, reservation: null });
  mocks.rate.mockResolvedValue({ allowed: true, retryAfterMs: null, remaining: 10 });
  mocks.actor.mockResolvedValue({ id: "synthetic-owner" });
  mocks.expense.mockResolvedValue({ fileName: document.fileName, suggestions: [] });
  mocks.income.mockResolvedValue({ fileName: document.fileName, amount: "0" });
  mocks.pdf.mockResolvedValue({ contents: new Uint8Array([1]), fileName: "synthetic-review.pdf", includedForms: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe.each([{ name: "expense", post: expense, analyze: mocks.expense }, { name: "income", post: income, analyze: mocks.income }])("$name document API boundaries", ({ post, analyze }) => {
  it.each([null, [], {}, { documents: [] }, { documents: [document, {}] }, { documents: [document, document] }, { documents: [{ ...document, ssn: "111-22-3333" }] }, { documents: [{ ...document, fileName: "Jordan-111-22-3333.pdf" }] }])("rejects malformed or identifying batch %j before analysis", async body => {
    const response = await post(request(body)); expect(response.status).toBe(400);
    expect(analyze).not.toHaveBeenCalled(); expect(mocks.guard).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("bounds document count and text without silently dropping source data", async () => {
    const documents = Array.from({ length: 11 }, (_, index) => ({ ...document, fileName: `upload-12345678-1234-4321-8123-${String(index).padStart(12, "0")}.pdf` }));
    expect((await post(request({ documents }))).status).toBe(413);
    expect((await post(request({ documents: [{ ...document, redactedText: "x".repeat(100001) }] }))).status).toBe(413);
    expect(analyze).not.toHaveBeenCalled();
  });
  it("blocks remaining direct identifiers", async () => {
    const response = await post(request({ documents: [{ ...document, redactedText: "SSN: 111-22-3333" }] }));
    expect(response.status).toBe(400); expect(mocks.guard).not.toHaveBeenCalled();
  });
  it.each(["guard", "analysis", "limiter"])("contains %s failures without private error text", async source => {
    if (source === "guard") mocks.guard.mockRejectedValue(privateError);
    if (source === "analysis") analyze.mockRejectedValue(privateError);
    if (source === "limiter") mocks.rate.mockRejectedValue(privateError);
    const response = await post(request({ documents: [document] }));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("fails closed on shared limiter outage and reports actual quota rejection separately", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, unavailable: true });
    expect((await post(request({ documents: [document] }))).status).toBe(503);
    mocks.rate.mockResolvedValue({ allowed: false, retryAfterMs: 2501 });
    const response = await post(request({ documents: [document] }));
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("3");
    expect(analyze).not.toHaveBeenCalled();
  });
  it("preserves hosted denial and never bills deterministic analysis", async () => {
    mocks.guard.mockResolvedValue({ response: Response.json({ error: "Authentication required" }, { status: 401 }), reservation: null });
    const response = await post(request({ documents: [document] }));
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.guard.mock.lastCall?.[2]).toBeNull(); expect(analyze).not.toHaveBeenCalled();
  });
  it("returns deterministic no-store output without promoting candidates", async () => {
    const response = await post(request({ documents: [document] }));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ mode: "deterministic", aiStatus: "qualification-pending" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("returns no invented facts when deterministic parsing cannot answer", async () => {
    analyze.mockResolvedValue(null);
    const response = await post(request({ documents: [document] }));
    expect(await response.json()).toMatchObject({ analyses: [], mode: "deterministic" });
  });
  it("rejects invalid JSON and the wrong media type before authorization", async () => {
    for (const [body, type, status] of [["{", "application/json", 400], ["{}", "text/plain", 415]] as const) {
      const response = await post(new Request("https://tax.example/api/test", { method: "POST", headers: { "content-type": type }, body }));
      expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(mocks.guard).not.toHaveBeenCalled(); expect(analyze).not.toHaveBeenCalled();
  });
  it("does not start cancelled work or publish late analysis results", async () => {
    const cancelled = new AbortController(); cancelled.abort();
    expect((await post(request({ documents: [document] }, cancelled.signal))).status).toBe(499);
    expect(analyze).not.toHaveBeenCalled();
    const controller = new AbortController();
    analyze.mockImplementation(async () => { controller.abort(); return { privateLateResult: true }; });
    const response = await post(request({ documents: [document] }, controller.signal));
    expect(response.status).toBe(499); expect(await response.text()).not.toContain("privateLateResult");
  });
});

describe("review PDF route boundaries", () => {
  it("contains render errors without returning source facts or server paths", async () => {
    mocks.pdf.mockRejectedValue(privateError);
    const response = await pdf(request({ workspace }));
    expect(response.status).toBe(400); expect(await response.text()).not.toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("contains authentication outages and does not render", async () => {
    vi.stubEnv("TAX_ENGINE_DEPLOYMENT_MODE", "hosted");
    mocks.actor.mockRejectedValue(privateError);
    const response = await pdf(request({ workspace }));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("rejects rate-limit outages and cancelled requests before rendering", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, unavailable: true });
    expect((await pdf(request({ workspace }))).status).toBe(503);
    const controller = new AbortController(); controller.abort();
    expect((await pdf(request({ workspace }, controller.signal))).status).toBe(499);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
});
