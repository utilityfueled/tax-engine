/**
 * Schedule D integration tests for Form 6252 (installment sales),
 * Form 6781 (§1256 contracts), and home-sale-exclusion (IRC §121).
 *
 * These forms were recently added and flow through Schedule D but had
 * no end-to-end integration tests verifying their Schedule D contributions.
 *
 * Spec: spec/federal/schedule-d.yaml (Lines 7, 15)
 */

import { describe, it, expect } from "vitest";
import { calculateScheduleD } from "@/engine/schedules/schedule-d.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const c = getConstants(2025);

function makeFixture(overrides: Partial<TaxYearInput>): TaxYearInput {
  return {
    ...simpleW2Fixture,
    form1099B: [],
    form1099Div: [],
    scheduleK1: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Form 6781 — Section 1256 Contracts → Schedule D
// ═══════════════════════════════════════════════════════════

describe("Schedule D - Form 6781 section 1256 contracts integration", () => {
  it("$10,000 section 1256 net gain splits 60/40 into LT/ST on Schedule D", () => {
    const result = calculateScheduleD(makeFixture({
      form6781: {
        section1256Gains: "10000",
        section1256Losses: "0",
      },
    }), "single", c);

    // 40% short-term = $4,000, 60% long-term = $6,000
    expect(result.netShortTerm.toNumber()).toBe(4000);
    expect(result.netLongTerm.toNumber()).toBe(6000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(10000);
  });

  it("section 1256 net loss splits 60/40 into LT/ST losses", () => {
    const result = calculateScheduleD(makeFixture({
      form6781: {
        section1256Gains: "2000",
        section1256Losses: "12000",
      },
    }), "single", c);

    // Net = $2,000 - $12,000 = -$10,000 → 40% ST = -$4,000, 60% LT = -$6,000
    expect(result.netShortTerm.toNumber()).toBe(-4000);
    expect(result.netLongTerm.toNumber()).toBe(-6000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
  });

  it("section 1256 gain combines with 1099-B stock sales", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "AAPL",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "20000",
          costBasis: "15000",
          adjustments: "0",
          basisReportedToIRS: true,
          holdingPeriod: "long" as const,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
      form6781: {
        section1256Gains: "8000",
        section1256Losses: "0",
      },
    }), "single", c);

    // 1099-B: $5,000 LT gain
    // Form 6781: $3,200 ST (40%) + $4,800 LT (60%)
    expect(result.netShortTerm.toNumber()).toBe(3200);
    expect(result.netLongTerm.toNumber()).toBe(9800); // $5,000 + $4,800
    expect(result.netCapitalGainLoss.toNumber()).toBe(13000);
  });

  it("section 1256 loss with carryback election reduces the amount flowing to Schedule D", () => {
    const result = calculateScheduleD(makeFixture({
      form6781: {
        section1256Gains: "0",
        section1256Losses: "10000",
        carrybackElection: true,
        carrybackAmount: "6000",
      },
    }), "single", c);

    // Net = -$10,000, carryback $6,000, remainder = -$4,000
    // 40% ST = -$1,600, 60% LT = -$2,400
    expect(result.netShortTerm.toNumber()).toBe(-1600);
    expect(result.netLongTerm.toNumber()).toBe(-2400);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-4000);
  });

  it("straddle gains and losses flow to Schedule D alongside section 1256 contracts", () => {
    const result = calculateScheduleD(makeFixture({
      form6781: {
        section1256Gains: "5000",
        section1256Losses: "0",
        shortTermStraddleGains: "2000",
        longTermStraddleLosses: "1500",
      },
    }), "single", c);

    // Section 1256: 40% ST = $2,000, 60% LT = $3,000
    // Straddle: ST gains = $2,000, LT losses = -$1,500
    // Net ST = $2,000 + $2,000 = $4,000
    // Net LT = $3,000 - $1,500 = $1,500
    expect(result.netShortTerm.toNumber()).toBe(4000);
    expect(result.netLongTerm.toNumber()).toBe(1500);
  });

  it("section 1256 gain flows through full federal pipeline and increases tax", () => {
    const withoutContracts = calculateFederalTax(makeFixture({}));
    const withContracts = calculateFederalTax(makeFixture({
      form6781: {
        section1256Gains: "20000",
        section1256Losses: "0",
      },
    }));

    // $20K gain should increase AGI and tax
    expect(withContracts.agi.toNumber()).toBe(withoutContracts.agi.toNumber() + 20000);
    expect(withContracts.totalTax.greaterThan(withoutContracts.totalTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 6252 — Installment Sale Income → Schedule D
// ═══════════════════════════════════════════════════════════

describe("Schedule D - Form 6252 installment sale integration", () => {
  it("long-term installment sale capital gain flows to Schedule D Line 15", () => {
    const result = calculateScheduleD(makeFixture({
      form6252: [{
        description: "Rental property",
        propertyType: "other",
        gainCharacter: "long_term_capital",
        isYearOfSale: true,
        sellingPrice: "100000",
        assumedLiabilities: "0",
        costBasis: "60000",
        depreciation: "0",
        sellingExpenses: "0",
        depreciationRecapture: "0",
        paymentsReceived: "25000",
        priorYearPayments: "0",
        section121Exclusion: "0",
      }],
    }), "single", c);

    // Gross profit = $100K - $60K = $40K
    // GP% = $40K / $100K = 40%
    // Payment $25K × 40% = $10K capital gain
    expect(result.netLongTerm.toNumber()).toBe(10000);
    expect(result.netShortTerm.toNumber()).toBe(0);
  });

  it("short-term installment sale capital gain flows to Schedule D Line 7", () => {
    const result = calculateScheduleD(makeFixture({
      form6252: [{
        description: "Day-trade property",
        propertyType: "other",
        gainCharacter: "short_term_capital",
        isYearOfSale: true,
        sellingPrice: "50000",
        assumedLiabilities: "0",
        costBasis: "30000",
        depreciation: "0",
        sellingExpenses: "0",
        depreciationRecapture: "0",
        paymentsReceived: "10000",
        priorYearPayments: "0",
        section121Exclusion: "0",
      }],
    }), "single", c);

    // Gross profit = $50K - $30K = $20K
    // GP% = $20K / $50K = 40%
    // Payment $10K × 40% = $4K short-term
    expect(result.netShortTerm.toNumber()).toBe(4000);
    expect(result.netLongTerm.toNumber()).toBe(0);
  });

  it("multiple installment sales aggregate correctly on Schedule D", () => {
    const result = calculateScheduleD(makeFixture({
      form6252: [
        {
          description: "Property A",
          propertyType: "other",
          gainCharacter: "long_term_capital",
          isYearOfSale: true,
          sellingPrice: "80000",
          assumedLiabilities: "0",
          costBasis: "40000",
          depreciation: "0",
          sellingExpenses: "0",
          depreciationRecapture: "0",
          paymentsReceived: "20000",
          priorYearPayments: "0",
          section121Exclusion: "0",
        },
        {
          description: "Property B",
          propertyType: "other",
          gainCharacter: "short_term_capital",
          isYearOfSale: true,
          sellingPrice: "40000",
          assumedLiabilities: "0",
          costBasis: "20000",
          depreciation: "0",
          sellingExpenses: "0",
          depreciationRecapture: "0",
          paymentsReceived: "10000",
          priorYearPayments: "0",
          section121Exclusion: "0",
        },
      ],
    }), "single", c);

    // Property A: GP% = 50%, $20K × 50% = $10K LT
    // Property B: GP% = 50%, $10K × 50% = $5K ST
    expect(result.netLongTerm.toNumber()).toBe(10000);
    expect(result.netShortTerm.toNumber()).toBe(5000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(15000);
  });

  it("installment sale gain combines with 1099-B gains and losses", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Schwab",
        transactions: [{
          description: "SPY",
          dateAcquired: "2020-01-01",
          dateSold: "2025-06-01",
          proceeds: "10000",
          costBasis: "18000",
          adjustments: "0",
          basisReportedToIRS: true,
          holdingPeriod: "long" as const,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
      form6252: [{
        description: "Investment property",
        propertyType: "other",
        gainCharacter: "long_term_capital",
        isYearOfSale: true,
        sellingPrice: "200000",
        assumedLiabilities: "0",
        costBasis: "120000",
        depreciation: "0",
        sellingExpenses: "0",
        depreciationRecapture: "0",
        paymentsReceived: "50000",
        priorYearPayments: "0",
        section121Exclusion: "0",
      }],
    }), "single", c);

    // 1099-B: $10K - $18K = -$8K LT loss
    // Form 6252: GP% = 40%, $50K × 40% = $20K LT gain
    // Net LT = $20K - $8K = $12K
    expect(result.netLongTerm.toNumber()).toBe(12000);
  });

  it("installment sale income flows through full federal pipeline", () => {
    const withoutInstallment = calculateFederalTax(makeFixture({}));
    const withInstallment = calculateFederalTax(makeFixture({
      form6252: [{
        description: "Land sale",
        propertyType: "other",
        gainCharacter: "long_term_capital",
        isYearOfSale: true,
        sellingPrice: "100000",
        assumedLiabilities: "0",
        costBasis: "50000",
        depreciation: "0",
        sellingExpenses: "0",
        depreciationRecapture: "0",
        paymentsReceived: "30000",
        priorYearPayments: "0",
        section121Exclusion: "0",
      }],
    }));

    // GP% = 50%, $30K × 50% = $15K gain added to AGI
    expect(withInstallment.agi.toNumber()).toBe(withoutInstallment.agi.toNumber() + 15000);
    expect(withInstallment.totalTax.greaterThan(withoutInstallment.totalTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Home Sale Exclusion (IRC §121) → Schedule D
// ═══════════════════════════════════════════════════════════

describe("Schedule D - home sale exclusion (IRC §121) integration", () => {
  it("home sale gain fully excluded under §121 produces zero on Schedule D", () => {
    const result = calculateScheduleD(makeFixture({
      homeSales: [{
        salePrice: "400000",
        sellingExpenses: "25000",
        purchasePrice: "250000",
        improvements: "20000",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1460,     // 4 years
        daysUsedAsResidence: 1095, // 3 years
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    }), "single", c);

    // Gain = ($400K - $25K) - ($250K + $20K) = $375K - $270K = $105K
    // Exclusion = min($105K, $250K) = $105K → taxable = $0
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.homeSales).toBeDefined();
    expect(result.homeSales!.totalTaxableGain.toNumber()).toBe(0);
  });

  it("home sale gain exceeding $250K exclusion produces taxable long-term gain", () => {
    const result = calculateScheduleD(makeFixture({
      homeSales: [{
        salePrice: "800000",
        sellingExpenses: "50000",
        purchasePrice: "300000",
        improvements: "50000",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1460,
        daysUsedAsResidence: 1095,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    }), "single", c);

    // Gain = ($800K - $50K) - ($300K + $50K) = $750K - $350K = $400K
    // Exclusion = $250K → taxable = $150K
    expect(result.netLongTerm.toNumber()).toBe(150000);
    expect(result.homeSales!.totalTaxableGain.toNumber()).toBe(150000);
  });

  it("MFJ home sale uses $500K exclusion when both spouses qualify", () => {
    const mfjFixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1988-05-20",
        },
      },
      form1099B: [],
      form1099Div: [],
      scheduleK1: [],
      homeSales: [{
        salePrice: "1000000",
        sellingExpenses: "60000",
        purchasePrice: "350000",
        improvements: "40000",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1825,
        daysUsedAsResidence: 1460,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: true,
        atLeastOneSpouseMeetsOwnershipTest: true,
      }],
    };

    const result = calculateScheduleD(mfjFixture, "married_filing_jointly", c);

    // Gain = ($1M - $60K) - ($350K + $40K) = $940K - $390K = $550K
    // MFJ exclusion = $500K → taxable = $50K
    expect(result.netLongTerm.toNumber()).toBe(50000);
    expect(result.homeSales!.totalTaxableGain.toNumber()).toBe(50000);
  });

  it("home sale with depreciation recapture reports taxable gain even when under exclusion", () => {
    const result = calculateScheduleD(makeFixture({
      homeSales: [{
        salePrice: "350000",
        sellingExpenses: "20000",
        purchasePrice: "250000",
        improvements: "10000",
        depreciationAfterMay1997: "15000", // Home office depreciation
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1460,
        daysUsedAsResidence: 1095,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    }), "single", c);

    // Adjusted basis = $250K + $10K - $15K = $245K
    // Gain = ($350K - $20K) - $245K = $330K - $245K = $85K
    // Depreciation recapture = $15K (not excludable)
    // Excludable = min($85K - $15K, $250K) = $70K
    // Taxable = $85K - $70K = $15K (the depreciation recapture)
    expect(result.netLongTerm.toNumber()).toBe(15000);
    expect(result.homeSales!.totalTaxableGain.toNumber()).toBe(15000);
    expect(result.homeSales!.sales[0].depreciationRecapture.toNumber()).toBe(15000);
  });

  it("home sale loss on personal-use property is not deductible", () => {
    const result = calculateScheduleD(makeFixture({
      homeSales: [{
        salePrice: "200000",
        sellingExpenses: "15000",
        purchasePrice: "300000",
        improvements: "10000",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1460,
        daysUsedAsResidence: 1095,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    }), "single", c);

    // Loss = ($200K - $15K) - ($300K + $10K) = $185K - $310K = -$125K
    // Personal-use loss is NOT deductible → $0 on Schedule D
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.homeSales!.totalTaxableGain.toNumber()).toBe(0);
  });

  it("home sale taxable gain flows through full federal pipeline and increases tax", () => {
    const withoutSale = calculateFederalTax(makeFixture({}));
    const withSale = calculateFederalTax(makeFixture({
      homeSales: [{
        salePrice: "900000",
        sellingExpenses: "50000",
        purchasePrice: "300000",
        improvements: "50000",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1825,
        daysUsedAsResidence: 1460,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    }));

    // Gain = $850K - $350K = $500K, exclusion = $250K, taxable = $250K
    expect(withSale.agi.toNumber()).toBe(withoutSale.agi.toNumber() + 250000);
    expect(withSale.totalTax.greaterThan(withoutSale.totalTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Combined: Multiple new forms flowing through Schedule D
// ═══════════════════════════════════════════════════════════

describe("Schedule D - combined Form 6781 + Form 6252 + home sale integration", () => {
  it("all three form types aggregate correctly on Schedule D", () => {
    const result = calculateScheduleD(makeFixture({
      form6781: {
        section1256Gains: "10000",
        section1256Losses: "0",
      },
      form6252: [{
        description: "Land",
        propertyType: "other",
        gainCharacter: "long_term_capital",
        isYearOfSale: true,
        sellingPrice: "100000",
        assumedLiabilities: "0",
        costBasis: "50000",
        depreciation: "0",
        sellingExpenses: "0",
        depreciationRecapture: "0",
        paymentsReceived: "20000",
        priorYearPayments: "0",
        section121Exclusion: "0",
      }],
      homeSales: [{
        salePrice: "600000",
        sellingExpenses: "35000",
        purchasePrice: "250000",
        improvements: "15000",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1460,
        daysUsedAsResidence: 1095,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    }), "single", c);

    // Form 6781: $10K → $4K ST + $6K LT
    // Form 6252: GP% = 50%, $20K × 50% = $10K LT
    // Home sale: gain = ($600K - $35K) - ($250K + $15K) = $565K - $265K = $300K
    //   Exclusion = $250K → taxable = $50K LT
    // Total ST = $4K, Total LT = $6K + $10K + $50K = $66K
    expect(result.netShortTerm.toNumber()).toBe(4000);
    expect(result.netLongTerm.toNumber()).toBe(66000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(70000);
  });

  it("combined forms with 1099-B losses still apply $3K loss cap", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "Growth Fund",
          dateAcquired: "2023-01-01",
          dateSold: "2025-06-01",
          proceeds: "5000",
          costBasis: "30000",
          adjustments: "0",
          basisReportedToIRS: true,
          holdingPeriod: "long" as const,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
      form6781: {
        section1256Gains: "2000",
        section1256Losses: "8000",
      },
      form6252: [{
        description: "Small lot",
        propertyType: "other",
        gainCharacter: "long_term_capital",
        isYearOfSale: true,
        sellingPrice: "20000",
        assumedLiabilities: "0",
        costBasis: "15000",
        depreciation: "0",
        sellingExpenses: "0",
        depreciationRecapture: "0",
        paymentsReceived: "5000",
        priorYearPayments: "0",
        section121Exclusion: "0",
      }],
    }), "single", c);

    // 1099-B: -$25K LT loss
    // Form 6781: net -$6K → -$2,400 ST + -$3,600 LT
    // Form 6252: GP% = 25%, $5K × 25% = $1,250 LT
    // Net ST = -$2,400
    // Net LT = -$25K - $3,600 + $1,250 = -$27,350
    // Total = -$29,750
    expect(result.netShortTerm.toNumber()).toBe(-2400);
    expect(result.netLongTerm.toNumber()).toBe(-27350);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
  });

  it("all three form types flow through the full federal pipeline correctly", () => {
    const baseline = calculateFederalTax(makeFixture({}));

    const combined = calculateFederalTax(makeFixture({
      form6781: {
        section1256Gains: "15000",
        section1256Losses: "0",
      },
      form6252: [{
        description: "Investment land",
        propertyType: "other",
        gainCharacter: "long_term_capital",
        isYearOfSale: true,
        sellingPrice: "200000",
        assumedLiabilities: "0",
        costBasis: "100000",
        depreciation: "0",
        sellingExpenses: "0",
        depreciationRecapture: "0",
        paymentsReceived: "40000",
        priorYearPayments: "0",
        section121Exclusion: "0",
      }],
      homeSales: [{
        salePrice: "500000",
        sellingExpenses: "30000",
        purchasePrice: "200000",
        improvements: "20000",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1460,
        daysUsedAsResidence: 1095,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    }));

    // Form 6781: $15K gain
    // Form 6252: GP% = 50%, $40K × 50% = $20K gain
    // Home sale: gain = ($500K - $30K) - ($200K + $20K) = $470K - $220K = $250K
    //   Exclusion = $250K → taxable = $0
    // Total capital gain = $15K + $20K + $0 = $35K added to AGI
    expect(combined.agi.toNumber()).toBe(baseline.agi.toNumber() + 35000);
    expect(combined.totalTax.greaterThan(baseline.totalTax)).toBe(true);
  });

  it("audit trail records all three form contributions to Schedule D", () => {
    const result = calculateFederalTax(makeFixture({
      form6781: {
        section1256Gains: "5000",
        section1256Losses: "0",
      },
      form6252: [{
        description: "Lot sale",
        propertyType: "other",
        gainCharacter: "long_term_capital",
        isYearOfSale: true,
        sellingPrice: "50000",
        assumedLiabilities: "0",
        costBasis: "30000",
        depreciation: "0",
        sellingExpenses: "0",
        depreciationRecapture: "0",
        paymentsReceived: "10000",
        priorYearPayments: "0",
        section121Exclusion: "0",
      }],
      homeSales: [{
        salePrice: "350000",
        sellingExpenses: "20000",
        purchasePrice: "200000",
        improvements: "10000",
        depreciationAfterMay1997: "0",
        casualtyLossDeductions: "0",
        otherBasisAdjustments: "0",
        daysOwned: 1460,
        daysUsedAsResidence: 1095,
        usedExclusionInPrior2Years: false,
        qualifiesForReducedExclusion: false,
        bothSpousesMeetUseTest: false,
        atLeastOneSpouseMeetsOwnershipTest: false,
      }],
    }));

    // Verify audit trail has entries from all three form types
    const form6781Lines = result.allLines.filter(l => l.form === "Form 6781");
    const form6252Lines = result.allLines.filter(l => l.form === "Form 6252");
    const homeSaleLines = result.allLines.filter(l => l.form === "Home Sale");
    const schedDLines = result.allLines.filter(l => l.form === "Sched D");

    expect(form6781Lines.length).toBeGreaterThan(0);
    expect(form6252Lines.length).toBeGreaterThan(0);
    expect(homeSaleLines.length).toBeGreaterThan(0);
    expect(schedDLines.length).toBeGreaterThan(0);

    // Schedule D Line 7 audit should mention Form 6781 short-term
    const line7 = schedDLines.find(l => l.line === "7");
    expect(line7).toBeDefined();
    expect(line7!.inputs?.["Form 6781 short-term"]).toBeDefined();

    // Schedule D Line 15 audit should mention home sale and Form 6252
    const line15 = schedDLines.find(l => l.line === "15");
    expect(line15).toBeDefined();
    expect(line15!.inputs?.["Home sale taxable gain (IRC §121)"]).toBeDefined();
    expect(line15!.inputs?.["Form 6252 long-term"]).toBeDefined();
    expect(line15!.inputs?.["Form 6781 long-term"]).toBeDefined();
  });
});
