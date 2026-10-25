import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm2441 } from "@/engine/forms/form-2441.js";
import { buildOhioResidentReturnInput } from "@/engine/state/oh-input-adapter.js";
import { calculateOhioResidentReturnFromFederal } from "@/engine/state/oh-engine.js";
import { calculateOhioResidentReturn } from "@/engine/state/oh-return.js";
import type { TaxYearInput, W2 } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";

function makeW2(overrides: Partial<W2> = {}): W2 {
  return {
    employer: { name: "Acme Corp", ein: "12-3456789" },
    wages: "50000",
    federalWithheld: "5000",
    socialSecurityWages: "50000",
    socialSecurityWithheld: "3100",
    medicareWages: "50000",
    medicareWithheld: "725",
    stateTaxWithheld: "0",
    localTaxWithheld: "0",
    stateWages: "0",
    box12CodeW: "0",
    box12CodeD: "0",
    box12CodeE: "0",
    box12CodeF: "0",
    box12CodeG: "0",
    box12CodeH: "0",
    box12CodeS: "0",
    box12CodeAA: "0",
    box12CodeBB: "0",
    box12CodeEE: "0",
    box12CodeT: "0",
    socialSecurityTips: "0",
    ...overrides,
  };
}

function makeTaxInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Jane",
        lastName: "Doe",
        ssn: "123-45-6789",
        dateOfBirth: "1980-06-15",
      },
      address: {
        street: "123 Main St",
        city: "Columbus",
        state: "OH",
        zip: "43215",
      },
      dependents: [],
    },
    w2s: [],
    ...overrides,
  } as unknown as TaxYearInput;
}

function makeFederalResult(
  overrides: Partial<TaxReturnResult> = {},
): TaxReturnResult {
  return {
    taxYear: 2025,
    filingStatus: "single",
    totalWages: new Decimal(50000),
    totalInterest: new Decimal(0),
    totalDividends: new Decimal(0),
    qualifiedDividends: new Decimal(0),
    iraDistributionsGross: new Decimal(0),
    iraDistributionsTaxable: new Decimal(0),
    pensionDistributionsGross: new Decimal(0),
    pensionDistributionsTaxable: new Decimal(0),
    socialSecurityBenefitsGross: new Decimal(0),
    socialSecurityBenefitsTaxable: new Decimal(0),
    capitalGainLoss: new Decimal(0),
    otherIncome: new Decimal(0),
    nolDeduction: new Decimal(0),
    totalIncome: new Decimal(50000),
    adjustmentsToIncome: new Decimal(0),
    agi: new Decimal(50000),
    standardDeduction: new Decimal(15000),
    itemizedDeductions: new Decimal(0),
    deductionUsed: "standard",
    deductionAmount: new Decimal(15000),
    taxableIncome: new Decimal(35000),
    ordinaryTax: new Decimal(3500),
    capitalGainsTax: new Decimal(0),
    totalTaxBeforeCredits: new Decimal(3500),
    childTaxCredit: new Decimal(0),
    foreignTaxCredit: new Decimal(0),
    otherCredits: new Decimal(0),
    totalCredits: new Decimal(0),
    earnedIncomeCredit: new Decimal(0),
    amt: new Decimal(0),
    selfEmploymentTax: new Decimal(0),
    additionalMedicareTax: new Decimal(0),
    niitTax: new Decimal(0),
    estimatedTaxPenalty: new Decimal(0),
    totalAdditionalTaxes: new Decimal(0),
    totalTax: new Decimal(3500),
    totalPayments: new Decimal(5000),
    totalWithholding: new Decimal(5000),
    estimatedTaxPayments: new Decimal(0),
    amountOwed: new Decimal(0),
    refund: new Decimal(1500),
    carryforwards: {
      capitalLoss: new Decimal(0),
      shortTermCapitalLoss: new Decimal(0),
      longTermCapitalLoss: new Decimal(0),
      suspendedPassiveLosses: [],
      suspendedPTPLosses: [],
      foreignTaxCreditCarryforward: new Decimal(0),
      foreignTaxCreditCarryforwardByCategory: {},
      qbiLossCarryforward: new Decimal(0),
      investmentInterestExpense: new Decimal(0),
      minimumTaxCredit: new Decimal(0),
      charitableContributions: new Decimal(0),
      charitableContributionsByYear: [],
      excessBusinessLossNOL: new Decimal(0),
      nolCarryforward: new Decimal(0),
      generalBusinessCredit: new Decimal(0),
      suspendedBusinessInterest: [],
      partnerBasis: [],
    },
    ...overrides,
  } as TaxReturnResult;
}

describe("Ohio Resident Engine", () => {
  it("Ohio engine builds Ohio resident input from validated federal input", () => {
    const taxInput = makeTaxInput({
      w2s: [makeW2({ state: "OH", stateTaxWithheld: "1200" })],
    });
    const federalResult = makeFederalResult();

    const expected = buildOhioResidentReturnInput(taxInput, federalResult);
    const actual = calculateOhioResidentReturnFromFederal({
      taxInput,
      federalResult,
    });

    expect(actual.it1040.line1_federalAgi.toNumber()).toBe(
      Number(expected.federalAgi),
    );
    expect(actual.it1040.line14_ohioWithholding.toNumber()).toBe(1200);
    expect(actual.it1040.line26_refund.toNumber()).toBe(258);
  });

  it("Ohio engine computes the same result as manual adapter plus orchestrator composition", () => {
    const taxInput = makeTaxInput({
      w2s: [makeW2({ state: "OH", stateTaxWithheld: "1200" })],
    });
    const federalResult = makeFederalResult();

    const manual = calculateOhioResidentReturn(
      buildOhioResidentReturnInput(taxInput, federalResult),
    );
    const wrapped = calculateOhioResidentReturnFromFederal({
      taxInput,
      federalResult,
    });

    expect(wrapped.it1040.line8c_totalTax.toNumber()).toBe(
      manual.it1040.line8c_totalTax.toNumber(),
    );
    expect(wrapped.it1040.line26_refund.toNumber()).toBe(
      manual.it1040.line26_refund.toNumber(),
    );
    expect(wrapped.lines).toHaveLength(manual.lines.length);
  });

  it("Ohio engine auto-fills Ohio child care credit inputs from federal Form 2441", () => {
    const taxInput = makeTaxInput({
      w2s: [makeW2({ state: "OH", stateTaxWithheld: "500", wages: "30000" })],
    });
    const federalResult = makeFederalResult({
      agi: new Decimal(30000),
      totalWages: new Decimal(30000),
      totalIncome: new Decimal(30000),
      taxableIncome: new Decimal(15000),
      form2441: calculateForm2441({
        taxYear: 2025,
        filingStatus: "single",
        careExpenses: new Decimal(2000),
        qualifyingIndividuals: 1,
        earnedIncome: new Decimal(30000),
        agi: new Decimal(30000),
        priorYearExpenseCredit: new Decimal(0),
        taxLiabilityLimit: new Decimal(400),
        eligibilityConfirmed: true,
      }),
    });

    const wrapped = calculateOhioResidentReturnFromFederal({
      taxInput,
      federalResult,
    });

    // The federal 27% rate gives line 9c = $540; the $400 liability limit
    // controls line 11. Ohio's $20,000–$39,999 band uses 25% of line 11.
    expect(federalResult.form2441?.lines.find(line => line.line === "9c")?.value.toFixed()).toBe("540");
    expect(wrapped.scheduleOfCredits.line6_childDependentCareCredit.toNumber()).toBe(100);
    expect(wrapped.it1040.line9_nonrefundableCredits.toNumber()).toBe(120);
  });

  it("Ohio engine overlay drives withholding override and SD 100 computation", () => {
    const taxInput = makeTaxInput({
      w2s: [
        makeW2({
          state: "OH",
          stateTaxWithheld: "1000",
          localTaxWithheld: "100",
          localityName: "2503",
          wages: "60000",
        }),
      ],
    });
    const federalResult = makeFederalResult({
      agi: new Decimal(60000),
      totalWages: new Decimal(60000),
      totalIncome: new Decimal(60000),
      taxableIncome: new Decimal(45000),
    });

    const wrapped = calculateOhioResidentReturnFromFederal({
      taxInput,
      federalResult,
      overlay: {
        ohioWithholdingOverride: 1500,
        schoolDistricts: [
          {
            districtNumber: "2503",
            districtName: "Columbus CSD",
            taxableIncome: 60000,
            rate: "0.02",
            taxBase: "traditional",
            residencyFactor: 1,
          },
        ],
      },
    });

    expect(wrapped.it1040.line14_ohioWithholding.toNumber()).toBe(1500);
    expect(wrapped.sd100).not.toBeNull();
    expect(wrapped.sd100!.line11_sdWithholding.toNumber()).toBe(100);
  });

  it("Ohio engine overlay drives IT SD 2210 auto-computation for state and school district tax", () => {
    const taxInput = makeTaxInput({
      w2s: [
        makeW2({
          state: "OH",
          stateTaxWithheld: "200",
          localTaxWithheld: "50",
          localityName: "2503",
          wages: "60000",
        }),
      ],
    });
    const federalResult = makeFederalResult({
      agi: new Decimal(60000),
      totalWages: new Decimal(60000),
      totalIncome: new Decimal(60000),
      taxableIncome: new Decimal(45000),
    });

    const overlay = {
      computeUnderpaymentPenalty: true,
      priorYearTaxLiability: 300,
      priorYearTimelyFiled: false,
      estimatedPaymentSchedule: [
        { paymentDate: "2025-09-15", amount: 100 },
        { paymentDate: "2026-01-15", amount: 150 },
      ],
      schoolDistricts: [
        {
          districtNumber: "2503",
          districtName: "Columbus CSD",
          taxableIncome: 60000,
          rate: "0.02",
          taxBase: "traditional" as const,
          residencyFactor: 1,
        },
      ],
      sdPriorYearTaxLiability: 200,
      sdPriorYearTimelyFiled: false,
      sdEstimatedPayments: 0,
    };

    const manual = calculateOhioResidentReturn({
      ...buildOhioResidentReturnInput(taxInput, federalResult),
      ...overlay,
    });
    const wrapped = calculateOhioResidentReturnFromFederal({
      taxInput,
      federalResult,
      overlay,
    });

    expect(manual.itsd2210).not.toBeNull();
    expect(manual.sdItsd2210).not.toBeNull();
    expect(wrapped.itsd2210).not.toBeNull();
    expect(wrapped.sdItsd2210).not.toBeNull();
    expect(wrapped.it1040.line11_underpaymentPenalty.toNumber()).toBe(
      manual.it1040.line11_underpaymentPenalty.toNumber(),
    );
    expect(wrapped.sd100!.line9_underpaymentPenalty.toNumber()).toBe(
      manual.sd100!.line9_underpaymentPenalty.toNumber(),
    );
  });
});
