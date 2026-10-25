/**
 * Tests for Form 4684 PDF filling — Casualties and Thefts, Section A.
 * Verifies that engine results and per-property calculations are correctly
 * mapped to PDF form fields.
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import Decimal from "decimal.js";
import { calculateForm4684 } from "@/engine/forms/form-4684.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm4684, FORM_4684_FIELDS } from "@/pdf/fill-form-4684.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";

const d = (value: number | string) => new Decimal(value);

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

const BLANK_PDF = "forms/blank/f4684.pdf";
const F = FORM_4684_FIELDS;

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-4684-"));
}

/** Minimal input fixture */
function makeFixture(form4684Events: TaxYearInput["form4684"]): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Jane",
        lastName: "Storm",
        ssn: "123-45-6789",
        dateOfBirth: "1975-04-10",
        occupation: "Engineer",
      },
      address: {
        street: "100 Main St",
        city: "Houston",
        state: "TX",
        zip: "77001",
      },
      dependents: [],
    },
    w2s: [{
      employer: { name: "ACME Corp", ein: "12-3456789" },
      wages: "100000",
      federalWithheld: "15000",
      socialSecurityWages: "100000",
      socialSecurityWithheld: "6200",
      medicareWages: "100000",
      medicareWithheld: "1450",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "TX",
    }],
    form4684: form4684Events,
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
  };
}

function makeResult(input: TaxYearInput, agi: number): TaxReturnResult {
  const form4684Result = calculateForm4684(input.form4684!, d(agi));
  return {
    taxYear: 2025,
    filingStatus: "single",
    form1040: {
      line1: d(100000),
      line9: d(100000),
      line11: d(agi),
      line12: d(14600),
      line15: d(85400),
      line16: d(0),
      line22: d(0),
      line24: d(0),
      line25a: d(0),
      line25d: d(15000),
      line33: d(15000),
      line34: d(0),
      line37: d(0),
    },
    deductionUsed: "standard",
    deductionAmount: d(14600),
    form4684: form4684Result,
    lines: [],
  } as unknown as TaxReturnResult;
}

// ── Single property, single event ─────────────────────────────────────────

describe("Form 4684 PDF - single property casualty loss", () => {
  const input = makeFixture({
    events: [{
      description: "Hurricane Milton",
      femaDeclarationNumber: "DR-4828",
      properties: [{
        description: "Home roof damage",
        costOrBasis: "50000",
        insuranceReimbursement: "10000",
        fairMarketValueBefore: "200000",
        fairMarketValueAfter: "160000",
      }],
    }],
  });
  const agi = 100000;
  const result = makeResult(input, agi);
  let doc: PDFDocument;

  it("Form 4684 PDF - fills header with taxpayer name and SSN", async () => {
    doc = await fillForm4684(input, result, BLANK_PDF);
    expect(getFieldText(doc, F.name)).toBe("Jane Storm");
    expect(getFieldText(doc, F.ssn)).toBe("123456789");
  });

  it("Form 4684 PDF - checks disaster box and fills DR number", async () => {
    doc = await fillForm4684(input, result, BLANK_PDF);
    expect(isChecked(doc, F.disasterCheckbox)).toBe(true);
    expect(getFieldText(doc, F.drNumber)).toBe("4828");
  });

  it("Form 4684 PDF - fills property A description", async () => {
    doc = await fillForm4684(input, result, BLANK_PDF);
    expect(getFieldText(doc, F.properties[0].type)).toBe("Home roof damage");
  });

  it("Form 4684 PDF - fills per-property lines 2-9 for column A", async () => {
    doc = await fillForm4684(input, result, BLANK_PDF);

    // Line 2: Cost/basis = 50000
    expect(getFieldText(doc, F.line2[0])).toBe("50000");
    // Line 3: Insurance = 10000
    expect(getFieldText(doc, F.line3[0])).toBe("10000");
    // Line 4: Gain = max(0, 10000 - 50000) = 0 → empty
    expect(getFieldText(doc, F.line4[0])).toBeUndefined();
    // Line 5: FMV before = 200000
    expect(getFieldText(doc, F.line5[0])).toBe("200000");
    // Line 6: FMV after = 160000
    expect(getFieldText(doc, F.line6[0])).toBe("160000");
    // Line 7: FMV decrease = 40000
    expect(getFieldText(doc, F.line7[0])).toBe("40000");
    // Line 8: Smaller of basis (50000) or FMV decrease (40000) = 40000
    expect(getFieldText(doc, F.line8[0])).toBe("40000");
    // Line 9: Loss = 40000 - 10000 = 30000
    expect(getFieldText(doc, F.line9[0])).toBe("30000");
  });

  it("Form 4684 PDF - fills per-event summary lines 10-12", async () => {
    doc = await fillForm4684(input, result, BLANK_PDF);

    // Line 10: Total loss = 30000
    expect(getFieldText(doc, F.line10)).toBe("30000");
    // Line 11: $100 per-event floor
    expect(getFieldText(doc, F.line11)).toBe("100");
    // Line 12: 30000 - 100 = 29900
    expect(getFieldText(doc, F.line12)).toBe("29900");
  });

  it("Form 4684 PDF - fills aggregate summary lines 13-18", async () => {
    doc = await fillForm4684(input, result, BLANK_PDF);

    // Line 13: Total gains = 0 → empty
    expect(getFieldText(doc, F.line13)).toBeUndefined();
    // Line 14: Total losses = 29900
    expect(getFieldText(doc, F.line14)).toBe("29900");
    // Line 15: Net gain → empty (no gain)
    expect(getFieldText(doc, F.line15)).toBeUndefined();
    // Line 16: Net loss before AGI = 29900
    expect(getFieldText(doc, F.line16)).toBe("29900");
    // Line 17: 10% of AGI = 10000
    expect(getFieldText(doc, F.line17)).toBe("10000");
    // Line 18: Deductible loss = 29900 - 10000 = 19900
    expect(getFieldText(doc, F.line18)).toBe("19900");
  });
});

// ── Multiple properties in one event ──────────────────────────────────────

describe("Form 4684 PDF - multiple properties", () => {
  const input = makeFixture({
    events: [{
      description: "Tornado",
      femaDeclarationNumber: "DR-5000",
      properties: [
        {
          description: "Garage",
          costOrBasis: "30000",
          insuranceReimbursement: "5000",
          fairMarketValueBefore: "30000",
          fairMarketValueAfter: "10000",
        },
        {
          description: "Fence",
          costOrBasis: "8000",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "8000",
          fairMarketValueAfter: "0",
        },
      ],
    }],
  });
  const agi = 80000;
  const result = makeResult(input, agi);

  it("Form 4684 PDF - fills both property columns A and B", async () => {
    const doc = await fillForm4684(input, result, BLANK_PDF);

    // Property A: Garage
    expect(getFieldText(doc, F.properties[0].type)).toBe("Garage");
    expect(getFieldText(doc, F.line2[0])).toBe("30000");
    expect(getFieldText(doc, F.line3[0])).toBe("5000");
    // FMV decrease = 20000, min(30000, 20000) = 20000, loss = 20000 - 5000 = 15000
    expect(getFieldText(doc, F.line9[0])).toBe("15000");

    // Property B: Fence
    expect(getFieldText(doc, F.properties[1].type)).toBe("Fence");
    expect(getFieldText(doc, F.line2[1])).toBe("8000");
    // FMV decrease = 8000, min(8000, 8000) = 8000, loss = 8000 - 0 = 8000
    expect(getFieldText(doc, F.line9[1])).toBe("8000");

    // Line 10: Total = 15000 + 8000 = 23000
    expect(getFieldText(doc, F.line10)).toBe("23000");
  });

  it("Form 4684 PDF - leaves unused property columns empty", async () => {
    const doc = await fillForm4684(input, result, BLANK_PDF);

    // Property C and D should be empty
    expect(getFieldText(doc, F.properties[2].type)).toBeUndefined();
    expect(getFieldText(doc, F.line2[2])).toBeUndefined();
    expect(getFieldText(doc, F.line2[3])).toBeUndefined();
  });
});

// ── Casualty gain (insurance exceeds basis) ───────────────────────────────

describe("Form 4684 PDF - casualty gain", () => {
  const input = makeFixture({
    events: [{
      description: "Flood",
      femaDeclarationNumber: "DR-4900",
      properties: [{
        description: "Old car",
        costOrBasis: "5000",
        insuranceReimbursement: "12000",
        fairMarketValueBefore: "8000",
        fairMarketValueAfter: "0",
      }],
    }],
  });
  const agi = 50000;
  const result = makeResult(input, agi);

  it("Form 4684 PDF - fills gain on line 4 when insurance exceeds basis", async () => {
    const doc = await fillForm4684(input, result, BLANK_PDF);

    // Line 2: basis = 5000
    expect(getFieldText(doc, F.line2[0])).toBe("5000");
    // Line 3: insurance = 12000
    expect(getFieldText(doc, F.line3[0])).toBe("12000");
    // Line 4: gain = 12000 - 5000 = 7000
    expect(getFieldText(doc, F.line4[0])).toBe("7000");
    // Line 9: loss = 0 → empty (since insurance > basis, skip lines 5-9)
    expect(getFieldText(doc, F.line9[0])).toBeUndefined();
  });

  it("Form 4684 PDF - fills net casualty gain on line 15", async () => {
    const doc = await fillForm4684(input, result, BLANK_PDF);

    // Engine result: totalGains = 7000, totalLosses = 0
    // Line 13 (gains): 7000
    expect(getFieldText(doc, F.line13)).toBe("7000");
    // Line 14 (losses): 0 → empty
    expect(getFieldText(doc, F.line14)).toBeUndefined();
    // Line 15 (net gain): 7000
    expect(getFieldText(doc, F.line15)).toBe("7000");
  });
});

// ── EM declaration number ─────────────────────────────────────────────────

describe("Form 4684 PDF - EM declaration", () => {
  it("Form 4684 PDF - fills EM number when declaration starts with EM-", async () => {
    const input = makeFixture({
      events: [{
        description: "Emergency",
        femaDeclarationNumber: "EM-3600",
        properties: [{
          description: "Shed",
          costOrBasis: "3000",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "3000",
          fairMarketValueAfter: "0",
        }],
      }],
    });
    const result = makeResult(input, 50000);
    const doc = await fillForm4684(input, result, BLANK_PDF);

    expect(isChecked(doc, F.disasterCheckbox)).toBe(true);
    expect(getFieldText(doc, F.emNumber)).toBe("3600");
    // DR field should not be filled
    expect(getFieldText(doc, F.drNumber)).toBeUndefined();
  });
});

// ── No form 4684 data ─────────────────────────────────────────────────────

describe("Form 4684 PDF - no casualty data", () => {
  it("Form 4684 PDF - fills only header when no form4684 result", async () => {
    const input = makeFixture(undefined);
    const result = {
      taxYear: 2025,
      filingStatus: "single",
      form1040: {
        line1: d(100000),
        line11: d(100000),
      },
      deductionUsed: "standard",
      deductionAmount: d(14600),
      lines: [],
    } as unknown as TaxReturnResult;

    const doc = await fillForm4684(input, result, BLANK_PDF);
    expect(getFieldText(doc, F.name)).toBe("Jane Storm");
    expect(getFieldText(doc, F.ssn)).toBe("123456789");
    // No line data filled
    expect(getFieldText(doc, F.line10)).toBeUndefined();
  });
});

describe("Form 4684 packet inclusion", () => {
  it("fillReturn attaches Form 4684 for a deductible disaster loss", async () => {
    const outputDir = await makeOutputDir();
    try {
      const deductibleLossFixture = makeFixture({
        events: [{
          description: "Hailstorm",
          femaDeclarationNumber: "DR-6001",
          properties: [{
            description: "Roof",
            costOrBasis: "40000",
            insuranceReimbursement: "5000",
            fairMarketValueBefore: "180000",
            fairMarketValueAfter: "140000",
          }],
        }],
      });
      const deductibleLossResult = calculateFederalTax(deductibleLossFixture);
      expect(deductibleLossResult.form4684?.deductibleLoss.toNumber()).toBeGreaterThan(0);

      const deductibleLossPacket = await fillReturn(deductibleLossFixture, deductibleLossResult, {
        blankFormsDir: "forms/blank",
        outputDir,
      });
      const deductibleLossPath = deductibleLossPacket.filledForms.find((path) => path.endsWith("f4684-filled.pdf"));

      expect(deductibleLossPath).toBeDefined();
      await access(deductibleLossPath!);
      expect((await readFile(deductibleLossPath!)).length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn attaches Form 4684 for a net casualty gain", async () => {
    const outputDir = await makeOutputDir();
    try {
      const netGainFixture = makeFixture({
        events: [{
          description: "Flood",
          femaDeclarationNumber: "DR-6002",
          properties: [{
            description: "Vehicle",
            costOrBasis: "5000",
            insuranceReimbursement: "9000",
            fairMarketValueBefore: "7000",
            fairMarketValueAfter: "0",
          }],
        }],
      });
      const netGainResult = calculateFederalTax(netGainFixture);
      expect(netGainResult.form4684?.netCasualtyGain.toNumber()).toBeGreaterThan(0);

      const netGainPacket = await fillReturn(netGainFixture, netGainResult, {
        blankFormsDir: "forms/blank",
        outputDir,
      });
      const netGainPath = netGainPacket.filledForms.find((path) => path.endsWith("f4684-filled.pdf"));

      expect(netGainPath).toBeDefined();
      await access(netGainPath!);
      expect((await readFile(netGainPath!)).length).toBeGreaterThan(0);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fillReturn omits Form 4684 when no residual loss or gain remains", async () => {
    const outputDir = await makeOutputDir();
    try {
      const noResidualFixture = makeFixture({
        events: [{
          description: "Minor wind damage",
          femaDeclarationNumber: "DR-6003",
          properties: [{
            description: "Mailbox",
            costOrBasis: "300",
            insuranceReimbursement: "300",
            fairMarketValueBefore: "300",
            fairMarketValueAfter: "0",
          }],
        }],
      });
      const noResidualResult = calculateFederalTax(noResidualFixture);
      expect(noResidualResult.form4684?.deductibleLoss.toNumber()).toBe(0);
      expect(noResidualResult.form4684?.netCasualtyGain.toNumber()).toBe(0);

      const noResidualPacket = await fillReturn(noResidualFixture, noResidualResult, {
        blankFormsDir: "forms/blank",
        outputDir,
      });
      const noResidualPath = noResidualPacket.filledForms.find((path) => path.endsWith("f4684-filled.pdf"));

      expect(noResidualPath).toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});

// ── Currency formatting ───────────────────────────────────────────────────

describe("Form 4684 PDF - currency formatting", () => {
  it("Form 4684 PDF - zero values produce empty fields", async () => {
    const input = makeFixture({
      events: [{
        description: "Minor event",
        femaDeclarationNumber: "DR-9999",
        properties: [{
          description: "Mailbox",
          costOrBasis: "200",
          insuranceReimbursement: "200",
          fairMarketValueBefore: "200",
          fairMarketValueAfter: "0",
        }],
      }],
    });
    const result = makeResult(input, 50000);
    const doc = await fillForm4684(input, result, BLANK_PDF);

    // Insurance fully covers basis: gain = 0 (empty), loss = 0 (empty)
    expect(getFieldText(doc, F.line4[0])).toBeUndefined();
    expect(getFieldText(doc, F.line9[0])).toBeUndefined();
  });
});
