/**
 * Tests for New Jersey NJ-1040 Input Adapter.
 * Spec: spec/state/nj-1040-adapter.yaml
 *
 * Verifies the mapping from TaxYearInput + TaxReturnResult → NJ1040Input.
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import {
  buildNJ1040Input,
  ageAsOf,
  type NJStateConfig,
} from "@/engine/state/nj-1040-adapter.js";
import { calculateNJ1040 } from "@/engine/state/nj-1040.js";

const d = (v: string | number) => new Decimal(v);

// ---------------------------------------------------------------------------
// Helpers: minimal TaxYearInput and TaxReturnResult builders
// ---------------------------------------------------------------------------

function minimalTaxInput(overrides: Record<string, unknown> = {}): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Test",
        lastName: "Taxpayer",
        ssn: "123-45-6789",
        dateOfBirth: "1990-06-15",
      },
      address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
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
    homeSales: [],
    savingsBondRedemptions: [],
    form6252: [],
    form8814: [],
    ...overrides,
  } as TaxYearInput;
}

function minimalFederalResult(
  overrides: Partial<TaxReturnResult> = {}
): TaxReturnResult {
  const zero = new Decimal(0);
  return {
    taxYear: 2025,
    filingStatus: "single",
    totalWages: zero,
    totalInterest: zero,
    totalDividends: zero,
    qualifiedDividends: zero,
    iraDistributionsGross: zero,
    iraDistributionsTaxable: zero,
    pensionDistributionsGross: zero,
    pensionDistributionsTaxable: zero,
    socialSecurityBenefitsGross: zero,
    socialSecurityBenefitsTaxable: zero,
    capitalGainLoss: zero,
    otherIncome: zero,
    nolDeduction: zero,
    totalIncome: zero,
    adjustmentsToIncome: zero,
    agi: zero,
    standardDeduction: zero,
    itemizedDeductions: zero,
    deductionUsed: "standard",
    deductionAmount: zero,
    taxableIncome: zero,
    ordinaryTax: zero,
    capitalGainsTax: zero,
    totalTaxBeforeCredits: zero,
    childTaxCredit: zero,
    foreignTaxCredit: zero,
    otherCredits: zero,
    totalCredits: zero,
    earnedIncomeCredit: zero,
    amt: zero,
    selfEmploymentTax: zero,
    additionalMedicareTax: zero,
    niitTax: zero,
    estimatedTaxPenalty: zero,
    totalAdditionalTaxes: zero,
    totalTax: zero,
    totalPayments: zero,
    totalWithholding: zero,
    estimatedTaxPayments: zero,
    amountOwed: zero,
    refund: zero,
    carryforwards: {
      capitalLoss: zero,
      shortTermCapitalLoss: zero,
      longTermCapitalLoss: zero,
      suspendedPassiveLosses: [],
      suspendedPTPLosses: [],
      foreignTaxCreditCarryforward: zero,
      foreignTaxCreditCarryforwardByCategory: {},
      qbiLossCarryforward: zero,
      investmentInterestExpense: zero,
      minimumTaxCredit: zero,
      charitableContributions: zero,
      charitableContributionsByYear: [],
      excessBusinessLossNOL: zero,
      nolCarryforward: zero,
      generalBusinessCredit: zero,
      suspendedBusinessInterest: [],
      partnerBasis: [],
      excessContributions: {
        traditionalIRA: zero,
        rothIRA: zero,
        coverdellESA: zero,
        archerMSA: zero,
        hsa: zero,
        able: zero,
      },
    },
    allLines: [],
    ...overrides,
  } as TaxReturnResult;
}

// ---------------------------------------------------------------------------
// ageAsOf utility
// ---------------------------------------------------------------------------

describe("ageAsOf utility", () => {
  it("computes age correctly when birthday has passed", () => {
    expect(ageAsOf("1990-06-15", new Date(2025, 11, 31))).toBe(35);
  });

  it("computes age correctly when birthday has not passed", () => {
    expect(ageAsOf("1990-06-15", new Date(2025, 0, 1))).toBe(34);
  });

  it("computes age on exact birthday", () => {
    expect(ageAsOf("1960-12-31", new Date(2025, 11, 31))).toBe(65);
  });

  it("computes age one day before birthday", () => {
    expect(ageAsOf("1960-12-31", new Date(2025, 11, 30))).toBe(64);
  });
});

describe("NJ-1040 adapter wounded warrior credit inputs", () => {
  it("NJ-1040 adapter - passes through wounded warrior caregiver interview data", () => {
    const result = buildNJ1040Input(
      minimalTaxInput(),
      minimalFederalResult(),
      {
        providedCareToQualifyingServiceMember: true,
        serviceMemberFederalDisabilityCompensation: 675,
        onlyCaregiver: false,
        careExpensesSharePercent: 40,
      }
    );

    expect(result.providedCareToQualifyingServiceMember).toBe(true);
    expect(result.serviceMemberFederalDisabilityCompensation).toBe(675);
    expect(result.onlyCaregiver).toBe(false);
    expect(result.careExpensesSharePercent).toBe(40);
  });
});

describe("NJ-1040 adapter medical deduction inputs", () => {
  it("NJ-1040 adapter - Worksheet F deductions map from Schedule 1 and config line 28 remains separate", () => {
    const result = buildNJ1040Input(
      minimalTaxInput(),
      minimalFederalResult({
        schedule1: {
          archerMSADeduction: d(900),
          seHealthInsurance: d(2100),
        } as TaxReturnResult["schedule1"],
      }),
      {
        otherAdjustments: 400,
      }
    );

    expect(result.archerMSADeduction).toEqual(d(900));
    expect(result.selfEmployedHealthInsuranceDeduction).toEqual(d(2100));
    expect(result.otherAdjustments).toEqual(d(400));
  });

  it("NJ-1040 adapter - Worksheet F deductions fall back to TaxYearInput adjustments when Schedule 1 is unavailable", () => {
    const result = buildNJ1040Input(
      minimalTaxInput({
        adjustments: {
          archerMSADeduction: "250",
          selfEmployedHealthInsurance: "1000",
        },
      }),
      minimalFederalResult(),
      {
        otherAdjustments: 300,
      }
    );

    expect(result.archerMSADeduction).toEqual(d(250));
    expect(result.selfEmployedHealthInsuranceDeduction).toEqual(d(1000));
    expect(result.otherAdjustments).toEqual(d(300));
  });
});

describe("NJ-1040 adapter EITC age-18 exception inputs", () => {
  it("NJ-1040 adapter - childless age-18 EITC exception config passes through", () => {
    const result = buildNJ1040Input(
      minimalTaxInput({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "single",
          primary: {
            firstName: "Alex",
            lastName: "Taxpayer",
            ssn: "123-45-6789",
            dateOfBirth: "2005-05-01",
          },
          address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
          dependents: [],
        },
      }),
      minimalFederalResult(),
      {
        qualifiesForChildlessAge18Exception: true,
      }
    );

    expect(result.qualifiesForChildlessAge18Exception).toBe(true);
    expect(result.qualifyingEICChildrenCount).toBe(0);
    expect(result.hasAdult18OrOlderTaxpayer).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wages mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter wages", () => {
  it("NJ-1040 adapter - wages from NJ W-2 Box 16", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "90000",
          federalWithheld: "10000",
          stateWages: "85000",
          stateTaxWithheld: "4000",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.wages).toEqual(d(85000));
  });

  it("NJ-1040 adapter - wages fall back to Box 1 when no state field", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "75000",
          federalWithheld: "8000",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.wages).toEqual(d(75000));
  });

  it("NJ-1040 adapter - resident wages use NJ Box 16 and non-NJ Box 1", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "11-1111111" },
          wages: "60000",
          federalWithheld: "6000",
          stateWages: "55000",
          stateTaxWithheld: "3000",
          state: "NJ",
        },
        {
          employer: { name: "NY Corp", ein: "22-2222222" },
          wages: "40000",
          federalWithheld: "4000",
          stateWages: "35000",
          stateTaxWithheld: "2500",
          state: "NY",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // Residents report wages from everywhere, but non-NJ Box 16 may reflect
    // another state's tax rules rather than NJ gross income.
    expect(result.wages).toEqual(d(95000));
  });

  it("NJ-1040 adapter - NJ W-2 without stateWages falls back to Box 1", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "70000",
          federalWithheld: "8000",
          state: "NJ",
          // no stateWages
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // Falls back to wages since stateWages is undefined → d(undefined) = 0 → uses w2.wages
    expect(result.wages).toEqual(d(70000));
  });

  it("NJ-1040 adapter - multiple NJ W-2s summed", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp A", ein: "11-1111111" },
          wages: "50000",
          federalWithheld: "5000",
          stateWages: "50000",
          stateTaxWithheld: "2500",
          state: "NJ",
        },
        {
          employer: { name: "NJ Corp B", ein: "22-2222222" },
          wages: "30000",
          federalWithheld: "3000",
          stateWages: "28000",
          stateTaxWithheld: "1400",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.wages).toEqual(d(78000));
  });
});

// ---------------------------------------------------------------------------
// Interest mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter interest", () => {
  it("NJ-1040 adapter - interest from 1099-INT", () => {
    const input = minimalTaxInput({
      form1099Int: [
        { payer: "Bank A", interestIncome: "1500" },
        { payer: "Bank B", interestIncome: "800" },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.taxableInterest).toEqual(d(2300));
  });

  it("NJ-1040 adapter - zero interest when no 1099-INT", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult());
    expect(result.taxableInterest).toEqual(d(0));
  });
});

// ---------------------------------------------------------------------------
// Other state tax-exempt interest (Line 15b) mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter other state tax-exempt interest", () => {
  it("NJ-1040 adapter - other state tax-exempt interest from config", () => {
    const result = buildNJ1040Input(
      minimalTaxInput(),
      minimalFederalResult(),
      { otherStateTaxExemptInterest: 2500 }
    );
    expect(result.otherStateTaxExemptInterest).toEqual(2500);
  });

  it("NJ-1040 adapter - other state tax-exempt interest undefined when not provided", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult());
    expect(result.otherStateTaxExemptInterest).toBeUndefined();
  });

  it("NJ-1040 adapter - other state tax-exempt interest zero when explicitly zero", () => {
    const result = buildNJ1040Input(
      minimalTaxInput(),
      minimalFederalResult(),
      { otherStateTaxExemptInterest: 0 }
    );
    expect(result.otherStateTaxExemptInterest).toEqual(0);
  });
});

describe("NJ-1040 adapter tax-exempt interest", () => {
  it("NJ-1040 adapter - 1099-INT box 3 federal obligations increase NJ tax-exempt interest", () => {
    const input = minimalTaxInput({
      form1099Int: [
        {
          payer: "TreasuryDirect",
          interestIncome: "120",
          usSavingsBondInterest: "450",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.taxableInterest).toEqual(d(120));
    expect(result.taxExemptInterest).toEqual(d(450));
  });

  it("NJ-1040 adapter - tax-exempt interest for health coverage from 1099-INT and 1099-DIV", () => {
    const input = minimalTaxInput({
      form1099Int: [
        {
          payer: "NJ Muni Fund",
          interestIncome: "100",
          taxExemptInterest: "1200",
        },
      ],
      form1099Div: [
        {
          payer: "Municipal Bond Fund",
          ordinaryDividends: "50",
          exemptInterestDividends: "800",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.taxExemptInterest).toEqual(d(2000));
  });
});

// ---------------------------------------------------------------------------
// Dividends mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter dividends", () => {
  it("NJ-1040 adapter - dividends from 1099-DIV", () => {
    const input = minimalTaxInput({
      form1099Div: [
        { payer: "Fund A", ordinaryDividends: "3000", qualifiedDividends: "2000" },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // NJ uses ordinary dividends only (no qualified dividend preference)
    expect(result.dividends).toEqual(d(3000));
  });
});

// ---------------------------------------------------------------------------
// Business income mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter business income", () => {
  it("NJ-1040 adapter - business income from Schedule C", () => {
    const fedResult = minimalFederalResult({
      scheduleC: {
        grossReceipts: d(100000),
        cogs: d(20000),
        grossIncome: d(80000),
        totalExpenses: d(30000),
        tentativeProfit: d(50000),
        homeOfficeDeduction: d(5000),
        netProfit: d(45000),
        lines: [],
      },
    } as Partial<TaxReturnResult>);
    const result = buildNJ1040Input(minimalTaxInput(), fedResult);
    expect(result.businessIncome).toEqual(d(45000));
  });

  it("NJ-1040 adapter - zero business income when no Schedule C", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult());
    expect(result.businessIncome).toEqual(d(0));
  });
});

// ---------------------------------------------------------------------------
// Capital gains mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter capital gains", () => {
  it("NJ-1040 adapter - capital gains from federal result", () => {
    const fedResult = minimalFederalResult({ capitalGainLoss: d(15000) });
    const result = buildNJ1040Input(minimalTaxInput(), fedResult);
    expect(result.netGainsFromProperty).toEqual(d(15000));
  });

  it("NJ-1040 adapter - capital losses pass through as negative", () => {
    const fedResult = minimalFederalResult({ capitalGainLoss: d(-3000) });
    const result = buildNJ1040Input(minimalTaxInput(), fedResult);
    expect(result.netGainsFromProperty).toEqual(d(-3000));
  });
});

// ---------------------------------------------------------------------------
// Pension income mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter pension income", () => {
  it("NJ-1040 adapter - pension from 1099-R taxable amount", () => {
    const input = minimalTaxInput({
      form1099R: [
        {
          payer: "Pension Fund",
          grossDistribution: "50000",
          taxableAmount: "45000",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.pensionIncome).toEqual(d(45000));
  });

  it("NJ-1040 adapter - pension uses gross when taxableAmountNotDetermined", () => {
    const input = minimalTaxInput({
      form1099R: [
        {
          payer: "Pension Fund",
          grossDistribution: "50000",
          taxableAmountNotDetermined: true,
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.pensionIncome).toEqual(d(50000));
  });

  it("NJ-1040 adapter - direct rollovers are excluded even when taxableAmountNotDetermined", () => {
    const input = minimalTaxInput({
      form1099R: [
        {
          payer: "401k Trustee",
          grossDistribution: "60000",
          taxableAmountNotDetermined: true,
          distributionCode: "G",
        },
        {
          payer: "Traditional IRA",
          grossDistribution: "12000",
          taxableAmount: "12000",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.pensionIncome).toEqual(d(12000));
  });

  it("NJ-1040 adapter - disability pension before age 65 is excluded from NJ pension income", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Dana",
          lastName: "Disabled",
          ssn: "123-45-6789",
          dateOfBirth: "1965-06-15",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
      form1099R: [
        {
          payer: "Disability Plan",
          grossDistribution: "24000",
          taxableAmount: "24000",
          disabilityPensionBeforeMinimumRetirementAge: true,
          distributionCode: "3",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.pensionIncome).toEqual(d(0));
  });

  it("NJ-1040 adapter - disability pension in the year the taxpayer turns 65 is taxed as pension income", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Pat",
          lastName: "Retiree",
          ssn: "123-45-6789",
          dateOfBirth: "1960-12-31",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
      form1099R: [
        {
          payer: "Disability Plan",
          grossDistribution: "18000",
          taxableAmount: "18000",
          disabilityPensionBeforeMinimumRetirementAge: true,
          distributionCode: "3",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.pensionIncome).toEqual(d(18000));
  });

  it("NJ-1040 adapter - military pension and survivor benefits are excluded from NJ pension income but keep withholding", () => {
    const input = minimalTaxInput({
      form1099R: [
        {
          payer: "DFAS Cleveland",
          grossDistribution: "30000",
          taxableAmount: "30000",
          militaryPensionOrSurvivorBenefit: true,
          stateWithheld: "1200",
          state: "NJ",
        },
        {
          payer: "Corporate Pension",
          grossDistribution: "18000",
          taxableAmount: "15000",
          stateWithheld: "600",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.pensionIncome).toEqual(d(15000));
    expect(result.njWithholding).toEqual(d(1800));
  });

  it("NJ-1040 adapter - qualified Roth distributions excluded", () => {
    const input = minimalTaxInput({
      form1099R: [
        {
          payer: "Roth IRA",
          grossDistribution: "20000",
          taxableAmount: "0",
          qualifiedRothDistribution: true,
        },
        {
          payer: "Traditional IRA",
          grossDistribution: "30000",
          taxableAmount: "30000",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // Only non-Roth distribution included
    expect(result.pensionIncome).toEqual(d(30000));
  });

  it("NJ-1040 adapter - pension income override replaces derived 1099-R income and caps default exclusion income", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Robin",
          lastName: "Retiree",
          ssn: "123-45-6789",
          dateOfBirth: "1955-04-01",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
      form1099R: [
        {
          payer: "Traditional IRA Custodian",
          accountHolder: "primary",
          grossDistribution: "50000",
          taxableAmount: "45000",
        },
      ],
    });

    const result = buildNJ1040Input(input, minimalFederalResult(), {
      pensionIncomeOverride: "28000",
    });

    expect(result.pensionIncome).toEqual(d(28000));
    expect(result.pensionIncomeEligibleForExclusion).toEqual(d(28000));
  });

  it("NJ-1040 adapter - no 1099-R gives zero pension", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult());
    expect(result.pensionIncome).toEqual(d(0));
  });

  it("NJ-1040 adapter - mixed-age joint return limits pension exclusion income to the age-62+ spouse when ownership is tagged", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Younger",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1970-06-15",
        },
        spouse: {
          firstName: "Older",
          lastName: "Spouse",
          ssn: "987-65-4321",
          dateOfBirth: "1963-06-15",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
      form1099R: [
        {
          payer: "Older Spouse Pension",
          accountHolder: "spouse",
          grossDistribution: "6000",
          taxableAmount: "6000",
        },
        {
          payer: "Younger Spouse Pension",
          accountHolder: "primary",
          grossDistribution: "18000",
          taxableAmount: "18000",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.pensionIncome).toEqual(d(24000));
    expect(result.pensionIncomeEligibleForExclusion).toEqual(d(6000));
  });

  it("NJ-1040 adapter - mixed-eligibility joint return uses ownership tags to cap the pension exclusion input", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Younger",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1975-06-15",
        },
        spouse: {
          firstName: "Disabled",
          lastName: "Spouse",
          ssn: "987-65-4321",
          dateOfBirth: "1974-06-15",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
      form1099R: [
        {
          payer: "Disabled Spouse Pension",
          accountHolder: "spouse",
          grossDistribution: "9000",
          taxableAmount: "9000",
        },
        {
          payer: "Younger Spouse Pension",
          accountHolder: "primary",
          grossDistribution: "17000",
          taxableAmount: "17000",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult(), {
      spouseBlindOrDisabled: true,
    });
    expect(result.qualifiesForPensionExclusion).toBe(true);
    expect(result.qualifiesForOtherRetirementExclusion).toBe(false);
    expect(result.pensionIncome).toEqual(d(26000));
    expect(result.pensionIncomeEligibleForExclusion).toEqual(d(9000));
  });

  it("NJ-1040 adapter - mixed-age joint return ownership cap excludes NJ-nontaxable 1099-R items", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Younger",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1975-06-15",
        },
        spouse: {
          firstName: "Older",
          lastName: "Spouse",
          ssn: "987-65-4321",
          dateOfBirth: "1962-06-15",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
      form1099R: [
        {
          payer: "Eligible Spouse Direct Rollover",
          accountHolder: "spouse",
          grossDistribution: "50000",
          taxableAmountNotDetermined: true,
          distributionCode: "G",
        },
        {
          payer: "Eligible Spouse Military Pension",
          accountHolder: "spouse",
          grossDistribution: "12000",
          taxableAmount: "12000",
          militaryPensionOrSurvivorBenefit: true,
        },
        {
          payer: "Younger Spouse Pension",
          accountHolder: "primary",
          grossDistribution: "14000",
          taxableAmount: "14000",
        },
      ],
    });

    const result = buildNJ1040Input(input, minimalFederalResult());

    expect(result.pensionIncome).toEqual(d(14000));
    expect(result.pensionIncomeEligibleForExclusion).toEqual(d(0));
  });
});

// ---------------------------------------------------------------------------
// K-1 income mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter K-1 income", () => {
  it("NJ-1040 adapter - partnership income from K-1", () => {
    const input = minimalTaxInput({
      scheduleK1: [
        {
          partnershipName: "ABC LLC",
          partnershipEIN: "11-1111111",
          ordinaryIncome: "25000",
          entityType: "partnership",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.partnershipIncome).toEqual(d(25000));
    expect(result.sCorpIncome).toEqual(d(0));
  });

  it("NJ-1040 adapter - S-corp income from K-1", () => {
    const input = minimalTaxInput({
      scheduleK1: [
        {
          partnershipName: "XYZ Corp",
          partnershipEIN: "22-2222222",
          ordinaryIncome: "40000",
          entityType: "s_corporation",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.partnershipIncome).toEqual(d(0));
    expect(result.sCorpIncome).toEqual(d(40000));
  });

  it("NJ-1040 adapter - mixed K-1s split by entity type", () => {
    const input = minimalTaxInput({
      scheduleK1: [
        {
          partnershipName: "Partner LLC",
          partnershipEIN: "11-1111111",
          ordinaryIncome: "15000",
          entityType: "partnership",
        },
        {
          partnershipName: "S Corp Inc",
          partnershipEIN: "22-2222222",
          ordinaryIncome: "20000",
          entityType: "s_corporation",
        },
        {
          partnershipName: "Other LLC",
          partnershipEIN: "33-3333333",
          ordinaryIncome: "10000",
          // default entityType = "partnership"
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.partnershipIncome).toEqual(d(25000)); // 15000 + 10000
    expect(result.sCorpIncome).toEqual(d(20000));
  });
});

// ---------------------------------------------------------------------------
// Gambling income mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter gambling", () => {
  it("NJ-1040 adapter - gambling winnings from W-2G", () => {
    const input = minimalTaxInput({
      formW2G: [
        { payer: "Casino A", reportableWinnings: "5000" },
        { payer: "Casino B", reportableWinnings: "3000" },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.gamblingWinnings).toEqual(d(8000));
  });

  it("NJ-1040 adapter - excludes sub-$10,001 New Jersey lottery prizes from gambling winnings", () => {
    const input = minimalTaxInput({
      formW2G: [
        {
          payer: "New Jersey Lottery",
          reportableWinnings: "10000",
          winningsCategory: "new_jersey_lottery",
        },
        { payer: "Casino A", reportableWinnings: "2500" },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.gamblingWinnings).toEqual(d(2500));
  });

  it("NJ-1040 adapter - includes New Jersey lottery prizes above $10,000", () => {
    const input = minimalTaxInput({
      formW2G: [
        {
          payer: "New Jersey Lottery",
          reportableWinnings: "10001",
          winningsCategory: "new_jersey_lottery",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.gamblingWinnings).toEqual(d(10001));
  });

  it("NJ-1040 adapter - out-of-state lottery prizes remain taxable below $10,001", () => {
    const input = minimalTaxInput({
      formW2G: [
        {
          payer: "New York Lottery",
          reportableWinnings: "7500",
          winningsCategory: "out_of_state_lottery",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.gamblingWinnings).toEqual(d(7500));
  });

  it("NJ-1040 adapter - gambling losses from Schedule A input", () => {
    const input = minimalTaxInput({
      scheduleA: { gamblingLosses: "4000" },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.gamblingLosses).toEqual(d(4000));
  });
});

// ---------------------------------------------------------------------------
// Withholding mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter withholding", () => {
  it("NJ-1040 adapter - NJ withholding from W-2 Box 17", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "80000",
          federalWithheld: "10000",
          stateTaxWithheld: "3500",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(3500));
  });

  it("NJ-1040 adapter - excludes non-NJ withholding when NJ W-2s present", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "11-1111111" },
          wages: "60000",
          federalWithheld: "6000",
          stateTaxWithheld: "3000",
          state: "NJ",
        },
        {
          employer: { name: "NY Corp", ein: "22-2222222" },
          wages: "40000",
          federalWithheld: "4000",
          stateTaxWithheld: "2500",
          state: "NY",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // Only NJ withholding
    expect(result.njWithholding).toEqual(d(3000));
  });

  it("NJ-1040 adapter - includes W-2G NJ state withholding", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "80000",
          federalWithheld: "10000",
          stateTaxWithheld: "3500",
          state: "NJ",
        },
      ],
      formW2G: [
        {
          payer: "Casino NJ",
          reportableWinnings: "10000",
          stateWithheld: "500",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(4000)); // 3500 + 500
  });

  it("NJ-1040 adapter - W-2G with no state treated as NJ", () => {
    const input = minimalTaxInput({
      formW2G: [
        {
          payer: "Casino",
          reportableWinnings: "5000",
          stateWithheld: "250",
          // no state field → treated as NJ
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(250));
  });
});

// ---------------------------------------------------------------------------
// Estimated payments mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter estimated payments", () => {
  it("NJ-1040 adapter - estimated payments from adjustments", () => {
    const input = minimalTaxInput({
      adjustments: {
        estimatedTaxPayments: [
          { date: "2025-04-15", amount: "2000", type: "state" },
          { date: "2025-06-15", amount: "2000", type: "state" },
          { date: "2025-04-15", amount: "5000", type: "federal" },
        ],
      },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // Only state payments
    expect(result.estimatedPayments).toEqual(d(4000));
  });

  it("NJ-1040 adapter - estimated payments exclude non-NJ state vouchers when state codes are present", () => {
    const input = minimalTaxInput({
      adjustments: {
        estimatedTaxPayments: [
          { date: "2025-04-15", amount: "900", type: "state", state: "NJ" },
          { date: "2025-06-15", amount: "700", type: "state", state: "ny" },
          { date: "2025-09-15", amount: "600", type: "state" },
          { date: "2025-01-15", amount: "5000", type: "federal" },
        ],
      },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.estimatedPayments).toEqual(d(1500));
  });

  it("NJ-1040 adapter - no estimated payments when adjustments absent", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult());
    expect(result.estimatedPayments).toEqual(d(0));
  });

  it("NJ-1040 adapter - line 57 includes NJ prior-year credit carryforward, extension payments, and excludes other states", () => {
    const input = minimalTaxInput({
      adjustments: {
        estimatedTaxPayments: [
          { date: "2025-04-15", amount: "900", type: "state", state: "NJ" },
          { date: "2025-06-15", amount: "700", type: "state" },
        ],
        extensionPayments: [
          { date: "2026-04-15", amount: "600", type: "state", state: "NJ" },
          { date: "2026-04-15", amount: "500", type: "state", state: "PA" },
          { date: "2026-04-15", amount: "250", type: "state" },
          { date: "2026-04-15", amount: "1200", type: "federal" },
        ],
        priorYearAppliedCredits: [
          { sourceTaxYear: 2024, amount: "300", type: "state", state: "NJ" },
          { sourceTaxYear: 2024, amount: "200", type: "state", state: "DE" },
          { sourceTaxYear: 2024, amount: "150", type: "state" },
          { sourceTaxYear: 2023, amount: "125", type: "state", state: "NJ" },
          { sourceTaxYear: 2024, amount: "800", type: "federal" },
        ],
      },
    });

    const result = buildNJ1040Input(input, minimalFederalResult());

    expect(result.estimatedPayments).toEqual(d(2900));
  });
});

// ---------------------------------------------------------------------------
// Federal credits mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter federal credits", () => {
  it("NJ-1040 adapter - federal EITC from federal result", () => {
    const fedResult = minimalFederalResult({ earnedIncomeCredit: d(3200) });
    const result = buildNJ1040Input(minimalTaxInput(), fedResult);
    expect(result.federalEITC).toEqual(d(3200));
  });

  it("NJ-1040 adapter - federal dependent care credit from Schedule 3", () => {
    const fedResult = minimalFederalResult({
      schedule3: {
        childDependentCareCredit: d(1200),
        foreignTaxCredit: d(0),
        educationCredits: d(0),
        retirementSavingsCredit: d(0),
        residentialEnergyCredits: d(0),
        cleanVehicleCredits: d(0),
        previouslyOwnedCleanVehicleCredits: d(0),
        otherCredits: d(0),
        totalNonrefundableCredits: d(1200),
        totalOtherPayments: d(0),
        lines: [],
      },
    } as Partial<TaxReturnResult>);
    const result = buildNJ1040Input(minimalTaxInput(), fedResult);
    expect(result.federalDependentCareCredit).toEqual(d(1200));
  });

  it("NJ-1040 adapter - zero dependent care credit when no Schedule 3", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult());
    expect(result.federalDependentCareCredit).toEqual(d(0));
  });
});

// ---------------------------------------------------------------------------
// Age derivation
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter age derivation", () => {
  it("NJ-1040 adapter - age 65 derived from dateOfBirth", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Senior",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1960-03-15", // turns 65 in 2025
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.taxpayerAge65OrOlder).toBe(true);
  });

  it("NJ-1040 adapter - age 64 not 65 when birthday not yet reached in year", () => {
    // Born Dec 31, 1960 → turns 65 on Dec 31, 2025 → IS 65 on Dec 31
    // Born Jan 1, 1961 → turns 64 on Jan 1, 2025 → only 64 by Dec 31
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Almost",
          lastName: "Senior",
          ssn: "123-45-6789",
          dateOfBirth: "1961-01-01", // turns 64 in 2025
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.taxpayerAge65OrOlder).toBe(false);
  });

  it("NJ-1040 adapter - spouse age 65 derived for MFJ", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Young",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1990-06-15",
        },
        spouse: {
          firstName: "Senior",
          lastName: "Spouse",
          ssn: "987-65-4321",
          dateOfBirth: "1958-04-10", // age 67 in 2025
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.taxpayerAge65OrOlder).toBe(false);
    expect(result.spouseAge65OrOlder).toBe(true);
  });

  it("NJ-1040 adapter - pension exclusion derived from age 62+", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Retiree",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1963-06-15", // age 62 in 2025
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.qualifiesForPensionExclusion).toBe(true);
    expect(result.qualifiesForOtherRetirementExclusion).toBe(true);
  });

  it("NJ-1040 adapter - pension exclusion override from config", () => {
    // Young taxpayer but config overrides (e.g., disabled)
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      qualifiesForPensionExclusionOverride: true,
    });
    expect(result.qualifiesForPensionExclusion).toBe(true);
  });

  it("NJ-1040 adapter - disabled taxpayer under 62 still qualifies for the pension exclusion", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      taxpayerBlindOrDisabled: true,
    });
    expect(result.qualifiesForPensionExclusion).toBe(true);
    expect(result.qualifiesForOtherRetirementExclusion).toBe(false);
  });

  it("NJ-1040 adapter - spouse age 62 alone qualifies a joint return for retirement exclusions", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Younger",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1970-06-15",
        },
        spouse: {
          firstName: "Older",
          lastName: "Spouse",
          ssn: "987-65-4321",
          dateOfBirth: "1963-06-15",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.qualifiesForPensionExclusion).toBe(true);
    expect(result.qualifiesForOtherRetirementExclusion).toBe(true);
  });

  it("NJ-1040 adapter - special retirement exclusion config passes through", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      qualifiesForOtherRetirementExclusionOverride: true,
      qualifiesForSpecialRetirementExclusion: true,
      otherRetirementIncomeExclusionCap: 3500,
    });
    expect(result.qualifiesForOtherRetirementExclusion).toBe(true);
    expect(result.qualifiesForSpecialRetirementExclusion).toBe(true);
    expect(result.otherRetirementIncomeExclusionCap).toEqual(3500);
  });
});

// ---------------------------------------------------------------------------
// Dependent mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter dependents", () => {
  it("NJ-1040 adapter - dependent count from taxpayer", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Parent",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1985-01-01",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [
          {
            firstName: "Child",
            lastName: "One",
            ssn: "111-11-1111",
            dateOfBirth: "2015-05-10",
            relationship: "son",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
          {
            firstName: "Child",
            lastName: "Two",
            ssn: "222-22-2222",
            dateOfBirth: "2010-03-20",
            relationship: "daughter",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
        ],
      },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.dependentCount).toBe(2);
  });

  it("NJ-1040 adapter - qualifying children age 5 or under", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Parent",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1990-01-01",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [
          {
            firstName: "Baby",
            lastName: "One",
            ssn: "111-11-1111",
            dateOfBirth: "2022-07-01", // age 3 in 2025
            relationship: "son",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
          {
            firstName: "Toddler",
            lastName: "Two",
            ssn: "222-22-2222",
            dateOfBirth: "2020-01-15", // age 5 in 2025
            relationship: "daughter",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
          {
            firstName: "Child",
            lastName: "Three",
            ssn: "333-33-3333",
            dateOfBirth: "2015-06-10", // age 10 in 2025 — not ≤5
            relationship: "son",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
        ],
      },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.qualifyingChildrenAge5OrUnder).toBe(2);
    expect(result.dependentCount).toBe(3);
  });

  it("NJ-1040 adapter - child not qualifying for CTC excluded from age 5 count", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Parent",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1990-01-01",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [
          {
            firstName: "Baby",
            lastName: "One",
            ssn: "111-11-1111",
            dateOfBirth: "2023-01-01", // age 2
            relationship: "son",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false, // does not qualify
          },
        ],
      },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.qualifyingChildrenAge5OrUnder).toBe(0);
    expect(result.dependentCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// NJStateConfig passthrough
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter NJStateConfig passthrough", () => {
  it("NJ-1040 adapter - property tax config passes through", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      isHomeowner: true,
      propertyTaxesPaid: 12000,
      hasDisabledVeteranPropertyTaxExemption: true,
      electPropertyTaxCredit: false,
    });
    expect(result.isHomeowner).toBe(true);
    expect(result.propertyTaxesPaid).toBe(12000);
    expect(result.hasDisabledVeteranPropertyTaxExemption).toBe(true);
    expect(result.electPropertyTaxCredit).toBe(false);
  });

  it("NJ-1040 adapter - MFS shared main home property tax credit flows through adapter", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_separately",
        primary: {
          firstName: "Pat",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1990-06-15",
        },
        spouse: {
          firstName: "Sam",
          lastName: "Spouse",
          ssn: "987-65-4321",
          dateOfBirth: "1990-07-20",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "11000",
          federalWithheld: "500",
          stateWages: "11000",
          stateTaxWithheld: "200",
          state: "NJ",
        },
      ],
    });

    const njInput = buildNJ1040Input(input, minimalFederalResult(), {
      isHomeowner: true,
      propertyTaxesPaid: 4000,
      electPropertyTaxCredit: true,
      sharedMainHomeWithSpouse: true,
    });
    const result = calculateNJ1040(njInput);

    expect(njInput.sharedMainHomeWithSpouse).toBe(true);
    expect(result.propertyTaxCredit).toEqual(d(25));
  });

  it("NJ-1040 adapter - medical expense config passes through", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      totalMedicalExpenses: 8000,
      insuranceReimbursements: 2000,
    });
    expect(result.totalMedicalExpenses).toBe(8000);
    expect(result.insuranceReimbursements).toBe(2000);
  });

  it("NJ-1040 adapter - college affordability deduction config passes through", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      njbestContributions: 4000,
      njclassLoanPayments: 1200,
      tuitionPaidToNjInstitution: 9000,
    });
    expect(result.njbestContributions).toBe(4000);
    expect(result.njclassLoanPayments).toBe(1200);
    expect(result.tuitionPaidToNjInstitution).toBe(9000);
  });

  it("NJ-1040 adapter - health coverage config passes through", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      healthCoverageAdults: 2,
      healthCoverageChildren: 1,
      healthCoverageUncoveredMonths: 4,
      healthCoverageDependentIncome: 3500,
    });
    expect(result.healthCoverageAdults).toBe(2);
    expect(result.healthCoverageChildren).toBe(1);
    expect(result.healthCoverageUncoveredMonths).toBe(4);
    expect(result.healthCoverageDependentIncome).toBe(3500);
  });

  it("NJ-1040 adapter - dependent household income for health coverage passes through config", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      healthCoverageDependentIncome: 4200,
    });
    expect(result.healthCoverageDependentIncome).toBe(4200);
  });

  it("NJ-1040 adapter - veteran and blind/disabled flags pass through", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      isVeteran: true,
      spouseIsVeteran: true,
      taxpayerBlindOrDisabled: true,
    });
    expect(result.isVeteran).toBe(true);
    expect(result.spouseIsVeteran).toBe(true);
    expect(result.taxpayerBlindOrDisabled).toBe(true);
  });

  it("NJ-1040 adapter - months of residency defaults to 12", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult());
    expect(result.monthsOfResidency).toBe(12);
  });

  it("NJ-1040 adapter - months of residency overrideable", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      monthsOfResidency: 6,
    });
    expect(result.monthsOfResidency).toBe(6);
  });

  it("NJ-1040 adapter - excess payroll config passes through", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      totalUIWFSWFWithheld: 500,
      totalDIWithheld: 200,
      totalFLIWithheld: 150,
    });
    expect(result.totalUIWFSWFWithheld).toBe(500);
    expect(result.totalDIWithheld).toBe(200);
    expect(result.totalFLIWithheld).toBe(150);
  });

  it("NJ-1040 adapter - prior year tax config passes through", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      priorYearTax: 5000,
      priorYearReturnFiled: true,
    });
    expect(result.priorYearTax).toBe(5000);
    expect(result.priorYearReturnFiled).toBe(true);
  });

  it("NJ-1040 adapter - supplemental nonrefundable credits config passes through", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      shelteredWorkshopCurrentYearCredit: 900,
      goldStarCounselingHours: 6,
      goldStarTricareRate: 85,
      organDonorLeaveEvents: [{ paidLeaveCompensation: 3600, missedWorkDays: 24 }],
    });
    expect(result.shelteredWorkshopCurrentYearCredit).toBe(900);
    expect(result.goldStarCounselingHours).toBe(6);
    expect(result.goldStarTricareRate).toBe(85);
    expect(result.organDonorLeaveEvents).toEqual([
      { paidLeaveCompensation: 3600, missedWorkDays: 24 },
    ]);
  });

  it("NJ-1040 adapter - organ donation deduction config passes through", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      organDonationDeductionExpenses: 8400,
    });

    expect(result.organDonationDeductionExpenses).toBe(8400);
  });

  it("NJ-1040 adapter - page-2 deduction config passes through supported direct-input deduction lines", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      qualifiedConservationContribution: 6200,
      healthEnterpriseZoneDeduction: 1800,
      alternativeBusinessCalculationAdjustment: 2400,
    });

    expect(result.qualifiedConservationContribution).toBe(6200);
    expect(result.healthEnterpriseZoneDeduction).toBe(1800);
    expect(result.alternativeBusinessCalculationAdjustment).toBe(2400);
  });
});

// ---------------------------------------------------------------------------
// Alimony mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter alimony", () => {
  it("NJ-1040 adapter - alimony received from federal Schedule 1", () => {
    const result = buildNJ1040Input(
      minimalTaxInput(),
      minimalFederalResult({
        schedule1: {
          alimonyReceived: d(18000),
        } as TaxReturnResult["schedule1"],
      })
    );

    expect(result.alimonyReceived).toEqual(d(18000));
  });

  it("NJ-1040 adapter - alimony paid from adjustments", () => {
    const input = minimalTaxInput({
      adjustments: { alimonyPaid: "12000" },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.alimonyPaid).toEqual(d(12000));
  });

  it("NJ-1040 adapter - zero alimony when adjustments absent", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult());
    expect(result.alimonyPaid).toEqual(d(0));
  });
});

// ---------------------------------------------------------------------------
// Filing status and tax year mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter filing status", () => {
  it("NJ-1040 adapter - filing status and tax year from taxpayer", () => {
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Test",
          lastName: "Taxpayer",
          ssn: "123-45-6789",
          dateOfBirth: "1985-01-01",
        },
        spouse: {
          firstName: "Spouse",
          lastName: "Taxpayer",
          ssn: "987-65-4321",
          dateOfBirth: "1986-02-15",
        },
        address: { street: "1 NJ St", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [],
      },
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.filingStatus).toBe("married_filing_jointly");
    expect(result.taxYear).toBe(2025);
  });
});

// ---------------------------------------------------------------------------
// Rental income mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter rental income", () => {
  it("NJ-1040 adapter - rental income from Schedule E result", () => {
    const fedResult = minimalFederalResult({
      scheduleE: {
        rentalProperties: [],
        totalRentalIncome: d(18000),
        partnerships: [],
        totalNonpassiveIncome: d(0),
        totalNonpassiveLoss: d(0),
        totalPassiveIncome: d(0),
        totalPassiveLoss: d(0),
        totalPartnershipIncome: d(0),
        totalSupplementalIncome: d(18000),
        suspendedPassiveLosses: [],
        suspendedAtRiskLosses: [],
        suspendedBasisLosses: [],
        excessDistributionGains: [],
        lines: [],
      },
    } as Partial<TaxReturnResult>);
    const result = buildNJ1040Input(minimalTaxInput(), fedResult);
    expect(result.rentalIncome).toEqual(d(18000));
  });

  it("NJ-1040 adapter - zero rental income when no Schedule E", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult());
    expect(result.rentalIncome).toEqual(d(0));
  });
});

// ---------------------------------------------------------------------------
// 1099-G unemployment income mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter 1099-G unemployment", () => {
  it("NJ-1040 adapter - unemployment from 1099-G is excluded from NJ other income", () => {
    const input = minimalTaxInput({
      form1099G: [
        { payer: "NJ Dept of Labor", unemploymentCompensation: "12000" },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.otherIncome).toEqual(d(0));
  });

  it("NJ-1040 adapter - multiple 1099-G unemployment amounts remain excluded", () => {
    const input = minimalTaxInput({
      form1099G: [
        { payer: "NJ Dept of Labor", unemploymentCompensation: "8000" },
        { payer: "NJ Dept of Labor Q2", unemploymentCompensation: "4000" },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.otherIncome).toEqual(d(0));
  });

  it("NJ-1040 adapter - zero unemployment means zero other income from 1099-G", () => {
    const input = minimalTaxInput({
      form1099G: [
        { payer: "State Refund", unemploymentCompensation: "0" },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.otherIncome).toEqual(d(0));
  });

  it("NJ-1040 adapter - no 1099-G forms results in zero other income", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult());
    expect(result.otherIncome).toEqual(d(0));
  });
});

// ---------------------------------------------------------------------------
// 1099-MISC other income mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter 1099-MISC other income", () => {
  it("NJ-1040 adapter - 1099-MISC other income flows to NJ line 24", () => {
    const input = minimalTaxInput({
      form1099Misc: [
        {
          payer: "Contest Sponsor",
          otherIncome: "3200",
        },
        {
          payer: "Consulting Panel",
          otherIncome: "800",
          rents: "1200",
        },
      ],
    });

    const result = buildNJ1040Input(input, minimalFederalResult());

    expect(result.otherIncome).toEqual(d(4000));
  });

  it("NJ-1040 adapter - manual other income config carries line 26 income with no 1099-MISC", () => {
    const result = buildNJ1040Input(
      minimalTaxInput(),
      minimalFederalResult(),
      {
        otherIncome: 2750,
      }
    );

    expect(result.otherIncome).toEqual(d(2750));
  });

  it("NJ-1040 adapter - manual other income config stacks with 1099-MISC Box 3 income", () => {
    const input = minimalTaxInput({
      form1099Misc: [
        {
          payer: "Contest Sponsor",
          otherIncome: "3200",
        },
      ],
    });

    const result = buildNJ1040Input(input, minimalFederalResult(), {
      otherIncome: 1800,
    });

    expect(result.otherIncome).toEqual(d(5000));
  });
});

// ---------------------------------------------------------------------------
// 1099-G state withholding mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter 1099-G withholding", () => {
  it("NJ-1040 adapter - 1099-G NJ state withholding included", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "60000",
          federalWithheld: "8000",
          stateTaxWithheld: "3000",
          state: "NJ",
        },
      ],
      form1099G: [
        {
          payer: "NJ Dept of Labor",
          unemploymentCompensation: "10000",
          stateWithheld: "500",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // W-2 withholding (3000) + 1099-G withholding (500)
    expect(result.njWithholding).toEqual(d(3500));
  });

  it("NJ-1040 adapter - 1099-G non-NJ state withholding excluded", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "60000",
          federalWithheld: "8000",
          stateTaxWithheld: "3000",
          state: "NJ",
        },
      ],
      form1099G: [
        {
          payer: "NY Dept of Labor",
          unemploymentCompensation: "5000",
          stateWithheld: "300",
          state: "NY",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // Only W-2 NJ withholding, NY 1099-G excluded
    expect(result.njWithholding).toEqual(d(3000));
  });

  it("NJ-1040 adapter - 1099-G with no state field treated as NJ", () => {
    const input = minimalTaxInput({
      form1099G: [
        {
          payer: "Dept of Labor",
          unemploymentCompensation: "8000",
          stateWithheld: "400",
          // no state field → treated as NJ
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(400));
  });
});

// ---------------------------------------------------------------------------
// 1099-K state withholding mapping
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter 1099-K withholding", () => {
  it("NJ-1040 adapter - 1099-K NJ state withholding included", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "50000",
          federalWithheld: "6000",
          stateTaxWithheld: "2500",
          state: "NJ",
        },
      ],
      form1099K: [
        {
          pse: "Payment Platform",
          grossAmount: "25000",
          stateWithheld: "750",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // W-2 withholding (2500) + 1099-K withholding (750)
    expect(result.njWithholding).toEqual(d(3250));
  });

  it("NJ-1040 adapter - 1099-K non-NJ state withholding excluded", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "50000",
          federalWithheld: "6000",
          stateTaxWithheld: "2500",
          state: "NJ",
        },
      ],
      form1099K: [
        {
          pse: "Payment Platform",
          grossAmount: "25000",
          stateWithheld: "750",
          state: "CA",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(2500));
  });

  it("NJ-1040 adapter - 1099-K with no state field treated as NJ", () => {
    const input = minimalTaxInput({
      form1099K: [
        {
          pse: "Payment Platform",
          grossAmount: "15000",
          stateWithheld: "450",
          // no state field → treated as NJ
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(450));
  });

  it("NJ-1040 adapter - combined withholding from all sources (W-2 + W-2G + 1099-G + 1099-K)", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "70000",
          federalWithheld: "9000",
          stateTaxWithheld: "3000",
          state: "NJ",
        },
      ],
      formW2G: [
        {
          payer: "Casino NJ",
          reportableWinnings: "5000",
          stateWithheld: "250",
          state: "NJ",
        },
      ],
      form1099G: [
        {
          payer: "NJ Dept of Labor",
          unemploymentCompensation: "8000",
          stateWithheld: "400",
          state: "NJ",
        },
      ],
      form1099K: [
        {
          pse: "Payment Platform",
          grossAmount: "20000",
          stateWithheld: "600",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // W-2 (3000) + W-2G (250) + 1099-G (400) + 1099-K (600) = 4250
    expect(result.njWithholding).toEqual(d(4250));
  });
});

// ---------------------------------------------------------------------------
// 1099-R NJ state withholding
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter 1099-R withholding", () => {
  it("NJ-1040 adapter - 1099-R NJ state withholding included", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "40000",
          federalWithheld: "5000",
          stateTaxWithheld: "1800",
          state: "NJ",
        },
      ],
      form1099R: [
        {
          payer: "NJ State Pension Fund",
          grossDistribution: "24000",
          taxableAmount: "24000",
          stateWithheld: "1200",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // W-2 (1800) + 1099-R (1200) = 3000
    expect(result.njWithholding).toEqual(d(3000));
  });

  it("NJ-1040 adapter - 1099-R non-NJ state withholding excluded", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "40000",
          federalWithheld: "5000",
          stateTaxWithheld: "1800",
          state: "NJ",
        },
      ],
      form1099R: [
        {
          payer: "NY State Pension Fund",
          grossDistribution: "24000",
          taxableAmount: "24000",
          stateWithheld: "1200",
          state: "NY",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // Only W-2 (1800) — 1099-R NY excluded
    expect(result.njWithholding).toEqual(d(1800));
  });

  it("NJ-1040 adapter - 1099-R with no state field treated as NJ", () => {
    const input = minimalTaxInput({
      form1099R: [
        {
          payer: "Pension Fund",
          grossDistribution: "18000",
          taxableAmount: "18000",
          stateWithheld: "900",
          // no state field → treated as NJ
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(900));
  });

  it("NJ-1040 adapter - multiple 1099-R forms with NJ withholding", () => {
    const input = minimalTaxInput({
      form1099R: [
        {
          payer: "NJ State Pension",
          grossDistribution: "20000",
          taxableAmount: "20000",
          stateWithheld: "1000",
          state: "NJ",
        },
        {
          payer: "TIAA",
          grossDistribution: "15000",
          taxableAmount: "15000",
          stateWithheld: "750",
          state: "NJ",
        },
        {
          payer: "NY Fund",
          grossDistribution: "10000",
          taxableAmount: "10000",
          stateWithheld: "500",
          state: "NY",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // Only NJ ones: 1000 + 750 = 1750 (NY excluded)
    expect(result.njWithholding).toEqual(d(1750));
  });

  it("NJ-1040 adapter - 1099-R with no stateWithheld contributes zero", () => {
    const input = minimalTaxInput({
      form1099R: [
        {
          payer: "NJ Pension",
          grossDistribution: "25000",
          taxableAmount: "25000",
          state: "NJ",
          // no stateWithheld → $0
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(0));
  });
});

// ---------------------------------------------------------------------------
// 1099-INT NJ state withholding
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter 1099-INT withholding", () => {
  it("NJ-1040 adapter - 1099-INT NJ state withholding included", () => {
    const input = minimalTaxInput({
      form1099Int: [
        {
          payer: "NJ Credit Union",
          interestIncome: "5000",
          stateWithheld: "250",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(250));
  });

  it("NJ-1040 adapter - 1099-INT non-NJ state withholding excluded", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "50000",
          federalWithheld: "6000",
          stateTaxWithheld: "2000",
          state: "NJ",
        },
      ],
      form1099Int: [
        {
          payer: "CA Bank",
          interestIncome: "3000",
          stateWithheld: "150",
          state: "CA",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // Only W-2 (2000) — 1099-INT CA excluded
    expect(result.njWithholding).toEqual(d(2000));
  });

  it("NJ-1040 adapter - 1099-INT with no state field treated as NJ", () => {
    const input = minimalTaxInput({
      form1099Int: [
        {
          payer: "Bank",
          interestIncome: "8000",
          stateWithheld: "400",
          // no state field → treated as NJ
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(400));
  });
});

// ---------------------------------------------------------------------------
// 1099-DIV NJ state withholding
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter 1099-DIV withholding", () => {
  it("NJ-1040 adapter - 1099-DIV NJ state withholding included", () => {
    const input = minimalTaxInput({
      form1099Div: [
        {
          payer: "Vanguard",
          ordinaryDividends: "10000",
          stateWithheld: "500",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(500));
  });

  it("NJ-1040 adapter - 1099-DIV non-NJ state withholding excluded", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "60000",
          federalWithheld: "7000",
          stateTaxWithheld: "2500",
          state: "NJ",
        },
      ],
      form1099Div: [
        {
          payer: "Schwab",
          ordinaryDividends: "6000",
          stateWithheld: "300",
          state: "PA",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // Only W-2 (2500) — 1099-DIV PA excluded
    expect(result.njWithholding).toEqual(d(2500));
  });

  it("NJ-1040 adapter - 1099-DIV with no state field treated as NJ", () => {
    const input = minimalTaxInput({
      form1099Div: [
        {
          payer: "Fidelity",
          ordinaryDividends: "4000",
          stateWithheld: "200",
          // no state field → treated as NJ
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(200));
  });
});

// ---------------------------------------------------------------------------
// 1099-NEC NJ state withholding
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter 1099-NEC withholding", () => {
  it("NJ-1040 adapter - 1099-NEC NJ state withholding included", () => {
    const input = minimalTaxInput({
      form1099Nec: [
        {
          payer: "Consulting Client",
          nonemployeeCompensation: "12000",
          federalWithheld: "0",
          stateWithheld: "600",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(600));
  });

  it("NJ-1040 adapter - 1099-NEC non-NJ state withholding excluded", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "50000",
          federalWithheld: "6000",
          stateTaxWithheld: "2200",
          state: "NJ",
        },
      ],
      form1099Nec: [
        {
          payer: "Out-of-state Client",
          nonemployeeCompensation: "9000",
          federalWithheld: "0",
          stateWithheld: "450",
          state: "NY",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(2200));
  });

  it("NJ-1040 adapter - 1099-NEC with no state field treated as NJ", () => {
    const input = minimalTaxInput({
      form1099Nec: [
        {
          payer: "Client",
          nonemployeeCompensation: "7000",
          federalWithheld: "0",
          stateWithheld: "350",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(350));
  });
});

// ---------------------------------------------------------------------------
// 1099-MISC NJ state withholding
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter 1099-MISC withholding", () => {
  it("NJ-1040 adapter - 1099-MISC NJ state withholding included", () => {
    const input = minimalTaxInput({
      form1099Misc: [
        {
          payer: "Rental Payer",
          rents: "8000",
          stateWithheld: "400",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(400));
  });

  it("NJ-1040 adapter - 1099-MISC non-NJ state withholding excluded", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "55000",
          federalWithheld: "6500",
          stateTaxWithheld: "2400",
          state: "NJ",
        },
      ],
      form1099Misc: [
        {
          payer: "Out-of-state Payer",
          otherIncome: "3000",
          stateWithheld: "150",
          state: "PA",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(2400));
  });

  it("NJ-1040 adapter - 1099-MISC with no state field treated as NJ", () => {
    const input = minimalTaxInput({
      form1099Misc: [
        {
          payer: "Payer",
          otherIncome: "2500",
          stateWithheld: "125",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    expect(result.njWithholding).toEqual(d(125));
  });
});

// ---------------------------------------------------------------------------
// Combined withholding from all supported sources
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter combined withholding all sources", () => {
  it("NJ-1040 adapter - combined withholding from all nine supported sources (W-2 + W-2G + 1099-G + 1099-K + 1099-R + 1099-INT + 1099-DIV + 1099-NEC + 1099-MISC)", () => {
    const input = minimalTaxInput({
      w2s: [
        {
          employer: { name: "NJ Corp", ein: "12-3456789" },
          wages: "70000",
          federalWithheld: "9000",
          stateTaxWithheld: "3000",
          state: "NJ",
        },
      ],
      formW2G: [
        {
          payer: "Casino NJ",
          reportableWinnings: "5000",
          stateWithheld: "250",
          state: "NJ",
        },
      ],
      form1099G: [
        {
          payer: "NJ Dept of Labor",
          unemploymentCompensation: "8000",
          stateWithheld: "400",
          state: "NJ",
        },
      ],
      form1099K: [
        {
          pse: "Payment Platform",
          grossAmount: "20000",
          stateWithheld: "600",
          state: "NJ",
        },
      ],
      form1099R: [
        {
          payer: "NJ Pension",
          grossDistribution: "24000",
          taxableAmount: "24000",
          stateWithheld: "1200",
          state: "NJ",
        },
      ],
      form1099Int: [
        {
          payer: "NJ Bank",
          interestIncome: "5000",
          stateWithheld: "250",
          state: "NJ",
        },
      ],
      form1099Div: [
        {
          payer: "Vanguard",
          ordinaryDividends: "8000",
          stateWithheld: "400",
          state: "NJ",
        },
      ],
      form1099Nec: [
        {
          payer: "Consulting Client",
          nonemployeeCompensation: "6000",
          federalWithheld: "0",
          stateWithheld: "350",
          state: "NJ",
        },
      ],
      form1099Misc: [
        {
          payer: "Royalty Payer",
          royalties: "4000",
          stateWithheld: "275",
          state: "NJ",
        },
      ],
    });
    const result = buildNJ1040Input(input, minimalFederalResult());
    // W-2 (3000) + W-2G (250) + 1099-G (400) + 1099-K (600) + 1099-R (1200)
    // + 1099-INT (250) + 1099-DIV (400) + 1099-NEC (350) + 1099-MISC (275) = 6725
    expect(result.njWithholding).toEqual(d(6725));
  });
});

describe("NJ-1040 adapter PTBAIT credit", () => {
  it("NJ-1040 adapter - PTBAIT credit sums K-1 amounts and config add-on", () => {
    const result = buildNJ1040Input(
      minimalTaxInput({
        scheduleK1: [
          {
            partnershipName: "Garden State Partners",
            partnershipEIN: "11-1111111",
            ordinaryIncome: "15000",
            entityType: "partnership",
            njPassThroughBusinessAlternativeIncomeTaxCredit: "800",
          },
          {
            partnershipName: "Hudson S Corp",
            partnershipEIN: "22-2222222",
            ordinaryIncome: "9000",
            entityType: "s_corporation",
            njPassThroughBusinessAlternativeIncomeTaxCredit: "1200",
          },
        ],
      }),
      minimalFederalResult(),
      {
        passThroughBusinessAlternativeIncomeTaxCredit: 300,
      }
    );

    expect(result.passThroughBusinessAlternativeIncomeTaxCredit).toEqual(d(2300));
  });

  it("NJ-1040 adapter - PTBAIT credit defaults to zero when no support documents exist", () => {
    const result = buildNJ1040Input(
      minimalTaxInput(),
      minimalFederalResult()
    );

    expect(result.passThroughBusinessAlternativeIncomeTaxCredit).toEqual(d(0));
  });

  it("NJ-1040 adapter - overpayment allocation and charitable contribution config flows through adapter", () => {
    const result = buildNJ1040Input(minimalTaxInput(), minimalFederalResult(), {
      creditOverpaymentToNextYear: 25,
      endangeredWildlifeFundContribution: 10,
      otherDesignatedContributions: [{ code: "14", amount: 5 }],
    });

    expect(result.creditOverpaymentToNextYear).toBe(25);
    expect(result.endangeredWildlifeFundContribution).toBe(10);
    expect(result.otherDesignatedContributions).toEqual([{ code: "14", amount: 5 }]);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: adapter produces valid input for calculateNJ1040
// ---------------------------------------------------------------------------

describe("NJ-1040 adapter end-to-end", () => {
  it("NJ-1040 adapter - produces valid NJ1040Input that calculateNJ1040 accepts", () => {
    // Build a realistic scenario
    const input = minimalTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "John",
          lastName: "Smith",
          ssn: "123-45-6789",
          dateOfBirth: "1962-08-20", // age 63 → qualifies for pension exclusion
        },
        spouse: {
          firstName: "Jane",
          lastName: "Smith",
          ssn: "987-65-4321",
          dateOfBirth: "1960-03-15", // age 65
        },
        address: { street: "100 Garden State Pkwy", city: "Newark", state: "NJ", zip: "07101" },
        dependents: [
          {
            firstName: "Baby",
            lastName: "Smith",
            ssn: "555-55-5555",
            dateOfBirth: "2023-02-14",
            relationship: "daughter",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
        ],
      },
      w2s: [
        {
          employer: { name: "NJ Employer", ein: "12-3456789" },
          wages: "85000",
          federalWithheld: "12000",
          stateWages: "85000",
          stateTaxWithheld: "3800",
          state: "NJ",
        },
      ],
      form1099Int: [{ payer: "NJ Bank", interestIncome: "1200" }],
      form1099Div: [{ payer: "Vanguard", ordinaryDividends: "2500", qualifiedDividends: "2000" }],
      form1099R: [
        {
          payer: "NJ State Pension",
          grossDistribution: "30000",
          taxableAmount: "28000",
          stateWithheld: "1400",
          state: "NJ",
        },
      ],
      formW2G: [{ payer: "Atlantic City", reportableWinnings: "5000", stateWithheld: "250", state: "NJ" }],
      scheduleA: { gamblingLosses: "2000" },
      adjustments: {
        estimatedTaxPayments: [
          { date: "2025-04-15", amount: "1500", type: "state" },
        ],
        alimonyPaid: "6000",
      },
    });

    const fedResult = minimalFederalResult({
      capitalGainLoss: d(8000),
      earnedIncomeCredit: d(0),
    });

    const njConfig: NJStateConfig = {
      isHomeowner: true,
      propertyTaxesPaid: 10000,
      totalMedicalExpenses: 5000,
      isVeteran: true,
    };

    const njInput = buildNJ1040Input(input, fedResult, njConfig);

    // Verify key mappings
    expect(njInput.filingStatus).toBe("married_filing_jointly");
    expect(njInput.taxYear).toBe(2025);
    expect(njInput.monthsOfResidency).toBe(12);
    expect(njInput.wages).toEqual(d(85000));
    expect(njInput.taxableInterest).toEqual(d(1200));
    expect(njInput.dividends).toEqual(d(2500));
    expect(njInput.netGainsFromProperty).toEqual(d(8000));
    expect(njInput.pensionIncome).toEqual(d(28000));
    expect(njInput.gamblingWinnings).toEqual(d(5000));
    expect(njInput.gamblingLosses).toEqual(d(2000));
    expect(njInput.alimonyPaid).toEqual(d(6000));
    expect(njInput.qualifiesForPensionExclusion).toBe(true); // age 63
    expect(njInput.taxpayerAge65OrOlder).toBe(false); // age 63
    expect(njInput.spouseAge65OrOlder).toBe(true); // age 65
    expect(njInput.isVeteran).toBe(true);
    expect(njInput.dependentCount).toBe(1);
    expect(njInput.qualifyingChildrenAge5OrUnder).toBe(1);
    expect(njInput.njWithholding).toEqual(d(5450)); // 3800 + 250 + 1400
    expect(njInput.estimatedPayments).toEqual(d(1500));
    expect(njInput.isHomeowner).toBe(true);
    expect(njInput.propertyTaxesPaid).toBe(10000);
    expect(njInput.totalMedicalExpenses).toBe(5000);

    // Verify it can be passed to calculateNJ1040
    const njResult = calculateNJ1040(njInput);
    expect(njResult.njGrossIncome.greaterThan(0)).toBe(true);
    expect(njResult.njTax.greaterThan(0)).toBe(true);
  });
});
