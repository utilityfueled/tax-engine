/**
 * Tests for New Jersey NJ-1040 PDF filling.
 * Verifies that engine results are correctly mapped to PDF digit-box fields.
 */

import { describe, it, expect } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import Decimal from "decimal.js";
import { fillNJ1040, NJ_1040_FIELDS } from "@/pdf/fill-nj-1040.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { NJ1040Result } from "@/engine/state/nj-1040.js";

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

/**
 * Read the digits from a sequence of single-digit fields.
 * Returns the concatenated non-empty digits (trimmed of leading empties).
 */
function readDigitFields(doc: PDFDocument, fields: readonly string[]): string {
  const digits: string[] = [];
  for (const f of fields) {
    const val = getFieldText(doc, f);
    digits.push(val ?? "");
  }
  // Trim leading empty entries, join remaining
  const firstNonEmpty = digits.findIndex((d) => d !== "");
  if (firstNonEmpty === -1) return "";
  return digits.slice(firstNonEmpty).join("");
}

const BLANK_PDF = "forms/blank/2025/nj-1040.pdf";

// ─── Minimal NJ1040Result factory ──────────────────────────────────────────

function makeNJ1040Result(overrides: Partial<NJ1040Result> = {}): NJ1040Result {
  return {
    filingStatus: "single",
    taxYear: 2025,
    njGrossIncome: ZERO,
    totalExemptions: ZERO,
    collegeAffordabilityDeduction: ZERO,
    propertyTaxDeduction: ZERO,
    medicalDeduction: ZERO,
    qualifiedConservationContribution: ZERO,
    healthEnterpriseZoneDeduction: ZERO,
    alternativeBusinessCalculationAdjustment: ZERO,
    organDonationDeduction: ZERO,
    njTaxableIncome: ZERO,
    njTax: ZERO,
    useTax: ZERO,
    sharedResponsibilityPayment: ZERO,
    totalTax: ZERO,
    line52UnderpaymentInterest: ZERO,
    line54TotalTaxDue: ZERO,
    otherJurisdictionCredit: ZERO,
    shelteredWorkshopTaxCredit: ZERO,
    goldStarFamilyCounselingCredit: ZERO,
    organDonorEmployerCredit: ZERO,
    supplementalNonrefundableCredits: ZERO,
    propertyTaxCredit: ZERO,
    taxAfterNonrefundableCredits: ZERO,
    njEITC: ZERO,
    njChildTaxCredit: ZERO,
    njDependentCareCredit: ZERO,
    woundedWarriorCredit: ZERO,
    totalRefundableCredits: ZERO,
    passThroughBusinessAlternativeIncomeTaxCredit: ZERO,
    excessUIWFSWFCredit: ZERO,
    excessDICredit: ZERO,
    excessFLICredit: ZERO,
    excessPayrollCredit: ZERO,
    totalPayments: ZERO,
    line67AmountOwed: ZERO,
    line68Overpayment: ZERO,
    creditToNextYear: ZERO,
    totalCharitableContributions: ZERO,
    line78TotalAdjustments: ZERO,
    underpaymentPenalty: ZERO,
    balanceDue: ZERO,
    refund: ZERO,
    filingRequirement: {
      isRequired: true,
      reason: "gross income exceeds filing threshold",
      grossIncome: ZERO,
      filingThreshold: ZERO,
    },
    lines: [],
    ...overrides,
  };
}

/** Minimal TaxYearInput for NJ tests. */
const njSingleFiler: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "John",
      lastName: "Smith",
      ssn: "123-45-6789",
      dateOfBirth: "1985-06-15",
      occupation: "Engineer",
    },
    address: {
      street: "100 Main St",
      city: "Newark",
      state: "NJ",
      zip: "07102",
    },
    dependents: [],
  },
  w2s: [{
    employer: { name: "Acme Corp", ein: "12-3456789" },
    wages: "95000",
    federalWithheld: "14000",
    socialSecurityWages: "95000",
    socialSecurityWithheld: "5890",
    medicareWages: "95000",
    medicareWithheld: "1377.50",
    stateTaxWithheld: "4500",
    stateWages: "95000",
    localTaxWithheld: "0",
    state: "NJ",
  }],
  form1099Int: [],
  form1099Div: [],
  form1099Nec: [],
  form1099Misc: [],
  form1099G: [],
  form1099R: [],
  scheduleK1: [],
  formW2G: [],
  form1099B: [],
  form1099K: [],
};

function makeResult(njOverrides: Partial<NJ1040Result> = {}): TaxReturnResult {
  return {
    filingStatus: "single",
    taxYear: 2025,
    totalIncome: d(95000),
    adjustedGrossIncome: d(95000),
    deduction: d(15000),
    deductionUsed: "standard",
    taxableIncome: d(80000),
    taxBeforeCredits: d(12000),
    totalCredits: ZERO,
    totalTax: d(12000),
    totalPayments: d(14000),
    totalRefundableCredits: ZERO,
    amountOwed: ZERO,
    overpayment: d(2000),
    refund: d(2000),
    effectiveTaxRate: d(0.126),
    marginalTaxRate: d(0.22),
    earnedIncomeCredit: ZERO,
    capitalGainLoss: ZERO,
    allLines: [],
    stateReturns: {
      newJersey: makeNJ1040Result(njOverrides),
    },
  } as TaxReturnResult;
}

describe("NJ-1040 PDF filling", () => {
  it("fills SSN digits correctly", async () => {
    const result = makeResult({ njGrossIncome: d(95000) });
    const doc = await fillNJ1040(njSingleFiler, result, BLANK_PDF);

    // Primary SSN: 123-45-6789
    const F = NJ_1040_FIELDS;
    expect(getFieldText(doc, F.primarySSN[0])).toBe("1");
    expect(getFieldText(doc, F.primarySSN[1])).toBe("2");
    expect(getFieldText(doc, F.primarySSN[2])).toBe("3");
    expect(getFieldText(doc, F.primarySSN[3])).toBe("4");
    expect(getFieldText(doc, F.primarySSN[4])).toBe("5");
    expect(getFieldText(doc, F.primarySSN[5])).toBe("6");
    expect(getFieldText(doc, F.primarySSN[6])).toBe("7");
    expect(getFieldText(doc, F.primarySSN[7])).toBe("8");
    expect(getFieldText(doc, F.primarySSN[8])).toBe("9");
  });

  it("fills name field with last name first", async () => {
    const result = makeResult();
    const doc = await fillNJ1040(njSingleFiler, result, BLANK_PDF);
    const F = NJ_1040_FIELDS;
    const name = getFieldText(doc, F.primaryName);
    expect(name).toContain("Smith");
    expect(name).toContain("John");
  });

  it("fills NJ gross income digit fields", async () => {
    const result = makeResult({ njGrossIncome: d(95000) });
    const doc = await fillNJ1040(njSingleFiler, result, BLANK_PDF);
    const F = NJ_1040_FIELDS;

    // Line 27 (NJ Gross Income) — 6-digit field, value 95000
    const grossIncome = readDigitFields(doc, F.line27GrossIncome);
    expect(grossIncome).toBe("95000");
  });

  it("fills taxable income and tax fields", async () => {
    const result = makeResult({
      njGrossIncome: d(95000),
      njTaxableIncome: d(82500),
      njTax: d(3234),
    });
    const doc = await fillNJ1040(njSingleFiler, result, BLANK_PDF);
    const F = NJ_1040_FIELDS;

    expect(readDigitFields(doc, F.line29TaxableIncome)).toBe("82500");
    expect(readDigitFields(doc, F.line37NJTax)).toBe("3234");
  });

  it("fills deduction digit fields", async () => {
    const result = makeResult({
      propertyTaxDeduction: d(10000),
      medicalDeduction: d(2500),
    });
    const doc = await fillNJ1040(njSingleFiler, result, BLANK_PDF);
    const F = NJ_1040_FIELDS;

    expect(readDigitFields(doc, F.line30PropertyTaxDeduction)).toBe("10000");
    expect(readDigitFields(doc, F.line31MedicalDeduction)).toBe("2500");
  });

  it("fills credit and payment digit fields", async () => {
    const result = makeResult({
      totalTax: d(3234),
      njEITC: d(500),
      taxAfterNonrefundableCredits: d(3234),
      totalPayments: d(4500),
    });
    const doc = await fillNJ1040(njSingleFiler, result, BLANK_PDF);
    const F = NJ_1040_FIELDS;

    expect(readDigitFields(doc, F.line43TotalTax)).toBe("3234");
    expect(readDigitFields(doc, F.line48EITC)).toBe("500");
    expect(readDigitFields(doc, F.line47TaxAfterCredits)).toBe("3234");
    expect(readDigitFields(doc, F.line64TotalPayments)).toBe("4500");
  });

  it("fills balance due / refund on page 4", async () => {
    const result = makeResult({
      line68Overpayment: d(1266),
      refund: d(1266),
    });
    const doc = await fillNJ1040(njSingleFiler, result, BLANK_PDF);
    const F = NJ_1040_FIELDS;

    expect(readDigitFields(doc, F.line68Overpayment)).toBe("1266");
    expect(readDigitFields(doc, F.line76BalanceDueOrRefund)).toBe("1266");
  });

  it("leaves zero-value fields empty", async () => {
    const result = makeResult(); // All zeros
    const doc = await fillNJ1040(njSingleFiler, result, BLANK_PDF);
    const F = NJ_1040_FIELDS;

    // Zero values should not fill any digit fields
    expect(readDigitFields(doc, F.line27GrossIncome)).toBe("");
    expect(readDigitFields(doc, F.line48EITC)).toBe("");
    expect(readDigitFields(doc, F.line76BalanceDueOrRefund)).toBe("");
  });

  it("right-aligns digits in fields wider than the value", async () => {
    // A 3-digit value in a 6-digit field should fill the last 3 positions
    const result = makeResult({ njGrossIncome: d(500) });
    const doc = await fillNJ1040(njSingleFiler, result, BLANK_PDF);
    const F = NJ_1040_FIELDS;

    // Line 27: 6-digit field, value 500
    // First 3 fields should be empty, last 3 should be "5", "0", "0"
    expect(getFieldText(doc, F.line27GrossIncome[0])).toBeUndefined(); // empty
    expect(getFieldText(doc, F.line27GrossIncome[1])).toBeUndefined(); // empty
    expect(getFieldText(doc, F.line27GrossIncome[2])).toBeUndefined(); // empty
    expect(getFieldText(doc, F.line27GrossIncome[3])).toBe("5");
    expect(getFieldText(doc, F.line27GrossIncome[4])).toBe("0");
    expect(getFieldText(doc, F.line27GrossIncome[5])).toBe("0");
  });

  it("fills exemption total on page 1", async () => {
    const result = makeResult({ totalExemptions: d(1000) });
    const doc = await fillNJ1040(njSingleFiler, result, BLANK_PDF);
    const F = NJ_1040_FIELDS;

    expect(readDigitFields(doc, F.exemptionTotal)).toBe("1000");
  });
});
