/**
 * Edge case tests for phase-out thresholds.
 * Tests behavior exactly at, just above, and just below key thresholds.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { getConstants } from "@/models/constants.js";
import {
  calculateNIIT,
  calculateAdditionalMedicareTax,
  calculateChildTaxCredit,
  calculateSelfEmploymentTax,
  calculateDeductibleMortgageInterest,
  calculateCapitalGainsTax,
} from "@/utils/tax-math.js";
import { calculateForm8863 } from "@/engine/forms/form-8863.js";
import { calculateForm8995 } from "@/engine/forms/form-8995.js";
import { calculateForm8812 } from "@/engine/forms/form-8812.js";
import { calculateForm8815 } from "@/engine/forms/form-8815.js";
import { calculateForm2441 } from "@/engine/forms/form-2441.js";
import { calculateForm6251 } from "@/engine/forms/form-6251.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

// ═══════════════════════════════════════════════════════════
// CTC Phase-Out
// ═══════════════════════════════════════════════════════════

describe("CTC phase-out threshold", () => {
  it("full credit at exactly $200K single", () => {
    const credit = calculateChildTaxCredit(2, 0, d(200000), "single", c);
    // 2025 worksheet: child credit 4400 + ODC 0 = 4400.
    // 2025 worksheet: child credit 4400 + ODC 0 = 4400.
    expect(credit.total.toNumber()).toBe(4400); // 2 × $2,000
  });

  it("$1 over threshold reduces by $50", () => {

    const credit = calculateChildTaxCredit(2, 0, d(200001), "single", c);
    // 2025 worksheet: child credit 4350 + ODC 0 = 4350.
    // 2025 worksheet: child credit 4350 + ODC 0 = 4350.
    expect(credit.total.toNumber()).toBe(4350);
  });

  it("$1,000 over threshold reduces by $50", () => {
    const credit = calculateChildTaxCredit(2, 0, d(201000), "single", c);
    // 2025 worksheet: child credit 4350 + ODC 0 = 4350.
    // 2025 worksheet: child credit 4350 + ODC 0 = 4350.
    expect(credit.total.toNumber()).toBe(4350);
  });

  it("$1,001 over threshold reduces by $100", () => {
    const credit = calculateChildTaxCredit(2, 0, d(201001), "single", c);
    // 2025 worksheet: child credit 4300 + ODC 0 = 4300.
    // 2025 worksheet: child credit 4300 + ODC 0 = 4300.
    expect(credit.total.toNumber()).toBe(4300);
  });

  it("MFJ full credit at $400K", () => {
    const credit = calculateChildTaxCredit(3, 0, d(400000), "married_filing_jointly", c);
    // 2025 worksheet: child credit 6600 + ODC 0 = 6600.
    // 2025 worksheet: child credit 6600 + ODC 0 = 6600.
    expect(credit.total.toNumber()).toBe(6600);
  });

  it("MFJ $1 over $400K reduces by $50", () => {
    const credit = calculateChildTaxCredit(3, 0, d(400001), "married_filing_jointly", c);
    // 2025 worksheet: child credit 6550 + ODC 0 = 6550.
    // 2025 worksheet: child credit 6550 + ODC 0 = 6550.
    expect(credit.total.toNumber()).toBe(6550);
  });

  it("CTC cannot go negative", () => {
    const credit = calculateChildTaxCredit(1, 0, d(500000), "single", c);
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    expect(credit.total.toNumber()).toBe(0);
  });

  it("zero children means zero credit regardless of income", () => {
    const credit = calculateChildTaxCredit(0, 0, d(50000), "single", c);
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    expect(credit.total.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════

describe("NIIT threshold boundary", () => {
  it("no NIIT at exactly $200K MAGI single", () => {
    const niit = calculateNIIT(d(50000), d(200000), "single", c);
    expect(niit.toNumber()).toBe(0);
  });

  it("NIIT on $1 excess at $200,001", () => {
    const niit = calculateNIIT(d(50000), d(200001), "single", c);
    // Excess = $1. NIIT = min($50K, $1) × 3.8% = $0.038 → $0
    expect(niit.toNumber()).toBe(0); // Rounds to $0
  });

  it("NIIT on $1,000 excess", () => {
    const niit = calculateNIIT(d(50000), d(201000), "single", c);
    // Excess = $1,000. NIIT = min($50K, $1K) × 3.8% = $38
    expect(niit.toNumber()).toBe(38);
  });

  it("NIIT limited to investment income when less than excess", () => {
    // MAGI = $500K, excess = $300K, but only $10K investment income
    const niit = calculateNIIT(d(10000), d(500000), "single", c);
    expect(niit.toNumber()).toBe(380); // $10K × 3.8%
  });

  it("no NIIT with zero investment income", () => {
    const niit = calculateNIIT(d(0), d(500000), "single", c);
    expect(niit.toNumber()).toBe(0);
  });

  it("MFJ threshold at $250K", () => {
    const niit = calculateNIIT(d(50000), d(250000), "married_filing_jointly", c);
    expect(niit.toNumber()).toBe(0);
    const niitOver = calculateNIIT(d(50000), d(260000), "married_filing_jointly", c);
    expect(niitOver.toNumber()).toBe(380); // min(50K, 10K) × 3.8% = $380
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Medicare Tax Threshold
// ═══════════════════════════════════════════════════════════

describe("Additional Medicare Tax threshold", () => {
  it("no additional tax at exactly $200K single", () => {
    const amt = calculateAdditionalMedicareTax(d(200000), d(0), "single", c);
    expect(amt.toNumber()).toBe(0);
  });

  it("$1 tax on $200,001", () => {
    // $1 × 0.9% = $0.009 → rounds to $0
    const amt = calculateAdditionalMedicareTax(d(200001), d(0), "single", c);
    expect(amt.toNumber()).toBe(0);
  });

  it("tax on $10K over threshold", () => {
    // $10K × 0.9% = $90
    const amt = calculateAdditionalMedicareTax(d(210000), d(0), "single", c);
    expect(amt.toNumber()).toBe(90);
  });

  it("combines wages and SE earnings", () => {
    // $150K wages + $60K SE = $210K total. Excess = $10K
    const amt = calculateAdditionalMedicareTax(d(150000), d(60000), "single", c);
    expect(amt.toNumber()).toBe(90);
  });
});

// ═══════════════════════════════════════════════════════════
// SE Tax — Wage Base Boundary
// ═══════════════════════════════════════════════════════════

describe("SE tax wage base boundary", () => {
  it("full SS tax when W-2 wages exactly at wage base", () => {
    // W-2 wages = $176,100 → SS room = $0 from SE
    const result = calculateSelfEmploymentTax(d(50000), d(176100), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
    // Medicare still applies: $50K × 0.9235 × 2.9% ≈ $1,339
    expect(result.medicarePortion.toNumber()).toBe(1339);
  });

  it("partial SS room when W-2 below wage base", () => {
    // W-2 = $170K → room = $6,100. SE = $50K → taxable SE = $46,175
    // SS portion = min($46,175, $6,100) × 12.4% = $756
    const result = calculateSelfEmploymentTax(d(50000), d(170000), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(756);
  });

  it("zero SE earnings produces zero tax", () => {
    const result = calculateSelfEmploymentTax(d(0), d(85000), c);
    expect(result.tax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });

  it("negative SE earnings produces zero tax", () => {
    const result = calculateSelfEmploymentTax(d(-5000), d(85000), c);
    expect(result.tax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Mortgage Interest — Debt Limit
// ═══════════════════════════════════════════════════════════

describe("Mortgage interest debt limit boundary", () => {
  it("full deduction at exactly $750K principal", () => {
    const deduction = calculateDeductibleMortgageInterest(d(30000), d(750000), c);
    expect(deduction.toNumber()).toBe(30000);
  });

  it("prorated at $1M principal", () => {
    // $750K / $1M = 75%. $30K × 75% = $22,500
    const deduction = calculateDeductibleMortgageInterest(d(30000), d(1000000), c);
    expect(deduction.toNumber()).toBe(22500);
  });

  it("full deduction at $500K principal", () => {
    const deduction = calculateDeductibleMortgageInterest(d(20000), d(500000), c);
    expect(deduction.toNumber()).toBe(20000);
  });

  it("zero interest means zero deduction", () => {
    const deduction = calculateDeductibleMortgageInterest(d(0), d(500000), c);
    expect(deduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Gains Rate Stacking Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Capital gains rate stacking edges", () => {
  it("all gains at 0% when income below threshold", () => {
    const result = calculateCapitalGainsTax(
      d(30000), d(10000), d(10000), "single", c
    );
    // Ordinary = $30K - $20K = $10K. Stack base = $10K.
    // 0% threshold = $48,350. Room at 0% = $38,350 > $20K
    expect(result.preferentialTax.toNumber()).toBe(0);
  });

  it("20% rate applies above 15% threshold", () => {
    // Single: 15% threshold = $533,400
    // $600K LTCG only (no ordinary): stack from $0.
    // $48,350 at 0%, $533,400 - $48,350 = $485,050 at 15%, rest at 20%
    const result = calculateCapitalGainsTax(
      d(600000), d(0), d(600000), "single", c
    );
    // 0%: $48,350 → $0
    // 15%: $485,050 → $72,758
    // 20%: $66,600 → $13,320
    // Total preferential ≈ $86,078
    expect(result.preferentialTax.toNumber()).toBe(86078);
    expect(result.ordinaryTax.toNumber()).toBe(0);
  });

  it("zero capital gains means only ordinary tax", () => {
    const result = calculateCapitalGainsTax(
      d(100000), d(0), d(0), "single", c
    );
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.ordinaryTax.greaterThan(new Decimal(0))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// CTC Phase-Out — ODC and Form 8812 ACTC Boundaries
// ═══════════════════════════════════════════════════════════

describe("CTC phase-out with ODC and ACTC (Form 8812)", () => {
  it("phase-out reduces CTC first before ODC", () => {



    const credit = calculateChildTaxCredit(1, 1, d(244000), "single", c);
    expect(credit.ctc.toNumber()).toBe(0);
    expect(credit.odc.toNumber()).toBe(500);
    // 2025 worksheet: child credit 0 + ODC 500 = 500.
    // 2025 worksheet: child credit 0 + ODC 500 = 500.
    expect(credit.total.toNumber()).toBe(500);
  });

  it("phase-out eliminates both CTC and ODC at high income", () => {

    const credit = calculateChildTaxCredit(1, 1, d(260000), "single", c);
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    expect(credit.total.toNumber()).toBe(0);
    expect(credit.ctc.toNumber()).toBe(0);
    expect(credit.odc.toNumber()).toBe(0);
  });

  it("ACTC refundable portion when tax liability is zero", () => {
    // 2 children, AGI below threshold, zero tax liability → all CTC is unused
    // Earned income = $30K → excess over $2,500 = $27,500 → 15% = $4,125
    // Max CTC = $4,000, nonrefundable = min($4,000, $0) = $0, unused = $4,000
    // ACTC max per child = $1,700 × 2 = $3,400
    // ACTC = min($4,000 unused, $4,125 earned, $3,400 max) = $3,400
    const result = calculateForm8812({
      qualifyingChildren: 2,
      otherDependents: 0,
      agi: d(30000),
      earnedIncome: d(30000),
      taxLiability: d(0),
      filingStatus: "single",
    }, c);
    expect(result.nonrefundableCTC.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(3400);
  });
});

// ═══════════════════════════════════════════════════════════
// Education Credit Phase-Out (Form 8863)
// AOC: Single $80K-$90K, MFJ $160K-$180K
// ═══════════════════════════════════════════════════════════

describe("Education credit (AOTC) phase-out threshold", () => {
  const oneStudent = [{ name: "Student A", qualifiedExpenses: d(4000) }];
  // Max AOC per student: 100% of first $2K + 25% of next $2K = $2,500

  it("full AOC at exactly $80K single", () => {
    const result = calculateForm8863({
      aocStudents: oneStudent,
      llcExpenses: d(0),
      magi: d(80000),
      filingStatus: "single",
    });
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
  });

  it("AOC reduced at midpoint $85K single (50% factor)", () => {
    // Phase-out factor = 1 - ($85K - $80K) / ($90K - $80K) = 0.5
    // $2,500 × 0.5 = $1,250
    const result = calculateForm8863({
      aocStudents: oneStudent,
      llcExpenses: d(0),
      magi: d(85000),
      filingStatus: "single",
    });
    expect(result.aocAfterPhaseOut.toNumber()).toBe(1250);
    // 60% nonrefundable, 40% refundable
    expect(result.aocNonrefundable.toNumber()).toBe(750);
    expect(result.aocRefundable.toNumber()).toBe(500);
  });

  it("AOC fully phased out at exactly $90K single", () => {
    const result = calculateForm8863({
      aocStudents: oneStudent,
      llcExpenses: d(0),
      magi: d(90000),
      filingStatus: "single",
    });
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.aocRefundable.toNumber()).toBe(0);
  });

  it("MFJ full AOC at $160K, zero at $180K", () => {
    const full = calculateForm8863({
      aocStudents: oneStudent,
      llcExpenses: d(0),
      magi: d(160000),
      filingStatus: "married_filing_jointly",
    });
    expect(full.aocAfterPhaseOut.toNumber()).toBe(2500);

    const zero = calculateForm8863({
      aocStudents: oneStudent,
      llcExpenses: d(0),
      magi: d(180000),
      filingStatus: "married_filing_jointly",
    });
    expect(zero.aocAfterPhaseOut.toNumber()).toBe(0);
  });

  it("MFS gets zero education credit regardless of income", () => {
    const result = calculateForm8863({
      aocStudents: oneStudent,
      llcExpenses: d(5000),
      magi: d(50000),
      filingStatus: "married_filing_separately",
    });
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
    expect(result.totalNonrefundable.toNumber()).toBe(0);
    expect(result.totalRefundable.toNumber()).toBe(0);
  });

  it("LLC phase-out matches AOC phase-out (same factor)", () => {
    // Single $85K → 50% factor. LLC: 20% × $10K = $2,000 tentative × 0.5 = $1,000
    const result = calculateForm8863({
      aocStudents: [],
      llcExpenses: d(10000),
      magi: d(85000),
      filingStatus: "single",
    });
    expect(result.llcTentative.toNumber()).toBe(2000);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════
// QBI Deduction Threshold (Form 8995)
// Simplified: Single $197,300, MFJ $394,600 (2025)
// ═══════════════════════════════════════════════════════════

describe("QBI deduction (Form 8995) threshold boundary", () => {
  it("full QBI deduction when taxable income at threshold single ($197,300)", () => {
    // QBI = $100K → 20% = $20K. TI = $197,300 → income limit = 20% × $197,300 = $39,460
    // Deduction = min($20K, $39,460) = $20,000
    const result = calculateForm8995({
      qbiSources: [{ name: "Consulting", qbi: d(100000) }],
      taxableIncomeBeforeQBI: d(197300),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    });
    expect(result.qbiDeduction.toNumber()).toBe(20000);
  });

  it("QBI deduction limited by 20% of taxable income minus cap gains", () => {
    // TI = $50K, cap gains = $30K, qual div = $5K
    // Income base = max(0, $50K - $35K) = $15K → 20% = $3,000
    // QBI component = 20% × $80K = $16,000
    // Deduction = min($16K, $3K) = $3,000
    const result = calculateForm8995({
      qbiSources: [{ name: "Freelance", qbi: d(80000) }],
      taxableIncomeBeforeQBI: d(50000),
      netCapitalGain: d(30000),
      qualifiedDividends: d(5000),
    });
    expect(result.qbiComponent.toNumber()).toBe(16000);
    expect(result.incomeLimitation.toNumber()).toBe(3000);
    expect(result.qbiDeduction.toNumber()).toBe(3000);
  });

  it("QBI loss carryforward when total QBI is negative", () => {
    // Two businesses: +$20K and -$50K → total = -$30K
    // QBI component = $0 (negative total), carryforward = $30K
    const result = calculateForm8995({
      qbiSources: [
        { name: "Business A", qbi: d(20000) },
        { name: "Business B", qbi: d(-50000) },
      ],
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    });
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(30000);
  });

  it("prior year QBI loss reduces current year QBI", () => {
    // Current QBI = $50K, prior loss = $20K → net = $30K
    // 20% × $30K = $6,000
    const result = calculateForm8995({
      qbiSources: [{ name: "Business", qbi: d(50000) }],
      priorYearQBILoss: d(20000),
      taxableIncomeBeforeQBI: d(150000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    });
    expect(result.totalQBI.toNumber()).toBe(30000);
    expect(result.qbiComponent.toNumber()).toBe(6000);
    expect(result.qbiDeduction.toNumber()).toBe(6000);
  });

  it("QBI income limitation steps down proportionally as taxable income falls", () => {
    // At TI = $100K with $0 cap gains: income limit = 20% × $100K = $20K
    // QBI component = 20% × $150K = $30K → capped at $20K income limit
    const result = calculateForm8995({
      qbiSources: [{ name: "Consulting", qbi: d(150000) }],
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    });
    expect(result.qbiComponent.toNumber()).toBe(30000);
    expect(result.incomeLimitation.toNumber()).toBe(20000);
    expect(result.qbiDeduction.toNumber()).toBe(20000);
  });
});

// ═══════════════════════════════════════════════════════════
// Savings Bond Exclusion Phase-Out (Form 8815)
// Single: $100,800 – $115,800; MFJ: $154,800 – $184,800 (2025)
// ═══════════════════════════════════════════════════════════

describe("Savings bond exclusion (Form 8815) phase-out", () => {
  const oneRedemption = [{ proceeds: 10000, interest: 3000, qualifiedExpenses: 10000 }];
  // Expenses ($10K) ≥ proceeds ($10K) → expenseRatio = 1.0 → excludable = $3K before phase-out

  it("full exclusion when MAGI at exactly the single threshold ($99,500)", () => {
    const result = calculateForm8815(oneRedemption, d(99500), "single");
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(3000);
  });

  it("partial exclusion at single phase-out midpoint ($107,000)", () => {
    // Excess = $107,000 - $99,500 = $7,500. Range = $15,000.
    // Ratio = 7,500 / 15,000 = 0.5 → reduction = $3,000 × 0.5 = $1,500 → excludable = $1,500
    const result = calculateForm8815(oneRedemption, d(107000), "single");
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1500);
  });

  it("full exclusion eliminated at single phase-out end ($115,800)", () => {
    // Excess = $15,000 = range → ratio = 1.0 → reduction = $3,000 → excludable = $0
    const result = calculateForm8815(oneRedemption, d(115800), "single");
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("MFS filers receive zero exclusion regardless of income", () => {
    const result = calculateForm8815(oneRedemption, d(50000), "married_filing_separately");
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("MFJ full exclusion at threshold ($149,250), zero at end ($179,250)", () => {
    const full = calculateForm8815(oneRedemption, d(149250), "married_filing_jointly");
    expect(full.excludableSavingsBondInterest.toNumber()).toBe(3000);

    const zero = calculateForm8815(oneRedemption, d(179250), "married_filing_jointly");
    expect(zero.excludableSavingsBondInterest.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT Exemption Phase-Out (Form 6251)
// Single: $626,350 threshold, 25¢ per $1 reduction
// ═══════════════════════════════════════════════════════════

describe("AMT exemption phase-out (Form 6251)", () => {
  // Single base exemption = $88,100; phase-out starts at $626,350 AMTI
  // Phase-out fully exhausts exemption when reduction = $88,100
  // $88,100 / 0.25 = $352,400 over threshold → AMTI = $626,350 + $352,400 = $978,750

  it("full exemption at AMTI exactly at phase-out threshold ($626,350 single)", () => {
    const result = calculateForm6251(
      { taxableIncome: d(626350), saltDeduction: d(0), regularTax: d(0), filingStatus: "single", isItemizing: false },
      c
    );
    // Excess = $0 → reduction = $0 → exemption = $88,100
    expect(result.exemption.toNumber()).toBe(88100);
  });

  it("AMT exemption reduced by 25% of AMTI excess (single $4K over threshold)", () => {
    // Excess over $626,350 = $4,000. Reduction = $4,000 × 25% = $1,000.
    // Exemption = $88,100 - $1,000 = $87,100
    const result = calculateForm6251(
      { taxableIncome: d(630350), saltDeduction: d(0), regularTax: d(0), filingStatus: "single", isItemizing: false },
      c
    );
    expect(result.exemption.toNumber()).toBe(87100);
  });

  it("AMT exemption fully eliminated when AMTI exceeds phase-out range (single $978,750)", () => {
    // Reduction = ($978,750 - $626,350) × 25% = $352,400 × 0.25 = $88,100 = full exemption
    const result = calculateForm6251(
      { taxableIncome: d(978750), saltDeduction: d(0), regularTax: d(0), filingStatus: "single", isItemizing: false },
      c
    );
    expect(result.exemption.toNumber()).toBe(0);
  });

  it("MFJ phase-out threshold is $1,252,700 with $137,000 base exemption", () => {
    // At exactly MFJ threshold: no reduction
    const atThreshold = calculateForm6251(
      { taxableIncome: d(1252700), saltDeduction: d(0), regularTax: d(0), filingStatus: "married_filing_jointly", isItemizing: false },
      c
    );
    expect(atThreshold.exemption.toNumber()).toBe(137000);

    // $40K over threshold → reduction = $40,000 × 0.25 = $10,000 → exemption = $127,000
    const overThreshold = calculateForm6251(
      { taxableIncome: d(1292700), saltDeduction: d(0), regularTax: d(0), filingStatus: "married_filing_jointly", isItemizing: false },
      c
    );
    expect(overThreshold.exemption.toNumber()).toBe(127000);
  });
});

// ═══════════════════════════════════════════════════════════
// Dependent Care Credit Percentage Step-Down (Form 2441)
// 35% at ≤$15K AGI, steps down 1% per $2K or fraction thereof, floor 20% above $43K
// ═══════════════════════════════════════════════════════════

describe("Dependent care credit (Form 2441) percentage step-down", () => {
  // One qualifying child: max $3,000 in expenses

  it("35% rate applies when AGI is at or below $15,000", () => {
    const result = calculateForm2441({
      careExpenses: d(3000),
      qualifyingIndividuals: 1,
      earnedIncome: d(15000),
      agi: d(15000),
    });
    expect(result.creditPercentage.toNumber()).toBe(0.35);
    expect(result.credit.toNumber()).toBe(1050); // $3,000 × 35%
  });

  it("percentage drops by 1% per $2K increment above $15K (AGI $17K → 34%)", () => {
    // AGI $17,000: excess = $2,000, steps = 1 → 34%
    const result = calculateForm2441({
      careExpenses: d(3000),
      qualifyingIndividuals: 1,
      earnedIncome: d(17000),
      agi: d(17000),
    });
    expect(result.creditPercentage.toNumber()).toBe(0.34);
    expect(result.credit.toNumber()).toBe(1020); // $3,000 × 34%
  });

  it("floor of 20% begins at AGI $43,001", () => {
    const result = calculateForm2441({
      careExpenses: d(3000),
      qualifyingIndividuals: 1,
      earnedIncome: d(43001),
      agi: d(43001),
    });
    expect(result.creditPercentage.toNumber()).toBe(0.20);
    expect(result.credit.toNumber()).toBe(600); // $3,000 × 20%
  });

  it("percentage does not fall below 20% floor at very high AGI", () => {
    const result = calculateForm2441({
      careExpenses: d(3000),
      qualifyingIndividuals: 1,
      earnedIncome: d(500000),
      agi: d(500000),
    });
    expect(result.creditPercentage.toNumber()).toBe(0.20);
  });

  it("two qualifying children doubles the expense cap to $6,000", () => {
    // $6,000 × 20% = $1,200 (at high AGI floor)
    const result = calculateForm2441({
      careExpenses: d(6000),
      qualifyingIndividuals: 2,
      earnedIncome: d(200000),
      agi: d(200000),
    });
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
    expect(result.creditPercentage.toNumber()).toBe(0.20);
    expect(result.credit.toNumber()).toBe(1200);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Phase-Outs Hitting Simultaneously at Moderate High Income
// AGI ≈ $230K single: CTC fully phased out, NIIT applies, AMT check
// ═══════════════════════════════════════════════════════════

describe("Multiple phase-outs at moderate high income ($230K single)", () => {
  const agi = d(230000);

  it("CTC fully phased out at $230K single (30 steps × $50 = $1,500 > $2,200 for 1 child)", () => {
    const credit = calculateChildTaxCredit(1, 0, agi, "single", c);
    expect(credit.total.toNumber()).toBe(700);
  });

  it("NIIT applies at $230K single with investment income", () => {
    // Excess over $200K = $30K. min($30K, $50K investment income) × 3.8% = $1,140
    const niit = calculateNIIT(d(50000), agi, "single", c);
    expect(niit.toNumber()).toBe(1140);
  });

  it("education credit fully phased out at $230K (above $90K single cutoff)", () => {
    const result = calculateForm8863({
      aocStudents: [{ name: "Student", qualifiedExpenses: d(4000) }],
      llcExpenses: d(0),
      magi: agi,
      filingStatus: "single",
    });
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.totalRefundable.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-Out Comparison: Single vs MFJ vs MFS — Same Income ($300K)
// Illustrates different thresholds and eligibility by filing status
// ═══════════════════════════════════════════════════════════

describe("CTC phase-out comparison at $300K across filing statuses", () => {
  // 2 qualifying children: max CTC = $4,000

  it("single at $300K: $300K - $200K = $100K over → 100 steps × $50 = $5,000 reduction → $0 CTC", () => {
    const credit = calculateChildTaxCredit(2, 0, d(300000), "single", c);
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    expect(credit.total.toNumber()).toBe(0);
  });

  it("MFJ at $300K: $300K - $400K = below threshold → full $4,000 CTC", () => {
    const credit = calculateChildTaxCredit(2, 0, d(300000), "married_filing_jointly", c);
    // 2025 worksheet: child credit 4400 + ODC 0 = 4400.
    // 2025 worksheet: child credit 4400 + ODC 0 = 4400.
    expect(credit.total.toNumber()).toBe(4400);
  });

  it("MFS at $300K: threshold same as single ($200K) → $100K over → $0 CTC", () => {
    const credit = calculateChildTaxCredit(2, 0, d(300000), "married_filing_separately", c);
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    expect(credit.total.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-Out at Exact Start and End Boundaries
// Testing boundary precision for multiple provisions
// ═══════════════════════════════════════════════════════════

describe("Phase-out exact boundary behavior", () => {
  it("CTC: $1 below threshold gives full credit, $1 above starts reduction", () => {
    const below = calculateChildTaxCredit(1, 0, d(199999), "single", c);
    // 2025 worksheet: child credit 2200 + ODC 0 = 2200.
    // 2025 worksheet: child credit 2200 + ODC 0 = 2200.
    expect(below.total.toNumber()).toBe(2200); // full credit

    const above = calculateChildTaxCredit(1, 0, d(200001), "single", c);
    // 2025 worksheet: child credit 2150 + ODC 0 = 2150.
    // 2025 worksheet: child credit 2150 + ODC 0 = 2150.
    expect(above.total.toNumber()).toBe(2150); // $50 reduction (rounds up 1 step)
  });

  it("NIIT: $1 below threshold produces zero tax, $1 above produces measurable tax at large investment income", () => {
    const below = calculateNIIT(d(100000), d(199999), "single", c);
    expect(below.toNumber()).toBe(0);

    // $1 over → excess = $1; min($100K investment, $1) × 3.8% = $0.038 → rounds to $0
    // Need larger overage: $1,000 over → $1,000 × 3.8% = $38
    const atThreshold = calculateNIIT(d(100000), d(201000), "single", c);
    expect(atThreshold.toNumber()).toBe(38);
  });

  it("savings bond exclusion: $1 below threshold gives full exclusion, $1 above starts reduction", () => {
    const redemptions = [{ proceeds: 5000, interest: 1500, qualifiedExpenses: 5000 }];
    // Full ratio → $1,500 excludable before phase-out

    const below = calculateForm8815(redemptions, d(99499), "single");
    expect(below.excludableSavingsBondInterest.toNumber()).toBe(1500);

    // $1,500 above $99,500: excess = $1,500, range = $15,000, ratio = 1500/15000 = 0.1
    // reduction = $1,500 × 0.1 = $150 → excludable = $1,350
    const over = calculateForm8815(redemptions, d(101000), "single");
    expect(over.excludableSavingsBondInterest.toNumber()).toBe(1350);
  });

  it("AMT exemption: $1 below phase-out threshold retains full exemption", () => {
    const result = calculateForm6251(
      { taxableIncome: d(609349), saltDeduction: d(0), regularTax: d(0), filingStatus: "single", isItemizing: false },
      c
    );
    // Excess = $0 (threshold is $626,350 so $609,349 < threshold → no reduction)
    expect(result.exemption.toNumber()).toBe(88100);
  });
});

// ═══════════════════════════════════════════════════════════
// Student Loan Interest MAGI Phase-Out (IRC §221(b)(2)(B), Rev. Proc. 2024-40 §2.30)
// 2025: Single/HoH/QSS $85K-$100K, MFJ $170K-$200K, MFS $0
// ═══════════════════════════════════════════════════════════

describe("Student loan interest MAGI phase-out", () => {
  /** Helper: create a single-filer return with specified wages and student loan interest */
  function makeSLIFixture(wages: string, sli: string, filingStatus: string = "single"): TaxYearInput {
    return {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: filingStatus as TaxYearInput["taxpayer"]["filingStatus"],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages,
        federalWithheld: "15000",
        socialSecurityWages: wages,
        socialSecurityWithheld: "0",
        medicareWages: wages,
        medicareWithheld: "0",
      }],
      adjustments: { studentLoanInterest: sli },
    };
  }

  it("Single at $84,999 MAGI — full $2,500 deduction (below threshold)", () => {
    const result = calculateFederalTax(makeSLIFixture("84999", "2500"));
    // MAGI = $84,999 < $85,000 threshold → no phase-out
    expect(result.adjustmentsToIncome.toNumber()).toBe(2500);
  });

  it("Single at $85,000 MAGI — full $2,500 deduction (at threshold start)", () => {
    const result = calculateFederalTax(makeSLIFixture("85000", "2500"));
    // MAGI = $85,000, excess = $0 → full deduction
    expect(result.adjustmentsToIncome.toNumber()).toBe(2500);
  });

  it("Single at $92,500 MAGI — 50% phase-out → $1,250 deduction", () => {
    const result = calculateFederalTax(makeSLIFixture("92500", "2500"));
    // MAGI = $92,500, excess = $7,500, ratio = 7500/15000 = 0.5
    // deduction = $2,500 × (1 - 0.5) = $1,250
    expect(result.adjustmentsToIncome.toNumber()).toBe(1250);
  });

  it("Single at $100,000 MAGI — fully phased out → $0 deduction", () => {
    const result = calculateFederalTax(makeSLIFixture("100000", "2500"));
    // MAGI = $100,000, excess = $15,000 = range → ratio = 1.0 → $0
    expect(result.adjustmentsToIncome.toNumber()).toBe(0);
  });

  it("Single at $120,000 MAGI — fully phased out (well above)", () => {
    const result = calculateFederalTax(makeSLIFixture("120000", "2500"));
    expect(result.adjustmentsToIncome.toNumber()).toBe(0);
  });

  it("MFJ at $170,000 MAGI — full deduction (at threshold start)", () => {
    const result = calculateFederalTax({
      ...makeSLIFixture("170000", "2500", "married_filing_jointly"),
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1988-06-15",
        },
      },
    });
    // MFJ threshold = $170K, excess = $0 → full deduction
    expect(result.adjustmentsToIncome.toNumber()).toBe(2500);
  });

  it("MFJ at $185,000 MAGI — 50% phase-out → $1,250", () => {
    const result = calculateFederalTax({
      ...makeSLIFixture("185000", "2500", "married_filing_jointly"),
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1988-06-15",
        },
      },
    });
    // MFJ: excess = $15K, range = $30K, ratio = 0.5 → $1,250
    expect(result.adjustmentsToIncome.toNumber()).toBe(1250);
  });

  it("MFJ at $200,000 MAGI — fully phased out", () => {
    const result = calculateFederalTax({
      ...makeSLIFixture("200000", "2500", "married_filing_jointly"),
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1988-06-15",
        },
      },
    });
    expect(result.adjustmentsToIncome.toNumber()).toBe(0);
  });

  it("QSS uses single threshold ($85K, not MFJ $170K)", () => {
    const result = calculateFederalTax(makeSLIFixture("100000", "2500", "qualifying_surviving_spouse"));
    // QSS at $100K: exceeds $85K threshold by $15K = full range → fully phased out
    // If incorrectly using MFJ threshold ($170K), $100K would be below it → full deduction
    expect(result.adjustmentsToIncome.toNumber()).toBe(0);
  });

  it("HoH uses single threshold ($85K)", () => {
    const result = calculateFederalTax(makeSLIFixture("92500", "2500", "head_of_household"));
    // HoH at $92,500: excess = $7,500, ratio = 0.5 → $1,250
    expect(result.adjustmentsToIncome.toNumber()).toBe(1250);
  });
});

// ═══════════════════════════════════════════════════════════
// Educator Expense Cap — IRS Schedule 1 Line 25
// Per IRS: $300 per educator ($600 combined MFJ if both educators)
// ═══════════════════════════════════════════════════════════

describe("Educator expense cap in federal pipeline", () => {
  const makeEducatorFixture = (
    wages: string,
    educatorExpenses: string,
    filingStatus: string = "single"
  ): TaxYearInput => ({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      filingStatus: filingStatus as TaxYearInput["taxpayer"]["filingStatus"],
      ...(filingStatus === "married_filing_jointly"
        ? {
            spouse: {
              firstName: "John",
              lastName: "Doe",
              ssn: "987-65-4321",
              dateOfBirth: "1990-02-20",
            },
          }
        : {}),
    },
    w2s: [
      {
        ...simpleW2Fixture.w2s[0],
        wages,
        federalWithheld: "10000",
        socialSecurityWages: wages,
        socialSecurityWithheld: "0",
        medicareWages: wages,
        medicareWithheld: "0",
      },
    ],
    adjustments: {
      ...simpleW2Fixture.adjustments,
      educatorExpenses,
    },
  });

  it("Single filer $500 educator expenses capped at $300 in AGI", () => {
    const result = calculateFederalTax(makeEducatorFixture("80000", "500"));
    // Per IRS Schedule 1 Line 25: max $300 for single filers
    // AGI = $80,000 - $300 = $79,700 (NOT $80,000 - $500 = $79,500)
    expect(result.agi.toNumber()).toBe(79700);
    expect(result.adjustmentsToIncome.toNumber()).toBe(300);
  });

  it("Single filer $200 educator expenses flows through uncapped", () => {
    const result = calculateFederalTax(makeEducatorFixture("80000", "200"));
    // Under $300 cap, full amount deducted
    expect(result.agi.toNumber()).toBe(79800);
    expect(result.adjustmentsToIncome.toNumber()).toBe(200);
  });

  it("Single filer exactly $300 educator expenses at cap boundary", () => {
    const result = calculateFederalTax(makeEducatorFixture("80000", "300"));
    expect(result.agi.toNumber()).toBe(79700);
    expect(result.adjustmentsToIncome.toNumber()).toBe(300);
  });

  it("MFJ filer $550 educator expenses under MFJ $600 cap (split inputs)", () => {
    const fixture = makeEducatorFixture("80000", "0", "married_filing_jointly");
    fixture.adjustments = {
      ...fixture.adjustments,
      educatorExpenses: undefined,
      primaryEducatorExpenses: "275",
      spouseEducatorExpenses: "275",
    };
    const result = calculateFederalTax(fixture);
    // MFJ cap is $300 per spouse; both under $300 → full $550 deducted
    expect(result.agi.toNumber()).toBe(79450);
    expect(result.adjustmentsToIncome.toNumber()).toBe(550);
  });

  it("MFJ filer $700 educator expenses capped at $600 (split inputs)", () => {
    const fixture = makeEducatorFixture("80000", "0", "married_filing_jointly");
    fixture.adjustments = {
      ...fixture.adjustments,
      educatorExpenses: undefined,
      primaryEducatorExpenses: "400",
      spouseEducatorExpenses: "400",
    };
    const result = calculateFederalTax(fixture);
    // Each spouse capped at $300 → only $600 deducted
    expect(result.agi.toNumber()).toBe(79400);
    expect(result.adjustmentsToIncome.toNumber()).toBe(600);
  });
});
