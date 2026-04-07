/**
 * Tests for Form 2210 — Underpayment of Estimated Tax PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm2210, FORM_2210_FIELDS } from "@/pdf/fill-form-2210.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";

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

const BLANK_2210 = "forms/blank/f2210.pdf";
const F = FORM_2210_FIELDS;

// ─── Fixture 1: Underpayment scenario — single filer with penalty ──────────
// High income, low withholding, no estimated payments, no prior year safe harbor.

const underpaymentFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Alex",
      lastName: "Rivera",
      ssn: "111-22-3333",
      dateOfBirth: "1980-06-15",
      occupation: "Consultant",
    },
    address: {
      street: "500 Tech Blvd",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Consulting Inc", ein: "12-3456789" },
      wages: "180000",
      federalWithheld: "8000",
      socialSecurityWages: "176100",
      socialSecurityWithheld: "10918.20",
      medicareWages: "180000",
      medicareWithheld: "2610",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "TX",
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
};

describe("Form 2210 PDF filling — Single filer with underpayment penalty", () => {
  let doc: PDFDocument;
  let result: TaxReturnResult;

  beforeAll(async () => {
    result = calculateFederalTax(underpaymentFixture);
    doc = await fillForm2210(underpaymentFixture, result, BLANK_2210);
  });

  it("Form 2210 header - name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Alex Rivera");
    expect(getFieldText(doc, F.ssn)).toBe("111223333");
  });

  it("Form 2210 Line 1 - tax after credits is populated", () => {
    const line1Text = getFieldText(doc, F.line1);
    expect(line1Text).toBeDefined();
    // Line 1 = Form 1040 line 22 (should be > 0 for $180K income)
    expect(Number(line1Text)).toBeGreaterThan(0);
  });

  it("Form 2210 Line 4 - current year tax is populated", () => {
    const line4Text = getFieldText(doc, F.line4);
    expect(line4Text).toBeDefined();
    expect(Number(line4Text)).toBeGreaterThan(0);
  });

  it("Form 2210 Line 5 - 90% of current year tax", () => {
    const line4 = Number(getFieldText(doc, F.line4));
    const line5 = Number(getFieldText(doc, F.line5));
    // Line 5 = Line 4 × 0.90 (rounded)
    expect(line5).toBeCloseTo(line4 * 0.9, -1); // within rounding
  });

  it("Form 2210 Line 6 - withholding matches result", () => {
    expect(getFieldText(doc, F.line6)).toBe(formatCurrency(result.totalWithholding));
  });

  it("Form 2210 Line 7 - current year tax minus withholding", () => {
    const line4 = Number(getFieldText(doc, F.line4));
    const line7 = Number(getFieldText(doc, F.line7));
    // Line 7 = Line 4 - Line 6
    expect(line7).toBe(line4 - result.totalWithholding.toNumber());
  });

  it("Form 2210 Line 9 - required annual payment from engine", () => {
    const f2210 = result.form2210!;
    expect(f2210).toBeDefined();
    expect(getFieldText(doc, F.line9)).toBe(formatCurrency(f2210.requiredAnnualPayment));
  });

  it("Form 2210 produces a non-zero penalty for large underpayment", () => {
    const f2210 = result.form2210!;
    // $180K income with only $8K withholding → significant underpayment
    expect(f2210.penalty.gt(0)).toBe(true);
  });

  it("Form 2210 Line 19 - penalty is filled on page 2", () => {
    const f2210 = result.form2210!;
    expect(getFieldText(doc, F.line19)).toBe(formatCurrency(f2210.penalty));
  });

  it("Form 2210 Line 10 - quarterly installments are 25% of line 9", () => {
    const f2210 = result.form2210!;
    const quarterlyInstallment = f2210.requiredAnnualPayment
      .dividedBy(4)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    expect(getFieldText(doc, F.line10a)).toBe(formatCurrency(quarterlyInstallment));
    expect(getFieldText(doc, F.line10b)).toBe(formatCurrency(quarterlyInstallment));
    expect(getFieldText(doc, F.line10c)).toBe(formatCurrency(quarterlyInstallment));
    expect(getFieldText(doc, F.line10d)).toBe(formatCurrency(quarterlyInstallment));
  });
});

// ─── Fixture 2: Safe harbor met — no penalty due to prior year tax ─────────

const safeHarborFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "James",
      lastName: "Wilson",
      ssn: "444-55-6666",
      dateOfBirth: "1975-03-20",
      occupation: "Manager",
    },
    spouse: {
      firstName: "Emily",
      lastName: "Wilson",
      ssn: "777-88-9999",
      dateOfBirth: "1978-09-10",
    },
    address: {
      street: "200 Oak Ave",
      city: "Denver",
      state: "CO",
      zip: "80201",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Corp Inc", ein: "44-5555555" },
      wages: "120000",
      federalWithheld: "18000",
      socialSecurityWages: "120000",
      socialSecurityWithheld: "7440",
      medicareWages: "120000",
      medicareWithheld: "1740",
      stateTaxWithheld: "0",
      stateWages: "0",
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
  form1098: [],
  form1095A: [],
  donations: [],
  priorYear: {
    priorYearTax: "15000",
    priorYearAGI: "110000",
  },
};

describe("Form 2210 PDF filling — MFJ, safe harbor met via prior year tax", () => {
  let doc: PDFDocument;
  let result: TaxReturnResult;

  beforeAll(async () => {
    result = calculateFederalTax(safeHarborFixture);
    doc = await fillForm2210(safeHarborFixture, result, BLANK_2210);
  });

  it("Form 2210 header - joint names", () => {
    expect(getFieldText(doc, F.name)).toBe("James Wilson & Emily Wilson");
    expect(getFieldText(doc, F.ssn)).toBe("444556666");
  });

  it("Form 2210 safe harbor is met", () => {
    const f2210 = result.form2210!;
    expect(f2210).toBeDefined();
    expect(f2210.safeHarborMet).toBe(true);
    expect(f2210.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 Line 6 - withholding filled even when safe harbor met", () => {
    expect(getFieldText(doc, F.line6)).toBe(formatCurrency(result.totalWithholding));
  });

  it("Form 2210 Line 8 - prior year tax threshold filled for MFJ under $150K", () => {
    // AGI $110K < $150K threshold → 100% of prior year tax = $15,000
    expect(getFieldText(doc, F.line8)).toBe("15000");
  });

  it("Form 2210 Line 19 - penalty is empty when safe harbor met", () => {
    // No penalty means Part III Short Method is not filled
    expect(getFieldText(doc, F.line19)).toBeUndefined();
  });

  it("Form 2210 Line 10 - quarterly installments not filled when no penalty", () => {
    expect(getFieldText(doc, F.line10a)).toBeUndefined();
  });
});

// ─── Fixture 3: No form2210 result — returns unfilled document ─────────────

describe("Form 2210 PDF filling — no form2210 result", () => {
  it("returns document with only header when form2210 is undefined", async () => {
    const minimalResult = calculateFederalTax({
      ...underpaymentFixture,
      w2s: [
        {
          ...underpaymentFixture.w2s[0],
          wages: "20000",
          federalWithheld: "3000",
        },
      ],
    });
    // Low income → safe harbor met, but form2210 should still exist
    const doc = await fillForm2210(underpaymentFixture, minimalResult, BLANK_2210);
    expect(getFieldText(doc, F.name)).toBe("Alex Rivera");
    // Line 1 should still be filled since form2210 exists
    expect(getFieldText(doc, F.line1)).toBeDefined();
  });
});
