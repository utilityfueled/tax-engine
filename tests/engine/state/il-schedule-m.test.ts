/**
 * Tests for Illinois Schedule M — Other Additions and Subtractions
 * Spec: spec/state/il-schedule-m.yaml
 *
 * 2025: 529 plan contribution subtraction max $10,000 ($20,000 MFJ),
 * ABLE contribution subtraction max $10,000 ($20,000 MFJ),
 * US government interest subtraction, IL municipal bond interest subtraction.
 * Source: Illinois Department of Revenue, 2025 Schedule M Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateScheduleM,
  IL_SCHEDULE_M_CONSTANTS,
  type ScheduleMInput,
} from "@/engine/state/il-schedule-m.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = d(0);

function makeInput(overrides: Partial<ScheduleMInput> = {}): ScheduleMInput {
  return {
    taxYear: 2025,
    filingStatus: "single",

    // Step 2 — Additions
    childTaxExemptInterest: ZERO,
    distributiveShareAdditions: ZERO,
    lloydsLoss: ZERO,
    nonIL529Earnings: ZERO,
    ilDepreciationAddition: ZERO,
    recapture529OutOfState: ZERO,
    recapture529Nonqualified: ZERO,
    studentAssistanceCreditRecapture: ZERO,
    otherAdditions: ZERO,

    // Step 3 — Subtractions
    il529Contributions: ZERO,
    distributiveShareSubtractions: ZERO,
    restorationClaimOfRight: ZERO,
    jobTrainingContributions: ZERO,
    federalCreditRelatedExpenses: ZERO,
    medicalDebtRelief: ZERO,
    ilDepreciationSubtraction: ZERO,
    ableContributions: ZERO,
    militaryPay: ZERO,
    usGovernmentInterest: ZERO,
    recoveryOfItemsDeducted: ZERO,
    ridesharing: ZERO,
    lifeInsurancePayment: ZERO,
    lloydsIncome: ZERO,
    funeralTrustIncome: ZERO,
    healthCareProviderLoanRepayment: ZERO,
    naziPersecutionReparations: ZERO,
    ilBondInterest: ZERO,
    nonUSGovernmentBondInterest: ZERO,
    childUSGovernmentInterest: ZERO,
    railroadIncome: ZERO,
    unjustImprisonmentCompensation: ZERO,
    plan529DistributionsForCredits: ZERO,
    cannabisDisallowedDeductions: ZERO,
    fertilityFraudAward: ZERO,

    ...overrides,
  };
}

describe("Illinois Schedule M", () => {
  // ==================== Step 2: Additions ====================

  it("Schedule M Line 1 - child tax-exempt interest", () => {
    const result = calculateScheduleM(makeInput({ childTaxExemptInterest: d(500) }));
    expect(result.totalAdditions.toNumber()).toBe(500);
  });

  it("Schedule M Line 2 - distributive share additions", () => {
    const result = calculateScheduleM(makeInput({ distributiveShareAdditions: d(3000) }));
    expect(result.totalAdditions.toNumber()).toBe(3000);
  });

  it("Schedule M Line 4 - non-IL 529 earnings", () => {
    const result = calculateScheduleM(makeInput({ nonIL529Earnings: d(1200) }));
    expect(result.totalAdditions.toNumber()).toBe(1200);
  });

  it("Schedule M Line 5 - depreciation addition", () => {
    const result = calculateScheduleM(makeInput({ ilDepreciationAddition: d(5000) }));
    expect(result.totalAdditions.toNumber()).toBe(5000);
  });

  it("Schedule M Line 7 - 529 out-of-state recapture", () => {
    const result = calculateScheduleM(makeInput({ recapture529OutOfState: d(2000) }));
    expect(result.totalAdditions.toNumber()).toBe(2000);
  });

  it("Schedule M Line 7 - computes out-of-state recapture from remaining deducted basis", () => {
    const result = calculateScheduleM(makeInput({
      recapture529OutOfStateDetail: {
        priorDeductionsClaimed: d(8000),
        priorYearRecaptures: d(1500),
        transferAmount: d(9000),
      },
    }));

    expect(result.totalAdditions.toNumber()).toBe(6500);
  });

  it("Schedule M Line 9 - 529 nonqualified recapture", () => {
    const result = calculateScheduleM(makeInput({ recapture529Nonqualified: d(1500) }));
    expect(result.totalAdditions.toNumber()).toBe(1500);
  });

  it("Schedule M Line 9 - reduces nonqualified recapture by current-year line 7 recapture", () => {
    const result = calculateScheduleM(makeInput({
      recapture529OutOfStateDetail: {
        priorDeductionsClaimed: d(6000),
        priorYearRecaptures: ZERO,
        transferAmount: d(1000),
      },
      recapture529NonqualifiedDetail: {
        priorDeductionsClaimed: d(6000),
        priorYearRecaptures: d(500),
        withdrawalAmount: d(7000),
      },
    }));

    expect(result.totalAdditions.toNumber()).toBe(5500);
  });

  it("Schedule M Line 9 - floors computed recapture at zero when basis already exhausted", () => {
    const result = calculateScheduleM(makeInput({
      recapture529OutOfStateDetail: {
        priorDeductionsClaimed: d(4000),
        priorYearRecaptures: d(3500),
        transferAmount: d(500),
      },
      recapture529NonqualifiedDetail: {
        priorDeductionsClaimed: d(4000),
        priorYearRecaptures: d(3500),
        withdrawalAmount: d(2000),
      },
    }));

    expect(result.totalAdditions.toNumber()).toBe(500);
  });

  it("Schedule M Line 7 - negative recapture input is invalid", () => {
    expect(() => calculateScheduleM(makeInput({
      recapture529OutOfState: d(-1),
    }))).toThrow("Schedule M Line 7 recapture529OutOfState must be non-negative");
  });

  it("Schedule M Line 9 - negative recapture detail inputs are invalid", () => {
    expect(() => calculateScheduleM(makeInput({
      recapture529NonqualifiedDetail: {
        priorDeductionsClaimed: d(5000),
        priorYearRecaptures: d(-1),
        withdrawalAmount: d(1000),
      },
    }))).toThrow("Schedule M Line 9 detail priorYearRecaptures must be non-negative");
  });

  it("Schedule M Line 3 - Lloyd's plan of operation loss", () => {
    const result = calculateScheduleM(makeInput({ lloydsLoss: d(750) }));
    expect(result.totalAdditions.toNumber()).toBe(750);
  });

  it("Schedule M Line 11 - other additions", () => {
    const result = calculateScheduleM(makeInput({ otherAdditions: d(800) }));
    expect(result.totalAdditions.toNumber()).toBe(800);
  });

  it("Schedule M Line 12 - total additions sums all addition lines", () => {
    const result = calculateScheduleM(makeInput({
      childTaxExemptInterest: d(100),
      distributiveShareAdditions: d(200),
      lloydsLoss: d(300),
      nonIL529Earnings: d(400),
      ilDepreciationAddition: d(500),
      recapture529OutOfState: d(600),
      recapture529Nonqualified: d(700),
      studentAssistanceCreditRecapture: d(150),
      otherAdditions: d(800),
    }));
    // 100 + 200 + 300 + 400 + 500 + 600 + 700 + 150 + 800 = 3750
    expect(result.totalAdditions.toNumber()).toBe(3750);
  });

  it("Schedule M - no additions when all zero", () => {
    const result = calculateScheduleM(makeInput());
    expect(result.totalAdditions.toNumber()).toBe(0);
  });

  // ==================== Step 3: Subtractions — 529 Contributions (Line 13) ====================

  it("Schedule M Line 13 - 529 contributions pass through under limit", () => {
    const result = calculateScheduleM(makeInput({ il529Contributions: d(5000) }));
    expect(result.il529Subtraction.toNumber()).toBe(5000);
  });

  it("Schedule M Line 13 - 529 contributions capped at $10,000 single", () => {
    const result = calculateScheduleM(makeInput({ il529Contributions: d(15000) }));
    expect(result.il529Subtraction.toNumber()).toBe(10000);
  });

  it("Schedule M Line 13 - 529 contributions capped at $20,000 MFJ", () => {
    const result = calculateScheduleM(makeInput({
      filingStatus: "married_filing_jointly",
      il529Contributions: d(25000),
    }));
    expect(result.il529Subtraction.toNumber()).toBe(20000);
  });

  it("Schedule M Line 13 - 529 contributions $10,000 HoH (non-MFJ limit)", () => {
    const result = calculateScheduleM(makeInput({
      filingStatus: "head_of_household",
      il529Contributions: d(15000),
    }));
    expect(result.il529Subtraction.toNumber()).toBe(10000);
  });

  it("Schedule M Line 13 - 529 contributions $10,000 MFS", () => {
    const result = calculateScheduleM(makeInput({
      filingStatus: "married_filing_separately",
      il529Contributions: d(12000),
    }));
    expect(result.il529Subtraction.toNumber()).toBe(10000);
  });

  it("Schedule M Line 13 - 529 contributions exactly at $10,000 limit", () => {
    const result = calculateScheduleM(makeInput({ il529Contributions: d(10000) }));
    expect(result.il529Subtraction.toNumber()).toBe(10000);
  });

  it("Schedule M Line 13 - 529 contributions exactly at $20,000 MFJ limit", () => {
    const result = calculateScheduleM(makeInput({
      filingStatus: "married_filing_jointly",
      il529Contributions: d(20000),
    }));
    expect(result.il529Subtraction.toNumber()).toBe(20000);
  });

  // ==================== Step 3: Subtractions — ABLE Contributions (Line 20) ====================

  it("Schedule M Line 20 - ABLE contributions pass through under limit", () => {
    const result = calculateScheduleM(makeInput({ ableContributions: d(3000) }));
    expect(result.ableSubtraction.toNumber()).toBe(3000);
  });

  it("Schedule M Line 20 - ABLE contributions capped at $10,000 single", () => {
    const result = calculateScheduleM(makeInput({ ableContributions: d(15000) }));
    expect(result.ableSubtraction.toNumber()).toBe(10000);
  });

  it("Schedule M Line 20 - ABLE contributions capped at $20,000 MFJ", () => {
    const result = calculateScheduleM(makeInput({
      filingStatus: "married_filing_jointly",
      ableContributions: d(25000),
    }));
    expect(result.ableSubtraction.toNumber()).toBe(20000);
  });

  it("Schedule M tax year 2024 - reuses the 2024 published 529 and ABLE subtraction caps", () => {
    expect(IL_SCHEDULE_M_CONSTANTS[2024]).toBeDefined();

    const result = calculateScheduleM(makeInput({
      taxYear: 2024,
      filingStatus: "married_filing_jointly",
      il529Contributions: d(25000),
      ableContributions: d(25000),
    }));

    expect(result.il529Subtraction.toNumber()).toBe(20000);
    expect(result.ableSubtraction.toNumber()).toBe(20000);
  });

  // ==================== Step 3: Subtractions — Lines 14-31 ====================

  it("Schedule M Line 14 - distributive share subtractions", () => {
    const result = calculateScheduleM(makeInput({ distributiveShareSubtractions: d(4000) }));
    expect(result.totalSubtractions.toNumber()).toBe(4000);
  });

  it("Schedule M Line 18 - medical debt relief", () => {
    const result = calculateScheduleM(makeInput({ medicalDebtRelief: d(8000) }));
    expect(result.totalSubtractions.toNumber()).toBe(8000);
  });

  it("Schedule M tax year 2024 - rejects medical debt relief because 2024 Line 18 is unused", () => {
    expect(() => calculateScheduleM(makeInput({
      taxYear: 2024,
      medicalDebtRelief: d(1),
    }))).toThrow("Schedule M Line 18 medical debt relief is only available for tax year 2025 and later");
  });

  it("Schedule M Line 19 - depreciation subtraction", () => {
    const result = calculateScheduleM(makeInput({ ilDepreciationSubtraction: d(3000) }));
    expect(result.totalSubtractions.toNumber()).toBe(3000);
  });

  it("Schedule M Line 21 - military pay subtraction", () => {
    const result = calculateScheduleM(makeInput({ militaryPay: d(12000) }));
    expect(result.totalSubtractions.toNumber()).toBe(12000);
  });

  it("Schedule M Line 22 - US government interest", () => {
    const result = calculateScheduleM(makeInput({ usGovernmentInterest: d(2500) }));
    expect(result.totalSubtractions.toNumber()).toBe(2500);
  });

  it("Schedule M Line 23 - August 1, 1969 valuation limitation", () => {
    const input = makeInput() as ScheduleMInput & {
      august1969ValuationLimitation: Decimal;
    };
    input.august1969ValuationLimitation = d(3400);

    const result = calculateScheduleM(input);
    expect(result.totalSubtractions.toNumber()).toBe(3400);
  });

  it("Schedule M Line 24 - river edge redevelopment zone and high impact business dividend subtraction", () => {
    const input = makeInput() as ScheduleMInput & {
      riverEdgeRedevelopmentZoneDividendSubtraction: Decimal;
    };
    input.riverEdgeRedevelopmentZoneDividendSubtraction = d(1800);

    const result = calculateScheduleM(input);
    expect(result.totalSubtractions.toNumber()).toBe(1800);
  });

  it("Schedule M Line 15 - restoration claim of right", () => {
    const result = calculateScheduleM(makeInput({ restorationClaimOfRight: d(7500) }));
    expect(result.totalSubtractions.toNumber()).toBe(7500);
  });

  it("Schedule M Line 16 - job training contributions", () => {
    const result = calculateScheduleM(makeInput({ jobTrainingContributions: d(2000) }));
    expect(result.totalSubtractions.toNumber()).toBe(2000);
  });

  it("Schedule M Line 17 - federal credit-related expenses", () => {
    const result = calculateScheduleM(makeInput({ federalCreditRelatedExpenses: d(1500) }));
    expect(result.totalSubtractions.toNumber()).toBe(1500);
  });

  it("Schedule M Line 25 - recovery of items", () => {
    const result = calculateScheduleM(makeInput({ recoveryOfItemsDeducted: d(1200) }));
    expect(result.totalSubtractions.toNumber()).toBe(1200);
  });

  it("Schedule M Line 26 - ridesharing benefits", () => {
    const result = calculateScheduleM(makeInput({ ridesharing: d(600) }));
    expect(result.totalSubtractions.toNumber()).toBe(600);
  });

  it("Schedule M Line 27 - life insurance payment", () => {
    const result = calculateScheduleM(makeInput({ lifeInsurancePayment: d(3200) }));
    expect(result.totalSubtractions.toNumber()).toBe(3200);
  });

  it("Schedule M Line 28 - Lloyd's plan of operation income", () => {
    const result = calculateScheduleM(makeInput({ lloydsIncome: d(4100) }));
    expect(result.totalSubtractions.toNumber()).toBe(4100);
  });

  it("Schedule M Line 29 - funeral trust income", () => {
    const result = calculateScheduleM(makeInput({ funeralTrustIncome: d(900) }));
    expect(result.totalSubtractions.toNumber()).toBe(900);
  });

  it("Schedule M Line 30 - health care provider loan repayment", () => {
    const result = calculateScheduleM(makeInput({ healthCareProviderLoanRepayment: d(15000) }));
    expect(result.totalSubtractions.toNumber()).toBe(15000);
  });

  it("Schedule M Line 31 - Nazi persecution reparations", () => {
    const result = calculateScheduleM(makeInput({ naziPersecutionReparations: d(5000) }));
    expect(result.totalSubtractions.toNumber()).toBe(5000);
  });

  it("Schedule M Line 37 - railroad income subtraction", () => {
    const result = calculateScheduleM(makeInput({ railroadIncome: d(1800) }));
    expect(result.totalSubtractions.toNumber()).toBe(1800);
  });

  it("Schedule M Line 39 - 529 distributions for federal education credits", () => {
    const result = calculateScheduleM(makeInput({ plan529DistributionsForCredits: d(2500) }));
    expect(result.totalSubtractions.toNumber()).toBe(2500);
  });

  it("Schedule M Line 40 - cannabis IRC 280E disallowed deductions", () => {
    const result = calculateScheduleM(makeInput({ cannabisDisallowedDeductions: d(3500) }));
    expect(result.totalSubtractions.toNumber()).toBe(3500);
  });

  it("Schedule M Line 34 - IL bond interest", () => {
    const result = calculateScheduleM(makeInput({ ilBondInterest: d(800) }));
    expect(result.totalSubtractions.toNumber()).toBe(800);
  });

  it("Schedule M Line 35 - non-US government bond interest", () => {
    const result = calculateScheduleM(makeInput({ nonUSGovernmentBondInterest: d(1300) }));
    expect(result.totalSubtractions.toNumber()).toBe(1300);
  });

  it("Schedule M Line 36 - child US government interest", () => {
    const result = calculateScheduleM(makeInput({ childUSGovernmentInterest: d(450) }));
    expect(result.totalSubtractions.toNumber()).toBe(450);
  });

  it("Schedule M Line 38 - unjust imprisonment compensation", () => {
    const result = calculateScheduleM(makeInput({ unjustImprisonmentCompensation: d(25000) }));
    expect(result.totalSubtractions.toNumber()).toBe(25000);
  });

  it("Schedule M Line 41 - fertility fraud award", () => {
    const result = calculateScheduleM(makeInput({ fertilityFraudAward: d(10000) }));
    expect(result.totalSubtractions.toNumber()).toBe(10000);
  });

  // ==================== Subtotal and Total ====================

  it("Schedule M Line 32 - subtraction subtotal (Lines 13-31)", () => {
    const input = makeInput({
      il529Contributions: d(5000),
      distributiveShareSubtractions: d(2000),
      usGovernmentInterest: d(1500),
      militaryPay: d(3000),
    }) as ScheduleMInput & {
      august1969ValuationLimitation: Decimal;
      riverEdgeRedevelopmentZoneDividendSubtraction: Decimal;
    };
    input.august1969ValuationLimitation = d(600);
    input.riverEdgeRedevelopmentZoneDividendSubtraction = d(900);

    const result = calculateScheduleM(input);
    expect(result.subtractionSubtotal.toNumber()).toBe(13000);
  });

  it("Schedule M Line 42 - total subtractions includes page 3 items", () => {
    const input = makeInput({
      il529Contributions: d(5000),
      usGovernmentInterest: d(1500),
      ilBondInterest: d(800),          // Line 34 (page 3)
      railroadIncome: d(200),          // Line 37 (page 3)
      cannabisDisallowedDeductions: d(500), // Line 40 (page 3)
    }) as ScheduleMInput & {
      august1969ValuationLimitation: Decimal;
      riverEdgeRedevelopmentZoneDividendSubtraction: Decimal;
    };
    input.august1969ValuationLimitation = d(700);
    input.riverEdgeRedevelopmentZoneDividendSubtraction = d(800);

    const result = calculateScheduleM(input);
    // Subtotal (Lines 13-31): 5000 + 1500 + 700 + 800 = 8000
    // Page 3 additions: 800 + 200 + 500 = 1500
    // Total: 8000 + 1500 = 9500
    expect(result.subtractionSubtotal.toNumber()).toBe(8000);
    expect(result.totalSubtractions.toNumber()).toBe(9500);
  });

  it("Schedule M tax year 2024 - omits the unused Line 18 from the audit trail and still totals through Line 42", () => {
    const result = calculateScheduleM(makeInput({
      taxYear: 2024,
      il529Contributions: d(5000),
      usGovernmentInterest: d(1500),
      ilBondInterest: d(800),
      railroadIncome: d(200),
      cannabisDisallowedDeductions: d(500),
    }));

    const lineNumbers = result.lines.map((line) => line.line);
    const line42 = result.lines.find((line) => line.line === "42");

    expect(lineNumbers).not.toContain("18");
    expect(lineNumbers).toContain("19");
    expect(lineNumbers).toContain("41");
    expect(line42?.formula).toBe("Line 32 + Lines 34-41 (2024 printed Line 33 is unused)");
    expect(result.subtractionSubtotal.toNumber()).toBe(6500);
    expect(result.totalSubtractions.toNumber()).toBe(8000);
  });

  it("Schedule M Line 42 - negative subtraction inputs are invalid", () => {
    expect(() => calculateScheduleM(makeInput({
      ilBondInterest: d(-25),
    }))).toThrow("Schedule M Line 34 ilBondInterest must be non-negative");
  });

  it("Schedule M - no subtractions when all zero", () => {
    const result = calculateScheduleM(makeInput());
    expect(result.totalSubtractions.toNumber()).toBe(0);
    expect(result.subtractionSubtotal.toNumber()).toBe(0);
  });

  // ==================== Integration ====================

  it("Schedule M - comprehensive test with multiple additions and subtractions", () => {
    const result = calculateScheduleM(makeInput({
      // Additions
      nonIL529Earnings: d(1000),
      otherAdditions: d(500),
      // Subtractions
      il529Contributions: d(8000),
      usGovernmentInterest: d(2000),
      ilBondInterest: d(300),
    }));
    expect(result.totalAdditions.toNumber()).toBe(1500);
    expect(result.il529Subtraction.toNumber()).toBe(8000);
    expect(result.totalSubtractions.toNumber()).toBe(10300);
  });

  it("Schedule M - MFJ with 529 and ABLE both at limits", () => {
    const result = calculateScheduleM(makeInput({
      filingStatus: "married_filing_jointly",
      il529Contributions: d(25000),
      ableContributions: d(18000),
      usGovernmentInterest: d(5000),
    }));
    expect(result.il529Subtraction.toNumber()).toBe(20000);  // capped
    expect(result.ableSubtraction.toNumber()).toBe(18000);    // under $20K limit
    expect(result.totalSubtractions.toNumber()).toBe(43000);  // 20000 + 18000 + 5000
  });

  it("Schedule M - audit trail contains key lines", () => {
    const result = calculateScheduleM(makeInput({
      nonIL529Earnings: d(500),
      il529Contributions: d(5000),
      usGovernmentInterest: d(1000),
    }));
    const lineNumbers = result.lines.map(l => l.line);
    expect(lineNumbers).toContain("12");  // total additions
    expect(lineNumbers).toContain("13");  // 529 subtraction
    expect(lineNumbers).toContain("32");  // subtraction subtotal
    expect(lineNumbers).toContain("42");  // total subtractions
  });

  it("Schedule M Line 12 - negative addition inputs are invalid", () => {
    expect(() => calculateScheduleM(makeInput({
      otherAdditions: d(-10),
    }))).toThrow("Schedule M Line 11 otherAdditions must be non-negative");
  });
});
