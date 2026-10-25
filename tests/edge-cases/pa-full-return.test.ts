/**
 * Pennsylvania full-return edge-case integration tests.
 *
 * Each scenario exercises the full PA orchestrator pipeline end-to-end
 * with realistic taxpayer profiles: income class mapping → PA-40 tax
 * computation → Schedule SP forgiveness → Schedule G-L resident credit
 * → REV-1630 penalty → Local EIT → refund or balance due.
 *
 * Validates correct interaction between all PA modules.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculatePAReturn, type PAOrchestratorOverrides } from "@/engine/state/pa-orchestrator.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

/** Minimal TaxYearInput with PA-resident defaults */
function makeInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: { firstName: "Test", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
      address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
      dependents: [],
    },
    w2s: [],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    form1099G: [],
    formW2G: [],
    form1099K: [],
    form1099C: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
    rentalProperties: [],
    savingsBondRedemptions: [],
    form6252: [],
    form8814: [],
    homeSales: [],
    ...overrides,
  };
}

describe.sequential("Pennsylvania Full-Return Edge Cases", () => {
  // =========================================================================
  // Scenario 1: Single W-2 employee — simplest case
  // =========================================================================
  describe("Single W-2 employee", () => {
    const fixture = makeInput({
      w2s: [{
        employer: { name: "SEPTA", ein: "23-1234567" },
        wages: "55000",
        federalWithheld: "7000",
        socialSecurityWages: "55000",
        socialSecurityWithheld: "3410",
        medicareWages: "55000",
        medicareWithheld: "798",
        stateWages: "55000",
        stateTaxWithheld: "1689",
        localTaxWithheld: "550",
        state: "PA",
      }],
    });

    it("maps all income to Class 1 compensation only", () => {
      const result = calculatePAReturn(fixture);
      expect(result.mappedIncome.compensation.toNumber()).toBe(55000);
      expect(result.mappedIncome.interest.toNumber()).toBe(0);
      expect(result.mappedIncome.dividends.toNumber()).toBe(0);
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(0);
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(0);
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(0);
      expect(result.mappedIncome.estateTrustIncome.toNumber()).toBe(0);
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(0);
    });

    it("computes correct tax at 3.07%", () => {
      const result = calculatePAReturn(fixture);
      // $55,000 × 3.07% = $1,688.50 → $1,689 (rounded)
      expect(result.pa40.taxLiability.toNumber()).toBe(1689);
    });

    it("computes correct refund with exact withholding match", () => {
      const result = calculatePAReturn(fixture);
      // Withholding $1,689 = tax $1,689 → $0 owed, $0 refund
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
      expect(result.pa40.overpayment.toNumber()).toBe(0);
    });

    it("has no tax forgiveness (income above threshold)", () => {
      const result = calculatePAReturn(fixture);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
      expect(result.pa40.taxForgivenessCredit.toNumber()).toBe(0);
    });

    it("extracts local withholding from W-2 Box 19", () => {
      const result = calculatePAReturn(fixture);
      expect(result.localWithholding.toNumber()).toBe(550);
    });
  });

  // =========================================================================
  // Scenario 2: MFJ dual-income couple with diverse income
  // =========================================================================
  describe("MFJ dual-income couple with diverse income", () => {
    const fixture = makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: { firstName: "Alice", lastName: "Chen", ssn: "111-22-3333", dateOfBirth: "1980-03-15" },
        spouse: { firstName: "Bob", lastName: "Chen", ssn: "444-55-6666", dateOfBirth: "1982-07-20" },
        address: { street: "200 Broad St", city: "Pittsburgh", state: "PA", zip: "15213" },
        dependents: [
          { firstName: "Child", lastName: "Chen", ssn: "777-88-9999", dateOfBirth: "2015-09-01", relationship: "child" },
        ],
      },
      w2s: [
        {
          employer: { name: "UPMC", ein: "25-1234567" },
          wages: "95000",
          federalWithheld: "15000",
          stateWages: "95000",
          stateTaxWithheld: "2917",
          state: "PA",
        },
        {
          employer: { name: "CMU", ein: "25-7654321" },
          wages: "72000",
          federalWithheld: "10000",
          stateWages: "72000",
          stateTaxWithheld: "2210",
          state: "PA",
        },
      ],
      form1099Int: [{ privateActivityBondInterest: "0",
        payer: "PNC Bank",
        interestIncome: "900",
        usSavingsBondInterest: "300",
        taxExemptInterest: "200",
      }],
      form1099Div: [{ exemptInterestDividends: "0", specifiedPrivateActivityBondInterest: "0",
        payer: "Vanguard",
        ordinaryDividends: "3500",
        qualifiedDividends: "2800",
        totalCapitalGainDistributions: "1500",
      }],
    });

    it("sums both W-2s to Class 1 compensation", () => {
      const result = calculatePAReturn(fixture);
      expect(result.mappedIncome.compensation.toNumber()).toBe(167000);
    });

    it("excludes US government interest from Class 2", () => {
      const result = calculatePAReturn(fixture);
      // Gross interest baseline: $1,200 federal interest + $200 tax-exempt add-back - $300 US gov = $1,100
      expect(result.mappedIncome.interest.toNumber()).toBe(1100);
      expect(result.exclusions.usGovInterest.toNumber()).toBe(300);
    });

    it("treats all dividends and mutual-fund capital gain distributions as Line 3 income", () => {
      const result = calculatePAReturn(fixture);
      expect(result.mappedIncome.dividends.toNumber()).toBe(5000);
    });

    it("does not route mutual-fund capital gain distributions to Class 5", () => {
      const result = calculatePAReturn(fixture);
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(0);
    });

    it("computes total PA taxable income from all classes", () => {
      const result = calculatePAReturn(fixture);
      // $167,000 + $1,100 + $5,000 = $173,100
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(173100);
    });

    it("computes correct combined tax", () => {
      const result = calculatePAReturn(fixture);
      // $173,100 × 3.07% = $5,314.17 → $5,314
      expect(result.pa40.taxLiability.toNumber()).toBe(5314);
    });

    it("combines withholding from both W-2s", () => {
      const result = calculatePAReturn(fixture);
      expect(result.stateWithholding.toNumber()).toBe(5127);
    });

    it("maps to married filing category for Schedule SP", () => {
      const result = calculatePAReturn(fixture);
      expect(result.scheduleSP.filingCategory).toBe("married");
    });

    it("includes tax-exempt interest and US gov interest in SP nontaxable income", () => {
      const result = calculatePAReturn(fixture);
      // Only the direct U.S. government interest is nontaxable; the $200 Box 8 amount is added back on PA Schedule A.
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(300);
    });

    it("computes overpayment when withholding covers most of tax", () => {
      const result = calculatePAReturn(fixture);
      // Tax $5,314 - withholding $5,127 = $187 owed
      expect(result.pa40.amountOwed.toNumber()).toBe(187);
      expect(result.pa40.overpayment.toNumber()).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 3: Self-employed contractor with Schedule C
  // =========================================================================
  describe("Self-employed contractor with Schedule C", () => {
    const fixture = makeInput({
      scheduleC: {
        businessName: "Freelance Consulting",
        principalBusinessCode: "541990",
        grossReceipts: "130000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
        expenses: {
          advertising: "1200",
          carAndTruck: "3000",
          contractLabor: "5000",
          depreciation: "2000",
          insurance: "4800",
          legalAndProfessional: "800",
          officeExpense: "1500",
          supplies: "600",
          travel: "2500",
          meals: "1000",
          utilities: "900",
          otherExpenses: "1200",
        },
      },
    });

    it("maps Schedule C net profit to Class 4 business income", () => {
      const result = calculatePAReturn(fixture);
      // $130,000 - ($1,200+$3,000+$5,000+$2,000+$4,800+$800+$1,500+$600+$2,500+$1,000+$900+$1,200) = $105,500
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(105500);
    });

    it("computes tax on self-employment income", () => {
      const result = calculatePAReturn(fixture);
      // $105,500 × 3.07% = $3,238.85 → $3,239
      expect(result.pa40.taxLiability.toNumber()).toBe(3239);
    });

    it("shows balance due with no withholding", () => {
      const result = calculatePAReturn(fixture);
      expect(result.pa40.amountOwed.toNumber()).toBe(3239);
    });

    it("computes REV-1630 penalty when no estimated payments made", () => {
      const result = calculatePAReturn(fixture, {
        quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
      });
      expect(result.rev1630).toBeDefined();
      expect(result.rev1630!.penaltyRequired).toBe(true);
      expect(result.rev1630!.totalInterest.gt(d(0))).toBe(true);
    });

    it("avoids penalty with sufficient estimated payments", () => {
      // Tax = $3,239; 90% = $2,915; per quarter = $729
      const result = calculatePAReturn(fixture, {
        estimatedPayments: d(3300),
        quarterlyEstimatedPayments: [d(825), d(825), d(825), d(825)],
      });
      expect(result.rev1630).toBeDefined();
      // Payments exceed 90%, so no underpayment
      expect(result.rev1630!.penaltyRequired).toBe(false);
    });
  });

  // =========================================================================
  // Scenario 4: Retiree with mixed 1099-R distributions
  // =========================================================================
  describe("Retiree with mixed 1099-R distributions", () => {
    const fixture = makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: { firstName: "Margaret", lastName: "Wilson", ssn: "222-33-4444", dateOfBirth: "1955-06-10" },
        address: { street: "300 Walnut St", city: "Harrisburg", state: "PA", zip: "17101" },
        dependents: [],
      },
      form1099R: [
        // Normal pension (code 7) — EXEMPT
        {
          payer: "PA SERS",
          grossDistribution: "48000",
          taxableAmount: "48000",
          distributionCode: "7",
          iraSepSimple: false,
        },
        // Qualified Roth IRA (code Q) — EXEMPT
        {
          payer: "Fidelity Roth",
          grossDistribution: "12000",
          distributionCode: "Q",
          iraSepSimple: true,
          qualifiedRothDistribution: true,
        },
        // Direct rollover (code G) — NOT INCOME
        {
          payer: "Old 401k",
          grossDistribution: "200000",
          distributionCode: "G",
          iraSepSimple: false,
        },
      ],
      formSSA1099: [{
        recipient: "Margaret Wilson",
        netBenefits: "22000",
      }],
      form1099Int: [{ privateActivityBondInterest: "0",
        payer: "Treasury Direct",
        interestIncome: "0",
        usSavingsBondInterest: "3000",
        taxExemptInterest: "0",
      }],
    });

    it("exempts normal pension distribution from tax", () => {
      const result = calculatePAReturn(fixture);
      // Code 7 pension: $48,000 exempt → $0 in compensation
      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
    });

    it("excludes rollover entirely from all income classes", () => {
      const result = calculatePAReturn(fixture);
      // Code G: $200,000 rollover → not income at all
      // No class should include it
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
    });

    it("excludes all US Treasury interest from PA tax", () => {
      const result = calculatePAReturn(fixture);
      // All $3,000 is US savings bond interest
      expect(result.mappedIncome.interest.toNumber()).toBe(0);
      expect(result.exclusions.usGovInterest.toNumber()).toBe(3000);
    });

    it("limits automatic SP nontaxable income to the includable nonretirement amounts", () => {
      const result = calculatePAReturn(fixture);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(3000);
    });

    it("has zero taxable income and zero tax", () => {
      const result = calculatePAReturn(fixture);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.pa40.taxLiability.toNumber()).toBe(0);
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
    });

    it("keeps Schedule SP eligibility low when only excluded retirement income remains", () => {
      const result = calculatePAReturn(fixture);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(3000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    });
  });

  // =========================================================================
  // Scenario 5: Investor with all 8 income classes populated
  // =========================================================================
  describe("Investor with all 8 income classes", () => {
    const fixture = makeInput({
      w2s: [{
        employer: { name: "Part-Time Corp", ein: "12-9999999" },
        wages: "30000",
        federalWithheld: "3000",
        stateWages: "30000",
        stateTaxWithheld: "921",
        state: "PA",
      }],
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0",
        payer: "Savings Bank",
        interestIncome: "4000",
        usSavingsBondInterest: "1000",
      }],
      form1099Div: [{ exemptInterestDividends: "0", specifiedPrivateActivityBondInterest: "0",
        payer: "Broker",
        ordinaryDividends: "8000",
        totalCapitalGainDistributions: "3000",
      }],
      scheduleC: {
        businessName: "Side Hustle",
        principalBusinessCode: "999999",
        grossReceipts: "20000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
        expenses: {
          advertising: "500",
          supplies: "300",
          otherExpenses: "200",
        },
      },
      form1099B: [{
        broker: "Brokerage",
        transactions: [
          { description: "Stock A", proceeds: "15000", costBasis: "10000", dateAcquired: "2023-01-15", dateSold: "2025-06-01" },
          { description: "Stock B", proceeds: "8000", costBasis: "12000", dateAcquired: "2024-06-01", dateSold: "2025-03-01" },
        ],
      }],
      rentalProperties: [{
        address: "123 Rental Ave",
        rents: "18000",
        advertising: "200",
        insurance: "1200",
        repairs: "800",
        taxes: "2000",
        mortgageInterest: "5000",
        depreciation: "3000",
        utilities: "0",
        otherExpenses: "0",
      }],
      formW2G: [
        { payer: "Casino", reportableWinnings: "2000", typeOfWager: "slots" },
        { payer: "PA Lottery", reportableWinnings: "500", typeOfWager: "lottery", state: "PA" },
      ],
      paScheduleJStatements: [{
        estateOrTrustName: "Family Trust",
        federalEIN: "12-3456789",
        sourceDocument: "pa_rk_1",
        incomeAmount: "4000",
      }],
    });

    it("maps all 8 income classes correctly", () => {
      const result = calculatePAReturn(fixture);

      // Class 1: $30,000 W-2
      expect(result.mappedIncome.compensation.toNumber()).toBe(30000);
      // Class 2: $5,000 - $1,000 US gov = $4,000
      expect(result.mappedIncome.interest.toNumber()).toBe(4000);
      // Class 3: $8,000 ordinary + $3,000 cap gain distributions = $11,000
      expect(result.mappedIncome.dividends.toNumber()).toBe(11000);
      // Class 4: $20,000 - $1,000 expenses = $19,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(19000);
      // Class 5: ($15,000-$10,000) + ($8,000-$12,000) = $1,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(1000);
      // Class 6: $18,000 - $12,200 expenses = $5,800
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(5800);
      // Class 7: $4,000 estate/trust
      expect(result.mappedIncome.estateTrustIncome.toNumber()).toBe(4000);
      // Class 8: PA lottery cash remains taxable, so full $2,500 is taxable
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(2500);
    });

    it("does not exclude PA Lottery cash winnings from Class 8", () => {
      const result = calculatePAReturn(fixture);
      expect(result.exclusions.paLotteryWinnings.toNumber()).toBe(0);
    });

    it("computes total taxable income as sum of all positive classes", () => {
      const result = calculatePAReturn(fixture);
      // $30,000 + $4,000 + $8,000 + $19,000 + $4,000 + $5,800 + $4,000 + $2,500 = $77,300
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(77300);
    });

    it("computes correct flat tax on diversified income", () => {
      const result = calculatePAReturn(fixture);
      // $77,300 × 3.07% = $2,373.11 → $2,373
      expect(result.pa40.taxLiability.toNumber()).toBe(2373);
    });

    it("includes only US gov interest in SP nontaxable income when the PA lottery prize is cash", () => {
      const result = calculatePAReturn(fixture);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(1000);
    });
  });

  // =========================================================================
  // Scenario 6: Low-income family with full tax forgiveness
  // =========================================================================
  describe("Low-income family with full tax forgiveness", () => {
    const fixture = makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: { firstName: "Maria", lastName: "Santos", ssn: "333-44-5555", dateOfBirth: "1990-02-28" },
        spouse: { firstName: "Jose", lastName: "Santos", ssn: "666-77-8888", dateOfBirth: "1991-11-15" },
        address: { street: "400 N Front St", city: "Reading", state: "PA", zip: "19601" },
        dependents: [
          { firstName: "Ana", lastName: "Santos", ssn: "111-11-0001", dateOfBirth: "2018-05-01", relationship: "child" },
          { firstName: "Luis", lastName: "Santos", ssn: "111-11-0002", dateOfBirth: "2020-08-15", relationship: "child" },
        ],
      },
      w2s: [{
        employer: { name: "Local Store", ein: "23-8888888" },
        wages: "28000",
        federalWithheld: "1200",
        stateWages: "28000",
        stateTaxWithheld: "860",
        state: "PA",
      }],
    });

    it("qualifies for 100% tax forgiveness", () => {
      const result = calculatePAReturn(fixture);
      // Married + 2 dependents: base $13,000 + 2×$9,500 = $32,000 threshold
      // Income $28,000 ≤ $32,000 → 100% forgiveness
      expect(result.scheduleSP.baseThreshold.toNumber()).toBe(32000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    });

    it("eliminates entire tax liability with forgiveness", () => {
      const result = calculatePAReturn(fixture);
      // Tax: $28,000 × 3.07% = $859.60 → $860
      expect(result.pa40.taxLiability.toNumber()).toBe(860);
      expect(result.pa40.taxForgivenessCredit.toNumber()).toBe(860);
      expect(result.pa40.netTaxLiability.toNumber()).toBe(0);
    });

    it("refunds all withholding when tax is fully forgiven", () => {
      const result = calculatePAReturn(fixture);
      // Tax forgiveness zeroes the tax liability, so the refund equals withholding.
      expect(result.pa40.overpayment.toNumber()).toBe(860);
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 7: Partial tax forgiveness at boundary
  // =========================================================================
  describe("Partial tax forgiveness at boundary", () => {
    it("gets 90% forgiveness at income exactly $250 above threshold", () => {
      // Unmarried, 0 dependents: base $6,500
      // Income = $6,750 → $250 above base → 90% forgiveness tier
      const fixture = makeInput({
        w2s: [{
          employer: "Job", wages: "6750", federalWithheld: "0",
          stateWages: "6750", stateTaxWithheld: "0", state: "PA",
        }],
      });
      const result = calculatePAReturn(fixture);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(90);
      // Tax: $6,750 × 3.07% = $207.23 → $207
      // Credit: $207 × 90% = $186.30 → $186
      expect(result.pa40.taxLiability.toNumber()).toBe(207);
      expect(result.pa40.taxForgivenessCredit.toNumber()).toBe(186);
    });

    it("gets 0% forgiveness at income $1 above top tier", () => {
      // Unmarried, 0 dependents: base $6,500 + 9×$250 = $8,750
      // Income = $8,751 → above all tiers → 0%
      const fixture = makeInput({
        w2s: [{
          employer: "Job", wages: "8751", federalWithheld: "0",
          stateWages: "8751", stateTaxWithheld: "0", state: "PA",
        }],
      });
      const result = calculatePAReturn(fixture);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
      expect(result.pa40.taxForgivenessCredit.toNumber()).toBe(0);
    });

    it("gets 20% forgiveness at income exactly $2,000 above base", () => {
      // Unmarried, 0 dependents: base $6,500 + 8×$250 = $8,500
      // Income = $8,500 → ≤ base + 8×$250 → (100 - 8×10) = 20%
      const fixture = makeInput({
        w2s: [{
          employer: "Job", wages: "8500", federalWithheld: "0",
          stateWages: "8500", stateTaxWithheld: "0", state: "PA",
        }],
      });
      const result = calculatePAReturn(fixture);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(20);
    });
  });

  // =========================================================================
  // Scenario 8: Multi-state worker with Schedule G-L credit
  // =========================================================================
  describe("Multi-state worker with Schedule G-L credit", () => {
    const fixture = makeInput({
      w2s: [
        // PA wages
        {
          employer: { name: "PA Corp", ein: "23-1111111" },
          wages: "60000",
          federalWithheld: "8000",
          stateWages: "60000",
          stateTaxWithheld: "1842",
          state: "PA",
        },
        // NJ wages are still taxable to a PA resident; only NJ withholding stays off PA Line 13
        {
          employer: { name: "NJ Corp", ein: "22-2222222" },
          wages: "40000",
          federalWithheld: "5000",
          stateWages: "40000",
          stateTaxWithheld: "1400",
          state: "NJ",
        },
      ],
      paScheduleGLStatements: [{
        stateCode: "NJ",
        incomeTaxableByBothStates: "40000",
        taxPaidToOtherState: "1400",
      }],
    });

    it("includes non-PA W-2 wages in resident compensation", () => {
      const result = calculatePAReturn(fixture);
      expect(result.mappedIncome.compensation.toNumber()).toBe(100000);
    });

    it("only counts PA withholding", () => {
      const result = calculatePAReturn(fixture);
      // Only PA withholding
      expect(result.stateWithholding.toNumber()).toBe(1842);
    });

    it("applies Schedule G-L resident credit from statement input", () => {
      const result = calculatePAReturn(fixture);
      // PA tax on $60,000 = $1,842
      // Schedule G-L credit limited by PA tax on NJ income proportion
      expect(result.scheduleGL.totalCredit.gt(d(0))).toBe(true);
      // Credit cannot exceed PA tax liability
      expect(result.pa40.residentCredit.lte(result.pa40.taxLiability)).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 9: Early IRA distribution (taxable retirement income)
  // =========================================================================
  describe("Early IRA distribution before retirement age", () => {
    const fixture = makeInput({
      w2s: [{
        employer: { name: "PA Employer", ein: "23-5555555" },
        wages: "45000",
        federalWithheld: "5000",
        stateWages: "45000",
        stateTaxWithheld: "1382",
        state: "PA",
      }],
      form1099R: [{
        payer: "Traditional IRA",
        grossDistribution: "10000",
        taxableAmount: "10000",
        distributionCode: "1",
        iraSepSimple: true,
      }],
    });

    it("taxes early IRA distribution as Class 2 interest", () => {
      const result = calculatePAReturn(fixture);
      // W-2: $45,000 → Class 1
      expect(result.mappedIncome.compensation.toNumber()).toBe(45000);
      // Early IRA (code 1, iraSepSimple): $10,000 → Class 2
      expect(result.mappedIncome.interest.toNumber()).toBe(10000);
    });

    it("computes tax on combined compensation + interest", () => {
      const result = calculatePAReturn(fixture);
      // Total: $45,000 + $10,000 = $55,000
      // Tax: $55,000 × 3.07% = $1,688.50 → $1,689
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(55000);
      expect(result.pa40.taxLiability.toNumber()).toBe(1689);
    });
  });

  // =========================================================================
  // Scenario 10: Early employer plan distribution (taxable as compensation)
  // =========================================================================
  describe("Early employer plan distribution", () => {
    const fixture = makeInput({
      form1099R: [{
        payer: "Former Employer 401k",
        grossDistribution: "25000",
        taxableAmount: "25000",
        distributionCode: "1",
        iraSepSimple: false,
        stateWithheld: "768",
        state: "PA",
      }],
    });

    it("taxes early 401k as Class 1 compensation", () => {
      const result = calculatePAReturn(fixture);
      expect(result.mappedIncome.compensation.toNumber()).toBe(25000);
      expect(result.mappedIncome.interest.toNumber()).toBe(0);
    });

    it("extracts 1099-R state withholding", () => {
      const result = calculatePAReturn(fixture);
      expect(result.stateWithholding.toNumber()).toBe(768);
    });

    it("computes correct refund or balance due", () => {
      const result = calculatePAReturn(fixture);
      // Tax: $25,000 × 3.07% = $767.50 → $768
      expect(result.pa40.taxLiability.toNumber()).toBe(768);
      // Withholding: $768 = tax → $0 owed
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 11: Loss limitation — losses in one class cannot offset another
  // =========================================================================
  describe("Loss limitation across income classes", () => {
    const fixture = makeInput({
      w2s: [{
        employer: "PA Job", wages: "80000", federalWithheld: "10000",
        stateWages: "80000", stateTaxWithheld: "2456", state: "PA",
      }],
      scheduleC: {
        businessName: "Failing Business",
        principalBusinessCode: "999999",
        grossReceipts: "5000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
        expenses: { otherExpenses: "15000" },
      },
      rentalProperties: [{
        address: "Loss Property",
        rents: "6000",
        repairs: "8000",
        taxes: "3000",
        insurance: "2000",
      }],
      form1099B: [{
        broker: "Broker",
        transactions: [
          { description: "Loss Stock", proceeds: "5000", costBasis: "20000", dateAcquired: "2024-01-01", dateSold: "2025-06-01" },
        ],
      }],
    });

    it("clamps negative business income to $0 in total", () => {
      const result = calculatePAReturn(fixture);
      // Business: $5,000 - $15,000 = -$10,000 (negative)
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(-10000);
      // But does NOT reduce total taxable income
    });

    it("clamps negative rental income to $0 in total", () => {
      const result = calculatePAReturn(fixture);
      // Rental: $6,000 - $13,000 = -$7,000
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(-7000);
    });

    it("clamps negative capital gains to $0 in total", () => {
      const result = calculatePAReturn(fixture);
      // Gains: $5,000 - $20,000 = -$15,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(-15000);
    });

    it("taxes only positive compensation — losses do NOT offset", () => {
      const result = calculatePAReturn(fixture);
      // Only Class 1 ($80,000) is positive
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(80000);
      // Tax: $80,000 × 3.07% = $2,456
      expect(result.pa40.taxLiability.toNumber()).toBe(2456);
    });
  });

  // =========================================================================
  // Scenario 12: PA Lottery cash winnings are taxable, casino winnings taxable
  // =========================================================================
  describe("Gambling income: PA Lottery cash vs casino taxable", () => {
    const fixture = makeInput({
      formW2G: [
        { payer: "PA Lottery", reportableWinnings: "50000", typeOfWager: "lottery", state: "PA" },
        { payer: "Parx Casino", reportableWinnings: "8000", typeOfWager: "slots", state: "PA" },
        { payer: "NJ Lottery", reportableWinnings: "3000", typeOfWager: "lottery", state: "NJ" },
      ],
    });

    it("does not exclude PA Lottery cash winnings", () => {
      const result = calculatePAReturn(fixture);
      expect(result.exclusions.paLotteryWinnings.toNumber()).toBe(0);
    });

    it("taxes PA Lottery cash, casino, and other-state lottery winnings", () => {
      const result = calculatePAReturn(fixture);
      // $50,000 PA lottery cash + $8,000 casino + $3,000 NJ lottery = $61,000 taxable gambling
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(61000);
    });

    it("does not include PA Lottery cash in SP nontaxable income", () => {
      const result = calculatePAReturn(fixture);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    });

    it("computes tax on all taxable gambling winnings", () => {
      const result = calculatePAReturn(fixture);
      // $61,000 × 3.07% = $1,872.70 → $1,873
      expect(result.pa40.taxLiability.toNumber()).toBe(1873);
    });
  });

  // =========================================================================
  // Scenario 13: Local EIT with nonresident credit
  // =========================================================================
  describe("Local EIT with nonresident credit", () => {
    const fixture = makeInput({
      w2s: [
        {
          employer: { name: "Philly Corp", ein: "23-3333333" },
          wages: "70000",
          federalWithheld: "9000",
          stateWages: "70000",
          stateTaxWithheld: "2149",
          localTaxWithheld: "700",
          state: "PA",
        },
      ],
    });

    it("computes local EIT with municipality rate", () => {
      const result = calculatePAReturn(fixture, {
        localMunicipality: "Lower Merion Township",
        localEITRate: d("0.01"),
      });
      expect(result.localEIT).toBeDefined();
      // Earned income = $70,000; rate = 1%
      expect(result.localEIT!.computedLocalTax.toNumber()).toBe(700);
    });

    it("applies nonresident credit for work municipality taxes paid", () => {
      const result = calculatePAReturn(fixture, {
        localMunicipality: "Lower Merion Township",
        localEITRate: d("0.015"),
        localNonresidentCredits: [{
          municipality: "Philadelphia",
          incomeInWorkMunicipality: d(70000),
          taxPaidToWorkMunicipality: d(700),
        }],
      });
      expect(result.localEIT).toBeDefined();
      // Credit from Philadelphia nonresident tax should reduce local EIT
      expect(result.localEIT!.netLocalTax.lt(result.localEIT!.computedLocalTax)).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 14: Schedule UE unreimbursed employee expenses
  // =========================================================================
  describe("Schedule UE unreimbursed employee expenses", () => {
    const fixture = makeInput({
      w2s: [{
        employer: { name: "PA Corp", ein: "23-4444444" },
        wages: "65000",
        federalWithheld: "8000",
        stateWages: "65000",
        stateTaxWithheld: "1996",
        state: "PA",
      }],
    });

    it("reduces compensation with detailed Schedule UE expenses", () => {
      const result = calculatePAReturn(fixture, {
        scheduleUE: {
          taxYear: 2025,
          vehicleExpenses: {
            milesDriven: 5000,
            businessMiles: 4000,
            commutingMiles: 500,
            otherMiles: 500,
            standardRate: d("0.70"),
          },
          travelExpenses: {
            lodging: d(1200),
            airfare: d(800),
            carRental: d(300),
            otherTransportation: d(200),
            mealsFiftyPercent: d(400),
          },
          otherExpenses: {
            tools: d(500),
            uniforms: d(300),
            education: d(1000),
            professionalDues: d(250),
            otherItemized: d(150),
          },
        },
      });
      expect(result.scheduleUE).toBeDefined();
      expect(result.scheduleUE!.netUnreimbursedExpenses.gt(d(0))).toBe(true);
      // Compensation reduced by UE expenses
      expect(result.pa40.netCompensation.lt(d(65000))).toBe(true);
      // UE expenses flow to PA-40 Line 1b
      expect(result.pa40.unreimbursedExpenses.toNumber()).toBe(
        result.scheduleUE!.netUnreimbursedExpenses.toNumber(),
      );
    });

    it("unreimbursed expenses cannot make compensation negative", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: "Low Pay", wages: "3000", federalWithheld: "0",
            stateWages: "3000", stateTaxWithheld: "0", state: "PA",
          }],
        }),
        { unreimbursedExpenses: d(5000) },
      );
      // $3,000 - $5,000 → clamped to $0
      expect(result.pa40.netCompensation.toNumber()).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 15: Schedule OC with PTE credit
  // =========================================================================
  describe("Schedule OC with PTE credit", () => {
    const fixture = makeInput({
      scheduleK1: [{
        entityName: "PA Partners LP",
        entityEIN: "23-6666666",
        entityType: "partnership",
        ordinaryIncome: "50000",
      }],
    });

    it("applies PTE credit to reduce PA tax", () => {
      const result = calculatePAReturn(fixture, {
        scheduleOC: {
          pteCredits: [{
            entityName: "PA Partners LP",
            entityEIN: "23-6666666",
            allocablePAIncome: d(50000),
            pteTaxPaid: d(1535),
          }],
        },
      });
      expect(result.scheduleOC).toBeDefined();
      expect(result.scheduleOC!.totalOtherCredits.toNumber()).toBe(1535);
      // K-1 ordinary → Class 4: $50,000
      // Tax: $50,000 × 3.07% = $1,535
      expect(result.pa40.taxLiability.toNumber()).toBe(1535);
      // PTE credit = $1,535 → net tax $0
      expect(result.pa40.otherCredits.toNumber()).toBe(1535);
      expect(result.pa40.netTaxLiability.toNumber()).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 16: K-1 income across multiple classes
  // =========================================================================
  describe("K-1 income across multiple classes", () => {
    const fixture = makeInput({
      scheduleK1: [{
        entityName: "Investment LP",
        entityEIN: "23-7777777",
        entityType: "partnership",
        ordinaryIncome: "15000",
        guaranteedPayments: "5000",
        interestIncome: "2000",
        ordinaryDividends: "3000",
        netShortTermCapitalGain: "4000",
        netLongTermCapitalGain: "8000",
        section1231Gain: "2000",
        netRentalIncome: "6000",
        royalties: "1000",
        isPassiveActivity: false,
      }],
      form4797: { nonrecapturedNetSection1231Losses: "0" },
      // Synthetic actual worksheet: $4,000 ST + $8,000 LT + $2,000
      // nonpassive section 1231 gain from an operating business, not a
      // financial-instrument trading business. Only that business gain is
      // excluded from NIIT. No partnership interest was sold. Spec: form-8960.yaml.
      form8960Sources: {
        sourceTaxYear: 2025,
        sourceReference: "PA multi-class fixture disposition worksheet",
        sourceFactsConfirmed: true,
        dispositions: {
          regularCapitalGainOrLoss: "14000",
          regularOrdinaryGainOrLoss: "0",
          excludedGainOrLossAdjustment: "-2000",
          passthroughAdjustment: "0",
        },
      },
    });

    it("routes K-1 income to correct PA classes", () => {
      const result = calculatePAReturn(fixture);
      // Class 2: $2,000 (K-1 interest)
      expect(result.mappedIncome.interest.toNumber()).toBe(2000);
      // Class 3: $3,000 (K-1 dividends)
      expect(result.mappedIncome.dividends.toNumber()).toBe(3000);
      // Class 4: $15,000 (ordinary) + $5,000 (guaranteed) = $20,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(20000);
      // Class 5: $4,000 (ST) + $8,000 (LT) + $2,000 (§1231) = $14,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(14000);
      // Class 6: $6,000 (rental) + $1,000 (royalties) = $7,000
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(7000);
    });

    it("computes correct total from K-1 mapped classes", () => {
      const result = calculatePAReturn(fixture);
      // $2,000 + $3,000 + $20,000 + $14,000 + $7,000 = $46,000
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(46000);
      // Tax: $46,000 × 3.07% = $1,412.20 → $1,412
      expect(result.pa40.taxLiability.toNumber()).toBe(1412);
    });
  });

  // =========================================================================
  // Scenario 17: Withholding from all document types
  // =========================================================================
  describe("Withholding from all document types combined", () => {
    const fixture = makeInput({
      w2s: [{
        employer: "PA Corp", wages: "50000", federalWithheld: "6000",
        stateWages: "50000", stateTaxWithheld: "1000", state: "PA",
      }],
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0",
        payer: "Bank",
        interestIncome: "5000",
        stateWithheld: "100",
        state: "PA",
      }],
      form1099Div: [{ exemptInterestDividends: "0", specifiedPrivateActivityBondInterest: "0",
        payer: "Broker",
        ordinaryDividends: "3000",
        stateWithheld: "75",
        state: "PA",
      }],
      form1099Misc: [{
        payer: "Royalties Inc",
        royalties: "2000",
        stateWithheld: "50",
        state: "PA",
      }],
      form1099R: [{
        payer: "Old 401k",
        grossDistribution: "8000",
        taxableAmount: "8000",
        distributionCode: "1",
        iraSepSimple: false,
        stateWithheld: "200",
        state: "PA",
      }],
      form1099G: [{
        payer: "PA DLI",
        unemploymentCompensation: "4000",
        stateWithheld: "80",
        state: "PA",
      }],
      form1099K: [{
        payer: "PayPal",
        grossAmount: "10000",
        incomeType: "business",
        stateWithheld: "150",
        state: "PA",
      }],
    });

    it("sums withholding from all PA document types", () => {
      const result = calculatePAReturn(fixture);
      // W-2: $1,000 + 1099-INT: $100 + 1099-DIV: $75 + 1099-MISC: $50
      // + 1099-R: $200 + 1099-G: $80 + 1099-K: $150 = $1,655
      expect(result.stateWithholding.toNumber()).toBe(1655);
    });

    it("excludes non-PA withholding", () => {
      const njFixture = makeInput({
        w2s: [{
          employer: "NJ Corp", wages: "50000", federalWithheld: "6000",
          stateWages: "50000", stateTaxWithheld: "2000", state: "NJ",
        }],
        form1099R: [{
          payer: "Old 401k",
          grossDistribution: "8000",
          distributionCode: "1",
          iraSepSimple: false,
          stateWithheld: "300",
          state: "NJ",
        }],
      });
      const result = calculatePAReturn(njFixture);
      // All NJ → $0 PA withholding
      expect(result.stateWithholding.toNumber()).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 18: Home sale with §121 exclusion
  // =========================================================================
  describe("Home sale with IRC §121 exclusion", () => {
    it("excludes $250K for single filer", () => {
      const fixture = makeInput({
        w2s: [{
          employer: "PA Corp", wages: "60000", federalWithheld: "8000",
          stateWages: "60000", stateTaxWithheld: "1842", state: "PA",
        }],
        homeSales: [{
          salePrice: "400000",
          purchasePrice: "200000",
          sellingExpenses: "20000",
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
        }],
      });
      const result = calculatePAReturn(fixture);
      // Gain = $400,000 - $200,000 - $20,000 = $180,000
      // §121 exclusion $250,000 → taxable = $0
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(0);
    });

    it("taxes gain exceeding $250K exclusion for single", () => {
      const fixture = makeInput({
        homeSales: [{
          salePrice: "600000",
          purchasePrice: "200000",
          sellingExpenses: "20000",
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
        }],
      });
      const result = calculatePAReturn(fixture);
      // Gain = $600,000 - $200,000 - $20,000 = $380,000
      // §121 exclusion $250,000 → taxable = $130,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(130000);
      // Tax: $130,000 × 3.07% = $3,991
      expect(result.pa40.taxLiability.toNumber()).toBe(3991);
    });
  });

  // =========================================================================
  // Scenario 19: Section 1256 contracts
  // =========================================================================
  describe("Section 1256 contracts — no 60/40 split for PA", () => {
    const fixture = makeInput({
      form6781: {
        section1256Gains: "25000",
        section1256Losses: "8000",
      },
    });

    it("routes net section 1256 to Class 5 at flat rate", () => {
      const result = calculatePAReturn(fixture);
      // Net: $25,000 - $8,000 = $17,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(17000);
      // Tax: $17,000 × 3.07% = $521.90 → $522
      expect(result.pa40.taxLiability.toNumber()).toBe(522);
    });
  });

  // =========================================================================
  // Scenario 20: Installment sale income
  // =========================================================================
  describe("Installment sale income", () => {
    const fixture = makeInput({
      form6252: [{
        description: "Land",
        propertyType: "other" as const,
        gainCharacter: "long_term_capital" as const,
        isYearOfSale: true,
        sellingPrice: "200000",
        costBasis: "100000",
        paymentsReceived: "50000",
      }],
    });

    it("maps installment sale gain to Class 5", () => {
      const result = calculatePAReturn(fixture);
      // All gain types flow to Class 5 for PA
      expect(result.mappedIncome.netGainOrLoss.gt(d(0))).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 21: Farm income via Schedule F
  // =========================================================================
  describe("Farm income via Schedule F", () => {
    const fixture = makeInput({
      scheduleF: {
        salesOfLivestock: "80000",
        cooperativeDistributions: "5000",
        agriculturePayments: "3000",
        cccLoans: "0",
        cropInsurance: "2000",
        customHireIncome: "1000",
        otherFarmIncome: "500",
        totalFarmExpenses: "60000",
      },
    });

    it("routes farm net profit to Class 4 business income", () => {
      const result = calculatePAReturn(fixture);
      // Schedule F runs its own calculation; net profit → Class 4
      expect(result.mappedIncome.netBusinessIncome.gt(d(0))).toBe(true);
    });

    it("computes tax on farm income at flat rate", () => {
      const result = calculatePAReturn(fixture);
      expect(result.pa40.taxLiability.gt(d(0))).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 22: MFS filing status
  // =========================================================================
  describe("Married filing separately", () => {
    const fixture = makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_separately",
        livedWithSpouseAtAnyTimeDuringYear: false,
        primary: { firstName: "Jane", lastName: "Doe", ssn: "555-66-7777", dateOfBirth: "1985-01-01" },
        spouse: { firstName: "John", lastName: "Doe", ssn: "555-66-8888", dateOfBirth: "1984-05-15" },
        address: { street: "500 Penn Ave", city: "Lancaster", state: "PA", zip: "17601" },
        dependents: [],
      },
      w2s: [{
        employer: "PA Corp", wages: "50000", federalWithheld: "6000",
        stateWages: "50000", stateTaxWithheld: "1535", state: "PA",
      }],
    });

    it("maps MFS to unmarried category for Schedule SP", () => {
      const result = calculatePAReturn(fixture);
      // Separated MFS follows the unmarried Schedule SP table.
      expect(result.scheduleSP.filingCategory).toBe("unmarried");
    });

    it("uses unmarried base threshold for forgiveness", () => {
      const result = calculatePAReturn(fixture);
      // Unmarried, 0 dependents: $6,500
      expect(result.scheduleSP.baseThreshold.toNumber()).toBe(6500);
    });
  });

  // =========================================================================
  // Scenario 23: 1099-NEC standalone (no Schedule C)
  // =========================================================================
  describe("1099-NEC without Schedule C", () => {
    const fixture = makeInput({
      form1099Nec: [
        { payer: "Client A", nonemployeeCompensation: "15000", federalWithheld: "0" },
        { payer: "Client B", nonemployeeCompensation: "8000", federalWithheld: "0" },
      ],
    });

    it("routes 1099-NEC to Class 4 business income", () => {
      const result = calculatePAReturn(fixture);
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(23000);
    });

    it("computes correct tax on standalone 1099-NEC", () => {
      const result = calculatePAReturn(fixture);
      // $23,000 × 3.07% = $706.10 → $706
      expect(result.pa40.taxLiability.toNumber()).toBe(706);
    });
  });

  // =========================================================================
  // Scenario 24: Combined scenario — realistic PA resident
  // =========================================================================
  describe("Realistic PA resident: W-2 + savings + investments + rental", () => {
    const fixture = makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: { firstName: "David", lastName: "Miller", ssn: "123-45-6789", dateOfBirth: "1975-08-20" },
        spouse: { firstName: "Sarah", lastName: "Miller", ssn: "987-65-4321", dateOfBirth: "1977-12-03" },
        address: { street: "600 Valley Rd", city: "Wayne", state: "PA", zip: "19087" },
        dependents: [
          { firstName: "Emma", lastName: "Miller", ssn: "111-22-0001", dateOfBirth: "2010-04-15", relationship: "child" },
          { firstName: "Jake", lastName: "Miller", ssn: "111-22-0002", dateOfBirth: "2013-09-20", relationship: "child" },
          { firstName: "Lily", lastName: "Miller", ssn: "111-22-0003", dateOfBirth: "2016-01-08", relationship: "child" },
        ],
      },
      w2s: [{
        employer: { name: "Comcast", ein: "27-0000001" },
        wages: "145000",
        federalWithheld: "25000",
        stateWages: "145000",
        stateTaxWithheld: "4452",
        localTaxWithheld: "1450",
        state: "PA",
      }],
      form1099Int: [
        { taxExemptInterest: "0", privateActivityBondInterest: "0", payer: "PNC Savings", interestIncome: "850" },
        { taxExemptInterest: "0", privateActivityBondInterest: "0", payer: "Treasury Direct", interestIncome: "0", usSavingsBondInterest: "2000" },
      ],
      form1099Div: [{ exemptInterestDividends: "0", specifiedPrivateActivityBondInterest: "0",
        payer: "Vanguard Total Market",
        ordinaryDividends: "4200",
        qualifiedDividends: "3500",
        totalCapitalGainDistributions: "2800",
      }],
      form1099B: [{
        broker: "Schwab",
        transactions: [
          { description: "AAPL", proceeds: "30000", costBasis: "22000", dateAcquired: "2022-03-01", dateSold: "2025-10-15" },
        ],
      }],
      rentalProperties: [{
        address: "123 Rental Rd, Malvern PA",
        rents: "24000",
        insurance: "1800",
        repairs: "1200",
        taxes: "3600",
        mortgageInterest: "8400",
        depreciation: "4500",
        utilities: "0",
        otherExpenses: "500",
      }],
      formSSA1099: [{
        recipient: "David Miller",
        netBenefits: "0",
      }],
    });

    it("maps income to correct PA classes", () => {
      const result = calculatePAReturn(fixture);
      // Class 1: $145,000
      expect(result.mappedIncome.compensation.toNumber()).toBe(145000);
      // Class 2: $850 + $2,000 - $2,000 (US gov) = $850
      expect(result.mappedIncome.interest.toNumber()).toBe(850);
      // Class 3: $4,200 ordinary + $2,800 cap gain distributions = $7,000
      expect(result.mappedIncome.dividends.toNumber()).toBe(7000);
      // Class 5: ($30,000-$22,000) = $8,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(8000);
      // Class 6: $24,000 - ($1,800+$1,200+$3,600+$8,400+$4,500+$500) = $4,000
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(4000);
    });

    it("computes correct total and tax", () => {
      const result = calculatePAReturn(fixture);
      // Total: $145,000 + $850 + $7,000 + $8,000 + $4,000 = $164,850
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(164850);
      // Tax: $164,850 × 3.07% = $5,060.90 → $5,061
      expect(result.pa40.taxLiability.toNumber()).toBe(5061);
    });

    it("no forgiveness for high-income married with 3 kids", () => {
      const result = calculatePAReturn(fixture);
      // Married + 3 deps: $13,000 + 3×$9,500 = $41,500 threshold
      // Income $164,850 >> $41,500 → 0%
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
    });

    it("computes correct refund or balance due", () => {
      const result = calculatePAReturn(fixture);
      // Tax $5,061 - withholding $4,452 = $609 owed
      expect(result.pa40.amountOwed.toNumber()).toBe(609);
    });

    it("correct local withholding extracted", () => {
      const result = calculatePAReturn(fixture);
      expect(result.localWithholding.toNumber()).toBe(1450);
    });
  });

  // =========================================================================
  // Scenario 25: RRB-1099 in SP nontaxable income
  // =========================================================================
  describe("Railroad retirement in SP nontaxable income", () => {
    const fixture = makeInput({
      w2s: [{
        employer: "Part-Time", wages: "5000", federalWithheld: "0",
        stateWages: "5000", stateTaxWithheld: "0", state: "PA",
      }],
      formRRB1099: [{
        recipient: "Retiree",
        netSocialSecurityEquivalentBenefitPortion: "18000",
      }],
    });

    it("excludes RRB-1099 from automatic nontaxable income for SP", () => {
      const result = calculatePAReturn(fixture);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(5000);
    });

    it("RRB does not appear in any taxable income class", () => {
      const result = calculatePAReturn(fixture);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(5000);
    });
  });

  // =========================================================================
  // Scenario 26: Other deductions (IRC §529 contributions)
  // =========================================================================
  describe("Other deductions reduce taxable income", () => {
    const fixture = makeInput({
      w2s: [{
        employer: "PA Corp", wages: "75000", federalWithheld: "10000",
        stateWages: "75000", stateTaxWithheld: "2303", state: "PA",
      }],
    });

    it("529 contributions reduce adjusted taxable income", () => {
      const result = calculatePAReturn(fixture, {
        otherDeductions: d(10000),
      });
      // Total taxable: $75,000; deductions: $10,000; adjusted: $65,000
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(75000);
      expect(result.pa40.adjustedPATaxableIncome.toNumber()).toBe(65000);
      // Tax: $65,000 × 3.07% = $1,995.50 → $1,996
      expect(result.pa40.taxLiability.toNumber()).toBe(1996);
    });

    it("deductions cannot make adjusted income negative", () => {
      const result = calculatePAReturn(fixture, {
        otherDeductions: d(100000),
      });
      expect(result.pa40.adjustedPATaxableIncome.toNumber()).toBe(0);
      expect(result.pa40.taxLiability.toNumber()).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 27: Credits interaction ordering
  // =========================================================================
  describe("Credits interaction: forgiveness + resident + other", () => {
    const fixture = makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: { firstName: "Low", lastName: "Income", ssn: "111-00-0001", dateOfBirth: "1985-01-01" },
        spouse: { firstName: "Also", lastName: "Low", ssn: "111-00-0002", dateOfBirth: "1986-01-01" },
        address: { street: "1 Main", city: "Scranton", state: "PA", zip: "18501" },
        dependents: [],
      },
      w2s: [{
        employer: "Job", wages: "14000", federalWithheld: "500",
        stateWages: "14000", stateTaxWithheld: "430", state: "PA",
      }],
    });

    it("forgiveness + resident credit + other credits all reduce tax", () => {
      const result = calculatePAReturn(fixture, {
        otherStateCredits: [{
          stateCode: "NJ",
          incomeTaxableByBothStates: d(5000),
          taxPaidToOtherState: d(200),
        }],
        otherCredits: d(50),
      });
      // Tax: $14,000 × 3.07% = $429.80 → $430
      expect(result.pa40.taxLiability.toNumber()).toBe(430);
      // Married + 0 deps: base $13,000
      // Income $14,000 → $1,000 above → 4 tiers above = 60% forgiveness
      // Schedule SP first subtracts $200 tax paid to NJ, leaving $230.
      // Forgiveness credit: $230 × 60% = $138
      expect(result.pa40.taxForgivenessCredit.toNumber()).toBe(138);
      expect(result.pa40.residentCredit.toNumber()).toBe(154);
      // Total credits = $138 forgiveness + $154 resident + $50 other = $342
      expect(result.pa40.totalCredits.toNumber()).toBe(342);
      expect(result.pa40.netTaxLiability.toNumber()).toBe(88);
    });
  });

  // =========================================================================
  // Scenario 28: Unemployment compensation excluded from PA taxable income
  // =========================================================================
  describe("Unemployment compensation excluded from PA taxable income", () => {
    const fixture = makeInput({
      w2s: [{
        employer: "Former Job", wages: "20000", federalWithheld: "2000",
        stateWages: "20000", stateTaxWithheld: "614", state: "PA",
      }],
      form1099G: [{
        payer: "PA DLI",
        unemploymentCompensation: "8000",
        stateWithheld: "246",
        state: "PA",
      }],
    });

    it("does not add unemployment to compensation", () => {
      const result = calculatePAReturn(fixture);
      expect(result.mappedIncome.compensation.toNumber()).toBe(20000);
    });

    it("includes UC state withholding", () => {
      const result = calculatePAReturn(fixture);
      // W-2: $614 + 1099-G: $246 = $860
      expect(result.stateWithholding.toNumber()).toBe(860);
    });

    it("computes tax on wages only while still counting UC withholding", () => {
      const result = calculatePAReturn(fixture);
      expect(result.pa40.taxLiability.toNumber()).toBe(614);
      expect(result.pa40.overpayment.toNumber()).toBe(246);
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
    });
  });
});
