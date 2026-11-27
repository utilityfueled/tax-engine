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

function withOriginalWages(state: GuidedFlowState, sourceTaxYear: "2025" | "2026") {
  return updateSectionData(state, "income-w2", { entries: [{
    ...completeW2Entry, sourceTaxYear, wages: "50000", socialSecurityWages: "50000", socialSecurityWithheld: "3100",
    medicareWages: "50000", medicareWithheld: "725",
  }] });
}

function educationInterview() {
  const state = withOriginalWages(startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2"], lifeEvents: [], stateCode: null }), "2025");
  const personal = state.sectionData["personal-info"];
  if (!personal) throw new Error("Missing personal facts");
  const morgan = { ...completeDependent, firstName: "Morgan", dateOfBirth: "2004-01-02", qualifiesForCTC: false, qualifiesForODC: true };
  const river = { ...morgan, ssn: "333-44-5556", firstName: "River", dateOfBirth: "2005-01-02" };
  state.sectionData["personal-info"] = { ...personal, dependentCount: "2", dependents: [morgan, river] };
  const first: EducationStudentData = {
    ...completeAocEligibility, name: "Morgan Example", studentRole: "dependent", studentTaxId: morgan.ssn,
    qualifiedExpenses: "4000", priorYearsClaimed: "0", requiresPriorYearsConfirmation: false,
  };
  state.sectionData.credits = {
    ...emptyCreditsData,
    education: { ...emptyCreditsData.education, ...completeEducationClaimant, aotcClaimantFactsTaxYear: 2025, aocStudents: [first] },
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

function confirmAotcClaimantYear(state: GuidedFlowState) {
  if (state.taxYear == null) throw new Error("Missing selected tax year");
  return updateEducation(state, { aotcClaimantFactsTaxYear: state.taxYear });
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
  it("holds a replacement 2026 AOTC school until its own receipts and eligibility are confirmed", () => {
    const start = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2"], lifeEvents: [], stateCode: null });
    const state = withOriginalWages({ ...start, taxYear: 2026 }, "2026");
    const [firstSchool] = completeAocEligibility.institutions;
    const secondSchool = { ...firstSchool, name: "Second College", address: "80 School Rd", ein: "23-4567890" };
    const student = { ...completeAocEligibility, name: "Jordan Example", qualifiedExpenses: "4000", priorYearsClaimed: "3" };
    const incompleteSecond = { name: "", address: "", ein: "", receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false };
    const initial = updateSectionData(state, "credits", { ...emptyCreditsData, education: {
      ...emptyCreditsData.education, ...completeEducationClaimant, aotcClaimantFactsTaxYear: 2026,
      aocStudents: [{ ...student, institutions: [firstSchool, incompleteSecond] }],
    } });
    const complete = { ...student, institutions: [firstSchool, secondSchool] };
    const entered = replaceStudents(initial, [complete]);
    expect(buildTaxInputFromGuidedData(entered)?.educationExpenses?.aocStudents[0].institutions).toEqual(complete.institutions);

    const replacement = { ...firstSchool, name: "Replacement College", ein: "98-7654321" };
    const changed = { ...complete, institutionEin: replacement.ein, institutions: [replacement, secondSchool] };
    const revised = reopen(replaceStudents(entered, [changed]));
    expect(buildTaxInputFromGuidedData(revised)).toBeNull();
    const pending = creditsFor(revised).education.aocStudents[0];
    expect(pending).toMatchObject({ institutionEin: replacement.ein, priorYearsClaimed: "3", enrolledAtLeastHalfTime: true,
      institutionEligible: null, expensesEligibilityConfirmed: null, form1098TRequirementMet: null,
      institutions: [{ ...replacement, receivedCurrentYear1098T: null, receivedPriorYear1098TWithBox7: null }, secondSchool],
    });
    expect(validateSection(revised, "credits").fieldErrors?.["student-0-institutions"]).toMatch(/both Form 1098-T receipt answers/i);

    const actual = { ...replacement, receivedCurrentYear1098T: false, receivedPriorYear1098TWithBox7: true };
    const confirmed = reopen(replaceStudents(revised, [{ ...pending, institutions: [actual, secondSchool],
      institutionEligible: true, expensesEligibilityConfirmed: true, form1098TRequirementMet: true }]));
    expect(buildTaxInputFromGuidedData(confirmed)?.educationExpenses?.aocStudents[0]).toMatchObject({
      institutions: [actual, secondSchool], priorYearsClaimed: 3, qualifiedExpenses: "4000",
    });

    const reviewed = replaceStudents(entered, [{ ...complete, sourceFactsConfirmed: true }]);
    const firstFormatted = { ...firstSchool, name: " Synthetic  College ", address: firstSchool.address.toUpperCase(), ein: "123456789" };
    const formatted = reopen(replaceStudents(reviewed, [{ ...complete, institutionEin: firstFormatted.ein, institutions: [secondSchool, firstFormatted] }]));
    expect(creditsFor(formatted).education.aocStudents[0].sourceFactsConfirmed).toBe(true);
    expect(buildTaxInputFromGuidedData(formatted)).not.toBeNull();

    const historical = educationInterview();
    const historicalEdit = reopen(replaceStudents(historical.state, [{ ...historical.first, institutionEin: replacement.ein, institutions: [replacement] }]));
    expect(calculateAotc(historicalEdit)).toBe("2500");
  });

  it("holds the revised 2026 AOTC expense after saving and reopening", () => {
    const starting = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2"], lifeEvents: [], stateCode: null });
    const starting2026 = withOriginalWages({ ...starting, taxYear: 2026 }, "2026");
    const student = { ...completeAocEligibility, name: "Jordan Example", qualifiedExpenses: "", priorYearsClaimed: "3" };
    const initial = updateSectionData(starting2026, "credits", { ...emptyCreditsData, education: {
      ...emptyCreditsData.education, ...completeEducationClaimant, aotcClaimantFactsTaxYear: 2026, aocStudents: [student],
    } });
    const entered = replaceStudents(initial, [{ ...student, qualifiedExpenses: "1000" }]);
    const entry = creditsFor(entered).education.aocStudents[0];
    expect(entry.expensesEligibilityConfirmed).toBe(true);
    expect(buildTaxInputFromGuidedData(entered)?.educationExpenses?.aocStudents[0].qualifiedExpenses).toBe("1000");

    const formatted = replaceStudents(entered, [{ ...entry, qualifiedExpenses: "1,000.00" }]);
    expect(creditsFor(formatted).education.aocStudents[0].expensesEligibilityConfirmed).toBe(true);
    expect(buildTaxInputFromGuidedData(formatted)).not.toBeNull();
    const explicitReview = replaceStudents(entered, [{ ...entry, sourceFactsConfirmed: true }]);
    const formattedReview = reopen(replaceStudents(explicitReview, [{ ...entry, qualifiedExpenses: "1,000.00" }]));
    expect(creditsFor(formattedReview).education.aocStudents[0].sourceFactsConfirmed).toBe(true);

    const revised = reopen(replaceStudents(formatted, [{ ...entry, qualifiedExpenses: "4000" }]));
    const pending = creditsFor(revised).education.aocStudents[0];
    expect(pending).toMatchObject({ qualifiedExpenses: "4000", priorYearsClaimed: "3" });
    expect(validateSection(revised, "credits").fieldErrors?.["student-0-expensesEligibilityConfirmed"])
      .toMatch(/confirm actual.*net qualified expenses/i);
    expect(buildTaxInputFromGuidedData(revised)).toBeNull();

    const confirmed = reopen(replaceStudents(revised, [{ ...pending, expensesEligibilityConfirmed: true }]));
    expect(buildTaxInputFromGuidedData(confirmed)?.educationExpenses?.aocStudents[0])
      .toMatchObject({ qualifiedExpenses: "4000", priorYearsClaimed: 3, expensesEligibilityConfirmed: true });

    const historical = educationInterview();
    const historicalEdit = replaceStudents(historical.state, [{ ...historical.first, qualifiedExpenses: "1000" }]);
    expect(calculateAotc(reopen(historicalEdit))).toBe("1000");
  });

  it("holds the same dependent's conflicting 2025 AOTC and ODC timely TIN answers after reopen", () => {
    const { state, first } = educationInterview();
    const personal = state.sectionData["personal-info"];
    if (!personal || !first.studentTaxId) throw new Error("Missing synthetic dependent student identity");
    const [matching, other] = personal.dependents;
    const student = { ...first, studentTaxId: first.studentTaxId.replaceAll("-", "") };
    const withDependent = (dependents: typeof personal.dependents) => updateSectionData(state, "personal-info", { ...personal, dependents });

    const conflicting = withDependent([{ ...matching, odcTinEligible: false }, other]);
    const reopened = reopen(replaceStudents(conflicting, [student]));
    expect(validateSection(reopened, "personal-info").status).toBe("complete");
    const creditFacts = validateSection(reopened, "credits");
    expect(creditFacts.status).toBe("partial");
    expect(creditFacts.fieldErrors?.["student-0-tin"]).toEqual(expect.stringMatching(/reconcile.*timely TIN.*Credit for Other Dependents/i));
    expect(creditFacts.message).not.toContain(student.studentTaxId);
    expect(buildTaxInputFromGuidedData(reopened)).toBeNull();

    const corrected = withDependent([matching, { ...other, odcTinEligible: false }]);
    expect(calculateAotc(reopen(replaceStudents(corrected, [student])))).toBe("2500");
    expect(calculateAotc(reopen(replaceStudents(corrected, [{ ...student, studentTinEligible: false }])))).toBe("0");
    expect(calculateAotc(reopen(replaceStudents(conflicting, [{ ...student, qualifiedExpenses: "0.00" }])))).toBe("0");
    const inactiveOdc = withDependent([{ ...matching, qualifiesForODC: false, odcTinEligible: false }, other]);
    expect(calculateAotc(reopen(replaceStudents(inactiveOdc, [student])))).toBe("2500");
  });

  it("holds a conflicting 2026 spouse claimant TIN when the primary is the student", () => {
    const starting = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["w2"], lifeEvents: [], stateCode: null });
    const base = withOriginalWages({ ...starting, taxYear: 2026 }, "2026");
    const personal = base.sectionData["personal-info"]!;
    const student = { ...completeAocEligibility, name: `${personal.firstName} ${personal.lastName}`, studentTaxId: personal.ssn,
      studentSsnEligible: false, qualifiedExpenses: "4000", priorYearsClaimed: "0" };
    function withSpouseTin(tinIssuedByDueDate: boolean) {
      const withPersonal = updateSectionData(base, "personal-info", {
        ...personal, employmentValidSsnIssuedByDueDate: false,
        spouse: { ...personal.spouse!, employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate },
      });
      return reopen(updateSectionData(withPersonal, "credits", { ...emptyCreditsData, education: {
        ...emptyCreditsData.education, ...completeEducationClaimant, primarySsnEligible: false,
        aotcClaimantFactsTaxYear: 2026, aocStudents: [student],
      } }));
    }
    const consistent = withSpouseTin(true);
    expect(validateSection(consistent, "credits").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(consistent)?.educationExpenses?.spouseSsnEligible).toBe(true);
    const conflicting = withSpouseTin(false);
    expect(validateSection(conflicting, "credits").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(conflicting)).toBeNull();
  });

  it("holds conflicting 2026 spouse student identity answers after reopen", () => {
    const starting = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["w2"], lifeEvents: [], stateCode: null });
    const base = withOriginalWages({ ...starting, taxYear: 2026 }, "2026");
    const personal = base.sectionData["personal-info"]!;
    const spouse = personal.spouse!;
    const student = {
      ...completeAocEligibility, name: `${spouse.firstName} ${spouse.lastName}`,
      studentTaxId: spouse.ssn, studentRole: "spouse" as const,
      studentTinEligible: undefined, qualifiedExpenses: "4000", priorYearsClaimed: "0",
    };
    function returnWithSpouseFacts(employmentSsn: boolean, timelyTin: boolean, studentFacts: Partial<EducationStudentData> = {}) {
      const withPersonal = updateSectionData(base, "personal-info", {
        ...personal, spouse: { ...spouse, employmentValidSsnIssuedByDueDate: employmentSsn, tinIssuedByDueDate: timelyTin },
      });
      return reopen(updateSectionData(withPersonal, "credits", {
        ...emptyCreditsData, education: { ...emptyCreditsData.education, ...completeEducationClaimant, spouseSsnEligible: employmentSsn,
          aotcClaimantFactsTaxYear: 2026, aocStudents: [{ ...student, ...studentFacts }] },
      }));
    }
    const consistent = returnWithSpouseFacts(true, true);
    expect(validateSection(consistent, "credits").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(consistent)?.educationExpenses?.aocStudents[0]?.studentSsnEligible).toBe(true);
    const otherSpouseQualifies = returnWithSpouseFacts(false, true, { studentSsnEligible: false, studentTinEligible: true });
    expect(validateSection(otherSpouseQualifies, "credits").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(otherSpouseQualifies)?.educationExpenses?.aocStudents[0]?.studentTinEligible).toBe(true);
    for (const [employmentSsn, timelyTin] of [[false, true], [true, false]] as const) {
      const conflicting = returnWithSpouseFacts(employmentSsn, timelyTin);
      expect(validateSection(conflicting, "credits").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(conflicting)).toBeNull();
    }
  });

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

    const changed = withOriginalWages(updateSectionData(reopen(setInterviewTaxYear(original, 2026)), "personal-info", original.sectionData["personal-info"]), "2026");
    const retained = creditsFor(changed).education.aocStudents[0];
    expect(retained).toMatchObject({ ...aoc, requiresPriorYearsConfirmation: true, sourceFactsConfirmed: null });
    expect(changed.sectionData.credits?.education.llcStudents?.[0]).toMatchObject({
      studentTaxId: llc.studentTaxId, qualifiedExpenses: llc.qualifiedExpenses, courseEligibilityConfirmed: null,
    });
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    const correctedHistory = replaceStudents(changed, [{ ...retained, priorYearsClaimed: "4", requiresPriorYearsConfirmation: false }]);
    expect(buildTaxInputFromGuidedData(reopen(correctedHistory))).toBeNull();
    const corrected = replaceStudents(correctedHistory, [{ ...retained, priorYearsClaimed: "4", requiresPriorYearsConfirmation: false, sourceFactsConfirmed: true }]);
    const current = confirmAotcClaimantYear(updateEducation(corrected, { ...completeEducationClaimant, llcStudents: [llc] }));
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopen(current)));
    expect(input.taxpayer.taxYear).toBe(2026);
    expect(input.educationExpenses?.aocStudents[0].priorYearsClaimed).toBe(4);
    expect(() => calculateFederalTax(input)).toThrow(/2026 rule pack.*incomplete/);

    expect(setInterviewTaxYear(current, 2025).sectionData.credits?.education.aocStudents[0])
      .toMatchObject({ priorYearsClaimed: "4", requiresPriorYearsConfirmation: true, sourceFactsConfirmed: null });
    const onlyLlc = updateEducation(original, { aocStudents: [], aocBanInEffect: undefined, form8862Required: undefined, refundableAocFacts: undefined });
    expect(setInterviewTaxYear(onlyLlc, 2026).sectionData.credits?.education.llcStudents?.[0]).toMatchObject({
      studentTaxId: llc.studentTaxId, qualifiedExpenses: llc.qualifiedExpenses, courseEligibilityConfirmed: null,
    });
  });

  it("rechecks shared claim facts after an AOTC-only saved year change", () => {
    const initial = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2"], lifeEvents: [], stateCode: null });
    const personal = initial.sectionData["personal-info"];
    if (!personal) throw new Error("Missing personal facts");
    const state = updateSectionData(initial, "personal-info", {
      ...personal, dateOfBirth: "2003-02-15",
      standardDeductionFacts: { ...personal.standardDeductionFacts, primaryCanBeClaimedAsDependent: true, dependentEarnedIncome: "50000" },
    });
    const first = { ...completeAocEligibility, name: "Jordan Example", qualifiedExpenses: "4000", priorYearsClaimed: "0",
      requiresPriorYearsConfirmation: false, sourceFactsConfirmed: true };
    const claimant = { ...completeEducationClaimant, canBeClaimedAsDependent: true,
      refundableAocFacts: { fullTimeStudent: true, earnedIncome: "50000", totalSupport: "120000", parentAlive: true } };
    const source = updateSectionData(withOriginalWages({ ...state, taxYear: 2026 }, "2026"), "credits", {
      ...emptyCreditsData,
      education: {
        ...emptyCreditsData.education, ...claimant, aocStudents: [first],
        claimedAsDependent: true, residentJointElection: false, aotcClaimantFactsTaxYear: 2026,
      },
    });
    expect(creditsFor(source).education.llcStudents ?? []).toHaveLength(0);
    expect(setInterviewTaxYear(source, 2026)).toBe(source);

    const switched = reopen(setInterviewTaxYear(source, 2025));
    const withCurrentIncome = withOriginalWages(updateSectionData(switched, "personal-info", state.sectionData["personal-info"]), "2025");
    const [retainedStudent] = creditsFor(withCurrentIncome).education.aocStudents;
    const reviewed = reopen(updateEducation(withCurrentIncome, {
      aocStudents: [{ ...retainedStudent, requiresPriorYearsConfirmation: false, sourceFactsConfirmed: true }],
      aocBanInEffect: false,
      form8862Required: false,
      refundableAocFacts: claimant.refundableAocFacts,
    }));
    expect(reviewed.taxYear).toBe(2025);
    expect(validateSection(reviewed, "credits")).toMatchObject({ status: "partial", fieldErrors: {
      claimedAsDependent: expect.any(String), primaryTinEligible: expect.any(String), educationPossessionExclusion: expect.any(String),
    } });
    expect(buildTaxInputFromGuidedData(reviewed)).toBeNull();
    expect(creditsFor(reviewed).education).toMatchObject({
      primarySsnEligible: null, spouseSsnEligible: null, primaryTinEligible: null,
      canBeClaimedAsDependent: null, claimedAsDependent: null, nonresidentAlien: null, residentJointElection: null,
    });
    expect(creditsFor(reviewed).education.possessionIncomeExclusion).toBeUndefined();

    const currentClaimant = reopen(confirmAotcClaimantYear(updateEducation(reviewed, claimant)));
    expect(validateSection(currentClaimant, "credits").status).toBe("complete");
    expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(currentClaimant)).educationExpenses?.possessionIncomeExclusion.toString()).toBe("0");
    expect(calculateAotc(currentClaimant)).toBe("2500");
    expect(calculateAotc(reopen(confirmAotcClaimantYear(updateEducation(currentClaimant, { claimedAsDependent: true }))))).toBe("0");

    const afterStudentRemoval = replaceStudents(source, []);
    expect(creditsFor(reopen(setInterviewTaxYear(afterStudentRemoval, 2025))).education.claimedAsDependent).toBeNull();
  });

  it("requires explicit selected-year claimant review for a legacy positive AOTC draft", () => {
    const { state, first, second } = educationInterview();
    const legacy = reopen(updateEducation(state, { aotcClaimantFactsTaxYear: undefined }));
    const expectedReview = { aotcClaimantFactsTaxYear: expect.stringMatching(/confirm.*2025/i) };
    expect(creditsFor(legacy).education.claimedAsDependent).toBe(false);
    expect(validateSection(legacy, "credits").fieldErrors).toMatchObject(expectedReview);
    expect(buildTaxInputFromGuidedData(legacy)).toBeNull();
    expect(validateSection(updateEducation(legacy, { aotcClaimantFactsTaxYear: 2026 }), "credits").fieldErrors)
      .toMatchObject(expectedReview);

    const mixed = updateEducation(legacy, { llcStudents: [{ ...second, qualifiedExpenses: "0", courseEligibilityConfirmed: false }] });
    expect(validateSection(reopen(mixed), "credits").fieldErrors).toMatchObject(expectedReview);
    expect(validateSection(replaceStudents(legacy, [{ ...first, qualifiedExpenses: "0.00" }]), "credits")
      .fieldErrors?.aotcClaimantFactsTaxYear).toBeUndefined();

    const reviewed = reopen(updateEducation(legacy, { aotcClaimantFactsTaxYear: 2025 }));
    expect(calculateAotc(reviewed)).toBe("2500");
    const reformatted = updateEducation(reviewed, { possessionIncomeExclusion: "0.00" });
    expect(creditsFor(reformatted).education.aotcClaimantFactsTaxYear).toBe(2025);
    const changed = reopen(updateEducation(reformatted, { possessionIncomeExclusion: "0.01" }));
    expect(creditsFor(changed).education.aotcClaimantFactsTaxYear).toBeUndefined();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    expect(calculateAotc(reopen(updateEducation(changed, { aotcClaimantFactsTaxYear: 2025 })))).toBe("2500");
    expect(creditsFor(reopen(setInterviewTaxYear(reviewed, 2026))).education.aotcClaimantFactsTaxYear).toBeUndefined();
  });

  it("does not reuse claimant review for a different taxpayer in the same year", () => {
    const { state } = educationInterview();
    const personal = state.sectionData["personal-info"];
    if (!personal) throw new Error("Missing personal facts");
    const reformatted = reopen(updateSectionData(state, "personal-info", { ...personal, ssn: personal.ssn.replaceAll("-", "") }));
    expect(creditsFor(reformatted).education.aotcClaimantFactsTaxYear).toBe(2025);
    expect(calculateAotc(reformatted)).toBe("2500");

    const differentTaxpayer = reopen(updateSectionData(state, "personal-info", { ...personal, firstName: "Lennox", ssn: "321-44-5555" }));
    expect(differentTaxpayer.taxYear).toBe(2025);
    expect(creditsFor(differentTaxpayer).education.aotcClaimantFactsTaxYear).toBeUndefined();
    expect(creditsFor(differentTaxpayer).education.aocStudents).toEqual(creditsFor(state).education.aocStudents);
    expect(buildTaxInputFromGuidedData(differentTaxpayer)).toBeNull();
    expect(calculateAotc(reopen(confirmAotcClaimantYear(differentTaxpayer)))).toBe("2500");

    const spouse = personal.spouse;
    if (!spouse) throw new Error("Missing synthetic spouse");
    const joint = { ...state, segmentation: { ...state.segmentation, filingStatus: "mfj" as const } };
    const differentSpouse = updateSectionData(joint, "personal-info", { ...personal, spouse: { ...spouse, ssn: "321-44-6666" } });
    expect(creditsFor(reopen(differentSpouse)).education.aotcClaimantFactsTaxYear).toBeUndefined();
  });

  it("requires actual claimant AOTC answers for the changed return year", () => {
    const { state, first, second } = educationInterview();
    const personal = state.sectionData["personal-info"]!;
    const source = updateEducation(withOriginalWages({ ...state, taxYear: 2026, sectionData: {
      ...state.sectionData, "personal-info": { ...personal, dateOfBirth: "2005-02-02" },
    } }, "2026"), {
      aocStudents: [{ ...first, priorYearsClaimed: "3" }],
      llcStudents: [{ ...second, qualifiedExpenses: "0", courseEligibilityConfirmed: false }],
      form8862Required: true, form8862Completed: true, refundableAocEligible: true,
      refundableAocFacts: { fullTimeStudent: true, earnedIncome: "15000", totalSupport: "18000", parentAlive: true },
    });
    const changed = withOriginalWages(updateSectionData(reopen(setInterviewTaxYear(source, 2025)), "personal-info", source.sectionData["personal-info"]), "2025");
    const education = creditsFor(changed).education;
    const currentStudent = { ...education.aocStudents[0], priorYearsClaimed: "3", requiresPriorYearsConfirmation: false, sourceFactsConfirmed: true };
    const reviewedStudents = replaceStudents(changed, [currentStudent]);
    expect(buildTaxInputFromGuidedData(reopen(reviewedStudents))).toBeNull();
    expect(validateSection(reviewedStudents, "credits").fieldErrors).toMatchObject({
      aocBanInEffect: expect.any(String), form8862Required: expect.any(String), refundableAocFacts: expect.any(String),
    });
    expect(education.form8862Completed).toBeUndefined();
    expect(education.refundableAocEligible).toBeUndefined();
    expect(education.llcStudents?.[0]).toMatchObject({
      studentTaxId: second.studentTaxId, qualifiedExpenses: "0", courseEligibilityConfirmed: null,
    });
    const currentClaimant = updateEducation(reviewedStudents, { ...completeEducationClaimant, aocBanInEffect: false, form8862Required: true,
      llcStudents: [{ ...second, qualifiedExpenses: "0", courseEligibilityConfirmed: false }],
      refundableAocFacts: { fullTimeStudent: true, earnedIncome: "1000", totalSupport: "20000", parentAlive: true },
    });
    expect(buildTaxInputFromGuidedData(currentClaimant)).toBeNull();
    const ready = confirmAotcClaimantYear(updateEducation(currentClaimant, { form8862Completed: true }));
    const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopen(ready))));
    expect(result.form8863?.aocAfterPhaseOut.toString()).toBe("2500");
    expect(result.form8863?.aocRefundable.toString()).toBe("0");

    const removed = replaceStudents(source, []);
    const changedWithoutStudents = withOriginalWages(updateSectionData(reopen(setInterviewTaxYear(removed, 2025)), "personal-info", source.sectionData["personal-info"]), "2025");
    expect(creditsFor(changedWithoutStudents).education.aocBanInEffect).toBeUndefined();
    expect(buildTaxInputFromGuidedData(replaceStudents(changedWithoutStudents, [currentStudent]))).toBeNull();
  });
});
