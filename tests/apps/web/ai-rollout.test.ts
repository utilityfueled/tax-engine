import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { changeAiRollout, qualifiedAiEvidence, selectQualifiedAiRoute, type AiQualificationEvidence, type AiRolloutState } from "../../../apps/web/src/lib/ai-rollout";
const at = "2026-10-25T00:00:00Z";
// Synthetic records exercise gates; they are never shipped as route evidence.
const evidence: AiQualificationEvidence = { task: "workspace-summary", profileId: "luna-high", model: "gpt-6-luna",
  promptVersion: "workspace-summary/4", schemaVersion: "workspace-summary/3", reportSha256: "a".repeat(64), corpusSha256: "b".repeat(64),
  accountCapabilityReference: "synthetic-access-report", author: "fixture-author", independentReviewer: "fixture-reviewer", approvedBy: "fixture-owner", approvalReference: "synthetic-approval",
  qualifiedAt: "2026-10-24T00:00:00Z", expiresAt: "2026-11-24T00:00:00Z",
  measuredGates: { eligibleForPromotionReview: true, blockers: [], reviewedCases: 220, repeatedHeldOut: true, januaryPricingIncluded: true } };
const initial: AiRolloutState = { task: "workspace-summary", stage: 0, current: evidence, previous: null, revision: 0, changeReference: "initial" };
const context = { task: "workspace-summary" as const, ownerScope: "synthetic-owner", cohortSecret: "x".repeat(32), at };
const observedStage = (stage: 5 | 25, rolloutRevision: number) => ({
  stage, rolloutRevision, task: evidence.task, profileId: evidence.profileId,
  qualificationReportSha256: evidence.reportSha256, reportSha256: (stage === 5 ? "c" : "d").repeat(64),
  passed: true, observedSafetyFailures: 0,
});
describe("reversible qualified AI rollout", () => {
  it("ships no production qualification and honors opt-out", () => {
    expect(selectQualifiedAiRoute(context)).toBeNull();
    expect(selectQualifiedAiRoute({ ...context, optedOut: true, states: [{ ...initial, stage: 100 }] })).toBeNull();
  });
  it.each([{ author: "fixture-reviewer" }, { model: "other" }, { promptVersion: "old" }, { schemaVersion: "old" }, { accountCapabilityReference: "" }, { approvalReference: "" }, { expiresAt: at }, { reportSha256: "unknown" }])("fails qualification for stale or incomplete evidence %j", fields => {
    expect(qualifiedAiEvidence({ ...evidence, ...fields }, "workspace-summary", at)).toBe(false);
  });
  it("rejects a normalized self-review in current and rollback evidence", () => {
    const selfReviewed = { ...evidence, independentReviewer: "  ＦＩＸＴＵＲＥ－ＡＵＴＨＯＲ \u00a0" };
    expect(qualifiedAiEvidence(selfReviewed, "workspace-summary", at)).toBe(false);
    expect(selectQualifiedAiRoute({ ...context, states: [{ ...initial, stage: 100, current: selfReviewed }] })).toBeNull();
    expect(selectQualifiedAiRoute({ ...context, states: [{ ...initial, previous: selfReviewed }] })).toBeNull();
    expect(() => changeAiRollout({ ...initial, current: selfReviewed }, { stage: 5, expectedRevision: 0, reference: "synthetic", at })).toThrow(/qualification/i);
  });
  it("rejects malformed review instants and preserves the valid qualification boundary", () => {
    expect(qualifiedAiEvidence({ ...evidence, qualifiedAt: "2026-09-31T00:00:00Z" }, "workspace-summary", at)).toBe(false);
    expect(qualifiedAiEvidence({ ...evidence, expiresAt: "2026-11-31T00:00:00Z" }, "workspace-summary", at)).toBe(false);
    expect(qualifiedAiEvidence(evidence, "workspace-summary", "2026-10-25")).toBe(false);
    expect(qualifiedAiEvidence({ ...evidence, qualifiedAt: "2026-10-24T20:00:00-04:00" }, "workspace-summary", at)).toBe(true);
    expect(qualifiedAiEvidence({ ...evidence, qualifiedAt: "2026-10-25T00:00:00.001Z" }, "workspace-summary", at)).toBe(false);
  });
  it.each([{ reviewedCases: 199 }, { januaryPricingIncluded: false }, { repeatedHeldOut: false }, { blockers: ["pii"] }, { eligibleForPromotionReview: false }])("preserves measured gates %j", fields => {
    expect(qualifiedAiEvidence({ ...evidence, measuredGates: { ...evidence.measuredGates, ...fields } }, "workspace-summary", at)).toBe(false);
  });
  it("requires each observed stage and permits immediate rollback", () => {
    const first = changeAiRollout(initial, { stage: 5, expectedRevision: 0, reference: "authorize:5", at });
    expect(() => changeAiRollout(initial, { stage: 100, expectedRevision: 0, reference: "skip", at })).toThrow(/5%/);
    expect(() => changeAiRollout(first, { stage: 25, expectedRevision: 1, reference: "missing", at })).toThrow(/observations/);
    const second = changeAiRollout(first, { stage: 25, expectedRevision: 1, reference: "authorize:25", at, observation: observedStage(5, 1) });
    const full = changeAiRollout(second, { stage: 100, expectedRevision: 2, reference: "authorize:100", at, observation: observedStage(25, 2) });
    expect(selectQualifiedAiRoute({ ...context, states: [full] })?.profile.id).toBe("luna-high");
    expect(selectQualifiedAiRoute({ ...context, states: [changeAiRollout(full, { stage: 0, expectedRevision: 3, reference: "rollback", at })] })).toBeNull();
  });
  it("requires observations of the currently qualified rollout candidate", () => {
    const first = changeAiRollout(initial, { stage: 5, expectedRevision: 0, reference: "authorize:5", at });
    const observed = observedStage(5, 1);
    const advance = { stage: 25 as const, expectedRevision: 1, reference: "authorize:25", at };
    for (const observation of [
      { ...observed, task: "interview-wording" as const },
      { ...observed, profileId: "sol-low" as const },
      { ...observed, qualificationReportSha256: "e".repeat(64) },
      { ...observed, passed: false },
      { ...observed, observedSafetyFailures: 1 },
    ]) {
      expect(() => changeAiRollout(first, { ...advance, observation })).toThrow(/observations/i);
    }

    const rolledBack = changeAiRollout(first, { stage: 0, expectedRevision: 1, reference: "rollback", at });
    const restarted = changeAiRollout(rolledBack, { stage: 5, expectedRevision: 2, reference: "restart", at });
    const advanceRestarted = { ...advance, expectedRevision: restarted.revision };
    expect(() => changeAiRollout(restarted, { ...advanceRestarted, observation: observed })).toThrow(/observations/i);
    expect(changeAiRollout(restarted, { ...advanceRestarted, observation: observedStage(5, restarted.revision) }).stage).toBe(25);
  });
  it("rolls back to a still-qualified prior route, otherwise deterministic fallback", () => {
    const previous = { ...evidence, profileId: "sol-low" as const, model: "gpt-6.1-sol" };
    expect(selectQualifiedAiRoute({ ...context, states: [{ ...initial, previous }] })?.profile.id).toBe("sol-low");
    expect(selectQualifiedAiRoute({ ...context, states: [{ ...initial, previous: { ...previous, expiresAt: at } }] })).toBeNull();
  });
  it("assigns stable nested cohorts and fails closed for absent privacy scope", () => {
    const selected = (stage: 5 | 25) => new Set(Array.from({ length: 1000 }, (_, i) => `owner-${i}`).filter(ownerScope => selectQualifiedAiRoute({ ...context, ownerScope, states: [{ ...initial, stage }] })));
    const first = selected(5); const second = selected(25);
    expect(first.size).toBeGreaterThan(20); expect(first.size).toBeLessThan(90);
    expect([...first].every(owner => second.has(owner))).toBe(true);
    expect(selected(5)).toEqual(first);
    expect(() => selectQualifiedAiRoute({ ...context, cohortSecret: "short" })).toThrow(/scope/);
    expect(() => changeAiRollout(initial, { stage: 5, expectedRevision: 2, reference: "stale", at })).toThrow(/Stale/);
  });
});
