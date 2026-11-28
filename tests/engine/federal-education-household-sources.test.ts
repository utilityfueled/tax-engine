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

it.each(["primary", "spouse", "dependent"] as const)("binds the 2026 %s education claim to the name on the return", role => {
  const input = claim(true, true, role === "spouse" ? { household: true, education: true } : undefined);
  const dependent = { firstName: "Morgan", lastName: "O'Example", ssn: "333-44-5555", relationship: "child",
    dateOfBirth: "2004-01-02", monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: false };
  input.taxpayer.dependents = role === "dependent" ? [dependent] : [];
  const member = role === "dependent" ? dependent : input.taxpayer[role];
  const education = input.educationExpenses;
  if (!member || !education) throw new Error("Expected the return student fixture");
  const expectedName = `${member.firstName} ${member.lastName}`;
  const source = { ...education.aocStudents[0], studentRole: role, studentTaxId: member.ssn, studentSsnEligible: true };
  const calculate = (name: string, taxYear = 2026, qualifiedExpenses = "4000") => calculateFederalTax(TaxYearInputSchema.parse({
    ...input, taxpayer: { ...input.taxpayer, taxYear }, educationExpenses: {
      ...education, primaryTinEligible: true, aocStudents: [{ ...source, name, qualifiedExpenses }],
    },
  })).form8863;
  const formatted = `  ${expectedName.toLowerCase().replace(" ", "  ")}  `;
  expect.soft(calculate(formatted)?.aocPerStudent[0]).toMatchObject({ name: expectedName });
  expect(calculate(expectedName)?.aocAfterPhaseOut.toFixed()).toBe("2500");
  const mismatched = role === "dependent" ? "Morgan OExample" : "Unrelated Person";
  for (const name of [mismatched, ""]) expect.soft(() => calculate(name)).toThrow(/student name.*on the return/i);
  expect(calculate(mismatched, 2025)?.aocAfterPhaseOut.toFixed()).toBe("2500");
  expect(calculate(mismatched, 2026, "0")?.aocAfterPhaseOut.toFixed()).toBe("0");
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
  taxYear = 2026,
) {
  const spouseIsStudent = role === "spouse";
  const input = claim(spouseIsStudent, spouseIsStudent, { household: !spouseIsStudent, education: !spouseIsStudent });
  const { educationExpenses: education, taxpayer } = input;
  const adult = taxpayer[role];
  if (!education || !adult) throw new Error("Expected the joint education fixture");

  return TaxYearInputSchema.parse({
    ...input,
    taxpayer: { ...taxpayer, taxYear, [role]: { ...adult, tinIssuedByDueDate: householdTin } },
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

it.each([
  ["primary", false, true],
  ["primary", true, false],
  ["spouse", false, true],
  ["spouse", true, false],
] as const)("holds conflicting 2025 timely TIN answers for the %s student (%s, %s)", (role, householdTin, studentTin) => {
  expect(() => calculateFederalTax(adultStudentClaim(role, householdTin, studentTin, "4000", 2025)))
    .toThrow(`Form 8863 ${role} student timely TIN answer conflicts with the return taxpayer record`);
});

it.each(["primary", "spouse"] as const)("uses a matched 2025 %s taxpayer's known negative TIN answer for both education credits", role => {
  function testCredit(householdTin?: boolean, matchingIdentity = true) {
    const input = adultStudentClaim(role, householdTin, undefined, "4000", 2025);
    const education = input.educationExpenses;
    if (!education?.aocStudents[0]) throw new Error("Expected the joint student fixture");
    const student = { ...education.aocStudents[0], studentTaxId: matchingIdentity ? input.taxpayer[role]?.ssn.replaceAll("-", "") : "998887777" };
    delete student.studentTinEligible;
    const aotcInput = { ...input, educationExpenses: {
      ...education, primaryTinEligible: true, aocStudents: [student],
    } };
    const llcInput = { ...input, educationExpenses: {
      ...education, aocStudents: [], llcExpenses: "4000", llcStudents: [{ ...student, courseEligibilityConfirmed: true }],
    } };
    const before = structuredClone([aotcInput, llcInput]);
    const aotc = calculateFederalTax(aotcInput).form8863;
    const llc = calculateFederalTax(llcInput).form8863;
    expect([aotcInput, llcInput]).toEqual(before);
    return [aotc?.aocAfterPhaseOut.toFixed(), aotc?.totalRefundable.toFixed(), llc?.totalNonrefundable.toFixed()];
  }
  expect(testCredit()).toEqual(["2500", "1000", "800"]);
  expect(testCredit(false, false)).toEqual(["2500", "1000", "800"]);
  expect(testCredit(false)).toEqual(["0", "0", "0"]);
});

it("reconciles 2025 taxpayer and student TINs with surrounding whitespace", () => {
  const input = adultStudentClaim("spouse", false, true, "4000", 2025);
  const { educationExpenses: education, taxpayer } = input;
  if (!education?.aocStudents[0] || !taxpayer.spouse) throw new Error("Expected the joint student fixture");
  const padded = {
    ...input,
    taxpayer: { ...taxpayer, spouse: { ...taxpayer.spouse, ssn: ` ${taxpayer.spouse.ssn} ` } },
    educationExpenses: { ...education, aocStudents: [{ ...education.aocStudents[0], studentTaxId: `${taxpayer.spouse.ssn.replaceAll("-", "")}  ` }] },
  };
  expect(() => calculateFederalTax(padded)).toThrow(/spouse student timely TIN answer conflicts/i);
  expect(() => calculateFederalTax({ ...padded, taxpayer: { ...padded.taxpayer, taxYear: 2026 } }))
    .toThrow(/student identity does not match the actual return household role/i);
});

it("holds affirmative 2025 dependent AOTC issuance contradicted by the same active ODC answer", () => {
  const input = claim(true, true);
  const education = input.educationExpenses;
  if (!education) throw new Error("Expected a synthetic education claim");
  const dependent = { firstName: "Morgan", lastName: "Example", ssn: "333-44-5555", relationship: "child",
    dateOfBirth: "2004-01-02", monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: true, odcTinEligible: false };
  const student = { ...education.aocStudents[0], name: "Morgan Example", studentRole: "dependent" as const,
    studentTaxId: "333445555", studentSsnEligible: true };
  const actual = TaxYearInputSchema.parse({ ...input,
    taxpayer: { ...input.taxpayer, taxYear: 2025, dependents: [dependent] },
    educationExpenses: { ...education, aocStudents: [student] },
  });
  const original = structuredClone(actual);
  const message = /^Form 8863: reconcile the dependent student's timely TIN answer with the Credit for Other Dependents answer\.$/i;
  expect(() => calculateFederalTax(actual)).toThrow(message);
  expect(actual).toEqual(original);

  function control(nextDependent: (typeof actual.taxpayer.dependents)[number] = dependent, nextStudent = student) {
    return calculateFederalTax(TaxYearInputSchema.parse({ ...actual,
      taxpayer: { ...actual.taxpayer, dependents: [nextDependent] },
      educationExpenses: { ...education, aocStudents: [nextStudent] },
    }));
  }
  expect(control({ ...dependent, odcTinEligible: true }).form8863?.aocAfterPhaseOut.toFixed()).toBe("2500");
  const deemedTimelyForOdc = control({ ...dependent, odcTinEligible: true }, { ...student, studentTinEligible: false });
  expect(deemedTimelyForOdc.form8863?.aocAfterPhaseOut.toFixed()).toBe("0");
  expect(deemedTimelyForOdc.childTaxCredit.toFixed()).toBe("500");
  expect(control({ ...dependent, odcTinEligible: undefined }).form8863?.aocAfterPhaseOut.toFixed()).toBe("2500");
  expect(control(dependent, { ...student, studentTinEligible: undefined }).form8863?.aocAfterPhaseOut.toFixed()).toBe("2500");
  expect(control({ ...dependent, qualifiesForODC: false }).form8863?.aocAfterPhaseOut.toFixed()).toBe("2500");
  expect(control({ ...dependent, ssn: "333-44-5556" }).form8863?.aocAfterPhaseOut.toFixed()).toBe("2500");
  expect(control(dependent, { ...student, qualifiedExpenses: "0.00" }).form8863?.aocAfterPhaseOut.toFixed()).toBe("0");
  const llc = calculateFederalTax({ ...actual, educationExpenses: { ...education, aocStudents: [], llcExpenses: "4000",
    llcStudents: [{ ...student, courseEligibilityConfirmed: true }] } });
  expect(llc.form8863?.totalNonrefundable.toFixed()).toBe("800");
  const current = TaxYearInputSchema.parse({ ...actual, taxpayer: { ...actual.taxpayer, taxYear: 2026 },
    educationExpenses: { ...education, aocStudents: [{ ...student, studentTaxId: dependent.ssn }] } });
  expect(calculateFederalTax(current).form8863?.aocAfterPhaseOut.toFixed()).toBe("2500");
});

it("keeps the 2026 explicit student TIN requirement when the household has an answer", () => {
  expect(() => calculateFederalTax(adultStudentClaim("spouse", false)))
    .toThrow(/actual student timely TIN facts required for2026/);
});

it("holds a 2026 student SSN contradicted by household TIN without a claimant SSN answer", () => {
  const input = adultStudentClaim("spouse", false);
  const { educationExpenses: education, taxpayer } = input;
  if (!education || !taxpayer.spouse) throw new Error("Expected the joint education fixture");
  const withStudentSsn = TaxYearInputSchema.parse({
    ...input,
    taxpayer: { ...taxpayer, spouse: { ...taxpayer.spouse, employmentValidSsnIssuedByDueDate: undefined } },
    educationExpenses: { ...education, spouseSsnEligible: undefined,
      aocStudents: [{ ...education.aocStudents[0], studentSsnEligible: true }] },
  });
  expect(() => calculateFederalTax(withStudentSsn)).toThrow(/student.*SSN.*timely TIN/i);
});

it("preserves the 2025 LLC student TIN rule without an AOTC claimant TIN requirement", () => {
  function llc(householdTin: boolean | undefined, studentTin: boolean) {
    const input = adultStudentClaim("spouse", householdTin, studentTin, "4000", 2025);
    const education = input.educationExpenses;
    if (!education?.aocStudents[0]) throw new Error("Expected the joint student fixture");
    return calculateFederalTax({ ...input, educationExpenses: {
      ...education, primaryTinEligible: false, aocStudents: [], llcExpenses: "4000",
      llcStudents: [{ ...education.aocStudents[0], courseEligibilityConfirmed: true }],
    } }).form8863?.totalNonrefundable.toFixed();
  }
  expect(llc(true, true)).toBe("800");
  expect(llc(undefined, true)).toBe("800");
  expect(llc(false, false)).toBe("0");
  expect(() => llc(false, true)).toThrow(/spouse student timely TIN answer conflicts/i);
});
