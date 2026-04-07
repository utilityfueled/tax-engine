import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateOhioResidentReturn,
  calculateOhioResidentReturnFromFederal,
  getOhioConstants,
  lookupOhioSchoolDistrictMetadata,
} from "@/index.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";

function makeTaxInput(): TaxYearInput {
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
    w2s: [
      {
        employer: { name: "Acme Corp", ein: "12-3456789" },
        wages: "50000",
        federalWithheld: "5000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
        state: "OH",
        stateTaxWithheld: "1200",
        localTaxWithheld: "0",
        stateWages: "50000",
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
      },
    ],
  } as unknown as TaxYearInput;
}

function makeFederalResult(): TaxReturnResult {
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
  } as TaxReturnResult;
}

describe("Ohio shared constants and public API", () => {
  it("exposes 2025 Ohio IT 1040 brackets and exemption tiers from shared constants", () => {
    const constants = getOhioConstants(2025);

    expect(constants.it1040.nonbusinessBrackets[1]?.lowerBound.toNumber()).toBe(26050);
    expect(constants.it1040.nonbusinessBrackets[1]?.baseTax.toNumber()).toBe(342);
    expect(constants.it1040.nonbusinessBrackets[1]?.rate.toString()).toBe("0.0275");
    expect(constants.it1040.nonbusinessBrackets[2]?.rate.toString()).toBe("0.03125");
    expect(constants.it1040.exemptionTiers[0]?.amount.toNumber()).toBe(2400);
    expect(constants.it1040.exemptionTiers[3]?.amount.toNumber()).toBe(0);
  });

  it("exports the Ohio resident return orchestrator from the package entry point", () => {
    const result = calculateOhioResidentReturn({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
      ohioWithholding: 1200,
    });

    expect(result.it1040.line13_totalLiability.toNumber()).toBe(942);
    expect(result.it1040.line26_refund.toNumber()).toBe(258);
  });

  it("exports the Ohio federal-to-state wrapper from the package entry point", () => {
    const result = calculateOhioResidentReturnFromFederal({
      taxInput: makeTaxInput(),
      federalResult: makeFederalResult(),
    });

    expect(result.it1040.line14_ohioWithholding.toNumber()).toBe(1200);
    expect(result.it1040.line26_refund.toNumber()).toBe(258);
  });

  it("exports Ohio school district lookup metadata from the package entry point", () => {
    const district = lookupOhioSchoolDistrictMetadata(2025, "4202");

    expect(district).not.toBeNull();
    expect(district?.districtNumber).toBe("4202");
    expect(district?.taxType).toBe("traditional");
    expect(district?.rate.toString()).toBe("0.0175");
  });
});
