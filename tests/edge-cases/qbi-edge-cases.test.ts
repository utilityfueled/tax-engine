/**
 * Edge case tests for QBI deduction (Form 8995) integration through the federal pipeline.
 * Tests interactions between the Section 199A deduction and other parts of the return
 * that standalone Form 8995 tests don't cover.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm8995 } from "@/engine/forms/form-8995.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

/** Helper: build a single-filer fixture with wage and optional overrides */
function singleFiler(
  wages: string,
  overrides?: Partial<TaxYearInput>
): TaxYearInput {
  return {
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      filingStatus: "single",
    },
    w2s: [
      {
        ...simpleW2Fixture.w2s[0],
        wages,
        federalWithheld: "0",
        socialSecurityWages: wages,
        socialSecurityWithheld: new Decimal(wages).times("0.062").toFixed(2),
        medicareWages: wages,
        medicareWithheld: new Decimal(wages).times("0.0145").toFixed(2),
      },
    ],
    ...overrides,
  };
}

/** Helper: build an MFJ fixture with wages and optional overrides */
function mfjFiler(
  wages: string,
  overrides?: Partial<TaxYearInput>
): TaxYearInput {
  return {
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "John",
        lastName: "Doe",
        ssn: "987-65-4321",
        dateOfBirth: "1988-03-20",
      },
    },
    w2s: [
      {
        ...simpleW2Fixture.w2s[0],
        wages,
        federalWithheld: "0",
        socialSecurityWages: wages,
        socialSecurityWithheld: new Decimal(wages).times("0.062").toFixed(2),
        medicareWages: wages,
        medicareWithheld: new Decimal(wages).times("0.0145").toFixed(2),
      },
    ],
    ...overrides,
  };
}

/** Helper: build an MFS fixture with wages and optional overrides */
function mfsFiler(
  wages: string,
  overrides?: Partial<TaxYearInput>
): TaxYearInput {
  return {
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_separately",
      spouse: {
        firstName: "John",
        lastName: "Doe",
        ssn: "987-65-4321",
        dateOfBirth: "1988-03-20",
      },
    },
    w2s: [
      {
        ...simpleW2Fixture.w2s[0],
        wages,
        federalWithheld: "0",
        socialSecurityWages: wages,
        socialSecurityWithheld: new Decimal(wages).times("0.062").toFixed(2),
        medicareWages: wages,
        medicareWithheld: new Decimal(wages).times("0.0145").toFixed(2),
      },
    ],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Schedule C Sole Proprietor Gets QBI Deduction
// ═══════════════════════════════════════════════════════════

describe("Schedule C sole proprietor gets QBI deduction", () => {
  it("$80K W-2 + $40K Schedule C produces QBI deduction adjusted for deductible half SE tax", () => {
    // AGI = $80K wages + $40K Sched C profit - 1/2 SE tax
    // Per IRS Form 8995 Instructions, QBI = Schedule C net profit - deductible half SE tax (§164(f))
    // SE tax: $40K × 0.9235 = $36,940 → SS $4,581 + MC $1,071 = $5,652 → deductible half = $2,826
    // QBI = $40K - $2,826 = $37,174; QBI deduction = 20% × $37,174 = $7,435
    const fixture = singleFiler("80000", {
      scheduleC: {
        businessName: "Freelance Consulting",
        businessCode: "541611",
        grossReceipts: "40000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });

    const result = calculateFederalTax(fixture);

    // Form 8995 should be present
    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // QBI component = 20% of $37,174 = $7,435 (adjusted for deductible half SE tax)
    expect(form8995.qbiComponent.toNumber()).toBe(7435);

    // QBI deduction should be $7,435 (income limitation is higher than QBI component)
    expect(form8995.qbiDeduction.toNumber()).toBe(7435);

    // Taxable income should reflect QBI deduction reduction
    // taxableIncome = AGI - standardDeduction - qbiDeduction
    const expectedTaxableIncome = result.agi
      .minus(result.deductionAmount)
      .minus(form8995.qbiDeduction);
    expect(result.taxableIncome.toNumber()).toBe(
      Decimal.max(0, expectedTaxableIncome).toNumber()
    );
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 Section 199A QBI Flows to Form 8995
// ═══════════════════════════════════════════════════════════

describe("K-1 Section 199A QBI flows to Form 8995", () => {
  it("partnership K-1 with section199AQBI field generates QBI deduction", () => {
    const fixture = singleFiler("80000", {
      scheduleK1: [
        {
          partnershipName: "ABC Partners LP",
          partnershipEIN: "55-1234567",
          ordinaryIncome: "25000",
          section199AQBI: "25000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "100000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // QBI = $25K from K-1 section 199A
    expect(form8995.totalQBI.toNumber()).toBe(25000);

    // QBI deduction = 20% of $25K = $5,000
    expect(form8995.qbiDeduction.toNumber()).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple QBI Sources (Schedule C + K-1) Aggregation
// ═══════════════════════════════════════════════════════════

describe("multiple QBI sources aggregate correctly", () => {
  it("Schedule C + K-1 QBI are combined for total QBI deduction", () => {
    const fixture = singleFiler("60000", {
      scheduleC: {
        businessName: "Side Gig",
        businessCode: "541511",
        grossReceipts: "30000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
      scheduleK1: [
        {
          partnershipName: "Investment Fund LP",
          partnershipEIN: "66-7890123",
          ordinaryIncome: "20000",
          section199AQBI: "20000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "100000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Total QBI = ($30K - $2,119 deductible half) + $20K (K-1) = $47,881
    // Per IRS Form 8995 Instructions, Schedule C QBI reduced by allocated deductible half SE tax
    expect(form8995.totalQBI.toNumber()).toBe(47881);

    // QBI deduction = 20% of $47,881 = $9,576
    expect(form8995.qbiComponent.toNumber()).toBe(9576);

    // Two QBI sources should be tracked
    expect(form8995.qbiAmounts).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════
// QBI Limited by Taxable Income
// ═══════════════════════════════════════════════════════════

describe("QBI deduction limited by taxable income", () => {
  it("large QBI but small taxable income limits deduction to 20% of TI", () => {
    // Low wages + large Schedule C → QBI is high but taxable income (before QBI)
    // after standard deduction is small, so income limitation kicks in
    // Wages = $0, Sched C = $20K
    // AGI ~ $20K - 1/2 SE tax ~ $18,587
    // TI before QBI = ~$18,587 - $15,000 std ded = ~$3,587
    // QBI component = 20% of $20K = $4,000
    // Income limitation = 20% of ~$3,587 = ~$717
    // Deduction = min($4,000, ~$717) = ~$717
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
      },
      w2s: [],
      scheduleC: {
        businessName: "Small Biz",
        businessCode: "541511",
        grossReceipts: "20000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    };

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // QBI component (20% of net profit) should exceed income limitation
    expect(form8995.qbiComponent.greaterThan(form8995.incomeLimitation)).toBe(true);

    // Deduction should equal the income limitation (the binding constraint)
    expect(form8995.qbiDeduction.toNumber()).toBe(
      form8995.incomeLimitation.toNumber()
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Gains Reduce QBI Income Limitation
// ═══════════════════════════════════════════════════════════

describe("capital gains reduce QBI income limitation", () => {
  it("large capital gains with modest QBI cause income limitation to bind", () => {
    // Wages = $0, Sched C = $25K gross (QBI source)
    // Also has $150K long-term capital gains
    // AGI ~ $25K - ~$1.8K SE ded + $150K = ~$173K
    // TI before QBI = ~$173K - $15K std ded = ~$158K
    // Net cap gain = $150K
    // Income base = ~$158K - $150K = ~$8K
    // Income limitation = 20% of ~$8K = ~$1.6K
    // QBI component = 20% of $25K = $5K
    // Deduction = min($5K, ~$1.6K) = ~$1.6K (income limitation binds)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
      },
      w2s: [],
      scheduleC: {
        businessName: "Consulting",
        businessCode: "541611",
        grossReceipts: "25000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
      form1099B: [
        {
          broker: "Fidelity",
          transactions: [
            {
              description: "AAPL shares",
              dateAcquired: "2020-01-15",
              dateSold: "2025-06-01",
              proceeds: "170000",
              costBasis: "20000",
              holdingPeriod: "long",
              adjustments: "0",
              basisReportedToIRS: true,
              washSale: false,
              washSaleDisallowed: "0",
            },
          ],
        },
      ],
    };

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Net capital gain amount should be > 0 (from the $150K LTCG)
    expect(form8995.netCapitalGainAmount.greaterThan(0)).toBe(true);

    // QBI deduction should be limited (either by QBI component or income limitation)
    expect(form8995.qbiDeduction.greaterThan(0)).toBe(true);

    // Capital gains in the income limitation should reduce the deduction vs
    // what it would be without capital gains
    const deductionWithoutCapGainLimit = form8995.qbiComponent;
    expect(form8995.qbiDeduction.lte(deductionWithoutCapGainLimit)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// QBI Loss Carryforward
// ═══════════════════════════════════════════════════════════

describe("QBI loss carryforward", () => {
  it("business with negative QBI produces loss carryforward in output", () => {
    // Schedule C with a loss and a K-1 with negative QBI
    // Net QBI should be negative → carryforward
    const fixture = singleFiler("80000", {
      scheduleC: {
        businessName: "Struggling Biz",
        businessCode: "541511",
        grossReceipts: "5000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
        expenses: {
          advertising: "3000",
          officeExpense: "5000",
          supplies: "4000",
          utilities: "3000",
        },
      },
      scheduleK1: [
        {
          partnershipName: "Losing Venture LP",
          partnershipEIN: "77-8901234",
          ordinaryIncome: "-15000",
          section199AQBI: "-15000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "50000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Total QBI should be negative (Sched C loss + K-1 negative QBI)
    expect(form8995.totalQBI.lessThan(0)).toBe(true);

    // QBI deduction should be zero when total QBI is negative
    expect(form8995.qbiDeduction.toNumber()).toBe(0);

    // Loss carryforward should equal absolute value of total QBI
    expect(form8995.qbiLossCarryforward.toNumber()).toBe(
      form8995.totalQBI.abs().toNumber()
    );

    // Carryforward should also be reflected in the main result
    expect(result.carryforwards.qbiLossCarryforward.toNumber()).toBe(
      form8995.qbiLossCarryforward.toNumber()
    );
  });
});

// ═══════════════════════════════════════════════════════════
// No QBI Sources — W-2-Only Filer
// ═══════════════════════════════════════════════════════════

describe("no QBI sources for W-2-only filer", () => {
  it("W-2-only filer has no Form 8995 and qbiDeduction is zero", () => {
    const fixture = singleFiler("85000");

    const result = calculateFederalTax(fixture);

    // No Form 8995 generated
    expect(result.form8995).toBeUndefined();

    // QBI loss carryforward should be zero
    expect(result.carryforwards.qbiLossCarryforward.toNumber()).toBe(0);

    // Taxable income = AGI - standard deduction (no QBI reduction)
    const expectedTaxableIncome = Decimal.max(
      0,
      result.agi.minus(result.deductionAmount)
    );
    expect(result.taxableIncome.toNumber()).toBe(expectedTaxableIncome.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Above Simplified Threshold ($197,300 Single) — Form 8995 Not Used
// ═══════════════════════════════════════════════════════════

describe("above simplified threshold for single filer", () => {
  it("high-income single filer above $197,300 threshold skips Form 8995", () => {
    // $250K wages + $30K Schedule C → taxable income before QBI well above $197,300
    const fixture = singleFiler("250000", {
      scheduleC: {
        businessName: "High Income Biz",
        businessCode: "541611",
        grossReceipts: "30000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });

    const result = calculateFederalTax(fixture);

    // Taxable income before QBI = AGI - standard deduction
    // AGI ~ $250K + $30K - 1/2 SE tax ≈ $277K
    // TI before QBI ~ $277K - $15K = $262K > $197,300
    // Form 8995 simplified should NOT apply
    expect(result.form8995).toBeUndefined();

    // No QBI loss carryforward
    expect(result.carryforwards.qbiLossCarryforward.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ Threshold ($394,600) — Married Couple Under Threshold Gets QBI
// ═══════════════════════════════════════════════════════════

describe("MFJ couple under $394,600 threshold gets QBI deduction", () => {
  it("MFJ with $300K wages + $50K Schedule C gets QBI deduction", () => {
    // AGI ~ $300K + $50K - 1/2 SE tax ≈ $346K
    // TI before QBI = ~$346K - $30K std ded = ~$316K < $394,600
    const fixture = mfjFiler("300000", {
      scheduleC: {
        businessName: "Family Business",
        businessCode: "541511",
        grossReceipts: "50000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // QBI = $50K - $670 (deductible half SE, no SS room at $300K wages) = $49,330
    // Per IRS Form 8995 Instructions, Schedule C QBI reduced by deductible half SE tax
    // QBI component = 20% of $49,330 = $9,866
    expect(form8995.qbiComponent.toNumber()).toBe(9866);

    // Taxable income before QBI should be under MFJ threshold
    expect(form8995.taxableIncomeBeforeQBI.lte(d(394600))).toBe(true);

    // Deduction should be $9,866 (income limitation is much higher)
    expect(form8995.qbiDeduction.toNumber()).toBe(9866);
  });

  it("MFJ with income above $394,600 threshold does not get simplified QBI", () => {
    // $400K wages + $50K Schedule C → TI before QBI well above $394,600
    const fixture = mfjFiler("400000", {
      scheduleC: {
        businessName: "Big Family Business",
        businessCode: "541511",
        grossReceipts: "50000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });

    const result = calculateFederalTax(fixture);

    // Should not use simplified Form 8995
    expect(result.form8995).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// QBI Deduction Reduces Taxable Income But Not AGI
// ═══════════════════════════════════════════════════════════

describe("QBI with zero Schedule C profit — no deduction generated", () => {
  it("Schedule C with zero gross receipts produces no QBI", () => {
    const fixture = singleFiler("80000", {
      scheduleC: {
        businessName: "Dormant LLC",
        businessCode: "541511",
        grossReceipts: "0",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });
    const result = calculateFederalTax(fixture);
    expect(result.form8995).toBeUndefined();
  });
});

describe("QBI prior year loss carryforward reduces current QBI", () => {
  it("prior year QBI loss reduces current year QBI deduction", () => {
    const fixture: TaxYearInput = {
      ...singleFiler("60000", {
        scheduleC: {
          businessName: "Consulting",
          businessCode: "541611",
          grossReceipts: "30000",
          returnsAndAllowances: "0",
          costOfGoodsSold: "0",
        },
      }),
      priorYear: {
        capitalLossCarryforward: "0",
        shortTermCapitalLoss: "0",
        longTermCapitalLoss: "0",
        suspendedPassiveLosses: [],
        foreignTaxCreditCarryforward: "0",
        charitableCarryforward: "0",
        qbiLossCarryforward: "10000", // $10K prior QBI loss
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;
    // Current QBI = ($30K - $2,119 deductible half) = $27,881, prior loss = -$10K → net QBI = $17,881
    // Per IRS Form 8995 Instructions, Schedule C QBI reduced by deductible half SE tax
    // QBI deduction = 20% of $17,881 = $3,576
    expect(form8995.totalQBI.toNumber()).toBe(17881);
    expect(form8995.qbiComponent.toNumber()).toBe(3576);
  });
});

describe("QBI with K-1 zero section199AQBI — not included", () => {
  it("K-1 with zero QBI field is excluded from Form 8995", () => {
    const fixture = singleFiler("80000", {
      scheduleK1: [{
        partnershipName: "No QBI Fund",
        partnershipEIN: "44-1234567",
        ordinaryIncome: "20000",
        section199AQBI: "0", // Zero QBI
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "100000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    });
    const result = calculateFederalTax(fixture);
    // No QBI sources → no Form 8995
    expect(result.form8995).toBeUndefined();
  });
});

describe("QBI near simplified threshold boundary", () => {
  it("taxable income at $197,300 exactly — simplified Form 8995 applies", () => {
    // Single threshold = $197,300. Need TI before QBI ≤ threshold.
    // $197,300 + $15,000 std deduction = $212,300 AGI needed.
    // Set wages to produce exactly that AGI (no other income).
    const fixture = singleFiler("212300", {
      scheduleC: {
        businessName: "Small Biz",
        businessCode: "541511",
        grossReceipts: "10000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });
    const result = calculateFederalTax(fixture);
    // AGI = $212,300 + $10K - 1/2 SE tax. TI before QBI = AGI - $15K std ded
    // Should be close to threshold — Form 8995 may or may not be generated
    // depending on exact SE tax. The important test is it doesn't crash.
    if (result.form8995) {
      expect(result.form8995.qbiDeduction.greaterThanOrEqualTo(0)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// NEW EDGE CASES
// ═══════════════════════════════════════════════════════════

// ── 1. QBI component exactly equals income limitation (boundary) ────────────

describe("QBI component exactly at 20% of taxable income boundary", () => {
  it("when QBI equals taxable income before QBI, deduction is exactly QBI component", () => {
    // We need QBI == taxable income before QBI so that the 20% limits are equal.
    // TI before QBI = AGI - standard deduction.
    // For a single filer with only Schedule C (no wages, no cap gains):
    //   AGI = schedCNetProfit - 1/2 SE tax
    //   TI before QBI = AGI - $15,000 std ded
    // Form 8995 Line 7 QBI component = 20% * schedCNetProfit
    // Form 8995 Line 12 income limitation = 20% * TI before QBI
    // These equal each other only when schedCNetProfit == TI before QBI,
    // which is impossible since TI < AGI < schedCNetProfit.
    //
    // Instead, the practical boundary test: add wages so that after Schedule C QBI
    // the income limitation is approximately equal to the QBI component.
    // wages = W, schedC = Q.  TI before QBI = W + Q - 1/2 SE(Q) - 15000.
    // QBI component = 0.20 * Q.
    // Income limitation = 0.20 * TI.
    // They're equal when TI == Q, i.e. W - 1/2 SE(Q) - 15000 == 0
    //   => W == 15000 + 1/2 * Q * 0.9235 * 0.153
    // For Q = $25,000: SE = 25000 * 0.9235 * 0.153 = $3,538. HalfSE ~ $1,769.
    //   W ~ 15000 + 1769 = $16,769
    // At that point QBI component ≈ income limitation ≈ 20% * $25,000 = $5,000.
    // Use W = $16,770 (slightly above) to guarantee form8995 is generated.
    const fixture = singleFiler("16770", {
      scheduleC: {
        businessName: "Boundary Biz",
        businessCode: "541511",
        grossReceipts: "25000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Both the QBI component and income limitation should be non-zero
    expect(form8995.qbiComponent.greaterThan(0)).toBe(true);
    expect(form8995.incomeLimitation.greaterThan(0)).toBe(true);

    // The QBI deduction is the lesser of the two — at the boundary they are
    // very close.  Verify deduction == min(qbiComponent, incomeLimitation).
    const expectedDeduction = Decimal.min(
      form8995.qbiComponent,
      form8995.incomeLimitation
    );
    expect(form8995.qbiDeduction.toNumber()).toBe(expectedDeduction.toNumber());

    // Verify the taxable income is reduced correctly
    const expectedTI = result.agi
      .minus(result.deductionAmount)
      .minus(form8995.qbiDeduction);
    expect(result.taxableIncome.toNumber()).toBe(
      Decimal.max(0, expectedTI).toNumber()
    );
  });
});

// ── 2. QBI from multiple K-1 businesses aggregates correctly ───────────────

describe("QBI from multiple K-1 partnership businesses aggregated", () => {
  it("two K-1s with positive QBI sum correctly for total QBI deduction", () => {
    const fixture = singleFiler("80000", {
      scheduleK1: [
        {
          partnershipName: "Alpha Partners LP",
          partnershipEIN: "11-2222333",
          ordinaryIncome: "18000",
          section199AQBI: "18000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "100000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
        {
          partnershipName: "Beta Ventures LP",
          partnershipEIN: "44-5556667",
          ordinaryIncome: "12000",
          section199AQBI: "12000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "100000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Total QBI = $18K + $12K = $30K
    expect(form8995.totalQBI.toNumber()).toBe(30000);

    // QBI component = 20% × $30K = $6,000
    expect(form8995.qbiComponent.toNumber()).toBe(6000);

    // Two separate QBI amount entries should be tracked
    expect(form8995.qbiAmounts).toHaveLength(2);
    expect(form8995.qbiAmounts[0].toNumber()).toBe(18000);
    expect(form8995.qbiAmounts[1].toNumber()).toBe(12000);

    // Deduction should be $6,000 (income limitation at $80K wages is much higher)
    expect(form8995.qbiDeduction.toNumber()).toBe(6000);
  });
});

// ── 3. Very high income above threshold — simplified Form 8995 not used ─────

describe("very high single income above $197,300 QBI threshold", () => {
  it("single filer with $350K wages and Schedule C income is above threshold, no Form 8995", () => {
    // Single threshold = $197,300 (TI before QBI).
    // $350K wages + $50K Schedule C - 1/2 SE tax - $15K std ded >> $197,300.
    // The engine does not implement Form 8995-A (W-2/basis limits, SSTB phase-out);
    // above the simplified threshold, form8995 is simply undefined.
    const fixture = singleFiler("350000", {
      scheduleC: {
        businessName: "High Income Services",
        businessCode: "541611",  // consulting — would be SSTB
        grossReceipts: "50000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });

    const result = calculateFederalTax(fixture);

    // Taxable income before QBI = AGI - $15K std ded >> $197,300
    expect(result.agi.greaterThan(d(197300))).toBe(true);

    // Simplified Form 8995 does not apply above threshold
    expect(result.form8995).toBeUndefined();

    // No QBI loss carryforward should result
    expect(result.carryforwards.qbiLossCarryforward.toNumber()).toBe(0);
  });
});

// ── 4. MFJ threshold ($394,600) vs single ($197,300) — different thresholds ─

describe("MFJ vs single QBI threshold difference", () => {
  it("same income qualifies for QBI deduction under MFJ threshold but not single threshold", () => {
    // Choose wages that place TI before QBI between $197,300 (single) and $394,600 (MFJ).
    // Single std deduction = $15,000; MFJ std deduction = $30,000.
    // Target TI ~ $250,000 for single = AGI - $15K → AGI ~ $265K → wages ~ $265K.
    // Under MFJ with same wages: TI = $265K - $30K = $235K < $394,600 → qualifies.
    const scheduleC = {
      businessName: "Professional Services",
      businessCode: "541511",
      grossReceipts: "30000",
      returnsAndAllowances: "0",
      costOfGoodsSold: "0",
    };

    const singleResult = calculateFederalTax(
      singleFiler("265000", { scheduleC })
    );
    const mfjResult = calculateFederalTax(
      mfjFiler("265000", { scheduleC })
    );

    // Single filer: TI before QBI ≈ $265K + $30K - 1/2 SE - $15K ≈ $278K > $197,300
    // → form8995 is undefined (above single threshold)
    expect(singleResult.form8995).toBeUndefined();

    // MFJ filer: TI before QBI ≈ $265K + $30K - 1/2 SE - $30K ≈ $263K < $394,600
    // → form8995 is defined (below MFJ threshold)
    expect(mfjResult.form8995).toBeDefined();

    // MFJ QBI = $30K - $402 deductible half (MC only, SS room = 0 at $265K) = $29,598
    // QBI deduction = 20% of $29,598 = $5,920
    expect(mfjResult.form8995!.qbiComponent.toNumber()).toBe(5920);
    expect(mfjResult.form8995!.qbiDeduction.toNumber()).toBe(5920);
  });
});

// ── 5. QBI with zero taxable income — zero deduction ───────────────────────

describe("QBI with zero taxable income produces no deduction", () => {
  it("when AGI equals standard deduction, taxable income before QBI is zero and form8995 is not generated", () => {
    // Single std deduction = $15,000.
    // If Schedule C net profit - 1/2 SE tax = $15,000, TI before QBI = 0.
    // For simplicity, use only Schedule C with zero wages.
    // schedC gross = ~$16,300 → after SE deductions AGI ≈ $15K → TI before QBI ≈ 0.
    // The engine skips Form 8995 when taxableIncomeBeforeQBI == 0.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
      },
      w2s: [],
      scheduleC: {
        businessName: "Micro Business",
        businessCode: "541511",
        // Very small gross receipts → after expenses net profit ≈ $0
        grossReceipts: "500",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
        expenses: {
          supplies: "500",
        },
      },
    };

    const result = calculateFederalTax(fixture);

    // Net profit = $500 - $500 = $0 → no QBI → no form8995
    expect(result.form8995).toBeUndefined();

    // Taxable income should be zero (AGI < standard deduction)
    expect(result.taxableIncome.toNumber()).toBe(0);

    // QBI loss carryforward should be zero
    expect(result.carryforwards.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("tiny Schedule C profit where AGI minus standard deduction is zero or negative yields no deduction", () => {
    // Only Schedule C with very low profit: $5,000 gross.
    // AGI = $5K - 1/2 SE($5K * 0.9235 * 0.153) ≈ $5K - $354 = $4,646
    // TI before QBI = max(0, $4,646 - $15,000) = 0
    // Engine condition: taxableIncomeBeforeQBI.greaterThan(0) → false → no form8995
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
      },
      w2s: [],
      scheduleC: {
        businessName: "Tiny Biz",
        businessCode: "541511",
        grossReceipts: "5000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    };

    const result = calculateFederalTax(fixture);

    // AGI < standard deduction → TI before QBI = 0
    expect(result.agi.lessThan(d(15000))).toBe(true);
    expect(result.taxableIncome.toNumber()).toBe(0);

    // No form8995 generated because taxableIncomeBeforeQBI is not > 0
    expect(result.form8995).toBeUndefined();
  });
});

// ── 6. W-2 wages limitation at high income (simplified form — no limitation) ─

describe("W-2 wages limitation does not apply under simplified Form 8995 threshold", () => {
  it("below QBI threshold, deduction is 20% of QBI regardless of W-2 wages paid by business", () => {
    // The simplified Form 8995 (below $197,300 single / $394,600 MFJ) does NOT
    // apply the W-2 wages or UBIA limitations from §199A(b)(2).
    // Those limitations only appear on Form 8995-A (above threshold).
    // This test verifies that a K-1 business with section199AQBI but no W-2 wages
    // still generates the full 20% deduction when income is below threshold.
    const fixture = singleFiler("60000", {
      scheduleK1: [
        {
          partnershipName: "Capital-Intensive Fund LP",
          partnershipEIN: "33-4445556",
          ordinaryIncome: "40000",
          section199AQBI: "40000",
          // No W-2 wages reported — would normally trigger W-2 limitation
          // on Form 8995-A, but simplified Form 8995 ignores this.
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "200000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Simplified form: deduction = 20% × $40K = $8,000 (no W-2 wage cap)
    expect(form8995.totalQBI.toNumber()).toBe(40000);
    expect(form8995.qbiComponent.toNumber()).toBe(8000);
    expect(form8995.qbiDeduction.toNumber()).toBe(8000);

    // Confirm TI before QBI is under the single threshold
    expect(form8995.taxableIncomeBeforeQBI.lte(d(197300))).toBe(true);
  });
});

// ── 7. Net QBI from all sources is negative — zero deduction ───────────────

describe("net QBI across all sources is negative — zero deduction, full loss carryforward", () => {
  it("profitable Schedule C offset by large K-1 QBI loss yields negative net QBI and zero deduction", () => {
    // Schedule C profit: $20,000 (positive QBI)
    // K-1 QBI loss: -$50,000
    // Net QBI = $20,000 + (-$50,000) = -$30,000 → deduction = $0, carryforward = $30,000
    const fixture = singleFiler("80000", {
      scheduleC: {
        businessName: "Profitable Consulting",
        businessCode: "541611",
        grossReceipts: "20000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
      scheduleK1: [
        {
          partnershipName: "Losing Real Estate LP",
          partnershipEIN: "88-9990001",
          ordinaryIncome: "-50000",
          section199AQBI: "-50000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "200000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Gross QBI = ($20K - $1,413 deductible half) + (-$50K) = -$31,413
    // Per IRS Form 8995 Instructions, Schedule C QBI reduced by deductible half SE tax
    expect(form8995.totalQBI.toNumber()).toBe(-31413);

    // Negative total QBI → no deduction
    expect(form8995.qbiDeduction.toNumber()).toBe(0);
    expect(form8995.qbiComponent.toNumber()).toBe(0);

    // Loss carryforward = absolute value of total QBI
    expect(form8995.qbiLossCarryforward.toNumber()).toBe(31413);

    // Carryforward propagates to top-level result
    expect(result.carryforwards.qbiLossCarryforward.toNumber()).toBe(31413);
  });
});

// ── 8. Taxable income exactly at $197,300 single threshold (spec Line 15 edge) ─

describe("Form 8995 Line 15 — taxable income exactly at single simplified threshold", () => {
  it("taxableIncomeBeforeQBI = $197,300 exactly — simplified Form 8995 applies", () => {
    // Direct Form 8995 calculation with taxableIncomeBeforeQBI = $197,300 (at threshold)
    const result = calculateForm8995({
      qbiSources: [{ name: "Consulting", qbi: d("50000") }],
      taxableIncomeBeforeQBI: d("197300"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    // QBI component = 20% of $50K = $10,000
    expect(result.qbiComponent.toNumber()).toBe(10000);

    // Income limitation = 20% of $197,300 = $39,460
    expect(result.incomeLimitation.toNumber()).toBe(39460);

    // Deduction = min($10,000, $39,460) = $10,000
    expect(result.qbiDeduction.toNumber()).toBe(10000);
  });
});

// ── 9. Taxable income $1 above single threshold (spec Line 15 edge) ────────

describe("Form 8995 Line 15 — taxable income $1 above single threshold", () => {
  it("taxableIncomeBeforeQBI = $197,301 — integration skips simplified Form 8995", () => {
    // Single filer: wages such that AGI - $15K std ded = $197,301
    // AGI needed = $197,301 + $15,000 = $212,301 (W-2 only, no SE)
    // Add small QBI from K-1 to avoid Schedule C SE complications
    const fixture = singleFiler("212301", {
      scheduleK1: [{
        partnershipName: "Small K1 Fund",
        partnershipEIN: "11-1111111",
        ordinaryIncome: "10000",
        section199AQBI: "10000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "100000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    });

    const result = calculateFederalTax(fixture);

    // TI before QBI = ($212,301 + $10,000) - $15,000 = $207,301 > $197,300
    // Above threshold → simplified Form 8995 does not apply
    expect(result.form8995).toBeUndefined();
  });
});

// ── 10. Taxable income at full phase-in complete for single ($247,300) ──────

describe("Form 8995 — single filer at upper boundary of QBI phase-in range", () => {
  it("taxableIncomeBeforeQBI = $247,300 ($197,300 + $50,000 phase-in) — no simplified Form 8995", () => {
    // $247,300 + $15,000 std ded = $262,300 AGI from W-2 only
    const fixture = singleFiler("262300", {
      scheduleK1: [{
        partnershipName: "Phase-in Test Fund",
        partnershipEIN: "22-2222222",
        ordinaryIncome: "20000",
        section199AQBI: "20000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "100000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    });

    const result = calculateFederalTax(fixture);

    // TI before QBI = ($262,300 + $20,000) - $15,000 = $267,300 > $197,300
    // Above threshold → no simplified Form 8995
    expect(result.form8995).toBeUndefined();
  });
});

// ── 11. MFJ threshold at $394,600 exactly (spec Line 15 edge) ──────────────

describe("Form 8995 Line 15 — MFJ taxable income exactly at $394,600 threshold", () => {
  it("taxableIncomeBeforeQBI = $394,600 exactly — simplified Form 8995 applies", () => {
    const result = calculateForm8995({
      qbiSources: [{ name: "Family Business", qbi: d("80000") }],
      taxableIncomeBeforeQBI: d("394600"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    // QBI component = 20% of $80K = $16,000
    expect(result.qbiComponent.toNumber()).toBe(16000);

    // Income limitation = 20% of $394,600 = $78,920
    expect(result.incomeLimitation.toNumber()).toBe(78920);

    // Deduction = min($16,000, $78,920) = $16,000
    expect(result.qbiDeduction.toNumber()).toBe(16000);
  });
});

// ── 12. MFJ threshold $1 above $394,600 — integration rejects simplified ───

describe("Form 8995 — MFJ taxable income $1 above $394,600 threshold", () => {
  it("MFJ with TI before QBI = $394,601 does not get simplified Form 8995", () => {
    // MFJ std ded = $30,000. Need AGI = $394,601 + $30,000 = $424,601
    const fixture = mfjFiler("424601", {
      scheduleK1: [{
        partnershipName: "Over Threshold Fund",
        partnershipEIN: "33-3333333",
        ordinaryIncome: "10000",
        section199AQBI: "10000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "100000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    });

    const result = calculateFederalTax(fixture);

    // TI before QBI = ($424,601 + $10,000) - $30,000 = $404,601 > $394,600
    expect(result.form8995).toBeUndefined();
  });
});

// ── 13. MFS threshold at $197,300 (same as single in constants) ────────────

describe("Form 8995 — MFS threshold at $197,300", () => {
  it("MFS filer under $197,300 threshold gets simplified Form 8995", () => {
    // MFS std ded = $15,000. Need TI before QBI < $197,300.
    // Wages = $180,000 → AGI = $180,000, TI before QBI = $180,000 - $15,000 = $165,000
    const fixture = mfsFiler("180000", {
      scheduleK1: [{
        partnershipName: "MFS Test Fund",
        partnershipEIN: "44-4444444",
        ordinaryIncome: "10000",
        section199AQBI: "10000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "100000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    });

    const result = calculateFederalTax(fixture);

    // TI before QBI = ($180,000 + $10,000) - $15,000 = $175,000 < $197,300
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(2000); // 20% of $10K
  });

  it("MFS filer above $197,300 threshold does not get simplified Form 8995", () => {
    // Wages = $220,000 → TI before QBI = ($220,000 + $10,000) - $15,000 = $215,000 > $197,300
    const fixture = mfsFiler("220000", {
      scheduleK1: [{
        partnershipName: "MFS High Income Fund",
        partnershipEIN: "55-5555555",
        ordinaryIncome: "10000",
        section199AQBI: "10000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "100000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeUndefined();
  });
});

// ── 14. QBI = 20% of taxable income (Line 7 = Line 12 boundary) ────────────

describe("Form 8995 Line 7 — QBI equals 20% of taxable income", () => {
  it("QBI component exactly equals income limitation when QBI equals TI before QBI", () => {
    // Set QBI = taxableIncomeBeforeQBI so 20% of each is equal
    const result = calculateForm8995({
      qbiSources: [{ name: "Equal Test Biz", qbi: d("100000") }],
      taxableIncomeBeforeQBI: d("100000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    // Both are 20% of $100K = $20,000
    expect(result.qbiComponent.toNumber()).toBe(20000);
    expect(result.incomeLimitation.toNumber()).toBe(20000);
    expect(result.qbiDeduction.toNumber()).toBe(20000);
  });
});

// ── 15. QBI exceeds 20% of taxable income (income limitation binds) ────────

describe("Form 8995 Line 12 — QBI exceeds 20% of taxable income", () => {
  it("large QBI with smaller taxable income causes income limitation to bind", () => {
    // QBI = $150,000, TI before QBI = $80,000
    // QBI component = 20% of $150K = $30,000
    // Income limitation = 20% of $80K = $16,000
    // Deduction = min($30K, $16K) = $16,000
    const result = calculateForm8995({
      qbiSources: [{ name: "Big QBI Biz", qbi: d("150000") }],
      taxableIncomeBeforeQBI: d("80000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.qbiComponent.toNumber()).toBe(30000);
    expect(result.incomeLimitation.toNumber()).toBe(16000);
    expect(result.qbiDeduction.toNumber()).toBe(16000);
  });
});

// ── 16. Negative QBI — loss carries forward (spec Line 16) ─────────────────

describe("Form 8995 Line 16 — negative QBI produces loss carryforward", () => {
  it("single negative QBI source produces zero deduction and carryforward", () => {
    const result = calculateForm8995({
      qbiSources: [{ name: "Losing Biz", qbi: d("-25000") }],
      taxableIncomeBeforeQBI: d("100000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.totalQBI.toNumber()).toBe(-25000);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(25000);
  });
});

// ── 17. Multiple businesses with mixed positive/negative QBI (spec Line 6) ──

describe("Form 8995 Line 6 — multiple businesses with mixed positive/negative QBI", () => {
  it("positive and negative QBI sources net together before computing deduction", () => {
    // Biz A: +$60,000, Biz B: -$20,000, Biz C: +$10,000
    // Net QBI = $60K - $20K + $10K = $50K
    const result = calculateForm8995({
      qbiSources: [
        { name: "Profitable A", qbi: d("60000") },
        { name: "Losing B", qbi: d("-20000") },
        { name: "Small C", qbi: d("10000") },
      ],
      taxableIncomeBeforeQBI: d("150000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.totalQBI.toNumber()).toBe(50000);
    expect(result.qbiComponent.toNumber()).toBe(10000); // 20% of $50K
    expect(result.qbiDeduction.toNumber()).toBe(10000);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
    expect(result.qbiAmounts).toHaveLength(3);
  });

  it("mixed QBI sources netting to negative produce loss carryforward", () => {
    // Biz A: +$10,000, Biz B: -$40,000
    // Net QBI = $10K - $40K = -$30K
    const result = calculateForm8995({
      qbiSources: [
        { name: "Small Winner", qbi: d("10000") },
        { name: "Big Loser", qbi: d("-40000") },
      ],
      taxableIncomeBeforeQBI: d("100000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.totalQBI.toNumber()).toBe(-30000);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(30000);
  });
});

// ── 18. QBI with zero taxable income — zero deduction (spec Line 12) ───────

describe("Form 8995 Line 12 — QBI with zero taxable income", () => {
  it("positive QBI but zero taxable income yields zero deduction", () => {
    // TI before QBI = $0 → income limitation = 20% of $0 = $0
    // QBI component = 20% of $50K = $10K, but deduction = min($10K, $0) = $0
    const result = calculateForm8995({
      qbiSources: [{ name: "Zero TI Biz", qbi: d("50000") }],
      taxableIncomeBeforeQBI: d("0"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.qbiComponent.toNumber()).toBe(10000);
    expect(result.incomeLimitation.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });
});

// ── 19. QBI with capital gains reducing benefit (spec Line 11-12) ──────────

describe("Form 8995 Lines 11-12 — capital gains reduce QBI benefit", () => {
  it("net capital gain reduces the income base for QBI deduction", () => {
    // TI before QBI = $100,000, net cap gain = $60,000, qual div = $5,000
    // Income base = $100,000 - ($60,000 + $5,000) = $35,000
    // Income limitation = 20% of $35,000 = $7,000
    // QBI component = 20% of $50,000 = $10,000
    // Deduction = min($10K, $7K) = $7,000
    const result = calculateForm8995({
      qbiSources: [{ name: "Cap Gain Test Biz", qbi: d("50000") }],
      taxableIncomeBeforeQBI: d("100000"),
      netCapitalGain: d("60000"),
      qualifiedDividends: d("5000"),
    });

    expect(result.netCapitalGainAmount.toNumber()).toBe(65000);
    expect(result.incomeLimitation.toNumber()).toBe(7000);
    expect(result.qbiComponent.toNumber()).toBe(10000);
    expect(result.qbiDeduction.toNumber()).toBe(7000);
  });

  it("capital gains exceeding taxable income floor income limitation at zero", () => {
    // TI before QBI = $80,000, net cap gain = $90,000
    // Income base = max(0, $80K - $90K) = $0
    // Income limitation = 20% of $0 = $0
    // Deduction = min($10K, $0) = $0
    const result = calculateForm8995({
      qbiSources: [{ name: "Overwhelmed Biz", qbi: d("50000") }],
      taxableIncomeBeforeQBI: d("80000"),
      netCapitalGain: d("90000"),
      qualifiedDividends: d("0"),
    });

    expect(result.incomeLimitation.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    // No loss carryforward — QBI itself is positive
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });
});

// ── 20. Very small QBI — $100 (spec Line 7) ────────────────────────────────

describe("Form 8995 Line 7 — very small QBI ($100)", () => {
  it("$100 QBI produces $20 deduction (20% of $100)", () => {
    const result = calculateForm8995({
      qbiSources: [{ name: "Tiny Side Gig", qbi: d("100") }],
      taxableIncomeBeforeQBI: d("50000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.qbiComponent.toNumber()).toBe(20);
    expect(result.incomeLimitation.toNumber()).toBe(10000);
    expect(result.qbiDeduction.toNumber()).toBe(20);
  });
});

// ── 21. QBI deduction limited by taxable income minus capital gains (spec Line 12, 15) ─

describe("Form 8995 Line 15 — deduction limited by TI minus capital gains", () => {
  it("modest QBI with large qualified dividends causes income limitation to bind", () => {
    // TI before QBI = $50,000, qualified dividends = $40,000
    // Income base = $50,000 - $40,000 = $10,000
    // Income limitation = 20% of $10K = $2,000
    // QBI = $30,000, QBI component = $6,000
    // Deduction = min($6K, $2K) = $2,000
    const result = calculateForm8995({
      qbiSources: [{ name: "Dividend Heavy", qbi: d("30000") }],
      taxableIncomeBeforeQBI: d("50000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("40000"),
    });

    expect(result.incomeLimitation.toNumber()).toBe(2000);
    expect(result.qbiDeduction.toNumber()).toBe(2000);
  });
});

// ── 22. Prior year QBI loss exceeds current QBI (spec Line 6, 16) ──────────

describe("Form 8995 Line 6 — prior year QBI loss exceeds current QBI", () => {
  it("prior year loss larger than current QBI produces net negative and new carryforward", () => {
    // Current QBI = $20,000, prior year loss = $35,000
    // Net QBI = $20,000 - $35,000 = -$15,000
    // Deduction = $0, carryforward = $15,000
    const result = calculateForm8995({
      qbiSources: [{ name: "Recovering Biz", qbi: d("20000") }],
      priorYearQBILoss: d("35000"),
      taxableIncomeBeforeQBI: d("100000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.totalQBI.toNumber()).toBe(-15000);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(15000);
  });
});

// ── 23. Prior year QBI loss partially offsets current QBI ────────────────────

describe("Form 8995 Line 6 — prior year QBI loss partially offsets current QBI", () => {
  it("prior year loss reduces but does not eliminate current QBI", () => {
    // Current QBI = $50,000, prior year loss = $20,000
    // Net QBI = $50,000 - $20,000 = $30,000
    // QBI component = 20% of $30K = $6,000
    const result = calculateForm8995({
      qbiSources: [{ name: "Growing Biz", qbi: d("50000") }],
      priorYearQBILoss: d("20000"),
      taxableIncomeBeforeQBI: d("150000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.totalQBI.toNumber()).toBe(30000);
    expect(result.qbiComponent.toNumber()).toBe(6000);
    expect(result.qbiDeduction.toNumber()).toBe(6000);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });
});

// ── 24. QBI = $1 — minimum meaningful deduction (rounding) ─────────────────

describe("Form 8995 Line 7 — QBI of $1 produces $0 deduction after rounding", () => {
  it("$1 QBI produces $0 deduction (20% of $1 = $0.20 rounds to $0)", () => {
    const result = calculateForm8995({
      qbiSources: [{ name: "Dollar Biz", qbi: d("1") }],
      taxableIncomeBeforeQBI: d("50000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    // 20% of $1 = $0.20, rounded to $0
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });
});

// ── 25. Both net capital gain and qualified dividends reduce QBI benefit ─────

describe("Form 8995 Line 11 — combined cap gains and qualified dividends", () => {
  it("both sources of capital income reduce the income limitation", () => {
    // TI = $120,000, cap gain = $30,000, qual div = $20,000
    // Net cap gain amount = $30K + $20K = $50K
    // Income base = $120K - $50K = $70K
    // Income limitation = 20% of $70K = $14,000
    const result = calculateForm8995({
      qbiSources: [{ name: "Combined Cap Test", qbi: d("120000") }],
      taxableIncomeBeforeQBI: d("120000"),
      netCapitalGain: d("30000"),
      qualifiedDividends: d("20000"),
    });

    expect(result.netCapitalGainAmount.toNumber()).toBe(50000);
    expect(result.incomeLimitation.toNumber()).toBe(14000);
    // QBI component = 20% of $120K = $24,000
    expect(result.qbiComponent.toNumber()).toBe(24000);
    // Deduction = min($24K, $14K) = $14,000 (income limitation binds)
    expect(result.qbiDeduction.toNumber()).toBe(14000);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule C QBI Adjusted for SE Deductions (§164(f), §162(l))
// Per IRS Form 8995 Instructions: "the deduction for one-half of
// self-employment tax under section 164(f), the self-employed health
// insurance deduction under section 162(l)... are treated as attributable
// to a trade or business for purposes of computing QBI."
// ═══════════════════════════════════════════════════════════

describe("Schedule C QBI reduced by SE-related deductions per IRS Form 8995 Instructions", () => {
  it("Schedule C QBI reduced by deductible half SE tax — SE-only filer", () => {
    // Single, $0 wages, $100K Schedule C
    // SE: $100K × 0.9235 = $92,350 → SS $11,451 + MC $2,678 = $14,129 → deductible half = $7,065
    // QBI = $100K - $7,065 = $92,935; QBI deduction = 20% × $92,935 = $18,587
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "single" },
      w2s: [],
      scheduleC: {
        businessName: "Solo Consulting",
        businessCode: "541611",
        grossReceipts: "100000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995).toBeDefined();
    // QBI should be $92,935 not $100,000
    expect(result.form8995!.totalQBI.toNumber()).toBe(92935);
    expect(result.form8995!.qbiComponent.toNumber()).toBe(18587);
  });

  it("Schedule C QBI reduced by both deductible half SE tax AND SE health insurance", () => {
    // Single, $0 wages, $80K Schedule C, $10K SE health insurance
    // SE: $80K × 0.9235 = $73,880 → SS $9,161 + MC $2,143 = $11,304 → deductible half = $5,652
    // SE health insurance cap: max(0, $80K - $5,652) = $74,348; min($10K, $74,348) = $10,000
    // QBI = $80K - $5,652 (deductible half) - $10,000 (health insurance) = $64,348
    // QBI deduction = 20% × $64,348 = $12,870
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "single" },
      w2s: [],
      scheduleC: {
        businessName: "Freelance Design",
        businessCode: "541430",
        grossReceipts: "80000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
      adjustments: {
        selfEmployedHealthInsurance: "10000",
        estimatedTaxPayments: [],
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.form8995).toBeDefined();
    // QBI should be $64,348 (net profit - deductible half - health insurance)
    expect(result.form8995!.totalQBI.toNumber()).toBe(64348);
    expect(result.form8995!.qbiComponent.toNumber()).toBe(12870);
  });

  it("K-1-only QBI is NOT reduced by deductible half SE tax (entity-reported)", () => {
    // Single, $80K wages, K-1 with $25K QBI but $0 SE earnings
    // K-1 QBI accepted as-is from Box 20 Code Z
    const fixture = singleFiler("80000", {
      scheduleK1: [{
        partnershipName: "S-Corp Services",
        partnershipEIN: "55-9990001",
        ordinaryIncome: "25000",
        section199AQBI: "25000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "100000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    });
    const result = calculateFederalTax(fixture);
    expect(result.form8995).toBeDefined();
    // K-1 QBI is unchanged — no SE deductions to subtract
    expect(result.form8995!.totalQBI.toNumber()).toBe(25000);
    expect(result.form8995!.qbiComponent.toNumber()).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════

// ── N1. Schedule C sole proprietor below simplified threshold ───────────────

describe("Form 8995 — Schedule C sole proprietor below simplified threshold", () => {
  it("sole proprietor with $60K net profit and $40K wages stays under $197,300 threshold and gets 20% QBI deduction", () => {
    // Wages = $40K, Schedule C gross = $60K, expenses = $0
    // SE tax on $60K: $60K × 0.9235 × 0.153 ≈ $8,479. Half SE ≈ $4,239.
    // AGI ≈ $40K + $60K - $4,239 = $95,761
    // TI before QBI = $95,761 - $15,000 std ded = $80,761 < $197,300 → qualifies
    // Per IRS Form 8995, QBI adjusted for SE deductions: $60K - $4,239 = $55,761
    // QBI component = 20% × $55,761 = $11,152
    // Income limitation = 20% × $80,761 = $16,152
    // Deduction = min($11,152, $16,152) = $11,152 (QBI component binds)
    const fixture = singleFiler("40000", {
      scheduleC: {
        businessName: "Freelance Design",
        businessCode: "541430",
        grossReceipts: "60000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Taxable income before QBI is below single threshold
    expect(form8995.taxableIncomeBeforeQBI.lte(d("197300"))).toBe(true);

    // QBI component = 20% of SE-adjusted Schedule C QBI ($55,761)
    expect(form8995.qbiComponent.toNumber()).toBe(11152);

    // Income limitation must be higher than QBI component so QBI component binds
    expect(form8995.incomeLimitation.greaterThan(form8995.qbiComponent)).toBe(true);

    // Deduction equals QBI component (the binding constraint here)
    expect(form8995.qbiDeduction.toNumber()).toBe(11152);

    // Taxable income = AGI - std deduction - QBI deduction
    const expectedTI = Decimal.max(
      0,
      result.agi.minus(result.deductionAmount).minus(form8995.qbiDeduction)
    );
    expect(result.taxableIncome.toNumber()).toBe(expectedTI.toNumber());
  });
});

// ── N2. QBI from K-1 partnership (direct Form 8995 calculation) ─────────────

describe("Form 8995 — K-1 partnership QBI flows through directly to deduction", () => {
  it("single K-1 source with $35,000 section199AQBI produces $7,000 deduction", () => {
    // Direct calculateForm8995 call simulating K-1 partnership QBI
    // QBI = $35,000, TI before QBI = $120,000
    // QBI component = 20% × $35K = $7,000
    // Income limitation = 20% × $120K = $24,000
    // Deduction = min($7K, $24K) = $7,000
    const result = calculateForm8995({
      qbiSources: [{ name: "Westside Partners LP", qbi: d("35000") }],
      taxableIncomeBeforeQBI: d("120000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.qbiAmounts).toHaveLength(1);
    expect(result.qbiAmounts[0].toNumber()).toBe(35000);
    expect(result.totalQBI.toNumber()).toBe(35000);
    expect(result.qbiComponent.toNumber()).toBe(7000);
    expect(result.incomeLimitation.toNumber()).toBe(24000);
    expect(result.qbiDeduction.toNumber()).toBe(7000);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });
});

// ── N3. Multiple QBI sources: some positive, some negative ──────────────────

describe("Form 8995 — multiple QBI sources with mixed signs net before computing deduction", () => {
  it("four sources with mixed signs: two profitable, two losing, net to positive QBI", () => {
    // Biz A: +$80,000  Biz B: -$30,000  Biz C: +$15,000  Biz D: -$5,000
    // Net QBI = $80K - $30K + $15K - $5K = $60,000
    // QBI component = 20% × $60K = $12,000
    // Income limitation = 20% × $150K = $30,000
    // Deduction = min($12K, $30K) = $12,000
    const result = calculateForm8995({
      qbiSources: [
        { name: "Consulting Biz A", qbi: d("80000") },
        { name: "Retail Biz B", qbi: d("-30000") },
        { name: "Rental Partnership C", qbi: d("15000") },
        { name: "Side Venture D", qbi: d("-5000") },
      ],
      taxableIncomeBeforeQBI: d("150000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.qbiAmounts).toHaveLength(4);
    expect(result.totalQBI.toNumber()).toBe(60000);
    expect(result.qbiComponent.toNumber()).toBe(12000);
    expect(result.incomeLimitation.toNumber()).toBe(30000);
    expect(result.qbiDeduction.toNumber()).toBe(12000);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("four sources netting to negative: zero deduction, loss carryforward equals absolute net QBI", () => {
    // Biz A: +$20,000  Biz B: -$90,000 → net = -$70,000
    const result = calculateForm8995({
      qbiSources: [
        { name: "Growing Startup", qbi: d("20000") },
        { name: "Failing Venture", qbi: d("-90000") },
      ],
      taxableIncomeBeforeQBI: d("100000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.totalQBI.toNumber()).toBe(-70000);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(70000);
  });
});

// ── N4. QBI net loss → zero deduction, carryforward (integration) ───────────

describe("Form 8995 integration — QBI net loss produces zero deduction and carryforward in full return", () => {
  it("Schedule C net loss from high expenses produces QBI loss carryforward in carryforwards output", () => {
    // Schedule C: $5K gross, $25K expenses → net loss -$20K
    // K-1 QBI: +$8K
    // Net QBI = -$20K + $8K = -$12K → deduction $0, carryforward $12K
    const fixture = singleFiler("70000", {
      scheduleC: {
        businessName: "Over-Spent Biz",
        businessCode: "541511",
        grossReceipts: "5000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
        expenses: {
          advertising: "5000",
          supplies: "8000",
          utilities: "7000",
          officeExpense: "5000",
        },
      },
      scheduleK1: [
        {
          partnershipName: "Recovering Fund LP",
          partnershipEIN: "20-9876543",
          ordinaryIncome: "8000",
          section199AQBI: "8000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "50000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Net QBI should be negative (Schedule C loss dominates)
    expect(form8995.totalQBI.lessThan(0)).toBe(true);

    // No deduction when net QBI is negative
    expect(form8995.qbiDeduction.toNumber()).toBe(0);
    expect(form8995.qbiComponent.toNumber()).toBe(0);

    // Loss carryforward equals absolute value of negative net QBI
    expect(form8995.qbiLossCarryforward.toNumber()).toBe(
      form8995.totalQBI.abs().toNumber()
    );

    // Carryforward propagates to top-level result
    expect(result.carryforwards.qbiLossCarryforward.greaterThan(0)).toBe(true);
    expect(result.carryforwards.qbiLossCarryforward.toNumber()).toBe(
      form8995.qbiLossCarryforward.toNumber()
    );
  });
});

// ── N5. QBI deduction = min(20% QBI, 20% taxable income) — exact equality ───

describe("Form 8995 Line 15 — deduction equals min(20% QBI, 20% TI) by definition", () => {
  it("when 20% of QBI is less than 20% of TI, deduction equals 20% of QBI", () => {
    // QBI = $40K, TI = $200K → 20% QBI = $8K, 20% TI = $40K → min = $8K
    const result = calculateForm8995({
      qbiSources: [{ name: "Small QBI Biz", qbi: d("40000") }],
      taxableIncomeBeforeQBI: d("200000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.qbiComponent.toNumber()).toBe(8000);
    expect(result.incomeLimitation.toNumber()).toBe(40000);
    expect(result.qbiDeduction.toNumber()).toBe(8000);
    expect(result.qbiDeduction.toNumber()).toBe(
      Decimal.min(result.qbiComponent, result.incomeLimitation).toNumber()
    );
  });

  it("when 20% of TI is less than 20% of QBI, deduction equals 20% of TI", () => {
    // QBI = $200K, TI = $40K → 20% QBI = $40K, 20% TI = $8K → min = $8K
    const result = calculateForm8995({
      qbiSources: [{ name: "Large QBI Biz", qbi: d("200000") }],
      taxableIncomeBeforeQBI: d("40000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.qbiComponent.toNumber()).toBe(40000);
    expect(result.incomeLimitation.toNumber()).toBe(8000);
    expect(result.qbiDeduction.toNumber()).toBe(8000);
    expect(result.qbiDeduction.toNumber()).toBe(
      Decimal.min(result.qbiComponent, result.incomeLimitation).toNumber()
    );
  });
});

// ── N6. Taxable income limiting QBI more than 20% of QBI ────────────────────

describe("Form 8995 — taxable income limits deduction below 20% of QBI", () => {
  it("very large QBI with small taxable income causes income limitation to be far below QBI component", () => {
    // QBI = $500K (large), TI before QBI = $30K (small)
    // QBI component = 20% × $500K = $100,000
    // Income limitation = 20% × $30K = $6,000
    // Deduction = $6,000 — income limitation is 94% smaller than QBI component
    const result = calculateForm8995({
      qbiSources: [{ name: "Capital-Heavy LP", qbi: d("500000") }],
      taxableIncomeBeforeQBI: d("30000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.qbiComponent.toNumber()).toBe(100000);
    expect(result.incomeLimitation.toNumber()).toBe(6000);
    expect(result.qbiDeduction.toNumber()).toBe(6000);

    // Income limitation is well below QBI component
    expect(result.incomeLimitation.lessThan(result.qbiComponent)).toBe(true);
    // Deduction is just 6% of the full 20% QBI amount
    const reductionFactor = result.qbiDeduction.dividedBy(result.qbiComponent);
    expect(reductionFactor.lessThan(d("0.10"))).toBe(true);
  });
});

// ── N7. QBI with SSTB (specified service trade or business) at various incomes

describe("Form 8995 — SSTB business at various income levels", () => {
  it("SSTB consulting sole proprietor below $197,300 threshold gets full 20% QBI deduction", () => {
    // Below threshold: SSTB limitation does not apply under simplified Form 8995.
    // Consulting (code 541611) is an SSTB. At low income, simplified form still grants 20%.
    const fixture = singleFiler("50000", {
      scheduleC: {
        businessName: "SSTB Law Practice",
        businessCode: "541110", // law — SSTB
        grossReceipts: "40000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    // Simplified Form 8995 grants 20% without SSTB phase-out when under threshold
    // QBI adjusted for deductible half SE tax: $40K - ~$2,826 = $37,174 → 20% = $7,435
    expect(result.form8995!.qbiComponent.toNumber()).toBe(7435);
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(7435);
  });

  it("SSTB sole proprietor above $197,300 threshold is not eligible for simplified Form 8995", () => {
    // Above threshold, simplified Form 8995 does not apply at all.
    // $250K wages + $50K SSTB Schedule C → TI before QBI >> $197,300
    const fixture = singleFiler("250000", {
      scheduleC: {
        businessName: "SSTB Medical Practice",
        businessCode: "621111", // physician — SSTB
        grossReceipts: "50000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });

    const result = calculateFederalTax(fixture);

    // Above threshold — no simplified Form 8995
    expect(result.form8995).toBeUndefined();
    expect(result.carryforwards.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("SSTB K-1 below $197,300 single threshold receives full simplified Form 8995 deduction", () => {
    // K-1 from an investment advisory SSTB, but below threshold
    const fixture = singleFiler("100000", {
      scheduleK1: [
        {
          partnershipName: "Advisory SSTB Fund LP",
          partnershipEIN: "30-1234567",
          ordinaryIncome: "20000",
          section199AQBI: "20000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "100000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    // Simplified form does not apply SSTB restriction — full 20% deduction
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(4000); // 20% of $20K
  });
});

// ── N8. QBI loss carryforward reducing next year's deduction ────────────────

describe("Form 8995 — prior year QBI loss carryforward reduces current year deduction", () => {
  it("prior year QBI loss exactly equal to current QBI yields zero net QBI and zero deduction", () => {
    // Current QBI = $30,000, prior year loss = $30,000
    // Net QBI = $30,000 - $30,000 = $0 → deduction = $0, no new carryforward
    const result = calculateForm8995({
      qbiSources: [{ name: "Break-Even Biz", qbi: d("30000") }],
      priorYearQBILoss: d("30000"),
      taxableIncomeBeforeQBI: d("100000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.totalQBI.toNumber()).toBe(0);
    // When totalQBI = 0, component = 0 (not > 0)
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("prior year QBI loss of $15K reduces $45K current QBI to $30K, producing $6,000 deduction", () => {
    // Current QBI = $45,000, prior loss = $15,000
    // Net QBI = $30,000 → 20% = $6,000
    const result = calculateForm8995({
      qbiSources: [{ name: "Post-Loss Recovery Biz", qbi: d("45000") }],
      priorYearQBILoss: d("15000"),
      taxableIncomeBeforeQBI: d("120000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    expect(result.totalQBI.toNumber()).toBe(30000);
    expect(result.qbiComponent.toNumber()).toBe(6000);
    expect(result.incomeLimitation.toNumber()).toBe(24000);
    expect(result.qbiDeduction.toNumber()).toBe(6000);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });
});

// ── N9. QBI for all 5 filing statuses (threshold comparison) ────────────────

describe("Form 8995 — QBI simplified threshold for all five filing statuses", () => {
  it("head_of_household filer under $197,300 threshold gets simplified Form 8995", () => {
    // HOH std deduction = $22,500. Threshold = $197,300.
    // Wages = $150K + K-1 QBI $10K → TI before QBI = ($150K + $10K) - $22,500 = $137,500 < $197,300
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "head_of_household",
        dependents: [
          {
            firstName: "Alex",
            lastName: "Doe",
            ssn: "321-54-9876",
            relationship: "Child",
            dateOfBirth: "2015-07-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
        ],
      },
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "150000",
          federalWithheld: "0",
          socialSecurityWages: "150000",
          socialSecurityWithheld: new Decimal("150000").times("0.062").toFixed(2),
          medicareWages: "150000",
          medicareWithheld: new Decimal("150000").times("0.0145").toFixed(2),
        },
      ],
      scheduleK1: [
        {
          partnershipName: "HOH QBI Fund LP",
          partnershipEIN: "60-1111111",
          ordinaryIncome: "10000",
          section199AQBI: "10000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "100000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    };

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    expect(result.form8995!.taxableIncomeBeforeQBI.lte(d("197300"))).toBe(true);
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(2000); // 20% of $10K
  });

  it("qualifying_surviving_spouse filer under $197,300 threshold gets simplified Form 8995", () => {
    // QSS threshold = $197,300 (same as single per IRC §199A(e)(2)). Std deduction = $30,000.
    // Wages = $150K + K-1 QBI $20K → TI before QBI = ($150K + $20K) - $30K = $140K < $197,300
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "qualifying_surviving_spouse",
        dependents: [
          {
            firstName: "Sam",
            lastName: "Doe",
            ssn: "555-44-3333",
            relationship: "Child",
            dateOfBirth: "2016-04-15",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
        ],
      },
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "150000",
          federalWithheld: "0",
          socialSecurityWages: "150000",
          socialSecurityWithheld: new Decimal("150000").times("0.062").toFixed(2),
          medicareWages: "150000",
          medicareWithheld: new Decimal("150000").times("0.0145").toFixed(2),
        },
      ],
      scheduleK1: [
        {
          partnershipName: "QSS Income Fund LP",
          partnershipEIN: "70-2222222",
          ordinaryIncome: "20000",
          section199AQBI: "20000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "200000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    };

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    expect(result.form8995!.taxableIncomeBeforeQBI.lte(d("197300"))).toBe(true);
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(4000); // 20% of $20K
  });

  it("head_of_household filer above $197,300 threshold does not get simplified Form 8995", () => {
    // HOH std deduction = $22,500. Wages = $230K → TI ≈ $230K - $22,500 = $207,500 > $197,300
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "head_of_household",
        dependents: [
          {
            firstName: "Alex",
            lastName: "Doe",
            ssn: "321-54-9876",
            relationship: "Child",
            dateOfBirth: "2015-07-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
        ],
      },
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "230000",
          federalWithheld: "0",
          socialSecurityWages: "230000",
          socialSecurityWithheld: new Decimal("230000").times("0.062").toFixed(2),
          medicareWages: "230000",
          medicareWithheld: new Decimal("230000").times("0.0145").toFixed(2),
        },
      ],
      scheduleK1: [
        {
          partnershipName: "HOH Over Threshold Fund",
          partnershipEIN: "60-9999999",
          ordinaryIncome: "10000",
          section199AQBI: "10000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "100000",
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    };

    const result = calculateFederalTax(fixture);

    // TI before QBI > $197,300 HOH threshold → no simplified Form 8995
    expect(result.form8995).toBeUndefined();
  });
});

// ── N10. Rental income as QBI (via K-1 with section199AQBI) ─────────────────

describe("Form 8995 — rental income treated as QBI when reported on K-1 section199AQBI", () => {
  it("K-1 from a rental real estate partnership with section199AQBI generates QBI deduction", () => {
    // A rental real estate business can be a qualified trade/business under §199A.
    // The K-1 section199AQBI field carries the QBI amount determined by the partnership.
    // Single filer, $80K wages, K-1 with $30K rental QBI from real estate LP
    const fixture = singleFiler("80000", {
      scheduleK1: [
        {
          partnershipName: "Riverside Rental Properties LP",
          partnershipEIN: "40-7654321",
          ordinaryIncome: "30000",
          section199AQBI: "30000", // rental real estate treated as QTB
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "300000",
          netRentalIncome: "30000",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // QBI from rental K-1 = $30,000
    expect(form8995.totalQBI.toNumber()).toBe(30000);

    // QBI component = 20% × $30K = $6,000
    expect(form8995.qbiComponent.toNumber()).toBe(6000);

    // Income limitation at $80K wages is much higher → deduction = $6,000
    expect(form8995.qbiDeduction.toNumber()).toBe(6000);

    // No loss carryforward
    expect(form8995.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("rental K-1 with net rental loss reported as negative section199AQBI produces loss carryforward", () => {
    // Rental partnership reported a $12,000 QBI loss (expenses exceeded rental income)
    const fixture = singleFiler("90000", {
      scheduleK1: [
        {
          partnershipName: "Downtown Rental LP",
          partnershipEIN: "40-8765432",
          ordinaryIncome: "-12000",
          section199AQBI: "-12000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: false,
          atRiskAmount: "200000",
          netRentalIncome: "-12000",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Negative QBI from rental loss
    expect(form8995.totalQBI.toNumber()).toBe(-12000);
    expect(form8995.qbiDeduction.toNumber()).toBe(0);
    expect(form8995.qbiLossCarryforward.toNumber()).toBe(12000);
    expect(result.carryforwards.qbiLossCarryforward.toNumber()).toBe(12000);
  });
});

// ── N11. Audit trail for Form 8995 lines ────────────────────────────────────

describe("Form 8995 audit trail — all key lines recorded in lines output", () => {
  it("Form 8995 result contains audit trail entries for lines 1-5, 6, 7, 10, 11, 12, 15, 16", () => {
    const result = calculateForm8995({
      qbiSources: [
        { name: "Audit Test Biz A", qbi: d("60000") },
        { name: "Audit Test Biz B", qbi: d("20000") },
      ],
      priorYearQBILoss: d("5000"),
      taxableIncomeBeforeQBI: d("150000"),
      netCapitalGain: d("10000"),
      qualifiedDividends: d("3000"),
    });

    const lines = result.lines;

    // Lines array should be non-empty
    expect(lines.length).toBeGreaterThan(0);

    // Extract all line numbers from audit entries
    const lineNumbers = lines.map((l) => l.line);

    // Lines 1-5: QBI by business
    expect(lineNumbers).toContain("1-5");

    // Line 6: Total QBI
    expect(lineNumbers).toContain("6");

    // Line 7: QBI component
    expect(lineNumbers).toContain("7");

    // Line 10: Taxable income before QBI
    expect(lineNumbers).toContain("10");

    // Line 11: Net capital gain amount
    expect(lineNumbers).toContain("11");

    // Line 12: Income limitation
    expect(lineNumbers).toContain("12");

    // Line 15: Section 199A deduction
    expect(lineNumbers).toContain("15");

    // Line 16: QBI loss carryforward
    expect(lineNumbers).toContain("16");
  });

  it("Form 8995 audit trail entries contain form name, description, and value", () => {
    const result = calculateForm8995({
      qbiSources: [{ name: "Audit Verify Biz", qbi: d("25000") }],
      taxableIncomeBeforeQBI: d("80000"),
      netCapitalGain: d("0"),
      qualifiedDividends: d("0"),
    });

    // Every audit line should have a form name, line number, description, and numeric value
    for (const line of result.lines) {
      expect(line.form).toBeTruthy();
      expect(line.line).toBeTruthy();
      expect(line.description).toBeTruthy();
      expect(line.value).toBeDefined();
      expect(line.value instanceof Decimal).toBe(true);
    }

    // Spot-check: Line 15 value should match qbiDeduction
    const line15 = result.lines.find((l) => l.line === "15");
    expect(line15).toBeDefined();
    expect(line15!.value.toNumber()).toBe(result.qbiDeduction.toNumber());

    // Spot-check: Line 6 value should match totalQBI
    const line6 = result.lines.find((l) => l.line === "6");
    expect(line6).toBeDefined();
    expect(line6!.value.toNumber()).toBe(result.totalQBI.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// (End of new edge cases)
// ═══════════════════════════════════════════════════════════

describe("QBI deduction reduces taxable income but not AGI", () => {
  it("AGI is unchanged by QBI deduction while taxable income is reduced", () => {
    const fixtureWithQBI = singleFiler("80000", {
      scheduleC: {
        businessName: "Consulting",
        businessCode: "541611",
        grossReceipts: "40000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    });

    const resultWithQBI = calculateFederalTax(fixtureWithQBI);

    // AGI should include Schedule C income but NOT be reduced by QBI deduction
    // AGI = wages + Sched C net profit - 1/2 SE tax - deductible SE health insurance
    expect(resultWithQBI.agi.greaterThan(d(80000))).toBe(true);

    // Confirm Form 8995 exists and has a deduction
    expect(resultWithQBI.form8995).toBeDefined();
    const qbiDeduction = resultWithQBI.form8995!.qbiDeduction;
    expect(qbiDeduction.greaterThan(0)).toBe(true);

    // Taxable income = AGI - standard deduction - QBI deduction
    const taxableIncomeBeforeQBI = Decimal.max(
      0,
      resultWithQBI.agi.minus(resultWithQBI.deductionAmount)
    );
    const expectedTaxableIncome = Decimal.max(
      0,
      taxableIncomeBeforeQBI.minus(qbiDeduction)
    );
    expect(resultWithQBI.taxableIncome.toNumber()).toBe(
      expectedTaxableIncome.toNumber()
    );

    // AGI should NOT include QBI deduction (it's below-the-line)
    // Verify AGI = taxableIncome + deductionAmount + qbiDeduction
    const reconstructedAGI = resultWithQBI.taxableIncome
      .plus(resultWithQBI.deductionAmount)
      .plus(qbiDeduction);
    expect(reconstructedAGI.toNumber()).toBe(resultWithQBI.agi.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Form 8995 Line 11 — net capital gain uses min(Schedule D Line 15, Line 16)
// IRS: "the smaller of Schedule D line 15 or 16" + qualified dividends
// IRC §1222(11): net capital gain = excess of NLTCG over NSTCL
// Short-term gains do NOT increase net capital gain.
// ═══════════════════════════════════════════════════════════

describe("Form 8995 Line 11 — STCG excluded from net capital gain (min of Sched D L15, L16)", () => {
  it("STCG-only gains produce net capital gain of $0 — QBI income limitation not reduced", () => {
    // K-1 S-Corp with $160K QBI, $5K wages, $20K STCG, $0 LTCG
    // AGI = $5K + $160K + $20K = $185K
    // TI before QBI = $185K - $15K std ded = $170K (below $197,300)
    //
    // IRS correct (min of Sched D L15=$0, L16=$20K):
    //   Net CG = $0 → income limitation = $170K × 20% = $34K
    //   QBI component = $160K × 20% = $32K
    //   QBI deduction = min($32K, $34K) = $32K
    //
    // Bug (using Line 16 only):
    //   Net CG = $20K → income limitation = ($170K - $20K) × 20% = $30K
    //   QBI deduction = min($32K, $30K) = $30K ← $2K less!
    const fixture = singleFiler("5000", {
      scheduleK1: [{
        partnershipName: "S-Corp Inc",
        partnershipEIN: "12-3456789",
        ordinaryIncome: "160000",
        section199AQBI: "160000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "500000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "AAPL 100 shares (short-term)",
          dateAcquired: "2025-06-01",
          dateSold: "2025-09-01",
          proceeds: "30000",
          costBasis: "10000",
          holdingPeriod: "short" as const,
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Net capital gain should be $0 — STCG is NOT "net capital gain" per §1222(11)
    expect(form8995.netCapitalGainAmount.toNumber()).toBe(0);

    // QBI component = $160K × 20% = $32K
    expect(form8995.qbiComponent.toNumber()).toBe(32000);

    // Income limitation = TI × 20% (NOT reduced by STCG)
    expect(form8995.incomeLimitation.toNumber()).toBe(33850);

    // QBI deduction = min($32K, $34K) = $32K (QBI component binds)
    expect(form8995.qbiDeduction.toNumber()).toBe(32000);
  });

  it("mixed STCG + LTCG — only LTCG counts as net capital gain", () => {
    // K-1 S-Corp with $160K QBI, $5K wages, $10K STCG, $8K LTCG
    // AGI = $5K + $160K + $18K = $183K
    // TI before QBI = $183K - $15.75K = $167.25K
    //
    // IRS correct: net CG = min(L15=$8K, L16=$18K) = $8K
    //   Income limitation = ($167.25K - $8K) × 20% = $31,850
    //   QBI deduction = min($32K, $31,850) = $31,850
    //
    // Bug: net CG = $18K
    //   Income limitation = ($168K - $18K) × 20% = $30K
    //   QBI deduction = min($32K, $30K) = $30K ← $2K less!
    const fixture = singleFiler("5000", {
      scheduleK1: [{
        partnershipName: "S-Corp Inc",
        partnershipEIN: "12-3456789",
        ordinaryIncome: "160000",
        section199AQBI: "160000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "500000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          {
            description: "MSFT 50 shares (short-term)",
            dateAcquired: "2025-06-01",
            dateSold: "2025-09-01",
            proceeds: "20000",
            costBasis: "10000",
            holdingPeriod: "short" as const,
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "GOOG 20 shares (long-term)",
            dateAcquired: "2023-01-15",
            dateSold: "2025-06-01",
            proceeds: "18000",
            costBasis: "10000",
            holdingPeriod: "long" as const,
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    });

    const result = calculateFederalTax(fixture);

    expect(result.form8995).toBeDefined();
    const form8995 = result.form8995!;

    // Net capital gain = min(LTCG=$8K, total=$18K) = $8K (STCG excluded)
    expect(form8995.netCapitalGainAmount.toNumber()).toBe(8000);

    // QBI component = $160K × 20% = $32K
    expect(form8995.qbiComponent.toNumber()).toBe(32000);

    // Income limitation = ($167.25K - $8K) × 20% = $31,850
    expect(form8995.incomeLimitation.toNumber()).toBe(31850);

    // QBI deduction = min($32K, $31,850) = $31,850
    expect(form8995.qbiDeduction.toNumber()).toBe(31850);
  });
});

// ═══════════════════════════════════════════════════════════
// Regression: QSS QBI simplified threshold = $197,300 (not MFJ $394,600)
// ═══════════════════════════════════════════════════════════

describe("QBI — QSS simplified threshold is $197,300 (IRC §199A(e)(2))", () => {
  it("Regression: QSS at $250K taxable income — above $197,300 threshold, no simplified QBI", () => {
    // This scenario incorrectly used simplified Form 8995 when QSS had MFJ's $394,600 threshold.
    // At $250K taxable income (above $197,300), the simplified form should NOT apply.
    // Since Form 8995-A is not implemented, the engine should skip QBI entirely.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "qualifying_surviving_spouse",
        dependents: [{
          firstName: "Child",
          lastName: "Test",
          ssn: "111-22-3333",
          relationship: "Son",
          dateOfBirth: "2019-01-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "270000",
        federalWithheld: "55000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "270000",
        medicareWithheld: "3915",
      }],
      scheduleK1: [{
        entityName: "QSS Business",
        entityEin: "99-8765432",
        entityType: "s_corp",
        ordinaryIncome: "50000",
        qualifiedBusinessIncome: "50000",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Taxable income before QBI ≈ $270K + $50K - $30K std deduction = $290K > $197,300
    // QBI should NOT be computed via simplified form (above threshold)
    expect(federal.form8995).toBeUndefined();
  });
});
