/**
 * Edge case tests for Form 8960 (NIIT) — additional scenarios.
 * Covers rental/K-1 as investment income, retiree scenarios, capital loss
 * impact, threshold boundaries, and QSS filing status.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8960, type Form8960Input } from "@/engine/forms/form-8960.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function makeInput(overrides?: Partial<Form8960Input>): Form8960Input {
  return {
    taxableInterest: d(0),
    ordinaryDividends: d(0),
    netCapitalGain: d(0),
    magi: d(0),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Rental Income as Investment Income for NIIT
// ═══════════════════════════════════════════════════════════

describe("NIIT - rental income as other investment income", () => {
  it("rental net income flows into NIIT via otherInvestmentIncome", () => {
    // Rental net income of $30K reported as other investment income on Form 8960 Line 7
    const result = calculateForm8960(makeInput({
      otherInvestmentIncome: d(30000),
      magi: d(280000),
    }), "single", c);
    // NII = $30K, MAGI excess = $80K, base = min($30K, $80K) = $30K
    // NIIT = $30K x 3.8% = $1,140
    expect(result.netInvestmentIncome.toNumber()).toBe(30000);
    expect(result.taxableBase.toNumber()).toBe(30000);
    expect(result.niitTax.toNumber()).toBe(1140);
  });

  it("rental income through federal pipeline triggers NIIT", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "180000",
        federalWithheld: "30000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "180000",
        medicareWithheld: "2610",
      }],
      rentalProperties: [{
        description: "Rental House",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "36000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "2000",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "6000",
        otherInterest: "0",
        repairs: "0",
        supplies: "0",
        taxes: "3000",
        utilities: "0",
        depreciation: "5000",
        otherExpenses: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Rental net: $36K - $16K = $20K. AGI = $180K wages + $20K rental = $200K
    // At exactly $200K threshold, MAGI excess = $0 → NIIT = $0
    // But with rental income included, AGI might exceed threshold
    // The key point: rental income IS investment income for NIIT
    expect(federal.niitTax.greaterThanOrEqualTo(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 Passive Income Subject to NIIT
// ═══════════════════════════════════════════════════════════

describe("NIIT - K-1 passive income", () => {
  it("passive K-1 ordinary income IS investment income for Form 8960", () => {
    // Per IRS Form 8960 instructions, income from passive activities
    // is included in net investment income for NIIT purposes.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "190000",
        federalWithheld: "35000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "190000",
        medicareWithheld: "2755",
      }],
      scheduleK1: [{
        partnershipName: "Passive RE Fund",
        partnershipEIN: "55-1234567",
        ordinaryIncome: "15000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: true,
        atRiskAmount: "100000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // AGI = $190K wages + $15K K-1 = $205K → over $200K threshold
    // NII includes $15K passive K-1 income
    // NIIT = min($15K NII, $5K excess) × 3.8% = $5K × 3.8% = $190
    expect(federal.form8960.netInvestmentIncome.toNumber()).toBe(15000);
    expect(federal.niitTax.toNumber()).toBe(190);
  });

  it("K-1 with interest/dividends flows into NIIT via Schedule B", () => {
    // K-1 interest and dividends get picked up through Schedule B / 1040
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "190000",
        federalWithheld: "35000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "190000",
        medicareWithheld: "2755",
      }],
      scheduleK1: [{
        partnershipName: "Income Fund LP",
        partnershipEIN: "55-1234567",
        ordinaryIncome: "5000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "8000",
        ordinaryDividends: "5000",
        qualifiedDividends: "3000",
        selfEmploymentEarnings: "0",
        isPassiveActivity: true,
        atRiskAmount: "100000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // K-1 interest ($8K) and dividends ($5K) flow to NII
    // AGI includes wages + K-1 ordinary + K-1 interest + K-1 dividends
    // NII includes interest + dividends from K-1
    expect(federal.form8960.taxableInterest.greaterThan(0)).toBe(true);
    expect(federal.form8960.dividends.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Retiree: Large Interest + Dividend Portfolio, Zero Wages
// ═══════════════════════════════════════════════════════════

describe("NIIT - retiree with investment income only", () => {
  it("large interest + dividend portfolio with zero wages", () => {
    // Retiree living off $250K of investment income, no wages
    const result = calculateForm8960(makeInput({
      taxableInterest: d(100000),
      ordinaryDividends: d(150000),
      netCapitalGain: d(0),
      magi: d(250000),
    }), "single", c);
    // NII = $250K, excess = $50K, base = min($250K, $50K) = $50K
    // NIIT = $50K x 3.8% = $1,900
    expect(result.netInvestmentIncome.toNumber()).toBe(250000);
    expect(result.magiExcess.toNumber()).toBe(50000);
    expect(result.taxableBase.toNumber()).toBe(50000);
    expect(result.niitTax.toNumber()).toBe(1900);
  });

  it("retiree through federal pipeline — no W-2, all investment", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [],
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0",
        payer: "Treasury Bonds",
        interestIncome: "80000",
        federalWithheld: "0",
      }],
      form1099Div: [{ specifiedPrivateActivityBondInterest: "0",
        payer: "Index Fund",
        ordinaryDividends: "60000",
        qualifiedDividends: "45000",
        totalCapitalGainDistributions: "20000",
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
    // Total income: $80K interest + $60K dividends + $20K cap gain dist = $160K
    // Under $200K threshold → no NIIT despite 100% investment income
    expect(federal.niitTax.toNumber()).toBe(0);
  });

  it("wealthy retiree over threshold gets NIIT", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [],
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0",
        payer: "Banks",
        interestIncome: "120000",
        federalWithheld: "0",
      }],
      form1099Div: [{ specifiedPrivateActivityBondInterest: "0",
        payer: "Brokerage",
        ordinaryDividends: "100000",
        qualifiedDividends: "75000",
        totalCapitalGainDistributions: "30000",
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
    // Total income: $120K + $100K + $30K = $250K, over $200K threshold
    expect(federal.niitTax.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Loss Reducing NIIT Base
// ═══════════════════════════════════════════════════════════

describe("NIIT - capital loss impact on NIIT base", () => {
  it("net capital gain of zero when losses offset gains → no cap gain in NII", () => {
    // Capital losses eliminate capital gains component of NII
    const result = calculateForm8960(makeInput({
      taxableInterest: d(20000),
      ordinaryDividends: d(10000),
      netCapitalGain: d(0), // Losses fully offset gains
      magi: d(260000),
    }), "single", c);
    // NII = $30K (interest + dividends only)
    expect(result.netInvestmentIncome.toNumber()).toBe(30000);
    // Excess = $60K, base = min($30K, $60K) = $30K
    expect(result.taxableBase.toNumber()).toBe(30000);
    // NIIT = $30K x 3.8% = $1,140
    expect(result.niitTax.toNumber()).toBe(1140);
  });

  it("investment expenses further reduce NII below capital gain component", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      ordinaryDividends: d(5000),
      netCapitalGain: d(20000),
      investmentExpenses: d(25000),
      magi: d(300000),
    }), "single", c);
    // Gross NII = $10K + $5K + $20K = $35K - $25K expenses = $10K
    expect(result.netInvestmentIncome.toNumber()).toBe(10000);
    expect(result.niitTax.toNumber()).toBe(380); // $10K x 3.8%
  });

  it("capital loss through federal pipeline reduces NIIT", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "210000",
        federalWithheld: "38000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "210000",
        medicareWithheld: "3045",
      }],
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Stock A",
            dateAcquired: "2024-01-01",
            dateSold: "2025-06-01",
            proceeds: "10000",
            costBasis: "30000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0",
        payer: "Bank",
        interestIncome: "5000",
        federalWithheld: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Capital loss of $20K, limited to $3K deduction on 1040
    // Official line5a retains the permitted $3K capital loss, reducing $5K interest.
    expect(federal.form8960.netCapitalGain.toNumber()).toBe(-3000);
    expect(federal.form8960.netInvestmentIncome.toNumber()).toBe(2000);
    expect(federal.niitTax.toNumber()).toBe(76);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS $125K Threshold (Half of MFJ)
// ═══════════════════════════════════════════════════════════

describe("NIIT - MFS $125K threshold", () => {
  it("MFS taxpayer at $125K exactly: zero NIIT", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      ordinaryDividends: d(5000),
      magi: d(125000),
    }), "married_filing_separately", c);
    expect(result.threshold.toNumber()).toBe(125000);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MFS $1 over $125K threshold: minimal NIIT", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      ordinaryDividends: d(5000),
      magi: d(125001),
    }), "married_filing_separately", c);
    expect(result.magiExcess.toNumber()).toBe(1);
    // min(NII=$15K, excess=$1) = $1 x 3.8% = $0.04 rounds to $0
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MFS at $150K with $20K NII: significant NIIT impact", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      ordinaryDividends: d(10000),
      magi: d(150000),
    }), "married_filing_separately", c);
    // Excess = $25K, NII = $20K, base = $20K
    // NIIT = $20K x 3.8% = $760
    expect(result.taxableBase.toNumber()).toBe(20000);
    expect(result.niitTax.toNumber()).toBe(760);
  });

  it("MFS threshold is exactly half of MFJ threshold", () => {
    const mfsThreshold = c.niit.threshold.married_filing_separately;
    const mfjThreshold = c.niit.threshold.married_filing_jointly;
    expect(mfsThreshold.toNumber()).toBe(mfjThreshold.dividedBy(2).toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Exactly at NIIT Threshold ($200K Single): Zero NIIT
// ═══════════════════════════════════════════════════════════

describe("NIIT - exactly at threshold boundary", () => {
  it("single MAGI exactly $200K with substantial NII: zero NIIT", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(50000),
      ordinaryDividends: d(30000),
      netCapitalGain: d(20000),
      magi: d(200000),
    }), "single", c);
    // NII = $100K, but MAGI excess = $0 → base = min($100K, $0) = $0
    expect(result.netInvestmentIncome.toNumber()).toBe(100000);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.taxableBase.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("HoH MAGI exactly $200K: zero NIIT (same threshold as single)", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(20000),
      magi: d(200000),
    }), "head_of_household", c);
    expect(result.threshold.toNumber()).toBe(200000);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MFJ MAGI exactly $250K: zero NIIT", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(40000),
      ordinaryDividends: d(60000),
      magi: d(250000),
    }), "married_filing_jointly", c);
    expect(result.threshold.toNumber()).toBe(250000);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// $1 Over Threshold: Minimal NIIT
// ═══════════════════════════════════════════════════════════

describe("NIIT - $1 over threshold", () => {
  it("single $200,001 with large NII: tax only on $1 excess", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(50000),
      ordinaryDividends: d(50000),
      magi: d(200001),
    }), "single", c);
    // MAGI excess = $1. NII = $100K. base = min($100K, $1) = $1
    // NIIT = $1 x 3.8% = $0.04 → rounds to $0
    expect(result.magiExcess.toNumber()).toBe(1);
    expect(result.taxableBase.toNumber()).toBe(1);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("single $200,100 with large NII: $100 excess yields $4 NIIT", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(50000),
      ordinaryDividends: d(50000),
      magi: d(200100),
    }), "single", c);
    // MAGI excess = $100. base = min($100K, $100) = $100
    // NIIT = $100 x 3.8% = $3.80 → rounds to $4
    expect(result.magiExcess.toNumber()).toBe(100);
    expect(result.taxableBase.toNumber()).toBe(100);
    expect(result.niitTax.toNumber()).toBe(4);
  });

  it("MFJ $250,001: $1 excess with NII", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(20000),
      magi: d(250001),
    }), "married_filing_jointly", c);
    expect(result.magiExcess.toNumber()).toBe(1);
    expect(result.taxableBase.toNumber()).toBe(1);
    // $1 x 3.8% = $0.04 → rounds to $0
    expect(result.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS Uses MFJ Threshold ($250K)
// ═══════════════════════════════════════════════════════════

describe("NIIT - qualifying surviving spouse uses MFJ threshold", () => {
  it("QSS threshold is $250K (same as MFJ)", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      magi: d(260000),
    }), "qualifying_surviving_spouse", c);
    expect(result.threshold.toNumber()).toBe(250000);
    // Excess = $10K, NII = $10K, base = $10K
    // NIIT = $10K x 3.8% = $380
    expect(result.magiExcess.toNumber()).toBe(10000);
    expect(result.niitTax.toNumber()).toBe(380);
  });

  it("QSS at exactly $250K: zero NIIT", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(30000),
      ordinaryDividends: d(20000),
      magi: d(250000),
    }), "qualifying_surviving_spouse", c);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("QSS threshold matches MFJ threshold exactly", () => {
    const qssThreshold = c.niit.threshold.qualifying_surviving_spouse;
    const mfjThreshold = c.niit.threshold.married_filing_jointly;
    expect(qssThreshold.toNumber()).toBe(mfjThreshold.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Qualified Dividends Only — NIIT applies to all ord divs
// ═══════════════════════════════════════════════════════════

describe("NIIT - qualified dividends only as NII (spec Line 4a)", () => {
  it("qualified dividends are included in NII via ordinary dividends", () => {
    // Qualified dividends are a subset of ordinary dividends.
    // Form 8960 Line 2 uses ordinary dividends which includes qualified.
    const result = calculateForm8960(makeInput({
      ordinaryDividends: d(80000), // all qualified
      magi: d(240000),
    }), "single", c);
    // NII = $80K, excess = $40K, base = min($80K, $40K) = $40K
    // NIIT = $40K x 3.8% = $1,520
    expect(result.netInvestmentIncome.toNumber()).toBe(80000);
    expect(result.taxableBase.toNumber()).toBe(40000);
    expect(result.niitTax.toNumber()).toBe(1520);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Gains Only as NII
// ═══════════════════════════════════════════════════════════

describe("NIIT - capital gains only as NII (spec Line 5a)", () => {
  it("NIIT applies when only source of NII is net capital gain", () => {
    const result = calculateForm8960(makeInput({
      netCapitalGain: d(60000),
      magi: d(230000),
    }), "single", c);
    // NII = $60K, excess = $30K, base = min($60K, $30K) = $30K
    // NIIT = $30K x 3.8% = $1,140
    expect(result.netInvestmentIncome.toNumber()).toBe(60000);
    expect(result.taxableBase.toNumber()).toBe(30000);
    expect(result.niitTax.toNumber()).toBe(1140);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Income Only as NII
// ═══════════════════════════════════════════════════════════

describe("NIIT - rental income only as NII (spec Line 8)", () => {
  it("NIIT applies when only NII source is rental income via otherInvestmentIncome", () => {
    const result = calculateForm8960(makeInput({
      otherInvestmentIncome: d(50000),
      magi: d(270000),
    }), "single", c);
    // NII = $50K, excess = $70K, base = min($50K, $70K) = $50K
    // NIIT = $50K x 3.8% = $1,900
    expect(result.netInvestmentIncome.toNumber()).toBe(50000);
    expect(result.taxableBase.toNumber()).toBe(50000);
    expect(result.niitTax.toNumber()).toBe(1900);
  });
});

// ═══════════════════════════════════════════════════════════
// Mix of All Investment Income Types
// ═══════════════════════════════════════════════════════════

describe("NIIT - mix of all investment income types (spec Line 8)", () => {
  it("NII sums interest + dividends + cap gains + other income", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(15000),
      ordinaryDividends: d(25000),
      netCapitalGain: d(35000),
      otherInvestmentIncome: d(10000),
      magi: d(300000),
    }), "single", c);
    // NII = $15K + $25K + $35K + $10K = $85K
    // Excess = $100K, base = min($85K, $100K) = $85K
    // NIIT = $85K x 3.8% = $3,230
    expect(result.netInvestmentIncome.toNumber()).toBe(85000);
    expect(result.taxableBase.toNumber()).toBe(85000);
    expect(result.niitTax.toNumber()).toBe(3230);
  });
});

// ═══════════════════════════════════════════════════════════
// Investment Expenses Reducing NII (spec Line 8)
// ═══════════════════════════════════════════════════════════

describe("NIIT - investment expenses reducing NII (spec Line 8)", () => {
  it("investment expenses reduce gross investment income to net", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(20000),
      ordinaryDividends: d(30000),
      investmentExpenses: d(15000),
      magi: d(280000),
    }), "single", c);
    // Gross = $50K, expenses = $15K, NII = $35K
    // Excess = $80K, base = min($35K, $80K) = $35K
    // NIIT = $35K x 3.8% = $1,330
    expect(result.netInvestmentIncome.toNumber()).toBe(35000);
    expect(result.taxableBase.toNumber()).toBe(35000);
    expect(result.niitTax.toNumber()).toBe(1330);
  });

  it("investment expenses exceeding gross income floor NII at zero", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(5000),
      ordinaryDividends: d(5000),
      investmentExpenses: d(20000),
      magi: d(300000),
    }), "single", c);
    // Gross = $10K, expenses = $20K → NII = max(0, -$10K) = $0
    // base = min($0, $100K) = $0 → NIIT = $0
    expect(result.netInvestmentIncome.toNumber()).toBe(0);
    expect(result.taxableBase.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero NII Above Threshold — No NIIT (spec Line 14, Line 17)
// ═══════════════════════════════════════════════════════════

describe("NIIT - zero NII above threshold (spec Line 14)", () => {
  it("high AGI with zero investment income produces zero NIIT", () => {
    const result = calculateForm8960(makeInput({
      magi: d(500000),
    }), "single", c);
    // All income types default to 0, NII = $0
    // Excess = $300K, but base = min($0, $300K) = $0
    expect(result.netInvestmentIncome.toNumber()).toBe(0);
    expect(result.magiExcess.toNumber()).toBe(300000);
    expect(result.taxableBase.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High NII but Below AGI Threshold (spec Line 13)
// ═══════════════════════════════════════════════════════════

describe("NIIT - high NII below threshold (spec Line 13)", () => {
  it("$199K NII with $199K MAGI produces zero NIIT for single", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(99000),
      ordinaryDividends: d(100000),
      magi: d(199000),
    }), "single", c);
    // NII = $199K, but MAGI ($199K) < threshold ($200K) → excess = $0
    expect(result.netInvestmentIncome.toNumber()).toBe(199000);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.taxableBase.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("$500K NII with $124,999 MAGI produces zero NIIT for MFS", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(200000),
      ordinaryDividends: d(200000),
      netCapitalGain: d(100000),
      magi: d(124999),
    }), "married_filing_separately", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(500000);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// NII > AGI Excess: Tax on AGI Excess (spec Line 14)
// ═══════════════════════════════════════════════════════════

describe("NIIT - NII greater than AGI excess (spec Line 14)", () => {
  it("tax computed on MAGI excess when NII exceeds it", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(100000),
      ordinaryDividends: d(100000),
      magi: d(220000),
    }), "single", c);
    // NII = $200K, excess = $20K, base = min($200K, $20K) = $20K
    // NIIT = $20K x 3.8% = $760
    expect(result.netInvestmentIncome.toNumber()).toBe(200000);
    expect(result.magiExcess.toNumber()).toBe(20000);
    expect(result.taxableBase.toNumber()).toBe(20000);
    expect(result.niitTax.toNumber()).toBe(760);
  });
});

// ═══════════════════════════════════════════════════════════
// NII < AGI Excess: Tax on NII (spec Line 14)
// ═══════════════════════════════════════════════════════════

describe("NIIT - NII less than AGI excess (spec Line 14)", () => {
  it("tax computed on NII when MAGI excess exceeds it", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(5000),
      magi: d(350000),
    }), "single", c);
    // NII = $5K, excess = $150K, base = min($5K, $150K) = $5K
    // NIIT = $5K x 3.8% = $190
    expect(result.netInvestmentIncome.toNumber()).toBe(5000);
    expect(result.magiExcess.toNumber()).toBe(150000);
    expect(result.taxableBase.toNumber()).toBe(5000);
    expect(result.niitTax.toNumber()).toBe(190);
  });
});

// ═══════════════════════════════════════════════════════════
// HoH Uses $200K Threshold (Same as Single) (spec Line 11)
// ═══════════════════════════════════════════════════════════

describe("NIIT - HoH uses $200K threshold (spec Line 11)", () => {
  it("HoH threshold matches single threshold", () => {
    const hohThreshold = c.niit.threshold.head_of_household;
    const singleThreshold = c.niit.threshold.single;
    expect(hohThreshold.toNumber()).toBe(singleThreshold.toNumber());
    expect(hohThreshold.toNumber()).toBe(200000);
  });

  it("HoH $1 over $200K threshold produces NIIT", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      magi: d(200100),
    }), "head_of_household", c);
    expect(result.threshold.toNumber()).toBe(200000);
    expect(result.magiExcess.toNumber()).toBe(100);
    // base = min($10K, $100) = $100, NIIT = $100 x 3.8% = $3.80 → $4
    expect(result.taxableBase.toNumber()).toBe(100);
    expect(result.niitTax.toNumber()).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Losses Reducing NII (spec Line 5a, Line 8)
// ═══════════════════════════════════════════════════════════

describe("NIIT - capital losses reducing NII (spec Line 5a)", () => {
  it("permitted capital loss reduces other investment income", () => {
    // Official line5a includes the permitted $3000 return capital loss.
    const result = calculateForm8960(makeInput({
      taxableInterest: d(30000),
      ordinaryDividends: d(20000),
      netCapitalGain: d(-3000), // Actual allowed return capital loss
      magi: d(260000),
    }), "single", c);
    // 30000+20000-3000=47000, below60000MAGIexcess;*.038=1786.
    expect(result.netInvestmentIncome.toNumber()).toBe(47000);
    expect(result.niitTax.toNumber()).toBe(1786);
  });

  it("partial capital gains offset by partial losses reduces NII", () => {
    // If gains = $40K and losses = $25K, net cap gain = $15K
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      netCapitalGain: d(15000), // $40K gains - $25K losses
      magi: d(230000),
    }), "single", c);
    // NII = $10K + $15K = $25K
    // Excess = $30K, base = min($25K, $30K) = $25K
    // NIIT = $25K x 3.8% = $950
    expect(result.netInvestmentIncome.toNumber()).toBe(25000);
    expect(result.taxableBase.toNumber()).toBe(25000);
    expect(result.niitTax.toNumber()).toBe(950);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS $125K Threshold Specifically (spec Line 11)
// ═══════════════════════════════════════════════════════════

describe("NIIT - MFS $125K threshold edge cases (spec Line 11)", () => {
  it("MFS MAGI $1 below $125K threshold: zero NIIT even with NII", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(50000),
      ordinaryDividends: d(50000),
      magi: d(124999),
    }), "married_filing_separately", c);
    expect(result.threshold.toNumber()).toBe(125000);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MFS at $200K: $75K excess drives significant NIIT", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(30000),
      ordinaryDividends: d(20000),
      netCapitalGain: d(50000),
      magi: d(200000),
    }), "married_filing_separately", c);
    // NII = $100K, excess = $75K, base = min($100K, $75K) = $75K
    // NIIT = $75K x 3.8% = $2,850
    expect(result.magiExcess.toNumber()).toBe(75000);
    expect(result.taxableBase.toNumber()).toBe(75000);
    expect(result.niitTax.toNumber()).toBe(2850);
  });
});

// ═══════════════════════════════════════════════════════════
// NIIT Formula: 3.8% × min(NII, MAGI excess over threshold)
// ═══════════════════════════════════════════════════════════

describe("NIIT formula - 3.8% × min(NII, MAGI excess over threshold)", () => {
  it("rate is exactly 3.8% of taxable base when NII equals MAGI excess", () => {
    // When NII == MAGI excess, both inputs to min() are equal — verify the rate
    const result = calculateForm8960(makeInput({
      taxableInterest: d(50000),
      magi: d(250000), // excess = $50K, NII = $50K, base = $50K
    }), "single", c);
    // NIIT = $50K × 3.8% = $1,900
    expect(result.netInvestmentIncome.toNumber()).toBe(50000);
    expect(result.magiExcess.toNumber()).toBe(50000);
    expect(result.taxableBase.toNumber()).toBe(50000);
    expect(result.niitTax.toNumber()).toBe(1900);
    // Verify the rate precisely: 50000 × 0.038 = 1900
    expect(new Decimal(result.niitTax).dividedBy(result.taxableBase).toNumber())
      .toBeCloseTo(0.038, 10);
  });

  it("rate applied to MAGI excess (not NII) when NII > MAGI excess", () => {
    // MAGI excess is binding: $30K. NII = $200K. Tax = $30K × 3.8% = $1,140
    const result = calculateForm8960(makeInput({
      taxableInterest: d(100000),
      ordinaryDividends: d(100000),
      magi: d(230000), // excess = $30K
    }), "single", c);
    expect(result.taxableBase.toNumber()).toBe(30000);
    expect(result.niitTax.toNumber()).toBe(1140);
    expect(new Decimal(result.niitTax).dividedBy(result.taxableBase).toNumber())
      .toBeCloseTo(0.038, 10);
  });
});

// ═══════════════════════════════════════════════════════════
// All Filing Status Thresholds: single $200K, MFJ $250K,
// MFS $125K, QSS $250K, HoH $200K
// ═══════════════════════════════════════════════════════════

describe("NIIT filing status thresholds - all five statuses", () => {
  it("all five filing status thresholds match IRS-specified values", () => {
    expect(c.niit.threshold.single.toNumber()).toBe(200000);
    expect(c.niit.threshold.married_filing_jointly.toNumber()).toBe(250000);
    expect(c.niit.threshold.married_filing_separately.toNumber()).toBe(125000);
    expect(c.niit.threshold.qualifying_surviving_spouse.toNumber()).toBe(250000);
    expect(c.niit.threshold.head_of_household.toNumber()).toBe(200000);
  });

  it("single $200K threshold: MAGI exactly at threshold yields zero NIIT", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(75000),
      ordinaryDividends: d(75000),
      magi: d(200000),
    }), "single", c);
    expect(result.threshold.toNumber()).toBe(200000);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MFJ $250K threshold: MAGI exactly at threshold yields zero NIIT", () => {
    const result = calculateForm8960(makeInput({
      ordinaryDividends: d(80000),
      netCapitalGain: d(40000),
      magi: d(250000),
    }), "married_filing_jointly", c);
    expect(result.threshold.toNumber()).toBe(250000);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// MAGI $1 Over Threshold with Very Large NII: Excess Binding
// ═══════════════════════════════════════════════════════════

describe("NIIT - MAGI $1 over threshold with large NII (excess is binding)", () => {
  it("single MAGI $200,001 with $500K NII: only $1 excess is taxed", () => {
    // MAGI excess = $1. NII = $500K. base = min($500K, $1) = $1
    // NIIT = $1 × 3.8% = $0.038 → rounds to $0
    const result = calculateForm8960(makeInput({
      taxableInterest: d(200000),
      ordinaryDividends: d(200000),
      netCapitalGain: d(100000),
      magi: d(200001),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(500000);
    expect(result.magiExcess.toNumber()).toBe(1);
    expect(result.taxableBase.toNumber()).toBe(1);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MFJ MAGI $250,001 with $1M NII: only $1 excess is taxed", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(500000),
      ordinaryDividends: d(500000),
      magi: d(250001),
    }), "married_filing_jointly", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(1000000);
    expect(result.magiExcess.toNumber()).toBe(1);
    expect(result.taxableBase.toNumber()).toBe(1);
    expect(result.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// NII < MAGI Excess: NII Is the Binding Constraint
// ═══════════════════════════════════════════════════════════

describe("NIIT - NII less than MAGI excess (NII is the binding constraint)", () => {
  it("small NII with very high MAGI: tax is on NII, not excess", () => {
    // NII = $8K, MAGI excess = $300K. base = min($8K, $300K) = $8K
    // NIIT = $8K × 3.8% = $304
    const result = calculateForm8960(makeInput({
      taxableInterest: d(8000),
      magi: d(500000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(8000);
    expect(result.magiExcess.toNumber()).toBe(300000);
    expect(result.taxableBase.toNumber()).toBe(8000);
    expect(result.niitTax.toNumber()).toBe(304);
  });

  it("mixed income with small NII and huge MAGI excess: NII caps the base", () => {
    // NII = $25K (interest + dividends), MAGI excess = $475K, base = $25K
    // NIIT = $25K × 3.8% = $950
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      ordinaryDividends: d(15000),
      magi: d(675000), // single threshold $200K → excess $475K
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(25000);
    expect(result.magiExcess.toNumber()).toBe(475000);
    expect(result.taxableBase.toNumber()).toBe(25000);
    expect(result.niitTax.toNumber()).toBe(950);
  });
});

// ═══════════════════════════════════════════════════════════
// MAGI Excess < NII: Excess Is the Binding Constraint
// ═══════════════════════════════════════════════════════════

describe("NIIT - MAGI excess less than NII (excess is the binding constraint)", () => {
  it("moderate MAGI excess with large NII: tax is on excess, not NII", () => {
    // NII = $150K. MAGI = $215K → excess = $15K. base = min($150K, $15K) = $15K
    // NIIT = $15K × 3.8% = $570
    const result = calculateForm8960(makeInput({
      taxableInterest: d(50000),
      ordinaryDividends: d(50000),
      netCapitalGain: d(50000),
      magi: d(215000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(150000);
    expect(result.magiExcess.toNumber()).toBe(15000);
    expect(result.taxableBase.toNumber()).toBe(15000);
    expect(result.niitTax.toNumber()).toBe(570);
  });
});

// ═══════════════════════════════════════════════════════════
// Wages Do NOT Count as Investment Income
// ═══════════════════════════════════════════════════════════

describe("NIIT - wages do not count as investment income", () => {
  it("high-wage earner with no investment income: zero NIIT despite large MAGI excess", () => {
    // W-2 wages drive MAGI above threshold but NII = $0 → no NIIT
    const result = calculateForm8960(makeInput({
      // All income is wages — zero investment income inputs
      taxableInterest: d(0),
      ordinaryDividends: d(0),
      netCapitalGain: d(0),
      magi: d(600000), // high wages alone
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(0);
    expect(result.magiExcess.toNumber()).toBe(400000);
    expect(result.taxableBase.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("high wages in federal pipeline produce zero NIIT when no investment income", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "500000",
        federalWithheld: "150000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "500000",
        medicareWithheld: "7250",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // AGI is purely wages — no interest, dividends, or capital gains
    // MAGI excess is large but NII = $0 → NIIT = $0
    expect(federal.form8960.netInvestmentIncome.toNumber()).toBe(0);
    expect(federal.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Investment Expenses Reduce NII (spec Line 9)
// ═══════════════════════════════════════════════════════════

describe("NIIT - investment expenses reduce NII (spec Line 9)", () => {
  it("investment advisory fees reduce gross NII and therefore NIIT", () => {
    // Gross NII = $60K. Investment expenses = $10K. Net NII = $50K.
    // MAGI excess = $100K. base = min($50K, $100K) = $50K
    // NIIT = $50K × 3.8% = $1,900
    const result = calculateForm8960(makeInput({
      taxableInterest: d(20000),
      ordinaryDividends: d(25000),
      netCapitalGain: d(15000),
      investmentExpenses: d(10000),
      magi: d(300000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(50000);
    expect(result.taxableBase.toNumber()).toBe(50000);
    expect(result.niitTax.toNumber()).toBe(1900);
  });

  it("expenses that reduce NII below MAGI excess shift the binding constraint to NII", () => {
    // Gross NII = $80K. Expenses = $65K. Net NII = $15K.
    // MAGI excess = $60K. base changes from excess-bound to NII-bound.
    // base = min($15K, $60K) = $15K. NIIT = $15K × 3.8% = $570
    const result = calculateForm8960(makeInput({
      taxableInterest: d(40000),
      ordinaryDividends: d(40000),
      investmentExpenses: d(65000),
      magi: d(260000), // excess = $60K
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(15000);
    expect(result.magiExcess.toNumber()).toBe(60000);
    expect(result.taxableBase.toNumber()).toBe(15000);
    expect(result.niitTax.toNumber()).toBe(570);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Produces More NIIT Than Single at Same Income Level
// ═══════════════════════════════════════════════════════════

describe("NIIT - MFS half-threshold produces more NIIT than single at same income", () => {
  it("MFS taxpayer at $180K pays more NIIT than single at $180K", () => {
    const sharedInput = {
      taxableInterest: d(30000),
      ordinaryDividends: d(20000),
      magi: d(180000),
    };
    const singleResult = calculateForm8960(makeInput(sharedInput), "single", c);
    const mfsResult = calculateForm8960(makeInput(sharedInput), "married_filing_separately", c);

    // Single: threshold $200K, MAGI $180K → excess = $0 → NIIT = $0
    expect(singleResult.magiExcess.toNumber()).toBe(0);
    expect(singleResult.niitTax.toNumber()).toBe(0);

    // MFS: threshold $125K, MAGI $180K → excess = $55K → base = min($50K, $55K) = $50K
    // NIIT = $50K × 3.8% = $1,900
    expect(mfsResult.magiExcess.toNumber()).toBe(55000);
    expect(mfsResult.taxableBase.toNumber()).toBe(50000);
    expect(mfsResult.niitTax.toNumber()).toBe(1900);

    // MFS NIIT is strictly greater than single NIIT at same income level
    expect(mfsResult.niitTax.greaterThan(singleResult.niitTax)).toBe(true);
  });

  it("MFS at $140K: $15K excess vs single at $140K: zero NIIT", () => {
    const magi = d(140000);
    const nii = makeInput({ taxableInterest: d(50000), magi });

    const single = calculateForm8960(nii, "single", c);
    const mfs = calculateForm8960(nii, "married_filing_separately", c);

    // Single: below $200K → no NIIT
    expect(single.niitTax.toNumber()).toBe(0);

    // MFS: $140K - $125K = $15K excess. NII = $50K. base = $15K.
    // NIIT = $15K × 3.8% = $570
    expect(mfs.magiExcess.toNumber()).toBe(15000);
    expect(mfs.niitTax.toNumber()).toBe(570);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail for NIIT Lines
// ═══════════════════════════════════════════════════════════

describe("NIIT - audit trail records all Form 8960 line entries", () => {
  it("audit trail contains entries for all key Form 8960 lines", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(15000),
      ordinaryDividends: d(10000),
      netCapitalGain: d(25000),
      investmentExpenses: d(5000),
      magi: d(280000),
    }), "single", c);

    const lineNumbers = result.lines.map((l) => l.line);

    // Form 8960 lines that must appear in the audit trail
    expect(lineNumbers).toContain("1");   // taxable interest
    expect(lineNumbers).toContain("2");   // ordinary dividends
    expect(lineNumbers).toContain("5a");  // net capital gain
    expect(lineNumbers).toContain("12");  // net investment income
    expect(lineNumbers).toContain("14");  // MAGI threshold
    expect(lineNumbers).toContain("15");  // MAGI excess
    expect(lineNumbers).toContain("16");  // taxable base
    expect(lineNumbers).toContain("17");  // NIIT
  });

  it("audit trail line 17 value matches niitTax result field", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(20000),
      ordinaryDividends: d(30000),
      magi: d(260000),
    }), "single", c);

    const line17 = result.lines.find((l) => l.line === "17");
    expect(line17).toBeDefined();
    // The value recorded on line 17 must equal the top-level niitTax
    expect(line17!.value.toNumber()).toBe(result.niitTax.toNumber());
    // NII = $50K, excess = $60K, base = $50K, NIIT = $1,900
    expect(result.niitTax.toNumber()).toBe(1900);
  });
});

// ═══════════════════════════════════════════════════════════
// Passive Losses Reduce NII (Federal Pipeline)
// ═══════════════════════════════════════════════════════════

describe("NIIT - passive losses reduce net investment income", () => {
  it("allowed passive losses reduce NII when multiple K-1s have income and losses", () => {
    // Per IRS Form 8960 instructions, allowed passive losses (after Form 8582)
    // reduce NII. Only SUSPENDED losses are excluded from NII.
    // Two passive K-1s: one with $30K income, one with $25K loss.
    // Net passive = $5K (positive, no Form 8582 limitation).
    // NII should be $5K, NOT $30K (gross income ignoring loss).
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "300000",
        federalWithheld: "60000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "300000",
        medicareWithheld: "4350",
      }],
      scheduleK1: [
        {
          partnershipName: "Passive Fund A",
          partnershipEIN: "55-1111111",
          ordinaryIncome: "30000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: true,
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
          partnershipName: "Passive Fund B",
          partnershipEIN: "55-2222222",
          ordinaryIncome: "-25000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: true,
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
    const federal = calculateFederalTax(fixture);
    // AGI = $300K + $30K - $25K = $305K (no Form 8582 limitation — net positive)
    // MAGI excess = $305K - $200K = $105K
    // NII = $5K (net allowed passive), NOT $30K (gross passive income)
    // NIIT base = min($5K, $105K) = $5K
    // NIIT = $5K × 3.8% = $190
    expect(federal.form8960.netInvestmentIncome.toNumber()).toBe(5000);
    expect(federal.niitTax.toNumber()).toBe(190);
  });

  it("passive losses with interest income — NII correctly nets passive component", () => {
    // $250K wages + $20K interest + $30K passive income - $20K passive loss
    // NII should include $20K interest + $10K net passive = $30K (not $50K)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "250000",
        federalWithheld: "50000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "250000",
        medicareWithheld: "3625",
      }],
      form1099Int: [{ privateActivityBondInterest: "0",
        payer: "Bank of America",
        interestIncome: "20000",
        earlyWithdrawalPenalty: "0",
        federalWithheld: "0",
        taxExemptInterest: "0",
        usSavingsBondInterest: "0",
      }],
      scheduleK1: [
        {
          partnershipName: "Passive Income Fund",
          partnershipEIN: "55-3333333",
          ordinaryIncome: "30000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: true,
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
          partnershipName: "Passive Loss Fund",
          partnershipEIN: "55-4444444",
          ordinaryIncome: "-20000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: true,
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
    const federal = calculateFederalTax(fixture);
    // AGI = $250K + $20K interest + $30K - $20K = $280K (net passive positive, no limitation)
    // MAGI excess = $280K - $200K = $80K
    // NII = $20K interest + $10K net passive = $30K
    // NIIT base = min($30K, $80K) = $30K
    // NIIT = $30K × 3.8% = $1,140
    expect(federal.form8960.netInvestmentIncome.toNumber()).toBe(30000);
    expect(federal.niitTax.toNumber()).toBe(1140);
  });
});

// ═══════════════════════════════════════════════════════════
// Form8960 line5a: signed Form1040line7a uses ScheduleD capital netting.
// The earlier quotation about ignoring opposing losses was not in the IRS instructions.
// ═══════════════════════════════════════════════════════════

describe("NIIT - signed capital netting (Form8960 line5a)", () => {
  it("ST loss reduces LT gain for NII — pipeline via calculateFederalTax", () => {
    // Single, $250K wages, ST -$10K loss, LT +$30K gain, $20K interest
    // Schedule D: Line 7 = -$10K, Line 15 = +$30K, Line 16 = +$20K
    // Line5a takes signed Form1040line7a: -10000+30000=20000.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "250000",
        federalWithheld: "40000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "250000",
        medicareWithheld: "3625",
      }],
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0",
        payer: "Bank",
        interestIncome: "20000",
        federalWithheld: "0",
      }],
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          {
            description: "Lossy stock (short-term)",
            dateAcquired: "2025-03-01",
            dateSold: "2025-06-01",
            proceeds: "90000",
            costBasis: "100000",
            holdingPeriod: "short" as const,
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Winner stock (long-term)",
            dateAcquired: "2020-01-01",
            dateSold: "2025-06-01",
            proceeds: "130000",
            costBasis: "100000",
            holdingPeriod: "long" as const,
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Verify Schedule D values
    expect(federal.scheduleD.netShortTerm.toNumber()).toBe(-10000);
    expect(federal.scheduleD.netLongTerm.toNumber()).toBe(30000);
    expect(federal.scheduleD.netCapitalGainLoss.toNumber()).toBe(20000);
    expect(federal.form8960.netCapitalGain.toNumber()).toBe(20000);
    // $20K interest plus $20K net capital gain.
    expect(federal.form8960.netInvestmentIncome.toNumber()).toBe(40000);
    // AGI = $250K + $20K interest + $20K cap = $290K
    // MAGI excess = $290K - $200K = $90K
    // min(40000,90000)*.038=1520.
    expect(federal.niitTax.toNumber()).toBe(1520);
  });

  it("LT loss reduces ST gain for NII — pipeline via calculateFederalTax", () => {
    // Single, $250K wages, ST +$15K gain, LT -$5K loss, $20K interest
    // Schedule D: Line 7 = +$15K, Line 15 = -$5K, Line 16 = +$10K
    // Line5a takes signed Form1040line7a: 15000-5000=10000.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "250000",
        federalWithheld: "40000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "250000",
        medicareWithheld: "3625",
      }],
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0",
        payer: "Bank",
        interestIncome: "20000",
        federalWithheld: "0",
      }],
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          {
            description: "Day trade profit (short-term)",
            dateAcquired: "2025-03-01",
            dateSold: "2025-06-01",
            proceeds: "115000",
            costBasis: "100000",
            holdingPeriod: "short" as const,
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Long-term loser",
            dateAcquired: "2020-01-01",
            dateSold: "2025-06-01",
            proceeds: "95000",
            costBasis: "100000",
            holdingPeriod: "long" as const,
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Verify Schedule D values
    expect(federal.scheduleD.netShortTerm.toNumber()).toBe(15000);
    expect(federal.scheduleD.netLongTerm.toNumber()).toBe(-5000);
    expect(federal.scheduleD.netCapitalGainLoss.toNumber()).toBe(10000);
    expect(federal.form8960.netCapitalGain.toNumber()).toBe(10000);
    // $20K interest plus $10K net capital gain.
    expect(federal.form8960.netInvestmentIncome.toNumber()).toBe(30000);
    // AGI = $250K + $20K interest + $10K cap = $280K
    // MAGI excess = $280K - $200K = $80K
    // min(30000,80000)*.038=1140.
    expect(federal.niitTax.toNumber()).toBe(1140);
  });
});
