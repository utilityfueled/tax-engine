// Spec: spec/federal/guided-input.yaml, education-student-source-records
import { describe, expect, it } from "vitest";
import { buildEducationInput } from "@/lib/guided-interview-bridge";
import { educationFactErrors } from "@/lib/guided-required-facts";
import { emptyCreditsData, type EducationCreditData } from "@/lib/guided-interview-flow";
import { EducationExpensesSchema } from "../../src/models/inputs";
import { completePersonalInfo } from "./complete-facts";

const institution = { name: "Actual College", address: "100 College Rd, Columbus OH 43215", ein: "12-3456789", receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false };
const student = { name: "Jordan Example", studentTaxId: "111-22-3333", studentRole: "primary" as const, qualifiedExpenses: "0.10", studentSsnEligible: true, studentTinEligible: true, institutionEligible: true, expensesEligibilityConfirmed: true, form1098TRequirementMet: true, institutions: [institution] };
const base: EducationCreditData = { aocStudents: [], llcExpenses: "", primarySsnEligible: true, primaryTinEligible: true, canBeClaimedAsDependent: false, claimedAsDependent: false, nonresidentAlien: false, aocBanInEffect: false, form8862Required: false, possessionIncomeExclusion: "0" };
describe("guided actual education source facts", () => {
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
    const data = { ...emptyCreditsData, education: { ...base, aocStudents: [aoc] } };
    expect(buildEducationInput(data, 2026, "single", completePersonalInfo)?.aocStudents[0].priorYearsClaimed).toBe(0);
    for (const field of ["studentTaxId", "studentRole", "institutionEligible", "expensesEligibilityConfirmed", "form1098TRequirementMet", "institutions"] as const) {
      const missing = { ...aoc }; delete missing[field];
      expect(() => buildEducationInput({ ...data, education: { ...data.education, aocStudents: [missing] } }, 2026, "single", completePersonalInfo)).toThrow();
    }
    expect(() => buildEducationInput({ ...data, education: { ...data.education, llcStudents: [{ ...student, courseEligibilityConfirmed: true }] } }, 2026, "single", completePersonalInfo)).toThrow(/one credit|duplicate/i);
    expect(() => buildEducationInput({ ...data, education: { ...data.education, aocStudents: [{ ...aoc, studentTaxId: "999-88-7777" }] } }, 2026, "single", completePersonalInfo)).toThrow(/household/i);
  });
  it("preserves actual under-24 refund facts and distinct 2025 timely TIN eligibility", () => {
    const aoc = { ...student, qualifiedExpenses: "4000", priorYearsClaimed: "0", completedFirstFourYearsBeforeYear: false, enrolledAtLeastHalfTime: true, pursuingDegreeOrCredential: true, felonyDrugConviction: false, institutionEin: "12-3456789", studentSsnEligible: undefined, studentTinEligible: false };
    const personal = { ...completePersonalInfo, dateOfBirth: "2005-02-01", employmentValidSsnIssuedByDueDate: false, tinIssuedByDueDate: false };
    const data = { ...emptyCreditsData, education: { ...base, primarySsnEligible: undefined, primaryTinEligible: false, aocStudents: [aoc] } };
    expect(() => buildEducationInput(data, 2025, "single", personal)).toThrow(/support|refund/i);
    const completed = { ...data, education: { ...data.education, refundableAocFacts: { fullTimeStudent: true, earnedIncome: "0", totalSupport: "9007199254740993.01", parentAlive: false } } };
    expect(buildEducationInput(completed, 2025, "single", personal)).toMatchObject({ primaryTinEligible: false, aocStudents: [{ studentTinEligible: false }], refundableAocFacts: { earnedIncome: "0", totalSupport: "9007199254740993.01", parentAlive: false } });
    expect(() => buildEducationInput({ ...completed, education: { ...completed.education, primaryTinEligible: undefined } }, 2025, "single", personal)).toThrow();
    expect(educationFactErrors({ ...completed, education: { ...completed.education, primarySsnEligible: false, spouseSsnEligible: true } }, 2026, "mfj", personal)).toEqual({});
  });
});
