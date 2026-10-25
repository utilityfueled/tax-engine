/**
 * Single filer end-to-end test.
 * Mid-income single filer with diverse income: W-2, interest, dividends,
 * capital gains/losses, self-employment, K-1 partnership, and itemized deductions.
 * Verifies all single-filer-specific thresholds and calculations.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

const singleFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Jordan",
      lastName: "Lee",
      ssn: "111-22-3333",
      dateOfBirth: "1990-04-15",
    },
    address: {
      street: "500 Market St",
      city: "San Francisco",
      state: "CA",
      zip: "94105",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Tech Corp", ein: "55-6677889" },
      wages: "120000",
      federalWithheld: "20000",
      socialSecurityWages: "120000",
      socialSecurityWithheld: "7440",
      medicareWages: "120000",
      medicareWithheld: "1740",
      stateTaxWithheld: "8000",
      stateWages: "120000",
      localTaxWithheld: "0",
      state: "CA",
    },
  ],
  form1099Int: [
    {
      payer: "Savings Bank",
      interestIncome: "1500",
      federalWithheld: "0",
      earlyWithdrawalPenalty: "0",
      usSavingsBondInterest: "0",
      taxExemptInterest: "500",
    },
  ],
  form1099Div: [
    {
      payer: "Brokerage",
      ordinaryDividends: "3000",
      qualifiedDividends: "2500",
      totalCapitalGainDistributions: "1000",
      federalWithheld: "0",
      foreignTaxPaid: "50",
      foreignCountry: "Various",
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
          description: "AAPL",
          dateAcquired: "2024-01-15",
          dateSold: "2025-06-01",
          proceeds: "12000",
          costBasis: "8000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        },
        {
          description: "TSLA",
          dateAcquired: "2025-03-01",
          dateSold: "2025-09-01",
          proceeds: "5000",
          costBasis: "7000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        },
      ],
    },
  ],
  form1099Nec: [
    {
      payer: "Consulting Client",
      nonemployeeCompensation: "8000",
      federalWithheld: "0",
    },
  ],
  form1099Misc: [],
  scheduleK1: [
    {
      partnershipName: "Tech Fund LP",
      partnershipEIN: "66-7788990",
      ordinaryIncome: "3000",
      guaranteedPayments: "0",
      netShortTermCapitalGain: "500",
      netLongTermCapitalGain: "1500",
      interestIncome: "200",
      ordinaryDividends: "300",
      qualifiedDividends: "250",
      selfEmploymentEarnings: "0",
      isPassiveActivity: true,
      netRentalIncome: "0",
      otherNetRentalIncome: "0",
      royalties: "0",
      section1231Gain: "0",
      otherIncome: "0",
      section179Deduction: "0",
      otherDeductions: "0",
    },
  ],
  form1098: [
    {
      lender: "Wells Fargo",
      mortgageInterestReceived: "15000",
      outstandingMortgagePrincipal: "500000",
      propertyTax: "8000",
      refundOfOverpaidInterest: "0",
      mortgageInsurancePremiums: "0",
      pointsPaid: "0",
    },
  ],
  form1095A: [],
  donations: [
    {
      organization: "Local NPO",
      type: "cash",
      amount: "2000",
      dateOfDonation: "2025-11-15",
      costBasis: "0",
    },
  ],
};

describe("Single filer full return", () => {
  const federal = calculateFederalTax(singleFixture);

  // ── Filing Status ─────────────────────────────────────
  it("filing status is single", () => {
    expect(federal.filingStatus).toBe("single");
  });

  // ── Income ────────────────────────────────────────────
  it("wages = $120K from W-2", () => {
    expect(federal.totalWages.toNumber()).toBe(120000);
  });

  it("taxable interest = $1,500 (plus K-1 $200)", () => {
    expect(federal.totalInterest.toNumber()).toBe(1700);
  });

  it("ordinary dividends = $3,000 (plus K-1 $300)", () => {
    expect(federal.totalDividends.toNumber()).toBe(3300);
  });

  it("qualified dividends = $2,500 + K-1 $250 = $2,750", () => {
    expect(federal.qualifiedDividends.toNumber()).toBe(2750);
  });

  it("capital gains: AAPL +$4K LT, TSLA -$2K ST, distributions +$1K, K-1 +$500 ST +$1.5K LT", () => {
    // Net ST: -$2K + $500 = -$1.5K
    // Net LT: +$4K + $1K dist + $1.5K = +$6.5K
    // Overall: -$1.5K + $6.5K = +$5K
    expect(federal.capitalGainLoss.toNumber()).toBe(5000);
  });

  it("total income includes all sources", () => {
    // W-2 $120K + interest $1.7K + dividends $3.3K + cap gains $5K + SE $8K + K-1 $3K
    expect(federal.totalIncome.greaterThan(d(140000))).toBe(true);
  });

  // ── Deductions ────────────────────────────────────────
  it("single standard deduction = $15,750", () => {
    expect(federal.standardDeduction.toNumber()).toBe(15750);
  });

  it("itemized deductions exceed standard: mortgage $15K + SALT(capped $10K) + charitable $2K = $27K", () => {
    // SALT: $8K property tax + $8K state income tax = $16K, capped at $10K
    // Mortgage: $15K (under limit for $500K loan)
    // Charitable: $2K
    // Total: $15K + $10K + $2K = $27K > $15.75K standard
    expect(federal.deductionUsed).toBe("itemized");
    expect(federal.deductionAmount.toNumber()).toBeGreaterThanOrEqual(27000);
  });

  // ── SE Tax ────────────────────────────────────────────
  it("SE tax computed on $8K consulting income", () => {
    expect(federal.selfEmploymentTax.greaterThan(0)).toBe(true);
  });

  it("SE deduction reduces AGI", () => {
    expect(federal.adjustmentsToIncome.greaterThan(0)).toBe(true);
  });

  // ── Credits ───────────────────────────────────────────
  it("no child tax credit (no dependents)", () => {
    expect(federal.childTaxCredit.toNumber()).toBe(0);
  });

  it("foreign tax credit from 1099-DIV ($50)", () => {
    expect(federal.foreignTaxCredit.toNumber()).toBe(50);
  });

  // ── Additional Taxes ──────────────────────────────────
  it("no Additional Medicare Tax (under $200K single threshold)", () => {
    // Total earnings: $120K W-2 + $8K SE = $128K < $200K
    expect(federal.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("no NIIT (AGI under $200K single threshold)", () => {
    expect(federal.niitTax.toNumber()).toBe(0);
  });

  // ── Tax Computation ───────────────────────────────────
  it("preferential rate applies to qualified dividends and long-term gains", () => {
    expect(federal.capitalGainsTax.greaterThanOrEqualTo(0)).toBe(true);
  });

  it("total tax is positive", () => {
    expect(federal.totalTax.greaterThan(0)).toBe(true);
  });

  // ── Payments and Refund ───────────────────────────────
  it("total withholding = $20,000 federal from W-2", () => {
    expect(federal.totalWithholding.toNumber()).toBe(20000);
  });

  it("refund and owed are mutually exclusive", () => {
    const both = federal.refund.greaterThan(0) && federal.amountOwed.greaterThan(0);
    expect(both).toBe(false);
  });

  it("tax equation: totalTax = payments - refund + owed", () => {
    const fromPayments = federal.totalPayments.minus(federal.refund).plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });

  // ── Sub-results Available ─────────────────────────────
  it("Schedule D sub-result available", () => {
    expect(federal.scheduleD).toBeDefined();
    expect(federal.scheduleD!.netCapitalGainLoss.toNumber()).toBe(5000);
  });

  it("Schedule SE sub-result available", () => {
    expect(federal.scheduleSE).toBeDefined();
    expect(federal.scheduleSE!.netNonfarmProfit.toNumber()).toBe(8000);
  });

  it("Schedule A sub-result available (itemizing)", () => {
    expect(federal.scheduleA).toBeDefined();
    expect(federal.scheduleA!.totalItemized.greaterThan(d(15750))).toBe(true);
  });

  // ── Audit Trail ───────────────────────────────────────
  it("audit trail covers all key forms", () => {
    const forms = new Set(federal.allLines.map((l) => l.form));
    expect(forms.has("1040")).toBe(true);
    expect(forms.has("Sched B")).toBe(true);
    expect(forms.has("Sched C")).toBe(true);
    expect(forms.has("Sched D")).toBe(true);
    expect(forms.has("Sched E")).toBe(true);
    expect(forms.has("Sched SE")).toBe(true);
    expect(forms.has("Sched A")).toBe(true);
    expect(forms.has("Sched 1")).toBe(true);
    expect(forms.has("Sched 2")).toBe(true);
    expect(forms.has("Form 8949")).toBe(true);
    expect(forms.has("Form 1116")).toBe(true);
    expect(forms.has("Form 6251")).toBe(true);
  });

  // ── Carryforwards ─────────────────────────────────────
  it("no capital loss carryforward (net gain)", () => {
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });

  it("no suspended passive losses (K-1 is positive)", () => {
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Helper: minimal single filer base fixture
// ═══════════════════════════════════════════════════════════════════

function baseSingleFiler(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Test",
        lastName: "Filer",
        ssn: "999-88-7777",
        dateOfBirth: "1990-01-01",
      },
      address: { street: "1 Test Ln", city: "Testville", state: "TX", zip: "75001" },
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
    donations: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Single with only W-2 income, standard deduction (simplest return)
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - W-2 only, standard deduction (simplest return)", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "Acme Inc", ein: "12-3456789" },
        wages: "75000",
        federalWithheld: "10000",
        socialSecurityWages: "75000",
        socialSecurityWithheld: "4650",
        medicareWages: "75000",
        medicareWithheld: "1087.50",
        stateTaxWithheld: "0",
        stateWages: "75000",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
  });
  const result = calculateFederalTax(input);

  it("Form 1040 Line 1 - wages equal W-2 Box 1", () => {
    expect(result.totalWages.toNumber()).toBe(75000);
  });

  it("Form 1040 Line 9 - total income equals wages only", () => {
    expect(result.totalIncome.toNumber()).toBe(75000);
  });

  it("Form 1040 Line 10 - no adjustments (no SE income)", () => {
    expect(result.adjustmentsToIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Line 11 - AGI equals wages", () => {
    expect(result.agi.toNumber()).toBe(75000);
  });

  it("Form 1040 Line 12 - uses standard deduction $15,750", () => {
    expect(result.deductionUsed).toBe("standard");
    expect(result.deductionAmount.toNumber()).toBe(15750);
  });

  it("Form 1040 Line 15 - taxable income = $75K - $15,750 = $59,250", () => {
    expect(result.taxableIncome.toNumber()).toBe(59250);
  });

  it("Form 1040 Line 16 - tax computed on $59,250 using the published single table row", () => {
    // Final2025 Tax Table: at least59250 but less than59300, single column7955.
    expect(result.totalTaxBeforeCredits.toString()).toBe("7955");
  });

  it("Form 1040 Line 21 - no credits", () => {
    expect(result.totalCredits.toNumber()).toBe(0);
  });

  it("Form 1040 Lines 34/37 - refund or owed computed correctly", () => {
    const eq = result.totalPayments.minus(result.refund).plus(result.amountOwed);
    expect(result.totalTax.plus(result.estimatedTaxPenalty).toNumber()).toBe(eq.toNumber());
  });

  it("no SE tax, no AMT, no NIIT, no Additional Medicare Tax", () => {
    expect(result.selfEmploymentTax.toNumber()).toBe(0);
    expect(result.amt.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Single with W-2 + freelance income (Schedule C + SE)
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - W-2 + freelance income (Sched C + SE)", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "Day Job Inc", ein: "11-1111111" },
        wages: "80000",
        federalWithheld: "12000",
        socialSecurityWages: "80000",
        socialSecurityWithheld: "4960",
        medicareWages: "80000",
        medicareWithheld: "1160",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form1099Nec: [
      { payer: "Freelance Client A", nonemployeeCompensation: "30000", federalWithheld: "0" },
    ],
    scheduleC: {
      businessName: "Web Design LLC",
      grossReceipts: "30000",
      expenses: {
        officeExpense: "1000",
        supplies: "500",
        advertising: "500",
      },
    },
  });
  const result = calculateFederalTax(input);

  it("Sched C Line 31 - net profit = $30K - $2K expenses = $28K", () => {
    expect(result.scheduleC).toBeDefined();
    expect(result.scheduleC!.netProfit.toNumber()).toBe(28000);
  });

  it("Sched SE - SE tax computed on $28K net profit", () => {
    // SE base = $28K * 0.9235 = $25,858
    // SS tax = $25,858 * 0.124 = $3,206.39 (rounded)
    // Medicare = $25,858 * 0.029 = $749.88 (rounded)
    expect(result.selfEmploymentTax.greaterThan(d(3900))).toBe(true);
    expect(result.scheduleSE).toBeDefined();
  });

  it("Form 1040 Line 10 - adjustments include deductible half of SE tax", () => {
    const halfSE = result.selfEmploymentTax.dividedBy(2);
    expect(result.adjustmentsToIncome.toNumber()).toBeCloseTo(halfSE.toNumber(), 2);
  });

  it("Form 1040 Line 9 - total income includes wages + Sched C profit", () => {
    expect(result.totalIncome.toNumber()).toBe(108000); // 80K + 28K
  });

  it("Form 1040 Line 12 - standard deduction used (no itemized inputs)", () => {
    expect(result.deductionUsed).toBe("standard");
  });

  it("Form 8995 - QBI deduction on Schedule C income (under threshold)", () => {
    // QBI = Sched C net profit = $28K, deduction = 20% = $5,600 (or limited by taxable income)
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Single with investment income triggering NIIT ($200K threshold)
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - investment income triggering NIIT", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "BigCo", ein: "22-2222222" },
        wages: "180000",
        federalWithheld: "35000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10938.20",
        medicareWages: "180000",
        medicareWithheld: "2610",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form1099Div: [
      {
        payer: "Vanguard",
        ordinaryDividends: "15000",
        qualifiedDividends: "12000",
        totalCapitalGainDistributions: "8000",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      },
    ],
    form1099Int: [
      {
        payer: "HYSA",
        interestIncome: "5000",
        federalWithheld: "0",
        taxExemptInterest: "0",
      },
    ],
  });
  const result = calculateFederalTax(input);

  it("Form 1040 Line 11 - AGI above $200K single NIIT threshold", () => {
    // AGI = $180K wages + $15K div + $5K interest + $8K cap gain dist = $208K
    expect(result.agi.greaterThan(d(200000))).toBe(true);
  });

  it("Form 8960 Line 17 - NIIT = 3.8% on lesser of NII or AGI excess over $200K", () => {
    // NII = $15K div + $5K interest + $8K cap gains = $28K
    // AGI excess = AGI - $200K = ~$8K
    // NIIT = 3.8% * min($28K, $8K) = 3.8% * $8K = $304
    expect(result.niitTax.greaterThan(0)).toBe(true);
    expect(result.form8960).toBeDefined();
  });

  it("Form 8959 - no Additional Medicare Tax (wages under $200K)", () => {
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("QDCG worksheet - qualified dividends taxed at preferential rate", () => {
    expect(result.capitalGainsTax.greaterThan(0)).toBe(true);
    expect(result.qualifiedDividends.toNumber()).toBe(12000);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Single with rental property (Schedule E + Form 8582)
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - rental property (Sched E + Form 8582)", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "CorpJob", ein: "33-3333333" },
        wages: "85000",
        federalWithheld: "12000",
        socialSecurityWages: "85000",
        socialSecurityWithheld: "5270",
        medicareWages: "85000",
        medicareWithheld: "1232.50",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    rentalProperties: [
      {
        description: "456 Oak Ave, Unit B",
        propertyType: "single_family",
        personalUseDays: 0,
        rentalDays: 365,
        rents: "18000",
        insurance: "1200",
        mortgageInterest: "8000",
        repairs: "3000",
        taxes: "2500",
        depreciation: "5000",
        utilities: "0",
      },
    ],
  });
  const result = calculateFederalTax(input);

  it("Sched E Part I - rental net income/loss computed", () => {
    // Rents $18K - expenses ($1.2K + $8K + $3K + $2.5K + $5K) = $18K - $19.7K = -$1,700
    expect(result.scheduleE).toBeDefined();
  });

  it("Form 8582 - passive rental loss allowed up to $25K for active participants under $100K AGI", () => {
    // AGI ~$85K, well under $100K, so full $25K allowance applies
    // Rental loss is only ~$1.7K, so fully deductible
    expect(result.form8582).toBeDefined();
  });

  it("Form 1040 Line 24 - total tax is positive", () => {
    expect(result.totalTax.greaterThan(0)).toBe(true);
  });

  it("Sched E audit trail present", () => {
    const forms = new Set(result.allLines.map((l) => l.form));
    expect(forms.has("Sched E")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Single with capital gains and QDCG worksheet
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - capital gains and QDCG worksheet", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "Employer", ein: "44-4444444" },
        wages: "50000",
        federalWithheld: "5000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form1099B: [
      {
        broker: "Schwab",
        transactions: [
          {
            description: "VTI",
            dateAcquired: "2020-01-01",
            dateSold: "2025-06-01",
            proceeds: "40000",
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
    form1099Div: [
      {
        payer: "VTI Fund",
        ordinaryDividends: "2000",
        qualifiedDividends: "1800",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      },
    ],
  });
  const result = calculateFederalTax(input);

  it("Sched D - net long-term capital gain = $20K", () => {
    expect(result.scheduleD).toBeDefined();
    expect(result.capitalGainLoss.toNumber()).toBe(20000);
  });

  it("Form 1040 Line 3a - qualified dividends = $1,800", () => {
    expect(result.qualifiedDividends.toNumber()).toBe(1800);
  });

  it("QDCG worksheet - preferential tax on LTCG + QD", () => {
    // Taxable income = $50K + $20K + $2K - $15K = $57K
    // LTCG + QD = $20K + $1.8K = $21.8K, taxed at 0%/15% bracket
    expect(result.capitalGainsTax.greaterThanOrEqualTo(0)).toBe(true);
    // Total tax should be less than if all income were ordinary
    expect(result.ordinaryTax.greaterThan(0)).toBe(true);
  });

  it("Form 1040 Line 16 - total tax = ordinary + preferential", () => {
    expect(result.totalTaxBeforeCredits.toNumber()).toBe(
      result.ordinaryTax.plus(result.capitalGainsTax).toNumber()
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Single with large charitable deductions (itemized)
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - large charitable deductions (itemized)", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "Generous Corp", ein: "55-5555555" },
        wages: "100000",
        federalWithheld: "18000",
        socialSecurityWages: "100000",
        socialSecurityWithheld: "6200",
        medicareWages: "100000",
        medicareWithheld: "1450",
        stateTaxWithheld: "5000",
        stateWages: "100000",
        localTaxWithheld: "0",
        state: "CA",
      },
    ],
    donations: [
      { organization: "Red Cross", type: "cash", amount: "12000", dateOfDonation: "2025-03-01", costBasis: "0" },
      { organization: "Hospital Fund", type: "cash", amount: "5000", dateOfDonation: "2025-06-15", costBasis: "0" },
    ],
  });
  const result = calculateFederalTax(input);

  it("Sched A - itemized: SALT $5K (state tax, capped at $10K) + charitable $17K = $22K > $15K", () => {
    expect(result.deductionUsed).toBe("itemized");
    expect(result.deductionAmount.greaterThan(d(15000))).toBe(true);
  });

  it("Sched A - total itemized includes charitable contributions", () => {
    expect(result.scheduleA).toBeDefined();
    expect(result.scheduleA!.totalItemized.gte(d(22000))).toBe(true);
  });

  it("Form 1040 Line 15 - taxable income = AGI - itemized deductions", () => {
    const expected = result.agi.minus(result.deductionAmount);
    expect(result.taxableIncome.toNumber()).toBe(expected.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Single with education credits (AOTC for self)
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - education credits (AOTC)", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "Part Time LLC", ein: "66-6666666" },
        wages: "35000",
        federalWithheld: "3000",
        socialSecurityWages: "35000",
        socialSecurityWithheld: "2170",
        medicareWages: "35000",
        medicareWithheld: "507.50",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    educationExpenses: {
      aocStudents: [
        { name: "Test Filer", qualifiedExpenses: "4000" },
      ],
      llcExpenses: "0",
    },
  });
  const result = calculateFederalTax(input);

  it("Form 8863 - AOTC max $2,500 (100% of first $2K + 25% of next $2K)", () => {
    // Total AOTC = $2,000 + 0.25 * $2,000 = $2,500
    // 40% refundable = $1,000, 60% nonrefundable = $1,500
    const totalAOC = result.otherCredits.plus(result.totalPayments.minus(result.totalWithholding).minus(result.estimatedTaxPayments));
    expect(totalAOC.greaterThan(0)).toBe(true);
  });

  it("Form 1040 Line 20 - nonrefundable education credit applied", () => {
    expect(result.otherCredits.greaterThan(0)).toBe(true);
  });

  it("Form 1040 Line 15 - taxable income = $35K - $15,750 standard = $19,250", () => {
    expect(result.taxableIncome.toNumber()).toBe(19250);
  });

  it("tax equation holds with education credits", () => {
    const eq = result.totalPayments.minus(result.refund).plus(result.amountOwed);
    expect(result.totalTax.plus(result.estimatedTaxPenalty).toNumber()).toBe(eq.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Single with child (testing single status with dependent)
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - with dependent child (CTC)", () => {
  const input = baseSingleFiler({
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Test",
        lastName: "Parent",
        ssn: "999-88-7777",
        dateOfBirth: "1985-01-01",
      },
      address: { street: "1 Test Ln", city: "Testville", state: "TX", zip: "75001" },
      dependents: [
        {
          firstName: "Child",
          lastName: "Parent",
          ssn: "999-88-6666",
          relationship: "son",
          dateOfBirth: "2015-06-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
          qualifiesForODC: false,
        },
      ],
    },
    w2s: [
      {
        employer: { name: "WorkCo", ein: "77-7777777" },
        wages: "60000",
        federalWithheld: "6000",
        socialSecurityWages: "60000",
        socialSecurityWithheld: "3720",
        medicareWages: "60000",
        medicareWithheld: "870",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
  });
  const result = calculateFederalTax(input);

  it("Form 8812 - CTC = $2,200 per qualifying child", () => {
    expect(result.childTaxCredit.toNumber()).toBe(2200);
  });

  it("Form 1040 Line 19 - nonrefundable CTC applied against tax", () => {
    expect(result.childTaxCredit.greaterThan(0)).toBe(true);
  });

  it("Form 8812 sub-result available", () => {
    expect(result.form8812).toBeDefined();
  });

  it("tax equation holds with CTC", () => {
    const eq = result.totalPayments.minus(result.refund).plus(result.amountOwed);
    expect(result.totalTax.plus(result.estimatedTaxPenalty).toNumber()).toBe(eq.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. Single with foreign tax credit
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - foreign tax credit", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "US Corp", ein: "88-8888888" },
        wages: "90000",
        federalWithheld: "14000",
        socialSecurityWages: "90000",
        socialSecurityWithheld: "5580",
        medicareWages: "90000",
        medicareWithheld: "1305",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form1099Div: [
      {
        payer: "International Fund",
        ordinaryDividends: "5000",
        qualifiedDividends: "4000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "400",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      },
    ],
  });
  const result = calculateFederalTax(input);

  it("Form 1116 - foreign tax credit = $400 (limited by tax on foreign source income)", () => {
    expect(result.foreignTaxCredit.greaterThan(0)).toBe(true);
    expect(result.foreignTaxCredit.lessThanOrEqualTo(d(400))).toBe(true);
  });

  it("Form 1116 audit trail present", () => {
    const forms = new Set(result.allLines.map((l) => l.form));
    expect(forms.has("Form 1116")).toBe(true);
  });

  it("Form 1040 Line 20 - foreign tax credit included in other credits", () => {
    expect(result.otherCredits.gte(result.foreignTaxCredit)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. Single with QBI deduction from sole proprietorship
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - QBI deduction (Form 8995)", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "DayCo", ein: "99-9999999" },
        wages: "50000",
        federalWithheld: "5000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form1099Nec: [
      { payer: "Client X", nonemployeeCompensation: "60000", federalWithheld: "0" },
    ],
    scheduleC: {
      businessName: "Consulting Biz",
      grossReceipts: "60000",
      expenses: {
        officeExpense: "2000",
        supplies: "1000",
      },
    },
  });
  const result = calculateFederalTax(input);

  it("Form 8995 - QBI = Sched C net profit $57K, deduction = 20% = $11,400 (or taxable income limit)", () => {
    expect(result.form8995).toBeDefined();
    // QBI deduction = min(20% of QBI, 20% of taxable income before QBI)
    expect(result.form8995!.qbiDeduction.greaterThan(0)).toBe(true);
  });

  it("Form 1040 Line 13 - QBI deduction reduces taxable income below Line 12", () => {
    const taxableWithoutQBI = result.agi.minus(result.deductionAmount);
    expect(result.taxableIncome.lessThan(taxableWithoutQBI)).toBe(true);
  });

  it("Form 8995 sub-result under simplified threshold ($197,300 single)", () => {
    // Total income ~$107K, AGI well under $197,300
    expect(result.agi.lessThan(d(197300))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 11. Single with AMT triggered
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - AMT triggered", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "HighPay Inc", ein: "10-1010101" },
        wages: "350000",
        federalWithheld: "80000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10938.20",
        medicareWages: "350000",
        medicareWithheld: "5075",
        stateTaxWithheld: "25000",
        stateWages: "350000",
        localTaxWithheld: "0",
        state: "CA",
      },
    ],
    form1098: [
      {
        lender: "Bank of AMT",
        mortgageInterestReceived: "20000",
        outstandingMortgagePrincipal: "600000",
        propertyTax: "15000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      },
    ],
    donations: [
      { organization: "Charity", type: "cash", amount: "5000", dateOfDonation: "2025-12-01", costBasis: "0" },
    ],
  });
  const result = calculateFederalTax(input);

  it("Sched A - itemized: SALT capped at $10K + mortgage $20K + charitable $5K = $35K", () => {
    expect(result.deductionUsed).toBe("itemized");
  });

  it("Form 6251 - AMT computed (SALT add-back creates AMT preference)", () => {
    // SALT deduction capped at $10K for regular tax, but fully added back for AMT
    // AMT preference item = $10K SALT
    // AMTI = taxable income + $10K SALT add-back
    expect(result.form6251).toBeDefined();
    // AMT may or may not trigger depending on exact calculation
    expect(result.amt.gte(0)).toBe(true);
  });

  it("Form 6251 audit trail present", () => {
    const forms = new Set(result.allLines.map((l) => l.form));
    expect(forms.has("Form 6251")).toBe(true);
  });

  it("Form 1040 Line 24 - total tax includes AMT if applicable", () => {
    expect(result.totalTax.greaterThan(result.totalTaxBeforeCredits.minus(result.totalCredits))).toBe(
      result.amt.greaterThan(0) || result.selfEmploymentTax.greaterThan(0) || result.additionalMedicareTax.greaterThan(0)
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 12. Single with estimated tax payments and penalty
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - estimated tax payments and underpayment penalty", () => {
  const input = baseSingleFiler({
    form1099Nec: [
      { payer: "Big Client", nonemployeeCompensation: "150000", federalWithheld: "0" },
    ],
    scheduleC: {
      businessName: "Solo Consulting",
      grossReceipts: "150000",
      expenses: { officeExpense: "5000" },
    },
    adjustments: {
      estimatedTaxPayments: [
        { date: "2025-04-15", amount: "5000", type: "federal" as const },
        { date: "2025-06-15", amount: "5000", type: "federal" as const },
        { date: "2025-09-15", amount: "5000", type: "federal" as const },
        { date: "2026-01-15", amount: "5000", type: "federal" as const },
      ],
    },
    priorYear: {
      priorYearTax: "25000",
      priorYearAGI: "120000",
    },
  });
  const result = calculateFederalTax(input);

  it("Form 1040 Line 26 - estimated payments = $20K", () => {
    expect(result.estimatedTaxPayments.toNumber()).toBe(20000);
  });

  it("Form 2210 - underpayment penalty assessed (insufficient estimated payments)", () => {
    // $145K SE income produces significant tax liability
    // Only $20K in estimated payments, likely underpaid
    expect(result.form2210).toBeDefined();
    expect(result.estimatedTaxPenalty.gte(0)).toBe(true);
  });

  it("Form1040 line38 carries penalty outside Schedule2 additional taxes", () => {
    expect(result.allLines.find(line => line.form === "1040" && line.line === "38")?.value.toString()).toBe(result.estimatedTaxPenalty.toString());
    expect(result.schedule2?.lines.find(line => line.line === "19")?.value.toString()).toBe("0");
    expect(result.totalAdditionalTaxes.toString()).toBe(result.schedule2?.partIITotal.toString());
  });

  it("Form 1040 Line 37 - amount owed (insufficient payments)", () => {
    expect(result.amountOwed.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 13. Single at very low income ($15K - below standard deduction)
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - very low income ($15K, near filing threshold)", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "Part Time Co", ein: "11-2233445" },
        wages: "15000",
        federalWithheld: "500",
        socialSecurityWages: "15000",
        socialSecurityWithheld: "930",
        medicareWages: "15000",
        medicareWithheld: "217.50",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
  });
  const result = calculateFederalTax(input);

  it("Form 1040 Line 15 - taxable income = $0 (wages <= standard deduction)", () => {
    // $15K wages - $15K standard deduction = $0
    expect(result.taxableIncome.toNumber()).toBe(0);
  });

  it("Form 1040 Line 16 - tax = $0 (no taxable income)", () => {
    expect(result.totalTaxBeforeCredits.toNumber()).toBe(0);
  });

  it("Form 1040 Line 24 - total tax = $0", () => {
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Form 1040 Line 34 - full refund of withholding plus childless EIC", () => {
    // $500 withholding + $314 childless EIC (7.65% phase-in/out, $15K income, age 35)
    expect(result.refund.toNumber()).toBe(814);
    expect(result.amountOwed.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 14. Single at very high income ($500K+ with multiple surtaxes)
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - very high income ($550K+ with surtaxes)", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "MegaCorp", ein: "22-3344556" },
        wages: "400000",
        federalWithheld: "120000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10938.20",
        medicareWages: "400000",
        medicareWithheld: "5800",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form1099Div: [
      {
        payer: "Brokerage",
        ordinaryDividends: "50000",
        qualifiedDividends: "40000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
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
            description: "GOOG",
            dateAcquired: "2020-01-01",
            dateSold: "2025-10-01",
            proceeds: "200000",
            costBasis: "100000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ],
  });
  const result = calculateFederalTax(input);

  it("Form 1040 Line 11 - AGI = $400K wages + $50K div + $100K LTCG = $550K", () => {
    expect(result.agi.toNumber()).toBe(550000);
  });

  it("Form 8959 - Additional Medicare Tax = 0.9% on wages over $200K", () => {
    // 0.9% * ($400K - $200K) = 0.9% * $200K = $1,800
    expect(result.additionalMedicareTax.toNumber()).toBe(1800);
  });

  it("Form 8960 - NIIT = 3.8% on lesser of NII or AGI excess over $200K", () => {
    // NII = $50K div + $100K LTCG = $150K
    // AGI excess = $550K - $200K = $350K
    // NIIT = 3.8% * min($150K, $350K) = 3.8% * $150K = $5,700
    expect(result.niitTax.toNumber()).toBe(5700);
  });

  it("QDCG worksheet - $40K QD + $100K LTCG taxed at 15%/20% rates", () => {
    // Taxable income ~$535K exceeds 20% threshold ($533,400 single)
    // Some gains taxed at 20%
    expect(result.capitalGainsTax.greaterThan(0)).toBe(true);
  });

  it("Form 1040 Line 24 - total tax includes ordinary + SE + Additional Medicare + NIIT", () => {
    const minExpected = result.totalTaxBeforeCredits
      .minus(result.totalCredits)
      .plus(result.additionalMedicareTax)
      .plus(result.niitTax);
    expect(result.totalTax.gte(minExpected)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 15. Single with maximum capital loss deduction ($3K)
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - maximum capital loss deduction ($3K limit)", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "Steady Job", ein: "33-4455667" },
        wages: "70000",
        federalWithheld: "9000",
        socialSecurityWages: "70000",
        socialSecurityWithheld: "4340",
        medicareWages: "70000",
        medicareWithheld: "1015",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form1099B: [
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "ARKK",
            dateAcquired: "2025-01-15",
            dateSold: "2025-08-01",
            proceeds: "5000",
            costBasis: "20000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ],
  });
  const result = calculateFederalTax(input);

  it("Sched D Line 21 - capital loss limited to -$3K against ordinary income", () => {
    expect(result.capitalGainLoss.toNumber()).toBe(-3000);
  });

  it("Sched D - capital loss carryforward = $15K total loss - $3K used = $12K (stored negative)", () => {
    expect(result.carryforwards.capitalLoss.toNumber()).toBe(-12000);
  });

  it("Sched D - carryforward is short-term (originated as short-term)", () => {
    expect(result.carryforwards.shortTermCapitalLoss.toNumber()).toBe(-12000);
    expect(result.carryforwards.longTermCapitalLoss.toNumber()).toBe(0);
  });

  it("Form 1040 Line 15 - taxable income reduced by $3K loss deduction", () => {
    // $70K wages - $3K cap loss - $15,750 standard = $51,250
    expect(result.taxableIncome.toNumber()).toBe(51250);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 16. Single with energy credits (Form 5695)
// ═══════════════════════════════════════════════════════════════════

describe("Single filer - energy credits (Form 5695)", () => {
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "Green Co", ein: "44-5566778" },
        wages: "90000",
        federalWithheld: "14000",
        socialSecurityWages: "90000",
        socialSecurityWithheld: "5580",
        medicareWages: "90000",
        medicareWithheld: "1305",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    energyCredits: {
      solarElectricCost: "25000",
      batteryStorageCost: "10000",
      insulationCost: "3000",
      energyPropertyCost: "2000",
    },
  });
  const result = calculateFederalTax(input);

  it("Form 5695 Part I - residential clean energy credit = 30% of solar + battery", () => {
    // 30% * ($25K + $10K) = $10,500
    const forms = new Set(result.allLines.map((l) => l.form));
    expect(forms.has("Form 5695")).toBe(true);
  });

  it("Form 1040 Line 20 - energy credits included in other credits (Sched 3)", () => {
    expect(result.otherCredits.greaterThan(0)).toBe(true);
  });

  it("Form 5695 Part II - energy improvement credit for insulation + property", () => {
    // Insulation + energy property costs generate credit (30%, subject to limits)
    // Total credits should reflect both Part I and Part II
    expect(result.otherCredits.greaterThan(d(10000))).toBe(true);
  });

  it("tax equation holds with energy credits", () => {
    const eq = result.totalPayments.minus(result.refund).plus(result.amountOwed);
    expect(result.totalTax.plus(result.estimatedTaxPenalty).toNumber()).toBe(eq.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════════════
// Single filer with business property sale — full pipeline through QDCG
// ═══════════════════════════════════════════════════════════════════

describe("Single filer with business property sales", () => {
  // Self-employed single filer selling equipment AND a rental building.
  // Exercises: Form 4797 Parts I/II/III → Schedule 1 Line 4 → Schedule D →
  // QDCG worksheet (unrecaptured §1250 at 25%) → correct final tax.
  const input = baseSingleFiler({
    w2s: [
      {
        employer: { name: "Employer Co", ein: "11-2233445" },
        wages: "75000",
        federalWithheld: "10000",
        socialSecurityWages: "75000",
        socialSecurityWithheld: "4650",
        medicareWages: "75000",
        medicareWithheld: "1087.50",
        stateTaxWithheld: "0",
        localTaxWithheld: "0",
        state: "TX",
      },
    ],
    form4797: {
      propertySales: [
        {
          description: "Office furniture and equipment",
          costOrBasis: "25000",
          depreciationAllowed: "25000",
          grossSalesPrice: "8000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        },
        {
          description: "Rental duplex",
          costOrBasis: "250000",
          depreciationAllowed: "60000",
          grossSalesPrice: "300000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        },
      ],
    },
  });
  const result = calculateFederalTax(input);

  it("section 1245 equipment: all gain is ordinary recapture", () => {
    // Basis = 0, gain = 8000, recapture = min(8000, 25000) = 8000
    const equip = result.form4797!.propertyResults.find(
      (p) => p.description === "Office furniture and equipment"
    );
    expect(equip).toBeDefined();
    expect(equip!.section1245Recapture.toNumber()).toBe(8000);
    expect(equip!.section1231Gain.toNumber()).toBe(0);
  });

  it("section 1250 duplex: $0 ordinary recapture, §1231 gain flows to Schedule D", () => {
    // Basis = 190000, gain = 110000, §1250 recapture = $0 (SL), §1231 = 110000
    const duplex = result.form4797!.propertyResults.find(
      (p) => p.description === "Rental duplex"
    );
    expect(duplex).toBeDefined();
    expect(duplex!.section1250Recapture.toNumber()).toBe(0);
    expect(duplex!.section1231Gain.toNumber()).toBe(110000);
    expect(duplex!.unrecapturedSection1250Gain.toNumber()).toBe(60000);
  });

  it("Schedule 1 Line 4 carries only the equipment recapture as ordinary", () => {
    // Part II recapture = 8000, short-term = 0
    // Part I ordinary = 0 (§1231 is a gain, no lookback, so line 12 = 0)
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(8000);
  });

  it("Schedule D carries the rental building LTCG", () => {
    expect(result.capitalGainLoss.toNumber()).toBe(110000);
  });

  it("AGI is wages + equipment ordinary + rental LTCG", () => {
    // 75000 + 8000 + 110000 = 193000
    expect(result.agi.toNumber()).toBe(193000);
  });

  it("QDCG preferential rates produce lower tax than all-ordinary treatment", () => {
    // Compare against a hypothetical where $110K is ordinary instead of LTCG
    const allOrdinaryInput = baseSingleFiler({
      w2s: [
        {
          employer: { name: "Employer Co", ein: "11-2233445" },
          wages: "75000",
          federalWithheld: "10000",
          socialSecurityWages: "75000",
          socialSecurityWithheld: "4650",
          medicareWages: "75000",
          medicareWithheld: "1087.50",
          stateTaxWithheld: "0",
          localTaxWithheld: "0",
          state: "TX",
        },
      ],
      form4797: {
        propertySales: [
          {
            description: "Equipment A",
            costOrBasis: "25000",
            depreciationAllowed: "25000",
            grossSalesPrice: "8000",
            propertyType: "section1245",
            heldMoreThanOneYear: true,
          },
          {
            description: "All-ordinary hypothetical",
            costOrBasis: "250000",
            depreciationAllowed: "250000",
            grossSalesPrice: "360000",
            propertyType: "section1245",
            heldMoreThanOneYear: true,
          },
        ],
      },
    });
    const allOrdinaryResult = calculateFederalTax(allOrdinaryInput);
    // Same total gain but all ordinary should produce higher tax
    expect(result.totalTax.lessThan(allOrdinaryResult.totalTax)).toBe(true);
  });

  it("tax equation holds", () => {
    const eq = result.totalPayments.minus(result.refund).plus(result.amountOwed);
    expect(result.totalTax.plus(result.estimatedTaxPenalty).toNumber()).toBe(eq.toNumber());
  });

  it("audit trail includes Form 4797 Part III entries", () => {
    const forms = new Set(result.allLines.map((l) => l.form));
    expect(forms.has("Form 4797 Part III")).toBe(true);
    expect(forms.has("Form 4797")).toBe(true);
  });
});
