/**
 * Tests for Form 8995 — QBI Deduction Simplified Computation PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm8995, FORM_8995_FIELDS } from "@/pdf/fill-form-8995.js";
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

const BLANK_8995 = "forms/blank/f8995.pdf";
const F = FORM_8995_FIELDS;

// ─── Fixture: Single filer with Schedule C (triggers simplified 8995) ────

const singleWithScheduleCFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "single",
    primary: {
      firstName: "Alex",
      lastName: "Rivera",
      ssn: "111-22-3333",
      dateOfBirth: "1985-06-15",
    },
    address: {
      street: "456 Oak Ave",
      city: "Denver",
      state: "CO",
      zip: "80202",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Day Job Inc", ein: "11-2233445" },
      wages: "55000",
      federalWithheld: "6500",
      socialSecurityWages: "55000",
      socialSecurityWithheld: "3410",
      medicareWages: "55000",
      medicareWithheld: "797.50",
      stateTaxWithheld: "0",
      stateWages: "55000",
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
  scheduleC: {
    businessName: "Rivera Consulting",
    ein: "55-6677889",
    grossReceipts: "80000",
    otherIncome: "0",
    advertising: "2000",
    insurance: "1500",
    officeExpense: "1000",
    supplies: "500",
    otherExpenses: "0",
  },
};

// ─── Fixture: MFJ with K-1 QBI (partnership income) ─────────────────────

const mfjWithK1QBIFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "James",
      lastName: "Park",
      ssn: "444-55-6666",
      dateOfBirth: "1978-03-22",
    },
    spouse: {
      firstName: "Susan",
      lastName: "Park",
      ssn: "555-66-7777",
      dateOfBirth: "1980-08-10",
    },
    address: {
      street: "200 Main St",
      city: "Seattle",
      state: "WA",
      zip: "98101",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "Tech Corp", ein: "22-3344556" },
      wages: "100000",
      federalWithheld: "15000",
      socialSecurityWages: "100000",
      socialSecurityWithheld: "6200",
      medicareWages: "100000",
      medicareWithheld: "1450",
      stateTaxWithheld: "0",
      stateWages: "100000",
      localTaxWithheld: "0",
      state: "WA",
    },
  ],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [
    {
      partnershipName: "Westside Ventures LP",
      partnershipEIN: "33-4455667",
      ordinaryIncome: "40000",
      guaranteedPayments: "0",
      netShortTermCapitalGain: "0",
      netLongTermCapitalGain: "0",
      interestIncome: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      selfEmploymentEarnings: "0",
      isPassiveActivity: false,
      atRiskAmount: "100000",
      netRentalIncome: "0",
      otherNetRentalIncome: "0",
      royalties: "0",
      section1231Gain: "0",
      otherIncome: "0",
      section179Deduction: "0",
      otherDeductions: "0",
      section199AQBI: "40000",
    },
  ],
  form1098: [],
  form1095A: [],
  donations: [],
  rentalProperties: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// Single with Schedule C — QBI from self-employment
// ═══════════════════════════════════════════════════════════════════════════

describe("Form 8995 PDF fill — single with Schedule C QBI", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(singleWithScheduleCFixture);
    // Only fill if Form 8995 was computed (income below simplified threshold)
    expect(result.form8995).toBeDefined();
    doc = await fillForm8995(singleWithScheduleCFixture, result, BLANK_8995);
  });

  it("engine produces Form 8995 result with QBI deduction", () => {
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBeGreaterThan(0);
  });

  it("fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Alex Rivera");
    expect(getFieldText(doc, F.ssn)).toBe("111223333");
  });

  it("Line 1(i) — business name and QBI amount", () => {
    expect(getFieldText(doc, F.business1Name)).toBe("Rivera Consulting");
    expect(getFieldText(doc, F.business1TIN)).toBe("55-6677889");
    // QBI amount should be filled (non-zero)
    const qbiText = getFieldText(doc, F.business1QBI);
    expect(qbiText).toBeDefined();
    expect(qbiText).not.toBe("");
  });

  it("Line 2 — total QBI matches sum of QBI amounts", () => {
    const f8995 = result.form8995!;
    const grossQBI = f8995.qbiAmounts.reduce(
      (acc, q) => acc.plus(q),
      new Decimal(0),
    );
    expect(getFieldText(doc, F.line2)).toBe(formatCurrency(grossQBI));
  });

  it("Line 4 — total QBI after prior year loss", () => {
    const f8995 = result.form8995!;
    expect(getFieldText(doc, F.line4)).toBe(formatCurrency(f8995.totalQBI));
  });

  it("Line 5 — QBI component (20%)", () => {
    const f8995 = result.form8995!;
    expect(getFieldText(doc, F.line5)).toBe(formatCurrency(f8995.qbiComponent));
  });

  it("Line 10 — combined component", () => {
    const f8995 = result.form8995!;
    expect(getFieldText(doc, F.line10)).toBe(formatCurrency(f8995.combinedComponent));
  });

  it("Line 11 — taxable income before QBI", () => {
    const f8995 = result.form8995!;
    expect(getFieldText(doc, F.line11)).toBe(
      formatCurrency(f8995.taxableIncomeBeforeQBI),
    );
  });

  it("Line 14 — income limitation", () => {
    const f8995 = result.form8995!;
    expect(getFieldText(doc, F.line14)).toBe(
      formatCurrency(f8995.incomeLimitation),
    );
  });

  it("Line 15 — QBI deduction matches engine result", () => {
    const f8995 = result.form8995!;
    expect(getFieldText(doc, F.line15)).toBe(
      formatCurrency(f8995.qbiDeduction),
    );
  });

  it("Line 16 — no QBI loss carryforward for profitable business", () => {
    const f8995 = result.form8995!;
    if (f8995.qbiLossCarryforward.isZero()) {
      expect(getFieldText(doc, F.line16)).toBeUndefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MFJ with K-1 partnership QBI
// ═══════════════════════════════════════════════════════════════════════════

describe("Form 8995 PDF fill — MFJ with K-1 partnership QBI", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjWithK1QBIFixture);
    expect(result.form8995).toBeDefined();
    doc = await fillForm8995(mfjWithK1QBIFixture, result, BLANK_8995);
  });

  it("engine produces Form 8995 result for K-1 QBI", () => {
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBeGreaterThan(0);
  });

  it("fills header with both spouse names", () => {
    expect(getFieldText(doc, F.name)).toBe("James Park & Susan Park");
    expect(getFieldText(doc, F.ssn)).toBe("444556666");
  });

  it("Line 1(i) — K-1 partnership name and QBI", () => {
    expect(getFieldText(doc, F.business1Name)).toBe("Westside Ventures LP");
    expect(getFieldText(doc, F.business1TIN)).toBe("33-4455667");
  });

  it("Line 15 — QBI deduction matches engine", () => {
    const f8995 = result.form8995!;
    expect(getFieldText(doc, F.line15)).toBe(
      formatCurrency(f8995.qbiDeduction),
    );
  });

  it("Line 12 — net capital gain (zero when no cap gains)", () => {
    const f8995 = result.form8995!;
    if (f8995.netCapitalGainAmount.isZero()) {
      expect(getFieldText(doc, F.line12)).toBeUndefined();
    } else {
      expect(getFieldText(doc, F.line12)).toBe(
        formatCurrency(f8995.netCapitalGainAmount),
      );
    }
  });

  it("unused business rows are empty", () => {
    expect(getFieldText(doc, F.business2Name)).toBeUndefined();
    expect(getFieldText(doc, F.business2QBI)).toBeUndefined();
    expect(getFieldText(doc, F.business3Name)).toBeUndefined();
  });
});
