/**
 * Tests for Pennsylvania Schedule O — Other Deductions
 * Spec: spec/state/pa-schedule-o.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculatePAScheduleO } from "@/engine/state/pa-schedule-o.js";

const d = (value: number | string) => new Decimal(value);

describe("Pennsylvania Schedule O — Other Deductions", () => {
  it("PA Schedule O Line 1 caps 529 contributions per beneficiary and contributor", () => {
    const result = calculatePAScheduleO({
      taxYear: 2025,
      qualifiedTuitionContributions: [
        {
          beneficiaryName: "Alex Student",
          beneficiarySSN: "111-11-1111",
          taxpayerContribution: d(20000),
          spouseContribution: d(25000),
        },
      ],
      taxpayerPATaxableIncome: d(50000),
      spousePATaxableIncome: d(50000),
    });

    expect(result.qualifiedTuitionContributions[0]?.taxpayerContribution.toNumber()).toBe(19000);
    expect(result.qualifiedTuitionContributions[0]?.spouseContribution.toNumber()).toBe(19000);
  });

  it("PA Schedule O Line 2 totals capped 529 contributions by column", () => {
    const result = calculatePAScheduleO({
      taxYear: 2024,
      qualifiedTuitionContributions: [
        {
          beneficiaryName: "Alex Student",
          beneficiarySSN: "111-11-1111",
          taxpayerContribution: d(20000),
          spouseContribution: d(17000),
        },
        {
          beneficiaryName: "Jamie Student",
          beneficiarySSN: "222-22-2222",
          taxpayerContribution: d(1000),
          spouseContribution: d(19000),
        },
      ],
      taxpayerPATaxableIncome: d(60000),
      spousePATaxableIncome: d(60000),
    });

    expect(result.section529TaxpayerTotal.toNumber()).toBe(19000);
    expect(result.section529SpouseTotal.toNumber()).toBe(35000);
  });

  it("PA Schedule O Line 4 totals validated ABLE contributions within the annual exclusion", () => {
    const result = calculatePAScheduleO({
      taxYear: 2025,
      ableContributions: [
        {
          beneficiaryName: "Taylor Able",
          beneficiarySSN: "333-33-3333",
          taxpayerContribution: d(9000),
          spouseContribution: d(8000),
        },
        {
          beneficiaryName: "Jordan Able",
          beneficiarySSN: "444-44-4444",
          taxpayerContribution: d(10000),
          spouseContribution: d(9000),
        },
      ],
      taxpayerPATaxableIncome: d(70000),
      spousePATaxableIncome: d(70000),
    });

    expect(result.ableTaxpayerTotal.toNumber()).toBe(19000);
    expect(result.ableSpouseTotal.toNumber()).toBe(17000);
  });

  it("PA Schedule O Line 3 rejects ABLE beneficiary contributions that exceed the annual exclusion across contributors", () => {
    expect(() => calculatePAScheduleO({
      taxYear: 2025,
      ableContributions: [
        {
          beneficiaryName: "Taylor Able",
          beneficiarySSN: "333-33-3333",
          taxpayerContribution: d(12000),
          spouseContribution: d(8000),
        },
      ],
      taxpayerPATaxableIncome: d(70000),
      spousePATaxableIncome: d(70000),
    })).toThrow(
      "PA Schedule O Line 3 combined taxpayer and spouse ABLE contributions for Taylor Able cannot exceed 19000",
    );
  });

  it("PA Schedule O Line 3 rejects taxpayer ABLE contributions that exceed the annual exclusion across multiple beneficiaries", () => {
    expect(() => calculatePAScheduleO({
      taxYear: 2025,
      ableContributions: [
        {
          beneficiaryName: "Taylor Able",
          beneficiarySSN: "333-33-3333",
          taxpayerContribution: d(10000),
          spouseContribution: d(0),
        },
        {
          beneficiaryName: "Jordan Able",
          beneficiarySSN: "444-44-4444",
          taxpayerContribution: d(10000),
          spouseContribution: d(0),
        },
      ],
      taxpayerPATaxableIncome: d(70000),
      spousePATaxableIncome: d(70000),
    })).toThrow(
      "PA Schedule O Line 3 taxpayer ABLE contributions across all beneficiaries cannot exceed 19000",
    );
  });

  it("PA Schedule O Lines 5 through 8 combine federal-allowed MSA HSA and student loan amounts", () => {
    const result = calculatePAScheduleO({
      taxYear: 2025,
      medicalSavingsAccountDeduction: d(501),
      spouseMedicalSavingsAccountDeduction: d(300),
      healthSavingsAccountDeduction: d(1500),
      spouseHealthSavingsAccountDeduction: d(2000),
      studentLoanInterestDeduction: d(2000),
      spouseStudentLoanInterestDeduction: d(400),
      taxpayerPATaxableIncome: d(60000),
      spousePATaxableIncome: d(60000),
    });

    expect(result.taxpayerDeductionsBeforeIncomeLimit.toNumber()).toBe(4001);
    expect(result.spouseDeductionsBeforeIncomeLimit.toNumber()).toBe(2700);
  });

  it("PA Schedule O Line 7 caps student loan interest at 2500 for 2025 and disallows it for 2024", () => {
    const currentYear = calculatePAScheduleO({
      taxYear: 2025,
      studentLoanInterestDeduction: d(3000),
      taxpayerPATaxableIncome: d(50000),
    });
    const priorYear = calculatePAScheduleO({
      taxYear: 2024,
      studentLoanInterestDeduction: d(3000),
      taxpayerPATaxableIncome: d(50000),
    });

    expect(currentYear.studentLoanInterestDeduction.toNumber()).toBe(2500);
    expect(priorYear.studentLoanInterestDeduction.toNumber()).toBe(0);
  });

  it("PA Schedule O Line 10 limits each spouse separately by their own PA income", () => {
    const result = calculatePAScheduleO({
      taxYear: 2025,
      qualifiedTuitionContributions: [
        {
          beneficiaryName: "Alex Student",
          beneficiarySSN: "111-11-1111",
          taxpayerContribution: d(5000),
          spouseContribution: d(2000),
        },
      ],
      taxpayerPATaxableIncome: d(3500),
      spousePATaxableIncome: d(1500),
    });

    expect(result.taxpayerAllowedDeduction.toNumber()).toBe(3500);
    expect(result.spouseAllowedDeduction.toNumber()).toBe(1500);
  });

  it("PA Schedule O Line 11 sums the allowed taxpayer and spouse deductions", () => {
    const result = calculatePAScheduleO({
      taxYear: 2025,
      qualifiedTuitionContributions: [
        {
          beneficiaryName: "Alex Student",
          beneficiarySSN: "111-11-1111",
          taxpayerContribution: d(5000),
          spouseContribution: d(2000),
        },
      ],
      taxpayerPATaxableIncome: d(3500),
      spousePATaxableIncome: d(1500),
    });

    expect(result.totalOtherDeductions.toNumber()).toBe(5000);
  });
});
