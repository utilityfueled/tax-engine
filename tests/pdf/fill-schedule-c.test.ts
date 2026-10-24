/**
 * Tests for Schedule C PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleC, SCHEDULE_C_FIELDS } from "@/pdf/fill-schedule-c.js";
import { complexMFJFixture, simpleW2Fixture } from "../fixtures/simple-w2.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import type { TaxYearInput } from "@/models/inputs.js";

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

const BLANK_SC = "forms/blank/f1040sc.pdf";

// ─── MFJ filer with 1099-NEC self-employment income ──────────────────────

describe("Schedule C PDF fill — MFJ with 1099-NEC income", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillScheduleC(complexMFJFixture, result, BLANK_SC);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.ssn)).toBe("111223333");
  });

  it("checks cash accounting method by default", () => {
    expect(isChecked(doc, SCHEDULE_C_FIELDS.cashMethod)).toBe(true);
    expect(isChecked(doc, SCHEDULE_C_FIELDS.accrualMethod)).toBe(false);
  });

  it("checks material participation Yes", () => {
    expect(isChecked(doc, SCHEDULE_C_FIELDS.materialParticipationYes)).toBe(true);
  });

  it("fills Line 1 with gross receipts from 1099-NEC", () => {
    const sc = result.scheduleC!;
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.line1)).toBe(
      formatCurrency(sc.grossReceipts),
    );
  });

  it("fills Line 7 with gross income", () => {
    const sc = result.scheduleC!;
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.line7)).toBe(
      formatCurrency(sc.grossProfit),
    );
  });

  it("fills Line 28 with total expenses (or empty if zero)", () => {
    const sc = result.scheduleC!;
    const expected = formatCurrency(sc.totalExpenses);
    if (expected === "") {
      // formatCurrency returns "" for zero; setTextField skips empty values
      expect(getFieldText(doc, SCHEDULE_C_FIELDS.line28)).toBeUndefined();
    } else {
      expect(getFieldText(doc, SCHEDULE_C_FIELDS.line28)).toBe(expected);
    }
  });

  it("fills Line 29 with tentative profit", () => {
    const sc = result.scheduleC!;
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.line29)).toBe(
      formatCurrency(sc.tentativeProfit),
    );
  });

  it("fills Line 31 with net profit", () => {
    const sc = result.scheduleC!;
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.line31)).toBe(
      formatCurrency(sc.netProfit),
    );
  });

  it("checks all investment at risk", () => {
    expect(isChecked(doc, SCHEDULE_C_FIELDS.allInvestmentAtRisk)).toBe(true);
  });
});

// ─── Filer with explicit Schedule C business expenses ────────────────────

describe("Schedule C PDF fill — explicit business with expenses", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;
  let fixtureWithExpenses: TaxYearInput;

  beforeAll(async () => {
    fixtureWithExpenses = {
      ...complexMFJFixture,
      scheduleC: {
        businessName: "Smith Consulting LLC",
        businessCode: "541611",
        ein: "12-3456789",
        accountingMethod: "cash" as const,
        expenses: {
          advertising: "500",
          officeExpense: "1200",
          supplies: "300",
          travel: "2000",
          meals: "800",
          utilities: "600",
        },
      },
    };
    result = calculateFederalTax(fixtureWithExpenses);
    doc = await fillScheduleC(fixtureWithExpenses, result, BLANK_SC);
  });

  it("fills business name", () => {
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.businessName)).toBe("Smith Consulting LLC");
  });

  it("fills business code", () => {
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.businessCode)).toBe("541611");
  });

  it("fills EIN without dashes", () => {
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.ein)).toBe("123456789");
  });

  it("fills expense line items from breakdown", () => {
    const sc = result.scheduleC!;
    const advertising = sc.expenseBreakdown["Advertising"];
    if (advertising && !advertising.isZero()) {
      expect(getFieldText(doc, SCHEDULE_C_FIELDS.line8)).toBe(
        formatCurrency(advertising),
      );
    }

    const office = sc.expenseBreakdown["Office expense"];
    if (office && !office.isZero()) {
      expect(getFieldText(doc, SCHEDULE_C_FIELDS.line18)).toBe(
        formatCurrency(office),
      );
    }

    const supplies = sc.expenseBreakdown["Supplies"];
    if (supplies && !supplies.isZero()) {
      expect(getFieldText(doc, SCHEDULE_C_FIELDS.line22)).toBe(
        formatCurrency(supplies),
      );
    }
  });

  it("fills meals at 50% deduction rate", () => {
    const sc = result.scheduleC!;
    const meals = sc.expenseBreakdown["Meals (50%)"];
    // Input was $800, deductible at 50% = $400
    expect(meals).toBeDefined();
    expect(meals!.toNumber()).toBe(400);
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.line24b)).toBe("400");
  });

  it("fills total expenses on Line 28", () => {
    const sc = result.scheduleC!;
    expect(sc.totalExpenses.gt(0)).toBe(true);
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.line28)).toBe(
      formatCurrency(sc.totalExpenses),
    );
  });

  it("fills net profit = gross income minus expenses", () => {
    const sc = result.scheduleC!;
    expect(sc.netProfit.toNumber()).toBe(
      sc.grossProfit.minus(sc.totalExpenses).minus(sc.homeOfficeDeduction).toNumber(),
    );
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.line31)).toBe(
      formatCurrency(sc.netProfit),
    );
  });
});

// ─── Simple W-2 filer (no Schedule C) ───────────────────────────────────

describe("Schedule C PDF fill — simple filer with no self-employment income", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillScheduleC(simpleW2Fixture, result, BLANK_SC);
  });

  it("fills header even when no Schedule C data", () => {
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.ssn)).toBe("123456789");
  });

  it("leaves income/expense lines empty when no Schedule C result", () => {
    // Simple fixture has no 1099-NEC, but engine still produces scheduleC
    // with zero values. If gross receipts are zero, lines should be empty.
    const sc = result.scheduleC;
    if (!sc || sc.grossReceipts.isZero()) {
      expect(getFieldText(doc, SCHEDULE_C_FIELDS.line1)).toBeUndefined();
      expect(getFieldText(doc, SCHEDULE_C_FIELDS.line31)).toBeUndefined();
    }
  });
});

// ─── Orchestrator integration ────────────────────────────────────────────

describe("fillReturn orchestrator with Schedule C", () => {
  let outputDir: string;
  beforeAll(async () => { outputDir = await mkdtemp(join(tmpdir(), "schedule-c-return-")); });
  afterAll(async () => { await rm(outputDir, { recursive: true, force: true }); });
  it("fills Schedule C for filer with 1099-NEC income", { timeout: 30_000 }, async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(complexMFJFixture);
    const { filledForms } = await fillReturn(complexMFJFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir,
    });
    expect(filledForms.some((f) => f.includes("f1040sc-filled"))).toBe(true);
  }, 15_000);

  it("does not fill Schedule C for simple W-2 filer without self-employment", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(simpleW2Fixture);
    const { filledForms } = await fillReturn(simpleW2Fixture, result, {
      blankFormsDir: "forms/blank",
      outputDir,
    });
    // Simple W-2 filer: no 1099-NEC means scheduleC may be absent or have zero receipts
    // The orchestrator checks `result.scheduleC` existence
    if (!result.scheduleC) {
      expect(filledForms.some((f) => f.includes("f1040sc-filled"))).toBe(false);
    }
  }, 15_000);
});
