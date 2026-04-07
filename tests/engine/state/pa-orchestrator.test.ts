/**
 * Tests for Pennsylvania Personal Income Tax Return Orchestrator
 * Spec: spec/state/pa-orchestrator.yaml
 *
 * Maps TaxYearInput (W-2s, 1099s, etc.) to PA's 8 income classes,
 * then orchestrates PA-40, Schedule SP, and Schedule G-L.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculatePAReturn, type PAOrchestratorOverrides } from "@/engine/state/pa-orchestrator.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

/** Minimal TaxYearInput with defaults */
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

describe.sequential("Pennsylvania PA Orchestrator", () => {
  // =================================================================
  // Income Class Mapping
  // =================================================================

  describe.sequential("Income Class Mapping", () => {
    it("PA orchestrator maps W-2 wages to compensation", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "75000",
          federalWithheld: "10000",
          stateWages: "75000",
          stateTaxWithheld: "2303",
          state: "PA",
        }],
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(75000);
      expect(result.stateWithholding.toNumber()).toBe(2303);
    });

    it("PA orchestrator uses W-2 Box 16 (stateWages) when available", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "80000", // Box 1
          federalWithheld: "10000",
          stateWages: "75000", // Box 16 — PA state wages may differ
          stateTaxWithheld: "2303",
          state: "PA",
        }],
      }));
      // Should use Box 16 ($75K), not Box 1 ($80K)
      expect(result.mappedIncome.compensation.toNumber()).toBe(75000);
    });

    it("PA orchestrator falls back to Box 1 when stateWages is zero", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "60000",
          federalWithheld: "8000",
          stateWages: "0",
          stateTaxWithheld: "1842",
          state: "PA",
        }],
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(60000);
    });

    it("PA orchestrator includes non-PA W-2 wages in resident compensation", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [
          {
            employer: { name: "PA Corp", ein: "12-3456789" },
            wages: "50000",
            federalWithheld: "7000",
            stateWages: "50000",
            stateTaxWithheld: "1535",
            state: "PA",
          },
          {
            employer: { name: "NJ Corp", ein: "98-7654321" },
            wages: "30000",
            federalWithheld: "4000",
            stateWages: "30000",
            stateTaxWithheld: "1200",
            state: "NJ",
          },
        ],
      }));
      // PA residents report both PA and NJ wages on the PA return.
      expect(result.mappedIncome.compensation.toNumber()).toBe(80000);
      // Only PA withholding
      expect(result.stateWithholding.toNumber()).toBe(1535);
    });

    it("PA orchestrator uses Box 1 for non-PA W-2s instead of the other state's Box 16", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "NJ Corp", ein: "98-7654321" },
          wages: "42000",
          federalWithheld: "5000",
          stateWages: "45000",
          stateTaxWithheld: "1500",
          state: "NJ",
        }],
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(42000);
      expect(result.stateWithholding.toNumber()).toBe(0);
    });

    it("PA orchestrator reconstructs non-PA W-2 compensation by adding PA-taxable deferrals back to Box 1", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "NJ Corp", ein: "98-7654321" },
          wages: "42000",
          federalWithheld: "5000",
          stateWages: "45000",
          stateTaxWithheld: "1500",
          state: "NJ",
          box12CodeD: "3000",
        }],
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(45000);
      expect(result.stateWithholding.toNumber()).toBe(0);
    });

    it("PA orchestrator includes W-2 with no state (assumed resident)", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "65000",
          federalWithheld: "9000",
          stateTaxWithheld: "1996",
          // no state field
        }],
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(65000);
      expect(result.stateWithholding.toNumber()).toBe(1996);
    });

    it("PA orchestrator reconstructs compensation from Box 1 when PA Box 16 is unavailable", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "58000",
          federalWithheld: "7000",
          stateWages: "0",
          stateTaxWithheld: "1878",
          state: "PA",
          box12CodeD: "4000",
          box12CodeS: "1000",
        }],
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(63000);
      expect(result.stateWithholding.toNumber()).toBe(1878);
    });

    it("PA orchestrator excludes resident active-duty military wages earned outside Pennsylvania from compensation", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "US Army", ein: "12-3456789" },
          wages: "52000",
          federalWithheld: "4000",
          stateWages: "52000",
          stateTaxWithheld: "600",
          state: "PA",
          militaryService: {
            activeDuty: true,
            dutyState: "AE",
          },
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.stateWithholding.toNumber()).toBe(600);
    });

    it("PA orchestrator adds excluded active-duty military wages to Schedule SP eligibility income", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "US Army", ein: "12-3456789" },
          wages: "52000",
          federalWithheld: "4000",
          stateWages: "52000",
          stateTaxWithheld: "600",
          state: "PA",
          militaryService: {
            activeDuty: true,
            dutyState: "AE",
          },
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(52000);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(52000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
    });

    it("PA orchestrator keeps excluded combat-zone or hazardous-duty military wages out of Schedule SP eligibility income", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "US Army", ein: "12-3456789" },
          wages: "52000",
          federalWithheld: "4000",
          stateWages: "52000",
          stateTaxWithheld: "600",
          state: "PA",
          militaryService: {
            activeDuty: true,
            dutyState: "AE",
            combatOrHazardousDutyPay: true,
          },
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    });

    it("PA orchestrator maps 1099-MISC nonqualified deferred compensation to compensation", () => {
      const result = calculatePAReturn(makeInput({
        form1099Misc: [{
          payer: "Deferred Comp Administrator",
          nonqualifiedDeferredComp: "12500",
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(12500);
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator keeps 1099-MISC nonqualified deferred compensation in Class 1 while rents and royalties stay in Class 6", () => {
      const result = calculatePAReturn(makeInput({
        form1099Misc: [{
          payer: "Mixed Statement",
          rents: "4000",
          royalties: "600",
          nonqualifiedDeferredComp: "9000",
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(9000);
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(4600);
    });

    it("PA orchestrator maps 1099-INT to interest", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [
          { payer: "Bank A", interestIncome: "1500" },
          { payer: "Bank B", interestIncome: "800" },
        ],
      }));
      expect(result.mappedIncome.interest.toNumber()).toBe(2300);
    });

    it("PA orchestrator maps 1099-DIV to dividends", () => {
      const result = calculatePAReturn(makeInput({
        form1099Div: [
          { payer: "Fund A", ordinaryDividends: "3000" },
          { payer: "Fund B", ordinaryDividends: "2000", qualifiedDividends: "1500" },
        ],
      }));
      // PA taxes all dividends equally — uses ordinaryDividends (Box 1a)
      expect(result.mappedIncome.dividends.toNumber()).toBe(5000);
    });

    it("PA orchestrator maps Schedule C to business income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleC: {
          grossReceipts: "120000",
          returnsAndAllowances: "0",
          costOfGoodsSold: "0",
          expenses: {
            advertising: "2000",
            carAndTruck: "5000",
            contractLabor: "10000",
            depreciation: "3000",
            insurance: "1500",
            legalAndProfessional: "0",
            officeExpense: "1000",
            supplies: "500",
            travel: "2000",
            meals: "1000",
            utilities: "800",
            otherExpenses: "200",
          },
        },
      }));
      // $120,000 - $27,000 expenses = $93,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(93000);
    });

    it("PA orchestrator includes Schedule C other income in Class 4 business income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleC: {
          grossReceipts: "4000",
          costOfGoodsSold: "1000",
          otherIncome: "1251",
        },
      }));

      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(4251);
    });

    it("PA orchestrator maps additional PA Schedule C printed expense lines into Class 4 business income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleC: {
          grossReceipts: "10000",
          expenses: {
            businessInterest: "500",
            pensionAndProfitSharing: "700",
            taxes: "900",
            telephone: "300",
            wages: "2000",
          },
        },
      }));

      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(5600);
    });

    it("PA orchestrator maps newly supported PA Schedule C employee and property deduction lines into Class 4 business income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleC: {
          grossReceipts: "10000",
          expenses: {
            commissionsAndFees: "110.50",
            depletion: "120.49",
            employeeBenefitPrograms: "150.50",
            rentOnBusinessProperty: "250.50",
            repairsAndMaintenance: "260.49",
          },
        },
      }));

      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(9107);
    });

    it("PA orchestrator maps newly supported PA Schedule C amortization, postage, and IDC/start-up deduction lines into Class 4 business income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleC: {
          grossReceipts: "10000",
          expenses: {
            amortization: "50",
            duesAndPublications: "40",
            postage: "30",
            idcsCurrentExpensing: "300",
            idcsAmortization: "200",
            startupCostsDirectExpense: "100",
          },
        },
      } as Partial<TaxYearInput>));

      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(9280);
    });

    it("PA orchestrator maps actual home-office costs from Schedule C into Class 4 business income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleC: {
          grossReceipts: "50000",
          expenses: {
            otherExpenses: "500",
          },
          homeOffice: {
            method: "actual",
            actualAmount: "2500",
          },
        },
      }));

      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(47000);
    });

    it("PA orchestrator maps 1099-NEC to business income when no Schedule C", () => {
      const result = calculatePAReturn(makeInput({
        form1099Nec: [
          { payer: "Client A", nonemployeeCompensation: "25000" },
          { payer: "Client B", nonemployeeCompensation: "15000" },
        ],
      }));
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(40000);
    });

    it("PA orchestrator carries only the positive spouse Class 4 amount to PA-40 Line 4 on joint returns", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "married_filing_jointly",
          primary: {
            firstName: "Alex",
            lastName: "Filer",
            ssn: "000-00-0001",
            dateOfBirth: "1985-01-01",
          },
          spouse: {
            firstName: "Jamie",
            lastName: "Filer",
            ssn: "000-00-0002",
            dateOfBirth: "1986-02-02",
          },
          address: {
            street: "100 Main St",
            city: "Philadelphia",
            state: "PA",
            zip: "19101",
          },
          dependents: [],
        },
        scheduleC: {
          accountHolder: "primary",
          grossReceipts: "5000",
          expenses: {
            contractLabor: "25000",
          },
        },
        scheduleF: {
          accountHolder: "spouse",
          salesOfProductsRaised: "20000",
          expenses: {
            feed: "5000",
          },
        },
        scheduleK1: [
          {
            partnershipName: "Primary Ventures LLC",
            partnershipEIN: "11-1111111",
            accountHolder: "primary",
            ordinaryIncome: "3000",
            guaranteedPayments: "0",
            entityType: "partnership",
            foreignTaxCategory: "general",
            section199AIsSST: false,
            section199APTPIsSST: false,
            isPassiveActivity: false,
            isPubliclyTradedPartnership: false,
            ptpFullyDisposedInTaxableTransaction: false,
            isForeignPartnership: false,
          },
        ],
        paPassThroughStatements: [
          {
            entityName: "Spouse Services Inc",
            entityEIN: "22-2222222",
            accountHolder: "spouse",
            sourceDocument: "pa_rk_1",
            businessIncome: "4000",
          },
        ],
      }));

      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(19000);
      expect(result.pa40.netBusinessIncome.toNumber()).toBe(19000);
      expect(result.scheduleF?.line39.toNumber()).toBe(15000);
    });

    it("PA orchestrator maps 1099-B to net gains", () => {
      const result = calculatePAReturn(makeInput({
        form1099B: [{
          broker: "Fidelity",
          transactions: [
            {
              description: "AAPL",
              dateAcquired: "2020-01-15",
              dateSold: "2025-06-01",
              proceeds: "20000",
              costBasis: "10000",
              holdingPeriod: "long",
            },
            {
              description: "MSFT",
              dateAcquired: "2025-01-15",
              dateSold: "2025-03-01",
              proceeds: "5000",
              costBasis: "6000",
              holdingPeriod: "short",
            },
          ],
        }],
      }));
      // AAPL: $20K - $10K = $10K gain
      // MSFT: $5K - $6K = -$1K loss
      // Total net: $9,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(9000);
    });

    it("PA orchestrator carries only the positive spouse Schedule D amount to PA-40 Line 5 on joint returns", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "married_filing_jointly",
          primary: {
            firstName: "Alex",
            lastName: "Filer",
            ssn: "000-00-0001",
            dateOfBirth: "1985-01-01",
          },
          spouse: {
            firstName: "Jamie",
            lastName: "Filer",
            ssn: "000-00-0002",
            dateOfBirth: "1986-02-02",
          },
          address: {
            street: "100 Main St",
            city: "Philadelphia",
            state: "PA",
            zip: "19101",
          },
          dependents: [],
        },
        form1099B: [{
          broker: "Schwab",
          accountHolder: "primary",
          transactions: [{
            description: "NVDA",
            dateAcquired: "2024-01-01",
            dateSold: "2025-06-15",
            proceeds: "20000",
            costBasis: "10000",
            adjustments: "0",
            holdingPeriod: "long",
          }],
        }],
        form6781: {
          accountHolder: "spouse",
          section1256Gains: "0",
          section1256Losses: "7000",
        },
        paPassThroughStatements: [{
          entityName: "Joint Ventures LP",
          entityEIN: "55-5555555",
          sourceDocument: "pa_rk_1",
          businessIncome: "0",
          netGainOrLoss: "2000",
        }],
      }));

      expect(result.scheduleD).toBeDefined();
      expect(result.scheduleD!.taxpayerLine12.toNumber()).toBe(11000);
      expect(result.scheduleD!.spouseLine12.toNumber()).toBe(-6000);
      expect(result.scheduleD!.line12.toNumber()).toBe(5000);
      expect(result.scheduleD!.reportableNetGainOrLoss.toNumber()).toBe(11000);
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(11000);
      expect(result.pa40.netGainOrLoss.toNumber()).toBe(11000);
    });

    it("PA orchestrator maps 1099-DIV capital gain distributions to dividends instead of net gains", () => {
      const result = calculatePAReturn(makeInput({
        form1099Div: [{
          payer: "Vanguard Fund",
          ordinaryDividends: "2000",
          totalCapitalGainDistributions: "5000",
        }],
      }));
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(0);
      expect(result.mappedIncome.dividends.toNumber()).toBe(7000);
    });

    it("PA orchestrator computes dividends through PA Schedule B and taxes federally exempt out-of-state bond dividends", () => {
      const result = calculatePAReturn(makeInput({
        form1099Div: [{
          payer: "National Municipal Fund",
          ordinaryDividends: "100",
          exemptInterestDividends: "80",
          totalCapitalGainDistributions: "20",
        }],
        paResidentReturn: {
          scheduleB: {
            paExemptInterestDividends: "30",
            reductionAdjustments: [
              { description: "Part-year nonresident period", amount: "10" },
            ],
            additionAdjustments: [
              { description: "Nominee capital gains distribution", amount: "5" },
            ],
          },
        },
      }));

      expect(result.scheduleB!.line3.toNumber()).toBe(30);
      expect(result.scheduleB!.line4.toNumber()).toBe(10);
      expect(result.scheduleB!.line7.toNumber()).toBe(80);
      expect(result.scheduleB!.line8.toNumber()).toBe(5);
      expect(result.scheduleB!.line10.toNumber()).toBe(20);
      expect(result.scheduleB!.line12.toNumber()).toBe(165);
      expect(result.mappedIncome.dividends.toNumber()).toBe(165);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(30);
    });

    it("PA orchestrator defaults Schedule B Line 3 from Form 1099-DIV Pennsylvania exemption allocations", () => {
      const result = calculatePAReturn(makeInput({
        form1099Div: [{
          payer: "National Municipal Fund",
          ordinaryDividends: "100",
          exemptInterestDividends: "80",
          totalCapitalGainDistributions: "20",
          paExemptInterestDividendAllocation: "30",
        }],
      }));

      expect(result.scheduleB).toBeDefined();
      expect(result.scheduleB!.line3.toNumber()).toBe(30);
      expect(result.scheduleB!.line7.toNumber()).toBe(80);
      expect(result.scheduleB!.line10.toNumber()).toBe(20);
      expect(result.scheduleB!.line12.toNumber()).toBe(170);
      expect(result.mappedIncome.dividends.toNumber()).toBe(170);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(30);
    });

    it("PA orchestrator lets explicit Schedule B Line 3 override the derived Form 1099-DIV allocation", () => {
      const result = calculatePAReturn(makeInput({
        form1099Div: [{
          payer: "National Municipal Fund",
          ordinaryDividends: "100",
          exemptInterestDividends: "80",
          totalCapitalGainDistributions: "20",
          paExemptInterestDividendAllocation: "30",
        }],
        paResidentReturn: {
          scheduleB: {
            paExemptInterestDividends: "15",
          },
        },
      }));

      expect(result.scheduleB).toBeDefined();
      expect(result.scheduleB!.line3.toNumber()).toBe(15);
      expect(result.scheduleB!.line12.toNumber()).toBe(185);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(15);
    });

    it("PA orchestrator maps rental properties to rental income", () => {
      const result = calculatePAReturn(makeInput({
        rentalProperties: [{
          description: "123 Main St",
          rents: "24000",
          insurance: "1200",
          mortgageInterest: "8000",
          taxes: "3000",
          repairs: "2000",
          depreciation: "5000",
        }],
      }));
      // $24,000 - ($1,200 + $8,000 + $3,000 + $2,000 + $5,000) = $4,800
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(4800);
    });

    it("PA orchestrator routes supported short-term rentals under 30 days to business income", () => {
      const result = calculatePAReturn(makeInput({
        rentalProperties: [{
          description: "Pocono cabin",
          propertyType: "vacation",
          rents: "9000",
          advertising: "500",
          cleaning: "600",
          insurance: "300",
          repairs: "400",
          utilities: "200",
          rentalDays: 14,
          personalUseDays: 20,
          isActiveParticipant: true,
          qualifiesForQBI: false,
        }],
      }));

      // Net short-term rental: $9,000 - ($500 + $600 + $300 + $400 + $200) = $7,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(7000);
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(0);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(7000);
    });

    it("PA orchestrator maps PA Schedule J statements to estate/trust income", () => {
      const result = calculatePAReturn(makeInput({
        paScheduleJStatements: [
          {
            estateOrTrustName: "Alpha Family Trust",
            federalEIN: "11-1111111",
            sourceDocument: "pa_rk_1",
            incomeAmount: "1500",
          },
          {
            estateOrTrustName: "Decedent Estate",
            federalEIN: "22-2222222",
            sourceDocument: "federal_1041_k1",
            incomeAmount: "2500",
          },
          {
            estateOrTrustName: "Loss Trust",
            federalEIN: "33-3333333",
            sourceDocument: "pa_nrk_1",
            incomeAmount: "-500",
          },
        ],
      }));
      expect(result.scheduleJ?.totalEstateTrustIncome.toNumber()).toBe(4000);
      expect(result.mappedIncome.estateTrustIncome.toNumber()).toBe(4000);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(4000);
    });

    it("PA orchestrator uses PA Schedule J statements instead of the estate/trust override", () => {
      const result = calculatePAReturn(
        makeInput({
          paScheduleJStatements: [{
            estateOrTrustName: "Alpha Family Trust",
            federalEIN: "11-1111111",
            sourceDocument: "pa_rk_1",
            incomeAmount: "2200",
          }],
        }),
        { estateTrustIncome: d(9999) },
      );
      expect(result.mappedIncome.estateTrustIncome.toNumber()).toBe(2200);
    });

    it("PA orchestrator maps supported NRK-1 withholding to PA-40 Line 17", () => {
      const result = calculatePAReturn(makeInput({
        paPassThroughStatements: [
          {
            entityName: "Alpha Partners LP",
            entityEIN: "44-4444444",
            sourceDocument: "pa_nrk_1",
            businessIncome: "12000",
            netGainOrLoss: "0",
            netRentalIncome: "0",
            estateTrustIncome: "0",
            gamblingIncome: "0",
            nonresidentTaxWithheld: "307",
          },
          {
            entityName: "Beta S Corp",
            entityEIN: "55-5555555",
            sourceDocument: "pa_rk_1",
            businessIncome: "8000",
            interestIncome: "120",
            dividendIncome: "45",
            netGainOrLoss: "0",
            netRentalIncome: "0",
            estateTrustIncome: "0",
            gamblingIncome: "0",
            nonresidentTaxWithheld: "999",
          },
        ],
        paScheduleJStatements: [
          {
            estateOrTrustName: "Alpha Family Trust",
            federalEIN: "11-1111111",
            sourceDocument: "pa_nrk_1",
            incomeAmount: "22000",
            nonresidentTaxWithheld: "68",
          },
          {
            estateOrTrustName: "Beta Resident Trust",
            federalEIN: "22-2222222",
            sourceDocument: "pa_rk_1",
            incomeAmount: "8000",
            nonresidentTaxWithheld: "999",
          },
        ],
      }));

      expect(result.scheduleRK1?.totalNonresidentTaxWithheld.toNumber()).toBe(307);
      expect(result.scheduleJ?.totalEstateTrustIncome.toNumber()).toBe(30000);
      expect(result.scheduleJ?.totalNonresidentTaxWithheld.toNumber()).toBe(68);
      expect(result.scheduleSP.taxForgivenessCredit.toNumber()).toBe(0);
      expect(result.pa40.nonresidentTaxWithheld.toNumber()).toBe(375);
      expect(result.pa40.totalPayments.toNumber()).toBe(375);
      expect(result.pa40.overpayment.toNumber()).toBe(0);
      expect(result.pa40.amountOwed.toNumber()).toBe(1165);
    });

    it("PA orchestrator lets explicit nonresident withholding override Schedule J statement withholding", () => {
      const result = calculatePAReturn(
        makeInput({
          paScheduleJStatements: [{
            estateOrTrustName: "Alpha Family Trust",
            federalEIN: "11-1111111",
            sourceDocument: "pa_nrk_1",
            incomeAmount: "2200",
            nonresidentTaxWithheld: "68",
          }],
        }),
        { nonresidentTaxWithheld: d(125) },
      );

      expect(result.scheduleJ?.totalNonresidentTaxWithheld.toNumber()).toBe(68);
      expect(result.pa40.nonresidentTaxWithheld.toNumber()).toBe(125);
    });

    it("PA orchestrator maps PA Schedule T taxable winnings to gambling income", () => {
      const result = calculatePAReturn(makeInput({
        formW2G: [
          { payer: "Casino A", reportableWinnings: "5000", state: "PA", stateWithheld: "154" },
          { payer: "Casino B", reportableWinnings: "3000", state: "PA", stateWithheld: "92" },
        ],
      }));
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(8000);
      // Gambling withholding adds to PA withholding
      expect(result.stateWithholding.toNumber()).toBe(246);
    });

    it("PA orchestrator maps 1099-MISC rents and royalties to rental income", () => {
      const result = calculatePAReturn(makeInput({
        form1099Misc: [
          { payer: "Tenant Corp", rents: "18000" },
          { payer: "Oil Company", royalties: "5000" },
        ],
      }));
      // Rents ($18,000) + royalties ($5,000) → Class 6
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(23000);
    });

    it("PA orchestrator maps 1099-MISC with both rents and royalties on same form", () => {
      const result = calculatePAReturn(makeInput({
        form1099Misc: [
          { payer: "Mixed Income LLC", rents: "12000", royalties: "3000" },
        ],
      }));
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(15000);
    });

    it("PA orchestrator combines 1099-MISC with rental properties in Class 6", () => {
      const result = calculatePAReturn(makeInput({
        rentalProperties: [{
          description: "456 Oak St",
          rents: "30000",
          insurance: "1500",
          mortgageInterest: "10000",
          taxes: "4000",
          repairs: "1500",
          depreciation: "6000",
        }],
        form1099Misc: [
          { payer: "Book Publisher", royalties: "8000" },
        ],
      }));
      // Rental property net: $30,000 - ($1,500 + $10,000 + $4,000 + $1,500 + $6,000) = $7,000
      // 1099-MISC royalties: $8,000
      // Total Class 6: $15,000
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(15000);
    });

    it("PA orchestrator ignores 1099-MISC otherIncome for Class 6 (only rents/royalties)", () => {
      const result = calculatePAReturn(makeInput({
        form1099Misc: [
          { payer: "Contest", otherIncome: "10000" },
        ],
      }));
      // Other income (Box 3) does NOT flow to Class 6
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator handles 1099-MISC with zero rents and royalties", () => {
      const result = calculatePAReturn(makeInput({
        form1099Misc: [
          { payer: "Payer", rents: "0", royalties: "0", otherIncome: "5000" },
        ],
      }));
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(0);
    });

    // -----------------------------------------------------------------
    // 1099-G Unemployment Compensation → excluded from PA taxable income
    // -----------------------------------------------------------------

    it("PA orchestrator excludes 1099-G unemployment from compensation", () => {
      const result = calculatePAReturn(makeInput({
        form1099G: [{
          payer: "PA UC",
          unemploymentCompensation: "12000",
          stateWithheld: "368",
          state: "PA",
        }],
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.pa40.taxLiability.toNumber()).toBe(0);
      expect(result.stateWithholding.toNumber()).toBe(368);
    });

    it("PA orchestrator leaves W-2 wages unchanged when unemployment is present", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "40000",
          federalWithheld: "5000",
          stateWages: "40000",
          stateTaxWithheld: "1228",
          state: "PA",
        }],
        form1099G: [{
          payer: "PA UC",
          unemploymentCompensation: "8000",
          stateWithheld: "246",
          state: "PA",
        }],
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(40000);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(40000);
      expect(result.pa40.taxLiability.toNumber()).toBe(1228);
      expect(result.stateWithholding.toNumber()).toBe(1474);
    });

    it("PA orchestrator excludes multiple 1099-G unemployment forms from taxable income", () => {
      const result = calculatePAReturn(makeInput({
        form1099G: [
          { payer: "PA UC", unemploymentCompensation: "6000", stateWithheld: "184", state: "PA" },
          { payer: "PA UC Extended", unemploymentCompensation: "4000", stateWithheld: "123", state: "PA" },
        ],
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.stateWithholding.toNumber()).toBe(307);
    });

    it("PA orchestrator handles 1099-G with zero unemployment", () => {
      // State tax refund 1099-G with no unemployment — no income added
      const result = calculatePAReturn(makeInput({
        form1099G: [{
          payer: "PA DOR",
          unemploymentCompensation: "0",
          state: "PA",
        }],
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
    });

    it("PA orchestrator excludes 1099-G unemployment from Schedule SP eligibility income", () => {
      const result = calculatePAReturn(makeInput({
        form1099G: [{
          payer: "PA UC",
          unemploymentCompensation: "5000",
          stateWithheld: "154",
          state: "PA",
        }],
      }));
      expect(result.pa40.taxLiability.toNumber()).toBe(0);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.pa40.netTaxLiability.toNumber()).toBe(0);
      expect(result.stateWithholding.toNumber()).toBe(154);
    });

    // -----------------------------------------------------------------
    // 1099-K Payment Settlement Entity → Class 4 or 6
    // -----------------------------------------------------------------

    it("PA orchestrator maps 1099-K business income to Class 4", () => {
      const result = calculatePAReturn(makeInput({
        form1099K: [{
          pse: "Stripe",
          grossAmount: "25000",
          incomeType: "business",
        }],
      }));
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(25000);
    });

    it("PA orchestrator maps 1099-K farm income to Class 4", () => {
      const result = calculatePAReturn(makeInput({
        form1099K: [{
          pse: "Farm Payments LLC",
          grossAmount: "15000",
          incomeType: "farm",
        }],
      }));
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(15000);
    });

    it("PA orchestrator maps 1099-K rental income to Class 6", () => {
      const result = calculatePAReturn(makeInput({
        form1099K: [{
          pse: "Airbnb",
          grossAmount: "30000",
          incomeType: "rental",
        }],
      }));
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(30000);
    });

    it("PA orchestrator maps 1099-K other income to Class 4 by default", () => {
      const result = calculatePAReturn(makeInput({
        form1099K: [{
          pse: "PayPal",
          grossAmount: "8000",
          incomeType: "other",
        }],
      }));
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(8000);
    });

    it("PA orchestrator routes multiple 1099-Ks by income type", () => {
      const result = calculatePAReturn(makeInput({
        form1099K: [
          { pse: "Stripe", grossAmount: "20000", incomeType: "business" },
          { pse: "Airbnb", grossAmount: "15000", incomeType: "rental" },
          { pse: "Farm Coop", grossAmount: "10000", incomeType: "farm" },
        ],
      }));
      // Business + farm → Class 4: $20,000 + $10,000 = $30,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(30000);
      // Rental → Class 6: $15,000
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(15000);
    });

    it("PA orchestrator skips 1099-K when Schedule C is present (assumed included)", () => {
      const result = calculatePAReturn(makeInput({
        scheduleC: {
          businessName: "My Side Biz",
          grossReceipts: "50000", // includes 1099-K amounts
          costOfGoodsSold: "10000",
        },
        form1099K: [{
          pse: "Stripe",
          grossAmount: "30000", // already in Schedule C grossReceipts
          incomeType: "business",
        }],
      }));
      // Only Schedule C: $50,000 - $10,000 = $40,000
      // 1099-K business skipped to avoid double-counting
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(40000);
    });

    it("PA orchestrator does NOT skip 1099-K rental when Schedule C is present", () => {
      const result = calculatePAReturn(makeInput({
        scheduleC: {
          businessName: "My Side Biz",
          grossReceipts: "50000",
          costOfGoodsSold: "10000",
        },
        form1099K: [{
          pse: "Airbnb",
          grossAmount: "20000",
          incomeType: "rental",
        }],
      }));
      // Schedule C → Class 4: $40,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(40000);
      // 1099-K rental → Class 6: $20,000 (not affected by Schedule C)
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(20000);
    });

    it("PA orchestrator combines 1099-K with other income sources in same class", () => {
      const result = calculatePAReturn(makeInput({
        form1099Nec: [{ payer: "Client A", nonemployeeCompensation: "10000" }],
        form1099K: [{
          pse: "PayPal",
          grossAmount: "15000",
          incomeType: "business",
        }],
      }));
      // 1099-NEC $10,000 + 1099-K $15,000 = $25,000 (no Schedule C, both count)
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(25000);
    });

    it("PA orchestrator extracts 1099-K PA state withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099K: [{
          pse: "Stripe",
          grossAmount: "50000",
          stateWithheld: "1535",
          state: "PA",
          incomeType: "business",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(1535);
    });

    it("PA orchestrator ignores non-PA 1099-K withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099K: [{
          pse: "Stripe",
          grossAmount: "50000",
          stateWithheld: "2500",
          state: "CA",
          incomeType: "business",
        }],
      }));
      // CA withholding should not be added to PA withholding total
      expect(result.stateWithholding.toNumber()).toBe(0);
      // But income still maps to Class 4
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(50000);
    });

    it("PA orchestrator combines 1099-K withholding with other sources", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Employer", ein: "12-3456789" },
          wages: "60000",
          federalWithheld: "8000",
          stateTaxWithheld: "1842",
          state: "PA",
        }],
        form1099K: [{
          pse: "Stripe",
          grossAmount: "25000",
          stateWithheld: "768",
          state: "PA",
          incomeType: "business",
        }],
      }));
      // W-2 withholding $1,842 + 1099-K withholding $768 = $2,610
      expect(result.stateWithholding.toNumber()).toBe(2610);
    });

    it("PA orchestrator maps K-1 income to multiple classes", () => {
      const result = calculatePAReturn(makeInput({
        scheduleK1: [{
          partnershipName: "XYZ Partners",
          partnershipEIN: "12-3456789",
          ordinaryIncome: "20000", // → Class 4 business
          guaranteedPayments: "5000", // → Class 4 business
          interestIncome: "1000", // → Class 2 interest
          ordinaryDividends: "500", // → Class 3 dividends
          netShortTermCapitalGain: "3000", // → Class 5 gains
          netLongTermCapitalGain: "7000", // → Class 5 gains
          netRentalIncome: "4000", // → Class 6 rental
          royalties: "2000", // → Class 6 rental
        }],
      }));
      expect(result.mappedIncome.interest.toNumber()).toBe(1000);
      expect(result.mappedIncome.dividends.toNumber()).toBe(500);
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(25000); // 20000 + 5000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(10000); // 3000 + 7000
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(6000); // 4000 + 2000
    });

    it("PA orchestrator prefers PA pass-through statements over heuristic federal K-1 mapping for the same entity", () => {
      const result = calculatePAReturn(makeInput({
        scheduleK1: [{
          partnershipName: "Alpha Partners LP",
          partnershipEIN: "12-3456789",
          ordinaryIncome: "20000",
          guaranteedPayments: "5000",
          interestIncome: "1000",
          ordinaryDividends: "500",
          netShortTermCapitalGain: "3000",
          netLongTermCapitalGain: "7000",
          netRentalIncome: "4000",
          royalties: "2000",
        }],
        paPassThroughStatements: [{
          entityName: "Alpha Partners LP",
          entityEIN: "12-3456789",
          sourceDocument: "pa_rk_1",
          businessIncome: "18000",
          interestIncome: "250",
          dividendIncome: "125",
          netGainOrLoss: "2200",
          netRentalIncome: "1750",
          estateTrustIncome: "80",
          gamblingIncome: "40",
        }],
      }));

      expect(result.mappedIncome.interest.toNumber()).toBe(250);
      expect(result.mappedIncome.dividends.toNumber()).toBe(125);
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(18000);
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(2200);
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(1750);
      expect(result.mappedIncome.estateTrustIncome.toNumber()).toBe(80);
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(40);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(22445);
    });

    it("PA orchestrator adds PA pass-through statements from different entities without disturbing heuristic federal K-1 mapping", () => {
      const result = calculatePAReturn(makeInput({
        scheduleK1: [{
          partnershipName: "Federal K-1 Entity",
          partnershipEIN: "12-3456789",
          ordinaryIncome: "10000",
          guaranteedPayments: "2000",
          interestIncome: "150",
          ordinaryDividends: "75",
        }],
        paPassThroughStatements: [{
          entityName: "PA Statement Entity",
          entityEIN: "98-7654321",
          sourceDocument: "pa_rk_1",
          businessIncome: "5000",
          interestIncome: "50",
          dividendIncome: "25",
          netGainOrLoss: "500",
          netRentalIncome: "400",
        }],
      }));

      expect(result.mappedIncome.interest.toNumber()).toBe(200);
      expect(result.mappedIncome.dividends.toNumber()).toBe(100);
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(17000);
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(500);
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(400);
    });

    it("PA orchestrator keeps married joint K-1 Class 6 income separate by spouse before carrying Line 6 to PA-40", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "married_filing_jointly",
          primary: { firstName: "Alex", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          spouse: { firstName: "Sam", lastName: "Filer", ssn: "000-00-0002", dateOfBirth: "1987-02-02" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [],
        },
        scheduleK1: [
          {
            partnershipName: "Primary Rentals LLC",
            partnershipEIN: "11-1111111",
            accountHolder: "primary",
            ordinaryIncome: "0",
            netRentalIncome: "5000",
          },
          {
            partnershipName: "Spouse Rentals LLC",
            partnershipEIN: "22-2222222",
            accountHolder: "spouse",
            ordinaryIncome: "0",
            netRentalIncome: "-4000",
          },
        ],
      }));

      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(5000);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(5000);
      expect(result.pa40.taxLiability.toNumber()).toBe(154);
    });

    it("PA orchestrator keeps married joint PA statement Class 6 income separate by spouse before carrying Line 6 to PA-40", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "married_filing_jointly",
          primary: { firstName: "Alex", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          spouse: { firstName: "Sam", lastName: "Filer", ssn: "000-00-0002", dateOfBirth: "1987-02-02" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [],
        },
        paPassThroughStatements: [
          {
            entityName: "Primary Rentals LLC",
            entityEIN: "11-1111111",
            sourceDocument: "pa_rk_1",
            accountHolder: "primary",
            businessIncome: "0",
            netRentalIncome: "5000",
          },
          {
            entityName: "Spouse Rentals LLC",
            entityEIN: "22-2222222",
            sourceDocument: "pa_rk_1",
            accountHolder: "spouse",
            businessIncome: "0",
            netRentalIncome: "-4000",
          },
        ],
      }));

      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(5000);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(5000);
      expect(result.pa40.taxLiability.toNumber()).toBe(154);
    });
  });

  // =================================================================
  // State Withholding
  // =================================================================

  describe.sequential("State Withholding", () => {
    it("PA orchestrator sums PA state withholding from W-2s", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [
          {
            employer: { name: "Employer A", ein: "12-3456789" },
            wages: "50000",
            federalWithheld: "7000",
            stateTaxWithheld: "1535",
            state: "PA",
          },
          {
            employer: { name: "Employer B", ein: "98-7654321" },
            wages: "25000",
            federalWithheld: "3500",
            stateTaxWithheld: "768",
            state: "PA",
          },
        ],
      }));
      expect(result.stateWithholding.toNumber()).toBe(2303);
    });

    it("PA orchestrator sums PA withholding from 1099-G", () => {
      const result = calculatePAReturn(makeInput({
        form1099G: [{
          payer: "PA DOR",
          unemploymentCompensation: "5000",
          stateWithheld: "154",
          state: "PA",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(154);
    });

    it("PA orchestrator extracts 1099-R PA state withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Fidelity",
          grossDistribution: "20000",
          distributionCode: "7",
          stateWithheld: "614",
          state: "PA",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(614);
    });

    it("PA orchestrator ignores non-PA 1099-R withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Vanguard",
          grossDistribution: "15000",
          distributionCode: "7",
          stateWithheld: "500",
          state: "NJ",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(0);
    });

    it("PA orchestrator extracts 1099-INT PA state withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [{
          payer: "Chase Bank",
          interestIncome: "5000",
          stateWithheld: "154",
          state: "PA",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(154);
    });

    it("PA orchestrator ignores non-PA 1099-INT withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [{
          payer: "NY Bank",
          interestIncome: "8000",
          stateWithheld: "400",
          state: "NY",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(0);
    });

    it("PA orchestrator extracts 1099-DIV PA state withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099Div: [{
          payer: "Schwab",
          ordinaryDividends: "10000",
          stateWithheld: "307",
          state: "PA",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(307);
    });

    it("PA orchestrator ignores non-PA 1099-DIV withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099Div: [{
          payer: "CA Fund",
          ordinaryDividends: "6000",
          stateWithheld: "300",
          state: "CA",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(0);
    });

    it("PA orchestrator extracts 1099-MISC PA state withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099Misc: [{
          payer: "Oil Co",
          royalties: "12000",
          stateWithheld: "368",
          state: "PA",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(368);
    });

    it("PA orchestrator ignores non-PA 1099-MISC withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099Misc: [{
          payer: "TX Ranch",
          royalties: "8000",
          stateWithheld: "0",
          state: "TX",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(0);
    });

    it("PA orchestrator extracts 1099-NEC PA state withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099Nec: [{
          payer: "Consulting Client",
          nonemployeeCompensation: "12000",
          stateWithheld: "368",
          state: "PA",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(368);
    });

    it("PA orchestrator ignores non-PA 1099-NEC withholding", () => {
      const result = calculatePAReturn(makeInput({
        form1099Nec: [{
          payer: "Out-of-State Client",
          nonemployeeCompensation: "9000",
          stateWithheld: "250",
          state: "NJ",
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(0);
    });

    it("PA orchestrator combines withholding from all document types", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Employer", ein: "12-3456789" },
          wages: "50000",
          federalWithheld: "7000",
          stateTaxWithheld: "1535",
          state: "PA",
        }],
        form1099R: [{
          payer: "Fidelity",
          grossDistribution: "10000",
          distributionCode: "7",
          stateWithheld: "307",
          state: "PA",
        }],
        form1099Int: [{
          payer: "Chase",
          interestIncome: "3000",
          stateWithheld: "92",
          state: "PA",
        }],
        form1099Div: [{
          payer: "Schwab",
          ordinaryDividends: "2000",
          stateWithheld: "61",
          state: "PA",
        }],
        form1099Misc: [{
          payer: "Oil Co",
          royalties: "5000",
          stateWithheld: "154",
          state: "PA",
        }],
        form1099Nec: [{
          payer: "Freelance Client",
          nonemployeeCompensation: "6000",
          stateWithheld: "184",
          state: "PA",
        }],
        form1099G: [{
          payer: "PA DOR",
          unemploymentCompensation: "2000",
          stateWithheld: "61",
          state: "PA",
        }],
      }));
      // $1,535 + $307 + $92 + $61 + $154 + $184 + $61 = $2,394
      expect(result.stateWithholding.toNumber()).toBe(2394);
    });

    it("PA orchestrator excludes non-PA withholding in mixed-state scenario", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "PA Employer", ein: "12-3456789" },
          wages: "60000",
          federalWithheld: "8000",
          stateTaxWithheld: "1842",
          state: "PA",
        }],
        form1099R: [
          {
            payer: "PA Fund",
            grossDistribution: "10000",
            distributionCode: "7",
            stateWithheld: "307",
            state: "PA",
          },
          {
            payer: "NJ Fund",
            grossDistribution: "5000",
            distributionCode: "7",
            stateWithheld: "200",
            state: "NJ",
          },
        ],
        form1099Int: [
          {
            payer: "PA Bank",
            interestIncome: "2000",
            stateWithheld: "61",
            state: "PA",
          },
          {
            payer: "NY Bank",
            interestIncome: "3000",
            stateWithheld: "150",
            state: "NY",
          },
        ],
      }));
      // PA only: $1,842 + $307 + $61 = $2,210
      // Excluded: NJ $200, NY $150
      expect(result.stateWithholding.toNumber()).toBe(2210);
    });

    it("PA orchestrator includes 1099-R withholding when state is absent (assumed PA resident)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Retirement Plan",
          grossDistribution: "25000",
          distributionCode: "7",
          stateWithheld: "768",
          // no state field — assumed PA resident
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(768);
    });

    it("PA orchestrator includes 1099-INT withholding when state is absent", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [{
          payer: "Local CU",
          interestIncome: "1500",
          stateWithheld: "46",
          // no state field
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(46);
    });

    it("PA orchestrator includes 1099-DIV withholding when state is absent", () => {
      const result = calculatePAReturn(makeInput({
        form1099Div: [{
          payer: "Fund Co",
          ordinaryDividends: "4000",
          stateWithheld: "123",
          // no state field
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(123);
    });

    it("PA orchestrator includes 1099-MISC withholding when state is absent", () => {
      const result = calculatePAReturn(makeInput({
        form1099Misc: [{
          payer: "Royalty Corp",
          royalties: "7000",
          stateWithheld: "215",
          // no state field
        }],
      }));
      expect(result.stateWithholding.toNumber()).toBe(215);
    });

    it("PA orchestrator withholding from 1099-R affects refund computation", () => {
      // Retiree with $20K distribution (exempt code 7) but PA withholding → full refund
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "PSERS",
          grossDistribution: "20000",
          distributionCode: "7", // normal retirement — exempt from PA tax
          stateWithheld: "614",
          state: "PA",
        }],
      }));
      // Income is exempt (code 7), so taxable income = $0, tax = $0
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.pa40.taxLiability.toNumber()).toBe(0);
      // But $614 was withheld → full refund
      expect(result.pa40.overpayment.toNumber()).toBe(614);
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Schedule SP Integration
  // =================================================================

  describe.sequential("Schedule SP Integration", () => {
    it("PA orchestrator computes Schedule SP tax forgiveness", () => {
      // Low-income single filer: $5,000 wages → under $6,500 threshold → 100% forgiveness
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "5000",
          federalWithheld: "500",
          stateTaxWithheld: "154",
          state: "PA",
        }],
      }));
      // Tax: $5,000 × 3.07% = $153.50 → $154
      expect(result.pa40.taxLiability.toNumber()).toBe(154);
      // 100% forgiveness
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.scheduleSP.taxForgivenessCredit.toNumber()).toBe(154);
      const wptc = result.workingPennsylvaniansTaxCredit?.credit.toNumber() ?? 0;
      // Withholding is on the payment side; tax forgiveness zeroes the tax liability.
      expect(result.pa40.netTaxLiability.toNumber()).toBe(0);
      expect(result.pa40.overpayment.toNumber()).toBe(154 + wptc);
    });

    it("PA orchestrator maps married filing jointly to married category for SP", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "married_filing_jointly",
          primary: { firstName: "Test", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          spouse: { firstName: "Spouse", lastName: "Filer", ssn: "000-00-0002", dateOfBirth: "1986-06-15" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [],
        },
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "10000",
          federalWithheld: "1000",
          stateTaxWithheld: "307",
          state: "PA",
        }],
      }));
      // Married, 0 deps, $10,000 income → under $13,000 base → 100%
      expect(result.scheduleSP.filingCategory).toBe("married");
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    });

    it("PA orchestrator maps married filing separately living with spouse to married category for SP", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "married_filing_separately",
          livedWithSpouseAtAnyTimeDuringYear: true,
          primary: { firstName: "Test", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          spouse: { firstName: "Spouse", lastName: "Filer", ssn: "000-00-0002", dateOfBirth: "1986-06-15" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [],
        },
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "10000",
          federalWithheld: "1000",
          stateTaxWithheld: "307",
          state: "PA",
        }],
      }));

      expect(result.scheduleSP.filingCategory).toBe("married");
      expect(result.scheduleSP.baseThreshold.toNumber()).toBe(13000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    });

    it("PA orchestrator maps married filing separately living apart to unmarried category for SP", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "married_filing_separately",
          livedWithSpouseAtAnyTimeDuringYear: false,
          primary: { firstName: "Test", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          spouse: { firstName: "Spouse", lastName: "Filer", ssn: "000-00-0002", dateOfBirth: "1986-06-15" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [],
        },
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "10000",
          federalWithheld: "1000",
          stateTaxWithheld: "307",
          state: "PA",
        }],
      }));

      expect(result.scheduleSP.filingCategory).toBe("unmarried");
      expect(result.scheduleSP.baseThreshold.toNumber()).toBe(6500);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
    });

    it("PA orchestrator rejects married filing jointly when a spouse is claimed as a dependent on another person's federal return", () => {
      expect(() => calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "married_filing_jointly",
          primary: { firstName: "Paula", lastName: "Example", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          spouse: { firstName: "Scott", lastName: "Example", ssn: "000-00-0002", dateOfBirth: "1986-06-15" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [],
        },
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "10000",
          federalWithheld: "1000",
          stateTaxWithheld: "307",
          state: "PA",
        }],
        paResidentReturn: {
          spouseIsClaimedAsDependentOnAnotherFederalReturn: true,
        },
      }))).toThrow(
        "PA Schedule SP requires married taxpayers to file separately when either spouse is claimed as a dependent on another person's federal return",
      );
    });

    it("PA orchestrator uses PA Schedule SP separated status override for married filing separately taxpayers", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "married_filing_separately",
          livedWithSpouseAtAnyTimeDuringYear: true,
          primary: { firstName: "Test", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          spouse: { firstName: "Spouse", lastName: "Filer", ssn: "000-00-0002", dateOfBirth: "1986-06-15" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [],
        },
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "10000",
          federalWithheld: "1000",
          stateTaxWithheld: "307",
          state: "PA",
        }],
        paResidentReturn: {
          scheduleSPSeparatedStatusApplies: true,
        },
      }));

      expect(result.scheduleSP.filingCategory).toBe("unmarried");
      expect(result.scheduleSP.baseThreshold.toNumber()).toBe(6500);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
    });

    it("PA orchestrator adds spouse eligibility income to married Schedule SP calculations when filing separately", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "married_filing_separately",
          livedWithSpouseAtAnyTimeDuringYear: true,
          primary: { firstName: "Test", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          spouse: { firstName: "Spouse", lastName: "Filer", ssn: "000-00-0002", dateOfBirth: "1986-06-15" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [],
        },
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "4000",
          federalWithheld: "200",
          stateTaxWithheld: "123",
          state: "PA",
        }],
        paResidentReturn: {
          spouseEligibilityIncome: "10000",
        },
      }));

      expect(result.scheduleSP.filingCategory).toBe("married");
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(14000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(60);
      expect(result.scheduleSP.taxForgivenessCredit.toNumber()).toBe(74);
    });

    it("PA orchestrator includes resident additional Schedule SP eligibility income for dependent-child claimants", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "single",
          primary: { firstName: "Dependent", lastName: "Child", ssn: "000-00-0008", dateOfBirth: "2005-01-01" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [],
        },
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "4000",
          federalWithheld: "200",
          stateTaxWithheld: "123",
          state: "PA",
        }],
        paResidentReturn: {
          isClaimedAsDependentOnAnotherFederalReturn: true,
          claimingHouseholdQualifiesForTaxForgiveness: true,
          additionalEligibilityIncome: "3000",
        },
      }));

      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(7000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(80);
      expect(result.scheduleSP.taxForgivenessCredit.toNumber()).toBe(98);
    });

    it("PA orchestrator counts dependents for SP threshold", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "single",
          primary: { firstName: "Test", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [
            { firstName: "Child", lastName: "Filer", ssn: "000-00-0010", relationship: "son", dateOfBirth: "2015-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
            { firstName: "Child2", lastName: "Filer", ssn: "000-00-0011", relationship: "daughter", dateOfBirth: "2017-05-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
          ],
        },
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "20000",
          federalWithheld: "2000",
          stateTaxWithheld: "614",
          state: "PA",
        }],
      }));
      // Unmarried, 2 deps, $20,000 income → base $25,500 → 100%
      expect(result.scheduleSP.baseThreshold.toNumber()).toBe(25500);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    });

    it("PA orchestrator counts only qualifying Schedule SP dependent children", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "single",
          primary: { firstName: "Test", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [
            { firstName: "Child", lastName: "Filer", ssn: "000-00-0010", relationship: "son", dateOfBirth: "2015-01-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
            { firstName: "Parent", lastName: "Filer", ssn: "000-00-0011", relationship: "parent", dateOfBirth: "1955-05-01", monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: true },
            { firstName: "Niece", lastName: "Filer", ssn: "000-00-0012", relationship: "niece", dateOfBirth: "2012-07-01", monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: true },
          ],
        },
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "20000",
          federalWithheld: "2000",
          stateTaxWithheld: "614",
          state: "PA",
        }],
      }));

      expect(result.scheduleSP.dependents).toBe(1);
      expect(result.scheduleSP.baseThreshold.toNumber()).toBe(16000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
    });

    it("PA orchestrator lets adult children, grandchildren, and foster children increase the Schedule SP threshold", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "single",
          primary: { firstName: "Test", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [
            { firstName: "Adult", lastName: "Child", ssn: "000-00-0020", relationship: "daughter", dateOfBirth: "1998-04-10", monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: true },
            { firstName: "Grand", lastName: "Child", ssn: "000-00-0021", relationship: "granddaughter", dateOfBirth: "2017-08-01", monthsLivedWithYou: 12, qualifiesForCTC: true },
            { firstName: "Foster", lastName: "Child", ssn: "000-00-0022", relationship: "foster child", dateOfBirth: "2019-11-15", monthsLivedWithYou: 12, qualifiesForCTC: true },
          ],
        },
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "34000",
          federalWithheld: "3400",
          stateTaxWithheld: "1044",
          state: "PA",
        }],
      }));

      expect(result.scheduleSP.dependents).toBe(3);
      expect(result.scheduleSP.baseThreshold.toNumber()).toBe(35000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    });

    it("PA orchestrator excludes Social Security and RRB-1099 from SP nontaxable income", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme", ein: "12-3456789" },
          wages: "5000",
          federalWithheld: "500",
          stateTaxWithheld: "154",
          state: "PA",
        }],
        formSSA1099: [{ netBenefits: "12000" }],
        formRRB1099: [{ netSocialSecurityEquivalentBenefitPortion: "8000" }],
      }));
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(5000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    });
  });

  // =================================================================
  // Schedule G-L Integration
  // =================================================================

  describe.sequential("Schedule G-L Integration", () => {
    it("PA orchestrator computes Schedule G-L resident credit", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "PA Corp", ein: "12-3456789" },
          wages: "100000",
          federalWithheld: "15000",
          stateTaxWithheld: "3070",
          state: "PA",
        }],
        paScheduleGLStatements: [{
          stateCode: "NJ",
          incomeTaxableByBothStates: "40000",
          taxPaidToOtherState: "1500",
        }],
      }));
      // PA tax: $100K × 3.07% = $3,070
      // NJ credit: min($1,500 paid, $40K × 3.07% = $1,228) = $1,228
      expect(result.scheduleGL.totalCredit.toNumber()).toBe(1228);
      // Net tax: $3,070 - $1,228 = $1,842
      expect(result.pa40.netTaxLiability.toNumber()).toBe(1842);
    });

    it("PA orchestrator Schedule G-L statements override raw otherStateCredits", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "PA Corp", ein: "12-3456789" },
            wages: "100000",
            federalWithheld: "15000",
            stateTaxWithheld: "3070",
            state: "PA",
          }],
          paScheduleGLStatements: [{
            stateCode: "DE",
            incomeTaxableByBothStates: "30000",
            taxPaidToOtherState: "600",
          }],
        }),
        {
          otherStateCredits: [{
            stateCode: "NJ",
            incomeTaxableByBothStates: d(90000),
            taxPaidToOtherState: d(9000),
          }],
        },
      );

      expect(result.scheduleGL.perStateResults).toHaveLength(1);
      expect(result.scheduleGL.perStateResults[0].stateCode).toBe("DE");
      expect(result.scheduleGL.perStateResults[0].credit.toNumber()).toBe(600);
      expect(result.scheduleGL.totalCredit.toNumber()).toBe(600);
    });

    it("PA orchestrator computes Schedule SP after subtracting taxes paid to other states", () => {
      const result = calculatePAReturn(
        makeInput({
          taxpayer: {
            taxYear: 2025,
            filingStatus: "married_filing_jointly",
            primary: { firstName: "Pat", lastName: "Commuter", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
            spouse: { firstName: "Casey", lastName: "Commuter", ssn: "000-00-0002", dateOfBirth: "1986-06-15" },
            address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
            dependents: [],
          },
          w2s: [{
            employer: { name: "NJ Corp", ein: "77-7777777" },
            wages: "10000",
            federalWithheld: "1200",
            stateWages: "10000",
            stateTaxWithheld: "307",
            state: "PA",
          }],
        }),
        {
          otherStateCredits: [{
            stateCode: "NJ",
            incomeTaxableByBothStates: d(10000),
            taxPaidToOtherState: d(500),
          }],
        },
      );

      expect(result.scheduleGL.totalCredit.toNumber()).toBe(307);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.scheduleSP.taxPaidToOtherStates.toNumber()).toBe(500);
      expect(result.scheduleSP.taxLiabilityAfterOtherStateTaxes.toNumber()).toBe(0);
      expect(result.scheduleSP.taxForgivenessCredit.toNumber()).toBe(0);
      expect(result.pa40.totalCredits.toNumber()).toBe(307);
    });
  });

  // =================================================================
  // End-to-End Scenarios
  // =================================================================

  describe.sequential("End-to-End Scenarios", () => {
    it("PA orchestrator end-to-end: W-2 employee with withholding", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Philly Inc", ein: "12-3456789" },
          wages: "85000",
          federalWithheld: "12000",
          stateWages: "85000",
          stateTaxWithheld: "2610",
          state: "PA",
        }],
        form1099Int: [{ payer: "Bank", interestIncome: "250" }],
      }));
      // Compensation: $85,000; interest: $250
      // Total PA taxable: $85,250
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(85250);
      // Tax: $85,250 × 3.07% = $2,617.18 → $2,617
      expect(result.pa40.taxLiability.toNumber()).toBe(2617);
      // No SP forgiveness (income too high)
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
      // Net tax: $2,617; withholding: $2,610; owed: $7
      expect(result.pa40.amountOwed.toNumber()).toBe(7);
    });

    it("PA orchestrator end-to-end: self-employed with business income and estimated payments", () => {
      const result = calculatePAReturn(
        makeInput({
          scheduleC: {
            grossReceipts: "80000",
            returnsAndAllowances: "0",
            costOfGoodsSold: "0",
            expenses: {
              advertising: "1000",
              carAndTruck: "3000",
              contractLabor: "0",
              depreciation: "2000",
              insurance: "1500",
              legalAndProfessional: "0",
              officeExpense: "500",
              supplies: "500",
              travel: "1500",
              meals: "0",
              utilities: "0",
              otherExpenses: "0",
            },
          },
        }),
        { estimatedPayments: d(2000) },
      );
      // Business income: $80,000 - $10,000 expenses = $70,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(70000);
      // Tax: $70,000 × 3.07% = $2,149
      expect(result.pa40.taxLiability.toNumber()).toBe(2149);
      // Est payments: $2,000; owed: $149
      expect(result.pa40.amountOwed.toNumber()).toBe(149);
    });

    it("PA orchestrator end-to-end: investor with wages, dividends, cap gains, and rental loss", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "60000",
          federalWithheld: "9000",
          stateTaxWithheld: "1842",
          state: "PA",
        }],
        form1099Div: [{
          payer: "Vanguard",
          ordinaryDividends: "5000",
          qualifiedDividends: "4000",
          totalCapitalGainDistributions: "3000",
        }],
        form1099B: [{
          broker: "Fidelity",
          transactions: [{
            description: "ETF",
            dateAcquired: "2023-01-01",
            dateSold: "2025-06-01",
            proceeds: "50000",
            costBasis: "38000",
            holdingPeriod: "long",
          }],
        }],
        rentalProperties: [{
          description: "456 Elm St",
          rents: "18000",
          insurance: "2000",
          mortgageInterest: "12000",
          taxes: "4000",
          repairs: "3000",
          depreciation: "6000",
        }],
      }));
      // Compensation: $60,000
      // Dividends: $5,000 ordinary + $3,000 capital gain distributions = $8,000
      // Gains: $12,000 (1099-B only)
      // Rental: $18,000 - $27,000 = -$9,000 (loss, clamped to 0 for total)
      expect(result.mappedIncome.compensation.toNumber()).toBe(60000);
      expect(result.mappedIncome.dividends.toNumber()).toBe(8000);
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(12000);
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(-9000);

      // Total PA taxable: 60000 + 8000 + 12000 = 80,000 (rental loss clamped)
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(80000);
      // Tax: $80,000 × 3.07% = $2,456
      expect(result.pa40.taxLiability.toNumber()).toBe(2456);
    });

    it("PA orchestrator end-to-end: low-income with full tax forgiveness", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "single",
          primary: { firstName: "Test", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1985-01-01" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [
            { firstName: "Kid", lastName: "Filer", ssn: "000-00-0010", relationship: "son", dateOfBirth: "2015-03-15", monthsLivedWithYou: 12, qualifiesForCTC: true },
          ],
        },
        w2s: [{
          employer: { name: "Store", ein: "12-3456789" },
          wages: "12000",
          federalWithheld: "500",
          stateTaxWithheld: "368",
          state: "PA",
        }],
      }));
      // Unmarried, 1 dep: base threshold $16,000
      // Income $12,000 < $16,000 → 100% forgiveness
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
      // Tax: $12,000 × 3.07% = $368.40 → $368
      expect(result.pa40.taxLiability.toNumber()).toBe(368);
      // Forgiveness credit: $368 (100%)
      expect(result.pa40.taxForgivenessCredit.toNumber()).toBe(368);
      const wptc = result.workingPennsylvaniansTaxCredit?.credit.toNumber() ?? 0;
      // Withholding is on the payment side; tax forgiveness zeroes the tax liability.
      expect(result.pa40.netTaxLiability.toNumber()).toBe(0);
      expect(result.pa40.overpayment.toNumber()).toBe(368 + wptc);
    });

    it("PA orchestrator end-to-end: zero income produces zero tax", () => {
      const result = calculatePAReturn(makeInput({}));
      expect(result.pa40.taxLiability.toNumber()).toBe(0);
      expect(result.pa40.netTaxLiability.toNumber()).toBe(0);
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
      expect(result.pa40.overpayment.toNumber()).toBe(0);
    });

    it("PA orchestrator end-to-end: multiple W-2s summed", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [
          {
            employer: { name: "Job A", ein: "12-3456789" },
            wages: "40000",
            federalWithheld: "5000",
            stateTaxWithheld: "1228",
            state: "PA",
          },
          {
            employer: { name: "Job B", ein: "98-7654321" },
            wages: "25000",
            federalWithheld: "3000",
            stateTaxWithheld: "768",
            state: "PA",
          },
        ],
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(65000);
      expect(result.stateWithholding.toNumber()).toBe(1996);
      // Tax: $65,000 × 3.07% = $1,995.50 → $1,996
      expect(result.pa40.taxLiability.toNumber()).toBe(1996);
      // Exact withholding
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
      expect(result.pa40.overpayment.toNumber()).toBe(0);
    });

    it("PA orchestrator end-to-end: with overrides for estimated and prior-year payments", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Corp", ein: "12-3456789" },
            wages: "100000",
            federalWithheld: "15000",
            stateTaxWithheld: "2000",
            state: "PA",
          }],
        }),
        {
          estimatedPayments: d(500),
          creditFromPriorYear: d(200),
        },
      );
      // Tax: $3,070; payments: $2,000 + $500 + $200 = $2,700
      expect(result.pa40.totalPayments.toNumber()).toBe(2700);
      expect(result.pa40.amountOwed.toNumber()).toBe(370);
    });
  });

  // =================================================================
  // Edge Cases
  // =================================================================

  describe.sequential("Edge Cases", () => {
    it("PA orchestrator handles all income classes simultaneously", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Corp", ein: "12-3456789" },
            wages: "50000",
            federalWithheld: "7000",
            stateTaxWithheld: "1535",
            state: "PA",
          }],
          form1099Int: [{ payer: "Bank", interestIncome: "1000" }],
          form1099Div: [{ payer: "Fund", ordinaryDividends: "2000" }],
          scheduleC: { grossReceipts: "30000" },
          form1099B: [{
            broker: "Broker",
            transactions: [{
              description: "Stock",
              dateAcquired: "2020-01-01",
              dateSold: "2025-06-01",
              proceeds: "15000",
              costBasis: "10000",
              holdingPeriod: "long",
            }],
          }],
          rentalProperties: [{
            description: "Property",
            rents: "12000",
            insurance: "1000",
            taxes: "2000",
            repairs: "1000",
          }],
          formW2G: [{ payer: "Casino", reportableWinnings: "3000", state: "PA" }],
        }),
        { estateTrustIncome: d(1500) },
      );
      // 7 of 8 classes from docs, 1 from override
      expect(result.mappedIncome.compensation.toNumber()).toBe(50000);
      expect(result.mappedIncome.interest.toNumber()).toBe(1000);
      expect(result.mappedIncome.dividends.toNumber()).toBe(2000);
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(30000);
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(5000);
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(8000);
      expect(result.mappedIncome.estateTrustIncome.toNumber()).toBe(1500);
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(3000);

      // Total: 50000 + 1000 + 2000 + 30000 + 5000 + 8000 + 1500 + 3000 = 100,500
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(100500);
      // Tax: $100,500 × 3.07% = $3,085.35 → $3,085
      expect(result.pa40.taxLiability.toNumber()).toBe(3085);
    });

    it("PA orchestrator handles negative business income without affecting other classes", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "60000",
          federalWithheld: "8000",
          stateTaxWithheld: "1842",
          state: "PA",
        }],
        scheduleC: {
          grossReceipts: "20000",
          expenses: {
            advertising: "0",
            carAndTruck: "0",
            contractLabor: "0",
            depreciation: "0",
            insurance: "0",
            legalAndProfessional: "0",
            officeExpense: "0",
            supplies: "0",
            travel: "0",
            meals: "0",
            utilities: "0",
            otherExpenses: "35000",
          },
        },
      }));
      // Business: $20,000 - $35,000 = -$15,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(-15000);
      // Total PA taxable: only wages $60,000 (business loss clamped)
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(60000);
    });

    it("PA orchestrator handles tax-exempt interest in SP eligibility", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "6000",
          federalWithheld: "600",
          stateTaxWithheld: "184",
          state: "PA",
        }],
        form1099Int: [{
          payer: "Muni Fund",
          interestIncome: "0",
          taxExemptInterest: "3000",
        }],
      }));
      // PA taxable: $6,000 wages + $3,000 tax-exempt-interest add-back = $9,000
      // Eligibility: $9,000 → above $8,750 → 0% forgiveness
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(9000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // 1099-R Retirement Distribution Mapping
  // =================================================================

  describe.sequential("1099-R Retirement Distribution Mapping", () => {
    it("PA orchestrator exempts normal 1099-R distributions (code 7)", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "50000",
          federalWithheld: "7000",
          stateTaxWithheld: "1535",
          state: "PA",
        }],
        form1099R: [{
          payer: "Retirement Plan Co",
          grossDistribution: "30000",
          taxableAmount: "30000",
          distributionCode: "7",
        }],
      }));
      // Normal distribution (code 7) is EXEMPT from PA tax
      // Only W-2 wages should be in PA taxable income
      expect(result.mappedIncome.compensation.toNumber()).toBe(50000);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(50000);
      // Tax: $50,000 × 3.07% = $1,535
      expect(result.pa40.taxLiability.toNumber()).toBe(1535);
    });

    it("PA orchestrator exempts PSERS distributions regardless of Box 7 code", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Pennsylvania School Employees' Retirement System (PSERS)",
          grossDistribution: "20000",
          taxableAmount: "18000",
          distributionCode: "1",
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.mappedIncome.interest.toNumber()).toBe(0);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator exempts Public School Employees' Retirement System payer-name variants", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Public School Employees' Retirement System",
          grossDistribution: "20000",
          taxableAmount: "18000",
          distributionCode: "1",
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.mappedIncome.interest.toNumber()).toBe(0);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator keeps public retirement system code D distributions exempt", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Pennsylvania Municipal Employees' Retirement System",
          grossDistribution: "12000",
          taxableAmount: "4500",
          distributionCode: "7D",
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.mappedIncome.interest.toNumber()).toBe(0);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator exempts disability distributions after minimum retirement age (code 3)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Pension Fund",
          grossDistribution: "24000",
          taxableAmount: "24000",
          distributionCode: "3",
        }],
      }));
      // Disability distribution (code 3) is EXEMPT from PA tax
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.pa40.taxLiability.toNumber()).toBe(0);
    });

    it("PA orchestrator taxes disability pensions before minimum retirement age as compensation", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Employer Disability Plan",
          grossDistribution: "24000",
          taxableAmount: "18000",
          distributionCode: "3",
          disabilityPensionBeforeMinimumRetirementAge: true,
        }],
      }));
      // Pre-retirement disability pension is taxable compensation in PA.
      expect(result.mappedIncome.compensation.toNumber()).toBe(18000);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(18000);
      expect(result.pa40.taxLiability.toNumber()).toBe(553);
      // Taxable disability pension is not added to SP nontaxable income.
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator exempts death benefit distributions (code 4)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Pension Fund",
          grossDistribution: "50000",
          taxableAmount: "50000",
          distributionCode: "4",
        }],
      }));
      // Death distribution (code 4) is EXEMPT from PA tax
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(50000);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(50000);
    });

    it("PA orchestrator exempts qualified Roth distributions", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Roth IRA Provider",
          grossDistribution: "15000",
          taxableAmount: "0",
          distributionCode: "Q",
          iraSepSimple: true,
          qualifiedRothDistribution: true,
        }],
      }));
      // Qualified Roth distribution is EXEMPT
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator excludes rollovers entirely (code G)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "401k Plan",
          grossDistribution: "100000",
          taxableAmount: "0",
          distributionCode: "G",
        }],
      }));
      // Direct rollover — not income, not even nontaxable for SP
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator excludes Roth rollovers entirely (code H)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "401k Plan",
          grossDistribution: "50000",
          taxableAmount: "0",
          distributionCode: "H",
        }],
      }));
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator exempts EPCRS distributions (code E)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Qualified Plan Administrator",
          grossDistribution: "7500",
          taxableAmount: "7500",
          distributionCode: "E",
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.mappedIncome.interest.toNumber()).toBe(0);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator exempts current-year IRA recharacterizations (code N)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "IRA Custodian",
          grossDistribution: "6000",
          taxableAmount: "6000",
          distributionCode: "N",
          iraSepSimple: true,
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.mappedIncome.interest.toNumber()).toBe(0);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator exempts prior-year IRA recharacterizations (code R)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "IRA Custodian",
          grossDistribution: "6000",
          taxableAmount: "6000",
          distributionCode: "R",
          iraSepSimple: true,
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.mappedIncome.interest.toNumber()).toBe(0);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator taxes early employer plan distributions as compensation (code 1)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Employer 401k",
          grossDistribution: "20000",
          taxableAmount: "20000",
          distributionCode: "1",
          iraSepSimple: false,
        }],
      }));
      // Early distribution from employer plan → Class 1 (compensation)
      expect(result.mappedIncome.compensation.toNumber()).toBe(20000);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(20000);
      // Tax: $20,000 × 3.07% = $614
      expect(result.pa40.taxLiability.toNumber()).toBe(614);
    });

    it("PA orchestrator uses employee-basis recovery when Box 2a is blank on an early employer-plan distribution", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Employer Pension",
          grossDistribution: "10000",
          taxableAmountNotDetermined: true,
          employeeContributions: "3000",
          distributionCode: "1",
          iraSepSimple: false,
        }],
      }));

      expect(result.mappedIncome.compensation.toNumber()).toBe(7000);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(7000);
      expect(result.pa40.taxLiability.toNumber()).toBe(215);
    });

    it("PA orchestrator taxes early IRA distributions as interest (code 1, iraSepSimple)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "IRA Provider",
          grossDistribution: "10000",
          taxableAmount: "8000",
          distributionCode: "1",
          iraSepSimple: true,
        }],
      }));
      // Early IRA distribution → Class 2 (interest), uses taxableAmount ($8,000)
      expect(result.mappedIncome.interest.toNumber()).toBe(8000);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(8000);
      // Tax: $8,000 × 3.07% = $245.60 → $246
      expect(result.pa40.taxLiability.toNumber()).toBe(246);
    });

    it("PA orchestrator taxes early Roth IRA distributions on earnings (code J)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Roth IRA Provider",
          grossDistribution: "12000",
          taxableAmount: "2000",
          distributionCode: "J",
          iraSepSimple: true,
        }],
      }));
      // Early Roth IRA (code J) — taxable earnings portion → Class 2 (interest)
      expect(result.mappedIncome.interest.toNumber()).toBe(2000);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(2000);
    });

    it("PA orchestrator taxes SIMPLE IRA early distributions (code S)", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "SIMPLE IRA",
          grossDistribution: "5000",
          taxableAmount: "5000",
          distributionCode: "S",
          iraSepSimple: true,
        }],
      }));
      // SIMPLE IRA early (code S) → Class 2 (interest)
      expect(result.mappedIncome.interest.toNumber()).toBe(5000);
    });

    it("PA orchestrator taxes 1099-R code 7D distributions as interest", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Nonqualified Annuity",
          grossDistribution: "12000",
          taxableAmount: "4500",
          distributionCode: "7D",
        }],
      }));

      expect(result.mappedIncome.interest.toNumber()).toBe(4500);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(4500);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator uses the supported Simplified Method taxable amount for code D paired annuity interest", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Nonqualified Annuity",
          grossDistribution: "12000",
          taxableAmountNotDetermined: true,
          distributionCode: "7D",
          simplifiedMethodCostInPlan: "24000",
          simplifiedMethodExpectedPayments: 240,
          simplifiedMethodPaymentsReceivedThisYear: 12,
          simplifiedMethodPriorYearRecovered: "6000",
        }],
      }));

      expect(result.mappedIncome.interest.toNumber()).toBe(10800);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(10800);
      expect(result.pa40.taxLiability.toNumber()).toBe(332);
    });

    it("PA orchestrator handles multiple 1099-Rs with mixed codes", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "40000",
          federalWithheld: "5000",
          stateTaxWithheld: "1228",
          state: "PA",
        }],
        form1099R: [
          {
            payer: "Pension Plan",
            grossDistribution: "24000",
            taxableAmount: "24000",
            distributionCode: "7", // Normal — EXEMPT
          },
          {
            payer: "401k Early",
            grossDistribution: "10000",
            taxableAmount: "10000",
            distributionCode: "1", // Early employer plan — TAXABLE as compensation
            iraSepSimple: false,
          },
          {
            payer: "IRA Rollover",
            grossDistribution: "50000",
            taxableAmount: "0",
            distributionCode: "G", // Rollover — NOT INCOME
          },
          {
            payer: "Roth IRA",
            grossDistribution: "5000",
            taxableAmount: "0",
            distributionCode: "Q", // Qualified Roth — EXEMPT
            iraSepSimple: true,
            qualifiedRothDistribution: true,
          },
        ],
      }));
      // Compensation: $40,000 (W-2) + $10,000 (early 401k) = $50,000
      expect(result.mappedIncome.compensation.toNumber()).toBe(50000);
      // Total PA taxable: $50,000 only (pension exempt, rollover not income, Roth exempt)
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(50000);
    });

    it("PA orchestrator excludes ordinary exempt 1099-R from automatic SP eligibility income", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "5000",
          federalWithheld: "500",
          stateTaxWithheld: "154",
          state: "PA",
        }],
        form1099R: [{
          payer: "Pension Plan",
          grossDistribution: "20000",
          taxableAmount: "20000",
          distributionCode: "7", // Normal — EXEMPT from PA tax
        }],
      }));
      // PA taxable: $5,000 (wages only); pension is exempt
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(5000);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(5000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    });

    it("PA orchestrator includes qualified joint survivor annuity code 7 distributions in SP eligibility income", () => {
      const survivorAnnuityDistribution = {
        payer: "Employer Pension Plan",
        grossDistribution: "20000",
        taxableAmount: "20000",
        distributionCode: "7",
        qualifiedJointSurvivorAnnuity: true,
      } satisfies NonNullable<TaxYearInput["form1099R"]>[number];

      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "5000",
          federalWithheld: "500",
          stateTaxWithheld: "154",
          state: "PA",
        }],
        form1099R: [survivorAnnuityDistribution],
      }));

      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(5000);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(20000);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(25000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
    });

    it("PA qualified joint survivor annuity metadata requires a code 7 Form 1099-R", () => {
      const parsed = TaxYearInputSchema.safeParse(makeInput({
        form1099R: [{
          payer: "Employer Pension Plan",
          grossDistribution: "20000",
          taxableAmount: "20000",
          distributionCode: "4",
          qualifiedJointSurvivorAnnuity: true,
        }],
      }));

      expect(parsed.success).toBe(false);
      expect(parsed.error.issues.some((issue) => issue.message.includes("qualified joint survivor annuity"))).toBe(true);
    });

    it("PA orchestrator does not count rollovers in SP eligibility income", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "5000",
          federalWithheld: "500",
          stateTaxWithheld: "154",
          state: "PA",
        }],
        form1099R: [{
          payer: "401k Rollover",
          grossDistribution: "200000",
          taxableAmount: "0",
          distributionCode: "G",
        }],
      }));
      // Rollover is not income — should not affect SP eligibility
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(5000);
      // Low income with 100% forgiveness
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    });

    it("PA orchestrator uses taxableAmount for early distributions when provided", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "IRA Provider",
          grossDistribution: "15000",
          taxableAmount: "12000", // Basis recovered: only $12K taxable
          distributionCode: "1",
          iraSepSimple: true,
        }],
      }));
      // Uses Box 2a (taxableAmount = $12,000), not gross ($15,000)
      expect(result.mappedIncome.interest.toNumber()).toBe(12000);
    });

    it("PA orchestrator uses grossDistribution when taxableAmount is not provided", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "IRA Provider",
          grossDistribution: "10000",
          // No taxableAmount → use gross
          distributionCode: "1",
          iraSepSimple: true,
        }],
      }));
      expect(result.mappedIncome.interest.toNumber()).toBe(10000);
    });

    it("PA orchestrator handles code 2 (early with exception) as taxable for PA", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Employer Plan",
          grossDistribution: "25000",
          taxableAmount: "25000",
          distributionCode: "2", // Federal exception doesn't apply to PA
          iraSepSimple: false,
        }],
      }));
      // Code 2 is still taxable for PA → Class 1 (compensation)
      expect(result.mappedIncome.compensation.toNumber()).toBe(25000);
    });

    it("PA orchestrator exempts code T Roth with qualifiedRothDistribution flag", () => {
      const result = calculatePAReturn(makeInput({
        form1099R: [{
          payer: "Roth IRA",
          grossDistribution: "8000",
          taxableAmount: "0",
          distributionCode: "T",
          iraSepSimple: true,
          qualifiedRothDistribution: true,
        }],
      }));
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator handles no form1099R gracefully", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "50000",
          federalWithheld: "7000",
          stateTaxWithheld: "1535",
          state: "PA",
        }],
      }));
      // No 1099-R should not affect anything
      expect(result.mappedIncome.compensation.toNumber()).toBe(50000);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(50000);
    });
  });

  // =================================================================
  // Schedule F Farm Income Mapping
  // =================================================================

  describe.sequential("Schedule F Farm Income Mapping", () => {
    it("PA orchestrator maps Schedule F farm income to business income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleF: {
          salesOfProductsRaised: "80000",
          otherFarmIncome: "5000",
          expenses: {
            feed: "15000",
            seedsAndPlants: "8000",
            fertilizersAndLime: "5000",
            depreciation: "12000",
            insurance: "3000",
            laborHired: "10000",
            repairsAndMaintenance: "4000",
            utilities: "2000",
            otherExpenses: "1000",
          },
        },
      }));
      // Gross farm income: $80,000 + $5,000 = $85,000
      // Expenses: $15K + $8K + $5K + $12K + $3K + $10K + $4K + $2K + $1K = $60,000
      // Net farm profit: $25,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(25000);
      // Tax: $25,000 × 3.07% = $767.50 → $768
      expect(result.pa40.taxLiability.toNumber()).toBe(768);
    });

    it("PA orchestrator includes Schedule F breeding fees, jobs credit, and land clearing in Class 4 farm income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleF: {
          salesOfProductsRaised: "30000",
          expenses: {
            breedingFees: "2500.50",
            laborHired: "5000.49",
            jobsCredit: "1200.50",
            landClearing: "800.50",
          },
        },
      }));

      expect(result.scheduleF?.line13.toNumber()).toBe(2501);
      expect(result.scheduleF?.line23b.toNumber()).toBe(1201);
      expect(result.scheduleF?.line23c.toNumber()).toBe(3799);
      expect(result.scheduleF?.line24.toNumber()).toBe(801);
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(22899);
      expect(result.pa40.taxLiability.toNumber()).toBe(703);
    });

    it("PA orchestrator carries Schedule F direct-entry cooperative, materials-and-services, and Section 179 lines into Class 4 farm income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleF: {
          salesOfProductsRaised: "10000",
          cooperativeDistributions: "3000.49",
          cooperativeNonIncomeItems: "400.50",
          agriculturalProgramPayments: "2000.49",
          agriculturalProgramMaterialsServices: "750.50",
          expenses: {
            section179Expense: "1500.50",
          },
        },
      }));

      expect(result.scheduleF?.line5b.toNumber()).toBe(401);
      expect(result.scheduleF?.line7b.toNumber()).toBe(751);
      expect(result.scheduleF?.line16b.toNumber()).toBe(1501);
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(13849);
      expect(result.pa40.taxLiability.toNumber()).toBe(425);
    });

    it("PA orchestrator excludes prior-year deferred crop insurance from current-year Pennsylvania farm income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleF: {
          salesOfProductsRaised: "20000",
          cropInsuranceProceeds: "4000",
          priorYearDeferredCropInsurance: "3000",
        },
      }));

      expect(result.scheduleF?.excludedPriorYearDeferredCropInsurance.toNumber()).toBe(3000);
      expect(result.scheduleF?.line12.toNumber()).toBe(24000);
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(24000);
      expect(result.pa40.taxLiability.toNumber()).toBe(737);
    });

    it("PA orchestrator maps accrual-method Schedule F income to business income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleF: {
          accountingMethod: "accrual",
          accrualSalesDuringYear: "70000.49",
          agriculturalProgramPayments: "2000.49",
          agriculturalProgramMaterialsServices: "500.50",
          cccLoansElected: "1000.49",
          cccLoansForfeited: "400.50",
          customHireIncome: "300.50",
          otherFarmIncome: "2500.49",
          accrualBeginningInventory: "15000.49",
          accrualPurchasesDuringYear: "18000.50",
          accrualEndingInventory: "12000.49",
          expenses: {
            feed: "5000",
          },
        },
      }));

      expect(result.scheduleF?.line51.toNumber()).toBe(55702);
      expect(result.scheduleF?.line12.toNumber()).toBe(55702);
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(50702);
      expect(result.pa40.taxLiability.toNumber()).toBe(1557);
    });

    it("PA orchestrator combines Schedule C and Schedule F in business income", () => {
      const result = calculatePAReturn(makeInput({
        scheduleC: {
          grossReceipts: "60000",
          expenses: {
            advertising: "2000",
            supplies: "3000",
            otherExpenses: "5000",
          },
        },
        scheduleF: {
          salesOfProductsRaised: "40000",
          expenses: {
            feed: "10000",
            seedsAndPlants: "5000",
          },
        },
      }));
      // Schedule C: $60,000 - $10,000 = $50,000
      // Schedule F: $40,000 - $15,000 = $25,000
      // Total business income: $75,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(75000);
    });

    it("PA orchestrator handles Schedule F farm loss", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "40000",
          federalWithheld: "5000",
          stateTaxWithheld: "1228",
          state: "PA",
        }],
        scheduleF: {
          salesOfProductsRaised: "10000",
          expenses: {
            feed: "15000",
            seedsAndPlants: "8000",
          },
        },
      }));
      // Farm: $10,000 - $23,000 = -$13,000 (loss)
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(-13000);
      // PA loss limitation: business loss clamped to 0 for total
      // Total PA taxable: $40,000 (wages only)
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(40000);
    });

    it("PA orchestrator handles no Schedule F gracefully", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "50000",
          federalWithheld: "7000",
          stateTaxWithheld: "1535",
          state: "PA",
        }],
      }));
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Local EIT Integration
  // =================================================================

  describe.sequential("Local EIT Integration", () => {
    it("PA orchestrator maps W-2 local withholding", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [
          {
            employer: { name: "Job A", ein: "12-3456789" },
            wages: "50000",
            federalWithheld: "7000",
            stateTaxWithheld: "1535",
            localTaxWithheld: "500",
            state: "PA",
          },
          {
            employer: { name: "Job B", ein: "98-7654321" },
            wages: "25000",
            federalWithheld: "3500",
            stateTaxWithheld: "768",
            localTaxWithheld: "250",
            state: "PA",
          },
        ],
      }));
      expect(result.localWithholding.toNumber()).toBe(750);
    });

    it("PA orchestrator computes local EIT when rate provided", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Corp", ein: "12-3456789" },
            wages: "80000",
            federalWithheld: "12000",
            stateTaxWithheld: "2456",
            localTaxWithheld: "800",
            state: "PA",
          }],
        }),
        {
          localMunicipality: "Springfield Township",
          localEITRate: d("0.01"), // 1%
        },
      );
      // Local EIT: $80,000 × 1% = $800
      expect(result.localEIT).toBeDefined();
      expect(result.localEIT!.computedLocalTax.toNumber()).toBe(800);
      expect(result.localEIT!.localWithholding.toNumber()).toBe(800);
      // Exact withholding → no balance due or overpayment
      expect(result.localEIT!.balanceDue.toNumber()).toBe(0);
      expect(result.localEIT!.overpayment.toNumber()).toBe(0);
    });

    it("PA orchestrator local EIT uses W-2 Box 18 local wages when available", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Corp", ein: "12-3456789" },
            wages: "80000",
            federalWithheld: "12000",
            stateWages: "76000",
            stateTaxWithheld: "2333",
            localWages: "72000",
            localTaxWithheld: "720",
            state: "PA",
          }],
        }),
        {
          localMunicipality: "Springfield Township",
          localEITRate: d("0.01"),
        },
      );

      expect(result.localEIT).toBeDefined();
      expect(result.localEIT!.compensation.toNumber()).toBe(72000);
      expect(result.localEIT!.computedLocalTax.toNumber()).toBe(720);
      expect(result.localEIT!.balanceDue.toNumber()).toBe(0);
      expect(result.localEIT!.overpayment.toNumber()).toBe(0);
    });

    it("PA orchestrator local EIT includes SE income", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Corp", ein: "12-3456789" },
            wages: "50000",
            federalWithheld: "7000",
            stateTaxWithheld: "1535",
            localTaxWithheld: "500",
            state: "PA",
          }],
          scheduleC: {
            grossReceipts: "30000",
          },
        }),
        {
          localMunicipality: "Test Township",
          localEITRate: d("0.01"),
        },
      );
      // Earned income: $50,000 (W-2) + $30,000 (SE) = $80,000
      // Local EIT: $80,000 × 1% = $800
      expect(result.localEIT!.totalEarnedIncome.toNumber()).toBe(80000);
      expect(result.localEIT!.computedLocalTax.toNumber()).toBe(800);
      // Withholding only covers W-2 portion: $500
      // Balance due: $800 - $500 = $300
      expect(result.localEIT!.balanceDue.toNumber()).toBe(300);
    });

    it("PA orchestrator local EIT with business loss floors SE at zero", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Corp", ein: "12-3456789" },
            wages: "60000",
            federalWithheld: "8000",
            stateTaxWithheld: "1842",
            localTaxWithheld: "600",
            state: "PA",
          }],
          scheduleC: {
            grossReceipts: "10000",
            expenses: { otherExpenses: "25000" },
          },
        }),
        {
          localMunicipality: "Test Township",
          localEITRate: d("0.01"),
        },
      );
      // Business: $10,000 - $25,000 = -$15,000 (SE floors at 0)
      // Earned income: $60,000 + $0 = $60,000
      // Local EIT: $60,000 × 1% = $600
      expect(result.localEIT!.totalEarnedIncome.toNumber()).toBe(60000);
      expect(result.localEIT!.computedLocalTax.toNumber()).toBe(600);
      expect(result.localEIT!.balanceDue.toNumber()).toBe(0);
    });

    it("PA orchestrator does not compute local EIT without rate", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "80000",
          federalWithheld: "12000",
          stateTaxWithheld: "2456",
          localTaxWithheld: "800",
          state: "PA",
        }],
      }));
      // No localEITRate override → no local EIT computation
      expect(result.localEIT).toBeUndefined();
      // But local withholding is still extracted
      expect(result.localWithholding.toNumber()).toBe(800);
    });

    it("PA orchestrator rejects Philadelphia local EIT because the city uses a separate wage tax", () => {
      expect(() => calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Corp", ein: "12-3456789" },
            wages: "80000",
            federalWithheld: "12000",
            stateTaxWithheld: "2456",
            localTaxWithheld: "800",
            state: "PA",
          }],
        }),
        {
          localMunicipality: "Philadelphia",
          localEITRate: d("0.01"),
        },
      )).toThrow(
        "Philadelphia uses a separate Wage Tax and is not supported by the PA Local EIT module",
      );
    });

    it("PA orchestrator local EIT with nonresident credit", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Corp", ein: "12-3456789" },
            wages: "90000",
            federalWithheld: "13000",
            stateTaxWithheld: "2763",
            localTaxWithheld: "0",
            state: "PA",
          }],
        }),
        {
          localMunicipality: "Abington Township",
          localEITRate: d("0.01"), // 1%
          localNonresidentCredits: [{
            municipality: "Philadelphia",
            incomeInWorkMunicipality: d(90000),
            taxPaidToWorkMunicipality: d(2700), // Philly nonresident ~3%
          }],
        },
      );
      // Computed: $90,000 × 1% = $900
      // Credit: min($2,700, $900) = $900
      // Net: $0
      expect(result.localEIT!.computedLocalTax.toNumber()).toBe(900);
      expect(result.localEIT!.nonresidentCredit.toNumber()).toBe(900);
      expect(result.localEIT!.netLocalTax.toNumber()).toBe(0);
    });

    it("PA orchestrator local EIT end-to-end with state and local", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "PA Corp", ein: "12-3456789" },
            wages: "85000",
            federalWithheld: "12000",
            stateWages: "85000",
            stateTaxWithheld: "2610",
            localTaxWithheld: "850",
            state: "PA",
          }],
          form1099Int: [{ payer: "Bank", interestIncome: "250" }],
        }),
        {
          localMunicipality: "Media Borough",
          localEITRate: d("0.01"), // 1%
        },
      );
      // State: PA taxable $85,250; tax $2,617; withheld $2,610; owed $7
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(85250);
      expect(result.pa40.taxLiability.toNumber()).toBe(2617);
      expect(result.pa40.amountOwed.toNumber()).toBe(7);

      // Local: earned income $85,000 (only compensation, not interest)
      // Tax: $85,000 × 1% = $850; withheld $850; exact match
      expect(result.localEIT!.totalEarnedIncome.toNumber()).toBe(85000);
      expect(result.localEIT!.computedLocalTax.toNumber()).toBe(850);
      expect(result.localEIT!.balanceDue.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Schedule SD Integration
  // =================================================================

  describe.sequential("Schedule SD Integration", () => {
    it("PA orchestrator computes Schedule SD when school district inputs are provided", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Employer", ein: "12-3456789" },
            wages: "50000",
            federalWithheld: "6500",
            stateWages: "50000",
            stateTaxWithheld: "1535",
            state: "PA",
          }],
          scheduleC: {
            grossReceipts: "10000",
          },
        }),
        {
          unreimbursedExpenses: d(2000),
          otherDeductions: d(3000),
          scheduleSD: {
            method: "EI",
            schoolDistrictRate: d("0.01"),
            schoolDistrictWithholding: d(500),
            estimatedPayments: d(25),
          },
        },
      );

      expect(result.scheduleSD).toBeDefined();
      expect(result.scheduleSD!.eiTaxBase.toNumber()).toBe(58000);
      expect(result.scheduleSD!.adjustedTaxBase.toNumber()).toBe(55000);
      expect(result.scheduleSD!.grossTax.toNumber()).toBe(550);
      expect(result.scheduleSD!.totalPaymentsAndCredits.toNumber()).toBe(525);
      expect(result.scheduleSD!.amountOwed.toNumber()).toBe(25);
      expect(result.scheduleSD!.overpayment.toNumber()).toBe(0);
    });

    it("PA orchestrator Schedule SD PSD method uses PA taxable income and Schedule SP forgiveness", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Part Time Job", ein: "98-7654321" },
            wages: "6000",
            federalWithheld: "300",
            stateWages: "6000",
            stateTaxWithheld: "184",
            state: "PA",
          }],
        }),
        {
          scheduleSD: {
            method: "PSD",
            schoolDistrictRate: d("0.01"),
            schoolDistrictWithholding: d(15),
            estimatedPayments: d(5),
          },
        },
      );

      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.scheduleSD).toBeDefined();
      expect(result.scheduleSD!.psdTaxBase.toNumber()).toBe(6000);
      expect(result.scheduleSD!.grossTax.toNumber()).toBe(60);
      expect(result.scheduleSD!.forgivenessCredit.toNumber()).toBe(60);
      expect(result.scheduleSD!.netTax.toNumber()).toBe(0);
      expect(result.scheduleSD!.overpayment.toNumber()).toBe(20);
      expect(result.scheduleSD!.amountOwed.toNumber()).toBe(0);
    });

    it("PA orchestrator leaves Schedule SD undefined without school district inputs", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Employer", ein: "12-3456789" },
          wages: "40000",
          federalWithheld: "4000",
          stateWages: "40000",
          stateTaxWithheld: "1228",
          state: "PA",
        }],
      }));

      expect(result.scheduleSD).toBeUndefined();
    });
  });

  // =================================================================
  // Schedule O Integration
  // =================================================================

  describe.sequential("Schedule O Integration", () => {
    it("PA orchestrator computes Schedule O and prefers it over raw other deductions", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Employer", ein: "12-3456789" },
            wages: "20000",
            federalWithheld: "2500",
            stateWages: "20000",
            stateTaxWithheld: "614",
            state: "PA",
          }],
        }),
        {
          otherDeductions: d(9999),
          scheduleO: {
            qualifiedTuitionContributions: [
              {
                beneficiaryName: "Alex Student",
                beneficiarySSN: "111-11-1111",
                taxpayerContribution: d(1000),
              },
            ],
            studentLoanInterestDeduction: d(3000),
          },
        },
      );

      expect(result.scheduleO).toBeDefined();
      expect(result.scheduleO!.totalOtherDeductions.toNumber()).toBe(3500);
      expect(result.pa40.otherDeductions.toNumber()).toBe(3500);
      expect(result.pa40.adjustedPATaxableIncome.toNumber()).toBe(16500);
    });

    it("PA orchestrator auto-derives non-joint Schedule O federal-allowed deductions from Schedule 1", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Employer", ein: "12-3456789" },
          wages: "20000",
          federalWithheld: "2500",
          stateWages: "20000",
          stateTaxWithheld: "614",
          state: "PA",
        }],
        adjustments: {
          hsaDeduction: "1800",
          archerMSADeduction: "400",
          studentLoanInterest: "2300",
        },
      }));

      expect(result.scheduleO).toBeDefined();
      expect(result.scheduleO!.healthSavingsAccountDeduction.toNumber()).toBe(1800);
      expect(result.scheduleO!.medicalSavingsAccountDeduction.toNumber()).toBe(400);
      expect(result.scheduleO!.studentLoanInterestDeduction.toNumber()).toBe(2300);
      expect(result.scheduleO!.totalOtherDeductions.toNumber()).toBe(4500);
      expect(result.pa40.otherDeductions.toNumber()).toBe(4500);
      expect(result.pa40.adjustedPATaxableIncome.toNumber()).toBe(15500);
    });

    it("PA orchestrator lets explicit Schedule O deductions override federal Schedule 1 defaults", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Employer", ein: "12-3456789" },
          wages: "20000",
          federalWithheld: "2500",
          stateWages: "20000",
          stateTaxWithheld: "614",
          state: "PA",
        }],
        adjustments: {
          hsaDeduction: "1800",
          archerMSADeduction: "400",
          studentLoanInterest: "2300",
        },
      }), {
        scheduleO: {
          qualifiedTuitionContributions: [
            {
              beneficiaryName: "Alex Student",
              beneficiarySSN: "111-11-1111",
              taxpayerContribution: d(500),
            },
          ],
          studentLoanInterestDeduction: d(1000),
        },
      });

      expect(result.scheduleO).toBeDefined();
      expect(result.scheduleO!.healthSavingsAccountDeduction.toNumber()).toBe(1800);
      expect(result.scheduleO!.medicalSavingsAccountDeduction.toNumber()).toBe(400);
      expect(result.scheduleO!.studentLoanInterestDeduction.toNumber()).toBe(1000);
      expect(result.scheduleO!.totalOtherDeductions.toNumber()).toBe(3700);
      expect(result.pa40.otherDeductions.toNumber()).toBe(3700);
      expect(result.pa40.adjustedPATaxableIncome.toNumber()).toBe(16300);
    });
  });

  // =================================================================
  // Comprehensive End-to-End Integration Tests
  // =================================================================

  describe.sequential("Comprehensive End-to-End Integration", () => {
    it("PA orchestrator end-to-end: diversified income across all 8 classes", () => {
      // A PA resident with income in all 8 classes, plus retirement, other state,
      // and local EIT — exercises the full pipeline
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Main Employer", ein: "11-1111111" },
            wages: "92000",
            federalWithheld: "15000",
            stateWages: "92000",
            stateTaxWithheld: "2824",
            localTaxWithheld: "920",
            state: "PA",
          }],
          form1099Int: [
            { payer: "Bank A", interestIncome: "1200" },
            { payer: "Bank B", interestIncome: "800" },
          ],
          form1099Div: [
            { payer: "Vanguard", ordinaryDividends: "3500", qualifiedDividends: "2800", totalCapitalGainDistributions: "1500" },
          ],
          form1099B: [{
            broker: "Schwab",
            transactions: [
              { description: "AAPL", proceeds: "15000", costBasis: "10000", holdingPeriod: "long" },
              { description: "TSLA", proceeds: "8000", costBasis: "12000", holdingPeriod: "short" },
            ],
          }],
          form1099Misc: [
            { payer: "Book Publisher", royalties: "4500" },
          ],
          formW2G: [
            { payer: "Mount Airy Casino", reportableWinnings: "2000", state: "PA", stateWithheld: "61" },
          ],
          scheduleK1: [{
            partnershipName: "Side Business LP",
            partnershipEIN: "22-2222222",
            ordinaryIncome: "8000",
            guaranteedPayments: "3000",
            interestIncome: "200",
            netRentalIncome: "2500",
          }],
          form1099R: [
            // Normal retirement distribution — PA exempt
            { grossDistribution: "18000", taxableAmount: "18000", distributionCode: "7" },
          ],
        }),
        {
          otherStateCredits: [{
            stateCode: "NJ",
            incomeTaxableByBothStates: d(15000),
            taxPaidToOtherState: d(600),
          }],
          localMunicipality: "Lower Merion Township",
          localEITRate: d("0.015"), // 1.5%
        },
      );

      // ---------------------------------------------------------------
      // Income class verification
      // ---------------------------------------------------------------

      // Class 1 — Compensation: $92,000 (W-2)
      expect(result.mappedIncome.compensation.toNumber()).toBe(92000);

      // Class 2 — Interest: $1,200 + $800 + $200 (K-1) = $2,200
      expect(result.mappedIncome.interest.toNumber()).toBe(2200);

      // Class 3 — Dividends: $3,500 ordinary + $1,500 cap gain distributions = $5,000
      expect(result.mappedIncome.dividends.toNumber()).toBe(5000);

      // Class 4 — Business: K-1 ordinary ($8,000) + guaranteed ($3,000) = $11,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(11000);

      // Class 5 — Net gains: 1099-B ($15K-$10K) + ($8K-$12K) = $1,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(1000);

      // Class 6 — Rental/royalties: K-1 rental ($2,500) + 1099-MISC royalties ($4,500) = $7,000
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(7000);

      // Class 7 — Estate/trust: $0 (not provided)
      expect(result.mappedIncome.estateTrustIncome.toNumber()).toBe(0);

      // Class 8 — Gambling: $2,000 (W-2G)
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(2000);

      // ---------------------------------------------------------------
      // PA-40 totals
      // ---------------------------------------------------------------

      // Total PA taxable income: $92,000 + $2,200 + $3,500 + $11,000 + $2,500 + $7,000 + $0 + $2,000 = $120,200
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(120200);

      // Tax liability: $120,200 × 3.07% = $3,690.14 → $3,690
      expect(result.pa40.taxLiability.toNumber()).toBe(3690);

      // ---------------------------------------------------------------
      // Schedule SP — Tax Forgiveness
      // ---------------------------------------------------------------

      // Eligibility income = $120,200 (taxable) + $18,000 (exempt 1099-R) = $138,200
      // Way above forgiveness thresholds → 0% forgiveness
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
      expect(result.scheduleSP.taxForgivenessCredit.toNumber()).toBe(0);

      // ---------------------------------------------------------------
      // Schedule G-L — Resident Credit
      // ---------------------------------------------------------------

      // NJ: PA tax on $15,000 shared = $15,000 × 3.07% = $460.50 → $461
      // Credit = min($600 paid, $461 PA tax) = $461
      expect(result.scheduleGL.perStateResults[0].credit.toNumber()).toBe(461);
      expect(result.scheduleGL.totalCredit.toNumber()).toBe(461);

      // ---------------------------------------------------------------
      // PA-40 final: credits, payments, refund/owed
      // ---------------------------------------------------------------

      // Total credits: $0 (SP) + $461 (G-L) + $0 (other) = $461
      expect(result.pa40.totalCredits.toNumber()).toBe(461);

      // Net tax: $3,690 - $461 = $3,229
      expect(result.pa40.netTaxLiability.toNumber()).toBe(3229);

      // Total withholding: $2,824 (W-2) + $61 (W-2G) = $2,885
      expect(result.stateWithholding.toNumber()).toBe(2885);
      expect(result.pa40.totalPayments.toNumber()).toBe(2885);

      // The resident credit reduces tax liability, but only withholding is on the payment side.
      expect(result.pa40.amountOwed.toNumber()).toBe(344);
      expect(result.pa40.overpayment.toNumber()).toBe(0);

      // ---------------------------------------------------------------
      // Local EIT
      // ---------------------------------------------------------------

      // Earned income: $92,000 (compensation) + $11,000 (business) = $103,000
      // Local tax: $103,000 × 1.5% = $1,545
      expect(result.localEIT!.totalEarnedIncome.toNumber()).toBe(103000);
      expect(result.localEIT!.computedLocalTax.toNumber()).toBe(1545);
      // W-2 local withholding: $920
      expect(result.localEIT!.localWithholding.toNumber()).toBe(920);
      // Balance due: $1,545 - $920 = $625
      expect(result.localEIT!.balanceDue.toNumber()).toBe(625);
    });

    it("PA orchestrator end-to-end: low-income with full tax forgiveness", () => {
      // Single filer with 2 dependents, low income → should get 100% tax forgiveness
      const result = calculatePAReturn(
        makeInput({
          taxpayer: {
            taxYear: 2025,
            filingStatus: "single",
            primary: { firstName: "Jane", lastName: "Doe", ssn: "000-00-0002", dateOfBirth: "1990-06-15" },
            address: { street: "200 Elm St", city: "Scranton", state: "PA", zip: "18503" },
            dependents: [
              { firstName: "Child", lastName: "Doe", ssn: "000-00-0003", dateOfBirth: "2015-03-01", relationship: "son" },
              { firstName: "Child2", lastName: "Doe", ssn: "000-00-0004", dateOfBirth: "2018-07-01", relationship: "daughter" },
            ],
          },
          w2s: [{
            employer: { name: "Part Time LLC", ein: "33-3333333" },
            wages: "18000",
            federalWithheld: "1500",
            stateWages: "18000",
            stateTaxWithheld: "553",
            state: "PA",
          }],
        }),
      );

      // PA taxable income: $18,000 (compensation only)
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(18000);

      // Tax: $18,000 × 3.07% = $552.60 → $553
      expect(result.pa40.taxLiability.toNumber()).toBe(553);

      // Schedule SP: unmarried, 2 dependents
      // Base threshold: $6,500 + (2 × $9,500) = $25,500
      // Eligibility income: $18,000 < $25,500 → 100% forgiveness
      expect(result.scheduleSP.baseThreshold.toNumber()).toBe(25500);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.scheduleSP.taxForgivenessCredit.toNumber()).toBe(553);

      // Net tax: $553 - $553 = $0
      expect(result.pa40.netTaxLiability.toNumber()).toBe(0);

      const wptc = result.workingPennsylvaniansTaxCredit?.credit.toNumber() ?? 0;
      // Withholding is on the payment side; tax forgiveness zeroes the tax liability.
      expect(result.pa40.overpayment.toNumber()).toBe(553 + wptc);
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
    });

    it("PA orchestrator end-to-end: MFJ with partial tax forgiveness", () => {
      // Married filing jointly, 1 dependent, income near forgiveness threshold
      const result = calculatePAReturn(
        makeInput({
          taxpayer: {
            taxYear: 2025,
            filingStatus: "married_filing_jointly",
            primary: { firstName: "John", lastName: "Smith", ssn: "000-00-0005", dateOfBirth: "1980-01-01" },
            spouse: { firstName: "Mary", lastName: "Smith", ssn: "000-00-0006", dateOfBirth: "1982-03-15" },
            address: { street: "300 Pine St", city: "Allentown", state: "PA", zip: "18101" },
            dependents: [
              { firstName: "Kid", lastName: "Smith", ssn: "000-00-0007", dateOfBirth: "2016-09-10", relationship: "son" },
            ],
          },
          w2s: [{
            employer: { name: "Factory Inc", ein: "44-4444444" },
            wages: "22000",
            federalWithheld: "2000",
            stateWages: "22000",
            stateTaxWithheld: "675",
            state: "PA",
          }],
          formSSA1099: [
            { payerName: "SSA", netBenefits: "6000" },
          ],
        }),
      );

      // PA taxable income: $22,000
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(22000);

      // Tax: $22,000 × 3.07% = $675.40 → $675
      expect(result.pa40.taxLiability.toNumber()).toBe(675);

      // Schedule SP: married, 1 dependent
      // Base threshold: $13,000 + (1 × $9,500) = $22,500
      // Eligibility income excludes Social Security, so the wages stay within the 100% tier.
      expect(result.scheduleSP.baseThreshold.toNumber()).toBe(22500);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(22000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);

      expect(result.pa40.netTaxLiability.toNumber()).toBe(0);
      const wptc = result.workingPennsylvaniansTaxCredit?.credit.toNumber() ?? 0;
      // Withholding plus any refundable WPTC now show up entirely as overpayment.
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
      expect(result.pa40.overpayment.toNumber()).toBe(675 + wptc);
    });

    it("PA orchestrator end-to-end: MFJ near forgiveness boundary with partial credit", () => {
      // Married, 1 dependent: base $22,500, eligibility near the 50% tier
      const result = calculatePAReturn(
        makeInput({
          taxpayer: {
            taxYear: 2025,
            filingStatus: "married_filing_jointly",
            primary: { firstName: "A", lastName: "B", ssn: "000-00-0010", dateOfBirth: "1985-01-01" },
            spouse: { firstName: "C", lastName: "B", ssn: "000-00-0011", dateOfBirth: "1986-01-01" },
            address: { street: "10 Test Rd", city: "Erie", state: "PA", zip: "16501" },
            dependents: [
              { firstName: "D", lastName: "B", ssn: "000-00-0012", dateOfBirth: "2017-01-01", relationship: "daughter" },
            ],
          },
          w2s: [{
            employer: { name: "Emp", ein: "55-5555555" },
            wages: "23500",
            federalWithheld: "2000",
            stateWages: "23500",
            stateTaxWithheld: "722",
            state: "PA",
          }],
        }),
      );

      // PA taxable income: $23,500
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(23500);

      // Tax: $23,500 × 3.07% = $721.45 → $721
      expect(result.pa40.taxLiability.toNumber()).toBe(721);

      // Schedule SP: married, 1 dep
      // Base: $22,500; eligibility: $23,500
      // $23,500 > $22,500 (100%) but ≤ $22,750 (90%)? No, $23,500 > $22,750
      // ≤ $23,000 (80%)? No, $23,500 > $23,000
      // ≤ $23,250 (70%)? No, $23,500 > $23,250
      // ≤ $23,500 (60%)? Yes! → 60% forgiveness
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(60);

      // Credit: $721 × 60% = $432.60 → $433
      expect(result.scheduleSP.taxForgivenessCredit.toNumber()).toBe(433);

      // Net tax: $721 - $433 = $288
      expect(result.pa40.netTaxLiability.toNumber()).toBe(288);

      // Withholding produces the refund after partial forgiveness reduces net tax.
      expect(result.pa40.overpayment.toNumber()).toBe(455);
    });

    it("PA orchestrator end-to-end: retiree with fully exempt retirement income", () => {
      // Retiree with only pension and Social Security — both PA-exempt
      const result = calculatePAReturn(
        makeInput({
          form1099R: [
            // Normal retirement distribution (code 7) — PA exempt
            { grossDistribution: "48000", taxableAmount: "48000", distributionCode: "7" },
          ],
          formSSA1099: [
            { payerName: "SSA", netBenefits: "24000" },
          ],
          form1099Int: [
            { payer: "Credit Union", interestIncome: "350" },
          ],
        }),
      );

      // Only Class 2 interest is taxable: $350
      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.mappedIncome.interest.toNumber()).toBe(350);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(350);

      // Tax: $350 × 3.07% = $10.745 → $11
      expect(result.pa40.taxLiability.toNumber()).toBe(11);

      // Schedule SP eligibility excludes Social Security and ordinary post-retirement pension income.
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(350);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);

      // Full tax forgiveness reduces the balance due to zero.
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
    });

    it("PA orchestrator end-to-end: business owner with losses in some classes", () => {
      // Business owner with net business loss and rental loss — losses don't cross classes
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Day Job", ein: "66-6666666" },
            wages: "45000",
            federalWithheld: "5000",
            stateWages: "45000",
            stateTaxWithheld: "1382",
            state: "PA",
          }],
          scheduleC: {
            businessName: "Failed Startup",
            principalActivity: "Consulting",
            grossReceipts: "20000",
            returnsAndAllowances: "0",
            costOfGoodsSold: "0",
            expenses: {
              advertising: "3000",
              contractLabor: "15000",
              officeExpense: "5000",
              supplies: "2000",
            },
          },
          rentalProperties: [{
            description: "789 Maple Ave",
            rents: "12000",
            insurance: "1800",
            mortgageInterest: "9000",
            taxes: "3600",
            repairs: "4000",
            depreciation: "5000",
          }],
          form1099Int: [{ payer: "Savings", interestIncome: "500" }],
        }),
      );

      // Class 1 — Compensation: $45,000
      expect(result.mappedIncome.compensation.toNumber()).toBe(45000);

      // Class 2 — Interest: $500
      expect(result.mappedIncome.interest.toNumber()).toBe(500);

      // Class 4 — Business: $20,000 - ($3,000 + $15,000 + $5,000 + $2,000) = -$5,000
      expect(result.mappedIncome.netBusinessIncome.toNumber()).toBe(-5000);

      // Class 6 — Rental: $12,000 - ($1,800 + $9,000 + $3,600 + $4,000 + $5,000) = -$11,400
      expect(result.mappedIncome.netRentalIncome.toNumber()).toBe(-11400);

      // Total PA taxable: $45,000 + $500 + max(0, -$5,000) + max(0, -$11,400) = $45,500
      // Losses clamped to 0 — don't offset other classes
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(45500);

      // Tax: $45,500 × 3.07% = $1,396.85 → $1,397
      expect(result.pa40.taxLiability.toNumber()).toBe(1397);

      // Net tax (no credits): $1,397
      expect(result.pa40.netTaxLiability.toNumber()).toBe(1397);

      // Withholding $1,382 → owed $15
      expect(result.pa40.amountOwed.toNumber()).toBe(15);
    });

    it("PA orchestrator end-to-end: NJ commuter with full resident credit offset", () => {
      // PA resident working entirely in NJ — G-L credit should offset most/all PA tax
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "NJ Corp", ein: "77-7777777" },
            wages: "110000",
            federalWithheld: "18000",
            stateWages: "110000",
            stateTaxWithheld: "3377", // PA withholding
            state: "PA",
          }],
        }),
        {
          otherStateCredits: [{
            stateCode: "NJ",
            incomeTaxableByBothStates: d(110000),
            taxPaidToOtherState: d(4500), // NJ tax on $110K
          }],
        },
      );

      // Class 1: $110,000
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(110000);

      // Tax: $110,000 × 3.07% = $3,377
      expect(result.pa40.taxLiability.toNumber()).toBe(3377);

      // G-L: PA tax on shared = $110,000 × 3.07% = $3,377
      // Credit = min($4,500, $3,377) = $3,377
      expect(result.scheduleGL.perStateResults[0].credit.toNumber()).toBe(3377);

      // Net tax: $3,377 - $3,377 = $0
      expect(result.pa40.netTaxLiability.toNumber()).toBe(0);

      // The resident credit zeroes the tax liability; only withholding creates the refund.
      expect(result.pa40.overpayment.toNumber()).toBe(3377);
    });
  });

  // =================================================================
  // Schedule UE Integration
  // =================================================================

  describe.sequential("Schedule UE Integration", () => {
    it("PA orchestrator computes Schedule UE when detailed input provided", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "80000",
            federalWithheld: "12000",
            stateWages: "80000",
            stateTaxWithheld: "2456",
            state: "PA",
          }],
        }),
        {
          scheduleUE: {
            taxYear: 2025,
            vehicle: {
              method: "standard",
              totalMiles: 15000,
              businessMiles: 8000,
            },
            otherExpenses: {
              unionDues: d(600),
            },
          },
        },
      );

      // Schedule UE computed
      expect(result.scheduleUE).toBeDefined();
      // Vehicle: 8,000 × $0.70 = $5,600 + union dues $600 = $6,200
      expect(result.scheduleUE!.netUnreimbursedExpenses.toNumber()).toBe(6200);

      // PA-40 Line 1b should use Schedule UE result
      expect(result.pa40.unreimbursedExpenses.toNumber()).toBe(6200);
      // Net compensation: $80,000 - $6,200 = $73,800
      expect(result.pa40.netCompensation.toNumber()).toBe(73800);
    });

    it("PA orchestrator falls back to raw unreimbursedExpenses when no scheduleUE", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "60000",
            federalWithheld: "8000",
            stateWages: "60000",
            stateTaxWithheld: "1842",
            state: "PA",
          }],
        }),
        {
          unreimbursedExpenses: d(3000),
        },
      );

      // No Schedule UE computed
      expect(result.scheduleUE).toBeUndefined();
      // Raw override used
      expect(result.pa40.unreimbursedExpenses.toNumber()).toBe(3000);
      expect(result.pa40.netCompensation.toNumber()).toBe(57000);
    });

    it("PA orchestrator Schedule UE overrides raw unreimbursedExpenses", () => {
      // When both are provided, scheduleUE takes precedence
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "70000",
            federalWithheld: "9000",
            stateWages: "70000",
            stateTaxWithheld: "2149",
            state: "PA",
          }],
        }),
        {
          unreimbursedExpenses: d(9999), // Should be ignored
          scheduleUE: {
            taxYear: 2025,
            otherExpenses: {
              toolsAndSupplies: d(500),
              workClothing: d(200),
            },
          },
        },
      );

      expect(result.scheduleUE).toBeDefined();
      expect(result.pa40.unreimbursedExpenses.toNumber()).toBe(700); // $500 + $200
      expect(result.pa40.netCompensation.toNumber()).toBe(69300);
    });

    it("PA orchestrator Schedule UE with employer reimbursements reduces deduction", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "65000",
            federalWithheld: "8000",
            stateWages: "65000",
            stateTaxWithheld: "1996",
            state: "PA",
          }],
        }),
        {
          scheduleUE: {
            taxYear: 2025,
            vehicle: {
              method: "standard",
              totalMiles: 10000,
              businessMiles: 5000,
              parkingAndTolls: d(300),
            },
            employerReimbursements: d(2000),
          },
        },
      );

      // Vehicle: 5,000 × $0.70 = $3,500 + $300 = $3,800
      // Net: $3,800 - $2,000 reimbursement = $1,800
      expect(result.scheduleUE!.totalExpenses.toNumber()).toBe(3800);
      expect(result.scheduleUE!.netUnreimbursedExpenses.toNumber()).toBe(1800);
      expect(result.pa40.unreimbursedExpenses.toNumber()).toBe(1800);
      expect(result.pa40.netCompensation.toNumber()).toBe(63200);
    });

    it("PA orchestrator Schedule UE end-to-end with tax impact", () => {
      // Full scenario: W-2 employee with UE reduces tax
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "School District", ein: "12-3456789" },
            wages: "55000",
            federalWithheld: "7000",
            stateWages: "55000",
            stateTaxWithheld: "1689",
            state: "PA",
          }],
        }),
        {
          scheduleUE: {
            taxYear: 2025,
            travel: {
              lodging: d(1000),
              meals: d(400),
              otherTravel: d(500),
            },
            otherExpenses: {
              education: d(2000),
              toolsAndSupplies: d(500),
              subscriptions: d(100),
            },
          },
        },
      );

      // Travel: $1,000 + ($400 × 50%) + $500 = $1,700
      // Other: $2,000 + $500 + $100 = $2,600
      // Total UE: $4,300
      expect(result.scheduleUE!.netUnreimbursedExpenses.toNumber()).toBe(4300);

      // Compensation: $55,000 - $4,300 = $50,700
      expect(result.pa40.netCompensation.toNumber()).toBe(50700);
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(50700);

      // Tax: $50,700 × 3.07% = $1,556.49 → $1,556
      expect(result.pa40.taxLiability.toNumber()).toBe(1556);

      // Withholding: $1,689, Net tax: $1,556
      // Overpayment: $1,689 - $1,556 = $133
      expect(result.pa40.overpayment.toNumber()).toBe(133);
    });

    it("PA orchestrator Schedule UE with home office and high-mileage", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Tech Co", ein: "12-3456789" },
            wages: "95000",
            federalWithheld: "15000",
            stateWages: "95000",
            stateTaxWithheld: "2917",
            state: "PA",
          }],
        }),
        {
          scheduleUE: {
            taxYear: 2025,
            vehicle: {
              method: "standard",
              totalMiles: 25000,
              businessMiles: 18000,
            },
            otherExpenses: {
              homeOffice: d(3600),
              subscriptions: d(240),
            },
          },
        },
      );

      // Vehicle: 18,000 × $0.70 = $12,600
      // Other: $3,600 + $240 = $3,840
      // Total UE: $16,440
      expect(result.scheduleUE!.netUnreimbursedExpenses.toNumber()).toBe(16440);
      expect(result.pa40.netCompensation.toNumber()).toBe(78560);
      // Tax: $78,560 × 3.07% = $2,411.79 → $2,412
      expect(result.pa40.taxLiability.toNumber()).toBe(2412);
    });

    it("PA orchestrator Schedule UE with zero expenses produces no deduction", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "50000",
            federalWithheld: "7000",
            stateWages: "50000",
            stateTaxWithheld: "1535",
            state: "PA",
          }],
        }),
        {
          scheduleUE: {
            taxYear: 2025,
            // No expenses provided
          },
        },
      );

      expect(result.scheduleUE).toBeDefined();
      expect(result.scheduleUE!.netUnreimbursedExpenses.toNumber()).toBe(0);
      expect(result.pa40.unreimbursedExpenses.toNumber()).toBe(0);
      expect(result.pa40.netCompensation.toNumber()).toBe(50000);
    });
  });

  // =================================================================
  // Schedule OC Integration
  // =================================================================

  describe.sequential("Schedule OC Integration", () => {
    it("PA orchestrator computes Schedule OC when detailed input provided", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "100000",
            federalWithheld: "15000",
            stateWages: "100000",
            stateTaxWithheld: "3070",
            state: "PA",
          }],
        }),
        {
          scheduleOC: {
            pteCredits: [{
              entityName: "Alpha Partners",
              entityEIN: "11-1111111",
              allocablePAIncome: d(50000),
              pteTaxPaid: d(1535),
            }],
          },
        },
      );

      // Schedule OC computed
      expect(result.scheduleOC).toBeDefined();
      expect(result.scheduleOC!.totalPTECredit.toNumber()).toBe(1535);
      expect(result.scheduleOC!.totalOtherCredits.toNumber()).toBe(1535);

      // PA-40 Line 21 should use Schedule OC result
      expect(result.pa40.otherCredits.toNumber()).toBe(1535);
      // Total credits includes Schedule OC
      expect(result.pa40.totalCredits.toNumber()).toBeGreaterThanOrEqual(1535);
    });

    it("PA orchestrator falls back to raw otherCredits when no scheduleOC", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "80000",
            federalWithheld: "10000",
            stateWages: "80000",
            stateTaxWithheld: "2456",
            state: "PA",
          }],
        }),
        {
          otherCredits: d(500),
        },
      );

      // No Schedule OC computed
      expect(result.scheduleOC).toBeUndefined();
      // Raw override used
      expect(result.pa40.otherCredits.toNumber()).toBe(500);
    });

    it("PA orchestrator Schedule OC with PTE credit reduces tax owed", () => {
      // $200K income → PA tax = $6,140
      // PTE credit = $3,070 (from $100K allocable income)
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "200000",
            federalWithheld: "30000",
            stateWages: "200000",
            stateTaxWithheld: "6140",
            state: "PA",
          }],
        }),
        {
          scheduleOC: {
            pteCredits: [{
              entityName: "Beta LLC",
              entityEIN: "22-2222222",
              allocablePAIncome: d(100000),
              pteTaxPaid: d(3070),
            }],
          },
        },
      );

      // Tax liability: $200K × 3.07% = $6,140
      expect(result.pa40.taxLiability.toNumber()).toBe(6140);
      // PTE credit: $3,070
      expect(result.pa40.otherCredits.toNumber()).toBe(3070);
      // Net tax: $6,140 - $3,070 = $3,070
      expect(result.pa40.netTaxLiability.toNumber()).toBe(3070);
      // The Schedule OC credit reduces tax liability; only withholding creates the refund.
      expect(result.pa40.overpayment.toNumber()).toBe(3070);
    });

    it("PA orchestrator Schedule OC with mixed credit types", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "150000",
            federalWithheld: "22000",
            stateWages: "150000",
            stateTaxWithheld: "4605",
            state: "PA",
          }],
        }),
        {
          scheduleOC: {
            pteCredits: [{
              entityName: "Gamma Inc",
              entityEIN: "33-3333333",
              allocablePAIncome: d(60000),
              pteTaxPaid: d(1842),
            }],
            otherCredits: [
              { creditType: "employment_incentive", amount: d(300) },
              { creditType: "reap", amount: d(500) },
            ],
          },
        },
      );

      expect(result.scheduleOC).toBeDefined();
      expect(result.scheduleOC!.totalPTECredit.toNumber()).toBe(1842);
      expect(result.scheduleOC!.employmentIncentiveCredit.toNumber()).toBe(300);
      expect(result.scheduleOC!.otherCreditsTotal.toNumber()).toBe(500);
      // Total: 1842 + 300 + 500 = 2642
      expect(result.pa40.otherCredits.toNumber()).toBe(2642);
    });

    it("PA orchestrator caps Schedule OC credits after tax forgiveness so excess restricted credits do not create a refund", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "5000",
            federalWithheld: "500",
            stateWages: "5000",
            stateTaxWithheld: "0",
            state: "PA",
          }],
        }),
        {
          scheduleOC: {
            pteCredits: [{
              entityName: "Low-Income PTE",
              entityEIN: "44-4444444",
              allocablePAIncome: d(100000),
              pteTaxPaid: d(3070),
            }],
          },
        },
      );

      expect(result.scheduleOC).toBeDefined();
      expect(result.scheduleOC!.totalOtherCredits.toNumber()).toBe(3070);
      expect(result.pa40.taxLiability.toNumber()).toBe(154);
      expect(result.pa40.taxForgivenessCredit.toNumber()).toBe(154);
      expect(result.pa40.otherCredits.toNumber()).toBe(0);
      expect(result.pa40.totalCredits.toNumber()).toBe(154);
      expect(result.pa40.netOverpayment.toNumber()).toBe(
        result.pa40.refundableCredits.toNumber(),
      );
      expect(result.pa40.totalAmountDue.toNumber()).toBe(0);
    });

    it("PA orchestrator Schedule OC overrides raw otherCredits", () => {
      // When both scheduleOC and otherCredits are provided, scheduleOC wins
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "100000",
            federalWithheld: "15000",
            stateWages: "100000",
            stateTaxWithheld: "3070",
            state: "PA",
          }],
        }),
        {
          otherCredits: d(9999), // Should be ignored
          scheduleOC: {
            otherCredits: [
              { creditType: "neighborhood_assistance", amount: d(1000) },
            ],
          },
        },
      );

      expect(result.scheduleOC).toBeDefined();
      expect(result.pa40.otherCredits.toNumber()).toBe(1000); // Not 9999
    });

    it("PA orchestrator Schedule OC with no credits produces $0", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "50000",
            federalWithheld: "7000",
            stateWages: "50000",
            stateTaxWithheld: "1535",
            state: "PA",
          }],
        }),
        {
          scheduleOC: {
            // Empty — no credits
          },
        },
      );

      expect(result.scheduleOC).toBeDefined();
      expect(result.scheduleOC!.totalOtherCredits.toNumber()).toBe(0);
      expect(result.pa40.otherCredits.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // US Government Interest Exclusion
  // =================================================================

  describe.sequential("US Government Interest Exclusion", () => {
    it("PA orchestrator excludes US government interest from Class 2", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [{
          payer: "Treasury Direct",
          interestIncome: "5000",
          usSavingsBondInterest: "3000", // Box 3: US gov interest included in Box 1
        }],
      }));
      // PA-taxable interest = 5000 - 3000 = 2000
      expect(result.mappedIncome.interest.toNumber()).toBe(2000);
      expect(result.exclusions.usGovInterest.toNumber()).toBe(3000);
    });

    it("PA orchestrator excludes all interest when entirely from US government", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [{
          payer: "Treasury Direct",
          interestIncome: "8000",
          usSavingsBondInterest: "8000",
        }],
      }));
      expect(result.mappedIncome.interest.toNumber()).toBe(0);
      expect(result.exclusions.usGovInterest.toNumber()).toBe(8000);
      // Tax on zero interest = $0
      expect(result.pa40.interest.toNumber()).toBe(0);
    });

    it("PA orchestrator handles no US government interest (Box 3 absent)", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [{
          payer: "First Bank",
          interestIncome: "1200",
          // usSavingsBondInterest not set → defaults to 0
        }],
      }));
      expect(result.mappedIncome.interest.toNumber()).toBe(1200);
      expect(result.exclusions.usGovInterest.toNumber()).toBe(0);
    });

    it("PA orchestrator sums US government interest across multiple 1099-INTs", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [
          { payer: "Treasury Direct", interestIncome: "3000", usSavingsBondInterest: "3000" },
          { payer: "First Bank", interestIncome: "2000", usSavingsBondInterest: "500" },
          { payer: "Credit Union", interestIncome: "1000" }, // no Box 3
        ],
      }));
      // Gross interest: 3000 + 2000 + 1000 = 6000
      // US gov exempt: 3000 + 500 = 3500
      // PA-taxable: 6000 - 3500 = 2500
      expect(result.mappedIncome.interest.toNumber()).toBe(2500);
      expect(result.exclusions.usGovInterest.toNumber()).toBe(3500);
    });

    it("PA orchestrator adds US gov exempt interest to SP nontaxable income", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "5000",
          federalWithheld: "500",
          stateWages: "5000",
          stateTaxWithheld: "154",
          state: "PA",
        }],
        form1099Int: [{
          payer: "Treasury Direct",
          interestIncome: "2000",
          usSavingsBondInterest: "2000",
        }],
      }));
      // PA taxable income = 5000 (compensation) + 0 (interest after exclusion) = 5000
      // Nontaxable income includes the 2000 US gov interest
      // SP eligibility = 5000 + 2000 = 7000
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(7000);
      expect(result.exclusions.usGovInterest.toNumber()).toBe(2000);
    });

    it("PA orchestrator US gov interest exclusion reduces tax liability", () => {
      // Without exclusion: interest = 10000, tax = 10000 × 3.07% = $307
      // With exclusion: interest = 10000 - 6000 = 4000, tax = 4000 × 3.07% = $123
      const result = calculatePAReturn(makeInput({
        form1099Int: [{
          payer: "Treasury Direct",
          interestIncome: "10000",
          usSavingsBondInterest: "6000",
        }],
      }));
      expect(result.mappedIncome.interest.toNumber()).toBe(4000);
      expect(result.pa40.taxLiability.toNumber()).toBe(123); // 4000 × 0.0307 = 122.80 → $123
    });

    it("PA orchestrator US gov interest does not affect K-1 interest", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [{
          payer: "Treasury Direct",
          interestIncome: "3000",
          usSavingsBondInterest: "2000",
        }],
        scheduleK1: [{
          entityName: "Partnership A",
          entityEin: "98-7654321",
          entityType: "partnership",
          interestIncome: "1500",
        }],
      }));
      // Gross interest: 3000 (1099-INT) + 1500 (K-1) = 4500
      // US gov exempt: 2000 (only from 1099-INT Box 3)
      // PA-taxable: 4500 - 2000 = 2500
      expect(result.mappedIncome.interest.toNumber()).toBe(2500);
    });

    it("PA orchestrator US gov interest combined with early IRA 1099-R interest", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [{
          payer: "Treasury Direct",
          interestIncome: "4000",
          usSavingsBondInterest: "4000",
        }],
        form1099R: [{
          payer: "IRA Custodian",
          grossDistribution: "5000",
          taxableAmount: "5000",
          distributionCode: "1", // Early
          iraSepSimple: true, // IRA → Class 2 interest
        }],
      }));
      // Gross interest: 4000 (1099-INT) + 5000 (early IRA) = 9000
      // US gov exempt: 4000
      // PA-taxable interest: 9000 - 4000 = 5000
      expect(result.mappedIncome.interest.toNumber()).toBe(5000);
    });
  });

  // =================================================================
  // PA Lottery Cash vs Noncash Treatment
  // =================================================================

  describe.sequential("PA Lottery Cash vs Noncash Treatment", () => {
    it("PA orchestrator maps PA Schedule T taxable winnings to gambling income", () => {
      const result = calculatePAReturn(makeInput({
        formW2G: [{
          payer: "Pennsylvania Lottery",
          reportableWinnings: "10000",
          typeOfWager: "lottery",
          state: "PA",
        }],
      }));
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(10000);
      expect(result.exclusions.paLotteryWinnings.toNumber()).toBe(0);
    });

    it("PA orchestrator does not exclude non-lottery gambling", () => {
      const result = calculatePAReturn(makeInput({
        formW2G: [{
          payer: "Parx Casino",
          reportableWinnings: "5000",
          typeOfWager: "slots",
          state: "PA",
        }],
      }));
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(5000);
      expect(result.exclusions.paLotteryWinnings.toNumber()).toBe(0);
    });

    it("PA orchestrator does not exclude non-PA lottery winnings", () => {
      const result = calculatePAReturn(makeInput({
        formW2G: [{
          payer: "New Jersey Lottery",
          reportableWinnings: "8000",
          typeOfWager: "lottery",
          state: "NJ",
        }],
      }));
      // NJ lottery winnings are taxable for PA residents
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(8000);
      expect(result.exclusions.paLotteryWinnings.toNumber()).toBe(0);
    });

    it("PA orchestrator taxes PA lottery cash winnings with no state (assumed PA resident)", () => {
      const result = calculatePAReturn(makeInput({
        formW2G: [{
          payer: "Pennsylvania Lottery",
          reportableWinnings: "25000",
          typeOfWager: "lottery",
          // No state specified — assumed PA resident
        }],
      }));
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(25000);
      expect(result.exclusions.paLotteryWinnings.toNumber()).toBe(0);
    });

    it("PA orchestrator handles mixed W-2Gs with PA lottery cash remaining taxable", () => {
      const result = calculatePAReturn(makeInput({
        formW2G: [
          { payer: "PA Lottery", reportableWinnings: "10000", typeOfWager: "lottery", state: "PA" },
          { payer: "Parx Casino", reportableWinnings: "3000", typeOfWager: "slots", state: "PA" },
          { payer: "NJ Lottery", reportableWinnings: "5000", typeOfWager: "lottery", state: "NJ" },
          { payer: "PA Horse Track", reportableWinnings: "2000", typeOfWager: "horse_racing", state: "PA" },
        ],
      }));
      // Total gambling: 10000 + 3000 + 5000 + 2000 = 20000
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(20000);
      expect(result.exclusions.paLotteryWinnings.toNumber()).toBe(0);
    });

    it("PA orchestrator PA lottery cash taxation is case-insensitive for typeOfWager", () => {
      const result = calculatePAReturn(makeInput({
        formW2G: [{
          payer: "Pennsylvania Lottery",
          reportableWinnings: "7500",
          typeOfWager: "Lottery",
          state: "PA",
        }],
      }));
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(7500);
      expect(result.exclusions.paLotteryWinnings.toNumber()).toBe(0);
    });

    it("PA orchestrator keeps PA Lottery cash winnings out of SP nontaxable income", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "5000",
          federalWithheld: "500",
          stateWages: "5000",
          stateTaxWithheld: "154",
          state: "PA",
        }],
        formW2G: [{
          payer: "PA Lottery",
          reportableWinnings: "3000",
          typeOfWager: "lottery",
          state: "PA",
        }],
      }));
      // PA taxable: 5000 (comp) + 3000 (lottery cash) = 8000
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(8000);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    });

    it("PA orchestrator W-2G with no typeOfWager treated as taxable gambling", () => {
      const result = calculatePAReturn(makeInput({
        formW2G: [{
          payer: "Unknown Gaming",
          reportableWinnings: "4000",
          // No typeOfWager — default: taxable
          state: "PA",
        }],
      }));
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(4000);
      expect(result.exclusions.paLotteryWinnings.toNumber()).toBe(0);
    });

    it("PA orchestrator taxes PA lottery cash when it is the only income source", () => {
      const result = calculatePAReturn(makeInput({
        formW2G: [{
          payer: "PA Lottery",
          reportableWinnings: "50000",
          typeOfWager: "lottery",
          state: "PA",
        }],
      }));
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(50000);
      expect(result.pa40.taxLiability.toNumber()).toBe(1535);
    });

    it("PA orchestrator excludes only noncash PA Lottery prizes from Class 8", () => {
      const result = calculatePAReturn(makeInput({
        formW2G: [{
          payer: "Pennsylvania Lottery",
          reportableWinnings: "18000",
          typeOfWager: "lottery",
          prizeType: "noncash",
          state: "PA",
        }],
      }));

      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(0);
      expect(result.exclusions.paLotteryWinnings.toNumber()).toBe(18000);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(18000);
    });
  });

  // =================================================================
  // RRB-1099 Railroad Retirement Tier 1 Benefits
  // =================================================================

  describe.sequential("RRB-1099 Railroad Retirement Tier 1 Benefits", () => {
    it("PA orchestrator leaves RRB-1099 out of SP nontaxable income", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "6000",
          federalWithheld: "600",
          stateWages: "6000",
          stateTaxWithheld: "184",
          state: "PA",
        }],
        formRRB1099: [{
          netSocialSecurityEquivalentBenefitPortion: "12000",
        }],
      }));
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(6000);
    });

    it("PA orchestrator keeps SSA-1099 and RRB-1099 out of Schedule SP eligibility income", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "5000",
          federalWithheld: "500",
          stateWages: "5000",
          stateTaxWithheld: "154",
          state: "PA",
        }],
        formSSA1099: [{ netBenefits: "10000", benefitsRepaid: "0" }],
        formRRB1099: [{ netSocialSecurityEquivalentBenefitPortion: "8000" }],
      }));
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(5000);
    });

    it("PA orchestrator handles no RRB-1099 gracefully", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "40000",
          federalWithheld: "5000",
          stateWages: "40000",
          stateTaxWithheld: "1228",
          state: "PA",
        }],
      }));
      // No RRB-1099: nontaxable from that source = 0
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(40000);
    });

    it("PA orchestrator RRB-1099 does not add to PA taxable income", () => {
      const result = calculatePAReturn(makeInput({
        formRRB1099: [{ netSocialSecurityEquivalentBenefitPortion: "24000" }],
      }));
      // RRB Tier 1 is exempt from PA income tax — not in any income class
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.pa40.taxLiability.toNumber()).toBe(0);
    });

    it("PA orchestrator multiple RRB-1099s still stay out of Schedule SP eligibility income", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "5000",
          federalWithheld: "500",
          stateWages: "5000",
          stateTaxWithheld: "154",
          state: "PA",
        }],
        formRRB1099: [
          { netSocialSecurityEquivalentBenefitPortion: "6000" },
          { netSocialSecurityEquivalentBenefitPortion: "4000" },
        ],
      }));
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(5000);
    });
  });

  // =================================================================
  // Combined Exclusions End-to-End
  // =================================================================

  describe.sequential("Combined Income Exclusions End-to-End", () => {
    it("PA orchestrator all exclusions combined: US gov interest + PA lottery + RRB", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "50000",
          federalWithheld: "7000",
          stateWages: "50000",
          stateTaxWithheld: "1535",
          state: "PA",
        }],
        form1099Int: [{
          payer: "Treasury Direct",
          interestIncome: "6000",
          usSavingsBondInterest: "4000",
        }],
        formW2G: [
          { payer: "PA Lottery", reportableWinnings: "15000", typeOfWager: "lottery", state: "PA" },
          { payer: "Parx Casino", reportableWinnings: "5000", typeOfWager: "slots", state: "PA" },
        ],
        formRRB1099: [{ netSocialSecurityEquivalentBenefitPortion: "10000" }],
      }));

      // Interest: 6000 - 4000 (US gov) = 2000
      expect(result.mappedIncome.interest.toNumber()).toBe(2000);
      // Gambling: 15000 + 5000 = 20000 (PA lottery cash is taxable)
      expect(result.mappedIncome.gamblingIncome.toNumber()).toBe(20000);
      // Exclusions
      expect(result.exclusions.usGovInterest.toNumber()).toBe(4000);
      expect(result.exclusions.paLotteryWinnings.toNumber()).toBe(0);

      // PA taxable: 50000 (comp) + 2000 (int) + 20000 (gambling) = 72000
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(72000);
      // Tax: 72000 × 3.07% = 2210.40 → $2210
      expect(result.pa40.taxLiability.toNumber()).toBe(2210);

      // SP nontaxable keeps the exempt U.S. government interest, but not RRB.
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(76000);
    });

    it("PA orchestrator retiree with Treasury interest and PA lottery cash owes tax on the lottery", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [{
          payer: "Treasury Direct",
          interestIncome: "12000",
          usSavingsBondInterest: "12000",
        }],
        formW2G: [{
          payer: "PA Lottery",
          reportableWinnings: "5000",
          typeOfWager: "lottery",
          state: "PA",
        }],
        formSSA1099: [{ netBenefits: "18000", benefitsRepaid: "0" }],
        form1099R: [{
          payer: "Pension Fund",
          grossDistribution: "30000",
          distributionCode: "7", // Normal retirement — exempt
        }],
      }));

      // Treasury interest, Social Security, and the normal 1099-R are exempt.
      // PA lottery cash remains taxable.
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(5000);
      expect(result.pa40.taxLiability.toNumber()).toBe(154);

      // Schedule SP eligibility keeps the Treasury interest but excludes SSA and ordinary retirement.
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(17000);
    });

    it("PA orchestrator exclusions with low income trigger tax forgiveness", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Part-time job", ein: "12-3456789" },
          wages: "4000",
          federalWithheld: "200",
          stateWages: "4000",
          stateTaxWithheld: "123",
          state: "PA",
        }],
        form1099Int: [{
          payer: "Treasury Direct",
          interestIncome: "3000",
          usSavingsBondInterest: "3000", // All US gov → excluded
        }],
        formW2G: [{
          payer: "PA Lottery",
          reportableWinnings: "2000",
          typeOfWager: "lottery",
          state: "PA",
        }],
      }));

      // PA taxable: 4000 compensation + 2000 lottery cash = 6000
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(6000);

      // Nontaxable: 3000 (US gov)
      // SP eligibility: 6000 + 3000 = 9000
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(9000);

      // Unmarried, 0 deps: base $6500, +$250 steps
      // 9000 > 6500 + 2250 = 8750 → 0% forgiveness
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
    });

    it("PA orchestrator exclusions keep SP eligibility accurate near forgiveness boundary", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Part-time job", ein: "12-3456789" },
          wages: "3000",
          federalWithheld: "100",
          stateWages: "3000",
          stateTaxWithheld: "92",
          state: "PA",
        }],
        form1099Int: [{
          payer: "Treasury Direct",
          interestIncome: "2000",
          usSavingsBondInterest: "2000",
        }],
      }));

      // PA taxable: 3000 (comp)
      // Nontaxable: 2000 (US gov interest)
      // SP eligibility: 3000 + 2000 = 5000
      // Unmarried, 0 deps: base $6500 → 5000 ≤ 6500 → 100% forgiveness
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(5000);
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);

      // Tax: 3000 × 3.07% = $92 → fully forgiven
      expect(result.pa40.taxLiability.toNumber()).toBe(92);
      expect(result.pa40.taxForgivenessCredit.toNumber()).toBe(92);
      expect(result.pa40.netTaxLiability.toNumber()).toBe(0);
    });
  });

  // ===================================================================
  // REV-1630 Underpayment Penalty Integration
  // ===================================================================

  describe.sequential("REV-1630 Underpayment Penalty Integration", () => {
    it("PA orchestrator computes REV-1630 when quarterly payments provided", () => {
      // W-2 wages: $80,000 → tax = $80,000 × 3.07% = $2,456
      // Withholding: $1,500
      // Net tax owed = $2,456 - $1,500 = $956 > $338 → penalty may apply
      const input = makeInput({
        w2s: [{
          employer: "Acme Corp", wages: 80000, federalWithheld: 10000,
          socialSecurityWages: 80000, socialSecurityWithheld: 4960,
          medicareWages: 80000, medicareWithheld: 1160,
          stateWages: 80000, stateTaxWithheld: 1500, state: "PA",
          localWages: 0, localTaxWithheld: 0,
        }],
      });

      const overrides: PAOrchestratorOverrides = {
        quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
      };

      const result = calculatePAReturn(input, overrides);

      expect(result.rev1630).toBeDefined();
      expect(result.rev1630!.taxLiability.toNumber()).toBe(2456);
      expect(result.rev1630!.withholdingAndCredits.toNumber()).toBe(1500);
      // Net tax = $956 > $338 → penalty required
      expect(result.rev1630!.penaltyRequired).toBe(true);
      expect(result.rev1630!.totalInterest.gt(d(0))).toBe(true);
    });

    it("PA orchestrator REV-1630 not computed without quarterly payments", () => {
      const input = makeInput({
        w2s: [{
          employer: "Acme Corp", wages: 80000, federalWithheld: 10000,
          socialSecurityWages: 80000, socialSecurityWithheld: 4960,
          medicareWages: 80000, medicareWithheld: 1160,
          stateWages: 80000, stateTaxWithheld: 1500, state: "PA",
          localWages: 0, localTaxWithheld: 0,
        }],
      });

      const result = calculatePAReturn(input);
      expect(result.rev1630).toBeUndefined();
    });

    it("PA orchestrator REV-1630 no penalty when withholding covers tax", () => {
      // W-2 wages: $50,000 → tax = $1,535
      // Withholding: $1,400 → net tax = $135 < $338
      const input = makeInput({
        w2s: [{
          employer: "Acme Corp", wages: 50000, federalWithheld: 6000,
          socialSecurityWages: 50000, socialSecurityWithheld: 3100,
          medicareWages: 50000, medicareWithheld: 725,
          stateWages: 50000, stateTaxWithheld: 1400, state: "PA",
          localWages: 0, localTaxWithheld: 0,
        }],
      });

      const overrides: PAOrchestratorOverrides = {
        quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
      };

      const result = calculatePAReturn(input, overrides);

      expect(result.rev1630).toBeDefined();
      expect(result.rev1630!.penaltyRequired).toBe(false);
    });

    it("PA orchestrator adds prior-year credit to Q1 and extension payment to Q4 for REV-1630", () => {
      const input = makeInput({
        w2s: [{
          employer: "Acme Corp", wages: 80000, federalWithheld: 10000,
          socialSecurityWages: 80000, socialSecurityWithheld: 4960,
          medicareWages: 80000, medicareWithheld: 1160,
          stateWages: 80000, stateTaxWithheld: 1500, state: "PA",
          localWages: 0, localTaxWithheld: 0,
        }],
      });

      const baseline = calculatePAReturn(input, {
        quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
      });

      const withTimedPayments = calculatePAReturn(input, {
        quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
        creditFromPriorYear: d(150),
        extensionPayment: d(200),
      });

      expect(withTimedPayments.pa40.creditFromPriorYear.toNumber()).toBe(150);
      expect(withTimedPayments.pa40.extensionPayment.toNumber()).toBe(200);
      expect(withTimedPayments.rev1630).toBeDefined();
      expect(withTimedPayments.rev1630!.quarters[0].estimatedPayment.toNumber()).toBe(150);
      expect(withTimedPayments.rev1630!.quarters[3].estimatedPayment.toNumber()).toBe(200);
      expect(withTimedPayments.rev1630!.totalInterest.lt(baseline.rev1630!.totalInterest)).toBe(true);
    });

    it("PA orchestrator REV-1630 includes tax forgiveness in credits", () => {
      // Low-income filer: $6,000 wages → tax = $184
      // No withholding, but gets 100% forgiveness (threshold $6,500 for single)
      // Net tax after credits = $0, so no penalty even with no estimated payments
      const input = makeInput({
        w2s: [{
          employer: "Low Pay Inc", wages: 6000, federalWithheld: 300,
          socialSecurityWages: 6000, socialSecurityWithheld: 372,
          medicareWages: 6000, medicareWithheld: 87,
          stateWages: 6000, stateTaxWithheld: 0, state: "PA",
          localWages: 0, localTaxWithheld: 0,
        }],
      });

      const overrides: PAOrchestratorOverrides = {
        quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
      };

      const result = calculatePAReturn(input, overrides);

      // Tax forgiveness should be 100% for $6,000 income (below $6,500 threshold)
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);

      // REV-1630 credits include forgiveness
      expect(result.rev1630).toBeDefined();
      expect(result.rev1630!.penaltyRequired).toBe(false);
    });

    it("PA orchestrator REV-1630 with prior year safe harbor", () => {
      // Self-employed: $120,000 income → tax = $3,684
      // No withholding, pays $500/quarter
      // Prior year: $30,000 income → tax = $921
      const input = makeInput({
        form1099Nec: [{
          payer: "Client A",
          nonemployeeCompensation: 120000,
          federalWithheld: 0,
        }],
      });

      const overrides: PAOrchestratorOverrides = {
        quarterlyEstimatedPayments: [d(500), d(500), d(500), d(500)],
        priorYearPATaxableIncome: d(30000),
      };

      const result = calculatePAReturn(input, overrides);

      expect(result.rev1630).toBeDefined();
      expect(result.rev1630!.priorYearTaxAtCurrentRate).toEqual(d(921));
      // Q1 cumulative: $0 (no withholding/4) + $500 = $500 < $921
      // Q2 cumulative: $500 + $0 + $500 = $1,000 ≥ $921 → met
      expect(result.rev1630!.quarters[0].exception1Met).toBe(false);
      expect(result.rev1630!.quarters[1].exception1Met).toBe(true);
    });

    it("PA orchestrator REV-1630 exempt with prior year 100% forgiveness", () => {
      const input = makeInput({
        w2s: [{
          employer: "Acme Corp", wages: 80000, federalWithheld: 10000,
          socialSecurityWages: 80000, socialSecurityWithheld: 4960,
          medicareWages: 80000, medicareWithheld: 1160,
          stateWages: 80000, stateTaxWithheld: 500, state: "PA",
          localWages: 0, localTaxWithheld: 0,
        }],
      });

      const overrides: PAOrchestratorOverrides = {
        quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
        priorYear100PercentForgiveness: true,
      };

      const result = calculatePAReturn(input, overrides);

      expect(result.rev1630).toBeDefined();
      expect(result.rev1630!.penaltyRequired).toBe(false);
      expect(result.rev1630!.exemptReason).toContain("100% Tax Forgiveness");
    });

    it("PA orchestrator REV-1630 includes resident credit in withholding/credits", () => {
      // NJ commuter: $100,000 wages, $1,000 PA withholding
      // Paid $5,000 NJ tax → Schedule G-L credit
      const input = makeInput({
        w2s: [{
          employer: "NJ Corp", wages: 100000, federalWithheld: 15000,
          socialSecurityWages: 100000, socialSecurityWithheld: 6200,
          medicareWages: 100000, medicareWithheld: 1450,
          stateWages: 100000, stateTaxWithheld: 1000, state: "PA",
          localWages: 0, localTaxWithheld: 0,
        }],
      });

      const overrides: PAOrchestratorOverrides = {
        otherStateCredits: [{
          stateCode: "NJ",
          incomeTaxableByBothStates: d(100000),
          taxPaidToOtherState: d(5000),
        }],
        quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
      };

      const result = calculatePAReturn(input, overrides);

      // PA tax = $100,000 × 3.07% = $3,070
      // Resident credit = min($5,000, $3,070) = $3,070
      // REV-1630 credits = $1,000 withholding + $3,070 resident credit = $4,070
      expect(result.rev1630).toBeDefined();
      expect(result.rev1630!.withholdingAndCredits.toNumber()).toBe(4070);
      // Net tax = $3,070 - $4,070 = negative → no penalty
      expect(result.rev1630!.penaltyRequired).toBe(false);
    });
  });

  // =================================================================
  // Form 4137 — Unreported Tip Income
  // =================================================================

  describe.sequential("Form 4137 Unreported Tip Income", () => {
    it("PA orchestrator maps Form 4137 unreported tips to compensation", () => {
      const result = calculatePAReturn(makeInput({
        form4137: {
          unreportedTipIncome: "5000",
          socialSecurityWagesAndTipsAlreadyReported: "40000",
        },
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(5000);
    });

    it("PA orchestrator combines Form 4137 tips with W-2 wages", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: "Restaurant", wages: "30000", federalWithheld: "3000",
          stateWages: "30000", stateTaxWithheld: "921", state: "PA",
        }],
        form4137: {
          unreportedTipIncome: "8000",
          socialSecurityWagesAndTipsAlreadyReported: "30000",
        },
      }));
      // $30,000 W-2 + $8,000 tips = $38,000 compensation
      expect(result.mappedIncome.compensation.toNumber()).toBe(38000);
      // Tax: $38,000 × 3.07% = $1,167 (rounded)
      expect(result.pa40.taxLiability.toNumber()).toBe(1167);
    });

    it("PA orchestrator handles no Form 4137 gracefully", () => {
      const result = calculatePAReturn(makeInput());
      // No Form 4137 → no tips → $0 compensation
      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
    });

    it("PA orchestrator Form 4137 tips affect tax computation", () => {
      const result = calculatePAReturn(makeInput({
        form4137: {
          unreportedTipIncome: "10000",
        },
      }));
      // $10,000 × 3.07% = $307
      expect(result.pa40.taxLiability.toNumber()).toBe(307);
      const wptc = result.workingPennsylvaniansTaxCredit?.credit.toNumber() ?? 0;
      expect(result.pa40.amountOwed.toNumber()).toBe(307 - wptc);
    });
  });

  // =================================================================
  // Form 8919 — Uncollected Wages
  // =================================================================

  describe.sequential("Form 8919 Uncollected Wages", () => {
    it("PA orchestrator maps Form 8919 uncollected wages to compensation", () => {
      const result = calculatePAReturn(makeInput({
        form8919: {
          wagesNotReportedOnW2: "25000",
        },
      }));
      expect(result.mappedIncome.compensation.toNumber()).toBe(25000);
    });

    it("PA orchestrator combines Form 8919 with W-2 wages and tips", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: "Corp A", wages: "50000", federalWithheld: "7000",
          stateWages: "50000", stateTaxWithheld: "1535", state: "PA",
        }],
        form4137: {
          unreportedTipIncome: "3000",
        },
        form8919: {
          wagesNotReportedOnW2: "12000",
        },
      }));
      // $50,000 W-2 + $3,000 tips + $12,000 uncollected = $65,000
      expect(result.mappedIncome.compensation.toNumber()).toBe(65000);
    });

    it("PA orchestrator handles no Form 8919 gracefully", () => {
      const result = calculatePAReturn(makeInput());
      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Home Sale Gains
  // =================================================================

  describe.sequential("Home Sale Gains", () => {
    it("PA orchestrator maps home sale taxable gain to Class 5", () => {
      const result = calculatePAReturn(makeInput({
        homeSales: [{
          salePrice: "500000",
          purchasePrice: "200000",
          sellingExpenses: "30000",
          // Gain = $500,000 - $30,000 - $200,000 = $270,000
          // §121 exclusion (single): $250,000
          // Taxable gain: $270,000 - $250,000 = $20,000
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
        }],
      }));
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(20000);
    });

    it("PA orchestrator adds IRC §121 excluded home sale gain to Schedule SP eligibility income", () => {
      const result = calculatePAReturn(makeInput({
        homeSales: [{
          salePrice: "500000",
          purchasePrice: "200000",
          sellingExpenses: "30000",
          // Gain = $270,000
          // §121 exclusion (single) = $250,000
          // Taxable gain = $20,000, excluded gain = $250,000
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
        }],
      }));

      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(20000);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(250000);
      expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(270000);
    });

    it("PA orchestrator home sale fully excluded under §121", () => {
      const result = calculatePAReturn(makeInput({
        homeSales: [{
          salePrice: "350000",
          purchasePrice: "200000",
          sellingExpenses: "20000",
          // Gain = $350,000 - $20,000 - $200,000 = $130,000
          // §121 exclusion (single): $250,000 → fully excluded
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
        }],
      }));
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(0);
    });

    it("PA orchestrator home sale MFJ with $500K exclusion", () => {
      const result = calculatePAReturn(makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "married_filing_jointly",
          primary: { firstName: "Test", lastName: "Filer", ssn: "000-00-0001", dateOfBirth: "1980-01-01" },
          spouse: { firstName: "Spouse", lastName: "Filer", ssn: "000-00-0002", dateOfBirth: "1980-01-01" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [],
        },
        homeSales: [{
          salePrice: "900000",
          purchasePrice: "300000",
          sellingExpenses: "50000",
          // Gain = $900,000 - $50,000 - $300,000 = $550,000
          // §121 MFJ exclusion: $500,000 (both spouses qualify)
          // Taxable: $550,000 - $500,000 = $50,000
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
          bothSpousesMeetUseTest: true,
          atLeastOneSpouseMeetsOwnershipTest: true,
        }],
      }));
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(50000);
    });

    it("PA orchestrator home sale with depreciation recapture", () => {
      const result = calculatePAReturn(makeInput({
        homeSales: [{
          salePrice: "400000",
          purchasePrice: "200000",
          sellingExpenses: "20000",
          depreciationAfterMay1997: "15000",
          improvements: "10000",
          // Adjusted basis = $200,000 + $10,000 - $15,000 = $195,000
          // Gain = $400,000 - $20,000 - $195,000 = $185,000
          // §121 exclusion: $250,000 → gain < exclusion
          // But depreciation recapture ($15,000) is NOT excludable
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
        }],
      }));
      // Recapture of $15,000 flows to Class 5
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(15000);
    });

    it("PA orchestrator home sale combined with 1099-B gains", () => {
      const result = calculatePAReturn(makeInput({
        form1099B: [{
          broker: "Schwab",
          transactions: [{
            description: "AAPL", dateAcquired: "2020-01-01", dateSold: "2025-06-15",
            proceeds: "30000", costBasis: "20000", adjustments: "0",
          }],
        }],
        homeSales: [{
          salePrice: "600000",
          purchasePrice: "300000",
          sellingExpenses: "30000",
          // Gain = $600,000 - $30,000 - $300,000 = $270,000
          // §121 exclusion (single): $250,000
          // Taxable home gain: $20,000
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
        }],
      }));
      // 1099-B gain: $10,000 + home sale gain: $20,000 = $30,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(30000);
    });

    it("PA orchestrator home sale not meeting use test — no exclusion", () => {
      const result = calculatePAReturn(makeInput({
        homeSales: [{
          salePrice: "400000",
          purchasePrice: "300000",
          sellingExpenses: "20000",
          // Gain = $400,000 - $20,000 - $300,000 = $80,000
          // Only 1 year use (365 days) < 2 years (730 days) → no full exclusion
          daysOwned: 365,
          daysUsedAsResidence: 365,
        }],
      }));
      // No exclusion: full $80,000 gain to Class 5
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(80000);
    });

    it("PA orchestrator handles no home sales gracefully", () => {
      const result = calculatePAReturn(makeInput());
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(0);
    });

    it("PA orchestrator home sale tax impact", () => {
      const result = calculatePAReturn(makeInput({
        homeSales: [{
          salePrice: "600000",
          purchasePrice: "200000",
          sellingExpenses: "30000",
          // Gain: $370,000, §121 exclusion: $250,000, taxable: $120,000
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
        }],
      }));
      // $120,000 × 3.07% = $3,684
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(120000);
      expect(result.pa40.taxLiability.toNumber()).toBe(3684);
    });
  });

  // =================================================================
  // Section 1256 Contracts (Form 6781)
  // =================================================================

  describe.sequential("Section 1256 Contracts (Form 6781)", () => {
    it("PA orchestrator maps Section 1256 gains to Class 5", () => {
      const result = calculatePAReturn(makeInput({
        form6781: {
          section1256Gains: "15000",
          section1256Losses: "0",
        },
      }));
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(15000);
    });

    it("PA orchestrator Section 1256 net loss to Class 5", () => {
      const result = calculatePAReturn(makeInput({
        form6781: {
          section1256Gains: "5000",
          section1256Losses: "12000",
        },
      }));
      // Net: $5,000 - $12,000 = -$7,000
      // PA Class 5 can be negative (loss within class)
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(-7000);
    });

    it("PA orchestrator Section 1256 with adjustments", () => {
      const result = calculatePAReturn(makeInput({
        form6781: {
          section1256Gains: "20000",
          section1256Losses: "5000",
          adjustments: "3000",
        },
      }));
      // $20,000 - $5,000 + $3,000 = $18,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(18000);
    });

    it("PA orchestrator Section 1256 combined with 1099-B gains", () => {
      const result = calculatePAReturn(makeInput({
        form1099B: [{
          broker: "TD",
          transactions: [{
            description: "SPY", dateAcquired: "2025-01-01", dateSold: "2025-06-15",
            proceeds: "50000", costBasis: "45000", adjustments: "0",
          }],
        }],
        form6781: {
          section1256Gains: "8000",
          section1256Losses: "2000",
        },
      }));
      // 1099-B: $5,000 + §1256: $6,000 = $11,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(11000);
    });

    it("PA orchestrator handles no Form 6781 gracefully", () => {
      const result = calculatePAReturn(makeInput());
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(0);
    });

    it("PA orchestrator Section 1256 loss offsets 1099-B gains within Class 5", () => {
      const result = calculatePAReturn(makeInput({
        form1099B: [{
          broker: "Fidelity",
          transactions: [{
            description: "VTI", dateAcquired: "2024-01-01", dateSold: "2025-06-15",
            proceeds: "20000", costBasis: "15000", adjustments: "0",
          }],
        }],
        form6781: {
          section1256Gains: "0",
          section1256Losses: "3000",
        },
      }));
      // 1099-B: $5,000 + §1256: -$3,000 = $2,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(2000);
    });
  });

  // =================================================================
  // Form 6252 — Installment Sale Gains
  // =================================================================

  describe.sequential("Form 6252 Installment Sale Gains", () => {
    it("PA orchestrator maps installment sale gains to Class 5", () => {
      const result = calculatePAReturn(makeInput({
        form6252: [{
          description: "Rental property sale",
          propertyType: "other",
          gainCharacter: "long_term_capital",
          isYearOfSale: true,
          sellingPrice: "200000",
          costBasis: "100000",
          depreciation: "20000",
          paymentsReceived: "50000",
        }],
      }));
      // Installment sale produces gain — all flows to Class 5
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBeGreaterThan(0);
    });

    it("PA orchestrator installment sale subsequent year payments", () => {
      const result = calculatePAReturn(makeInput({
        form6252: [{
          description: "Land sale",
          propertyType: "other",
          gainCharacter: "long_term_capital",
          isYearOfSale: false,
          sellingPrice: "300000",
          costBasis: "150000",
          // Gross profit = $300K - $150K = $150K
          // Contract price = $300K (no assumed liabilities)
          // GP% = $150K / $300K = 50%
          paymentsReceived: "60000",
          // Installment income = $60,000 × 50% = $30,000
        }],
      }));
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(30000);
    });

    it("PA orchestrator handles no Form 6252 gracefully", () => {
      const result = calculatePAReturn(makeInput());
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(0);
    });

    it("PA orchestrator installment sale combined with other Class 5 sources", () => {
      const result = calculatePAReturn(makeInput({
        form1099B: [{
          broker: "Schwab",
          transactions: [{
            description: "MSFT", dateAcquired: "2024-01-01", dateSold: "2025-03-01",
            proceeds: "15000", costBasis: "10000", adjustments: "0",
          }],
        }],
        form6252: [{
          description: "Land sale year 2",
          propertyType: "other",
          gainCharacter: "long_term_capital",
          isYearOfSale: false,
          sellingPrice: "200000",
          costBasis: "100000",
          // GP% = $100K / $200K = 50%
          paymentsReceived: "40000",
          // Installment income = $40,000 × 50% = $20,000
        }],
      }));
      // 1099-B: $5,000 + installment: $20,000 = $25,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(25000);
    });

    it("PA orchestrator installment sale all gain types flow to Class 5", () => {
      // PA doesn't distinguish gain types — all flow to Class 5
      const result = calculatePAReturn(makeInput({
        form6252: [{
          description: "Business equipment",
          propertyType: "other",
          gainCharacter: "section_1231",
          isYearOfSale: true,
          sellingPrice: "100000",
          costBasis: "50000",
          depreciation: "10000",
          paymentsReceived: "100000",
        }],
      }));
      // All gain (including §1231 and ordinary recapture) → Class 5
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBeGreaterThan(0);
    });
  });

  // =================================================================
  // Combined Additional Income Sources End-to-End
  // =================================================================

  describe.sequential("Combined Additional Income Sources End-to-End", () => {
    it("PA orchestrator W-2 + tips + uncollected wages + home sale + §1256", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: "Corp X", wages: "60000", federalWithheld: "8000",
          stateWages: "60000", stateTaxWithheld: "1842", state: "PA",
        }],
        form4137: {
          unreportedTipIncome: "5000",
        },
        form8919: {
          wagesNotReportedOnW2: "10000",
        },
        homeSales: [{
          salePrice: "500000",
          purchasePrice: "200000",
          sellingExpenses: "25000",
          // Gain = $275,000, §121 exclusion = $250,000, taxable = $25,000
          daysOwned: 1095,
          daysUsedAsResidence: 1095,
        }],
        form6781: {
          section1256Gains: "12000",
          section1256Losses: "4000",
        },
      }));

      // Class 1: $60,000 W-2 + $5,000 tips + $10,000 wages = $75,000
      expect(result.mappedIncome.compensation.toNumber()).toBe(75000);

      // Class 5: $25,000 home sale + $8,000 §1256 = $33,000
      expect(result.mappedIncome.netGainOrLoss.toNumber()).toBe(33000);

      // Total taxable: $75,000 + $33,000 = $108,000
      expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(108000);

      // Tax: $108,000 × 3.07% = $3,316 (rounded)
      expect(result.pa40.taxLiability.toNumber()).toBe(3316);

      // Refund with $1,842 withholding: $3,316 - $1,842 = $1,474 owed
      expect(result.pa40.amountOwed.toNumber()).toBe(1474);
    });

    it("PA orchestrator tips with forgiveness qualification", () => {
      // Low-income server: $4,000 W-2 + $2,000 unreported tips = $6,000
      // Below $6,500 unmarried threshold → 100% forgiveness
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: "Diner", wages: "4000", federalWithheld: "0",
          stateWages: "4000", stateTaxWithheld: "0", state: "PA",
        }],
        form4137: {
          unreportedTipIncome: "2000",
        },
      }));

      // Compensation: $6,000
      expect(result.mappedIncome.compensation.toNumber()).toBe(6000);

      // Tax: $6,000 × 3.07% = $184
      expect(result.pa40.taxLiability.toNumber()).toBe(184);

      // Schedule SP: eligibility income = $6,000 ≤ $6,500 → 100% forgiveness
      expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.pa40.taxForgivenessCredit.toNumber()).toBe(184);
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // PA-40 Use Tax, Penalty, Interest, and Total Due Integration
  // =================================================================

  describe.sequential("PA-40 Use Tax, Penalty, Interest, Total Due", () => {
    it("PA orchestrator passes use tax through to PA-40", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "50000",
            federalWithheld: "6000",
            stateWages: "50000",
            stateTaxWithheld: "1535",
            state: "PA",
          }],
        }),
        { useTax: d(150) },
      );

      // Income tax: $1,535; withholding: $1,535 → owed: $0, overpayment: $0
      expect(result.pa40.taxLiability.toNumber()).toBe(1535);
      expect(result.pa40.amountOwed.toNumber()).toBe(0);
      // Use tax flows through
      expect(result.pa40.useTax.toNumber()).toBe(150);
      expect(result.pa40.totalPATax.toNumber()).toBe(1685);
      // Total due = $0 (owed) + $150 (use tax) = $150
      expect(result.pa40.totalAmountDue.toNumber()).toBe(150);
    });

    it("PA orchestrator passes late filing or payment penalty through to PA-40", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "100000",
            federalWithheld: "15000",
            stateWages: "100000",
            stateTaxWithheld: "2000",
            state: "PA",
          }],
        }),
        { lateFilingOrPaymentPenalty: d(35) },
      );

      // Tax: $3,070; withholding: $2,000; owed: $1,070
      expect(result.pa40.amountOwed.toNumber()).toBe(1070);
      expect(result.pa40.lateFilingOrPaymentPenalty.toNumber()).toBe(35);
      // Total due = $1,070 + $35 = $1,105
      expect(result.pa40.totalAmountDue.toNumber()).toBe(1105);
    });

    it("PA orchestrator passes late payment interest through to PA-40", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "100000",
            federalWithheld: "15000",
            stateWages: "100000",
            stateTaxWithheld: "2000",
            state: "PA",
          }],
        }),
        { latePaymentInterest: d(35) },
      );

      // Tax: $3,070; withholding: $2,000; owed: $1,070
      expect(result.pa40.amountOwed.toNumber()).toBe(1070);
      expect(result.pa40.latePaymentInterest.toNumber()).toBe(35);
      // Total due = $1,070 + $35 = $1,105
      expect(result.pa40.totalAmountDue.toNumber()).toBe(1105);
    });

    it("PA orchestrator wires REV-1630 penalty into PA-40 totalAmountDue", () => {
      // Self-employed: $80,000 → tax = $2,456
      // No withholding, no estimated payments → penalty applies
      const result = calculatePAReturn(
        makeInput({
          form1099Nec: [{
            payer: "Client A",
            nonemployeeCompensation: 80000,
            federalWithheld: 0,
          }],
        }),
        {
          quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
        },
      );

      // Tax: $80,000 × 3.07% = $2,456
      expect(result.pa40.taxLiability.toNumber()).toBe(2456);
      // Penalty from REV-1630 should be > $0 and flow to PA-40
      expect(result.rev1630).toBeDefined();
      expect(result.rev1630!.totalInterest.gt(d(0))).toBe(true);
      // Penalty should be wired into PA-40
      expect(result.pa40.underpaymentPenalty.toNumber()).toBe(
        result.rev1630!.totalInterest.toNumber(),
      );
      // Total due = amount owed + penalty
      expect(result.pa40.totalAmountDue.toNumber()).toBe(
        result.pa40.amountOwed.plus(result.pa40.underpaymentPenalty).toNumber(),
      );
    });

    it("PA orchestrator REV-1630 penalty is $0 when no quarterly payments override", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "80000",
            federalWithheld: "10000",
            stateWages: "80000",
            stateTaxWithheld: "1500",
            state: "PA",
          }],
        }),
      );

      // No quarterlyEstimatedPayments → no REV-1630 → penalty = $0
      expect(result.rev1630).toBeUndefined();
      expect(result.pa40.underpaymentPenalty.toNumber()).toBe(0);
      // Total due = amount owed only
      expect(result.pa40.totalAmountDue.toNumber()).toBe(
        result.pa40.amountOwed.toNumber(),
      );
    });

    it("PA orchestrator combines use tax + penalty + interest in total due", () => {
      // Self-employed: $120,000 → tax = $3,684
      // No withholding, no estimated payments → penalty
      const result = calculatePAReturn(
        makeInput({
          form1099Nec: [{
            payer: "Client A",
            nonemployeeCompensation: 120000,
            federalWithheld: 0,
          }],
        }),
        {
          useTax: d(200),
          lateFilingOrPaymentPenalty: d(40),
          latePaymentInterest: d(50),
          quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
        },
      );

      expect(result.pa40.taxLiability.toNumber()).toBe(3684);
      const penalty = result.pa40.underpaymentPenalty.toNumber();
      expect(penalty).toBeGreaterThan(0);
      // Total due = amount owed + use tax + penalty + late filing/payment charges
      const expectedTotal = result.pa40.amountOwed.toNumber() + 200 + penalty + 40 + 50;
      expect(result.pa40.totalAmountDue.toNumber()).toBe(expectedTotal);
    });

    it("PA orchestrator use tax with overpayment: overpayment absorbs use tax", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "50000",
            federalWithheld: "6000",
            stateWages: "50000",
            stateTaxWithheld: "2000",
            state: "PA",
          }],
        }),
        { useTax: d(100) },
      );

      // Tax: $1,535; withholding: $2,000; overpayment: $465
      expect(result.pa40.overpayment.toNumber()).toBe(465);
      // Use tax $100 < overpayment $465 → total due = $0
      expect(result.pa40.totalAmountDue.toNumber()).toBe(0);
    });

    it("PA orchestrator defaults: no use tax, penalty, or interest → totalAmountDue = amountOwed", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "60000",
            federalWithheld: "8000",
            stateWages: "60000",
            stateTaxWithheld: "1500",
            state: "PA",
          }],
        }),
      );

      // Tax: $60,000 × 3.07% = $1,842; withholding: $1,500; owed: $342
      expect(result.pa40.taxLiability.toNumber()).toBe(1842);
      expect(result.pa40.amountOwed.toNumber()).toBe(342);
      expect(result.pa40.useTax.toNumber()).toBe(0);
      expect(result.pa40.underpaymentPenalty.toNumber()).toBe(0);
      expect(result.pa40.latePaymentInterest.toNumber()).toBe(0);
      expect(result.pa40.totalAmountDue.toNumber()).toBe(342);
    });

    it("PA orchestrator penalty with partial estimated payments", () => {
      // Self-employed: $100,000 → tax = $3,070
      // Pays $500/quarter → total $2,000; still underpaid
      const result = calculatePAReturn(
        makeInput({
          form1099Nec: [{
            payer: "Consulting Client",
            nonemployeeCompensation: 100000,
            federalWithheld: 0,
          }],
        }),
        {
          // estimatedPayments: total for PA-40 Line 16
          // quarterlyEstimatedPayments: per-quarter timing for REV-1630
          estimatedPayments: d(2000),
          quarterlyEstimatedPayments: [d(500), d(500), d(500), d(500)],
        },
      );

      // Tax: $3,070; no withholding; estimated: $2,000
      expect(result.pa40.taxLiability.toNumber()).toBe(3070);
      expect(result.pa40.amountOwed.toNumber()).toBe(1070);
      // REV-1630 penalty should exist but be smaller than full underpayment scenario
      expect(result.rev1630).toBeDefined();
      expect(result.rev1630!.penaltyRequired).toBe(true);
      // Penalty flows to PA-40
      expect(result.pa40.underpaymentPenalty.toNumber()).toBeGreaterThan(0);
      expect(result.pa40.totalAmountDue.toNumber()).toBe(
        result.pa40.amountOwed.plus(result.pa40.underpaymentPenalty).toNumber(),
      );
    });

    it("PA orchestrator penalty exempt with 100% forgiveness: totalAmountDue unchanged", () => {
      // Low-income filer: $6,000 wages → 100% forgiveness
      // Even with no estimated payments, penalty should be $0
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Low Pay Inc", ein: "12-3456789" },
            wages: "6000",
            federalWithheld: "300",
            stateWages: "6000",
            stateTaxWithheld: "0",
            state: "PA",
          }],
        }),
        {
          quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
          priorYear100PercentForgiveness: true,
        },
      );

      // 100% forgiveness → no tax → no penalty
      expect(result.pa40.underpaymentPenalty.toNumber()).toBe(0);
      expect(result.pa40.totalAmountDue.toNumber()).toBe(0);
    });
  });

  describe.sequential("Schedule DC Integration", () => {
    it("PA orchestrator computes Schedule DC from the federal dependent care credit", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Care Employer", ein: "12-3456789" },
          wages: "50000",
          federalWithheld: "1200",
          stateWages: "50000",
          stateTaxWithheld: "1535",
          state: "PA",
        }],
        dependentCare: {
          expenses: "3000",
          qualifyingIndividuals: 1,
        },
      }));

      expect(result.scheduleDC).toBeDefined();
      expect(result.scheduleDC!.qualifyingPersons).toBe(1);
      expect(result.scheduleDC!.credit.toNumber()).toBe(600);
    });

    it("PA orchestrator carries refundable Schedule DC on PA-40 Line 23 without capping it to remaining liability", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Refundable Care Employer", ein: "12-3456789" },
          wages: "12000",
          federalWithheld: "900",
          stateWages: "12000",
          stateTaxWithheld: "0",
          state: "PA",
        }],
        paResidentReturn: {
          isClaimedAsDependentOnAnotherFederalReturn: true,
        },
        dependentCare: {
          expenses: "3000",
          qualifyingIndividuals: 1,
        },
      }));

      expect(result.scheduleDC).toBeDefined();
      expect(result.scheduleDC!.credit.toNumber()).toBe(1050);
      expect(result.workingPennsylvaniansTaxCredit?.credit.toNumber() ?? 0).toBe(0);
      expect(result.pa40.otherCredits.toNumber()).toBe(1050);
      expect(result.pa40.totalCredits.toNumber()).toBe(1050);
      expect(result.pa40.refundableCredits.toNumber()).toBe(0);
      expect(result.pa40.netTaxLiability.toNumber()).toBe(0);
      expect(result.pa40.netOverpayment.toNumber()).toBe(682);
    });

    it("PA orchestrator omits Schedule DC when there is no dependent care input", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "No Care Employer", ein: "12-3456789" },
          wages: "25000",
          federalWithheld: "2200",
          stateWages: "25000",
          stateTaxWithheld: "768",
          state: "PA",
        }],
      }));

      expect(result.scheduleDC).toBeUndefined();
    });

    it("PA orchestrator Schedule DC credit is zero when the federal credit is zero", () => {
      const result = calculatePAReturn(makeInput({
        w2s: [{
          employer: { name: "Zero Care Employer", ein: "12-3456789" },
          wages: "90000",
          federalWithheld: "12000",
          stateWages: "90000",
          stateTaxWithheld: "2763",
          state: "PA",
        }],
        dependentCare: {
          expenses: "0",
          qualifyingIndividuals: 1,
        },
      }));

      expect(result.scheduleDC).toBeDefined();
      expect(result.scheduleDC!.credit.toNumber()).toBe(0);
    });

    it("PA orchestrator computes the Working Pennsylvanians Tax Credit from federal EITC", () => {
      const input = makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "head_of_household",
          primary: { firstName: "Taylor", lastName: "Worker", ssn: "000-00-1111", dateOfBirth: "1990-01-01" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [
            {
              firstName: "Kid",
              lastName: "Worker",
              ssn: "000-00-2222",
              relationship: "child",
              dateOfBirth: "2017-06-01",
              monthsLivedWithYou: 12,
              qualifiesForCTC: true,
              qualifiesForODC: false,
              qualifiesForEIC: true,
            },
          ],
        },
        w2s: [{
          employer: { name: "Retail Co", ein: "12-3456789" },
          wages: "18000",
          federalWithheld: "500",
          stateWages: "18000",
          stateTaxWithheld: "553",
          state: "PA",
        }],
      });

      const federal = calculateFederalTax(input);
      const federalEitc = federal.allLines.find(
        (line) => line.form === "1040" && line.line === "27a",
      )?.value ?? d(0);
      const expectedWptc = federalEitc.times("0.10").toNearest(1);

      const result = calculatePAReturn(input);

      expect(federalEitc.toNumber()).toBeGreaterThan(0);
      expect(result.workingPennsylvaniansTaxCredit).toBeDefined();
      expect(result.workingPennsylvaniansTaxCredit!.credit.toNumber()).toBe(expectedWptc.toNumber());
      expect(result.pa40.refundableCredits.toNumber()).toBe(expectedWptc.toNumber());
    });

    it("PA orchestrator blocks WPTC when federal EITC is positive but Pennsylvania earned income is zero", () => {
      const input = makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "head_of_household",
          primary: { firstName: "Robin", lastName: "Service", ssn: "000-00-1112", dateOfBirth: "1990-01-01" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [
            {
              firstName: "Kid",
              lastName: "Service",
              ssn: "000-00-2223",
              relationship: "child",
              dateOfBirth: "2017-06-01",
              monthsLivedWithYou: 12,
              qualifiesForCTC: true,
              qualifiesForODC: false,
              qualifiesForEIC: true,
            },
          ],
        },
        w2s: [{
          employer: { name: "US Army", ein: "12-3456789" },
          wages: "18000",
          federalWithheld: "500",
          stateWages: "18000",
          stateTaxWithheld: "0",
          state: "PA",
          militaryService: {
            activeDuty: true,
            dutyState: "AE",
          },
        }],
      });

      const federal = calculateFederalTax(input);
      const federalEitc = federal.allLines.find(
        (line) => line.form === "1040" && line.line === "27a",
      )?.value ?? d(0);

      const result = calculatePAReturn(input);

      expect(federalEitc.toNumber()).toBeGreaterThan(0);
      expect(result.mappedIncome.compensation.toNumber()).toBe(0);
      expect(result.workingPennsylvaniansTaxCredit?.credit.toNumber() ?? 0).toBe(0);
      expect(result.pa40.refundableCredits.toNumber()).toBe(0);
    });

    it("PA orchestrator blocks WPTC when the resident supplement marks the taxpayer as claimed on another federal return", () => {
      const input = makeInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "head_of_household",
          primary: { firstName: "Jamie", lastName: "Dependent", ssn: "000-00-1113", dateOfBirth: "1990-01-01" },
          address: { street: "100 Main St", city: "Philadelphia", state: "PA", zip: "19101" },
          dependents: [
            {
              firstName: "Kid",
              lastName: "Dependent",
              ssn: "000-00-2224",
              relationship: "child",
              dateOfBirth: "2017-06-01",
              monthsLivedWithYou: 12,
              qualifiesForCTC: true,
              qualifiesForODC: false,
              qualifiesForEIC: true,
            },
          ],
        },
        w2s: [{
          employer: { name: "Retail Co", ein: "12-3456789" },
          wages: "18000",
          federalWithheld: "500",
          stateWages: "18000",
          stateTaxWithheld: "553",
          state: "PA",
        }],
        paResidentReturn: {
          isClaimedAsDependentOnAnotherFederalReturn: true,
        },
      });

      const federal = calculateFederalTax(input);
      const federalEitc = federal.allLines.find(
        (line) => line.form === "1040" && line.line === "27a",
      )?.value ?? d(0);

      const result = calculatePAReturn(input);

      expect(federalEitc.toNumber()).toBeGreaterThan(0);
      expect(result.workingPennsylvaniansTaxCredit?.credit.toNumber() ?? 0).toBe(0);
      expect(result.pa40.refundableCredits.toNumber()).toBe(0);
    });
  });

  describe.sequential("PA resident supplemental input wiring", () => {
    it("PA orchestrator resolves PA resident supplemental inputs from TaxYearInput and lets explicit overrides win", () => {
      const result = calculatePAReturn(
        makeInput({
          w2s: [{
            employer: { name: "Acme Corp", ein: "12-3456789" },
            wages: "60000",
            federalWithheld: "7500",
            stateWages: "60000",
            stateTaxWithheld: "1842",
            localTaxWithheld: "400",
            state: "PA",
          }],
          paResidentReturn: {
            creditFromPriorYear: "125",
            estimatedPayments: "300",
            nonresidentTaxWithheld: "80",
            useTax: "40",
            lateFilingOrPaymentPenalty: "9",
            latePaymentInterest: "7",
            scheduleUE: {
              vehicle: {
                method: "standard",
                totalMiles: 10000,
                businessMiles: 1000,
                parkingAndTolls: "20",
              },
              employerReimbursements: "50",
            },
            scheduleOC: {
              otherCredits: [
                { creditType: "reap", amount: "150", description: "REAP credit" },
              ],
            },
            otherStateCredits: [
              {
                stateCode: "NJ",
                incomeTaxableByBothStates: "10000",
                taxPaidToOtherState: "400",
              },
            ],
            localMunicipality: "Lower Merion Township",
            localEITRate: "0.01",
            scheduleSD: {
              method: "EI",
              schoolDistrictRate: "0.01",
              schoolDistrictWithholding: "400",
              estimatedPayments: "25",
            },
            quarterlyEstimatedPayments: ["75", "75", "75", "75"],
          },
        }),
        {
          estimatedPayments: d(500),
          localMunicipality: "Abington Township",
        },
      );

      expect(result.pa40.unreimbursedExpenses.toNumber()).toBe(670);
      expect(result.pa40.creditFromPriorYear.toNumber()).toBe(125);
      expect(result.pa40.estimatedPayments.toNumber()).toBe(500);
      expect(result.pa40.nonresidentTaxWithheld.toNumber()).toBe(80);
      expect(result.pa40.useTax.toNumber()).toBe(40);
      expect(result.pa40.lateFilingOrPaymentPenalty.toNumber()).toBe(9);
      expect(result.pa40.latePaymentInterest.toNumber()).toBe(7);
      expect(result.pa40.otherCredits.toNumber()).toBe(150);
      expect(result.scheduleOC).toBeDefined();
      expect(result.scheduleOC!.totalOtherCredits.toNumber()).toBe(150);
      expect(result.scheduleGL.totalCredit.toNumber()).toBe(307);
      expect(result.scheduleGL.perStateResults[0].stateCode).toBe("NJ");
      expect(result.localEIT).toBeDefined();
      expect(result.localEIT!.municipality).toBe("Abington Township");
      expect(result.localEIT!.localEITRate.toNumber()).toBe(0.01);
      expect(result.scheduleSD).toBeDefined();
      expect(result.scheduleSD!.estimatedPayments.toNumber()).toBe(25);
      expect(result.rev1630).toBeDefined();
      expect(result.pa40.underpaymentPenalty.toString()).toBe(result.rev1630!.totalInterest.toString());
    });

    it("PA orchestrator computes use tax from the supported worksheet and preserves raw Line 25 override precedence", () => {
      const input = makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "50000",
          federalWithheld: "6000",
          stateWages: "50000",
          stateTaxWithheld: "1535",
          state: "PA",
        }],
        paResidentReturn: {
          useTaxWorksheet: {
            locality: "remainder_of_pa",
            taxableItemPurchases: "500",
            taxableServicePurchases: "250",
            electEstimatedTable: true,
            salesTaxAlreadyPaid: "10",
          },
        },
      });

      const residentWorksheetResult = calculatePAReturn(input);
      expect(residentWorksheetResult.pa40.totalPATaxableIncome.toNumber()).toBe(50000);
      expect(residentWorksheetResult.pa40.useTax.toNumber()).toBe(52);

      const explicitWorksheetOverride = calculatePAReturn(input, {
        useTaxWorksheet: {
          locality: "philadelphia",
          taxableItemPurchases: d(200),
          taxableServicePurchases: d(50),
          electEstimatedTable: true,
          salesTaxAlreadyPaid: d(0),
        },
      });
      expect(explicitWorksheetOverride.pa40.useTax.toNumber()).toBe(42);

      const rawOverrideWins = calculatePAReturn(input, {
        useTax: d(40),
        useTaxWorksheet: {
          locality: "philadelphia",
          taxableItemPurchases: d(200),
          taxableServicePurchases: d(50),
          electEstimatedTable: true,
          salesTaxAlreadyPaid: d(0),
        },
      });
      expect(rawOverrideWins.pa40.useTax.toNumber()).toBe(40);
    });

    it("PA orchestrator caps itemized use-tax prior-tax offsets at the published Line 7 per-item rate", () => {
      const input = makeInput({
        w2s: [{
          employer: { name: "Acme Corp", ein: "12-3456789" },
          wages: "40000",
          federalWithheld: "5000",
          stateWages: "40000",
          stateTaxWithheld: "1228",
          state: "PA",
        }],
        paResidentReturn: {
          useTaxWorksheet: {
            locality: "philadelphia",
            taxableItemPurchases: "1000",
            taxableServicePurchases: "0",
            electEstimatedTable: true,
            salesTaxAlreadyPaidEntries: [
              {
                taxablePurchaseAmount: "1000",
                salesTaxPaid: "100",
              },
            ],
          },
        },
      });

      const result = calculatePAReturn(input);
      expect(result.pa40.useTax.toNumber()).toBe(22);
    });

    it("PA orchestrator applies the Schedule SP dependent claimant gate from PA resident supplements", () => {
      const dependentInput = makeInput({
        w2s: [{
          employer: { name: "Campus Bookstore", ein: "12-3456789" },
          wages: "4000",
          federalWithheld: "100",
          stateWages: "4000",
          stateTaxWithheld: "0",
          state: "PA",
        }],
        paResidentReturn: {
          isClaimedAsDependentOnAnotherFederalReturn: true,
        },
      });

      const blocked = calculatePAReturn(dependentInput);
      expect(blocked.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
      expect(blocked.pa40.taxForgivenessCredit.toNumber()).toBe(0);
      expect(blocked.workingPennsylvaniansTaxCredit?.credit.toNumber() ?? 0).toBe(0);
      expect(blocked.pa40.totalAmountDue.toNumber()).toBe(123);

      const allowed = calculatePAReturn(dependentInput, {
        claimingHouseholdQualifiesForTaxForgiveness: true,
      });
      expect(allowed.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
      expect(allowed.pa40.taxForgivenessCredit.toNumber()).toBe(123);
      expect(allowed.workingPennsylvaniansTaxCredit?.credit.toNumber() ?? 0).toBe(0);
      expect(allowed.pa40.totalAmountDue.toNumber()).toBe(0);
      expect(allowed.pa40.netOverpayment.toNumber()).toBe(0);
    });

    it("PA orchestrator computes interest through PA Schedule A with Pennsylvania pass-through reclassification", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [
          {
            payer: "TreasuryDirect",
            interestIncome: "1000",
            taxExemptInterest: "40",
            usSavingsBondInterest: "100",
          },
        ],
        form1099R: [
          {
            payer: "Annuity Co",
            grossDistribution: "40",
            taxableAmount: "40",
            distributionCode: "7D",
          },
        ],
        scheduleK1: [
          {
            partnershipName: "Alpha Partners LP",
            partnershipEIN: "12-3456789",
            ordinaryIncome: "0",
            interestIncome: "200",
            entityType: "partnership",
            foreignTaxCategory: "general",
            section199AIsSST: false,
            section199APTPIsSST: false,
            isPassiveActivity: false,
            isPubliclyTradedPartnership: false,
            ptpFullyDisposedInTaxableTransaction: false,
            isForeignPartnership: false,
          },
        ],
        paPassThroughStatements: [
          {
            entityName: "Alpha Partners LP",
            entityEIN: "12-3456789",
            sourceDocument: "pa_rk_1",
            interestIncome: "120",
          },
        ],
        paResidentReturn: {
          scheduleA: {
            additionAdjustments: [
              { description: "Nominee interest", amount: "20" },
            ],
            paObligationInterest: "50",
            reductionAdjustments: [
              { description: "Federal K-1 U.S. obligations", amount: "30" },
            ],
            charitableGiftAnnuityIncome: "10",
          },
        },
      }));

      expect(result.scheduleA).toBeDefined();
      expect(result.scheduleA!.line5.toNumber()).toBe(200);
      expect(result.scheduleA!.line11.toNumber()).toBe(40);
      expect(result.scheduleA!.line15.toNumber()).toBe(120);
      expect(result.scheduleA!.line16.toNumber()).toBe(1050);
      expect(result.mappedIncome.interest.toNumber()).toBe(1050);
    });

    it("PA orchestrator defaults Schedule A Line 6 from Form 1099-INT Pennsylvania direct-obligation allocations", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [
          {
            payer: "Pennsylvania Municipal Fund",
            interestIncome: "200",
            taxExemptInterest: "80",
            usSavingsBondInterest: "10",
            paDirectObligationInterest: "50",
          },
        ],
      }));

      expect(result.scheduleA).toBeDefined();
      expect(result.scheduleA!.line6.toNumber()).toBe(50);
      expect(result.scheduleA!.line7.toNumber()).toBe(10);
      expect(result.scheduleA!.line16.toNumber()).toBe(220);
      expect(result.mappedIncome.interest.toNumber()).toBe(220);
      expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(60);
    });

    it("PA orchestrator defaults Schedule A Line 8 from supported Form 1099-INT forfeited-interest penalties without over-deducting interest", () => {
      const result = calculatePAReturn(makeInput({
        form1099Int: [
          {
            payer: "First Bank",
            interestIncome: "40",
            earlyWithdrawalPenalty: "60",
          },
          {
            payer: "Second Bank",
            interestIncome: "10",
            earlyWithdrawalPenalty: "5",
          },
        ],
        paResidentReturn: {
          scheduleA: {
            reductionAdjustments: [
              { description: "Installment-sale interest already taxed as gain", amount: "5" },
            ],
          },
        },
      }));

      expect(result.scheduleA).toBeDefined();
      expect(result.scheduleA!.line1.toNumber()).toBe(50);
      expect(result.scheduleA!.line8.toNumber()).toBe(50);
      expect(result.scheduleA!.line10.toNumber()).toBe(0);
      expect(result.scheduleA!.line16.toNumber()).toBe(0);
      expect(result.mappedIncome.interest.toNumber()).toBe(0);
    });

    it("PA orchestrator defaults Schedule A Lines 13 and 14 from supported federal 529 and HSA computations", () => {
      const result = calculatePAReturn(makeInput({
        form1099Q: [
          {
            accountType: "529",
            grossDistribution: "10000",
            earnings: "3000",
            basis: "7000",
            isTrusteeToTrustee: false,
          },
        ],
        qualifiedEducationExpenses: {
          totalQualifiedExpenses: "5000",
          taxFreeEducationalAssistance: "0",
          amountsUsedForEducationCredits: "0",
          penaltyExceptionScholarshipAmount: "0",
          penaltyExceptionDeath: false,
          penaltyExceptionDisability: false,
          penaltyExceptionMilitaryAcademyAmount: "0",
        },
        form8889: {
          accountOwner: "primary",
          coverageByMonth: Array(12).fill("self_only"),
          contributionsMade: "0",
          distributionsReceived: "3000",
          excludedDistributions: "500",
          qualifiedMedicalExpenses: "1500",
        },
      }));

      expect(result.scheduleA).toBeDefined();
      expect(result.scheduleA!.line13.toNumber()).toBe(1500);
      expect(result.scheduleA!.line14.toNumber()).toBe(1000);
      expect(result.scheduleA!.line16.toNumber()).toBe(2500);
      expect(result.mappedIncome.interest.toNumber()).toBe(2500);
      expect(result.pa40.interest.toNumber()).toBe(2500);
    });

    it("PA orchestrator lets explicit Schedule A Lines 13 and 14 override the derived federal defaults", () => {
      const result = calculatePAReturn(makeInput({
        form1099Q: [
          {
            accountType: "529",
            grossDistribution: "10000",
            earnings: "3000",
            basis: "7000",
            isTrusteeToTrustee: false,
          },
        ],
        qualifiedEducationExpenses: {
          totalQualifiedExpenses: "5000",
          taxFreeEducationalAssistance: "0",
          amountsUsedForEducationCredits: "0",
          penaltyExceptionScholarshipAmount: "0",
          penaltyExceptionDeath: false,
          penaltyExceptionDisability: false,
          penaltyExceptionMilitaryAcademyAmount: "0",
        },
        form8889: {
          accountOwner: "primary",
          coverageByMonth: Array(12).fill("self_only"),
          contributionsMade: "0",
          distributionsReceived: "3000",
          excludedDistributions: "500",
          qualifiedMedicalExpenses: "1500",
        },
      }), {
        scheduleA: {
          nonEducational529Distributions: d(250),
          taxableHealthMedicalSavingsDistributions: d(400),
        },
      });

      expect(result.scheduleA).toBeDefined();
      expect(result.scheduleA!.line13.toNumber()).toBe(250);
      expect(result.scheduleA!.line14.toNumber()).toBe(400);
      expect(result.scheduleA!.line16.toNumber()).toBe(650);
      expect(result.mappedIncome.interest.toNumber()).toBe(650);
    });

    it("PA orchestrator allocates mixed 529 and Coverdell 1099-Q taxable earnings between Schedule A Line 13 and PA interest", () => {
      const result = calculatePAReturn(makeInput({
        form1099Q: [
          {
            accountType: "529",
            grossDistribution: "10000",
            earnings: "3000",
            basis: "7000",
            isTrusteeToTrustee: false,
          },
          {
            accountType: "coverdell_esa",
            grossDistribution: "5000",
            earnings: "500",
            basis: "4500",
            isTrusteeToTrustee: false,
          },
        ],
        qualifiedEducationExpenses: {
          totalQualifiedExpenses: "6000",
          taxFreeEducationalAssistance: "0",
          amountsUsedForEducationCredits: "0",
          penaltyExceptionScholarshipAmount: "0",
          penaltyExceptionDeath: false,
          penaltyExceptionDisability: false,
          penaltyExceptionMilitaryAcademyAmount: "0",
        },
      }));

      expect(result.scheduleA).toBeDefined();
      expect(result.scheduleA!.line13.toNumber()).toBe(1800);
      expect(result.scheduleA!.line16.toNumber()).toBe(1800);
      expect(result.mappedIncome.interest.toNumber()).toBe(2100);
      expect(result.pa40.interest.toNumber()).toBe(2100);
    });

    it("PA orchestrator maps pure Coverdell ESA taxable earnings to PA interest outside Schedule A Line 13", () => {
      const result = calculatePAReturn(makeInput({
        form1099Q: [
          {
            accountType: "coverdell_esa",
            grossDistribution: "5000",
            earnings: "1500",
            basis: "3500",
            isTrusteeToTrustee: false,
          },
        ],
      }));

      expect(result.scheduleA).toBeDefined();
      expect(result.scheduleA!.line13.toNumber()).toBe(0);
      expect(result.scheduleA!.line16.toNumber()).toBe(0);
      expect(result.mappedIncome.interest.toNumber()).toBe(1500);
      expect(result.pa40.interest.toNumber()).toBe(1500);
    });
  });
});
