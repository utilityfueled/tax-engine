/**
 * Tests for Schedule 8812 — Credits for Qualifying Children and Other Dependents PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm8812, FORM_8812_FIELDS } from "@/pdf/fill-form-8812.js";
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

const BLANK_8812 = "forms/blank/2025/f1040s8.pdf";
const F = FORM_8812_FIELDS;

// ─── Fixture: MFJ with 2 qualifying children (standard CTC scenario) ────

const mfjWith2ChildrenFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "David",
      lastName: "Chen",
      ssn: "111-22-3333",
      dateOfBirth: "1980-04-15",
    },
    spouse: {
      firstName: "Maria",
      lastName: "Chen",
      ssn: "444-55-6666",
      dateOfBirth: "1982-09-20",
    },
    address: {
      street: "123 Oak St",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    dependents: [
      {
        firstName: "Emma",
        lastName: "Chen",
        ssn: "777-88-9999",
        relationship: "daughter",
        dateOfBirth: "2015-03-10",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
        qualifiesForODC: false,
      },
      {
        firstName: "Lucas",
        lastName: "Chen",
        ssn: "888-99-0000",
        relationship: "son",
        dateOfBirth: "2018-07-22",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
        qualifiesForODC: false,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Tech Corp", ein: "11-2233445" },
      wages: "90000",
      federalWithheld: "10000",
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
      employer: { name: "Consulting LLC", ein: "22-3344556" },
      wages: "55000",
      federalWithheld: "6500",
      socialSecurityWages: "55000",
      socialSecurityWithheld: "3410",
      medicareWages: "55000",
      medicareWithheld: "797.50",
      stateTaxWithheld: "0",
      stateWages: "55000",
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
};

// ─── Fixture: Single with 1 child + 1 other dependent + Schedule C ───────

const singleWithChildAndSEFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Sarah",
      lastName: "Miller",
      ssn: "222-33-4444",
      dateOfBirth: "1985-11-03",
    },
    address: {
      street: "789 Pine Rd",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    dependents: [
      {
        firstName: "Jake",
        lastName: "Miller",
        ssn: "555-66-7777",
        relationship: "son",
        dateOfBirth: "2016-05-18",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
        qualifiesForODC: false,
      },
      {
        firstName: "Grandma",
        lastName: "Miller",
        ssn: "666-77-8888",
        relationship: "mother",
        dateOfBirth: "1955-01-01",
        monthsLivedWithYou: 12,
        qualifiesForCTC: false,
        qualifiesForODC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Day Job Inc", ein: "33-4455667" },
      wages: "50000",
      federalWithheld: "5500",
      socialSecurityWages: "50000",
      socialSecurityWithheld: "3100",
      medicareWages: "50000",
      medicareWithheld: "725",
      stateTaxWithheld: "0",
      stateWages: "50000",
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
  scheduleC: {
    businessName: "Miller Web Design",
    ein: "44-5566778",
    grossReceipts: "30000",
    otherIncome: "0",
    advertising: "500",
    insurance: "300",
    officeExpense: "200",
    supplies: "100",
    otherExpenses: "0",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// MFJ with 2 qualifying children — standard CTC
// ═══════════════════════════════════════════════════════════════════════════

describe("Schedule 8812 PDF fill — MFJ with 2 qualifying children", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjWith2ChildrenFixture);
    expect(result.form8812).toBeDefined();
    doc = await fillForm8812(mfjWith2ChildrenFixture, result, BLANK_8812);
  });

  it("engine produces Form 8812 result with CTC", () => {
    expect(result.form8812).toBeDefined();
    expect(result.form8812!.nonrefundableCTC.toNumber()).toBeGreaterThan(0);
  });

  it("fills header with both spouse names and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("David Chen & Maria Chen");
    expect(getFieldText(doc, F.ssn)).toBe("111223333");
  });

  it("Line 1 — AGI from Form 1040", () => {
    expect(getFieldText(doc, F.line1)).toBe(formatCurrency(result.agi));
  });

  it("Line 4 — number of qualifying children is 2", () => {
    expect(getFieldText(doc, F.line4)).toBe("2");
  });

  it("Line 6 — no other dependents", () => {
    // No other dependents, field should be empty
    const text = getFieldText(doc, F.line6);
    expect(text === undefined || text === "").toBeTruthy();
  });

  it("Line 9 — MFJ threshold is $400,000", () => {
    expect(getFieldText(doc, F.line9)).toBe("400000");
  });

  it("Line 12 — Yes checkbox is checked (CTC is available)", () => {
    expect(isChecked(doc, F.line12Yes)).toBe(true);
    expect(isChecked(doc, F.line12No)).toBe(false);
  });

  it("Line 12 — CTC before limitation matches engine", () => {
    const f8812 = result.form8812!;
    expect(getFieldText(doc, F.line12)).toBe(formatCurrency(f8812.ctcBeforeLimitation));
  });

  it("Line 14 — nonrefundable CTC matches engine", () => {
    const f8812 = result.form8812!;
    expect(getFieldText(doc, F.line14)).toBe(formatCurrency(f8812.nonrefundableCTC));
  });

  it("Line 27 — ACTC is zero (tax liability covers full CTC)", () => {
    const f8812 = result.form8812!;
    expect(f8812.actc.isZero()).toBe(true);
    // Zero ACTC means the field is not set (formatCurrency returns "")
    expect(getFieldText(doc, F.line27)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Single with 1 CTC child + 1 ODC dependent + SE income
// ═══════════════════════════════════════════════════════════════════════════

describe("Schedule 8812 PDF fill — single with child + other dependent + SE", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(singleWithChildAndSEFixture);
    expect(result.form8812).toBeDefined();
    doc = await fillForm8812(singleWithChildAndSEFixture, result, BLANK_8812);
  });

  it("engine produces Form 8812 result", () => {
    expect(result.form8812).toBeDefined();
    expect(
      result.form8812!.nonrefundableCTC.gt(0) || result.form8812!.actc.gt(0),
    ).toBeTruthy();
  });

  it("fills header with single filer name", () => {
    expect(getFieldText(doc, F.name)).toBe("Sarah Miller");
    expect(getFieldText(doc, F.ssn)).toBe("222334444");
  });

  it("Line 4 — 1 qualifying child", () => {
    expect(getFieldText(doc, F.line4)).toBe("1");
  });

  it("Line 6 — 1 other dependent", () => {
    expect(getFieldText(doc, F.line6)).toBe("1");
  });

  it("Line 9 — single threshold is $200,000", () => {
    expect(getFieldText(doc, F.line9)).toBe("200000");
  });

  it("Line 12 — CTC before limitation matches engine", () => {
    const f8812 = result.form8812!;
    expect(getFieldText(doc, F.line12)).toBe(formatCurrency(f8812.ctcBeforeLimitation));
  });

  it("Line 14 — nonrefundable CTC matches engine", () => {
    const f8812 = result.form8812!;
    expect(getFieldText(doc, F.line14)).toBe(formatCurrency(f8812.nonrefundableCTC));
  });

  it("Line 18a — earned income includes SE income", () => {
    // With Schedule C income, earned income should be > W-2 wages alone
    const earnedIncomeText = getFieldText(doc, F.line18a);
    if (earnedIncomeText) {
      const earnedIncome = new Decimal(earnedIncomeText);
      // Earned income = W-2 wages ($50,000) + net SE - deductible half SE
      expect(earnedIncome.toNumber()).toBeGreaterThan(50000);
    }
  });

  it("Line 20 — not filled when unusedCTC is zero (full CTC absorbed by tax)", () => {
    const f8812 = result.form8812!;
    if (f8812.unusedCTC.isZero()) {
      // Part II-A not filled when no unused CTC
      expect(getFieldText(doc, F.line20)).toBeUndefined();
    } else {
      expect(getFieldText(doc, F.line20)).toBe(formatCurrency(f8812.fifteenPercent));
    }
  });

  it("Line 27 — ACTC is zero when tax liability covers full CTC", () => {
    const f8812 = result.form8812!;
    if (f8812.actc.isZero()) {
      expect(getFieldText(doc, F.line27)).toBeUndefined();
    } else {
      expect(getFieldText(doc, F.line27)).toBe(formatCurrency(f8812.actc));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HoH low-income with 2 children — triggers ACTC (Part II-A)
// ═══════════════════════════════════════════════════════════════════════════

const lowIncomeHoHFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "head_of_household",
    primary: {
      firstName: "Rosa",
      lastName: "Gomez",
      ssn: "333-44-5555",
      dateOfBirth: "1990-02-14",
    },
    address: {
      street: "456 Elm St",
      city: "Houston",
      state: "TX",
      zip: "77001",
    },
    dependents: [
      {
        firstName: "Ana",
        lastName: "Gomez",
        ssn: "111-00-2222",
        relationship: "daughter",
        dateOfBirth: "2017-06-01",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
        qualifiesForODC: false,
        qualifiesForEIC: true,
      },
      {
        firstName: "Carlos",
        lastName: "Gomez",
        ssn: "111-00-3333",
        relationship: "son",
        dateOfBirth: "2019-09-15",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
        qualifiesForODC: false,
        qualifiesForEIC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Local Shop", ein: "55-6677889" },
      wages: "25000",
      federalWithheld: "1500",
      socialSecurityWages: "25000",
      socialSecurityWithheld: "1550",
      medicareWages: "25000",
      medicareWithheld: "362.50",
      stateTaxWithheld: "0",
      stateWages: "25000",
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
};

describe("Schedule 8812 PDF fill — low-income HoH with 2 children (ACTC)", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(lowIncomeHoHFixture);
    expect(result.form8812).toBeDefined();
    doc = await fillForm8812(lowIncomeHoHFixture, result, BLANK_8812);
  });

  it("engine produces ACTC > 0 (unused CTC exceeds tax liability)", () => {
    const f8812 = result.form8812!;
    expect(f8812.unusedCTC.toNumber()).toBeGreaterThan(0);
    expect(f8812.actc.toNumber()).toBeGreaterThan(0);
  });

  it("fills header with filer name", () => {
    expect(getFieldText(doc, F.name)).toBe("Rosa Gomez");
    expect(getFieldText(doc, F.ssn)).toBe("333445555");
  });

  it("Line 4 — 2 qualifying children", () => {
    expect(getFieldText(doc, F.line4)).toBe("2");
  });

  it("Line 12 — CTC before limitation", () => {
    const f8812 = result.form8812!;
    expect(getFieldText(doc, F.line12)).toBe(formatCurrency(f8812.ctcBeforeLimitation));
  });

  it("Line 14 — nonrefundable CTC limited to tax liability", () => {
    const f8812 = result.form8812!;
    expect(getFieldText(doc, F.line14)).toBe(formatCurrency(f8812.nonrefundableCTC));
    // For low-income, nonrefundable should be less than ctcBeforeLimitation
    expect(f8812.nonrefundableCTC.lt(f8812.ctcBeforeLimitation)).toBe(true);
  });

  it("Line 16a — unused CTC is filled", () => {
    const f8812 = result.form8812!;
    expect(getFieldText(doc, F.line16a)).toBe(formatCurrency(f8812.unusedCTC));
  });

  it("Line 16b — children count × $1,700", () => {
    expect(getFieldText(doc, F.line16bCount)).toBe("2");
    expect(getFieldText(doc, F.line16b)).toBe("3400");
  });

  it("Line 18a — earned income equals W-2 wages (no SE)", () => {
    expect(getFieldText(doc, F.line18a)).toBe("25000");
  });

  it("Line 19 — earned income excess over $2,500", () => {
    const f8812 = result.form8812!;
    expect(getFieldText(doc, F.line19)).toBe(formatCurrency(f8812.earnedIncomeExcess));
  });

  it("Line 20 — 15% of earned income excess", () => {
    const f8812 = result.form8812!;
    expect(getFieldText(doc, F.line20)).toBe(formatCurrency(f8812.fifteenPercent));
  });

  it("Line 27 — ACTC matches engine result", () => {
    const f8812 = result.form8812!;
    expect(getFieldText(doc, F.line27)).toBe(formatCurrency(f8812.actc));
    expect(f8812.actc.toNumber()).toBeGreaterThan(0);
  });
});
