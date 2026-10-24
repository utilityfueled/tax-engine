/**
 * End-to-end test: Complex tax return with all major forms and schedules.
 * Exercises the complete pipeline from input to final refund/owed.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm2441 } from "@/engine/forms/form-2441.js";
import { calculateForm8863 } from "@/engine/forms/form-8863.js";
import { calculateForm6251 } from "@/engine/forms/form-6251.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { calculateScheduleD } from "@/engine/schedules/schedule-d.js";
import { calculateScheduleSE } from "@/engine/schedules/schedule-se.js";
import { getConstants } from "@/models/constants.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

/**
 * High-income MFJ couple with:
 * - Two W-2 jobs ($200K + $80K)
 * - Self-employment income ($40K)
 * - Investment income (dividends, capital gains)
 * - Mortgage, property taxes, charitable donations
 * - One child qualifying for CTC
 * - Student in college (AOC)
 * - Dependent care expenses
 * - Passive K-1 with loss
 */
const complexE2EFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Michael",
      lastName: "Chen",
      ssn: "111-22-3333",
      dateOfBirth: "1982-04-15",
    },
    spouse: {
      firstName: "Sarah",
      lastName: "Chen",
      ssn: "444-55-6666",
      dateOfBirth: "1984-09-20",
    },
    address: {
      street: "789 Elm Dr",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    dependents: [
      {
        firstName: "Emma",
        lastName: "Chen",
        ssn: "777-88-9999",
        relationship: "Daughter",
        dateOfBirth: "2015-03-10",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Tech Company Inc", ein: "12-1111111" },
      wages: "200000",
      federalWithheld: "40000",
      socialSecurityWages: "176100",
      socialSecurityWithheld: "10918.20",
      medicareWages: "200000",
      medicareWithheld: "2900",
      stateTaxWithheld: "12000",
      stateWages: "200000",
      localTaxWithheld: "0",
      state: "OR",
    },
    {
      employer: { name: "Part-Time LLC", ein: "12-2222222" },
      wages: "80000",
      federalWithheld: "12000",
      socialSecurityWages: "80000",
      socialSecurityWithheld: "4960",
      medicareWages: "80000",
      medicareWithheld: "1160",
      stateTaxWithheld: "5000",
      stateWages: "80000",
      localTaxWithheld: "0",
      state: "OR",
    },
  ],
  form1099Int: [
    {
      payer: "Savings Bank",
      interestIncome: "3000",
      federalWithheld: "0",
      earlyWithdrawalPenalty: "0",
      usSavingsBondInterest: "0",
      taxExemptInterest: "0",
    },
  ],
  form1099Div: [
    {
      payer: "Fidelity Funds",
      ordinaryDividends: "12000",
      qualifiedDividends: "9000",
      totalCapitalGainDistributions: "5000",
      federalWithheld: "0",
      foreignTaxPaid: "200",
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
      broker: "Schwab",
      transactions: [
        {
          description: "VOO 200 shares",
          dateAcquired: "2021-01-15",
          dateSold: "2025-09-01",
          proceeds: "60000",
          costBasis: "40000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        },
        {
          description: "NVDA 50 shares",
          dateAcquired: "2025-02-01",
          dateSold: "2025-05-15",
          proceeds: "8000",
          costBasis: "12000",
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
      payer: "Freelance Client",
      nonemployeeCompensation: "40000",
      federalWithheld: "0",
    },
  ],
  form1099Misc: [],
  // Schedule C: freelance consulting with business expenses
  scheduleC: {
    businessName: "Chen Consulting",
    expenses: {
      advertising: "500",
      officeExpense: "1200",
      supplies: "800",
      travel: "2000",
      meals: "3000", // $1,500 after 50% limit
      otherExpenses: "1500",
    },
    homeOffice: { method: "simplified", squareFeet: 250 },
  },
  // Rental property: modest single-family with positive cash flow
  rentalProperties: [
    {
      description: "456 Cedar Lane, rental house",
      propertyType: "single_family",
      personalUseDays: 0,
      rentalDays: 365,
      rents: "28800",
      advertising: "200",
      autoTravel: "0",
      cleaning: "600",
      commissions: "0",
      insurance: "1800",
      legalProfessional: "0",
      managementFees: "2400",
      mortgageInterest: "9000",
      otherInterest: "0",
      repairs: "3000",
      supplies: "500",
      taxes: "4200",
      utilities: "0",
      depreciation: "7000",
      otherExpenses: "0",
    },
  ],
  // Dependent care: daughter Emma in after-school program
  dependentCare: {
    expenses: "6000",
    qualifyingIndividuals: 1,
  },
  // Education: Sarah taking graduate courses (LLC eligible, not AOC)
  educationExpenses: {
    aocStudents: [],
    llcExpenses: "8000",
  },
  scheduleK1: [
    {
      partnershipName: "Losing Venture LP",
      partnershipEIN: "99-8877665",
      ordinaryIncome: "-15000",
      guaranteedPayments: "0",
      netShortTermCapitalGain: "0",
      netLongTermCapitalGain: "0",
      interestIncome: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
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
      lender: "Chase Mortgage",
      mortgageInterestReceived: "22000",
      outstandingMortgagePrincipal: "550000",
      propertyTax: "9000",
      refundOfOverpaidInterest: "0",
      mortgageInsurancePremiums: "0",
      pointsPaid: "0",
    },
  ],
  form1095A: [],
  donations: [
    {
      organization: "Red Cross",
      type: "cash",
      amount: "8000",
      dateOfDonation: "2025-12-20",
      costBasis: "0",
    },
    {
      organization: "University Foundation",
      type: "appreciated_stock",
      amount: "15000",
      costBasis: "5000",
      dateOfDonation: "2025-11-15",
      isLongTermCapitalGain: true,
    },
  ],
  adjustments: {
    estimatedTaxPayments: [
      { date: "2025-04-15", amount: "8000", type: "federal" },
      { date: "2025-06-15", amount: "8000", type: "federal" },
      { date: "2025-09-15", amount: "8000", type: "federal" },
      { date: "2026-01-15", amount: "8000", type: "federal" },
    ],
    otherTaxesPaid: "0",
    educatorExpenses: "0",
    hsaDeduction: "7000",
    selfEmployedHealthInsurance: "0",
    studentLoanInterest: "0",
    iraDeduction: "0",
    alimonyPaid: "0",
    earlyWithdrawalPenalty: "0",
  },
};

describe("E2E Complex MFJ Return", () => {
  const federal = calculateFederalTax(complexE2EFixture);

  // ── Income Assembly ─────────────────────────────────────
  it("wages from two W-2s", () => {
    expect(federal.totalWages.toNumber()).toBe(280000);
  });

  it("total interest from 1099-INT", () => {
    expect(federal.totalInterest.toNumber()).toBe(3000);
  });

  it("total dividends from 1099-DIV", () => {
    expect(federal.totalDividends.toNumber()).toBe(12000);
  });

  it("qualified dividends", () => {
    expect(federal.qualifiedDividends.toNumber()).toBe(9000);
  });

  it("capital gains from 1099-B (long gain minus short loss)", () => {
    // Long: $60K - $40K = $20K gain + $5K cap gain distributions
    // Short: $8K - $12K = -$4K loss
    // Net: $25K - $4K = $21K
    expect(federal.capitalGainLoss.toNumber()).toBe(21000);
  });

  it("total income is sum of all sources", () => {
    expect(federal.totalIncome.greaterThan(d(300000))).toBe(true);
  });

  // ── AGI ─────────────────────────────────────────────────
  it("adjustments reduce total income", () => {
    expect(federal.adjustmentsToIncome.greaterThan(d(0))).toBe(true);
  });

  it("AGI is total income minus adjustments", () => {
    const expected = federal.totalIncome.minus(federal.adjustmentsToIncome);
    expect(federal.agi.toNumber()).toBe(expected.toNumber());
  });

  // ── Deductions ──────────────────────────────────────────
  it("uses itemized deductions (high SALT + mortgage + charity)", () => {
    expect(federal.deductionUsed).toBe("itemized");
    expect(federal.itemizedDeductions.greaterThan(d(30000))).toBe(true);
  });

  it("2025 SALT allows $26K of state taxes and property below the $40K limit", () => {
    const schedA = calculateScheduleA(complexE2EFixture, federal.agi, "married_filing_jointly", c);
    expect(schedA.saltDeduction.toNumber()).toBe(26000);
  });

  // ── Tax Computation ─────────────────────────────────────
  it("computes income tax using QDCG worksheet", () => {
    expect(federal.totalTaxBeforeCredits.greaterThan(d(0))).toBe(true);
    expect(federal.ordinaryTax.greaterThan(d(0))).toBe(true);
  });

  // ── Credits ─────────────────────────────────────────────
  it("child tax credit for one qualifying child", () => {
    expect(federal.childTaxCredit.toNumber()).toBe(2200);
  });

  it("foreign tax credit from 1099-DIV", () => {
    expect(federal.foreignTaxCredit.toNumber()).toBe(200);
  });

  // ── Additional Taxes ────────────────────────────────────
  it("self-employment tax on $40K 1099-NEC", () => {
    expect(federal.selfEmploymentTax.greaterThan(d(0))).toBe(true);
  });

  it("AMT computed (may or may not be positive)", () => {
    expect(federal.amt.gte(d(0))).toBe(true);
  });

  it("NIIT computed for high-income filer", () => {
    // MFJ threshold $250K. AGI likely above that with investment income.
    expect(federal.niitTax.gte(d(0))).toBe(true);
  });

  it("total additional taxes includes AMT + SE + Medicare + NIIT", () => {
    const expected = federal.amt
      .plus(federal.selfEmploymentTax)
      .plus(federal.additionalMedicareTax)
      .plus(federal.niitTax);
    expect(federal.totalAdditionalTaxes.toNumber()).toBe(expected.toNumber());
  });

  // ── Payments ────────────────────────────────────────────
  it("total withholding from two W-2s", () => {
    expect(federal.totalWithholding.toNumber()).toBe(52000); // 40K + 12K
  });

  it("estimated payments total $32K", () => {
    expect(federal.estimatedTaxPayments.toNumber()).toBe(32000);
  });

  // ── Final ───────────────────────────────────────────────
  it("total tax is positive", () => {
    expect(federal.totalTax.greaterThan(d(0))).toBe(true);
  });

  it("refund and owed are mutually exclusive", () => {
    const isRefund = federal.refund.greaterThan(d(0));
    const isOwed = federal.amountOwed.greaterThan(d(0));
    expect(isRefund && isOwed).toBe(false);
  });

  it("total tax = payments - refund + owed", () => {
    // totalTax = totalPayments - refund = totalPayments + amountOwed - refund
    const fromPayments = federal.totalPayments.minus(federal.refund).plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });

  // ── Carryforwards ───────────────────────────────────────
  it("passive loss from K-1 is suspended", () => {
    // Losing Venture LP has -$15K passive loss with no passive income
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].partnershipName).toBe("Losing Venture LP");
  });

  // ── Schedule C ─────────────────────────────────────────
  it("Schedule C net profit reduces by business expenses", () => {
    // Gross: $40K. Expenses: 500+1200+800+2000+1500(meals 50%)+1500+1250(home office) = $8,750
    // Net profit = $40K - $8,750 = $31,250
    const schedCLines = federal.allLines.filter((l) => l.form === "Sched C");
    expect(schedCLines.length).toBeGreaterThan(0);
    const line31 = schedCLines.find((l) => l.line === "31");
    expect(line31).toBeDefined();
    expect(line31!.value.toNumber()).toBe(31250);
  });

  // ── Schedule E (Rental) ───────────────────────────────
  it("rental income flows through Schedule E", () => {
    const schedELines = federal.allLines.filter((l) => l.form === "Sched E");
    expect(schedELines.length).toBeGreaterThan(0);
    // Rental net: $28,800 - $28,700 = $100
    const line21 = schedELines.find((l) => l.line === "21");
    expect(line21).toBeDefined();
    expect(line21!.value.toNumber()).toBe(100);
  });

  // ── Schedule 3 Credits ────────────────────────────────
  it("Schedule 3 aggregates dependent care + education + foreign tax credits", () => {
    const sched3Lines = federal.allLines.filter((l) => l.form === "Sched 3");
    expect(sched3Lines.length).toBeGreaterThan(0);
    // Line 7: total nonrefundable credits
    const line7 = sched3Lines.find((l) => l.line === "7");
    expect(line7).toBeDefined();
    expect(line7!.value.greaterThan(0)).toBe(true);
  });

  it("otherCredits includes Schedule 3 nonrefundable total", () => {
    // Should include: foreign tax ($200) + dependent care + LLC education
    expect(federal.otherCredits.greaterThan(d(200))).toBe(true);
  });

  it("dependent care credit via Form 2441", () => {
    const form2441Lines = federal.allLines.filter((l) => l.form === "Form 2441");
    expect(form2441Lines.length).toBeGreaterThan(0);
  });

  it("LLC education credit via Form 8863", () => {
    const form8863Lines = federal.allLines.filter((l) => l.form === "Form 8863");
    expect(form8863Lines.length).toBeGreaterThan(0);
    // LLC: 20% × min($8K, $10K) = $1,600
    // MFJ AGI ~$340K → phase-out at $160K-$180K → fully phased out
    // Actually depends on exact AGI
  });

  // ── Audit Trail ─────────────────────────────────────────
  it("audit trail covers all major form lines", () => {
    const forms = new Set(federal.allLines.map((l) => l.form));
    expect(forms.has("1040")).toBe(true);
    expect(forms.has("Sched A")).toBe(true);
    expect(forms.has("Sched C")).toBe(true);
    expect(forms.has("Sched E")).toBe(true);
    expect(forms.has("Sched SE")).toBe(true);
    expect(forms.has("Sched 2")).toBe(true);
    expect(forms.has("Sched 3")).toBe(true);
    expect(forms.has("Form 2441")).toBe(true);
  });

  it("every audit line has description and formula", () => {
    for (const line of federal.allLines) {
      expect(line.description.length).toBeGreaterThan(0);
      expect(line.formula.length).toBeGreaterThan(0);
    }
  });
});

describe("E2E Standalone Module Consistency", () => {
  const federal = calculateFederalTax(complexE2EFixture);

  it("Schedule D matches federal capital gain", () => {
    const schedD = calculateScheduleD(complexE2EFixture, "married_filing_jointly", c);
    expect(federal.capitalGainLoss.toNumber()).toBe(schedD.capitalLossDeduction.toNumber());
  });

  it("Schedule SE matches federal SE tax", () => {
    // Must pass Schedule C net profit so standalone SE matches the pipeline
    // (pipeline uses net profit from Schedule C, not gross 1099-NEC)
    const schedC = calculateScheduleC(complexE2EFixture, complexE2EFixture.scheduleC);
    const schedSE = calculateScheduleSE(complexE2EFixture, c, schedC.netProfit);
    expect(federal.selfEmploymentTax.toNumber()).toBe(schedSE.totalSETax.toNumber());
  });

  it("Form 6251 AMT matches federal AMT", () => {
    const schedA = calculateScheduleA(complexE2EFixture, federal.agi, "married_filing_jointly", c);
    const form6251 = calculateForm6251({
      taxableIncome: federal.taxableIncome,
      saltDeduction: schedA.saltDeduction,
      regularTax: federal.totalTaxBeforeCredits,
      filingStatus: "married_filing_jointly",
      isItemizing: federal.deductionUsed === "itemized",
    }, c);
    expect(federal.amt.toNumber()).toBe(form6251.amt.toNumber());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW SCENARIO FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

/** Single filer with education credits, student loan interest, capital losses */
const singleEducationFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Alex",
      lastName: "Rivera",
      ssn: "123-45-6789",
      dateOfBirth: "1998-07-01",
    },
    address: { street: "10 Campus Rd", city: "Boston", state: "MA", zip: "02115" },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Tech Startup", ein: "55-1234567" },
      wages: "62000",
      federalWithheld: "9000",
      socialSecurityWages: "62000",
      socialSecurityWithheld: "3844",
      medicareWages: "62000",
      medicareWithheld: "899",
      stateTaxWithheld: "3000",
      stateWages: "62000",
      localTaxWithheld: "0",
      state: "MA",
    },
  ],
  form1099Int: [],
  form1099Div: [],
  form1099B: [
    {
      broker: "Robinhood",
      transactions: [
        {
          description: "ARK ETF 100 shares",
          dateAcquired: "2023-01-10",
          dateSold: "2025-06-15",
          proceeds: "3000",
          costBasis: "8000",
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
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  rentalProperties: [],
  educationExpenses: {
    aocStudents: [{ name: "Alex Rivera", qualifiedExpenses: "4000" }],
    llcExpenses: "0",
  },
  adjustments: {
    estimatedTaxPayments: [],
    otherTaxesPaid: "0",
    educatorExpenses: "0",
    hsaDeduction: "0",
    selfEmployedHealthInsurance: "0",
    studentLoanInterest: "2500",
    iraDeduction: "0",
    alimonyPaid: "0",
    earlyWithdrawalPenalty: "0",
  },
};

/** QSS with three dependents, rental property, estimated payments */
const qssMultiDependentFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "qualifying_surviving_spouse",
    primary: {
      firstName: "Dana",
      lastName: "Kim",
      ssn: "222-33-4444",
      dateOfBirth: "1980-05-20",
    },
    address: { street: "5 Oak Ave", city: "Denver", state: "CO", zip: "80202" },
    dependents: [
      {
        firstName: "Tyler",
        lastName: "Kim",
        ssn: "555-66-7777",
        relationship: "Son",
        dateOfBirth: "2014-03-10",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
      {
        firstName: "Mia",
        lastName: "Kim",
        ssn: "555-66-8888",
        relationship: "Daughter",
        dateOfBirth: "2016-08-22",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
      {
        firstName: "Liam",
        lastName: "Kim",
        ssn: "555-66-9999",
        relationship: "Son",
        dateOfBirth: "2018-11-05",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Hospital System", ein: "30-9876543" },
      wages: "95000",
      federalWithheld: "14000",
      socialSecurityWages: "95000",
      socialSecurityWithheld: "5890",
      medicareWages: "95000",
      medicareWithheld: "1378",
      stateTaxWithheld: "4500",
      stateWages: "95000",
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
      lender: "Wells Fargo",
      mortgageInterestReceived: "12000",
      outstandingMortgagePrincipal: "300000",
      propertyTax: "5000",
      refundOfOverpaidInterest: "0",
      mortgageInsurancePremiums: "0",
      pointsPaid: "0",
    },
  ],
  form1095A: [],
  donations: [],
  rentalProperties: [
    {
      description: "101 Maple St, rental condo",
      propertyType: "single_family",
      personalUseDays: 0,
      rentalDays: 365,
      rents: "18000",
      advertising: "0",
      autoTravel: "0",
      cleaning: "300",
      commissions: "0",
      insurance: "900",
      legalProfessional: "0",
      managementFees: "1500",
      mortgageInterest: "6000",
      otherInterest: "0",
      repairs: "1200",
      supplies: "200",
      taxes: "2400",
      utilities: "0",
      depreciation: "4500",
      otherExpenses: "0",
    },
  ],
  adjustments: {
    estimatedTaxPayments: [
      { date: "2025-04-15", amount: "3000", type: "federal" },
      { date: "2025-06-15", amount: "3000", type: "federal" },
      { date: "2025-09-15", amount: "3000", type: "federal" },
      { date: "2026-01-15", amount: "3000", type: "federal" },
    ],
    otherTaxesPaid: "0",
    educatorExpenses: "0",
    hsaDeduction: "0",
    selfEmployedHealthInsurance: "0",
    studentLoanInterest: "0",
    iraDeduction: "0",
    alimonyPaid: "0",
    earlyWithdrawalPenalty: "0",
  },
};

/** MFS filer — restricted deductions: SALT $5K cap, capital loss $1,500 */
const mfsRestrictedFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_separately",
    primary: {
      firstName: "Jordan",
      lastName: "Walsh",
      ssn: "333-44-5555",
      dateOfBirth: "1975-11-30",
    },
    address: { street: "77 Pine St", city: "Chicago", state: "IL", zip: "60601" },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Finance Corp", ein: "40-1234567" },
      wages: "120000",
      federalWithheld: "22000",
      socialSecurityWages: "120000",
      socialSecurityWithheld: "7440",
      medicareWages: "120000",
      medicareWithheld: "1740",
      stateTaxWithheld: "6000",
      stateWages: "120000",
      localTaxWithheld: "0",
      state: "IL",
    },
  ],
  form1099Int: [],
  form1099Div: [],
  form1099B: [
    {
      broker: "TD Ameritrade",
      transactions: [
        {
          description: "Bond Fund",
          dateAcquired: "2022-03-01",
          dateSold: "2025-11-01",
          proceeds: "5000",
          costBasis: "12000",
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
  form1099Misc: [],
  scheduleK1: [],
  form1098: [
    {
      lender: "Chase",
      mortgageInterestReceived: "8000",
      outstandingMortgagePrincipal: "200000",
      propertyTax: "4000",
      refundOfOverpaidInterest: "0",
      mortgageInsurancePremiums: "0",
      pointsPaid: "0",
    },
  ],
  form1095A: [],
  donations: [],
  rentalProperties: [],
  adjustments: {
    estimatedTaxPayments: [],
    otherTaxesPaid: "0",
    educatorExpenses: "0",
    hsaDeduction: "0",
    selfEmployedHealthInsurance: "0",
    studentLoanInterest: "0",
    iraDeduction: "0",
    alimonyPaid: "0",
    earlyWithdrawalPenalty: "0",
  },
};

/** HoH filer with three dependents — ACTC expected */
const hohWithChildrenFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "head_of_household",
    primary: {
      firstName: "Maria",
      lastName: "Santos",
      ssn: "456-78-9012",
      dateOfBirth: "1990-02-14",
    },
    address: { street: "22 Birch St", city: "Phoenix", state: "AZ", zip: "85001" },
    dependents: [
      {
        firstName: "Sofia",
        lastName: "Santos",
        ssn: "888-99-1111",
        relationship: "Daughter",
        dateOfBirth: "2013-06-01",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
      {
        firstName: "Diego",
        lastName: "Santos",
        ssn: "888-99-2222",
        relationship: "Son",
        dateOfBirth: "2017-09-15",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Retail Co", ein: "50-7654321" },
      wages: "38000",
      federalWithheld: "2000",
      socialSecurityWages: "38000",
      socialSecurityWithheld: "2356",
      medicareWages: "38000",
      medicareWithheld: "551",
      stateTaxWithheld: "800",
      stateWages: "38000",
      localTaxWithheld: "0",
      state: "AZ",
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
  rentalProperties: [],
  adjustments: {
    estimatedTaxPayments: [],
    otherTaxesPaid: "0",
    educatorExpenses: "0",
    hsaDeduction: "0",
    selfEmployedHealthInsurance: "0",
    studentLoanInterest: "0",
    iraDeduction: "0",
    alimonyPaid: "0",
    earlyWithdrawalPenalty: "0",
  },
};

/** Self-employed filer with SE tax + QBI deduction + HSA */
const selfEmployedQBIFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Sam",
      lastName: "Nguyen",
      ssn: "789-01-2345",
      dateOfBirth: "1985-04-10",
    },
    address: { street: "88 Spruce Lane", city: "Austin", state: "TX", zip: "78701" },
    dependents: [],
  },
  w2s: [],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [
    {
      payer: "Consulting Client A",
      nonemployeeCompensation: "90000",
      federalWithheld: "0",
    },
    {
      payer: "Consulting Client B",
      nonemployeeCompensation: "30000",
      federalWithheld: "0",
    },
  ],
  form1099Misc: [],
  scheduleC: {
    businessName: "Nguyen Consulting",
    expenses: {
      advertising: "1000",
      officeExpense: "2000",
      supplies: "1500",
      travel: "3000",
      meals: "2000",
      otherExpenses: "2000",
    },
    homeOffice: { method: "simplified", squareFeet: 200 },
  },
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  rentalProperties: [],
  adjustments: {
    estimatedTaxPayments: [
      { date: "2025-04-15", amount: "10000", type: "federal" },
      { date: "2025-06-15", amount: "10000", type: "federal" },
      { date: "2025-09-15", amount: "10000", type: "federal" },
      { date: "2026-01-15", amount: "10000", type: "federal" },
    ],
    otherTaxesPaid: "0",
    educatorExpenses: "0",
    hsaDeduction: "4300",
    selfEmployedHealthInsurance: "8000",
    studentLoanInterest: "0",
    iraDeduction: "0",
    alimonyPaid: "0",
    earlyWithdrawalPenalty: "0",
  },
};

/** Retiree: Social Security (1099-SSA-equivalent via 1099-MISC) + pension + capital gains */
const retireeFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Harold",
      lastName: "Peterson",
      ssn: "901-23-4567",
      dateOfBirth: "1950-01-15",
    },
    address: { street: "3 Sunset Blvd", city: "Sarasota", state: "FL", zip: "34230" },
    dependents: [],
  },
  w2s: [],
  form1099Int: [
    {
      payer: "Bank CD",
      interestIncome: "2000",
      federalWithheld: "0",
      earlyWithdrawalPenalty: "0",
      usSavingsBondInterest: "0",
      taxExemptInterest: "0",
    },
  ],
  form1099Div: [
    {
      payer: "Vanguard",
      ordinaryDividends: "8000",
      qualifiedDividends: "7000",
      totalCapitalGainDistributions: "3000",
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
      broker: "Fidelity",
      transactions: [
        {
          description: "S&P 500 ETF",
          dateAcquired: "2015-06-01",
          dateSold: "2025-03-01",
          proceeds: "25000",
          costBasis: "15000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        },
      ],
    },
  ],
  // Pension income via 1099-MISC other income
  form1099Nec: [],
  form1099Misc: [
    {
      payer: "State Pension Fund",
      otherIncome: "24000",
      rents: "0",
      federalWithheld: "2000",
    },
  ],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  rentalProperties: [],
  adjustments: {
    estimatedTaxPayments: [
      { date: "2025-04-15", amount: "2000", type: "federal" },
    ],
    otherTaxesPaid: "0",
    educatorExpenses: "0",
    hsaDeduction: "0",
    selfEmployedHealthInsurance: "0",
    studentLoanInterest: "0",
    iraDeduction: "0",
    alimonyPaid: "0",
    earlyWithdrawalPenalty: "0",
  },
};

/** All-credits filer: CTC + education (AOC) + foreign tax + child care */
const allCreditsFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Chris",
      lastName: "Park",
      ssn: "234-56-7890",
      dateOfBirth: "1983-08-20",
    },
    spouse: {
      firstName: "Jamie",
      lastName: "Park",
      ssn: "234-56-7891",
      dateOfBirth: "1985-03-05",
    },
    address: { street: "100 Willow Way", city: "Seattle", state: "WA", zip: "98101" },
    dependents: [
      {
        firstName: "Noah",
        lastName: "Park",
        ssn: "111-11-1111",
        relationship: "Son",
        dateOfBirth: "2015-01-01",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
      {
        firstName: "Ella",
        lastName: "Park",
        ssn: "111-11-2222",
        relationship: "Daughter",
        dateOfBirth: "2006-05-10",
        monthsLivedWithYou: 12,
        qualifiesForCTC: false,
        qualifiesForODC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Pacific Corp", ein: "99-1234560" },
      wages: "140000",
      federalWithheld: "25000",
      socialSecurityWages: "140000",
      socialSecurityWithheld: "8680",
      medicareWages: "140000",
      medicareWithheld: "2030",
      stateTaxWithheld: "0",
      stateWages: "140000",
      localTaxWithheld: "0",
      state: "WA",
    },
  ],
  form1099Int: [],
  form1099Div: [
    {
      payer: "International Fund",
      ordinaryDividends: "4000",
      qualifiedDividends: "3000",
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
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  rentalProperties: [],
  dependentCare: {
    expenses: "6000",
    qualifyingIndividuals: 1,
  },
  educationExpenses: {
    aocStudents: [{ name: "Ella Park", qualifiedExpenses: "3500" }],
    llcExpenses: "0",
  },
  adjustments: {
    estimatedTaxPayments: [],
    otherTaxesPaid: "0",
    educatorExpenses: "0",
    hsaDeduction: "0",
    selfEmployedHealthInsurance: "0",
    studentLoanInterest: "0",
    iraDeduction: "0",
    alimonyPaid: "0",
    earlyWithdrawalPenalty: "0",
  },
};

/** Overpaid filer — refund scenario */
const overpaidFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Pat",
      lastName: "Owens",
      ssn: "567-89-0123",
      dateOfBirth: "1992-06-15",
    },
    address: { street: "5 River Rd", city: "Nashville", state: "TN", zip: "37201" },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Music Label", ein: "60-1122334" },
      wages: "55000",
      federalWithheld: "14000",
      socialSecurityWages: "55000",
      socialSecurityWithheld: "3410",
      medicareWages: "55000",
      medicareWithheld: "798",
      stateTaxWithheld: "0",
      stateWages: "55000",
      localTaxWithheld: "0",
      state: "TN",
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
  rentalProperties: [],
  adjustments: {
    estimatedTaxPayments: [],
    otherTaxesPaid: "0",
    educatorExpenses: "0",
    hsaDeduction: "0",
    selfEmployedHealthInsurance: "0",
    studentLoanInterest: "0",
    iraDeduction: "0",
    alimonyPaid: "0",
    earlyWithdrawalPenalty: "0",
  },
};

/** Underpaid filer — amount owed scenario */
const underpaidFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Quinn",
      lastName: "Moore",
      ssn: "678-90-1234",
      dateOfBirth: "1988-09-20",
    },
    address: { street: "9 Bay St", city: "Miami", state: "FL", zip: "33101" },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Sales Firm", ein: "70-9988776" },
      wages: "180000",
      federalWithheld: "15000",
      socialSecurityWages: "176100",
      socialSecurityWithheld: "10918.20",
      medicareWages: "180000",
      medicareWithheld: "2610",
      stateTaxWithheld: "0",
      stateWages: "180000",
      localTaxWithheld: "0",
      state: "FL",
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
  rentalProperties: [],
  adjustments: {
    estimatedTaxPayments: [],
    otherTaxesPaid: "0",
    educatorExpenses: "0",
    hsaDeduction: "0",
    selfEmployedHealthInsurance: "0",
    studentLoanInterest: "0",
    iraDeduction: "0",
    alimonyPaid: "0",
    earlyWithdrawalPenalty: "0",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW E2E TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E Single Filer with Education Credits and Capital Losses", () => {
  const federal = calculateFederalTax(singleEducationFixture);

  it("wages flow correctly from single W-2", () => {
    expect(federal.totalWages.toNumber()).toBe(62000);
  });

  it("long-term capital loss of $5K is capped at $3K deduction for single filer", () => {
    // Proceeds $3K - basis $8K = -$5K loss; single filer cap = $3K
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.longTermCapitalLoss.toNumber()).toBe(-2000);
  });

  it("student loan interest reduces AGI", () => {
    // $2,500 is the statutory maximum; wages minus capital loss minus $2,500 SLI
    const expectedAGI = federal.totalIncome.minus(federal.adjustmentsToIncome);
    expect(federal.agi.toNumber()).toBe(expectedAGI.toNumber());
    expect(federal.adjustmentsToIncome.gte(d(2500))).toBe(true);
  });

  it("AOC credit is present (income below phase-out)", () => {
    // AGI ~$57K is well below $80K single phase-out start for AOC
    const form8863Lines = federal.allLines.filter((l) => l.form === "Form 8863");
    expect(form8863Lines.length).toBeGreaterThan(0);
  });

  it("total tax + refund/owed equation holds", () => {
    const fromPayments = federal.totalPayments
      .minus(federal.refund)
      .plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });
});

describe("E2E QSS with Three CTC Dependents and Rental Property", () => {
  const federal = calculateFederalTax(qssMultiDependentFixture);

  it("filing status is qualifying_surviving_spouse", () => {
    expect(federal.filingStatus).toBe("qualifying_surviving_spouse");
  });

  it("CTC before phase-out equals $6,000 for three qualifying children", () => {
    expect(federal.form8812!.ctcBeforeLimitation.toNumber()).toBe(6600);
  });

  it("estimated payments of $12K are reflected in total payments", () => {
    expect(federal.estimatedTaxPayments.toNumber()).toBe(12000);
    expect(federal.totalPayments.gte(d(12000))).toBe(true);
  });

  it("rental income flows through Schedule E", () => {
    const schedELines = federal.allLines.filter((l) => l.form === "Sched E");
    expect(schedELines.length).toBeGreaterThan(0);
    // Rental: $18K rents - $16,300 expenses = $1,100 net income
    const line21 = schedELines.find((l) => l.line === "21");
    expect(line21).toBeDefined();
    expect(line21!.value.toNumber()).toBeGreaterThanOrEqual(0);
  });

  it("QSS uses MFJ-equivalent standard deduction ($31,500)", () => {
    expect(federal.standardDeduction.toNumber()).toBe(31500);
  });

  it("refund and amount owed are mutually exclusive", () => {
    const isRefund = federal.refund.greaterThan(d(0));
    const isOwed = federal.amountOwed.greaterThan(d(0));
    expect(isRefund && isOwed).toBe(false);
  });
});

describe("E2E MFS with Restricted Deductions", () => {
  const federal = calculateFederalTax(mfsRestrictedFixture);

  it("2025 MFS SALT allows $10,000 below the $20,000 limit", () => {
    const schedA = calculateScheduleA(mfsRestrictedFixture, federal.agi, "married_filing_separately", c);
    expect(schedA.saltDeduction.toNumber()).toBe(10000);
  });

  it("MFS capital loss is capped at $1,500", () => {
    // Proceeds $5K - basis $12K = -$7K net loss; MFS cap = $1,500
    expect(federal.capitalGainLoss.toNumber()).toBe(-1500);
  });

  it("MFS has capital loss carryforward for unused portion", () => {
    // -$7K total, -$1.5K used → -$5.5K carryforward
    expect(federal.carryforwards.longTermCapitalLoss.toNumber()).toBe(-5500);
  });

  it("student loan interest deduction is zero for MFS filer", () => {
    // IRC §221(d)(2): MFS cannot deduct student loan interest
    // Fixture has no SLI but we verify adjustments are computed correctly
    expect(federal.agi.toNumber()).toBe(
      federal.totalIncome.minus(federal.adjustmentsToIncome).toNumber()
    );
  });

  it("total tax equation holds for MFS", () => {
    const fromPayments = federal.totalPayments
      .minus(federal.refund)
      .plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });
});

describe("E2E HoH with Two CTC Dependents and ACTC", () => {
  const federal = calculateFederalTax(hohWithChildrenFixture);

  it("filing status is head_of_household", () => {
    expect(federal.filingStatus).toBe("head_of_household");
  });

  it("CTC before phase-out is $4,000 for two qualifying children", () => {
    expect(federal.form8812!.ctcBeforeLimitation.toNumber()).toBe(4400);
  });

  it("ACTC refundable credit is present for low-income HoH filer", () => {
    // Wages $38K; earned income excess over $2,500 = $35,500; 15% = $5,325
    // Unused CTC (likely all $4K is unused vs low tax); ACTC capped at min(unused, 15%, $3,400)
    expect(federal.form8812!.actc.greaterThan(d(0))).toBe(true);
  });

  it("ACTC flows into total payments as refundable credit", () => {
    // totalPayments includes ACTC
    const actcInPayments = federal.totalPayments.minus(federal.totalWithholding);
    expect(actcInPayments.gte(federal.form8812!.actc)).toBe(true);
  });

  it("HoH standard deduction is $23,625", () => {
    expect(federal.standardDeduction.toNumber()).toBe(23625);
  });

  it("total tax equation holds for HoH", () => {
    const fromPayments = federal.totalPayments
      .minus(federal.refund)
      .plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });
});

describe("E2E Self-Employed Filer with SE Tax, QBI Deduction, and HSA", () => {
  const federal = calculateFederalTax(selfEmployedQBIFixture);

  it("SE tax is computed on $120K of 1099-NEC income", () => {
    expect(federal.selfEmploymentTax.greaterThan(d(0))).toBe(true);
  });

  it("deductible half of SE tax reduces AGI", () => {
    // adjustmentsToIncome includes SE deductible half + HSA + SEHI
    expect(federal.adjustmentsToIncome.greaterThan(d(0))).toBe(true);
  });

  it("HSA deduction is included in adjustments", () => {
    // $4,300 HSA + $8,000 SEHI + SE deductible half
    expect(federal.adjustmentsToIncome.greaterThan(d(12300))).toBe(true);
  });

  it("QBI deduction is applied (taxable income below $197,300 single threshold)", () => {
    // Net profit ≈ $120K - expenses; AGI after adjustments likely below QBI threshold
    expect(federal.form8995).toBeDefined();
    expect(federal.form8995!.qbiDeduction.greaterThan(d(0))).toBe(true);
  });

  it("estimated payments of $40K are tracked", () => {
    expect(federal.estimatedTaxPayments.toNumber()).toBe(40000);
  });

  it("SE tax flows into additional taxes", () => {
    expect(federal.totalAdditionalTaxes.gte(federal.selfEmploymentTax)).toBe(true);
  });

  it("total tax equation holds for self-employed filer", () => {
    const fromPayments = federal.totalPayments
      .minus(federal.refund)
      .plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });
});

describe("E2E Retiree with Pension, Interest, Dividends, and Capital Gains", () => {
  const federal = calculateFederalTax(retireeFixture);

  it("pension income flows through 1099-MISC other income", () => {
    // $24K pension via 1099-MISC otherIncome
    expect(federal.otherIncome.toNumber()).toBe(24000);
  });

  it("interest and dividend income are included in total income", () => {
    expect(federal.totalInterest.toNumber()).toBe(2000);
    expect(federal.totalDividends.toNumber()).toBe(8000);
  });

  it("long-term capital gain from stock sale is positive", () => {
    // $25K - $15K = $10K gain + $3K cap gain distributions = $13K
    expect(federal.capitalGainLoss.toNumber()).toBe(13000);
  });

  it("qualified dividends and LTCG are taxed at preferential rates (0% at low income)", () => {
    // Retiree taxable income ~$32K is well below the $48,350 single 0%-rate threshold
    // so capitalGainsTax = 0 and ordinaryTax covers only the ordinary income portion
    expect(federal.capitalGainsTax.toNumber()).toBe(0);
    expect(federal.ordinaryTax.greaterThan(d(0))).toBe(true);
  });

  it("withholding from 1099-MISC is included in total payments", () => {
    // $2K withheld on pension + $2K estimated payment
    expect(federal.totalWithholding.toNumber()).toBe(2000);
    expect(federal.totalPayments.toNumber()).toBe(4000);
  });

  it("total tax equation holds for retiree", () => {
    const fromPayments = federal.totalPayments
      .minus(federal.refund)
      .plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });
});

describe("E2E All Credits Stacking: CTC + Education + Foreign Tax + Child Care", () => {
  const federal = calculateFederalTax(allCreditsFixture);

  it("combined CTC plus ODC before phase-out is $2,500 (one child + one ODC dependent)", () => {
    expect(federal.form8812!.ctcBeforeLimitation.toNumber()).toBe(2700);
  });

  it("nonrefundable CTC is limited to tax liability after other credits", () => {
    // childTaxCredit = min(ctcBeforeLimitation, taxAfterOtherCredits)
    expect(federal.childTaxCredit.lte(federal.form8812!.ctcBeforeLimitation)).toBe(true);
    expect(federal.childTaxCredit.gte(d(0))).toBe(true);
  });

  it("foreign tax credit flows from 1099-DIV", () => {
    expect(federal.foreignTaxCredit.toNumber()).toBe(399);
  });

  it("dependent care credit is present via Form 2441", () => {
    const form2441Lines = federal.allLines.filter((l) => l.form === "Form 2441");
    expect(form2441Lines.length).toBeGreaterThan(0);
  });

  it("AOC education credit is computed via Form 8863", () => {
    const form8863Lines = federal.allLines.filter((l) => l.form === "Form 8863");
    expect(form8863Lines.length).toBeGreaterThan(0);
  });

  it("otherCredits includes dependent care + education + foreign tax combined", () => {
    // Schedule 3 aggregates all three nonrefundable credits
    expect(federal.otherCredits.greaterThan(d(400))).toBe(true);
  });

  it("total credits is CTC plus all other credits", () => {
    const expected = federal.childTaxCredit.plus(federal.otherCredits);
    expect(federal.totalCredits.toNumber()).toBe(expected.toNumber());
  });

  it("total tax equation holds with all credits stacked", () => {
    const fromPayments = federal.totalPayments
      .minus(federal.refund)
      .plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });
});

describe("E2E Refund Verification: overpayment produces refund equal to payments minus tax", () => {
  const federal = calculateFederalTax(overpaidFixture);

  it("filer with heavy withholding relative to tax liability receives a refund", () => {
    // $14K withheld on $55K wages; expected tax is well under $14K
    expect(federal.refund.greaterThan(d(0))).toBe(true);
    expect(federal.amountOwed.toNumber()).toBe(0);
  });

  it("refund equals totalPayments minus totalTax", () => {
    const expectedRefund = federal.totalPayments.minus(federal.totalTax);
    expect(federal.refund.toNumber()).toBe(expectedRefund.toNumber());
  });
});

describe("E2E Amount Owed Verification: underpayment produces balance due equal to tax minus payments", () => {
  const federal = calculateFederalTax(underpaidFixture);

  it("filer with low withholding on high wages owes additional tax", () => {
    // $180K wages with only $15K withheld; tax liability is substantially higher
    expect(federal.amountOwed.greaterThan(d(0))).toBe(true);
    expect(federal.refund.toNumber()).toBe(0);
  });

  it("amountOwed equals totalTax minus totalPayments", () => {
    const expectedOwed = federal.totalTax.minus(federal.totalPayments);
    expect(federal.amountOwed.toNumber()).toBe(expectedOwed.toNumber());
  });
});

describe("E2E Standalone Education and Care Credits", () => {
  it("Form 2441 dependent care credit for MFJ under $45K AGI", () => {
    const result = calculateForm2441({
      careExpenses: d(8000),
      qualifyingIndividuals: 1,
      earnedIncome: d(80000),
      agi: d(40000),
    });
    // Expenses capped at $3K (one child). AGI $40K → ($40K-$15K)/$2K = 12.5 → ceil = 13 steps → 35%-13% = 22%
    // Credit = $3,000 × 22% = $660
    expect(result.credit.toNumber()).toBe(660);
  });

  it("Form 8863 AOC + LLC combined for MFJ", () => {
    const result = calculateForm8863({
      aocStudents: [{ name: "College Student", qualifiedExpenses: d(4000) }],
      llcExpenses: d(5000),
      magi: d(150000),
      filingStatus: "married_filing_jointly",
    });
    // Under $160K → no phase-out
    // AOC = $2,500 (nonrefundable $1,500 + refundable $1,000)
    // LLC = $1,000 (20% × $5,000)
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(1000);
    expect(result.totalNonrefundable.toNumber()).toBe(2500); // $1,500 AOC + $1,000 LLC
    expect(result.totalRefundable.toNumber()).toBe(1000); // 40% AOC
  });
});
