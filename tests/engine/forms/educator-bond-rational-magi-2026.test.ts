/** Spec: spec/federal/educator-bond-rational-magi.yaml isolated-current-year. */
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { educatorBondThirdsInput } from "../../fixtures/educator-bond-rational-magi.js";

it("preserves isolated current-year caps and independently entered itemized funding", () => {
  const input = educatorBondThirdsInput(), bond = input.savingsBondRedemptions?.[0];
  if (!bond?.incomeOwnership || !input.form8815) throw new Error("Missing fictional bond originals");
  input.taxpayer.taxYear = 2026;
  for (const statement of input.w2s) statement.accountHolder = "primary";
  bond.redemptionDate = "2026-06-01";
  bond.incomeOwnership.taxpayerPurchaseFunds = "1500";
  bond.incomeOwnership.spousePurchaseFunds = "1500";
  for (const expense of input.form8815.educationExpenses ?? []) expense.paidTaxYear = 2026;
  for (const source of input.adjustments?.educatorExpenseSources ?? []) {
    source.taxYear = 2026; source.schoolYear = "2025-2026";
    for (const expense of source.expenses ?? []) {
      expense.amount = "1000"; expense.datePaid = "2026-05-01";
      expense.instructionalActivity = true;
      expense.itemizedReimbursements = "0";
      expense.itemizedTaxFreeFunding = "500";
    }
  }
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.schedule1?.educatorExpenses.toFixed()).toBe("700");
  expect(result.scheduleA?.educatorExpenseDeduction.toFixed()).toBe("300");
  expect(result.form8815?.modifiedAGI.toFixed()).toBe("80300");
  expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("1000");
  expect(result.agi.toFixed()).toBe("79300");
  expect(JSON.stringify(input)).toBe(before);
  const receipt = input.adjustments?.educatorExpenseSources?.[0]?.expenses?.[0];
  if (!receipt) throw new Error("Missing actual educator receipt");
  receipt.datePaid = "2025-05-01";
  expect(() => calculateFederalTax(input)).toThrow(/year|date/i);
});
