/**
 * Edge case tests for Form 5329 across all nine parts.
 * Spec: spec/federal/form-5329.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateForm5329 } from "@/engine/forms/form-5329.js";

describe("Form 5329 early-distribution edge cases", () => {
  it("Form 5329 Line 1 - supported exclusions cannot drive the penalty base below zero", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "4000",
      supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome: "2500",
      supportedEligibleGovernmental457bDistributionsExcludedFromLine1: "3000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
    });

    expect(result.line1.toNumber()).toBe(0);
    expect(result.line2.toNumber()).toBe(0);
    expect(result.line3.toNumber()).toBe(0);
    expect(result.line4.toNumber()).toBe(0);
  });

  it("Form 5329 Line 4 - the SIMPLE IRA amount is clamped to the post-exception Line 3 amount", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "6000",
      distributionsNotSubjectToAdditionalTax: "5000",
      simpleIRADistributionsWithinFirstTwoYears: "4000",
    });

    expect(result.line1.toNumber()).toBe(6000);
    expect(result.line2.toNumber()).toBe(5000);
    expect(result.line3.toNumber()).toBe(1000);
    expect(result.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(1000);
    expect(result.line4.toNumber()).toBe(250);
  });

  it("Form 5329 Line 4 - a fully exempt SIMPLE IRA distribution leaves no 25 percent branch behind", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "5000",
      distributionsNotSubjectToAdditionalTax: "5000",
      simpleIRADistributionsWithinFirstTwoYears: "5000",
    });

    expect(result.line1.toNumber()).toBe(5000);
    expect(result.line2.toNumber()).toBe(5000);
    expect(result.line3.toNumber()).toBe(0);
    expect(result.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(0);
    expect(result.line4.toNumber()).toBe(0);
  });

  it("Form 5329 Line 2 - capped medical and higher education exceptions still collapse to exception number 99", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "4000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      medicalExpenseExceptionAmount: "3000",
      qualifiedHigherEducationExpenseExceptionAmount: "3000",
    });

    expect(result.line1.toNumber()).toBe(4000);
    expect(result.line2.toNumber()).toBe(4000);
    expect(result.line2ExceptionNumber).toBe("99");
    expect(result.line3.toNumber()).toBe(0);
    expect(result.line4.toNumber()).toBe(0);
  });

  it("Form 5329 Line 2 - death and terminal-illness exceptions collapse to exception number 99 when both apply", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "7000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      deathDistributionExceptionAmount: "3000",
      terminalIllnessExceptionAmount: "2000",
    });

    expect(result.line1.toNumber()).toBe(7000);
    expect(result.line2.toNumber()).toBe(5000);
    expect(result.line2ExceptionNumber).toBe("99");
    expect(result.line3.toNumber()).toBe(2000);
    expect(result.line4.toNumber()).toBe(200);
  });

  it("Form 5329 Line 2 - IRS levy and qualified reservist exceptions collapse to exception number 99 when both apply", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "7000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      irsLevyDistributionExceptionAmount: "2500",
      qualifiedReservistDistributionExceptionAmount: "1200",
    });

    expect(result.line1.toNumber()).toBe(7000);
    expect(result.line2.toNumber()).toBe(3700);
    expect(result.line2ExceptionNumber).toBe("99");
    expect(result.line3.toNumber()).toBe(3300);
    expect(result.line4.toNumber()).toBe(330);
  });

  it("Form 5329 Line 2 - section 404(k) dividends and permissible EACA withdrawals collapse to exception number 99 when both apply", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "7000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      section404kDividendDistributionExceptionAmount: "1500",
      permissibleEacaWithdrawalExceptionAmount: "1100",
    });

    expect(result.line1.toNumber()).toBe(7000);
    expect(result.line2.toNumber()).toBe(2600);
    expect(result.line2ExceptionNumber).toBe("99");
    expect(result.line3.toNumber()).toBe(4400);
    expect(result.line4.toNumber()).toBe(440);
  });

  it("Form 5329 Line 2 - exception 14 collapses to 99 when combined with another structured exception", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "7000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      pre1986EmployerPlanDistributionExceptionAmount: "1500",
      section72qAnnuityExceptionAmount: "1200",
    });

    expect(result.line1.toNumber()).toBe(7000);
    expect(result.line2.toNumber()).toBe(2700);
    expect(result.line2ExceptionNumber).toBe("99");
    expect(result.line3.toNumber()).toBe(4300);
    expect(result.line4.toNumber()).toBe(430);
  });

  it("Form 5329 Line 2 - exhausted first-time homebuyer lifetime room leaves exception 09 at zero", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "7000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      qualifiedFirstTimeHomebuyerDistributionAmount: "2500",
      supportedQualifiedFirstTimeHomebuyerDistribution: "1500",
      priorQualifiedFirstTimeHomebuyerDistributions: "10000",
    });

    expect(result.line1.toNumber()).toBe(7000);
    expect(result.line2.toNumber()).toBe(0);
    expect(result.line2ExceptionNumber).toBeUndefined();
    expect(result.line3.toNumber()).toBe(7000);
    expect(result.line4.toNumber()).toBe(700);
  });

  it("Form 5329 Line 2 - a direct manual exception 22 amount is capped at $10,300 for 2025", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "12000",
      distributionsNotSubjectToAdditionalTax: "15000",
      distributionExceptionNumber: "22",
      simpleIRADistributionsWithinFirstTwoYears: "0",
    });

    expect(result.line1.toNumber()).toBe(12000);
    expect(result.line2.toNumber()).toBe(10300);
    expect(result.line2ExceptionNumber).toBe("22");
    expect(result.line3.toNumber()).toBe(1700);
    expect(result.line4.toNumber()).toBe(170);
  });

  it("Form 5329 Line 2 - emergency personal expense exception is capped at $1,000 for 2025", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "5000",
      distributionsNotSubjectToAdditionalTax: "3000",
      distributionExceptionNumber: "23",
      simpleIRADistributionsWithinFirstTwoYears: "0",
    });

    expect(result.line1.toNumber()).toBe(5000);
    // Manual exception 23 capped at $1,000
    expect(result.line2.toNumber()).toBe(1000);
    expect(result.line2ExceptionNumber).toBe("23");
    expect(result.line3.toNumber()).toBe(4000);
    expect(result.line4.toNumber()).toBe(400);
  });

  it("Form 5329 Line 1 - Roth conversion recapture amount adds to the penalty base", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "3000",
      rothConversionRecaptureAmount: "2000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
    });

    // Line 1 = max(0, 3000 - 0 - 0) + 2000 = 5000
    expect(result.line1.toNumber()).toBe(5000);
    expect(result.line3.toNumber()).toBe(5000);
    expect(result.line4.toNumber()).toBe(500);
  });

  it("Form 5329 Part I - all zero inputs produce zero penalty", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
    });

    expect(result.line1.toNumber()).toBe(0);
    expect(result.line2.toNumber()).toBe(0);
    expect(result.line3.toNumber()).toBe(0);
    expect(result.line4.toNumber()).toBe(0);
    expect(result.line2ExceptionNumber).toBeUndefined();
  });

  it("Form 5329 Line 4 - mixed SIMPLE IRA and regular early distribution computes blended penalty", () => {
    // $10,000 total early distributions, $4,000 SIMPLE IRA, no exceptions
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "10000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "4000",
    });

    expect(result.line1.toNumber()).toBe(10000);
    expect(result.line3.toNumber()).toBe(10000);
    expect(result.simpleIRADistributionsWithinFirstTwoYears.toNumber()).toBe(4000);
    // Line 4 = 10% × 10000 + 15% × 4000 = 1000 + 600 = 1600
    expect(result.line4.toNumber()).toBe(1600);
  });

  it("Form 5329 Line 2 - single exception reports its own number instead of 99", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "5000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      qualifiedBirthOrAdoptionExceptionAmount: "5000",
    });

    expect(result.line2.toNumber()).toBe(5000);
    expect(result.line2ExceptionNumber).toBe("19");
    expect(result.line3.toNumber()).toBe(0);
    expect(result.line4.toNumber()).toBe(0);
  });
});

describe("Form 5329 Part II - education account distribution edge cases", () => {
  it("Form 5329 Part II Line 8 - 10% tax on non-excepted education account distributions", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      educationAccountDistributionsIncludedInIncome: "5000",
      educationAccountDistributionsExcepted: "0",
    });

    expect(result.line5.toNumber()).toBe(5000);
    expect(result.line6.toNumber()).toBe(0);
    expect(result.line7.toNumber()).toBe(5000);
    expect(result.line8.toNumber()).toBe(500);
  });

  it("Form 5329 Part II Line 6 - excepted amount cannot exceed distributions", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      educationAccountDistributionsIncludedInIncome: "3000",
      educationAccountDistributionsExcepted: "5000",
    });

    expect(result.line5.toNumber()).toBe(3000);
    expect(result.line6.toNumber()).toBe(3000);
    expect(result.line7.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
  });

  it("Form 5329 Part II - partial exception reduces taxable portion", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      educationAccountDistributionsIncludedInIncome: "8000",
      educationAccountDistributionsExcepted: "3000",
    });

    expect(result.line5.toNumber()).toBe(8000);
    expect(result.line6.toNumber()).toBe(3000);
    expect(result.line7.toNumber()).toBe(5000);
    expect(result.line8.toNumber()).toBe(500);
  });
});

describe("Form 5329 Part III - traditional IRA excess contribution edge cases", () => {
  it("Form 5329 Part III Line 17 - 6% tax on excess contributions", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      traditionalIRAPriorYearExcessContributions: "0",
      traditionalIRACurrentYearExcessContributions: "2000",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line15.toNumber()).toBe(2000);
    expect(result.line16.toNumber()).toBe(2000);
    // 6% × min(2000, 50000) = 120
    expect(result.line17.toNumber()).toBe(120);
  });

  it("Form 5329 Part III Line 17 - year-end value caps the 6% excise when lower than excess", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      traditionalIRAPriorYearExcessContributions: "0",
      traditionalIRACurrentYearExcessContributions: "10000",
      traditionalIRAValueDec31: "3000",
    });

    expect(result.line16.toNumber()).toBe(10000);
    // 6% × min(10000, 3000) = 6% × 3000 = 180
    expect(result.line17.toNumber()).toBe(180);
  });

  it("Form 5329 Part III Line 17 - zero year-end value produces no tax even with excess", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      traditionalIRAPriorYearExcessContributions: "5000",
      traditionalIRACurrentYearExcessContributions: "0",
      traditionalIRAValueDec31: "0",
    });

    expect(result.line16.toNumber()).toBe(5000);
    expect(result.line17.toNumber()).toBe(0);
  });

  it("Form 5329 Part III Lines 9-14 - contribution room and distributions absorb prior-year excess", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      traditionalIRAPriorYearExcessContributions: "5000",
      traditionalIRAContributionRoom: "1000",
      traditionalIRADistributionsIncludedInIncome: "1500",
      traditionalIRAPriorYearExcessReturned: "500",
      traditionalIRACurrentYearExcessContributions: "0",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line9.toNumber()).toBe(5000);
    expect(result.line10.toNumber()).toBe(1000);
    expect(result.line11.toNumber()).toBe(1500);
    expect(result.line12.toNumber()).toBe(500);
    // Line 13 = 1000 + 1500 + 500 = 3000
    expect(result.line13.toNumber()).toBe(3000);
    // Line 14 = max(0, 5000 - 3000) = 2000
    expect(result.line14.toNumber()).toBe(2000);
    expect(result.line16.toNumber()).toBe(2000);
    // 6% × 2000 = 120
    expect(result.line17.toNumber()).toBe(120);
  });

  it("Form 5329 Part III Line 14 - reductions exceeding prior excess floor at zero", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      traditionalIRAPriorYearExcessContributions: "2000",
      traditionalIRAContributionRoom: "3000",
      traditionalIRACurrentYearExcessContributions: "0",
      traditionalIRAValueDec31: "50000",
    });

    expect(result.line14.toNumber()).toBe(0);
    expect(result.line16.toNumber()).toBe(0);
    expect(result.line17.toNumber()).toBe(0);
  });
});

describe("Form 5329 Part IV - Roth IRA excess contribution edge cases", () => {
  it("Form 5329 Part IV Line 25 - 6% tax on Roth excess contributions", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      rothIRAPriorYearExcessContributions: "0",
      rothIRACurrentYearExcessContributions: "1500",
      rothIRAValueDec31: "40000",
    });

    expect(result.line23.toNumber()).toBe(1500);
    expect(result.line24.toNumber()).toBe(1500);
    // 6% × min(1500, 40000) = 90
    expect(result.line25.toNumber()).toBe(90);
  });

  it("Form 5329 Part IV Line 25 - year-end value caps the Roth excise tax", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      rothIRAPriorYearExcessContributions: "8000",
      rothIRACurrentYearExcessContributions: "3000",
      rothIRAValueDec31: "2000",
    });

    // Prior excess 8000, no reductions, plus current 3000 = 11000
    expect(result.line22.toNumber()).toBe(8000);
    expect(result.line24.toNumber()).toBe(11000);
    // 6% × min(11000, 2000) = 120
    expect(result.line25.toNumber()).toBe(120);
  });

  it("Form 5329 Part IV Lines 18-22 - distributions and contribution room absorb prior Roth excess", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      rothIRAPriorYearExcessContributions: "6000",
      rothIRAContributionRoom: "2000",
      rothIRADistributions: "3000",
      rothIRACurrentYearExcessContributions: "0",
      rothIRAValueDec31: "30000",
    });

    expect(result.line18.toNumber()).toBe(6000);
    expect(result.line19.toNumber()).toBe(2000);
    expect(result.line20.toNumber()).toBe(3000);
    // Line 21 = 2000 + 3000 = 5000
    expect(result.line21.toNumber()).toBe(5000);
    // Line 22 = max(0, 6000 - 5000) = 1000
    expect(result.line22.toNumber()).toBe(1000);
    expect(result.line24.toNumber()).toBe(1000);
    // 6% × 1000 = 60
    expect(result.line25.toNumber()).toBe(60);
  });
});

describe("Form 5329 Part VII - HSA excess contribution edge cases", () => {
  it("Form 5329 Part VII Line 49 - 6% tax on HSA excess contributions", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      hsaPriorYearExcessContributions: "0",
      hsaCurrentYearExcessContributions: "1200",
      hsaValueDec31: "10000",
    });

    expect(result.line47.toNumber()).toBe(1200);
    expect(result.line48.toNumber()).toBe(1200);
    // 6% × min(1200, 10000) = 72
    expect(result.line49.toNumber()).toBe(72);
  });

  it("Form 5329 Part VII Line 47 - returned excess contributions reduce current-year excess", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      hsaPriorYearExcessContributions: "0",
      hsaCurrentYearExcessContributions: "3000",
      supportedHsaReturnedExcessContributionsByDueDate: "1500",
      hsaValueDec31: "10000",
    });

    // Line 47 = max(0, 3000 - 1500) = 1500
    expect(result.line47.toNumber()).toBe(1500);
    expect(result.line48.toNumber()).toBe(1500);
    // 6% × 1500 = 90
    expect(result.line49.toNumber()).toBe(90);
  });

  it("Form 5329 Part VII Line 47 - section 301.9100-2 relief also reduces current-year excess", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      hsaPriorYearExcessContributions: "0",
      hsaCurrentYearExcessContributions: "2000",
      supportedHsaReturnedExcessContributionsByDueDate: "500",
      supportedHsaReturnedExcessContributionsUnder9100Relief: "800",
      hsaValueDec31: "10000",
    });

    // Line 47 = max(0, 2000 - 500 - 800) = 700
    expect(result.line47.toNumber()).toBe(700);
    expect(result.line48.toNumber()).toBe(700);
    // 6% × 700 = 42
    expect(result.line49.toNumber()).toBe(42);
  });

  it("Form 5329 Part VII Line 47 - returned excess cannot drive current-year excess below zero", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      hsaPriorYearExcessContributions: "0",
      hsaCurrentYearExcessContributions: "1000",
      supportedHsaReturnedExcessContributionsByDueDate: "2000",
      hsaValueDec31: "5000",
    });

    expect(result.line47.toNumber()).toBe(0);
    expect(result.line48.toNumber()).toBe(0);
    expect(result.line49.toNumber()).toBe(0);
  });

  it("Form 5329 Part VII - prior-year excess combined with current-year excess", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      hsaPriorYearExcessContributions: "2000",
      hsaContributionRoom: "500",
      hsaDistributions: "300",
      hsaCurrentYearExcessContributions: "1000",
      hsaValueDec31: "8000",
    });

    // Line 45 = 500 + 300 = 800
    expect(result.line45.toNumber()).toBe(800);
    // Line 46 = max(0, 2000 - 800) = 1200
    expect(result.line46.toNumber()).toBe(1200);
    // Line 48 = 1200 + 1000 = 2200
    expect(result.line48.toNumber()).toBe(2200);
    // 6% × min(2200, 8000) = 132
    expect(result.line49.toNumber()).toBe(132);
  });
});

describe("Form 5329 Part VIII - ABLE account excess contribution edge cases", () => {
  it("Form 5329 Part VIII Line 53 - 6% tax on ABLE excess contributions", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      ablePriorYearExcessContributions: "0",
      ableCurrentYearExcessContributions: "5000",
      ableValueDec31: "20000",
    });

    expect(result.line52.toNumber()).toBe(5000);
    // 6% × min(5000, 20000) = 300
    expect(result.line53.toNumber()).toBe(300);
  });

  it("Form 5329 Part VIII Line 53 - year-end ABLE value caps the excise tax", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      ablePriorYearExcessContributions: "3000",
      ableReductions: "0",
      ableCurrentYearExcessContributions: "2000",
      ableValueDec31: "1000",
    });

    // Total excess = (3000 - 0) + 2000 = 5000
    // 6% × min(5000, 1000) = 60
    expect(result.line53.toNumber()).toBe(60);
  });

  it("Form 5329 Part VIII - reductions absorb prior-year ABLE excess", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      ablePriorYearExcessContributions: "4000",
      ableReductions: "3500",
      ableCurrentYearExcessContributions: "0",
      ableValueDec31: "15000",
    });

    // Remaining prior = max(0, 4000 - 3500) = 500
    // Total = 500 + 0 = 500
    // 6% × min(500, 15000) = 30
    expect(result.line53.toNumber()).toBe(30);
  });

  it("Form 5329 Part VIII - zero ABLE value results in no tax", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      ablePriorYearExcessContributions: "2000",
      ableReductions: "0",
      ableCurrentYearExcessContributions: "1000",
      ableValueDec31: "0",
    });

    expect(result.line53.toNumber()).toBe(0);
  });
});

describe("Form 5329 Part IX - RMD excess accumulation edge cases", () => {
  it("Form 5329 Part IX Line 57 - 25% penalty on uncorrected RMD shortfall", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      requiredMinimumDistribution: "10000",
      actualDistributionsForRMD: "6000",
    });

    expect(result.line54.toNumber()).toBe(10000);
    expect(result.line55.toNumber()).toBe(6000);
    // Line 56 = max(0, 10000 - 6000) = 4000
    expect(result.line56.toNumber()).toBe(4000);
    // Line 57 = 25% × 4000 = 1000
    expect(result.line57.toNumber()).toBe(1000);
  });

  it("Form 5329 Part IX Line 57 - reduced 10% rate when shortfall corrected within window", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      requiredMinimumDistribution: "10000",
      actualDistributionsForRMD: "6000",
      rmdShortfallCorrectedWithinWindow: true,
    });

    expect(result.line56.toNumber()).toBe(4000);
    // Line 57 = 10% × 4000 = 400
    expect(result.line57.toNumber()).toBe(400);
  });

  it("Form 5329 Part IX Line 56 - no shortfall when actual distributions meet RMD", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      requiredMinimumDistribution: "8000",
      actualDistributionsForRMD: "8000",
    });

    expect(result.line56.toNumber()).toBe(0);
    expect(result.line57.toNumber()).toBe(0);
  });

  it("Form 5329 Part IX Line 56 - no shortfall when actual distributions exceed RMD", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      requiredMinimumDistribution: "5000",
      actualDistributionsForRMD: "12000",
    });

    expect(result.line56.toNumber()).toBe(0);
    expect(result.line57.toNumber()).toBe(0);
  });

  it("Form 5329 Part IX - total miss of RMD results in full penalty", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      requiredMinimumDistribution: "15000",
      actualDistributionsForRMD: "0",
    });

    expect(result.line56.toNumber()).toBe(15000);
    // 25% × 15000 = 3750
    expect(result.line57.toNumber()).toBe(3750);
  });
});

describe("Form 5329 cross-part - totalAdditionalTax edge cases", () => {
  it("Form 5329 totalAdditionalTax - sums penalties across all nine parts", () => {
    const result = calculateForm5329({
      // Part I: $10,000 early distribution, no exceptions → 10% = $1,000
      earlyDistributionsIncludedInIncome: "10000",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
      // Part II: $2,000 education distribution, no exception → 10% = $200
      educationAccountDistributionsIncludedInIncome: "2000",
      educationAccountDistributionsExcepted: "0",
      // Part III: $1,000 traditional IRA excess, $50k value → 6% = $60
      traditionalIRACurrentYearExcessContributions: "1000",
      traditionalIRAValueDec31: "50000",
      // Part IX: $5,000 RMD shortfall → 25% = $1,250
      requiredMinimumDistribution: "8000",
      actualDistributionsForRMD: "3000",
    });

    expect(result.line4.toNumber()).toBe(1000);
    expect(result.line8.toNumber()).toBe(200);
    expect(result.line17.toNumber()).toBe(60);
    expect(result.line57.toNumber()).toBe(1250);
    // Total = 1000 + 200 + 60 + 0 + 0 + 0 + 0 + 0 + 1250 = 2510
    expect(result.totalAdditionalTax.toNumber()).toBe(2510);
  });

  it("Form 5329 totalAdditionalTax - all parts zero yields zero total", () => {
    const result = calculateForm5329({
      earlyDistributionsIncludedInIncome: "0",
      distributionsNotSubjectToAdditionalTax: "0",
      simpleIRADistributionsWithinFirstTwoYears: "0",
    });

    expect(result.totalAdditionalTax.toNumber()).toBe(0);
  });
});
