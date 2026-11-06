import { useTemporaryPdfOutput } from "./temporary-output.js";
const testOutputDir = useTemporaryPdfOutput();
/**
 * Tests for Form 1040 PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm1040, FORM_1040_FIELDS } from "@/pdf/fill-form-1040.js";
import { simpleW2Fixture, complexMFJFixture } from "../fixtures/simple-w2.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import Decimal from "decimal.js";

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

const BLANK_PDF = "forms/blank/2025/f1040.pdf";

// ─── Format Utility Tests ──────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats positive whole dollars without sign", () => {
    expect(formatCurrency(new Decimal("85000"))).toBe("85000");
  });

  it("rounds to nearest dollar", () => {
    expect(formatCurrency(new Decimal("85000.49"))).toBe("85000");
    expect(formatCurrency(new Decimal("85000.50"))).toBe("85001");
  });

  it("formats negative values with parentheses", () => {
    expect(formatCurrency(new Decimal("-3000"))).toBe("(3000)");
  });

  it("returns empty string for zero", () => {
    expect(formatCurrency(new Decimal("0"))).toBe("");
  });
});

// ─── Simple W-2 Single Filer ───────────────────────────────────────────────

describe("Form 1040 PDF fill — simple single filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillForm1040(simpleW2Fixture, result, BLANK_PDF);
  });

  it("fills primary taxpayer name", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.primaryFirstName)).toBe("Jane");
    expect(getFieldText(doc, FORM_1040_FIELDS.primaryLastName)).toBe("Doe");
  });

  it("fills primary SSN without dashes", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.primarySSN)).toBe("123456789");
  });

  it("fills address fields", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.street)).toBe("123 Main St");
    expect(getFieldText(doc, FORM_1040_FIELDS.city)).toBe("Seattle");
    expect(getFieldText(doc, FORM_1040_FIELDS.state)).toBe("WA");
    expect(getFieldText(doc, FORM_1040_FIELDS.zip)).toBe("98101");
  });

  it("checks Single filing status", () => {
    expect(isChecked(doc, FORM_1040_FIELDS.single)).toBe(true);
    expect(isChecked(doc, FORM_1040_FIELDS.mfj)).toBe(false);
    expect(isChecked(doc, FORM_1040_FIELDS.mfs)).toBe(false);
    expect(isChecked(doc, FORM_1040_FIELDS.hoh)).toBe(false);
  });

  it("fills Line 1a with total wages", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.line1a)).toBe("85000");
  });

  it("fills Line 9 with total income", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.line9)).toBe(
      formatCurrency(result.totalIncome),
    );
  });

  it("fills Line 11 with AGI", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.line11)).toBe(
      formatCurrency(result.agi),
    );
  });

  it("fills Line 12 with deduction amount", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.line12)).toBe(
      formatCurrency(result.deductionAmount),
    );
  });

  it("fills Line 15 with taxable income", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.line15)).toBe(
      formatCurrency(result.taxableIncome),
    );
  });

  it("fills Line 16 with tax", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.line16)).toBe(
      formatCurrency(result.totalTaxBeforeCredits),
    );
  });

  it("fills Line 24 with total tax", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.line24)).toBe(
      formatCurrency(result.totalTax),
    );
  });

  it("fills Line 25d with total withholding", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.line25d)).toBe(
      formatCurrency(result.totalWithholding),
    );
  });

  it("fills refund or amount owed", () => {
    if (result.refund.gt(0)) {
      expect(getFieldText(doc, FORM_1040_FIELDS.line34)).toBe(
        formatCurrency(result.refund),
      );
    }
    if (result.amountOwed.gt(0)) {
      expect(getFieldText(doc, FORM_1040_FIELDS.line37)).toBe(
        formatCurrency(result.amountOwed),
      );
    }
  });

  it("leaves spouse fields empty for single filer", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.spouseFirstName)).toBeUndefined();
  });
});

// ─── MFJ Complex Filer ────────────────────────────────────────────────────

describe("Form 1040 PDF fill — MFJ with dependents", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillForm1040(complexMFJFixture, result, BLANK_PDF);
  });

  it("checks MFJ filing status", () => {
    expect(isChecked(doc, FORM_1040_FIELDS.mfj)).toBe(true);
    expect(isChecked(doc, FORM_1040_FIELDS.single)).toBe(false);
  });

  it("fills spouse name and SSN", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.spouseFirstName)).toBe("Jane");
    expect(getFieldText(doc, FORM_1040_FIELDS.spouseLastName)).toBe("Smith");
    expect(getFieldText(doc, FORM_1040_FIELDS.spouseSSN)).toBe("444556666");
  });

  it("fills first dependent", () => {
    expect(getFieldText(doc, FORM_1040_FIELDS.dep1FirstName)).toBe("Tommy");
    expect(getFieldText(doc, FORM_1040_FIELDS.dep1LastName)).toBe("Smith");
    expect(getFieldText(doc, FORM_1040_FIELDS.dep1SSN)).toBe("777889999");
    expect(getFieldText(doc, FORM_1040_FIELDS.dep1Relationship)).toBe("Son");
  });

  it("checks CTC for qualifying dependent", () => {
    expect(isChecked(doc, FORM_1040_FIELDS.dep1CTC)).toBe(true);
  });

  it("fills all major income and tax lines", () => {
    // Just verify they're non-empty for a complex return
    expect(getFieldText(doc, FORM_1040_FIELDS.line1a)).toBeTruthy();
    expect(getFieldText(doc, FORM_1040_FIELDS.line9)).toBeTruthy();
    expect(getFieldText(doc, FORM_1040_FIELDS.line11)).toBeTruthy();
    expect(getFieldText(doc, FORM_1040_FIELDS.line15)).toBeTruthy();
    expect(getFieldText(doc, FORM_1040_FIELDS.line24)).toBeTruthy();
  });
});

// ─── Fill Return Orchestrator ──────────────────────────────────────────────

describe("fillReturn orchestrator", () => {
  it("fills Form 1040 and returns file paths", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(simpleW2Fixture);
    const { filledForms } = await fillReturn(simpleW2Fixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    expect(filledForms.length).toBeGreaterThanOrEqual(1);
    expect(filledForms[0]).toContain("f1040-filled.pdf");
  });
});
