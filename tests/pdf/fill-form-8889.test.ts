/**
 * Tests for Form 8889 — Health Savings Accounts (HSAs) PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm8889, FORM_8889_FIELDS } from "@/pdf/fill-form-8889.js";
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

const BLANK_8889 = "forms/blank/2025/f8889.pdf";
const F = FORM_8889_FIELDS;

// ─── Fixture 1: Single filer, self-only HDHP, full-year contributions ───

const singleSelfOnlyFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Alice",
      lastName: "Johnson",
      ssn: "111-22-3333",
      dateOfBirth: "1990-05-12",
    },
    address: {
      street: "456 Pine St",
      city: "Denver",
      state: "CO",
      zip: "80202",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Health Corp", ein: "11-2222222" },
      wages: "75000",
      federalWithheld: "11000",
      socialSecurityWages: "75000",
      socialSecurityWithheld: "4650",
      medicareWages: "75000",
      medicareWithheld: "1087.50",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "CO",
      box12CodeW: "1200",
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
  form8889: {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only") as TaxYearInput["form8889"] extends { coverageByMonth: infer T } ? T : never,
    contributionsMade: "3100",
  },
};

describe("Form 8889 PDF filling — Single filer, self-only coverage", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax> extends infer R ? R : never;

  beforeAll(async () => {
    result = calculateFederalTax(singleSelfOnlyFixture);
    doc = await fillForm8889(singleSelfOnlyFixture, result, BLANK_8889, "primary");
  });

  it("Form 8889 header - name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Alice Johnson");
    expect(getFieldText(doc, F.ssn)).toBe("111223333");
  });

  it("Form 8889 Line 1 - self-only coverage checkbox checked", () => {
    expect(isChecked(doc, F.selfOnly)).toBe(true);
    expect(isChecked(doc, F.family)).toBe(false);
  });

  it("Form 8889 Line 2 - total HSA contributions", () => {
    const f8889 = result.form8889;
    expect(f8889).toBeDefined();
    expect(getFieldText(doc, F.line2)).toBe(formatCurrency(f8889!.line2));
  });

  it("Form 8889 Line 3 - employer contributions from W-2 Box 12 Code W", () => {
    const f8889 = result.form8889;
    expect(f8889).toBeDefined();
    // W-2 has box12CodeW of 1200
    expect(getFieldText(doc, F.line3)).toBe(formatCurrency(f8889!.line3));
  });

  it("Form 8889 Part I Lines 5-13 - contribution deduction computation", () => {
    const f8889 = result.form8889!;
    expect(getFieldText(doc, F.line5)).toBe(formatCurrency(f8889.line5));
    expect(getFieldText(doc, F.line6)).toBe(formatCurrency(f8889.line6));
    expect(getFieldText(doc, F.line8)).toBe(formatCurrency(f8889.line8));
    expect(getFieldText(doc, F.line9)).toBe(formatCurrency(f8889.line9));
    expect(getFieldText(doc, F.line11)).toBe(formatCurrency(f8889.line11));
    expect(getFieldText(doc, F.line12)).toBe(formatCurrency(f8889.line12));
    expect(getFieldText(doc, F.line13)).toBe(formatCurrency(f8889.line13));
  });
});

// ─── Fixture 2: MFJ, family HDHP, catch-up contribution (age 55+) ──────

const mfjFamilyWithCatchUpFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Robert",
      lastName: "Williams",
      ssn: "222-33-4444",
      dateOfBirth: "1968-03-20",
    },
    spouse: {
      firstName: "Susan",
      lastName: "Williams",
      ssn: "555-66-7777",
      dateOfBirth: "1970-08-15",
    },
    address: {
      street: "789 Elm Ave",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Big Corp", ein: "33-4444444" },
      wages: "120000",
      federalWithheld: "18000",
      socialSecurityWages: "120000",
      socialSecurityWithheld: "7440",
      medicareWages: "120000",
      medicareWithheld: "1740",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "TX",
      box12CodeW: "3000",
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
  form8889: {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("family") as TaxYearInput["form8889"] extends { coverageByMonth: infer T } ? T : never,
    contributionsMade: "9550",
    employerContributions: "3000",
  },
};

describe("Form 8889 PDF filling — MFJ, family coverage, age 55+ catch-up", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjFamilyWithCatchUpFixture);
    doc = await fillForm8889(mfjFamilyWithCatchUpFixture, result, BLANK_8889, "primary");
  });

  it("Form 8889 header - name and SSN for primary", () => {
    expect(getFieldText(doc, F.name)).toBe("Robert Williams");
    expect(getFieldText(doc, F.ssn)).toBe("222334444");
  });

  it("Form 8889 Line 1 - family coverage checkbox checked", () => {
    expect(isChecked(doc, F.selfOnly)).toBe(false);
    expect(isChecked(doc, F.family)).toBe(true);
  });

  it("Form 8889 Part I - catch-up contribution on line 7 for 55+ filer", () => {
    const f8889 = result.form8889!;
    // Primary born 1968, age 57 in 2025 — qualifies for catch-up
    expect(f8889.line7.gt(0)).toBe(true);
    expect(getFieldText(doc, F.line7)).toBe(formatCurrency(f8889.line7));
  });

  it("Form 8889 Line 13 - HSA deduction amount", () => {
    const f8889 = result.form8889!;
    expect(getFieldText(doc, F.line13)).toBe(formatCurrency(f8889.line13));
    // Deduction should be > 0 for someone making contributions above employer amount
    expect(f8889.line13.gt(0)).toBe(true);
  });
});

// ─── Fixture 3: Single with HSA distributions and taxable amount ────────

const distributionFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Carlos",
      lastName: "Martinez",
      ssn: "333-44-5555",
      dateOfBirth: "1985-11-03",
    },
    address: {
      street: "321 Cedar Ln",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Startup Inc", ein: "55-6666666" },
      wages: "95000",
      federalWithheld: "14000",
      socialSecurityWages: "95000",
      socialSecurityWithheld: "5890",
      medicareWages: "95000",
      medicareWithheld: "1377.50",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "OR",
      box12CodeW: "0",
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
  form8889: {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only") as TaxYearInput["form8889"] extends { coverageByMonth: infer T } ? T : never,
    contributionsMade: "4300",
    distributionsReceived: "3000",
    qualifiedMedicalExpenses: "1500",
  },
};

describe("Form 8889 PDF filling — Distributions with taxable amount", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(distributionFixture);
    doc = await fillForm8889(distributionFixture, result, BLANK_8889, "primary");
  });

  it("Form 8889 Part II Lines 14a-14c - distribution amounts", () => {
    const f8889 = result.form8889!;
    expect(getFieldText(doc, F.line14a)).toBe(formatCurrency(f8889.line14a));
    expect(getFieldText(doc, F.line14c)).toBe(formatCurrency(f8889.line14c));
  });

  it("Form 8889 Line 15 - qualified medical expenses", () => {
    const f8889 = result.form8889!;
    expect(getFieldText(doc, F.line15)).toBe(formatCurrency(f8889.line15));
  });

  it("Form 8889 Line 16 - taxable HSA distributions", () => {
    const f8889 = result.form8889!;
    // $3000 distributions - $1500 qualified expenses = $1500 taxable
    expect(f8889.line16.gt(0)).toBe(true);
    expect(getFieldText(doc, F.line16)).toBe(formatCurrency(f8889.line16));
  });

  it("Form 8889 Line 17b - additional 20% tax on taxable distributions", () => {
    const f8889 = result.form8889!;
    // 20% of taxable distributions
    expect(f8889.line17b.gt(0)).toBe(true);
    expect(getFieldText(doc, F.line17b)).toBe(formatCurrency(f8889.line17b));
  });

  it("Form 8889 Line 17a - no exception checkbox when fully taxable", () => {
    const f8889 = result.form8889!;
    expect(f8889.line17aHasException).toBe(false);
    expect(isChecked(doc, F.line17a)).toBe(false);
  });
});

// ─── Fixture 4: MFJ with per-owner HSA (form8889ByOwner) ───────────────

const mfjByOwnerFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Daniel",
      lastName: "Park",
      ssn: "444-55-6666",
      dateOfBirth: "1980-07-10",
    },
    spouse: {
      firstName: "Grace",
      lastName: "Park",
      ssn: "777-88-9999",
      dateOfBirth: "1982-12-25",
    },
    address: {
      street: "555 Maple Dr",
      city: "Chicago",
      state: "IL",
      zip: "60601",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Alpha Co", ein: "66-7777777" },
      wages: "100000",
      federalWithheld: "15000",
      socialSecurityWages: "100000",
      socialSecurityWithheld: "6200",
      medicareWages: "100000",
      medicareWithheld: "1450",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "IL",
      box12CodeW: "2000",
      accountHolder: "primary",
    },
    {
      employer: { name: "Beta Co", ein: "77-8888888" },
      wages: "80000",
      federalWithheld: "12000",
      socialSecurityWages: "80000",
      socialSecurityWithheld: "4960",
      medicareWages: "80000",
      medicareWithheld: "1160",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "IL",
      box12CodeW: "1500",
      accountHolder: "spouse",
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
  form8889ByOwner: {
    primary: {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("family") as TaxYearInput["form8889"] extends { coverageByMonth: infer T } ? T : never,
      contributionsMade: "5000",
      bothSpousesHaveHsas: true,
    },
    spouse: {
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("family") as TaxYearInput["form8889"] extends { coverageByMonth: infer T } ? T : never,
      contributionsMade: "4000",
      bothSpousesHaveHsas: true,
    },
  },
};

describe("Form 8889 PDF filling — MFJ with per-owner HSAs", () => {
  let primaryDoc: PDFDocument;
  let spouseDoc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjByOwnerFixture);
    primaryDoc = await fillForm8889(mfjByOwnerFixture, result, BLANK_8889, "primary");
    spouseDoc = await fillForm8889(mfjByOwnerFixture, result, BLANK_8889, "spouse");
  });

  it("Primary Form 8889 - header shows primary name/SSN", () => {
    expect(getFieldText(primaryDoc, F.name)).toBe("Daniel Park");
    expect(getFieldText(primaryDoc, F.ssn)).toBe("444556666");
  });

  it("Spouse Form 8889 - header shows spouse name/SSN", () => {
    expect(getFieldText(spouseDoc, F.name)).toBe("Grace Park");
    expect(getFieldText(spouseDoc, F.ssn)).toBe("777889999");
  });

  it("Primary Form 8889 - family coverage", () => {
    expect(isChecked(primaryDoc, F.family)).toBe(true);
    expect(isChecked(primaryDoc, F.selfOnly)).toBe(false);
  });

  it("Spouse Form 8889 - family coverage", () => {
    expect(isChecked(spouseDoc, F.family)).toBe(true);
    expect(isChecked(spouseDoc, F.selfOnly)).toBe(false);
  });

  it("Primary Form 8889 - has contribution deduction", () => {
    const f8889Primary = result.form8889ByOwner?.primary;
    expect(f8889Primary).toBeDefined();
    expect(getFieldText(primaryDoc, F.line13)).toBe(formatCurrency(f8889Primary!.line13));
  });

  it("Spouse Form 8889 - has contribution deduction", () => {
    const f8889Spouse = result.form8889ByOwner?.spouse;
    expect(f8889Spouse).toBeDefined();
    expect(getFieldText(spouseDoc, F.line13)).toBe(formatCurrency(f8889Spouse!.line13));
  });

  it("Both forms produce non-zero deductions for each owner", () => {
    const primaryResult = result.form8889ByOwner?.primary;
    const spouseResult = result.form8889ByOwner?.spouse;
    expect(primaryResult?.line13.gt(0)).toBe(true);
    expect(spouseResult?.line13.gt(0)).toBe(true);
  });
});
