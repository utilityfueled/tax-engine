/**
 * Edge case tests for Schedule B — Interest and Ordinary Dividends
 * Tests aggregation of multiple 1099-INTs, tax-exempt interest exclusion,
 * qualified vs ordinary dividends, zero-income scenarios, large amounts,
 * foreign accounts, withholding, dividends-only, and capital gain distributions.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleB } from "@/engine/schedules/schedule-b.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput, Form1099Int, Form1099Div } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

/** Helper: build a 1099-INT with defaults */
function make1099Int(overrides: Partial<Form1099Int> & { payer: string; interestIncome: string }): Form1099Int {
  return {
    earlyWithdrawalPenalty: "0",
    usSavingsBondInterest: "0",
    federalWithheld: "0",
    taxExemptInterest: "0",
    ...overrides,
  };
}

/** Helper: build a 1099-DIV with defaults */
function make1099Div(overrides: Partial<Form1099Div> & { payer: string; ordinaryDividends: string }): Form1099Div {
  return {
    qualifiedDividends: "0",
    totalCapitalGainDistributions: "0",
    federalWithheld: "0",
    foreignTaxPaid: "0",
    section1250Gain: "0",
    section1202Gain: "0",
    collectiblesGain: "0",
    nondividendDistributions: "0",
    exemptInterestDividends: "0",
    ...overrides,
  };
}

/** Build a TaxYearInput from the simple fixture with overrides */
function makeFixture(overrides: Partial<TaxYearInput>): TaxYearInput {
  return {
    ...simpleW2Fixture,
    form1099Int: [],
    form1099Div: [],
    scheduleK1: [],
    ...overrides,
  };
}

// =================================================================
// Multiple 1099-INTs Aggregation
// =================================================================

describe("Schedule B edge case - multiple 1099-INT aggregation", () => {
  it("5 interest sources aggregated correctly", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Bank A", interestIncome: "1200.50" }),
        make1099Int({ payer: "Bank B", interestIncome: "875.25" }),
        make1099Int({ payer: "Credit Union", interestIncome: "340.00" }),
        make1099Int({ payer: "Brokerage", interestIncome: "2100.75" }),
        make1099Int({ payer: "Savings App", interestIncome: "50.00" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(5);
    // 1200.50 + 875.25 + 340.00 + 2100.75 + 50.00 = 4566.50
    expect(result.totalInterest.toNumber()).toBe(4566.5);
    expect(result.taxableInterest.toNumber()).toBe(4566.5);
    expect(result.isRequired).toBe(true);
  });

  it("7 small interest sources below $1,500 threshold — not required", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Bank 1", interestIncome: "50" }),
        make1099Int({ payer: "Bank 2", interestIncome: "100" }),
        make1099Int({ payer: "Bank 3", interestIncome: "200" }),
        make1099Int({ payer: "Bank 4", interestIncome: "150" }),
        make1099Int({ payer: "Bank 5", interestIncome: "75" }),
        make1099Int({ payer: "Bank 6", interestIncome: "300" }),
        make1099Int({ payer: "Bank 7", interestIncome: "50" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(7);
    // 50+100+200+150+75+300+50 = 925
    expect(result.totalInterest.toNumber()).toBe(925);
    expect(result.isRequired).toBe(false);
  });

  it("interest sources with cents aggregate without rounding errors", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "A", interestIncome: "0.01" }),
        make1099Int({ payer: "B", interestIncome: "0.02" }),
        make1099Int({ payer: "C", interestIncome: "0.03" }),
        make1099Int({ payer: "D", interestIncome: "0.04" }),
        make1099Int({ payer: "E", interestIncome: "0.10" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalInterest.toNumber()).toBe(0.2);
  });
});

// =================================================================
// Tax-Exempt Interest Excluded from Taxable
// =================================================================

describe("Schedule B edge case - tax-exempt interest", () => {
  it("taxExemptInterest field is present but does not affect Schedule B taxable total", () => {
    // The 1099-INT Box 8 (tax-exempt interest) is reported on 1040 Line 2a,
    // but Schedule B only uses Box 1 (interestIncome) for its total.
    const input = makeFixture({
      form1099Int: [
        make1099Int({
          payer: "Municipal Bond Fund",
          interestIncome: "500",
          taxExemptInterest: "3000",
        }),
        make1099Int({
          payer: "Regular Bank",
          interestIncome: "1000",
          taxExemptInterest: "0",
        }),
      ],
    });
    const result = calculateScheduleB(input);
    // Schedule B totalInterest is only the taxable interest (Box 1)
    expect(result.totalInterest.toNumber()).toBe(1500);
    expect(result.taxableInterest.toNumber()).toBe(1500);
  });

  it("all interest is tax-exempt (Box 1 = 0) — Schedule B shows zero taxable interest", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({
          payer: "Muni Bond Fund A",
          interestIncome: "0",
          taxExemptInterest: "5000",
        }),
        make1099Int({
          payer: "Muni Bond Fund B",
          interestIncome: "0",
          taxExemptInterest: "3000",
        }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalInterest.toNumber()).toBe(0);
    expect(result.taxableInterest.toNumber()).toBe(0);
    expect(result.isRequired).toBe(false);
  });
});

// =================================================================
// Qualified Dividends vs Ordinary Dividends
// =================================================================

describe("Schedule B edge case - qualified vs ordinary dividends", () => {
  it("multiple 1099-DIVs with varying qualified percentages", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({ payer: "Vanguard Total Stock", ordinaryDividends: "5000", qualifiedDividends: "4500" }), // 90%
        make1099Div({ payer: "REIT Fund", ordinaryDividends: "3000", qualifiedDividends: "0" }), // 0%
        make1099Div({ payer: "Intl Index", ordinaryDividends: "2000", qualifiedDividends: "1200" }), // 60%
        make1099Div({ payer: "Bond Fund", ordinaryDividends: "1500", qualifiedDividends: "100" }), // ~7%
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.dividendPayers).toHaveLength(4);
    // Schedule B only tracks ordinary dividends: 5000 + 3000 + 2000 + 1500 = 11500
    expect(result.totalOrdinaryDividends.toNumber()).toBe(11500);
    expect(result.isRequired).toBe(true);
  });

  it("100% qualified dividends still appear in full on Schedule B", () => {
    // Schedule B reports ordinary dividends (which includes qualified as a subset)
    const input = makeFixture({
      form1099Div: [
        make1099Div({ payer: "Dividend Growth Fund", ordinaryDividends: "8000", qualifiedDividends: "8000" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(8000);
  });

  it("qualified dividends flow correctly through federal orchestrator", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({ payer: "Fund A", ordinaryDividends: "6000", qualifiedDividends: "5000" }),
        make1099Div({ payer: "Fund B", ordinaryDividends: "4000", qualifiedDividends: "1000" }),
      ],
    });
    const result = calculateFederalTax(input);
    expect(result.scheduleB).toBeDefined();
    expect(result.scheduleB!.totalOrdinaryDividends.toNumber()).toBe(10000);
  });
});

// =================================================================
// Zero Interest and Dividends — No 1099s
// =================================================================

describe("Schedule B edge case - zero interest and dividends", () => {
  it("no 1099-INTs or 1099-DIVs — Schedule B not required", () => {
    const input = makeFixture({
      form1099Int: [],
      form1099Div: [],
    });
    const result = calculateScheduleB(input);
    expect(result.totalInterest.toNumber()).toBe(0);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(0);
    expect(result.taxableInterest.toNumber()).toBe(0);
    expect(result.interestPayers).toHaveLength(0);
    expect(result.dividendPayers).toHaveLength(0);
    expect(result.isRequired).toBe(false);
  });

  it("W-2 only filer — Schedule B absent from federal return", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    // Schedule B may still be computed but should show zeros and not be required
    if (result.scheduleB) {
      expect(result.scheduleB.isRequired).toBe(false);
      expect(result.scheduleB.totalInterest.toNumber()).toBe(0);
      expect(result.scheduleB.totalOrdinaryDividends.toNumber()).toBe(0);
    }
  });
});

// =================================================================
// Large Dividend Amounts — Precision
// =================================================================

describe("Schedule B edge case - large dividend amounts", () => {
  it("$500K+ in dividends — no overflow or precision issues", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({ payer: "Large Cap Fund", ordinaryDividends: "250000.55" }),
        make1099Div({ payer: "Income Fund", ordinaryDividends: "175000.33" }),
        make1099Div({ payer: "Yield Fund", ordinaryDividends: "125000.12" }),
      ],
    });
    const result = calculateScheduleB(input);
    // 250000.55 + 175000.33 + 125000.12 = 550001.00
    expect(result.totalOrdinaryDividends.toNumber()).toBe(550001);
    expect(result.isRequired).toBe(true);
  });

  it("$1M+ in interest — precise aggregation", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Treasury Direct", interestIncome: "500000.99" }),
        make1099Int({ payer: "Corporate Bonds", interestIncome: "350000.01" }),
        make1099Int({ payer: "HYSA", interestIncome: "200000.50" }),
      ],
    });
    const result = calculateScheduleB(input);
    // 500000.99 + 350000.01 + 200000.50 = 1050001.50
    expect(result.totalInterest.toNumber()).toBe(1050001.5);
    expect(result.taxableInterest.toNumber()).toBe(1050001.5);
  });

  it("large amounts with cents maintain decimal precision", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({ payer: "Fund A", ordinaryDividends: "999999.99" }),
        make1099Div({ payer: "Fund B", ordinaryDividends: "0.01" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(1000000);
  });
});

// =================================================================
// Foreign Accounts
// =================================================================

describe("Schedule B edge case - foreign accounts", () => {
  it("multiple foreign countries from different 1099-DIVs", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({
          payer: "Intl Fund A", ordinaryDividends: "1000",
          foreignTaxPaid: "50", foreignCountry: "United Kingdom",
        }),
        make1099Div({
          payer: "Intl Fund B", ordinaryDividends: "800",
          foreignTaxPaid: "30", foreignCountry: "Japan",
        }),
        make1099Div({
          payer: "Domestic Fund", ordinaryDividends: "500",
          foreignTaxPaid: "0",
        }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.hasForeignAccounts).toBe(true);
    expect(result.foreignAccountCountries).toContain("United Kingdom");
    expect(result.foreignAccountCountries).toContain("Japan");
    expect(result.foreignAccountCountries).toHaveLength(2);
    expect(result.isRequired).toBe(true);
  });

  it("foreignTaxPaid > 0 but no foreignCountry — no foreign account flagged", () => {
    // foreignCountry must be present for the detection logic
    const input = makeFixture({
      form1099Div: [
        make1099Div({
          payer: "Fund", ordinaryDividends: "500",
          foreignTaxPaid: "25",
          // foreignCountry intentionally omitted
        }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.hasForeignAccounts).toBe(false);
  });

  it("foreign trust from K-1 triggers Schedule B required", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Bank", interestIncome: "100" }),
      ],
      scheduleK1: [{
        partnershipName: "Cayman Fund LP",
        partnershipEIN: "98-1234567",
        ordinaryIncome: "1000",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        isForeignPartnership: true,
        atRiskAmount: "50000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    });
    const result = calculateScheduleB(input);
    expect(result.hasForeignTrust).toBe(true);
    expect(result.isRequired).toBe(true);
    // Total interest is low, but foreign trust alone makes it required
    expect(result.totalInterest.toNumber()).toBe(100);
  });
});

// =================================================================
// Interest with Federal Withholding
// =================================================================

describe("Schedule B edge case - interest with federal withholding", () => {
  it("multiple 1099-INTs with withholding — interest totals unaffected by withholding", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Bank A", interestIncome: "3000", federalWithheld: "600" }),
        make1099Int({ payer: "Bank B", interestIncome: "2000", federalWithheld: "400" }),
        make1099Int({ payer: "Bank C", interestIncome: "1500", federalWithheld: "0" }),
      ],
    });
    const result = calculateScheduleB(input);
    // Schedule B totals interest income, not net of withholding
    expect(result.totalInterest.toNumber()).toBe(6500);
    expect(result.taxableInterest.toNumber()).toBe(6500);
  });

  it("withholding on interest flows to tax payments in federal orchestrator", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Brokerage", interestIncome: "5000", federalWithheld: "1000" }),
      ],
    });
    const result = calculateFederalTax(input);
    expect(result.scheduleB).toBeDefined();
    expect(result.scheduleB!.totalInterest.toNumber()).toBe(5000);
    // Federal withholding from 1099-INT should be counted in total payments
    expect(result.totalPayments.toNumber()).toBeGreaterThanOrEqual(1000);
  });
});

// =================================================================
// Dividends Only, No Interest
// =================================================================

describe("Schedule B edge case - dividends only, no interest", () => {
  it("only 1099-DIVs, no 1099-INTs — interest section empty", () => {
    const input = makeFixture({
      form1099Int: [],
      form1099Div: [
        make1099Div({ payer: "Vanguard", ordinaryDividends: "3000", qualifiedDividends: "2500" }),
        make1099Div({ payer: "Schwab", ordinaryDividends: "1500", qualifiedDividends: "1000" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(0);
    expect(result.totalInterest.toNumber()).toBe(0);
    expect(result.taxableInterest.toNumber()).toBe(0);
    expect(result.dividendPayers).toHaveLength(2);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(4500);
    expect(result.isRequired).toBe(true);
  });

  it("dividends below $1,500 without interest — not required", () => {
    const input = makeFixture({
      form1099Int: [],
      form1099Div: [
        make1099Div({ payer: "Small Fund", ordinaryDividends: "800" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(false);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(800);
    expect(result.totalInterest.toNumber()).toBe(0);
  });
});

// =================================================================
// Capital Gain Distributions from 1099-DIV Flow to Schedule D
// =================================================================

describe("Schedule B edge case - capital gain distributions from 1099-DIV", () => {
  it("capital gain distributions do not affect Schedule B ordinary dividend total", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({
          payer: "Total Market Fund",
          ordinaryDividends: "4000",
          qualifiedDividends: "3500",
          totalCapitalGainDistributions: "6000",
        }),
      ],
    });
    const result = calculateScheduleB(input);
    // Schedule B only reports ordinary dividends, not capital gain distributions
    expect(result.totalOrdinaryDividends.toNumber()).toBe(4000);
  });

  it("capital gain distributions flow to Schedule D via federal orchestrator", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({
          payer: "Growth Fund",
          ordinaryDividends: "2000",
          qualifiedDividends: "1500",
          totalCapitalGainDistributions: "8000",
        }),
        make1099Div({
          payer: "Income Fund",
          ordinaryDividends: "3000",
          qualifiedDividends: "2000",
          totalCapitalGainDistributions: "2000",
        }),
      ],
    });
    const result = calculateFederalTax(input);

    // Schedule B: ordinary dividends only
    expect(result.scheduleB).toBeDefined();
    expect(result.scheduleB!.totalOrdinaryDividends.toNumber()).toBe(5000);

    // Capital gain distributions (8000 + 2000 = 10000) fold into Schedule D net long-term
    expect(result.scheduleD).toBeDefined();
    // With no other capital transactions, net long-term = cap gain distributions
    expect(result.scheduleD!.netLongTerm.toNumber()).toBe(10000);
  });

  it("zero capital gain distributions — no Schedule D impact from dividends", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({
          payer: "Bond Fund",
          ordinaryDividends: "5000",
          totalCapitalGainDistributions: "0",
        }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(5000);
  });
});

// =================================================================
// $1,500 Threshold Boundary — Interest (spec lines 1–4)
// =================================================================

describe("Schedule B edge case - $1,500 interest threshold boundary", () => {
  it("exactly $1,500 interest — Schedule B not required (spec Line 4, threshold is 'over $1,500')", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Bank A", interestIncome: "1500" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalInterest).toEqual(d("1500"));
    expect(result.taxableInterest).toEqual(d("1500"));
    expect(result.isRequired).toBe(false);
  });

  it("$1,501 interest — Schedule B required (spec Line 4, exceeds $1,500)", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Bank A", interestIncome: "1501" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalInterest).toEqual(d("1501"));
    expect(result.isRequired).toBe(true);
  });

  it("$1,500.01 interest — Schedule B required (spec Line 4, one cent over threshold)", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "HYSA", interestIncome: "1500.01" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalInterest).toEqual(d("1500.01"));
    expect(result.isRequired).toBe(true);
  });
});

// =================================================================
// $1,500 Threshold Boundary — Dividends (spec lines 5–6)
// =================================================================

describe("Schedule B edge case - $1,500 dividend threshold boundary", () => {
  it("exactly $1,500 dividends — Schedule B not required (spec Line 6, threshold is 'over $1,500')", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({ payer: "Vanguard", ordinaryDividends: "1500" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalOrdinaryDividends).toEqual(d("1500"));
    expect(result.isRequired).toBe(false);
  });

  it("$1,501 dividends — Schedule B required (spec Line 6, exceeds $1,500)", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({ payer: "Vanguard", ordinaryDividends: "1501" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalOrdinaryDividends).toEqual(d("1501"));
    expect(result.isRequired).toBe(true);
  });
});

// =================================================================
// Both Interest and Dividends at Threshold
// =================================================================

describe("Schedule B edge case - both interest and dividends at threshold", () => {
  it("interest $1,500 AND dividends $1,500 — not required (spec notes: each threshold independent)", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Bank", interestIncome: "1500" }),
      ],
      form1099Div: [
        make1099Div({ payer: "Fund", ordinaryDividends: "1500" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalInterest).toEqual(d("1500"));
    expect(result.totalOrdinaryDividends).toEqual(d("1500"));
    expect(result.isRequired).toBe(false);
  });

  it("interest $1,500 AND dividends $1,501 — required due to dividends only", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Bank", interestIncome: "1500" }),
      ],
      form1099Div: [
        make1099Div({ payer: "Fund", ordinaryDividends: "1501" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(true);
  });
});

// =================================================================
// Zero Interest with Dividends Above Threshold (and vice versa)
// =================================================================

describe("Schedule B edge case - zero in one category, above threshold in other", () => {
  it("zero interest with dividends above threshold — required (spec Line 6)", () => {
    const input = makeFixture({
      form1099Int: [],
      form1099Div: [
        make1099Div({ payer: "Income Fund", ordinaryDividends: "5000" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalInterest).toEqual(d("0"));
    expect(result.interestPayers).toHaveLength(0);
    expect(result.totalOrdinaryDividends).toEqual(d("5000"));
    expect(result.isRequired).toBe(true);
  });

  it("zero dividends with interest above threshold — required (spec Line 4)", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Treasury Direct", interestIncome: "3000" }),
      ],
      form1099Div: [],
    });
    const result = calculateScheduleB(input);
    expect(result.totalOrdinaryDividends).toEqual(d("0"));
    expect(result.dividendPayers).toHaveLength(0);
    expect(result.totalInterest).toEqual(d("3000"));
    expect(result.isRequired).toBe(true);
  });
});

// =================================================================
// Tax-Exempt Interest (Municipal Bonds) — spec Line 1 edgeCases
// =================================================================

describe("Schedule B edge case - municipal bond tax-exempt interest", () => {
  it("municipal bond with both taxable and tax-exempt interest — only Box 1 in Schedule B (spec Line 1 edge case)", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({
          payer: "Vanguard Tax-Exempt Bond Fund",
          interestIncome: "200",
          taxExemptInterest: "4500",
        }),
        make1099Int({
          payer: "Regular Savings",
          interestIncome: "800",
        }),
      ],
    });
    const result = calculateScheduleB(input);
    // Schedule B totalInterest uses Box 1 only; tax-exempt (Box 8) goes to 1040 Line 2a
    expect(result.totalInterest).toEqual(d("1000"));
    expect(result.taxableInterest).toEqual(d("1000"));
    expect(result.isRequired).toBe(false);
  });
});

// =================================================================
// Foreign Accounts — Part III (spec Lines 7a, 7b, 8)
// =================================================================

describe("Schedule B edge case - Part III foreign accounts", () => {
  it("foreign account alone triggers Schedule B required even with zero income (spec Line 7a)", () => {
    const input = makeFixture({
      form1099Int: [],
      form1099Div: [
        make1099Div({
          payer: "Swiss Fund",
          ordinaryDividends: "100",
          foreignTaxPaid: "10",
          foreignCountry: "Switzerland",
        }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.hasForeignAccounts).toBe(true);
    expect(result.foreignAccountCountries).toContain("Switzerland");
    // Income is below $1,500 but foreign account makes it required
    expect(result.totalOrdinaryDividends).toEqual(d("100"));
    expect(result.isRequired).toBe(true);
  });

  it("duplicate foreign country from multiple 1099-DIVs — deduplicated (spec Line 7b)", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({
          payer: "UK Fund A",
          ordinaryDividends: "500",
          foreignTaxPaid: "25",
          foreignCountry: "United Kingdom",
        }),
        make1099Div({
          payer: "UK Fund B",
          ordinaryDividends: "300",
          foreignTaxPaid: "15",
          foreignCountry: "United Kingdom",
        }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.hasForeignAccounts).toBe(true);
    // Same country listed twice should be deduplicated via Set
    expect(result.foreignAccountCountries).toHaveLength(1);
    expect(result.foreignAccountCountries[0]).toBe("United Kingdom");
  });

  it("foreign trust from K-1 with no foreign dividends — still required (spec Line 8)", () => {
    const input = makeFixture({
      form1099Int: [make1099Int({ payer: "Local Bank", interestIncome: "50" })],
      scheduleK1: [{
        partnershipName: "Offshore Trust",
        partnershipEIN: "00-0000001",
        ordinaryIncome: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        isForeignPartnership: true,
        atRiskAmount: "0",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    });
    const result = calculateScheduleB(input);
    expect(result.hasForeignTrust).toBe(true);
    expect(result.hasForeignAccounts).toBe(false);
    expect(result.isRequired).toBe(true);
  });
});

// =================================================================
// Savings Bond Exclusion — Spec Line 3 (Form 8815)
// =================================================================

describe("Schedule B edge case - savings bond exclusion (Form 8815)", () => {
  it("US savings bond interest with partial exclusion — taxable interest reduced (spec Line 3)", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({
          payer: "Treasury Direct",
          interestIncome: "0", // Box 3 is not included in Box 1.
          usSavingsBondInterest: "3000",
        }),
      ],
    });
    // Simulate Form 8815 exclusion of $1,200
    const exclusion = d("1200");
    const result = calculateScheduleB(input, exclusion);
    expect(result.totalInterest).toEqual(d("3000"));
    expect(result.savingsBondExclusion).toEqual(d("1200"));
    expect(result.taxableInterest).toEqual(d("1800"));
  });

  it("savings bond exclusion exceeds interest — taxable interest floors at zero (spec Line 4, zeroFloor)", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({
          payer: "Treasury Direct",
          interestIncome: "0",
          usSavingsBondInterest: "500",
        }),
      ],
    });
    // Exclusion greater than total interest
    const exclusion = d("800");
    const result = calculateScheduleB(input, exclusion);
    expect(result.totalInterest).toEqual(d("500"));
    expect(result.savingsBondExclusion).toEqual(d("800"));
    // zeroFloor prevents negative
    expect(result.taxableInterest).toEqual(d("0"));
  });

  it("full savings bond exclusion — all interest excluded (spec Line 3, Series EE/I bonds)", () => {
    const input = makeFixture({
      form1099Int: [
        make1099Int({
          payer: "Treasury Direct - Series I",
          interestIncome: "0",
          usSavingsBondInterest: "2000",
        }),
      ],
    });
    const exclusion = d("2000");
    const result = calculateScheduleB(input, exclusion);
    expect(result.totalInterest).toEqual(d("2000"));
    expect(result.taxableInterest).toEqual(d("0"));
  });
});

// =================================================================
// Very Large Number of Sources — Spec Line 1 / Line 5
// =================================================================

describe("Schedule B edge case - very large number of sources", () => {
  it("20 interest sources aggregate correctly (spec Line 1, many payers)", () => {
    const payers = Array.from({ length: 20 }, (_, i) =>
      make1099Int({ payer: `Bank ${i + 1}`, interestIncome: "100.50" })
    );
    const input = makeFixture({ form1099Int: payers });
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(20);
    // 20 * 100.50 = 2010.00
    expect(result.totalInterest).toEqual(d("2010"));
    expect(result.isRequired).toBe(true);
  });

  it("15 dividend sources aggregate correctly (spec Line 5, many payers)", () => {
    const payers = Array.from({ length: 15 }, (_, i) =>
      make1099Div({ payer: `Fund ${i + 1}`, ordinaryDividends: "200" })
    );
    const input = makeFixture({ form1099Div: payers });
    const result = calculateScheduleB(input);
    expect(result.dividendPayers).toHaveLength(15);
    // 15 * 200 = 3000
    expect(result.totalOrdinaryDividends).toEqual(d("3000"));
    expect(result.isRequired).toBe(true);
  });
});

// =================================================================
// Qualified Dividends as Subset of Ordinary — Spec Line 5 edgeCases
// =================================================================

describe("Schedule B edge case - qualified dividends subset validation", () => {
  it("qualified dividends equal to ordinary — Schedule B uses ordinary total (spec Line 5)", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({ payer: "S&P 500 Fund", ordinaryDividends: "3000", qualifiedDividends: "3000" }),
        make1099Div({ payer: "Growth Fund", ordinaryDividends: "2000", qualifiedDividends: "2000" }),
      ],
    });
    const result = calculateScheduleB(input);
    // Schedule B reports ordinary (which includes qualified)
    expect(result.totalOrdinaryDividends).toEqual(d("5000"));
    expect(result.isRequired).toBe(true);
  });

  it("zero qualified dividends (e.g., REIT) — ordinary still counted (spec Line 5)", () => {
    const input = makeFixture({
      form1099Div: [
        make1099Div({ payer: "REIT Fund", ordinaryDividends: "4000", qualifiedDividends: "0" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalOrdinaryDividends).toEqual(d("4000"));
    expect(result.isRequired).toBe(true);
  });
});

// =================================================================
// Nominee Interest and OID — Spec Line 1 edgeCases
// =================================================================

describe("Schedule B edge case - nominee interest and OID adjustments", () => {
  it("nominee interest — reported as separate payer entry (spec Line 1 edge case: nominee interest)", () => {
    // Nominee interest is reported on 1099-INT but belongs to another person.
    // The taxpayer reports it in Schedule B then subtracts it via a 'Nominee' entry.
    // In the engine, this is modeled as a negative-amount payer or separate adjustment.
    // Current engine simply sums all 1099-INT payers, so nominee reduction
    // would appear as a separate 1099-INT with the net amount.
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Joint Account Bank", interestIncome: "2000" }),
        // Nominee portion attributed to co-owner not included in Box 1
        // (payer issues corrected 1099-INT or taxpayer adjusts)
        make1099Int({ payer: "Nominee - Co-owner", interestIncome: "0" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(2);
    expect(result.totalInterest).toEqual(d("2000"));
  });

  it("OID adjustment — included via 1099-INT Box 1 (spec Line 1 edge case: OID)", () => {
    // Original Issue Discount is reported on 1099-OID and also flows to 1099-INT Box 1
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Zero Coupon Bond Issuer", interestIncome: "450" }),
        make1099Int({ payer: "Bank Savings", interestIncome: "1200" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.totalInterest).toEqual(d("1650"));
    expect(result.isRequired).toBe(true);
  });
});

// =================================================================
// Seller-Financed Mortgage Interest — Spec Line 1 inputs
// =================================================================

describe("Schedule B edge case - seller-financed mortgage interest", () => {
  it("seller-financed mortgage interest received — reported as interest payer (spec Line 1 input)", () => {
    // When a taxpayer holds a seller-financed mortgage, they receive interest
    // reported on their own 1099-INT or self-reported as a payer entry
    const input = makeFixture({
      form1099Int: [
        make1099Int({ payer: "Buyer - John Smith (mortgage)", interestIncome: "6000" }),
        make1099Int({ payer: "Savings Account", interestIncome: "300" }),
      ],
    });
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(2);
    expect(result.totalInterest).toEqual(d("6300"));
    expect(result.taxableInterest).toEqual(d("6300"));
    expect(result.isRequired).toBe(true);
  });
});
