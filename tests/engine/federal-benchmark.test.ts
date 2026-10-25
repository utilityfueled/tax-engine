/**
 * Performance benchmark for calculateFederalTax.
 * Measures calculation time for simple, complex, and stress-test returns.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput, W2, Form1099Div, Form1099Int } from "@/models/inputs.js";

// ── Fixtures ─────────────────────────────────────────────────

/** Simple single filer: 1 W-2, standard deduction */
const simpleFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: { firstName: "A", lastName: "B", ssn: "111-11-1111", dateOfBirth: "1990-01-01" },
    address: { street: "1 Main St", city: "Anytown", state: "WA", zip: "98101" },
    dependents: [],
  },
  w2s: [{ employer: { name: "Acme", ein: "12-0000001" }, wages: "75000", federalWithheld: "12000", socialSecurityWages: "75000", socialSecurityWithheld: "4650", medicareWages: "75000", medicareWithheld: "1088" }],
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

/** Complex MFJ: 2 W-2s, Schedule C, K-1, investments, itemized */
const complexFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: { firstName: "M", lastName: "C", ssn: "111-22-3333", dateOfBirth: "1982-04-15" },
    spouse: { firstName: "S", lastName: "C", ssn: "444-55-6666", dateOfBirth: "1984-09-20" },
    address: { street: "789 Elm Dr", city: "Portland", state: "OR", zip: "97201" },
    dependents: [{ firstName: "E", lastName: "C", ssn: "777-88-9999", relationship: "Daughter", dateOfBirth: "2015-03-10", monthsLivedWithYou: 12, qualifiesForCTC: true }],
  },
  w2s: [
    { employer: { name: "Tech Co", ein: "12-1111111" }, wages: "200000", federalWithheld: "40000", socialSecurityWages: "176100", socialSecurityWithheld: "10918.20", medicareWages: "200000", medicareWithheld: "2900", stateTaxWithheld: "12000", stateWages: "200000", state: "OR" },
    { employer: { name: "Part-Time", ein: "12-2222222" }, wages: "80000", federalWithheld: "12000", socialSecurityWages: "80000", socialSecurityWithheld: "4960", medicareWages: "80000", medicareWithheld: "1160", stateTaxWithheld: "5000", stateWages: "80000", state: "OR" },
  ],
  form1099Int: [{ privateActivityBondInterest: "0", payer: "Bank", interestIncome: "3000", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" }],
  form1099Div: [{ specifiedPrivateActivityBondInterest: "0", payer: "Fidelity", ordinaryDividends: "12000", qualifiedDividends: "9000", totalCapitalGainDistributions: "5000", federalWithheld: "0", foreignTaxPaid: "200", foreignCountry: "Various", section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0", nondividendDistributions: "0", exemptInterestDividends: "0" }],
  form1099B: [{ broker: "Schwab", transactions: [{ description: "VOO", dateAcquired: "2021-01-15", dateSold: "2025-09-01", proceeds: "60000", costBasis: "40000", holdingPeriod: "long", adjustments: "0", basisReportedToIRS: true, washSale: false, washSaleDisallowed: "0" }] }],
  form1099Nec: [{ payer: "Client", nonemployeeCompensation: "40000", federalWithheld: "0" }],
  form1099Misc: [],
  scheduleC: { businessName: "Consulting", expenses: { advertising: "500", officeExpense: "1200", supplies: "800", travel: "2000", meals: "3000", otherExpenses: "1500" }, homeOffice: { method: "simplified", squareFeet: 250 } },
  scheduleK1: [{ partnershipName: "LP", partnershipEIN: "99-8877665", ordinaryIncome: "-15000", guaranteedPayments: "0", netShortTermCapitalGain: "0", netLongTermCapitalGain: "0", interestIncome: "0", ordinaryDividends: "0", qualifiedDividends: "0", selfEmploymentEarnings: "0", isPassiveActivity: true, netRentalIncome: "0", otherNetRentalIncome: "0", royalties: "0", section1231Gain: "0", otherIncome: "0", section179Deduction: "0", otherDeductions: "0" }],
  form1098: [{ lender: "Chase", mortgageInterestReceived: "22000", outstandingMortgagePrincipal: "550000", propertyTax: "9000", refundOfOverpaidInterest: "0", mortgageInsurancePremiums: "0", pointsPaid: "0" }],
  form1095A: [],
  donations: [
    { organization: "Red Cross", type: "cash", amount: "8000", dateOfDonation: "2025-12-20", costBasis: "0" },
    { organization: "University", type: "appreciated_stock", amount: "15000", costBasis: "5000", dateOfDonation: "2025-11-15", isLongTermCapitalGain: true },
  ],
  adjustments: {
    estimatedTaxPayments: [
      { date: "2025-04-15", amount: "8000", type: "federal" },
      { date: "2025-06-15", amount: "8000", type: "federal" },
      { date: "2025-09-15", amount: "8000", type: "federal" },
      { date: "2026-01-15", amount: "8000", type: "federal" },
    ],
    hsaDeduction: "7000",
  },
  dependentCare: { expenses: "6000", qualifyingIndividuals: 1 },
  educationExpenses: { aocStudents: [], llcExpenses: "8000" },
  rentalProperties: [{ description: "Rental", propertyType: "single_family", personalUseDays: 0, rentalDays: 365, rents: "28800", insurance: "1800", managementFees: "2400", mortgageInterest: "9000", repairs: "3000", taxes: "4200", depreciation: "7000" }],
};

/** Stress test: many W-2s, K-1s, and 1099s to exercise array aggregation */
function buildStressFixture(): TaxYearInput {
  const w2s: W2[] = [];
  for (let i = 0; i < 50; i++) {
    w2s.push({
      employer: { name: `Employer ${i}`, ein: `12-${String(i).padStart(7, "0")}` },
      wages: "10000",
      federalWithheld: "1500",
      socialSecurityWages: "10000",
      socialSecurityWithheld: "620",
      medicareWages: "10000",
      medicareWithheld: "145",
      stateTaxWithheld: "500",
      stateWages: "10000",
      state: "CA",
    });
  }

  const form1099Div: Form1099Div[] = [];
  for (let i = 0; i < 30; i++) {
    form1099Div.push({ specifiedPrivateActivityBondInterest: "0",
      payer: `Fund ${i}`,
      ordinaryDividends: "1000",
      qualifiedDividends: "800",
      totalCapitalGainDistributions: "200",
      federalWithheld: "50",
      foreignTaxPaid: "10",
      foreignCountry: "Various",
      section1250Gain: "5",
      section1202Gain: "0",
      collectiblesGain: "3",
      nondividendDistributions: "0",
      exemptInterestDividends: "20",
      section199ADividends: "15",
    });
  }

  const form1099Int: Form1099Int[] = [];
  for (let i = 0; i < 20; i++) {
    form1099Int.push({ privateActivityBondInterest: "0",
      payer: `Bank ${i}`,
      interestIncome: "500",
      federalWithheld: "25",
      earlyWithdrawalPenalty: "0",
      usSavingsBondInterest: "0",
      taxExemptInterest: "100",
      foreignTaxPaid: "5",
    });
  }

  const scheduleK1 = [];
  for (let i = 0; i < 20; i++) {
    scheduleK1.push({
      partnershipName: `Partnership ${i}`,
      partnershipEIN: `99-${String(i).padStart(7, "0")}`,
      ordinaryIncome: i % 3 === 0 ? "-5000" : "8000",
      guaranteedPayments: "1000",
      netShortTermCapitalGain: "500",
      netLongTermCapitalGain: "2000",
      interestIncome: "300",
      ordinaryDividends: "400",
      qualifiedDividends: "300",
      selfEmploymentEarnings: i % 2 === 0 ? "5000" : "0",
      isPassiveActivity: i % 3 === 0,
      netRentalIncome: "0",
      otherNetRentalIncome: "0",
      royalties: "0",
      section1231Gain: "0",
      otherIncome: "0",
      section179Deduction: "0",
      otherDeductions: "0",
      taxExemptInterest: "50",
      foreignTaxPaid: "20",
      foreignTaxCategory: i % 2 === 0 ? "passive" as const : "general" as const,
      investmentInterestExpense: "100",
      investmentIncome: "200",
      investmentExpenses: "50",
      charitableCash: "500",
      charitableCapitalGain30: "200",
      charitableCapitalGain20: "0",
      unrecapturedSection1250Gain: "100",
      collectiblesGain: "50",
      section199AQualifiedReitDividends: "150",
      section199AQualifiedPTPIncome: "0",
      amtDepreciationAdjustment: "100",
      amtAdjustedGainOrLoss: "50",
      amtDepletion: "0",
      amtOtherItems: "25",
    });
  }

  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      primary: { firstName: "Stress", lastName: "Test", ssn: "999-99-9999", dateOfBirth: "1975-06-01" },
      spouse: { firstName: "Also", lastName: "Test", ssn: "888-88-8888", dateOfBirth: "1976-07-01" },
      address: { street: "1 Test St", city: "Test", state: "CA", zip: "90001" },
      dependents: [],
    },
    w2s,
    form1099Int,
    form1099Div,
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    scheduleK1,
    form1098: [{ lender: "Bank", mortgageInterestReceived: "30000", outstandingMortgagePrincipal: "600000", propertyTax: "15000", refundOfOverpaidInterest: "0", mortgageInsurancePremiums: "0", pointsPaid: "0" }],
    form1095A: [],
    donations: [{ organization: "Charity", type: "cash", amount: "50000", dateOfDonation: "2025-12-01", costBasis: "0" }],
    adjustments: { hsaDeduction: "8300" },
  };
}

const stressFixture = buildStressFixture();

// ── Benchmarks ───────────────────────────────────────────────

function timeCalculation(input: TaxYearInput, iterations: number): { avgMs: number; minMs: number; maxMs: number } {
  // Warmup
  for (let i = 0; i < 3; i++) calculateFederalTax(input);

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    calculateFederalTax(input);
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  return { avgMs: Math.round(avg * 100) / 100, minMs: Math.round(times[0] * 100) / 100, maxMs: Math.round(times[times.length - 1] * 100) / 100 };
}

describe("Federal tax calculation performance", () => {
  it("simple return (1 W-2, standard deduction)", () => {
    const { avgMs, minMs, maxMs } = timeCalculation(simpleFixture, 50);
    console.log(`Simple return: avg=${avgMs}ms  min=${minMs}ms  max=${maxMs}ms`);
    // Sanity check: should complete in under 100ms
    expect(avgMs).toBeLessThan(100);
  });

  it("complex return (2 W-2s, Schedule C, K-1, investments, itemized)", () => {
    const { avgMs, minMs, maxMs } = timeCalculation(complexFixture, 50);
    console.log(`Complex return: avg=${avgMs}ms  min=${minMs}ms  max=${maxMs}ms`);
    expect(avgMs).toBeLessThan(200);
  });

  it("stress test (50 W-2s, 30 1099-DIVs, 20 1099-INTs, 20 K-1s)", () => {
    const { avgMs, minMs, maxMs } = timeCalculation(stressFixture, 20);
    console.log(`Stress test: avg=${avgMs}ms  min=${minMs}ms  max=${maxMs}ms`);
    expect(avgMs).toBeLessThan(500);
  });

  it("results are correct for stress fixture", () => {
    const result = calculateFederalTax(stressFixture);
    // 50 W-2s × $10,000 = $500,000 wages
    expect(result.totalWages.toNumber()).toBe(500000);
    // Should produce a valid result (not NaN or negative where inappropriate)
    expect(result.agi.isFinite()).toBe(true);
    expect(result.totalTax.isFinite()).toBe(true);
    expect(result.totalTax.greaterThanOrEqualTo(0)).toBe(true);
  });
});
