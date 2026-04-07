/**
 * Tests for Form 6198 — At-Risk Limitations.
 * Spec: spec/federal/form-6198.yaml
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm6198 } from "@/engine/forms/form-6198.js";
import type { Form6198Input } from "@/models/inputs.js";

function form6198(overrides: Partial<Form6198Input> = {}): Form6198Input {
  return {
    activityName: overrides.activityName ?? "Test Partnership",
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

describe("Form 6198 At-Risk Limitations", () => {
  // ── Part I: Current Year Profit (Loss) ──────────────────────

  it("Form 6198 Line 1 - ordinary income from the activity", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "50000",
    }));
    expect(result.line1).toEqual(new Decimal(50000));
  });

  it("Form 6198 Line 1 - ordinary loss from the activity", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-25000",
    }));
    expect(result.line1).toEqual(new Decimal(-25000));
  });

  it("Form 6198 Line 2 - gain/loss from asset dispositions", () => {
    const result = calculateForm6198(form6198({
      gainLossFromDispositions: "12000",
    }));
    expect(result.line2).toEqual(new Decimal(12000));
  });

  it("Form 6198 Line 3 - other income and gains", () => {
    const result = calculateForm6198(form6198({
      otherIncomeGains: "3000",
    }));
    expect(result.line3).toEqual(new Decimal(3000));
  });

  it("Form 6198 Line 4 - other deductions and losses", () => {
    const result = calculateForm6198(form6198({
      otherDeductionsLosses: "2000",
    }));
    expect(result.line4).toEqual(new Decimal(2000));
  });

  it("Form 6198 Line 5 - current year profit combines all Part I lines", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "40000",
      gainLossFromDispositions: "5000",
      otherIncomeGains: "2000",
      otherDeductionsLosses: "7000",
    }));
    // 40000 + 5000 + 2000 - 7000 = 40000
    expect(result.line5).toEqual(new Decimal(40000));
  });

  it("Form 6198 Line 5 - current year loss from activity", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-30000",
      gainLossFromDispositions: "-5000",
      otherIncomeGains: "1000",
      otherDeductionsLosses: "6000",
    }));
    // -30000 + (-5000) + 1000 - 6000 = -40000
    expect(result.line5).toEqual(new Decimal(-40000));
  });

  it("Form 6198 Line 5 - current year profit bypasses limitation", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "50000",
      priorYearAmountAtRisk: "10000",
    }));
    expect(result.line5).toEqual(new Decimal(50000));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  // ── Part II: Simplified Computation of Amount At Risk ───────

  it("Form 6198 Line 6 - adjusted basis floored at zero", () => {
    const result = calculateForm6198(form6198({
      adjustedBasisAtEffectiveDate: "-500",
    }));
    expect(result.line6).toEqual(new Decimal(0));
  });

  it("Form 6198 Line 6 - adjusted basis passes through when positive", () => {
    const result = calculateForm6198(form6198({
      adjustedBasisAtEffectiveDate: "100000",
    }));
    expect(result.line6).toEqual(new Decimal(100000));
  });

  it("Form 6198 Line 7 - increases include contributions and recourse borrowing", () => {
    const result = calculateForm6198(form6198({
      currentYearIncreases: "25000",
    }));
    expect(result.line7).toEqual(new Decimal(25000));
  });

  it("Form 6198 Line 9 - decreases for distributions and nonrecourse financing", () => {
    const result = calculateForm6198(form6198({
      currentYearDecreases: "15000",
    }));
    expect(result.line9).toEqual(new Decimal(15000));
  });

  it("Form 6198 Line 10a - prior year at-risk amount", () => {
    const result = calculateForm6198(form6198({
      priorYearAmountAtRisk: "80000",
    }));
    expect(result.line10a).toEqual(new Decimal(80000));
  });

  it("Form 6198 Line 10a - first year defaults to zero", () => {
    const result = calculateForm6198(form6198({}));
    expect(result.line10a).toEqual(new Decimal(0));
  });

  it("Form 6198 Line 10b - first year at-risk = basis + increases - decreases", () => {
    const result = calculateForm6198(form6198({
      adjustedBasisAtEffectiveDate: "50000",
      currentYearIncreases: "20000",
      currentYearDecreases: "5000",
      priorYearAmountAtRisk: "0",
    }));
    // 50000 + 20000 - 5000 = 65000
    expect(result.line10b).toEqual(new Decimal(65000));
  });

  it("Form 6198 Line 10b - subsequent year at-risk = prior + increases - decreases", () => {
    const result = calculateForm6198(form6198({
      priorYearAmountAtRisk: "80000",
      currentYearIncreases: "10000",
      currentYearDecreases: "25000",
    }));
    // 80000 + 10000 - 25000 = 65000
    expect(result.line10b).toEqual(new Decimal(65000));
  });

  it("Form 6198 Line 10b - computed at-risk amount can go negative", () => {
    const result = calculateForm6198(form6198({
      priorYearAmountAtRisk: "20000",
      currentYearIncreases: "0",
      currentYearDecreases: "35000",
    }));
    // 20000 + 0 - 35000 = -15000
    expect(result.line10b).toEqual(new Decimal(-15000));
  });

  // ── Part IV: Deductible Loss ────────────────────────────────

  it("Form 6198 Line 20 - at-risk amount for loss limitation", () => {
    const result = calculateForm6198(form6198({
      priorYearAmountAtRisk: "100000",
      currentYearIncreases: "5000",
      currentYearDecreases: "10000",
    }));
    expect(result.amountAtRisk).toEqual(new Decimal(95000));
  });

  it("Form 6198 Line 21 - deductible loss capped by at-risk amount", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-80000",
      priorYearAmountAtRisk: "50000",
      currentYearIncreases: "0",
      currentYearDecreases: "0",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal(50000));
    expect(result.suspendedLoss).toEqual(new Decimal(30000));
  });

  it("Form 6198 Line 21 - full loss deductible when at-risk exceeds loss", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-20000",
      priorYearAmountAtRisk: "100000",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal(20000));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  it("Form 6198 Line 21 - zero at-risk means no loss deductible", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-30000",
      priorYearAmountAtRisk: "0",
      currentYearIncreases: "0",
      currentYearDecreases: "0",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(30000));
  });

  it("Form 6198 Line 21 - profit year has zero deductible loss", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "15000",
      priorYearAmountAtRisk: "5000",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  it("Form 6198 Line 21 - negative at-risk means no loss deductible", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-10000",
      priorYearAmountAtRisk: "5000",
      currentYearDecreases: "20000",
    }));
    // At-risk = 5000 + 0 - 20000 = -15000 → deductible loss = 0
    expect(result.amountAtRisk).toEqual(new Decimal(-15000));
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(10000));
    expect(result.recaptureIncome).toEqual(new Decimal(15000));
  });

  // ── Suspended Loss ──────────────────────────────────────────

  it("Form 6198 suspended loss - excess carries forward", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-100000",
      priorYearAmountAtRisk: "25000",
      currentYearIncreases: "10000",
    }));
    // At-risk = 25000 + 10000 - 0 = 35000
    expect(result.amountAtRisk).toEqual(new Decimal(35000));
    expect(result.deductibleLoss).toEqual(new Decimal(35000));
    expect(result.suspendedLoss).toEqual(new Decimal(65000));
  });

  it("Form 6198 suspended loss - zero when loss equals at-risk", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-50000",
      priorYearAmountAtRisk: "50000",
    }));
    expect(result.deductibleLoss).toEqual(new Decimal(50000));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  // ── Recapture ───────────────────────────────────────────────

  it("Form 6198 recapture - negative at-risk triggers ordinary income", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "0",
      priorYearAmountAtRisk: "10000",
      currentYearDecreases: "25000",
    }));
    // At-risk = 10000 - 25000 = -15000
    expect(result.amountAtRisk).toEqual(new Decimal(-15000));
    expect(result.recaptureIncome).toEqual(new Decimal(15000));
  });

  it("Form 6198 recapture - no recapture when at-risk is positive", () => {
    const result = calculateForm6198(form6198({
      priorYearAmountAtRisk: "50000",
      currentYearDecreases: "20000",
    }));
    expect(result.amountAtRisk).toEqual(new Decimal(30000));
    expect(result.recaptureIncome).toEqual(new Decimal(0));
  });

  it("Form 6198 recapture - no recapture when at-risk is zero", () => {
    const result = calculateForm6198(form6198({
      priorYearAmountAtRisk: "10000",
      currentYearDecreases: "10000",
    }));
    expect(result.amountAtRisk).toEqual(new Decimal(0));
    expect(result.recaptureIncome).toEqual(new Decimal(0));
  });

  // ── Realistic Scenarios ─────────────────────────────────────

  it("Partnership first year - $100K investment, $20K loss, full deduction", () => {
    const result = calculateForm6198(form6198({
      activityName: "ABC Partnership",
      ordinaryIncome: "-20000",
      adjustedBasisAtEffectiveDate: "100000",
      currentYearIncreases: "0",
      currentYearDecreases: "0",
      priorYearAmountAtRisk: "0",
    }));
    expect(result.line10b).toEqual(new Decimal(100000));
    expect(result.deductibleLoss).toEqual(new Decimal(20000));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  it("Partnership year 2 - prior at-risk reduced by distributions, loss partially deductible", () => {
    const result = calculateForm6198(form6198({
      activityName: "ABC Partnership",
      ordinaryIncome: "-30000",
      priorYearAmountAtRisk: "80000",
      currentYearIncreases: "0",
      currentYearDecreases: "60000",
    }));
    // At-risk = 80000 - 60000 = 20000
    expect(result.amountAtRisk).toEqual(new Decimal(20000));
    expect(result.deductibleLoss).toEqual(new Decimal(20000));
    expect(result.suspendedLoss).toEqual(new Decimal(10000));
  });

  it("Real estate partnership with qualified nonrecourse financing", () => {
    const result = calculateForm6198(form6198({
      activityName: "Real Estate LP",
      ordinaryIncome: "-45000",
      adjustedBasisAtEffectiveDate: "50000",
      // QNR financing counts as at-risk for real estate
      currentYearIncreases: "200000",
      currentYearDecreases: "0",
      priorYearAmountAtRisk: "0",
    }));
    // First year: 50000 + 200000 - 0 = 250000
    expect(result.amountAtRisk).toEqual(new Decimal(250000));
    expect(result.deductibleLoss).toEqual(new Decimal(45000));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  it("S corp with mixed income and loss lines", () => {
    const result = calculateForm6198(form6198({
      activityName: "XYZ S Corp",
      ordinaryIncome: "-25000",
      gainLossFromDispositions: "8000",
      otherIncomeGains: "2000",
      otherDeductionsLosses: "5000",
      priorYearAmountAtRisk: "15000",
      currentYearIncreases: "5000",
      currentYearDecreases: "0",
    }));
    // Part I: -25000 + 8000 + 2000 - 5000 = -20000
    expect(result.line5).toEqual(new Decimal(-20000));
    // Part II: 15000 + 5000 - 0 = 20000
    expect(result.amountAtRisk).toEqual(new Decimal(20000));
    // Part IV: loss matches at-risk exactly
    expect(result.deductibleLoss).toEqual(new Decimal(20000));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  it("Overleveraged partnership triggers recapture while activity has income", () => {
    const result = calculateForm6198(form6198({
      activityName: "Leveraged LP",
      ordinaryIncome: "5000",
      priorYearAmountAtRisk: "10000",
      currentYearDecreases: "30000",
    }));
    // At-risk = 10000 - 30000 = -20000
    expect(result.amountAtRisk).toEqual(new Decimal(-20000));
    expect(result.recaptureIncome).toEqual(new Decimal(20000));
    // Still has profit — no loss to limit
    expect(result.deductibleLoss).toEqual(new Decimal(0));
    expect(result.suspendedLoss).toEqual(new Decimal(0));
  });

  // ── Audit Trail ─────────────────────────────────────────────

  it("Form 6198 produces audit trail lines for all computed values", () => {
    const result = calculateForm6198(form6198({
      ordinaryIncome: "-50000",
      priorYearAmountAtRisk: "30000",
      currentYearIncreases: "10000",
      currentYearDecreases: "5000",
    }));
    const formLines = result.lines.filter((l) => l.form === "Form 6198");
    // Should have lines for: 1, 2, 3, 4, 5, 6, 7, 9, 10a, 10b, 20, 21, suspended
    expect(formLines.length).toBeGreaterThanOrEqual(12);
  });

  it("Form 6198 audit trail records activity name", () => {
    const result = calculateForm6198(form6198({
      activityName: "My Partnership",
      ordinaryIncome: "-10000",
      priorYearAmountAtRisk: "5000",
    }));
    const line1 = result.lines.find((l) => l.line === "1");
    expect(line1?.description).toContain("My Partnership");
  });
});
