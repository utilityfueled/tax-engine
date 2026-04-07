/**
 * Form 6198 — At-Risk Limitations: Edge Case Tests
 * Spec: spec/federal/form-6198.yaml
 *
 * Tests boundary conditions for at-risk loss limitation, suspended loss
 * carryforward, recapture income triggers, and first-year vs subsequent-year
 * computation paths under IRC §465.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm6198 } from "@/engine/forms/form-6198.js";
import type { Form6198Input } from "@/models/inputs.js";

function form6198(overrides: Partial<Form6198Input> = {}): Form6198Input {
  return {
    activityName: overrides.activityName ?? "Test Activity",
    ordinaryIncome: overrides.ordinaryIncome ?? "0",
    gainLossFromDispositions: overrides.gainLossFromDispositions ?? "0",
    otherIncomeGains: overrides.otherIncomeGains ?? "0",
    otherDeductionsLosses: overrides.otherDeductionsLosses ?? "0",
    adjustedBasisAtEffectiveDate: overrides.adjustedBasisAtEffectiveDate ?? "0",
    currentYearIncreases: overrides.currentYearIncreases ?? "0",
    currentYearDecreases: overrides.currentYearDecreases ?? "0",
    priorYearAmountAtRisk: overrides.priorYearAmountAtRisk ?? "0",
  };
}

// ── Loss vs At-Risk Boundary ──────────────────────────────────────

describe("Form 6198 loss vs at-risk boundary", () => {
  it("Form 6198 - loss $1 more than at-risk yields $1 suspended", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-50001",
      priorYearAmountAtRisk: "50000",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal(50000));
    expect(result.suspendedLoss).toEqual(new Decimal(1));
  });

  it("Form 6198 - loss $1 less than at-risk yields full deduction, zero suspended", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-49999",
      priorYearAmountAtRisk: "50000",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal(49999));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  it("Form 6198 - loss exactly equals at-risk yields full deduction, zero suspended", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-50000",
      priorYearAmountAtRisk: "50000",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal(50000));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  it("Form 6198 - at-risk of $1 limits large loss to $1 deductible", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-500000",
      priorYearAmountAtRisk: "1",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal(1));
    expect(result.suspendedLoss).toEqual(new Decimal(499999));
  });

  it("Form 6198 - $1 loss with $1 at-risk yields full deduction", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-1",
      priorYearAmountAtRisk: "1",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal(1));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });
});

// ── At-Risk Amount at Zero Boundary ───────────────────────────────

describe("Form 6198 at-risk at zero boundary", () => {
  it("Form 6198 - at-risk exactly $0 means no loss deductible, all suspended", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-25000",
      priorYearAmountAtRisk: "10000",
      currentYearDecreases: "10000",
    }));
    // At-risk = 10000 + 0 - 10000 = 0
    expect(result.amountAtRisk).toEqual(new Decimal(0));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(25000));
    expect(result.recaptureIncome).toEqual(new Decimal(0));
  });

  it("Form 6198 - at-risk goes to -$1 triggers $1 recapture", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-5000",
      priorYearAmountAtRisk: "10000",
      currentYearDecreases: "10001",
    }));
    // At-risk = 10000 + 0 - 10001 = -1
    expect(result.amountAtRisk).toEqual(new Decimal(-1));
    expect(result.recaptureIncome).toEqual(new Decimal(1));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(5000));
  });

  it("Form 6198 - at-risk goes to exactly $0 means no recapture", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "5000",
      priorYearAmountAtRisk: "10000",
      currentYearDecreases: "10000",
    }));
    expect(result.amountAtRisk).toEqual(new Decimal(0));
    expect(result.recaptureIncome).toEqual(new Decimal(0));
  });
});

// ── First Year vs Subsequent Year Computation ─────────────────────

describe("Form 6198 first year vs subsequent year", () => {
  it("Form 6198 - first year with zero basis and zero increases yields zero at-risk", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-10000",
      adjustedBasisAtEffectiveDate: "0",
      currentYearIncreases: "0",
      currentYearDecreases: "0",
      priorYearAmountAtRisk: "0",
    }));
    // Both basis and prior year are 0 → isFirstYear is false (line6 is zero)
    // At-risk = 0 + 0 - 0 = 0
    expect(result.amountAtRisk).toEqual(new Decimal(0));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(10000));
  });

  it("Form 6198 - first year uses basis; subsequent year uses prior at-risk", () => {
    // First year: basis matters
    const firstYear = calculateForm6198(form6198({
      ordinaryIncome: "-20000",
      adjustedBasisAtEffectiveDate: "100000",
      currentYearIncreases: "5000",
      currentYearDecreases: "0",
      priorYearAmountAtRisk: "0",
    }));
    // At-risk = 100000 + 5000 - 0 = 105000
    expect(firstYear.amountAtRisk).toEqual(new Decimal(105000));
    expect(firstYear.deductibleLoss).toEqual(new Decimal(20000));

    // Subsequent year: basis ignored, prior year used
    const secondYear = calculateForm6198(form6198({
      ordinaryIncome: "-20000",
      adjustedBasisAtEffectiveDate: "999999", // should be ignored
      currentYearIncreases: "5000",
      currentYearDecreases: "0",
      priorYearAmountAtRisk: "85000",
    }));
    // At-risk = 85000 + 5000 - 0 = 90000 (basis ignored because prior year is nonzero)
    expect(secondYear.amountAtRisk).toEqual(new Decimal(90000));
    expect(secondYear.deductibleLoss).toEqual(new Decimal(20000));
  });
});

// ── Line 5 Net Income Boundary ────────────────────────────────────

describe("Form 6198 Line 5 net income boundary", () => {
  it("Form 6198 - Line 5 exactly $0 means no loss limitation (breakeven)", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-10000",
      gainLossFromDispositions: "5000",
      otherIncomeGains: "5000",
      otherDeductionsLosses: "0",
      priorYearAmountAtRisk: "1000",
    }));
    // Line 5 = -10000 + 5000 + 5000 - 0 = 0
    expect(result.line5).toEqual(new Decimal(0));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  it("Form 6198 - Line 5 is -$1 with $0 at-risk suspends entire $1 loss", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-1",
      priorYearAmountAtRisk: "0",
    }));
    expect(result.line5).toEqual(new Decimal(-1));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(1));
  });

  it("Form 6198 - Line 5 is $1 profit with negative at-risk still triggers recapture", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "1",
      priorYearAmountAtRisk: "5000",
      currentYearDecreases: "10000",
    }));
    // At-risk = 5000 - 10000 = -5000
    expect(result.line5).toEqual(new Decimal(1));
    expect(result.recaptureIncome).toEqual(new Decimal(5000));
    // Profit year → no loss to limit
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });
});

// ── Fractional/Large Value Edge Cases ─────────────────────────────

describe("Form 6198 fractional and extreme values", () => {
  it("Form 6198 - fractional amounts maintained with Decimal precision", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-1234.56",
      priorYearAmountAtRisk: "1000.33",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal("1000.33"));
    expect(result.suspendedLoss).toEqual(new Decimal("234.23"));
  });

  it("Form 6198 - very large loss ($10M) with small at-risk ($100) suspends nearly all", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-10000000",
      priorYearAmountAtRisk: "100",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal(100));
    expect(result.suspendedLoss).toEqual(new Decimal(9999900));
  });

  it("Form 6198 - large recapture from massive distribution exceeding at-risk", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-50000",
      priorYearAmountAtRisk: "100000",
      currentYearDecreases: "500000",
    }));
    // At-risk = 100000 + 0 - 500000 = -400000
    expect(result.amountAtRisk).toEqual(new Decimal(-400000));
    expect(result.recaptureIncome).toEqual(new Decimal(400000));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(50000));
  });
});

// ── All Part I lines active ─────────────────────────────────────

describe("Form 6198 all Part I lines active", () => {
  it("Form 6198 Line 5 - all four lines combine: income, gains, other income minus deductions", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-80000",
      gainLossFromDispositions: "15000",
      otherIncomeGains: "5000",
      otherDeductionsLosses: "10000",
      priorYearAmountAtRisk: "50000",
    }));
    // Line 5 = -80000 + 15000 + 5000 - 10000 = -70000
    expect(result.line5).toEqual(new Decimal(-70000));
    // Loss of 70000 limited by at-risk of 50000
    expect(result.deductibleLoss).toEqual(new Decimal(50000));
    expect(result.suspendedLoss).toEqual(new Decimal(20000));
  });

  it("Form 6198 Line 5 - other deductions (Line 4) swing profit to loss", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "30000",
      gainLossFromDispositions: "10000",
      otherIncomeGains: "5000",
      otherDeductionsLosses: "50000",
      priorYearAmountAtRisk: "0",
    }));
    // Line 5 = 30000 + 10000 + 5000 - 50000 = -5000
    expect(result.line5).toEqual(new Decimal(-5000));
    // At-risk = 0 → nothing deductible
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(5000));
  });

  it("Form 6198 Line 5 - gains from dispositions (Line 2) partially offset ordinary loss", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-100000",
      gainLossFromDispositions: "60000",
      priorYearAmountAtRisk: "30000",
    }));
    // Line 5 = -100000 + 60000 = -40000
    expect(result.line5).toEqual(new Decimal(-40000));
    expect(result.deductibleLoss).toEqual(new Decimal(30000));
    expect(result.suspendedLoss).toEqual(new Decimal(10000));
  });
});

// ── Increases and decreases both active ─────────────────────────

describe("Form 6198 increases and decreases interaction", () => {
  it("Form 6198 - increases and decreases both active, net positive at-risk change", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-75000",
      priorYearAmountAtRisk: "50000",
      currentYearIncreases: "40000",
      currentYearDecreases: "15000",
    }));
    // At-risk = 50000 + 40000 - 15000 = 75000
    expect(result.amountAtRisk).toEqual(new Decimal(75000));
    expect(result.deductibleLoss).toEqual(new Decimal(75000));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  it("Form 6198 - increases exactly offset decreases, at-risk unchanged", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-60000",
      priorYearAmountAtRisk: "40000",
      currentYearIncreases: "25000",
      currentYearDecreases: "25000",
    }));
    // At-risk = 40000 + 25000 - 25000 = 40000
    expect(result.amountAtRisk).toEqual(new Decimal(40000));
    expect(result.deductibleLoss).toEqual(new Decimal(40000));
    expect(result.suspendedLoss).toEqual(new Decimal(20000));
  });

  it("Form 6198 - large increase restores at-risk from near-zero", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-200000",
      priorYearAmountAtRisk: "1",
      currentYearIncreases: "149999",
      currentYearDecreases: "0",
    }));
    // At-risk = 1 + 149999 - 0 = 150000
    expect(result.amountAtRisk).toEqual(new Decimal(150000));
    expect(result.deductibleLoss).toEqual(new Decimal(150000));
    expect(result.suspendedLoss).toEqual(new Decimal(50000));
  });
});

// ── First year full computation ─────────────────────────────────

describe("Form 6198 first year full computation", () => {
  it("Form 6198 - first year with basis, increases, and decreases all active", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-80000",
      adjustedBasisAtEffectiveDate: "50000",
      currentYearIncreases: "20000",
      currentYearDecreases: "5000",
      priorYearAmountAtRisk: "0",
    }));
    // First year: at-risk = 50000 + 20000 - 5000 = 65000
    expect(result.line6).toEqual(new Decimal(50000));
    expect(result.amountAtRisk).toEqual(new Decimal(65000));
    expect(result.deductibleLoss).toEqual(new Decimal(65000));
    expect(result.suspendedLoss).toEqual(new Decimal(15000));
  });

  it("Form 6198 - negative basis input floored at zero per IRC §1011", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-10000",
      adjustedBasisAtEffectiveDate: "-5000",
      currentYearIncreases: "8000",
      priorYearAmountAtRisk: "0",
    }));
    // Basis floored at 0, but since basis is 0 and priorYear is 0,
    // isFirstYear check: line10a.isZero() && !line6.isZero() → false (line6 is 0 after floor)
    // So uses subsequent year formula: 0 + 8000 - 0 = 8000
    expect(result.line6).toEqual(new Decimal(0));
    expect(result.amountAtRisk).toEqual(new Decimal(8000));
    expect(result.deductibleLoss).toEqual(new Decimal(8000));
    expect(result.suspendedLoss).toEqual(new Decimal(2000));
  });
});

// ── Pure profit / zero activity ─────────────────────────────────

describe("Form 6198 profit and zero scenarios", () => {
  it("Form 6198 - pure profit activity, no loss limitation needed", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "100000",
      gainLossFromDispositions: "25000",
      otherIncomeGains: "5000",
      priorYearAmountAtRisk: "50000",
    }));
    // Line 5 = 100000 + 25000 + 5000 = 130000 (profit)
    expect(result.line5).toEqual(new Decimal(130000));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
    expect(result.recaptureIncome).toEqual(new Decimal(0));
  });

  it("Form 6198 - completely zero activity (no income, no loss, no at-risk)", () => {
    const result = calculateForm6198(form6198());
    expect(result.line5).toEqual(new Decimal(0));
    expect(result.amountAtRisk).toEqual(new Decimal(0));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
    expect(result.recaptureIncome).toEqual(new Decimal(0));
  });
});

// ── Recapture edge cases ────────────────────────────────────────

describe("Form 6198 recapture edge cases", () => {
  it("Form 6198 - decrease exactly doubles prior at-risk yields 100% recapture", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "0",
      priorYearAmountAtRisk: "50000",
      currentYearDecreases: "100000",
    }));
    // At-risk = 50000 - 100000 = -50000
    expect(result.amountAtRisk).toEqual(new Decimal(-50000));
    expect(result.recaptureIncome).toEqual(new Decimal(50000));
  });

  it("Form 6198 - recapture with concurrent profit (profit passes through, recapture separate)", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "20000",
      priorYearAmountAtRisk: "10000",
      currentYearDecreases: "15000",
    }));
    // At-risk = 10000 - 15000 = -5000
    // Line 5 = 20000 (profit) → no loss limitation
    expect(result.line5).toEqual(new Decimal(20000));
    expect(result.amountAtRisk).toEqual(new Decimal(-5000));
    expect(result.recaptureIncome).toEqual(new Decimal(5000));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  it("Form 6198 - at-risk goes to exactly -$1 triggers $1 recapture with no loss", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "0",
      priorYearAmountAtRisk: "1000",
      currentYearDecreases: "1001",
    }));
    expect(result.amountAtRisk).toEqual(new Decimal(-1));
    expect(result.recaptureIncome).toEqual(new Decimal(1));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });
});
