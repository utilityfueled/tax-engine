/**
 * Tests for Form 8582 — Passive Activity Loss Limitations PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm8582, FORM_8582_FIELDS } from "@/pdf/fill-form-8582.js";
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

const BLANK_8582 = "forms/blank/f8582.pdf";
const F = FORM_8582_FIELDS;

// ─── Fixture: HoH with rental loss (full $25K allowance) ──────────────────

const hohWithRentalLossFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "head_of_household",
    primary: {
      firstName: "Maria",
      lastName: "Garcia",
      ssn: "555-66-7777",
      dateOfBirth: "1980-04-20",
    },
    address: {
      street: "789 Elm St",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    dependents: [
      {
        firstName: "Sofia",
        lastName: "Garcia",
        ssn: "888-99-0000",
        relationship: "Daughter",
        dateOfBirth: "2015-07-04",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Austin Inc", ein: "33-4455667" },
      wages: "60000",
      federalWithheld: "7000",
      socialSecurityWages: "60000",
      socialSecurityWithheld: "3720",
      medicareWages: "60000",
      medicareWithheld: "870",
      stateTaxWithheld: "0",
      stateWages: "60000",
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
  rentalProperties: [
    {
      description: "123 Rental Ave",
      propertyType: "single_family",
      personalUseDays: 0,
      rentalDays: 365,
      rents: "12000",
      advertising: "0",
      autoTravel: "0",
      cleaning: "0",
      commissions: "0",
      insurance: "2000",
      legalProfessional: "0",
      managementFees: "0",
      mortgageInterest: "10000",
      otherInterest: "0",
      repairs: "1000",
      supplies: "0",
      taxes: "3000",
      utilities: "0",
      depreciation: "8000",
      otherExpenses: "0",
    },
  ],
};

// ─── Fixture: MFJ with multiple passive activities and losses ──────────────

const mfjWithPassiveLossesFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    primary: {
      firstName: "Robert",
      lastName: "Chen",
      ssn: "222-33-4444",
      dateOfBirth: "1975-11-30",
    },
    spouse: {
      firstName: "Lisa",
      lastName: "Chen",
      ssn: "333-44-5555",
      dateOfBirth: "1978-02-14",
    },
    address: {
      street: "100 Park Ave",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    dependents: [],
  },
  w2s: [
    {
      employer: { name: "West Corp", ein: "44-5566778" },
      wages: "120000",
      federalWithheld: "20000",
      socialSecurityWages: "120000",
      socialSecurityWithheld: "7440",
      medicareWages: "120000",
      medicareWithheld: "1740",
      stateTaxWithheld: "0",
      stateWages: "120000",
      localTaxWithheld: "0",
      state: "OR",
    },
  ],
  form1099Int: [],
  form1099Div: [],
  form1099B: [],
  form1099Nec: [],
  form1099Misc: [],
  scheduleK1: [
    {
      partnershipName: "Downtown Office Fund LP",
      partnershipEIN: "66-7788990",
      ordinaryIncome: "-18000",
      guaranteedPayments: "0",
      netShortTermCapitalGain: "0",
      netLongTermCapitalGain: "0",
      interestIncome: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      selfEmploymentEarnings: "0",
      isPassiveActivity: true,
      atRiskAmount: "100000",
      netRentalIncome: "0",
      otherNetRentalIncome: "0",
      royalties: "0",
      section1231Gain: "0",
      otherIncome: "0",
      section179Deduction: "0",
      otherDeductions: "0",
    },
    {
      partnershipName: "Tech Ventures LP",
      partnershipEIN: "77-8899001",
      ordinaryIncome: "5000",
      guaranteedPayments: "0",
      netShortTermCapitalGain: "0",
      netLongTermCapitalGain: "0",
      interestIncome: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      selfEmploymentEarnings: "0",
      isPassiveActivity: true,
      atRiskAmount: "50000",
      netRentalIncome: "0",
      otherNetRentalIncome: "0",
      royalties: "0",
      section1231Gain: "0",
      otherIncome: "0",
      section179Deduction: "0",
      otherDeductions: "0",
    },
  ],
  form1098: [],
  form1095A: [],
  donations: [],
  rentalProperties: [
    {
      description: "456 Rental Blvd",
      propertyType: "single_family",
      personalUseDays: 0,
      rentalDays: 365,
      rents: "18000",
      insurance: "3000",
      mortgageInterest: "12000",
      repairs: "2000",
      taxes: "4000",
      depreciation: "10000",
      otherExpenses: "0",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// HoH with rental loss — full $25K active participation allowance
// ═══════════════════════════════════════════════════════════════════════════

describe("Form 8582 PDF fill — HoH with rental loss", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(hohWithRentalLossFixture);
    doc = await fillForm8582(hohWithRentalLossFixture, result, BLANK_8582);
  });

  it("engine produces Form 8582 result with rental allowance", () => {
    expect(result.form8582).toBeDefined();
    expect(result.form8582!.rentalAllowance.toNumber()).toBeGreaterThan(0);
  });

  it("fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, F.name)).toBe("Maria Garcia");
    expect(getFieldText(doc, F.ssn)).toBe("555667777");
  });

  it("Part I Line 1a — rental income (blank when zero)", () => {
    const f8582 = result.form8582!;
    // With only one rental property at a net loss, rentalIncome = 0 → field is not set
    if (f8582.rentalIncome.isZero()) {
      expect(getFieldText(doc, F.line1a)).toBeUndefined();
    } else {
      expect(getFieldText(doc, F.line1a)).toBe(formatCurrency(f8582.rentalIncome));
    }
  });

  it("Part I Line 1b — rental loss", () => {
    const f8582 = result.form8582!;
    expect(getFieldText(doc, F.line1b)).toBe(formatCurrency(f8582.rentalLoss));
  });

  it("Part I Line 1d — net rental (combined)", () => {
    const f8582 = result.form8582!;
    expect(getFieldText(doc, F.line1d)).toBe(formatCurrency(f8582.netRental));
  });

  it("Part I Line 3 — combined passive activity result", () => {
    const f8582 = result.form8582!;
    const expected = f8582.netRental.plus(f8582.netPassive);
    expect(getFieldText(doc, F.line3)).toBe(formatCurrency(expected));
  });

  it("Part II Line 5 — $150,000 threshold for HoH", () => {
    expect(getFieldText(doc, F.line5)).toBe("150000");
  });

  it("Part II Line 6 — modified AGI", () => {
    expect(getFieldText(doc, F.line6)).toBe(formatCurrency(result.agi));
  });

  it("Part II Line 9 — rental allowance matches engine", () => {
    const f8582 = result.form8582!;
    expect(getFieldText(doc, F.line9)).toBe(formatCurrency(f8582.rentalAllowance));
  });

  it("Part III Line 10 — total passive income (blank when zero)", () => {
    const f8582 = result.form8582!;
    const expected = f8582.rentalIncome.plus(f8582.passiveIncome);
    // When total passive income is zero, field is not set
    if (expected.isZero()) {
      expect(getFieldText(doc, F.line10)).toBeUndefined();
    } else {
      expect(getFieldText(doc, F.line10)).toBe(formatCurrency(expected));
    }
  });

  it("Part III Line 11 — total allowed losses", () => {
    const f8582 = result.form8582!;
    expect(getFieldText(doc, F.line11)).toBe(formatCurrency(f8582.allowedLoss));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MFJ with mixed passive income/losses + rental loss (AGI > $100K phase-out)
// ═══════════════════════════════════════════════════════════════════════════

describe("Form 8582 PDF fill — MFJ with passive losses and rental", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(mfjWithPassiveLossesFixture);
    doc = await fillForm8582(mfjWithPassiveLossesFixture, result, BLANK_8582);
  });

  it("engine produces Form 8582 result", () => {
    expect(result.form8582).toBeDefined();
  });

  it("fills header with both spouses' names", () => {
    expect(getFieldText(doc, F.name)).toBe("Robert Chen & Lisa Chen");
    expect(getFieldText(doc, F.ssn)).toBe("222334444");
  });

  it("Part I Line 2a — other passive income from K-1", () => {
    const f8582 = result.form8582!;
    expect(getFieldText(doc, F.line2a)).toBe(formatCurrency(f8582.passiveIncome));
  });

  it("Part I Line 2b — other passive loss from K-1", () => {
    const f8582 = result.form8582!;
    if (!f8582.passiveLoss.isZero()) {
      expect(getFieldText(doc, F.line2b)).toBe(formatCurrency(f8582.passiveLoss));
    }
  });

  it("Part I Line 2d — net other passive activities", () => {
    const f8582 = result.form8582!;
    expect(getFieldText(doc, F.line2d)).toBe(formatCurrency(f8582.netPassive));
  });

  it("Part III Line 11 — total allowed losses matches engine", () => {
    const f8582 = result.form8582!;
    expect(getFieldText(doc, F.line11)).toBe(formatCurrency(f8582.allowedLoss));
  });

  it("Part VII/VIII — activity allocations populated when losses are suspended", () => {
    const f8582 = result.form8582!;
    if (f8582.activityAllocations.length > 0 && f8582.suspendedLoss.gt(0)) {
      // At least one allocation row should be filled in Part VIII
      const firstRow = F.part8.rows[0];
      expect(getFieldText(doc, firstRow.name)).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No Form 8582 needed — simple W-2 filer
// ═══════════════════════════════════════════════════════════════════════════

describe("Form 8582 PDF fill — no passive activities", () => {
  let doc: PDFDocument;

  beforeAll(async () => {
    const simpleFixture: TaxYearInput = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Test",
          lastName: "User",
          ssn: "999-88-7777",
          dateOfBirth: "1990-01-01",
        },
        address: { street: "1 Main", city: "X", state: "WA", zip: "98101" },
        dependents: [],
      },
      w2s: [
        {
          employer: { name: "Corp", ein: "12-3456789" },
          wages: "85000",
          federalWithheld: "12000",
          socialSecurityWages: "85000",
          socialSecurityWithheld: "5270",
          medicareWages: "85000",
          medicareWithheld: "1233",
          stateTaxWithheld: "0",
          stateWages: "0",
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
    };
    const result = calculateFederalTax(simpleFixture);
    doc = await fillForm8582(simpleFixture, result, BLANK_8582);
  });

  it("fills header but leaves Part I blank when no passive activities", () => {
    expect(getFieldText(doc, F.name)).toBe("Test User");
    // No Form 8582 result → Part I lines should be empty
    expect(getFieldText(doc, F.line1a)).toBeUndefined();
    expect(getFieldText(doc, F.line3)).toBeUndefined();
    expect(getFieldText(doc, F.line11)).toBeUndefined();
  });
});
