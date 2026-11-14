// Spec: spec/federal/hosted-document-analysis-owner.yaml
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), entitlement: vi.fn(), expense: vi.fn(), income: vi.fn() }));
vi.mock("../../../apps/web/src/lib/hosted-auth", () => ({ resolveHostedWorkspaceActor: mocks.actor }));
vi.mock("../../../apps/web/src/lib/hosted-billing-db", () => ({ getHostedEntitlementByOwnerId: mocks.entitlement }));
vi.mock("../../../apps/web/src/lib/gemini-document-analysis-server", () => ({
  analyzeBusinessExpenseStatementWithGemini: mocks.expense,
  analyzeSelfEmploymentIncomeDocumentWithGemini: mocks.income,
}));
vi.mock("../../../apps/web/src/lib/rate-limit", async (original) => ({
  ...await original<typeof import("../../../apps/web/src/lib/rate-limit")>(),
  checkRateLimitForEnvironment: async () => ({ allowed: true, remaining: 10 }),
}));
import { POST as expense } from "../../../apps/web/src/app/api/business-expense-analysis/route";
import { POST as income } from "../../../apps/web/src/app/api/self-employment-income-analysis/route";
import { evaluateCors } from "../../../apps/web/src/lib/cors";

const ownerHeader = "X-Tax-Engine-Workspace-Owner";
const document = { fileName: "upload-12345678-1234-4321-8123-123456789abc.pdf", redactedText: "2026-01-15 Office supplies $45.00" };

function request(path: string, { expected, session = "owner-b", body = JSON.stringify({ documents: [document] }) }:
  { expected?: string; session?: string | null; body?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json", "x-real-ip": "192.0.2.20" });
  if (expected !== undefined) headers.set(ownerHeader, expected);
  if (session !== null) headers.set("cookie", `synthetic-session=${session}`);
  return new Request(`https://tax.example${path}`, { method: "POST", headers, body });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TAX_ENGINE_DEPLOYMENT_MODE", "hosted");
  vi.stubEnv("TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID", undefined);
  mocks.actor.mockImplementation(async ({ requestHeaders }: { requestHeaders: Headers }) => {
    const session = requestHeaders.get("cookie")?.match(/^synthetic-session=(owner-[ab])$/);
    return session ? { id: session[1] } : null;
  });
  mocks.entitlement.mockResolvedValue({ entitlement: { workspaceAccess: true } });
  mocks.expense.mockResolvedValue({ fileName: document.fileName });
  mocks.income.mockResolvedValue({ fileName: document.fileName });
});
afterEach(() => vi.unstubAllEnvs());

describe.each([
  { name: "expense", path: "/api/business-expense-analysis", post: expense, analyze: mocks.expense },
  { name: "income", path: "/api/self-employment-income-analysis", post: income, analyze: mocks.income },
])("$name analysis ownership", ({ path, post, analyze }) => {
  it("rejects a stale owner before reading its document text or checking entitlement", async () => {
    const stale = request(path, { expected: "hosted-owner:owner-a" });
    const response = await post(stale);
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    const responseText = await response.text();
    expect(responseText).toContain("Reopen");
    expect(responseText).not.toMatch(/owner-[ab]|Office supplies/);
    expect(stale.bodyUsed).toBe(false);
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it.each([undefined, "hosted-owner:owner-b, hosted-owner:owner-a"])("fails closed without one exact owner scope: %s", async (expected) => {
    const unbound = request(path, { expected, body: "{" });
    expect((await post(unbound)).status).toBe(409);
    expect(unbound.bodyUsed).toBe(false);
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it("allows the active owner and checks the same actor for entitlement", async () => {
    const response = await post(request(path, { expected: "hosted-owner:owner-b" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await response.json()).toMatchObject({ mode: "deterministic", aiStatus: "qualification-pending" });
    expect(mocks.actor).toHaveBeenCalledOnce();
    expect(mocks.entitlement).toHaveBeenCalledExactlyOnceWith(process.env, "owner-b");
    expect(analyze).toHaveBeenCalledExactlyOnceWith(document.fileName, document.redactedText);
  });

  it("waits for cookie authentication before reading the request body", async () => {
    let confirmActor!: (actor: { id: string }) => void;
    let enteredAuth!: () => void;
    const authEntered = new Promise<void>((resolve) => { enteredAuth = resolve; });
    mocks.actor.mockImplementationOnce(() => {
      enteredAuth();
      return new Promise((resolve) => { confirmActor = resolve; });
    });
    const incoming = request(path, { expected: "hosted-owner:owner-b" });
    const work = post(incoming);
    await authEntered;
    expect(incoming.bodyUsed).toBe(false);
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
    confirmActor({ id: "owner-b" });
    expect((await work).status).toBe(200);
    expect(incoming.bodyUsed).toBe(true);
  });

  it("keeps the header from authenticating on its own", async () => {
    const anonymous = request(path, { expected: "hosted-owner:owner-b", session: null });
    expect((await post(anonymous)).status).toBe(401);
    expect(anonymous.bodyUsed).toBe(false);
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it("keeps entitlement denial for the matching actor", async () => {
    mocks.entitlement.mockResolvedValue({ entitlement: { workspaceAccess: false } });
    const denied = request(path, { expected: "hosted-owner:owner-b" });
    expect((await post(denied)).status).toBe(403);
    expect(denied.bodyUsed).toBe(false);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("keeps local analysis available without a hosted scope or session", async () => {
    vi.stubEnv("TAX_ENGINE_DEPLOYMENT_MODE", "self-host");
    expect((await post(request(path, { session: null }))).status).toBe(200);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(analyze).toHaveBeenCalledOnce();
  });

  it("does not admit cross-origin preflights for the owner header", () => {
    const trusted = "https://other.tax.example";
    const env = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", BETTER_AUTH_TRUSTED_ORIGINS: trusted };
    expect(evaluateCors(path, "OPTIONS", trusted, env)).toEqual({ action: "pass-through" });
    expect(evaluateCors("/api/unmatched-document-review", "OPTIONS", trusted, env)).toEqual({ action: "pass-through" });
  });
});
