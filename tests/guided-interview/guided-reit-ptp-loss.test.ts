// @vitest-environment jsdom
// Spec: spec/federal/guided-reit-ptp-loss.yaml.
import { afterEach, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { clearGuidedReitPtpLossSelection, emptyAdjustmentData, getGuidedSectionRoute, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection, type FilingStatus } from "@/lib/guided-interview-flow";
import { guidedOrdinaryPriorQbiFixture } from "../fixtures/guided-prior-qbi-ordinary";
import { completeW2Entry, startCompleteInterview } from "./complete-facts";

const filedSource = {
  sourceTaxYear: "2024", sourceForm: "form_8995" as const, sourceReference: "Synthetic filed QBI original",
  amount: "4,500.25", sourceFactsConfirmed: true, priorFilingStatus: "single" as FilingStatus,
  primaryName: "Jordan Example", primaryTaxIdLast4: "3333",
};

function household(filingStatus: FilingStatus = "single") {
  const state = startCompleteInterview({ filingStatus, incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "50000", socialSecurityWages: "50000", medicareWages: "50000" }] };
  return state;
}

function withSource(source = filedSource, filingStatus: FilingStatus = "single") {
  const state = household(filingStatus);
  state.sectionData.adjustments = { ...emptyAdjustmentData, reitPtpLossSource: source };
  return state;
}

afterEach(() => localStorage.clear());

it("passes filed REIT and PTP carry independently and preserves zero", () => {
  expect(buildTaxInputFromGuidedData(household())?.priorYear?.reitPtpLossSource).toBeUndefined();
  const state = withSource();
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.scheduleK1).toBeUndefined();
  expect(input?.priorYear?.qbiLossCarryforward).toBeUndefined();
  expect(input?.priorYear?.reitPtpLossSource).toEqual({
    sourceTaxYear: 2024, sourceForm: "form_8995", sourceReference: filedSource.sourceReference,
    amount: "4500.25", sourceFactsConfirmed: true, owner: "primary",
  });
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.carryforwards.reitPtpLossCarryforward?.toFixed()).toBe("4500");
  const explicitZero = buildTaxInputFromGuidedData(withSource({ ...filedSource, amount: "0" }));
  expect(explicitZero?.priorYear?.reitPtpLossSource?.amount).toBe("0");
  for (const patch of [{ amount: "" }, { amount: "-5" }, { sourceTaxYear: "2023" }, { sourceReference: " " }, { sourceFactsConfirmed: false }]) {
    const incomplete = withSource({ ...filedSource, ...patch });
    expect(validateSection(incomplete, "adjustments")).toMatchObject({ status: "partial", allowSkip: false });
    expect(buildTaxInputFromGuidedData(incomplete)).toBeNull();
  }
});

it("requires the same filing unit and review after source or taxpayer changes", () => {
  const jointOriginal = {
    ...filedSource, priorFilingStatus: "mfj" as const, sourceForm: "form_8995_a" as const,
    sameJointFilersConfirmed: true, spouseName: "Taylor Example", spouseTaxIdLast4: "4444",
  };
  const joint = household("mfj");
  joint.sectionData.adjustments = { ...emptyAdjustmentData, reitPtpLossSource: jointOriginal };
  expect(buildTaxInputFromGuidedData(joint)?.priorYear?.reitPtpLossSource).toMatchObject({ sourceForm: "form_8995_a", owner: "joint", sameJointFilersConfirmed: true });
  const both = guidedOrdinaryPriorQbiFixture();
  both.sectionData.adjustments = { ...emptyAdjustmentData, ...both.sectionData.adjustments, reitPtpLossSource: jointOriginal };
  expect(buildTaxInputFromGuidedData(both)?.priorYear).toMatchObject({ qbiLossCarryforward: "7000", reitPtpLossSource: { amount: "4500.25" } });
  for (const patch of [{ sameJointFilersConfirmed: false }, { spouseTaxIdLast4: "5555" }, { priorFilingStatus: "mfs" as const }]) {
    const incomplete = structuredClone(joint);
    incomplete.sectionData.adjustments = { ...emptyAdjustmentData, reitPtpLossSource: { ...jointOriginal, ...patch } };
    expect(buildTaxInputFromGuidedData(incomplete)).toBeNull();
  }
  const taxpayerChange = updateSectionData(joint, "personal-info", { ...joint.sectionData["personal-info"], firstName: "Someone" });
  const yearChange = setInterviewTaxYear(joint, 2026);
  const sourceChange = updateSectionData(joint, "adjustments", { ...joint.sectionData.adjustments, reitPtpLossSource: { ...jointOriginal, amount: "23" } });
  for (const changed of [taxpayerChange, yearChange, sourceChange]) {
    expect(changed.sectionData.adjustments?.reitPtpLossSource).toMatchObject({ sourceFactsConfirmed: null, sourceReference: filedSource.sourceReference });
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  }
  expect(buildTaxInputFromGuidedData({ ...joint, segmentation: { ...joint.segmentation, filingStatus: "mfs" } })).toBeNull();
});

it("routes and reopens original carry sources with no current K-1", () => {
  const state = household();
  expect(getGuidedSectionRoute(state).map(section => section.id)).not.toContain("adjustments");
  expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
  state.segmentation.lifeEvents = ["reit-ptp-loss-carryforward"];
  expect(getGuidedSectionRoute(state).map(section => section.id)).toContain("adjustments");
  expect(validateSection(state, "adjustments")).toMatchObject({ status: "partial", allowSkip: false });
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  const removed = updateSectionData({ ...withSource(), segmentation: state.segmentation }, "adjustments", emptyAdjustmentData);
  expect(removed.sectionData.adjustments?.reitPtpLossSource).toBeUndefined();
  expect(validateSection(removed, "adjustments")).toMatchObject({ status: "partial", allowSkip: false });
  expect(buildTaxInputFromGuidedData(removed)).toBeNull();
  const corrected = clearGuidedReitPtpLossSelection(removed);
  expect(corrected.segmentation.lifeEvents).not.toContain("reit-ptp-loss-carryforward");
  expect(getGuidedSectionRoute(corrected).map(section => section.id)).not.toContain("adjustments");
  expect(buildTaxInputFromGuidedData(corrected)).not.toBeNull();
  state.sectionData.adjustments = { ...emptyAdjustmentData, reitPtpLossSource: {} };
  saveGuidedFlowState(localStorage, "qualified-reit", state);
  const started = loadGuidedFlowState(localStorage, "qualified-reit");
  if (!started) throw new Error("Reopen the saved incomplete interview");
  expect(started.sectionData.adjustments?.reitPtpLossSource).toEqual({});
  expect(validateSection(started, "adjustments")).toMatchObject({ status: "partial", allowSkip: false });
  expect(buildTaxInputFromGuidedData(started)).toBeNull();
  const confirmed = withSource({ ...filedSource, amount: "0" });
  saveGuidedFlowState(localStorage, "qualified-reit", confirmed);
  const reopened = loadGuidedFlowState(localStorage, "qualified-reit");
  if (!reopened) throw new Error("Reopen the saved confirmed interview");
  expect(getGuidedSectionRoute(reopened).map(section => section.id)).toContain("adjustments");
  expect(reopened.sectionData.adjustments?.reitPtpLossSource).toEqual(confirmed.sectionData.adjustments?.reitPtpLossSource);
  expect(buildTaxInputFromGuidedData(reopened)?.priorYear?.reitPtpLossSource?.amount).toBe("0");
});
