import { beforeEach, describe, expect, it, vi } from "vitest";
import { reserveHostedAiBudget, recordHostedAiRouteUsage } from "../../../apps/web/src/lib/hosted-ai-route";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), entitlement: vi.fn(), budget: vi.fn(), record: vi.fn() }));
vi.mock("../../../apps/web/src/lib/hosted-auth", () => ({ resolveHostedWorkspaceActor: mocks.actor }));
vi.mock("../../../apps/web/src/lib/hosted-billing-db", () => ({ getHostedEntitlementByOwnerId: mocks.entitlement }));
vi.mock("../../../apps/web/src/lib/hosted-ai-usage-db", () => ({ getHostedAiBudgetSnapshot: mocks.budget, recordHostedAiUsage: mocks.record }));
const request = new Request("https://example.test/api/business-expense-analysis");
const hosted = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ id: "owner" });
  mocks.entitlement.mockResolvedValue({ entitlement: { workspaceAccess: true }, subscription: null });
});
describe("deterministic document analysis spending boundary", () => {
  it("does not reserve or debit provider credits when no provider call is possible", async () => {
    const result = await reserveHostedAiBudget(request, { documents: [] }, null, hosted);
    expect(result).toEqual({ response: null, reservation: null });
    expect(mocks.actor).toHaveBeenCalledOnce();
    expect(mocks.entitlement).toHaveBeenCalledOnce();
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(await recordHostedAiRouteUsage(result.reservation, { requestId: "test", task: "document",
      provider: "deterministic", modelId: "none", requestPayload: {}, responsePayload: {} }, hosted)).toBeNull();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("still requires hosted authentication", async () => {
    mocks.actor.mockResolvedValue(null);
    expect((await reserveHostedAiBudget(request, {}, null, hosted)).response?.status).toBe(401);
    expect(mocks.budget).not.toHaveBeenCalled();
  });
  it("still checks hosted workspace entitlement", async () => {
    mocks.entitlement.mockResolvedValue({ entitlement: { workspaceAccess: false } });
    expect((await reserveHostedAiBudget(request, {}, null, hosted)).response?.status).toBe(403);
  });
  it("works offline in self-hosted mode without account or billing services", async () => {
    expect(await reserveHostedAiBudget(request, {}, null, {})).toEqual({ response: null, reservation: null });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.budget).not.toHaveBeenCalled();
  });
  it("blocks the legacy estimated provider-debit path", async () => {
    await expect(reserveHostedAiBudget(request, {}, "gpt-6-luna", hosted)).rejects.toThrow(/atomic task accounting/);
    await expect(recordHostedAiRouteUsage({} as never, { requestId: "test", task: "document", provider: "openai", modelId: "gpt-6-luna", requestPayload: {}, responsePayload: {} }, hosted))
      .rejects.toThrow(/Estimated usage cannot settle/);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
