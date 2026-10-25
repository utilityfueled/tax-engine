/**
 * Edge case tests for Schedule A — Itemized Deductions
 * Tests SALT cap ($10K/$5K MFS), medical 7.5% threshold, mortgage
 * interest debt limit, and itemized vs standard deduction interaction.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function makeFixture(overrides: Partial<TaxYearInput>): TaxYearInput {
  return {
    ...simpleW2Fixture,
    w2s: [{
      ...simpleW2Fixture.w2s[0],
      stateTaxWithheld: "0",
    }],
    form1098: [],
    donations: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// SALT Cap ($10K / $5K MFS)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - SALT cap", () => {
  it("2025 SALT allows $15K state taxes below the $40K limit", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "15000",
      }],
    }), d(100000), "single", c);
    expect(result.saltDeduction.toNumber()).toBe(15000);
  });

  it("under cap: $7K state taxes fully deductible", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "7000",
      }],
    }), d(100000), "single", c);
    expect(result.saltDeduction.toNumber()).toBe(7000);
  });

  it("exactly at $10K cap: full deduction", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "10000",
      }],
    }), d(100000), "single", c);
    expect(result.saltDeduction.toNumber()).toBe(10000);
  });

  it("2025 MFS SALT allows $8K below the $20K limit", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "8000",
      }],
    }), d(100000), "married_filing_separately", c);
    expect(result.saltDeduction.toNumber()).toBe(8000);
  });

  it("2025 MFJ SALT allows $12K below the $40K limit", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "12000",
      }],
    }), d(200000), "married_filing_jointly", c);
    expect(result.saltDeduction.toNumber()).toBe(12000);
  });

  it("SALT includes state income + property + personal property taxes", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "5000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "300000",
        propertyTax: "4000",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(100000), "single", c, { personalPropertyTaxes: d(2000) });
    expect(result.saltDeduction.toNumber()).toBe(11000);
  });

  it("zero taxes: zero SALT deduction", () => {
    const result = calculateScheduleA(makeFixture({}), d(100000), "single", c);
    expect(result.saltDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Medical Expense Threshold (7.5% AGI)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - medical 7.5% AGI threshold", () => {
  it("expenses over 7.5% AGI: excess is deductible", () => {
    // AGI $100K → threshold $7,500. Expenses $12K → deduction $4,500
    const result = calculateScheduleA(
      makeFixture({}), d(100000), "single", c,
      { medicalExpenses: d(12000) }
    );
    expect(result.medicalDeduction.toNumber()).toBe(4500);
  });

  it("expenses exactly at 7.5%: zero deduction", () => {
    const result = calculateScheduleA(
      makeFixture({}), d(100000), "single", c,
      { medicalExpenses: d(7500) }
    );
    expect(result.medicalDeduction.toNumber()).toBe(0);
  });

  it("expenses below 7.5%: zero deduction", () => {
    const result = calculateScheduleA(
      makeFixture({}), d(100000), "single", c,
      { medicalExpenses: d(5000) }
    );
    expect(result.medicalDeduction.toNumber()).toBe(0);
  });

  it("$1 over threshold: $1 deduction", () => {
    const result = calculateScheduleA(
      makeFixture({}), d(100000), "single", c,
      { medicalExpenses: d(7501) }
    );
    expect(result.medicalDeduction.toNumber()).toBe(1);
  });

  it("zero AGI: all medical expenses deductible", () => {
    const result = calculateScheduleA(
      makeFixture({}), d(0), "single", c,
      { medicalExpenses: d(5000) }
    );
    expect(result.medicalDeduction.toNumber()).toBe(5000);
  });

  it("high AGI: high threshold reduces benefit", () => {
    // AGI $500K → threshold $37,500
    const result = calculateScheduleA(
      makeFixture({}), d(500000), "single", c,
      { medicalExpenses: d(40000) }
    );
    expect(result.medicalDeduction.toNumber()).toBe(2500);
  });
});

// ═══════════════════════════════════════════════════════════
// Mortgage Interest with Debt Limit
// ═══════════════════════════════════════════════════════════

describe("Schedule A - mortgage interest", () => {
  it("mortgage under $750K: full interest deduction", () => {
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "24000",
        outstandingMortgagePrincipal: "500000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "single", c);
    expect(result.mortgageInterest.toNumber()).toBe(24000);
  });

  it("mortgage over $750K: proportional deduction", () => {
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "40000",
        outstandingMortgagePrincipal: "1000000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "single", c);
    // $750K/$1M = 75% → $40K × 75% = $30K
    expect(result.mortgageInterest.toNumber()).toBe(30000);
  });

  it("refund of overpaid interest does not reduce the 2025 deduction", () => {
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "20000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "500",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "single", c);
    expect(result.mortgageInterest.toNumber()).toBe(20000);
  });

  it("points paid included in total", () => {
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "15000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "3000",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "single", c);
    // Interest $15K + points $3K = $18K in total itemized
    expect(result.mortgageInterest.toNumber()).toBe(15000);
    expect(result.totalItemized.toNumber()).toBe(18000);
  });
});

// ═══════════════════════════════════════════════════════════
// Combined / Total Itemized
// ═══════════════════════════════════════════════════════════

describe("Schedule A - total itemized deductions", () => {
  it("all categories combined", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "8000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "300000",
        propertyTax: "3000",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "200",
      }],
      donations: [
        { recipient: "Charity", amount: "5000", type: "cash" },
      ],
    }), d(100000), "single", c, { medicalExpenses: d(10000) });
    expect(result.medicalDeduction.toNumber()).toBe(2500);
    expect(result.saltDeduction.toNumber()).toBe(11000);
    expect(result.mortgageInterest.toNumber()).toBe(12000);
    expect(result.cashCharitable.toNumber()).toBe(5000);
    expect(result.totalItemized.toNumber()).toBe(30500);
  });

  it("zero everything: zero total", () => {
    const result = calculateScheduleA(makeFixture({}), d(100000), "single", c);
    expect(result.totalItemized.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Mortgage Interest — $750K Debt Limit (additional edge cases)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - mortgage interest $750K debt limit edge cases", () => {
  it("loan at exactly $750K: full interest deduction (no proration)", () => {
    // At exactly the cap the ratio is 750K/750K = 1, so all interest is deductible
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "30000",
        outstandingMortgagePrincipal: "750000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "single", c);
    expect(result.mortgageInterest.toNumber()).toBe(30000);
  });

  it("loan at $1.5M: interest limited to 50% (750K/1500K)", () => {
    // $750K / $1,500K = 50% → $36K × 50% = $18K
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "36000",
        outstandingMortgagePrincipal: "1500000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(300000), "single", c);
    expect(result.mortgageInterest.toNumber()).toBe(18000);
  });
});

// ═══════════════════════════════════════════════════════════
// SALT — boundary and high-income edge cases
// ═══════════════════════════════════════════════════════════

describe("Schedule A - SALT boundary edge cases", () => {
  it("SALT exactly $10K (single): fully deductible, not capped", () => {
    // State income taxes of exactly $10K should pass through unchanged
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "10000",
      }],
    }), d(120000), "single", c);
    expect(result.saltDeduction.toNumber()).toBe(10000);
    expect(result.saltDeduction.toNumber()).toBeLessThanOrEqual(10000);
  });

  it("2025 single SALT allows $10,001 below the $40K limit", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "10001",
      }],
    }), d(120000), "single", c);
    expect(result.saltDeduction.toNumber()).toBe(10001);
  });

  it("2025 MFJ SALT $50K is limited to $40K below the MAGI threshold", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "50000",
      }],
    }), d(400000), "married_filing_jointly", c);
    expect(result.saltDeduction.toNumber()).toBe(40000);
  });
});

// ═══════════════════════════════════════════════════════════
// Medical Expenses — 7.5% AGI threshold boundary
// ═══════════════════════════════════════════════════════════

describe("Schedule A - medical threshold boundary edge cases", () => {
  it("medical expenses at exactly 7.5% AGI: zero deduction (threshold not crossed)", () => {
    // AGI $80K → threshold $6,000. Expenses $6,000 → excess = $0
    const result = calculateScheduleA(
      makeFixture({}), d(80000), "single", c,
      { medicalExpenses: d(6000) }
    );
    expect(result.medicalDeduction.toNumber()).toBe(0);
  });

  it("medical expenses below 7.5% AGI: zero deduction", () => {
    // AGI $200K → threshold $15,000. Expenses $10,000 → below threshold, zero deduction
    const result = calculateScheduleA(
      makeFixture({}), d(200000), "single", c,
      { medicalExpenses: d(10000) }
    );
    expect(result.medicalDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// All deduction categories simultaneously
// ═══════════════════════════════════════════════════════════

describe("Schedule A - all categories simultaneously", () => {
  it("medical + SALT + mortgage + charitable all active: each line computed independently", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "9000",
      }],
      form1098: [{
        lender: "FirstBank",
        mortgageInterestReceived: "24000",
        outstandingMortgagePrincipal: "600000",
        propertyTax: "2000",
        mortgageOriginationDate: "2021-06-15",
        refundOfOverpaidInterest: "0",
        pointsPaid: "1000",
        mortgageInsurancePremiums: "500",
      }],
      donations: [
        { recipient: "Red Cross", amount: "7000", type: "cash" },
      ],
    }), d(150000), "single", c, { medicalExpenses: d(15000) });

    expect(result.medicalDeduction.toNumber()).toBe(3750);
    expect(result.saltDeduction.toNumber()).toBe(11000);
    expect(result.mortgageInterest.toNumber()).toBe(24000);
    expect(result.cashCharitable.toNumber()).toBe(7000);
    expect(result.totalItemized.toNumber()).toBe(46750);
  });
});

// ═══════════════════════════════════════════════════════════
// Charitable Deduction AGI Limits (60% cash, 30% appreciated)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - charitable deduction AGI limits", () => {
  it("cash donations under 60% AGI: fully deductible", () => {
    // AGI $100K → 60% limit = $60K. Cash donations $20K → all deductible
    const result = calculateScheduleA(makeFixture({
      donations: [
        { organization: "Red Cross", amount: "20000", type: "cash", dateOfDonation: "2025-06-01" },
      ],
    }), d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(20000);
  });

  it("cash donations exceeding 60% AGI: capped at 60% AGI", () => {
    // AGI $100K → 60% limit = $60K. Cash donations $75K → capped at $60K
    const result = calculateScheduleA(makeFixture({
      donations: [
        { organization: "Foundation", amount: "75000", type: "cash", dateOfDonation: "2025-06-01" },
      ],
    }), d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(60000);
  });

  it("cash donations exactly at 60% AGI: fully deductible, not capped", () => {
    // AGI $200K → 60% limit = $120K. Cash donations $120K → exactly at limit
    const result = calculateScheduleA(makeFixture({
      donations: [
        { organization: "Charity", amount: "120000", type: "cash", dateOfDonation: "2025-06-01" },
      ],
    }), d(200000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(120000);
  });

  it("appreciated LTCG property donations under 30% AGI: fully deductible", () => {
    // AGI $200K → 30% limit = $60K. Appreciated stock $25K → all deductible
    const result = calculateScheduleA(makeFixture({
      donations: [
        { organization: "Museum", amount: "25000", type: "appreciated_stock", dateOfDonation: "2025-06-01", costBasis: "10000", isLongTermCapitalGain: true },
      ],
    }), d(200000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(25000);
  });

  it("appreciated LTCG property donations exceeding 30% AGI: capped at 30%", () => {
    // AGI $100K → 30% limit = $30K. Appreciated stock $50K → capped at $30K
    const result = calculateScheduleA(makeFixture({
      donations: [
        { organization: "University", amount: "50000", type: "appreciated_stock", dateOfDonation: "2025-06-01", costBasis: "15000", isLongTermCapitalGain: true },
      ],
    }), d(100000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(30000);
  });

  it("mix of cash and appreciated property: stacked per IRC §170(b)(1)", () => {
    // AGI $100K. LTCG = min($40K, 30%=$30K) = $30K. Non-cash = $30K.
    // Cash = min($70K, 60%=$60K - $30K = $30K) = $30K.
    const result = calculateScheduleA(makeFixture({
      donations: [
        { organization: "Red Cross", amount: "70000", type: "cash", dateOfDonation: "2025-06-01" },
        { organization: "Art Museum", amount: "40000", type: "appreciated_stock", dateOfDonation: "2025-06-01", costBasis: "12000", isLongTermCapitalGain: true },
      ],
    }), d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(30000);  // 60% - 30K = $30K
    expect(result.nonCashCharitable.toNumber()).toBe(30000);
    // Total = $30K + $30K = $60K = 60% of AGI
    expect(result.totalItemized.toNumber()).toBe(60000);
  });

  it("zero AGI: cash and appreciated donations both capped at zero", () => {
    // AGI $0 → 60% = $0, 30% = $0
    const result = calculateScheduleA(makeFixture({
      donations: [
        { organization: "Charity", amount: "5000", type: "cash", dateOfDonation: "2025-06-01" },
        { organization: "Museum", amount: "3000", type: "appreciated_stock", dateOfDonation: "2025-06-01", costBasis: "1000", isLongTermCapitalGain: true },
      ],
    }), d(0), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(0);
    expect(result.nonCashCharitable.toNumber()).toBe(0);
  });

  it("charitable carryforward from prior year added to cash before AGI limit", () => {
    // AGI $100K → 60% limit = $60K. Cash $30K + carryforward $40K = $70K → capped at $60K
    const result = calculateScheduleA(makeFixture({
      donations: [
        { organization: "Charity", amount: "30000", type: "cash", dateOfDonation: "2025-06-01" },
      ],
      priorYear: { charitableCarryforward: "40000" },
    }), d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(60000);
  });
});

// ═══════════════════════════════════════════════════════════
// Mortgage Interest — MFS and boundary edge cases
// ═══════════════════════════════════════════════════════════

describe("Schedule A - mortgage interest MFS and boundaries", () => {
  it("MFS filer: mortgage debt limit is $375K (half of $750K) per IRC §163(h)(3)(B)(ii)", () => {
    // MFS with $900K mortgage → Table1line14 =375K/900K rounded3places =0.417
    // Interest $36K ×0.417 = $15,012
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "36000",
        outstandingMortgagePrincipal: "900000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "married_filing_separately", c);
    expect(result.mortgageInterest.toNumber()).toBe(15012);
  });

  it("$1 over $750K debt: interest slightly prorated", () => {
    // $750,001 principal → ratio = 750000/750001 ≈ 0.999999
    // Interest $30000 × ratio → rounds to $30000 (within rounding)
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "30000",
        outstandingMortgagePrincipal: "750001",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "single", c);
    // $30000 × (750000/750001) rounds to $30000
    expect(result.mortgageInterest.toNumber()).toBe(30000);
  });

  it("MFS: $600K mortgage prorated at $375K limit (IRC §163(h)(3)(B)(ii))", () => {
    // MFS limit = $375K. $600K > $375K → ratio = 375/600 = 0.625
    // Interest $24K × 0.625 = $15,000
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "24000",
        outstandingMortgagePrincipal: "600000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "married_filing_separately", c);
    expect(result.mortgageInterest.toNumber()).toBe(15000);
  });

  it("MFS: $375K mortgage at exactly MFS limit — full deduction", () => {
    // MFS limit = $375K. $375K ≤ $375K → full deduction
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "15000",
        outstandingMortgagePrincipal: "375000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "married_filing_separately", c);
    expect(result.mortgageInterest.toNumber()).toBe(15000);
  });

  it("MFS: pre-TCJA grandfathered mortgage uses $500K limit (half of $1M)", () => {
    // MFS pre-TCJA limit = $500K. $800K > $500K → ratio = 500/800 = 0.625
    // Interest $32K × 0.625 = $20,000
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "32000",
        outstandingMortgagePrincipal: "800000",
        propertyTax: "0",
        mortgageOriginationDate: "2016-06-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "married_filing_separately", c);
    expect(result.mortgageInterest.toNumber()).toBe(20000);
  });

  it("Single filer: $600K mortgage NOT prorated (under $750K limit)", () => {
    // Confirms single filer uses $750K, not MFS $375K
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "24000",
        outstandingMortgagePrincipal: "600000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "single", c);
    expect(result.mortgageInterest.toNumber()).toBe(24000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple mortgages — aggregate debt limit (IRS Pub 936)
// Per IRS Pub 936 Home Mortgage Interest Deduction Worksheet,
// the $750K/$375K limit is applied to COMBINED principal of
// all mortgages, not per-mortgage.
// ═══════════════════════════════════════════════════════════

describe("Schedule A - multiple mortgages aggregate debt limit (IRS Pub 936)", () => {
  it("Two post-TCJA mortgages each under $750K but combined over: must prorate", () => {
    // Mortgage A: $500K principal, $25K interest
    // Mortgage B: $400K principal, $20K interest
    // Combined: $900K > $750K limit
    // Table1line14: $750K / $900K rounds to0.833
    // Deductible: roundDollar($45K ×0.833) = $37,485
    const result = calculateScheduleA(makeFixture({
      form1098: [
        {
          lender: "Bank A",
          mortgageInterestReceived: "25000",
          outstandingMortgagePrincipal: "500000",
          propertyTax: "0",
          mortgageOriginationDate: "2020-01-01",
          refundOfOverpaidInterest: "0",
          pointsPaid: "0",
          mortgageInsurancePremiums: "0",
        },
        {
          lender: "Bank B",
          mortgageInterestReceived: "20000",
          outstandingMortgagePrincipal: "400000",
          propertyTax: "0",
          mortgageOriginationDate: "2021-06-15",
          refundOfOverpaidInterest: "0",
          pointsPaid: "0",
          mortgageInsurancePremiums: "0",
        },
      ],
    }), d(200000), "single", c);
    expect(result.mortgageInterest.toNumber()).toBe(37485);
  });

  it("Two post-TCJA mortgages combined exactly at $750K: full deduction", () => {
    // Mortgage A: $400K, $20K interest; Mortgage B: $350K, $17.5K interest
    // Combined: $750K = $750K limit → ratio 1.0 → full $37.5K
    const result = calculateScheduleA(makeFixture({
      form1098: [
        {
          lender: "Bank A",
          mortgageInterestReceived: "20000",
          outstandingMortgagePrincipal: "400000",
          propertyTax: "0",
          mortgageOriginationDate: "2020-01-01",
          refundOfOverpaidInterest: "0",
          pointsPaid: "0",
          mortgageInsurancePremiums: "0",
        },
        {
          lender: "Bank B",
          mortgageInterestReceived: "17500",
          outstandingMortgagePrincipal: "350000",
          propertyTax: "0",
          mortgageOriginationDate: "2021-01-01",
          refundOfOverpaidInterest: "0",
          pointsPaid: "0",
          mortgageInsurancePremiums: "0",
        },
      ],
    }), d(200000), "single", c);
    expect(result.mortgageInterest.toNumber()).toBe(37500);
  });

  it("MFS: two mortgages combined over $375K limit: aggregate proration", () => {
    // MFS limit = $375K. Mortgage A: $300K, $15K interest; B: $200K, $10K interest
    // Combined: $500K > $375K → ratio = $375K/$500K = 0.75
    // Deductible: roundDollar($25K × 0.75) = $18,750
    const result = calculateScheduleA(makeFixture({
      form1098: [
        {
          lender: "Bank A",
          mortgageInterestReceived: "15000",
          outstandingMortgagePrincipal: "300000",
          propertyTax: "0",
          mortgageOriginationDate: "2020-01-01",
          refundOfOverpaidInterest: "0",
          pointsPaid: "0",
          mortgageInsurancePremiums: "0",
        },
        {
          lender: "Bank B",
          mortgageInterestReceived: "10000",
          outstandingMortgagePrincipal: "200000",
          propertyTax: "0",
          mortgageOriginationDate: "2021-01-01",
          refundOfOverpaidInterest: "0",
          pointsPaid: "0",
          mortgageInsurancePremiums: "0",
        },
      ],
    }), d(200000), "married_filing_separately", c);
    expect(result.mortgageInterest.toNumber()).toBe(18750);
  });

  it("Mixed origination: grandfathered + post-TCJA, combined over $750K", () => {
    // Grandfathered (pre-2017): $600K, $24K interest → limited to $1M → $600K (under)
    // Post-TCJA room: max(0, $750K - $600K) = $150K
    // Post-TCJA: $300K, $12K interest → limited to $150K (out of $300K)
    // Total limited: $600K + $150K = $750K
    // Total principal: $900K
    // Table1line14: $750K / $900K rounds to0.833
    // Deductible: roundDollar($36K ×0.833) = $29,988
    const result = calculateScheduleA(makeFixture({
      form1098: [
        {
          lender: "Old Bank",
          mortgageInterestReceived: "24000",
          outstandingMortgagePrincipal: "600000",
          propertyTax: "0",
          mortgageOriginationDate: "2015-06-01",
          refundOfOverpaidInterest: "0",
          pointsPaid: "0",
          mortgageInsurancePremiums: "0",
        },
        {
          lender: "New Bank",
          mortgageInterestReceived: "12000",
          outstandingMortgagePrincipal: "300000",
          propertyTax: "0",
          mortgageOriginationDate: "2020-01-01",
          refundOfOverpaidInterest: "0",
          pointsPaid: "0",
          mortgageInsurancePremiums: "0",
        },
      ],
    }), d(200000), "single", c);
    expect(result.mortgageInterest.toNumber()).toBe(29988);
  });

  it("Single mortgage still works correctly with aggregate method", () => {
    // Regression: single $900K mortgage → $750K/$900K = 0.8333...
    // Interest $36K × rounded0.833 = $29,988
    const result = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "36000",
        outstandingMortgagePrincipal: "900000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(200000), "single", c);
    expect(result.mortgageInterest.toNumber()).toBe(29988);
  });
});

// ═══════════════════════════════════════════════════════════
// SALT cap — Head of Household and Qualifying Surviving Spouse
// ═══════════════════════════════════════════════════════════

describe("Schedule A - SALT cap for HoH and QSS filing statuses", () => {
  it("2025 HoH allows $12K state taxes below the $40K limit", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "12000",
      }],
    }), d(120000), "head_of_household", c);
    expect(result.saltDeduction.toNumber()).toBe(12000);
  });

  it("HoH: state taxes exactly $10K — fully deductible, not capped", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "10000",
      }],
    }), d(120000), "head_of_household", c);
    expect(result.saltDeduction.toNumber()).toBe(10000);
  });

  it("2025 QSS allows $15K state taxes below the $40K limit", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "15000",
      }],
    }), d(200000), "qualifying_surviving_spouse", c);
    expect(result.saltDeduction.toNumber()).toBe(15000);
  });

  it("MFS: state taxes exactly $5K — fully deductible at MFS cap boundary", () => {
    // At exactly the MFS cap amount: min($5K, $5K) = $5K — no dollars lost
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "5000",
      }],
    }), d(100000), "married_filing_separately", c);
    expect(result.saltDeduction.toNumber()).toBe(5000);
  });

  it("2025 MFS allows $5,001 below the $20K limit", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "5001",
      }],
    }), d(100000), "married_filing_separately", c);
    expect(result.saltDeduction.toNumber()).toBe(5001);
  });
});

// ═══════════════════════════════════════════════════════════
// Reserved Line 8d (2025)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - line 8d reserved in 2025 regardless of AGI", () => {
  it("PMI does not change totalItemized at either low or high AGI", () => {
    const lowAGIResult = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "300000",
        propertyTax: "0",
        mortgageOriginationDate: "2021-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "1200",
      }],
    }), d(80000), "single", c);

    const highAGIResult = calculateScheduleA(makeFixture({
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "300000",
        propertyTax: "0",
        mortgageOriginationDate: "2021-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "1200",
      }],
    }), d(200000), "single", c);

    // Both AGI levels produce the same result because 2025 line 8d is reserved.
    expect(lowAGIResult.totalItemized.toNumber()).toBe(highAGIResult.totalItemized.toNumber());
    expect(lowAGIResult.totalItemized.toNumber()).toBe(12000);
  });
});

// ═══════════════════════════════════════════════════════════
// Casualty Loss (federally declared disaster area)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - casualty loss in federally declared disaster area", () => {
  it("casualty loss not passed via extra produces zero — engine does not implement Schedule A Line 15", () => {
    // Under TCJA (2018–2025), personal casualty losses are only deductible
    // in federally declared disaster areas. Schedule A Line 15 is not yet
    // implemented in this engine; no input channel exists for it.
    // Providing only mortgage and state taxes confirms zero casualty component.
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "4000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "10000",
        outstandingMortgagePrincipal: "250000",
        propertyTax: "0",
        mortgageOriginationDate: "2021-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
    }), d(100000), "single", c);
    // Total = SALT $4K + mortgage $10K = $14K; no casualty line increases it
    expect(result.totalItemized.toNumber()).toBe(14000);
  });
});

// ═══════════════════════════════════════════════════════════
// Medical + SALT combined threshold behavior
// ═══════════════════════════════════════════════════════════

describe("Schedule A - medical and SALT combined threshold behavior", () => {
  it("fractional AGI: medical threshold rounds correctly at 7.5%", () => {
    // AGI $133,333 → 7.5% = $9,999.975 → rounds to $10,000
    // Medical expenses $10,001 → deduction = $1
    const result = calculateScheduleA(
      makeFixture({}), d(133333), "single", c,
      { medicalExpenses: d(10001) }
    );
    expect(result.medicalDeduction.toNumber()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
// Itemized vs Standard Deduction — federal pipeline interaction
// ═══════════════════════════════════════════════════════════

describe("Schedule A - itemized vs standard deduction in federal pipeline", () => {
  it("itemized deductions below standard deduction: federal pipeline uses standard deduction", () => {
    // Single filer 2025 standard deduction = $15,750.
    // Provide only $3K in charitable donations (itemized total < $15,750) → standard wins.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "0",
      }],
      form1098: [],
      donations: [
        { recipient: "Charity", amount: "3000", type: "cash" },
      ],
    };
    const result = calculateFederalTax(fixture);
    expect(result.deductionUsed).toBe("standard");
    expect(result.deductionAmount.toNumber()).toBe(15750);
  });

  it("itemized deductions exceed standard deduction: federal pipeline uses itemized", () => {
    // Single filer 2025 standard deduction = $15,750.
    // Provide mortgage interest $20K on $400K loan → itemized > standard.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "0",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "20000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "0",
        mortgageOriginationDate: "2020-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
      donations: [],
    };
    const result = calculateFederalTax(fixture);
    expect(result.deductionUsed).toBe("itemized");
    expect(result.deductionAmount.toNumber()).toBeGreaterThan(15750);
  });

  it("itemized deductions exactly equal single standard deduction ($15,750): federal pipeline uses standard", () => {
    // Single 2025 standard = $15,750. When itemized === standard, standard wins
    // (no benefit to itemizing; engine should prefer standard on tie).
    // Construct: mortgage interest $15,750 on a $300K loan (under $750K → full deduction).
    // No state taxes, no medical, no charitable → totalItemized = $15,750.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "0",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "15750",
        outstandingMortgagePrincipal: "300000",
        propertyTax: "0",
        mortgageOriginationDate: "2021-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
      donations: [],
    };
    const result = calculateFederalTax(fixture);
    // Itemized = $15,750 = standard → standard wins (or tie resolves to standard)
    expect(result.itemizedDeductions.toNumber()).toBe(15750);
    expect(result.standardDeduction.toNumber()).toBe(15750);
    expect(result.deductionUsed).toBe("standard");
    expect(result.deductionAmount.toNumber()).toBe(15750);
  });

  it("itemized deductions $1 over single standard deduction: federal pipeline uses itemized", () => {
    // Single 2025 standard = $15,750. Mortgage interest $15,751 → itemized wins by $1.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "0",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "15751",
        outstandingMortgagePrincipal: "300000",
        propertyTax: "0",
        mortgageOriginationDate: "2021-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
      donations: [],
    };
    const result = calculateFederalTax(fixture);
    expect(result.itemizedDeductions.toNumber()).toBe(15751);
    expect(result.deductionUsed).toBe("itemized");
    expect(result.deductionAmount.toNumber()).toBe(15751);
  });
});

// ═══════════════════════════════════════════════════════════
// All deduction categories simultaneously hitting their limits
// ═══════════════════════════════════════════════════════════

describe("Schedule A - all categories simultaneously hitting caps and limits", () => {
  it("2025 SALT plus mortgage debt limit, medical threshold and charitable AGI limit", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "8000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "30000",
        outstandingMortgagePrincipal: "750000",
        propertyTax: "3000",
        mortgageOriginationDate: "2021-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "0",
        mortgageInsurancePremiums: "0",
      }],
      donations: [
        { organization: "Foundation", amount: "120000", type: "cash", dateOfDonation: "2025-06-01" },
      ],
    }), d(200000), "single", c, { medicalExpenses: d(16500) });

    expect(result.medicalDeduction.toNumber()).toBe(1500);
    expect(result.saltDeduction.toNumber()).toBe(11000);
    expect(result.mortgageInterest.toNumber()).toBe(30000);
    expect(result.cashCharitable.toNumber()).toBe(120000);
    expect(result.totalItemized.toNumber()).toBe(162500);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit trail — each Schedule A section recorded in lines[]
// ═══════════════════════════════════════════════════════════

describe("Schedule A - audit trail completeness", () => {
  it("audit trail contains entries for every Schedule A section (lines 1, 4, 5a-5d, 8a, 8c, 8d, 12, 13, 17)", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "6000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "18000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "2000",
        mortgageOriginationDate: "2021-01-01",
        refundOfOverpaidInterest: "0",
        pointsPaid: "500",
        mortgageInsurancePremiums: "300",
      }],
      donations: [
        { organization: "Charity", amount: "4000", type: "cash", dateOfDonation: "2025-06-01" },
      ],
    }), d(120000), "single", c, { medicalExpenses: d(10000) });

    const lineNumbers = result.lines.map((l) => l.line);

    // Medical section
    expect(lineNumbers).toContain("1");   // Raw medical expenses
    expect(lineNumbers).toContain("4");   // Medical deduction after 7.5% floor

    // SALT section
    expect(lineNumbers).toContain("5a");  // State/local income taxes
    expect(lineNumbers).toContain("5b");  // Personal property taxes
    expect(lineNumbers).toContain("5c");  // Real estate taxes
    expect(lineNumbers).toContain("5d");  // SALT deduction (capped)

    // Mortgage section
    expect(lineNumbers).toContain("8a");  // Mortgage interest
    expect(lineNumbers).toContain("8c");  // Points paid
    expect(lineNumbers).toContain("8d");  // Mortgage insurance premiums (PMI)

    // Charitable section
    expect(lineNumbers).toContain("12");  // Cash charitable
    expect(lineNumbers).toContain("13");  // Non-cash charitable

    // Total
    expect(lineNumbers).toContain("17");  // Total itemized deductions
  });

  it("audit lines identify Schedule A and its SALT worksheet separately", () => {
    const result = calculateScheduleA(
      makeFixture({}), d(100000), "single", c,
      { medicalExpenses: d(10000) }
    );
    for (const line of result.lines) {
      expect(["Sched A", "SALT WS", "SALT Income Tax WS", "Pub936 Table1"]).toContain(line.form);
    }
    expect(result.lines.some(line => line.form === "SALT Income Tax WS" && line.line === "total")).toBe(true);
  });

  it("audit line 17 value matches totalItemized field", () => {
    const result = calculateScheduleA(makeFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "5000",
      }],
    }), d(100000), "single", c);

    const line17 = result.lines.find((l) => l.line === "17");
    expect(line17).toBeDefined();
    expect(line17!.value.toNumber()).toBe(result.totalItemized.toNumber());
  });

  it("audit line 4 value matches medicalDeduction field", () => {
    // AGI $100K → threshold $7,500. Medical $12K → deduction $4,500
    const result = calculateScheduleA(
      makeFixture({}), d(100000), "single", c,
      { medicalExpenses: d(12000) }
    );
    const line4 = result.lines.find((l) => l.line === "4");
    expect(line4).toBeDefined();
    expect(line4!.value.toNumber()).toBe(result.medicalDeduction.toNumber());
    expect(line4!.value.toNumber()).toBe(4500);
  });
});
