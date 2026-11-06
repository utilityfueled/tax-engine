import { useTemporaryPdfOutput } from "./temporary-output.js";
const testOutputDir = useTemporaryPdfOutput();
/**
 * Tests for Schedule J PDF filling — Income Averaging for Farmers and Fishermen.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleJ, SCHEDULE_J_FIELDS } from "@/pdf/fill-schedule-j.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
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

const BLANK_SJ = "forms/blank/2025/f1040sj.pdf";

// ─── Farmer with Schedule J income averaging ──────────────────────────

const farmIncomeAveragingFixture: TaxYearInput = {
  ...simpleW2Fixture,
  taxpayer: {
    ...simpleW2Fixture.taxpayer,
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      firstName: "John",
      lastName: "Farmer",
      ssn: "111-22-3333",
      dateOfBirth: "1975-06-15",
      occupation: "Farmer",
    },
  },
  formW2: [
    {
      employer: { name: "Self", ein: "12-3456789", address: { street: "1 Farm Rd", city: "Ames", state: "IA", zip: "50010" } },
      wages: "10000",
      federalIncomeTaxWithheld: "1500",
      socialSecurityWages: "10000",
      socialSecurityTaxWithheld: "620",
      medicareWages: "10000",
      medicareTaxWithheld: "145",
      state: "IA",
    },
  ],
  scheduleF: {
    principalCropOrActivity: "Corn",
    materiallyParticipated: true,
    salesOfProductsRaised: "120000",
    expenses: {
      feed: "10000",
      seedsAndPlants: "8000",
      fertilizersAndLime: "5000",
      gasolineFuelOil: "3000",
      repairsAndMaintenance: "4000",
    },
  },
  scheduleJ: {
    electedFarmIncome: "80000",
    baseYear1: { taxableIncome: "25000", filingStatus: "single", originalTax: "2812" },
    baseYear2: { taxableIncome: "30000", filingStatus: "single", originalTax: "3392" },
    baseYear3: { taxableIncome: "28000", filingStatus: "single", originalTax: "3161" },
  },
};

describe("Schedule J PDF fill — farmer with income averaging", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(farmIncomeAveragingFixture);
    doc = await fillScheduleJ(farmIncomeAveragingFixture, result, BLANK_SJ);
  });

  it("fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.name)).toBe("John Farmer");
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.ssn)).toBe("111223333");
  });

  it("fills Part I — Line 1 taxable income", () => {
    const sj = result.scheduleJ!;
    expect(sj).toBeDefined();
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line1)).toBe(formatCurrency(sj.line1));
  });

  it("fills Part I — Line 2a elected farm income", () => {
    const sj = result.scheduleJ!;
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line2a)).toBe(formatCurrency(sj.line2a));
  });

  it("fills Part I — Line 3 non-farm taxable income", () => {
    const sj = result.scheduleJ!;
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line3)).toBe(formatCurrency(sj.line3));
    // Line 3 = Line 1 - Line 2a
    expect(sj.line3.toNumber()).toBe(sj.line1.minus(sj.line2a).toNumber());
  });

  it("fills Part II — Line 4 tax on non-farm income", () => {
    const sj = result.scheduleJ!;
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line4)).toBe(formatCurrency(sj.line4));
  });

  it("fills base year 1 (2022) lines 5-8", () => {
    const sj = result.scheduleJ!;
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line5)).toBe(formatCurrency(sj.line5));
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line6)).toBe(formatCurrency(sj.line6));
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line7)).toBe(formatCurrency(sj.line7));
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line8)).toBe(formatCurrency(sj.line8));
  });

  it("fills base year 2 (2023) lines 9-12", () => {
    const sj = result.scheduleJ!;
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line9)).toBe(formatCurrency(sj.line9));
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line10)).toBe(formatCurrency(sj.line10));
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line11)).toBe(formatCurrency(sj.line11));
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line12)).toBe(formatCurrency(sj.line12));
  });

  it("fills base year 3 (2024) lines 13-16", () => {
    const sj = result.scheduleJ!;
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line13)).toBe(formatCurrency(sj.line13));
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line14)).toBe(formatCurrency(sj.line14));
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line15)).toBe(formatCurrency(sj.line15));
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line16)).toBe(formatCurrency(sj.line16));
  });

  it("fills Part III — Line 17 sum of tax computations", () => {
    const sj = result.scheduleJ!;
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line17)).toBe(formatCurrency(sj.line17));
    // Line 17 = Line 4 + Line 8 + Line 12 + Line 16
    expect(sj.line17.toNumber()).toBe(
      sj.line4.plus(sj.line8).plus(sj.line12).plus(sj.line16).toNumber(),
    );
  });

  it("fills Part III — Line 18 carry-over equals Line 17", () => {
    const sj = result.scheduleJ!;
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line18)).toBe(formatCurrency(sj.line17));
  });

  it("fills Part III — Lines 19-21 original base year taxes", () => {
    const sj = result.scheduleJ!;
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line19)).toBe(formatCurrency(sj.line19));
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line20)).toBe(formatCurrency(sj.line20));
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line21)).toBe(formatCurrency(sj.line21));
  });

  it("fills Part III — Line 22 sum of original taxes", () => {
    const sj = result.scheduleJ!;
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line22)).toBe(formatCurrency(sj.line22));
    // Line 22 = Line 19 + Line 20 + Line 21
    expect(sj.line22.toNumber()).toBe(
      sj.line19.plus(sj.line20).plus(sj.line21).toNumber(),
    );
  });

  it("fills Part III — Line 23 averaged tax", () => {
    const sj = result.scheduleJ!;
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line23)).toBe(formatCurrency(sj.line23));
    // Line 23 = Line 17 - Line 22
    expect(sj.line23.toNumber()).toBe(sj.line17.minus(sj.line22).toNumber());
  });

  it("1/3 of elected farm income allocated equally to each base year", () => {
    const sj = result.scheduleJ!;
    // Lines 6, 10, 14 should all be the same (1/3 of EFI)
    expect(sj.line6.toNumber()).toBe(sj.line10.toNumber());
    expect(sj.line10.toNumber()).toBe(sj.line14.toNumber());
  });
});

// ─── Capital gain portion of elected farm income ──────────────────────

const farmWithCapitalGainFixture: TaxYearInput = {
  ...farmIncomeAveragingFixture,
  scheduleJ: {
    electedFarmIncome: "80000",
    netCapitalGainFromFarming: "12000",
    unrecapturedSection1250GainFromFarming: "3000",
    baseYear1: { taxableIncome: "25000", filingStatus: "single", originalTax: "2812" },
    baseYear2: { taxableIncome: "30000", filingStatus: "single", originalTax: "3392" },
    baseYear3: { taxableIncome: "28000", filingStatus: "single", originalTax: "3161" },
  },
};

describe("Schedule J PDF fill — farm income with capital gains", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(farmWithCapitalGainFixture);
    doc = await fillScheduleJ(farmWithCapitalGainFixture, result, BLANK_SJ);
  });

  it("fills Line 2b with net capital gain from EFI", () => {
    const sj = result.scheduleJ!;
    expect(sj.line2b.toNumber()).toBeGreaterThan(0);
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line2b)).toBe(formatCurrency(sj.line2b));
  });

  it("fills Line 2c with unrecaptured §1250 gain from EFI", () => {
    const sj = result.scheduleJ!;
    expect(sj.line2c.toNumber()).toBeGreaterThan(0);
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line2c)).toBe(formatCurrency(sj.line2c));
  });
});

// ─── Simple W-2 filer (no Schedule J) ─────────────────────────────────

describe("Schedule J PDF fill — simple filer with no farm income", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillScheduleJ(simpleW2Fixture, result, BLANK_SJ);
  });

  it("fills header even when no Schedule J data", () => {
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.ssn)).toBe("123456789");
  });

  it("leaves all lines empty when no Schedule J result", () => {
    expect(result.scheduleJ).toBeUndefined();
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line1)).toBeUndefined();
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line2a)).toBeUndefined();
    expect(getFieldText(doc, SCHEDULE_J_FIELDS.line23)).toBeUndefined();
  });
});

// ─── Orchestrator integration ────────────────────────────────────────────

describe("fillReturn orchestrator with Schedule J", () => {
  it("fills Schedule J for filer with farm income averaging", { timeout: 30_000 }, async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(farmIncomeAveragingFixture);
    const { filledForms } = await fillReturn(farmIncomeAveragingFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    expect(filledForms.some((f) => f.includes("f1040sj-filled"))).toBe(true);
  });

  it("does not fill Schedule J for simple W-2 filer", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(simpleW2Fixture);
    const { filledForms } = await fillReturn(simpleW2Fixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    expect(filledForms.some((f) => f.includes("f1040sj-filled"))).toBe(false);
  });
});
