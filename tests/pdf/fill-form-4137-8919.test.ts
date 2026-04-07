/**
 * Tests for Form 4137 and Form 8919 PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import Decimal from "decimal.js";
import { calculateForm4137 } from "@/engine/forms/form-4137.js";
import { calculateForm8919 } from "@/engine/forms/form-8919.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm4137, FORM_4137_FIELDS } from "@/pdf/fill-form-4137.js";
import { fillForm8919, FORM_8919_FIELDS } from "@/pdf/fill-form-8919.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { getConstants } from "@/models/constants.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";

const d = (value: number | string) => new Decimal(value);
const constants = getConstants(2025);

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

const BLANK_4137 = "forms/blank/f4137.pdf";
const BLANK_8919 = "forms/blank/f8919.pdf";

async function makeOutputDir() {
  return mkdtemp(join(tmpdir(), "tax-engine-4137-8919-"));
}

/** Minimal fixture for Form 4137 testing */
const form4137Fixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Alice",
      lastName: "Waitress",
      ssn: "111-22-3333",
      dateOfBirth: "1985-06-15",
      occupation: "Server",
    },
    address: {
      street: "456 Restaurant Row",
      city: "New York",
      state: "NY",
      zip: "10001",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Fine Dining LLC", ein: "98-7654321" },
      wages: "25000",
      federalWithheld: "3000",
      socialSecurityWages: "25000",
      socialSecurityWithheld: "1550",
      medicareWages: "25000",
      medicareWithheld: "362.50",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "NY",
    },
  ],
  form4137: {
    unreportedTipIncome: "8000",
  },
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

/** Minimal fixture for Form 8919 testing */
const form8919Fixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Bob",
      lastName: "Worker",
      ssn: "444-55-6666",
      dateOfBirth: "1980-03-20",
      occupation: "Consultant",
    },
    address: {
      street: "789 Contractor Ave",
      city: "Chicago",
      state: "IL",
      zip: "60601",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Day Job Inc", ein: "11-2233445" },
      wages: "60000",
      federalWithheld: "9000",
      socialSecurityWages: "60000",
      socialSecurityWithheld: "3720",
      medicareWages: "60000",
      medicareWithheld: "870",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "IL",
    },
  ],
  form8919: {
    wagesNotReportedOnW2: "10000",
    socialSecurityWagesAndTipsAlreadyReported: "170000",
  },
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

// ─── Form 4137 — Unreported Tip Income ──────────────────────────────────────

describe("Form 4137 PDF fill — single filer with unreported tips", () => {
  let doc: PDFDocument;
  let engineResult: ReturnType<typeof calculateForm4137>;

  beforeAll(async () => {
    engineResult = calculateForm4137(
      { unreportedTipIncome: d(8000) },
      constants,
      {
        socialSecurityWagesAndTipsAlreadyReported: d(25000),
        socialSecurityTipsAlreadyReported: d(0),
      },
    );

    const mockResult = {
      form4137: engineResult,
    } as TaxReturnResult;

    doc = await fillForm4137(form4137Fixture, mockResult, BLANK_4137);
  });

  it("Form 4137 PDF fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, FORM_4137_FIELDS.name)).toBe("Alice Waitress");
    expect(getFieldText(doc, FORM_4137_FIELDS.ssn)).toBe("111223333");
  });

  it("Form 4137 PDF fills Line 6 — unreported tips subject to Medicare tax", () => {
    expect(getFieldText(doc, FORM_4137_FIELDS.line6)).toBe(
      formatCurrency(engineResult.line6),
    );
  });

  it("Form 4137 PDF fills Line 8 — SS wages and tips already reported", () => {
    expect(getFieldText(doc, FORM_4137_FIELDS.line8)).toBe(
      formatCurrency(engineResult.line8),
    );
  });

  it("Form 4137 PDF fills Line 9 — remaining SS wage-base room", () => {
    expect(getFieldText(doc, FORM_4137_FIELDS.line9)).toBe(
      formatCurrency(engineResult.line9),
    );
  });

  it("Form 4137 PDF fills Line 10 — tips subject to SS tax", () => {
    expect(getFieldText(doc, FORM_4137_FIELDS.line10)).toBe(
      formatCurrency(engineResult.line10),
    );
  });

  it("Form 4137 PDF fills Line 11 — SS tax", () => {
    expect(getFieldText(doc, FORM_4137_FIELDS.line11)).toBe(
      formatCurrency(engineResult.line11),
    );
  });

  it("Form 4137 PDF fills Line 12 — Medicare tax", () => {
    expect(getFieldText(doc, FORM_4137_FIELDS.line12)).toBe(
      formatCurrency(engineResult.line12),
    );
  });

  it("Form 4137 PDF fills Line 13 — total tax", () => {
    expect(getFieldText(doc, FORM_4137_FIELDS.line13)).toBe(
      formatCurrency(engineResult.line13),
    );
  });
});

describe("Form 4137 PDF fill — no form 4137 result", () => {
  let doc: PDFDocument;

  beforeAll(async () => {
    const mockResult = {} as TaxReturnResult;
    doc = await fillForm4137(form4137Fixture, mockResult, BLANK_4137);
  });

  it("Form 4137 PDF fills header even without result", () => {
    expect(getFieldText(doc, FORM_4137_FIELDS.name)).toBe("Alice Waitress");
    expect(getFieldText(doc, FORM_4137_FIELDS.ssn)).toBe("111223333");
  });

  it("Form 4137 PDF leaves summary lines empty without result", () => {
    expect(getFieldText(doc, FORM_4137_FIELDS.line6)).toBeUndefined();
    expect(getFieldText(doc, FORM_4137_FIELDS.line13)).toBeUndefined();
  });
});

describe("Form 4137 packet inclusion", () => {
  it("fillReturn attaches Form 4137 only when supported unreported tips produce additional tax", async () => {
    const outputDir = await makeOutputDir();

    try {
      const supportedResult = calculateFederalTax(form4137Fixture);
      const supportedPacket = await fillReturn(form4137Fixture, supportedResult, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      const supportedPath = supportedPacket.filledForms.find((path) => path.endsWith("f4137-filled.pdf"));

      expect(supportedResult.form4137?.line13.toNumber()).toBeGreaterThan(0);
      expect(supportedPath).toBeDefined();
      await access(supportedPath!);
      const pdfBytes = await readFile(supportedPath!);
      expect(pdfBytes.length).toBeGreaterThan(0);

      const zeroTaxFixture: TaxYearInput = {
        ...form4137Fixture,
        form4137: {
          unreportedTipIncome: "0",
        },
      };
      const zeroTaxResult = calculateFederalTax(zeroTaxFixture);
      const suppressedPacket = await fillReturn(zeroTaxFixture, zeroTaxResult, {
        blankFormsDir: "forms/blank",
        outputDir,
      });

      expect(zeroTaxResult.form4137?.line13.toNumber()).toBe(0);
      expect(suppressedPacket.filledForms.some((path) => path.endsWith("f4137-filled.pdf"))).toBe(false);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});

// ─── Form 8919 — Uncollected FICA on Wages ─────────────────────────────────

describe("Form 8919 PDF fill — single filer with unreported wages", () => {
  let doc: PDFDocument;
  let engineResult: ReturnType<typeof calculateForm8919>;

  beforeAll(async () => {
    engineResult = calculateForm8919(
      {
        wagesNotReportedOnW2: d(10000),
        socialSecurityWagesAndTipsAlreadyReported: d(170000),
      },
      constants,
    );

    const mockResult = {
      form8919: engineResult,
    } as TaxReturnResult;

    doc = await fillForm8919(form8919Fixture, mockResult, BLANK_8919);
  });

  it("Form 8919 PDF fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, FORM_8919_FIELDS.name)).toBe("Bob Worker");
    expect(getFieldText(doc, FORM_8919_FIELDS.ssn)).toBe("444556666");
  });

  it("Form 8919 PDF fills Line 6 — total wages", () => {
    expect(getFieldText(doc, FORM_8919_FIELDS.line6)).toBe(
      formatCurrency(engineResult.line6),
    );
  });

  it("Form 8919 PDF fills Line 8 — SS wages already reported", () => {
    expect(getFieldText(doc, FORM_8919_FIELDS.line8)).toBe(
      formatCurrency(engineResult.line8),
    );
  });

  it("Form 8919 PDF fills Line 9 — remaining SS wage-base room", () => {
    expect(getFieldText(doc, FORM_8919_FIELDS.line9)).toBe(
      formatCurrency(engineResult.line9),
    );
  });

  it("Form 8919 PDF fills Line 10 — wages subject to SS tax (capped by remaining room)", () => {
    expect(getFieldText(doc, FORM_8919_FIELDS.line10)).toBe(
      formatCurrency(engineResult.line10),
    );
    // line10 should be min(line6=10000, line9=6100) = 6100
    expect(engineResult.line10.toNumber()).toBe(6100);
  });

  it("Form 8919 PDF fills Line 11 — SS tax", () => {
    expect(getFieldText(doc, FORM_8919_FIELDS.line11)).toBe(
      formatCurrency(engineResult.line11),
    );
  });

  it("Form 8919 PDF fills Line 12 — Medicare tax", () => {
    expect(getFieldText(doc, FORM_8919_FIELDS.line12)).toBe(
      formatCurrency(engineResult.line12),
    );
  });

  it("Form 8919 PDF fills Line 13 — total tax", () => {
    expect(getFieldText(doc, FORM_8919_FIELDS.line13)).toBe(
      formatCurrency(engineResult.line13),
    );
    // total should be 378 + 145 = 523
    expect(engineResult.line13.toNumber()).toBe(523);
  });
});

describe("Form 8919 PDF fill — no form 8919 result", () => {
  let doc: PDFDocument;

  beforeAll(async () => {
    const mockResult = {} as TaxReturnResult;
    doc = await fillForm8919(form8919Fixture, mockResult, BLANK_8919);
  });

  it("Form 8919 PDF fills header even without result", () => {
    expect(getFieldText(doc, FORM_8919_FIELDS.name)).toBe("Bob Worker");
    expect(getFieldText(doc, FORM_8919_FIELDS.ssn)).toBe("444556666");
  });

  it("Form 8919 PDF leaves summary lines empty without result", () => {
    expect(getFieldText(doc, FORM_8919_FIELDS.line6)).toBeUndefined();
    expect(getFieldText(doc, FORM_8919_FIELDS.line13)).toBeUndefined();
  });
});
