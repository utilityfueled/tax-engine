/**
 * Tests for Form 4952 — Investment Interest Expense Deduction PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm4952, FORM_4952_FIELDS } from "@/pdf/fill-form-4952.js";
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

const BLANK_4952 = "forms/blank/2025/f4952.pdf";
const F = FORM_4952_FIELDS;

// ─── Fixture 1: Margin interest fully deductible (income > expense) ────────

const fullyDeductibleFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "James",
      lastName: "Investor",
      ssn: "111-22-3333",
      dateOfBirth: "1975-03-10",
      occupation: "Portfolio Manager",
    },
    address: {
      street: "500 Wall St",
      city: "New York",
      state: "NY",
      zip: "10005",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Hedge Fund LLC", ein: "11-2233444" },
      wages: "150000",
      federalWithheld: "30000",
      socialSecurityWages: "150000",
      socialSecurityWithheld: "9300",
      medicareWages: "150000",
      medicareWithheld: "2175",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
      state: "NY",
    },
  ],
  form1099Int: [
    { payer: "Brokerage Inc", amount: "8000" },
  ],
  form1099Div: [
    {
      payer: "Brokerage Inc",
      ordinaryDividends: "5000",
      qualifiedDividends: "3000",
    },
  ],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  form4952: {
    investmentInterestExpense: "6000",
    grossInvestmentIncome: "13000", // 8000 interest + 5000 ordinary dividends
    qualifiedDividendsIncluded: "3000",
  },
};

describe("Form 4952 PDF filling — fully deductible margin interest", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(fullyDeductibleFixture);
    doc = await fillForm4952(fullyDeductibleFixture, result, BLANK_4952);
  });

  it("Form 4952 header - name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("James Investor");
    expect(getFieldText(doc, F.ssn)).toBe("111223333");
  });

  it("Form 4952 Part I Lines 1-3 - total investment interest expense", () => {
    const f4952 = result.form4952!;
    expect(f4952).toBeDefined();
    expect(getFieldText(doc, F.line1)).toBe(formatCurrency(f4952.line1));
    // No prior year carryforward
    expect(getFieldText(doc, F.line2)).toBe("0");
    expect(getFieldText(doc, F.line3)).toBe(formatCurrency(f4952.line3));
    expect(f4952.line1.toNumber()).toBe(6000);
    expect(f4952.line3.toNumber()).toBe(6000);
  });

  it("Form 4952 Part II Lines 4a-4c - gross investment income and qualified dividends", () => {
    const f4952 = result.form4952!;
    expect(getFieldText(doc, F.line4a)).toBe(formatCurrency(f4952.line4a));
    expect(getFieldText(doc, F.line4b)).toBe(formatCurrency(f4952.line4b));
    expect(getFieldText(doc, F.line4c)).toBe(formatCurrency(f4952.line4c));
    expect(f4952.line4a.toNumber()).toBe(13000);
    expect(f4952.line4b.toNumber()).toBe(3000);
    expect(f4952.line4c.toNumber()).toBe(10000);
  });

  it("Form 4952 Part II Line 4d - net gain from disposition", () => {
    const f4952 = result.form4952!;
    expect(getFieldText(doc, F.line4d)).toBe("0"); // No capital gains
    expect(f4952.line4d.toNumber()).toBe(0);
  });

  it("Form 4952 Part II Lines 5-6 - net investment income", () => {
    const f4952 = result.form4952!;
    // Net investment income = 4c (10000) + 4d (0) + elected (0) - expenses (0) = 10000
    expect(getFieldText(doc, F.line6)).toBe(formatCurrency(f4952.line6));
    expect(f4952.line6.toNumber()).toBe(10000);
  });

  it("Form 4952 Part III Lines 7-8 - deduction and carryforward", () => {
    const f4952 = result.form4952!;
    expect(getFieldText(doc, F.line8)).toBe(formatCurrency(f4952.deductibleAmount));
    // Fully deductible: expense (6000) < net investment income (10000)
    expect(f4952.deductibleAmount.toNumber()).toBe(6000);
    expect(f4952.disallowedCarryforward.toNumber()).toBe(0);
  });
});

// ─── Fixture 2: Partially disallowed with carryforward ─────────────────────

const partiallyDisallowedFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Robert",
      lastName: "Margin",
      ssn: "444-55-6666",
      dateOfBirth: "1968-09-22",
      occupation: "Trader",
    },
    spouse: {
      firstName: "Susan",
      lastName: "Margin",
      ssn: "777-88-9999",
      dateOfBirth: "1970-01-15",
    },
    address: {
      street: "200 Finance Ave",
      city: "Chicago",
      state: "IL",
      zip: "60601",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Trading Corp", ein: "22-3344555" },
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
    },
  ],
  form1099Int: [
    { payer: "Bank A", amount: "2000" },
  ],
  form1099Div: [
    {
      payer: "Fund B",
      ordinaryDividends: "1500",
      qualifiedDividends: "800",
    },
  ],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [],
  form1095A: [],
  donations: [],
  form4952: {
    investmentInterestExpense: "8000",
    priorYearDisallowed: "2000",
    grossInvestmentIncome: "3500", // 2000 interest + 1500 ordinary dividends
    qualifiedDividendsIncluded: "800",
    investmentExpenses: "200",
  },
};

describe("Form 4952 PDF filling — partially disallowed with carryforward", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(partiallyDisallowedFixture);
    doc = await fillForm4952(partiallyDisallowedFixture, result, BLANK_4952);
  });

  it("Form 4952 header - joint names", () => {
    expect(getFieldText(doc, F.name)).toBe("Robert Margin & Susan Margin");
    expect(getFieldText(doc, F.ssn)).toBe("444556666");
  });

  it("Form 4952 Part I - total includes prior year carryforward", () => {
    const f4952 = result.form4952!;
    expect(f4952).toBeDefined();
    expect(f4952.line1.toNumber()).toBe(8000);
    expect(f4952.line2.toNumber()).toBe(2000);
    expect(f4952.line3.toNumber()).toBe(10000);
    expect(getFieldText(doc, F.line1)).toBe(formatCurrency(f4952.line1));
    expect(getFieldText(doc, F.line2)).toBe(formatCurrency(f4952.line2));
    expect(getFieldText(doc, F.line3)).toBe(formatCurrency(f4952.line3));
  });

  it("Form 4952 Part II - net investment income after qualified dividend exclusion", () => {
    const f4952 = result.form4952!;
    // 4a = 3500, 4b = 800, 4c = 2700, expenses = 200
    // Net investment income = 2700 - 200 = 2500
    expect(f4952.line4a.toNumber()).toBe(3500);
    expect(f4952.line4b.toNumber()).toBe(800);
    expect(f4952.line4c.toNumber()).toBe(2700);
    expect(f4952.line5.toNumber()).toBe(200);
    expect(f4952.line6.toNumber()).toBe(2500);

    expect(getFieldText(doc, F.line4a)).toBe(formatCurrency(f4952.line4a));
    expect(getFieldText(doc, F.line4b)).toBe(formatCurrency(f4952.line4b));
    expect(getFieldText(doc, F.line4c)).toBe(formatCurrency(f4952.line4c));
    expect(getFieldText(doc, F.line5)).toBe(formatCurrency(f4952.line5));
    expect(getFieldText(doc, F.line6)).toBe(formatCurrency(f4952.line6));
  });

  it("Form 4952 Part III - disallowed amount carried forward", () => {
    const f4952 = result.form4952!;
    // Total expense = 10000, net investment income = 2500
    // Deductible = 2500, disallowed = 7500
    expect(f4952.deductibleAmount.toNumber()).toBe(2500);
    expect(f4952.disallowedCarryforward.toNumber()).toBe(7500);
    expect(getFieldText(doc, F.line8)).toBe(formatCurrency(f4952.deductibleAmount));
    expect(getFieldText(doc, F.line7)).toBe(formatCurrency(f4952.disallowedCarryforward));
  });
});
