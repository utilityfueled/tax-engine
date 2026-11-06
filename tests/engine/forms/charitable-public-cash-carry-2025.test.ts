// Spec: spec/federal/charitable-public-cash-carry-2025.yaml
import { expect, it } from "vitest";
import { calculateCharitableCarryover } from "@/engine/forms/charitable-carryover.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import { syntheticPublicCashHistory } from "../../fixtures/charitable-carryover.js";
const zero = {
  cashPublic: d("0"), noncashPublic: d("0"), capitalGainPublic: d("0"),
  cashPrivate: d("0"), noncashPrivate: d("0"), capitalGainPrivate: d("0"),
};
function calculate(base: string, amount: string, current: Partial<typeof zero>) {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    charitableCarryoverSources: syntheticPublicCashHistory([{ taxYear: 2024, amount }]) });
  const original = JSON.stringify(input);
  const result = calculateCharitableCarryover(input, { contributionBase: d(base), current: { ...zero, ...current }, itemizes: true });
  expect(JSON.stringify(input)).toBe(original);
  return result;
}
it("applies the historical cash carry reduction to current ordinary property", () => {
  const result = calculate("100000", "40000", { noncashPublic: d("20000") });
  expect(result.currentNoncash.toString()).toBe("10000");
  expect(result.priorCashDeduction.toString()).toBe("40000");
  expect(result.totalDeduction.toString()).toBe("50000");
  expect(result.carryforwards).toEqual([{ sourceId: "current-noncash_50-noncash", taxYear: 2025,
    category: "noncash_50", medium: "noncash", amount: d("10000") }]);
});
it("uses current cash before prior cash without relabeling remaining property", () => {
  const result = calculate("100000", "30000", { cashPublic: d("40000"), noncashPublic: d("20000") });
  expect(result.currentCash.toString()).toBe("40000");
  expect(result.currentNoncash.toString()).toBe("0");
  expect(result.priorCashDeduction.toString()).toBe("20000");
  expect(result.totalDeduction.toString()).toBe("60000");
  expect(result.carryforwards).toEqual([
    { sourceId: "synthetic-cash-2024", taxYear: 2024, category: "cash_60", medium: "cash", amount: d("10000") },
    { sourceId: "current-noncash_50-noncash", taxYear: 2025, category: "noncash_50", medium: "noncash", amount: d("20000") },
  ]);
});
it("preserves cash and capital-property identity when total deductions coincide", () => {
  const result = calculate("50000", "20000", { capitalGainPublic: d("40000") });
  expect(result.currentNoncash.toString()).toBe("5000");
  expect(result.priorCashDeduction.toString()).toBe("20000");
  expect(result.totalDeduction.toString()).toBe("25000");
  expect(result.carryforwards).toEqual([{ sourceId: "current-capital_gain_30-noncash", taxYear: 2025,
    category: "capital_gain_30", medium: "noncash", amount: d("35000") }]);
});
it("retains exact FIFO expiry and standard-year absorption in a binding mixed return", () => {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    charitableCarryoverSources: syntheticPublicCashHistory([
      { taxYear: 2024, amount: "500.10" }, { taxYear: 2020, amount: "1000.20" },
    ]) });
  const current = { ...zero, cashPublic: d("500"), noncashPublic: d("10.50") };
  const itemized = calculateCharitableCarryover(input, { contributionBase: d("1000.49"), current, itemizes: true });
  const standard = calculateCharitableCarryover(input, { contributionBase: d("1000.49"), current, itemizes: false });
  expect(itemized.totalDeduction.toString()).toBe("600.294");
  expect(itemized.detail[0]).toMatchObject({ taxYear: 2020, treatedAsPaid: d("100.294"), amountExpired: d("899.906"), amountRemaining: d("0") });
  expect(itemized.detail[1]).toMatchObject({ taxYear: 2024, treatedAsPaid: d("0"), amountRemaining: d("500.10") });
  expect(itemized.carryforwards).toEqual([
    { sourceId: "synthetic-cash-2024", taxYear: 2024, category: "cash_60", medium: "cash", amount: d("500.10") },
    { sourceId: "current-noncash_50-noncash", taxYear: 2025, category: "noncash_50", medium: "noncash", amount: d("10.50") },
  ]);
  expect(standard.totalDeduction.toString()).toBe("0");
  expect(standard.priorTreatedAsPaid.toString()).toBe("100.294");
  expect(standard.detail.every(row => row.amountUsed.isZero())).toBe(true);
  expect(standard.carryforwards).toEqual(itemized.carryforwards);
  expect(standard.expired.eq(itemized.expired)).toBe(true);
});
