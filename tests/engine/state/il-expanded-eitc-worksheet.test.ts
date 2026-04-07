import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculateIllinoisExpandedEITCWorksheet,
  type IllinoisExpandedEITCWorksheetInput,
} from "@/engine/state/il-expanded-eitc-worksheet.js";

const d = (value: number | string) => new Decimal(value);
const ZERO = d(0);

function makeInput(
  overrides: Partial<IllinoisExpandedEITCWorksheetInput> = {},
): IllinoisExpandedEITCWorksheetInput {
  return {
    taxYear: 2025,
    filingStatus: "single",
    qualifyingChildCount: 0,
    form1040Line1z: ZERO,
    excludedMedicaidWaiverPayments: ZERO,
    electedNontaxableCombatPay: ZERO,
    scheduleSELine3: ZERO,
    scheduleSELine4bAnd5a: ZERO,
    scheduleSELine13: ZERO,
    part3NetFarmProfitOrLoss: ZERO,
    part3NetBusinessProfitOrLoss: ZERO,
    statutoryEmployeeIncome: ZERO,
    agi: ZERO,
    investmentIncome: ZERO,
    filedForm2555: false,
    taxpayerOrSpouseUsResidentHalfYear: true,
    mainHomeInUSMoreThanHalfYear: true,
    canBeClaimedAsDependent: false,
    canBeQualifyingChildOfAnother: false,
    separatedSpouseEitcEligible: false,
    hasComplexInvestmentIncome: false,
    primaryAge: 18,
    ...overrides,
  };
}

describe("Illinois Expanded EITC Worksheet", () => {
  it("Illinois Expanded EITC Worksheet Line 15 - childless age-18 filer computes earned income and credit", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      form1040Line1z: d(8490),
      agi: d(8490),
    }));

    expect(result.totalEarnedIncome.toNumber()).toBe(8490);
    expect(result.line23.toNumber()).toBe(649);
    expect(result.qualifies).toBe(true);
  });

  it("Illinois Expanded EITC Worksheet Line 15 - medicaid waiver payments reduce Part 1 earned income", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      form1040Line1z: d(5000),
      excludedMedicaidWaiverPayments: d(1000),
      agi: d(4000),
    }));

    expect(result.totalEarnedIncome.toNumber()).toBe(4000);
    expect(result.line23.toNumber()).toBe(306);
  });

  it("Illinois Expanded EITC Worksheet Line 15 - nontaxable combat pay increases earned income when elected", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      form1040Line1z: d(8000),
      electedNontaxableCombatPay: d(490),
      agi: d(8000),
    }));

    expect(result.totalEarnedIncome.toNumber()).toBe(8490);
    expect(result.line23.toNumber()).toBe(649);
  });

  it("Illinois Expanded EITC Worksheet Line 15 - Schedule SE lines flow into earned income", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      scheduleSELine3: d(5000),
      scheduleSELine4bAnd5a: d(2000),
      scheduleSELine13: d(1000),
      agi: d(6000),
    }));

    expect(result.totalEarnedIncome.toNumber()).toBe(6000);
    expect(result.line23.toNumber()).toBe(459);
  });

  it("Illinois Expanded EITC Worksheet Line 15 - Part 3 self-employment inputs flow through", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      part3NetFarmProfitOrLoss: d(1000),
      part3NetBusinessProfitOrLoss: d(2000),
      statutoryEmployeeIncome: d(500),
      agi: d(3500),
    }));

    expect(result.totalEarnedIncome.toNumber()).toBe(3500);
    expect(result.line23.toNumber()).toBe(267);
  });

  it("Illinois Expanded EITC Worksheet Line 15 - negative totals floor to zero", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      part3NetFarmProfitOrLoss: d(-300),
      part3NetBusinessProfitOrLoss: d(-400),
      agi: ZERO,
    }));

    expect(result.totalEarnedIncome.toNumber()).toBe(0);
    expect(result.line23.toNumber()).toBe(0);
  });

  it("Illinois Expanded EITC Worksheet Line 16 - published income limits disqualify excess earned income", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      form1040Line1z: d(19104),
      agi: d(19104),
    }));

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toContain("Line 15");
    expect(result.line23.toNumber()).toBe(0);
  });

  it("Illinois Expanded EITC Worksheet Line 23 - additional ITIN child can increase the Illinois base credit above federal EIC", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      qualifyingChildCount: 2,
      form1040Line1z: d(10000),
      agi: d(10000),
      primaryAge: 30,
    }));

    expect(result.line18.toNumber()).toBe(4000);
    expect(result.line23.toNumber()).toBe(4000);
  });

  it("Illinois Expanded EITC Worksheet Line 23 - AGI-based lookup caps the credit when AGI exceeds earned income", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      qualifyingChildCount: 1,
      form1040Line1z: d(10000),
      agi: d(30000),
      primaryAge: 30,
    }));

    expect(result.line18.toNumber()).toBe(3400);
    expect(result.line22?.toNumber()).toBe(3265);
    expect(result.line23.toNumber()).toBe(3265);
  });

  it("Illinois Expanded EITC Worksheet qualification - complex investment-income path accepts Worksheet 1 total at or below the limit", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      hasComplexInvestmentIncome: true,
      form1040Line1z: d(8490),
      agi: d(8490),
      investmentIncome: d(11950),
    }));

    expect(result.qualifies).toBe(true);
    expect(result.line23.toNumber()).toBe(649);
  });

  it("Illinois Expanded EITC Worksheet qualification - complex investment-income path above the Worksheet 1 limit disqualifies the credit", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      hasComplexInvestmentIncome: true,
      form1040Line1z: d(8490),
      agi: d(8490),
      investmentIncome: d(11951),
    }));

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("Investment income exceeds $11950");
    expect(result.line23.toNumber()).toBe(0);
  });

  it("Illinois Expanded EITC Worksheet qualification - questionnaire AGI limit disqualifies the credit even when earned income is lower", () => {
    const result = calculateIllinoisExpandedEITCWorksheet(makeInput({
      form1040Line1z: d(10000),
      agi: d(19104),
    }));

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("Form 1040 line 11a must be less than $19104");
    expect(result.line23.toNumber()).toBe(0);
  });
});
