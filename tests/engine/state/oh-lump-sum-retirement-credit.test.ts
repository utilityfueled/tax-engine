import { describe, expect, it } from "vitest";
import { calculateOhioLumpSumRetirementCredit } from "@/engine/state/oh-lump-sum-retirement-credit.js";

describe("Ohio Lump Sum Retirement Credit", () => {
  it("OH Lump Sum Retirement Credit Line 1 - recipient retirement income flows through", () => {
    const result = calculateOhioLumpSumRetirementCredit({
      taxYear: 2025,
      recipients: [{ age: 65, retirementIncome: 40000 }],
    });

    expect(result.recipients[0]?.retirementIncome.toNumber()).toBe(40000);
  });

  it("OH Lump Sum Retirement Credit Line 2 - age 46 uses the 36.8 multiple", () => {
    const result = calculateOhioLumpSumRetirementCredit({
      taxYear: 2025,
      recipients: [{ age: 46, retirementIncome: 36800 }],
    });

    expect(result.recipients[0]?.multiple.toString()).toBe("36.8");
  });

  it("OH Lump Sum Retirement Credit Line 3 - line 1 divided by line 2 determines the Table 2 tier", () => {
    const result = calculateOhioLumpSumRetirementCredit({
      taxYear: 2025,
      recipients: [{ age: 46, retirementIncome: 55200 }],
    });

    expect(result.recipients[0]?.derivedRetirementIncome.toNumber()).toBe(1500);
  });

  it("OH Lump Sum Retirement Credit Line 4 - Table 2 uses the derived line 3 amount", () => {
    const result = calculateOhioLumpSumRetirementCredit({
      taxYear: 2025,
      recipients: [{ age: 65, retirementIncome: 40000 }],
    });

    expect(result.recipients[0]?.retirementIncomeCredit.toNumber()).toBe(50);
  });

  it("OH Lump Sum Retirement Credit Line 5 - line 2 multiplied by line 4 computes the recipient credit", () => {
    const result = calculateOhioLumpSumRetirementCredit({
      taxYear: 2025,
      recipients: [{ age: 65, retirementIncome: 40000 }],
    });

    expect(result.recipients[0]?.credit.toNumber()).toBe(1000);
  });

  it("OH Lump Sum Retirement Credit Line 6 - qualifying spouses add together", () => {
    const result = calculateOhioLumpSumRetirementCredit({
      taxYear: 2025,
      recipients: [
        { age: 65, retirementIncome: 40000 },
        { age: 70, retirementIncome: 32000 },
      ],
    });

    expect(result.line6_totalCredit.toNumber()).toBe(1800);
  });

  it("OH Lump Sum Retirement Credit Line 7 - schedule tax available for the worksheet carryforward", () => {
    const result = calculateOhioLumpSumRetirementCredit({
      taxYear: 2025,
      recipients: [{ age: 65, retirementIncome: 40000 }],
      scheduleOfCreditsLine1TaxLiability: 620,
      scheduleOfCreditsLine2RetirementIncomeCredit: 0,
    });

    expect(result.line7_taxAvailableForCurrentYearCredit.toNumber()).toBe(620);
  });

  it("OH Lump Sum Retirement Credit Line 8 - excess current-year credit becomes carryforward basis", () => {
    const result = calculateOhioLumpSumRetirementCredit({
      taxYear: 2025,
      recipients: [{ age: 65, retirementIncome: 40000 }],
      scheduleOfCreditsLine1TaxLiability: 620,
      scheduleOfCreditsLine2RetirementIncomeCredit: 0,
    });

    expect(result.line8_excessCredit.toNumber()).toBe(380);
  });

  it("OH Lump Sum Retirement Credit Line 9 - future-year divisor is the sum of recipient multiples minus one", () => {
    const result = calculateOhioLumpSumRetirementCredit({
      taxYear: 2025,
      recipients: [{ age: 65, retirementIncome: 40000 }],
      scheduleOfCreditsLine1TaxLiability: 620,
      scheduleOfCreditsLine2RetirementIncomeCredit: 0,
    });

    expect(result.line9_futureYearDivisor.toNumber()).toBe(19);
  });

  it("OH Lump Sum Retirement Credit Line 10 - future-year credit equals line 8 divided by line 9", () => {
    const result = calculateOhioLumpSumRetirementCredit({
      taxYear: 2025,
      recipients: [{ age: 65, retirementIncome: 40000 }],
      scheduleOfCreditsLine1TaxLiability: 620,
      scheduleOfCreditsLine2RetirementIncomeCredit: 0,
    });

    expect(result.line10_futureYearCredit.toNumber()).toBe(20);
  });

  it("OH Lump Sum Retirement Credit - no carryforward when current-year tax absorbs the worksheet credit", () => {
    const result = calculateOhioLumpSumRetirementCredit({
      taxYear: 2025,
      recipients: [{ age: 65, retirementIncome: 40000 }],
      scheduleOfCreditsLine1TaxLiability: 1200,
      scheduleOfCreditsLine2RetirementIncomeCredit: 0,
    });

    expect(result.line8_excessCredit.toNumber()).toBe(0);
    expect(result.line10_futureYearCredit.toNumber()).toBe(0);
  });

  it("OH Lump Sum Retirement Credit - more than two recipients throws", () => {
    expect(() =>
      calculateOhioLumpSumRetirementCredit({
        taxYear: 2025,
        recipients: [
          { age: 65, retirementIncome: 40000 },
          { age: 70, retirementIncome: 32000 },
          { age: 75, retirementIncome: 25000 },
        ],
      })
    ).toThrow(/at most two recipients/i);
  });
});
