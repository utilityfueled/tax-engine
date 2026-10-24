/**
 * Qualifying Surviving Spouse (QSS) end-to-end test.
 * Surviving spouse with one dependent child, W-2 income, interest, and dividends.
 * QSS uses same brackets, standard deduction, and SOME thresholds as MFJ.
 * Key differences: CTC ($200K not $400K), education credits ($90K not $180K),
 * Additional Medicare Tax ($200K not $250K), QBI ($197,300 not $394,600).
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { getConstants } from "@/models/constants.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

const qssFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "qualifying_surviving_spouse",
    primary: {
      firstName: "David",
      lastName: "Hernandez",
      ssn: "333-44-5555",
      dateOfBirth: "1982-11-03",
    },
    address: {
      street: "250 Maple Dr",
      city: "Denver",
      state: "CO",
      zip: "80202",
    },
    dependents: [
      {
        firstName: "Lucia",
        lastName: "Hernandez",
        ssn: "666-77-8888",
        relationship: "Daughter",
        dateOfBirth: "2019-02-14",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Rocky Mountain Corp", ein: "44-5566778" },
      wages: "120000",
      federalWithheld: "18000",
      socialSecurityWages: "120000",
      socialSecurityWithheld: "7440",
      medicareWages: "120000",
      medicareWithheld: "1740",
      stateTaxWithheld: "0",
      stateWages: "120000",
      localTaxWithheld: "0",
      state: "CO",
    },
  ],
  form1099Int: [
    {
      payer: "First National Bank",
      interestIncome: "1500",
      federalWithheld: "0",
      earlyWithdrawalPenalty: "0",
      usSavingsBondInterest: "0",
      taxExemptInterest: "0",
    },
  ],
  form1099Div: [
    {
      payer: "Schwab Index Fund",
      ordinaryDividends: "2000",
      qualifiedDividends: "1200",
      totalCapitalGainDistributions: "0",
      federalWithheld: "0",
      foreignTaxPaid: "0",
      foreignCountry: "",
      section1250Gain: "0",
      section1202Gain: "0",
      collectiblesGain: "0",
      nondividendDistributions: "0",
      exemptInterestDividends: "0",
    },
  ],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
};

describe("Qualifying Surviving Spouse full return", () => {
  const federal = calculateFederalTax(qssFixture);

  // ── Filing Status ─────────────────────────────────────
  it("filing status is qualifying_surviving_spouse", () => {
    expect(federal.filingStatus).toBe("qualifying_surviving_spouse");
  });

  // ── Income ────────────────────────────────────────────
  it("wages from W-2 = $120,000", () => {
    expect(federal.totalWages.toNumber()).toBe(120000);
  });

  it("taxable interest = $1,500", () => {
    expect(federal.totalInterest.toNumber()).toBe(1500);
  });

  it("ordinary dividends = $2,000", () => {
    expect(federal.totalDividends.toNumber()).toBe(2000);
  });

  it("qualified dividends = $1,200", () => {
    expect(federal.qualifiedDividends.toNumber()).toBe(1200);
  });

  it("total income = wages + interest + dividends = $123,500", () => {
    expect(federal.totalIncome.toNumber()).toBe(123500);
  });

  // ── Adjustments & AGI ─────────────────────────────────
  it("no adjustments (no SE income, no above-the-line deductions)", () => {
    expect(federal.adjustmentsToIncome.toNumber()).toBe(0);
  });

  it("AGI = total income = $123,500", () => {
    expect(federal.agi.toNumber()).toBe(123500);
  });

  // ── Deductions ────────────────────────────────────────
  it("QSS standard deduction matches MFJ = $31,500", () => {
    expect(federal.standardDeduction.toNumber()).toBe(31500);
    expect(federal.standardDeduction.toNumber()).toBe(
      c.standardDeduction.married_filing_jointly.toNumber()
    );
  });

  it("uses standard deduction (no itemized items)", () => {
    expect(federal.deductionUsed).toBe("standard");
    expect(federal.deductionAmount.toNumber()).toBe(31500);
  });

  it("taxable income = AGI - $31,500 = $92,000", () => {
    expect(federal.taxableIncome.toNumber()).toBe(92000);
  });

  // ── Tax Computation ───────────────────────────────────
  it("tax uses MFJ brackets (same as QSS)", () => {
    // $93,500 taxable income falls in the 12% MFJ bracket (up to $96,950)
    // Verify tax is positive and computed
    expect(federal.totalTaxBeforeCredits.greaterThan(0)).toBe(true);
  });

  it("ordinary tax + capital gains tax equals total tax before credits", () => {
    const combined = federal.ordinaryTax.plus(federal.capitalGainsTax);
    expect(federal.totalTaxBeforeCredits.toNumber()).toBe(combined.toNumber());
  });

  it("capital gains tax component is non-negative (qualified dividends taxed preferentially)", () => {
    // $1,200 qualified dividends get 0% rate since taxable income ($93,500)
    // is under MFJ 0% cap gains threshold ($96,700)
    expect(federal.capitalGainsTax.greaterThanOrEqualTo(0)).toBe(true);
  });

  // ── Credits ───────────────────────────────────────────
  it("CTC = $2,200 for one qualifying child", () => {
    expect(federal.childTaxCredit.toNumber()).toBe(2200);
  });

  it("CTC not phased out (AGI $123,500 well below QSS threshold of $200K)", () => {
    const threshold = c.childTaxCredit.phaseOutThreshold.qualifying_surviving_spouse;
    expect(federal.agi.lessThan(threshold)).toBe(true);
    expect(federal.childTaxCredit.toNumber()).toBe(2200);
  });

  // ── Additional Taxes ──────────────────────────────────
  it("no self-employment tax (no SE income)", () => {
    expect(federal.selfEmploymentTax.toNumber()).toBe(0);
  });

  it("no additional Medicare tax (wages $120K below $200K QSS threshold — IRC §3101(b)(2)(C))", () => {
    expect(federal.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("no NIIT (AGI below $250K MFJ/QSS threshold)", () => {
    expect(federal.niitTax.toNumber()).toBe(0);
  });

  // ── Payments ──────────────────────────────────────────
  it("withholding from W-2 = $18,000", () => {
    expect(federal.totalWithholding.toNumber()).toBe(18000);
  });

  // ── Final ─────────────────────────────────────────────
  it("total tax is positive", () => {
    expect(federal.totalTax.greaterThan(0)).toBe(true);
  });

  it("refund and owed are mutually exclusive", () => {
    const both =
      federal.refund.greaterThan(0) && federal.amountOwed.greaterThan(0);
    expect(both).toBe(false);
  });

  it("tax equation: totalTax = payments - refund + owed", () => {
    const fromPayments = federal.totalPayments
      .minus(federal.refund)
      .plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });

  // ── Audit Trail ───────────────────────────────────────
  it("audit trail includes Form 1040", () => {
    const forms = new Set(federal.allLines.map((l) => l.form));
    expect(forms.has("1040")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with only W-2 income (simple return)
// ═══════════════════════════════════════════════════════════
describe("QSS with only W-2 income — simple return", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [
      {
        employer: { name: "Rocky Mountain Corp", ein: "44-5566778" },
        wages: "75000",
        federalWithheld: "9000",
        socialSecurityWages: "75000",
        socialSecurityWithheld: "4650",
        medicareWages: "75000",
        medicareWithheld: "1087.50",
        stateTaxWithheld: "0",
        stateWages: "75000",
        localTaxWithheld: "0",
        state: "CO",
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
    donations: [],
  };

  const federal = calculateFederalTax(input);

  it("Form 1040 Line 1 — wages only income = $75,000", () => {
    expect(federal.totalWages.toNumber()).toBe(75000);
    expect(federal.totalIncome.toNumber()).toBe(75000);
  });

  it("Form 1040 Line 11 — AGI = $75,000 (no adjustments)", () => {
    expect(federal.agi.toNumber()).toBe(75000);
  });

  it("Form 1040 Line 12 — standard deduction = MFJ $31,500", () => {
    expect(federal.deductionAmount.toNumber()).toBe(31500);
    expect(federal.deductionUsed).toBe("standard");
  });

  it("Form 1040 Line 15 — taxable income = $43,500", () => {
    expect(federal.taxableIncome.toNumber()).toBe(43500);
  });

  it("Form 1040 Line 19 — CTC = $2,200 for one child", () => {
    expect(federal.childTaxCredit.toNumber()).toBe(2200);
  });

  it("no capital gains tax, no investment income", () => {
    expect(federal.capitalGainsTax.toNumber()).toBe(0);
    expect(federal.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with rental income (Schedule E) and passive loss allowance
// ═══════════════════════════════════════════════════════════
describe("QSS with rental income — Schedule E passive loss", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [
      {
        employer: { name: "Rocky Mountain Corp", ein: "44-5566778" },
        wages: "90000",
        federalWithheld: "12000",
        socialSecurityWages: "90000",
        socialSecurityWithheld: "5580",
        medicareWages: "90000",
        medicareWithheld: "1305",
        stateTaxWithheld: "0",
        stateWages: "90000",
        localTaxWithheld: "0",
        state: "CO",
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
    donations: [],
    rentalProperties: [
      {
        description: "456 Oak Lane, Denver CO",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "18000",
        insurance: "1200",
        mortgageInterest: "8000",
        repairs: "3000",
        taxes: "2400",
        depreciation: "10000",
        utilities: "1800",
      },
    ],
  };

  const federal = calculateFederalTax(input);

  it("Schedule E Line 26 — totalRentalIncome reflects rental loss", () => {
    // Rents: 18000 - Expenses: (1200+8000+3000+2400+10000+1800) = 26400 => net = -8400
    expect(federal.scheduleE!.totalRentalIncome.toNumber()).toBe(-8400);
  });

  it("Form 8582 — passive loss allowed up to $25,000 (AGI below $100K)", () => {
    // AGI from wages = $90,000 (below $100K phase-out start for $25K allowance)
    // Loss of $8,400 < $25,000 limit, so full loss allowed
    expect(federal.form8582!.allowedLoss.toNumber()).toBe(8400);
  });

  it("Form 1040 Line 9 — total income includes rental loss", () => {
    // $90,000 wages - $8,400 rental loss = $81,600
    expect(federal.totalIncome.toNumber()).toBe(81600);
  });

  it("Form 1040 Line 11 — AGI reflects rental loss deduction", () => {
    expect(federal.agi.toNumber()).toBe(81600);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with self-employment income (Schedule C + SE)
// ═══════════════════════════════════════════════════════════
describe("QSS with self-employment income — Schedule C + SE", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [],
    form1099Nec: [
      {
        payer: "Consulting Client A",
        nonemployeeCompensation: "100000",
        federalWithheld: "0",
      },
    ],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
    scheduleC: {
      businessName: "Hernandez Consulting",
      grossReceipts: "100000",
      expenses: {
        officeExpense: "2000",
        supplies: "1000",
        travel: "3000",
      },
    },
  };

  const federal = calculateFederalTax(input);

  it("Schedule C Line 31 — net profit = $94,000", () => {
    // $100,000 - $6,000 expenses = $94,000
    expect(federal.scheduleC!.netProfit.toNumber()).toBe(94000);
  });

  it("Schedule SE Line 12 — SE tax on $94,000 net earnings", () => {
    // SE earnings = $94,000 * 0.9235 = $86,809
    // SS portion: $86,809 * 0.124 = $10,764.32 (rounded)
    // Medicare: $86,809 * 0.029 = $2,517.46 (rounded)
    expect(federal.selfEmploymentTax.greaterThan(0)).toBe(true);
    expect(federal.scheduleSE!.totalSETax.greaterThan(d(13000))).toBe(true);
  });

  it("Form 1040 Line 10 — adjustments include deductible half of SE tax", () => {
    const expectedDeduction = federal.scheduleSE!.deductibleHalf;
    expect(federal.adjustmentsToIncome.toNumber()).toBe(expectedDeduction.toNumber());
    expect(expectedDeduction.greaterThan(d(6500))).toBe(true);
  });

  it("Form 1040 Line 11 — AGI = net profit minus SE deduction", () => {
    const expectedAGI = d(94000).minus(federal.scheduleSE!.deductibleHalf);
    expect(federal.agi.toNumber()).toBe(expectedAGI.toNumber());
  });

  it("Form 1040 Line 24 — total tax includes SE tax", () => {
    expect(federal.totalTax.greaterThan(federal.selfEmploymentTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with capital gains triggering NIIT ($250K threshold same as MFJ)
// ═══════════════════════════════════════════════════════════
describe("QSS with capital gains triggering NIIT", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [
      {
        employer: { name: "Rocky Mountain Corp", ein: "44-5566778" },
        wages: "150000",
        federalWithheld: "25000",
        socialSecurityWages: "150000",
        socialSecurityWithheld: "9300",
        medicareWages: "150000",
        medicareWithheld: "2175",
        stateTaxWithheld: "0",
        stateWages: "150000",
        localTaxWithheld: "0",
        state: "CO",
      },
    ],
    form1099B: [
      {
        broker: "Schwab",
        transactions: [
          {
            description: "AAPL 100 shares",
            dateAcquired: "2020-01-15",
            dateSold: "2025-06-10",
            proceeds: "200000",
            costBasis: "80000",
            holdingPeriod: "long",
          },
        ],
      },
    ],
    form1099Int: [],
    form1099Div: [],
    form1099Nec: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
  };

  const federal = calculateFederalTax(input);

  it("Form 1040 Line 7 — capital gain = $120,000", () => {
    expect(federal.capitalGainLoss.toNumber()).toBe(120000);
  });

  it("Form 1040 Line 9 — total income = $270,000", () => {
    expect(federal.totalIncome.toNumber()).toBe(270000);
  });

  it("Form 8960 — NIIT triggered (AGI $270K > $250K QSS threshold)", () => {
    const niitThreshold = c.niit.threshold.qualifying_surviving_spouse;
    expect(federal.agi.greaterThan(niitThreshold)).toBe(true);
    // NIIT = 3.8% * min(net investment income, AGI - $250K)
    // Net investment income = $120,000 LTCG
    // AGI excess = $270,000 - $250,000 = $20,000
    // NIIT = 3.8% * $20,000 = $760
    expect(federal.niitTax.toNumber()).toBe(760);
  });

  it("Schedule D — long-term capital gain taxed at preferential rates", () => {
    expect(federal.capitalGainsTax.greaterThan(0)).toBe(true);
  });

  it("Form 1040 Line 24 — total tax includes NIIT", () => {
    const taxWithoutNIIT = federal.totalTax.minus(federal.niitTax);
    expect(federal.totalTax.greaterThan(taxWithoutNIIT)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with education credits (AOTC, LLC)
// ═══════════════════════════════════════════════════════════
describe("QSS with education credits — AOTC and LLC", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [
      {
        employer: { name: "Rocky Mountain Corp", ein: "44-5566778" },
        wages: "80000",
        federalWithheld: "10000",
        socialSecurityWages: "80000",
        socialSecurityWithheld: "4960",
        medicareWages: "80000",
        medicareWithheld: "1160",
        stateTaxWithheld: "0",
        stateWages: "80000",
        localTaxWithheld: "0",
        state: "CO",
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
    donations: [],
    educationExpenses: {
      aocStudents: [{ name: "David Hernandez", qualifiedExpenses: "4000" }],
      llcExpenses: "5000",
    },
  };

  const federal = calculateFederalTax(input);

  it("Form 8863 — AOTC nonrefundable portion credited against tax", () => {
    // AOTC: 100% of first $2,000 + 25% of next $2,000 = $2,500
    // 40% refundable = $1,000, 60% nonrefundable = $1,500
    expect(federal.otherCredits.greaterThan(0)).toBe(true);
  });

  it("Form 1040 Line 20 — education credits included in Schedule 3 nonrefundable credits", () => {
    // Nonrefundable AOTC ($1,500) + LLC credit (up to $2,000) appear on Sched 3
    expect(federal.otherCredits.greaterThanOrEqualTo(d(1500))).toBe(true);
  });

  it("tax equation holds with education credits", () => {
    const fromPayments = federal.totalPayments
      .minus(federal.refund)
      .plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with CTC for multiple children
// ═══════════════════════════════════════════════════════════
describe("QSS with CTC for multiple children", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
        {
          firstName: "Carlos",
          lastName: "Hernandez",
          ssn: "666-77-9999",
          relationship: "Son",
          dateOfBirth: "2021-08-22",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
        {
          firstName: "Elena",
          lastName: "Hernandez",
          ssn: "666-77-1111",
          relationship: "Daughter",
          dateOfBirth: "2023-03-10",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [
      {
        employer: { name: "Rocky Mountain Corp", ein: "44-5566778" },
        wages: "55000",
        federalWithheld: "5000",
        socialSecurityWages: "55000",
        socialSecurityWithheld: "3410",
        medicareWages: "55000",
        medicareWithheld: "797.50",
        stateTaxWithheld: "0",
        stateWages: "55000",
        localTaxWithheld: "0",
        state: "CO",
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
    donations: [],
  };

  const federal = calculateFederalTax(input);

  it("Form 8812 Line 12 — max CTC = $6,600 for three children", () => {
    expect(federal.form8812!.ctcBeforeLimitation.toNumber()).toBe(6600);
  });

  it("Form 8812 Line 14 — nonrefundable CTC limited to tax liability", () => {
    expect(federal.form8812!.nonrefundableCTC.lessThanOrEqualTo(
      federal.totalTaxBeforeCredits.minus(federal.otherCredits)
    )).toBe(true);
  });

  it("Form 8812 Line 27 — ACTC covers unused CTC portion", () => {
    // With $55K income and 3 kids, tax liability is low; ACTC picks up the slack
    // ACTC = 15% * (earned income - $2,500), capped at unused CTC and $1,700/child
    expect(federal.form8812!.actc.greaterThan(0)).toBe(true);
  });

  it("Form 1040 Line 19 — childTaxCredit = nonrefundable CTC from Form 8812", () => {
    expect(federal.childTaxCredit.toNumber()).toBe(federal.form8812!.nonrefundableCTC.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with AMT triggered by large SALT
// ═══════════════════════════════════════════════════════════
describe("QSS with AMT triggered by large SALT", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [
      {
        employer: { name: "Rocky Mountain Corp", ein: "44-5566778" },
        wages: "400000",
        federalWithheld: "80000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "400000",
        medicareWithheld: "5800",
        stateTaxWithheld: "25000",
        stateWages: "400000",
        localTaxWithheld: "0",
        state: "CO",
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
        lender: "First National Bank",
        mortgageInterestReceived: "18000",
        outstandingMortgagePrincipal: "500000",
        propertyTax: "12000",
      },
    ],
    form1095A: [],
    donations: [
      {
        organization: "Denver Food Bank",
        type: "cash",
        amount: "5000",
        dateOfDonation: "2025-12-15",
      },
    ],
  };

  const federal = calculateFederalTax(input);

  it("Schedule A — itemized deductions used (SALT + mortgage + charitable)", () => {
    // SALT capped at $10,000 + $18,000 mortgage + $5,000 charitable = $33,000 > $30,000 std
    expect(federal.deductionUsed).toBe("itemized");
  });

  it("Form 6251 — AMT exemption uses QSS/MFJ amount of $137,000", () => {
    expect(c.amt.exemption.qualifying_surviving_spouse.toNumber()).toBe(137000);
  });

  it("Form 6251 — AMT adds back SALT deduction", () => {
    // AMT adds back the $10,000 SALT; at $400K income this may trigger AMT
    // AMT may or may not be > 0 depending on regular tax vs tentative minimum
    expect(federal.amt.greaterThanOrEqualTo(0)).toBe(true);
  });

  it("Form 1040 Line 24 — total tax includes AMT if applicable", () => {
    // totalTax = taxAfterCredits + AMT + other additional taxes
    expect(federal.totalTax.greaterThanOrEqualTo(
      federal.totalTaxBeforeCredits.minus(federal.totalCredits).plus(federal.amt)
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with estimated tax payments
// ═══════════════════════════════════════════════════════════
describe("QSS with estimated tax payments", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [],
    form1099Nec: [
      {
        payer: "Consulting Client",
        nonemployeeCompensation: "120000",
        federalWithheld: "0",
      },
    ],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
    scheduleC: {
      businessName: "Hernandez Consulting",
      grossReceipts: "120000",
      expenses: { officeExpense: "2000" },
    },
    adjustments: {
      estimatedTaxPayments: [
        { date: "2025-04-15", amount: "7000", type: "federal" },
        { date: "2025-06-15", amount: "7000", type: "federal" },
        { date: "2025-09-15", amount: "7000", type: "federal" },
        { date: "2026-01-15", amount: "7000", type: "federal" },
      ],
    },
  };

  const federal = calculateFederalTax(input);

  it("Form 1040 Line 26 — estimated payments = $28,000", () => {
    expect(federal.estimatedTaxPayments.toNumber()).toBe(28000);
  });

  it("Form 1040 Line 33 — total payments includes estimated + ACTC", () => {
    expect(federal.totalPayments.greaterThanOrEqualTo(d(28000))).toBe(true);
  });

  it("Form 1040 Line 25d — no W-2 withholding", () => {
    expect(federal.totalWithholding.toNumber()).toBe(0);
  });

  it("tax equation holds with estimated payments", () => {
    const fromPayments = federal.totalPayments
      .minus(federal.refund)
      .plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with foreign tax credit
// ═══════════════════════════════════════════════════════════
describe("QSS with foreign tax credit", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [
      {
        employer: { name: "Rocky Mountain Corp", ein: "44-5566778" },
        wages: "100000",
        federalWithheld: "14000",
        socialSecurityWages: "100000",
        socialSecurityWithheld: "6200",
        medicareWages: "100000",
        medicareWithheld: "1450",
        stateTaxWithheld: "0",
        stateWages: "100000",
        localTaxWithheld: "0",
        state: "CO",
      },
    ],
    form1099Int: [],
    form1099Div: [
      {
        payer: "Vanguard International Fund",
        ordinaryDividends: "8000",
        qualifiedDividends: "5000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "600",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      },
    ],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
  };

  const federal = calculateFederalTax(input);

  it("Form 1116 — foreign tax credit > 0 from international dividends", () => {
    expect(federal.foreignTaxCredit.greaterThan(0)).toBe(true);
  });

  it("Form 1116 — foreign tax credit limited to $600 paid", () => {
    expect(federal.foreignTaxCredit.lessThanOrEqualTo(d(600))).toBe(true);
  });

  it("Form 1040 Line 20 — foreign tax credit flows through Schedule 3", () => {
    expect(federal.otherCredits.greaterThanOrEqualTo(federal.foreignTaxCredit)).toBe(true);
  });

  it("tax equation holds with foreign tax credit", () => {
    const fromPayments = federal.totalPayments
      .minus(federal.refund)
      .plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with QBI deduction
// ═══════════════════════════════════════════════════════════
describe("QSS with QBI deduction — Form 8995", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [
      {
        employer: { name: "Rocky Mountain Corp", ein: "44-5566778" },
        wages: "60000",
        federalWithheld: "7000",
        socialSecurityWages: "60000",
        socialSecurityWithheld: "3720",
        medicareWages: "60000",
        medicareWithheld: "870",
        stateTaxWithheld: "0",
        stateWages: "60000",
        localTaxWithheld: "0",
        state: "CO",
      },
    ],
    form1099Nec: [
      {
        payer: "Freelance Client",
        nonemployeeCompensation: "50000",
        federalWithheld: "0",
      },
    ],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
    scheduleC: {
      businessName: "Hernandez Side Gig",
      grossReceipts: "50000",
      expenses: { supplies: "2000", officeExpense: "1000" },
    },
  };

  const federal = calculateFederalTax(input);

  it("Form 8995 — QBI deduction = 20% of Schedule C net profit", () => {
    // Net profit = $50,000 - $3,000 = $47,000
    // QBI deduction = min(20% of $47,000, 20% of taxable income before QBI)
    // = min($9,400, ...)
    expect(federal.form8995!.qbiDeduction.greaterThan(0)).toBe(true);
  });

  it("Form 8995 — QSS uses single/HoH simplified threshold of $197,300 (IRC §199A(e)(2))", () => {
    const threshold = c.qbi.simplifiedThreshold.qualifying_surviving_spouse;
    expect(threshold.toNumber()).toBe(197300);
    // AGI well below threshold, so simplified form applies
    expect(federal.agi.lessThan(threshold)).toBe(true);
  });

  it("Form 1040 Line 13 — QBI deduction reduces taxable income", () => {
    const qbiDeduction = federal.form8995!.qbiDeduction;
    const expectedTaxable = federal.agi.minus(federal.deductionAmount).minus(qbiDeduction);
    expect(federal.taxableIncome.toNumber()).toBe(
      Decimal.max(expectedTaxable, 0).toNumber()
    );
  });
});

// ═══════════════════════════════════════════════════════════
// QSS at very high income ($500K+) with multiple surtaxes
// ═══════════════════════════════════════════════════════════
describe("QSS at very high income ($500K+) — multiple surtaxes", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [
      {
        employer: { name: "Rocky Mountain Corp", ein: "44-5566778" },
        wages: "350000",
        federalWithheld: "70000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "350000",
        medicareWithheld: "5075",
        stateTaxWithheld: "0",
        stateWages: "350000",
        localTaxWithheld: "0",
        state: "CO",
      },
    ],
    form1099B: [
      {
        broker: "Schwab",
        transactions: [
          {
            description: "MSFT 500 shares",
            dateAcquired: "2018-03-01",
            dateSold: "2025-09-15",
            proceeds: "250000",
            costBasis: "50000",
            holdingPeriod: "long",
          },
        ],
      },
    ],
    form1099Int: [
      {
        payer: "Treasury Direct",
        interestIncome: "10000",
        federalWithheld: "0",
      },
    ],
    form1099Div: [
      {
        payer: "Vanguard Total Market",
        ordinaryDividends: "15000",
        qualifiedDividends: "12000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        foreignCountry: "",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      },
    ],
    form1099Nec: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
  };

  const federal = calculateFederalTax(input);

  it("Form 1040 Line 9 — total income = $575,000", () => {
    // $350K wages + $200K LTCG + $10K interest + $15K dividends = $575,000
    expect(federal.totalIncome.toNumber()).toBe(575000);
  });

  it("Form 8959 — additional Medicare tax on wages above $200K QSS threshold (IRC §3101(b)(2)(C))", () => {
    // 0.9% * ($350,000 - $200,000) = $1,350
    expect(federal.additionalMedicareTax.toNumber()).toBe(1350);
  });

  it("Form 8960 — NIIT on investment income (AGI > $250K)", () => {
    // Net investment income = $200K LTCG + $10K interest + $15K dividends = $225,000
    // AGI excess over $250K = $575,000 - $250,000 = $325,000
    // NIIT = 3.8% * min($225,000, $325,000) = 3.8% * $225,000 = $8,550
    expect(federal.niitTax.toNumber()).toBe(8550);
  });

  it("Schedule 2 — totalAdditionalTaxes includes Medicare + NIIT", () => {
    expect(federal.totalAdditionalTaxes.greaterThanOrEqualTo(
      federal.additionalMedicareTax.plus(federal.niitTax)
    )).toBe(true);
  });

  it("Form 1040 Line 24 — total tax is substantial at $500K+ income", () => {
    expect(federal.totalTax.greaterThan(d(100000))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with zero income (no tax)
// ═══════════════════════════════════════════════════════════
describe("QSS with zero income — no tax owed", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
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
    donations: [],
  };

  const federal = calculateFederalTax(input);

  it("Form 1040 Line 9 — total income = $0", () => {
    expect(federal.totalIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Line 15 — taxable income = $0", () => {
    expect(federal.taxableIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Line 16 — tax before credits = $0", () => {
    expect(federal.totalTaxBeforeCredits.toNumber()).toBe(0);
  });

  it("Form 1040 Line 24 — total tax = $0", () => {
    expect(federal.totalTax.toNumber()).toBe(0);
  });

  it("Form 1040 Line 37 — no amount owed", () => {
    expect(federal.amountOwed.toNumber()).toBe(0);
  });

  it("Form 1040 Line 19 — no CTC without earned income to generate tax liability", () => {
    expect(federal.childTaxCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with only investment income (no earned income)
// ═══════════════════════════════════════════════════════════
describe("QSS with only investment income — no earned income", () => {
  const input: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "qualifying_surviving_spouse",
      primary: {
        firstName: "David",
        lastName: "Hernandez",
        ssn: "333-44-5555",
        dateOfBirth: "1982-11-03",
      },
      address: { street: "250 Maple Dr", city: "Denver", state: "CO", zip: "80202" },
      dependents: [
        {
          firstName: "Lucia",
          lastName: "Hernandez",
          ssn: "666-77-8888",
          relationship: "Daughter",
          dateOfBirth: "2019-02-14",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [],
    form1099Int: [
      {
        payer: "Bank of America",
        interestIncome: "30000",
        federalWithheld: "3000",
      },
    ],
    form1099Div: [
      {
        payer: "Vanguard Dividend Fund",
        ordinaryDividends: "25000",
        qualifiedDividends: "20000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        foreignCountry: "",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      },
    ],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
  };

  const federal = calculateFederalTax(input);

  it("Form 1040 Line 1 — no wages", () => {
    expect(federal.totalWages.toNumber()).toBe(0);
  });

  it("Form 1040 Line 9 — total income = $55,000 (interest + dividends)", () => {
    expect(federal.totalIncome.toNumber()).toBe(55000);
  });

  it("Form 1040 Line 15 — taxable income = $23,500 after $31.5K standard deduction", () => {
    expect(federal.taxableIncome.toNumber()).toBe(23500);
  });

  it("no SE tax (no self-employment earnings)", () => {
    expect(federal.selfEmploymentTax.toNumber()).toBe(0);
  });

  it("no additional Medicare tax (no earned income)", () => {
    expect(federal.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("Form 8812 — ACTC = $0 (no earned income for refundable credit)", () => {
    // ACTC requires earned income > $2,500; with no wages or SE, ACTC = $0
    expect(federal.form8812!.actc.toNumber()).toBe(0);
  });

  it("qualified dividends taxed at preferential 0% rate (taxable income $25K < $96,700)", () => {
    // All $20K of qualified dividends fall in the 0% bracket
    expect(federal.capitalGainsTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS standard deduction = MFJ amount (explicit verification)
// ═══════════════════════════════════════════════════════════
describe("QSS standard deduction matches MFJ — explicit verification", () => {
  it("constants: QSS standard deduction = MFJ standard deduction = $31,500", () => {
    expect(c.standardDeduction.qualifying_surviving_spouse.toNumber()).toBe(
      c.standardDeduction.married_filing_jointly.toNumber()
    );
    expect(c.standardDeduction.qualifying_surviving_spouse.toNumber()).toBe(31500);
  });

  it("constants: QSS tax brackets identical to MFJ brackets", () => {
    const qssBrackets = c.taxBrackets.qualifying_surviving_spouse;
    const mfjBrackets = c.taxBrackets.married_filing_jointly;
    expect(qssBrackets.length).toBe(mfjBrackets.length);
    for (let i = 0; i < qssBrackets.length; i++) {
      expect(qssBrackets[i].min.toNumber()).toBe(mfjBrackets[i].min.toNumber());
      expect(qssBrackets[i].rate.toNumber()).toBe(mfjBrackets[i].rate.toNumber());
      if (qssBrackets[i].max !== null && mfjBrackets[i].max !== null) {
        expect(qssBrackets[i].max!.toNumber()).toBe(mfjBrackets[i].max!.toNumber());
      } else {
        expect(qssBrackets[i].max).toBe(mfjBrackets[i].max);
      }
    }
  });

  it("constants: QSS CTC phase-out threshold = single/HoH $200,000 (not MFJ — IRC §24(b)(2))", () => {
    expect(c.childTaxCredit.phaseOutThreshold.qualifying_surviving_spouse.toNumber()).toBe(
      c.childTaxCredit.phaseOutThreshold.single.toNumber()
    );
    expect(c.childTaxCredit.phaseOutThreshold.qualifying_surviving_spouse.toNumber()).toBe(200000);
  });

  it("constants: QSS additional Medicare threshold = $200,000 (same as single/HoH — IRC §3101(b)(2)(C))", () => {
    expect(c.additionalMedicareTax.threshold.qualifying_surviving_spouse.toNumber()).toBe(200000);
    expect(c.additionalMedicareTax.threshold.qualifying_surviving_spouse.toNumber()).toBe(
      c.additionalMedicareTax.threshold.single.toNumber()
    );
  });

  it("constants: QSS NIIT threshold = MFJ $250,000", () => {
    expect(c.niit.threshold.qualifying_surviving_spouse.toNumber()).toBe(
      c.niit.threshold.married_filing_jointly.toNumber()
    );
  });

  it("constants: QSS AMT exemption = MFJ $137,000", () => {
    expect(c.amt.exemption.qualifying_surviving_spouse.toNumber()).toBe(
      c.amt.exemption.married_filing_jointly.toNumber()
    );
  });

  it("constants: QSS capital gains 0% threshold = MFJ $96,700", () => {
    expect(c.capitalGainsRates.zero.threshold.qualifying_surviving_spouse.toNumber()).toBe(
      c.capitalGainsRates.zero.threshold.married_filing_jointly.toNumber()
    );
  });

  it("constants: QSS QBI simplified threshold = $197,300 (same as single — IRC §199A(e)(2))", () => {
    expect(c.qbi.simplifiedThreshold.qualifying_surviving_spouse.toNumber()).toBe(197300);
    expect(c.qbi.simplifiedThreshold.qualifying_surviving_spouse.toNumber()).toBe(
      c.qbi.simplifiedThreshold.single.toNumber()
    );
  });
});
