/**
 * Tests for New Jersey NJ-1040 medical expenses deduction.
 * Spec: spec/state/nj-1040-medical-expenses.yaml
 */

import { describe, expect, it } from "vitest";
import {
  calculateNJ1040MedicalExpenses,
} from "@/engine/state/nj-1040-medical-expenses.js";

describe("NJ-1040 medical expenses deduction", () => {
  // --- 2% threshold calculation ---

  it("NJ-1040 medical expenses 2% threshold on $50,000 income is $1,000", () => {
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 50000,
      totalMedicalExpenses: 3000,
    });
    expect(result.threshold.toNumber()).toBe(1000);
  });

  it("NJ-1040 medical expenses 2% threshold on $100,000 income is $2,000", () => {
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 100000,
      totalMedicalExpenses: 5000,
    });
    expect(result.threshold.toNumber()).toBe(2000);
  });

  it("NJ-1040 medical expenses 2% threshold on zero income is $0", () => {
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 0,
      totalMedicalExpenses: 5000,
    });
    expect(result.threshold.toNumber()).toBe(0);
  });

  // --- Deduction calculation ---

  it("NJ-1040 medical expenses deduction equals expenses minus 2% floor", () => {
    // $50,000 income → 2% = $1,000 threshold
    // $3,000 expenses - $1,000 = $2,000 deduction
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 50000,
      totalMedicalExpenses: 3000,
    });
    expect(result.deduction.toNumber()).toBe(2000);
  });

  it("NJ-1040 medical expenses Worksheet F line 4 adds Archer MSA contributions after the 2% floor", () => {
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 50000,
      totalMedicalExpenses: 3000,
      archerMSADeduction: 900,
    });

    expect(result.deduction.toNumber()).toBe(2900);
  });

  it("NJ-1040 medical expenses Worksheet F line 5 adds self-employed health insurance after the 2% floor", () => {
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 50000,
      totalMedicalExpenses: 3000,
      selfEmployedHealthInsuranceDeduction: 1500,
    });

    expect(result.deduction.toNumber()).toBe(3500);
  });

  it("NJ-1040 medical expenses deduction is zero when expenses below threshold", () => {
    // $100,000 income → 2% = $2,000 threshold
    // $1,500 expenses < $2,000 threshold → $0
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 100000,
      totalMedicalExpenses: 1500,
    });
    expect(result.deduction.toNumber()).toBe(0);
  });

  it("NJ-1040 medical expenses deduction is zero when expenses exactly equal threshold", () => {
    // $50,000 income → 2% = $1,000 threshold
    // $1,000 expenses = $1,000 threshold → $0
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 50000,
      totalMedicalExpenses: 1000,
    });
    expect(result.deduction.toNumber()).toBe(0);
  });

  it("NJ-1040 medical expenses deduction $1 over threshold", () => {
    // $50,000 income → 2% = $1,000 threshold
    // $1,001 expenses - $1,000 threshold = $1
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 50000,
      totalMedicalExpenses: 1001,
    });
    expect(result.deduction.toNumber()).toBe(1);
  });

  it("NJ-1040 medical expenses full deduction when zero income", () => {
    // $0 income → 2% = $0 threshold → full $5,000 deduction
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 0,
      totalMedicalExpenses: 5000,
    });
    expect(result.deduction.toNumber()).toBe(5000);
  });

  it("NJ-1040 medical expenses no deduction when no expenses", () => {
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 75000,
      totalMedicalExpenses: 0,
    });
    expect(result.deduction.toNumber()).toBe(0);
  });

  it("NJ-1040 medical expenses deduction equals expenses minus 2% floor plus Worksheet F additions", () => {
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 75000,
      totalMedicalExpenses: 1500,
      archerMSADeduction: 600,
      selfEmployedHealthInsuranceDeduction: 1200,
    });

    expect(result.threshold.toNumber()).toBe(1500);
    expect(result.deduction.toNumber()).toBe(1800);
  });

  // --- Insurance reimbursements ---

  it("NJ-1040 medical expenses total unreimbursed expenses", () => {
    // $10,000 expenses - $3,000 reimbursements = $7,000 unreimbursed
    // $50,000 income → 2% = $1,000 threshold
    // $7,000 - $1,000 = $6,000 deduction
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 50000,
      totalMedicalExpenses: 10000,
      insuranceReimbursements: 3000,
    });
    expect(result.unreimbursedExpenses.toNumber()).toBe(7000);
    expect(result.deduction.toNumber()).toBe(6000);
  });

  it("NJ-1040 medical expenses reimbursements exceeding expenses floor at zero", () => {
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 50000,
      totalMedicalExpenses: 2000,
      insuranceReimbursements: 5000,
    });
    expect(result.unreimbursedExpenses.toNumber()).toBe(0);
    expect(result.deduction.toNumber()).toBe(0);
  });

  // --- Comparison with federal 7.5% floor ---

  it("NJ-1040 medical expenses NJ 2% vs federal 7.5% - NJ deduction is larger", () => {
    // Income: $80,000, Expenses: $5,000
    // NJ: 2% of $80K = $1,600 threshold → $5,000 - $1,600 = $3,400 deduction
    // Federal would be: 7.5% of $80K = $6,000 threshold → $0 deduction
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 80000,
      totalMedicalExpenses: 5000,
    });
    expect(result.deduction.toNumber()).toBe(3400);
    // This filer gets $3,400 NJ deduction but $0 federal deduction
  });

  // --- Large expense scenarios ---

  it("NJ-1040 medical expenses large medical bills", () => {
    // $75,000 income → 2% = $1,500 threshold
    // $50,000 expenses - $1,500 = $48,500 deduction
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 75000,
      totalMedicalExpenses: 50000,
    });
    expect(result.deduction.toNumber()).toBe(48500);
  });

  it("NJ-1040 medical expenses high income filer", () => {
    // $500,000 income → 2% = $10,000 threshold
    // $15,000 expenses - $10,000 = $5,000 deduction
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 500000,
      totalMedicalExpenses: 15000,
    });
    expect(result.deduction.toNumber()).toBe(5000);
  });

  // --- Default values ---

  it("NJ-1040 medical expenses omitted inputs default to zero", () => {
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 50000,
    });
    expect(result.totalExpenses.toNumber()).toBe(0);
    expect(result.unreimbursedExpenses.toNumber()).toBe(0);
    expect(result.threshold.toNumber()).toBe(1000);
    expect(result.archerMSADeduction.toNumber()).toBe(0);
    expect(result.selfEmployedHealthInsuranceDeduction.toNumber()).toBe(0);
    expect(result.deduction.toNumber()).toBe(0);
  });

  // --- Audit trail ---

  it("NJ-1040 medical expenses audit trail records all computed lines", () => {
    const result = calculateNJ1040MedicalExpenses({
      taxYear: 2025,
      njGrossIncome: 50000,
      totalMedicalExpenses: 3000,
    });
    expect(result.lines.length).toBeGreaterThanOrEqual(5);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("medical-total");
    expect(lineIds).toContain("threshold");
    expect(lineIds).toContain("worksheet-f-line-4");
    expect(lineIds).toContain("worksheet-f-line-5");
    expect(lineIds).toContain("deduction");
  });
});
