/**
 * Tests for Form 2441 — Child and Dependent Care Expenses PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm2441, FORM_2441_FIELDS } from "@/pdf/fill-form-2441.js";
import { fillReturn } from "@/pdf/fill-return.js";
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

const BLANK_2441 = "forms/blank/f2441.pdf";
const F = FORM_2441_FIELDS;

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-2441-"));
}

// ─── Fixture: Single filer with one qualifying child ──────────────────────

const singleOneChildFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Maria",
      lastName: "Santos",
      ssn: "222-33-4444",
      dateOfBirth: "1988-04-12",
    },
    address: {
      street: "789 Elm St",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    dependents: [
      {
        firstName: "Sofia",
        lastName: "Santos",
        ssn: "333-44-5555",
        dateOfBirth: "2020-07-01",
        relationship: "daughter",
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Tech Solutions", ein: "12-3456789" },
      wages: "75000",
      federalWithheld: "9000",
      socialSecurityWages: "75000",
      socialSecurityWithheld: "4650",
      medicareWages: "75000",
      medicareWithheld: "1087.50",
      stateTaxWithheld: "0",
      stateWages: "75000",
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
  rentalProperties: [],
  dependentCare: {
    expenses: "5000",
    qualifyingIndividuals: 1,
  },
};

// ─── Fixture: MFJ with two qualifying children ───────────────────────────

const mfjTwoChildrenFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "David",
      lastName: "Chen",
      ssn: "555-66-7777",
      dateOfBirth: "1982-11-05",
    },
    spouse: {
      firstName: "Lisa",
      lastName: "Chen",
      ssn: "666-77-8888",
      dateOfBirth: "1984-02-18",
    },
    address: {
      street: "100 Maple Dr",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    dependents: [
      {
        firstName: "Emily",
        lastName: "Chen",
        ssn: "777-88-9999",
        dateOfBirth: "2019-03-15",
        relationship: "daughter",
      },
      {
        firstName: "Ryan",
        lastName: "Chen",
        ssn: "888-99-0000",
        dateOfBirth: "2021-09-22",
        relationship: "son",
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Corp A", ein: "22-3344556" },
      wages: "90000",
      federalWithheld: "12000",
      socialSecurityWages: "90000",
      socialSecurityWithheld: "5580",
      medicareWages: "90000",
      medicareWithheld: "1305",
      stateTaxWithheld: "0",
      stateWages: "90000",
      localTaxWithheld: "0",
      state: "OR",
    },
    {
      employer: { name: "Corp B", ein: "33-4455667" },
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
  dependentCare: {
    expenses: "10000",
    qualifyingIndividuals: 2,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Single filer with one qualifying child — $3K cap applies
// ═══════════════════════════════════════════════════════════════════════════

describe("Form 2441 PDF fill — single with one qualifying child", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(singleOneChildFixture);
    expect(result.form2441).toBeDefined();
    doc = await fillForm2441(singleOneChildFixture, result, BLANK_2441);
  });

  it("engine produces Form 2441 result with credit", () => {
    expect(result.form2441).toBeDefined();
    expect(result.form2441!.credit.toNumber()).toBeGreaterThan(0);
  });

  it("fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Maria Santos");
    expect(getFieldText(doc, F.ssn)).toBe("222334444");
  });

  it("Line 3 — qualifying expenses capped at $3,000 for one child", () => {
    // Input has $5,000 but cap is $3,000 for one qualifying person
    expect(getFieldText(doc, F.line3)).toBe("3000");
  });

  it("Line 6 — smallest of lines 3, 4, 5", () => {
    const f2441 = result.form2441!;
    expect(getFieldText(doc, F.line6)).toBe(formatCurrency(f2441.earnedIncomeLimit));
  });

  it("Line 7 — AGI from Form 1040 line 11", () => {
    expect(getFieldText(doc, F.line7)).toBe(formatCurrency(result.agi));
  });

  it("Line 8 — decimal amount is 20 for AGI over $43,000", () => {
    // AGI of $75,000 → credit percentage is 20%
    expect(getFieldText(doc, F.line8decimal)).toBe("20");
  });

  it("Line 9a — credit equals line 6 × line 8 decimal", () => {
    const f2441 = result.form2441!;
    expect(getFieldText(doc, F.line9a)).toBe(formatCurrency(f2441.credit));
  });

  it("Line 9c — same as 9a when no prior year expenses", () => {
    const f2441 = result.form2441!;
    expect(getFieldText(doc, F.line9c)).toBe(formatCurrency(f2441.credit));
  });

  it("Line 11 — final credit matches engine", () => {
    const f2441 = result.form2441!;
    expect(getFieldText(doc, F.line11)).toBe(formatCurrency(f2441.credit));
  });

  it("credit is $600 (3000 × 0.20)", () => {
    expect(result.form2441!.credit.toNumber()).toBe(600);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MFJ with two qualifying children — $6K cap applies
// ═══════════════════════════════════════════════════════════════════════════

describe("Form 2441 PDF fill — MFJ with two qualifying children", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjTwoChildrenFixture);
    expect(result.form2441).toBeDefined();
    doc = await fillForm2441(mfjTwoChildrenFixture, result, BLANK_2441);
  });

  it("engine produces Form 2441 result for MFJ", () => {
    expect(result.form2441).toBeDefined();
    expect(result.form2441!.credit.toNumber()).toBeGreaterThan(0);
  });

  it("fills header with both spouse names", () => {
    expect(getFieldText(doc, F.name)).toBe("David Chen & Lisa Chen");
    expect(getFieldText(doc, F.ssn)).toBe("555667777");
  });

  it("Line 3 — qualifying expenses capped at $6,000 for two children", () => {
    // Input has $10,000 but cap is $6,000 for two+ qualifying persons
    expect(getFieldText(doc, F.line3)).toBe("6000");
  });

  it("Line 6 — earned income limit equals qualifying expenses (income not limiting)", () => {
    const f2441 = result.form2441!;
    // Both earners make well over $6K, so earned income doesn't limit
    expect(f2441.earnedIncomeLimit.toNumber()).toBe(6000);
    expect(getFieldText(doc, F.line6)).toBe("6000");
  });

  it("Line 7 — AGI matches engine", () => {
    expect(getFieldText(doc, F.line7)).toBe(formatCurrency(result.agi));
  });

  it("Line 8 — decimal amount is 20 for AGI over $43,000", () => {
    // Combined AGI of $150K → credit percentage is 20%
    expect(getFieldText(doc, F.line8decimal)).toBe("20");
  });

  it("Line 11 — credit is $1,200 (6000 × 0.20)", () => {
    const f2441 = result.form2441!;
    expect(f2441.credit.toNumber()).toBe(1200);
    expect(getFieldText(doc, F.line11)).toBe("1200");
  });

  it("Line 9b — prior year expenses is 0", () => {
    expect(getFieldText(doc, F.line9b)).toBe("0");
  });
});

describe("Form 2441 packet inclusion", () => {
  it("fillReturn attaches Form 2441 only for supported credit-bearing scenarios", async () => {
    const outputDir = await makeOutputDir();

    try {
      const supportedResult = calculateFederalTax(singleOneChildFixture);
      const supportedPacket = await fillReturn(singleOneChildFixture, supportedResult, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const supportedPath = supportedPacket.filledForms.find((path) => path.endsWith("f2441-filled.pdf"));

      expect(supportedResult.form2441?.credit.toNumber()).toBeGreaterThan(0);
      expect(supportedPath).toBeDefined();
      await access(supportedPath!);
      const pdfBytes = await readFile(supportedPath!);
      expect(pdfBytes.length).toBeGreaterThan(0);

      const mfsFixture: TaxYearInput = {
        ...singleOneChildFixture,
        taxpayer: {
          ...singleOneChildFixture.taxpayer,
          filingStatus: "married_filing_separately",
          spouse: {
            firstName: "Alex",
            lastName: "Santos",
            ssn: "444-55-6666",
            dateOfBirth: "1989-08-01",
          },
        },
      };
      const mfsResult = calculateFederalTax(mfsFixture);
      const suppressedPacket = await fillReturn(mfsFixture, mfsResult, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(mfsResult.form2441).toBeUndefined();
      expect(suppressedPacket.filledForms.some((path) => path.endsWith("f2441-filled.pdf"))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
