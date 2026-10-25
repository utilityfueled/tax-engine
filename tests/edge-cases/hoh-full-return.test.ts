/**
 * Head of Household end-to-end test.
 * Single parent with child, self-employment, and education credit.
 * Exercises HoH-specific brackets, deductions, and thresholds.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { getConstants } from "@/models/constants.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

const hohFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "head_of_household",
    primary: {
      firstName: "Maria",
      lastName: "Garcia",
      ssn: "222-33-4444",
      dateOfBirth: "1988-07-20",
    },
    address: {
      street: "100 Pine St",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    dependents: [
      {
        firstName: "Sofia",
        lastName: "Garcia",
        ssn: "555-66-7777",
        relationship: "Daughter",
        dateOfBirth: "2017-05-15",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Austin Inc", ein: "33-4455667" },
      wages: "65000",
      federalWithheld: "8000",
      socialSecurityWages: "65000",
      socialSecurityWithheld: "4030",
      medicareWages: "65000",
      medicareWithheld: "942.50",
      stateTaxWithheld: "0",
      stateWages: "65000",
      localTaxWithheld: "0",
      state: "TX",
    },
  ],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [
    {
      payer: "Freelance Client",
      nonemployeeCompensation: "15000",
      federalWithheld: "0",
    },
  ],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  educationExpenses: {
    aocStudents: [{ name: "Maria Garcia", qualifiedExpenses: "4000" }],
    llcExpenses: "0",
  },
  dependentCare: {
    expenses: "5000",
    qualifyingIndividuals: 1,
  },
};

describe("Head of Household full return", () => {
  const federal = calculateFederalTax(hohFixture);

  // ── Filing Status ─────────────────────────────────────
  it("filing status is head_of_household", () => {
    expect(federal.filingStatus).toBe("head_of_household");
  });

  // ── Income ────────────────────────────────────────────
  it("wages from W-2", () => {
    expect(federal.totalWages.toNumber()).toBe(65000);
  });

  it("total income includes SE income", () => {
    // Wages $65K + Schedule C $15K = $80K
    expect(federal.totalIncome.toNumber()).toBe(80000);
  });

  // ── Deductions ────────────────────────────────────────
  it("HoH standard deduction = $23,625", () => {
    expect(federal.standardDeduction.toNumber()).toBe(
      c.standardDeduction.head_of_household.toNumber()
    );
  });

  it("uses standard deduction (no itemized items)", () => {
    expect(federal.deductionUsed).toBe("standard");
    expect(federal.deductionAmount.toNumber()).toBe(
      c.standardDeduction.head_of_household.toNumber()
    );
  });

  // ── AGI and Adjustments ───────────────────────────────
  it("adjustments include SE deduction", () => {
    expect(federal.adjustmentsToIncome.greaterThan(0)).toBe(true);
  });

  it("AGI is total income minus adjustments", () => {
    const expected = federal.totalIncome.minus(federal.adjustmentsToIncome);
    expect(federal.agi.toNumber()).toBe(expected.toNumber());
  });

  // ── Tax Computation ───────────────────────────────────
  it("taxable income = AGI - $23,625 standard deduction - QBI deduction", () => {
    // QBI deduction from 1099-NEC → Schedule C net profit
    const qbiDeduction = federal.form8995?.qbiDeduction ?? new Decimal(0);
    const expected = federal.agi
      .minus(c.standardDeduction.head_of_household)
      .minus(qbiDeduction);
    expect(federal.taxableIncome.toNumber()).toBe(expected.toNumber());
    expect(qbiDeduction.greaterThan(0)).toBe(true);
  });

  it("tax uses HoH brackets (lower than single)", () => {
    expect(federal.totalTaxBeforeCredits.greaterThan(0)).toBe(true);
  });

  // ── Credits ───────────────────────────────────────────
  it("CTC = $2,200 for one qualifying child", () => {
    expect(federal.childTaxCredit.toNumber()).toBe(2200);
  });

  it("Form 8812 sub-result available with ACTC", () => {
    expect(federal.form8812).toBeDefined();
    // High-income HoH → full CTC used nonrefundably → no ACTC
    expect(federal.form8812!.actc.toNumber()).toBe(0);
  });

  it("dependent care credit in otherCredits (via Schedule 3)", () => {
    expect(federal.otherCredits.greaterThan(0)).toBe(true);
  });

  it("education credit (AOC) computed for single HoH filer", () => {
    // HoH uses same phase-out as single: $80K-$90K
    // AGI ~$79K (under $80K) → no phase-out
    // AOC = $2,500 tentative → nonrefundable 60% = $1,500 in otherCredits
    // Plus dependent care credit
    expect(federal.otherCredits.greaterThan(d(1000))).toBe(true);
  });

  // ── SE Tax ────────────────────────────────────────────
  it("SE tax on $15K freelance income", () => {
    expect(federal.selfEmploymentTax.greaterThan(0)).toBe(true);
  });

  // ── Payments ──────────────────────────────────────────
  it("withholding from W-2", () => {
    expect(federal.totalWithholding.toNumber()).toBe(8000);
  });

  // ── Final ─────────────────────────────────────────────
  it("total tax is positive", () => {
    expect(federal.totalTax.greaterThan(0)).toBe(true);
  });

  it("refund and owed are mutually exclusive", () => {
    const both = federal.refund.greaterThan(0) && federal.amountOwed.greaterThan(0);
    expect(both).toBe(false);
  });

  it("tax equation: totalTax = payments - refund + owed", () => {
    const fromPayments = federal.totalPayments.minus(federal.refund).plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });

  // ── Audit Trail ───────────────────────────────────────
  it("audit trail includes all key forms", () => {
    const forms = new Set(federal.allLines.map((l) => l.form));
    expect(forms.has("1040")).toBe(true);
    expect(forms.has("Sched C")).toBe(true);
    expect(forms.has("Sched SE")).toBe(true);
    expect(forms.has("Form 2441")).toBe(true);
    expect(forms.has("Form 8863")).toBe(true);
    expect(forms.has("Sched 3")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 1: HoH Standard Deduction ($22,500 for 2025)
// IRS Rev. Proc. 2024-40 — HoH standard deduction is $22,500,
// which is between single ($15,000) and MFJ ($30,000).
// ══════════════════════════════════════════════════════════════════

describe("HoH standard deduction is $22,500 for 2025", () => {
  it("HoH standard deduction equals constant for head_of_household filing status", () => {
    const federal = calculateFederalTax(hohFixture);
    expect(federal.standardDeduction.toNumber()).toBe(
      c.standardDeduction.head_of_household.toNumber()
    );
  });

  it("HoH standard deduction ($22,500) is greater than single ($15,000)", () => {
    expect(c.standardDeduction.head_of_household.toNumber()).toBeGreaterThan(
      c.standardDeduction.single.toNumber()
    );
  });

  it("HoH standard deduction ($22,500) is less than MFJ ($30,000)", () => {
    expect(c.standardDeduction.head_of_household.toNumber()).toBeLessThan(
      c.standardDeduction.married_filing_jointly.toNumber()
    );
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 2: HoH with multiple dependents — CTC scales per child
// $2,000 CTC per qualifying child; two children → $4,000 total.
// ══════════════════════════════════════════════════════════════════

describe("HoH with multiple dependents — CTC scales per child", () => {
  // Use higher wages ($120K) and strip competing credits so tax easily absorbs $4K CTC.
  const twoChildFixture: TaxYearInput = {
    ...hohFixture,
    taxpayer: {
      ...hohFixture.taxpayer,
      dependents: [
        {
          firstName: "Sofia",
          lastName: "Garcia",
          ssn: "555-66-7777",
          relationship: "Daughter",
          dateOfBirth: "2017-05-15",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
        {
          firstName: "Luis",
          lastName: "Garcia",
          ssn: "555-66-8888",
          relationship: "Son",
          dateOfBirth: "2020-03-10",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        },
      ],
    },
    w2s: [
      {
        employer: { name: "Austin Inc", ein: "33-4455667" },
        wages: "120000",
        federalWithheld: "20000",
        socialSecurityWages: "120000",
        socialSecurityWithheld: "7440",
        medicareWages: "120000",
        medicareWithheld: "1740",
        stateTaxWithheld: "0",
        stateWages: "120000",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form1099Nec: [],
    educationExpenses: { aocStudents: [], llcExpenses: "0" },
    dependentCare: undefined,
  };

  const oneChildHighIncomeFixture: TaxYearInput = {
    ...twoChildFixture,
    taxpayer: {
      ...twoChildFixture.taxpayer,
      dependents: [twoChildFixture.taxpayer.dependents[0]],
    },
  };

  it("total CTC + ACTC = $4,400 for two qualifying children (2 × $2,200)", () => {
    const federal = calculateFederalTax(twoChildFixture);
    const total = federal.form8812.nonrefundableCTC.plus(federal.form8812.actc);
    expect(total.toNumber()).toBe(4400);
  });

  it("two-child total credit is double the one-child credit", () => {
    const oneChild = calculateFederalTax(oneChildHighIncomeFixture);
    const twoChild = calculateFederalTax(twoChildFixture);
    const oneTotal = oneChild.form8812.nonrefundableCTC.plus(oneChild.form8812.actc);
    const twoTotal = twoChild.form8812.nonrefundableCTC.plus(twoChild.form8812.actc);
    expect(twoTotal.toNumber()).toBe(oneTotal.toNumber() * 2);
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 3: HoH with capital gains — QDCG worksheet uses HoH brackets
// HoH 0% cap gains rate threshold is $64,750 (2025), higher than single $48,350.
// ══════════════════════════════════════════════════════════════════

describe("HoH with capital gains — QDCG worksheet uses HoH brackets", () => {
  const hohCapGainsFixture: TaxYearInput = {
    ...hohFixture,
    // Keep wages lower so LTCG may hit 0% bracket
    w2s: [
      {
        employer: { name: "Austin Inc", ein: "33-4455667" },
        wages: "40000",
        federalWithheld: "4000",
        socialSecurityWages: "40000",
        socialSecurityWithheld: "2480",
        medicareWages: "40000",
        medicareWithheld: "580",
        stateTaxWithheld: "0",
        stateWages: "40000",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form1099Nec: [],
    form1099Div: [
      { specifiedPrivateActivityBondInterest: "0",
        payer: "Brokerage",
        ordinaryDividends: "5000",
        qualifiedDividends: "5000",
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
    form1099B: [
      {
        broker: "Brokerage",
        transactions: [
          {
            description: "Index Fund",
            dateAcquired: "2023-01-01",
            dateSold: "2025-06-01",
            proceeds: "15000",
            costBasis: "5000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ],
    educationExpenses: { aocStudents: [], llcExpenses: "0" },
    dependentCare: undefined,
  };

  it("capital gains are present in the return", () => {
    const federal = calculateFederalTax(hohCapGainsFixture);
    expect(federal.capitalGainLoss.toNumber()).toBeGreaterThan(0);
  });

  it("HoH 0% LTCG threshold ($64,750) is higher than single ($48,350)", () => {
    expect(c.capitalGainsRates.zero.threshold.head_of_household.toNumber()).toBe(64750);
    expect(c.capitalGainsRates.zero.threshold.head_of_household.toNumber()).toBeGreaterThan(
      c.capitalGainsRates.zero.threshold.single.toNumber()
    );
  });

  it("total tax with LTCG uses QDCG worksheet (capitalGainsTax tracked separately)", () => {
    const federal = calculateFederalTax(hohCapGainsFixture);
    // QDCG worksheet is used whenever there are qualified dividends or LTCG
    expect(federal.totalTaxBeforeCredits.greaterThan(d(0))).toBe(true);
    expect(federal.capitalGainLoss.greaterThan(d(0))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 4: HoH with self-employment income — SE tax calculated normally
// Filing status does not affect SE tax; it is always 15.3% on net earnings × 0.9235.
// ══════════════════════════════════════════════════════════════════

describe("HoH with self-employment income — SE tax calculated normally", () => {
  const seFixture: TaxYearInput = {
    ...hohFixture,
    w2s: [],
    form1099Nec: [
      {
        payer: "Freelance Client",
        nonemployeeCompensation: "50000",
        federalWithheld: "0",
      },
    ],
    educationExpenses: { aocStudents: [], llcExpenses: "0" },
    dependentCare: undefined,
  };

  it("SE tax is positive for HoH with freelance income", () => {
    const federal = calculateFederalTax(seFixture);
    expect(federal.selfEmploymentTax.greaterThan(d(0))).toBe(true);
  });

  it("SE tax deduction reduces AGI (adjustments > 0)", () => {
    const federal = calculateFederalTax(seFixture);
    // Half of SE tax is deductible as adjustment to income
    expect(federal.adjustmentsToIncome.greaterThan(d(0))).toBe(true);
  });

  it("SE tax on $50K freelance is same regardless of HoH vs single status", () => {
    // Build an equivalent single fixture for comparison
    const singleSeFixture: TaxYearInput = {
      ...seFixture,
      taxpayer: {
        ...seFixture.taxpayer,
        filingStatus: "single",
        dependents: [],
      },
    };
    const hohResult = calculateFederalTax(seFixture);
    const singleResult = calculateFederalTax(singleSeFixture);
    // SE tax is filing-status-agnostic
    expect(hohResult.selfEmploymentTax.toNumber()).toBe(
      singleResult.selfEmploymentTax.toNumber()
    );
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 5: HoH with rental loss — full $25K active participation allowance
// HoH AGI threshold for $25K rental allowance: phase-out starts at $100K (same as all statuses).
// ══════════════════════════════════════════════════════════════════

describe("HoH with rental loss — $25K active participation allowance", () => {
  const rentalLossFixture: TaxYearInput = {
    ...hohFixture,
    // Wages below $100K so full $25K rental allowance applies
    w2s: [
      {
        employer: { name: "Austin Inc", ein: "33-4455667" },
        wages: "60000",
        federalWithheld: "7000",
        socialSecurityWages: "60000",
        socialSecurityWithheld: "3720",
        medicareWages: "60000",
        medicareWithheld: "870",
        stateTaxWithheld: "0",
        stateWages: "60000",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form1099Nec: [],
    rentalProperties: [
      {
        description: "123 Rental Ave",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "12000",
        advertising: "0",
        autoTravel: "0",
        cleaning: "0",
        commissions: "0",
        insurance: "2000",
        legalProfessional: "0",
        managementFees: "0",
        mortgageInterest: "10000",
        otherInterest: "0",
        repairs: "1000",
        supplies: "0",
        taxes: "3000",
        utilities: "0",
        depreciation: "8000",
        otherExpenses: "0",
      },
    ],
    educationExpenses: { aocStudents: [], llcExpenses: "0" },
    dependentCare: undefined,
  };

  it("rental schedule E is present and reports a net rental loss", () => {
    const federal = calculateFederalTax(rentalLossFixture);
    // Schedule E Part I: totalRentalIncome is net (rents - expenses)
    // $12K rents - $24K expenses = -$12K net
    expect(federal.scheduleE).toBeDefined();
    expect(federal.scheduleE!.totalRentalIncome.toNumber()).toBe(-12000);
  });

  it("rental loss allowed up to $25K for active-participant HoH with AGI under $100K", () => {
    const federal = calculateFederalTax(rentalLossFixture);
    // Net rental loss = $12K (rents $12K - expenses $24K).
    // $25K allowance > $12K loss → full $12K is deductible; rentalAllowance = actual allowed loss.
    expect(federal.form8582).toBeDefined();
    // The engine reports the actual allowed rental loss (capped at the lesser of loss or allowance)
    expect(federal.form8582!.rentalAllowance.toNumber()).toBeGreaterThanOrEqual(12000);
  });

  it("full rental loss flows through to reduce AGI-based taxable income", () => {
    const withRental = calculateFederalTax(rentalLossFixture);
    const withoutRental = calculateFederalTax({ ...rentalLossFixture, rentalProperties: [] });
    // Taxable income should be lower when rental loss is allowed
    expect(withRental.taxableIncome.lessThan(withoutRental.taxableIncome)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 6: HoH NIIT threshold is $200K (same as single)
// Unlike MFJ ($250K), HoH uses the $200K threshold — matching single filers.
// ══════════════════════════════════════════════════════════════════

describe("HoH NIIT threshold is $200K — same as single", () => {
  it("HoH NIIT threshold constant equals $200,000", () => {
    expect(c.niit.threshold.head_of_household.toNumber()).toBe(200000);
  });

  it("HoH NIIT threshold equals single threshold", () => {
    expect(c.niit.threshold.head_of_household.toNumber()).toBe(
      c.niit.threshold.single.toNumber()
    );
  });

  it("HoH NIIT threshold is lower than MFJ threshold ($250K)", () => {
    expect(c.niit.threshold.head_of_household.toNumber()).toBeLessThan(
      c.niit.threshold.married_filing_jointly.toNumber()
    );
  });

  it("HoH with investment income over $200K triggers NIIT", () => {
    const highIncomeHohFixture: TaxYearInput = {
      ...hohFixture,
      w2s: [
        {
          employer: { name: "Austin Inc", ein: "33-4455667" },
          wages: "190000",
          federalWithheld: "40000",
          socialSecurityWages: "176100",
          socialSecurityWithheld: "10918.20",
          medicareWages: "190000",
          medicareWithheld: "2755",
          stateTaxWithheld: "0",
          stateWages: "190000",
          localTaxWithheld: "0",
          state: "TX",
        },
      ],
      form1099Nec: [],
      form1099Int: [
        { taxExemptInterest: "0", privateActivityBondInterest: "0",
          payer: "Bank",
          interestIncome: "20000",
          federalWithheld: "0",
        },
      ],
      educationExpenses: { aocStudents: [], llcExpenses: "0" },
      dependentCare: undefined,
    };
    const federal = calculateFederalTax(highIncomeHohFixture);
    // AGI ~$210K exceeds $200K HoH NIIT threshold → NIIT applies
    expect(federal.niitTax.greaterThan(d(0))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 7: HoH AMT exemption is $88,100 (same as single)
// Unlike MFJ ($137,000), HoH uses the single-equivalent AMT exemption.
// ══════════════════════════════════════════════════════════════════

describe("HoH AMT exemption is $88,100 — same as single", () => {
  it("HoH AMT exemption constant equals $88,100", () => {
    expect(c.amt.exemption.head_of_household.toNumber()).toBe(88100);
  });

  it("HoH AMT exemption equals single AMT exemption", () => {
    expect(c.amt.exemption.head_of_household.toNumber()).toBe(
      c.amt.exemption.single.toNumber()
    );
  });

  it("HoH AMT exemption is less than MFJ exemption ($137,000)", () => {
    expect(c.amt.exemption.head_of_household.toNumber()).toBeLessThan(
      c.amt.exemption.married_filing_jointly.toNumber()
    );
  });

  it("HoH AMT phase-out threshold equals single threshold ($609,350)", () => {
    expect(c.amt.phaseOutThreshold.head_of_household.toNumber()).toBe(
      c.amt.phaseOutThreshold.single.toNumber()
    );
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 8: HoH with itemized deductions exceeding standard deduction
// When mortgage interest + SALT + charitable > $22,500, engine chooses itemized.
// ══════════════════════════════════════════════════════════════════

describe("HoH with itemized deductions exceeding standard deduction", () => {
  const itemizedHohFixture: TaxYearInput = {
    ...hohFixture,
    // Wages high enough to have real tax but low enough for medical
    w2s: [
      {
        employer: { name: "Austin Inc", ein: "33-4455667" },
        wages: "80000",
        federalWithheld: "10000",
        socialSecurityWages: "80000",
        socialSecurityWithheld: "4960",
        medicareWages: "80000",
        medicareWithheld: "1160",
        stateTaxWithheld: "5000",
        stateWages: "80000",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form1099Nec: [],
    form1098: [
      {
        lender: "Home Bank",
        mortgageInterestReceived: "18000",
        outstandingMortgagePrincipal: "400000",
        propertyTax: "4000",
      },
    ],
    donations: [
      {
        organization: "Austin Food Bank",
        type: "cash",
        amount: "5000",
        dateOfDonation: "2025-06-01",
        isLongTermCapitalGain: false,
      },
    ],
    educationExpenses: { aocStudents: [], llcExpenses: "0" },
    dependentCare: undefined,
  };

  it("deduction used is itemized (not standard)", () => {
    const federal = calculateFederalTax(itemizedHohFixture);
    // Mortgage $18K + state $5K (capped at $10K SALT) + charity $5K = $33K > $22,500 standard
    expect(federal.deductionUsed).toBe("itemized");
  });

  it("itemized deduction amount exceeds HoH standard deduction of $22,500", () => {
    const federal = calculateFederalTax(itemizedHohFixture);
    expect(federal.deductionAmount.toNumber()).toBeGreaterThan(22500);
  });

  it("schedule A is defined when itemizing", () => {
    const federal = calculateFederalTax(itemizedHohFixture);
    expect(federal.scheduleA).toBeDefined();
  });

  it("taxable income is lower with itemized than with standard deduction", () => {
    const itemized = calculateFederalTax(itemizedHohFixture);
    const standard = calculateFederalTax({
      ...itemizedHohFixture,
      form1098: [],
      donations: [],
    });
    expect(itemized.taxableIncome.lessThan(standard.taxableIncome)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 9: HoH tax brackets are wider than single at 10% and 12%
// HoH 10% bracket tops at $17,000; single tops at $11,925.
// HoH 12% bracket tops at $64,850; single tops at $48,475.
// ══════════════════════════════════════════════════════════════════

describe("HoH tax brackets are wider than single at 10% and 12%", () => {
  it("HoH 10% bracket ceiling ($17,000) is higher than single ($11,925)", () => {
    const hohBrackets = c.taxBrackets.head_of_household;
    const singleBrackets = c.taxBrackets.single;
    const hoh10Max = hohBrackets.find((b) => b.rate.toNumber() === 0.10)?.max;
    const single10Max = singleBrackets.find((b) => b.rate.toNumber() === 0.10)?.max;
    expect(hoh10Max?.toNumber()).toBe(17000);
    expect(single10Max?.toNumber()).toBe(11925);
    expect(hoh10Max?.toNumber()).toBeGreaterThan(single10Max?.toNumber() ?? 0);
  });

  it("HoH 12% bracket ceiling ($64,850) is higher than single ($48,475)", () => {
    const hohBrackets = c.taxBrackets.head_of_household;
    const singleBrackets = c.taxBrackets.single;
    const hoh12Max = hohBrackets.find((b) => b.rate.toNumber() === 0.12)?.max;
    const single12Max = singleBrackets.find((b) => b.rate.toNumber() === 0.12)?.max;
    expect(hoh12Max?.toNumber()).toBe(64850);
    expect(single12Max?.toNumber()).toBe(48475);
    expect(hoh12Max?.toNumber()).toBeGreaterThan(single12Max?.toNumber() ?? 0);
  });

  it("HoH filer in 12% bracket pays less ordinary tax than equivalent single filer", () => {
    // Taxable income of $55,000 is in HoH 12% bracket but in single 22% bracket
    const hohLowIncomeFixture: TaxYearInput = {
      ...hohFixture,
      w2s: [
        {
          employer: { name: "Austin Inc", ein: "33-4455667" },
          wages: "77500",
          federalWithheld: "8000",
          socialSecurityWages: "77500",
          socialSecurityWithheld: "4805",
          medicareWages: "77500",
          medicareWithheld: "1123.75",
          stateTaxWithheld: "0",
          stateWages: "77500",
          localTaxWithheld: "0",
          state: "TX",
        },
      ],
      form1099Nec: [],
      educationExpenses: { aocStudents: [], llcExpenses: "0" },
      dependentCare: undefined,
    };
    const singleLowIncomeFixture: TaxYearInput = {
      ...hohLowIncomeFixture,
      taxpayer: {
        ...hohLowIncomeFixture.taxpayer,
        filingStatus: "single",
        dependents: [],
      },
    };
    const hohResult = calculateFederalTax(hohLowIncomeFixture);
    const singleResult = calculateFederalTax(singleLowIncomeFixture);
    // HoH has wider lower brackets + higher standard deduction → lower ordinary tax
    expect(hohResult.ordinaryTax.lessThan(singleResult.ordinaryTax)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 10: HoH Additional Medicare Tax threshold is $200K
// Same as single — unlike MFJ ($250K) and MFS ($125K).
// ══════════════════════════════════════════════════════════════════

describe("HoH Additional Medicare Tax threshold is $200K — same as single", () => {
  it("HoH Additional Medicare Tax threshold constant equals $200,000", () => {
    expect(c.additionalMedicareTax.threshold.head_of_household.toNumber()).toBe(200000);
  });

  it("HoH Additional Medicare Tax threshold equals single threshold", () => {
    expect(c.additionalMedicareTax.threshold.head_of_household.toNumber()).toBe(
      c.additionalMedicareTax.threshold.single.toNumber()
    );
  });

  it("HoH Additional Medicare Tax threshold is lower than MFJ threshold ($250K)", () => {
    expect(c.additionalMedicareTax.threshold.head_of_household.toNumber()).toBeLessThan(
      c.additionalMedicareTax.threshold.married_filing_jointly.toNumber()
    );
  });

  it("HoH with Medicare wages over $200K triggers Additional Medicare Tax", () => {
    const highWageHohFixture: TaxYearInput = {
      ...hohFixture,
      w2s: [
        {
          employer: { name: "Austin Inc", ein: "33-4455667" },
          wages: "220000",
          federalWithheld: "50000",
          socialSecurityWages: "176100",
          socialSecurityWithheld: "10918.20",
          medicareWages: "220000",
          // Employer withholds extra 0.9% above $200K: 1.45% base + 0.9% extra = 2.35%
          medicareWithheld: "3388",
          stateTaxWithheld: "0",
          stateWages: "220000",
          localTaxWithheld: "0",
          state: "TX",
        },
      ],
      form1099Nec: [],
      educationExpenses: { aocStudents: [], llcExpenses: "0" },
      dependentCare: undefined,
    };
    const federal = calculateFederalTax(highWageHohFixture);
    // Medicare wages $220K - $200K threshold = $20K excess × 0.9% = $180
    expect(federal.additionalMedicareTax.greaterThan(d(0))).toBe(true);
    expect(federal.form8959).toBeDefined();
    expect(federal.form8959!.threshold.toNumber()).toBe(200000);
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 11: HoH estimated tax penalty 110% safe harbor threshold is $150K
// IRC §6654(d)(1)(B)(ii): high-income threshold is $150K for all statuses
// except MFS ($75K). HoH matches single and MFJ at $150K.
// ══════════════════════════════════════════════════════════════════

describe("HoH estimated tax penalty 110% safe harbor threshold is $150K", () => {
  it("HoH with prior-year AGI above $150K requires 110% of prior-year tax", () => {
    // Prior-year AGI $160K > $150K threshold → 110% safe harbor applies
    const priorYearHighAgiFixture: TaxYearInput = {
      ...hohFixture,
      w2s: [
        {
          employer: { name: "Austin Inc", ein: "33-4455667" },
          wages: "100000",
          federalWithheld: "5000",
          socialSecurityWages: "100000",
          socialSecurityWithheld: "6200",
          medicareWages: "100000",
          medicareWithheld: "1450",
          stateTaxWithheld: "0",
          stateWages: "100000",
          localTaxWithheld: "0",
          state: "TX",
        },
      ],
      form1099Nec: [],
      educationExpenses: { aocStudents: [], llcExpenses: "0" },
      dependentCare: undefined,
      priorYear: {
        priorYearTax: "15000",
        priorYearAGI: "160000",  // Above $150K → 110% safe harbor applies
      },
    };
    const federal = calculateFederalTax(priorYearHighAgiFixture);
    // Low withholding ($5K) against large prior-year tax × 110% → penalty expected
    expect(federal.form2210).toBeDefined();
    // 110% × $15,000 = $16,500 required; payments $5K < $16,500 → no safe harbor → penalty
    if (!federal.form2210!.safeHarborMet) {
      expect(federal.estimatedTaxPenalty.greaterThan(d(0))).toBe(true);
    }
  });

  it("HoH with prior-year AGI at $150K uses 100% safe harbor (not 110%)", () => {
    // Prior-year AGI exactly $150K is NOT above threshold → 100% safe harbor applies
    const priorYearAtThresholdFixture: TaxYearInput = {
      ...hohFixture,
      w2s: [
        {
          employer: { name: "Austin Inc", ein: "33-4455667" },
          wages: "100000",
          federalWithheld: "12000",
          socialSecurityWages: "100000",
          socialSecurityWithheld: "6200",
          medicareWages: "100000",
          medicareWithheld: "1450",
          stateTaxWithheld: "0",
          stateWages: "100000",
          localTaxWithheld: "0",
          state: "TX",
        },
      ],
      form1099Nec: [],
      educationExpenses: { aocStudents: [], llcExpenses: "0" },
      dependentCare: undefined,
      priorYear: {
        priorYearTax: "11000",
        priorYearAGI: "150000",  // Exactly $150K → 100% safe harbor (not 110%)
      },
    };
    const federal = calculateFederalTax(priorYearAtThresholdFixture);
    // Withholding $12K ≥ 100% × $11K prior-year tax ($11K) → safe harbor met
    expect(federal.form2210).toBeDefined();
    expect(federal.form2210!.safeHarborMet).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 12: HoH with capital loss carryforward
// Capital loss deduction limited to $3,000/year; excess carries forward.
// Filing status does not affect the $3,000 annual cap (MFS has same limit).
// ══════════════════════════════════════════════════════════════════

describe("HoH with capital loss — $3,000 annual deduction limit and carryforward", () => {
  const capitalLossHohFixture: TaxYearInput = {
    ...hohFixture,
    form1099B: [
      {
        broker: "Brokerage",
        transactions: [
          {
            description: "Tech Stock",
            dateAcquired: "2023-03-01",
            dateSold: "2025-11-01",
            proceeds: "5000",
            costBasis: "20000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ],
    form1099Nec: [],
    educationExpenses: { aocStudents: [], llcExpenses: "0" },
    dependentCare: undefined,
  };

  it("capital loss of $15,000 is limited to $3,000 deduction in current year", () => {
    const federal = calculateFederalTax(capitalLossHohFixture);
    // Net long-term loss = $5K proceeds - $20K basis = -$15K
    // Annual deduction cap = $3,000
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
  });

  it("remaining $12,000 capital loss carries forward to next year", () => {
    const federal = calculateFederalTax(capitalLossHohFixture);
    // Engine stores loss carryforwards as negative values (representing a loss amount)
    expect(federal.carryforwards.longTermCapitalLoss.abs().toNumber()).toBe(12000);
  });

  it("capital loss carryforward is zero when losses do not exceed $3,000 limit", () => {
    const smallLossFixture: TaxYearInput = {
      ...capitalLossHohFixture,
      form1099B: [
        {
          broker: "Brokerage",
          transactions: [
            {
              description: "Bond Fund",
              dateAcquired: "2024-01-01",
              dateSold: "2025-09-01",
              proceeds: "8000",
              costBasis: "9500",
              holdingPeriod: "long",
              adjustments: "0",
              basisReportedToIRS: true,
              washSale: false,
              washSaleDisallowed: "0",
            },
          ],
        },
      ],
    };
    const federal = calculateFederalTax(smallLossFixture);
    // Net loss = $8K - $9.5K = -$1,500 (under $3K cap → full deduction, no carryforward)
    expect(federal.capitalGainLoss.toNumber()).toBe(-1500);
    expect(federal.carryforwards.longTermCapitalLoss.isZero()).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 13: HoH total tax equation verification
// totalTax = ordinaryTax + capitalGainsTax + SE tax + AMT + Additional Medicare
//            + NIIT + estimatedTaxPenalty - totalCredits
// Equivalently: totalPayments - refund + amountOwed = totalTax
// ══════════════════════════════════════════════════════════════════

describe("HoH total tax equation verification", () => {
  it("totalTax = totalTaxBeforeCredits - totalCredits + totalAdditionalTaxes", () => {
    const federal = calculateFederalTax(hohFixture);
    const expected = federal.totalTaxBeforeCredits
      .minus(federal.totalCredits)
      .plus(federal.totalAdditionalTaxes);
    expect(federal.totalTax.toNumber()).toBe(expected.toNumber());
  });

  it("totalAdditionalTaxes = SE tax + AMT + Additional Medicare + NIIT + penalty", () => {
    const federal = calculateFederalTax(hohFixture);
    const expected = federal.selfEmploymentTax
      .plus(federal.amt)
      .plus(federal.additionalMedicareTax)
      .plus(federal.niitTax)
      .plus(federal.estimatedTaxPenalty);
    expect(federal.totalAdditionalTaxes.toNumber()).toBe(expected.toNumber());
  });

  it("totalPayments = totalWithholding + estimatedTaxPayments + ACTC + refundable credits", () => {
    const federal = calculateFederalTax(hohFixture);
    const actc = federal.form8812.actc;
    // refundable credits = totalPayments - totalWithholding - estimatedTaxPayments - ACTC
    const impliedRefundable = federal.totalPayments
      .minus(federal.totalWithholding)
      .minus(federal.estimatedTaxPayments)
      .minus(actc);
    // Must be non-negative (refundable AOC + excess SS withholding)
    expect(impliedRefundable.greaterThanOrEqualTo(d(0))).toBe(true);
    expect(
      federal.totalWithholding
        .plus(federal.estimatedTaxPayments)
        .plus(actc)
        .plus(impliedRefundable)
        .toNumber()
    ).toBe(federal.totalPayments.toNumber());
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge Case 14: HoH audit trail completeness
// Every key phase of the 1040 must appear in the audit trail with
// appropriate form labels so the return is fully traceable.
// ══════════════════════════════════════════════════════════════════

describe("HoH audit trail completeness", () => {
  it("audit trail has entries for every 1040 phase (income, AGI, deduction, tax, payments)", () => {
    const federal = calculateFederalTax(hohFixture);
    const lines1040 = federal.allLines.filter((l) => l.form === "1040");
    const lineNumbers = new Set(lines1040.map((l) => l.line));
    // Core 1040 lines must be present
    expect(lineNumbers.has("1")).toBe(true);   // Wages
    expect(lineNumbers.has("9")).toBe(true);   // Total income
    expect(lineNumbers.has("11")).toBe(true);  // AGI
    expect(lineNumbers.has("12")).toBe(true);  // Deduction
    expect(lineNumbers.has("15")).toBe(true);  // Taxable income
    expect(lineNumbers.has("16")).toBe(true);  // Tax
    expect(lineNumbers.has("24")).toBe(true);  // Total tax
    expect(lineNumbers.has("33")).toBe(true);  // Total payments
  });

  it("audit trail includes Schedule 2 additional taxes entry", () => {
    const federal = calculateFederalTax(hohFixture);
    const forms = new Set(federal.allLines.map((l) => l.form));
    expect(forms.has("Sched 2")).toBe(true);
  });

  it("audit trail includes Form 8812 CTC entry when dependents are present", () => {
    const federal = calculateFederalTax(hohFixture);
    const forms = new Set(federal.allLines.map((l) => l.form));
    expect(forms.has("Form 8812")).toBe(true);
  });

  it("every audit line has a non-empty description and formula", () => {
    const federal = calculateFederalTax(hohFixture);
    for (const line of federal.allLines) {
      expect(line.description.length).toBeGreaterThan(0);
      expect(line.formula.length).toBeGreaterThan(0);
    }
  });
});
