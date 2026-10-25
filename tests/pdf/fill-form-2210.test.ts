/**
 * Tests for Form 2210 — Underpayment of Estimated Tax PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import * as pdfUtils from "@/pdf/pdf-utils.js";
import { calculateForm2210 } from "@/engine/forms/form-2210.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
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

const BLANK_2210 = "forms/blank/2025/f2210.pdf";
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
    const line4 = new Decimal(getFieldText(doc, F.line4) ?? "NaN");
    expect(getFieldText(doc, F.line5)).toBe(line4.times("0.9").toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed());
  });

  it("Form 2210 Line 6 - withholding matches result", () => {
    expect(getFieldText(doc, F.line6)).toBe(formatCurrency(result.totalWithholding));
  });

  it("Form 2210 Line 7 - current year tax minus withholding", () => {
    const line4 = new Decimal(getFieldText(doc, F.line4) ?? "NaN");
    expect(getFieldText(doc, F.line7)).toBe(line4.minus(result.totalWithholding).toFixed());
  });

  it("Form 2210 Line 9 - required annual payment from engine", () => {
    const f2210 = result.form2210;
    if (!f2210) throw new Error("Missing Form2210 fixture result");
    expect(f2210).toBeDefined();
    expect(getFieldText(doc, F.line9)).toBe(formatCurrency(f2210.requiredAnnualPayment));
  });

  it("Form 2210 produces a non-zero penalty for large underpayment", () => {
    const f2210 = result.form2210;
    if (!f2210) throw new Error("Missing Form2210 fixture result");
    // $180K income with only $8K withholding → significant underpayment
    expect(f2210.penalty.gt(0)).toBe(true);
  });

  it("Form 2210 Line 19 - penalty is filled on page 2", () => {
    const f2210 = result.form2210;
    if (!f2210) throw new Error("Missing Form2210 fixture result");
    expect(getFieldText(doc, F.line19)).toBe(formatCurrency(f2210.penalty));
  });

  it("Form 2210 Line 10 - quarterly installments are 25% of line 9", () => {
    const f2210 = result.form2210;
    if (!f2210) throw new Error("Missing Form2210 fixture result");
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
      federalWithheld: "8000",
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
  form2210: {
    calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false,
    disasterReliefClaimed: false, waiverRequested: false, calculationMethod: "regular",
    withholdingMethod: "equal-installments", priorYearTaxStatus: "return-filed",
    priorYearFullYear: true, priorYearTaxComputationConfirmed: true,
    priorYearTaxForForm2210: "8000", priorYearAgiForForm2210: "110000", priorYearJointReturn: true,
  },
  priorYear: {
    priorYearTax: "8000",
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
    const f2210 = result.form2210;
    if (!f2210) throw new Error("Missing Form2210 fixture result");
    expect(f2210).toBeDefined();
    expect(f2210.safeHarborMet).toBe(true);
    expect(f2210.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 Line 6 - withholding filled even when safe harbor met", () => {
    expect(getFieldText(doc, F.line6)).toBe(formatCurrency(result.totalWithholding));
  });

  it("Form 2210 Line 8 - prior year tax threshold filled for MFJ under $150K", () => {
    // AGI $110K < $150K threshold → 100% of actual prior-year computed tax = $8,000
    expect(getFieldText(doc, F.line8)).toBe("8000");
  });

  it("Form 2210 Line 19 - known zero penalty is explicit when safe harbor met", () => {
    // The mapper distinguishes an audited zero from missing penalty evidence.
    expect(getFieldText(doc, F.line19)).toBe("0");
  });

  it("Form 2210 Line 10 - actual timely installments remain visible with zero penalty", () => {
    expect(getFieldText(doc, F.line10a)).toBe("2000");
  });
});

// ─── Fixture 3: Independently established no-penalty exception ─────────────

describe("Form 2210 PDF filling — small-tax exception", () => {
  it("retains audited tax components for an independently established small-tax exception", async () => {
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


const actualFacts = {
  calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false,
  disasterReliefClaimed: false, waiverRequested: false, calculationMethod: "regular" as const,
  withholdingMethod: "equal-installments" as const, priorYearTaxStatus: "no-return" as const,
};
function datedResult() {
  const base = calculateFederalTax(underpaymentFixture);
  return { ...base, form2210: calculateForm2210({
    taxYear: 2025, currentYearTax: new Decimal(10000), incomeTaxAfterCredits: new Decimal(10000),
    withholding: new Decimal(0), estimatedPayments: new Decimal(9000), refundableCredits: new Decimal(0),
    filingStatus: "single", facts: actualFacts,
    payments: [{ date: "2026-01-15", amount: "9000", kind: "estimated" }],
  }) };
}
const datedInput = { ...underpaymentFixture, form2210: actualFacts };
afterEach(() => vi.restoreAllMocks());

it("copies dated audit columns instead of distributing an annual estimate equally", async () => {
  const result = datedResult();
  const doc = await fillForm2210(datedInput, result, BLANK_2210);
  expect([F.line11a, F.line11b, F.line11c, F.line11d].map((id) => getFieldText(doc, id))).toEqual(["0", "0", "0", "9000"]);
  expect([F.line17a, F.line17b, F.line17c, F.line17d].map((id) => getFieldText(doc, id))).toEqual(["2250", "2250", "2250", "0"]);
  expect(getFieldText(doc, F.line19)).toBe("264");
  for (const id of [F.line12a, F.line13a, F.line14a, F.line16a, F.line16d, F.line18d]) {
    expect(getFieldText(doc, id) ?? "").toBe("");
  }
  expect(doc.getSubject()).toBe(REVIEW_PDF_NOTICE);
  const reopened = await PDFDocument.load(await doc.save());
  expect(getFieldText(reopened, F.line11d)).toBe("9000");
  expect(getFieldText(reopened, F.line19)).toBe("264");
  expect(reopened.getPageCount()).toBeGreaterThan(3);
});

it("uses the physical filing-reason checkboxes and actual prior joint-return fact", async () => {
  expect(F.boxA).toBe("topmostSubform[0].Page1[0].c1_2[0]");
  expect(F.boxD).toBe("topmostSubform[0].Page1[0].c1_5[0]");
  expect(F.boxE).toBe("topmostSubform[0].Page1[0].c1_6[0]");
  const result = datedResult();
  result.form2210 = calculateForm2210({
    taxYear: 2025, currentYearTax: new Decimal(10000), incomeTaxAfterCredits: new Decimal(10000),
    withholding: new Decimal(8000), estimatedPayments: new Decimal(0), refundableCredits: new Decimal(0), filingStatus: "single",
    payments: [], facts: { ...actualFacts, priorYearTaxStatus: "return-filed", priorYearFullYear: true,
      priorYearTaxComputationConfirmed: true, priorYearTaxForForm2210: "8000", priorYearAgiForForm2210: "100000", priorYearJointReturn: true },
  });
  expect(result.form2210.requiresForm2210).toBe(true);
  const source = { ...datedInput, form2210: { ...actualFacts, priorYearJointReturn: true } };
  const doc = await fillForm2210(source, result, BLANK_2210);
  expect(doc.getForm().getCheckBox(F.boxE).isChecked()).toBe(true);
  expect(doc.getForm().getCheckBox(F.line9No).isChecked()).toBe(true);
  expect(doc.getForm().getCheckBox(F.boxA).isChecked()).toBe(false);
  const unknown = await fillForm2210(datedInput, result, BLANK_2210);
  expect(unknown.getForm().getCheckBox(F.boxE).isChecked()).toBe(false);
});

it("checks box D only for a reconciled actual withholding election", async () => {
  const result = datedResult();
  const facts = { ...actualFacts, withholdingMethod: "actual-dates" as const,
    withholdingPayments: [{ date: "2025-01-31", amount: "9000" }] };
  result.form2210 = calculateForm2210({
    taxYear: 2025, currentYearTax: new Decimal(10000), incomeTaxAfterCredits: new Decimal(10000),
    withholding: new Decimal(9000), estimatedPayments: new Decimal(0), refundableCredits: new Decimal(0),
    filingStatus: "single", facts, payments: [],
  });
  const doc = await fillForm2210({ ...datedInput, form2210: facts }, result, BLANK_2210);
  expect(doc.getForm().getCheckBox(F.boxD).isChecked()).toBe(true);
  expect(doc.getForm().getCheckBox(F.boxC).isChecked()).toBe(false);
  await expect(fillForm2210(datedInput, result, BLANK_2210)).rejects.toThrow(/withholding election/);
});

it("rejects missing duplicate nonfinite and inconsistent audit evidence", async () => {
  const result = datedResult();
  for (const id of ["1", "2", "9", "11b", "17c", "19"]) {
    const altered = { ...result, form2210: { ...result.form2210, lines: result.form2210.lines.filter((line) => line.form !== "Form 2210" || line.line !== id) } };
    await expect(fillForm2210(datedInput, altered, BLANK_2210)).rejects.toThrow(/audit/i);
  }
  const entry = result.form2210.lines.find((line) => line.line === "19");
  if (!entry) throw new Error("missing test audit");
  await expect(fillForm2210(datedInput, { ...result, form2210: { ...result.form2210, lines: [...result.form2210.lines, entry] } }, BLANK_2210)).rejects.toThrow(/audit/i);
  for (const value of [new Decimal("NaN"), new Decimal(-1), new Decimal(100)]) {
    const altered = { ...result, form2210: { ...result.form2210, lines: result.form2210.lines.map((line) => line.line === "19" ? { ...line, value } : line) } };
    await expect(fillForm2210(datedInput, altered, BLANK_2210)).rejects.toThrow(/audit|reconcile/i);
  }
  const damagedPeriod = { ...result, form2210: { ...result.form2210, interestPeriods: result.form2210.interestPeriods.map((period, index) => index === 0 ? { ...period, days: period.days + 1 } : period) } };
  await expect(fillForm2210(datedInput, damagedPeriod, BLANK_2210)).rejects.toThrow(/dated penalty audit/);
  await expect(fillForm2210(datedInput, { ...result, form2210: undefined }, BLANK_2210)).rejects.toThrow(/calculation|audit/i);
  await expect(fillForm2210(datedInput, { ...result, form2210: { ...result.form2210, taxYear: 2026 } }, BLANK_2210)).rejects.toThrow(/year/i);
});

it("rejects missing and wrong-type mapped fields and a mismatched physical year", async () => {
  const realLoader = pdfUtils.loadReviewTemplate;
  for (const field of [F.line17b, F.boxD]) {
    const broken = await realLoader(BLANK_2210, 2025);
    broken.getForm().updateFieldAppearances();
    broken.getForm().removeField(broken.getForm().getField(field));
    vi.spyOn(pdfUtils, "loadReviewTemplate").mockResolvedValueOnce(broken);
    await expect(fillForm2210(datedInput, datedResult(), BLANK_2210)).rejects.toThrow(/mapped PDF field/i);
    vi.restoreAllMocks();
  }
  const wrong = await realLoader(BLANK_2210, 2025);
  wrong.getForm().updateFieldAppearances();
  wrong.getForm().removeField(wrong.getForm().getField(F.line17b));
  wrong.getForm().createCheckBox(F.line17b);
  vi.spyOn(pdfUtils, "loadReviewTemplate").mockResolvedValueOnce(wrong);
  await expect(fillForm2210(datedInput, datedResult(), BLANK_2210)).rejects.toThrow(/wrong type/i);
  vi.restoreAllMocks();
  await expect(fillForm2210({ ...datedInput, taxpayer: { ...datedInput.taxpayer, taxYear: 2026 } }, datedResult(), BLANK_2210)).rejects.toThrow(/year/i);
});
