import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ respond: vi.fn(), rate: vi.fn(), actor: vi.fn(), entitlement: vi.fn(), budget: vi.fn(), accounting: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../apps/web/src/lib/provider-workspace-responder", () => ({ createProviderWorkspaceResponder: () => mocks.respond }));
vi.mock("../../../apps/web/src/lib/rate-limit", async original => ({ ...await original<typeof import("../../../apps/web/src/lib/rate-limit")>(), checkRateLimitForEnvironment: mocks.rate }));
import { createProviderWorkspaceRouteHandlers } from "../../../apps/web/src/lib/provider-workspace-route";

const privateError = new Error("postgresql://private:secret@internal/private; SSN 111-22-3333");
const body = { task: "workspace-summary", requestId: "synthetic-request", requestedAt: "2026-10-25T00:00:00Z", replacementCount: 0, redactions: [], unsupportedRoutes: [], workspace: { id: "synthetic-return", updatedAt: "2026-10-25T00:00:00Z", storageMode: "hosted-postgres", summary: { totalDocuments: 0 }, seededReturn: { interviewQuestions: [] }, returnSummary: { status: "needs-review", targetTaxYear: 2026 } } };
function request(value: unknown = body, signal?: AbortSignal) { return new Request("https://tax.example/api/provider/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value), signal }); }
function handlers() { return createProviderWorkspaceRouteHandlers({ env: { TAX_ENGINE_DEPLOYMENT_MODE: "hosted" }, rateLimitStore: new Map(), resolveActor: mocks.actor, getEntitlementByOwnerId: mocks.entitlement, getBudgetSnapshot: mocks.budget, accounting: mocks.accounting }); }

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 5 });
  mocks.actor.mockResolvedValue({ id: "synthetic-owner", label: "Synthetic", email: "synthetic@example.test" });
  mocks.entitlement.mockResolvedValue({ subscription: { planId: "starter", currentPeriodEnd: null }, entitlement: { workspaceAccess: true } });
  mocks.accounting.mockReturnValue({});
  mocks.respond.mockResolvedValue({ summary: "Synthetic workflow summary", provider: "mock-local" });
  mocks.budget.mockResolvedValue({ totalRemainingCents: 1000 });
});

describe("workspace-provider request lifetime and private responses", () => {
  it.each(["limiter", "authentication"])("contains %s outages before provider work", async boundary => {
    (boundary === "limiter" ? mocks.rate : mocks.actor).mockRejectedValue(privateError);
    const response = await handlers().POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it.each(["entitlement", "accounting", "provider", "budget"])("contains %s failures without private details", async boundary => {
    if (boundary === "entitlement") mocks.entitlement.mockRejectedValue(privateError);
    if (boundary === "accounting") mocks.accounting.mockImplementation(() => { throw privateError; });
    if (boundary === "provider") mocks.respond.mockRejectedValue(privateError);
    if (boundary === "budget") { mocks.respond.mockResolvedValue({ usage: {}, summary: "Late answer" }); mocks.budget.mockRejectedValue(privateError); }
    const response = await handlers().POST(request());
    expect(response.status).toBe(502); expect(await response.text()).not.toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each(["success", "malformed", "identifier", "unauthenticated", "unsubscribed", "outage", "quota"])("marks %s responses private and uncacheable", async outcome => {
    if (outcome === "unauthenticated") mocks.actor.mockResolvedValue(null);
    if (outcome === "unsubscribed") mocks.entitlement.mockResolvedValue({ entitlement: { workspaceAccess: false } });
    if (outcome === "outage") mocks.rate.mockResolvedValue({ allowed: false, unavailable: true });
    if (outcome === "quota") mocks.rate.mockResolvedValue({ allowed: false, retryAfterMs: 2501 });
    const response = await handlers().POST(request(outcome === "malformed" ? {} : outcome === "identifier" ? { ...body, question: "SSN 111-22-3333" } : body));
    const statuses = { success: 200, malformed: 400, identifier: 400, unauthenticated: 401, unsubscribed: 403, outage: 503, quota: 429 };
    expect(response.status).toBe(statuses[outcome]);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cache-control")).toContain("private");
    if (outcome === "quota") expect(response.headers.get("retry-after")).toBe("3");
  });

  it("does not start rate-limit or authentication work for an already cancelled request", async () => {
    const controller = new AbortController(); controller.abort(privateError);
    const response = await handlers().POST(request(body, controller.signal));
    expect(response.status).toBe(499); expect(await response.text()).not.toContain("private");
    expect(mocks.rate).not.toHaveBeenCalled(); expect(mocks.actor).not.toHaveBeenCalled(); expect(mocks.respond).not.toHaveBeenCalled();
  });

  it.each(["limiter", "authentication", "entitlement", "provider", "budget"])("stops at cancellation after %s without publishing late data", async boundary => {
    const controller = new AbortController();
    const current = boundary === "limiter" ? mocks.rate : boundary === "authentication" ? mocks.actor : boundary === "entitlement" ? mocks.entitlement : boundary === "provider" ? mocks.respond : mocks.budget;
    const values = { limiter: { allowed: true }, authentication: { id: "synthetic-owner" }, entitlement: { subscription: { planId: "starter" }, entitlement: { workspaceAccess: true } }, provider: { usage: {}, summary: "privateLateResult" }, budget: { privateLateResult: true } };
    if (boundary === "budget") mocks.respond.mockResolvedValue({ usage: {}, summary: "privateLateResult" });
    current.mockImplementation(async () => { controller.abort(privateError); return values[boundary]; });
    const response = await handlers().POST(request(body, controller.signal));
    expect(response.status).toBe(499); expect(await response.text()).not.toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    if (boundary === "limiter") expect(mocks.actor).not.toHaveBeenCalled();
    if (boundary === "authentication") expect(mocks.entitlement).not.toHaveBeenCalled();
    if (boundary === "entitlement") expect(mocks.respond).not.toHaveBeenCalled();
    if (boundary === "provider") expect(mocks.budget).not.toHaveBeenCalled();
  });
});
