// Spec: spec/federal/guided-aotc-student-history.yaml, student-identity and saved-replay
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import {
  emptyCreditsData, getGuidedFlowStorageKey, loadGuidedFlowState, updateSectionData, validateSection,
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

function replaceStudents(state: GuidedFlowState, students: EducationStudentData[]) {
  const credits = state.sectionData.credits;
  if (!credits) throw new Error("Missing education facts");
  return updateSectionData(state, "credits", { ...credits, education: { ...credits.education, aocStudents: students } });
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
    const confirmed = replaceStudents(replaced, [{ ...second, priorYearsClaimed: "4", requiresPriorYearsConfirmation: false }]);
    expect(calculateAotc(confirmed)).toBe("0");
  });

  it("preserves unchanged student facts and pending confirmations through saved replay", () => {
    const { state, first, second } = educationInterview();
    const updated = replaceStudents(state, [{ ...first, name: "Morgan A. Example", studentTaxId: "333445555", qualifiedExpenses: "4000.01" }]);
    expect(calculateAotc(reopen(updated))).toBe("2500");
    const pending = reopen(replaceStudents(state, [second]));
    expect(pending.sectionData.credits?.education.aocStudents[0]?.requiresPriorYearsConfirmation).toBe(true);
    expect(buildTaxInputFromGuidedData(pending)).toBeNull();
    const reconfirmedZero = replaceStudents(pending, [{ ...second, requiresPriorYearsConfirmation: false }]);
    expect(calculateAotc(reopen(reconfirmedZero))).toBe("2500");

    const secondWithHistory = { ...second, priorYearsClaimed: "4" };
    const remaining = replaceStudents(replaceStudents(state, [first, secondWithHistory]), [secondWithHistory]);
    expect(calculateAotc(remaining)).toBe("0");
    const legacy = reopen({ ...state, factsVersion: undefined });
    expect(legacy.sectionData.credits?.education.aocStudents[0]).toMatchObject({ priorYearsClaimed: "0", requiresPriorYearsConfirmation: true });
    expect(buildTaxInputFromGuidedData(legacy)).toBeNull();
  });
});
