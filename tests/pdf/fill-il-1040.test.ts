/**
 * Tests for Illinois IL-1040 PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillIL1040, IL_1040_FIELDS } from "@/pdf/fill-il-1040.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
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

const BLANK_PDF = "forms/blank/il-1040.pdf";

// ─── Simple IL Single Filer ──────────────────────────────────────────────

/** Single filer with $85k W-2 income, Illinois withholding */
const ilSingleFiler: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Jane",
      lastName: "Doe",
      ssn: "123-45-6789",
      dateOfBirth: "1990-01-15",
      occupation: "Software Engineer",
    },
    address: {
      street: "456 Michigan Ave",
      apt: "2B",
      city: "Chicago",
      state: "IL",
      zip: "60601",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Tech Corp", ein: "12-3456789" },
      wages: "85000",
      federalWithheld: "12750",
      socialSecurityWages: "85000",
      socialSecurityWithheld: "5270",
      medicareWages: "85000",
      medicareWithheld: "1232.50",
      stateTaxWithheld: "3500",
      stateWages: "85000",
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
  form1099G: [],
  form1099OID: [],
  formW2G: [],
  form1099K: [],
  form1099C: [],
  form1099Q: [],
  homeSales: [],
  form8824: [],
  form8814: [],
  stateReturns: {
    illinois: {
      claimedAsDependent: false,
      age65OrOlderCount: 0,
      blindCount: 0,
      dependentCount: 0,
      hasChildUnder12: false,
    },
  },
};

describe("IL-1040 PDF fill — simple single filer", () => {
  let doc: PDFDocument;
  let result: TaxReturnResult;

  beforeAll(async () => {
    result = calculateFederalTax(ilSingleFiler);
    doc = await fillIL1040(ilSingleFiler, result, BLANK_PDF);
  });

  it("fills primary taxpayer name", () => {
    expect(getFieldText(doc, IL_1040_FIELDS.firstName)).toBe("Jane");
    expect(getFieldText(doc, IL_1040_FIELDS.lastName)).toBe("Doe");
  });

  it("fills primary SSN without dashes", () => {
    expect(getFieldText(doc, IL_1040_FIELDS.ssn)).toBe("123456789");
  });

  it("fills address fields", () => {
    expect(getFieldText(doc, IL_1040_FIELDS.mailingAddress)).toBe("456 Michigan Ave");
    expect(getFieldText(doc, IL_1040_FIELDS.aptNo)).toBe("2B");
    expect(getFieldText(doc, IL_1040_FIELDS.city)).toBe("Chicago");
    expect(getFieldText(doc, IL_1040_FIELDS.state)).toBe("IL");
    expect(getFieldText(doc, IL_1040_FIELDS.zip)).toBe("60601");
  });

  it("fills Line 1 — federal AGI", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(getFieldText(doc, IL_1040_FIELDS.line1FederalAGI)).toBe(
      formatCurrency(ilResult.federalAGI),
    );
  });

  it("fills Line 9 — base income", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(getFieldText(doc, IL_1040_FIELDS.line9BaseIncome)).toBe(
      formatCurrency(ilResult.baseIncome),
    );
  });

  it("fills Line 10a — personal exemption", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(getFieldText(doc, IL_1040_FIELDS.line10aPersonalExemption)).toBe(
      formatCurrency(ilResult.personalExemption),
    );
  });

  it("fills Line 10 — total exemptions", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(getFieldText(doc, IL_1040_FIELDS.line10TotalExemptions)).toBe(
      formatCurrency(ilResult.totalExemptions),
    );
  });

  it("fills Line 11 — net income", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(getFieldText(doc, IL_1040_FIELDS.line11NetIncome)).toBe(
      formatCurrency(ilResult.netIncome),
    );
  });

  it("fills Line 12 — income tax (4.95% of net income)", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(getFieldText(doc, IL_1040_FIELDS.line12IncomeTax)).toBe(
      formatCurrency(ilResult.incomeTax),
    );
  });

  it("fills Line 14 — total income tax", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(getFieldText(doc, IL_1040_FIELDS.line14TotalIncomeTax)).toBe(
      formatCurrency(ilResult.totalIncomeTax),
    );
  });

  it("fills Line 19 — tax after credits", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(getFieldText(doc, IL_1040_FIELDS.line19TaxAfterCredits)).toBe(
      formatCurrency(ilResult.taxAfterCredits),
    );
  });

  it("fills Line 24 — total tax (both pages)", () => {
    const ilResult = result.stateReturns!.illinois!;
    const expected = formatCurrency(ilResult.totalTax);
    expect(getFieldText(doc, IL_1040_FIELDS.line24TotalTax)).toBe(expected);
    expect(getFieldText(doc, IL_1040_FIELDS.line24TotalTaxPage2)).toBe(expected);
  });

  it("fills Line 25 — Illinois withholding", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(getFieldText(doc, IL_1040_FIELDS.line25Withholding)).toBe(
      formatCurrency(ilResult.ilWithholding),
    );
  });

  it("fills Line 31 — total payments", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(getFieldText(doc, IL_1040_FIELDS.line31TotalPayments)).toBe(
      formatCurrency(ilResult.totalPayments),
    );
  });

  it("fills Line 32 or Line 33 — overpayment or tax due", () => {
    const ilResult = result.stateReturns!.illinois!;
    // One of these should be nonzero
    if (ilResult.preliminaryOverpayment.gt(0)) {
      expect(getFieldText(doc, IL_1040_FIELDS.line32Overpayment)).toBe(
        formatCurrency(ilResult.preliminaryOverpayment),
      );
    } else {
      expect(getFieldText(doc, IL_1040_FIELDS.line33TaxDue)).toBe(
        formatCurrency(ilResult.preliminaryTaxDue),
      );
    }
  });

  it("does not check 65+ or blind checkboxes for young single filer", () => {
    expect(isChecked(doc, IL_1040_FIELDS.over65You)).toBe(false);
    expect(isChecked(doc, IL_1040_FIELDS.over65Spouse)).toBe(false);
    expect(isChecked(doc, IL_1040_FIELDS.blindYou)).toBe(false);
    expect(isChecked(doc, IL_1040_FIELDS.blindSpouse)).toBe(false);
  });
});

// ─── MFJ Filer with EITC and Dependents ─────────────────────────────────

/** MFJ filer with dependents, 65+, EITC-qualifying income */
const ilMFJFiler: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "John",
      lastName: "Smith",
      ssn: "111-22-3333",
      dateOfBirth: "1958-06-15",
      occupation: "Teacher",
    },
    spouse: {
      firstName: "Mary",
      lastName: "Smith",
      ssn: "444-55-6666",
      dateOfBirth: "1960-03-20",
      occupation: "Nurse",
    },
    address: {
      street: "789 Lake Shore Dr",
      city: "Springfield",
      state: "IL",
      zip: "62701",
    },
    dependents: [
      {
        firstName: "Tommy",
        lastName: "Smith",
        ssn: "777-88-9999",
        dateOfBirth: "2016-08-01",
        relationship: "son",
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Springfield School District", ein: "37-1234567" },
      wages: "42000",
      federalWithheld: "3200",
      socialSecurityWages: "42000",
      socialSecurityWithheld: "2604",
      medicareWages: "42000",
      medicareWithheld: "609",
      stateTaxWithheld: "1800",
      stateWages: "42000",
      localTaxWithheld: "0",
      state: "IL",
    },
    {
      employer: { name: "Springfield Hospital", ein: "37-7654321" },
      wages: "35000",
      federalWithheld: "2600",
      socialSecurityWages: "35000",
      socialSecurityWithheld: "2170",
      medicareWages: "35000",
      medicareWithheld: "507.50",
      stateTaxWithheld: "1400",
      stateWages: "35000",
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
  form1099G: [],
  form1099OID: [],
  formW2G: [],
  form1099K: [],
  form1099C: [],
  form1099Q: [],
  homeSales: [],
  form8824: [],
  form8814: [],
  stateReturns: {
    illinois: {
      claimedAsDependent: false,
      age65OrOlderCount: 2,
      blindCount: 0,
      dependentCount: 1,
      hasChildUnder12: true,
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [
          {
            relationship: "son",
            isUnder12: true,
            monthsInHome: 12,
          },
        ],
        federalEIC: "0",
      },
    },
  },
};

describe("IL-1040 PDF fill — MFJ filer with dependents and 65+ exemptions", () => {
  let doc: PDFDocument;
  let result: TaxReturnResult;

  beforeAll(async () => {
    result = calculateFederalTax(ilMFJFiler);
    doc = await fillIL1040(ilMFJFiler, result, BLANK_PDF);
  });

  it("fills both spouse names", () => {
    expect(getFieldText(doc, IL_1040_FIELDS.firstName)).toBe("John");
    expect(getFieldText(doc, IL_1040_FIELDS.lastName)).toBe("Smith");
    expect(getFieldText(doc, IL_1040_FIELDS.spouseFirstName)).toBe("Mary");
    expect(getFieldText(doc, IL_1040_FIELDS.spouseLastName)).toBe("Smith");
  });

  it("fills both SSNs without dashes", () => {
    expect(getFieldText(doc, IL_1040_FIELDS.ssn)).toBe("111223333");
    expect(getFieldText(doc, IL_1040_FIELDS.spouseSsn)).toBe("444556666");
  });

  it("checks MFJ filing status checkbox", () => {
    expect(isChecked(doc, IL_1040_FIELDS.filingStatus)).toBe(true);
  });

  it("checks both 65+ exemption checkboxes", () => {
    expect(isChecked(doc, IL_1040_FIELDS.over65You)).toBe(true);
    expect(isChecked(doc, IL_1040_FIELDS.over65Spouse)).toBe(true);
  });

  it("fills Line 10b — age 65 exemption for two persons", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(ilResult.age65Exemption.toNumber()).toBeGreaterThan(0);
    expect(getFieldText(doc, IL_1040_FIELDS.line10b65Exemption)).toBe(
      formatCurrency(ilResult.age65Exemption),
    );
  });

  it("fills Line 10d — dependent exemption", () => {
    const ilResult = result.stateReturns!.illinois!;
    expect(ilResult.dependentExemption.toNumber()).toBeGreaterThan(0);
    expect(getFieldText(doc, IL_1040_FIELDS.line10dDependentExemption)).toBe(
      formatCurrency(ilResult.dependentExemption),
    );
  });

  it("fills Line 29 — IL EITC (zero for this income level)", () => {
    const ilResult = result.stateReturns!.illinois!;
    // MFJ with $77k income exceeds EITC thresholds — EITC is zero
    expect(ilResult.ilEITC.isZero()).toBe(true);
    // Zero values are not filled (formatCurrency returns "" → setTextField skips)
    expect(getFieldText(doc, IL_1040_FIELDS.line29EITC)).toBeUndefined();
  });

  it("fills Line 30 — IL Child Tax Credit (zero when no EITC)", () => {
    const ilResult = result.stateReturns!.illinois!;
    // IL CTC = 40% of IL EITC, which is zero
    expect(ilResult.ilChildTaxCredit.isZero()).toBe(true);
    expect(getFieldText(doc, IL_1040_FIELDS.line30ChildTaxCredit)).toBeUndefined();
  });

  it("fills income line values consistently", () => {
    const ilResult = result.stateReturns!.illinois!;
    // Line 4 = Line 1 + Line 2 + Line 3 (total income)
    expect(getFieldText(doc, IL_1040_FIELDS.line4TotalIncome)).toBe(
      formatCurrency(ilResult.totalIncome),
    );
    // Line 9 = Line 4 - Line 8 (base income)
    expect(getFieldText(doc, IL_1040_FIELDS.line9BaseIncome)).toBe(
      formatCurrency(ilResult.baseIncome),
    );
  });
});

// ─── Error: Missing IL Result ────────────────────────────────────────────

describe("IL-1040 PDF fill — error handling", () => {
  it("throws when no Illinois result is available", async () => {
    const result = calculateFederalTax({
      ...ilSingleFiler,
      stateReturns: undefined,
    });
    await expect(
      fillIL1040(ilSingleFiler, result, BLANK_PDF),
    ).rejects.toThrow("No Illinois state return result available");
  });
});
