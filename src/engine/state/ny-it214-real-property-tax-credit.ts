/**
 * New York IT-214 — Real Property Tax Credit for Homeowners and Renters.
 * Refundable credit for qualifying NY residents with FAGI ≤ $18,000.
 * Spec: spec/state/ny-it214-real-property-tax-credit.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor, roundDollar } from "@/utils/decimal.js";

/* ---------- Types ---------- */

/**
 * What utility charges are included in the rent.
 * Determines the rent adjustment percentage (line 12).
 */
export type RentIncludesCharges =
  | "heat_gas_electricity_furnishings_board"  // 50%
  | "heat_gas_electricity_furnishings"        // 75%
  | "heat_gas_electricity"                    // 80%
  | "heat_or_heat_and_gas"                    // 85%
  | "none";                                   // 100%

export interface NYIT214RenterInput {
  /** Line 11: Total rent paid during tax year (exclude subsidized portion) */
  totalRentPaid: Decimal | string | number;
  /** What charges are included in the rent (determines adjustment %) */
  rentIncludesCharges: RentIncludesCharges;
  /** Number of months rent was paid (for average monthly rent calculation) */
  monthsRentPaid: number;
}

export interface NYIT214HomeownerInput {
  /** Line 15: Real property taxes paid to county/city/town/village/school district */
  realPropertyTaxesPaid: Decimal | string | number;
  /** Line 16: Special assessments (not including penalty/interest) */
  specialAssessments?: Decimal | string | number;
}

export interface NYIT214Input {
  /** Line 8: Federal adjusted gross income */
  federalAgi: Decimal | string | number;
  /** Whether anyone in the household (taxpayer, spouse, dependent) is 65+ */
  hasPersonAge65OrOlder: boolean;
  /** Current market value of all owned real property (must be ≤ $85,000) */
  realPropertyMarketValue?: Decimal | string | number;
  /** Can this taxpayer be claimed as a dependent on another return */
  canBeClaimedAsDependent?: boolean;
  /** Full-year NY resident who occupied same residence 6+ months */
  meetsResidencyRequirement?: boolean;
  /** Residence completely exempt from real property taxes */
  residenceExemptFromTaxes?: boolean;
  taxYear: number;

  /** Renter details (null/undefined if not a renter) */
  renter?: NYIT214RenterInput;
  /** Homeowner details (null/undefined if not a homeowner) */
  homeowner?: NYIT214HomeownerInput;
}

export interface NYIT214Result {
  /** Whether the taxpayer is eligible for the credit */
  eligible: boolean;
  /** Reason for ineligibility (if not eligible) */
  ineligibleReason?: string;

  /** Line 8: Federal adjusted gross income (zero floor) */
  fagi: Decimal;
  /** Line 9: Rate from Table 1 */
  rate: Decimal;
  /** Line 10: Income-based threshold (FAGI × rate) */
  incomeThreshold: Decimal;

  /** Line 14: Renter property tax equivalent (25% of adjusted rent) */
  renterPropertyTaxEquivalent: Decimal;
  /** Line 17: Homeowner total property taxes */
  homeownerPropertyTaxes: Decimal;
  /** Line 18: Total real property taxes for credit computation */
  totalPropertyTaxes: Decimal;

  /** Line 20: Credit amount (from Table A or B) */
  credit: Decimal;

  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);

interface IT214RateEntry {
  /** Upper bound of FAGI bracket (inclusive) */
  ceiling: Decimal;
  rate: Decimal;
}

interface IT214CreditEntry {
  /** Upper bound of FAGI bracket (inclusive) */
  ceiling: Decimal;
  credit: Decimal;
}

interface IT214YearConstants {
  /** Maximum FAGI to qualify */
  maxFagi: Decimal;
  /** Maximum average monthly rent to qualify */
  maxMonthlyRent: Decimal;
  /** Maximum real property market value to qualify */
  maxPropertyValue: Decimal;
  /** Rent-to-tax conversion rate (25%) */
  rentToTaxRate: Decimal;
  /** Table 1: Rate brackets */
  rateBrackets: IT214RateEntry[];
  /** Table A: Credit amounts for 65+ household */
  creditTable65Plus: IT214CreditEntry[];
  /** Table B: Credit amounts for under 65 household */
  creditTableUnder65: IT214CreditEntry[];
}

/** Rent adjustment percentages by what's included */
const RENT_ADJUSTMENT_PERCENTAGES: Record<RentIncludesCharges, Decimal> = {
  heat_gas_electricity_furnishings_board: new Decimal("0.50"),
  heat_gas_electricity_furnishings: new Decimal("0.75"),
  heat_gas_electricity: new Decimal("0.80"),
  heat_or_heat_and_gas: new Decimal("0.85"),
  none: new Decimal("1.00"),
};

export const NY_IT214_CONSTANTS: Record<number, IT214YearConstants> = {
  2025: {
    maxFagi: new Decimal(18000),
    maxMonthlyRent: new Decimal(450),
    maxPropertyValue: new Decimal(85000),
    rentToTaxRate: new Decimal("0.25"),
    rateBrackets: [
      { ceiling: new Decimal(3000), rate: new Decimal("0.035") },
      { ceiling: new Decimal(5000), rate: new Decimal("0.040") },
      { ceiling: new Decimal(7000), rate: new Decimal("0.045") },
      { ceiling: new Decimal(9000), rate: new Decimal("0.050") },
      { ceiling: new Decimal(11000), rate: new Decimal("0.055") },
      { ceiling: new Decimal(14000), rate: new Decimal("0.060") },
      { ceiling: new Decimal(18000), rate: new Decimal("0.065") },
    ],
    creditTable65Plus: [
      { ceiling: new Decimal(3000), credit: new Decimal(375) },
      { ceiling: new Decimal(5000), credit: new Decimal(330) },
      { ceiling: new Decimal(7000), credit: new Decimal(300) },
      { ceiling: new Decimal(9000), credit: new Decimal(260) },
      { ceiling: new Decimal(11000), credit: new Decimal(230) },
      { ceiling: new Decimal(14000), credit: new Decimal(200) },
      { ceiling: new Decimal(18000), credit: new Decimal(150) },
    ],
    creditTableUnder65: [
      { ceiling: new Decimal(5000), credit: new Decimal(75) },
      { ceiling: new Decimal(9000), credit: new Decimal(70) },
      { ceiling: new Decimal(14000), credit: new Decimal(60) },
      { ceiling: new Decimal(18000), credit: new Decimal(50) },
    ],
  },
};

/* ---------- Helpers ---------- */

function lookupRate(fagi: Decimal, brackets: IT214RateEntry[]): Decimal {
  for (const entry of brackets) {
    if (fagi.lessThanOrEqualTo(entry.ceiling)) {
      return entry.rate;
    }
  }
  return ZERO;
}

function lookupCredit(fagi: Decimal, table: IT214CreditEntry[]): Decimal {
  for (const entry of table) {
    if (fagi.lessThanOrEqualTo(entry.ceiling)) {
      return entry.credit;
    }
  }
  return ZERO;
}

/* ---------- Main computation ---------- */

export function calculateNYIT214(input: NYIT214Input): NYIT214Result {
  const constants = NY_IT214_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`NY IT-214 real property tax credit not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  // Line 8: FAGI (zero floor)
  const fagi = zeroFloor(d(input.federalAgi));
  audit.record("NY-IT214", "8", "Federal adjusted gross income", fagi,
    "FAGI from federal return (zero floor)");

  // --- Eligibility checks ---

  const meetsResidency = input.meetsResidencyRequirement !== false;
  const isDependent = input.canBeClaimedAsDependent === true;
  const residenceExempt = input.residenceExemptFromTaxes === true;
  const propertyValue = d(input.realPropertyMarketValue);

  if (!meetsResidency) {
    return ineligibleResult(fagi, audit, "Not a full-year NY resident or did not occupy same residence 6+ months");
  }
  if (isDependent) {
    return ineligibleResult(fagi, audit, "Can be claimed as dependent on another return");
  }
  if (residenceExempt) {
    return ineligibleResult(fagi, audit, "Residence completely exempted from real property taxes");
  }
  if (fagi.greaterThan(constants.maxFagi)) {
    return ineligibleResult(fagi, audit, `FAGI ($${fagi}) exceeds $${constants.maxFagi} limit`);
  }
  if (input.homeowner && propertyValue.greaterThan(constants.maxPropertyValue)) {
    return ineligibleResult(fagi, audit,
      `Real property market value ($${propertyValue}) exceeds $${constants.maxPropertyValue} limit`);
  }

  // --- Line 9: Rate from Table 1 ---

  const rate = lookupRate(fagi, constants.rateBrackets);
  audit.record("NY-IT214", "9", "Rate from Table 1", rate,
    "Lookup by FAGI bracket", {
      "FAGI": fagi.toString(),
    });

  // --- Line 10: Income-based threshold ---

  const incomeThreshold = roundDollar(fagi.times(rate));
  audit.record("NY-IT214", "10", "Income-based threshold", incomeThreshold,
    "Line 8 × Line 9", {
      "FAGI (line 8)": fagi.toString(),
      "Rate (line 9)": rate.toString(),
    });

  // --- Lines 11-14: Renter computation ---

  let renterPropertyTaxEquivalent = ZERO;
  if (input.renter) {
    const totalRentPaid = zeroFloor(d(input.renter.totalRentPaid));
    audit.record("NY-IT214", "11", "Total rent paid", totalRentPaid,
      "Gross rent paid during tax year (exclude subsidized portion)");

    const adjustmentPct = RENT_ADJUSTMENT_PERCENTAGES[input.renter.rentIncludesCharges];
    const adjustedRent = roundDollar(totalRentPaid.times(adjustmentPct));
    audit.record("NY-IT214", "12", "Adjusted rent", adjustedRent,
      `Line 11 × ${adjustmentPct.times(100)}% (${input.renter.rentIncludesCharges})`, {
        "Total rent (line 11)": totalRentPaid.toString(),
        "Adjustment percentage": adjustmentPct.toString(),
      });

    const monthsRentPaid = Math.max(1, input.renter.monthsRentPaid);
    const avgMonthlyRent = roundDollar(adjustedRent.dividedBy(monthsRentPaid));
    audit.record("NY-IT214", "13", "Average monthly adjusted rent", avgMonthlyRent,
      `Line 12 ÷ ${monthsRentPaid} months`, {
        "Adjusted rent (line 12)": adjustedRent.toString(),
        "Months": monthsRentPaid.toString(),
      });

    // Check average monthly rent limit
    if (avgMonthlyRent.greaterThan(constants.maxMonthlyRent)) {
      return ineligibleResult(fagi, audit,
        `Average monthly adjusted rent ($${avgMonthlyRent}) exceeds $${constants.maxMonthlyRent} limit`);
    }

    renterPropertyTaxEquivalent = roundDollar(adjustedRent.times(constants.rentToTaxRate));
    audit.record("NY-IT214", "14", "Rent-to-tax conversion (25% of adjusted rent)",
      renterPropertyTaxEquivalent,
      "Line 12 × 25%", {
        "Adjusted rent (line 12)": adjustedRent.toString(),
      });
  }

  // --- Lines 15-17: Homeowner computation ---

  let homeownerPropertyTaxes = ZERO;
  if (input.homeowner) {
    const realPropertyTaxesPaid = zeroFloor(d(input.homeowner.realPropertyTaxesPaid));
    audit.record("NY-IT214", "15", "Real property taxes paid", realPropertyTaxesPaid,
      "Taxes paid to county/city/town/village/school district");

    const specialAssessments = zeroFloor(d(input.homeowner.specialAssessments));
    audit.record("NY-IT214", "16", "Special assessments", specialAssessments,
      "Special assessments paid (exclude penalty/interest)");

    homeownerPropertyTaxes = sum(realPropertyTaxesPaid, specialAssessments);
    audit.record("NY-IT214", "17", "Total homeowner property taxes", homeownerPropertyTaxes,
      "Line 15 + Line 16", {
        "Property taxes (line 15)": realPropertyTaxesPaid.toString(),
        "Special assessments (line 16)": specialAssessments.toString(),
      });
  }

  // --- Line 18: Total property taxes ---

  const totalPropertyTaxes = sum(renterPropertyTaxEquivalent, homeownerPropertyTaxes);
  audit.record("NY-IT214", "18", "Real property taxes for credit computation",
    totalPropertyTaxes,
    "Renters: Line 14. Homeowners: Line 17. Both: Line 14 + Line 17.", {
      "Renter equivalent (line 14)": renterPropertyTaxEquivalent.toString(),
      "Homeowner taxes (line 17)": homeownerPropertyTaxes.toString(),
    });

  if (totalPropertyTaxes.lessThanOrEqualTo(ZERO)) {
    return ineligibleResult(fagi, audit, "Real property taxes (line 18) are zero or less");
  }

  // --- Line 19: Compare threshold to property taxes ---

  audit.record("NY-IT214", "19", "Income-based threshold (from line 10)",
    incomeThreshold, "Line 10 value");

  if (incomeThreshold.greaterThanOrEqualTo(totalPropertyTaxes)) {
    audit.record("NY-IT214", "20", "Credit amount", ZERO,
      "No credit: income threshold (line 19) ≥ property taxes (line 18)", {
        "Income threshold (line 19)": incomeThreshold.toString(),
        "Property taxes (line 18)": totalPropertyTaxes.toString(),
      });

    return {
      eligible: false,
      ineligibleReason: "Income-based threshold equals or exceeds real property taxes",
      fagi,
      rate,
      incomeThreshold,
      renterPropertyTaxEquivalent,
      homeownerPropertyTaxes,
      totalPropertyTaxes,
      credit: ZERO,
      lines: audit.getLines(),
    };
  }

  // --- Line 20: Credit amount from Table A or B ---

  const creditTable = input.hasPersonAge65OrOlder
    ? constants.creditTable65Plus
    : constants.creditTableUnder65;
  const credit = lookupCredit(fagi, creditTable);

  audit.record("NY-IT214", "20", "Credit amount", credit,
    `Table ${input.hasPersonAge65OrOlder ? "A (65+)" : "B (under 65)"} lookup by FAGI`, {
      "FAGI": fagi.toString(),
      "Has person 65+": input.hasPersonAge65OrOlder.toString(),
      "Income threshold (line 19)": incomeThreshold.toString(),
      "Property taxes (line 18)": totalPropertyTaxes.toString(),
    });

  return {
    eligible: true,
    fagi,
    rate,
    incomeThreshold,
    renterPropertyTaxEquivalent,
    homeownerPropertyTaxes,
    totalPropertyTaxes,
    credit,
    lines: audit.getLines(),
  };
}

/* ---------- Internal helpers ---------- */

function ineligibleResult(
  fagi: Decimal,
  audit: AuditTrail,
  reason: string
): NYIT214Result {
  return {
    eligible: false,
    ineligibleReason: reason,
    fagi,
    rate: ZERO,
    incomeThreshold: ZERO,
    renterPropertyTaxEquivalent: ZERO,
    homeownerPropertyTaxes: ZERO,
    totalPropertyTaxes: ZERO,
    credit: ZERO,
    lines: audit.getLines(),
  };
}
