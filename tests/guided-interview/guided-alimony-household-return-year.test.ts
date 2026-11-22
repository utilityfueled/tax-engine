// @vitest-environment jsdom
// Spec: spec/federal/guided-alimony-household-return-year.yaml
import { createElement, useState } from "react";
import { expect, it } from "vitest";
import { SectionAdjustments } from "@/components/guided-interview/section-adjustments";
import { SectionOtherTaxes } from "@/components/guided-interview/section-other-taxes";
import { buildAdjustmentsInput, buildScheduleHInput, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import {
  buildSectionRoute,
  emptyAdjustmentData,
  emptyOtherTaxesData,
  getGuidedSectionRoute,
  lifeEventOptions,
  loadGuidedFlowState,
  saveGuidedFlowState,
  setInterviewTaxYear,
  updateSectionData,
  validateSection,
  type AdjustmentData,
  type GuidedFlowState,
  type OtherTaxesData,
  type SegmentationAnswers,
} from "@/lib/guided-interview-flow";
import { mountGuidedPanel } from "../apps/web/guided-panel-dom";
import { completeHouseholdEmployee, completePersonalInfo, startCompleteInterview } from "./complete-facts";

function start() {
  return startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["got-divorced"], stateCode: null });
}

function selectYear(state: GuidedFlowState, year: number): GuidedFlowState {
  const changed = setInterviewTaxYear(state, year);
  return { ...changed, sectionData: { ...changed.sectionData, "personal-info": structuredClone(completePersonalInfo) } };
}

const alimony: AdjustmentData = {
  ...emptyAdjustmentData,
  alimonyPaid: "1234.56",
  alimonyQualification: {
    instrumentDate: "2017-06-01",
    post2018ModificationAppliesNewRules: false,
    paidInCash: true,
    notDesignatedNondeductible: true,
    notChildSupport: true,
    noJointReturnWithRecipient: true,
    householdRequirementMet: true,
    noPaymentsAfterRecipientDeath: true,
    recipientSsn: "123-45-6789",
  },
};

const household: OtherTaxesData = {
  ...emptyOtherTaxesData,
  householdEmployees: [{ ...completeHouseholdEmployee, cashWages: "3234.56", federalIncomeTaxWithheld: "120.15" }],
  futaApplies: true,
  futaSectionA: true,
};

it("routes initial alimony and household employment from their own life events", () => {
  const initial: SegmentationAnswers = { filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null };
  expect(lifeEventOptions.map(option => option.value)).toEqual(expect.arrayContaining(["paid-alimony", "household-employment"]));
  const routeFor = (event: SegmentationAnswers["lifeEvents"][number]) =>
    buildSectionRoute({ ...initial, lifeEvents: [event] }).map(section => section.id);
  expect(routeFor("paid-alimony")).toContain("adjustments");
  expect(routeFor("paid-alimony")).not.toContain("other-taxes");
  expect(routeFor("household-employment")).toContain("other-taxes");
  expect(routeFor("household-employment")).not.toContain("adjustments");
});

it("requires renewed alimony confirmation after changing the return year", () => {
  const original = updateSectionData(start(), "adjustments", alimony);
  expect(buildTaxInputFromGuidedData(original)?.adjustments?.alimonyPaid).toBe("1234.56");
  expect(setInterviewTaxYear(original, 2025)).toBe(original);

  const changed = selectYear(original, 2026);
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  expect(getGuidedSectionRoute(changed).map(section => section.id)).toContain("adjustments");
  expect(validateSection(changed, "adjustments").fieldErrors).toHaveProperty("alimonyAmountsTaxYear");
  expect(changed.sectionData.adjustments).toMatchObject({ ...alimony, alimonyAmountsTaxYear: null });
  expect(() => buildAdjustmentsInput(changed.sectionData.adjustments)).toThrow(/alimony payments/);
  expect(() => buildAdjustmentsInput(changed.sectionData.adjustments, "single", 2026)).toThrow(/alimony payments/);

  const id = "guided-annual-alimony";
  try {
    saveGuidedFlowState(localStorage, id, setInterviewTaxYear(changed, null));
    const loaded = loadGuidedFlowState(localStorage, id);
    if (!loaded) throw new Error("Expected a persisted guided draft");
    const returned = selectYear(loaded, 2025);
    expect(buildTaxInputFromGuidedData(returned)).toBeNull();
    const confirmed = updateSectionData(returned, "adjustments", { ...alimony, alimonyAmountsTaxYear: 2025 });
    expect(buildTaxInputFromGuidedData(confirmed)?.adjustments).toMatchObject({ alimonyPaid: "1234.56", alimonyRecipientSSN: "123-45-6789" });
    expect(() => buildAdjustmentsInput(confirmed.sectionData.adjustments)).toThrow(/alimony payments/);
    expect(buildAdjustmentsInput(confirmed.sectionData.adjustments, "single", 2025)?.alimonyPaid).toBe("1234.56");
  } finally {
    localStorage.clear();
  }
});

it("requires renewed household confirmation and keeps the FUTA source history", () => {
  const original = updateSectionData(start(), "other-taxes", household);
  expect(buildTaxInputFromGuidedData(original)?.scheduleH).toMatchObject({
    employees: [{ cashWages: "3234.56", federalIncomeTaxWithheld: "120.15" }],
    futaApplies: true,
  });

  const changed = selectYear(original, 2026);
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  expect(getGuidedSectionRoute(changed).map(section => section.id)).toContain("other-taxes");
  expect(validateSection(changed, "other-taxes").fieldErrors).toHaveProperty("householdAmountsTaxYear");
  expect(changed.sectionData["other-taxes"]).toMatchObject({ ...household, householdAmountsTaxYear: null });
  expect(() => buildScheduleHInput(changed.sectionData["other-taxes"])).toThrow(/household payroll/);
  expect(() => buildScheduleHInput(changed.sectionData["other-taxes"], 2026)).toThrow(/household payroll/);

  const confirmed = updateSectionData(changed, "other-taxes", { ...household, householdAmountsTaxYear: 2026 });
  expect(validateSection(confirmed, "other-taxes").fieldErrors).toEqual({});
  expect(() => buildScheduleHInput(confirmed.sectionData["other-taxes"])).toThrow(/household payroll/);
  expect(buildScheduleHInput(confirmed.sectionData["other-taxes"], 2026)?.employees[0]?.cashWages).toBe("3234.56");
  expect(buildTaxInputFromGuidedData(confirmed)?.scheduleH).toMatchObject({
    employees: [{ cashWages: "3234.56", federalIncomeTaxWithheld: "120.15" }],
    futaApplies: true,
  });
  expect(buildTaxInputFromGuidedData(selectYear(confirmed, 2025))).toBeNull();

  const period = { state: "OH", periodStart: "2025-01-01", periodEnd: "2025-12-31", taxableWages: "3234.56",
    hasAssignedExperienceRate: true, experienceRatePercent: "3", contributionsPaidTimely: "0" };
  const statePeriodSource = {
    ...household, futaSectionA: false,
    stateUnemploymentContributionsPaidLate: "0", futaCreditReduction: "0", futaStatePeriods: [period],
  };
  const originalWithPeriod = updateSectionData(original, "other-taxes", statePeriodSource);
  expect(buildTaxInputFromGuidedData(originalWithPeriod)?.scheduleH?.futaStatePeriods?.[0]).toMatchObject({ periodStart: "2025-01-01" });
  const switchedWithPeriod = selectYear(originalWithPeriod, 2026);
  expect(switchedWithPeriod.sectionData["other-taxes"]?.futaStatePeriods).toEqual([period]);
  const stalePeriod = updateSectionData(switchedWithPeriod, "other-taxes", { ...statePeriodSource, householdAmountsTaxYear: 2026 });
  expect(validateSection(stalePeriod, "other-taxes").fieldErrors).toHaveProperty("futa-0-dates");
  expect(stalePeriod.sectionData["other-taxes"]?.futaStatePeriods).toEqual([period]);
  expect(buildTaxInputFromGuidedData(stalePeriod)).toBeNull();
});

it("distinguishes omitted amounts from explicit zero", () => {
  const firstYear = updateSectionData(setInterviewTaxYear(start(), null), "adjustments", alimony);
  expect(buildTaxInputFromGuidedData(selectYear(firstYear, 2025))?.adjustments?.alimonyPaid).toBe("1234.56");

  const zeroAlimony = updateSectionData(start(), "adjustments", { ...emptyAdjustmentData, alimonyPaid: "0" });
  const zeroHousehold = updateSectionData(zeroAlimony, "other-taxes", {
    ...household, householdEmployees: [completeHouseholdEmployee], futaApplies: false,
  });
  const changed = selectYear(zeroHousehold, 2026);
  expect(validateSection(changed, "adjustments").fieldErrors).toHaveProperty("alimonyAmountsTaxYear");
  expect(validateSection(changed, "other-taxes").fieldErrors).toHaveProperty("householdAmountsTaxYear");

  const withoutAlimony = updateSectionData(changed, "adjustments", { ...emptyAdjustmentData, alimonyAmountsTaxYear: null });
  const withoutHousehold = updateSectionData(withoutAlimony, "other-taxes", { ...emptyOtherTaxesData, householdAmountsTaxYear: null });
  expect(validateSection(withoutHousehold, "adjustments").fieldErrors).toEqual({});
  expect(validateSection(withoutHousehold, "other-taxes").fieldErrors).toEqual({});
  expect(buildTaxInputFromGuidedData(withoutHousehold)).not.toBeNull();
});

it("renews both confirmations when the reducer edits actual facts", () => {
  const original = updateSectionData(updateSectionData(start(), "adjustments", alimony), "other-taxes", household);
  const switched = selectYear(original, 2026);
  const confirmedAdjustments = { ...alimony, alimonyAmountsTaxYear: 2026 };
  const confirmedOtherTaxes = { ...household, householdAmountsTaxYear: 2026 };
  const confirmed = updateSectionData(updateSectionData(switched, "adjustments", confirmedAdjustments), "other-taxes", confirmedOtherTaxes);
  expect(buildTaxInputFromGuidedData(confirmed)).not.toBeNull();

  const changedAlimony = updateSectionData(confirmed, "adjustments", { ...confirmedAdjustments, alimonyPaid: "2000" });
  expect(changedAlimony.sectionData.adjustments?.alimonyAmountsTaxYear).toBeNull();
  expect(buildTaxInputFromGuidedData(changedAlimony)).toBeNull();

  const changedPay = updateSectionData(confirmed, "other-taxes", {
    ...confirmedOtherTaxes,
    householdEmployees: [{ ...completeHouseholdEmployee, cashWages: "5500", federalIncomeTaxWithheld: "120.15" }],
  });
  expect(changedPay.sectionData["other-taxes"]?.householdAmountsTaxYear).toBeNull();
  expect(buildTaxInputFromGuidedData(changedPay)).toBeNull();
});

it("keeps dormant qualification and FUTA facts pending when new amounts are entered", () => {
  const withoutAmounts = updateSectionData(
    updateSectionData(start(), "adjustments", { ...alimony, alimonyPaid: "" }),
    "other-taxes", { ...household, householdEmployees: [] },
  );
  const switched = selectYear(withoutAmounts, 2026);
  expect(validateSection(switched, "adjustments").fieldErrors).not.toHaveProperty("alimonyAmountsTaxYear");
  expect(validateSection(switched, "other-taxes").fieldErrors).not.toHaveProperty("householdAmountsTaxYear");

  const newAmounts = updateSectionData(updateSectionData(switched, "adjustments", {
    ...switched.sectionData.adjustments, alimonyPaid: "2000",
  }), "other-taxes", {
    ...switched.sectionData["other-taxes"], householdEmployees: [{ ...completeHouseholdEmployee, cashWages: "500" }],
  });
  expect(validateSection(newAmounts, "adjustments").fieldErrors).toHaveProperty("alimonyAmountsTaxYear");
  expect(validateSection(newAmounts, "other-taxes").fieldErrors).toHaveProperty("householdAmountsTaxYear");
  expect(buildTaxInputFromGuidedData(newAmounts)).toBeNull();
});

it("confirms each section through its own control and requires review again after edits", async () => {
  const pendingAlimony = updateSectionData(selectYear(start(), 2026), "adjustments", { ...alimony, alimonyAmountsTaxYear: 2025 });
  expect(buildTaxInputFromGuidedData(pendingAlimony)).toBeNull();
  let latest = updateSectionData(pendingAlimony, "other-taxes", { ...household, householdAmountsTaxYear: null });
  function Sections() {
    const [state, setState] = useState(latest);
    function update(section: "adjustments" | "other-taxes", data: AdjustmentData | OtherTaxesData) {
      latest = updateSectionData(state, section, data);
      setState(latest);
    }
    return createElement("div", {}, [
      createElement(SectionAdjustments, {
        key: "adjustments", data: state.sectionData.adjustments, hasSelfEmployment: false,
        hasStudentLoans: false, hasHsa: false, taxYear: state.taxYear, filingStatus: "single",
        onDataChange: data => update("adjustments", data),
      }),
      createElement(SectionOtherTaxes, {
        key: "household", data: state.sectionData["other-taxes"], taxYear: state.taxYear,
        hasSelfEmployment: false, hasInvestments: false, guidedPreview: null,
        onDataChange: data => update("other-taxes", data),
      }),
    ]);
  }
  const panel = await mountGuidedPanel(createElement(Sections));
  try {
    await panel.expand("More adjustments");
    await panel.expand("Household employment tax");
    expect(panel.container.textContent).toContain("Review the FUTA wage test for 2025 and 2026.");
    await panel.click("Confirm alimony payments for 2026");
    expect(latest.sectionData.adjustments?.alimonyAmountsTaxYear).toBe(2026);
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await panel.click("Confirm household employment facts for 2026");
    expect(buildTaxInputFromGuidedData(latest)?.scheduleH?.employees[0]?.federalIncomeTaxWithheld).toBe("120.15");

    await panel.change("Alimony paid", "1200.30");
    expect(latest.sectionData.adjustments?.alimonyAmountsTaxYear).toBeNull();
    await panel.click("Confirm alimony payments for 2026");
    expect(buildTaxInputFromGuidedData(latest)?.adjustments?.alimonyPaid).toBe("1200.30");

    await panel.change("Employee federal income tax withheld", "100.30");
    expect(latest.sectionData["other-taxes"]?.householdAmountsTaxYear).toBeNull();
    await panel.click("Confirm household employment facts for 2026");
    expect(buildTaxInputFromGuidedData(latest)?.scheduleH?.employees[0]?.federalIncomeTaxWithheld).toBe("100.30");

    await panel.change("Alimony paid", "1,200.30");
    await panel.change("Employee cash wages", "3,234.56");
    expect(latest.sectionData.adjustments?.alimonyAmountsTaxYear).toBe(2026);
    expect(latest.sectionData["other-taxes"]?.householdAmountsTaxYear).toBe(2026);

    await panel.click("Remove employee #1");
    expect(latest.sectionData["other-taxes"]?.futaApplies).toBe(true);
    expect(buildTaxInputFromGuidedData(latest)).not.toBeNull();
    expect(buildTaxInputFromGuidedData(latest)?.scheduleH).toBeUndefined();
  } finally {
    await panel.dispose();
  }
});
