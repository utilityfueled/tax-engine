// Spec: spec/federal/form-8863.yaml, eligibility-household-ssn and eligibility-adult-student-tin.
import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

// Exercise enacted law in isolation while the public 2026 calculation gate stays closed.
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

function claim(primaryHousehold?: boolean, primaryEducation?: boolean, jointSpouse?: {
  household?: boolean;
  education?: boolean;
}) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      taxYear: 2026,
      filingStatus: jointSpouse ? "married_filing_jointly" : "single",
      primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: primaryHousehold },
      spouse: jointSpouse && {
        firstName: "Synthetic", lastName: "Filer", ssn: "999-88-6666", dateOfBirth: "1990-05-15",
        employmentValidSsnIssuedByDueDate: jointSpouse.household,
      },
    },
    w2s: [{
      ...simpleW2Fixture.w2s[0], accountHolder: "primary", wages: "50000", socialSecurityWages: "50000",
      socialSecurityWithheld: "3100", medicareWages: "50000", medicareWithheld: "725",
    }],
    educationExpenses: {
      primarySsnEligible: primaryEducation, spouseSsnEligible: jointSpouse?.education, claimedAsDependent: false,
      nonresidentAlien: false, aocBanInEffect: false, form8862Required: false, possessionIncomeExclusion: "0",
      aocStudents: [{
        name: "Jane Doe", studentRole: "primary", studentTaxId: "123-45-6789", studentTinEligible: true,
        qualifiedExpenses: "4000", institutionEligible: true, expensesEligibilityConfirmed: true,
        form1098TRequirementMet: true, institutionEin: "123456789", priorYearsClaimed: 0,
        completedFirstFourYearsBeforeYear: false, enrolledAtLeastHalfTime: true, pursuingDegreeOrCredential: true,
        felonyDrugConviction: false,
      }],
      llcExpenses: "0",
    },
  });
}

it.each([
  ["primary", false, true],
  ["primary", true, false],
  ["spouse", false, true],
  ["spouse", true, false],
] as const)("holds conflicting 2026 education and household SSN answers for the %s (%s, %s)", (person, household, education) => {
  const input = person === "primary" ? claim(household, education) : claim(false, false, { household, education });
  expect(() => calculateFederalTax(input))
    .toThrow(`Form 8863 ${person} employment-valid SSN answers conflict with the return household`);
});

it.each([
  [true, true],
  [true, undefined],
  [undefined, true],
])("uses a confirmed required SSN without inventing an unknown answer (%s, %s)", (household, education) => {
  const result = calculateFederalTax(claim(household, education));
  expect(result.form8863?.aocAfterPhaseOut.toString()).toBe("2500");
  expect(result.form8863?.totalRefundable.toString()).toBe("1000");
});

it("allows either joint spouse's confirmed SSN and denies the credit when both are ineligible", () => {
  const eligible = calculateFederalTax(claim(false, false, { household: true, education: true }));
  expect(eligible.form8863?.totalRefundable.toString()).toBe("1000");
  const ineligible = calculateFederalTax(claim(false, false, { household: false, education: false }));
  expect(ineligible.form8863?.aocAfterPhaseOut.toString()).toBe("0");
  expect(ineligible.form8863?.totalRefundable.toString()).toBe("0");
});

it("holds a conflicting spouse student SSN but accepts the spouse with actual timely TIN facts", () => {
  const input = claim(true, true, { household: false, education: false });
  const education = input.educationExpenses;
  const spouse = input.taxpayer.spouse;
  if (!education || !spouse) throw new Error("Expected the joint education fixture");
  const spouseStudent = { ...education.aocStudents[0], name: "Synthetic Filer", studentRole: "spouse" as const, studentTaxId: spouse.ssn };
  const calculate = (studentSsnEligible: boolean, studentTinEligible?: boolean) => calculateFederalTax({
    ...input, educationExpenses: { ...education, aocStudents: [{ ...spouseStudent, studentSsnEligible, studentTinEligible }] },
  });

  expect(() => calculate(true)).toThrow("Form 8863 spouse student employment-valid SSN answer conflicts with the return claimant facts");
  expect(calculate(false, true).form8863?.aocAfterPhaseOut.toString()).toBe("2500");
});

function adultStudentClaim(
  role: "primary" | "spouse",
  householdTin?: boolean,
  studentTin?: boolean,
  qualifiedExpenses = "4000",
) {
  const spouseIsStudent = role === "spouse";
  const input = claim(spouseIsStudent, spouseIsStudent, { household: !spouseIsStudent, education: !spouseIsStudent });
  const { educationExpenses: education, taxpayer } = input;
  const adult = taxpayer[role];
  if (!education || !adult) throw new Error("Expected the joint education fixture");

  return TaxYearInputSchema.parse({
    ...input,
    taxpayer: { ...taxpayer, [role]: { ...adult, tinIssuedByDueDate: householdTin } },
    educationExpenses: {
      ...education,
      aocStudents: [{
        ...education.aocStudents[0],
        name: `${adult.firstName} ${adult.lastName}`,
        studentRole: role,
        studentTaxId: adult.ssn,
        studentSsnEligible: false,
        studentTinEligible: studentTin,
        qualifiedExpenses,
      }],
    },
  });
}

it.each([
  ["primary", false, true],
  ["primary", true, false],
  ["spouse", false, true],
  ["spouse", true, false],
] as const)("holds conflicting 2026 timely TIN answers for the %s student (%s, %s)", (role, householdTin, studentTin) => {
  expect(() => calculateFederalTax(adultStudentClaim(role, householdTin, studentTin)))
    .toThrow(`Form 8863 ${role} student timely TIN answer conflicts with the return taxpayer record`);
});

it.each([
  [true, true, "4000", "2500"],
  [false, false, "4000", "0"],
  [undefined, true, "4000", "2500"],
  [false, true, "0", "0"],
] as const)("preserves matching, unknown, and zero-expense TIN facts (%s, %s, %s)", (householdTin, studentTin, expenses, credit) => {
  const result = calculateFederalTax(adultStudentClaim("spouse", householdTin, studentTin, expenses));
  expect(result.form8863?.aocAfterPhaseOut.toString()).toBe(credit);
});
