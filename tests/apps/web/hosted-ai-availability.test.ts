import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiTaskExecution } from "../../../apps/web/src/lib/ai-task-adapter";
import type { AiQualificationEvidence, AiRolloutState } from "../../../apps/web/src/lib/ai-rollout";
const fixture = vi.hoisted(() => ({ execution: { mode: "production" } as AiTaskExecution }));
vi.mock("server-only", () => ({}));
vi.mock("../../../apps/web/src/lib/production-ai-config", () => ({ get PRODUCTION_WORKSPACE_AI_EXECUTION() { return fixture.execution; } }));
import { canPurchaseHostedAiCredits } from "../../../apps/web/src/lib/hosted-ai-availability";

const at = "2026-10-25T00:00:00Z";
const evidence: AiQualificationEvidence = { task: "workspace-summary", profileId: "luna-high", model: "gpt-6-luna", promptVersion: "workspace-summary/2", schemaVersion: "workspace-summary/2", reportSha256: "a".repeat(64), corpusSha256: "b".repeat(64), accountCapabilityReference: "synthetic-access-report", author: "synthetic-author", independentReviewer: "synthetic-reviewer", approvedBy: "synthetic-owner", approvalReference: "synthetic-approval", qualifiedAt: "2026-10-24T00:00:00Z", expiresAt: "2026-11-24T00:00:00Z", measuredGates: { eligibleForPromotionReview: true, blockers: [], reviewedCases: 220, repeatedHeldOut: true, januaryPricingIncluded: true } };
const state: AiRolloutState = { task: "workspace-summary", stage: 100, current: evidence, previous: null, revision: 3, changeReference: "synthetic-only" };
beforeEach(() => { fixture.execution = { mode: "production", apiKeys: { openai: "synthetic-test-key" }, productionRollout: { ownerScope: "synthetic", cohortSecret: "x".repeat(32), states: [structuredClone(state)] } }; });

describe("extra-credit sale qualification (synthetic evidence only)", () => {
  it("keeps the shipped executor and compiled registry unqualified", async () => {
    const actual = await vi.importActual<typeof import("../../../apps/web/src/lib/production-ai-config")>("../../../apps/web/src/lib/production-ai-config");
    expect(actual.PRODUCTION_WORKSPACE_AI_EXECUTION).toEqual({ mode: "production" });
    fixture.execution = actual.PRODUCTION_WORKSPACE_AI_EXECUTION; expect(canPurchaseHostedAiCredits(at)).toBe(false);
  });
  it("permits a fully rolled-out approved executable route in the synthetic harness", () => { expect(canPurchaseHostedAiCredits(at)).toBe(true); });
  it("does not sell credits when the selected provider has no credential", () => {
    fixture.execution.apiKeys = {};
    expect(canPurchaseHostedAiCredits(at)).toBe(false);
    fixture.execution.apiKeys = { google: "synthetic-other-provider" };
    expect(canPurchaseHostedAiCredits(at)).toBe(false);
  });
  it("uses the executor's first route instead of a later duplicate approval", () => {
    fixture.execution.productionRollout!.states = [{ ...state, stage: 0 }, state];
    expect(canPurchaseHostedAiCredits(at)).toBe(false);
  });
  it("matches the responder's credential precedence and fixed provider URL", () => {
    fixture.execution.apiKeys = undefined;
    expect(canPurchaseHostedAiCredits(at, {})).toBe(false);
    expect(canPurchaseHostedAiCredits(at, { OPENAI_API_KEY: "synthetic-env-key" })).toBe(true);
    expect(canPurchaseHostedAiCredits(at, { MODEL_PROVIDER_API_KEY: "synthetic-env-key" })).toBe(true);
    expect(canPurchaseHostedAiCredits(at, { OPENAI_API_KEY: "synthetic-env-key", MODEL_PROVIDER_BASE_URL: "https://unapproved.example/v1" })).toBe(false);
    fixture.execution.apiKey = "synthetic-direct-key";
    expect(canPurchaseHostedAiCredits(at, {})).toBe(true);
    expect(canPurchaseHostedAiCredits(at, { MODEL_PROVIDER_BASE_URL: "https://api.openai.com/v1/" })).toBe(true);
  });
  it.each([0, 5, 25] as const)("rejects limited or stopped rollout stage %i", stage => { fixture.execution.productionRollout!.states = [{ ...state, stage }]; expect(canPurchaseHostedAiCredits(at)).toBe(false); });
  it("rejects evaluation mode even when the fixture has approved-looking evidence", () => { fixture.execution.mode = "evaluation"; expect(canPurchaseHostedAiCredits(at)).toBe(false); });
  it("rejects an unconfigured executor, short cohort secret, or empty compiled registry", () => {
    fixture.execution = { mode: "production" }; expect(canPurchaseHostedAiCredits(at)).toBe(false);
    fixture.execution.productionRollout = { ownerScope: "synthetic", cohortSecret: "short", states: [state] }; expect(canPurchaseHostedAiCredits(at)).toBe(false);
    fixture.execution.productionRollout = { ownerScope: "synthetic", cohortSecret: "x".repeat(32) }; expect(canPurchaseHostedAiCredits(at)).toBe(false);
  });
  it.each([{ expiresAt: at }, { approvalReference: "" }, { model: "unapproved-model" }, { independentReviewer: evidence.author }, { measuredGates: { ...evidence.measuredGates, januaryPricingIncluded: false } }])("rejects invalid evidence %j", changed => {
    fixture.execution.productionRollout!.states = [{ ...state, current: { ...evidence, ...changed } }]; expect(canPurchaseHostedAiCredits(at)).toBe(false);
  });
  it("cannot use a prior route or another task to sell current workspace-helper credit", () => {
    fixture.execution.productionRollout!.states = [{ ...state, current: null, previous: evidence }, { ...state, task: "income-extraction" }]; expect(canPurchaseHostedAiCredits(at)).toBe(false);
  });
});
