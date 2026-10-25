import { useTemporaryPdfOutput } from "./temporary-output.js";
const testOutputDir = useTemporaryPdfOutput();
/**
 * Tests for Schedule A PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleA, SCHEDULE_A_FIELDS } from "@/pdf/fill-schedule-a.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import { complexMFJFixture, simpleW2Fixture } from "../fixtures/simple-w2.js";

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

const BLANK_SA = "forms/blank/2025/f1040sa.pdf";

// ─── Schedule A — MFJ with itemized deductions ───────────────────────────

describe("Schedule A PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillScheduleA(complexMFJFixture, result, BLANK_SA);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.ssn)).toBe("111223333");
  });

  it("fills Line 2 with AGI", () => {
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.line2)).toBe(
      formatCurrency(result.agi),
    );
  });

  it("fills Line 4 with medical deduction", () => {
    const sa = result.scheduleA!;
    const expected = formatCurrency(sa.medicalDeduction);
    if (expected === "") {
      // formatCurrency returns "" for zero; setTextField skips empty values
      expect(getFieldText(doc, SCHEDULE_A_FIELDS.line4)).toBeUndefined();
    } else {
      expect(getFieldText(doc, SCHEDULE_A_FIELDS.line4)).toBe(expected);
    }
  });

  it("fills Line 5b with real estate taxes from Form 1098", () => {
    // Complex fixture has property tax of 8500
    const realEstateTaxes = complexMFJFixture.form1098.reduce(
      (acc, f) => acc.plus(new Decimal(String(f.propertyTax ?? 0))),
      new Decimal(0),
    );
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.line5b)).toBe(
      formatCurrency(realEstateTaxes),
    );
  });

  it("fills Line 5e with capped SALT deduction", () => {
    const sa = result.scheduleA!;
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.line5e)).toBe(
      formatCurrency(sa.saltDeduction),
    );
  });

  it("fills Line 7 with total taxes", () => {
    const sa = result.scheduleA!;
    // Line 7 = Line 5e + Line 6 (no other taxes in fixture)
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.line7)).toBe(
      formatCurrency(sa.saltDeduction),
    );
  });

  it("fills Line 8a with mortgage interest", () => {
    const sa = result.scheduleA!;
    const pointsPaid = complexMFJFixture.form1098.reduce(
      (acc, f) => acc.plus(new Decimal(String(f.pointsPaid ?? 0))),
      new Decimal(0),
    );
    const expected = sa.mortgageInterest.plus(pointsPaid);
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.line8a)).toBe(
      formatCurrency(expected),
    );
  });

  it("fills Line 10 with total interest deduction", () => {
    const sa = result.scheduleA!;
    const pointsPaid = complexMFJFixture.form1098.reduce(
      (acc, f) => acc.plus(new Decimal(String(f.pointsPaid ?? 0))),
      new Decimal(0),
    );
    const totalInterest = sa.mortgageInterest.plus(pointsPaid).plus(sa.investmentInterestDeduction);
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.line10)).toBe(
      formatCurrency(totalInterest),
    );
  });

  it("fills Line 11 with cash charitable donations", () => {
    // Complex fixture has $5000 cash donation
    const sa = result.scheduleA!;
    // cashCharitable minus carryforward used = current year cash
    const carryforwardUsed = sa.charitableCarryforwardDetail.reduce(
      (acc, e) => acc.plus(e.amountUsed), new Decimal(0),
    );
    const currentYearCash = Decimal.max(new Decimal(0), sa.cashCharitable.minus(carryforwardUsed));
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.line11)).toBe(
      formatCurrency(currentYearCash),
    );
  });

  it("fills Line 12 with non-cash charitable donations", () => {
    const sa = result.scheduleA!;
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.line12)).toBe(
      formatCurrency(sa.nonCashCharitable),
    );
  });

  it("fills Line 14 with total charitable", () => {
    const sa = result.scheduleA!;
    const totalCharitable = sa.cashCharitable.plus(sa.nonCashCharitable);
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.line14)).toBe(
      formatCurrency(totalCharitable),
    );
  });

  it("fills Line 17 with total itemized deductions", () => {
    const sa = result.scheduleA!;
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.line17)).toBe(
      formatCurrency(sa.totalItemized),
    );
  });

  it("does not check sales tax checkbox for income tax filer", () => {
    const sa = result.scheduleA!;
    expect(sa.salesTaxElected).toBe(false);
    expect(isChecked(doc, SCHEDULE_A_FIELDS.salesTaxCheckbox)).toBe(false);
  });
});

// ─── Schedule A — simple filer (uses standard deduction) ────────────────

describe("Schedule A PDF fill — simple filer with no itemized deductions", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillScheduleA(simpleW2Fixture, result, BLANK_SA);
  });

  it("fills header even when no Schedule A data", () => {
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, SCHEDULE_A_FIELDS.ssn)).toBe("123456789");
  });

  it("leaves lines empty when no Schedule A result", () => {
    if (!result.scheduleA) {
      expect(getFieldText(doc, SCHEDULE_A_FIELDS.line17)).toBeUndefined();
      expect(getFieldText(doc, SCHEDULE_A_FIELDS.line4)).toBeUndefined();
      expect(getFieldText(doc, SCHEDULE_A_FIELDS.line5e)).toBeUndefined();
    }
  });
});

// ─── Orchestrator integration ──────────────────────────────────────────

describe("fillReturn orchestrator with Schedule A", () => {
  it("fills Schedule A for complex filer with itemized deductions", { timeout: 30_000 }, async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(complexMFJFixture);
    const { filledForms } = await fillReturn(complexMFJFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    expect(filledForms.some((f) => f.includes("f1040sa-filled"))).toBe(true);
  }, 15_000);

  it("does not fill Schedule A for simple W-2 filer", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(simpleW2Fixture);
    const { filledForms } = await fillReturn(simpleW2Fixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    expect(filledForms.some((f) => f.includes("f1040sa-filled"))).toBe(false);
  }, 15_000);
});
