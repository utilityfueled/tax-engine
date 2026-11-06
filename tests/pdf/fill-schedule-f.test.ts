import { useTemporaryPdfOutput } from "./temporary-output.js";
const testOutputDir = useTemporaryPdfOutput();
/**
 * Tests for Schedule F PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleF, SCHEDULE_F_FIELDS } from "@/pdf/fill-schedule-f.js";
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

const BLANK_SF = "forms/blank/2025/f1040sf.pdf";

// ─── Farm with full income and expenses ─────────────────────────────────

const farmFixture: TaxYearInput = {
  ...simpleW2Fixture,
  taxpayer: {
    ...simpleW2Fixture.taxpayer,
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      firstName: "Bob",
      lastName: "Farmer",
      ssn: "222-33-4444",
    },
  },
  scheduleF: {
    principalCropOrActivity: "Corn and soybeans",
    activityCode: "111150",
    ein: "98-7654321",
    accountingMethod: "cash",
    materiallyParticipated: true,
    salesOfPurchasedLivestock: "20000",
    costOfPurchasedLivestock: "12000",
    salesOfProductsRaised: "50000",
    cooperativeDistributions: "3000",
    agriculturalProgramPayments: "5000",
    cccLoansElected: "2000",
    cccLoansForfeited: "1000",
    cropInsuranceProceeds: "4000",
    priorYearDeferredCropInsurance: "1500",
    customHireIncome: "6000",
    otherFarmIncome: "2500",
    expenses: {
      carAndTruck: "3000",
      chemicals: "4500",
      conservation: "2000",
      customHire: "1500",
      depreciation: "8000",
      employeeBenefits: "1200",
      feed: "12000",
      fertilizersAndLime: "5000",
      freightAndTrucking: "2500",
      gasolineFuelOil: "4000",
      insurance: "3500",
      mortgageInterest: "2000",
      otherInterest: "500",
      laborHired: "6000",
      pensionAndProfitSharing: "1000",
      rentLeaseVehicles: "2400",
      rentLeaseOther: "3600",
      repairsAndMaintenance: "4500",
      seedsAndPlants: "6000",
      storageAndWarehousing: "1500",
      supplies: "2000",
      taxes: "3000",
      utilities: "1800",
      veterinaryBreedingMedicine: "2500",
      otherExpenses: "1000",
    },
  },
};

describe("Schedule F PDF fill — farm with full income and expenses", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(farmFixture);
    doc = await fillScheduleF(farmFixture, result, BLANK_SF);
  });

  it("fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.name)).toBe("Bob Farmer");
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.ssn)).toBe("222334444");
  });

  it("fills principal crop or activity", () => {
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.principalCropOrActivity)).toBe("Corn and soybeans");
  });

  it("fills activity code", () => {
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.activityCode)).toBe("111150");
  });

  it("fills EIN without dashes", () => {
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.ein)).toBe("987654321");
  });

  it("checks cash accounting method", () => {
    expect(isChecked(doc, SCHEDULE_F_FIELDS.cashMethod)).toBe(true);
    expect(isChecked(doc, SCHEDULE_F_FIELDS.accrualMethod)).toBe(false);
  });

  it("checks material participation Yes", () => {
    expect(isChecked(doc, SCHEDULE_F_FIELDS.materialParticipationYes)).toBe(true);
    expect(isChecked(doc, SCHEDULE_F_FIELDS.materialParticipationNo)).toBe(false);
  });

  it("fills Line 1c with net purchased livestock (1a - 1b)", () => {
    const sf = result.scheduleF!;
    // 20000 - 12000 = 8000
    expect(sf.netPurchasedLivestock.toNumber()).toBe(8000);
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.line1c)).toBe(
      formatCurrency(sf.netPurchasedLivestock),
    );
  });

  it("fills Line 9 with gross farm income", () => {
    const sf = result.scheduleF!;
    // 8000 + 50000 + 3000 + 5000 + 2000 + 1000 + 4000 + 1500 + 6000 + 2500 = 83000
    expect(sf.grossFarmIncome.toNumber()).toBe(83000);
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.line9)).toBe(
      formatCurrency(sf.grossFarmIncome),
    );
  });

  it("fills expense line items from breakdown", () => {
    const sf = result.scheduleF!;

    const carAndTruck = sf.expenseBreakdown["Car and truck"];
    expect(carAndTruck).toBeDefined();
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.line10)).toBe(
      formatCurrency(carAndTruck!),
    );

    const feed = sf.expenseBreakdown["Feed"];
    expect(feed).toBeDefined();
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.line16)).toBe(
      formatCurrency(feed!),
    );

    const insurance = sf.expenseBreakdown["Insurance"];
    expect(insurance).toBeDefined();
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.line20)).toBe(
      formatCurrency(insurance!),
    );
  });

  it("fills conservation expenses with 25% cap applied", () => {
    const sf = result.scheduleF!;
    // Conservation deduction is min(conservation input, 25% * grossFarmIncome)
    // 25% of 83000 = 20750; conservation = 2000; min(2000, 20750) = 2000
    expect(sf.conservationDeduction.toNumber()).toBe(2000);
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.line12)).toBe(
      formatCurrency(sf.conservationDeduction),
    );
  });

  it("fills Line 33 with total expenses", () => {
    const sf = result.scheduleF!;
    expect(sf.totalExpenses.gt(0)).toBe(true);
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.line33)).toBe(
      formatCurrency(sf.totalExpenses),
    );
  });

  it("fills Line 34 with net farm profit", () => {
    const sf = result.scheduleF!;
    expect(sf.netFarmProfit.toNumber()).toBe(
      sf.grossFarmIncome.minus(sf.totalExpenses).toNumber(),
    );
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.line34)).toBe(
      formatCurrency(sf.netFarmProfit),
    );
  });

  it("fills other expenses on Line 32", () => {
    const sf = result.scheduleF!;
    const other = sf.expenseBreakdown["Other expenses"];
    if (other && !other.isZero()) {
      expect(getFieldText(doc, SCHEDULE_F_FIELDS.line32aDesc)).toBe("Other");
      expect(getFieldText(doc, SCHEDULE_F_FIELDS.line32aAmt)).toBe(
        formatCurrency(other),
      );
      expect(getFieldText(doc, SCHEDULE_F_FIELDS.line32f)).toBe(
        formatCurrency(other),
      );
    }
  });

  it("checks all investment at risk", () => {
    expect(isChecked(doc, SCHEDULE_F_FIELDS.allInvestmentAtRisk)).toBe(true);
  });
});

// ─── Non-participating farmer (material participation = No) ──────────

describe("Schedule F PDF fill — non-participating farmer", () => {
  let doc: PDFDocument;

  beforeAll(async () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleF: {
        principalCropOrActivity: "Hay",
        materiallyParticipated: false,
        salesOfProductsRaised: "10000",
        expenses: {
          feed: "3000",
          utilities: "500",
        },
      },
    };
    const result = calculateFederalTax(fixture);
    doc = await fillScheduleF(fixture, result, BLANK_SF);
  });

  it("checks material participation No", () => {
    expect(isChecked(doc, SCHEDULE_F_FIELDS.materialParticipationNo)).toBe(true);
    expect(isChecked(doc, SCHEDULE_F_FIELDS.materialParticipationYes)).toBe(false);
  });
});

// ─── Simple W-2 filer (no Schedule F) ─────────────────────────────────

describe("Schedule F PDF fill — simple filer with no farm income", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillScheduleF(simpleW2Fixture, result, BLANK_SF);
  });

  it("fills header even when no Schedule F data", () => {
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, SCHEDULE_F_FIELDS.ssn)).toBe("123456789");
  });

  it("leaves income/expense lines empty when no Schedule F result", () => {
    const sf = result.scheduleF;
    if (!sf || sf.grossFarmIncome.isZero()) {
      expect(getFieldText(doc, SCHEDULE_F_FIELDS.line9)).toBeUndefined();
      expect(getFieldText(doc, SCHEDULE_F_FIELDS.line34)).toBeUndefined();
    }
  });
});

// ─── Orchestrator integration ────────────────────────────────────────────

describe("fillReturn orchestrator with Schedule F", () => {
  it("fills Schedule F for filer with farm income", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(farmFixture);
    const { filledForms } = await fillReturn(farmFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    expect(filledForms.some((f) => f.includes("f1040sf-filled"))).toBe(true);
  });

  it("does not fill Schedule F for simple W-2 filer without farm income", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(simpleW2Fixture);
    const { filledForms } = await fillReturn(simpleW2Fixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    expect(filledForms.some((f) => f.includes("f1040sf-filled"))).toBe(false);
  });
});
