/**
 * Tests for Form 4797 PDF filling — Sales of Business Property.
 * Verifies that engine results are correctly mapped to PDF form fields.
 *
 * Scenarios:
 *   1. Section 1245 property sale (equipment) — full depreciation recapture
 *   2. Section 1250 property sale (building) — partial recapture
 *   3. K-1 section 1231 gains flowing to Part I
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import Decimal from "decimal.js";
import { calculateForm4797 } from "@/engine/forms/form-4797.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm4797, FORM_4797_FIELDS } from "@/pdf/fill-form-4797.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";

const d = (n: number | string) => new Decimal(n);

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

const BLANK_4797 = "forms/blank/2025/f4797.pdf";
const F = FORM_4797_FIELDS;

// ─── Scenario 1: Section 1245 Equipment Sale ─────────────────────────────

describe("Form 4797 PDF fill — Section 1245 equipment sale with K-1", () => {
  let doc: PDFDocument;
  let input: TaxYearInput;
  let result: TaxReturnResult;

  beforeAll(async () => {
    input = {
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Acme Capital LP",
          partnershipEIN: "99-8765432",
          ordinaryIncome: "0",
          section1231Gain: "15000",
          isPassiveActivity: false,
        },
      ],
      form4797: {
        nonrecapturedNetSection1231Losses: "3000",
        propertySales: [
          {
            description: "Office Equipment",
            dateAcquired: "2020-03-15",
            dateSold: "2025-09-01",
            costOrBasis: "50000",
            depreciationAllowed: "35000",
            grossSalesPrice: "30000",
            propertyType: "section1245" as const,
            heldMoreThanOneYear: true,
          },
        ],
      },
    };
    result = calculateFederalTax(input);
    doc = await fillForm4797(input, result, BLANK_4797);
  });

  it("fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Jane Doe");
    expect(getFieldText(doc, F.ssn)).toBe("123456789");
  });

  it("fills Part I Line 2 with K-1 section 1231 entry", () => {
    const row = F.partIRows[0];
    expect(getFieldText(doc, row.description)).toBe("K-1: Acme Capital LP");
    expect(getFieldText(doc, row.dateAcquired)).toBe("Various");
    expect(getFieldText(doc, row.gainLoss)).toBe("15000");
  });

  it("fills Part I summary lines", () => {
    const f4797 = result.form4797!;
    expect(getFieldText(doc, F.line7)).toBe(formatCurrency(f4797.line7));
    expect(getFieldText(doc, F.line8)).toBe(formatCurrency(f4797.line8));
    expect(getFieldText(doc, F.line9)).toBe(formatCurrency(f4797.line9));
  });

  it("Part I Line 7 combines K-1 and property section 1231 amounts", () => {
    const f4797 = result.form4797!;
    // K-1: $15,000 + property section 1231 gain (non-recapture from Part III)
    // Office Equipment: cost $50k, depr $35k, adj basis $15k, sale $30k
    // Gain = $15k, 1245 recapture = min($15k, $35k) = $15k, non-recapture = $0
    // So section 1231 from property = $0, and line 7 = K-1 $15,000
    expect(f4797.line7.toNumber()).toBe(15000);
  });

  it("Part I Line 8 reflects nonrecaptured prior-year losses", () => {
    expect(getFieldText(doc, F.line8)).toBe("3000");
  });

  it("fills Part III for the section 1245 property", () => {
    const col = F.partIIICols[0];
    // Line 19 header
    expect(getFieldText(doc, col.description)).toBe("Office Equipment");
    expect(getFieldText(doc, col.dateAcquired)).toBe("2020-03-15");
    expect(getFieldText(doc, col.dateSold)).toBe("2025-09-01");

    // Lines 20-24
    expect(getFieldText(doc, col.line20)).toBe("50000"); // cost
    expect(getFieldText(doc, col.line21)).toBe("35000"); // depreciation
    expect(getFieldText(doc, col.line22)).toBe("15000"); // adjusted basis
    expect(getFieldText(doc, col.line23)).toBe("30000"); // gross sales price
    expect(getFieldText(doc, col.line24)).toBe("15000"); // total gain

    // Section 1245 recapture
    expect(getFieldText(doc, col.line25a)).toBe("35000"); // depreciation
    expect(getFieldText(doc, col.line25b)).toBe("100%");
    expect(getFieldText(doc, col.line27a)).toBe("15000"); // recapture = min(gain, depr)
  });

  it("fills Part III line 27c with total recapture", () => {
    const col = F.partIIICols[0];
    expect(getFieldText(doc, col.line27c)).toBe("15000");
  });

  it("section 1245 full recapture leaves zero non-recapture gain on line 28a", () => {
    const col = F.partIIICols[0];
    // Non-recapture gain = $15k - $15k = $0 → not filled (zero)
    expect(getFieldText(doc, col.line28a)).toBeUndefined();
  });

  it("fills Part II line 13 with recapture from Part III", () => {
    const f4797 = result.form4797!;
    expect(getFieldText(doc, F.line13)).toBe(formatCurrency(f4797.partIIRecapture));
    expect(f4797.partIIRecapture.toNumber()).toBe(15000);
  });

  it("fills Part II line 17 with total ordinary gain", () => {
    const f4797 = result.form4797!;
    expect(getFieldText(doc, F.line17)).toBe(formatCurrency(f4797.ordinaryGainOrLoss));
  });

  it("fills Part III summary line 30 with total recapture", () => {
    expect(getFieldText(doc, F.line30)).toBe("15000");
  });
});

// ─── Scenario 2: Section 1250 Building Sale ──────────────────────────────

describe("Form 4797 PDF fill — Section 1250 building sale (post-1986 MACRS)", () => {
  let doc: PDFDocument;
  let input: TaxYearInput;
  let result: TaxReturnResult;

  beforeAll(async () => {
    input = {
      ...simpleW2Fixture,
      form4797: {
        nonrecapturedNetSection1231Losses: "0",
        propertySales: [
          {
            description: "Rental Building",
            dateAcquired: "2015-06-01",
            dateSold: "2025-11-15",
            costOrBasis: "300000",
            depreciationAllowed: "80000",
            grossSalesPrice: "350000",
            propertyType: "section1250" as const,
            heldMoreThanOneYear: true,
            // straightLineDepreciation defaults to depreciationAllowed (post-1986 MACRS)
            // → $0 section 1250 ordinary recapture (all straight-line)
          },
        ],
      },
    };
    result = calculateFederalTax(input);
    doc = await fillForm4797(input, result, BLANK_4797);
  });

  it("fills Part III for section 1250 property", () => {
    const col = F.partIIICols[0];
    expect(getFieldText(doc, col.description)).toBe("Rental Building");
    expect(getFieldText(doc, col.line20)).toBe("300000");
    expect(getFieldText(doc, col.line21)).toBe("80000");
    expect(getFieldText(doc, col.line22)).toBe("220000"); // 300k - 80k
    expect(getFieldText(doc, col.line23)).toBe("350000");
    expect(getFieldText(doc, col.line24)).toBe("130000"); // 350k - 220k
  });

  it("section 1250 post-1986 MACRS has zero ordinary recapture", () => {
    const f4797 = result.form4797!;
    const pr = f4797.propertyResults[0];
    // Post-1986 MACRS: all depreciation is straight-line, so excess = $0
    expect(pr.section1250Recapture.toNumber()).toBe(0);
    expect(pr.totalRecapture.toNumber()).toBe(0);
  });

  it("full gain flows to section 1231 (Part I) since no recapture", () => {
    const f4797 = result.form4797!;
    const pr = f4797.propertyResults[0];
    // Non-recapture gain = $130k, all goes to section 1231
    expect(pr.section1231Gain.toNumber()).toBe(130000);
    expect(getFieldText(doc, F.partIIICols[0].line29a)).toBe("130000");
  });

  it("Part I line 7 includes section 1231 gain from property", () => {
    const f4797 = result.form4797!;
    expect(f4797.line7.toNumber()).toBe(130000);
    expect(getFieldText(doc, F.line7)).toBe("130000");
  });

  it("line 6 carries section 1231 gain from Part III", () => {
    expect(getFieldText(doc, F.line6)).toBe("130000");
  });

  it("Part III summary line 32 shows section 1231 gain to Part I", () => {
    expect(getFieldText(doc, F.line32)).toBe("130000");
  });

  it("tracks unrecaptured section 1250 gain for 25% rate", () => {
    const f4797 = result.form4797!;
    const pr = f4797.propertyResults[0];
    // Straight-line depreciation not recaptured as ordinary, taxed at max 25%
    expect(pr.unrecapturedSection1250Gain.toNumber()).toBe(80000);
  });
});

// ─── Scenario 3: Multiple Properties ─────────────────────────────────────

describe("Form 4797 PDF fill — multiple property sales", () => {
  let doc: PDFDocument;
  let input: TaxYearInput;
  let result: TaxReturnResult;

  beforeAll(async () => {
    input = {
      ...simpleW2Fixture,
      form4797: {
        nonrecapturedNetSection1231Losses: "0",
        propertySales: [
          {
            description: "Machinery",
            dateAcquired: "2021-01-10",
            dateSold: "2025-06-15",
            costOrBasis: "20000",
            depreciationAllowed: "12000",
            grossSalesPrice: "15000",
            propertyType: "section1245" as const,
            heldMoreThanOneYear: true,
          },
          {
            description: "Warehouse",
            dateAcquired: "2018-04-01",
            dateSold: "2025-08-20",
            costOrBasis: "200000",
            depreciationAllowed: "50000",
            grossSalesPrice: "250000",
            propertyType: "section1250" as const,
            heldMoreThanOneYear: true,
          },
        ],
      },
    };
    result = calculateFederalTax(input);
    doc = await fillForm4797(input, result, BLANK_4797);
  });

  it("fills Part III columns for both properties", () => {
    expect(getFieldText(doc, F.partIIICols[0].description)).toBe("Machinery");
    expect(getFieldText(doc, F.partIIICols[1].description)).toBe("Warehouse");
  });

  it("Machinery section 1245: gain $7k, full recapture $7k", () => {
    const col = F.partIIICols[0];
    // Cost $20k, depr $12k, adj basis $8k, sale $15k → gain $7k
    // 1245 recapture = min($7k, $12k) = $7k
    expect(getFieldText(doc, col.line24)).toBe("7000");
    expect(getFieldText(doc, col.line27a)).toBe("7000");
    expect(getFieldText(doc, col.line27c)).toBe("7000");
  });

  it("Warehouse section 1250 (post-1986 MACRS): gain $100k, zero recapture", () => {
    const col = F.partIIICols[1];
    // Cost $200k, depr $50k, adj basis $150k, sale $250k → gain $100k
    // Section 1250 recapture = $0 (all straight-line for post-1986)
    expect(getFieldText(doc, col.line24)).toBe("100000");
    expect(getFieldText(doc, col.line29a)).toBe("100000"); // all section 1231
  });

  it("Part I line 7 includes section 1231 gain from warehouse only", () => {
    const f4797 = result.form4797!;
    // Machinery: full recapture, no section 1231 gain
    // Warehouse: $100k section 1231 gain
    expect(f4797.line7.toNumber()).toBe(100000);
    expect(getFieldText(doc, F.line7)).toBe("100000");
  });

  it("Part II includes total recapture from both properties", () => {
    const f4797 = result.form4797!;
    // Machinery recapture: $7k, Warehouse recapture: $0
    expect(f4797.partIIRecapture.toNumber()).toBe(7000);
    expect(getFieldText(doc, F.line13)).toBe("7000");
  });

  it("Part II line 17 is total ordinary gain", () => {
    const f4797 = result.form4797!;
    // Ordinary = Part I ordinary (line11 + line12) + Part II ordinary (recapture + short-term)
    // line11 = 0 (line7 > 0), line12 = 0 (no prior losses)
    // ordinary = 0 + 7000 = 7000
    expect(getFieldText(doc, F.line17)).toBe(formatCurrency(f4797.ordinaryGainOrLoss));
  });

  it("Part III summary line 30 totals all recapture", () => {
    expect(getFieldText(doc, F.line30)).toBe("7000");
  });

  it("Part III summary line 32 totals section 1231 gain to Part I", () => {
    expect(getFieldText(doc, F.line32)).toBe("100000");
  });
});
