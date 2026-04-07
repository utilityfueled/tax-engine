/**
 * Tests for Schedule H — Household Employment Taxes PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleH, SCHEDULE_H_FIELDS } from "@/pdf/fill-schedule-h.js";
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

const BLANK_SH = "forms/blank/f1040sh.pdf";
const F = SCHEDULE_H_FIELDS;

// ─── Fixture 1: Single filer with one household employee, $10,000 wages ───

const singleHouseholdFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Sarah",
      lastName: "Johnson",
      ssn: "222-33-4444",
      dateOfBirth: "1975-06-10",
      occupation: "Attorney",
    },
    address: {
      street: "500 Park Ave",
      city: "New York",
      state: "NY",
      zip: "10022",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Law Firm LLC", ein: "11-2222222" },
      wages: "200000",
      federalWithheld: "40000",
      socialSecurityWages: "176100",
      socialSecurityWithheld: "10918.20",
      medicareWages: "200000",
      medicareWithheld: "2900",
      stateTaxWithheld: "0",
      stateWages: "0",
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
  scheduleH: {
    employees: [
      {
        name: "Maria Lopez",
        cashWages: "10000",
        isSpouse: false,
        isChildUnder21: false,
        isParent: false,
        isUnder18NonPrincipal: false,
      },
    ],
    futaApplies: true,
    futaSectionA: true,
  },
};

describe("Schedule H PDF filling — Single filer, one household employee", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(singleHouseholdFixture);
    doc = await fillScheduleH(singleHouseholdFixture, result, BLANK_SH);
  });

  it("Schedule H header - name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Sarah Johnson");
    expect(getFieldText(doc, F.ssn)).toBe("222334444");
  });

  it("Schedule H Question A - Yes (paid wages ≥ threshold)", () => {
    expect(isChecked(doc, F.questionAYes)).toBe(true);
    expect(isChecked(doc, F.questionANo)).toBe(false);
  });

  it("Schedule H Question B - Yes (FUTA applies)", () => {
    expect(isChecked(doc, F.questionBYes)).toBe(true);
    expect(isChecked(doc, F.questionBNo)).toBe(false);
  });

  it("Schedule H Question C - No (no federal income tax withheld)", () => {
    expect(isChecked(doc, F.questionCNo)).toBe(true);
    expect(isChecked(doc, F.questionCYes)).toBe(false);
  });

  it("Schedule H Line 1 - Total cash wages subject to SS tax", () => {
    const schedH = result.scheduleH!;
    expect(schedH).toBeDefined();
    // $10,000 below SS wage base
    expect(schedH.line1.toNumber()).toBe(10000);
    expect(getFieldText(doc, F.line1)).toBe(formatCurrency(schedH.line1));
  });

  it("Schedule H Line 2 - Social Security tax", () => {
    const schedH = result.scheduleH!;
    // $10,000 × 12.4% = $1,240
    expect(schedH.line2.toNumber()).toBe(1240);
    expect(getFieldText(doc, F.line2)).toBe(formatCurrency(schedH.line2));
  });

  it("Schedule H Line 3 - Total cash wages subject to Medicare tax", () => {
    const schedH = result.scheduleH!;
    expect(schedH.line3.toNumber()).toBe(10000);
    expect(getFieldText(doc, F.line3)).toBe(formatCurrency(schedH.line3));
  });

  it("Schedule H Line 4 - Medicare tax", () => {
    const schedH = result.scheduleH!;
    // $10,000 × 2.9% = $290
    expect(schedH.line4.toNumber()).toBe(290);
    expect(getFieldText(doc, F.line4)).toBe(formatCurrency(schedH.line4));
  });

  it("Schedule H Lines 5-6 - Additional Medicare Tax (zero for wages below threshold)", () => {
    const schedH = result.scheduleH!;
    expect(schedH.line5.toNumber()).toBe(0);
    expect(schedH.line6.toNumber()).toBe(0);
  });

  it("Schedule H Line 7 - Federal income tax withheld (zero)", () => {
    const schedH = result.scheduleH!;
    expect(schedH.line7.toNumber()).toBe(0);
  });

  it("Schedule H Line 8 - Total Part I taxes", () => {
    const schedH = result.scheduleH!;
    // $1,240 + $290 = $1,530
    expect(schedH.line8.toNumber()).toBe(1530);
    expect(getFieldText(doc, F.line8)).toBe(formatCurrency(schedH.line8));
  });

  it("Schedule H FUTA - Section A simplified FUTA tax", () => {
    const schedH = result.scheduleH!;
    // min($10,000, $7,000) × 0.6% = $42
    expect(schedH.futaTax.toNumber()).toBe(42);
  });

  it("Schedule H Part III Line 25 - Part I total flows to Part III", () => {
    const schedH = result.scheduleH!;
    expect(getFieldText(doc, F.line25)).toBe(formatCurrency(schedH.line8));
  });

  it("Schedule H Part III Line 26 - FUTA tax flows to Part III", () => {
    const schedH = result.scheduleH!;
    expect(getFieldText(doc, F.line26)).toBe(formatCurrency(schedH.futaTax));
  });

  it("Schedule H Part III Line 27 - Total household employment taxes", () => {
    const schedH = result.scheduleH!;
    // $1,530 + $42 = $1,572
    expect(schedH.totalTax.toNumber()).toBe(1572);
    expect(getFieldText(doc, F.line27)).toBe(formatCurrency(schedH.totalTax));
  });

  it("Schedule H Line 9 - Line 8 < $2,500 checkbox", () => {
    // $1,530 < $2,500
    expect(isChecked(doc, F.line9No)).toBe(true);
    expect(isChecked(doc, F.line9Yes)).toBe(false);
  });
});

// ─── Fixture 2: MFJ with two employees, one with withholding ──────────────

const mfjMultipleEmployeesFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "James",
      lastName: "Wilson",
      ssn: "555-66-7777",
      dateOfBirth: "1970-03-20",
      occupation: "Doctor",
    },
    spouse: {
      firstName: "Emily",
      lastName: "Wilson",
      ssn: "888-99-0000",
      dateOfBirth: "1972-09-15",
    },
    address: {
      street: "1200 Beacon St",
      city: "Boston",
      state: "MA",
      zip: "02134",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Hospital", ein: "33-4444444" },
      wages: "350000",
      federalWithheld: "80000",
      socialSecurityWages: "176100",
      socialSecurityWithheld: "10918.20",
      medicareWages: "350000",
      medicareWithheld: "5075",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "MA",
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
  scheduleH: {
    employees: [
      {
        name: "Ana Rodriguez",
        cashWages: "25000",
        isSpouse: false,
        isChildUnder21: false,
        isParent: false,
        isUnder18NonPrincipal: false,
        federalIncomeTaxWithheld: "2000",
      },
      {
        name: "Tom Baker",
        cashWages: "8000",
        isSpouse: false,
        isChildUnder21: false,
        isParent: false,
        isUnder18NonPrincipal: false,
      },
    ],
    futaApplies: true,
    futaSectionA: true,
  },
};

describe("Schedule H PDF filling — MFJ, two household employees, one with withholding", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjMultipleEmployeesFixture);
    doc = await fillScheduleH(mfjMultipleEmployeesFixture, result, BLANK_SH);
  });

  it("Schedule H header - joint names", () => {
    expect(getFieldText(doc, F.name)).toBe("James Wilson & Emily Wilson");
  });

  it("Schedule H Line 1 - combined SS wages for both employees", () => {
    const schedH = result.scheduleH!;
    // Both below SS wage base: $25,000 + $8,000 = $33,000
    expect(schedH.line1.toNumber()).toBe(33000);
    expect(getFieldText(doc, F.line1)).toBe(formatCurrency(schedH.line1));
  });

  it("Schedule H Line 2 - combined SS tax", () => {
    const schedH = result.scheduleH!;
    // $33,000 × 12.4% = $4,092
    expect(schedH.line2.toNumber()).toBe(4092);
    expect(getFieldText(doc, F.line2)).toBe(formatCurrency(schedH.line2));
  });

  it("Schedule H Line 3 - combined Medicare wages", () => {
    const schedH = result.scheduleH!;
    expect(schedH.line3.toNumber()).toBe(33000);
    expect(getFieldText(doc, F.line3)).toBe(formatCurrency(schedH.line3));
  });

  it("Schedule H Line 4 - combined Medicare tax", () => {
    const schedH = result.scheduleH!;
    // $33,000 × 2.9% = $957
    expect(schedH.line4.toNumber()).toBe(957);
    expect(getFieldText(doc, F.line4)).toBe(formatCurrency(schedH.line4));
  });

  it("Schedule H Line 7 - federal income tax withheld from qualifying employees", () => {
    const schedH = result.scheduleH!;
    expect(schedH.line7.toNumber()).toBe(2000);
    expect(getFieldText(doc, F.line7)).toBe(formatCurrency(schedH.line7));
  });

  it("Schedule H Line 8 - total Part I with withholding", () => {
    const schedH = result.scheduleH!;
    // $4,092 + $957 + $0 + $2,000 = $7,049
    expect(schedH.line8.toNumber()).toBe(7049);
    expect(getFieldText(doc, F.line8)).toBe(formatCurrency(schedH.line8));
  });

  it("Schedule H Line 9 - Line 8 ≥ $2,500", () => {
    // $7,049 ≥ $2,500
    expect(isChecked(doc, F.line9Yes)).toBe(true);
  });

  it("Schedule H FUTA - combined FUTA for both employees", () => {
    const schedH = result.scheduleH!;
    // Employee 1: min($25,000, $7,000) = $7,000
    // Employee 2: min($8,000, $7,000) = $7,000
    // Total FUTA wages: $14,000 × 0.6% = $84
    expect(schedH.futaTax.toNumber()).toBe(84);
  });

  it("Schedule H Line 27 - total household employment taxes", () => {
    const schedH = result.scheduleH!;
    // $7,049 + $84 = $7,133
    expect(schedH.totalTax.toNumber()).toBe(7133);
    expect(getFieldText(doc, F.line27)).toBe(formatCurrency(schedH.totalTax));
  });

  it("Schedule H Question C - Yes (withholding exists)", () => {
    expect(isChecked(doc, F.questionCYes)).toBe(true);
  });
});

// ─── Fixture 3: Exempt employee (child under 21) ─────────────────────────

const exemptEmployeeFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Robert",
      lastName: "Taylor",
      ssn: "111-22-3333",
      dateOfBirth: "1965-12-01",
      occupation: "Business Owner",
    },
    address: {
      street: "300 Elm St",
      city: "Denver",
      state: "CO",
      zip: "80202",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Taylor Enterprises", ein: "55-6666666" },
      wages: "120000",
      federalWithheld: "20000",
      socialSecurityWages: "120000",
      socialSecurityWithheld: "7440",
      medicareWages: "120000",
      medicareWithheld: "1740",
      stateTaxWithheld: "0",
      stateWages: "0",
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
  scheduleH: {
    employees: [
      {
        name: "Taylor Jr",
        cashWages: "5000",
        isSpouse: false,
        isChildUnder21: true,
        isParent: false,
        isUnder18NonPrincipal: false,
      },
    ],
    futaApplies: false,
    futaSectionA: true,
  },
};

describe("Schedule H PDF filling — Exempt employee (child under 21)", () => {
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(() => {
    result = calculateFederalTax(exemptEmployeeFixture);
  });

  it("Schedule H - exempt child under 21 produces zero tax", () => {
    const schedH = result.scheduleH;
    expect(schedH).toBeDefined();
    expect(schedH!.qualifyingEmployeeCount).toBe(0);
    expect(schedH!.totalTax.toNumber()).toBe(0);
  });

  it("Schedule H - zero-tax result means no PDF would be filled by orchestrator", () => {
    // The orchestrator skips Schedule H when totalTax is zero
    expect(result.scheduleH!.totalTax.isZero()).toBe(true);
  });
});
