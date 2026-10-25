import { useTemporaryPdfOutput } from "./temporary-output.js";
const testOutputDir = useTemporaryPdfOutput();
/**
 * Tests for Form 8936 — Clean Vehicle Credits PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm8936, FORM_8936_FIELDS } from "@/pdf/fill-form-8936.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import type { TaxYearInput } from "@/models/inputs.js";
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

const BLANK_8936 = "forms/blank/2025/f8936.pdf";
const BLANK_FORMS_DIR = "forms/blank";
const F = FORM_8936_FIELDS;

// ─── Fixture: MFJ with new clean vehicle (both requirements met, $7,500 credit) ──

const mfjNewVehicleFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Taylor",
      lastName: "Chen",
      ssn: "333-44-5555",
      dateOfBirth: "1982-04-12",
    },
    spouse: {
      firstName: "Morgan",
      lastName: "Chen",
      ssn: "444-55-6666",
      dateOfBirth: "1984-09-25",
    },
    address: {
      street: "100 EV Drive",
      city: "San Jose",
      state: "CA",
      zip: "95110",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Tech Giant Inc", ein: "11-2233445" },
      wages: "180000",
      federalWithheld: "28000",
      socialSecurityWages: "176100",
      socialSecurityWithheld: "10918.20",
      medicareWages: "180000",
      medicareWithheld: "2610",
      stateTaxWithheld: "0",
      stateWages: "180000",
      localTaxWithheld: "0",
      state: "CA",
    },
  ],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  rentalProperties: [],
  form8936: {
    newCleanVehicles: [
      {
        dateAcquired: "2025-03-15",
        criticalMineralsRequirementMet: true,
        batteryComponentsRequirementMet: true,
        msrp: "48000",
        vehicleType: "other",
        personalUsePercentage: "100",
        creditTransferredToDealer: false,
      },
    ],
    previouslyOwnedCleanVehicles: [],
    priorYearAgi: "175000",
  },
};

// ─── Fixture: Single filer with previously owned clean vehicle ─────────────

const singlePrevOwnedFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Jordan",
      lastName: "Lee",
      ssn: "555-66-7777",
      dateOfBirth: "1990-11-03",
    },
    address: {
      street: "250 Green St",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Startup Co", ein: "22-3344556" },
      wages: "60000",
      federalWithheld: "7000",
      socialSecurityWages: "60000",
      socialSecurityWithheld: "3720",
      medicareWages: "60000",
      medicareWithheld: "870",
      stateTaxWithheld: "0",
      stateWages: "60000",
      localTaxWithheld: "0",
      state: "OR",
    },
  ],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  rentalProperties: [],
  form8936: {
    newCleanVehicles: [],
    previouslyOwnedCleanVehicles: [
      {
        dateAcquired: "2025-06-01",
        salePrice: "18000",
        personalUsePercentage: "100",
        creditTransferredToDealer: false,
      },
    ],
    priorYearAgi: "55000",
  },
};

// ─── Fixture: Single filer AGI-disqualified for new vehicle ──────────────

const disqualifiedFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Alex",
      lastName: "Doe",
      ssn: "666-77-8888",
      dateOfBirth: "1975-01-01",
    },
    address: {
      street: "1 High St",
      city: "NYC",
      state: "NY",
      zip: "10001",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "MegaCorp", ein: "33-4455667" },
      wages: "200000",
      federalWithheld: "40000",
      socialSecurityWages: "176100",
      socialSecurityWithheld: "10918.20",
      medicareWages: "200000",
      medicareWithheld: "2900",
      stateTaxWithheld: "0",
      stateWages: "200000",
      localTaxWithheld: "0",
      state: "NY",
    },
  ],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  rentalProperties: [],
  form8936: {
    newCleanVehicles: [
      {
        dateAcquired: "2025-02-01",
        criticalMineralsRequirementMet: true,
        batteryComponentsRequirementMet: true,
        msrp: "45000",
        vehicleType: "other",
        personalUsePercentage: "100",
        creditTransferredToDealer: false,
      },
    ],
    previouslyOwnedCleanVehicles: [],
    priorYearAgi: "200000",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// MFJ with new clean vehicle — $7,500 credit
// ═══════════════════════════════════════════════════════════════════════════

describe("Form 8936 PDF fill — MFJ with new clean vehicle", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjNewVehicleFixture);
    expect(result.form8936).toBeDefined();
    expect(result.form8936!.totalNewVehicleCredit.gt(0)).toBe(true);
    doc = await fillForm8936(mfjNewVehicleFixture, result, BLANK_8936);
  });

  it("engine produces new vehicle credit of $7,500", () => {
    expect(result.form8936!.totalNewVehicleCredit.toNumber()).toBe(7500);
  });

  it("fills header with both spouse names and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Taylor Chen & Morgan Chen");
    expect(getFieldText(doc, F.ssn)).toBe("333445555");
  });

  it("Line 1a — current year AGI", () => {
    expect(getFieldText(doc, F.line1a)).toBe(formatCurrency(result.agi));
  });

  it("Line 2 — current year MAGI", () => {
    expect(getFieldText(doc, F.line2)).toBe(
      formatCurrency(result.form8936!.currentYearMagi),
    );
  });

  it("Line 3a — prior year AGI", () => {
    expect(getFieldText(doc, F.line3a)).toBe("175000");
  });

  it("Line 4 — prior year MAGI", () => {
    expect(getFieldText(doc, F.line4)).toBe(
      formatCurrency(result.form8936!.priorYearMagi),
    );
  });

  it("Line 5 — filing status abbreviation", () => {
    expect(getFieldText(doc, F.line5)).toBe("MFJ");
  });

  it("Line 9 — personal use new vehicle credit", () => {
    expect(getFieldText(doc, F.line9)).toBe("7500");
  });

  it("Line 10 — tax before credits", () => {
    expect(getFieldText(doc, F.line10)).toBe(
      formatCurrency(result.totalTaxBeforeCredits),
    );
  });

  it("Line 13 — allowable credit (min of line 9, line 12)", () => {
    const line13Text = getFieldText(doc, F.line13);
    expect(line13Text).toBeDefined();
    expect(line13Text).not.toBe("");
    // Credit should be ≤ $7,500 and > 0
    const line13Val = parseInt(line13Text!, 10);
    expect(line13Val).toBeGreaterThan(0);
    expect(line13Val).toBeLessThanOrEqual(7500);
  });

  it("Part IV lines are empty (no previously owned vehicle)", () => {
    expect(getFieldText(doc, F.line14)).toBeUndefined();
    expect(getFieldText(doc, F.line18)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Single with previously owned clean vehicle — $4,000 credit
// ═══════════════════════════════════════════════════════════════════════════

describe("Form 8936 PDF fill — single with previously owned vehicle", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(singlePrevOwnedFixture);
    expect(result.form8936).toBeDefined();
    expect(result.form8936!.totalPreviouslyOwnedCredit.gt(0)).toBe(true);
    doc = await fillForm8936(singlePrevOwnedFixture, result, BLANK_8936);
  });

  it("engine produces previously owned credit of $4,000", () => {
    // 30% × $18,000 = $5,400, capped at $4,000
    expect(result.form8936!.totalPreviouslyOwnedCredit.toNumber()).toBe(4000);
  });

  it("fills header with single filer name", () => {
    expect(getFieldText(doc, F.name)).toBe("Jordan Lee");
    expect(getFieldText(doc, F.ssn)).toBe("555667777");
  });

  it("Line 5 — filing status S", () => {
    expect(getFieldText(doc, F.line5)).toBe("S");
  });

  it("Line 14 — previously owned vehicle credit", () => {
    expect(getFieldText(doc, F.line14)).toBe("4000");
  });

  it("Line 15 — tax before credits", () => {
    expect(getFieldText(doc, F.line15)).toBe(
      formatCurrency(result.totalTaxBeforeCredits),
    );
  });

  it("Line 18 — allowable previously owned credit", () => {
    const line18Text = getFieldText(doc, F.line18);
    expect(line18Text).toBeDefined();
    expect(line18Text).not.toBe("");
    const line18Val = parseInt(line18Text!, 10);
    expect(line18Val).toBeGreaterThan(0);
    expect(line18Val).toBeLessThanOrEqual(4000);
  });

  it("Part III lines are empty (no new vehicle)", () => {
    expect(getFieldText(doc, F.line9)).toBeUndefined();
    expect(getFieldText(doc, F.line13)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AGI-disqualified — no credit, form not filled
// ═══════════════════════════════════════════════════════════════════════════

describe("Form 8936 — AGI-disqualified filer produces zero credit", () => {
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(() => {
    result = calculateFederalTax(disqualifiedFixture);
  });

  it("engine disqualifies due to MAGI exceeding threshold", () => {
    expect(result.form8936).toBeDefined();
    expect(result.form8936!.newVehicleAgiDisqualified).toBe(true);
    expect(result.form8936!.totalNewVehicleCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// fillReturn orchestrator includes Form 8936
// ═══════════════════════════════════════════════════════════════════════════

describe("fillReturn orchestrator with Form 8936", () => {
  it("fills Form 8936 for filer with new clean vehicle", async () => {
    const result = calculateFederalTax(mfjNewVehicleFixture);
    const { filledForms } = await fillReturn(mfjNewVehicleFixture, result, {
      blankFormsDir: BLANK_FORMS_DIR,
      outputDir: testOutputDir,
    });

    expect(filledForms.some((f) => f.includes("f8936"))).toBe(true);
  });

  it("does not fill Form 8936 for AGI-disqualified filer", async () => {
    const result = calculateFederalTax(disqualifiedFixture);
    const { filledForms } = await fillReturn(disqualifiedFixture, result, {
      blankFormsDir: BLANK_FORMS_DIR,
      outputDir: testOutputDir,
    });

    expect(filledForms.some((f) => f.includes("f8936"))).toBe(false);
  });
});
