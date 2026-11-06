/**
 * Tests for Form 8606 — Nondeductible IRAs PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm8606, FORM_8606_FIELDS } from "@/pdf/fill-form-8606.js";
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

const BLANK_8606 = "forms/blank/2025/f8606.pdf";
const F = FORM_8606_FIELDS;

// ─── Fixture 1: Single filer — nondeductible contribution + distribution ──

const singleWithDistributionFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Alice",
      lastName: "Johnson",
      ssn: "111-22-3333",
      dateOfBirth: "1985-03-10",
    },
    address: {
      street: "100 Oak Ave",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "TechCo", ein: "11-1111111" },
      wages: "95000",
      federalWithheld: "14000",
      socialSecurityWages: "95000",
      socialSecurityWithheld: "5890",
      medicareWages: "95000",
      medicareWithheld: "1377.50",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "TX",
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
  form8606: {
    nondeductibleContributions: "7000",
    priorYearBasis: "14000",
    yearEndValue: "120000",
    traditionalDistributions: "10000",
    rothConversions: "0",
  },
};

describe("Form 8606 PDF filling — Single filer with distribution", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(singleWithDistributionFixture);
    doc = await fillForm8606(
      singleWithDistributionFixture,
      result,
      BLANK_8606,
      "primary",
    );
  });

  it("fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Alice Johnson");
    expect(getFieldText(doc, F.ssn)).toBe("111223333");
  });

  it("Part I Line 1 — nondeductible contributions for the year", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line1)).toBe(formatCurrency(f8606.line1));
  });

  it("Part I Line 2 — prior year basis", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line2)).toBe(formatCurrency(f8606.line2));
  });

  it("Part I Line 3 — sum of lines 1 and 2", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line3)).toBe(formatCurrency(f8606.line3));
    // 7000 + 14000 = 21000
    expect(f8606.line3.toNumber()).toBe(21000);
  });

  it("Part I Line 5 — line 3 minus line 4", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line5)).toBe(formatCurrency(f8606.line5));
  });

  it("Part I Line 6 — year-end value of traditional IRAs", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line6)).toBe(formatCurrency(f8606.line6));
  });

  it("Part I Line 7 — distributions from traditional IRAs", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line7)).toBe(formatCurrency(f8606.line7));
  });

  it("Part I Line 9 — sum of lines 6, 7, 8", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line9)).toBe(formatCurrency(f8606.line9));
  });

  it("Part I Line 10 — ratio as split integer.decimal fields", () => {
    const f8606 = result.form8606!;
    // line10 = line5 / line9
    expect(f8606.line10.gt(0)).toBe(true);
    expect(f8606.line10.lte(1)).toBe(true);
    // Verify the integer and decimal parts are filled
    const intField = getFieldText(doc, F.line10int);
    const decField = getFieldText(doc, F.line10dec);
    expect(intField).toBeDefined();
    expect(decField).toBeDefined();
    // Reconstruct and verify
    const reconstructed = new Decimal(`${intField}.${decField}`);
    expect(reconstructed.toDecimalPlaces(3).toString()).toBe(
      f8606.line10.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toString(),
    );
  });

  it("Part I Line 12 — nontaxable portion of distributions", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line12)).toBe(formatCurrency(f8606.line12));
  });

  it("Part I Line 13 — total nontaxable portion", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line13)).toBe(formatCurrency(f8606.line13));
  });

  it("Part I Line 14 — basis for next year", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line14)).toBe(formatCurrency(f8606.line14));
  });

  it("Part I Line 15a — taxable distributions", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line15a)).toBe(formatCurrency(f8606.line15a));
  });

  it("Part I Line 15c — taxable amount", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line15c)).toBe(formatCurrency(f8606.line15c));
  });
});

// ─── Fixture 2: Single filer — Roth conversion (Parts I and II) ──────────

const rothConversionFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Bob",
      lastName: "Martinez",
      ssn: "444-55-6666",
      dateOfBirth: "1978-08-22",
    },
    address: {
      street: "200 Elm St",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "DesignCo", ein: "22-2222222" },
      wages: "110000",
      federalWithheld: "16500",
      socialSecurityWages: "110000",
      socialSecurityWithheld: "6820",
      medicareWages: "110000",
      medicareWithheld: "1595",
      stateTaxWithheld: "0",
      stateWages: "0",
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
  form8606: {
    nondeductibleContributions: "7000",
    priorYearBasis: "28000",
    yearEndValue: "50000",
    traditionalDistributions: "0",
    rothConversions: "30000",
  },
};

describe("Form 8606 PDF filling — Roth conversion (Parts I and II)", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(rothConversionFixture);
    doc = await fillForm8606(
      rothConversionFixture,
      result,
      BLANK_8606,
      "primary",
    );
  });

  it("fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Bob Martinez");
    expect(getFieldText(doc, F.ssn)).toBe("444556666");
  });

  it("Part I Line 1 — nondeductible contributions", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line1)).toBe(formatCurrency(f8606.line1));
    expect(f8606.line1.toNumber()).toBe(7000);
  });

  it("Part I Line 3 — total basis (line 1 + line 2)", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line3)).toBe(formatCurrency(f8606.line3));
    // 7000 + 28000 = 35000
    expect(f8606.line3.toNumber()).toBe(35000);
  });

  it("Part I Line 8 — net conversion amount", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line8)).toBe(formatCurrency(f8606.line8));
    expect(f8606.line8.toNumber()).toBe(30000);
  });

  it("Part I Line 11 — nontaxable portion of conversion", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line11)).toBe(formatCurrency(f8606.line11));
    // line11 = line8 × line10 (the nontaxable portion)
    expect(f8606.line11.gt(0)).toBe(true);
  });

  it("Part II Line 16 — net conversion amount (same as line 8)", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line16)).toBe(formatCurrency(f8606.line16));
    expect(f8606.line16.toNumber()).toBe(30000);
  });

  it("Part II Line 17 — basis in conversion (same as line 11)", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line17)).toBe(formatCurrency(f8606.line17));
  });

  it("Part II Line 18 — taxable conversion (line 16 - line 17)", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line18)).toBe(formatCurrency(f8606.line18));
    // Taxable portion = conversion - nontaxable basis
    expect(f8606.line18.toNumber()).toBe(
      f8606.line16.minus(f8606.line17).toNumber(),
    );
  });
});

// ─── Fixture 3: Single filer — Roth distribution (Part III) ──────────────

const rothDistributionFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Carol",
      lastName: "Davis",
      ssn: "777-88-9999",
      dateOfBirth: "1970-12-01",
    },
    address: {
      street: "300 Maple Dr",
      city: "Seattle",
      state: "WA",
      zip: "98101",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "CloudCo", ein: "33-3333333" },
      wages: "130000",
      federalWithheld: "19500",
      socialSecurityWages: "130000",
      socialSecurityWithheld: "8060",
      medicareWages: "130000",
      medicareWithheld: "1885",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "WA",
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
  form8606: {
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "15000",
    rothContributionBasis: "40000",
    rothConversionBasis: "20000",
  },
};

describe("Form 8606 PDF filling — Roth distribution (Part III)", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(rothDistributionFixture);
    doc = await fillForm8606(
      rothDistributionFixture,
      result,
      BLANK_8606,
      "primary",
    );
  });

  it("fills header correctly", () => {
    expect(getFieldText(doc, F.name)).toBe("Carol Davis");
    expect(getFieldText(doc, F.ssn)).toBe("777889999");
  });

  it("Part III Line 19 — nonqualified Roth distributions", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line19)).toBe(formatCurrency(f8606.line19));
    expect(f8606.line19.toNumber()).toBe(15000);
  });

  it("Part III Line 21 — line 19 minus line 20", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line21)).toBe(formatCurrency(f8606.line21));
  });

  it("Part III Line 22 — Roth contribution basis", () => {
    const f8606 = result.form8606!;
    expect(getFieldText(doc, F.line22)).toBe(formatCurrency(f8606.line22));
  });

  it("Part III Line 23 — line 21 minus line 22 (zero-floored)", () => {
    const f8606 = result.form8606!;
    // 15000 - 40000 = negative, so zero — field is left blank per IRS convention
    expect(f8606.line23.toNumber()).toBe(0);
    // Zero values produce empty string from formatCurrency, which setTextField skips
    expect(getFieldText(doc, F.line23)).toBeUndefined();
  });

  it("Part III Line 25c — taxable amount is zero when basis exceeds distribution", () => {
    const f8606 = result.form8606!;
    expect(f8606.line25c.toNumber()).toBe(0);
  });
});

// ─── Fixture 4: MFJ per-owner filling ────────────────────────────────────

const mfjFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "David",
      lastName: "Lee",
      ssn: "222-33-4444",
      dateOfBirth: "1980-06-15",
    },
    spouse: {
      firstName: "Emily",
      lastName: "Lee",
      ssn: "555-66-7777",
      dateOfBirth: "1982-09-20",
    },
    address: {
      street: "400 Birch Ln",
      city: "Chicago",
      state: "IL",
      zip: "60601",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "FinCo", ein: "44-4444444" },
      wages: "120000",
      federalWithheld: "18000",
      socialSecurityWages: "120000",
      socialSecurityWithheld: "7440",
      medicareWages: "120000",
      medicareWithheld: "1740",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "IL",
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
  form8606ByOwner: {
    primary: {
      nondeductibleContributions: "7000",
      priorYearBasis: "10000",
      yearEndValue: "80000",
      traditionalDistributions: "5000",
      rothConversions: "0",
    },
    spouse: {
      nondeductibleContributions: "7000",
      priorYearBasis: "6000",
      yearEndValue: "45000",
      traditionalDistributions: "0",
      rothConversions: "15000",
    },
  },
};

describe("Form 8606 PDF filling — MFJ per-owner", () => {
  let primaryDoc: PDFDocument;
  let spouseDoc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjFixture);
    primaryDoc = await fillForm8606(
      mfjFixture,
      result,
      BLANK_8606,
      "primary",
    );
    spouseDoc = await fillForm8606(
      mfjFixture,
      result,
      BLANK_8606,
      "spouse",
    );
  });

  it("primary form has primary taxpayer name and SSN", () => {
    expect(getFieldText(primaryDoc, F.name)).toBe("David Lee");
    expect(getFieldText(primaryDoc, F.ssn)).toBe("222334444");
  });

  it("spouse form has spouse name and SSN", () => {
    expect(getFieldText(spouseDoc, F.name)).toBe("Emily Lee");
    expect(getFieldText(spouseDoc, F.ssn)).toBe("555667777");
  });

  it("primary form reflects primary IRA data", () => {
    const primary8606 = result.form8606ByOwner?.primary;
    expect(primary8606).toBeDefined();
    expect(getFieldText(primaryDoc, F.line1)).toBe(
      formatCurrency(primary8606!.line1),
    );
    expect(getFieldText(primaryDoc, F.line7)).toBe(
      formatCurrency(primary8606!.line7),
    );
  });

  it("spouse form reflects spouse IRA data with Roth conversion", () => {
    const spouse8606 = result.form8606ByOwner?.spouse;
    expect(spouse8606).toBeDefined();
    expect(getFieldText(spouseDoc, F.line1)).toBe(
      formatCurrency(spouse8606!.line1),
    );
    // Spouse has Roth conversion
    expect(getFieldText(spouseDoc, F.line8)).toBe(
      formatCurrency(spouse8606!.line8),
    );
    expect(spouse8606!.line8.toNumber()).toBe(15000);
  });

  it("spouse Part II lines are filled for conversion", () => {
    const spouse8606 = result.form8606ByOwner?.spouse;
    expect(spouse8606).toBeDefined();
    expect(getFieldText(spouseDoc, F.line16)).toBe(
      formatCurrency(spouse8606!.line16),
    );
    expect(getFieldText(spouseDoc, F.line18)).toBe(
      formatCurrency(spouse8606!.line18),
    );
  });
});

// ─── Edge case: returns blank doc when no Form 8606 result ───────────────

describe("Form 8606 PDF filling — no result", () => {
  it("returns an unfilled document when form8606 is undefined", async () => {
    const input: TaxYearInput = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Nobody",
          lastName: "Here",
          ssn: "000-00-0000",
          dateOfBirth: "2000-01-01",
        },
        address: {
          street: "1 Empty Rd",
          city: "Nowhere",
          state: "TX",
          zip: "00000",
        },
        dependents: [],
      },
      w2s: [
        {
          employer: { name: "None", ein: "00-0000000" },
          wages: "50000",
          federalWithheld: "5000",
          socialSecurityWages: "50000",
          socialSecurityWithheld: "3100",
          medicareWages: "50000",
          medicareWithheld: "725",
          stateTaxWithheld: "0",
          stateWages: "0",
          localTaxWithheld: "0",
          state: "TX",
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
    };
    const result = calculateFederalTax(input);
    const doc = await fillForm8606(input, result, BLANK_8606, "primary");
    // No form data — line fields should be empty
    expect(getFieldText(doc, F.line1)).toBeUndefined();
    expect(getFieldText(doc, F.line14)).toBeUndefined();
  });
});
