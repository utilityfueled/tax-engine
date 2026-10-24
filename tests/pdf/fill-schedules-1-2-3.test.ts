import { useTemporaryPdfOutput } from "./temporary-output.js";
const testOutputDir = useTemporaryPdfOutput();
/**
 * Tests for Schedule 1, 2, 3 PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillSchedule1, SCHEDULE_1_FIELDS } from "@/pdf/fill-schedule-1.js";
import { fillSchedule2, SCHEDULE_2_FIELDS } from "@/pdf/fill-schedule-2.js";
import { fillSchedule3, SCHEDULE_3_FIELDS } from "@/pdf/fill-schedule-3.js";
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

const BLANK_S1 = "forms/blank/f1040s1.pdf";
const BLANK_S2 = "forms/blank/f1040s2.pdf";
const BLANK_S3 = "forms/blank/f1040s3.pdf";

// ─── Schedule 1 — MFJ with business/partnership income ─────────────────────

describe("Schedule 1 PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillSchedule1(complexMFJFixture, result, BLANK_S1);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_1_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, SCHEDULE_1_FIELDS.ssn)).toBe("111223333");
  });

  it("fills Line 3 with business income from Schedule C", () => {
    const s1 = result.schedule1!;
    expect(getFieldText(doc, SCHEDULE_1_FIELDS.line3)).toBe(
      formatCurrency(s1.businessIncome),
    );
  });

  it("fills Line 5 with rental/partnership income from Schedule E", () => {
    const s1 = result.schedule1!;
    expect(getFieldText(doc, SCHEDULE_1_FIELDS.line5)).toBe(
      formatCurrency(s1.supplementalIncome),
    );
  });

  it("fills Line 10 with total additional income", () => {
    const s1 = result.schedule1!;
    expect(getFieldText(doc, SCHEDULE_1_FIELDS.line10)).toBe(
      formatCurrency(s1.totalAdditionalIncome),
    );
  });

  it("fills Line 15 with deductible SE tax", () => {
    const s1 = result.schedule1!;
    expect(getFieldText(doc, SCHEDULE_1_FIELDS.line15)).toBe(
      formatCurrency(s1.seDeduction),
    );
  });

  it("fills Line 26 with total adjustments", () => {
    const s1 = result.schedule1!;
    expect(getFieldText(doc, SCHEDULE_1_FIELDS.line26)).toBe(
      formatCurrency(s1.totalAdjustments),
    );
  });
});

// ─── Schedule 1 — simple filer (no schedule 1 needed) ──────────────────────

describe("Schedule 1 PDF fill — simple filer with no additional income", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillSchedule1(simpleW2Fixture, result, BLANK_S1);
  });

  it("fills header even when no Schedule 1 data", () => {
    expect(getFieldText(doc, SCHEDULE_1_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, SCHEDULE_1_FIELDS.ssn)).toBe("123456789");
  });

  it("leaves income lines empty when no schedule 1 result", () => {
    // Simple W-2 filer has no Schedule 1 sub-result
    if (!result.schedule1) {
      expect(getFieldText(doc, SCHEDULE_1_FIELDS.line3)).toBeUndefined();
      expect(getFieldText(doc, SCHEDULE_1_FIELDS.line10)).toBeUndefined();
    }
  });
});

// ─── Schedule 2 — MFJ with additional taxes ────────────────────────────────

describe("Schedule 2 PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillSchedule2(complexMFJFixture, result, BLANK_S2);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_2_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, SCHEDULE_2_FIELDS.ssn)).toBe("111223333");
  });

  it("fills Line 4 with self-employment tax", () => {
    const s2 = result.schedule2!;
    expect(getFieldText(doc, SCHEDULE_2_FIELDS.line4)).toBe(
      formatCurrency(s2.selfEmploymentTax),
    );
  });

  it("fills Line 11 with Additional Medicare Tax", () => {
    const s2 = result.schedule2!;
    expect(getFieldText(doc, SCHEDULE_2_FIELDS.line11)).toBe(
      formatCurrency(s2.additionalMedicareTax),
    );
  });

  it("fills Line 12 with NIIT", () => {
    const s2 = result.schedule2!;
    expect(getFieldText(doc, SCHEDULE_2_FIELDS.line12)).toBe(
      formatCurrency(s2.niitTax),
    );
  });

  it("fills Line 21 with total additional taxes", () => {
    const s2 = result.schedule2!;
    expect(getFieldText(doc, SCHEDULE_2_FIELDS.line21)).toBe(
      formatCurrency(s2.totalAdditionalTaxes),
    );
  });

  it("fills Line 3 with Part I total (or empty when zero)", () => {
    const s2 = result.schedule2!;
    const expected = formatCurrency(s2.partITotal);
    if (expected === "") {
      // formatCurrency returns "" for zero; setTextField skips empty values
      expect(getFieldText(doc, SCHEDULE_2_FIELDS.line3)).toBeUndefined();
    } else {
      expect(getFieldText(doc, SCHEDULE_2_FIELDS.line3)).toBe(expected);
    }
  });
});

// ─── Schedule 3 — MFJ with credits ─────────────────────────────────────────

describe("Schedule 3 PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillSchedule3(complexMFJFixture, result, BLANK_S3);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_3_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, SCHEDULE_3_FIELDS.ssn)).toBe("111223333");
  });

  it("fills Line 1 with foreign tax credit", () => {
    const s3 = result.schedule3!;
    expect(getFieldText(doc, SCHEDULE_3_FIELDS.line1)).toBe(
      formatCurrency(s3.foreignTaxCredit),
    );
  });

  it("fills Line 8 with total nonrefundable credits", () => {
    const s3 = result.schedule3!;
    expect(getFieldText(doc, SCHEDULE_3_FIELDS.line8)).toBe(
      formatCurrency(s3.totalNonrefundableCredits),
    );
  });

  it("fills Line 11 with excess SS withholding", () => {
    const s3 = result.schedule3!;
    expect(getFieldText(doc, SCHEDULE_3_FIELDS.line11)).toBe(
      formatCurrency(s3.excessSSWithholding),
    );
  });

  it("fills Line 15 with total refundable credits", () => {
    const s3 = result.schedule3!;
    expect(getFieldText(doc, SCHEDULE_3_FIELDS.line15)).toBe(
      formatCurrency(s3.totalRefundableCredits),
    );
  });
});

// ─── Orchestrator integration ──────────────────────────────────────────────

describe("fillReturn orchestrator with Schedule 1, 2, 3", () => {
  it("fills Form 1040 plus Schedule 1, 2, 3 for complex filer", { timeout: 30_000 }, async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(complexMFJFixture);
    const { filledForms } = await fillReturn(complexMFJFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    // Should fill Form 1040 + Schedule 1 + Schedule 2 + Schedule 3
    expect(filledForms.length).toBeGreaterThanOrEqual(4);
    expect(filledForms.some((f) => f.includes("f1040-filled"))).toBe(true);
    expect(filledForms.some((f) => f.includes("f1040s1-filled"))).toBe(true);
    expect(filledForms.some((f) => f.includes("f1040s2-filled"))).toBe(true);
    expect(filledForms.some((f) => f.includes("f1040s3-filled"))).toBe(true);
  }, 15_000);

  it("always includes Form 1040 as the first filled form", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(simpleW2Fixture);
    const { filledForms } = await fillReturn(simpleW2Fixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    expect(filledForms.length).toBeGreaterThanOrEqual(1);
    expect(filledForms[0]).toContain("f1040-filled");
  }, 15_000);
});
