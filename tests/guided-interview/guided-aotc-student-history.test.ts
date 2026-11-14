// Spec: spec/federal/guided-aotc-student-history.yaml
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import {
  emptyCreditsData, getGuidedFlowStorageKey, loadGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection,
  type EducationStudentData, type GuidedFlowState,
} from "@/lib/guided-interview-flow";
import {
  completeAocEligibility, completeDependent, completeEducationClaimant, completeW2Entry, startCompleteInterview,
} from "./complete-facts";

function educationInterview() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2"], lifeEvents: [], stateCode: null });
  const personal = state.sectionData["personal-info"];
  if (!personal) throw new Error("Missing personal facts");
  const morgan = { ...completeDependent, firstName: "Morgan", dateOfBirth: "2004-01-02", qualifiesForCTC: false, qualifiesForODC: true };
  const river = { ...morgan, ssn: "333-44-5556", firstName: "River", dateOfBirth: "2005-01-02" };
  state.sectionData["personal-info"] = { ...personal, dependentCount: "2", dependents: [morgan, river] };
  state.sectionData["income-w2"] = { entries: [{
    ...completeW2Entry, wages: "50000", socialSecurityWages: "50000", socialSecurityWithheld: "3100",
    medicareWages: "50000", medicareWithheld: "725",
  }] };
  const first: EducationStudentData = {
    ...completeAocEligibility, name: "Morgan Example", studentRole: "dependent", studentTaxId: morgan.ssn,
    qualifiedExpenses: "4000", priorYearsClaimed: "0", requiresPriorYearsConfirmation: false,
  };
  state.sectionData.credits = {
    ...emptyCreditsData,
    education: { ...emptyCreditsData.education, ...completeEducationClaimant, aocStudents: [first] },
  };
  return { state, first, second: { ...first, name: "River Example", studentTaxId: river.ssn } };
}

function creditsFor(state: GuidedFlowState) {
  const credits = state.sectionData.credits;
  if (!credits) throw new Error("Missing education facts");
  return credits;
}

function replaceStudents(state: GuidedFlowState, students: EducationStudentData[]) {
  return updateEducation(state, { aocStudents: students });
}

function updateEducation(state: GuidedFlowState, patch: Partial<ReturnType<typeof creditsFor>["education"]>) {
  const credits = creditsFor(state);
  return updateSectionData(state, "credits", { ...credits, education: { ...credits.education, ...patch } });
}

function reopen(state: GuidedFlowState) {
  const snapshot = JSON.stringify(state);
  const storage = { getItem: (key: string) => key === getGuidedFlowStorageKey("aotc") ? snapshot : null } as Storage;
  const restored = loadGuidedFlowState(storage, "aotc");
  if (!restored) throw new Error("Missing saved interview");
  return restored;
}

function calculateAotc(state: GuidedFlowState) {
  const input = buildTaxInputFromGuidedData(state);
  if (!input) throw new Error("Expected complete guided sources");
  return calculateFederalTax(TaxYearInputSchema.parse(input)).form8863?.aocAfterPhaseOut.toString();
}

describe("guided AOTC prior-claim history", () => {
  it("blocks reuse of a different student's zero before federal calculation", () => {
    const { state, first, second } = educationInterview();
    expect(calculateAotc(state)).toBe("2500");
    const replaced = replaceStudents(state, [second]);
    expect(replaced.sectionData.credits?.education.aocStudents[0]).toMatchObject({
      studentTaxId: second.studentTaxId, priorYearsClaimed: first.priorYearsClaimed, requiresPriorYearsConfirmation: true,
    });
    expect(validateSection(replaced, "credits").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(replaced)).toBeNull();

    const reassigned = replaceStudents(replaceStudents(state, [{ ...first, studentTaxId: "" }]), [second]);
    expect(buildTaxInputFromGuidedData(reassigned)).toBeNull();
    const historyAnswered = replaceStudents(replaced, [{ ...creditsFor(replaced).education.aocStudents[0], priorYearsClaimed: "4", requiresPriorYearsConfirmation: false }]);
    expect(validateSection(historyAnswered, "credits").fieldErrors).toHaveProperty("student-0-source-review");
    expect(buildTaxInputFromGuidedData(reopen(historyAnswered))).toBeNull();
    const confirmed = replaceStudents(historyAnswered, [{ ...creditsFor(historyAnswered).education.aocStudents[0], sourceFactsConfirmed: true }]);
    expect(calculateAotc(confirmed)).toBe("0");
  });

  it("preserves unchanged student facts and pending confirmations through saved replay", () => {
    const { state, first, second } = educationInterview();
    const updated = replaceStudents(state, [{ ...first, name: "Morgan A. Example", studentTaxId: "333445555", qualifiedExpenses: "4000.01" }]);
    expect(calculateAotc(reopen(updated))).toBe("2500");
    const pending = reopen(replaceStudents(state, [second]));
    expect(pending.sectionData.credits?.education.aocStudents[0]?.requiresPriorYearsConfirmation).toBe(true);
    expect(buildTaxInputFromGuidedData(pending)).toBeNull();
    const pendingStudent = creditsFor(pending).education.aocStudents[0];
    const reconfirmedZero = replaceStudents(pending, [{ ...pendingStudent, requiresPriorYearsConfirmation: false }]);
    expect(buildTaxInputFromGuidedData(reopen(reconfirmedZero))).toBeNull();
    const { sourceFactsConfirmed: _pending, ...replacement } = pendingStudent;
    const missingReview = replaceStudents(pending, [{ ...replacement, requiresPriorYearsConfirmation: false }]);
    expect(creditsFor(missingReview).education.aocStudents[0].sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(reopen(missingReview))).toBeNull();
    const reconfirmedSources = replaceStudents(reconfirmedZero, [{ ...pendingStudent, requiresPriorYearsConfirmation: false, sourceFactsConfirmed: true }]);
    expect(calculateAotc(reopen(reconfirmedSources))).toBe("2500");
    const missingCompletedReview = replaceStudents(reconfirmedSources, [{ ...replacement, requiresPriorYearsConfirmation: false }]);
    expect(creditsFor(missingCompletedReview).education.aocStudents[0].sourceFactsConfirmed).toBe(true);

    const secondWithHistory = { ...second, priorYearsClaimed: "4" };
    const remaining = replaceStudents(replaceStudents(state, [first, secondWithHistory]), [secondWithHistory]);
    expect(calculateAotc(remaining)).toBe("0");
    const legacy = reopen({ ...state, factsVersion: undefined });
    expect(legacy.sectionData.credits?.education.aocStudents[0]).toMatchObject({ priorYearsClaimed: "0", requiresPriorYearsConfirmation: true, sourceFactsConfirmed: null });
    expect(reopen(legacy)).toEqual(legacy);
    expect(buildTaxInputFromGuidedData(legacy)).toBeNull();

    const earlierPending = reopen(replaceStudents(state, [{ ...first, requiresPriorYearsConfirmation: true }]));
    const earlierStudent = creditsFor(earlierPending).education.aocStudents[0];
    expect(earlierStudent.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(replaceStudents(earlierPending, [{ ...earlierStudent, requiresPriorYearsConfirmation: false }]))).toBeNull();
  });

  it("requires new AOTC evidence when the return year changes", () => {
    const { state, first, second } = educationInterview();
    const aoc = { ...first, priorYearsClaimed: "3" };
    const llc = { ...second, qualifiedExpenses: "0", courseEligibilityConfirmed: false };
    const credits = creditsFor(state);
    const original = updateSectionData(state, "credits", { ...credits, education: { ...credits.education, aocStudents: [aoc], llcStudents: [llc] } });
    expect(calculateAotc(original)).toBe("2500");
    expect(setInterviewTaxYear(original, 2025)).toBe(original);

    const changed = reopen(setInterviewTaxYear(original, 2026));
    const retained = creditsFor(changed).education.aocStudents[0];
    expect(retained).toMatchObject({ ...aoc, requiresPriorYearsConfirmation: true, sourceFactsConfirmed: null });
    expect(changed.sectionData.credits?.education.llcStudents).toEqual([llc]);
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    const correctedHistory = replaceStudents(changed, [{ ...retained, priorYearsClaimed: "4", requiresPriorYearsConfirmation: false }]);
    expect(buildTaxInputFromGuidedData(reopen(correctedHistory))).toBeNull();
    const corrected = replaceStudents(correctedHistory, [{ ...retained, priorYearsClaimed: "4", requiresPriorYearsConfirmation: false, sourceFactsConfirmed: true }]);
    const current = updateEducation(corrected, { aocBanInEffect: false, form8862Required: false });
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopen(current)));
    expect(input.taxpayer.taxYear).toBe(2026);
    expect(input.educationExpenses?.aocStudents[0].priorYearsClaimed).toBe(4);
    expect(() => calculateFederalTax(input)).toThrow(/2026 rule pack.*incomplete/);

    expect(setInterviewTaxYear(current, 2025).sectionData.credits?.education.aocStudents[0])
      .toMatchObject({ priorYearsClaimed: "4", requiresPriorYearsConfirmation: true, sourceFactsConfirmed: null });
    const onlyLlc = updateEducation(original, { aocStudents: [], aocBanInEffect: undefined, form8862Required: undefined, refundableAocFacts: undefined });
    expect(setInterviewTaxYear(onlyLlc, 2026).sectionData.credits).toBe(onlyLlc.sectionData.credits);
  });

  it("requires actual claimant AOTC answers for the changed return year", () => {
    const { state, first, second } = educationInterview();
    const personal = state.sectionData["personal-info"]!;
    const source = updateEducation({ ...state, taxYear: 2026, sectionData: {
      ...state.sectionData, "personal-info": { ...personal, dateOfBirth: "2005-02-02" },
    } }, {
      aocStudents: [{ ...first, priorYearsClaimed: "3" }],
      llcStudents: [{ ...second, qualifiedExpenses: "0", courseEligibilityConfirmed: false }],
      form8862Required: true, form8862Completed: true, refundableAocEligible: true,
      refundableAocFacts: { fullTimeStudent: true, earnedIncome: "15000", totalSupport: "18000", parentAlive: true },
    });
    const changed = reopen(setInterviewTaxYear(source, 2025));
    const education = creditsFor(changed).education;
    const currentStudent = { ...education.aocStudents[0], priorYearsClaimed: "3", requiresPriorYearsConfirmation: false, sourceFactsConfirmed: true };
    const reviewedStudents = replaceStudents(changed, [currentStudent]);
    expect(buildTaxInputFromGuidedData(reopen(reviewedStudents))).toBeNull();
    expect(validateSection(reviewedStudents, "credits").fieldErrors).toMatchObject({
      aocBanInEffect: expect.any(String), form8862Required: expect.any(String), refundableAocFacts: expect.any(String),
    });
    expect(education.form8862Completed).toBeUndefined();
    expect(education.refundableAocEligible).toBeUndefined();
    expect(education.llcStudents).toEqual(creditsFor(source).education.llcStudents);
    const currentClaimant = updateEducation(reviewedStudents, { aocBanInEffect: false, form8862Required: true,
      refundableAocFacts: { fullTimeStudent: true, earnedIncome: "1000", totalSupport: "20000", parentAlive: true },
    });
    expect(buildTaxInputFromGuidedData(currentClaimant)).toBeNull();
    const ready = updateEducation(currentClaimant, { form8862Completed: true });
    const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopen(ready))));
    expect(result.form8863?.aocAfterPhaseOut.toString()).toBe("2500");
    expect(result.form8863?.aocRefundable.toString()).toBe("0");

    const removed = replaceStudents(source, []);
    const changedWithoutStudents = reopen(setInterviewTaxYear(removed, 2025));
    expect(creditsFor(changedWithoutStudents).education.aocBanInEffect).toBeUndefined();
    expect(buildTaxInputFromGuidedData(replaceStudents(changedWithoutStudents, [currentStudent]))).toBeNull();
  });
});
