import { beforeEach, describe, expect, it, vi } from "vitest";
import { hostedAiTaskAccounting } from "../../../apps/web/src/lib/hosted-ai-task-accounting";
const mocks = vi.hoisted(() => ({ ensure: vi.fn(), reserve: vi.fn(), start: vi.fn(), cancel: vi.fn(), settle: vi.fn(), unknown: vi.fn() }));
vi.mock("../../../apps/web/src/lib/hosted-server-db", () => ({ ensureHostedAppSchema: mocks.ensure, getHostedServerDatabase: async () => ({ pool: {} }) }));
vi.mock("../../../apps/web/src/lib/hosted-ai-ledger", () => ({ createHostedAiLedger: () => mocks }));
const input = { ownerId: "authenticated-owner", requestId: "synthetic-request", cycleKey: "cycle", includedBudgetCents: 100, requestPayload: { safe: "redacted" } };
const attempt = { task: "workspace-summary" as const, profileId: "luna-high" as const, modelId: "gpt-6-luna", startedAt: "2026-10-25T00:00:00Z", maximumChargeCents: 1, attempt: 1 as const };
beforeEach(() => {
  vi.resetAllMocks(); mocks.reserve.mockResolvedValue({ accepted: true, created: true }); mocks.start.mockResolvedValue(true);
});
describe("authenticated provider task accounting", () => {
  it("reserves a digest and dispatch budget with the authenticated owner, then settles reported usage", async () => {
    const hooks = hostedAiTaskAccounting(input, {});
    await hooks.beforeAttempt!(attempt);
    expect(mocks.reserve).toHaveBeenCalledWith({ ownerId: input.ownerId, requestId: input.requestId, cycleKey: "cycle", includedBudgetCents: 100,
      payloadDigest: expect.stringMatching(/^[a-f0-9]{64}$/), maximumChargeCents: 1 });
    const outcome = { accepted: false, usage: { inputTokens: 100, outputTokens: 200 }, providerRequestId: "provider-request" };
    await hooks.recordAttempt!(attempt, outcome);
    expect(mocks.settle).toHaveBeenCalledWith({ ownerId: input.ownerId, requestId: input.requestId, attempt: 1, ...outcome, final: true });
  });
  it("never dispatches a duplicate reservation or insufficient-credit request", async () => {
    const hooks = hostedAiTaskAccounting(input, {});
    mocks.reserve.mockResolvedValueOnce({ accepted: true, created: false }).mockResolvedValueOnce({ accepted: false, created: false });
    await expect(hooks.beforeAttempt!(attempt)).rejects.toThrow(/already reserved/);
    await expect(hooks.beforeAttempt!(attempt)).rejects.toThrow(/exhausted/);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("releases only a new unstarted hold when starting the attempt fails", async () => {
    mocks.start.mockResolvedValue(false);
    await expect(hostedAiTaskAccounting(input, {}).beforeAttempt!(attempt)).rejects.toThrow(/already started/);
    expect(mocks.cancel).toHaveBeenCalledWith({ ownerId: input.ownerId, requestId: input.requestId });
  });
  it("requires explicit approval for escalation and reserves both possible attempts upfront", async () => {
    await expect(hostedAiTaskAccounting(input, {}).beforeAttempt!({ ...attempt, attempt: 2 })).rejects.toThrow(/authorization/);
    expect(mocks.reserve).not.toHaveBeenCalled();
    const hooks = hostedAiTaskAccounting({ ...input, escalationApprovalReference: "operator-approved-synthetic" }, {});
    await hooks.beforeAttempt!(attempt);
    expect(mocks.reserve.mock.calls[0]![0].maximumChargeCents).toBe(23);
    await hooks.recordAttempt!(attempt, { accepted: false, usage: { inputTokens: 100, outputTokens: 200 } });
    expect(mocks.settle.mock.calls[0]![0].final).toBe(false);
    mocks.reserve.mockResolvedValue({ accepted: true, created: false });
    await hooks.beforeAttempt!({ ...attempt, profileId: "sol-high", modelId: "gpt-6.1-sol", attempt: 2 });
    await hooks.recordAttempt!({ ...attempt, attempt: 2 }, { accepted: false, usage: { inputTokens: 100, outputTokens: 200 } });
    expect(mocks.settle.mock.calls[1]![0].final).toBe(true);
  });
  it("retains unknown usage for reconciliation without persisting request text", async () => {
    await hostedAiTaskAccounting(input, {}).recordUnknownAttempt!(attempt, {});
    expect(mocks.unknown).toHaveBeenCalledWith({ ownerId: input.ownerId, requestId: input.requestId, attempt: 1 });
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});
