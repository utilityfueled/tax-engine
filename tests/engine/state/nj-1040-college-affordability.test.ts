/**
 * Tests for New Jersey NJ-1040 college affordability deductions.
 * Spec: spec/state/nj-1040-college-affordability.yaml
 */

import { describe, expect, it } from "vitest";
import {
  calculateNJ1040CollegeAffordabilityDeduction,
} from "@/engine/state/nj-1040-college-affordability.js";

describe("NJ-1040 college affordability deductions", () => {
  it("NJ-1040 college affordability Line 37a - NJBEST contributions cap at $10,000", () => {
    const result = calculateNJ1040CollegeAffordabilityDeduction({
      taxYear: 2025,
      njGrossIncome: 150000,
      monthsOfResidency: 12,
      njbestContributions: 12000,
    });

    expect(result.njbestDeduction.toNumber()).toBe(10000);
  });

  it("NJ-1040 college affordability Line 37b - NJCLASS payments cap at $2,500", () => {
    const result = calculateNJ1040CollegeAffordabilityDeduction({
      taxYear: 2025,
      njGrossIncome: 150000,
      monthsOfResidency: 12,
      njclassLoanPayments: 3000,
    });

    expect(result.njclassDeduction.toNumber()).toBe(2500);
  });

  it("NJ-1040 college affordability Line 37c - tuition deduction is prorated for part-year residents", () => {
    const result = calculateNJ1040CollegeAffordabilityDeduction({
      taxYear: 2025,
      njGrossIncome: 180000,
      monthsOfResidency: 7,
      tuitionPaidToNjInstitution: 10000,
    });

    expect(result.tuitionDeduction.toNumber()).toBe(5833);
  });

  it("NJ-1040 college affordability - income above $200,000 disallows all deductions", () => {
    const result = calculateNJ1040CollegeAffordabilityDeduction({
      taxYear: 2025,
      njGrossIncome: 200001,
      monthsOfResidency: 12,
      njbestContributions: 10000,
      njclassLoanPayments: 2500,
      tuitionPaidToNjInstitution: 10000,
    });

    expect(result.eligible).toBe(false);
    expect(result.totalDeduction.toNumber()).toBe(0);
  });

  it("NJ-1040 college affordability total - all three deductions add together", () => {
    const result = calculateNJ1040CollegeAffordabilityDeduction({
      taxYear: 2025,
      njGrossIncome: 160000,
      monthsOfResidency: 12,
      njbestContributions: 6000,
      njclassLoanPayments: 1800,
      tuitionPaidToNjInstitution: 4000,
    });

    expect(result.totalDeduction.toNumber()).toBe(11800);
  });
});
