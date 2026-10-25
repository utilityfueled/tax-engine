/**
 * Tests for Pennsylvania PA-40 PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import Decimal from "decimal.js";
import { fillPA40, PA_40_FIELDS } from "@/pdf/fill-pa-40.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { calculatePAReturn, type PAOrchestratorOverrides } from "@/engine/state/pa-orchestrator.js";
import type { PAOrchestratorResult } from "@/engine/state/pa-orchestrator.js";
import type { PA40Result } from "@/engine/state/pa-40.js";
import type { ScheduleSPResult } from "@/engine/state/pa-schedule-sp.js";
import type { ScheduleGLResult } from "@/engine/state/pa-schedule-g-l.js";

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

const BLANK_PDF = "forms/blank/2025/pa-40.pdf";

// ─── Minimal PA40Result factory ──────────────────────────────────────────

function makePA40Result(overrides: Partial<PA40Result> = {}): PA40Result {
  return {
    compensation: ZERO,
    unreimbursedExpenses: ZERO,
    netCompensation: ZERO,
    interest: ZERO,
    dividends: ZERO,
    netBusinessIncome: ZERO,
    netGainOrLoss: ZERO,
    netRentalIncome: ZERO,
    estateTrustIncome: ZERO,
    gamblingIncome: ZERO,
    totalPATaxableIncome: ZERO,
    otherDeductions: ZERO,
    adjustedPATaxableIncome: ZERO,
    taxForgivenessEligibilityIncome: ZERO,
    useTax: ZERO,
    totalPATax: ZERO,
    taxLiability: ZERO,
    stateWithholding: ZERO,
    creditFromPriorYear: ZERO,
    estimatedPayments: ZERO,
    extensionPayment: ZERO,
    nonresidentTaxWithheld: ZERO,
    refundableCredits: ZERO,
    totalEstimatedPaymentsAndCredits: ZERO,
    totalPayments: ZERO,
    taxForgivenessCredit: ZERO,
    residentCredit: ZERO,
    otherCredits: ZERO,
    totalCredits: ZERO,
    netTaxLiability: ZERO,
    totalPaymentsAndCredits: ZERO,
    overpayment: ZERO,
    amountOwed: ZERO,
    taxDue: ZERO,
    underpaymentPenalty: ZERO,
    lateFilingOrPaymentPenalty: ZERO,
    latePaymentInterest: ZERO,
    penaltiesAndInterest: ZERO,
    totalAmountDue: ZERO,
    netOverpayment: ZERO,
    lines: [],
    ...overrides,
  };
}

function makeScheduleSPResult(overrides: Partial<ScheduleSPResult> = {}): ScheduleSPResult {
  return {
    paTaxableIncome: ZERO,
    nontaxableIncome: ZERO,
    additionalEligibilityIncome: ZERO,
    eligibilityIncome: ZERO,
    filingCategory: "unmarried",
    dependents: 0,
    baseThreshold: ZERO,
    forgivenessPercentage: ZERO,
    taxLiability: ZERO,
    taxPaidToOtherStates: ZERO,
    taxLiabilityAfterOtherStateTaxes: ZERO,
    taxForgivenessCredit: ZERO,
    lines: [],
    ...overrides,
  };
}

function makeScheduleGLResult(overrides: Partial<ScheduleGLResult> = {}): ScheduleGLResult {
  return {
    perStateResults: [],
    totalCreditBeforeCap: ZERO,
    totalCredit: ZERO,
    paTaxLiability: ZERO,
    lines: [],
    ...overrides,
  };
}

function makePAOrchestratorResult(
  pa40Overrides: Partial<PA40Result> = {},
  scheduleSPOverrides: Partial<ScheduleSPResult> = {},
  scheduleGLOverrides: Partial<ScheduleGLResult> = {},
): PAOrchestratorResult {
  return {
    pa40: makePA40Result(pa40Overrides),
    scheduleSP: makeScheduleSPResult(scheduleSPOverrides),
    scheduleGL: makeScheduleGLResult(scheduleGLOverrides),
    mappedIncome: {
      compensation: pa40Overrides.compensation ?? ZERO,
      interest: pa40Overrides.interest ?? ZERO,
      dividends: pa40Overrides.dividends ?? ZERO,
      netBusinessIncome: pa40Overrides.netBusinessIncome ?? ZERO,
      netGainOrLoss: pa40Overrides.netGainOrLoss ?? ZERO,
      netRentalIncome: pa40Overrides.netRentalIncome ?? ZERO,
      estateTrustIncome: pa40Overrides.estateTrustIncome ?? ZERO,
      gamblingIncome: pa40Overrides.gamblingIncome ?? ZERO,
    },
    exclusions: {
      usGovInterest: ZERO,
      paLotteryWinnings: ZERO,
    },
    stateWithholding: pa40Overrides.stateWithholding ?? ZERO,
    localWithholding: ZERO,
  } as PAOrchestratorResult;
}

// ─── Fixtures ────────────────────────────────────────────────────────────

/** Single PA filer: $75k W-2 wages, $3000 PA withholding */
const paSingleFiler: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "John",
      lastName: "Smith",
      ssn: "111-22-3333",
      dateOfBirth: "1985-06-15",
      occupation: "Accountant",
    },
    address: {
      street: "123 Main Street",
      city: "Philadelphia",
      state: "PA",
      zip: "19103",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Acme Corp", ein: "12-3456789" },
      wages: "75000",
      federalWithheld: "11250",
      socialSecurityWages: "75000",
      socialSecurityWithheld: "4650",
      medicareWages: "75000",
      medicareWithheld: "1087.50",
      stateTaxWithheld: "3000",
      stateWages: "75000",
      localTaxWithheld: "0",
      state: "PA",
    },
  ],
  form1099Int: [],
  form1099Div: [],
};

const paSingleResult: TaxReturnResult = {
  taxYear: 2025,
  stateReturns: {
    pennsylvania: makePAOrchestratorResult({
      compensation: d(75000),
      netCompensation: d(75000),
      totalPATaxableIncome: d(75000),
      adjustedPATaxableIncome: d(75000),
      taxLiability: d(2303), // 75000 × 3.07% = 2302.50, rounded
      stateWithholding: d(3000),
      totalEstimatedPaymentsAndCredits: d(3000),
      totalPaymentsAndCredits: d(3000),
      netOverpayment: d(697), // 3000 - 2303
    }),
  },
  // Minimal federal fields required by TaxReturnResult type
  agi: ZERO,
  totalIncome: ZERO,
  deductionUsed: "standard",
  standardDeduction: ZERO,
  taxableIncome: ZERO,
  taxBeforeCredits: ZERO,
  totalCredits: ZERO,
  totalTax: ZERO,
  totalPayments: ZERO,
  federalWithholding: ZERO,
  amountOwed: ZERO,
  refundDue: ZERO,
  effectiveRate: ZERO,
  marginalRate: ZERO,
  allLines: [],
} as unknown as TaxReturnResult;

function makeCalculatedPA40PacketResult(
  input: TaxYearInput,
  overrides: PAOrchestratorOverrides = {},
): TaxReturnResult {
  return {
    taxYear: input.taxpayer.taxYear,
    stateReturns: {
      pennsylvania: calculatePAReturn(input, overrides),
    },
    allLines: [],
  } as unknown as TaxReturnResult;
}

function makeResidentPacketInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Jordan",
        lastName: "Northwind",
        ssn: "111-22-3333",
        dateOfBirth: "1985-01-01",
      },
      address: {
        street: "123 Main St",
        city: "Philadelphia",
        state: "PA",
        zip: "19103",
      },
      dependents: [],
    },
    w2s: [
      {
        employer: { name: "Northwind Labs", ein: "12-3456789" },
        wages: "75000",
        federalWithheld: "8200",
        stateWages: "75000",
        stateTaxWithheld: "2303",
        state: "PA",
      },
    ],
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

/** MFJ PA filer with business loss and multiple income classes */
const paMFJFiler: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Robert",
      lastName: "Jones",
      ssn: "444-55-6666",
      dateOfBirth: "1978-03-20",
      occupation: "Engineer",
    },
    spouse: {
      firstName: "Sarah",
      lastName: "Jones",
      ssn: "777-88-9999",
      dateOfBirth: "1980-11-10",
      occupation: "Teacher",
    },
    address: {
      street: "456 Oak Ave",
      apt: "Suite 2A",
      city: "Pittsburgh",
      state: "PA",
      zip: "15213",
    },
    dependents: [
      { firstName: "Emma", lastName: "Jones", ssn: "222-33-4444", dateOfBirth: "2015-07-01", relationship: "daughter" },
      { firstName: "Jack", lastName: "Jones", ssn: "333-44-5555", dateOfBirth: "2018-09-15", relationship: "son" },
    ],
  },
  w2s: [
    {
      employer: { name: "Steel Corp", ein: "11-2233445" },
      wages: "95000",
      federalWithheld: "14250",
      socialSecurityWages: "95000",
      socialSecurityWithheld: "5890",
      medicareWages: "95000",
      medicareWithheld: "1377.50",
      stateTaxWithheld: "4000",
      stateWages: "95000",
      localTaxWithheld: "0",
      state: "PA",
    },
    {
      employer: { name: "School District", ein: "22-3344556" },
      wages: "55000",
      federalWithheld: "8250",
      socialSecurityWages: "55000",
      socialSecurityWithheld: "3410",
      medicareWages: "55000",
      medicareWithheld: "797.50",
      stateTaxWithheld: "2200",
      stateWages: "55000",
      localTaxWithheld: "0",
      state: "PA",
    },
  ],
  form1099Int: [],
  form1099Div: [],
};

const paMFJResult: TaxReturnResult = {
  taxYear: 2025,
  stateReturns: {
    pennsylvania: makePAOrchestratorResult(
      {
        compensation: d(150000),
        netCompensation: d(150000),
        interest: d(2500),
        dividends: d(1800),
        netBusinessIncome: d(-5000), // Loss
        netGainOrLoss: d(12000),
        netRentalIncome: d(-3000), // Loss
        totalPATaxableIncome: d(166300), // Only positive classes sum
        otherDeductions: d(1000),
        adjustedPATaxableIncome: d(165300),
        taxLiability: d(5075), // 165300 × 3.07% = 5074.71, rounded
        stateWithholding: d(6200),
        totalEstimatedPaymentsAndCredits: d(6200),
        totalPaymentsAndCredits: d(6200),
        netOverpayment: d(1125), // 6200 - 5075
      },
      // Schedule SP — no forgiveness for high-income filer
      { taxForgivenessCredit: ZERO },
    ),
  },
  agi: ZERO,
  totalIncome: ZERO,
  deductionUsed: "standard",
  standardDeduction: ZERO,
  taxableIncome: ZERO,
  taxBeforeCredits: ZERO,
  totalCredits: ZERO,
  totalTax: ZERO,
  totalPayments: ZERO,
  federalWithholding: ZERO,
  amountOwed: ZERO,
  refundDue: ZERO,
  effectiveRate: ZERO,
  marginalRate: ZERO,
  allLines: [],
} as unknown as TaxReturnResult;

// ─── Tests ───────────────────────────────────────────────────────────────

describe("fillPA40 — Single filer with W-2 income", () => {
  let doc: PDFDocument;

  it("fills the PA-40 PDF without errors", async () => {
    doc = await fillPA40(paSingleFiler, paSingleResult, BLANK_PDF);
    expect(doc).toBeDefined();
  });

  it("fills taxpayer personal information in all caps", async () => {
    doc = await fillPA40(paSingleFiler, paSingleResult, BLANK_PDF);
    const F = PA_40_FIELDS;

    expect(getFieldText(doc, F.primarySSN)).toBe("111223333");
    expect(getFieldText(doc, F.primaryFirstName)).toBe("JOHN");
    expect(getFieldText(doc, F.primaryLastName)).toBe("SMITH");
    expect(getFieldText(doc, F.addressLine1)).toBe("123 MAIN STREET");
    expect(getFieldText(doc, F.city)).toBe("PHILADELPHIA");
    expect(getFieldText(doc, F.state)).toBe("PA");
    expect(getFieldText(doc, F.zip)).toBe("19103");
    expect(getFieldText(doc, F.yourOccupation)).toBe("Accountant");
  });

  it("fills income lines correctly", async () => {
    doc = await fillPA40(paSingleFiler, paSingleResult, BLANK_PDF);
    const F = PA_40_FIELDS;

    expect(getFieldText(doc, F.line1a)).toBe("75000");
    expect(getFieldText(doc, F.line1c)).toBe("75000");
    expect(getFieldText(doc, F.line9)).toBe("75000");
    expect(getFieldText(doc, F.line11)).toBe("75000");
  });

  it("fills tax and payment lines correctly", async () => {
    doc = await fillPA40(paSingleFiler, paSingleResult, BLANK_PDF);
    const F = PA_40_FIELDS;

    expect(getFieldText(doc, F.line12)).toBe("2303");
    expect(getFieldText(doc, F.line13)).toBe("3000");
    expect(getFieldText(doc, F.line18)).toBe("3000");
    expect(getFieldText(doc, F.line24)).toBe("3000");
    expect(getFieldText(doc, F.line29)).toBe("697");
    expect(getFieldText(doc, F.line30)).toBe("697"); // Refund = overpayment
  });

  it("leaves unused income lines empty", async () => {
    doc = await fillPA40(paSingleFiler, paSingleResult, BLANK_PDF);
    const F = PA_40_FIELDS;

    // Zero-value fields should be empty (formatCurrency returns "" for zero)
    expect(getFieldText(doc, F.line2)).toBeUndefined(); // No interest
    expect(getFieldText(doc, F.line3)).toBeUndefined(); // No dividends
    expect(getFieldText(doc, F.line4)).toBeUndefined(); // No business income
    expect(getFieldText(doc, F.line7)).toBeUndefined(); // No estate/trust
    expect(getFieldText(doc, F.line8)).toBeUndefined(); // No gambling
  });

  it("does not check loss boxes for zero values", async () => {
    doc = await fillPA40(paSingleFiler, paSingleResult, BLANK_PDF);
    const F = PA_40_FIELDS;

    expect(isChecked(doc, F.line4Loss)).toBe(false);
    expect(isChecked(doc, F.line5Loss)).toBe(false);
    expect(isChecked(doc, F.line6Loss)).toBe(false);
  });

  it("does not check Tax Forgiveness checkbox for non-eligible filer", async () => {
    doc = await fillPA40(paSingleFiler, paSingleResult, BLANK_PDF);
    expect(isChecked(doc, PA_40_FIELDS.taxForgiveness)).toBe(false);
  });

  it("fills page 2 header names", async () => {
    doc = await fillPA40(paSingleFiler, paSingleResult, BLANK_PDF);
    expect(getFieldText(doc, PA_40_FIELDS.page2Names)).toBe("SMITH, JOHN");
  });
});

describe("fillPA40 — MFJ filer with multiple income classes and losses", () => {
  let doc: PDFDocument;

  it("fills the PA-40 PDF without errors", async () => {
    doc = await fillPA40(paMFJFiler, paMFJResult, BLANK_PDF);
    expect(doc).toBeDefined();
  });

  it("fills spouse information", async () => {
    doc = await fillPA40(paMFJFiler, paMFJResult, BLANK_PDF);
    const F = PA_40_FIELDS;

    expect(getFieldText(doc, F.spouseSSN)).toBe("777889999");
    expect(getFieldText(doc, F.spouseFirstName)).toBe("SARAH");
    // Spouse has same last name — should not fill separate last name field
    expect(getFieldText(doc, F.spouseLastName)).toBeUndefined();
    expect(getFieldText(doc, F.spouseOccupation)).toBe("Teacher");
  });

  it("fills address with apt/suite", async () => {
    doc = await fillPA40(paMFJFiler, paMFJResult, BLANK_PDF);
    const F = PA_40_FIELDS;

    expect(getFieldText(doc, F.addressLine1)).toBe("456 OAK AVE");
    expect(getFieldText(doc, F.addressLine2)).toBe("SUITE 2A");
    expect(getFieldText(doc, F.city)).toBe("PITTSBURGH");
  });

  it("fills dependents count", async () => {
    doc = await fillPA40(paMFJFiler, paMFJResult, BLANK_PDF);
    expect(getFieldText(doc, PA_40_FIELDS.dependents)).toBe("2");
  });

  it("checks Filing Status checkbox for MFJ", async () => {
    doc = await fillPA40(paMFJFiler, paMFJResult, BLANK_PDF);
    expect(isChecked(doc, PA_40_FIELDS.filingStatus)).toBe(true);
  });

  it("fills all income classes including losses with loss checkboxes", async () => {
    doc = await fillPA40(paMFJFiler, paMFJResult, BLANK_PDF);
    const F = PA_40_FIELDS;

    expect(getFieldText(doc, F.line1a)).toBe("150000");
    expect(getFieldText(doc, F.line1c)).toBe("150000");
    expect(getFieldText(doc, F.line2)).toBe("2500");
    expect(getFieldText(doc, F.line3)).toBe("1800");

    // Business income is a loss — shows absolute value, loss checkbox checked
    expect(getFieldText(doc, F.line4)).toBe("5000");
    expect(isChecked(doc, F.line4Loss)).toBe(true);

    // Net gain is positive — no loss checkbox
    expect(getFieldText(doc, F.line5)).toBe("12000");
    expect(isChecked(doc, F.line5Loss)).toBe(false);

    // Rental income is a loss
    expect(getFieldText(doc, F.line6)).toBe("3000");
    expect(isChecked(doc, F.line6Loss)).toBe(true);

    // Total: only positive classes (compensation + interest + dividends + gains = 166300)
    expect(getFieldText(doc, F.line9)).toBe("166300");
    expect(getFieldText(doc, F.line10)).toBe("1000");
    expect(getFieldText(doc, F.line11)).toBe("165300");
  });

  it("fills tax and settlement correctly for MFJ", async () => {
    doc = await fillPA40(paMFJFiler, paMFJResult, BLANK_PDF);
    const F = PA_40_FIELDS;

    expect(getFieldText(doc, F.line12)).toBe("5075");
    expect(getFieldText(doc, F.line13)).toBe("6200");
    expect(getFieldText(doc, F.line29)).toBe("1125");
  });

  it("fills page 2 header with both names for MFJ", async () => {
    doc = await fillPA40(paMFJFiler, paMFJResult, BLANK_PDF);
    expect(getFieldText(doc, PA_40_FIELDS.page2Names)).toBe("JONES, ROBERT & SARAH");
  });
});

describe("fillPA40 — Tax Forgiveness and credits", () => {
  const forgivenessResult: TaxReturnResult = {
    taxYear: 2025,
    stateReturns: {
      pennsylvania: makePAOrchestratorResult(
        {
          compensation: d(15000),
          netCompensation: d(15000),
          totalPATaxableIncome: d(15000),
          adjustedPATaxableIncome: d(15000),
          taxLiability: d(461),
          taxForgivenessCredit: d(461), // Full forgiveness
          stateWithholding: d(500),
          totalEstimatedPaymentsAndCredits: d(500),
          totalPaymentsAndCredits: d(961),
          taxForgivenessEligibilityIncome: d(15000),
          netOverpayment: d(500), // All withholding refunded
        },
        {
          taxForgivenessCredit: d(461),
          forgivenessPercentage: d(100),
          eligibilityIncome: d(15000),
        },
      ),
    },
    agi: ZERO,
    totalIncome: ZERO,
    deductionUsed: "standard",
    standardDeduction: ZERO,
    taxableIncome: ZERO,
    taxBeforeCredits: ZERO,
    totalCredits: ZERO,
    totalTax: ZERO,
    totalPayments: ZERO,
    federalWithholding: ZERO,
    amountOwed: ZERO,
    refundDue: ZERO,
    effectiveRate: ZERO,
    marginalRate: ZERO,
    allLines: [],
  } as unknown as TaxReturnResult;

  it("checks Tax Forgiveness checkbox when SP credit is active", async () => {
    const doc = await fillPA40(paSingleFiler, forgivenessResult, BLANK_PDF);
    expect(isChecked(doc, PA_40_FIELDS.taxForgiveness)).toBe(true);
  });

  it("fills forgiveness credit and eligibility income", async () => {
    const doc = await fillPA40(paSingleFiler, forgivenessResult, BLANK_PDF);
    const F = PA_40_FIELDS;

    expect(getFieldText(doc, F.line20)).toBe("15000");
    expect(getFieldText(doc, F.line21)).toBe("461");
  });
});

describe("fillPA40 — resident packet inclusion for supported PA line items", () => {
  it("fillPA40 includes Pennsylvania use tax on Line 25 when the resident packet uses the supported worksheet", async () => {
    const input = makeResidentPacketInput({
      taxpayer: {
        ...makeResidentPacketInput().taxpayer,
        address: {
          ...makeResidentPacketInput().taxpayer.address,
          city: "Pittsburgh",
        },
      },
      w2s: [{
        ...makeResidentPacketInput().w2s[0],
        wages: "50000",
        federalWithheld: "6000",
        stateWages: "50000",
        stateTaxWithheld: "1535",
      }],
    });
    const result = makeCalculatedPA40PacketResult(input, {
      useTaxWorksheet: {
        locality: "remainder_of_pa",
        taxableItemPurchases: d(500),
        taxableServicePurchases: ZERO,
        electEstimatedTable: false,
        salesTaxAlreadyPaid: ZERO,
      },
    });

    const doc = await fillPA40(input, result, BLANK_PDF);

    expect(getFieldText(doc, PA_40_FIELDS.line25)).toBe("30");
  });

  it("fillPA40 includes Pennsylvania Schedule OC credits on Line 23 when supported detailed credits survive the PA-40 cap", async () => {
    const input = makeResidentPacketInput({
      w2s: [{
        ...makeResidentPacketInput().w2s[0],
        wages: "100000",
        federalWithheld: "15000",
        stateWages: "100000",
        stateTaxWithheld: "3070",
      }],
    });
    const result = makeCalculatedPA40PacketResult(input, {
      scheduleOC: {
        pteCredits: [{
          entityName: "Alpha Partners",
          entityEIN: "11-1111111",
          allocablePAIncome: d(50000),
          pteTaxPaid: d(1535),
        }],
      },
    });

    const doc = await fillPA40(input, result, BLANK_PDF);

    expect(getFieldText(doc, PA_40_FIELDS.line23)).toBe("1535");
  });

  it("fillPA40 includes Pennsylvania Schedule RK-1 and NRK-1 statement amounts on the supported PA-40 lines", async () => {
    const input = makeResidentPacketInput({
      w2s: [],
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
    });
    const result = makeCalculatedPA40PacketResult(input);

    const doc = await fillPA40(input, result, BLANK_PDF);

    expect(getFieldText(doc, PA_40_FIELDS.line2)).toBe("120");
    expect(getFieldText(doc, PA_40_FIELDS.line3)).toBe("45");
    expect(getFieldText(doc, PA_40_FIELDS.line4)).toBe("20000");
    expect(getFieldText(doc, PA_40_FIELDS.line17)).toBe("307");
  });

  it("fillPA40 carries the Working Pennsylvanians Tax Credit through PA-40 total payments and overpayment", async () => {
    const input = makeResidentPacketInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "head_of_household",
        primary: {
          firstName: "Taylor",
          lastName: "Worker",
          ssn: "000-00-1111",
          dateOfBirth: "1990-01-01",
        },
        address: {
          street: "100 Main St",
          city: "Philadelphia",
          state: "PA",
          zip: "19101",
        },
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
      w2s: [
        {
          employer: { name: "Retail Co", ein: "12-3456789" },
          wages: "18000",
          federalWithheld: "500",
          stateWages: "18000",
          stateTaxWithheld: "553",
          state: "PA",
        },
      ],
    });
    const result = makeCalculatedPA40PacketResult(input);
    const paResult = result.stateReturns?.pennsylvania as PAOrchestratorResult;

    expect(paResult.workingPennsylvaniansTaxCredit?.credit.gt(0)).toBe(true);

    const doc = await fillPA40(input, result, BLANK_PDF);

    expect(getFieldText(doc, PA_40_FIELDS.line24)).toBe(paResult.pa40.totalPaymentsAndCredits.toString());
    expect(getFieldText(doc, PA_40_FIELDS.line29)).toBe(paResult.pa40.netOverpayment.toString());
  });
});

describe("fillPA40 — error handling", () => {
  it("throws when no PA result is available", async () => {
    const noStateResult = {
      taxYear: 2025,
      agi: ZERO,
      totalIncome: ZERO,
      allLines: [],
    } as unknown as TaxReturnResult;

    await expect(
      fillPA40(paSingleFiler, noStateResult, BLANK_PDF),
    ).rejects.toThrow("No Pennsylvania state return result available");
  });
});
