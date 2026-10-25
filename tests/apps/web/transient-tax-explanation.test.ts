import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTaxExplanationRouteHandlers } from "@/lib/transient-tax-explanation-route";
import { createProviderWorkspaceRouteHandlers } from "@/lib/provider-workspace-route";
import { buildProviderWorkspaceRequest } from "@/lib/provider-workspace-request";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { simpleW2Fixture } from "../../fixtures/simple-w2";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rate: vi.fn() }));
vi.mock("@/lib/rate-limit", async original => ({ ...await original<typeof import("@/lib/rate-limit")>(), checkRateLimitForEnvironment: mocks.rate }));
const owner = { id: "actual-authenticated-owner", label: "Synthetic", email: "fixture@example.test" };
function envelope() {
  const workspace = createWorkspaceRecord("synthetic-ai-grounding");
  workspace.returnSummary.targetTaxYear = 2025;
  const providerRequest = buildProviderWorkspaceRequest(workspace, { task: "workspace-help", question: "Explain Jane Doe's adjusted gross income.", now: "2026-10-25T12:00:00Z" });
  return { version: 1, confirmed: true, workspaceId: workspace.id, workspaceRevision: workspace.updatedAt,
    taxYear: 2025, taxInput: structuredClone(simpleW2Fixture), providerRequest };
}
function request(value: unknown = envelope(), headers: Record<string,string> = {}, signal?: AbortSignal) {
  return new Request("https://tax.example/api/workspace/tax-explanation", { method: "POST", headers: { "content-type": "application/json", origin: "https://tax.example", ...headers }, body: JSON.stringify(value), signal });
}
function setup(hosted = false) {
  const fetchFn = vi.fn().mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ answer: "Adjusted gross income is $85,000.", sourceIds: ["spec:2025:1040:11", "audit:2025:1040:11"], engineValues: [{ id: "audit:2025:1040:11", value: "85000" }] }) }] }], usage: { input_tokens: 100, output_tokens: 100 } }));
  const resolveActor = vi.fn().mockResolvedValue(owner);
  const getEntitlementByOwnerId = vi.fn().mockResolvedValue({ subscription: { planId: "starter" }, entitlement: { workspaceAccess: true } });
  const beforeAttempt = vi.fn(), recordAttempt = vi.fn();
  const accounting = vi.fn().mockReturnValue({ beforeAttempt, recordAttempt });
  const dependencies = { env: { TAX_ENGINE_DEPLOYMENT_MODE: hosted ? "hosted" : "self-host" }, rateLimitStore: new Map(), resolveActor, getEntitlementByOwnerId, accounting,
    getBudgetSnapshot: vi.fn().mockResolvedValue({ totalRemainingCents: 999 }), fetchFn,
    execution: { mode: "evaluation" as const, syntheticFixtureId: "transient-grounding", apiKey: "synthetic-no-live-key", now: () => "2026-10-25T12:00:00Z" } };
  return { dependencies, fetchFn, resolveActor, getEntitlementByOwnerId, accounting, beforeAttempt, recordAttempt, handler: createTaxExplanationRouteHandlers(dependencies) };
}
beforeEach(() => { vi.clearAllMocks(); mocks.rate.mockResolvedValue({ allowed: true }); });

describe("private transient AI calculation contract", () => {
  it("recomputes actual facts and sends only source excerpts, audited values and redacted text", async () => {
    const s = setup(true), response = await s.handler.POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ provider: "openai-responses", answer: "Adjusted gross income is $85,000." });
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(s.fetchFn).toHaveBeenCalledOnce(); expect(s.beforeAttempt).toHaveBeenCalledOnce(); expect(s.recordAttempt).toHaveBeenCalledOnce();
    const providerText = JSON.stringify(s.fetchFn.mock.calls), ledgerText = JSON.stringify(s.accounting.mock.calls);
    for (const secret of ["Jane Doe", "123-45-6789", "1990-01-15", "123 Main St", "Tech Corp", "taxInput"]) {
      expect(providerText).not.toContain(secret); expect(ledgerText).not.toContain(secret);
    }
    expect(providerText).toContain("audit:2025:1040:11"); expect(providerText).toContain("85000");
    expect(s.accounting.mock.calls[0][0]).toMatchObject({ ownerId: owner.id, requestPayload: { calculationDigest: expect.stringMatching(/^[a-f0-9]{64}$/) } });
  });
  it.each(["confirmed", "year", "workspace", "revision", "unknown", "input", "forged-context"])("rejects %s before provider or accounting", async kind => {
    const s = setup(true), value: Record<string,unknown> = envelope();
    if (kind === "confirmed") value.confirmed = false;
    if (kind === "year") value.taxYear = 2026;
    if (kind === "workspace") value.workspaceId = "another";
    if (kind === "revision") value.workspaceRevision = "stale";
    if (kind === "unknown") value.version = 2;
    if (kind === "input") value.taxInput = {};
    if (kind === "forged-context") value.audit = { value: "999999" };
    const response = await s.handler.POST(request(value));
    expect(response.status).toBe(400); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("123-45-6789");
    expect(s.fetchFn).not.toHaveBeenCalled(); expect(s.accounting).not.toHaveBeenCalled();
  });
  it("does not substitute 2025 for the incomplete 2026 pack", async () => {
    const s = setup(), value = envelope(); value.taxYear = value.taxInput.taxpayer.taxYear = value.providerRequest.workspace.returnSummary.targetTaxYear = 2026;
    expect((await s.handler.POST(request(value))).status).toBe(400); expect(s.fetchFn).not.toHaveBeenCalled();
  });
  it.each(["unauthenticated", "unsubscribed", "cross-origin", "shared-outage", "aborted"])("blocks %s before provider execution", async kind => {
    const s = setup(true), controller = new AbortController();
    if (kind === "unauthenticated") s.resolveActor.mockResolvedValue(null);
    if (kind === "unsubscribed") s.getEntitlementByOwnerId.mockResolvedValue({ entitlement: { workspaceAccess: false } });
    if (kind === "shared-outage") mocks.rate.mockResolvedValue({ allowed: false, unavailable: true });
    if (kind === "aborted") controller.abort();
    const response = await s.handler.POST(request(envelope(), kind === "cross-origin" ? { origin: "https://attacker.example" } : {}, controller.signal));
    expect(response.status).toBe({ unauthenticated: 401, unsubscribed: 403, "cross-origin": 403, "shared-outage": 503, aborted: 499 }[kind]);
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(s.fetchFn).not.toHaveBeenCalled(); expect(s.accounting).not.toHaveBeenCalled();
  });
  it.each([
    { label: "Next loopback normalization", origin: "http://127.0.0.1:3120", host: "127.0.0.1:3120", allowed: true },
    { label: "another loopback port", origin: "http://127.0.0.1:3121", host: "127.0.0.1:3121", allowed: false },
    { label: "another protocol", origin: "https://127.0.0.1:3120", host: "127.0.0.1:3120", allowed: false },
    { label: "spoofed forwarded host", origin: "http://127.0.0.1:3120", host: "localhost:3120", allowed: false },
    { label: "nonloopback Host", origin: "http://attacker.example:3120", host: "attacker.example:3120", allowed: false },
    { label: "matching origin with cross-site metadata", origin: "http://localhost:3120", host: "localhost:3120", site: "cross-site", allowed: false },
  ])("checks the actual self-host origin: $label", async ({ origin, host, site, allowed }) => {
    const s = setup();
    const local = new Request("http://localhost:3120/api/workspace/tax-explanation", {
      method: "POST", body: JSON.stringify(envelope()),
      headers: { "content-type": "application/json", origin, host,
        "x-forwarded-host": new URL(origin).host, "sec-fetch-site": site ?? "same-origin" },
    });
    const response = await s.handler.POST(local);
    expect(response.status).toBe(allowed ? 200 : 403);
    expect(s.fetchFn).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });
  it.each([
    { label: "configured proxy origin", configured: "https://tax.example", origin: "https://tax.example", allowed: true },
    { label: "internal origin instead of configured public origin", configured: "https://tax.example", origin: "http://localhost:3000", allowed: false },
    { label: "configured host suffix attack", configured: "https://tax.example", origin: "https://tax.example.attacker.example", allowed: false },
    { label: "invalid configured protocol", configured: "ftp://tax.example", origin: "http://localhost:3000", allowed: false },
    { label: "credentials in configured URL", configured: "https://user:secret@tax.example", origin: "https://tax.example", allowed: false },
    { label: "missing hosted production origin", configured: undefined, origin: "http://localhost:3000", allowed: false },
    { label: "originless request without hosted configuration", configured: undefined, origin: undefined, allowed: false },
    { label: "originless request with invalid hosted configuration", configured: "ftp://tax.example", origin: undefined, allowed: false },
    { label: "originless request with valid hosted configuration", configured: "https://tax.example", origin: undefined, allowed: true },
  ])("uses the authoritative hosted origin: $label", async ({ configured, origin, allowed }) => {
    const s = setup(true);
    const handler = createTaxExplanationRouteHandlers({ ...s.dependencies,
      env: { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production", TAX_ENGINE_APP_URL: configured } });
    const proxied = new Request("http://localhost:3000/api/workspace/tax-explanation", {
      method: "POST", body: JSON.stringify(envelope()),
      headers: { "content-type": "application/json", ...(origin ? { origin } : {}), host: "attacker.example", "x-forwarded-host": "attacker.example" },
    });
    const response = await handler.POST(proxied);
    expect(response.status).toBe(allowed ? 200 : 403);
    expect(s.fetchFn).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (!allowed) { expect(s.accounting).not.toHaveBeenCalled(); expect(s.resolveActor).not.toHaveBeenCalled(); }
  });
  it("strips browser previews, extra private fields and selected documents from provider and accounting packets", async () => {
    const s = setup(true), value = envelope();
    Object.assign(value.providerRequest, { taxInput: simpleW2Fixture, allegedAudit: "private-extra-source" });
    value.providerRequest.assistantContext = { mode: "workspace", selectedDocuments: [{ id: "private-doc", name: "PRIVATE_DOCUMENT_MARKER", kind: "w2", coverage: "supported", label: "PRIVATE_DOCUMENT_MARKER", notes: "PRIVATE_DOCUMENT_MARKER", matchedFixtureId: null, seededFactIds: [] }] };
    const response = await s.handler.POST(request(value));
    expect(response.status).toBe(200);
    const serialized = JSON.stringify([s.fetchFn.mock.calls, s.accounting.mock.calls]);
    for (const marker of ["PRIVATE_DOCUMENT_MARKER", "private-extra-source", "taxInput", "Tech Corp"]) expect(serialized).not.toContain(marker);
  });
  it("binds the accounting digest to changed facts and authenticated owner", async () => {
    const s = setup(true), value = envelope();
    await s.handler.POST(request(value));
    value.taxInput.w2s[0].wages = "86000";
    await s.handler.POST(request(value));
    s.resolveActor.mockResolvedValue({ ...owner, id: "different-owner" });
    await s.handler.POST(request(value));
    const digests = s.accounting.mock.calls.map(([input]) => input.requestPayload.calculationDigest);
    expect(new Set(digests).size).toBe(3);
  });
  it("removes known source names from questions and workflow text before every external hook", async () => {
    const s = setup(true), value = envelope();
    value.providerRequest.question = "Explain Jane's wages from Tech Corp in Seattle.";
    value.providerRequest.workspace.seededReturn.interviewQuestions = [{ status: "pending", prompt: "Review Tech Corp and Jane." }];
    const response = await s.handler.POST(request(value));
    expect(response.status).toBe(200); expect(s.fetchFn).toHaveBeenCalledOnce();
    const transmitted = JSON.stringify([s.fetchFn.mock.calls, s.accounting.mock.calls]);
    for (const secret of ["Tech Corp", "Jane", "Seattle"]) expect(transmitted).not.toContain(secret);
  });
  it("keeps one opaque logical reservation identity when changed source identifiers affect redaction", async () => {
    const s = setup(true), value = envelope();
    value.providerRequest.requestId = "private-Tech-Corp-logical-request";
    await s.handler.POST(request(value));
    value.taxInput.w2s[0].employer.name = "Second Employer";
    await s.handler.POST(request(value));
    expect(s.accounting).toHaveBeenCalledTimes(2);
    const [first, second] = s.accounting.mock.calls.map(([input]) => input);
    expect(first.requestId).toMatch(/^calculation:[a-f0-9]{64}$/);
    expect(second.requestId).toBe(first.requestId);
    expect(second.requestPayload.calculationDigest).not.toBe(first.requestPayload.calculationDigest);
    expect(JSON.stringify([s.fetchFn.mock.calls, s.accounting.mock.calls])).not.toContain("private-Tech-Corp-logical-request");
  });
  it("rejects a provider answer containing a known source identity while accounting for its usage", async () => {
    const s = setup(true);
    s.fetchFn.mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ answer: "Tech Corp paid $85,000.", sourceIds: ["spec:2025:1040:11", "audit:2025:1040:11"], engineValues: [{ id: "audit:2025:1040:11", value: "85000" }] }) }] }], usage: { input_tokens: 100, output_tokens: 100 } }));
    const response = await s.handler.POST(request());
    const value = await response.json();
    expect(response.status).toBe(200); expect(value).toMatchObject({ provider: "mock-local", usage: { inputTokens: 100, outputTokens: 100 } });
    expect(JSON.stringify(value)).not.toContain("Tech Corp");
    expect(s.beforeAttempt).toHaveBeenCalledOnce(); expect(s.recordAttempt).toHaveBeenCalledOnce();
  });
  it("keeps production disabled even with credentials and submitted execution instructions", async () => {
    const s = setup(), value = envelope();
    Object.assign(value.providerRequest, { execution: { mode: "evaluation" }, ownerScope: "attacker" });
    const handler = createTaxExplanationRouteHandlers({ ...s.dependencies, execution: { mode: "production" }, env: { OPENAI_API_KEY: "synthetic-no-live-key" } });
    const response = await handler.POST(request(value));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ provider: "mock-local" }); expect(s.fetchFn).not.toHaveBeenCalled();
  });
  it("keeps opted-out and ordinary packets deterministic without a private calculation envelope", async () => {
    const s = setup(true), value = envelope(); value.providerRequest.optedOut = true;
    Object.assign(value.providerRequest, { taxInput: simpleW2Fixture });
    const response = await s.handler.POST(request(value)); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ provider: "mock-local" });
    expect(s.accounting).not.toHaveBeenCalled();
    const ordinary = createProviderWorkspaceRouteHandlers(s.dependencies);
    expect((await ordinary.POST(request(value))).status).toBe(400);
    expect(s.fetchFn).not.toHaveBeenCalled();
  });
});
