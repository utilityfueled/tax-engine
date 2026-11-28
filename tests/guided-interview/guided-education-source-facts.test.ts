// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, education-student-source-records and education-2025-student-tin-reconciliation
import { describe, expect, it } from "vitest";
import { buildEducationInput, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { educationFactErrors } from "@/lib/guided-required-facts";
import { emptyCreditsData, loadGuidedFlowState, saveGuidedFlowState, updateSectionData, validateSection, type EducationCreditData } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal";
import { EducationExpensesSchema, TaxYearInputSchema } from "../../src/models/inputs";
import { completeAocEligibility, completeDependent, completeEducationClaimant, completePersonalInfo, completeW2Entry, startCompleteInterview } from "./complete-facts";

const institution = { name: "Actual College", address: "100 College Rd, Columbus OH 43215", ein: "12-3456789", receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false };
const student = { name: "Jordan Example", studentTaxId: "111-22-3333", studentRole: "primary" as const, qualifiedExpenses: "0.10", studentSsnEligible: true, studentTinEligible: true, institutionEligible: true, expensesEligibilityConfirmed: true, form1098TRequirementMet: true, institutions: [institution] };
const base: EducationCreditData = { aocStudents: [], llcExpenses: "", primarySsnEligible: true, primaryTinEligible: true, canBeClaimedAsDependent: false, claimedAsDependent: false, nonresidentAlien: false, aocBanInEffect: false, form8862Required: false, possessionIncomeExclusion: "0" };
describe("guided actual education source facts", () => {
  it.each(["primary", "spouse", "dependent"] as const)("binds the reopened 2026 %s student name to the return household", role => {
    function reopen(name: string) {
      const state = startCompleteInterview({ filingStatus: role === "spouse" ? "mfj" : "single", incomeTypes: [], lifeEvents: [], stateCode: null });
      state.taxYear = 2026;
      const personal = state.sectionData["personal-info"];
      if (!personal) throw new Error("Expected the return household fixture");
      if (role === "primary") personal.middleName = "Robin";
      const member = role === "spouse" ? personal.spouse : role === "dependent" ? completeDependent : personal;
      if (!member) throw new Error("Expected the student in the return household fixture");
      if (role === "dependent") {
        personal.dependentCount = "1";
        personal.dependents = [completeDependent];
      }
      const student = { ...completeAocEligibility, name, studentRole: role, studentTaxId: member.ssn, qualifiedExpenses: "4000", priorYearsClaimed: "0" };
      const entered = updateSectionData(state, "credits", { ...emptyCreditsData, education: {
        ...completeEducationClaimant, aotcClaimantFactsTaxYear: 2026, llcExpenses: "",
        aocStudents: role === "dependent" ? [] : [student],
        llcStudents: role === "dependent" ? [{ ...student, courseEligibilityConfirmed: true }] : [],
      } });
      expect(saveGuidedFlowState(localStorage, `fictional-2026-line-20-${role}`, entered)).toBe(true);
      const reopened = loadGuidedFlowState(localStorage, `fictional-2026-line-20-${role}`);
      if (!reopened) throw new Error("Expected the student draft to reopen");
      const education = reopened.sectionData.credits?.education;
      expect((education?.llcStudents?.[0] ?? education?.aocStudents[0])?.name).toBe(name);
      return reopened;
    }

    const expectedName = { primary: "Jordan R Example", spouse: "Taylor Example", dependent: "Alex Example" }[role];
    const matching = reopen(`  ${expectedName.toLowerCase().replace(" ", "  ")}  `);
    expect(validateSection(matching, "credits")).toMatchObject({ status: "complete", fieldErrors: {} });
    const canonical = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(matching));
    const education = canonical.educationExpenses;
    expect.soft((education?.llcStudents?.[0] ?? education?.aocStudents[0])?.name).toBe(expectedName);
    if (role === "primary") expect.soft(canonical.taxpayer.primary.firstName).toBe("Jordan R");

    const field = `${role === "dependent" ? "llc" : "student"}-0-name`;
    for (const name of ["Unrelated Person", ""]) {
      const held = reopen(name);
      expect.soft(validateSection(held, "credits")).toMatchObject({ status: "partial", fieldErrors: { [field]: expect.stringMatching(/student(?:'s)? name/i) } });
      expect.soft(buildTaxInputFromGuidedData(held)).toBeNull();
    }
  });
  it("reconciles actual LLC students and preserves zero and false qualification", () => {
    const data = { ...emptyCreditsData, education: { ...base, llcExpenses: "0.10", llcStudents: [{ ...student, courseEligibilityConfirmed: false }] } };
    expect(educationFactErrors(data, 2026, "single", completePersonalInfo)).toEqual({});
    const result = EducationExpensesSchema.parse(buildEducationInput(data, 2026, "single", completePersonalInfo));
    expect(result).toMatchObject({ possessionIncomeExclusion: "0", llcExpenses: "0.10", llcStudents: [{ studentTaxId: "111-22-3333", courseEligibilityConfirmed: false, institutions: [institution] }] });
    expect(() => buildEducationInput({ ...data, education: { ...data.education, llcExpenses: "0.11" } }, 2026, "single", completePersonalInfo)).toThrow(/reconcile/i);
    expect(() => buildEducationInput({ ...data, education: { ...data.education, llcStudents: undefined } }, 2026, "single", completePersonalInfo)).toThrow();
  });
  it("requires actual student identity qualification and institutions without inferring from expenses", () => {
    const aoc = { ...student, qualifiedExpenses: "4000", priorYearsClaimed: "0", completedFirstFourYearsBeforeYear: false, enrolledAtLeastHalfTime: true, pursuingDegreeOrCredential: true, felonyDrugConviction: false, institutionEin: "12-3456789" };
    const data = { ...emptyCreditsData, education: { ...base, aotcClaimantFactsTaxYear: 2026, aocStudents: [aoc] } };
    expect(buildEducationInput(data, 2026, "single", completePersonalInfo)?.aocStudents[0].priorYearsClaimed).toBe(0);
    for (const field of ["studentTaxId", "studentRole", "institutionEligible", "expensesEligibilityConfirmed", "form1098TRequirementMet", "institutions"] as const) {
      const missing = { ...aoc }; delete missing[field];
      expect(() => buildEducationInput({ ...data, education: { ...data.education, aocStudents: [missing] } }, 2026, "single", completePersonalInfo)).toThrow();
    }
    expect(() => buildEducationInput({ ...data, education: { ...data.education, llcStudents: [{ ...student, courseEligibilityConfirmed: true }] } }, 2026, "single", completePersonalInfo)).toThrow(/one credit|duplicate/i);
    expect(() => buildEducationInput({ ...data, education: { ...data.education, aocStudents: [{ ...aoc, studentTaxId: "999-88-7777" }] } }, 2026, "single", completePersonalInfo)).toThrow(/household/i);
    expect(() => buildEducationInput({ ...data, education: { ...data.education, canBeClaimedAsDependent: true } }, 2026, "single", completePersonalInfo)).toThrow(/reconcile/i);
  });
  it("requires every AOTC school EIN with or without a Form 1098-T", () => {
    const secondSchool = { ...institution, name: "Second College", ein: undefined, receivedCurrentYear1098T: false };
    const aoc = { ...student, ...completeAocEligibility, qualifiedExpenses: "4000", priorYearsClaimed: "0" };
    const aotc = (year: number, ein?: string) => ({ ...emptyCreditsData, education: { ...base, aotcClaimantFactsTaxYear: year, aocStudents: [{ ...aoc, institutions: [institution, { ...secondSchool, ein }] }] } });
    for (const year of [2025, 2026]) {
      expect(educationFactErrors(aotc(year), year, "single", completePersonalInfo)["student-0-institutions"]).toMatch(/AOTC.*EIN/i);
      expect(() => buildEducationInput(aotc(year, "98-76-54321"), year, "single", completePersonalInfo)).toThrow(/EIN/);
      const input = buildEducationInput(aotc(year, "98-7654321"), year, "single", completePersonalInfo);
      expect(input?.aocStudents[0]?.institutions?.[1]).toMatchObject({ ...secondSchool, ein: "98-7654321" });
      const { education } = aotc(year);
      const ineligible = { ...emptyCreditsData, education: { ...education, aocStudents: [{ ...aoc, priorYearsClaimed: "4", institutions: [institution, secondSchool] }] } };
      expect(buildEducationInput(ineligible, year, "single", completePersonalInfo)?.aocStudents[0]?.priorYearsClaimed).toBe(4);
    }
    const llcStudent = { ...student, institutions: [secondSchool], courseEligibilityConfirmed: true };
    const llc = { ...emptyCreditsData, education: { ...base, llcStudents: [llcStudent] } };
    expect(buildEducationInput(llc, 2026, "single", completePersonalInfo)?.llcStudents?.[0]?.institutions?.[0]?.ein).toBeUndefined();
    const llcWithStatement = { ...llc, education: { ...llc.education, llcStudents: [{ ...llcStudent, institutions: [{ ...secondSchool, receivedPriorYear1098TWithBox7: true }] }] } };
    expect(educationFactErrors(llcWithStatement, 2026, "single", completePersonalInfo)["llc-0-institutions"]).toMatch(/EIN/);
  });
  it("preserves actual under-24 refund facts and distinct 2025 timely TIN eligibility", () => {
    const aoc = { ...student, qualifiedExpenses: "4000", priorYearsClaimed: "0", completedFirstFourYearsBeforeYear: false, enrolledAtLeastHalfTime: true, pursuingDegreeOrCredential: true, felonyDrugConviction: false, institutionEin: "12-3456789", studentSsnEligible: undefined, studentTinEligible: false };
    const personal = { ...completePersonalInfo, dateOfBirth: "2005-02-01", employmentValidSsnIssuedByDueDate: false, tinIssuedByDueDate: false };
    const data = { ...emptyCreditsData, education: { ...base, aotcClaimantFactsTaxYear: 2025, primarySsnEligible: undefined, primaryTinEligible: false, aocStudents: [aoc] } };
    expect(() => buildEducationInput(data, 2025, "single", personal)).toThrow(/support|refund/i);
    const completed = { ...data, education: { ...data.education, refundableAocFacts: { fullTimeStudent: true, earnedIncome: "0", totalSupport: "9007199254740993.01", parentAlive: false } } };
    expect(buildEducationInput(completed, 2025, "single", personal)).toMatchObject({ primaryTinEligible: false, aocStudents: [{ studentTinEligible: false }], refundableAocFacts: { earnedIncome: "0", totalSupport: "9007199254740993.01", parentAlive: false } });
    expect(() => buildEducationInput({ ...completed, education: { ...completed.education, primaryTinEligible: undefined } }, 2025, "single", personal)).toThrow();
    expect(educationFactErrors({ ...completed, education: { ...completed.education, aotcClaimantFactsTaxYear: 2026, primarySsnEligible: false, spouseSsnEligible: true } }, 2026, "mfj", personal)).toEqual({});
  });
  it("holds conflicting 2025 spouse student TIN answers after save and reopen", () => {
    function reopen(householdTin: boolean | undefined, studentTin: boolean | undefined) {
      const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
      const spouse = state.sectionData["personal-info"]?.spouse;
      if (!spouse) throw new Error("Missing fictional spouse");
      spouse.tinIssuedByDueDate = householdTin;
      state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "60000", socialSecurityWages: "60000", socialSecurityWithheld: "3720", medicareWages: "60000", medicareWithheld: "870" }] };
      state.sectionData.credits = { ...emptyCreditsData, education: { ...completeEducationClaimant, aotcClaimantFactsTaxYear: 2025, llcExpenses: "", aocStudents: [{
        ...completeAocEligibility, name: "Taylor Example", studentRole: "spouse", studentTaxId: spouse.ssn.replaceAll("-", ""), studentTinEligible: studentTin,
        qualifiedExpenses: "4000", priorYearsClaimed: "0",
      }] } };
      const id = "fictional-2025-education-tin";
      expect(saveGuidedFlowState(localStorage, id, state)).toBe(true);
      const reopened = loadGuidedFlowState(localStorage, id);
      if (!reopened) throw new Error("Missing reopened fictional return");
      expect(reopened.sectionData["personal-info"]?.spouse?.tinIssuedByDueDate).toBe(householdTin);
      expect(reopened.sectionData.credits?.education?.aocStudents[0]?.studentTinEligible).toBe(studentTin);
      return reopened;
    }

    const conflicting = reopen(false, true);
    expect.soft(validateSection(conflicting, "credits").fieldErrors?.["student-0-tin"]).toMatch(/reconcile.*timely TIN/i);
    expect.soft(buildTaxInputFromGuidedData(conflicting)).toBeNull();
    expect(buildTaxInputFromGuidedData(reopen(true, undefined))).toBeNull();
    for (const [household, answer, aotc, refund] of [[false, false, "0", "0"], [undefined, true, "2500", "1000"]] as const) {
      const facts = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopen(household, answer)));
      const credit = calculateFederalTax(facts).form8863;
      expect(credit?.aocAfterPhaseOut.toFixed()).toBe(aotc);
      expect(credit?.totalRefundable.toFixed()).toBe(refund);
    }
  });
});
