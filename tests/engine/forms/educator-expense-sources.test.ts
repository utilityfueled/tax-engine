// Spec: spec/federal/educator-expense-sources.yaml
import { assert, expect, it } from "vitest";
import { calculateEducatorExpensesDeduction } from "@/engine/forms/educator-expenses";
import { TaxYearInputSchema } from "@/models/inputs";
import { simpleW2Fixture } from "../../fixtures/simple-w2";

export function educatorSource(change: Record<string, unknown> = {}) {
  return { accountHolder: "primary", taxYear: 2026, schoolYear: "2025-2026", sourceFactsConfirmed: true,
    schools: [{ name: "Actual public school", role: "teacher", schoolEligible: true, level: "k12", hoursWorked: "900" }],
    expenses: [{ sourceId: "receipt-1", datePaid: "2026-03-01", description: "Classroom materials", category: "classroom", amount: "500.15", ordinaryAndNecessary: true, qualifyingUse: true, healthOrPhysicalEducation: false, athleticSupplies: false, deductedElsewhere: false }],
    reimbursementsNotInWages: "20.05", excludedSavingsBondInterest: "10.02", nontaxableQualifiedTuitionProgramAmount: "150.04", nontaxableCoverdellEarnings: "20.01", ...change };
}
function calculate(sources: unknown[], extra: Record<string, unknown> = {}, joint = false, year = 2026) {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, adjustments: { ...extra, educatorExpenseSources: sources } });
  return calculateEducatorExpensesDeduction(input.adjustments, joint ? "married_filing_jointly" : "single", year);
}

it("uses actual owner and school-year hours without inferring eligibility", () => {
  expect(calculate([educatorSource()]).amount.toString()).toBe("300.03");
  const schools = [{ name: "First school", role: "teacher", schoolEligible: true, level: "k12", hoursWorked: "450" }, { name: "Second school", role: "aide", schoolEligible: true, level: "k12", hoursWorked: "450" }];
  expect(calculate([educatorSource({ schools })]).amount.toString()).toBe("300.03");
  for (const changed of [{ hoursWorked: "899.99" }, { schoolEligible: false }, { role: "other" }]) {
    expect(calculate([educatorSource({ schools: [{ ...schools[0], hoursWorked: "900", ...changed }] })]).amount.toString()).toBe("0");
  }
  expect(() => calculate([educatorSource({ schools: [{ ...schools[0], schoolEligible: undefined }] })])).toThrow(/school/i);
  expect(() => calculate([educatorSource({ accountHolder: "spouse" })])).toThrow(/joint/i);
});

it("holds indistinguishable positive 2026 school hours before either educator deduction", () => {
  const [originalSchool] = educatorSource().schools;
  assert.ok(originalSchool);
  const school = { ...originalSchool, hoursWorked: "450.25" };
  const repeated = { ...school, name: " actual   PUBLIC school ", hoursWorked: "450.2500" };
  const source = educatorSource({ reimbursementsNotInWages: "0", excludedSavingsBondInterest: "0",
    nontaxableQualifiedTuitionProgramAmount: "0", nontaxableCoverdellEarnings: "0" });
  const withSchools = (...schools: typeof school[]) => calculate([{ ...source, schools }]);
  expect(withSchools(school).amount.toFixed()).toBe("0");
  expect(() => withSchools(school, repeated)).toThrow(/reconcile repeated educator school hours/i);
  expect(() => withSchools({ ...school, role: "coach" }, { ...repeated, role: "coach" }))
    .toThrow(/reconcile repeated educator school hours/i);

  for (const result of [withSchools({ ...school, hoursWorked: "900.5" }),
    withSchools(school, { ...repeated, name: "Another actual school" }),
    withSchools(school, { ...repeated, role: "aide" }),
    withSchools(school, { ...repeated, hoursWorked: "449.75" })]) {
    expect(result.amount.toFixed()).toBe("350");
    expect(result.itemizedDeduction?.toFixed()).toBe("150.15");
  }
  const zero = { ...school, hoursWorked: "0" };
  expect(withSchools(school, zero, zero).amount.toFixed()).toBe("0");
});

it("reconciles exact qualified costs and education benefit reductions before each cap", () => {
  const source = educatorSource();
  const second = educatorSource({ accountHolder: "spouse", expenses: [{ ...source.expenses[0], sourceId: "spouse-receipt", amount: "9007199254740993.01" }], reimbursementsNotInWages: "9007199254740643", excludedSavingsBondInterest: "0", nontaxableQualifiedTuitionProgramAmount: "0", nontaxableCoverdellEarnings: "0" });
  expect(calculate([source, second], {}, true).amount.toString()).toBe("650.03");
  expect(calculate([educatorSource({ expenses: [{ ...source.expenses[0], healthOrPhysicalEducation: true, athleticSupplies: false }] })]).amount.toString()).toBe("0");
  expect(calculate([educatorSource({ expenses: [{ ...source.expenses[0], deductedElsewhere: true }] })]).amount.toString()).toBe("0");
  expect(calculate([educatorSource({ reimbursementsNotInWages: "1000" })]).amount.toString()).toBe("0");
  expect(calculate([educatorSource({ taxYear: 2025, schoolYear: "2024-2025", expenses: [{ ...source.expenses[0], datePaid: "2025-03-01" }] })], {}, false, 2025).amount.toString()).toBe("300");
});

it("keeps unknown zero and unsupported raw claims distinct", () => {
  for (const field of ["sourceFactsConfirmed", "reimbursementsNotInWages", "excludedSavingsBondInterest", "nontaxableQualifiedTuitionProgramAmount", "nontaxableCoverdellEarnings"]) expect(() => calculate([educatorSource({ [field]: undefined })])).toThrow();
  expect(() => calculate([educatorSource({ taxYear: 2025 })])).toThrow(/year/i);
  expect(() => calculate([educatorSource(), educatorSource()])).toThrow(/owner|duplicate/i);
  expect(() => calculate([educatorSource()], { primaryEducatorExpenses: "350" })).toThrow(/reconcile/i);
  expect(calculate([educatorSource()], { primaryEducatorExpenses: "300.03" }).amount.toString()).toBe("300.03");
  const zero = educatorSource({ expenses: [], reimbursementsNotInWages: "0", excludedSavingsBondInterest: "0", nontaxableQualifiedTuitionProgramAmount: "0", nontaxableCoverdellEarnings: "0" });
  expect(calculate([zero]).amount.toString()).toBe("0");
  expect(() => calculate([], { educatorExpenses: "300" })).toThrow(/actual.*source/i);
  expect(calculate([], { educatorExpenses: "0" }).amount.toString()).toBe("0");
  const receipt = educatorSource().expenses[0];
  for (const change of [{ sourceId: "" }, { datePaid: "2026-02-30" }, { datePaid: "2025-03-01" }, { amount: "-1" }, { ordinaryAndNecessary: undefined }, { category: undefined }, { healthOrPhysicalEducation: true, athleticSupplies: undefined }]) expect(() => calculate([educatorSource({ expenses: [{ ...receipt, ...change }] })])).toThrow();
  expect(() => calculate([educatorSource(), educatorSource({ accountHolder: "spouse" })], {}, true)).toThrow(/duplicate/i);
  expect(() => calculate([educatorSource({ expenses: undefined })])).toThrow(/expense records/i);
  expect(calculate([educatorSource({ expenses: [{ ...receipt, healthOrPhysicalEducation: true, athleticSupplies: true }] })]).amount.toString()).toBe("300.03");
  expect(calculate([educatorSource({ expenses: [{ ...receipt, category: "professional_development", healthOrPhysicalEducation: true, athleticSupplies: false }] })]).amount.toString()).toBe("300.03");
});
