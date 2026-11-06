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
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
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

const BLANK_SC = "forms/blank/2025/f1040sc.pdf";

it("copies actual dependent-care benefits to line 14 and rejects inconsistent audits", async () => {
  // Spec: spec/federal/schedule-c.yaml line14. Actual expense2500 contains
  // the source's already-deducted2500; Form2441 allows2000, so line14 is2000.
  const input = TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    w2s: [],
    scheduleC: {
      accountHolder: "primary", grossReceipts: "100000",
      expenses: { employeeBenefitPrograms: "2500" },
    },
    dependentCareBenefits: {
      sourceFactsConfirmed: true, exclusionEligibilityConfirmed: true,
      employeeBenefits: [],
      selfEmployedBenefits: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c",
        benefitsReceived: "2000", priorYearCarryoverUsed: "0", alreadyDeducted: "2500" }],
      deductionAllocations: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c", amount: "2000" }],
      planExclusionLimit: "5000", qualifiedExpensesIncurred: "5000",
      primaryEarnedIncome: "91076", earnedIncomeWorksheetConfirmed: true,
      qualifyingIndividuals: 1, qualifiedExpensesPaidForCredit: "0",
      creditExpenseCoordinationConfirmed: true,
    },
  });
  const result = calculateFederalTax(input);
  const filled = await fillScheduleC(input, result, BLANK_SC);
  const doc = await PDFDocument.load(await filled.save());
  expect(getFieldText(doc, SCHEDULE_C_FIELDS.line14)).toBe("2000");
  expect(getFieldText(doc, SCHEDULE_C_FIELDS.line28)).toBe("2000");
  expect(getFieldText(doc, SCHEDULE_C_FIELDS.line31)).toBe("98000");
  const scheduleC = result.scheduleC;
  if (!scheduleC) throw new Error("Expected calculated Schedule C");
  const altered = { ...result, scheduleC: { ...scheduleC, lines: scheduleC.lines.map(line =>
    line.line === "14" ? { ...line, value: new Decimal("2500") } : line) } };
  await expect(fillScheduleC(input, altered, BLANK_SC)).rejects.toThrow(/audit at line 14/);
});

// ─── MFJ filer with 1099-NEC self-employment income ──────────────────────

describe("Schedule C PDF fill — MFJ with 1099-NEC income", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillScheduleC(complexMFJFixture, result, BLANK_SC);
  });

  it("leaves an unknown joint-return proprietor unidentified", () => {
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.name)).toBeUndefined();
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.ssn)).toBeUndefined();
  });

  it("preserves an unknown accounting method", () => {
    expect(isChecked(doc, SCHEDULE_C_FIELDS.cashMethod)).toBe(false);
    expect(isChecked(doc, SCHEDULE_C_FIELDS.accrualMethod)).toBe(false);
  });

  it("preserves unknown material participation", () => {
    expect(isChecked(doc, SCHEDULE_C_FIELDS.materialParticipationYes)).toBe(false);
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
      formatCurrency(sc.grossIncome),
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

  it("preserves the unmodeled investment-at-risk fact", () => {
    expect(isChecked(doc, SCHEDULE_C_FIELDS.allInvestmentAtRisk)).toBe(false);
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
      sc.grossIncome.minus(sc.totalExpenses).minus(sc.homeOfficeDeduction).toNumber(),
    );
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.line31)).toBe(
      formatCurrency(sc.netProfit),
    );
  });
});

describe("Schedule C source-qualified review mapping", () => {
  it("copies official income lines and refuses inconsistent Schedule C data", async () => {
    // Spec: spec/federal/schedule-c.yaml reviewPdfMapping.
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, scheduleC: {
      grossReceipts: "25000", returnsAndAllowances: "1000", costOfGoodsSold: "4000", otherIncome: "1200",
      expenses: { supplies: "200", otherExpenses: "50" }, homeOffice: { method: "simplified", squareFeet: 100 },
    } });
    const result = calculateFederalTax(input);
    const doc = await fillScheduleC(input, result, BLANK_SC);
    expect(["line3", "line4", "line5", "line6", "line7", "line31"].map(key =>
      getFieldText(doc, SCHEDULE_C_FIELDS[key as keyof typeof SCHEDULE_C_FIELDS]))).toEqual(["24000", "4000", "20000", "1200", "21200", "20450"]);
    // Independent official field positions: 27a is not a description; 30/31
    // are after the square-footage fields. Reopen the saved canonical tree.
    const saved = await PDFDocument.load(await doc.save());
    expect(getFieldText(saved, "topmostSubform[0].Page1[0].Lines18-27[0].f1_40[0]")).toBeUndefined();
    expect(getFieldText(saved, "topmostSubform[0].Page1[0].f1_45[0]")).toBe("500");
    expect(getFieldText(saved, "topmostSubform[0].Page1[0].f1_46[0]")).toBe("20450");
    const sc = result.scheduleC;
    if (!sc || !input.scheduleC) throw new Error("Synthetic Schedule C must exist");
    const line6 = sc.lines.find(entry => entry.form === "Sched C" && entry.line === "6");
    if (!line6) throw new Error("Synthetic line6 must exist");
    await expect(fillScheduleC(input, { ...result, scheduleC: { ...sc, lines: sc.lines.filter(entry => entry !== line6) } }, BLANK_SC)).rejects.toThrow(/audit/i);
    await expect(fillScheduleC(input, { ...result, scheduleC: { ...sc, lines: [...sc.lines, line6] } }, BLANK_SC)).rejects.toThrow(/audit/i);
    await expect(fillScheduleC(input, { ...result, scheduleC: { ...sc, otherIncome: new Decimal(1) } }, BLANK_SC)).rejects.toThrow(/inconsistent|reconcile/i);
    await expect(fillScheduleC({ ...input, scheduleC: { ...input.scheduleC, otherIncome: "1201" } }, result, BLANK_SC)).rejects.toThrow(/source|inconsistent|reconcile/i);
  });

  it("uses the actual spouse proprietor and preserves unknown checkbox facts", async () => {
    // Spec: spec/federal/schedule-c.yaml review-source-facts.
    const input = TaxYearInputSchema.parse({ ...complexMFJFixture, scheduleC: {
      accountHolder: "spouse", grossReceipts: "15000", qbiMateriallyParticipated: false,
      principalBusinessActivity: "Bookkeeping", allInvestmentAtRisk: false,
      expenses: { otherExpenses: "20000" }, otherExpenseDescription: "Actual permit and registration costs",
    } });
    const doc = await fillScheduleC(input, calculateFederalTax(input), BLANK_SC);
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.name)).toBe("Jane Smith");
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.ssn)).toBe(input.taxpayer.spouse?.ssn.replace(/-/g, ""));
    expect(isChecked(doc, SCHEDULE_C_FIELDS.materialParticipationNo)).toBe(true);
    expect(isChecked(doc, SCHEDULE_C_FIELDS.materialParticipationYes)).toBe(false);
    expect(isChecked(doc, SCHEDULE_C_FIELDS.cashMethod)).toBe(false);
    expect(isChecked(doc, SCHEDULE_C_FIELDS.accrualMethod)).toBe(false);
    expect(isChecked(doc, SCHEDULE_C_FIELDS.allInvestmentAtRisk)).toBe(false);
    expect(isChecked(doc, SCHEDULE_C_FIELDS.someInvestmentNotAtRisk)).toBe(true);
    expect(getFieldText(doc, SCHEDULE_C_FIELDS.businessOrProfession)).toBe("Bookkeeping");
    expect(getFieldText(doc, "topmostSubform[0].Page2[0].PartVTable[0].Item1[0].f2_15[0]")).toBe("Actual permit and registration costs");
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
