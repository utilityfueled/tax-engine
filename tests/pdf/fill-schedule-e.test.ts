/**
 * Tests for Schedule E PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleE, SCHEDULE_E_FIELDS } from "@/pdf/fill-schedule-e.js";
import { simpleW2Fixture, complexMFJFixture } from "../fixtures/simple-w2.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import type { TaxYearInput, RentalProperty, ScheduleK1 } from "@/models/inputs.js";

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

const BLANK_SE = "forms/blank/f1040se.pdf";

// ─── Test fixtures ──────────────────────────────────────────────────────

const rentalA: RentalProperty = {
  description: "123 Main St",
  propertyType: "single_family",
  personalUseDays: 0,
  rentalDays: 365,
  rents: "24000",
  advertising: "0",
  autoTravel: "0",
  cleaning: "500",
  commissions: "0",
  insurance: "1200",
  legalProfessional: "0",
  managementFees: "0",
  mortgageInterest: "8000",
  otherInterest: "0",
  repairs: "2000",
  supplies: "300",
  taxes: "3000",
  utilities: "0",
  depreciation: "5000",
  otherExpenses: "0",
};

const rentalB: RentalProperty = {
  description: "456 Oak Ave Unit 2",
  propertyType: "multi_family",
  personalUseDays: 10,
  rentalDays: 355,
  rents: "36000",
  advertising: "200",
  autoTravel: "150",
  cleaning: "800",
  commissions: "0",
  insurance: "1800",
  legalProfessional: "500",
  managementFees: "3600",
  mortgageInterest: "12000",
  otherInterest: "0",
  repairs: "3000",
  supplies: "400",
  taxes: "4500",
  utilities: "2400",
  depreciation: "7000",
  otherExpenses: "650",
};

const passiveK1: ScheduleK1 = {
  partnershipName: "Real Estate Fund LP",
  partnershipEIN: "55-6677889",
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
};

const nonpassiveK1: ScheduleK1 = {
  partnershipName: "Active Business LLC",
  partnershipEIN: "99-1234567",
  ordinaryIncome: "15000",
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
};

// ─── Single rental property ─────────────────────────────────────────────

describe("Schedule E PDF fill — single rental property", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;
  const fixture: TaxYearInput = {
    ...simpleW2Fixture,
    rentalProperties: [rentalA],
  };

  beforeAll(async () => {
    result = calculateFederalTax(fixture);
    doc = await fillScheduleE(fixture, result, BLANK_SE);
  });

  it("fills header with taxpayer name and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.ssn)).toBe("123456789");
  });

  it("fills page 2 header", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.namePg2)).toBe("Jane Doe");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.ssnPg2)).toBe("123456789");
  });

  it("fills property A description and type code", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.propDescA)).toBe("123 Main St");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.propTypeA)).toBe("1"); // single_family
  });

  it("fills property A rental days", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.rentalDaysA)).toBe("365");
  });

  it("fills property A rents received (Line 3)", () => {
    const se = result.scheduleE!;
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.rentsA)).toBe(
      formatCurrency(se.rentalProperties[0].rents),
    );
  });

  it("fills property A expense categories from input", () => {
    // Cleaning: 500, Insurance: 1200, Mortgage: 8000, Repairs: 2000,
    // Supplies: 300, Taxes: 3000, Depreciation: 5000
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.cleanA)).toBe("500");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.insA)).toBe("1200");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.mortA)).toBe("8000");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.repairsA)).toBe("2000");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.suppliesA)).toBe("300");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.taxesA)).toBe("3000");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.deprA)).toBe("5000");
  });

  it("fills property A total expenses (Line 20)", () => {
    const se = result.scheduleE!;
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.totalExpA)).toBe(
      formatCurrency(se.rentalProperties[0].totalExpenses),
    );
  });

  it("fills property A net rental income (Line 21)", () => {
    const se = result.scheduleE!;
    // 24000 - 20000 = 4000
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.netA)).toBe(
      formatCurrency(se.rentalProperties[0].netRentalIncome),
    );
  });

  it("fills Line 26 total rental income", () => {
    const se = result.scheduleE!;
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.line26)).toBe(
      formatCurrency(se.totalRentalIncome),
    );
  });

  it("does not fill property B or C fields", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.propDescB)).toBeUndefined();
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.propDescC)).toBeUndefined();
  });

  it("zero-value expense fields are not filled", () => {
    // Advertising is 0 → should be blank
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.advA)).toBeUndefined();
    // Commissions is 0 → should be blank
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.commA)).toBeUndefined();
  });
});

// ─── Multiple rental properties ────────────────────────────────────────

describe("Schedule E PDF fill — two rental properties", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;
  const fixture: TaxYearInput = {
    ...simpleW2Fixture,
    rentalProperties: [rentalA, rentalB],
  };

  beforeAll(async () => {
    result = calculateFederalTax(fixture);
    doc = await fillScheduleE(fixture, result, BLANK_SE);
  });

  it("fills both property A and B descriptions", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.propDescA)).toBe("123 Main St");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.propDescB)).toBe("456 Oak Ave Unit 2");
  });

  it("fills property B type code as multi-family (2)", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.propTypeB)).toBe("2");
  });

  it("fills property B rental and personal use days", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.rentalDaysB)).toBe("355");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.personalDaysB)).toBe("10");
  });

  it("fills property B expense categories", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.advB)).toBe("200");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.insB)).toBe("1800");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.mgmtB)).toBe("3600");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.mortB)).toBe("12000");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.taxesB)).toBe("4500");
  });

  it("fills Line 23a with total income from profitable properties", () => {
    const se = result.scheduleE!;
    // Sum of positive net rental incomes
    const totalIncome = se.rentalProperties
      .filter(p => p.netRentalIncome.greaterThan(0))
      .reduce((acc, p) => acc.plus(p.netRentalIncome), se.rentalProperties[0].netRentalIncome.minus(se.rentalProperties[0].netRentalIncome));
    if (totalIncome.greaterThan(0)) {
      expect(getFieldText(doc, SCHEDULE_E_FIELDS.line23a)).toBe(formatCurrency(totalIncome));
    }
  });

  it("fills Line 26 with combined total rental income", () => {
    const se = result.scheduleE!;
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.line26)).toBe(
      formatCurrency(se.totalRentalIncome),
    );
  });
});

// ─── Partnerships (Part II) ────────────────────────────────────────────

describe("Schedule E PDF fill — K-1 partnerships", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;
  const fixture: TaxYearInput = {
    ...complexMFJFixture,
    scheduleK1: [passiveK1, nonpassiveK1],
  };

  beforeAll(async () => {
    result = calculateFederalTax(fixture);
    doc = await fillScheduleE(fixture, result, BLANK_SE);
  });

  it("fills MFJ header with both names", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.name)).toBe("John Smith & Jane Smith");
  });

  it("fills partnership A name and EIN", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.partNameA)).toBe("Real Estate Fund LP");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.partEinA)).toBe("55-6677889");
  });

  it("fills partnership A entity type as P (partnership)", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.partTypeA)).toBe("P");
  });

  it("fills partnership B name and EIN", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.partNameB)).toBe("Active Business LLC");
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.partEinB)).toBe("99-1234567");
  });

  it("fills passive income in column G for passive partnership", () => {
    const se = result.scheduleE!;
    const passiveP = se.partnerships.find(p => p.name === "Real Estate Fund LP")!;
    expect(passiveP.passiveIncome.toNumber()).toBe(5000);
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.partCol_A_g)).toBe(
      formatCurrency(passiveP.passiveIncome),
    );
  });

  it("fills nonpassive income in column J for nonpassive partnership", () => {
    const se = result.scheduleE!;
    const nonpassiveP = se.partnerships.find(p => p.name === "Active Business LLC")!;
    expect(nonpassiveP.nonpassiveIncome.toNumber()).toBe(15000);
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.partCol_B_j)).toBe(
      formatCurrency(nonpassiveP.nonpassiveIncome),
    );
  });

  it("fills Part II totals", () => {
    const se = result.scheduleE!;
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.line29a)).toBe(
      formatCurrency(se.totalPassiveIncome),
    );
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.line30a)).toBe(
      formatCurrency(se.totalNonpassiveIncome),
    );
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.line31)).toBe(
      formatCurrency(se.totalPartnershipIncome),
    );
  });

  it("fills Line 41 total supplemental income", () => {
    const se = result.scheduleE!;
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.line41)).toBe(
      formatCurrency(se.totalSupplementalIncome),
    );
  });
});

// ─── Combined rental + partnerships ────────────────────────────────────

describe("Schedule E PDF fill — rental + partnerships combined", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;
  const fixture: TaxYearInput = {
    ...complexMFJFixture,
    rentalProperties: [rentalA],
    scheduleK1: [passiveK1],
  };

  beforeAll(async () => {
    result = calculateFederalTax(fixture);
    doc = await fillScheduleE(fixture, result, BLANK_SE);
  });

  it("fills both Part I rental and Part II partnership data", () => {
    // Part I
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.propDescA)).toBe("123 Main St");
    // Part II
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.partNameA)).toBe("Real Estate Fund LP");
  });

  it("Line 26 reflects rental total", () => {
    const se = result.scheduleE!;
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.line26)).toBe(
      formatCurrency(se.totalRentalIncome),
    );
  });

  it("Line 41 reflects combined rental + partnership total", () => {
    const se = result.scheduleE!;
    // totalSupplementalIncome = totalRentalIncome + totalPartnershipIncome
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.line41)).toBe(
      formatCurrency(se.totalSupplementalIncome),
    );
  });
});

// ─── No Schedule E data ────────────────────────────────────────────────

describe("Schedule E PDF fill — no rental or partnership data", () => {
  let doc: PDFDocument;

  beforeAll(async () => {
    const result = calculateFederalTax(simpleW2Fixture);
    doc = await fillScheduleE(simpleW2Fixture, result, BLANK_SE);
  });

  it("fills header even when no Schedule E data", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.name)).toBe("Jane Doe");
  });

  it("does not fill property or partnership fields", () => {
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.propDescA)).toBeUndefined();
    expect(getFieldText(doc, SCHEDULE_E_FIELDS.partNameA)).toBeUndefined();
  });
});
