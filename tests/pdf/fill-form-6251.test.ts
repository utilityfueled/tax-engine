/**
 * Tests for Form 6251 (AMT) PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm6251, FORM_6251_FIELDS } from "@/pdf/fill-form-6251.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import { complexMFJFixture, simpleW2Fixture } from "../fixtures/simple-w2.js";
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

const BLANK_6251 = "forms/blank/f6251.pdf";

// ─── Form 6251 — Complex MFJ filer ─────────────────────────────────────────

describe("Form 6251 PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: TaxReturnResult;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillForm6251(complexMFJFixture, result, BLANK_6251);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, FORM_6251_FIELDS.name)).toBe(
      "John Smith & Jane Smith",
    );
    expect(getFieldText(doc, FORM_6251_FIELDS.ssn)).toBe("111223333");
  });

  it("Form 6251 Line 1b — taxable income matches engine result", () => {
    const f6251 = result.form6251!;
    expect(getFieldText(doc, FORM_6251_FIELDS.line1b)).toBe(
      formatCurrency(f6251.taxableIncome),
    );
  });

  it("Form 6251 Line 2a — SALT add-back matches engine result", () => {
    const f6251 = result.form6251!;
    expect(getFieldText(doc, FORM_6251_FIELDS.line2a)).toBe(
      formatCurrency(f6251.saltAddBack),
    );
  });

  it("Form 6251 Line 4 — AMTI matches engine result", () => {
    const f6251 = result.form6251!;
    expect(getFieldText(doc, FORM_6251_FIELDS.line4)).toBe(
      formatCurrency(f6251.amti),
    );
  });

  it("Form 6251 Line 5 — exemption matches engine result", () => {
    const f6251 = result.form6251!;
    expect(getFieldText(doc, FORM_6251_FIELDS.line5)).toBe(
      formatCurrency(f6251.exemption),
    );
  });

  it("Form 6251 Line 6 — AMT base matches engine result", () => {
    const f6251 = result.form6251!;
    expect(getFieldText(doc, FORM_6251_FIELDS.line6)).toBe(
      formatCurrency(f6251.amtBase),
    );
  });

  it("Form 6251 Line 7 — tax computation matches tentative minimum tax", () => {
    const f6251 = result.form6251!;
    expect(getFieldText(doc, FORM_6251_FIELDS.line7)).toBe(
      formatCurrency(f6251.tentativeMinimumTax),
    );
  });

  it("Form 6251 Line 9 — tentative minimum tax equals Line 7 (no AMT FTC)", () => {
    const f6251 = result.form6251!;
    expect(getFieldText(doc, FORM_6251_FIELDS.line9)).toBe(
      formatCurrency(f6251.tentativeMinimumTax),
    );
  });

  it("Form 6251 Line 10 — regular tax is populated", () => {
    const line10Value = getFieldText(doc, FORM_6251_FIELDS.line10);
    expect(line10Value).toBeDefined();
    expect(line10Value).not.toBe("");
  });

  it("Form 6251 Line 11 — AMT matches engine result", () => {
    const f6251 = result.form6251!;
    // Zero AMT renders as empty string; unfilled fields return undefined
    expect(getFieldText(doc, FORM_6251_FIELDS.line11) ?? "").toBe(
      formatCurrency(f6251.amt),
    );
  });
});

// ─── Form 6251 — Simple W-2 filer (no AMT) ─────────────────────────────────

describe("Form 6251 PDF fill — simple W-2 filer (no AMT)", () => {
  let doc: PDFDocument;
  let result: TaxReturnResult;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillForm6251(simpleW2Fixture, result, BLANK_6251);
  });

  it("fills header even when AMT is zero", () => {
    expect(getFieldText(doc, FORM_6251_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, FORM_6251_FIELDS.ssn)).toBe("123456789");
  });

  it("Form 6251 Line 11 — AMT is zero for simple W-2 filer", () => {
    const f6251 = result.form6251!;
    expect(f6251.amt.toNumber()).toBe(0);
    // Zero values render as empty string per IRS convention
    expect(getFieldText(doc, FORM_6251_FIELDS.line11) ?? "").toBe("");
  });

  it("Form 6251 Line 1b — taxable income is still populated", () => {
    const f6251 = result.form6251!;
    expect(getFieldText(doc, FORM_6251_FIELDS.line1b)).toBe(
      formatCurrency(f6251.taxableIncome),
    );
  });
});
