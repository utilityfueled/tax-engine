// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, llc-return-year and llc-edited-source-review.
import React from "react";
import { expect, it, vi } from "vitest";
import { GuidedInterviewShell } from "@/components/guided-interview/guided-interview-shell";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import {
  emptyCreditsData, getGuidedFlowStorageKey, loadGuidedFlowState, resumeInterviewAtSection,
  saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection,
} from "@/lib/guided-interview-flow";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { completeAocEligibility, completePersonalInfo, completeW2Entry, startCompleteInterview } from "../../guided-interview/complete-facts";
import { mountGuidedPanel } from "./guided-panel-dom";

const currentReceipt = "Did this student receive a current-year Form 1098-T from this institution?";
const priorReceipt = "Did this student receive a prior-year Form 1098-T with box 7 checked?";
const annualFields = [
  ["Is the institution eligible for the education credit?", "true"],
  ["Are actual payment timing, eligible costs and coordination with other education benefits confirmed?", "true"],
  ["Is the Form 1098-T requirement or a documented IRS exception satisfied?", "true"],
  ["Was the student's SSN, ITIN or ATIN issued by the return due date?", "true"],
  ["Are these postsecondary courses or courses to acquire or improve job skills?", "true"],
  ["Can another taxpayer claim you as a dependent?", "false"],
  ["Does another taxpayer actually claim you as a dependent on their return?", "false"],
  ["Were you a nonresident alien during the tax year?", "false"],
  ["Education MAGI Puerto Rico / American Samoa exclusion", "0"],
] as const;

const college = { ...completeAocEligibility.institutions[0], receivedCurrentYear1098T: false, receivedPriorYear1098TWithBox7: true };
const historicalCollege = { ...college, receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false };
const student = { ...completeAocEligibility, name: "Jordan Example", courseEligibilityConfirmed: true, qualifiedExpenses: "4000", institutions: [college] };
const household = { canBeClaimedAsDependent: false, claimedAsDependent: false, nonresidentAlien: false, primarySsnEligible: true, possessionIncomeExclusion: "0" };

function originalWages(year: 2025 | 2026) {
  return { entries: [{
    ...completeW2Entry, sourceTaxYear: String(year), wages: "50000", socialSecurityWages: "50000", socialSecurityWithheld: "3100",
    medicareWages: "50000", medicareWithheld: "725",
  }] };
}

function interview(year: 2025 | 2026) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  state.taxYear = year;
  state.sectionData["income-w2"] = originalWages(year);
  const withEducation = updateSectionData(state, "credits", {
    ...emptyCreditsData, education: { ...emptyCreditsData.education, ...household, llcExpenses: "4000", llcStudents: [student] },
  });
  return resumeInterviewAtSection(withEducation, "credits");
}

function saved(id: string) {
  const state = loadGuidedFlowState(localStorage, id);
  if (!state) throw new Error("Expected the saved fictional interview");
  return state;
}

function expectHistoricalReturn(state: ReturnType<typeof interview>) {
  expect(validateSection(state, "credits").status).toBe("complete");
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.taxpayer.taxYear).toBe(2025);
  expect(input.educationExpenses?.llcStudents?.[0]).toMatchObject({ qualifiedExpenses: "4000", institutions: [historicalCollege] });
  expect(calculateFederalTax(input).form8863?.totalNonrefundable.toFixed()).toBe("800");
}

it("requires selected-year LLC facts before completing credits or calculating", async () => {
  const record = createWorkspaceRecord("synthetic-llc-year-change");
  const state = interview(2026);
  expect(setInterviewTaxYear(state, 2026)).toBe(state);
  expect(saveGuidedFlowState(localStorage, record.id, state)).toBe(true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const elementScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: vi.fn(), configurable: true });
  const panel = await mountGuidedPanel(<GuidedInterviewShell workspace={record} onExitGuided={() => {}} />);
  try {
    expect(validateSection(saved(record.id), "credits").status).toBe("complete");
    expect(panel.control(currentReceipt).value).toBe("false");
    expect(panel.control(priorReceipt).value).toBe("true");
    await panel.change("Tax year for this interview", "2025");
    const pending = saved(record.id);
    expect(pending.taxYear).toBe(2025);
    expect(validateSection(pending, "credits").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(pending)).toBeNull();
    const personalConfirmed = updateSectionData(pending, "personal-info", completePersonalInfo);
    const payrollConfirmed = updateSectionData(personalConfirmed, "income-w2", originalWages(2025));
    expect(saveGuidedFlowState(localStorage, record.id, payrollConfirmed)).toBe(true);
    await panel.render(<GuidedInterviewShell key="reopened" workspace={record} onExitGuided={() => {}} />);
    for (const label of [currentReceipt, priorReceipt, ...annualFields.map(([label]) => label)]) {
      expect(panel.control(label).value, label).toBe("");
    }
    expect(panel.control("Student name").value).toBe(student.name);
    expect(panel.control("Institution name").value).toBe(college.name);
    expect(panel.control("Qualified tuition & expenses").value).toBe("4000");
    for (const [label, answer] of annualFields) await panel.change(label, answer);
    await panel.change(currentReceipt, "true");
    expect(validateSection(saved(record.id), "credits").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(saved(record.id))).toBeNull();
    await panel.change(priorReceipt, "false");
    expectHistoricalReturn(saved(record.id));
  } finally {
    await panel.dispose();
    scroll.mockRestore();
    vi.unstubAllGlobals();
    if (elementScroll) Object.defineProperty(HTMLElement.prototype, "scrollTo", elementScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    localStorage.removeItem(getGuidedFlowStorageKey(record.id));
  }
});

it("rechecks pre-v3 LLC drafts once and retains reconfirmed historical answers", () => {
  const id = "synthetic-legacy-llc-year";
  const legacy = { ...interview(2025), factsVersion: 2 as const };
  try {
    expect(saveGuidedFlowState(localStorage, id, legacy)).toBe(true);
    const pending = saved(id);
    expect(pending.factsVersion).toBe(3);
    expect(pending.taxYear).toBe(2025);
    expect(pending.sectionData.credits?.education.llcStudents?.[0]).toMatchObject({
      qualifiedExpenses: "4000", studentTaxId: student.studentTaxId, institutions: [{
        name: college.name, address: college.address, ein: college.ein, receivedCurrentYear1098T: null, receivedPriorYear1098TWithBox7: null,
      }],
    });
    expect(validateSection(pending, "credits").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(pending)).toBeNull();
    const credits = pending.sectionData.credits!;
    const confirmed = updateSectionData(pending, "credits", {
      ...credits, education: { ...credits.education, ...household, llcStudents: [{ ...student, institutions: [historicalCollege] }] },
    });
    expect(saveGuidedFlowState(localStorage, id, confirmed)).toBe(true);
    expectHistoricalReturn(saved(id));
  } finally {
    localStorage.removeItem(getGuidedFlowStorageKey(id));
  }
});

it("holds raw legacy LLC state before validating or building tax input", () => {
  const current = interview(2025);
  const credits = current.sectionData.credits!;
  const confirmed = updateSectionData(current, "credits", {
    ...credits, education: { ...credits.education, llcStudents: [{ ...student, institutions: [historicalCollege] }] },
  });
  for (const factsVersion of [2, undefined] as const) {
    const legacy = { ...confirmed, factsVersion };
    expect(buildTaxInputFromGuidedData(legacy)).toBeNull();
    expect(validateSection(legacy, "credits").status).toBe("partial");
  }
  expectHistoricalReturn(confirmed);
});

it("holds edited 2026 LLC originals after saving and reopening until reconfirmed", async () => {
  const record = createWorkspaceRecord("synthetic-llc-edited-originals");
  const state = interview(2026);
  expect(saveGuidedFlowState(localStorage, record.id, state)).toBe(true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const elementScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: vi.fn(), configurable: true });
  const paymentReview = annualFields[1][0];
  const panel = await mountGuidedPanel(<GuidedInterviewShell workspace={record} onExitGuided={() => {}} />);
  try {
    expect(buildTaxInputFromGuidedData(saved(record.id))).not.toBeNull();
    await panel.change("Institution name", "Replacement College");
    await panel.change("Institution EIN (required for AOTC or a received Form 1098-T)", "98-7654321");
    expect(validateSection(saved(record.id), "credits").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(saved(record.id))).toBeNull();
    await panel.render(<GuidedInterviewShell key="reopened-edited-school" workspace={record} onExitGuided={() => {}} />);
    expect(panel.control("Institution name").value).toBe("Replacement College");
    expect(panel.control("Institution EIN (required for AOTC or a received Form 1098-T)").value).toBe("98-7654321");
    for (const label of [currentReceipt, priorReceipt, ...annualFields.slice(0, 3).map(([label]) => label), annualFields[4][0]]) {
      expect(panel.control(label).value, label).toBe("");
    }
    for (const [label, value] of [...annualFields.slice(0, 3), annualFields[4]]) await panel.change(label, value);
    await panel.change(currentReceipt, "true");
    expect(buildTaxInputFromGuidedData(saved(record.id))).toBeNull();
    await panel.change(priorReceipt, "false");
    expect(buildTaxInputFromGuidedData(saved(record.id))?.educationExpenses?.llcStudents?.[0]?.institutions?.[0]).toMatchObject({
      name: "Replacement College", ein: "98-7654321", receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false,
    });

    await panel.change("Qualified tuition & expenses", "9000.01");
    await panel.change("Saved Lifetime Learning total to reconcile", "9000.01");
    await panel.render(<GuidedInterviewShell key="reopened-edited-tuition" workspace={record} onExitGuided={() => {}} />);
    expect(panel.control(paymentReview).value).toBe("");
    expect(panel.control(currentReceipt).value).toBe("true");
    expect(panel.control(priorReceipt).value).toBe("false");
    expect(buildTaxInputFromGuidedData(saved(record.id))).toBeNull();
    await panel.change(paymentReview, "true");
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved(record.id)));
    expect(input.educationExpenses?.llcStudents?.[0]?.qualifiedExpenses).toBe("9000.01");
  } finally {
    await panel.dispose();
    scroll.mockRestore();
    vi.unstubAllGlobals();
    if (elementScroll) Object.defineProperty(HTMLElement.prototype, "scrollTo", elementScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    localStorage.removeItem(getGuidedFlowStorageKey(record.id));
  }
});

it("preserves LLC answers for unchanged records after row movement and unrelated edits", () => {
  const state = interview(2026);
  const credits = state.sectionData.credits!;
  const secondInstitution = { ...historicalCollege, name: "Second College", ein: "33-4455667" };
  const firstStudent = { ...student, institutions: [college, secondInstitution] };
  const secondStudent = { ...student, name: "Another Student", studentTaxId: "222-33-4444", studentRole: "dependent" as const };
  const empty = updateSectionData(state, "credits", { ...credits, education: { ...credits.education, llcStudents: [] } });
  const original = updateSectionData(empty, "credits", { ...credits, education: { ...credits.education, llcStudents: [firstStudent, secondStudent] } });
  const movedStudent = { ...firstStudent, studentTaxId: "111223333", qualifiedExpenses: "4,000.00", institutions: [secondInstitution, { ...college, ein: "123456789" }] };
  const reordered = [secondStudent, movedStudent];
  const moved = updateSectionData(original, "credits", {
    ...credits, dependentCare: { ...credits.dependentCare, expenses: "0" },
    education: { ...credits.education, llcExpenses: "", llcStudents: reordered },
  });
  expect(moved.sectionData.credits?.education.llcStudents).toEqual(reordered);

  const corrected = { ...secondInstitution, name: "Corrected College", ein: "44-5566778" };
  const changed = updateSectionData(moved, "credits", { ...credits, education: { ...credits.education, llcStudents: [
    { ...movedStudent, institutions: [corrected, movedStudent.institutions[1]] },
  ] } });
  expect(changed.sectionData.credits?.education.llcStudents).toEqual([{
    ...movedStudent, institutionEligible: null, expensesEligibilityConfirmed: null, form1098TRequirementMet: null,
    courseEligibilityConfirmed: null, institutions: [{ ...corrected, receivedCurrentYear1098T: null, receivedPriorYear1098TWithBox7: null }, movedStudent.institutions[1]],
  }]);
});

it("clears stale receipts when an LLC school edit creates an ambiguous matching record", () => {
  const state = interview(2026);
  const credits = state.sectionData.credits!;
  const second = { ...historicalCollege, ein: "33-4455667" };
  const unaffected = { ...historicalCollege, name: "Third College", ein: "44-5566778" };
  state.sectionData.credits = { ...credits, education: { ...credits.education, llcStudents: [{ ...student, institutions: [college, second, unaffected] }] } };
  const updated = updateSectionData(state, "credits", {
    ...credits, education: { ...credits.education, llcStudents: [{ ...student, institutions: [college, { ...second, ein: college.ein }, unaffected] }] },
  });
  expect(updated.sectionData.credits?.education.llcStudents?.[0]?.institutions).toEqual([
    { ...college, receivedCurrentYear1098T: null, receivedPriorYear1098TWithBox7: null },
    { ...college, receivedCurrentYear1098T: null, receivedPriorYear1098TWithBox7: null },
    unaffected,
  ]);
});

it("keeps an LLC student replacement pending after resolving a duplicate identity", () => {
  const state = interview(2026);
  const credits = state.sectionData.credits!;
  const first = { ...student, studentRole: "dependent" as const };
  const second = { ...first, name: "Second Student", studentTaxId: "222-33-4444", institutions: [historicalCollege] };
  state.sectionData.credits = { ...credits, education: { ...credits.education, llcStudents: [first, second] } };
  const duplicate = updateSectionData(state, "credits", {
    ...credits, education: { ...credits.education, llcStudents: [first, { ...second, studentTaxId: first.studentTaxId }] },
  });
  const editedCredits = duplicate.sectionData.credits!;
  const corrected = updateSectionData(duplicate, "credits", {
    ...editedCredits, education: { ...editedCredits.education, llcStudents: editedCredits.education.llcStudents!.slice(1) },
  });
  expect(corrected.sectionData.credits?.education.llcStudents?.[0]).toMatchObject({
    name: second.name, studentTaxId: first.studentTaxId, studentTinEligible: null, form1098TRequirementMet: null,
    institutions: [{ ...historicalCollege, receivedCurrentYear1098T: null, receivedPriorYear1098TWithBox7: null }],
  });
});
