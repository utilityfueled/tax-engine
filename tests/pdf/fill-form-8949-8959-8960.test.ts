import { useTemporaryPdfOutput } from "./temporary-output.js";
const testOutputDir = useTemporaryPdfOutput();
/**
 * Tests for Form 8949, 8959, and 8960 PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm8949, FORM_8949_FIELDS } from "@/pdf/fill-form-8949.js";
import { fillForm8959, FORM_8959_FIELDS } from "@/pdf/fill-form-8959.js";
import { fillForm8960, FORM_8960_FIELDS } from "@/pdf/fill-form-8960.js";
import { calculateForm8949 } from "@/engine/forms/form-8949.js";
import { complexMFJFixture, simpleW2Fixture } from "../fixtures/simple-w2.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";

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

const BLANK_8949 = "forms/blank/2025/f8949.pdf";
const BLANK_8959 = "forms/blank/2025/f8959.pdf";
const BLANK_8960 = "forms/blank/2025/f8960.pdf";

// ─── Form 8949 — MFJ with capital transactions ─────────────────────────────

describe("Form 8949 PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let form8949Result: ReturnType<typeof calculateForm8949>;

  beforeAll(async () => {
    form8949Result = calculateForm8949(complexMFJFixture);
    doc = await fillForm8949(complexMFJFixture, BLANK_8949);
  });

  it("fills header with taxpayer names and SSN on both pages", () => {
    expect(getFieldText(doc, FORM_8949_FIELDS.name1)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, FORM_8949_FIELDS.ssn1)).toBe("111223333");
    expect(getFieldText(doc, FORM_8949_FIELDS.name2)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, FORM_8949_FIELDS.ssn2)).toBe("111223333");
  });

  it("checks Box A for short-term transactions with basis reported", () => {
    if (form8949Result.shortTermBoxA.transactions.length > 0) {
      expect(isChecked(doc, FORM_8949_FIELDS.boxA)).toBe(true);
      expect(isChecked(doc, FORM_8949_FIELDS.boxB)).toBe(false);
    }
  });

  it("checks Box D for long-term transactions with basis reported", () => {
    if (form8949Result.longTermBoxD.transactions.length > 0) {
      expect(isChecked(doc, FORM_8949_FIELDS.boxD)).toBe(true);
      expect(isChecked(doc, FORM_8949_FIELDS.boxE)).toBe(false);
    }
  });

  it("fills short-term transaction rows on page 1", () => {
    const boxA = form8949Result.shortTermBoxA;
    if (boxA.transactions.length > 0) {
      const firstRow = FORM_8949_FIELDS.page1Rows[0];
      expect(getFieldText(doc, firstRow.description)).toBe(boxA.transactions[0].description);
      expect(getFieldText(doc, firstRow.proceeds)).toBe(
        formatCurrency(boxA.transactions[0].proceeds),
      );
    }
  });

  it("fills long-term transaction rows on page 2", () => {
    const boxD = form8949Result.longTermBoxD;
    if (boxD.transactions.length > 0) {
      const firstRow = FORM_8949_FIELDS.page2Rows[0];
      expect(getFieldText(doc, firstRow.description)).toBe(boxD.transactions[0].description);
      expect(getFieldText(doc, firstRow.proceeds)).toBe(
        formatCurrency(boxD.transactions[0].proceeds),
      );
    }
  });

  it("fills page 1 totals for short-term Box A", () => {
    const boxA = form8949Result.shortTermBoxA;
    if (boxA.transactions.length > 0) {
      expect(getFieldText(doc, FORM_8949_FIELDS.page1TotalProceeds)).toBe(
        formatCurrency(boxA.totalProceeds),
      );
      expect(getFieldText(doc, FORM_8949_FIELDS.page1TotalCostBasis)).toBe(
        formatCurrency(boxA.totalCostBasis),
      );
      expect(getFieldText(doc, FORM_8949_FIELDS.page1TotalGainLoss)).toBe(
        formatCurrency(boxA.totalGainLoss),
      );
    }
  });

  it("fills page 2 totals for long-term Box D", () => {
    const boxD = form8949Result.longTermBoxD;
    if (boxD.transactions.length > 0) {
      expect(getFieldText(doc, FORM_8949_FIELDS.page2TotalProceeds)).toBe(
        formatCurrency(boxD.totalProceeds),
      );
      expect(getFieldText(doc, FORM_8949_FIELDS.page2TotalCostBasis)).toBe(
        formatCurrency(boxD.totalCostBasis),
      );
      expect(getFieldText(doc, FORM_8949_FIELDS.page2TotalGainLoss)).toBe(
        formatCurrency(boxD.totalGainLoss),
      );
    }
  });
});

// ─── Form 8949 — simple filer (no capital transactions) ─────────────────────

describe("Form 8949 PDF fill — simple filer with no capital transactions", () => {
  let doc: PDFDocument;

  beforeAll(async () => {
    doc = await fillForm8949(simpleW2Fixture, BLANK_8949);
  });

  it("fills header even with no transactions", () => {
    expect(getFieldText(doc, FORM_8949_FIELDS.name1)).toBe("Jane Doe");
    expect(getFieldText(doc, FORM_8949_FIELDS.ssn1)).toBe("123456789");
  });

  it("leaves checkboxes unchecked when no transactions", () => {
    expect(isChecked(doc, FORM_8949_FIELDS.boxA)).toBe(false);
    expect(isChecked(doc, FORM_8949_FIELDS.boxD)).toBe(false);
  });

  it("leaves totals empty when no transactions", () => {
    expect(getFieldText(doc, FORM_8949_FIELDS.page1TotalProceeds)).toBeUndefined();
    expect(getFieldText(doc, FORM_8949_FIELDS.page2TotalProceeds)).toBeUndefined();
  });
});

// ─── Form 8959 — MFJ with Additional Medicare Tax ──────────────────────────

describe("Form 8959 PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillForm8959(complexMFJFixture, result, BLANK_8959);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, FORM_8959_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, FORM_8959_FIELDS.ssn)).toBe("111223333");
  });

  it("fills Part I Line 1 with Medicare wages", () => {
    const f8959 = result.form8959!;
    expect(getFieldText(doc, FORM_8959_FIELDS.line1)).toBe(
      formatCurrency(f8959.medicareWages),
    );
  });

  it("fills Part I Line 5 with filing status threshold", () => {
    const f8959 = result.form8959!;
    expect(getFieldText(doc, FORM_8959_FIELDS.line5)).toBe(
      formatCurrency(f8959.threshold),
    );
  });

  it("fills Part II Line 8 with SE income", () => {
    const f8959 = result.form8959!;
    const expected = formatCurrency(f8959.selfEmploymentEarnings);
    if (expected === "") {
      expect(getFieldText(doc, FORM_8959_FIELDS.line8)).toBeUndefined();
    } else {
      expect(getFieldText(doc, FORM_8959_FIELDS.line8)).toBe(expected);
    }
  });

  it("fills Part IV Line 18 with total Additional Medicare Tax", () => {
    const f8959 = result.form8959!;
    expect(getFieldText(doc, FORM_8959_FIELDS.line18)).toBe(
      formatCurrency(f8959.additionalMedicareTax),
    );
  });

  it("fills Part V Line 22 with withholding credit", () => {
    const f8959 = result.form8959!;
    const expected = formatCurrency(f8959.withholdingCredit);
    if (expected === "") {
      expect(getFieldText(doc, FORM_8959_FIELDS.line22)).toBeUndefined();
    } else {
      expect(getFieldText(doc, FORM_8959_FIELDS.line22)).toBe(expected);
    }
  });
});

// ─── Form 8959 — simple filer (no Additional Medicare Tax) ──────────────────

describe("Form 8959 PDF fill — simple filer with no Additional Medicare Tax", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillForm8959(simpleW2Fixture, result, BLANK_8959);
  });

  it("fills header even with no form 8959 data", () => {
    expect(getFieldText(doc, FORM_8959_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, FORM_8959_FIELDS.ssn)).toBe("123456789");
  });

  it("leaves lines empty when no form 8959 result", () => {
    if (!result.form8959) {
      expect(getFieldText(doc, FORM_8959_FIELDS.line1)).toBeUndefined();
      expect(getFieldText(doc, FORM_8959_FIELDS.line18)).toBeUndefined();
    }
  });
});

// ─── Form 8960 — MFJ with NIIT ─────────────────────────────────────────────

describe("Form 8960 PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillForm8960(complexMFJFixture, result, BLANK_8960);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, FORM_8960_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, FORM_8960_FIELDS.ssn)).toBe("111223333");
  });

  it("fills Line 1 with taxable interest", () => {
    const f8960 = result.form8960!;
    expect(getFieldText(doc, FORM_8960_FIELDS.line1)).toBe(
      formatCurrency(f8960.taxableInterest),
    );
  });

  it("fills Line 2 with ordinary dividends", () => {
    const f8960 = result.form8960!;
    expect(getFieldText(doc, FORM_8960_FIELDS.line2)).toBe(
      formatCurrency(f8960.dividends),
    );
  });

  it("fills Line 8 with total investment income", () => {
    const f8960 = result.form8960!;
    expect(getFieldText(doc, FORM_8960_FIELDS.line8)).toBe(
      formatCurrency(f8960.netInvestmentIncome),
    );
  });

  it("fills Line 12 with net investment income", () => {
    const f8960 = result.form8960!;
    expect(getFieldText(doc, FORM_8960_FIELDS.line12)).toBe(
      formatCurrency(f8960.netInvestmentIncome),
    );
  });

  it("fills Line 14 with filing status threshold", () => {
    const f8960 = result.form8960!;
    expect(getFieldText(doc, FORM_8960_FIELDS.line14)).toBe(
      formatCurrency(f8960.threshold),
    );
  });

  it("fills Line 16 with taxable base", () => {
    const f8960 = result.form8960!;
    expect(getFieldText(doc, FORM_8960_FIELDS.line16)).toBe(
      formatCurrency(f8960.taxableBase),
    );
  });

  it("fills Line 17 with NIIT", () => {
    const f8960 = result.form8960!;
    expect(getFieldText(doc, FORM_8960_FIELDS.line17)).toBe(
      formatCurrency(f8960.niitTax),
    );
  });
});

// ─── Form 8960 — simple filer (no NIIT) ──────────────────────────────────────

describe("Form 8960 PDF fill — simple filer with no NIIT", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillForm8960(simpleW2Fixture, result, BLANK_8960);
  });

  it("fills header even with no form 8960 data", () => {
    expect(getFieldText(doc, FORM_8960_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, FORM_8960_FIELDS.ssn)).toBe("123456789");
  });

  it("leaves lines empty when no form 8960 result", () => {
    if (!result.form8960) {
      expect(getFieldText(doc, FORM_8960_FIELDS.line1)).toBeUndefined();
      expect(getFieldText(doc, FORM_8960_FIELDS.line17)).toBeUndefined();
    }
  });
});

// ─── Orchestrator integration ────────────────────────────────────────────

describe("fillReturn orchestrator with Form 8949, 8959, 8960", () => {
  it("fills Form 8949 for complex filer with capital transactions", { timeout: 30_000 }, async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(complexMFJFixture);
    const { filledForms } = await fillReturn(complexMFJFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    expect(filledForms.some((f) => f.includes("f8949-filled"))).toBe(true);
  }, 15_000);

  it("fills Form 8959 for complex filer with Additional Medicare Tax", { timeout: 30_000 }, async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(complexMFJFixture);
    const { filledForms } = await fillReturn(complexMFJFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    if (result.form8959) {
      expect(filledForms.some((f) => f.includes("f8959-filled"))).toBe(true);
    }
  }, 15_000);

  it("fills Form 8960 for complex filer with NIIT", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(complexMFJFixture);
    const { filledForms } = await fillReturn(complexMFJFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    if (result.form8960) {
      expect(filledForms.some((f) => f.includes("f8960-filled"))).toBe(true);
    }
  }, 15_000);

  it("does not fill Form 8949/8959/8960 for simple W-2 filer", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(simpleW2Fixture);
    const { filledForms } = await fillReturn(simpleW2Fixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    expect(filledForms.some((f) => f.includes("f8949-filled"))).toBe(false);
    expect(filledForms.some((f) => f.includes("f8959-filled"))).toBe(false);
    expect(filledForms.some((f) => f.includes("f8960-filled"))).toBe(false);
  }, 15_000);
});
