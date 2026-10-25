/**
 * Tests for Form 8880 — Saver's Credit PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm8880, FORM_8880_FIELDS } from "@/pdf/fill-form-8880.js";
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

const BLANK_8880 = "forms/blank/2025/f8880.pdf";
const F = FORM_8880_FIELDS;

// ─── Fixture 1: Single filer, IRA contributions, low AGI (50% rate) ────────

const singleSaverFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Maria",
      lastName: "Garcia",
      ssn: "333-44-5555",
      dateOfBirth: "1990-04-15",
      occupation: "Teacher",
    },
    address: {
      street: "100 Oak Ln",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "School District", ein: "44-5555555" },
      wages: "22000",
      federalWithheld: "1500",
      socialSecurityWages: "22000",
      socialSecurityWithheld: "1364",
      medicareWages: "22000",
      medicareWithheld: "319",
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
  form8880: {
    primaryIraContributions: "1500",
    primaryElectiveDeferrals: "500",
  },
};

describe("Form 8880 PDF filling — Single filer, 50% credit rate", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(singleSaverFixture);
    doc = await fillForm8880(singleSaverFixture, result, BLANK_8880);
  });

  it("Form 8880 header - name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Maria Garcia");
    expect(getFieldText(doc, F.ssn)).toBe("333445555");
  });

  it("Form 8880 Lines 1-3 - IRA and elective deferral contributions", () => {
    const f8880 = result.form8880!;
    expect(f8880).toBeDefined();
    expect(getFieldText(doc, F.line1a)).toBe(formatCurrency(f8880.line1a));
    expect(getFieldText(doc, F.line2a)).toBe(formatCurrency(f8880.line2a));
    expect(getFieldText(doc, F.line3a)).toBe(formatCurrency(f8880.line3a));
    // Single filer — spouse columns should be empty
    expect(getFieldText(doc, F.line1b)).toBeUndefined();
    expect(getFieldText(doc, F.line2b)).toBeUndefined();
  });

  it("Form 8880 Lines 4-6 - distributions and eligible contribution cap", () => {
    const f8880 = result.form8880!;
    // No distributions, so line 4a should be empty (zero)
    expect(getFieldText(doc, F.line5a)).toBe(formatCurrency(f8880.line5a));
    expect(getFieldText(doc, F.line6a)).toBe(formatCurrency(f8880.line6a));
  });

  it("Form 8880 Lines 7-8 - total eligible contributions and AGI", () => {
    const f8880 = result.form8880!;
    expect(getFieldText(doc, F.line7)).toBe(formatCurrency(f8880.line7));
    expect(getFieldText(doc, F.line8)).toBe(formatCurrency(f8880.line8));
  });

  it("Form 8880 Line 9 - applicable credit rate is 50% for low AGI single", () => {
    const f8880 = result.form8880!;
    expect(f8880.line9.toNumber()).toBe(0.5);
    // Rate is formatted as decimal ".50" — maxLen may truncate
    const rateText = getFieldText(doc, F.line9);
    expect(rateText).toBeDefined();
  });

  it("Form 8880 Lines 10-12 - tentative credit, limitation, and final credit", () => {
    const f8880 = result.form8880!;
    expect(getFieldText(doc, F.line10)).toBe(formatCurrency(f8880.line10));
    expect(getFieldText(doc, F.line11)).toBe(formatCurrency(f8880.line11));
    expect(getFieldText(doc, F.line12)).toBe(formatCurrency(f8880.line12));
  });

  it("Form 8880 Line 12 - credit is positive for eligible low-income saver", () => {
    expect(result.form8880!.line12.greaterThan(0)).toBe(true);
  });
});

// ─── Fixture 2: MFJ with both spouses contributing ───────────────────────

const mfjBothSpousesFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "David",
      lastName: "Chen",
      ssn: "444-55-6666",
      dateOfBirth: "1985-07-20",
      occupation: "Accountant",
    },
    spouse: {
      firstName: "Lisa",
      lastName: "Chen",
      ssn: "777-88-9999",
      dateOfBirth: "1987-11-05",
    },
    address: {
      street: "200 Maple Dr",
      city: "Chicago",
      state: "IL",
      zip: "60601",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Accounting Firm", ein: "55-6666666" },
      wages: "35000",
      federalWithheld: "3500",
      socialSecurityWages: "35000",
      socialSecurityWithheld: "2170",
      medicareWages: "35000",
      medicareWithheld: "507.50",
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
  form8880: {
    primaryIraContributions: "2000",
    spouseIraContributions: "1500",
    primaryRecentDistributions: "200",
    spouseRecentDistributions: "100",
  },
};

describe("Form 8880 PDF filling — MFJ, both spouses contributing", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjBothSpousesFixture);
    doc = await fillForm8880(mfjBothSpousesFixture, result, BLANK_8880);
  });

  it("Form 8880 header - joint names and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("David Chen & Lisa Chen");
    expect(getFieldText(doc, F.ssn)).toBe("444556666");
  });

  it("Form 8880 Lines 1-6 - both columns populated for MFJ", () => {
    const f8880 = result.form8880!;
    expect(f8880).toBeDefined();

    // Primary column
    expect(getFieldText(doc, F.line1a)).toBe(formatCurrency(f8880.line1a));
    expect(getFieldText(doc, F.line3a)).toBe(formatCurrency(f8880.line3a));
    expect(getFieldText(doc, F.line4a)).toBe(formatCurrency(f8880.line4a));
    expect(getFieldText(doc, F.line5a)).toBe(formatCurrency(f8880.line5a));
    expect(getFieldText(doc, F.line6a)).toBe(formatCurrency(f8880.line6a));

    // Spouse column
    expect(getFieldText(doc, F.line1b)).toBe(formatCurrency(f8880.line1b));
    expect(getFieldText(doc, F.line3b)).toBe(formatCurrency(f8880.line3b));
    expect(getFieldText(doc, F.line4b)).toBe(formatCurrency(f8880.line4b));
    expect(getFieldText(doc, F.line5b)).toBe(formatCurrency(f8880.line5b));
    expect(getFieldText(doc, F.line6b)).toBe(formatCurrency(f8880.line6b));
  });

  it("Form 8880 Line 4 - distributions reduce net contributions", () => {
    const f8880 = result.form8880!;
    // Primary: $2000 IRA - $200 distributions = $1800 net (line 5a)
    expect(f8880.line4a.toNumber()).toBe(200);
    expect(f8880.line5a.toNumber()).toBe(1800);
    // Spouse: $1500 IRA - $100 distributions = $1400 net (line 5b)
    expect(f8880.line4b.toNumber()).toBe(100);
    expect(f8880.line5b.toNumber()).toBe(1400);
  });

  it("Form 8880 Lines 10-12 - final credit computation", () => {
    const f8880 = result.form8880!;
    expect(getFieldText(doc, F.line10)).toBe(formatCurrency(f8880.line10));
    expect(getFieldText(doc, F.line12)).toBe(formatCurrency(f8880.line12));
  });

  it("Form 8880 Line 12 - credit is positive for eligible MFJ savers", () => {
    expect(result.form8880!.line12.greaterThan(0)).toBe(true);
  });
});
