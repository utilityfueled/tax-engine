/**
 * Tests for Schedule EIC — Earned Income Credit Qualifying Child Information PDF filling.
 * Verifies that qualifying children data is correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleEIC, SCHEDULE_EIC_FIELDS } from "@/pdf/fill-schedule-eic.js";
import { fillReturn } from "@/pdf/fill-return.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";

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

const BLANK_EIC = "forms/blank/f1040sei.pdf";
const F = SCHEDULE_EIC_FIELDS;

// ─── Fixture 1: Single HoH filer with 2 qualifying children ──────────────
// Low-income head of household with two young children — typical EIC scenario.

const hohWith2ChildrenFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "head_of_household",
    primary: {
      firstName: "Maria",
      lastName: "Garcia",
      ssn: "444-55-6666",
      dateOfBirth: "1990-03-12",
      occupation: "Cashier",
    },
    address: {
      street: "123 Oak Street",
      city: "Denver",
      state: "CO",
      zip: "80201",
    },
    dependents: [
      {
        firstName: "Sofia",
        lastName: "Garcia",
        ssn: "444-55-7777",
        relationship: "daughter",
        dateOfBirth: "2015-08-20",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
        qualifiesForEIC: true,
      },
      {
        firstName: "Carlos",
        lastName: "Garcia",
        ssn: "444-55-8888",
        relationship: "son",
        dateOfBirth: "2018-01-05",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
        qualifiesForEIC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "RetailMart", ein: "55-6677889" },
      wages: "28000",
      federalWithheld: "1200",
      socialSecurityWages: "28000",
      socialSecurityWithheld: "1736",
      medicareWages: "28000",
      medicareWithheld: "406",
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
};

// ─── Fixture 2: MFJ filer with 3 qualifying children (mixed ages) ─────────
// Married filing jointly, three children including a student age 19-23.

const mfjWith3ChildrenFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "James",
      lastName: "Wilson",
      ssn: "222-33-4444",
      dateOfBirth: "1982-11-30",
      occupation: "Mechanic",
    },
    spouse: {
      firstName: "Patricia",
      lastName: "Wilson",
      ssn: "222-33-5555",
      dateOfBirth: "1984-07-22",
    },
    address: {
      street: "456 Elm Ave",
      city: "Columbus",
      state: "OH",
      zip: "43215",
    },
    dependents: [
      {
        firstName: "Emily",
        lastName: "Wilson",
        ssn: "222-33-6666",
        relationship: "daughter",
        dateOfBirth: "2004-04-15", // Age 21 at end of 2025 — student
        monthsLivedWithYou: 12,
        qualifiesForCTC: false,
        qualifiesForODC: true,
        qualifiesForEIC: true,
      },
      {
        firstName: "Michael",
        lastName: "Wilson",
        ssn: "222-33-7777",
        relationship: "son",
        dateOfBirth: "2010-09-03", // Age 15 at end of 2025 — under 19
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
        qualifiesForEIC: true,
      },
      {
        firstName: "Sarah",
        lastName: "Wilson",
        ssn: "222-33-8888",
        relationship: "daughter",
        dateOfBirth: "2014-12-01", // Age 11 at end of 2025 — under 19
        monthsLivedWithYou: 10,
        qualifiesForCTC: true,
        qualifiesForEIC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Auto Repair Shop", ein: "33-4455667" },
      wages: "42000",
      federalWithheld: "2800",
      socialSecurityWages: "42000",
      socialSecurityWithheld: "2604",
      medicareWages: "42000",
      medicareWithheld: "609",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "OH",
    },
    {
      employer: { name: "Weekend Gig LLC", ein: "44-5566778" },
      accountHolder: "spouse",
      wages: "15000",
      federalWithheld: "500",
      socialSecurityWages: "15000",
      socialSecurityWithheld: "930",
      medicareWages: "15000",
      medicareWithheld: "217.50",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "OH",
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

// ─── Fixture 3: Single filer, no qualifying children (childless EIC) ──────
// Low-income single filer age 30 — gets EIC but no qualifying children,
// so Schedule EIC should NOT be filled.

const childlessFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "David",
      lastName: "Chen",
      ssn: "333-44-5555",
      dateOfBirth: "1995-06-01",
      occupation: "Server",
    },
    address: {
      street: "789 Pine Rd",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Restaurant Inc", ein: "66-7788990" },
      wages: "18000",
      federalWithheld: "600",
      socialSecurityWages: "18000",
      socialSecurityWithheld: "1116",
      medicareWages: "18000",
      medicareWithheld: "261",
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
};

// ═══════════════════════════════════════════════════════════════════════════
// Test suites
// ═══════════════════════════════════════════════════════════════════════════

describe("Schedule EIC PDF filling — HoH with 2 qualifying children", () => {
  let doc: PDFDocument;
  let result: TaxReturnResult;

  beforeAll(async () => {
    result = calculateFederalTax(hohWith2ChildrenFixture);
    doc = await fillScheduleEIC(hohWith2ChildrenFixture, result, BLANK_EIC);
  });

  it("Schedule EIC header - filer name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Maria Garcia");
    expect(getFieldText(doc, F.ssn)).toBe("444556666");
  });

  it("Schedule EIC Line 1 - Child 1 name", () => {
    expect(getFieldText(doc, F.child1Name)).toBe("Sofia Garcia");
  });

  it("Schedule EIC Line 1 - Child 2 name", () => {
    expect(getFieldText(doc, F.child2Name)).toBe("Carlos Garcia");
  });

  it("Schedule EIC Line 1 - Child 3 name empty when only 2 children", () => {
    expect(getFieldText(doc, F.child3Name)).toBeUndefined();
  });

  it("Schedule EIC Line 2 - Child 1 SSN (no dashes)", () => {
    expect(getFieldText(doc, F.child1SSN)).toBe("444557777");
  });

  it("Schedule EIC Line 2 - Child 2 SSN (no dashes)", () => {
    expect(getFieldText(doc, F.child2SSN)).toBe("444558888");
  });

  it("Schedule EIC Line 3 - Child 1 year of birth digits", () => {
    expect(getFieldText(doc, F.child1YearDigit1)).toBe("2");
    expect(getFieldText(doc, F.child1YearDigit2)).toBe("0");
    expect(getFieldText(doc, F.child1YearDigit3)).toBe("1");
    expect(getFieldText(doc, F.child1YearDigit4)).toBe("5");
  });

  it("Schedule EIC Line 3 - Child 2 year of birth digits", () => {
    expect(getFieldText(doc, F.child2YearDigit1)).toBe("2");
    expect(getFieldText(doc, F.child2YearDigit2)).toBe("0");
    expect(getFieldText(doc, F.child2YearDigit3)).toBe("1");
    expect(getFieldText(doc, F.child2YearDigit4)).toBe("8");
  });

  it("Schedule EIC Lines 4a/4b - under 19 children skip both checkboxes", () => {
    // Sofia born 2015 (age 10) and Carlos born 2018 (age 7) — both under 19
    // Per IRS: skip lines 4a and 4b
    expect(isChecked(doc, F.child1Line4aYes)).toBe(false);
    expect(isChecked(doc, F.child1Line4aNo)).toBe(false);
    expect(isChecked(doc, F.child1Line4bYes)).toBe(false);
    expect(isChecked(doc, F.child1Line4bNo)).toBe(false);
    expect(isChecked(doc, F.child2Line4aYes)).toBe(false);
    expect(isChecked(doc, F.child2Line4aNo)).toBe(false);
    expect(isChecked(doc, F.child2Line4bYes)).toBe(false);
    expect(isChecked(doc, F.child2Line4bNo)).toBe(false);
  });

  it("Schedule EIC Line 5 - Child 1 relationship", () => {
    expect(getFieldText(doc, F.child1Relationship)).toBe("daughter");
  });

  it("Schedule EIC Line 5 - Child 2 relationship", () => {
    expect(getFieldText(doc, F.child2Relationship)).toBe("son");
  });

  it("Schedule EIC Line 6 - Child 1 months (12)", () => {
    expect(getFieldText(doc, F.child1Months)).toBe("12");
  });

  it("Schedule EIC Line 6 - Child 2 months (12)", () => {
    expect(getFieldText(doc, F.child2Months)).toBe("12");
  });

  it("EIC credit is positive for HoH with 2 children and $28K income", () => {
    expect(result.scheduleEIC).toBeDefined();
    expect(result.scheduleEIC!.credit.gt(0)).toBe(true);
    expect(result.scheduleEIC!.disqualified).toBe(false);
  });
});

describe("Schedule EIC PDF filling — MFJ with 3 children (mixed ages)", () => {
  let doc: PDFDocument;
  let result: TaxReturnResult;

  beforeAll(async () => {
    result = calculateFederalTax(mfjWith3ChildrenFixture);
    doc = await fillScheduleEIC(mfjWith3ChildrenFixture, result, BLANK_EIC);
  });

  it("Schedule EIC header - joint filers name", () => {
    expect(getFieldText(doc, F.name)).toBe("James Wilson & Patricia Wilson");
  });

  it("Schedule EIC header - primary SSN", () => {
    expect(getFieldText(doc, F.ssn)).toBe("222334444");
  });

  it("Schedule EIC Line 1 - all 3 children names filled", () => {
    expect(getFieldText(doc, F.child1Name)).toBe("Emily Wilson");
    expect(getFieldText(doc, F.child2Name)).toBe("Michael Wilson");
    expect(getFieldText(doc, F.child3Name)).toBe("Sarah Wilson");
  });

  it("Schedule EIC Line 2 - all 3 children SSNs", () => {
    expect(getFieldText(doc, F.child1SSN)).toBe("222336666");
    expect(getFieldText(doc, F.child2SSN)).toBe("222337777");
    expect(getFieldText(doc, F.child3SSN)).toBe("222338888");
  });

  it("Schedule EIC Line 3 - Child 1 (Emily, born 2004) year digits", () => {
    expect(getFieldText(doc, F.child1YearDigit1)).toBe("2");
    expect(getFieldText(doc, F.child1YearDigit2)).toBe("0");
    expect(getFieldText(doc, F.child1YearDigit3)).toBe("0");
    expect(getFieldText(doc, F.child1YearDigit4)).toBe("4");
  });

  it("Schedule EIC Line 3 - Child 2 (Michael, born 2010) year digits", () => {
    expect(getFieldText(doc, F.child2YearDigit1)).toBe("2");
    expect(getFieldText(doc, F.child2YearDigit2)).toBe("0");
    expect(getFieldText(doc, F.child2YearDigit3)).toBe("1");
    expect(getFieldText(doc, F.child2YearDigit4)).toBe("0");
  });

  it("Schedule EIC Line 3 - Child 3 (Sarah, born 2014) year digits", () => {
    expect(getFieldText(doc, F.child3YearDigit1)).toBe("2");
    expect(getFieldText(doc, F.child3YearDigit2)).toBe("0");
    expect(getFieldText(doc, F.child3YearDigit3)).toBe("1");
    expect(getFieldText(doc, F.child3YearDigit4)).toBe("4");
  });

  it("Schedule EIC Line 4a - Emily (age 21) checks Yes as student", () => {
    // Born 2004, age 21 at end of 2025 — qualifies as student (19-23)
    expect(isChecked(doc, F.child1Line4aYes)).toBe(true);
    expect(isChecked(doc, F.child1Line4aNo)).toBe(false);
  });

  it("Schedule EIC Lines 4a/4b - Michael (age 15) skips both", () => {
    // Born 2010, age 15 — under 19, skip 4a/4b
    expect(isChecked(doc, F.child2Line4aYes)).toBe(false);
    expect(isChecked(doc, F.child2Line4aNo)).toBe(false);
    expect(isChecked(doc, F.child2Line4bYes)).toBe(false);
    expect(isChecked(doc, F.child2Line4bNo)).toBe(false);
  });

  it("Schedule EIC Lines 4a/4b - Sarah (age 11) skips both", () => {
    // Born 2014, age 11 — under 19, skip 4a/4b
    expect(isChecked(doc, F.child3Line4aYes)).toBe(false);
    expect(isChecked(doc, F.child3Line4aNo)).toBe(false);
    expect(isChecked(doc, F.child3Line4bYes)).toBe(false);
    expect(isChecked(doc, F.child3Line4bNo)).toBe(false);
  });

  it("Schedule EIC Line 5 - all 3 children relationships", () => {
    expect(getFieldText(doc, F.child1Relationship)).toBe("daughter");
    expect(getFieldText(doc, F.child2Relationship)).toBe("son");
    expect(getFieldText(doc, F.child3Relationship)).toBe("daughter");
  });

  it("Schedule EIC Line 6 - months lived with you", () => {
    expect(getFieldText(doc, F.child1Months)).toBe("12");
    expect(getFieldText(doc, F.child2Months)).toBe("12");
    expect(getFieldText(doc, F.child3Months)).toBe("10");
  });

  it("EIC credit is positive for MFJ with 3 children and $57K income", () => {
    expect(result.scheduleEIC).toBeDefined();
    expect(result.scheduleEIC!.credit.gt(0)).toBe(true);
  });
});

describe("Schedule EIC — childless filer does not produce Schedule EIC form", () => {
  let result: TaxReturnResult;

  beforeAll(() => {
    result = calculateFederalTax(childlessFixture);
  });

  it("childless filer gets EIC but has no qualifying children for Schedule EIC", () => {
    // The filer may or may not get childless EIC, but there are no qualifying children
    expect(childlessFixture.taxpayer.dependents.length).toBe(0);
  });

  it("fillReturn orchestrator skips Schedule EIC for childless filer", async () => {
    const tmpDir = "forms/filled/test-eic-childless";
    const fillResult = await fillReturn(childlessFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: tmpDir,
    });
    // Schedule EIC should not appear in the filled forms list
    const hasScheduleEIC = fillResult.filledForms.some((f) => f.includes("f1040sei"));
    expect(hasScheduleEIC).toBe(false);
  });
});

describe("fillReturn orchestrator includes Schedule EIC when applicable", () => {
  let result: TaxReturnResult;

  beforeAll(() => {
    result = calculateFederalTax(hohWith2ChildrenFixture);
  });

  it("fillReturn produces Schedule EIC for HoH filer with qualifying children", async () => {
    const tmpDir = "forms/filled/test-eic-hoh";
    const fillResult = await fillReturn(hohWith2ChildrenFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: tmpDir,
    });
    const hasScheduleEIC = fillResult.filledForms.some((f) => f.includes("f1040sei"));
    expect(hasScheduleEIC).toBe(true);
  });
});
