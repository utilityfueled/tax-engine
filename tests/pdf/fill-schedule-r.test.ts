/**
 * Tests for Schedule R — Credit for the Elderly or the Disabled PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleR, SCHEDULE_R_FIELDS } from "@/pdf/fill-schedule-r.js";
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

const BLANK_SCHED_R = "forms/blank/f1040sr.pdf";
const F = SCHEDULE_R_FIELDS;

// ─── Fixture 1: Single filer, age 65+, Box 1, low AGI → credit ────────────

const singleElderlyFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Margaret",
      lastName: "Elder",
      ssn: "222-33-4444",
      dateOfBirth: "1958-06-15",
      occupation: "Retired",
    },
    address: {
      street: "300 Quiet Ln",
      city: "Sarasota",
      state: "FL",
      zip: "34236",
    },
    dependents: [],
  },
  w2s: [],
  form1099Int: [
    { payer: "Community Bank", amount: "1000" },
  ],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  form1099R: [
    {
      payer: "State Pension Fund",
      grossDistribution: "5000",
      taxableAmount: "4000",
      federalWithheld: "400",
      distributionCode: "7",
    },
  ],
  formSSA1099: [
    { netBenefits: "3000" },
  ],
  scheduleR: {
    primaryQualifies: true,
    primaryAge65OrOlder: true,
    nontaxablePensionsAnnuities: "1000", // $5000 gross - $4000 taxable
  },
};

describe("Schedule R PDF filling — Single filer, age 65+, Box 1", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(singleElderlyFixture);
    doc = await fillScheduleR(singleElderlyFixture, result, BLANK_SCHED_R);
  });

  it("Schedule R header - name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Margaret Elder");
    expect(getFieldText(doc, F.ssn)).toBe("222334444");
  });

  it("Schedule R Part I - Box 1 checked for single age 65+", () => {
    expect(result.scheduleR).toBeDefined();
    expect(result.scheduleR!.box).toBe(1);
    expect(isChecked(doc, F.box1)).toBe(true);
    // Other boxes should NOT be checked
    expect(isChecked(doc, F.box2)).toBe(false);
    expect(isChecked(doc, F.box3)).toBe(false);
  });

  it("Schedule R Line 10 - initial amount $5,000 for Box 1", () => {
    expect(result.scheduleR!.initialAmount.toNumber()).toBe(5000);
    expect(getFieldText(doc, F.line10)).toBe(formatCurrency(result.scheduleR!.initialAmount));
  });

  it("Schedule R Line 12 - adjusted initial amount equals initial (no disability cap)", () => {
    const schedR = result.scheduleR!;
    expect(schedR.adjustedInitialAmount.toNumber()).toBe(5000);
    expect(getFieldText(doc, F.line12)).toBe(formatCurrency(schedR.adjustedInitialAmount));
  });

  it("Schedule R Lines 13a-13c - nontaxable benefits", () => {
    const schedR = result.scheduleR!;
    // Nontaxable SS = gross SS - taxable SS ($8000 SS with low income → all nontaxable)
    const nontaxableSS = result.socialSecurityBenefitsGross.minus(result.socialSecurityBenefitsTaxable);
    expect(nontaxableSS.greaterThan(0)).toBe(true);
    expect(getFieldText(doc, F.line13a)).toBe(formatCurrency(nontaxableSS));
    // Total nontaxable: SS + pensions ($1000)
    expect(schedR.nontaxableBenefits.greaterThan(0)).toBe(true);
    expect(getFieldText(doc, F.line13c)).toBe(formatCurrency(schedR.nontaxableBenefits));
  });

  it("Schedule R Lines 14-17 - AGI reduction calculation", () => {
    expect(getFieldText(doc, F.line14)).toBe(formatCurrency(result.agi));
    // Box 1: AGI threshold = $7,500
    expect(getFieldText(doc, F.line15)).toBe("7500");
  });

  it("Schedule R Lines 19-20 - credit base and tentative credit", () => {
    const schedR = result.scheduleR!;
    expect(getFieldText(doc, F.line19)).toBe(formatCurrency(schedR.creditBase));
    expect(getFieldText(doc, F.line20)).toBe(formatCurrency(schedR.credit));
  });

  it("Schedule R eligible and produces positive credit", () => {
    const schedR = result.scheduleR!;
    expect(schedR.eligible).toBe(true);
    expect(schedR.credit.greaterThan(0)).toBe(true);
  });
});

// ─── Fixture 2: MFJ, both 65+, Box 3, with Social Security ────────────────

const mfjBothElderlyFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Harold",
      lastName: "Senior",
      ssn: "555-66-7777",
      dateOfBirth: "1955-02-20",
      occupation: "Retired",
    },
    spouse: {
      firstName: "Edna",
      lastName: "Senior",
      ssn: "888-99-0000",
      dateOfBirth: "1957-11-08",
    },
    address: {
      street: "100 Sunset Blvd",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
    },
    dependents: [],
  },
  w2s: [],
  form1099Int: [
    { payer: "Credit Union", amount: "1500" },
  ],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  formSSA1099: [
    { netBenefits: "4000" },
  ],
  scheduleR: {
    primaryQualifies: true,
    primaryAge65OrOlder: true,
    spouseQualifies: true,
    spouseAge65OrOlder: true,
    nontaxablePensionsAnnuities: "0",
  },
};

describe("Schedule R PDF filling — MFJ, both 65+, Box 3", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjBothElderlyFixture);
    doc = await fillScheduleR(mfjBothElderlyFixture, result, BLANK_SCHED_R);
  });

  it("Schedule R header - joint names", () => {
    expect(getFieldText(doc, F.name)).toBe("Harold Senior & Edna Senior");
    expect(getFieldText(doc, F.ssn)).toBe("555667777");
  });

  it("Schedule R Part I - Box 3 checked for MFJ both 65+", () => {
    expect(result.scheduleR).toBeDefined();
    expect(result.scheduleR!.box).toBe(3);
    expect(isChecked(doc, F.box3)).toBe(true);
    expect(isChecked(doc, F.box1)).toBe(false);
  });

  it("Schedule R Line 10 - initial amount $7,500 for Box 3", () => {
    expect(result.scheduleR!.initialAmount.toNumber()).toBe(7500);
    expect(getFieldText(doc, F.line10)).toBe(formatCurrency(result.scheduleR!.initialAmount));
  });

  it("Schedule R Lines 13a-13c - nontaxable Social Security", () => {
    const schedR = result.scheduleR!;
    // With $20k SS and low other income, most should be nontaxable
    const nontaxableSS = result.socialSecurityBenefitsGross.minus(result.socialSecurityBenefitsTaxable);
    expect(nontaxableSS.greaterThan(0)).toBe(true);
    expect(getFieldText(doc, F.line13c)).toBe(formatCurrency(schedR.nontaxableBenefits));
  });

  it("Schedule R Line 15 - AGI threshold $10,000 for MFJ boxes", () => {
    expect(getFieldText(doc, F.line15)).toBe("10000");
  });

  it("Schedule R Line 22 - final credit", () => {
    const schedR = result.scheduleR!;
    expect(getFieldText(doc, F.line22)).toBe(formatCurrency(schedR.credit));
  });
});

// ─── Fixture 3: Not eligible → no fields filled beyond header ──────────────

describe("Schedule R PDF filling — not eligible, no fields filled", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  const notEligibleFixture: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Young",
        lastName: "Worker",
        ssn: "123-45-6789",
        dateOfBirth: "1990-01-01",
        occupation: "Engineer",
      },
      address: {
        street: "1 Tech Way",
        city: "San Jose",
        state: "CA",
        zip: "95113",
      },
      dependents: [],
    },
    w2s: [
      {
        employer: { name: "Tech Corp", ein: "99-8877666" },
        wages: "100000",
        federalWithheld: "20000",
        socialSecurityWages: "100000",
        socialSecurityWithheld: "6200",
        medicareWages: "100000",
        medicareWithheld: "1450",
        stateTaxWithheld: "0",
        stateWages: "0",
        localTaxWithheld: "0",
        state: "CA",
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
    // Under 65, not disabled → not eligible
    scheduleR: {
      primaryQualifies: false,
      primaryAge65OrOlder: false,
      nontaxablePensionsAnnuities: "0",
    },
  };

  beforeAll(async () => {
    result = calculateFederalTax(notEligibleFixture);
    doc = await fillScheduleR(notEligibleFixture, result, BLANK_SCHED_R);
  });

  it("Schedule R - not eligible, no credit", () => {
    expect(result.scheduleR).toBeDefined();
    expect(result.scheduleR!.eligible).toBe(false);
    expect(result.scheduleR!.credit.toNumber()).toBe(0);
  });

  it("Schedule R - no boxes checked when not eligible", () => {
    expect(isChecked(doc, F.box1)).toBe(false);
    expect(isChecked(doc, F.box2)).toBe(false);
    expect(isChecked(doc, F.box3)).toBe(false);
  });

  it("Schedule R - credit lines empty when not eligible", () => {
    expect(getFieldText(doc, F.line10)).toBeUndefined();
    expect(getFieldText(doc, F.line20)).toBeUndefined();
    expect(getFieldText(doc, F.line22)).toBeUndefined();
  });
});
