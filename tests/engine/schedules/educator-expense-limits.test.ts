// Spec: spec/federal/educator-expense-limits.yaml
import { expect, it } from "vitest";
import { calculateEducatorExpensesDeduction } from "@/engine/forms/educator-expenses";
import { TaxYearInputSchema } from "@/models/inputs";
import { simpleW2Fixture } from "../../fixtures/simple-w2";

function calculate(year: number, primary: string, spouse?: string, reimbursements = "0") {
  const educatorExpenseSources = [primary, ...(spouse === undefined ? [] : [spouse])].map((amount, index) => ({
    accountHolder: index === 0 ? "primary" : "spouse", taxYear: year, schoolYear: `${year - 1}-${year}`, sourceFactsConfirmed: true,
    schools: [{ name: "Actual school", role: "teacher", schoolEligible: true, hoursWorked: "900" }],
    expenses: [{ sourceId: `receipt-${index}`, datePaid: `${year}-03-01`, description: "Classroom materials", category: "classroom", amount, ordinaryAndNecessary: true, qualifyingUse: true, healthOrPhysicalEducation: false, deductedElsewhere: false }],
    reimbursementsNotInWages: reimbursements, excludedSavingsBondInterest: "0", nontaxableQualifiedTuitionProgramAmount: "0", nontaxableCoverdellEarnings: "0",
  }));
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, adjustments: { educatorExpenseSources } });
  return calculateEducatorExpensesDeduction(input.adjustments, spouse === undefined ? "single" : "married_filing_jointly", year);
}
it("applies the published educator cap separately for each tax year and spouse", () => {
  expect(calculate(2025, "500", "500").amount.toString()).toBe("600");
  const current = calculate(2026, "500", "500");
  expect(current.amount.toString()).toBe("700");
  expect(current.formula).toContain("350");
  expect(calculate(2026, "500", "200.01").amount.toString()).toBe("550.01");
  expect(calculate(2026, "500").amount.toString()).toBe("350");
  expect(calculate(2026, "0").amount.toString()).toBe("0");
});
it("preserves exact cents and zero at the educator expense cap", () => {
  for (const [amount, expected] of [["349.99", "349.99"], ["350", "350"], ["350.01", "350"], ["0", "0"]]) {
    expect(calculate(2026, amount!).amount.toString()).toBe(expected);
  }
  expect(calculate(2026, "100", undefined, "100.01").amount.toString()).toBe("0");
  expect(calculate(2025, "300.01").amount.toString()).toBe("300");
});
