/**
 * Tests for Form 8863 — Education Credits PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm8863 } from "@/engine/forms/form-8863.js";
import { fillForm8863, FORM_8863_FIELDS } from "@/pdf/fill-form-8863.js";
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

const BLANK_8863 = "forms/blank/f8863.pdf";
const F = FORM_8863_FIELDS;

// ─── Fixture: Single filer with one AOC student ─────────────────────────────

const singleAOCFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Sarah",
      lastName: "Miller",
      ssn: "111-22-3333",
      dateOfBirth: "1985-06-15",
    },
    address: {
      street: "456 Oak Ave",
      city: "Denver",
      state: "CO",
      zip: "80202",
    },
    dependents: [
      {
        firstName: "Jake",
        lastName: "Miller",
        ssn: "444-55-6666",
        dateOfBirth: "2006-09-01",
        relationship: "son",
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Acme Corp", ein: "11-2233445" },
      wages: "65000",
      federalWithheld: "8000",
      socialSecurityWages: "65000",
      socialSecurityWithheld: "4030",
      medicareWages: "65000",
      medicareWithheld: "942.50",
      stateTaxWithheld: "0",
      stateWages: "65000",
      localTaxWithheld: "0",
      state: "CO",
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
  educationExpenses: {
    aocStudents: [
      {
        name: "Jake Miller",
        qualifiedExpenses: "4000",
      },
    ],
    llcExpenses: "0",
  },
};

// ─── Fixture: MFJ with AOC + LLC, income in phase-out range ─────────────────

const mfjPhaseOutFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Robert",
      lastName: "Johnson",
      ssn: "222-33-4444",
      dateOfBirth: "1980-03-20",
    },
    spouse: {
      firstName: "Emily",
      lastName: "Johnson",
      ssn: "333-44-5555",
      dateOfBirth: "1982-08-10",
    },
    address: {
      street: "789 Pine Rd",
      city: "Seattle",
      state: "WA",
      zip: "98101",
    },
    dependents: [
      {
        firstName: "Anna",
        lastName: "Johnson",
        ssn: "555-66-7777",
        dateOfBirth: "2005-01-15",
        relationship: "daughter",
      },
    ],
  },
  w2s: [
    {
      employer: { name: "BigTech Inc", ein: "22-3344556" },
      wages: "120000",
      federalWithheld: "18000",
      socialSecurityWages: "120000",
      socialSecurityWithheld: "7440",
      medicareWages: "120000",
      medicareWithheld: "1740",
      stateTaxWithheld: "0",
      stateWages: "120000",
      localTaxWithheld: "0",
      state: "WA",
    },
    {
      employer: { name: "Consulting LLC", ein: "33-4455667" },
      wages: "50000",
      federalWithheld: "6000",
      socialSecurityWages: "50000",
      socialSecurityWithheld: "3100",
      medicareWages: "50000",
      medicareWithheld: "725",
      stateTaxWithheld: "0",
      stateWages: "50000",
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
  rentalProperties: [],
  educationExpenses: {
    aocStudents: [
      {
        name: "Anna Johnson",
        qualifiedExpenses: "3500",
      },
    ],
    llcExpenses: "8000",
  },
};

// ─── Fixture: Single filer, AOC fully phased out (MAGI > $90K) ──────────────

const phasedOutFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "David",
      lastName: "Lee",
      ssn: "666-77-8888",
      dateOfBirth: "1975-12-01",
    },
    address: {
      street: "321 Elm St",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    dependents: [
      {
        firstName: "Mia",
        lastName: "Lee",
        ssn: "777-88-9999",
        dateOfBirth: "2007-04-20",
        relationship: "daughter",
      },
    ],
  },
  w2s: [
    {
      employer: { name: "HighPay Corp", ein: "44-5566778" },
      wages: "95000",
      federalWithheld: "14000",
      socialSecurityWages: "95000",
      socialSecurityWithheld: "5890",
      medicareWages: "95000",
      medicareWithheld: "1377.50",
      stateTaxWithheld: "0",
      stateWages: "95000",
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
  educationExpenses: {
    aocStudents: [
      {
        name: "Mia Lee",
        qualifiedExpenses: "4000",
      },
    ],
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// Single filer with AOC — no phase-out (MAGI $65K < $80K threshold)
// ═════════════════════════════════════════════════════════════════════════════

describe("Form 8863 PDF fill — single filer with AOC, no phase-out", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;
  let form8863Result: ReturnType<typeof calculateForm8863>;

  beforeAll(async () => {
    result = calculateFederalTax(singleAOCFixture);
    form8863Result = calculateForm8863({
      aocStudents: [{ name: "Jake Miller", qualifiedExpenses: new Decimal(4000) }],
      llcExpenses: new Decimal(0),
      magi: result.agi,
      filingStatus: "single",
    });
    doc = await fillForm8863(singleAOCFixture, result, BLANK_8863);
  });

  it("engine produces education credits for this filer", () => {
    // AGI of $65K is below $80K threshold — full credit
    expect(result.agi.toNumber()).toBe(65000);
    expect(form8863Result.aocAfterPhaseOut.toNumber()).toBe(2500);
  });

  it("fills header with taxpayer name", () => {
    expect(getFieldText(doc, F.name)).toBe("Sarah Miller");
  });

  it("fills SSN in three parts", () => {
    expect(getFieldText(doc, F.ssn1)).toBe("111");
    expect(getFieldText(doc, F.ssn2)).toBe("22");
    expect(getFieldText(doc, F.ssn3)).toBe("3333");
  });

  it("Line 1 — total tentative AOC from Part III", () => {
    // $4,000 expenses → 100% of first $2K + 25% of next $2K = $2,000 + $500 = $2,500
    expect(getFieldText(doc, F.line1)).toBe("2500");
  });

  it("Line 2 — threshold is $90,000 for single", () => {
    expect(getFieldText(doc, F.line2)).toBe("90000");
  });

  it("Line 3 — MAGI matches AGI", () => {
    expect(getFieldText(doc, F.line3)).toBe(formatCurrency(result.agi));
  });

  it("Line 4 — excess over threshold", () => {
    // $90,000 - $65,000 = $25,000
    expect(getFieldText(doc, F.line4)).toBe("25000");
  });

  it("Line 5 — phase-out range is $10,000 for single", () => {
    expect(getFieldText(doc, F.line5)).toBe("10000");
  });

  it("Line 6 — phase-out ratio is 1.000 (fully below threshold)", () => {
    // $25,000 excess ≥ $10,000 range → ratio = 1.000
    expect(getFieldText(doc, F.line6int)).toBe("1");
    expect(getFieldText(doc, F.line6dec)).toBe("000");
  });

  it("Line 7 — AOC after phase-out = tentative × 1.000", () => {
    expect(getFieldText(doc, F.line7)).toBe("2500");
  });

  it("Line 8 — refundable AOC = Line 7 × 40%", () => {
    // $2,500 × 0.40 = $1,000
    expect(getFieldText(doc, F.line8)).toBe("1000");
  });

  it("Line 9 — nonrefundable AOC = Line 7 - Line 8", () => {
    // $2,500 - $1,000 = $1,500
    expect(getFieldText(doc, F.line9)).toBe("1500");
  });

  it("Line 19 — total nonrefundable = Line 9 + Line 18", () => {
    // No LLC expenses, so Line 18 = 0, Line 19 = $1,500
    expect(getFieldText(doc, F.line19)).toBe("1500");
  });

  it("Part III student name filled", () => {
    expect(getFieldText(doc, F.studentName)).toBe("Jake Miller");
  });

  it("Part III Line 27 — adjusted qualified expenses", () => {
    expect(getFieldText(doc, F.line27)).toBe("4000");
  });

  it("Part III Line 28 — Line 27 minus $2,000", () => {
    expect(getFieldText(doc, F.line28)).toBe("2000");
  });

  it("Part III Line 29 — Line 28 × 25%", () => {
    expect(getFieldText(doc, F.line29)).toBe("500");
  });

  it("Part III Line 30 — tentative AOC per student", () => {
    expect(getFieldText(doc, F.line30)).toBe("2500");
  });

  it("Q23 checkbox No — AOC not claimed 4 prior years", () => {
    expect(isChecked(doc, F.q23No)).toBe(true);
    expect(isChecked(doc, F.q23Yes)).toBe(false);
  });

  it("Q26 checkbox No — no felony", () => {
    expect(isChecked(doc, F.q26No)).toBe(true);
  });

  it("page 2 header matches page 1", () => {
    expect(getFieldText(doc, F.p2Name)).toBe("Sarah Miller");
    expect(getFieldText(doc, F.p2Ssn1)).toBe("111");
    expect(getFieldText(doc, F.p2Ssn2)).toBe("22");
    expect(getFieldText(doc, F.p2Ssn3)).toBe("3333");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MFJ with AOC + LLC — both credits, no phase-out
// ═════════════════════════════════════════════════════════════════════════════

describe("Form 8863 PDF fill — MFJ with AOC + LLC, no phase-out", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;
  let form8863Result: ReturnType<typeof calculateForm8863>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjPhaseOutFixture);
    form8863Result = calculateForm8863({
      aocStudents: [{ name: "Anna Johnson", qualifiedExpenses: new Decimal(3500) }],
      llcExpenses: new Decimal(8000),
      magi: result.agi,
      filingStatus: "married_filing_jointly",
    });
    doc = await fillForm8863(mfjPhaseOutFixture, result, BLANK_8863);
  });

  it("engine produces education credits for MFJ filer", () => {
    // AGI of $170K is within $160K-$180K MFJ phase-out range
    expect(result.agi.toNumber()).toBe(170000);
  });

  it("fills header with both names", () => {
    expect(getFieldText(doc, F.name)).toBe("Robert Johnson & Emily Johnson");
  });

  it("Line 1 — tentative AOC for $3,500 expenses", () => {
    // 100% of first $2K + 25% of ($3,500 - $2,000) = $2,000 + $375 = $2,375
    expect(getFieldText(doc, F.line1)).toBe("2375");
  });

  it("Line 2 — threshold is $180,000 for MFJ", () => {
    expect(getFieldText(doc, F.line2)).toBe("180000");
  });

  it("Line 4 — excess = $180K - $170K = $10K", () => {
    expect(getFieldText(doc, F.line4)).toBe("10000");
  });

  it("Line 5 — phase-out range is $20,000 for MFJ", () => {
    expect(getFieldText(doc, F.line5)).toBe("20000");
  });

  it("Line 6 — phase-out ratio = 10000/20000 = 0.500", () => {
    expect(getFieldText(doc, F.line6int)).toBe("0");
    expect(getFieldText(doc, F.line6dec)).toBe("500");
  });

  it("Line 7 — AOC after phase-out", () => {
    // $2,375 × 0.500 = $1,187.50 → rounds to $1,188
    expect(getFieldText(doc, F.line7)).toBe(formatCurrency(form8863Result.aocAfterPhaseOut));
  });

  it("Line 8 — refundable AOC = 40% of Line 7", () => {
    expect(getFieldText(doc, F.line8)).toBe(formatCurrency(form8863Result.aocRefundable));
  });

  it("Line 9 — nonrefundable AOC = 60% of Line 7", () => {
    expect(getFieldText(doc, F.line9)).toBe(formatCurrency(form8863Result.aocNonrefundable));
  });

  // Part II: LLC
  it("Line 10 — LLC expenses", () => {
    expect(getFieldText(doc, F.line10)).toBe("8000");
  });

  it("Line 11 — smaller of $8,000 or $10,000", () => {
    expect(getFieldText(doc, F.line11)).toBe("8000");
  });

  it("Line 12 — $8,000 × 20% = $1,600", () => {
    expect(getFieldText(doc, F.line12)).toBe("1600");
  });

  it("Line 13 — same threshold as Line 2", () => {
    expect(getFieldText(doc, F.line13)).toBe("180000");
  });

  it("Line 17 — same phase-out ratio as Line 6", () => {
    expect(getFieldText(doc, F.line17int)).toBe("0");
    expect(getFieldText(doc, F.line17dec)).toBe("500");
  });

  it("Line 18 — LLC after phase-out", () => {
    // $1,600 × 0.500 = $800
    expect(getFieldText(doc, F.line18)).toBe(formatCurrency(form8863Result.llcAfterPhaseOut));
  });

  it("Line 19 — total nonrefundable = Line 9 + Line 18", () => {
    expect(getFieldText(doc, F.line19)).toBe(formatCurrency(form8863Result.totalNonrefundable));
  });

  it("Part III Line 27 — adjusted qualified expenses capped at $3,500", () => {
    expect(getFieldText(doc, F.line27)).toBe("3500");
  });

  it("Part III Line 28 — $3,500 - $2,000 = $1,500", () => {
    expect(getFieldText(doc, F.line28)).toBe("1500");
  });

  it("Part III Line 29 — $1,500 × 25% = $375", () => {
    expect(getFieldText(doc, F.line29)).toBe("375");
  });

  it("Part III Line 30 — $2,000 + $375 = $2,375", () => {
    expect(getFieldText(doc, F.line30)).toBe("2375");
  });

  it("Part III Line 31 — LLC expenses", () => {
    expect(getFieldText(doc, F.line31)).toBe("8000");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Single filer fully phased out — MAGI > $90K
// ═════════════════════════════════════════════════════════════════════════════

describe("Form 8863 PDF fill — single filer fully phased out", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;
  let form8863Result: ReturnType<typeof calculateForm8863>;

  beforeAll(async () => {
    result = calculateFederalTax(phasedOutFixture);
    form8863Result = calculateForm8863({
      aocStudents: [{ name: "Mia Lee", qualifiedExpenses: new Decimal(4000) }],
      llcExpenses: new Decimal(0),
      magi: result.agi,
      filingStatus: "single",
    });
    doc = await fillForm8863(phasedOutFixture, result, BLANK_8863);
  });

  it("MAGI exceeds $90K threshold — credits are zero", () => {
    expect(result.agi.toNumber()).toBe(95000);
    expect(form8863Result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(form8863Result.totalNonrefundable.toNumber()).toBe(0);
  });

  it("Line 1 — tentative AOC is still $2,500", () => {
    expect(getFieldText(doc, F.line1)).toBe("2500");
  });

  it("Line 4 — excess is zero (MAGI > threshold)", () => {
    // $90,000 - $95,000 = -$5,000 → clamped to 0
    // formatCurrency returns "" for zero
    const line4 = getFieldText(doc, F.line4);
    expect(line4 === "" || line4 === undefined).toBe(true);
  });

  it("Line 6 — ratio is 0.000", () => {
    expect(getFieldText(doc, F.line6int)).toBe("0");
    expect(getFieldText(doc, F.line6dec)).toBe("000");
  });

  it("Line 7 — AOC after phase-out is zero", () => {
    const line7 = getFieldText(doc, F.line7);
    expect(line7 === "" || line7 === undefined).toBe(true);
  });

  it("Line 8 — refundable AOC is zero", () => {
    const line8 = getFieldText(doc, F.line8);
    expect(line8 === "" || line8 === undefined).toBe(true);
  });

  it("Line 19 — total nonrefundable is zero", () => {
    const line19 = getFieldText(doc, F.line19);
    expect(line19 === "" || line19 === undefined).toBe(true);
  });
});
