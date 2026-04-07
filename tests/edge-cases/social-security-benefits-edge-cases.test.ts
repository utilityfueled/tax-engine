/**
 * Edge case tests for Social Security benefit taxation thresholds.
 * Spec: spec/federal/social-security-benefits-worksheet.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculateSocialSecurityBenefitsWorksheet,
  type SocialSecurityBenefitsWorksheetInput,
} from "@/engine/forms/social-security-benefits-worksheet.js";

const d = (value: number | string) => new Decimal(value);

function calculateThresholdCase(input: {
  filingStatus:
    | "single"
    | "head_of_household"
    | "qualifying_surviving_spouse"
    | "married_filing_jointly"
    | "married_filing_separately";
  benefitsReceived: number | string;
  otherIncome: number | string;
  livedWithSpouseAtAnyTimeDuringYear?: boolean;
}) {
  return calculateSocialSecurityBenefitsWorksheet({
    filingStatus: input.filingStatus,
    benefitsReceived: d(input.benefitsReceived),
    otherIncome: d(input.otherIncome),
    taxExemptInterest: d(0),
    livedWithSpouseAtAnyTimeDuringYear: input.livedWithSpouseAtAnyTimeDuringYear,
    adjustments: {},
  });
}

function calculateFullCase(input: SocialSecurityBenefitsWorksheetInput) {
  return calculateSocialSecurityBenefitsWorksheet(input);
}

describe("Social Security threshold boundaries", () => {
  it("single filers owe no tax at exactly the $25,000 provisional-income base amount", () => {
    const result = calculateThresholdCase({
      filingStatus: "single",
      benefitsReceived: 20000,
      otherIncome: 15000,
    });

    expect(result.line7.toNumber()).toBe(25000);
    expect(result.line8.toNumber()).toBe(25000);
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line18.toNumber()).toBe(0);
  });

  it("single filers tax only 50 percent of the first dollar above the $25,000 base amount", () => {
    const result = calculateThresholdCase({
      filingStatus: "single",
      benefitsReceived: 20000,
      otherIncome: 15001,
    });

    expect(result.line7.toNumber()).toBe(25001);
    expect(result.line9.toNumber()).toBe(1);
    expect(result.line14.toNumber()).toBe(0.5);
    expect(result.line18.toNumber()).toBe(0.5);
  });

  it("single filers stay in the 50 percent band at exactly the $34,000 second threshold", () => {
    const result = calculateThresholdCase({
      filingStatus: "single",
      benefitsReceived: 20000,
      otherIncome: 24000,
    });

    expect(result.line7.toNumber()).toBe(34000);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line14.toNumber()).toBe(4500);
    expect(result.line18.toNumber()).toBe(4500);
  });

  it("single filers tax only 85 percent of the first dollar above the $34,000 second threshold", () => {
    const result = calculateThresholdCase({
      filingStatus: "single",
      benefitsReceived: 20000,
      otherIncome: 24001,
    });

    expect(result.line7.toNumber()).toBe(34001);
    expect(result.line11.toNumber()).toBe(1);
    expect(result.line15.toNumber()).toBe(0.85);
    expect(result.line18.toNumber()).toBe(4500.85);
  });

  it("married filing jointly filers owe no tax at exactly the $32,000 base amount and reach only the 50 percent band at $44,000", () => {
    const atBaseAmount = calculateThresholdCase({
      filingStatus: "married_filing_jointly",
      benefitsReceived: 24000,
      otherIncome: 20000,
    });
    const atSecondThreshold = calculateThresholdCase({
      filingStatus: "married_filing_jointly",
      benefitsReceived: 24000,
      otherIncome: 32000,
    });

    expect(atBaseAmount.line7.toNumber()).toBe(32000);
    expect(atBaseAmount.line18.toNumber()).toBe(0);
    expect(atSecondThreshold.line7.toNumber()).toBe(44000);
    expect(atSecondThreshold.line11.toNumber()).toBe(0);
    expect(atSecondThreshold.line18.toNumber()).toBe(6000);
  });

  it("married filing jointly filers tax only 85 percent of the first dollar above the $44,000 second threshold", () => {
    const result = calculateThresholdCase({
      filingStatus: "married_filing_jointly",
      benefitsReceived: 24000,
      otherIncome: 32001,
    });

    expect(result.line7.toNumber()).toBe(44001);
    expect(result.line11.toNumber()).toBe(1);
    expect(result.line15.toNumber()).toBe(0.85);
    expect(result.line18.toNumber()).toBe(6000.85);
  });

  it("married filing separately taxpayers living apart keep the standard $25,000 threshold", () => {
    const result = calculateThresholdCase({
      filingStatus: "married_filing_separately",
      benefitsReceived: 20000,
      otherIncome: 24000,
      livedWithSpouseAtAnyTimeDuringYear: false,
    });

    expect(result.line8.toNumber()).toBe(25000);
    expect(result.line14.toNumber()).toBe(4500);
    expect(result.line18.toNumber()).toBe(4500);
  });

  it("married filing separately taxpayers living apart tax only 50 percent of the first dollar above the $25,000 base amount", () => {
    const result = calculateThresholdCase({
      filingStatus: "married_filing_separately",
      benefitsReceived: 20000,
      otherIncome: 15001,
      livedWithSpouseAtAnyTimeDuringYear: false,
    });

    expect(result.line7.toNumber()).toBe(25001);
    expect(result.line8.toNumber()).toBe(25000);
    expect(result.line9.toNumber()).toBe(1);
    expect(result.line14.toNumber()).toBe(0.5);
    expect(result.line18.toNumber()).toBe(0.5);
  });

  it("head of household uses the same $25,000 and $34,000 Social Security thresholds as a single filer", () => {
    const atBaseAmount = calculateThresholdCase({
      filingStatus: "head_of_household",
      benefitsReceived: 20000,
      otherIncome: 15000,
    });
    const oneDollarOverSecondThreshold = calculateThresholdCase({
      filingStatus: "head_of_household",
      benefitsReceived: 20000,
      otherIncome: 24001,
    });

    expect(atBaseAmount.line8.toNumber()).toBe(25000);
    expect(atBaseAmount.line10.toNumber()).toBe(9000);
    expect(atBaseAmount.line18.toNumber()).toBe(0);
    expect(oneDollarOverSecondThreshold.line8.toNumber()).toBe(25000);
    expect(oneDollarOverSecondThreshold.line10.toNumber()).toBe(9000);
    expect(oneDollarOverSecondThreshold.line15.toNumber()).toBe(0.85);
    expect(oneDollarOverSecondThreshold.line18.toNumber()).toBe(4500.85);
  });

  it("qualifying surviving spouse uses the same single-filer Social Security threshold bands", () => {
    const atSecondThreshold = calculateThresholdCase({
      filingStatus: "qualifying_surviving_spouse",
      benefitsReceived: 20000,
      otherIncome: 24000,
    });
    const oneDollarOverBaseAmount = calculateThresholdCase({
      filingStatus: "qualifying_surviving_spouse",
      benefitsReceived: 20000,
      otherIncome: 15001,
    });

    expect(atSecondThreshold.line8.toNumber()).toBe(25000);
    expect(atSecondThreshold.line10.toNumber()).toBe(9000);
    expect(atSecondThreshold.line11.toNumber()).toBe(0);
    expect(atSecondThreshold.line18.toNumber()).toBe(4500);
    expect(oneDollarOverBaseAmount.line9.toNumber()).toBe(1);
    expect(oneDollarOverBaseAmount.line14.toNumber()).toBe(0.5);
    expect(oneDollarOverBaseAmount.line18.toNumber()).toBe(0.5);
  });

  it("married filing separately taxpayers who lived with a spouse use the zero-dollar threshold and the 85 percent branch immediately", () => {
    const result = calculateThresholdCase({
      filingStatus: "married_filing_separately",
      benefitsReceived: 20000,
      otherIncome: 0,
      livedWithSpouseAtAnyTimeDuringYear: true,
    });

    expect(result.line8.toNumber()).toBe(0);
    expect(result.line16.toNumber()).toBe(8500);
    expect(result.line17.toNumber()).toBe(17000);
    expect(result.line18.toNumber()).toBe(8500);
  });

  it("married filing jointly filers tax 50 percent of the first dollar above the $32,000 base amount", () => {
    const result = calculateThresholdCase({
      filingStatus: "married_filing_jointly",
      benefitsReceived: 24000,
      otherIncome: 20001,
    });

    expect(result.line7.toNumber()).toBe(32001);
    expect(result.line9.toNumber()).toBe(1);
    expect(result.line14.toNumber()).toBe(0.5);
    expect(result.line18.toNumber()).toBe(0.5);
  });

  it("married filing separately taxpayers living apart stay in the 50 percent band at exactly the $34,000 second threshold", () => {
    const result = calculateThresholdCase({
      filingStatus: "married_filing_separately",
      benefitsReceived: 20000,
      otherIncome: 24000,
      livedWithSpouseAtAnyTimeDuringYear: false,
    });

    expect(result.line7.toNumber()).toBe(34000);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line14.toNumber()).toBe(4500);
    expect(result.line18.toNumber()).toBe(4500);
  });

  it("married filing separately taxpayers living apart tax 85 percent of the first dollar above the $34,000 second threshold", () => {
    const result = calculateThresholdCase({
      filingStatus: "married_filing_separately",
      benefitsReceived: 20000,
      otherIncome: 24001,
      livedWithSpouseAtAnyTimeDuringYear: false,
    });

    expect(result.line7.toNumber()).toBe(34001);
    expect(result.line11.toNumber()).toBe(1);
    expect(result.line15.toNumber()).toBe(0.85);
    expect(result.line18.toNumber()).toBe(4500.85);
  });
});

describe("Social Security 85 percent overall cap", () => {
  it("Line 18 - single filer with high income and small benefits is capped at 85 percent of total benefits", () => {
    // benefits = 6000, otherIncome = 50000 → provisional = 53000
    // line16 = 3000 + 16150 = 19150, but line17 = 5100, so line18 = 5100
    const result = calculateThresholdCase({
      filingStatus: "single",
      benefitsReceived: 6000,
      otherIncome: 50000,
    });

    expect(result.line16.toNumber()).toBe(19150);
    expect(result.line17.toNumber()).toBe(5100);
    expect(result.line18.toNumber()).toBe(5100);
  });

  it("Line 18 - MFJ filer with high income and small benefits is capped at 85 percent of total benefits", () => {
    // benefits = 8000, otherIncome = 80000 → provisional = 84000
    // line9 = 52000, line11 = 40000, line14 = min(4000, 4500) = 4000 (50% cap binds first)
    // line15 = 34000, line16 = 4000 + 34000 = 38000
    // line17 = 6800, line18 = 6800
    const result = calculateThresholdCase({
      filingStatus: "married_filing_jointly",
      benefitsReceived: 8000,
      otherIncome: 80000,
    });

    expect(result.line14.toNumber()).toBe(4000);
    expect(result.line17.toNumber()).toBe(6800);
    expect(result.line18.toNumber()).toBe(6800);
  });

  it("Line 18 - very high income ensures taxable benefits equal exactly 85 percent of benefits for all filing statuses", () => {
    const statuses: Array<{
      filingStatus: "single" | "head_of_household" | "qualifying_surviving_spouse" | "married_filing_jointly";
    }> = [
      { filingStatus: "single" },
      { filingStatus: "head_of_household" },
      { filingStatus: "qualifying_surviving_spouse" },
      { filingStatus: "married_filing_jointly" },
    ];

    for (const { filingStatus } of statuses) {
      const result = calculateThresholdCase({
        filingStatus,
        benefitsReceived: 30000,
        otherIncome: 500000,
      });

      expect(result.line18.toNumber()).toBe(25500);
      expect(result.line17.toNumber()).toBe(25500);
      expect(result.line16.greaterThan(result.line17)).toBe(true);
    }
  });
});

describe("Social Security 50 percent of benefits cap in the lower tier", () => {
  it("Line 14 - half of benefits caps the lower-tier inclusion when benefits are small relative to provisional excess", () => {
    // benefits = 2000, otherIncome = 27000 → provisional = 28000
    // line2 = 1000, line9 = 3000, line13 = 1500
    // line14 = min(1000, 1500) = 1000 ← 50% of benefits is binding
    const result = calculateThresholdCase({
      filingStatus: "single",
      benefitsReceived: 2000,
      otherIncome: 27000,
    });

    expect(result.line2.toNumber()).toBe(1000);
    expect(result.line13.toNumber()).toBe(1500);
    expect(result.line14.toNumber()).toBe(1000);
    expect(result.line18.toNumber()).toBe(1000);
  });

  it("Line 14 - half of benefits exactly equals half of lower-tier band when both are at the same value", () => {
    // benefits = 4000, otherIncome = 27000 → provisional = 29000
    // line2 = 2000, line9 = 4000, line13 = 2000
    // line14 = min(2000, 2000) = 2000 — both caps bind simultaneously
    const result = calculateThresholdCase({
      filingStatus: "single",
      benefitsReceived: 4000,
      otherIncome: 27000,
    });

    expect(result.line2.toNumber()).toBe(2000);
    expect(result.line13.toNumber()).toBe(2000);
    expect(result.line14.toNumber()).toBe(2000);
    expect(result.line18.toNumber()).toBe(2000);
  });
});

describe("Social Security tax-exempt interest and Schedule 1 adjustments", () => {
  it("Line 4 - tax-exempt interest pushes provisional income above the single $25,000 base amount", () => {
    // Without tax-exempt interest: provisional = 24000 < 25000 → taxable = 0
    // With $1001 tax-exempt interest: provisional = 25001 → taxable = 0.50
    const result = calculateFullCase({
      filingStatus: "single",
      benefitsReceived: d(20000),
      otherIncome: d(14000),
      taxExemptInterest: d(1001),
      adjustments: {},
    });

    expect(result.line4.toNumber()).toBe(1001);
    expect(result.line7.toNumber()).toBe(25001);
    expect(result.line18.toNumber()).toBe(0.5);
  });

  it("Line 6 - Schedule 1 SE deduction reduces provisional income below the single $25,000 base amount", () => {
    // Without adjustment: provisional = 30000 > 25000 → taxable benefits
    // With SE deduction of 5000: provisional = 25000 → taxable = 0
    const result = calculateFullCase({
      filingStatus: "single",
      benefitsReceived: d(20000),
      otherIncome: d(20000),
      taxExemptInterest: d(0),
      adjustments: { seDeduction: d(5000) },
    });

    expect(result.line6.toNumber()).toBe(5000);
    expect(result.line7.toNumber()).toBe(25000);
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line18.toNumber()).toBe(0);
  });

  it("Line 6 - multiple Schedule 1 adjustments combine to reduce provisional income", () => {
    // Without adjustments: provisional = 32000 > 25000
    // With HSA 3000 + IRA 4000 = 7000 total: provisional = 25000 → taxable = 0
    const result = calculateFullCase({
      filingStatus: "single",
      benefitsReceived: d(20000),
      otherIncome: d(22000),
      taxExemptInterest: d(0),
      adjustments: {
        hsaDeduction: d(3000),
        iraDeduction: d(4000),
      },
    });

    expect(result.line6.toNumber()).toBe(7000);
    expect(result.line7.toNumber()).toBe(25000);
    expect(result.line18.toNumber()).toBe(0);
  });

  it("Line 6 - student loan interest is excluded from add-backs and does not affect provisional income", () => {
    // Same scenario but with student loan interest — should NOT change the result
    const withoutStudentLoan = calculateFullCase({
      filingStatus: "single",
      benefitsReceived: d(20000),
      otherIncome: d(20000),
      taxExemptInterest: d(0),
      adjustments: {},
    });
    const withStudentLoan = calculateFullCase({
      filingStatus: "single",
      benefitsReceived: d(20000),
      otherIncome: d(20000),
      taxExemptInterest: d(0),
      adjustments: { studentLoanInterest: d(2500) },
    });

    expect(withoutStudentLoan.line6.toNumber()).toBe(0);
    expect(withStudentLoan.line6.toNumber()).toBe(0);
    expect(withoutStudentLoan.line7.toNumber()).toBe(withStudentLoan.line7.toNumber());
    expect(withoutStudentLoan.line18.toNumber()).toBe(withStudentLoan.line18.toNumber());
  });

  it("Line 6 - Schedule 1 adjustment partially reduces taxable benefits without eliminating them", () => {
    // Without adjustment: provisional = 30000, excess = 5000, taxable = 2500
    // With 3000 adjustment: provisional = 27000, excess = 2000, taxable = 1000
    const result = calculateFullCase({
      filingStatus: "single",
      benefitsReceived: d(20000),
      otherIncome: d(20000),
      taxExemptInterest: d(0),
      adjustments: { seDeduction: d(3000) },
    });

    expect(result.line6.toNumber()).toBe(3000);
    expect(result.line7.toNumber()).toBe(27000);
    expect(result.line9.toNumber()).toBe(2000);
    expect(result.line14.toNumber()).toBe(1000);
    expect(result.line18.toNumber()).toBe(1000);
  });
});

describe("Social Security zero and extreme benefits", () => {
  it("Line 18 - zero benefits received produces zero taxable benefits regardless of other income", () => {
    const result = calculateThresholdCase({
      filingStatus: "single",
      benefitsReceived: 0,
      otherIncome: 100000,
    });

    expect(result.line1.toNumber()).toBe(0);
    expect(result.line2.toNumber()).toBe(0);
    expect(result.line17.toNumber()).toBe(0);
    expect(result.line18.toNumber()).toBe(0);
  });

  it("Line 18 - one dollar of benefits with very high income is taxed at 85 percent", () => {
    const result = calculateThresholdCase({
      filingStatus: "single",
      benefitsReceived: 1,
      otherIncome: 500000,
    });

    expect(result.line17.toNumber()).toBe(0.85);
    expect(result.line18.toNumber()).toBe(0.85);
  });
});

describe("Social Security MFS lived-with-spouse edge cases", () => {
  it("Line 16 - MFS lived with spouse floors negative provisional income at zero before applying 85 percent", () => {
    // benefits = 10000, otherIncome = 0, SE deduction = 6000
    // line2 = 5000, line5 = 5000, line6 = 6000, line7 = -1000
    // line16 = max(0, -1000) × 0.85 = 0
    const result = calculateFullCase({
      filingStatus: "married_filing_separately",
      benefitsReceived: d(10000),
      otherIncome: d(0),
      taxExemptInterest: d(0),
      livedWithSpouseAtAnyTimeDuringYear: true,
      adjustments: { seDeduction: d(6000) },
    });

    expect(result.line7.toNumber()).toBe(-1000);
    expect(result.line16.toNumber()).toBe(0);
    expect(result.line18.toNumber()).toBe(0);
  });

  it("Line 16 - MFS lived with spouse with exactly one dollar of provisional income taxes at 85 cents", () => {
    // benefits = 20000, otherIncome = 0
    // line2 = 10000, line5 = 10000, line6 = 9999, line7 = 1
    // line16 = max(0, 1) × 0.85 = 0.85
    // line17 = 17000, line18 = min(0.85, 17000) = 0.85
    const result = calculateFullCase({
      filingStatus: "married_filing_separately",
      benefitsReceived: d(20000),
      otherIncome: d(0),
      taxExemptInterest: d(0),
      livedWithSpouseAtAnyTimeDuringYear: true,
      adjustments: { seDeduction: d(9999) },
    });

    expect(result.line7.toNumber()).toBe(1);
    expect(result.line16.toNumber()).toBe(0.85);
    expect(result.line18.toNumber()).toBe(0.85);
  });

  it("Line 16 - MFS lived with spouse with zero other income taxes 85 percent of half-benefits as provisional income", () => {
    // benefits = 12000, otherIncome = 0
    // line2 = 6000, line5 = 6000, line7 = 6000
    // line16 = max(0, 6000) × 0.85 = 5100
    // line17 = 10200, line18 = 5100
    const result = calculateThresholdCase({
      filingStatus: "married_filing_separately",
      benefitsReceived: 12000,
      otherIncome: 0,
      livedWithSpouseAtAnyTimeDuringYear: true,
    });

    expect(result.line7.toNumber()).toBe(6000);
    expect(result.line16.toNumber()).toBe(5100);
    expect(result.line17.toNumber()).toBe(10200);
    expect(result.line18.toNumber()).toBe(5100);
  });
});

describe("Social Security lump-sum election edge cases", () => {
  it("lump-sum election is preferred when it produces lower taxable benefits than the standard worksheet", () => {
    // Standard: benefits 30000, otherIncome 30000, single
    // provisional = 15000 + 30000 = 45000
    // excess = 20000, upper excess = 11000, lower band = 9000
    // line14 = min(15000, 4500) = 4500, line15 = 9350
    // line18 = min(13850, 25500) = 13850
    //
    // Lump-sum: 10000 of the 30000 came from a prior-year delayed payment
    // Current year benefits = 20000, current provisional = 20000/2 + 30000 = 40000
    // Earlier year refigured: total benefits = 28000, provisional = 35000
    const result = calculateFullCase({
      filingStatus: "single",
      benefitsReceived: d(30000),
      otherIncome: d(30000),
      taxExemptInterest: d(0),
      adjustments: {},
      lumpSumElection: {
        earlierYears: [
          {
            taxYear: 2023,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: d(18000),
            delayedBenefitsReceivedInCurrentYear: d(10000),
            adjustedGrossIncome: d(25000),
            taxExemptInterest: d(0),
            exclusionsAdjustments: d(0),
            taxableBenefitsPreviouslyReported: d(4000),
          },
        ],
      },
    });

    expect(result.standardTaxableBenefits.toNumber()).toBe(13850);
    expect(result.usedLumpSumElection).toBe(true);
    expect(result.taxableBenefits.lessThan(result.standardTaxableBenefits)).toBe(true);
  });

  it("lump-sum election is not used when the standard worksheet produces the same or lower result", () => {
    // Scenario: prior year had low previously reported taxable benefits,
    // so refigured additional benefits are large, making lump-sum total exceed standard
    const result = calculateFullCase({
      filingStatus: "single",
      benefitsReceived: d(25000),
      otherIncome: d(30000),
      taxExemptInterest: d(0),
      adjustments: {},
      lumpSumElection: {
        earlierYears: [
          {
            taxYear: 2023,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: d(20000),
            delayedBenefitsReceivedInCurrentYear: d(5000),
            adjustedGrossIncome: d(50000),
            taxExemptInterest: d(0),
            exclusionsAdjustments: d(0),
            taxableBenefitsPreviouslyReported: d(0),
          },
        ],
      },
    });

    expect(result.usedLumpSumElection).toBe(false);
    expect(result.taxableBenefits.toNumber()).toBe(result.standardTaxableBenefits.toNumber());
  });
});
