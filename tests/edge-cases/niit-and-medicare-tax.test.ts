/**
 * Edge case tests for Form 8960 (NIIT) and Form 8959 (Additional Medicare Tax).
 * Tests threshold boundaries, filing status variations, and combined scenarios.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8959 } from "@/engine/forms/form-8959.js";
import { calculateForm8960, type Form8960Input } from "@/engine/forms/form-8960.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
import { simpleW2Fixture, complexMFJFixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

// ═══════════════════════════════════════════════════════════
// NIIT (Form 8960) - Threshold Boundaries
// ═══════════════════════════════════════════════════════════

describe("NIIT - threshold boundary: single $200K", () => {
  const base: Form8960Input = {
    taxableInterest: d(5000),
    ordinaryDividends: d(5000),
    netCapitalGain: d(0),
    magi: d(0),
  };

  it("MAGI exactly at $200K: zero NIIT", () => {
    const result = calculateForm8960({ ...base, magi: d(200000) }, "single", c);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MAGI $1 over $200K: NIIT on $1", () => {
    const result = calculateForm8960({ ...base, magi: d(200001) }, "single", c);
    expect(result.magiExcess.toNumber()).toBe(1);
    // min(NII=$10K, excess=$1) × 3.8% = $0.04 → rounds to $0
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MAGI $1000 over with $500 NII: tax on $500", () => {
    const result = calculateForm8960(
      { ...base, taxableInterest: d(500), ordinaryDividends: d(0), magi: d(201000) },
      "single", c
    );
    // min(NII=$500, excess=$1000) = $500
    expect(result.taxableBase.toNumber()).toBe(500);
    expect(result.niitTax.toNumber()).toBe(19); // $500 × 3.8% = $19
  });
});

describe("NIIT - MFJ $250K threshold", () => {
  const base: Form8960Input = {
    taxableInterest: d(10000),
    ordinaryDividends: d(10000),
    netCapitalGain: d(0),
    magi: d(0),
  };

  it("MAGI at $250K: zero NIIT", () => {
    const result = calculateForm8960({ ...base, magi: d(250000) }, "married_filing_jointly", c);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MAGI $50K over: tax on lesser of NII or excess", () => {
    const result = calculateForm8960({ ...base, magi: d(300000) }, "married_filing_jointly", c);
    // min(NII=$20K, excess=$50K) = $20K × 3.8% = $760
    expect(result.taxableBase.toNumber()).toBe(20000);
    expect(result.niitTax.toNumber()).toBe(760);
  });
});

describe("NIIT - MFS $125K threshold", () => {
  it("MFS threshold is $125K (half of MFJ)", () => {
    const input: Form8960Input = {
      taxableInterest: d(3000),
      ordinaryDividends: d(2000),
      netCapitalGain: d(0),
      magi: d(126000),
    };
    const result = calculateForm8960(input, "married_filing_separately", c);
    // excess = $1K, NII = $5K → min = $1K × 3.8% = $38
    expect(result.taxableBase.toNumber()).toBe(1000);
    expect(result.niitTax.toNumber()).toBe(38);
  });
});

describe("NIIT - zero and negative scenarios", () => {
  it("no investment income: zero NIIT regardless of MAGI", () => {
    const input: Form8960Input = {
      taxableInterest: d(0),
      ordinaryDividends: d(0),
      netCapitalGain: d(0),
      magi: d(500000),
    };
    const result = calculateForm8960(input, "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("investment expenses reduce NII", () => {
    const input: Form8960Input = {
      taxableInterest: d(10000),
      ordinaryDividends: d(5000),
      netCapitalGain: d(0),
      investmentExpenses: d(12000),
      magi: d(300000),
    };
    const result = calculateForm8960(input, "single", c);
    // Gross NII = $15K - $12K expenses = $3K
    expect(result.netInvestmentIncome.toNumber()).toBe(3000);
  });

  it("expenses exceeding income: NII floored at zero", () => {
    const input: Form8960Input = {
      taxableInterest: d(5000),
      ordinaryDividends: d(0),
      netCapitalGain: d(0),
      investmentExpenses: d(10000),
      magi: d(300000),
    };
    const result = calculateForm8960(input, "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Medicare Tax (Form 8959)
// ═══════════════════════════════════════════════════════════

describe("Additional Medicare Tax - threshold boundaries", () => {
  it("single exactly at $200K: zero additional tax", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200000",
        medicareWages: "200000",
        medicareWithheld: "2900",
        federalWithheld: "35000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "single", c);
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("single $1 over $200K: 0.9% on $1", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200001",
        medicareWages: "200001",
        medicareWithheld: "2900.01",
        federalWithheld: "35000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "single", c);
    expect(result.excessOverThreshold.toNumber()).toBe(1);
    // $1 × 0.009 = $0.01 → rounds to $0
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("MFJ $250K threshold", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "260000",
        medicareWages: "260000",
        medicareWithheld: "3770",
        federalWithheld: "50000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "married_filing_jointly", c);
    // $260K - $250K = $10K excess × 0.9% = $90
    expect(result.excessOverThreshold.toNumber()).toBe(10000);
    expect(result.additionalMedicareTax.toNumber()).toBe(90);
  });

  it("MFS $125K threshold (half of MFJ)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "150000",
        medicareWages: "150000",
        medicareWithheld: "2175",
        federalWithheld: "25000",
        socialSecurityWages: "150000",
        socialSecurityWithheld: "9300",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "married_filing_separately", c);
    // $150K - $125K = $25K × 0.9% = $225
    expect(result.excessOverThreshold.toNumber()).toBe(25000);
    expect(result.additionalMedicareTax.toNumber()).toBe(225);
  });
});

describe("Additional Medicare Tax - W-2 + SE combined", () => {
  it("combined W-2 wages and SE earnings cross threshold", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "180000",
        medicareWages: "180000",
        medicareWithheld: "2610",
        federalWithheld: "30000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    // $180K wages + $30K SE = $210K → $10K over $200K
    const result = calculateForm8959(fixture, d(30000), "single", c);
    expect(result.totalEarnings.toNumber()).toBe(210000);
    expect(result.excessOverThreshold.toNumber()).toBe(10000);
    expect(result.additionalMedicareTax.toNumber()).toBe(90);
  });

  it("SE only, no W-2: threshold still applies", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [],
    };
    const result = calculateForm8959(fixture, d(220000), "single", c);
    // $220K SE - $200K = $20K × 0.9% = $180
    expect(result.medicareWages.toNumber()).toBe(0);
    expect(result.excessOverThreshold.toNumber()).toBe(20000);
    expect(result.additionalMedicareTax.toNumber()).toBe(180);
  });
});

describe("Additional Medicare Tax - withholding credit", () => {
  it("employer over-withholding creates credit", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "250000",
        medicareWages: "250000",
        // Employer withholds 0.9% additional on wages over $200K
        // Regular 1.45% × $250K = $3,625
        // Additional 0.9% × $50K = $450
        // Total withheld: $4,075
        medicareWithheld: "4075",
        federalWithheld: "50000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "single", c);
    // Withholding credit = $4,075 - ($250K × 1.45%) = $4,075 - $3,625 = $450
    expect(result.withholdingCredit.toNumber()).toBe(450);
  });

  it("no over-withholding: zero credit", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "100000",
        medicareWages: "100000",
        medicareWithheld: "1450", // Exactly 1.45%
        federalWithheld: "15000",
        socialSecurityWages: "100000",
        socialSecurityWithheld: "6200",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "single", c);
    expect(result.withholdingCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Combined NIIT + Additional Medicare Tax through Federal
// ═══════════════════════════════════════════════════════════

describe("NIIT + Additional Medicare Tax - federal pipeline", () => {
  it("high earner with investment income pays both taxes", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "300000",
        federalWithheld: "60000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "300000",
        medicareWithheld: "5250", // 1.45% × $300K + 0.9% × $100K
      }],
      form1099Div: [{
        payer: "Fund",
        ordinaryDividends: "20000",
        qualifiedDividends: "15000",
        totalCapitalGainDistributions: "5000",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        foreignCountry: "",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Additional Medicare: ($300K - $200K) × 0.9% = $900
    expect(federal.additionalMedicareTax.toNumber()).toBe(900);
    // NIIT: min(NII=$25K, MAGI excess over $200K) × 3.8%
    // AGI ≈ $320K, excess = $120K, NII = $25K → min = $25K × 3.8% = $950
    expect(federal.niitTax.greaterThan(0)).toBe(true);
  });

  it("under threshold: both taxes are zero", () => {
    const federal = calculateFederalTax(simpleW2Fixture);
    // $85K single → well under $200K
    expect(federal.additionalMedicareTax.toNumber()).toBe(0);
    expect(federal.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 1: NIIT + Additional Medicare Tax — both apply independently
// ═══════════════════════════════════════════════════════════

describe("NIIT + Additional Medicare Tax - both apply independently on same high-income taxpayer", () => {
  // Single filer: $280K wages + $40K investment income
  // Additional Medicare: ($280K - $200K) × 0.9% = $720
  // NIIT: MAGI ≈ $280K + $40K - std deduction, excess over $200K → NII=$40K is the floor
  //   taxable base = min($40K NII, $120K MAGI excess) = $40K × 3.8% = $1,520
  const niitInput: Form8960Input = {
    taxableInterest: d(20000),
    ordinaryDividends: d(20000),
    netCapitalGain: d(0),
    magi: d(320000), // wages $280K + investment $40K
  };

  it("Additional Medicare Tax: 0.9% on wages over $200K", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "280000",
        medicareWages: "280000",
        medicareWithheld: "4060", // 1.45% × $280K + 0.9% × $80K
        federalWithheld: "55000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "single", c);
    // $280K - $200K = $80K × 0.9% = $720
    expect(result.excessOverThreshold.toNumber()).toBe(80000);
    expect(result.additionalMedicareTax.toNumber()).toBe(720);
  });

  it("NIIT: 3.8% on NII when MAGI exceeds $200K", () => {
    const result = calculateForm8960(niitInput, "single", c);
    // min(NII=$40K, excess=$120K) = $40K × 3.8% = $1,520
    expect(result.taxableBase.toNumber()).toBe(40000);
    expect(result.niitTax.toNumber()).toBe(1520);
  });

  it("combined surtax on $40K investment income: $720 Medicare + $1520 NIIT = $2240", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "280000",
        medicareWages: "280000",
        medicareWithheld: "4060",
        federalWithheld: "55000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const medicareResult = calculateForm8959(fixture, d(0), "single", c);
    const niitResult = calculateForm8960(niitInput, "single", c);
    const combined = medicareResult.additionalMedicareTax.plus(niitResult.niitTax);
    expect(combined.toNumber()).toBe(2240);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 2: MFS — both $125K thresholds yield higher combined surtax
// ═══════════════════════════════════════════════════════════

describe("MFS filer - lower $125K thresholds for both NIIT and Additional Medicare Tax", () => {
  // MFS filer: $180K wages + $20K investment income, MAGI = $200K
  // Additional Medicare: ($180K wages - $125K threshold) × 0.9% = $55K × 0.9% = $495
  // NIIT: MAGI $200K excess over $125K = $75K; NII = $20K; min($20K, $75K) × 3.8% = $760

  it("Additional Medicare Tax at MFS $125K threshold: higher tax than single filer", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "180000",
        medicareWages: "180000",
        medicareWithheld: "2610",
        federalWithheld: "35000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "married_filing_separately", c);
    // $180K - $125K = $55K × 0.9% = $495
    expect(result.excessOverThreshold.toNumber()).toBe(55000);
    expect(result.additionalMedicareTax.toNumber()).toBe(495);
  });

  it("same wages as single: MFS produces higher Additional Medicare Tax", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "180000",
        medicareWages: "180000",
        medicareWithheld: "2610",
        federalWithheld: "35000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const mfsResult = calculateForm8959(fixture, d(0), "married_filing_separately", c);
    const singleResult = calculateForm8959(fixture, d(0), "single", c);
    // MFS: $55K excess vs single: zero excess (below $200K)
    expect(mfsResult.additionalMedicareTax.toNumber()).toBeGreaterThan(
      singleResult.additionalMedicareTax.toNumber()
    );
  });

  it("NIIT at MFS $125K threshold on $20K investment income", () => {
    const input: Form8960Input = {
      taxableInterest: d(10000),
      ordinaryDividends: d(10000),
      netCapitalGain: d(0),
      magi: d(200000),
    };
    const result = calculateForm8960(input, "married_filing_separately", c);
    // excess = $200K - $125K = $75K; NII = $20K; min = $20K × 3.8% = $760
    expect(result.magiExcess.toNumber()).toBe(75000);
    expect(result.taxableBase.toNumber()).toBe(20000);
    expect(result.niitTax.toNumber()).toBe(760);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 3: Self-employment income — Additional Medicare Tax applies, NIIT does not
// ═══════════════════════════════════════════════════════════

describe("SE income - Additional Medicare Tax applies but NIIT does not", () => {
  // SE income is earned income, not investment income for NIIT purposes.
  // A self-employed person with $250K SE income and zero investment income:
  // - Pays Additional Medicare Tax on excess over threshold
  // - Owes zero NIIT (no net investment income)

  it("Additional Medicare Tax applies on SE earnings over $200K single threshold", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [], // no W-2 income
    };
    const result = calculateForm8959(fixture, d(250000), "single", c);
    // $250K SE - $200K = $50K × 0.9% = $450
    expect(result.selfEmploymentEarnings.toNumber()).toBe(250000);
    expect(result.excessOverThreshold.toNumber()).toBe(50000);
    expect(result.additionalMedicareTax.toNumber()).toBe(450);
  });

  it("NIIT is zero when all income is SE (no investment income)", () => {
    // SE income is not net investment income — it's earned, active income
    const input: Form8960Input = {
      taxableInterest: d(0),
      ordinaryDividends: d(0),
      netCapitalGain: d(0),
      // otherInvestmentIncome omitted — SE income does not flow here
      magi: d(250000),
    };
    const result = calculateForm8960(input, "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("SE filer pays Additional Medicare but zero NIIT: surtaxes are distinct", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [],
    };
    const medicareResult = calculateForm8959(fixture, d(250000), "single", c);
    const niitInput: Form8960Input = {
      taxableInterest: d(0),
      ordinaryDividends: d(0),
      netCapitalGain: d(0),
      magi: d(250000),
    };
    const niitResult = calculateForm8960(niitInput, "single", c);
    expect(medicareResult.additionalMedicareTax.toNumber()).toBeGreaterThan(0);
    expect(niitResult.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 4: Investment-only income — NIIT applies, no Additional Medicare Tax
// ═══════════════════════════════════════════════════════════

describe("Investment-only income (no wages/SE) - NIIT applies but not Additional Medicare Tax", () => {
  // A retiree with $300K in dividends and capital gains, no wages/SE:
  // - NIIT applies (investment income over $200K threshold)
  // - No Additional Medicare Tax (no Medicare wages or SE earnings)

  it("Additional Medicare Tax is zero with no wages or SE income", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [], // no W-2
    };
    // SE earnings = 0
    const result = calculateForm8959(fixture, d(0), "single", c);
    expect(result.medicareWages.toNumber()).toBe(0);
    expect(result.selfEmploymentEarnings.toNumber()).toBe(0);
    expect(result.totalEarnings.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("NIIT applies on investment income when MAGI exceeds $200K single threshold", () => {
    const input: Form8960Input = {
      taxableInterest: d(50000),
      ordinaryDividends: d(100000),
      netCapitalGain: d(150000),
      magi: d(300000),
    };
    const result = calculateForm8960(input, "single", c);
    // NII = $300K, MAGI excess = $100K; min = $100K × 3.8% = $3,800
    expect(result.netInvestmentIncome.toNumber()).toBe(300000);
    expect(result.magiExcess.toNumber()).toBe(100000);
    expect(result.taxableBase.toNumber()).toBe(100000);
    expect(result.niitTax.toNumber()).toBe(3800);
  });

  it("investment-only filer: NIIT nonzero, Additional Medicare Tax zero", () => {
    const fixture: TaxYearInput = { ...simpleW2Fixture, w2s: [] };
    const medicareResult = calculateForm8959(fixture, d(0), "single", c);
    const niitInput: Form8960Input = {
      taxableInterest: d(50000),
      ordinaryDividends: d(100000),
      netCapitalGain: d(150000),
      magi: d(300000),
    };
    const niitResult = calculateForm8960(niitInput, "single", c);
    expect(medicareResult.additionalMedicareTax.toNumber()).toBe(0);
    expect(niitResult.niitTax.toNumber()).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 5: MFJ $250K exact boundary — $250K wages + $50K investment
// ═══════════════════════════════════════════════════════════

describe("MFJ exact $250K boundary - wages at threshold + investment income above", () => {
  // MFJ: $250K wages + $50K investment income, MAGI = $300K (approx)
  // Additional Medicare: wages = $250K = threshold → zero Additional Medicare Tax on wages alone
  // NIIT: MAGI $300K - threshold $250K = $50K excess; NII = $50K → min = $50K × 3.8% = $1,900

  it("wages exactly at $250K MFJ threshold: zero Additional Medicare Tax", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly", spouse: complexMFJFixture.taxpayer.spouse },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "250000",
        medicareWages: "250000",
        medicareWithheld: "3625", // exactly 1.45% × $250K, no additional withholding
        federalWithheld: "50000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "married_filing_jointly", c);
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("NIIT applies when MAGI ($300K) exceeds MFJ $250K threshold by $50K", () => {
    const input: Form8960Input = {
      taxableInterest: d(25000),
      ordinaryDividends: d(25000),
      netCapitalGain: d(0),
      magi: d(300000), // $250K wages + $50K investment
    };
    const result = calculateForm8960(input, "married_filing_jointly", c);
    // excess = $300K - $250K = $50K; NII = $50K; min = $50K × 3.8% = $1,900
    expect(result.magiExcess.toNumber()).toBe(50000);
    expect(result.taxableBase.toNumber()).toBe(50000);
    expect(result.niitTax.toNumber()).toBe(1900);
  });

  it("adding $1 of investment income over threshold triggers NIIT but not Additional Medicare Tax", () => {
    const input: Form8960Input = {
      taxableInterest: d(1),
      ordinaryDividends: d(0),
      netCapitalGain: d(0),
      magi: d(250001), // just over MFJ threshold
    };
    const result = calculateForm8960(input, "married_filing_jointly", c);
    expect(result.magiExcess.toNumber()).toBe(1);
    expect(result.taxableBase.toNumber()).toBe(1); // min(NII=$1, excess=$1)
    // $1 × 3.8% = $0.038 → rounds to $0
    expect(result.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 6: QSS uses $200K Additional Medicare Tax / $250K NIIT
// ═══════════════════════════════════════════════════════════

describe("Qualifying Surviving Spouse - Additional Medicare $200K, NIIT $250K", () => {
  // Additional Medicare Tax: IRC §3101(b)(2)(C) "any other individual" = $200K (QSS is NOT a joint return)
  // NIIT: IRC §1411(b)(1) explicitly includes "surviving spouse" at $250K

  it("QSS threshold for Additional Medicare Tax is $200K (same as single/HoH — IRC §3101(b)(2)(C))", () => {
    const qssThreshold = c.additionalMedicareTax.threshold["qualifying_surviving_spouse"];
    const singleThreshold = c.additionalMedicareTax.threshold["single"];
    expect(qssThreshold.toNumber()).toBe(singleThreshold.toNumber());
    expect(qssThreshold.toNumber()).toBe(200000);
  });

  it("QSS threshold for NIIT is $250K (same as MFJ — IRC §1411(b)(1) explicitly includes surviving spouse)", () => {
    const qssThreshold = c.niit.threshold["qualifying_surviving_spouse"];
    const mfjThreshold = c.niit.threshold["married_filing_jointly"];
    expect(qssThreshold.toNumber()).toBe(mfjThreshold.toNumber());
    expect(qssThreshold.toNumber()).toBe(250000);
  });

  it("QSS Additional Medicare Tax: tax at $249K wages (over $200K threshold)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "249000",
        medicareWages: "249000",
        medicareWithheld: "3610.50",
        federalWithheld: "48000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "qualifying_surviving_spouse", c);
    // $249K - $200K = $49K × 0.9% = $441
    expect(result.excessOverThreshold.toNumber()).toBe(49000);
    expect(result.additionalMedicareTax.toNumber()).toBe(441);
  });

  it("QSS Additional Medicare Tax: 0.9% on wages over $200K", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "280000",
        medicareWages: "280000",
        medicareWithheld: "4060",
        federalWithheld: "55000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "qualifying_surviving_spouse", c);
    // $280K - $200K = $80K × 0.9% = $720
    expect(result.excessOverThreshold.toNumber()).toBe(80000);
    expect(result.additionalMedicareTax.toNumber()).toBe(720);
  });

  it("QSS NIIT matches MFJ result for identical income", () => {
    const input: Form8960Input = {
      taxableInterest: d(10000),
      ordinaryDividends: d(10000),
      netCapitalGain: d(0),
      magi: d(300000),
    };
    const qssResult = calculateForm8960(input, "qualifying_surviving_spouse", c);
    const mfjResult = calculateForm8960(input, "married_filing_jointly", c);
    expect(qssResult.niitTax.toNumber()).toBe(mfjResult.niitTax.toNumber());
    // min(NII=$20K, excess=$50K) = $20K × 3.8% = $760
    expect(qssResult.niitTax.toNumber()).toBe(760);
  });

  it("Regression: QSS at $210K wages — above $200K but below old $250K threshold", () => {
    // This scenario was incorrectly zero-taxed when QSS used MFJ's $250K threshold
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "210000",
        medicareWages: "210000",
        medicareWithheld: "3045",
        federalWithheld: "42000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "qualifying_surviving_spouse", c);
    // $210K - $200K = $10K × 0.9% = $90 (old code: $0 because $210K < $250K)
    expect(result.threshold.toNumber()).toBe(200000);
    expect(result.excessOverThreshold.toNumber()).toBe(10000);
    expect(result.additionalMedicareTax.toNumber()).toBe(90);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 7: Combined surtax comparison across all 5 filing statuses
// ═══════════════════════════════════════════════════════════

describe("Combined surtax comparison - same income across all 5 filing statuses", () => {
  // Each filer has $220K wages + $30K investment income (MAGI ≈ $250K)
  // Additional Medicare thresholds: single/HoH/QSS = $200K, MFJ = $250K, MFS = $125K
  // NIIT thresholds: single/HoH = $200K, MFJ/QSS = $250K, MFS = $125K
  const wages = 220000;
  const magi = 250000; // simplified (ignoring deductions for direct form testing)

  const buildW2Fixture = (filingStatus: FilingStatus): TaxYearInput => ({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus },
    w2s: [{
      ...simpleW2Fixture.w2s[0],
      wages: String(wages),
      medicareWages: String(wages),
      medicareWithheld: "3190",
      federalWithheld: "45000",
      socialSecurityWages: "176100",
      socialSecurityWithheld: "10918.20",
    }],
  });

  const buildNiitInput = (): Form8960Input => ({
    taxableInterest: d(15000),
    ordinaryDividends: d(15000),
    netCapitalGain: d(0),
    magi: d(magi),
  });

  it("single: both thresholds $200K — Additional Medicare on $20K wages excess, NIIT on $30K NII excess", () => {
    const medicareResult = calculateForm8959(buildW2Fixture("single"), d(0), "single", c);
    const niitResult = calculateForm8960(buildNiitInput(), "single", c);
    // Medicare: $220K - $200K = $20K × 0.9% = $180
    expect(medicareResult.additionalMedicareTax.toNumber()).toBe(180);
    // NIIT: MAGI excess $250K - $200K = $50K; NII = $30K; min = $30K × 3.8% = $1,140
    expect(niitResult.niitTax.toNumber()).toBe(1140);
  });

  it("head_of_household: both thresholds $200K — same result as single", () => {
    const medicareResult = calculateForm8959(buildW2Fixture("head_of_household"), d(0), "head_of_household", c);
    const niitResult = calculateForm8960(buildNiitInput(), "head_of_household", c);
    expect(medicareResult.additionalMedicareTax.toNumber()).toBe(180);
    expect(niitResult.niitTax.toNumber()).toBe(1140);
  });

  it("married_filing_jointly: $250K threshold — zero Additional Medicare Tax, zero NIIT at MAGI $250K", () => {
    const medicareResult = calculateForm8959(buildW2Fixture("married_filing_jointly"), d(0), "married_filing_jointly", c);
    const niitResult = calculateForm8960(buildNiitInput(), "married_filing_jointly", c);
    // Medicare: $220K wages < $250K threshold → zero
    expect(medicareResult.additionalMedicareTax.toNumber()).toBe(0);
    // NIIT: MAGI $250K = threshold → zero excess
    expect(niitResult.magiExcess.toNumber()).toBe(0);
    expect(niitResult.niitTax.toNumber()).toBe(0);
  });

  it("qualifying_surviving_spouse: Medicare $200K (like single), NIIT $250K (like MFJ)", () => {
    const medicareResult = calculateForm8959(buildW2Fixture("qualifying_surviving_spouse"), d(0), "qualifying_surviving_spouse", c);
    const niitResult = calculateForm8960(buildNiitInput(), "qualifying_surviving_spouse", c);
    // Additional Medicare: $220K - $200K = $20K × 0.9% = $180 (same as single/HoH)
    expect(medicareResult.additionalMedicareTax.toNumber()).toBe(180);
    // NIIT: QSS uses $250K threshold (IRC §1411(b)(1) includes surviving spouse) → zero
    expect(niitResult.niitTax.toNumber()).toBe(0);
  });

  it("married_filing_separately: $125K threshold — highest combined surtax of all filing statuses", () => {
    const medicareResult = calculateForm8959(buildW2Fixture("married_filing_separately"), d(0), "married_filing_separately", c);
    const niitResult = calculateForm8960(buildNiitInput(), "married_filing_separately", c);
    // Medicare: $220K - $125K = $95K × 0.9% = $855
    expect(medicareResult.additionalMedicareTax.toNumber()).toBe(855);
    // NIIT: MAGI $250K - $125K = $125K excess; NII = $30K; min = $30K × 3.8% = $1,140
    expect(niitResult.niitTax.toNumber()).toBe(1140);
    // MFS combined = $1,995 — more than any other status on same income
    const mfsTotal = medicareResult.additionalMedicareTax.plus(niitResult.niitTax).toNumber();
    expect(mfsTotal).toBe(1995);
  });

  it("MFS pays more combined surtax than single on same income", () => {
    const mfsMedicare = calculateForm8959(buildW2Fixture("married_filing_separately"), d(0), "married_filing_separately", c);
    const mfsNiit = calculateForm8960(buildNiitInput(), "married_filing_separately", c);
    const singleMedicare = calculateForm8959(buildW2Fixture("single"), d(0), "single", c);
    const singleNiit = calculateForm8960(buildNiitInput(), "single", c);
    const mfsTotal = mfsMedicare.additionalMedicareTax.plus(mfsNiit.niitTax);
    const singleTotal = singleMedicare.additionalMedicareTax.plus(singleNiit.niitTax);
    expect(mfsTotal.toNumber()).toBeGreaterThan(singleTotal.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 8: Both taxes triggered simultaneously at high income
// ═══════════════════════════════════════════════════════════

describe("Both NIIT and Additional Medicare Tax triggered simultaneously at high income", () => {
  // Single filer, $400K wages + $60K investment income
  // Additional Medicare: ($400K - $200K) × 0.9% = $1,800
  // NIIT: MAGI ≈ $460K, excess over $200K = $260K; NII = $60K; min = $60K × 3.8% = $2,280
  const highIncomeW2Fixture: TaxYearInput = {
    ...simpleW2Fixture,
    w2s: [{
      ...simpleW2Fixture.w2s[0],
      wages: "400000",
      medicareWages: "400000",
      medicareWithheld: "7400", // 1.45% × $400K + 0.9% × $200K = $5,800 + $1,800
      federalWithheld: "100000",
      socialSecurityWages: "176100",
      socialSecurityWithheld: "10918.20",
    }],
  };

  it("Additional Medicare Tax: $1,800 on $200K excess over $200K single threshold", () => {
    const result = calculateForm8959(highIncomeW2Fixture, d(0), "single", c);
    expect(result.excessOverThreshold.toNumber()).toBe(200000);
    expect(result.additionalMedicareTax.toNumber()).toBe(1800);
  });

  it("NIIT: $2,280 on $60K NII (lesser of NII and $260K MAGI excess)", () => {
    const niitInput: Form8960Input = {
      taxableInterest: d(30000),
      ordinaryDividends: d(30000),
      netCapitalGain: d(0),
      magi: d(460000),
    };
    const result = calculateForm8960(niitInput, "single", c);
    // NII = $60K, MAGI excess = $460K - $200K = $260K; min = $60K × 3.8% = $2,280
    expect(result.netInvestmentIncome.toNumber()).toBe(60000);
    expect(result.magiExcess.toNumber()).toBe(260000);
    expect(result.taxableBase.toNumber()).toBe(60000);
    expect(result.niitTax.toNumber()).toBe(2280);
  });

  it("combined surtax at $400K wages + $60K investment income totals $4,080", () => {
    const medicareResult = calculateForm8959(highIncomeW2Fixture, d(0), "single", c);
    const niitResult = calculateForm8960(
      { taxableInterest: d(30000), ordinaryDividends: d(30000), netCapitalGain: d(0), magi: d(460000) },
      "single",
      c
    );
    const combined = medicareResult.additionalMedicareTax.plus(niitResult.niitTax);
    expect(combined.toNumber()).toBe(4080);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 9: Only NIIT triggered — investment income, wages below threshold
// ═══════════════════════════════════════════════════════════

describe("Only NIIT triggered: wages below threshold, investment income pushes MAGI over", () => {
  // Single filer: $190K wages + $30K investment income, MAGI = $220K
  // Additional Medicare: $190K < $200K threshold → zero
  // NIIT: MAGI $220K excess over $200K = $20K; NII = $30K; min = $20K × 3.8% = $760

  it("Additional Medicare Tax is zero when wages stay under $200K single threshold", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "190000",
        medicareWages: "190000",
        medicareWithheld: "2755", // 1.45% × $190K, no additional withholding
        federalWithheld: "35000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "single", c);
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("NIIT applies because investment income pushes MAGI over $200K: tax on MAGI excess", () => {
    // MAGI excess ($20K) is less than NII ($30K) so taxable base is the excess
    const niitInput: Form8960Input = {
      taxableInterest: d(15000),
      ordinaryDividends: d(15000),
      netCapitalGain: d(0),
      magi: d(220000),
    };
    const result = calculateForm8960(niitInput, "single", c);
    expect(result.magiExcess.toNumber()).toBe(20000);
    expect(result.taxableBase.toNumber()).toBe(20000); // MAGI excess < NII
    expect(result.niitTax.toNumber()).toBe(760); // $20K × 3.8%
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 10: Only Additional Medicare Tax triggered — high wages, no investment income
// ═══════════════════════════════════════════════════════════

describe("Only Additional Medicare Tax triggered: high wages, no investment income", () => {
  // Single filer: $350K wages, zero investment income
  // Additional Medicare: ($350K - $200K) × 0.9% = $1,350
  // NIIT: NII = $0 → zero regardless of MAGI

  it("Additional Medicare Tax applies on $150K excess wages over $200K threshold", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "350000",
        medicareWages: "350000",
        medicareWithheld: "6425", // 1.45% × $350K + 0.9% × $150K
        federalWithheld: "80000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "single", c);
    expect(result.excessOverThreshold.toNumber()).toBe(150000);
    expect(result.additionalMedicareTax.toNumber()).toBe(1350);
  });

  it("NIIT is zero when there is no net investment income despite high MAGI", () => {
    const niitInput: Form8960Input = {
      taxableInterest: d(0),
      ordinaryDividends: d(0),
      netCapitalGain: d(0),
      magi: d(350000),
    };
    const result = calculateForm8960(niitInput, "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 11: Neither tax triggered — moderate income
// ═══════════════════════════════════════════════════════════

describe("Neither NIIT nor Additional Medicare Tax triggered at moderate income", () => {
  // Single filer: $150K wages + $10K investment income, MAGI = $160K
  // Both thresholds are $200K for single → both taxes are zero

  it("Additional Medicare Tax is zero when total earnings stay under $200K", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "150000",
        medicareWages: "150000",
        medicareWithheld: "2175",
        federalWithheld: "25000",
        socialSecurityWages: "150000",
        socialSecurityWithheld: "9300",
      }],
    };
    const result = calculateForm8959(fixture, d(0), "single", c);
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("NIIT is zero when MAGI stays under $200K single threshold", () => {
    const niitInput: Form8960Input = {
      taxableInterest: d(5000),
      ordinaryDividends: d(5000),
      netCapitalGain: d(0),
      magi: d(160000),
    };
    const result = calculateForm8960(niitInput, "single", c);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("federal pipeline confirms both taxes are zero for moderate income single filer", () => {
    const federal = calculateFederalTax(simpleW2Fixture);
    // simpleW2Fixture has $85K wages — well under $200K
    expect(federal.additionalMedicareTax.toNumber()).toBe(0);
    expect(federal.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 12: Combined NIIT + Additional Medicare as percentage of total tax
// ═══════════════════════════════════════════════════════════

describe("Combined NIIT + Additional Medicare as share of total tax at high income", () => {
  // High-income MFJ: $400K wages + $80K investment income
  // Additional Medicare: ($400K - $250K) × 0.9% = $1,350
  // NIIT: MAGI ≈ $480K, excess over $250K = $230K; NII = $80K; min = $80K × 3.8% = $3,040
  // Combined surtax = $4,390

  it("combined surtax ($4,390) is material share of total tax for high-income MFJ filer", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly", spouse: complexMFJFixture.taxpayer.spouse },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "400000",
        medicareWages: "400000",
        medicareWithheld: "7150", // 1.45% × $400K + 0.9% × $150K
        federalWithheld: "100000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
      }],
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "80000",
        qualifiedDividends: "60000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        foreignCountry: "",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Both surtaxes should fire
    expect(federal.additionalMedicareTax.toNumber()).toBe(1350); // $150K × 0.9%
    expect(federal.niitTax.greaterThan(0)).toBe(true);
    // Combined surtaxes are a nonzero portion of total taxes
    const surtaxTotal = federal.additionalMedicareTax.plus(federal.niitTax);
    expect(surtaxTotal.greaterThan(new Decimal(4000))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 13: Rental income triggers NIIT but not Additional Medicare Tax
// ═══════════════════════════════════════════════════════════

describe("Rental income triggers NIIT via otherInvestmentIncome but not Additional Medicare Tax", () => {
  // Rental income (Schedule E passive activity) flows into Form 8960 as otherInvestmentIncome
  // It does NOT constitute Medicare wages or SE earnings, so no Additional Medicare Tax

  it("rental income is net investment income for NIIT purposes", () => {
    // $30K net rental income flows as otherInvestmentIncome into Form 8960
    const niitInput: Form8960Input = {
      taxableInterest: d(0),
      ordinaryDividends: d(0),
      netCapitalGain: d(0),
      otherInvestmentIncome: d(30000), // rental income from passive activity
      magi: d(230000),
    };
    const result = calculateForm8960(niitInput, "single", c);
    // NII = $30K, MAGI excess = $230K - $200K = $30K; min = $30K × 3.8% = $1,140
    expect(result.netInvestmentIncome.toNumber()).toBe(30000);
    expect(result.magiExcess.toNumber()).toBe(30000);
    expect(result.taxableBase.toNumber()).toBe(30000);
    expect(result.niitTax.toNumber()).toBe(1140);
  });

  it("rental income does not count as Medicare wages: Additional Medicare Tax is zero", () => {
    // No W-2 wages and no SE income — only rental income
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [], // no W-2
    };
    // SE earnings = 0 (rental is passive, not SE)
    const result = calculateForm8959(fixture, d(0), "single", c);
    expect(result.medicareWages.toNumber()).toBe(0);
    expect(result.selfEmploymentEarnings.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("rental-only filer: NIIT positive, Additional Medicare Tax zero", () => {
    const niitInput: Form8960Input = {
      taxableInterest: d(0),
      ordinaryDividends: d(0),
      netCapitalGain: d(0),
      otherInvestmentIncome: d(30000),
      magi: d(230000),
    };
    const niitResult = calculateForm8960(niitInput, "single", c);
    const medicareResult = calculateForm8959(
      { ...simpleW2Fixture, w2s: [] },
      d(0),
      "single",
      c
    );
    expect(niitResult.niitTax.toNumber()).toBeGreaterThan(0);
    expect(medicareResult.additionalMedicareTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Case 14: Audit trail includes Form 8959 and Form 8960 entries
// ═══════════════════════════════════════════════════════════

describe("Audit trail includes Form 8959 and Form 8960 entries in federal pipeline", () => {
  // High-income fixture that triggers both surtaxes
  const highIncomeSingleFixture: TaxYearInput = {
    ...simpleW2Fixture,
    w2s: [{
      ...simpleW2Fixture.w2s[0],
      wages: "300000",
      medicareWages: "300000",
      medicareWithheld: "5250",
      federalWithheld: "60000",
      socialSecurityWages: "176100",
      socialSecurityWithheld: "10918.20",
    }],
    form1099Div: [{
      payer: "Fund",
      ordinaryDividends: "20000",
      qualifiedDividends: "15000",
      totalCapitalGainDistributions: "0",
      federalWithheld: "0",
      foreignTaxPaid: "0",
      foreignCountry: "",
      section1250Gain: "0",
      section1202Gain: "0",
      collectiblesGain: "0",
      nondividendDistributions: "0",
      exemptInterestDividends: "0",
    }],
  };

  it("allLines audit trail contains a Form 8959 Additional Medicare Tax entry", () => {
    const federal = calculateFederalTax(highIncomeSingleFixture);
    const line8959 = federal.allLines.find(
      (l) => l.form === "Form 8959" && l.line === "18"
    );
    expect(line8959).toBeDefined();
    expect(line8959!.description).toBe("Additional Medicare Tax");
  });

  it("allLines audit trail contains a Form 8960 NIIT entry", () => {
    const federal = calculateFederalTax(highIncomeSingleFixture);
    const line8960 = federal.allLines.find(
      (l) => l.form === "Form 8960" && l.line === "17"
    );
    expect(line8960).toBeDefined();
    expect(line8960?.description).toBe("Net investment income tax");
    expect(line8960?.value.toFixed()).toBe("760");
  });

  it("Form 8959 line 1 audit entry records medicare wages", () => {
    const federal = calculateFederalTax(highIncomeSingleFixture);
    const medicareWagesLine = federal.allLines.find(
      (l) => l.form === "Form 8959" && l.line === "1"
    );
    expect(medicareWagesLine).toBeDefined();
    expect(medicareWagesLine!.description).toBe("Medicare wages from W-2s");
  });

  it("Form 8960 lines 8 and 12 separately record total and net investment income", () => {
    const federal = calculateFederalTax(highIncomeSingleFixture);
    const totalLine = federal.allLines.find(
      (l) => l.form === "Form 8960" && l.line === "8"
    );
    const niiLine = federal.allLines.find(
      (l) => l.form === "Form 8960" && l.line === "12"
    );
    expect(totalLine).toBeDefined();
    expect(totalLine?.description).toBe("Total investment income");
    expect(totalLine?.value.toFixed()).toBe("20000");
    expect(niiLine).toBeDefined();
    expect(niiLine?.description).toBe("Net investment income");
    expect(niiLine?.value.toFixed()).toBe("20000");
  });
});
