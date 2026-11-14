// Spec: spec/federal/hosted-workspace-helper-owner.yaml
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProviderWorkspaceRouteHandlers } from "@/lib/provider-workspace-route";
import { createTaxExplanationRouteHandlers } from "@/lib/transient-tax-explanation-route";
import { requestTaxCalculationExplanation } from "@/lib/transient-tax-explanation-request";
import { buildProviderWorkspaceRequest, requestProviderWorkspace } from "@/lib/provider-workspace-request";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { simpleW2Fixture } from "../../fixtures/simple-w2";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rate: vi.fn(), respond: vi.fn() }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...await original<typeof import("@/lib/rate-limit")>(), checkRateLimitForEnvironment: mocks.rate,
}));
vi.mock("@/lib/provider-workspace-responder", () => ({ createProviderWorkspaceResponder: () => mocks.respond }));
const header = "X-Tax-Engine-Workspace-Owner";
const currentScope = "hosted-owner:owner-b";

function setup(env: Record<string, string | undefined> = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_APP_URL: "https://tax.example" }) {
  const resolveActor = vi.fn().mockResolvedValue({ id: "owner-b" });
  const getEntitlementByOwnerId = vi.fn().mockResolvedValue({ entitlement: { workspaceAccess: true }, subscription: null });
  const accounting = vi.fn().mockReturnValue({});
  const dependencies = { env, rateLimitStore: new Map(), resolveActor, getEntitlementByOwnerId, accounting };
  return { resolveActor, getEntitlementByOwnerId, accounting, dependencies };
}

function request(path: string, scope?: string, body = "{", origin = "https://tax.example") {
  return new Request(`${origin}${path}`, { method: "POST", headers: {
    "content-type": "application/json", "x-real-ip": "192.0.2.20", origin,
    ...(scope === undefined ? {} : { [header]: scope }),
  }, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.respond.mockResolvedValue({ provider: "mock-local", summary: "Synthetic workflow" });
});
afterEach(() => vi.unstubAllGlobals());

describe.each([
  { name: "workspace help", path: "/api/provider/workspace", create: createProviderWorkspaceRouteHandlers },
  { name: "private calculation", path: "/api/workspace/tax-explanation", create: createTaxExplanationRouteHandlers },
])("$name owner admission", ({ path, create }) => {
  it("rejects stale and absent hosted scopes before consuming taxpayer facts", async () => {
    for (const scope of [undefined, "hosted-owner:owner-a", "local-browser"]) {
      const s = setup();
      const input = request(path, scope);
      const response = await create(s.dependencies).POST(input);
      expect(response.status).toBe(409);
      expect(response.headers.get("cache-control")).toBe("no-store, private");
      expect(await response.text()).not.toContain("owner-b");
      expect(input.bodyUsed).toBe(false);
      expect(s.resolveActor).toHaveBeenCalledOnce();
      expect(s.getEntitlementByOwnerId).not.toHaveBeenCalled();
      expect(s.accounting).not.toHaveBeenCalled();
      expect(mocks.respond).not.toHaveBeenCalled();
    }
  });

  it("keeps anonymous and authentication failures ahead of raw parsing", async () => {
    const s = setup();
    s.resolveActor.mockResolvedValue(null);
    const anonymous = request(path, currentScope);
    expect((await create(s.dependencies).POST(anonymous)).status).toBe(401);
    expect(anonymous.bodyUsed).toBe(false);
    s.resolveActor.mockRejectedValue(new Error("postgresql://PRIVATE_FAILURE"));
    const failed = request(path, currentScope);
    const response = await create(s.dependencies).POST(failed);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE_FAILURE");
    expect(failed.bodyUsed).toBe(false);
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it("reads the existing bounded body only after authenticating the current scope", async () => {
    const s = setup();
    const input = request(path, currentScope);
    expect((await create(s.dependencies).POST(input)).status).toBe(400);
    expect(input.bodyUsed).toBe(true);
    expect(s.resolveActor).toHaveBeenCalledOnce();
    expect(mocks.respond).not.toHaveBeenCalled();
  });
});

it("admits an explicit development loopback local workspace without resolving an actor", async () => {
  const s = setup({ TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "development" });
  const workspace = createWorkspaceRecord("local-source");
  const value = buildProviderWorkspaceRequest(workspace);
  const response = await createProviderWorkspaceRouteHandlers(s.dependencies).POST(
    request("/api/provider/workspace", "local-browser", JSON.stringify(value), "http://localhost"),
  );
  expect(response.status).toBe(200);
  expect(s.resolveActor).not.toHaveBeenCalled();
  expect(s.getEntitlementByOwnerId).not.toHaveBeenCalled();
  expect(mocks.respond).toHaveBeenCalledOnce();

  const mixed = { ...value, workspace: { ...value.workspace, storageMode: "hosted-postgres" } };
  expect((await createProviderWorkspaceRouteHandlers(s.dependencies).POST(
    request("/api/provider/workspace", "local-browser", JSON.stringify(mixed), "http://localhost"),
  )).status).toBe(409);
  expect(mocks.respond).toHaveBeenCalledOnce();
});

it.each(["production", "preview"])("never trusts the local marker in hosted %s", async (mode) => {
  const s = setup({ TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production", VERCEL_ENV: mode });
  const incoming = request("/api/provider/workspace", "local-browser", "{", "http://localhost");
  expect((await createProviderWorkspaceRouteHandlers(s.dependencies).POST(incoming)).status).toBe(409);
  expect(incoming.bodyUsed).toBe(false);
  expect(s.resolveActor).toHaveBeenCalledOnce();
});

it("sends the captured owner on workspace helper and private calculation requests", async () => {
  vi.stubGlobal("window", { localStorage: { getItem: () => "external-enabled" } });
  const workspace = createWorkspaceRecord("private-source", { storageMode: "hosted-postgres" });
  const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ provider: "mock-local" }));
  const options = { optedOut: false, expectedHostedOwnerScopeKey: currentScope, fetchFn };
  await requestProviderWorkspace(workspace, options);
  await requestTaxCalculationExplanation(workspace, "Explain AGI", simpleW2Fixture, { ...options, confirmed: true });
  expect(fetchFn).toHaveBeenCalledTimes(2);
  for (const [, init] of fetchFn.mock.calls) {
    expect(new Headers(init?.headers).get(header)).toBe(currentScope);
    expect(init).toMatchObject({ mode: "same-origin", credentials: "same-origin", redirect: "error" });
    expect(String(init?.body)).not.toContain(currentScope);
  }
});

it("does not transmit hosted facts with an unavailable captured owner", async () => {
  const workspace = createWorkspaceRecord("missing-owner", { storageMode: "hosted-postgres" });
  const fetchFn = vi.fn();
  await expect(requestProviderWorkspace(workspace, { optedOut: false, expectedHostedOwnerScopeKey: null, fetchFn })).rejects.toThrow(/Reopen/);
  expect((await requestTaxCalculationExplanation(workspace, "Explain AGI", simpleW2Fixture, { confirmed: true,
    optedOut: false, expectedHostedOwnerScopeKey: null, fetchFn })).response.provider).toBe("mock-local");
  expect(fetchFn).not.toHaveBeenCalled();
});

it("keeps explicit opt-out local even when its hosted owner is unavailable", async () => {
  const workspace = createWorkspaceRecord("local-only", { storageMode: "hosted-postgres" });
  const fetchFn = vi.fn();
  const options = { optedOut: true, expectedHostedOwnerScopeKey: null, fetchFn };
  expect((await requestProviderWorkspace(workspace, options)).response.provider).toBe("mock-local");
  expect((await requestTaxCalculationExplanation(workspace, "Explain AGI", simpleW2Fixture, { ...options, confirmed: true })).response.provider).toBe("mock-local");
  expect(fetchFn).not.toHaveBeenCalled();
});
