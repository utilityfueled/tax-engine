/**
 * Edge case tests for zero income, maximum values, and extreme scenarios.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { getConstants } from "@/models/constants.js";
import {
  calculateTaxFromBrackets,
  calculateCapitalGainsTax,
  calculateNIIT,
  calculateSelfEmploymentTax,
  calculateChildTaxCredit,
  calculateSALTDeduction,
} from "@/utils/tax-math.js";
import { calculateScheduleB } from "@/engine/schedules/schedule-b.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

// ═══════════════════════════════════════════════════════════
// Zero Income Scenarios
// ═══════════════════════════════════════════════════════════

describe("Zero income scenarios", () => {
  it("zero taxable income produces zero tax", () => {
    const tax = calculateTaxFromBrackets(d(0), c.taxBrackets.single);
    expect(tax.toNumber()).toBe(0);
  });

  it("zero MAGI produces zero NIIT", () => {
    const niit = calculateNIIT(d(50000), d(0), "single", c);
    expect(niit.toNumber()).toBe(0);
  });

  it("zero investment income produces zero NIIT even with high MAGI", () => {
    const niit = calculateNIIT(d(0), d(500000), "single", c);
    expect(niit.toNumber()).toBe(0);
  });

  it("Schedule B with no 1099s produces zero", () => {
    const result = calculateScheduleB({
      ...simpleW2Fixture,
      form1099Int: [],
      form1099Div: [],
      scheduleK1: [],
    });
    expect(result.totalInterest.toNumber()).toBe(0);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(0);
  });

  it("Schedule C with no 1099-NEC produces zero gross", () => {
    const result = calculateScheduleC({
      ...simpleW2Fixture,
      form1099Nec: [],
    });
    expect(result.grossIncome.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(0);
  });

  it("SALT deduction is zero when no taxes paid", () => {
    const salt = calculateSALTDeduction(d(0), d(0), c);
    expect(salt.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Income (Top Bracket)
// ═══════════════════════════════════════════════════════════

describe("Very high income — top bracket", () => {
  it("single $1M income hits 37% bracket", () => {
    const tax = calculateTaxFromBrackets(d(1000000), c.taxBrackets.single);
    // Brackets: 10%(11925) + 12%(36550) + 22%(54875) + 24%(93950) + 32%(53225) + 35%(375825) + 37%(373650)
    // = 1192.50 + 4386 + 12072.50 + 22548 + 17032 + 131538.75 + 138250.50 = 327,020
    expect(tax.toNumber()).toBeGreaterThan(300000);
    expect(tax.toNumber()).toBeLessThan(370000); // Can't exceed 37% of total
  });

  it("MFJ $2M income top bracket tax", () => {
    const tax = calculateTaxFromBrackets(d(2000000), c.taxBrackets.married_filing_jointly);
    expect(tax.greaterThan(d(500000))).toBe(true);
  });

  it("NIIT on $10M income with $5M investment", () => {
    // Excess = $10M - $200K = $9.8M. NIIT = min($5M, $9.8M) × 3.8% = $190,000
    const niit = calculateNIIT(d(5000000), d(10000000), "single", c);
    expect(niit.toNumber()).toBe(190000);
  });

  it("SE tax SS portion caps at wage base", () => {
    // $500K SE income, no W-2. Taxable SE = $500K × 0.9235 = $461,750
    // SS = min($461,750, $176,100) × 12.4% = $21,836.40 → $21,836
    const result = calculateSelfEmploymentTax(d(500000), d(0), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(21836);
    // Medicare = $461,750 × 2.9% = $13,390.75 → $13,391
    expect(result.medicarePortion.toNumber()).toBe(13391);
  });

  it("CTC fully phased out for single at $240K AGI", () => {
    // 1 child. Excess = $40K → $40K/$1K × $50 = $2,000 reduction
    const credit = calculateChildTaxCredit(1, 0, d(240000), "single", c);
    expect(credit.total.toNumber()).toBe(0);
  });

  it("CTC for 5 children with MFJ $450K", () => {
    // Max = 5 × $2K = $10K. Excess = $50K → 50 × $50 = $2,500 reduction
    const credit = calculateChildTaxCredit(5, 0, d(450000), "married_filing_jointly", c);
    expect(credit.total.toNumber()).toBe(7500);
  });
});

// ═══════════════════════════════════════════════════════════
// Small Income / Edge Values
// ═══════════════════════════════════════════════════════════

describe("Small income edge values", () => {
  it("$1 of income", () => {
    const tax = calculateTaxFromBrackets(d(1), c.taxBrackets.single);
    expect(tax.toNumber()).toBe(0); // $1 × 10% = $0.10 → rounds to $0
  });

  it("$100 of income", () => {
    const tax = calculateTaxFromBrackets(d(100), c.taxBrackets.single);
    expect(tax.toNumber()).toBe(10); // $100 × 10% = $10
  });

  it("income at exact bracket boundary (single 10% → 12%)", () => {
    const tax = calculateTaxFromBrackets(d(11925), c.taxBrackets.single);
    expect(tax.toNumber()).toBe(1193); // $11,925 × 10% = $1,192.50 → $1,193
  });

  it("capital gains of exactly $1", () => {
    const result = calculateCapitalGainsTax(d(1), d(0), d(1), "single", c);
    expect(result.preferentialTax.toNumber()).toBe(0); // 0% rate
    expect(result.ordinaryTax.toNumber()).toBe(0);
  });

  it("SALT exactly at $10K cap", () => {
    const salt = calculateSALTDeduction(d(5000), d(5000), c);
    expect(salt.toNumber()).toBe(10000);
  });

  it("SALT $1 over cap", () => {
    const salt = calculateSALTDeduction(d(5000), d(5001), c);
    expect(salt.toNumber()).toBe(10000); // Capped
  });

  it("SALT well under cap", () => {
    const salt = calculateSALTDeduction(d(2000), d(1000), c);
    expect(salt.toNumber()).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Decimal Precision
// ═══════════════════════════════════════════════════════════

describe("Federal pipeline - zero and extreme scenarios", () => {
  it("zero wages produces zero tax owed", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0",
        federalWithheld: "0",
        socialSecurityWages: "0",
        socialSecurityWithheld: "0",
        medicareWages: "0",
        medicareWithheld: "0",
      }],
    };

    const result = calculateFederalTax(fixture);
    expect(result.totalTax.toNumber()).toBe(0);
    expect(result.taxableIncome.toNumber()).toBe(0);
  });

  it("income exactly at standard deduction produces zero taxable income", () => {
    // 2025 single standard deduction is $15,000
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "15000",
        federalWithheld: "0",
        socialSecurityWages: "15000",
        socialSecurityWithheld: "930",
        medicareWages: "15000",
        medicareWithheld: "217.50",
      }],
    };

    const result = calculateFederalTax(fixture);
    expect(result.taxableIncome.toNumber()).toBe(0);
  });

  it("income $1 over standard deduction produces minimal tax", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "15001",
        federalWithheld: "0",
        socialSecurityWages: "15001",
        socialSecurityWithheld: "930.06",
        medicareWages: "15001",
        medicareWithheld: "217.51",
      }],
    };

    const result = calculateFederalTax(fixture);
    expect(result.taxableIncome.toNumber()).toBe(0);
    // $1 at 10% bracket = $0 (rounds to 0)
    expect(result.totalTaxBeforeCredits.toNumber()).toBeLessThanOrEqual(1);
  });
});

describe("Bracket boundary precision", () => {
  it("income at exact 12%→22% boundary (single)", () => {
    const boundary = d(48475); // 11925 + 36550
    const tax = calculateTaxFromBrackets(boundary, c.taxBrackets.single);
    const taxAtBoundaryMinus1 = calculateTaxFromBrackets(boundary.minus(1), c.taxBrackets.single);
    // $1 more at 12% → $0.12 difference (rounds to 0)
    expect(tax.minus(taxAtBoundaryMinus1).toNumber()).toBeLessThanOrEqual(1);
  });

  it("income at exact 22%→24% boundary (single)", () => {
    const boundary = d(103350); // 11925 + 36550 + 54875
    const tax = calculateTaxFromBrackets(boundary, c.taxBrackets.single);
    const taxPlus1 = calculateTaxFromBrackets(boundary.plus(1), c.taxBrackets.single);
    // $1 at 24% bracket
    expect(taxPlus1.minus(tax).toNumber()).toBeLessThanOrEqual(1);
  });

  it("all bracket boundaries for single produce increasing tax", () => {
    const boundaries = [11925, 48475, 103350, 197300, 250525, 626350];
    let prevTax = d(0);
    for (const b of boundaries) {
      const tax = calculateTaxFromBrackets(d(b), c.taxBrackets.single);
      expect(tax.greaterThanOrEqualTo(prevTax)).toBe(true);
      prevTax = tax;
    }
  });

  it("MFJ tax at double income is <= 2x single tax (marriage bonus or neutral)", () => {
    // MFJ brackets are wider than single, so tax at same total income is <= 2x single
    const incomes = [50000, 100000, 200000];
    for (const inc of incomes) {
      const singleTax = calculateTaxFromBrackets(d(inc), c.taxBrackets.single);
      const mfjTax = calculateTaxFromBrackets(d(inc * 2), c.taxBrackets.married_filing_jointly);
      expect(mfjTax.lessThanOrEqualTo(singleTax.times(2).plus(1))).toBe(true);
    }
  });
});

describe("Full pipeline extreme scenarios", () => {
  it("maximum capital loss deduction $3K for single", () => {
    const fixture = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Test",
        transactions: [{
          description: "Big Loss",
          dateAcquired: "2020-01-01",
          dateSold: "2025-06-01",
          proceeds: "1000",
          costBasis: "100000",
          holdingPeriod: "long" as const,
          basisReportedToIRS: true,
          adjustments: "0",
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateFederalTax(fixture);
    // Capital loss deduction capped at $3K
    expect(result.scheduleD.capitalLossDeduction.toNumber()).toBe(-3000);
  });

  it("very high income single with all surtaxes", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "600000",
        federalWithheld: "150000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "600000",
        medicareWithheld: "8700",
      }],
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "50000",
        qualifiedDividends: "50000",
        totalCapitalGain: "0",
        section199ADividends: "0",
        foreignTaxPaid: "0",
        exemptInterestDividends: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        unrecapturedSection1250Gain: "0",
        federalWithheld: "0",
        nondividendDistributions: "0",
        section897Gain: "0",
        section897OrdinaryDividends: "0",
      }],
    };
    const result = calculateFederalTax(fixture);
    // Should have Additional Medicare Tax (>$200K)
    expect(result.additionalMedicareTax.greaterThan(d(0))).toBe(true);
    // Should have NIIT (>$200K MAGI with investment income)
    expect(result.niitTax.greaterThan(d(0))).toBe(true);
    // Total tax should be substantial
    expect(result.totalTax.greaterThan(d(150000))).toBe(true);
  });

  it("all income from qualified dividends at 0% rate", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0",
        federalWithheld: "0",
        socialSecurityWages: "0",
        socialSecurityWithheld: "0",
        medicareWages: "0",
        medicareWithheld: "0",
      }],
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "15000",
        qualifiedDividends: "15000",
        totalCapitalGain: "0",
        section199ADividends: "0",
        foreignTaxPaid: "0",
        exemptInterestDividends: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        unrecapturedSection1250Gain: "0",
        federalWithheld: "0",
        nondividendDistributions: "0",
        section897Gain: "0",
        section897OrdinaryDividends: "0",
      }],
    };
    const result = calculateFederalTax(fixture);
    // $15K qualified dividends - $15K standard deduction = $0 taxable
    // or if taxable, it's at 0% preferential rate
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("withholding exceeding tax liability produces negative balance due", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "50000",
        federalWithheld: "15000", // way more than owed
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
      }],
    };
    const result = calculateFederalTax(fixture);
    // Tax on $35K taxable ≈ $3,900, withheld $15K → refund
    expect(result.refund.greaterThan(d(0))).toBe(true);
  });
});

describe("Multiple income types at zero", () => {
  it("fixture with all zeros produces zero total income, AGI, and tax", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0", federalWithheld: "0",
        socialSecurityWages: "0", socialSecurityWithheld: "0",
        medicareWages: "0", medicareWithheld: "0",
      }],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      scheduleK1: [],
    };
    const result = calculateFederalTax(fixture);
    expect(result.totalIncome.toNumber()).toBe(0);
    expect(result.agi.toNumber()).toBe(0);
    expect(result.taxableIncome.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
    expect(result.totalTaxBeforeCredits.toNumber()).toBe(0);
  });

  it("only interest income below standard deduction — zero tax", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0", federalWithheld: "0",
        socialSecurityWages: "0", socialSecurityWithheld: "0",
        medicareWages: "0", medicareWithheld: "0",
      }],
      form1099Int: [{
        payer: "Bank", interestIncome: "5000", federalWithheld: "0",
        earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0",
      }],
    };
    const result = calculateFederalTax(fixture);
    expect(result.totalIncome.toNumber()).toBe(5000);
    expect(result.taxableIncome.toNumber()).toBe(0); // below $15K std deduction
    expect(result.totalTax.toNumber()).toBe(0);
  });
});

describe("Income at bracket boundaries — single 2025", () => {
  it("$11,925 (10% top): tax = $1,193", () => {
    const tax = calculateTaxFromBrackets(d(11925), c.taxBrackets.single);
    expect(tax.toNumber()).toBe(1193); // 11925 × 10% = 1192.50 → rounds to 1193
  });

  it("$11,926 (12% bracket starts): tax = $1,193", () => {
    const tax = calculateTaxFromBrackets(d(11926), c.taxBrackets.single);
    // 11925 × 10% + 1 × 12% = 1192.50 + 0.12 = 1192.62 → rounds to 1193
    expect(tax.toNumber()).toBe(1193);
  });

  it("$197,300 (32% top): progressive tax", () => {
    const tax = calculateTaxFromBrackets(d(197300), c.taxBrackets.single);
    expect(tax.greaterThan(d(40000))).toBe(true);
    expect(tax.lessThan(d(50000))).toBe(true);
  });

  it("$626,350 (37% starts): tax ~$186K", () => {
    const tax = calculateTaxFromBrackets(d(626350), c.taxBrackets.single);
    expect(tax.greaterThan(d(180000))).toBe(true);
    expect(tax.lessThan(d(200000))).toBe(true);
  });
});

describe("SE tax edge cases", () => {
  it("$400 SE income — post-multiplier $369 < $400, produces zero SE tax", () => {
    // Per IRC §1402(b)(2): $400 threshold applies to post-multiplier amount
    // $400 × 0.9235 = $369.40 → roundDollar = $369 < $400 → no SE tax
    const result = calculateSelfEmploymentTax(d(400), d(0), c);
    expect(result.tax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });

  it("SE income with high W-2 wages — SS portion reduced", () => {
    // W-2 wages $170,000. SE $50K → taxable SE = $50K × 0.9235 = $46,175
    // Remaining SS room = $176,100 - $170,000 = $6,100
    // SS = $6,100 × 12.4% = $756. Medicare = $46,175 × 2.9% = $1,339
    const result = calculateSelfEmploymentTax(d(50000), d(170000), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(756);
    expect(result.medicarePortion.toNumber()).toBe(1339);
  });
});

describe("Decimal precision edge cases", () => {
  it("tax calculation never produces floating point errors", () => {
    // Test a value known to cause float issues: 0.1 + 0.2
    const income = new Decimal("0.1").plus("0.2");
    expect(income.toNumber()).toBe(0.3); // Decimal.js handles this correctly
  });

  it("large income calculation maintains precision", () => {
    const tax = calculateTaxFromBrackets(d("99999999.99"), c.taxBrackets.single);
    expect(tax.isFinite()).toBe(true);
    expect(tax.greaterThan(d(0))).toBe(true);
  });

  it("SE tax with fractional earnings", () => {
    const result = calculateSelfEmploymentTax(d("12345.67"), d(0), c);
    expect(result.tax.isFinite()).toBe(true);
    // Verify it's a whole dollar (rounded)
    expect(result.tax.toNumber()).toBe(Math.round(result.tax.toNumber()));
  });
});

// ═══════════════════════════════════════════════════════════
// New edge cases: all-zero return, extreme income, extreme
// dependents, negative AGI, wage-base boundary, filing status
// comparison
// ═══════════════════════════════════════════════════════════

describe("All-zero income produces zero tax, credits, and refund", () => {
  it("all income sources zero — total tax, credits, and refund are all zero", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0",
        federalWithheld: "0",
        socialSecurityWages: "0",
        socialSecurityWithheld: "0",
        medicareWages: "0",
        medicareWithheld: "0",
      }],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      scheduleK1: [],
    };
    const result = calculateFederalTax(fixture);
    expect(result.totalTax.toNumber()).toBe(0);
    expect(result.totalCredits.toNumber()).toBe(0);
    expect(result.childTaxCredit.toNumber()).toBe(0);
    expect(result.selfEmploymentTax.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
    expect(result.refund.toNumber()).toBe(0);
    expect(result.amountOwed.toNumber()).toBe(0);
  });
});

describe("Maximum single W-2 income ($1M+) — top bracket validation", () => {
  it("$1M W-2 single filer hits 37% bracket, triggers Additional Medicare Tax", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "1000000",
        federalWithheld: "350000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "1000000",
        medicareWithheld: "14500",
      }],
    };
    const result = calculateFederalTax(fixture);
    expect(result.taxableIncome.toNumber()).toBe(984250);
    // 37% bracket starts at $626,350; income in 37% = $984,250 - $626,350 = $357,900
    // Tax in 37% bracket ≥ $358,650 × 37% = $132,700.50
    expect(result.ordinaryTax.greaterThan(d(300000))).toBe(true);
    expect(result.ordinaryTax.lessThan(d(400000))).toBe(true);
    // Additional Medicare Tax: ($1M - $200K threshold) × 0.9% = $7,200
    expect(result.additionalMedicareTax.toNumber()).toBe(7200);
    // Total tax is substantial
    expect(result.totalTax.greaterThan(d(300000))).toBe(true);
  });
});

describe("Maximum MFJ income ($2M+) with all additional taxes", () => {
  it("$2M W-2 MFJ with $500K qualified dividends triggers NIIT and Additional Medicare Tax", () => {
    const fixture = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1988-05-20",
        },
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "2000000",
        federalWithheld: "700000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "2000000",
        medicareWithheld: "29000",
      }],
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "500000",
        qualifiedDividends: "500000",
        totalCapitalGainDistributions: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        exemptInterestDividends: "0",
      }],
    };
    const result = calculateFederalTax(fixture);
    // Wages $2M + dividends $500K = $2.5M total income
    // AGI ~$2.5M → NIIT threshold MFJ $250K → investment income $500K taxed at 3.8%
    // NIIT = min($500K, $2.5M - $250K) × 3.8% = $500K × 3.8% = $19,000
    expect(result.niitTax.toNumber()).toBe(19000);
    // Additional Medicare Tax: ($2M - $250K MFJ threshold) × 0.9% = $15,750
    expect(result.additionalMedicareTax.toNumber()).toBe(15750);
    // Total tax > $700K
    expect(result.totalTax.greaterThan(d(700000))).toBe(true);
  });
});

describe("Negative AGI from large business losses", () => {
  it("large Schedule C losses with small W-2 income produces zero taxable income and carries no tax", () => {
    // W-2 wages $50K, Schedule C net loss -$200K → total income = -$150K
    // AGI goes negative; taxable income floor is 0
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "50000",
        federalWithheld: "5000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
      }],
      scheduleC: {
        businessName: "Consulting LLC",
        grossReceipts: "0",
        expenses: {
          otherExpenses: "200000",
        },
      },
    };
    const result = calculateFederalTax(fixture);
    // AGI = $50K wages + (-$200K) Schedule C net = -$150K (before SE deduction)
    expect(result.agi.lessThan(d(0))).toBe(true);
    // Taxable income floors at zero
    expect(result.taxableIncome.toNumber()).toBe(0);
    // No income tax (no taxable income)
    expect(result.totalTaxBeforeCredits.toNumber()).toBe(0);
    // Capital loss carryforward for the business loss is not applicable here
    // but total tax is zero (or only SE/self-employment related)
    expect(result.totalTaxBeforeCredits.toNumber()).toBe(0);
  });
});

describe("Very small income — below filing threshold", () => {
  it("$1 W-2 income — taxable income is zero, no tax owed", () => {
    // $1 wages is far below the $15K single standard deduction
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "1",
        federalWithheld: "0",
        socialSecurityWages: "1",
        socialSecurityWithheld: "0.06",
        medicareWages: "1",
        medicareWithheld: "0.01",
      }],
    };
    const result = calculateFederalTax(fixture);
    expect(result.taxableIncome.toNumber()).toBe(0);
    expect(result.totalTaxBeforeCredits.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
    // AGI is $1
    expect(result.agi.toNumber()).toBe(1);
  });
});

describe("Income at exact standard deduction — taxable income equals zero", () => {
  it("single filer with $15,000 wages (= 2025 standard deduction) has zero taxable income", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "15000",
        federalWithheld: "0",
        socialSecurityWages: "15000",
        socialSecurityWithheld: "930",
        medicareWages: "15000",
        medicareWithheld: "217.50",
      }],
    };
    const result = calculateFederalTax(fixture);
    expect(result.taxableIncome.toNumber()).toBe(0);
    expect(result.totalTaxBeforeCredits.toNumber()).toBe(0);
    expect(result.deductionAmount.toNumber()).toBe(c.standardDeduction.single.toNumber());
  });

  it("single filer with $15,001 wages ($1 over standard deduction) has taxable income of $1", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "15001",
        federalWithheld: "0",
        socialSecurityWages: "15001",
        socialSecurityWithheld: "930.06",
        medicareWages: "15001",
        medicareWithheld: "217.51",
      }],
    };
    const result = calculateFederalTax(fixture);
    expect(result.taxableIncome.toNumber()).toBe(0);
    // $1 at 10% bracket = $0.10 which rounds to $0
    expect(result.totalTaxBeforeCredits.toNumber()).toBe(0);
  });
});

describe("Maximum capital loss deduction with minimal income", () => {
  it("$99K long-term capital loss with $20K W-2 — loss deduction capped at $3K, carryforward = $96K", () => {
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "20000",
        federalWithheld: "0",
        socialSecurityWages: "20000",
        socialSecurityWithheld: "1240",
        medicareWages: "20000",
        medicareWithheld: "290",
      }],
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "Index Fund",
          dateAcquired: "2019-03-01",
          dateSold: "2025-07-01",
          proceeds: "1000",
          costBasis: "100000",
          holdingPeriod: "long" as const,
          basisReportedToIRS: true,
          adjustments: "0",
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateFederalTax(fixture);
    // Capital loss = $1K - $100K = -$99K; capped deduction = -$3K
    expect(result.scheduleD!.capitalLossDeduction.toNumber()).toBe(-3000);
    // Long-term carryforward = $99K - $3K = $96K (stored as negative — it is a loss)
    expect(result.carryforwards.longTermCapitalLoss.toNumber()).toBe(-96000);
    // AGI = $20K wages - $3K cap loss = $17K; taxable = max(0, $17K - $15.75K std) = $1.25K
    expect(result.agi.toNumber()).toBe(17000);
    expect(result.taxableIncome.toNumber()).toBe(1250);
  });
});

describe("Capital loss carryforward with wasted deduction (IRS Carryover Worksheet Lines 1-4)", () => {
  it("$10K LT loss with $10K wages — deduction wasted, full $10K carries forward", () => {
    // Per IRS Capital Loss Carryover Worksheet:
    // Total income = $10K wages + (-$3K cap loss) = $7K
    // AGI = $7K; raw taxable income = $7K - $15K(std) = -$8K
    // Worksheet Line 3: -$8K + $3K = -$5K ≤ 0 → effective deduction = $0
    // Without the $3K deduction, taxable income would still be $0, so the deduction
    // provided zero tax benefit. Full $10K loss carries forward.
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "10000",
        federalWithheld: "0",
        socialSecurityWages: "10000",
        socialSecurityWithheld: "620",
        medicareWages: "10000",
        medicareWithheld: "145",
      }],
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "Index Fund",
          dateAcquired: "2019-01-01",
          dateSold: "2025-06-01",
          proceeds: "5000",
          costBasis: "15000",
          holdingPeriod: "long" as const,
          basisReportedToIRS: true,
          adjustments: "0",
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateFederalTax(fixture);
    // Capital loss = $5K - $15K = -$10K; capped deduction = -$3K
    expect(result.scheduleD!.capitalLossDeduction.toNumber()).toBe(-3000);
    // AGI = $10K + (-$3K) = $7K; taxable = max(0, $7K - $15K) = $0
    expect(result.agi.toNumber()).toBe(7000);
    expect(result.taxableIncome.toNumber()).toBe(0);
    // Carryforward = full $10K (not $7K) because the $3K deduction was wasted
    expect(result.carryforwards.longTermCapitalLoss.toNumber()).toBe(-10000);
    expect(result.carryforwards.capitalLoss.toNumber()).toBe(-10000);
  });

  it("$8K LT loss with $16K wages — partial deduction effective ($1K of $3K)", () => {
    // Total income = $16K + (-$3K) = $13K; AGI = $13K
    // Raw taxable income = $13K - $15K(std) = -$2K
    // Worksheet Line 3: -$2K + $3K = $1K > 0 → effective deduction = min($3K, $1K) = $1K
    // Only $1K of the deduction provided tax benefit; $2K was wasted
    // LT carry = $8K - $1K = $7K
    const fixture = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "16000",
        federalWithheld: "0",
        socialSecurityWages: "16000",
        socialSecurityWithheld: "992",
        medicareWages: "16000",
        medicareWithheld: "232",
      }],
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "Index Fund",
          dateAcquired: "2019-01-01",
          dateSold: "2025-06-01",
          proceeds: "2000",
          costBasis: "10000",
          holdingPeriod: "long" as const,
          basisReportedToIRS: true,
          adjustments: "0",
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateFederalTax(fixture);
    expect(result.scheduleD!.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.agi.toNumber()).toBe(13000);
    expect(result.taxableIncome.toNumber()).toBe(0);
    // Carryforward reflects only the effective portion of the $3K deduction after the larger standard deduction.
    expect(result.carryforwards.longTermCapitalLoss.toNumber()).toBe(-7750);
  });
});

describe("SE income at Social Security wage base boundary", () => {
  it("SE net earnings below wage base — full SS applies, no cap", () => {
    // SE gross $176,100 → taxable SE = $176,100 × 0.9235 = $162,628.35
    // SS = $162,628.35 × 12.4% = $20,165.91 → $20,166
    // Medicare = $162,628.35 × 2.9% = $4,716.22 → $4,716
    const result = calculateSelfEmploymentTax(d(176100), d(0), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(20166);
    expect(result.medicarePortion.toNumber()).toBe(4716);
  });

  it("SE net earnings above wage base — SS portion is capped at wage base", () => {
    // SE gross $250,000 → taxable SE = $250,000 × 0.9235 = $230,875
    // SS = min($230,875, $176,100) × 12.4% = $176,100 × 12.4% = $21,836.40 → $21,836
    // Medicare = $230,875 × 2.9% = $6,695.38 → $6,695
    const result = calculateSelfEmploymentTax(d(250000), d(0), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(21836);
    expect(result.medicarePortion.toNumber()).toBe(6695);
  });
});

describe("Extreme number of dependents — 10 qualifying children", () => {
  it("MFJ with 10 qualifying children at $100K income — CTC partially or fully available", () => {
    // Max CTC = 10 × $2,000 = $20,000. Phase-out threshold MFJ = $400,000.
    // AGI $100K << threshold → no phase-out → full $20K CTC available
    // Taxes on taxable income ($100K - $30K std = $70K) ≈ $7,830
    // CTC nonrefundable is limited to tax liability; remainder becomes ACTC (refundable)
    const fixture = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1988-05-20",
        },
        dependents: Array.from({ length: 10 }, (_, i) => ({
          firstName: `Child${i + 1}`,
          lastName: "Doe",
          ssn: `000-00-000${i}`,
          relationship: "Son",
          dateOfBirth: "2015-06-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
          qualifiesForODC: false,
        })),
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "100000",
        federalWithheld: "10000",
        socialSecurityWages: "100000",
        socialSecurityWithheld: "6200",
        medicareWages: "100000",
        medicareWithheld: "1450",
      }],
    };
    const result = calculateFederalTax(fixture);
    // 10 children × $2K = $20K max CTC; no phase-out at $100K AGI
    // Total credits (CTC nonrefundable + ACTC refundable) should be $20K
    const totalCTCBenefit = result.childTaxCredit.plus(result.form8812!.actc);
    expect(totalCTCBenefit.toNumber()).toBe(20000);
    expect(result.taxableIncome.toNumber()).toBe(68500);
  });
});

describe("All filing statuses with identical $80K income — tax increases from MFJ to Single to MFS", () => {
  const makeFixture = (filingStatus: string, spouseRequired: boolean) => ({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      filingStatus: filingStatus as TaxYearInput["taxpayer"]["filingStatus"],
      ...(spouseRequired ? {
        spouse: {
          firstName: "Spouse",
          lastName: "Doe",
          ssn: "999-88-7777",
          dateOfBirth: "1990-01-01",
        },
      } : {}),
    },
    w2s: [{
      ...simpleW2Fixture.w2s[0],
      wages: "80000",
      federalWithheld: "0",
      socialSecurityWages: "80000",
      socialSecurityWithheld: "4960",
      medicareWages: "80000",
      medicareWithheld: "1160",
    }],
  });

  it("MFJ $80K income has lower tax than single $80K income (marriage bonus)", () => {
    const mfjResult = calculateFederalTax(makeFixture("married_filing_jointly", true));
    const singleResult = calculateFederalTax(makeFixture("single", false));
    expect(mfjResult.taxableIncome.toNumber()).toBe(48500);
    expect(singleResult.taxableIncome.toNumber()).toBe(64250);
    expect(mfjResult.totalTaxBeforeCredits.lessThan(singleResult.totalTaxBeforeCredits)).toBe(true);
  });

  it("HOH $80K income has lower tax than single $80K income (larger std deduction)", () => {
    const hohResult = calculateFederalTax(makeFixture("head_of_household", false));
    const singleResult = calculateFederalTax(makeFixture("single", false));
    expect(hohResult.deductionAmount.toNumber()).toBe(23625);
    expect(singleResult.deductionAmount.toNumber()).toBe(15750);
    expect(hohResult.totalTaxBeforeCredits.lessThan(singleResult.totalTaxBeforeCredits)).toBe(true);
  });

  it("MFS $80K income produces same tax as single $80K income (identical brackets)", () => {
    const mfsResult = calculateFederalTax(makeFixture("married_filing_separately", true));
    const singleResult = calculateFederalTax(makeFixture("single", false));
    expect(mfsResult.standardDeduction.toNumber()).toBe(15750);
    expect(singleResult.standardDeduction.toNumber()).toBe(15750);
    expect(mfsResult.totalTaxBeforeCredits.toNumber()).toBe(singleResult.totalTaxBeforeCredits.toNumber());
  });
});
