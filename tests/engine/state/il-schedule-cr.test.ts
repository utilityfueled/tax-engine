/**
 * Tests for Illinois Schedule CR — Credit for Tax Paid to Other States
 * Spec: spec/state/il-schedule-cr.yaml
 *
 * Credit = min(tax paid to other state, IL tax × (non-IL income / total income))
 * Source: Illinois Department of Revenue, 2025 Schedule CR Instructions; Publication 111
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleCR, type ScheduleCRComputedInput } from "@/engine/state/il-schedule-cr.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = d(0);

function makeInput(overrides: Partial<ScheduleCRComputedInput> = {}): ScheduleCRComputedInput {
  return {
    taxYear: 2025,
    totalBaseIncome: d(75000),
    nonIllinoisBaseIncome: d(25000),
    taxPaidToOtherStates: d(1000),
    ilIncomeTax: d(3571),
    ...overrides,
  };
}

describe("Illinois Schedule CR", () => {
  // ==================== Lines 42: Base Income Totals ====================

  it("Schedule CR Line 42 - base income totals flow through", () => {
    const result = calculateScheduleCR(makeInput());
    expect(result.totalBaseIncome.toNumber()).toBe(75000);
    expect(result.nonIllinoisBaseIncome.toNumber()).toBe(25000);
  });

  it("Schedule CR Line 42b - non-Illinois base income flows through", () => {
    const result = calculateScheduleCR(makeInput({ nonIllinoisBaseIncome: d(18000) }));
    expect(result.nonIllinoisBaseIncome.toNumber()).toBe(18000);
  });

  // ==================== Line 43: Decimal Computation ====================

  it("Schedule CR Line 43 - decimal computation", () => {
    // 25000 / 75000 = 0.3333
    const result = calculateScheduleCR(makeInput());
    expect(result.crDecimal.toNumber()).toBe(0.3333);
  });

  it("Schedule CR Line 43 - decimal capped at 1.0", () => {
    // Non-IL income > total income → capped at 1.0
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: d(50000),
      nonIllinoisBaseIncome: d(60000),
    }));
    expect(result.crDecimal.toNumber()).toBe(1);
  });

  it("Schedule CR Line 43 - decimal is zero when total income is zero", () => {
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: ZERO,
      nonIllinoisBaseIncome: ZERO,
    }));
    expect(result.crDecimal.toNumber()).toBe(0);
  });

  it("Schedule CR Line 43 - decimal is zero when total income is negative", () => {
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: d(-5000),
      nonIllinoisBaseIncome: d(1000),
    }));
    expect(result.crDecimal.toNumber()).toBe(0);
  });

  it("Schedule CR Line 43 - decimal rounds to 4 decimal places", () => {
    // 10000 / 30000 = 0.33333... → rounds to 0.3333
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: d(30000),
      nonIllinoisBaseIncome: d(10000),
    }));
    expect(result.crDecimal.toNumber()).toBe(0.3333);
  });

  it("Schedule CR Line 43 - decimal with 4-place rounding up", () => {
    // 10000 / 60000 = 0.16666... → rounds to 0.1667
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: d(60000),
      nonIllinoisBaseIncome: d(10000),
    }));
    expect(result.crDecimal.toNumber()).toBe(0.1667);
  });

  it("Schedule CR Line 43 - all income is non-IL → decimal is 1.0", () => {
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: d(75000),
      nonIllinoisBaseIncome: d(75000),
    }));
    expect(result.crDecimal.toNumber()).toBe(1);
  });

  it("Schedule CR Line 43 - no non-IL income → decimal is 0", () => {
    const result = calculateScheduleCR(makeInput({
      nonIllinoisBaseIncome: ZERO,
    }));
    expect(result.crDecimal.toNumber()).toBe(0);
  });

  // ==================== Line 50: Final Decimal ====================

  it("Schedule CR Line 50 - final decimal equals Line 43 for residents", () => {
    const result = calculateScheduleCR(makeInput());
    expect(result.crDecimal.toNumber()).toBe(0.3333);
  });

  // ==================== Lines 51-52: Inputs ====================

  it("Schedule CR Line 51 - tax paid to other states", () => {
    const result = calculateScheduleCR(makeInput({ taxPaidToOtherStates: d(2500) }));
    expect(result.taxPaidToOtherStates.toNumber()).toBe(2500);
  });

  it("Schedule CR Line 51 - reciprocal state wage tax is excluded when detailed entries are provided", () => {
    const result = calculateScheduleCR(makeInput({
      taxPaidToOtherStates: d(2500),
      taxEntries: [
        {
          jurisdiction: "Wisconsin",
          taxPaid: d(900),
          incomeType: "wages",
        },
        {
          jurisdiction: "Indiana",
          taxPaid: d(1600),
          incomeType: "other",
        },
      ],
    }));

    expect(result.taxPaidToOtherStates.toNumber()).toBe(1600);
    expect(result.credit.toNumber()).toBe(1190);
  });

  it("Schedule CR Line 51 - reciprocal state local wage tax remains creditable", () => {
    const result = calculateScheduleCR(makeInput({
      taxPaidToOtherStates: d(2500),
      taxEntries: [
        {
          jurisdiction: "Kentucky",
          taxPaid: d(300),
          incomeType: "wages",
          taxingAuthority: "local",
        },
        {
          jurisdiction: "Indiana",
          taxPaid: d(700),
          incomeType: "other",
        },
      ],
    }));

    expect(result.taxPaidToOtherStates.toNumber()).toBe(1000);
    expect(result.credit.toNumber()).toBe(1000);
  });

  it("Schedule CR Line 51 - dual resident reciprocal state income tax remains creditable", () => {
    const result = calculateScheduleCR(makeInput({
      taxPaidToOtherStates: d(2500),
      taxEntries: [
        {
          jurisdiction: "Michigan",
          taxPaid: d(850),
          incomeType: "wages",
          dualResident: true,
        },
      ],
    }));

    expect(result.taxPaidToOtherStates.toNumber()).toBe(850);
    expect(result.credit.toNumber()).toBe(850);
  });

  it("Schedule CR Line 52 - IL income tax", () => {
    const result = calculateScheduleCR(makeInput({ ilIncomeTax: d(5000) }));
    expect(result.ilIncomeTax.toNumber()).toBe(5000);
  });

  // ==================== Line 53: IL Tax on Non-IL Income ====================

  it("Schedule CR Line 53 - IL tax on non-IL income", () => {
    // Decimal = 0.3333, IL tax = 3571
    // IL tax on non-IL income = 0.3333 × 3571 = 1190.2743 → rounds to 1190
    const result = calculateScheduleCR(makeInput());
    expect(result.ilTaxOnNonIlIncome.toNumber()).toBe(1190);
  });

  it("Schedule CR Line 53 - IL tax on non-IL income with high ratio", () => {
    // 50000 / 75000 = 0.6667, IL tax = 3571
    // 0.6667 × 3571 = 2380.5257 → rounds to 2381
    const result = calculateScheduleCR(makeInput({
      nonIllinoisBaseIncome: d(50000),
    }));
    expect(result.ilTaxOnNonIlIncome.toNumber()).toBe(2381);
  });

  it("Schedule CR Line 53 - IL tax is zero when decimal is zero", () => {
    const result = calculateScheduleCR(makeInput({
      nonIllinoisBaseIncome: ZERO,
    }));
    expect(result.ilTaxOnNonIlIncome.toNumber()).toBe(0);
  });

  // ==================== Line 54: Credit Computation ====================

  it("Schedule CR Line 54 - credit is lesser of tax paid vs IL tax (tax paid lower)", () => {
    // Tax paid = 1000, IL tax on non-IL = 1190 → credit = 1000
    const result = calculateScheduleCR(makeInput());
    expect(result.credit.toNumber()).toBe(1000);
  });

  it("Schedule CR Line 54 - credit is lesser of tax paid vs IL tax (IL tax lower)", () => {
    // Tax paid = 5000, decimal = 0.3333, IL tax = 3571
    // IL tax on non-IL = 1190, credit = 1190
    const result = calculateScheduleCR(makeInput({
      taxPaidToOtherStates: d(5000),
    }));
    expect(result.credit.toNumber()).toBe(1190);
  });

  it("Schedule CR Line 54 - credit when tax paid equals IL tax attributable", () => {
    // Make them equal: non-IL = 75000 (decimal = 1.0), IL tax = 3571, paid = 3571
    const result = calculateScheduleCR(makeInput({
      nonIllinoisBaseIncome: d(75000),
      taxPaidToOtherStates: d(3571),
    }));
    expect(result.credit.toNumber()).toBe(3571);
  });

  it("Schedule CR Line 54 - credit is zero when no tax paid", () => {
    const result = calculateScheduleCR(makeInput({
      taxPaidToOtherStates: ZERO,
    }));
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule CR Line 54 - credit is zero when no non-IL income", () => {
    const result = calculateScheduleCR(makeInput({
      nonIllinoisBaseIncome: ZERO,
      taxPaidToOtherStates: d(1000),
    }));
    expect(result.credit.toNumber()).toBe(0);
  });

  // ==================== Line 55: Flow to IL-1040 ====================

  it("Schedule CR Line 55 - credit flows to IL-1040 Line 15", () => {
    const result = calculateScheduleCR(makeInput());
    // Credit = min(1000, 1190) = 1000
    expect(result.credit.toNumber()).toBe(1000);
  });

  // ==================== Edge Cases ====================

  it("Schedule CR - small non-IL income produces small credit", () => {
    // Non-IL = 5000, total = 75000 → decimal = 0.0667
    // IL tax on non-IL = 0.0667 × 3571 = 238.1857 → 238
    // Tax paid = 200 → credit = 200
    const result = calculateScheduleCR(makeInput({
      nonIllinoisBaseIncome: d(5000),
      taxPaidToOtherStates: d(200),
    }));
    expect(result.crDecimal.toNumber()).toBe(0.0667);
    expect(result.ilTaxOnNonIlIncome.toNumber()).toBe(238);
    expect(result.credit.toNumber()).toBe(200);
  });

  it("Schedule CR - large multi-state income", () => {
    // Total = 200000, non-IL = 80000 → decimal = 0.4000
    // IL tax = 9405, IL tax on non-IL = 0.4000 × 9405 = 3762
    // Tax paid = 4000 → credit = 3762 (IL tax attributable is lower)
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: d(200000),
      nonIllinoisBaseIncome: d(80000),
      ilIncomeTax: d(9405),
      taxPaidToOtherStates: d(4000),
    }));
    expect(result.crDecimal.toNumber()).toBe(0.4);
    expect(result.ilTaxOnNonIlIncome.toNumber()).toBe(3762);
    expect(result.credit.toNumber()).toBe(3762);
  });

  it("Schedule CR - other state has higher tax rate than IL", () => {
    // Non-IL = 50000, total = 100000 → decimal = 0.5000
    // IL tax = 4950 (100000 × 0.0495), IL tax on non-IL = 0.5 × 4950 = 2475
    // Other state taxed at ~7%: paid = 3500 → credit = 2475 (IL attributable)
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: d(100000),
      nonIllinoisBaseIncome: d(50000),
      ilIncomeTax: d(4950),
      taxPaidToOtherStates: d(3500),
    }));
    expect(result.crDecimal.toNumber()).toBe(0.5);
    expect(result.ilTaxOnNonIlIncome.toNumber()).toBe(2475);
    expect(result.credit.toNumber()).toBe(2475);
  });

  it("Schedule CR - other state has lower tax rate than IL", () => {
    // Non-IL = 50000, total = 100000 → decimal = 0.5000
    // IL tax = 4950, IL tax on non-IL = 2475
    // Other state taxed at ~3%: paid = 1500 → credit = 1500 (tax paid is lower)
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: d(100000),
      nonIllinoisBaseIncome: d(50000),
      ilIncomeTax: d(4950),
      taxPaidToOtherStates: d(1500),
    }));
    expect(result.credit.toNumber()).toBe(1500);
  });

  it("Schedule CR - very small decimal precision", () => {
    // 1000 / 200000 = 0.005 → 0.0050
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: d(200000),
      nonIllinoisBaseIncome: d(1000),
      ilIncomeTax: d(9405),
      taxPaidToOtherStates: d(100),
    }));
    expect(result.crDecimal.toNumber()).toBe(0.005);
    // 0.005 × 9405 = 47.025 → 47
    expect(result.ilTaxOnNonIlIncome.toNumber()).toBe(47);
    expect(result.credit.toNumber()).toBe(47);
  });

  // ==================== Integration Scenarios ====================

  it("Schedule CR - Chicago worker with Indiana income", () => {
    // IL resident earns $60K in IL, $40K in IN business income
    // Total = 100000, non-IL = 40000 → decimal = 0.4000
    // IL tax = 4653 (94000 net × 0.0495, exemption = 2850, single + 1 dep)
    // Actually we receive IL tax from IL-1040 directly
    // IN tax paid = 1280 (IN flat rate ~3.23%)
    // IL tax on non-IL = 0.4 × 4653 = 1861.2 → 1861
    // Credit = min(1280, 1861) = 1280
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: d(100000),
      nonIllinoisBaseIncome: d(40000),
      ilIncomeTax: d(4653),
      taxPaidToOtherStates: d(1280),
    }));
    expect(result.credit.toNumber()).toBe(1280);
  });

  it("Schedule CR - IL resident with Wisconsin rental income", () => {
    // Total = 120000, WI rental = 15000 → decimal = 0.125 → 0.1250
    // IL tax = 5643, IL tax on non-IL = 0.125 × 5643 = 705.375 → 705
    // WI tax on rental = 900 (higher rate) → credit = 705 (IL limit)
    const result = calculateScheduleCR(makeInput({
      totalBaseIncome: d(120000),
      nonIllinoisBaseIncome: d(15000),
      ilIncomeTax: d(5643),
      taxPaidToOtherStates: d(900),
    }));
    expect(result.crDecimal.toNumber()).toBe(0.125);
    expect(result.ilTaxOnNonIlIncome.toNumber()).toBe(705);
    expect(result.credit.toNumber()).toBe(705);
  });

  // ==================== Audit Trail ====================

  it("Schedule CR - audit trail contains all key lines", () => {
    const result = calculateScheduleCR(makeInput());
    const lineNumbers = result.lines.map(l => l.line);
    expect(lineNumbers).toContain("42a");
    expect(lineNumbers).toContain("42b");
    expect(lineNumbers).toContain("43");
    expect(lineNumbers).toContain("50");
    expect(lineNumbers).toContain("51");
    expect(lineNumbers).toContain("52");
    expect(lineNumbers).toContain("53");
    expect(lineNumbers).toContain("54");
    expect(lineNumbers).toContain("55");
  });
});
