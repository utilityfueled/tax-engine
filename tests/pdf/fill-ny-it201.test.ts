/**
 * Tests for New York IT-201 PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import Decimal from "decimal.js";
import { fillNYIT201, NY_IT201_FIELDS } from "@/pdf/fill-ny-it201.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { NYIT201FullReturnResult } from "@/engine/state/ny-it201-full-return.js";
import type { NYIT201AdditionsSubtractionsResult } from "@/engine/state/ny-it201-additions-subtractions.js";
import type { NYIT201DeductionResult } from "@/engine/state/ny-it201-standard-deduction.js";
import type { NYIT201TaxComputationResult } from "@/engine/state/ny-it201-tax-computation.js";
import type { NYIT201CreditsResult } from "@/engine/state/ny-it201-credits.js";
import type { NYIT201NYCTaxResult } from "@/engine/state/ny-it201-nyc-tax.js";
import type { NYIT201YonkersTaxResult } from "@/engine/state/ny-it201-yonkers-tax.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";

const d = (v: number | string) => new Decimal(v);
const ZERO = d(0);

/** Helper: get text value from a filled PDF field. */
function getFieldText(doc: PDFDocument, fieldName: string): string | undefined {
  try {
    const field = doc.getForm().getField(fieldName);
    if (field instanceof PDFTextField) {
      return field.getText() ?? undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Helper: check if a checkbox is checked. */
function isChecked(doc: PDFDocument, fieldName: string): boolean {
  try {
    const field = doc.getForm().getField(fieldName);
    if (field instanceof PDFCheckBox) {
      return field.isChecked();
    }
  } catch {
    return false;
  }
  return false;
}

const BLANK_PDF = "forms/blank/ny-it201.pdf";

// ─── Minimal Result Factories ──────────────────────────────────────────────

function makeAddSubResult(overrides: Partial<NYIT201AdditionsSubtractionsResult> = {}): NYIT201AdditionsSubtractionsResult {
  return {
    federalAgi: ZERO,
    line20: ZERO,
    line21: ZERO,
    line22: ZERO,
    line23: ZERO,
    totalAdditions: ZERO,
    line25: ZERO,
    line26: ZERO,
    line27: ZERO,
    line28: ZERO,
    line29: ZERO,
    line30: ZERO,
    line31: ZERO,
    totalSubtractions: ZERO,
    nyAgi: ZERO,
    lines: [],
    ...overrides,
  };
}

function makeDeductionResult(overrides: Partial<NYIT201DeductionResult> = {}): NYIT201DeductionResult {
  return {
    nyAgi: ZERO,
    standardDeduction: ZERO,
    itemizedDeduction: ZERO,
    deductionUsed: "standard",
    deductionAmount: ZERO,
    agiMinusDeduction: ZERO,
    dependentExemption: ZERO,
    numberOfDependents: 0,
    taxableIncome: ZERO,
    lines: [],
    ...overrides,
  };
}

function makeTaxComputationResult(overrides: Partial<NYIT201TaxComputationResult> = {}): NYIT201TaxComputationResult {
  return {
    nyAgi: ZERO,
    taxableIncome: ZERO,
    bracketGroup: "under_65000",
    computationMethod: "tax_table",
    rateScheduleTax: ZERO,
    recaptureAmount: ZERO,
    worksheetNumber: null,
    tax: ZERO,
    lines: [],
    ...overrides,
  };
}

function makeCreditsResult(overrides: Partial<NYIT201CreditsResult> = {}): NYIT201CreditsResult {
  return {
    nyAgi: ZERO,
    nyStateTax: ZERO,
    householdCredit: ZERO,
    residentCredit: ZERO,
    otherNYStateCredits: ZERO,
    totalNYStateCredits: ZERO,
    netNYStateTax: ZERO,
    otherStateTaxes: ZERO,
    salesUseTax: ZERO,
    totalNYStateTaxes: ZERO,
    empireStateChildCredit: ZERO,
    nyEarnedIncomeCredit: ZERO,
    lines: [],
    ...overrides,
  };
}

function makeNYCTaxResult(overrides: Partial<NYIT201NYCTaxResult> = {}): NYIT201NYCTaxResult {
  return {
    nycTaxableIncome: ZERO,
    bracketGroup: "under_65000",
    isNYCResident: false,
    nycResidentTax: ZERO,
    nycHouseholdCredit: ZERO,
    partYearNYCTax: ZERO,
    otherNYCTaxes: ZERO,
    otherNYCCredits: ZERO,
    netNYCTax: ZERO,
    nycSchoolTaxCredit: ZERO,
    totalNYCTax: ZERO,
    lines: [],
    ...overrides,
  };
}

function makeYonkersTaxResult(overrides: Partial<NYIT201YonkersTaxResult> = {}): NYIT201YonkersTaxResult {
  return {
    yonkersResidencyStatus: "none",
    yonkersResidentSurcharge: ZERO,
    yonkersNonresidentEarningsTax: ZERO,
    partYearYonkersSurcharge: ZERO,
    totalYonkersTax: ZERO,
    lines: [],
    ...overrides,
  };
}

function makeNYResult(overrides: Partial<NYIT201FullReturnResult> = {}): NYIT201FullReturnResult {
  return {
    additionsSubtractions: makeAddSubResult(),
    deduction: makeDeductionResult(),
    taxComputation: makeTaxComputationResult(),
    credits: makeCreditsResult(),
    nycTax: makeNYCTaxResult(),
    yonkersTax: makeYonkersTaxResult(),
    empireStateChildCredit: null,
    collegeTuitionCredit: null,
    realPropertyTaxCreditResult: null,
    it217Result: null,
    childDependentCareCredit: null,
    it209Result: null,
    nycEarnedIncomeCreditResult: null,
    nycIncomeTaxEliminationCreditResult: null,
    itemizedDeductionResult: null,
    residentCreditResult: null,
    mctmtResult: null,
    it225Result: null,
    it201attNonrefundableCredits: null,
    it249Result: null,
    it201attRefundableCredits: null,
    it119Result: null,
    it227Result: null,
    totalNYStateTaxes: ZERO,
    totalNYCTax: ZERO,
    totalYonkersTax: ZERO,
    totalLocalTaxes: ZERO,
    totalTaxBeforeCreditsAndPayments: ZERO,
    voluntaryContributions: ZERO,
    starCredit: ZERO,
    nycYonkersRefundableCredits: ZERO,
    empireStateChildCreditAmount: ZERO,
    childDependentCareCreditAmount: ZERO,
    nyEarnedIncomeCredit: ZERO,
    nyNoncustodialParentEarnedIncomeCredit: ZERO,
    realPropertyTaxCredit: ZERO,
    collegeTuitionCreditAmount: ZERO,
    nycSchoolTaxCreditFixedAmount: ZERO,
    nycSchoolTaxCreditRateReductionAmount: ZERO,
    nycEarnedIncomeCreditAmount: ZERO,
    nycIncomeTaxEliminationCreditAmount: ZERO,
    otherRefundableCredits: ZERO,
    totalRefundableCredits: ZERO,
    nyStateTaxWithheld: ZERO,
    nycTaxWithheld: ZERO,
    yonkersTaxWithheld: ZERO,
    estimatedTaxPayments: ZERO,
    priorYearOverpaymentApplied: ZERO,
    extensionPayment: ZERO,
    totalEstimatedAndExtensionPayments: ZERO,
    totalPayments: ZERO,
    totalCreditsAndPayments: ZERO,
    overpaymentOrBalanceDue: ZERO,
    overpayment: ZERO,
    amountAvailableForRefund: ZERO,
    nys529AccountDeposit: ZERO,
    cashRefundAfterNys529AccountDeposit: ZERO,
    appliedToNextYearEstimatedTax: ZERO,
    amountOwed: ZERO,
    estimatedTaxPenalty: ZERO,
    otherPenaltiesAndInterest: ZERO,
    lines: [],
    ...overrides,
  };
}

function makeFederalResult(nyResult: NYIT201FullReturnResult): TaxReturnResult {
  return {
    taxYear: 2025,
    filingStatus: "single",
    totalWages: d(85000),
    totalInterest: d(500),
    taxExemptInterest: ZERO,
    totalDividends: d(200),
    qualifiedDividends: d(200),
    iraDistributionsGross: ZERO,
    iraDistributionsTaxable: ZERO,
    pensionDistributionsGross: ZERO,
    pensionDistributionsTaxable: ZERO,
    socialSecurityBenefitsGross: ZERO,
    socialSecurityBenefitsTaxable: ZERO,
    capitalGainLoss: d(1500),
    otherIncome: ZERO,
    nolDeduction: ZERO,
    totalIncome: d(87200),
    adjustmentsToIncome: ZERO,
    agi: d(87200),
    standardDeduction: d(15700),
    itemizedDeductions: ZERO,
    deductionUsed: "standard",
    deductionAmount: d(15700),
    taxableIncome: d(71500),
    ordinaryTax: d(11658),
    capitalGainsTax: d(225),
    totalTaxBeforeCredits: d(11883),
    childTaxCredit: ZERO,
    foreignTaxCredit: ZERO,
    otherCredits: ZERO,
    totalCredits: ZERO,
    earnedIncomeCredit: ZERO,
    amt: ZERO,
    selfEmploymentTax: ZERO,
    additionalMedicareTax: ZERO,
    niitTax: ZERO,
    estimatedTaxPenalty: ZERO,
    totalAdditionalTaxes: ZERO,
    totalTax: d(11883),
    totalPayments: d(12750),
    totalWithholding: d(12750),
    estimatedTaxPayments: ZERO,
    amountOwed: ZERO,
    refund: d(867),
    carryforwards: {
      capitalLoss: ZERO,
      shortTermCapitalLoss: ZERO,
      longTermCapitalLoss: ZERO,
      suspendedPassiveLosses: [],
      suspendedPTPLosses: [],
      foreignTaxCreditCarryforward: ZERO,
      foreignTaxCreditCarryforwardByCategory: {},
      qbiLossCarryforward: ZERO,
      investmentInterestExpense: ZERO,
      minimumTaxCredit: ZERO,
      charitableContributions: ZERO,
      charitableContributionsByYear: [],
      excessBusinessLossNOL: ZERO,
      nolCarryforward: ZERO,
      generalBusinessCredit: ZERO,
      suspendedBusinessInterest: [],
      partnerBasis: [],
      excessContributions: {
        traditionalIRA: ZERO,
        rothIRA: ZERO,
        coverdellESA: ZERO,
        archerMSA: ZERO,
        hsa: ZERO,
        able: ZERO,
      },
    },
    allLines: [],
    stateReturns: {
      newYork: nyResult,
    },
  };
}

// ─── Simple NY Single Filer Input ──────────────────────────────────────────

const nySingleInput: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Alex",
      lastName: "Rivera",
      ssn: "123-45-6789",
      dateOfBirth: "1990-05-15",
      occupation: "Engineer",
    },
    address: {
      street: "100 Broadway",
      apt: "4A",
      city: "New York",
      state: "NY",
      zip: "10005",
    },
    dependents: [],
  },
  w2s: [{
    employer: { name: "NYC Corp", ein: "13-1234567" },
    wages: "85000",
    federalWithheld: "12750",
    socialSecurityWages: "85000",
    socialSecurityWithheld: "5270",
    medicareWages: "85000",
    medicareWithheld: "1232.50",
    stateTaxWithheld: "4500",
    stateWages: "85000",
    localTaxWithheld: "2800",
    state: "NY",
  }],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  form1099G: [],
  form1099OID: [],
  formW2G: [],
  form1099K: [],
  form1099C: [],
  form1099Q: [],
  homeSales: [],
  form8824: [],
  form8814: [],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("NY IT-201 PDF fill — single filer with income", () => {
  const nyResult = makeNYResult({
    additionsSubtractions: makeAddSubResult({
      federalAgi: d(87200),
      line20: d(300),
      totalAdditions: d(300),
      nyAgi: d(87500),
    }),
    deduction: makeDeductionResult({
      nyAgi: d(87500),
      standardDeduction: d(8000),
      deductionUsed: "standard",
      deductionAmount: d(8000),
      agiMinusDeduction: d(79500),
      taxableIncome: d(79500),
    }),
    taxComputation: makeTaxComputationResult({
      taxableIncome: d(79500),
      tax: d(4836),
    }),
    credits: makeCreditsResult({
      nyStateTax: d(4836),
      householdCredit: ZERO,
      totalNYStateCredits: ZERO,
      netNYStateTax: d(4836),
      totalNYStateTaxes: d(4836),
    }),
    totalNYStateTaxes: d(4836),
    totalTaxBeforeCreditsAndPayments: d(4836),
    nyStateTaxWithheld: d(4500),
    totalPayments: d(4500),
    totalCreditsAndPayments: d(4500),
    overpaymentOrBalanceDue: d(-336),
    amountOwed: d(336),
  });

  let doc: PDFDocument;

  it("fills personal info correctly", async () => {
    const result = makeFederalResult(nyResult);
    doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.tpFirstName)).toBe("Alex");
    expect(getFieldText(doc, NY_IT201_FIELDS.tpLastName)).toBe("Rivera");
    expect(getFieldText(doc, NY_IT201_FIELDS.tpSSN)).toBe("123456789");
    expect(getFieldText(doc, NY_IT201_FIELDS.tpDOB)).toBe("05151990");
    expect(getFieldText(doc, NY_IT201_FIELDS.tpOccupation)).toBe("Engineer");
  });

  it("fills address fields", async () => {
    const result = makeFederalResult(nyResult);
    doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.mailAddress)).toBe("100 Broadway");
    expect(getFieldText(doc, NY_IT201_FIELDS.mailApt)).toBe("4A");
    expect(getFieldText(doc, NY_IT201_FIELDS.mailCity)).toBe("New York");
    expect(getFieldText(doc, NY_IT201_FIELDS.mailState)).toBe("NY");
    expect(getFieldText(doc, NY_IT201_FIELDS.mailZip)).toBe("10005");
  });

  it("fills federal AGI on line 19", async () => {
    const result = makeFederalResult(nyResult);
    doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.line19)).toBe(formatCurrency(d(87200)));
  });

  it("fills NY additions line 20 and total", async () => {
    const result = makeFederalResult(nyResult);
    doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.line20)).toBe(formatCurrency(d(300)));
    expect(getFieldText(doc, NY_IT201_FIELDS.line24)).toBe(formatCurrency(d(300)));
  });

  it("fills NY AGI on line 33", async () => {
    const result = makeFederalResult(nyResult);
    doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.line33)).toBe(formatCurrency(d(87500)));
  });

  it("fills deduction and taxable income", async () => {
    const result = makeFederalResult(nyResult);
    doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.line34)).toBe(formatCurrency(d(8000)));
    expect(getFieldText(doc, NY_IT201_FIELDS.line37)).toBe(formatCurrency(d(79500)));
  });

  it("fills NY state tax on line 38", async () => {
    const result = makeFederalResult(nyResult);
    doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.line38)).toBe(formatCurrency(d(4836)));
  });

  it("fills total NY state taxes on line 46", async () => {
    const result = makeFederalResult(nyResult);
    doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.line46)).toBe(formatCurrency(d(4836)));
  });

  it("fills withholding on line 72", async () => {
    const result = makeFederalResult(nyResult);
    doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.line72)).toBe(formatCurrency(d(4500)));
  });

  it("fills amount owed on line 80", async () => {
    const result = makeFederalResult(nyResult);
    doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.line80)).toBe(formatCurrency(d(336)));
    expect(isChecked(doc, NY_IT201_FIELDS.line80Box)).toBe(true);
  });

  it("fills total tax before credits on line 62", async () => {
    const result = makeFederalResult(nyResult);
    doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.line62)).toBe(formatCurrency(d(4836)));
  });
});

describe("NY IT-201 PDF fill — refund scenario with credits", () => {
  const nyRefundResult = makeNYResult({
    additionsSubtractions: makeAddSubResult({
      federalAgi: d(50000),
      nyAgi: d(50000),
    }),
    deduction: makeDeductionResult({
      nyAgi: d(50000),
      standardDeduction: d(8000),
      deductionUsed: "standard",
      deductionAmount: d(8000),
      agiMinusDeduction: d(42000),
      taxableIncome: d(42000),
    }),
    taxComputation: makeTaxComputationResult({
      taxableIncome: d(42000),
      tax: d(2250),
    }),
    credits: makeCreditsResult({
      nyStateTax: d(2250),
      totalNYStateTaxes: d(2250),
    }),
    totalNYStateTaxes: d(2250),
    totalTaxBeforeCreditsAndPayments: d(2250),
    nyStateTaxWithheld: d(3000),
    totalPayments: d(3000),
    totalCreditsAndPayments: d(3000),
    overpayment: d(750),
    amountAvailableForRefund: d(750),
    cashRefundAfterNys529AccountDeposit: d(750),
    overpaymentOrBalanceDue: d(750),
  });

  it("fills overpayment on line 77 and refund on line 78", async () => {
    const result = makeFederalResult(nyRefundResult);
    const doc = await fillNYIT201(nySingleInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.line77)).toBe(formatCurrency(d(750)));
    expect(getFieldText(doc, NY_IT201_FIELDS.line78)).toBe(formatCurrency(d(750)));
    expect(isChecked(doc, NY_IT201_FIELDS.line78Refund)).toBe(true);
    // No balance due
    expect(isChecked(doc, NY_IT201_FIELDS.line80Box)).toBe(false);
  });
});

describe("NY IT-201 PDF fill — zero values are empty", () => {
  it("leaves zero-value fields empty", async () => {
    const nyResult = makeNYResult();
    const result = makeFederalResult(nyResult);
    // Use a minimal input with zero wages
    const zeroInput: TaxYearInput = {
      ...nySingleInput,
      w2s: [],
    };
    const zeroFederalResult = { ...result, totalWages: ZERO, totalInterest: ZERO, totalDividends: ZERO };
    const doc = await fillNYIT201(zeroInput, zeroFederalResult, BLANK_PDF);

    // Zero currency fields should be undefined (formatCurrency returns "" for zero)
    expect(getFieldText(doc, NY_IT201_FIELDS.line20)).toBeUndefined();
    expect(getFieldText(doc, NY_IT201_FIELDS.line63)).toBeUndefined();
    expect(getFieldText(doc, NY_IT201_FIELDS.line72)).toBeUndefined();
  });
});

describe("NY IT-201 PDF fill — error handling", () => {
  it("throws when no New York result is available", async () => {
    const result = makeFederalResult(makeNYResult());
    result.stateReturns = {};
    await expect(
      fillNYIT201(nySingleInput, result, BLANK_PDF),
    ).rejects.toThrow("No New York state return result available");
  });
});

describe("NY IT-201 PDF fill — MFJ with dependents", () => {
  const mfjInput: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      primary: {
        firstName: "John",
        lastName: "Kim",
        ssn: "111-22-3333",
        dateOfBirth: "1985-03-10",
        occupation: "Accountant",
      },
      spouse: {
        firstName: "Jane",
        lastName: "Kim",
        ssn: "444-55-6666",
        dateOfBirth: "1987-07-20",
        occupation: "Teacher",
      },
      address: {
        street: "200 Park Ave",
        city: "New York",
        state: "NY",
        zip: "10017",
      },
      dependents: [
        {
          firstName: "Lily",
          lastName: "Kim",
          ssn: "777-88-9999",
          dateOfBirth: "2018-01-15",
          relationship: "daughter",
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
    form1099G: [],
    form1099OID: [],
    formW2G: [],
    form1099K: [],
    form1099C: [],
    form1099Q: [],
    homeSales: [],
    form8824: [],
    form8814: [],
  };

  it("fills both spouse names and SSNs", async () => {
    const nyResult = makeNYResult();
    const result = makeFederalResult(nyResult);
    const doc = await fillNYIT201(mfjInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.tpFirstName)).toBe("John");
    expect(getFieldText(doc, NY_IT201_FIELDS.tpLastName)).toBe("Kim");
    expect(getFieldText(doc, NY_IT201_FIELDS.spouseFirstName)).toBe("Jane");
    expect(getFieldText(doc, NY_IT201_FIELDS.spouseLastName)).toBe("Kim");
    expect(getFieldText(doc, NY_IT201_FIELDS.spouseSSN)).toBe("444556666");
  });

  it("checks MFJ filing status checkbox", async () => {
    const nyResult = makeNYResult();
    const result = makeFederalResult(nyResult);
    const doc = await fillNYIT201(mfjInput, result, BLANK_PDF);

    expect(isChecked(doc, NY_IT201_FIELDS.filingStatus)).toBe(true);
  });

  it("fills dependent information in Section H", async () => {
    const nyResult = makeNYResult();
    const result = makeFederalResult(nyResult);
    const doc = await fillNYIT201(mfjInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.dependentFirst[0])).toBe("Lily");
    expect(getFieldText(doc, NY_IT201_FIELDS.dependentLast[0])).toBe("Kim");
    expect(getFieldText(doc, NY_IT201_FIELDS.dependentRelationship[0])).toBe("daughter");
    expect(getFieldText(doc, NY_IT201_FIELDS.dependentSSN[0])).toBe("777889999");
    expect(getFieldText(doc, NY_IT201_FIELDS.dependentDOB[0])).toBe("01152018");
  });

  it("fills page 2 name as joint return", async () => {
    const nyResult = makeNYResult();
    const result = makeFederalResult(nyResult);
    const doc = await fillNYIT201(mfjInput, result, BLANK_PDF);

    expect(getFieldText(doc, NY_IT201_FIELDS.nameAsPage1)).toBe("John Kim & Jane Kim");
  });
});
