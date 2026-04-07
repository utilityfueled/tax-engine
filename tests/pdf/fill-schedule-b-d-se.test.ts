/**
 * Tests for Schedule B, D, and SE PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleB, SCHEDULE_B_FIELDS } from "@/pdf/fill-schedule-b.js";
import { fillScheduleD, SCHEDULE_D_FIELDS } from "@/pdf/fill-schedule-d.js";
import { fillScheduleSE, SCHEDULE_SE_FIELDS } from "@/pdf/fill-schedule-se.js";
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

const BLANK_SB = "forms/blank/f1040sb.pdf";
const BLANK_SD = "forms/blank/f1040sd.pdf";
const BLANK_SSE = "forms/blank/f1040sse.pdf";

// ─── Schedule B — MFJ with interest and dividends ─────────────────────────

describe("Schedule B PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillScheduleB(complexMFJFixture, result, BLANK_SB);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.ssn)).toBe("111223333");
  });

  it("fills interest payer names and amounts", () => {
    const sb = result.scheduleB!;
    expect(sb.interestPayers.length).toBeGreaterThan(0);
    // First payer name should be present
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.interestPayerName[0])).toBeTruthy();
    // First payer amount should be present
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.interestPayerAmount[0])).toBeTruthy();
  });

  it("fills Line 2 with total interest", () => {
    const sb = result.scheduleB!;
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.line2)).toBe(
      formatCurrency(sb.totalInterest),
    );
  });

  it("fills Line 4 with taxable interest", () => {
    const sb = result.scheduleB!;
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.line4)).toBe(
      formatCurrency(sb.taxableInterest),
    );
  });

  it("fills dividend payer names", () => {
    const sb = result.scheduleB!;
    expect(sb.dividendPayers.length).toBeGreaterThan(0);
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.dividendPayerName[0])).toBeTruthy();
  });

  it("fills Line 6 with total ordinary dividends", () => {
    const sb = result.scheduleB!;
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.line6)).toBe(
      formatCurrency(sb.totalOrdinaryDividends),
    );
  });

  it("fills Part III foreign account checkboxes", () => {
    const sb = result.scheduleB!;
    if (sb.hasForeignAccounts) {
      expect(isChecked(doc, SCHEDULE_B_FIELDS.line7aYes)).toBe(true);
    } else {
      expect(isChecked(doc, SCHEDULE_B_FIELDS.line7aNo)).toBe(true);
    }
  });
});

// ─── Schedule B — simple filer (no Schedule B needed) ─────────────────────

describe("Schedule B PDF fill — simple filer with no interest/dividends", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillScheduleB(simpleW2Fixture, result, BLANK_SB);
  });

  it("fills header even when no Schedule B data", () => {
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.ssn)).toBe("123456789");
  });

  it("leaves payer rows empty when no Schedule B result", () => {
    if (!result.scheduleB) {
      expect(getFieldText(doc, SCHEDULE_B_FIELDS.interestPayerName[0])).toBeUndefined();
      expect(getFieldText(doc, SCHEDULE_B_FIELDS.line2)).toBeUndefined();
    }
  });
});

// ─── Schedule D — MFJ with capital gains/losses ───────────────────────────

describe("Schedule D PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillScheduleD(complexMFJFixture, result, BLANK_SD);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_D_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, SCHEDULE_D_FIELDS.ssn)).toBe("111223333");
  });

  it("checks Form 8949 Yes checkbox", () => {
    expect(isChecked(doc, SCHEDULE_D_FIELDS.form8949Yes)).toBe(true);
  });

  it("fills Line 7 with net short-term gain/loss", () => {
    const sd = result.scheduleD!;
    expect(getFieldText(doc, SCHEDULE_D_FIELDS.line7)).toBe(
      formatCurrency(sd.netShortTerm),
    );
  });

  it("fills Line 15 with net long-term gain/loss", () => {
    const sd = result.scheduleD!;
    expect(getFieldText(doc, SCHEDULE_D_FIELDS.line15)).toBe(
      formatCurrency(sd.netLongTerm),
    );
  });

  it("fills Line 16 with net capital gain/loss", () => {
    const sd = result.scheduleD!;
    expect(getFieldText(doc, SCHEDULE_D_FIELDS.line16)).toBe(
      formatCurrency(sd.netCapitalGainLoss),
    );
  });

  it("fills Line 17 checkbox based on gain status", () => {
    const sd = result.scheduleD!;
    const bothGains = sd.netLongTerm.gt(0) && sd.netCapitalGainLoss.gt(0);
    expect(isChecked(doc, SCHEDULE_D_FIELDS.line17Yes)).toBe(bothGains);
    expect(isChecked(doc, SCHEDULE_D_FIELDS.line17No)).toBe(!bothGains);
  });

  it("fills Line 22 QDCG checkbox", () => {
    // Complex filer has qualified dividends, so QDCG should be Yes
    const useQDCG = result.scheduleD!.netCapitalGainLoss.gt(0) || result.qualifiedDividends.gt(0);
    expect(isChecked(doc, SCHEDULE_D_FIELDS.line22Yes)).toBe(useQDCG);
  });
});

// ─── Schedule SE — MFJ with self-employment income ────────────────────────

describe("Schedule SE PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillScheduleSE(complexMFJFixture, result, BLANK_SSE);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.ssn)).toBe("111223333");
  });

  it("fills Line 1b with net nonfarm profit", () => {
    const se = result.scheduleSE!;
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line1b)).toBe(
      formatCurrency(se.netNonfarmProfit),
    );
  });

  it("fills Line 12 with total SE tax", () => {
    const se = result.scheduleSE!;
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line12)).toBe(
      formatCurrency(se.totalSETax),
    );
  });

  it("fills Line 13 with deductible half", () => {
    const se = result.scheduleSE!;
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line13)).toBe(
      formatCurrency(se.deductibleHalf),
    );
  });

  it("fills Line 10 with Social Security portion (or empty when zero)", () => {
    const se = result.scheduleSE!;
    const expected = formatCurrency(se.socialSecurityPortion);
    if (expected === "") {
      // formatCurrency returns "" for zero; setTextField skips empty values
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line10)).toBeUndefined();
    } else {
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line10)).toBe(expected);
    }
  });

  it("fills Line 11 with Medicare portion", () => {
    const se = result.scheduleSE!;
    const expected = formatCurrency(se.medicarePortion);
    if (expected === "") {
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line11)).toBeUndefined();
    } else {
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line11)).toBe(expected);
    }
  });
});

// ─── Schedule SE — simple filer (no SE needed) ───────────────────────────

describe("Schedule SE PDF fill — simple filer with no SE income", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillScheduleSE(simpleW2Fixture, result, BLANK_SSE);
  });

  it("fills header even when no Schedule SE data", () => {
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.ssn)).toBe("123456789");
  });

  it("leaves SE lines empty when no SE result", () => {
    if (!result.scheduleSE) {
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line12)).toBeUndefined();
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line13)).toBeUndefined();
    }
  });
});

// ─── Orchestrator integration ────────────────────────────────────────────

describe("fillReturn orchestrator with Schedule B, D, SE", () => {
  it("fills all applicable forms for complex filer", { timeout: 30_000 }, async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(complexMFJFixture);
    const { filledForms } = await fillReturn(complexMFJFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: "forms/filled",
    });
    // Complex filer should have: 1040 + S1 + S2 + S3 + SB + SD + SSE
    expect(filledForms.length).toBeGreaterThanOrEqual(7);
    expect(filledForms.some((f) => f.includes("f1040sb-filled"))).toBe(true);
    expect(filledForms.some((f) => f.includes("f1040sd-filled"))).toBe(true);
    expect(filledForms.some((f) => f.includes("f1040sse-filled"))).toBe(true);
  }, 15_000);

  it("does not fill Schedule B/D/SE for simple W-2 filer", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(simpleW2Fixture);
    const { filledForms } = await fillReturn(simpleW2Fixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: "forms/filled",
    });
    // Simple W-2 filer: no self-employment income
    expect(filledForms.some((f) => f.includes("f1040sse-filled"))).toBe(false);
    // Simple W-2 filer: no interest/dividends exceeding $1,500
    expect(filledForms.some((f) => f.includes("f1040sb-filled"))).toBe(false);
  }, 15_000);
});
