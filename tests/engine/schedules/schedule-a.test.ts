/**
 * Tests for Schedule A — Itemized Deductions
 * Spec: spec/federal/schedule-a.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture, complexMFJFixture } from "../../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

// ═══════════════════════════════════════════════════════════
// Medical Deduction
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Medical Expenses", () => {
  it("Schedule A Line 1 - medical expenses pass through", () => {
    const result = calculateScheduleA(simpleW2Fixture, d(100000), "single", c, {
      medicalExpenses: d(10000),
    });
    const line1 = result.lines.find((l) => l.line === "1");
    expect(line1!.value.toNumber()).toBe(10000);
  });

  it("Schedule A Line 4 - medical deduction exceeds 7.5% AGI", () => {
    // AGI = $100K. 7.5% = $7,500. Medical = $10K → deduction = $2,500
    const result = calculateScheduleA(simpleW2Fixture, d(100000), "single", c, {
      medicalExpenses: d(10000),
    });
    expect(result.medicalDeduction.toNumber()).toBe(2500);
  });

  it("Schedule A Line 4 - no deduction below 7.5% AGI", () => {
    // AGI = $100K. Medical = $5K < $7,500 threshold
    const result = calculateScheduleA(simpleW2Fixture, d(100000), "single", c, {
      medicalExpenses: d(5000),
    });
    expect(result.medicalDeduction.toNumber()).toBe(0);
  });

  it("Schedule A Line 4 - zero medical means zero deduction", () => {
    const result = calculateScheduleA(simpleW2Fixture, d(100000), "single", c);
    expect(result.medicalDeduction.toNumber()).toBe(0);
  });

  it("Schedule A Line 4 - low AGI has low threshold", () => {
    // AGI = $20K. 7.5% = $1,500. Medical = $3K → deduction = $1,500
    const result = calculateScheduleA(simpleW2Fixture, d(20000), "single", c, {
      medicalExpenses: d(3000),
    });
    expect(result.medicalDeduction.toNumber()).toBe(1500);
  });

  it("Schedule A Line 4 - exactly at 7.5% boundary (no deduction)", () => {
    // AGI = $100K. 7.5% = $7,500. Medical = $7,500 → deduction = $0
    const result = calculateScheduleA(simpleW2Fixture, d(100000), "single", c, {
      medicalExpenses: d(7500),
    });
    expect(result.medicalDeduction.toNumber()).toBe(0);
  });

  it("Schedule A Line 4 - $1 over 7.5% boundary", () => {
    // AGI = $100K. 7.5% = $7,500. Medical = $7,501 → deduction = $1
    const result = calculateScheduleA(simpleW2Fixture, d(100000), "single", c, {
      medicalExpenses: d(7501),
    });
    expect(result.medicalDeduction.toNumber()).toBe(1);
  });

  it("Schedule A Line 4 - medical included in total itemized", () => {
    const result = calculateScheduleA(complexMFJFixture, d(300000), "married_filing_jointly", c, {
      medicalExpenses: d(30000),
    });
    // 7.5% of $300K = $22,500. Medical deduction = $30K - $22.5K = $7,500
    expect(result.medicalDeduction.toNumber()).toBe(7500);
    // Total = medical $7,500 + SALT $8,500 + mortgage $18,000 + charitable $25,000 = $59,000
    expect(result.totalItemized.toNumber()).toBe(59000);
  });
});

// ═══════════════════════════════════════════════════════════
// SALT Deduction
// ═══════════════════════════════════════════════════════════

describe("Schedule A - SALT", () => {
  it("Schedule A Line 5c - personal property taxes", () => {
    const result = calculateScheduleA(simpleW2Fixture, d(85000), "single", c, {
      personalPropertyTaxes: d(500),
    });
    // WA: no state tax, no real estate → just $500 personal property
    expect(result.saltDeduction.toNumber()).toBe(500);
  });

  it("Schedule A Line 5c - personal property included in 2025 SALT deduction", () => {
    const input = {
      ...complexMFJFixture,
      w2s: [{
        ...complexMFJFixture.w2s[0],
        stateTaxWithheld: "5000",
      }],
    };
    const result = calculateScheduleA(input, d(300000), "married_filing_jointly", c, {
      personalPropertyTaxes: d(2000),
    });
    expect(result.saltDeduction.toNumber()).toBe(15500);
  });

  it("Schedule A Line 5e - 2025 SALT below the limit", () => {
    const result = calculateScheduleA(complexMFJFixture, d(300000), "married_filing_jointly", c);
    // State withholding $0 (WA) + property tax $8,500 = $8,500 (under cap)
    expect(result.saltDeduction.toNumber()).toBe(8500);
  });

  it("Schedule A Line 5e - MFS allows $12,500 below its 2025 limit", () => {
    const input = {
      ...complexMFJFixture,
      w2s: [{
        ...complexMFJFixture.w2s[0],
        stateTaxWithheld: "4000",
      }],
    };
    const result = calculateScheduleA(input, d(200000), "married_filing_separately", c);
    expect(result.saltDeduction.toNumber()).toBe(12500);
  });

  it("Schedule A Line 5d - under cap passes through", () => {
    const result = calculateScheduleA(simpleW2Fixture, d(85000), "single", c);
    // WA: no state tax, no property tax → $0
    expect(result.saltDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Mortgage Interest
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Mortgage Interest", () => {
  it("Schedule A Line 8a - deductible mortgage interest", () => {
    const result = calculateScheduleA(complexMFJFixture, d(300000), "married_filing_jointly", c);
    // $650K principal ≤ $750K → full deduction of $18,000
    expect(result.mortgageInterest.toNumber()).toBe(18000);
  });

  it("Schedule A Line 8a - prorated for high principal", () => {
    const input = {
      ...complexMFJFixture,
      form1098: [{
        ...complexMFJFixture.form1098[0],
        outstandingMortgagePrincipal: "1000000",
        mortgageInterestReceived: "40000",
      }],
    };
    const result = calculateScheduleA(input, d(300000), "single", c);
    // $750K/$1M = 75%. $40K × 75% = $30K
    expect(result.mortgageInterest.toNumber()).toBe(30000);
  });

  it("Schedule A Line 8a - no mortgage means zero", () => {
    const result = calculateScheduleA(simpleW2Fixture, d(85000), "single", c);
    expect(result.mortgageInterest.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Charitable
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Charitable", () => {
  it("Schedule A Line 12 - cash charitable", () => {
    const result = calculateScheduleA(complexMFJFixture, d(300000), "married_filing_jointly", c);
    expect(result.cashCharitable.toNumber()).toBe(5000);
  });

  it("Schedule A Line 13 - non-cash charitable", () => {
    const result = calculateScheduleA(complexMFJFixture, d(300000), "married_filing_jointly", c);
    expect(result.nonCashCharitable.toNumber()).toBe(20000);
  });

  it("Schedule A - no donations means zero", () => {
    const result = calculateScheduleA(simpleW2Fixture, d(85000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(0);
    expect(result.nonCashCharitable.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Total Itemized
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Total", () => {
  it("Schedule A Line 17 - total itemized deductions", () => {
    const result = calculateScheduleA(complexMFJFixture, d(300000), "married_filing_jointly", c);
    // SALT $8,500 + mortgage $18,000 + cash $5,000 + non-cash $20,000 = $51,500
    expect(result.totalItemized.toNumber()).toBe(51500);
  });

  it("Schedule A - zero for simple W-2 filer", () => {
    const result = calculateScheduleA(simpleW2Fixture, d(85000), "single", c);
    expect(result.totalItemized.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Mortgage Interest Refund (Box 3)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Mortgage Interest Refund", () => {
  it("Schedule A Line 8a - refund of overpaid interest does not reduce the 2025 deduction", () => {
    const input = {
      ...simpleW2Fixture,
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "5000",
        refundOfOverpaidInterest: "2000",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const result = calculateScheduleA(input, d(200000), "single", c);
    expect(result.mortgageInterest.toNumber()).toBe(12000);
  });
});

// ═══════════════════════════════════════════════════════════
// Points Paid (Line 8c)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Points Paid", () => {
  it("Schedule A Line 8c - points paid on purchase of principal residence", () => {
    const input = {
      ...simpleW2Fixture,
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "5000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "3000",
      }],
    };
    const result = calculateScheduleA(input, d(200000), "single", c);
    const line8c = result.lines.find((l) => l.line === "8c");
    expect(line8c!.value.toNumber()).toBe(3000);
  });

  it("Schedule A Line 8c - multiple 1098s sum points", () => {
    const input = {
      ...simpleW2Fixture,
      form1098: [
        {
          lender: "Bank A",
          mortgageInterestReceived: "8000",
          outstandingMortgagePrincipal: "300000",
          propertyTax: "4000",
          refundOfOverpaidInterest: "0",
          mortgageInsurancePremiums: "0",
          pointsPaid: "2000",
        },
        {
          lender: "Bank B",
          mortgageInterestReceived: "4000",
          outstandingMortgagePrincipal: "200000",
          propertyTax: "2000",
          refundOfOverpaidInterest: "0",
          mortgageInsurancePremiums: "0",
          pointsPaid: "1500",
        },
      ],
    };
    const result = calculateScheduleA(input, d(200000), "single", c);
    const line8c = result.lines.find((l) => l.line === "8c");
    expect(line8c!.value.toNumber()).toBe(3500);
  });
});

// ═══════════════════════════════════════════════════════════
// Reserved Line 8d (2025)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Reserved Line 8d", () => {
  it("Schedule A Line 8d - reserved for future use in 2025", () => {
    const input = {
      ...simpleW2Fixture,
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "5000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "1800",
        pointsPaid: "0",
      }],
    };
    const result = calculateScheduleA(input, d(200000), "single", c);
    const line8d = result.lines.find((l) => l.line === "8d");
    expect(line8d!.value.toNumber()).toBe(0);
    // Total: SALT($5K property tax) + mortgage($12K) = $17,000
    expect(result.totalItemized.toNumber()).toBe(17000);
  });

  it("Schedule A Line 8d - remains zero when no PMI is reported", () => {
    const result = calculateScheduleA(complexMFJFixture, d(300000), "married_filing_jointly", c);
    const line8d = result.lines.find((l) => l.line === "8d");
    expect(line8d!.value.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Points + Interest combined in Line 17
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Line 17 includes mortgage interest and points", () => {
  it("Schedule A Line 17 - total excludes PMI for 2025", () => {
    const input = {
      ...simpleW2Fixture,
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "15000",
        outstandingMortgagePrincipal: "500000",
        propertyTax: "6000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "2400",
        pointsPaid: "1500",
      }],
    };
    const result = calculateScheduleA(input, d(250000), "single", c);
    // SALT: $6K property tax capped at $10K = $6K
    // Mortgage interest: $15K (principal $500K under $750K cap)
    // Points: $1,500
    // PMI: ignored for 2025 because line 8d is reserved
    // Total = 6000 + 15000 + 1500 = 22500
    expect(result.totalItemized.toNumber()).toBe(22500);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// Medical 7.5% floor at various AGI levels
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Medical 7.5% floor at various AGI levels", () => {
  it("Schedule A Line 4 - high AGI ($500K) raises threshold significantly", () => {
    // AGI = $500K. 7.5% = $37,500. Medical = $40K → deduction = $2,500
    const result = calculateScheduleA(simpleW2Fixture, d(500000), "single", c, {
      medicalExpenses: d(40000),
    });
    expect(result.medicalDeduction.toNumber()).toBe(2500);
  });

  it("Schedule A Line 4 - very low AGI ($10K) yields low threshold", () => {
    // AGI = $10K. 7.5% = $750. Medical = $2,000 → deduction = $1,250
    const result = calculateScheduleA(simpleW2Fixture, d(10000), "single", c, {
      medicalExpenses: d(2000),
    });
    expect(result.medicalDeduction.toNumber()).toBe(1250);
  });

  it("Schedule A Line 4 - fractional AGI rounds threshold correctly", () => {
    // AGI = $33,333. 7.5% = $2,499.975 → rounds to $2,500. Medical = $3,000 → deduction = $500
    const result = calculateScheduleA(simpleW2Fixture, d(33333), "single", c, {
      medicalExpenses: d(3000),
    });
    // roundDollar(33333 * 0.075) = roundDollar(2499.975) = 2500
    expect(result.medicalDeduction.toNumber()).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════
// SALT $10K cap edge cases
// ═══════════════════════════════════════════════════════════

describe("Schedule A - SALT cap edge cases", () => {
  it("Schedule A Line 5e - 2025 state and property taxes of $13K are fully deductible", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "6000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "10000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "7000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const result = calculateScheduleA(input, d(150000), "single", c);
    expect(result.saltDeduction.toNumber()).toBe(13000);
  });

  it("Schedule A Line 5d - SALT exactly at $10K cap is not reduced", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "4000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "8000",
        outstandingMortgagePrincipal: "300000",
        propertyTax: "6000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const result = calculateScheduleA(input, d(150000), "single", c);
    // State $4K + property $6K = $10K exactly → passes through
    expect(result.saltDeduction.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// Mortgage interest debt limit proration
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Mortgage interest debt limit", () => {
  it("Schedule A Line 8a - grandfathered pre-TCJA mortgage uses $1M limit", () => {
    const input = {
      ...simpleW2Fixture,
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "30000",
        outstandingMortgagePrincipal: "900000",
        propertyTax: "5000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
        mortgageOriginationDate: "2016-06-01", // Pre-TCJA (before 2017-12-15)
      }],
    };
    const result = calculateScheduleA(input, d(200000), "single", c);
    // $900K < $1M grandfathered limit → full deduction
    expect(result.mortgageInterest.toNumber()).toBe(30000);
  });

  it("Schedule A Line 8a - post-TCJA mortgage over $750K is prorated", () => {
    const input = {
      ...simpleW2Fixture,
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "50000",
        outstandingMortgagePrincipal: "1500000",
        propertyTax: "5000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
        mortgageOriginationDate: "2020-01-15",
      }],
    };
    const result = calculateScheduleA(input, d(400000), "single", c);
    // $750K / $1.5M = 50%. $50K × 50% = $25K
    expect(result.mortgageInterest.toNumber()).toBe(25000);
  });
});

// ═══════════════════════════════════════════════════════════
// Charitable donation categories and AGI limits
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Charitable donation categories", () => {
  it("Schedule A Line 12 - cash donations capped at 60% AGI", () => {
    const input = {
      ...simpleW2Fixture,
      donations: [
        {
          organization: "Red Cross",
          type: "cash" as const,
          amount: "80000",
          dateOfDonation: "2025-06-01",
          costBasis: "0",
        },
      ],
    };
    const result = calculateScheduleA(input, d(100000), "single", c);
    // 60% of $100K = $60K. Cash $80K → capped at $60K
    expect(result.cashCharitable.toNumber()).toBe(60000);
  });

  it("Schedule A Line 13 - appreciated LTCG property capped at 30% AGI", () => {
    const input = {
      ...simpleW2Fixture,
      donations: [
        {
          organization: "Museum",
          type: "appreciated_stock" as const,
          amount: "50000",
          costBasis: "10000",
          dateOfDonation: "2025-06-01",
          isLongTermCapitalGain: true,
        },
      ],
    };
    const result = calculateScheduleA(input, d(100000), "single", c);
    // 30% of $100K = $30K. Appreciated $50K → capped at $30K
    expect(result.nonCashCharitable.toNumber()).toBe(30000);
  });

  it("Schedule A Line 13 - private-foundation LTCG property uses the 20% AGI limit", () => {
    const input = {
      ...simpleW2Fixture,
      donations: [
        {
          organization: "Smith Private Foundation",
          type: "appreciated_stock" as const,
          amount: "25000",
          costBasis: "3000",
          dateOfDonation: "2025-06-15",
          isLongTermCapitalGain: true,
          isPrivateFoundation: true,
        },
      ],
    };
    const result = calculateScheduleA(input, d(100000), "single", c);
    // 20% of $100K = $20K. Private-foundation appreciated property $25K → capped at $20K
    expect(result.nonCashCharitable.toNumber()).toBe(20000);
  });

  it("Schedule A Line 13 - non-LTCG non-cash property capped at 50% AGI", () => {
    const input = {
      ...simpleW2Fixture,
      donations: [
        {
          organization: "Goodwill",
          type: "property" as const,
          amount: "70000",
          costBasis: "70000",
          dateOfDonation: "2025-06-01",
          isLongTermCapitalGain: false,
        },
      ],
    };
    const result = calculateScheduleA(input, d(100000), "single", c);
    // 50% of $100K = $50K. Other non-cash $70K → capped at $50K
    expect(result.nonCashCharitable.toNumber()).toBe(50000);
  });

  it("Schedule A Line 12 - cash charitable includes prior year carryforward", () => {
    const input = {
      ...simpleW2Fixture,
      donations: [
        {
          organization: "United Way",
          type: "cash" as const,
          amount: "5000",
          dateOfDonation: "2025-06-01",
          costBasis: "0",
        },
      ],
      priorYear: {
        charitableCarryforward: "3000",
      },
    };
    const result = calculateScheduleA(input, d(200000), "single", c);
    // Cash $5K + carryforward $3K = $8K (under 60% of $200K = $120K)
    expect(result.cashCharitable.toNumber()).toBe(8000);
  });
});

// ═══════════════════════════════════════════════════════════
// Total itemized vs standard deduction comparison
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Itemized vs Standard Deduction comparison", () => {
  it("totalItemized exceeds single standard deduction ($15,000) for homeowner", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "5000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "6000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const result = calculateScheduleA(input, d(120000), "single", c);
    expect(result.saltDeduction.toNumber()).toBe(11000);
    expect(result.mortgageInterest.toNumber()).toBe(12000);
    expect(result.totalItemized.toNumber()).toBe(23000);
    expect(result.totalItemized.toNumber()).toBeGreaterThan(
      c.standardDeduction.single.toNumber()
    );
  });

  it("totalItemized below MFJ standard deduction ($30,000) for renter", () => {
    // MFJ renter with modest state taxes and small donations
    const input = {
      ...complexMFJFixture,
      form1098: [],
      donations: [
        {
          organization: "Local charity",
          type: "cash" as const,
          amount: "2000",
          dateOfDonation: "2025-12-01",
          costBasis: "0",
        },
      ],
    };
    const result = calculateScheduleA(input, d(200000), "married_filing_jointly", c);
    // SALT: $0 state tax (WA) + $0 property = $0
    // Mortgage: $0 (no 1098)
    // Cash charitable: $2K
    // Total = $2K < $30K MFJ standard deduction
    expect(result.totalItemized.toNumber()).toBe(2000);
    expect(result.totalItemized.toNumber()).toBeLessThan(
      c.standardDeduction.married_filing_jointly.toNumber()
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Schedule A - audit trail", () => {
  it("produces complete audit trail", () => {
    const result = calculateScheduleA(complexMFJFixture, d(300000), "married_filing_jointly", c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1");
    expect(lineIds).toContain("4");
    expect(lineIds).toContain("5a");
    expect(lineIds).toContain("5c");
    expect(lineIds).toContain("5d");
    expect(lineIds).toContain("8a");
    expect(lineIds).toContain("8c");
    expect(lineIds).toContain("8d");
    expect(lineIds).toContain("12");
    expect(lineIds).toContain("13");
    expect(lineIds).toContain("17");
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Medical Expense Payers — Aggregation
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Multiple medical expense payers aggregation", () => {
  it("Schedule A Line 1 - caller aggregates multiple payer amounts before passing to engine", () => {
    // Taxpayer paid $4,000 to hospital, $2,500 to pharmacy, $1,200 to specialist
    // Caller sums them: $7,700 total; engine receives the aggregate
    const hospitalExpenses = new Decimal(4000);
    const pharmacyExpenses = new Decimal(2500);
    const specialistExpenses = new Decimal(1200);
    const aggregatedMedical = hospitalExpenses.plus(pharmacyExpenses).plus(specialistExpenses);
    // AGI = $80,000. 7.5% = $6,000. Deduction = $7,700 - $6,000 = $1,700
    const result = calculateScheduleA(simpleW2Fixture, d(80000), "single", c, {
      medicalExpenses: aggregatedMedical,
    });
    const line1 = result.lines.find((l) => l.line === "1");
    expect(line1!.value.toNumber()).toBe(7700);
    expect(result.medicalDeduction.toNumber()).toBe(1700);
  });
});

// ═══════════════════════════════════════════════════════════
// Medical Expenses Exactly at 7.5% AGI Floor
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Medical expenses exactly at 7.5% AGI floor", () => {
  it("Schedule A Line 4 - expenses exactly equal to 7.5% AGI produce zero deduction", () => {
    // AGI = $200,000. 7.5% = $15,000. Medical = $15,000 → deduction = $0
    const result = calculateScheduleA(simpleW2Fixture, d(200000), "single", c, {
      medicalExpenses: new Decimal(15000),
    });
    expect(result.medicalDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// SALT: State Income Tax + Local Tax + Property Tax Combined
// ═══════════════════════════════════════════════════════════

describe("Schedule A - State income tax + local tax + property tax combined under SALT cap", () => {
  it("Schedule A Line 5d - state + local + property taxes all included in SALT total before cap", () => {
    // State withheld: $3,000, local withheld: $1,500, property tax: $4,000 → total $8,500 < $10K cap
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "3000",
        localTaxWithheld: "1500",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "10000",
        outstandingMortgagePrincipal: "350000",
        propertyTax: "4000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const result = calculateScheduleA(input, d(120000), "single", c);
    // $3,000 + $1,500 + $4,000 = $8,500 — under cap
    expect(result.saltDeduction.toNumber()).toBe(8500);
  });

  it("Schedule A Line 5e - 2025 state, local and property taxes of $11,500 are fully deductible", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "4000",
        localTaxWithheld: "2500",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "5000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const result = calculateScheduleA(input, d(150000), "single", c);
    expect(result.saltDeduction.toNumber()).toBe(11500);
  });
});

// ═══════════════════════════════════════════════════════════
// State Estimated Tax Payments in SALT (Line 5a)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - State estimated tax payments in SALT", () => {
  it("Schedule A Line 5a - state estimated tax payments included in SALT", () => {
    // State withholding $3K + $3K paid this calendar year + property $2K = $8K.
    // The January2026 installment is deducted in2026, even if for2025 state tax.
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "3000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "10000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "2000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
      adjustments: {
        estimatedTaxPayments: [
          { date: "2025-04-15", amount: "1000", type: "state" as const },
          { date: "2025-06-15", amount: "1000", type: "state" as const },
          { date: "2025-09-15", amount: "1000", type: "state" as const },
          { date: "2026-01-15", amount: "1000", type: "state" as const },
        ],
        otherTaxesPaid: "0",
      },
    };
    const result = calculateScheduleA(input, d(150000), "single", c);
    expect(result.lines.find(line => line.line === "5a")?.value.toString()).toBe("6000");
    expect(result.saltDeduction.toNumber()).toBe(8000);
  });

  it("Schedule A Line 5a - estimated payments are included in 2025 SALT of $14K", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "6000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "10000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "5000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
      adjustments: {
        estimatedTaxPayments: [
          { date: "2025-04-15", amount: "1500", type: "state" as const },
          { date: "2025-09-15", amount: "1500", type: "state" as const },
        ],
        otherTaxesPaid: "0",
      },
    };
    const result = calculateScheduleA(input, d(200000), "single", c);
    expect(result.saltDeduction.toNumber()).toBe(14000);
  });

  it("Schedule A Line 5a - federal estimated payments excluded from SALT", () => {
    // Only federal estimated payments → should not appear in SALT
    const input = {
      ...simpleW2Fixture,
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "10000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "3000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
      adjustments: {
        estimatedTaxPayments: [
          { date: "2025-04-15", amount: "5000", type: "federal" as const },
          { date: "2025-06-15", amount: "5000", type: "federal" as const },
        ],
        otherTaxesPaid: "0",
      },
    };
    const result = calculateScheduleA(input, d(150000), "single", c);
    // Only property tax $3K — federal estimated payments not SALT
    expect(result.saltDeduction.toNumber()).toBe(3000);
  });

  it("Schedule A Line 5a - mixed federal and state estimated payments only state counts", () => {
    // Mixed: $4K federal + $2K state estimated, plus $4K withholding + $3K property
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "4000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "10000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "3000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
      adjustments: {
        estimatedTaxPayments: [
          { date: "2025-04-15", amount: "2000", type: "federal" as const },
          { date: "2025-04-15", amount: "1000", type: "state" as const },
          { date: "2025-06-15", amount: "2000", type: "federal" as const },
          { date: "2025-06-15", amount: "1000", type: "state" as const },
        ],
        otherTaxesPaid: "0",
      },
    };
    const result = calculateScheduleA(input, d(150000), "single", c);
    // State withholding $4K + state estimated $2K + property $3K = $9K
    expect(result.saltDeduction.toNumber()).toBe(9000);
  });

  it("Schedule A Line 5a - MFS estimated payments below the 2025 $20K limit", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "2000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "10000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "3000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
      adjustments: {
        estimatedTaxPayments: [
          { date: "2025-04-15", amount: "1000", type: "state" as const },
          { date: "2025-09-15", amount: "1000", type: "state" as const },
        ],
        otherTaxesPaid: "0",
      },
    };
    const result = calculateScheduleA(input, d(100000), "married_filing_separately", c);
    expect(result.saltDeduction.toNumber()).toBe(7000);
  });
});

// ═══════════════════════════════════════════════════════════
// Mortgage Interest with Points Paid
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Mortgage interest with points paid", () => {
  it("Schedule A Lines 8a and 8c - mortgage interest and points are both deductible and included in total", () => {
    const input = {
      ...simpleW2Fixture,
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "20000",
        outstandingMortgagePrincipal: "600000",
        propertyTax: "7000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "4500",
      }],
    };
    const result = calculateScheduleA(input, d(180000), "single", c);
    // Mortgage interest: $20K (principal $600K ≤ $750K → full)
    // Points: $4,500
    // SALT: $7K property tax (under $10K cap)
    // Total = $20K + $4.5K + $7K = $31,500
    expect(result.mortgageInterest.toNumber()).toBe(20000);
    const line8c = result.lines.find((l) => l.line === "8c");
    expect(line8c!.value.toNumber()).toBe(4500);
    expect(result.totalItemized.toNumber()).toBe(31500);
  });
});

// ═══════════════════════════════════════════════════════════
// Investment Interest Deduction (Line 9)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Investment interest deduction", () => {
  it("Schedule A Line 9 - investment interest expense is deductible and included in total", () => {
    const result = calculateScheduleA(simpleW2Fixture, d(100000), "single", c, {
      investmentInterestExpense: new Decimal(3500),
    });
    const line9 = result.lines.find((l) => l.line === "9");
    expect(line9!.value.toNumber()).toBe(3500);
    expect(result.investmentInterestDeduction.toNumber()).toBe(3500);
    expect(result.totalItemized.toNumber()).toBe(3500);
  });

  it("Schedule A Line 9 - zero investment interest when not provided", () => {
    const result = calculateScheduleA(simpleW2Fixture, d(100000), "single", c);
    const line9 = result.lines.find((l) => l.line === "9");
    expect(line9!.value.toNumber()).toBe(0);
    expect(result.investmentInterestDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Gambling Losses Limited to Gambling Winnings (Line 28)
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Gambling losses limited to gambling winnings", () => {
  it("Schedule A Line 28 - gambling losses capped at winnings when losses exceed winnings", () => {
    // Winnings: $5,000; Losses: $8,000 → deductible losses = $5,000 (IRC §165(d))
    const result = calculateScheduleA(simpleW2Fixture, d(85000), "single", c, {
      gamblingWinnings: new Decimal(5000),
      gamblingLosses: new Decimal(8000),
    });
    expect(result.gamblingLossDeduction.toNumber()).toBe(5000);
    const line28 = result.lines.find((l) => l.line === "28");
    expect(line28!.value.toNumber()).toBe(5000);
  });

  it("Schedule A Line 28 - gambling losses fully deductible when less than winnings", () => {
    // Winnings: $10,000; Losses: $3,000 → deductible losses = $3,000
    const result = calculateScheduleA(simpleW2Fixture, d(85000), "single", c, {
      gamblingWinnings: new Decimal(10000),
      gamblingLosses: new Decimal(3000),
    });
    expect(result.gamblingLossDeduction.toNumber()).toBe(3000);
  });

  it("Schedule A Line 28 - no gambling loss deduction without gambling winnings", () => {
    // Losses without any winnings → no deduction at all
    const result = calculateScheduleA(simpleW2Fixture, d(85000), "single", c, {
      gamblingWinnings: new Decimal(0),
      gamblingLosses: new Decimal(4000),
    });
    expect(result.gamblingLossDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Total Itemized with All Sections Populated
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Total itemized with all deduction sections populated", () => {
  it("Schedule A Line 17 - correctly sums medical, SALT, mortgage, investment interest, charitable, and gambling losses", () => {
    // Medical: $12,000; AGI: $100,000; 7.5% = $7,500 → deduction $4,500
    // SALT: state $3,000 + local $1,000 + property $4,500 = $8,500 (under cap)
    // Mortgage interest: $15,000; principal $500K ≤ $750K → full
    // Points: $2,000
    // Investment interest: $1,500
    // Cash charitable: $5,000
    // Gambling: winnings $3,000; losses $3,000 → deduction $3,000
    // Total = $4,500 + $8,500 + $15,000 + $2,000 + $1,500 + $5,000 + $3,000 = $39,500
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "3000",
        localTaxWithheld: "1000",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "15000",
        outstandingMortgagePrincipal: "500000",
        propertyTax: "4500",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "2000",
      }],
      donations: [{
        organization: "Charity",
        type: "cash" as const,
        amount: "5000",
        dateOfDonation: "2025-06-01",
        costBasis: "0",
      }],
    };
    const result = calculateScheduleA(input, d(100000), "single", c, {
      medicalExpenses: new Decimal(12000),
      investmentInterestExpense: new Decimal(1500),
      gamblingWinnings: new Decimal(3000),
      gamblingLosses: new Decimal(3000),
    });
    expect(result.medicalDeduction.toNumber()).toBe(4500);
    expect(result.saltDeduction.toNumber()).toBe(8500);
    expect(result.mortgageInterest.toNumber()).toBe(15000);
    expect(result.investmentInterestDeduction.toNumber()).toBe(1500);
    expect(result.cashCharitable.toNumber()).toBe(5000);
    expect(result.gamblingLossDeduction.toNumber()).toBe(3000);
    expect(result.totalItemized.toNumber()).toBe(39500);
  });
});

// ═══════════════════════════════════════════════════════════
// Itemized < Standard Deduction → Standard Wins
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Itemized less than standard deduction", () => {
  it("totalItemized below single standard deduction ($15,000) means taxpayer should take standard deduction", () => {
    // Small charitable donation only: $2,000 itemized vs $15,000 standard
    const input = {
      ...simpleW2Fixture,
      donations: [{
        organization: "Local org",
        type: "cash" as const,
        amount: "2000",
        dateOfDonation: "2025-10-01",
        costBasis: "0",
      }],
    };
    const result = calculateScheduleA(input, d(85000), "single", c);
    expect(result.totalItemized.toNumber()).toBe(2000);
    expect(result.totalItemized.lessThan(c.standardDeduction.single)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS SALT Cap $5,000
// ═══════════════════════════════════════════════════════════

describe("Schedule A - MFS 2025 SALT maximum of $20,000", () => {
  it("Schedule A Line 5e - MFS allows combined 2025 taxes of $7,500", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "2000",
        localTaxWithheld: "1500",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "8000",
        outstandingMortgagePrincipal: "300000",
        propertyTax: "4000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const result = calculateScheduleA(input, d(100000), "married_filing_separately", c);
    expect(result.saltDeduction.toNumber()).toBe(7500);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail Line Values for Each Section
// ═══════════════════════════════════════════════════════════

describe("Schedule A - audit trail line values for each section", () => {
  it("audit trail records correct numeric values for every Schedule A section", () => {
    // Set up a scenario with known values for each line
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        stateTaxWithheld: "4000",
        localTaxWithheld: "500",
      }],
      form1098: [{
        lender: "Bank",
        mortgageInterestReceived: "14000",
        outstandingMortgagePrincipal: "450000",
        propertyTax: "3500",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "1200",
        pointsPaid: "2500",
      }],
      donations: [{
        organization: "Food bank",
        type: "cash" as const,
        amount: "4000",
        dateOfDonation: "2025-09-01",
        costBasis: "0",
      }],
    };
    const result = calculateScheduleA(input, d(120000), "single", c, {
      medicalExpenses: new Decimal(11000),
      investmentInterestExpense: new Decimal(800),
      gamblingWinnings: new Decimal(2000),
      gamblingLosses: new Decimal(2000),
    });

    const getLine = (id: string) => result.lines.find((l) => l.line === id)!.value.toNumber();

    // Line 1: raw medical expenses
    expect(getLine("1")).toBe(11000);
    expect(getLine("4")).toBe(2000);
    expect(getLine("5a")).toBe(4500);
    // Line 5b: no personal property taxes
    expect(getLine("5b")).toBe(3500);
    expect(getLine("5c")).toBe(0);
    expect(getLine("5d")).toBe(8000);
    expect(getLine("8a")).toBe(14000);
    expect(getLine("8c")).toBe(2500);
    // Line 8d: reserved for future use in 2025
    expect(getLine("8d")).toBe(0);
    expect(getLine("9")).toBe(800);
    expect(getLine("12")).toBe(4000);
    expect(getLine("28")).toBe(2000);
    expect(getLine("17")).toBe(33300);
  });
});

// ═══════════════════════════════════════════════════════════
// Charitable Contribution Carryforward (IRC §170(d))
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Charitable Carryforward", () => {
  it("no carryforward when cash donations are under 60% AGI limit", () => {
    const result = calculateScheduleA(
      { ...simpleW2Fixture, donations: [{ type: "cash", amount: "5000" }] },
      d(50000), "single", c
    );
    expect(result.charitableCarryforward.toNumber()).toBe(0);
  });

  it("carryforward equals excess when cash donations exceed 60% AGI limit", () => {
    // AGI $50K → 60% cash limit = $30K. Donate $40K → excess = $10K
    const result = calculateScheduleA(
      { ...simpleW2Fixture, donations: [{ type: "cash", amount: "40000" }] },
      d(50000), "single", c
    );
    expect(result.cashCharitable.toNumber()).toBe(30000);
    expect(result.charitableCarryforward.toNumber()).toBe(10000);
  });

  it("carryforward includes prior-year carryforward that cannot be used", () => {
    // AGI $50K → 60% cash limit = $30K. Donate $25K cash + $10K prior carryforward = $35K → deductible $30K, carryforward $5K
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{ type: "cash", amount: "25000" }],
        priorYear: { charitableCarryforward: "10000" },
      },
      d(50000), "single", c
    );
    expect(result.cashCharitable.toNumber()).toBe(30000);
    expect(result.charitableCarryforward.toNumber()).toBe(5000);
  });

  it("carryforward tracks excess non-cash appreciated property over 30% AGI limit", () => {
    // AGI $100K → 30% LTCG limit = $30K. Donate $50K appreciated → deductible $30K, carryforward $20K
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{
          type: "appreciated_stock",
          organization: "Public Charity",
          amount: "50000",
          dateOfDonation: "2025-06-15",
          isLongTermCapitalGain: true,
          isPrivateFoundation: false,
        }],
      },
      d(100000), "single", c
    );
    expect(result.nonCashCharitable.toNumber()).toBe(30000);
    expect(result.charitableCarryforward.toNumber()).toBe(20000);
  });

  it("zero carryforward when no donations", () => {
    const result = calculateScheduleA(
      { ...simpleW2Fixture, donations: [] },
      d(100000), "single", c
    );
    expect(result.charitableCarryforward.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Charitable Carryforward Vintage Tracking (IRC §170(d)(1))
// ═══════════════════════════════════════════════════════════

describe("Schedule A - Charitable Carryforward Vintage Tracking", () => {
  it("per-year carryforward entries use FIFO ordering — oldest year used first", () => {
    // AGI $50K → 60% cash limit = $30K
    // Current-year cash = $20K, leaving $10K capacity for carryforward
    // Two prior-year vintages: 2022 ($6K) and 2023 ($8K)
    // FIFO: use 2022 first ($6K), then 2023 ($4K of $8K)
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{ type: "cash", amount: "20000" }],
        priorYear: {
          charitableCarryforwardByYear: [
            { taxYear: 2023, amount: "8000" },
            { taxYear: 2022, amount: "6000" },
          ],
        },
      },
      d(50000), "single", c
    );

    expect(result.cashCharitable.toNumber()).toBe(30000);
    expect(result.charitableCarryforwardByYear).toHaveLength(1);
    expect(result.charitableCarryforwardByYear[0].taxYear).toBe(2023);
    expect(result.charitableCarryforwardByYear[0].amount.toNumber()).toBe(4000);
    expect(result.charitableCarryforward.toNumber()).toBe(4000);
  });

  it("carryforward entries older than 5 years expire and are not available for deduction", () => {
    // Tax year 2025. Carryforward from 2019 is 6 years old → expired (>5)
    // Carryforward from 2020 is 5 years old → still valid
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{ type: "cash", amount: "10000" }],
        priorYear: {
          charitableCarryforwardByYear: [
            { taxYear: 2019, amount: "5000" },
            { taxYear: 2020, amount: "3000" },
          ],
        },
      },
      d(50000), "single", c
    );

    // 60% limit = $30K, current cash = $10K, capacity for carryforward = $20K
    // 2019 vintage: expired ($5K)
    // 2020 vintage: used ($3K)
    // Total deductible: $10K + $3K = $13K
    expect(result.cashCharitable.toNumber()).toBe(13000);
    expect(result.charitableCarryforwardExpired.toNumber()).toBe(5000);
    expect(result.charitableCarryforwardByYear).toHaveLength(0);
    expect(result.charitableCarryforward.toNumber()).toBe(0);
  });

  it("carryforward at exactly 5 years old is still valid (boundary test)", () => {
    // Tax year 2025. Carryforward from 2020 is exactly 5 years old → valid
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{ type: "cash", amount: "5000" }],
        priorYear: {
          charitableCarryforwardByYear: [
            { taxYear: 2020, amount: "7000" },
          ],
        },
      },
      d(50000), "single", c
    );

    // 60% limit = $30K, current cash = $5K, capacity = $25K
    // 2020 vintage: 2025 - 2020 = 5, not > 5, so valid. Use all $7K.
    expect(result.cashCharitable.toNumber()).toBe(12000);
    expect(result.charitableCarryforwardExpired.toNumber()).toBe(0);
    expect(result.charitableCarryforward.toNumber()).toBe(0);
  });

  it("partial use of a vintage carries the remainder into next year", () => {
    // AGI $30K → 60% cash limit = $18K
    // Current-year cash = $15K, leaving $3K capacity for carryforward
    // Prior vintage 2023: $8K → use $3K, carry $5K
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{ type: "cash", amount: "15000" }],
        priorYear: {
          charitableCarryforwardByYear: [
            { taxYear: 2023, amount: "8000" },
          ],
        },
      },
      d(30000), "single", c
    );

    expect(result.cashCharitable.toNumber()).toBe(18000);
    expect(result.charitableCarryforwardByYear).toHaveLength(1);
    expect(result.charitableCarryforwardByYear[0].taxYear).toBe(2023);
    expect(result.charitableCarryforwardByYear[0].amount.toNumber()).toBe(5000);
    expect(result.charitableCarryforward.toNumber()).toBe(5000);
  });

  it("current-year excess creates a new carryforward vintage for the current tax year", () => {
    // AGI $50K → 60% cash limit = $30K
    // Current-year cash = $40K → excess = $10K → new vintage for 2025
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{ type: "cash", amount: "40000" }],
      },
      d(50000), "single", c
    );

    expect(result.cashCharitable.toNumber()).toBe(30000);
    expect(result.charitableCarryforwardByYear).toHaveLength(1);
    expect(result.charitableCarryforwardByYear[0].taxYear).toBe(2025);
    expect(result.charitableCarryforwardByYear[0].amount.toNumber()).toBe(10000);
    expect(result.charitableCarryforward.toNumber()).toBe(10000);
  });

  it("mixed expired and valid vintages plus current-year excess", () => {
    // Tax year 2025
    // AGI $50K → 60% limit = $30K, current cash = $25K, capacity = $5K
    // Vintages: 2019 ($3K, expired), 2021 ($4K, valid), 2024 ($6K, valid)
    // FIFO: 2019 expired. 2021: use $4K (capacity left = $1K). 2024: use $1K (carry $5K).
    // Total deductible = $25K + $5K = $30K
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{ type: "cash", amount: "25000" }],
        priorYear: {
          charitableCarryforwardByYear: [
            { taxYear: 2019, amount: "3000" },
            { taxYear: 2021, amount: "4000" },
            { taxYear: 2024, amount: "6000" },
          ],
        },
      },
      d(50000), "single", c
    );

    expect(result.cashCharitable.toNumber()).toBe(30000);
    expect(result.charitableCarryforwardExpired.toNumber()).toBe(3000);
    // Remaining: only the unused portion of the 2024 vintage
    expect(result.charitableCarryforwardByYear).toHaveLength(1);
    expect(result.charitableCarryforwardByYear[0].taxYear).toBe(2024);
    expect(result.charitableCarryforwardByYear[0].amount.toNumber()).toBe(5000);
    expect(result.charitableCarryforward.toNumber()).toBe(5000);
  });

  it("reconciliation detail tracks each vintage year individually", () => {
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{ type: "cash", amount: "20000" }],
        priorYear: {
          charitableCarryforwardByYear: [
            { taxYear: 2019, amount: "2000" },
            { taxYear: 2022, amount: "5000" },
            { taxYear: 2024, amount: "3000" },
          ],
        },
      },
      d(50000), "single", c
    );

    // Capacity for carryforward = $30K - $20K = $10K
    // 2019: expired (6 years old)
    // 2022: valid, use all $5K (capacity left = $5K)
    // 2024: valid, use all $3K (capacity left = $2K)
    const detail = result.charitableCarryforwardDetail;
    expect(detail).toHaveLength(3);

    expect(detail[0].taxYear).toBe(2019);
    expect(detail[0].amountExpired.toNumber()).toBe(2000);
    expect(detail[0].amountUsed.toNumber()).toBe(0);

    expect(detail[1].taxYear).toBe(2022);
    expect(detail[1].amountUsed.toNumber()).toBe(5000);
    expect(detail[1].amountRemaining.toNumber()).toBe(0);

    expect(detail[2].taxYear).toBe(2024);
    expect(detail[2].amountUsed.toNumber()).toBe(3000);
    expect(detail[2].amountRemaining.toNumber()).toBe(0);
  });

  it("legacy single aggregate carryforward is treated as prior-year vintage", () => {
    // When only charitableCarryforward is provided (no byYear), treat as taxYear-1
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{ type: "cash", amount: "25000" }],
        priorYear: { charitableCarryforward: "8000" },
      },
      d(50000), "single", c
    );

    // 60% limit = $30K, current = $25K, capacity = $5K
    // Legacy $8K treated as 2024 vintage → use $5K, carry $3K
    expect(result.cashCharitable.toNumber()).toBe(30000);
    expect(result.charitableCarryforwardByYear).toHaveLength(1);
    expect(result.charitableCarryforwardByYear[0].taxYear).toBe(2024);
    expect(result.charitableCarryforwardByYear[0].amount.toNumber()).toBe(3000);
  });

  it("no carryforward entries when all donations fit within AGI limits", () => {
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{ type: "cash", amount: "5000" }],
      },
      d(100000), "single", c
    );

    expect(result.charitableCarryforwardByYear).toHaveLength(0);
    expect(result.charitableCarryforwardExpired.toNumber()).toBe(0);
    expect(result.charitableCarryforwardDetail).toHaveLength(0);
  });

  it("all carryforward vintages expire when every entry is older than 5 years", () => {
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{ type: "cash", amount: "5000" }],
        priorYear: {
          charitableCarryforwardByYear: [
            { taxYear: 2018, amount: "3000" },
            { taxYear: 2019, amount: "4000" },
          ],
        },
      },
      d(100000), "single", c
    );

    expect(result.cashCharitable.toNumber()).toBe(5000);
    expect(result.charitableCarryforwardExpired.toNumber()).toBe(7000);
    expect(result.charitableCarryforwardByYear).toHaveLength(0);
    expect(result.charitableCarryforward.toNumber()).toBe(0);
  });

  it("non-cash excess creates a current-year carryforward vintage", () => {
    // AGI $100K → 30% LTCG limit = $30K. Donate $50K appreciated → excess = $20K
    const result = calculateScheduleA(
      {
        ...simpleW2Fixture,
        donations: [{
          type: "appreciated_stock",
          organization: "Public Charity",
          amount: "50000",
          dateOfDonation: "2025-06-15",
          isLongTermCapitalGain: true,
          isPrivateFoundation: false,
        }],
      },
      d(100000), "single", c
    );

    expect(result.nonCashCharitable.toNumber()).toBe(30000);
    expect(result.charitableCarryforwardByYear).toHaveLength(1);
    expect(result.charitableCarryforwardByYear[0].taxYear).toBe(2025);
    expect(result.charitableCarryforwardByYear[0].amount.toNumber()).toBe(20000);
  });
});
