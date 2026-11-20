// Spec: spec/federal/form-8863.yaml, 23-return-claim-history.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { parseInput } from "@/ingest/loader.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const student = {
  name: "Jane Doe",
  studentTaxId: "123-45-6789",
  studentRole: "primary" as const,
  qualifiedExpenses: "4000",
  studentTinEligible: true,
  institutionEligible: true,
  expensesEligibilityConfirmed: true,
  form1098TRequirementMet: true,
  institutionEin: "123456789",
  completedFirstFourYearsBeforeYear: false,
  enrolledAtLeastHalfTime: true,
  pursuingDegreeOrCredential: true,
  felonyDrugConviction: false,
};

const education = {
  aocStudents: [student],
  llcExpenses: "0",
  possessionIncomeExclusion: "0",
  primaryTinEligible: true,
  claimedAsDependent: false,
  nonresidentAlien: false,
  aocBanInEffect: false,
  form8862Required: false,
};

const dependent = {
  firstName: "Other",
  lastName: "Student",
  ssn: "234-56-7890",
  relationship: "child",
  dateOfBirth: "2006-05-01",
  monthsLivedWithYou: 12,
  qualifiesForCTC: false,
};

function parsedEducationReturn(
  input: NonNullable<TaxYearInput["educationExpenses"]> = education,
  wages = "50000",
  dependents: (typeof dependent)[] = [],
) {
  return parseInput({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, dependents },
    w2s: [{
      ...simpleW2Fixture.w2s[0], taxYear: 2025, wages, federalWithheld: "6000",
      socialSecurityWages: wages, socialSecurityWithheld: d(wages).times("0.062").toFixed(2),
      medicareWages: wages, medicareWithheld: d(wages).times("0.0145").toFixed(2),
    }],
    educationExpenses: input,
  });
}

it("requires an actual claimant birth date for refundable AOC on a short-year return", () => {
  const source = { ...education, aocStudents: [{ ...student, priorYearsClaimed: 0 }] };
  const calculate = (dateOfBirth: string, expenses: typeof education = source) => {
    const input = parsedEducationReturn(expenses);
    return calculateFederalTax({
      ...input,
      taxpayer: { ...input.taxpayer, primary: { ...input.taxpayer.primary, dateOfBirth } },
      standardDeductionFacts: { ...input.standardDeductionFacts, shortTaxYear: true },
    });
  };

  for (const date of ["2000-02-30", "2026-01-02", ""]) {
    expect(() => calculate(date), date).toThrow("Form8863 claimant birth date must be an actual calendar date in or before the return year");
  }
  expect(calculate("2002-01-01").form8863?.totalRefundable.toString()).toBe("1000");
  const llcOnly = calculate("2000-02-30", { ...education, aocStudents: [], llcExpenses: "5000" });
  expect(llcOnly.form8863?.totalNonrefundable.toString()).toBe("1000");
});

function auditedPriorClaims(result: ReturnType<typeof calculateFederalTax>) {
  return result.form8863?.lines.find(line => line.line === "30")?.inputs["Prior AOC years claimed"];
}

it("holds a parsed 2025 claim when actual prior AOC history is unknown", () => {
  const input = parsedEducationReturn();
  expect(input.educationExpenses?.aocStudents[0]?.priorYearsClaimed).toBeUndefined();
  expect(() => calculateFederalTax(input)).toThrow("Form 8863 requires actual prior AOC claim history for student 1");
});

it.each([
  { priorYearsClaimed: 0, tentative: "2500", refundable: "1000", nonrefundable: "1500" },
  { priorYearsClaimed: 3, tentative: "2500", refundable: "1000", nonrefundable: "1500" },
  { priorYearsClaimed: 4, tentative: "0", refundable: "0", nonrefundable: "0" },
])(
  "uses confirmed history of $priorYearsClaimed prior tax years for the parsed return",
  ({ priorYearsClaimed, tentative, refundable, nonrefundable }) => {
    const input = parsedEducationReturn({ ...education, aocStudents: [{ ...student, priorYearsClaimed }] });
    const result = calculateFederalTax(input);
    expect(result.form8863?.aocAfterPhaseOut.toString()).toBe(tentative);
    expect(result.form8863?.totalRefundable.toString()).toBe(refundable);
    expect(result.form8863?.totalNonrefundable.toString()).toBe(nonrefundable);
    expect(result.allLines.find(line => line.form === "1040" && line.line === "29")?.value.toString()).toBe(refundable);
    expect(auditedPriorClaims(result)?.toString()).toBe(priorYearsClaimed.toString());
  },
);

it("requires history independently for each potentially eligible student", () => {
  const input = parsedEducationReturn({ ...education, aocStudents: [
    { ...student, priorYearsClaimed: 0 },
    { ...student, name: "Other Student", studentTaxId: dependent.ssn, studentRole: "dependent" },
  ] }, "50000", [dependent]);
  expect(() => calculateFederalTax(input)).toThrow("Form 8863 requires actual prior AOC claim history for student 2");
});

it.each([
  { label: "completed the first four years", facts: { completedFirstFourYearsBeforeYear: true } },
  { label: "had a felony drug conviction", facts: { felonyDrugConviction: true } },
  { label: "paid zero expenses", facts: { qualifiedExpenses: "0" } },
  { label: "paid expenses that round below one dollar", facts: { qualifiedExpenses: "0.49" } },
  { label: "was below half-time", facts: { enrolledAtLeastHalfTime: false } },
])("keeps the independent LLC when the AOC student $label", ({ facts }) => {
  const input = parsedEducationReturn({
    ...education,
    aocStudents: [{ ...student, ...facts }],
    llcExpenses: "5000",
    llcStudents: [{
      name: "Other Student", studentTaxId: dependent.ssn, studentRole: "dependent", qualifiedExpenses: "5000",
      studentTinEligible: true, institutionEligible: true, expensesEligibilityConfirmed: true,
      form1098TRequirementMet: true, courseEligibilityConfirmed: true,
    }],
  }, "50000", [dependent]);
  const result = calculateFederalTax(input);
  expect(result.form8863?.aocAfterPhaseOut.toString()).toBe("0");
  expect(result.form8863?.totalRefundable.toString()).toBe("0");
  expect(result.form8863?.totalNonrefundable.toString()).toBe("1000");
  expect(auditedPriorClaims(result)).toBe("Unknown");
});

it("requires history when fifty cents rounds to one dollar of adjusted expenses", () => {
  const input = parsedEducationReturn({ ...education, aocStudents: [{ ...student, qualifiedExpenses: "0.50" }] });
  expect(() => calculateFederalTax(input)).toThrow("Form 8863 requires actual prior AOC claim history for student 1");
});

it("requires history during partial phase-out and applies half of the confirmed credit at $85,000 MAGI", () => {
  expect(() => calculateFederalTax(parsedEducationReturn(education, "85000")))
    .toThrow("Form 8863 requires actual prior AOC claim history for student 1");
  const confirmed = { ...education, aocStudents: [{ ...student, priorYearsClaimed: 0 }] };
  const result = calculateFederalTax(parsedEducationReturn(confirmed, "85000"));
  expect(result.form8863?.aocAfterPhaseOut.toString()).toBe("1250");
  expect(result.form8863?.totalRefundable.toString()).toBe("500");
  expect(result.form8863?.totalNonrefundable.toString()).toBe("750");
});

it("keeps a fully phased-out claim at zero despite unknown prior history", () => {
  const result = calculateFederalTax(parsedEducationReturn(education, "90000"));
  expect(result.form8863?.aocTotalTentative.toString()).toBe("0");
  expect(result.form8863?.aocAfterPhaseOut.toString()).toBe("0");
  expect(result.form8863?.totalRefundable.toString()).toBe("0");
  expect(auditedPriorClaims(result)).toBe("Unknown");
});
