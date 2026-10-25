// Spec: spec/federal/educator-expense-limits.yaml
import { expect, it } from "vitest";
import { calculateEducatorExpensesDeduction } from "@/engine/forms/educator-expenses";
import { TaxYearInputSchema } from "@/models/inputs";
import { simpleW2Fixture } from "../../fixtures/simple-w2";

function calculate(year: number, amounts: { educatorExpenses?: string; primaryEducatorExpenses?: string; spouseEducatorExpenses?: string }, joint = false) {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, adjustments: amounts });
  return calculateEducatorExpensesDeduction(input.adjustments, joint ? "married_filing_jointly" : "single", year);
}
it("applies the published educator cap separately for each tax year and spouse", () => {
  expect(calculate(2025, { primaryEducatorExpenses: "500", spouseEducatorExpenses: "500" }, true).amount.toString()).toBe("600");
  const current = calculate(2026, { primaryEducatorExpenses: "500", spouseEducatorExpenses: "500" }, true);
  expect(current.amount.toString()).toBe("700");
  expect(current.formula).toContain("350");
  expect(calculate(2026, { primaryEducatorExpenses: "500", spouseEducatorExpenses: "200.01" }, true).amount.toString()).toBe("550.01");
  expect(calculate(2026, { educatorExpenses: "500" }, true).amount.toString()).toBe("350");
  expect(calculate(2026, { primaryEducatorExpenses: "0", spouseEducatorExpenses: "500" }).amount.toString()).toBe("0");
});
it("preserves exact cents and zero at the educator expense cap", () => {
  for (const [amount, expected] of [["349.99", "349.99"], ["350", "350"], ["350.01", "350"], ["0", "0"], ["-0.01", "0"]]) {
    expect(calculate(2026, { educatorExpenses: amount }).amount.toString()).toBe(expected);
  }
  expect(calculate(2025, { educatorExpenses: "300.01" }).amount.toString()).toBe("300");
});
