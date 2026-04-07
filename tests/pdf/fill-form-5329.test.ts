/**
 * Tests for Form 5329 — Additional Taxes on Qualified Plans PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm5329, FORM_5329_FIELDS } from "@/pdf/fill-form-5329.js";
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

/**
 * Expected field value: formatCurrency returns "" for zero values,
 * and setTextField skips empty strings, so zero-valued fields stay undefined.
 */
function expectedCurrency(value: Decimal): string | undefined {
  const formatted = formatCurrency(value);
  return formatted || undefined;
}

const BLANK_5329 = "forms/blank/f5329.pdf";
const F = FORM_5329_FIELDS;

// ─── Fixture 1: Early distribution penalty (Part I) ─────────────────────

const earlyDistributionFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Jake",
      lastName: "Wilson",
      ssn: "111-22-3333",
      dateOfBirth: "1990-06-15",
      occupation: "Engineer",
    },
    address: {
      street: "456 Pine St",
      city: "Austin",
      state: "TX",
      zip: "73301",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Tech Corp", ein: "11-2222222" },
      wages: "85000",
      federalWithheld: "12000",
      socialSecurityWages: "85000",
      socialSecurityWithheld: "5270",
      medicareWages: "85000",
      medicareWithheld: "1233",
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
  form5329: {
    earlyDistributionsIncludedInIncome: "15000",
    distributionsNotSubjectToAdditionalTax: "5000",
    distributionExceptionNumber: "02",
    simpleIRADistributionsWithinFirstTwoYears: "0",
  },
};

describe("Form 5329 PDF filling — Early distribution penalty (Part I)", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(earlyDistributionFixture);
    doc = await fillForm5329(earlyDistributionFixture, result, BLANK_5329);
  });

  it("Form 5329 header - name and SSN filled correctly", () => {
    expect(getFieldText(doc, F.name)).toBe("Jake Wilson");
    expect(getFieldText(doc, F.ssn)).toBe("111223333");
  });

  it("Form 5329 Part I Line 1 - early distributions includible in income", () => {
    const f5329 = result.form5329!;
    expect(f5329).toBeDefined();
    expect(getFieldText(doc, F.line1)).toBe(formatCurrency(f5329.line1));
  });

  it("Form 5329 Part I Line 2 - exception number and excluded amount", () => {
    const f5329 = result.form5329!;
    expect(getFieldText(doc, F.line2ExceptionNumber)).toBe("02");
    expect(getFieldText(doc, F.line2)).toBe(formatCurrency(f5329.line2));
  });

  it("Form 5329 Part I Line 3 - amount subject to additional tax", () => {
    const f5329 = result.form5329!;
    expect(getFieldText(doc, F.line3)).toBe(formatCurrency(f5329.line3));
    // Line 3 = Line 1 - Line 2
    expect(f5329.line3.toNumber()).toBe(f5329.line1.minus(f5329.line2).toNumber());
  });

  it("Form 5329 Part I Line 4 - additional tax is 10% of line 3", () => {
    const f5329 = result.form5329!;
    expect(getFieldText(doc, F.line4)).toBe(formatCurrency(f5329.line4));
    expect(f5329.line4.toNumber()).toBe(f5329.line3.times(0.10).toNumber());
  });
});

// ─── Fixture 2: Excess IRA contributions (Parts III & IV) ───────────────

const excessContributionFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Sarah",
      lastName: "Chen",
      ssn: "444-55-6666",
      dateOfBirth: "1985-03-20",
      occupation: "Doctor",
    },
    address: {
      street: "789 Elm Ave",
      city: "Denver",
      state: "CO",
      zip: "80201",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "City Hospital", ein: "33-4444444" },
      wages: "180000",
      federalWithheld: "35000",
      socialSecurityWages: "168600",
      socialSecurityWithheld: "10453",
      medicareWages: "180000",
      medicareWithheld: "2610",
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
  form5329: {
    // Part III: Traditional IRA excess contributions
    traditionalIRAPriorYearExcessContributions: "2000",
    traditionalIRAContributionRoom: "500",
    traditionalIRADistributionsIncludedInIncome: "0",
    traditionalIRAPriorYearExcessReturned: "300",
    traditionalIRACurrentYearExcessContributions: "1000",
    traditionalIRAValueDec31: "50000",
    // Part IV: Roth IRA excess contributions
    rothIRAPriorYearExcessContributions: "1500",
    rothIRAContributionRoom: "0",
    rothIRADistributions: "500",
    rothIRACurrentYearExcessContributions: "800",
    rothIRAValueDec31: "30000",
  },
};

describe("Form 5329 PDF filling — Excess IRA contributions (Parts III & IV)", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(excessContributionFixture);
    doc = await fillForm5329(excessContributionFixture, result, BLANK_5329);
  });

  it("Form 5329 Part III Lines 9-13 - traditional IRA excess contribution inputs", () => {
    const f5329 = result.form5329!;
    expect(f5329).toBeDefined();
    expect(getFieldText(doc, F.line9)).toBe(expectedCurrency(f5329.line9));
    expect(getFieldText(doc, F.line10)).toBe(expectedCurrency(f5329.line10));
    expect(getFieldText(doc, F.line11)).toBe(expectedCurrency(f5329.line11));
    expect(getFieldText(doc, F.line12)).toBe(expectedCurrency(f5329.line12));
    expect(getFieldText(doc, F.line13)).toBe(expectedCurrency(f5329.line13));
  });

  it("Form 5329 Part III Lines 14-17 - traditional IRA excess contribution totals and tax", () => {
    const f5329 = result.form5329!;
    expect(getFieldText(doc, F.line14)).toBe(expectedCurrency(f5329.line14));
    expect(getFieldText(doc, F.line15)).toBe(expectedCurrency(f5329.line15));
    expect(getFieldText(doc, F.line16)).toBe(expectedCurrency(f5329.line16));
    expect(getFieldText(doc, F.line17)).toBe(expectedCurrency(f5329.line17));
  });

  it("Form 5329 Part IV Lines 18-25 - Roth IRA excess contribution fields populated", () => {
    const f5329 = result.form5329!;
    expect(getFieldText(doc, F.line18)).toBe(expectedCurrency(f5329.line18));
    expect(getFieldText(doc, F.line19)).toBe(expectedCurrency(f5329.line19));
    expect(getFieldText(doc, F.line20)).toBe(expectedCurrency(f5329.line20));
    expect(getFieldText(doc, F.line21)).toBe(expectedCurrency(f5329.line21));
    expect(getFieldText(doc, F.line22)).toBe(expectedCurrency(f5329.line22));
    expect(getFieldText(doc, F.line23)).toBe(expectedCurrency(f5329.line23));
    expect(getFieldText(doc, F.line24)).toBe(expectedCurrency(f5329.line24));
    expect(getFieldText(doc, F.line25)).toBe(expectedCurrency(f5329.line25));
  });
});

// ─── Fixture 3: HSA excess contributions (Part VII) ─────────────────────

const hsaExcessFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Lily",
      lastName: "Patel",
      ssn: "777-88-9999",
      dateOfBirth: "1992-11-10",
      occupation: "Nurse",
    },
    address: {
      street: "321 Oak Dr",
      city: "Tampa",
      state: "FL",
      zip: "33601",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Tampa General", ein: "55-6666666" },
      wages: "72000",
      federalWithheld: "9000",
      socialSecurityWages: "72000",
      socialSecurityWithheld: "4464",
      medicareWages: "72000",
      medicareWithheld: "1044",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "FL",
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
  form5329: {
    // Part VII: HSA excess contributions
    hsaPriorYearExcessContributions: "600",
    hsaContributionRoom: "200",
    hsaDistributions: "100",
    hsaCurrentYearExcessContributions: "500",
    hsaValueDec31: "8000",
  },
};

describe("Form 5329 PDF filling — HSA excess contributions (Part VII)", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(hsaExcessFixture);
    doc = await fillForm5329(hsaExcessFixture, result, BLANK_5329);
  });

  it("Form 5329 Part VII Lines 42-49 - HSA excess contribution fields populated", () => {
    const f5329 = result.form5329!;
    expect(f5329).toBeDefined();
    expect(getFieldText(doc, F.line42)).toBe(expectedCurrency(f5329.line42));
    expect(getFieldText(doc, F.line43)).toBe(expectedCurrency(f5329.line43));
    expect(getFieldText(doc, F.line44)).toBe(expectedCurrency(f5329.line44));
    expect(getFieldText(doc, F.line45)).toBe(expectedCurrency(f5329.line45));
    expect(getFieldText(doc, F.line46)).toBe(expectedCurrency(f5329.line46));
    expect(getFieldText(doc, F.line47)).toBe(expectedCurrency(f5329.line47));
    expect(getFieldText(doc, F.line48)).toBe(expectedCurrency(f5329.line48));
    expect(getFieldText(doc, F.line49)).toBe(expectedCurrency(f5329.line49));
  });
});

// ─── Fixture 4: RMD penalty - not corrected within window (Part IX) ─────

const rmdPenaltyFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Robert",
      lastName: "Brown",
      ssn: "222-33-4444",
      dateOfBirth: "1950-01-15",
      occupation: "Retired",
    },
    address: {
      street: "555 Maple Ct",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
    },
    dependents: [],
  },
  w2s: [],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  form5329: {
    requiredMinimumDistribution: "20000",
    actualDistributionsForRMD: "8000",
    rmdShortfallCorrectedWithinWindow: false,
  },
};

describe("Form 5329 PDF filling — RMD penalty at 25% (Part IX)", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(rmdPenaltyFixture);
    doc = await fillForm5329(rmdPenaltyFixture, result, BLANK_5329);
  });

  it("Form 5329 Part IX - RMD shortfall fills (b) sub-lines at 25% rate", () => {
    const f5329 = result.form5329!;
    expect(f5329).toBeDefined();
    // Not corrected → fill 52b, 53b, 54b (not a sub-lines)
    expect(getFieldText(doc, F.line52b)).toBe(formatCurrency(f5329.line54));
    expect(getFieldText(doc, F.line53b)).toBe(formatCurrency(f5329.line55));
    expect(getFieldText(doc, F.line54b)).toBe(formatCurrency(f5329.line57));
    // (a) sub-lines should be empty
    expect(getFieldText(doc, F.line52a)).toBeUndefined();
    expect(getFieldText(doc, F.line53a)).toBeUndefined();
    expect(getFieldText(doc, F.line54a)).toBeUndefined();
    // Line 55 = total
    expect(getFieldText(doc, F.line55)).toBe(formatCurrency(f5329.line57));
  });

  it("Form 5329 Part IX - RMD shortfall is $12,000 with 25% tax of $3,000", () => {
    const f5329 = result.form5329!;
    expect(f5329.line54.toNumber()).toBe(20000); // required minimum
    expect(f5329.line55.toNumber()).toBe(8000);  // actual distributed
    expect(f5329.line56.toNumber()).toBe(12000); // shortfall
    expect(f5329.line57.toNumber()).toBe(3000);  // 25% tax
  });
});

// ─── Fixture 5: RMD penalty - corrected within window (Part IX, 10%) ────

const rmdCorrectedFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Helen",
      lastName: "Martinez",
      ssn: "666-77-8888",
      dateOfBirth: "1948-09-20",
      occupation: "Retired",
    },
    address: {
      street: "888 Birch Ln",
      city: "Tucson",
      state: "AZ",
      zip: "85701",
    },
    dependents: [],
  },
  w2s: [],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  form5329: {
    requiredMinimumDistribution: "15000",
    actualDistributionsForRMD: "10000",
    rmdShortfallCorrectedWithinWindow: true,
  },
};

describe("Form 5329 PDF filling — RMD penalty corrected within window (Part IX, 10%)", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(rmdCorrectedFixture);
    doc = await fillForm5329(rmdCorrectedFixture, result, BLANK_5329);
  });

  it("Form 5329 Part IX - corrected shortfall fills (a) sub-lines at 10% rate", () => {
    const f5329 = result.form5329!;
    expect(f5329).toBeDefined();
    // Corrected within window → fill 52a, 53a, 54a
    expect(getFieldText(doc, F.line52a)).toBe(formatCurrency(f5329.line54));
    expect(getFieldText(doc, F.line53a)).toBe(formatCurrency(f5329.line55));
    expect(getFieldText(doc, F.line54a)).toBe(formatCurrency(f5329.line57));
    // (b) sub-lines should be empty
    expect(getFieldText(doc, F.line52b)).toBeUndefined();
    expect(getFieldText(doc, F.line53b)).toBeUndefined();
    expect(getFieldText(doc, F.line54b)).toBeUndefined();
    // Line 55 = total
    expect(getFieldText(doc, F.line55)).toBe(formatCurrency(f5329.line57));
  });

  it("Form 5329 Part IX - corrected shortfall is $5,000 with 10% tax of $500", () => {
    const f5329 = result.form5329!;
    expect(f5329.line54.toNumber()).toBe(15000);
    expect(f5329.line55.toNumber()).toBe(10000);
    expect(f5329.line56.toNumber()).toBe(5000);
    expect(f5329.line57.toNumber()).toBe(500);
  });
});

// ─── Fixture 6: No form5329 result → only header filled ─────────────────

const noForm5329Fixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "No",
      lastName: "Penalty",
      ssn: "999-00-1111",
      dateOfBirth: "1980-01-01",
      occupation: "Writer",
    },
    address: {
      street: "1 No St",
      city: "Nowhere",
      state: "CA",
      zip: "90001",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Publisher", ein: "99-0000000" },
      wages: "50000",
      federalWithheld: "6000",
      socialSecurityWages: "50000",
      socialSecurityWithheld: "3100",
      medicareWages: "50000",
      medicareWithheld: "725",
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
};

describe("Form 5329 PDF filling — no Form 5329 result (only header)", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(noForm5329Fixture);
    doc = await fillForm5329(noForm5329Fixture, result, BLANK_5329);
  });

  it("Form 5329 - header still filled even without form 5329 result", () => {
    expect(getFieldText(doc, F.name)).toBe("No Penalty");
    expect(getFieldText(doc, F.ssn)).toBe("999001111");
  });

  it("Form 5329 - all line fields are empty when no form 5329 result exists", () => {
    expect(getFieldText(doc, F.line1)).toBeUndefined();
    expect(getFieldText(doc, F.line4)).toBeUndefined();
    expect(getFieldText(doc, F.line9)).toBeUndefined();
    expect(getFieldText(doc, F.line17)).toBeUndefined();
    expect(getFieldText(doc, F.line25)).toBeUndefined();
    expect(getFieldText(doc, F.line49)).toBeUndefined();
  });
});
