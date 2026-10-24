/**
 * Edge case tests for charitable contribution AGI limits.
 * Cash: 60% AGI. Appreciated LTCG property: 30% AGI, or 20% AGI for the
 * supported private-foundation branch. Other non-cash: 50% AGI.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { getConstants } from "@/models/constants.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function makeFixtureWithDonations(donations: TaxYearInput["donations"]): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: { firstName: "J", lastName: "D", ssn: "123", dateOfBirth: "1990-01-01" },
      address: { street: "1 Main", city: "NYC", state: "NY", zip: "10001" },
      dependents: [],
    },
    w2s: [],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations,
  };
}

describe("Charitable AGI limits", () => {
  it("cash donations under 60% AGI — fully deductible", () => {
    const input = makeFixtureWithDonations([
      { organization: "Charity", type: "cash", amount: "5000", dateOfDonation: "2025-12-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(5000);
  });

  it("cash donations over 60% AGI — capped", () => {
    // AGI = $100K. 60% = $60K. Donation = $70K
    const input = makeFixtureWithDonations([
      { organization: "Charity", type: "cash", amount: "70000", dateOfDonation: "2025-12-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(60000);
  });

  it("cash at exactly 60% AGI boundary", () => {
    const input = makeFixtureWithDonations([
      { organization: "Charity", type: "cash", amount: "60000", dateOfDonation: "2025-12-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(60000);
  });

  it("appreciated LTCG property under 30% AGI — fully deductible", () => {
    const input = makeFixtureWithDonations([
      {
        organization: "Museum", type: "appreciated_stock", amount: "20000",
        dateOfDonation: "2025-11-01", costBasis: "5000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(20000);
  });

  it("appreciated LTCG property over 30% AGI — capped", () => {
    // AGI = $100K. 30% = $30K. Donation = $50K
    const input = makeFixtureWithDonations([
      {
        organization: "Museum", type: "appreciated_stock", amount: "50000",
        dateOfDonation: "2025-11-01", costBasis: "5000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(30000);
  });

  it("other non-cash (not LTCG) under 50% AGI — fully deductible", () => {
    const input = makeFixtureWithDonations([
      {
        organization: "Goodwill", type: "property", amount: "10000",
        dateOfDonation: "2025-06-01", costBasis: "10000", isLongTermCapitalGain: false,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(10000);
  });

  it("other non-cash over 50% AGI — capped", () => {
    const input = makeFixtureWithDonations([
      {
        organization: "Goodwill", type: "property", amount: "60000",
        dateOfDonation: "2025-06-01", costBasis: "60000", isLongTermCapitalGain: false,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(50000);
  });

  it("mixed cash and appreciated — stacked limits per IRC §170(b)(1)", () => {
    // AGI $200K. Cash $130K. Appreciated $80K (30% limit = $60K).
    // Step 1: LTCG = min($80K, 30%×$200K=$60K) = $60K
    // Step 2: Non-cash total = $60K
    // Step 3: Cash = min($130K, 60%×$200K=$120K - $60K = $60K) = $60K
    const input = makeFixtureWithDonations([
      { organization: "Red Cross", type: "cash", amount: "130000", dateOfDonation: "2025-12-01", costBasis: "0" },
      {
        organization: "Museum", type: "appreciated_stock", amount: "80000",
        dateOfDonation: "2025-11-01", costBasis: "20000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(200000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(60000); // 60% - non-cash = $60K
    expect(result.nonCashCharitable.toNumber()).toBe(60000); // Capped at 30%
    expect(result.totalItemized.toNumber()).toBe(120000); // 60K + 60K = 60% of AGI
  });

  it("zero AGI means zero charitable deduction", () => {
    const input = makeFixtureWithDonations([
      { organization: "Charity", type: "cash", amount: "5000", dateOfDonation: "2025-12-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(0), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(0);
  });

  it("no donations means zero", () => {
    const input = makeFixtureWithDonations([]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(0);
    expect(result.nonCashCharitable.toNumber()).toBe(0);
  });

  it("charitable carryforward from prior year adds to cash donations", () => {
    const input = {
      ...makeFixtureWithDonations([
        { organization: "Charity", type: "cash", amount: "5000", dateOfDonation: "2025-12-01", costBasis: "0" },
      ]),
      priorYear: {
        charitableCarryforward: "3000",
      },
    };
    const result = calculateScheduleA(input, d(100000), "single", c);
    // $5K current + $3K carryforward = $8K (under 60% of $100K = $60K)
    expect(result.cashCharitable.toNumber()).toBe(8000);
  });

  it("charitable carryforward still subject to 60% AGI limit", () => {
    const input = {
      ...makeFixtureWithDonations([
        { organization: "Charity", type: "cash", amount: "55000", dateOfDonation: "2025-12-01", costBasis: "0" },
      ]),
      priorYear: {
        charitableCarryforward: "10000",
      },
    };
    const result = calculateScheduleA(input, d(100000), "single", c);
    // $55K current + $10K carryforward = $65K, capped at 60% of $100K = $60K
    expect(result.cashCharitable.toNumber()).toBe(60000);
  });

  it("carryforward alone (no current donations) is deductible", () => {
    const input = {
      ...makeFixtureWithDonations([]),
      priorYear: {
        charitableCarryforward: "5000",
      },
    };
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(5000);
  });

  it("very low AGI ($100) with small cash donation — caps proportionally", () => {
    // AGI = $100. 60% limit = $60. Donation $50 is under the cap.
    const input = makeFixtureWithDonations([
      { organization: "Charity", type: "cash", amount: "50", dateOfDonation: "2025-06-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(100), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(50); // Under 60% of $100 = $60
  });

  it("very low AGI ($100) with donation exceeding cap — capped proportionally", () => {
    // AGI = $100. 60% limit = $60. Donation $90 is over the cap.
    const input = makeFixtureWithDonations([
      { organization: "Charity", type: "cash", amount: "90", dateOfDonation: "2025-06-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(100), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(60); // Capped at 60% of $100
  });

  it("multiple cash donations from different charities summed then capped", () => {
    // AGI = $50K. 60% = $30K. Three donations totalling $40K → capped at $30K.
    const input = makeFixtureWithDonations([
      { organization: "Red Cross", type: "cash", amount: "15000", dateOfDonation: "2025-03-01", costBasis: "0" },
      { organization: "Salvation Army", type: "cash", amount: "12000", dateOfDonation: "2025-06-01", costBasis: "0" },
      { organization: "United Way", type: "cash", amount: "13000", dateOfDonation: "2025-09-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(50000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(30000); // Sum $40K capped at 60% of $50K = $30K
  });

  it("mixed cash + appreciated LTCG + non-LTCG non-cash — stacked per IRC §170(b)(1)", () => {
    // AGI = $100K.
    // Step 1: LTCG = min($40K, 30%=$30K) = $30K
    // Step 2: Other = min($60K, 50%-$30K=$20K) = $20K. Non-cash total = $50K
    // Step 3: Cash = min($70K, 60%-$50K=$10K) = $10K
    // Total = $60K = 60% of AGI (maximum effective deduction)
    const input = makeFixtureWithDonations([
      { organization: "Cash Charity", type: "cash", amount: "70000", dateOfDonation: "2025-01-15", costBasis: "0" },
      {
        organization: "Art Museum", type: "appreciated_stock", amount: "40000",
        dateOfDonation: "2025-04-01", costBasis: "8000", isLongTermCapitalGain: true,
      },
      {
        organization: "Goodwill", type: "property", amount: "60000",
        dateOfDonation: "2025-07-01", costBasis: "60000", isLongTermCapitalGain: false,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(10000);      // 60% - 50% non-cash = $10K
    expect(result.nonCashCharitable.toNumber()).toBe(50000);   // 30K (LTCG) + 20K (other, stacked)
    expect(result.totalItemized.toNumber()).toBe(60000);       // $60K = 60% of AGI
  });

  it("cash donation $1 over 60% AGI limit — capped to exact 60%", () => {
    // AGI = $100K. 60% = $60K. Donation = $60,001.
    const input = makeFixtureWithDonations([
      { organization: "Charity", type: "cash", amount: "60001", dateOfDonation: "2025-12-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(60000); // Exactly capped at $60K
  });

  it("appreciated stock exactly at 30% AGI boundary — fully deductible, not capped", () => {
    // AGI = $100K. 30% = $30K. Donation = exactly $30K.
    const input = makeFixtureWithDonations([
      {
        organization: "Museum", type: "appreciated_stock", amount: "30000",
        dateOfDonation: "2025-08-01", costBasis: "5000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(30000); // At boundary — not reduced
  });

  it("MFJ filing status — stacked AGI limits same as single", () => {
    // AGI = $200K. LTCG = min($80K, 30%=$60K) = $60K. Non-cash = $60K.
    // Cash = min($150K, 60%=$120K - $60K) = $60K.
    const input = {
      ...makeFixtureWithDonations([
        { organization: "Red Cross", type: "cash", amount: "150000", dateOfDonation: "2025-12-01", costBasis: "0" },
        {
          organization: "Museum", type: "appreciated_stock", amount: "80000",
          dateOfDonation: "2025-11-01", costBasis: "10000", isLongTermCapitalGain: true,
        },
      ]),
      taxpayer: {
        taxYear: 2025 as const,
        filingStatus: "married_filing_jointly" as const,
        primary: { firstName: "J", lastName: "D", ssn: "123", dateOfBirth: "1990-01-01" },
        spouse: { firstName: "S", lastName: "D", ssn: "456", dateOfBirth: "1991-01-01" },
        address: { street: "1 Main", city: "NYC", state: "NY", zip: "10001" },
        dependents: [],
      },
    };
    const result = calculateScheduleA(input, d(200000), "married_filing_jointly", c);
    expect(result.cashCharitable.toNumber()).toBe(60000);  // 60% - 60K non-cash = $60K
    expect(result.nonCashCharitable.toNumber()).toBe(60000); // Capped at 30% of $200K
  });

  it("very large donation with $1M AGI — stacked limits cap total at 60%", () => {
    // AGI = $1M. LTCG = min($500K, 30%=$300K) = $300K. Non-cash = $300K.
    // Cash = min($800K, 60%=$600K - $300K) = $300K. Total = $600K = 60%.
    const input = makeFixtureWithDonations([
      { organization: "Foundation", type: "cash", amount: "800000", dateOfDonation: "2025-12-01", costBasis: "0" },
      {
        organization: "University Endowment", type: "appreciated_stock", amount: "500000",
        dateOfDonation: "2025-06-15", costBasis: "50000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(1000000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(300000);  // 60% - 300K non-cash = $300K
    expect(result.nonCashCharitable.toNumber()).toBe(300000); // Capped at 30% of $1M
    expect(result.totalItemized.toNumber()).toBe(600000);    // $600K = 60% of AGI
  });

  // ── New edge case tests ────────────────────────────────────

  it("carryforward exceeds 60% AGI — deduction capped, excess is foregone (not re-carried)", () => {
    // AGI = $50K. 60% limit = $30K.
    // No current donations. Carryforward = $40K → deductible = $30K only.
    // The engine applies the cap; the carryforward creation is caller responsibility.
    const input = {
      ...makeFixtureWithDonations([]),
      priorYear: { charitableCarryforward: "40000" },
    };
    const result = calculateScheduleA(input, d(50000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(30000); // Capped at 60% of $50K
  });

  it("multiple appreciated stock donations from different organizations — aggregated then capped at 30%", () => {
    // AGI = $100K. 30% limit = $30K.
    // Three stock donations: $12K + $10K + $15K = $37K total → capped at $30K.
    const input = makeFixtureWithDonations([
      {
        organization: "University A", type: "appreciated_stock", amount: "12000",
        dateOfDonation: "2025-03-01", costBasis: "2000", isLongTermCapitalGain: true,
      },
      {
        organization: "Museum B", type: "appreciated_stock", amount: "10000",
        dateOfDonation: "2025-06-15", costBasis: "3000", isLongTermCapitalGain: true,
      },
      {
        organization: "Foundation C", type: "appreciated_stock", amount: "15000",
        dateOfDonation: "2025-09-01", costBasis: "1000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    // $12K + $10K + $15K = $37K → capped at 30% of $100K = $30K
    expect(result.nonCashCharitable.toNumber()).toBe(30000);
  });

  it("HoH filing status — stacked limits same as single", () => {
    // AGI = $100K. LTCG = min($45K, 30%=$30K) = $30K. Non-cash = $30K.
    // Cash = min($75K, 60%=$60K - $30K) = $30K.
    const input = {
      ...makeFixtureWithDonations([
        { organization: "Red Cross", type: "cash", amount: "75000", dateOfDonation: "2025-12-01", costBasis: "0" },
        {
          organization: "Museum", type: "appreciated_stock", amount: "45000",
          dateOfDonation: "2025-10-01", costBasis: "5000", isLongTermCapitalGain: true,
        },
      ]),
      taxpayer: {
        taxYear: 2025 as const,
        filingStatus: "head_of_household" as const,
        primary: { firstName: "J", lastName: "D", ssn: "123", dateOfBirth: "1985-01-01" },
        address: { street: "1 Main", city: "NYC", state: "NY", zip: "10001" },
        dependents: [
          { firstName: "K", lastName: "D", ssn: "999", dateOfBirth: "2015-06-01", relationship: "child" as const, monthsLived: 12, isFullTimeStudent: false, isDisabled: false },
        ],
      },
    };
    const result = calculateScheduleA(input, d(100000), "head_of_household", c);
    expect(result.cashCharitable.toNumber()).toBe(30000);     // 60% - 30K non-cash = $30K
    expect(result.nonCashCharitable.toNumber()).toBe(30000);  // 30% of $100K
  });

  it("donation type 'other' (non-LTCG) — subject to 50% AGI limit", () => {
    // AGI = $100K. 50% = $50K. "Other" donation $60K → capped at $50K.
    const input = makeFixtureWithDonations([
      {
        organization: "Thrift Store", type: "other", amount: "60000",
        dateOfDonation: "2025-05-01", costBasis: "60000", isLongTermCapitalGain: false,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(50000); // Capped at 50% of $100K
  });

  it("donation type 'other' (LTCG) — subject to 30% AGI limit", () => {
    // An "other" type with isLongTermCapitalGain=true falls into the appreciated bucket.
    // AGI = $100K. 30% = $30K. "Other LTCG" donation $40K → capped at $30K.
    const input = makeFixtureWithDonations([
      {
        organization: "Art Collection", type: "other", amount: "40000",
        dateOfDonation: "2025-07-01", costBasis: "5000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(30000); // Capped at 30% of $100K
  });

  it("cash donation of exactly $1 — minimal donation fully deductible", () => {
    // AGI = $50K. 60% = $30K. Donation = $1 → fully deductible (well under cap).
    const input = makeFixtureWithDonations([
      { organization: "Penny Charity", type: "cash", amount: "1", dateOfDonation: "2025-01-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(50000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(1);
  });

  it("very large AGI ($5M) — stacked limits cap total at 60%", () => {
    // AGI = $5M. LTCG = min($2M, 30%=$1.5M) = $1.5M. Non-cash = $1.5M.
    // Cash = min($3.5M, 60%=$3M - $1.5M) = $1.5M. Total = $3M = 60%.
    const input = makeFixtureWithDonations([
      { organization: "Mega Foundation", type: "cash", amount: "3500000", dateOfDonation: "2025-12-01", costBasis: "0" },
      {
        organization: "University Endowment", type: "appreciated_stock", amount: "2000000",
        dateOfDonation: "2025-06-01", costBasis: "200000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(5000000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(1500000);   // 60% - 1.5M non-cash = $1.5M
    expect(result.nonCashCharitable.toNumber()).toBe(1500000); // 30% of $5M
    expect(result.totalItemized.toNumber()).toBe(3000000);     // $3M = 60% of AGI
  });

  it("non-cash donation with zero costBasis — FMV is deductible, LTCG bucket used when isLongTermCapitalGain=true", () => {
    // A stock with zero cost basis (fully appreciated). FMV = $25K, costBasis = 0.
    // isLongTermCapitalGain=true → appreciated bucket, 30% limit.
    // AGI = $100K. 30% = $30K. $25K < $30K → fully deductible.
    const input = makeFixtureWithDonations([
      {
        organization: "Charity Zero Basis", type: "appreciated_stock", amount: "25000",
        dateOfDonation: "2025-08-15", costBasis: "0", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(25000); // Fully deductible (under 30% cap)
  });

  it("zero AGI zeroes out all charitable categories — cash, appreciated, and other non-cash", () => {
    const input = makeFixtureWithDonations([
      { organization: "Cash Org", type: "cash", amount: "10000", dateOfDonation: "2025-01-01", costBasis: "0" },
      {
        organization: "Stock Org", type: "appreciated_stock", amount: "5000",
        dateOfDonation: "2025-02-01", costBasis: "1000", isLongTermCapitalGain: true,
      },
      {
        organization: "Property Org", type: "property", amount: "8000",
        dateOfDonation: "2025-03-01", costBasis: "8000", isLongTermCapitalGain: false,
      },
    ]);
    const result = calculateScheduleA(input, d(0), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(0);
    expect(result.nonCashCharitable.toNumber()).toBe(0);
    expect(result.totalItemized.toNumber()).toBe(0);
  });

  it("AGI of $1 — 60% limit is $1 (rounds to $1), cash donation capped at $1", () => {
    // AGI = $1. 60% = $0.60 → roundDollar → $1. Cash donation $500 → capped at $1.
    const input = makeFixtureWithDonations([
      { organization: "Charity", type: "cash", amount: "500", dateOfDonation: "2025-06-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(1), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(1);
  });

  it("fractional AGI — 60% limit rounds to nearest dollar", () => {
    // AGI = $333. 60% = $199.80 → roundDollar → $200. Cash donation $200 → exactly at cap.
    const input = makeFixtureWithDonations([
      { organization: "Charity", type: "cash", amount: "200", dateOfDonation: "2025-04-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(333), "single", c);
    // 333 * 0.6 = 199.8 → rounds to 200
    expect(result.cashCharitable.toNumber()).toBe(200);
  });

  it("fractional AGI — 30% limit rounds to nearest dollar", () => {
    // AGI = $333. 30% = $99.90 → roundDollar → $100. Appreciated donation $150 → capped at $100.
    const input = makeFixtureWithDonations([
      {
        organization: "Museum", type: "appreciated_stock", amount: "150",
        dateOfDonation: "2025-05-01", costBasis: "20", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(333), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(100);
  });

  it("combined cash + appreciated — stacked limits reduce cash capacity", () => {
    // AGI = $80K. LTCG = min($25K, 30%=$24K) = $24K. Non-cash = $24K.
    // Cash = min($50K, 60%=$48K - $24K = $24K) = $24K.
    const input = makeFixtureWithDonations([
      { organization: "Cash Org", type: "cash", amount: "50000", dateOfDonation: "2025-01-15", costBasis: "0" },
      {
        organization: "Stock Org", type: "appreciated_stock", amount: "25000",
        dateOfDonation: "2025-06-15", costBasis: "5000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(80000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(24000);  // 60% - 24K = $24K
    expect(result.nonCashCharitable.toNumber()).toBe(24000);
    expect(result.totalItemized.toNumber()).toBe(48000); // 24K + 24K = 60% of AGI
  });

  it("carryforward excess — cash donations + carryforward exceed 60% limit, excess is not deductible", () => {
    // AGI = $100K. 60% = $60K. Current cash = $40K. Carryforward = $30K. Total = $70K → capped at $60K.
    // Excess $10K is not deductible this year.
    const input = {
      ...makeFixtureWithDonations([
        { organization: "Charity A", type: "cash", amount: "40000", dateOfDonation: "2025-06-01", costBasis: "0" },
      ]),
      priorYear: { charitableCarryforward: "30000" },
    };
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(60000);
    // Verify excess $10K is reflected: totalItemized should only contain the capped amount
    expect(result.totalItemized.toNumber()).toBe(60000);
  });

  it("charitable donations interact correctly with SALT and mortgage deductions in totalItemized", () => {
    // Verify charitable deductions add to totalItemized alongside other Schedule A items.
    const input: TaxYearInput = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: { firstName: "T", lastName: "P", ssn: "555", dateOfBirth: "1985-01-01" },
        address: { street: "5 Oak", city: "NYC", state: "NY", zip: "10001" },
        dependents: [],
      },
      w2s: [
        {
          employer: { name: "Employer", ein: "12-3456789" },
          wages: "200000",
          federalWithheld: "50000",
          socialSecurityWages: "176100",
          socialSecurityWithheld: "10918.20",
          medicareWages: "200000",
          medicareWithheld: "2900",
          stateTaxWithheld: "12000",
          stateWages: "200000",
          localTaxWithheld: "0",
          state: "NY",
        },
      ],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      scheduleK1: [],
      form1098: [
        {
          lender: "Bank A",
          mortgageInterestReceived: "15000",
          outstandingMortgagePrincipal: "400000",
          mortgageOriginationDate: "2020-06-01",
          propertyTax: "5000",
          refundOfOverpaidInterest: "0",
          pointsPaid: "0",
          mortgageInsurancePremiums: "0",
        },
      ],
      form1095A: [],
      donations: [
        { organization: "Charity", type: "cash", amount: "50000", dateOfDonation: "2025-11-01", costBasis: "0" },
      ],
    };
    const result = calculateScheduleA(input, d(200000), "single", c);
    // Cash charitable fully deductible (50K < 120K limit)
    expect(result.cashCharitable.toNumber()).toBe(50000);
    expect(result.saltDeduction.toNumber()).toBe(17000);
    // Mortgage interest present
    expect(result.mortgageInterest.toNumber()).toBe(15000);
    expect(result.totalItemized.toNumber()).toBe(82000);
  });

  it("very high AGI ($10M) — limits scale linearly, small donation fully deductible", () => {
    // AGI = $10M. 60% = $6M. Cash = $1000 → fully deductible (trivially under limit).
    // 30% = $3M. Appreciated stock = $500 → fully deductible.
    const input = makeFixtureWithDonations([
      { organization: "Local Food Bank", type: "cash", amount: "1000", dateOfDonation: "2025-12-25", costBasis: "0" },
      {
        organization: "University", type: "appreciated_stock", amount: "500",
        dateOfDonation: "2025-12-25", costBasis: "50", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(10000000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(1000);
    expect(result.nonCashCharitable.toNumber()).toBe(500);
    expect(result.totalItemized.toNumber()).toBe(1500);
  });

  it("MFS filing status — stacked limits same as other statuses", () => {
    // AGI = $150K. LTCG = min($50K, 30%=$45K) = $45K. Non-cash = $45K.
    // Cash = min($100K, 60%=$90K - $45K = $45K) = $45K.
    const input = {
      ...makeFixtureWithDonations([
        { organization: "Red Cross", type: "cash", amount: "100000", dateOfDonation: "2025-12-01", costBasis: "0" },
        {
          organization: "Art Museum", type: "appreciated_stock", amount: "50000",
          dateOfDonation: "2025-11-01", costBasis: "10000", isLongTermCapitalGain: true,
        },
      ]),
      taxpayer: {
        taxYear: 2025 as const,
        filingStatus: "married_filing_separately" as const,
        primary: { firstName: "M", lastName: "S", ssn: "789", dateOfBirth: "1988-01-01" },
        address: { street: "3 Elm", city: "NYC", state: "NY", zip: "10001" },
        dependents: [],
      },
    };
    const result = calculateScheduleA(input, d(150000), "married_filing_separately", c);
    expect(result.cashCharitable.toNumber()).toBe(45000);  // 60% - 45K = $45K
    expect(result.nonCashCharitable.toNumber()).toBe(45000);
    expect(result.totalItemized.toNumber()).toBe(90000);  // 60% of AGI
  });

  it("both non-cash categories at limits — stacked at 50% overall", () => {
    // AGI = $200K.
    // Step 1: LTCG = min($60K, 30%=$60K) = $60K
    // Step 2: Other = min($100K, 50%=$100K - $60K = $40K) = $40K
    // Non-cash total = $100K = 50% of AGI (overall non-cash cap)
    const input = makeFixtureWithDonations([
      {
        organization: "Museum", type: "appreciated_stock", amount: "60000",
        dateOfDonation: "2025-03-01", costBasis: "10000", isLongTermCapitalGain: true,
      },
      {
        organization: "Goodwill", type: "property", amount: "100000",
        dateOfDonation: "2025-06-01", costBasis: "100000", isLongTermCapitalGain: false,
      },
    ]);
    const result = calculateScheduleA(input, d(200000), "single", c);
    // LTCG $60K + other $40K = $100K = 50% of AGI
    expect(result.nonCashCharitable.toNumber()).toBe(100000);
  });

  // ── 10-12 new tests ───────────────────────────────────────

  it("cash donation at precisely 60% of AGI with fractional AGI — roundDollar applied once before cap", () => {
    // AGI = $99,999. 60% = $59,999.40 → roundDollar → $59,999.
    // Cash donation = $59,999 → exactly at rounded cap, fully deductible.
    const input = makeFixtureWithDonations([
      { organization: "Precision Charity", type: "cash", amount: "59999", dateOfDonation: "2025-08-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(99999), "single", c);
    // 99999 * 0.6 = 59999.4 → rounds to 59999 → donation of 59999 is at cap
    expect(result.cashCharitable.toNumber()).toBe(59999);
  });

  it("appreciated LTCG property at exactly 30% of AGI with fractional result — rounds down to nearest dollar", () => {
    // AGI = $99,997. 30% = $29,999.10 → roundDollar → $29,999.
    // Appreciated stock donation = $30,000 → capped at $29,999.
    const input = makeFixtureWithDonations([
      {
        organization: "University Endowment", type: "appreciated_stock", amount: "30000",
        dateOfDonation: "2025-09-01", costBasis: "1000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(99997), "single", c);
    // 99997 * 0.3 = 29999.1 → rounds to 29999 → $30K capped at $29,999
    expect(result.nonCashCharitable.toNumber()).toBe(29999);
  });

  it("capital gain property donated to a private foundation uses the 20% AGI limit", () => {
    // IRS Pub. 526: capital gain property to certain private foundations is limited to 20% of AGI.
    // AGI = $100K. 20% = $20K. Donation = $25K → capped at $20K.
    const input = makeFixtureWithDonations([
      {
        organization: "Smith Private Foundation", type: "appreciated_stock", amount: "25000",
        dateOfDonation: "2025-06-15", costBasis: "3000", isLongTermCapitalGain: true, isPrivateFoundation: true,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(20000);
  });

  it("private-foundation capital gain property uses only the remaining 30% bucket headroom after public-charity LTCG property", () => {
    // AGI = $100K.
    // Public-charity LTCG property: $25K uses most of the 30% bucket.
    // Private-foundation LTCG property: $25K faces the smallest of:
    // 20% AGI = $20K, remaining 30% headroom = $5K, remaining 50% headroom = $25K.
    // Deductible private-foundation amount = $5K, so total non-cash charitable = $30K.
    const input = makeFixtureWithDonations([
      {
        organization: "City Museum", type: "appreciated_stock", amount: "25000",
        dateOfDonation: "2025-04-01", costBasis: "4000", isLongTermCapitalGain: true,
      },
      {
        organization: "Smith Private Foundation", type: "appreciated_stock", amount: "25000",
        dateOfDonation: "2025-06-15", costBasis: "3000", isLongTermCapitalGain: true, isPrivateFoundation: true,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);

    expect(result.nonCashCharitable.toNumber()).toBe(30000);
  });

  it("mixed cash + non-LTCG property — cash reduced by stacked non-cash", () => {
    // AGI = $120K. Other = min($55K, 50%=$60K) = $55K. Non-cash = $55K.
    // Cash = min($80K, 60%=$72K - $55K = $17K) = $17K.
    const input = makeFixtureWithDonations([
      { organization: "Food Bank", type: "cash", amount: "80000", dateOfDonation: "2025-02-01", costBasis: "0" },
      {
        organization: "Clothing Drive", type: "property", amount: "55000",
        dateOfDonation: "2025-07-15", costBasis: "55000", isLongTermCapitalGain: false,
      },
    ]);
    const result = calculateScheduleA(input, d(120000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(17000);   // 60% - 55K non-cash = $17K
    expect(result.nonCashCharitable.toNumber()).toBe(55000); // Under 50%, fully deductible
    expect(result.totalItemized.toNumber()).toBe(72000);    // $72K = 60% of AGI
  });

  it("carryforward of excess charitable contributions — excess over 60% cap is non-deductible this year", () => {
    // AGI = $80K. 60% = $48K. Carryforward alone = $60K → only $48K deductible this year.
    // The remaining $12K is excess not reflected in the engine (caller tracks carryforward years).
    const excess = d(60000).minus(d(48000)); // $12K excess this year
    const input = {
      ...makeFixtureWithDonations([]),
      priorYear: { charitableCarryforward: "60000" },
    };
    const result = calculateScheduleA(input, d(80000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(48000); // Capped at 60% of $80K
    // Caller is responsible for carrying $12K forward another year
    expect(d(60000).minus(result.cashCharitable).toNumber()).toBe(excess.toNumber());
  });

  it("donations exceeding 200% of AGI — all stacked limits triggered simultaneously", () => {
    // AGI = $50K. LTCG = min($110K, 30%=$15K) = $15K.
    // Other = min($105K, 50%=$25K - $15K = $10K) = $10K. Non-cash = $25K.
    // Cash = min($120K, 60%=$30K - $25K = $5K) = $5K.
    // Total = $30K = 60% of AGI.
    const input = makeFixtureWithDonations([
      { organization: "Cash Org", type: "cash", amount: "120000", dateOfDonation: "2025-01-15", costBasis: "0" },
      {
        organization: "Stock Org", type: "appreciated_stock", amount: "110000",
        dateOfDonation: "2025-04-01", costBasis: "10000", isLongTermCapitalGain: true,
      },
      {
        organization: "Property Org", type: "property", amount: "105000",
        dateOfDonation: "2025-08-01", costBasis: "105000", isLongTermCapitalGain: false,
      },
    ]);
    const result = calculateScheduleA(input, d(50000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(5000);     // 60% - 25K non-cash = $5K
    expect(result.nonCashCharitable.toNumber()).toBe(25000); // 15K (LTCG) + 10K (other, stacked)
    expect(result.totalItemized.toNumber()).toBe(30000);     // $30K = 60% of AGI
  });

  it("zero AGI with carryforward — carryforward is also zeroed out by the 60% cap", () => {
    // AGI = $0. 60% of $0 = $0. Carryforward = $10K. Result = $0.
    const input = {
      ...makeFixtureWithDonations([]),
      priorYear: { charitableCarryforward: "10000" },
    };
    const result = calculateScheduleA(input, d(0), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(0);
    expect(result.totalItemized.toNumber()).toBe(0);
  });

  it("small cash donation of $0.01 (fractional cent) — fully deductible, no rounding distortion", () => {
    // AGI = $100K. 60% = $60K. Cash donation = $0.01 (one cent) → fully deductible.
    const input = makeFixtureWithDonations([
      { organization: "Micro Charity", type: "cash", amount: "0.01", dateOfDonation: "2025-03-15", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(0.01);
  });

  it("charitable deduction combined with mortgage interest and points in totalItemized", () => {
    // Confirms that cash charitable, SALT, mortgage interest, and points accumulate.
    // AGI = $150K. Cash $30K (well under 60% = $90K) → fully deductible.
    // Form 1098: $12K interest, $3K property tax, $1.5K PMI, $500 points.
    // No state tax → SALT = $3K (property only, under $10K cap).
    const input: TaxYearInput = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: { firstName: "P", lastName: "Q", ssn: "777", dateOfBirth: "1982-03-10" },
        address: { street: "7 Pine", city: "Boston", state: "MA", zip: "02101" },
        dependents: [],
      },
      w2s: [],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      scheduleK1: [],
      form1098: [
        {
          lender: "First Bank",
          mortgageInterestReceived: "12000",
          outstandingMortgagePrincipal: "350000",
          mortgageOriginationDate: "2021-04-01",
          propertyTax: "3000",
          refundOfOverpaidInterest: "0",
          pointsPaid: "500",
          mortgageInsurancePremiums: "1500",
        },
      ],
      form1095A: [],
      donations: [
        { organization: "Local Charity", type: "cash", amount: "30000", dateOfDonation: "2025-10-01", costBasis: "0" },
      ],
    };
    const result = calculateScheduleA(input, d(150000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(30000);      // Fully deductible
    expect(result.saltDeduction.toNumber()).toBe(3000);        // Property tax only, under cap
    expect(result.mortgageInterest.toNumber()).toBe(12000);    // Full interest
    // Total = 0 (medical) + 3000 (SALT) + 12000 (mortgage) + 500 (points) + 30000 (cash) + 0 (non-cash)
    expect(result.totalItemized.toNumber()).toBe(45500);
  });

  it("audit trail — lines array contains Schedule A Line 12 (cash charitable) and Line 13 (non-cash) with correct values", () => {
    // Verify the audit trail records the charitable contribution lines correctly.
    // AGI = $100K. Cash $20K (under 60% limit). Appreciated stock $15K (under 30% limit).
    const input = makeFixtureWithDonations([
      { organization: "Cash Charity", type: "cash", amount: "20000", dateOfDonation: "2025-05-01", costBasis: "0" },
      {
        organization: "Stock Charity", type: "appreciated_stock", amount: "15000",
        dateOfDonation: "2025-08-01", costBasis: "2000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);

    // Verify Line 12 audit entry
    const line12 = result.lines.find((l) => l.form === "Sched A" && l.line === "12");
    expect(line12).toBeDefined();
    expect(line12!.value.toNumber()).toBe(20000);
    expect(line12!.description).toBe("Cash charitable");

    // Verify Line 13 audit entry
    const line13 = result.lines.find((l) => l.form === "Sched A" && l.line === "13");
    expect(line13).toBeDefined();
    expect(line13!.value.toNumber()).toBe(15000);
    expect(line13!.description).toBe("Non-cash charitable");

    // Verify Line 17 (total) audit entry sums correctly
    const line17 = result.lines.find((l) => l.form === "Sched A" && l.line === "17");
    expect(line17).toBeDefined();
    expect(line17!.value.toNumber()).toBe(result.totalItemized.toNumber());
  });

  it("non-LTCG property donation at exactly 50% AGI boundary — fully deductible, not capped", () => {
    // AGI = $60K. 50% = $30K. Property donation = exactly $30K → at boundary, fully deductible.
    const input = makeFixtureWithDonations([
      {
        organization: "Habitat for Humanity", type: "property", amount: "30000",
        dateOfDonation: "2025-04-15", costBasis: "30000", isLongTermCapitalGain: false,
      },
    ]);
    const result = calculateScheduleA(input, d(60000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(30000); // Exactly at 50% boundary — not reduced
  });

  it("federal pipeline: large cash donation appears in Schedule A totals when itemizing beats standard deduction", () => {
    // Single filer with W-2 wages of $500K and a large cash donation of $200K.
    // AGI = $500K. 60% of $500K = $300K. $200K < $300K → fully deductible.
    // Schedule A total will exceed the $15K standard deduction, forcing itemized.
    const input: TaxYearInput = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: { firstName: "A", lastName: "B", ssn: "321", dateOfBirth: "1980-05-01" },
        address: { street: "2 Park Ave", city: "NYC", state: "NY", zip: "10016" },
        dependents: [],
      },
      w2s: [
        {
          employer: { name: "BigCo", ein: "98-7654321" },
          wages: "500000",
          federalWithheld: "150000",
          socialSecurityWages: "176100",
          socialSecurityWithheld: "10918.20",
          medicareWages: "500000",
          medicareWithheld: "7250",
          stateTaxWithheld: "0",
          stateWages: "0",
          localTaxWithheld: "0",
          state: "NY",
        },
      ],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      scheduleK1: [],
      form1098: [],
      form1095A: [],
      donations: [
        { organization: "Big Charity", type: "cash", amount: "200000", dateOfDonation: "2025-11-01", costBasis: "0" },
      ],
    };
    const result = calculateFederalTax(input);
    // scheduleA should exist and reflect the $200K cash donation
    expect(result.scheduleA).toBeDefined();
    expect(result.scheduleA!.cashCharitable.toNumber()).toBe(200000);
    // totalItemized must include the $200K donation
    expect(result.scheduleA!.totalItemized.toNumber()).toBeGreaterThanOrEqual(200000);
    // Engine should choose itemized (well above $15K standard deduction)
    expect(result.deductionUsed).toBe("itemized");
  });

  // ── IRC §170(b)(1) stacking regression tests ──────────────

  it("cash-only: full 60% available (no non-cash to reduce it)", () => {
    // AGI $100K. Cash $70K → min($70K, 60%=$60K - $0) = $60K. No stacking impact.
    const input = makeFixtureWithDonations([
      { organization: "Charity", type: "cash", amount: "70000", dateOfDonation: "2025-01-01", costBasis: "0" },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(60000);
    expect(result.nonCashCharitable.toNumber()).toBe(0);
    expect(result.totalItemized.toNumber()).toBe(60000);
  });

  it("LTCG-only: 30% applies, no interaction needed", () => {
    // AGI $100K. LTCG $40K → min($40K, 30%=$30K) = $30K. No stacking impact.
    const input = makeFixtureWithDonations([
      {
        organization: "Museum", type: "appreciated_stock", amount: "40000",
        dateOfDonation: "2025-01-01", costBasis: "5000", isLongTermCapitalGain: true,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(0);
    expect(result.nonCashCharitable.toNumber()).toBe(30000);
    expect(result.totalItemized.toNumber()).toBe(30000);
  });

  it("other non-cash only: 50% applies, no interaction needed", () => {
    // AGI $100K. Other $60K → min($60K, 50%=$50K - $0) = $50K.
    const input = makeFixtureWithDonations([
      {
        organization: "Goodwill", type: "property", amount: "60000",
        dateOfDonation: "2025-01-01", costBasis: "60000", isLongTermCapitalGain: false,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.nonCashCharitable.toNumber()).toBe(50000);
    expect(result.totalItemized.toNumber()).toBe(50000);
  });

  it("stacking: maximum effective total is always 60% of AGI", () => {
    // AGI $100K. All three categories at maximum raw amounts.
    // LTCG $30K (at 30% cap). Other = min($50K, 50%-30%=$20K) = $20K.
    // Non-cash = $50K. Cash = min($60K, 60%-50%=$10K) = $10K.
    // Total = $60K = exactly 60%.
    const input = makeFixtureWithDonations([
      { organization: "C", type: "cash", amount: "60000", dateOfDonation: "2025-01-01", costBasis: "0" },
      {
        organization: "L", type: "appreciated_stock", amount: "30000",
        dateOfDonation: "2025-01-01", costBasis: "5000", isLongTermCapitalGain: true,
      },
      {
        organization: "O", type: "property", amount: "50000",
        dateOfDonation: "2025-01-01", costBasis: "50000", isLongTermCapitalGain: false,
      },
    ]);
    const result = calculateScheduleA(input, d(100000), "single", c);
    expect(result.cashCharitable.toNumber()).toBe(10000);
    expect(result.nonCashCharitable.toNumber()).toBe(50000); // 30K + 20K
    // Total deduction = 60% of AGI
    const totalCharitable = result.cashCharitable.plus(result.nonCashCharitable);
    expect(totalCharitable.toNumber()).toBe(60000);
  });
});
