/**
 * New York IT-201 Credits, Net Tax, and Refundable Credits.
 * Computes IT-201 lines 40-46, line 59, line 63 (ESCC), and line 65 (NY EIC).
 * Spec: spec/state/ny-it201-credits.yaml
 */

import Decimal from "decimal.js";
import {
  allocateNYIT215MfsClaimedCredit,
  computeNYIT215ResidentCredit,
} from "@/engine/state/ny-it215-earned-income-credit.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, min, zeroFloor, roundDollar } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export interface NYHouseholdCreditBracket {
  /** Upper federal AGI limit (inclusive). */
  agiCeiling: Decimal;
  /** Credit amounts for household-size columns 1 through 7. */
  credits: Decimal[];
  /** Increment added for each household member above 7. */
  incrementOverSeven: Decimal;
}

export interface NYHouseholdCreditTable {
  /** Brackets ordered from lowest federal AGI to highest. */
  brackets: NYHouseholdCreditBracket[];
  /** Whether this table uses household-size columns. */
  usesHouseholdSize: boolean;
}

export interface NYIT201CreditsInput {
  /** New York adjusted gross income (IT-201 line 33) */
  nyAgi: Decimal | string | number;
  /** Federal adjusted gross income (IT-201 line 19), used for line 40 and the sales/use tax chart */
  federalAgi?: Decimal | string | number;
  /** NY State tax from line 39 */
  nyStateTax: Decimal | string | number;
  filingStatus: FilingStatus;
  /** Number of dependents from IT-201 item H */
  numberOfDependents?: number;
  taxYear: number;

  /* --- Credit passthroughs --- */

  /** Line 41: Resident credit from IT-112-R (taxes paid to other states) */
  residentCredit?: Decimal | string | number;
  /** Line 42: Other NY State credits from IT-201-ATT line 7 */
  otherNYStateCredits?: Decimal | string | number;
  /** Accumulation distribution credit from IT-201-ATT line 1 / IT-215 Worksheet B line 3 */
  accumulationDistributionCredit?: Decimal | string | number;

  /* --- Other taxes passthroughs --- */

  /** Line 45: Net other NY State taxes from IT-201-ATT line 31 */
  otherStateTaxes?: Decimal | string | number;
  /** Line 59: Sales or use tax */
  salesUseTax?: Decimal | string | number;
  /** Optional chart-mode sales/use tax lookup inputs from 2025 IT-201-I */
  salesUseTaxChart?: {
    /** Federal adjusted gross income used by the official chart */
    federalAgi?: Decimal | string | number;
    /** Months maintaining a permanent place of abode in NY for sales/use tax purposes */
    monthsOfPermanentPlaceOfAbode?: number;
  };

  /* --- Refundable credits --- */

  /** Line 63: Empire State child credit from IT-213 */
  empireStateChildCredit?: Decimal | string | number;
  /** Federal earned income credit (from federal Schedule 3 / Form 1040) */
  federalEic?: Decimal | string | number;
  /** Whether this is a noncustodial parent EIC (uses 2.5x multiplier instead of 30%) */
  isNoncustodialParentEic?: boolean;
  /** Joint federal / New York MFS allocation branch for IT-215 line 17 */
  jointFederalReturnForMfsAllocation?: boolean;
  /** IT-215 line 17 claimed NYS EIC share when the joint-federal / NY-MFS branch applies */
  line17AllocatedNYSEic?: Decimal | string | number;
}

export interface NYIT201CreditsResult {
  nyAgi: Decimal;
  nyStateTax: Decimal;

  /* Line 40 */
  householdCredit: Decimal;
  /* Line 41 */
  residentCredit: Decimal;
  /* Line 42 */
  otherNYStateCredits: Decimal;
  /* Line 43 */
  totalNYStateCredits: Decimal;
  /* Line 44 */
  netNYStateTax: Decimal;
  /* Line 45 */
  otherStateTaxes: Decimal;
  /* Line 59 */
  salesUseTax: Decimal;
  /* Line 46 */
  totalNYStateTaxes: Decimal;

  /* Line 63 */
  empireStateChildCredit: Decimal;
  /* Line 65 */
  nyEarnedIncomeCredit: Decimal;

  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);

function hcBracket(agiCeiling: number, credit: number): NYHouseholdCreditBracket {
  return {
    agiCeiling: new Decimal(agiCeiling),
    credits: [new Decimal(credit)],
    incrementOverSeven: ZERO,
  };
}

function hcRow(
  agiCeiling: number,
  credits: number[],
  incrementOverSeven = 0
): NYHouseholdCreditBracket {
  return {
    agiCeiling: new Decimal(agiCeiling),
    credits: credits.map((credit) => new Decimal(credit)),
    incrementOverSeven: new Decimal(incrementOverSeven),
  };
}

/**
 * NY Household Credit tables by tax year.
 * Two tables: one for single/MFS, one for MFJ/QSS/HoH.
 */
export const NY_HOUSEHOLD_CREDIT_TABLES: Record<
  number,
  { single: NYHouseholdCreditTable; mfjQssHoh: NYHouseholdCreditTable; mfs: NYHouseholdCreditTable }
> = {
  2025: {
    single: {
      brackets: [
        hcBracket(5000, 75),
        hcBracket(6000, 60),
        hcBracket(7000, 50),
        hcBracket(11000, 45),
        hcBracket(15000, 40),
        hcBracket(25000, 25),
        hcBracket(28000, 20),
      ],
      usesHouseholdSize: false,
    },
    mfjQssHoh: {
      brackets: [
        hcRow(5000, [90, 105, 120, 135, 150, 165, 180], 15),
        hcRow(6000, [75, 90, 105, 120, 135, 150, 165], 15),
        hcRow(7000, [65, 80, 95, 110, 125, 140, 155], 15),
        hcRow(20000, [60, 75, 90, 105, 120, 135, 150], 15),
        hcRow(22000, [60, 70, 80, 90, 100, 110, 120], 10),
        hcRow(25000, [50, 60, 70, 80, 90, 100, 110], 10),
        hcRow(28000, [40, 45, 50, 55, 60, 65, 70], 5),
        hcRow(32000, [20, 25, 30, 35, 40, 45, 50], 5),
      ],
      usesHouseholdSize: true,
    },
    mfs: {
      brackets: [
        hcRow(5000, [45, 53, 60, 68, 75, 83, 90], 8),
        hcRow(6000, [38, 45, 53, 60, 68, 75, 83], 8),
        hcRow(7000, [33, 40, 48, 55, 63, 70, 78], 8),
        hcRow(20000, [30, 38, 45, 53, 60, 68, 75], 8),
        hcRow(22000, [30, 35, 40, 45, 50, 55, 60], 5),
        hcRow(25000, [25, 30, 35, 40, 45, 50, 55], 5),
        hcRow(28000, [20, 23, 25, 28, 30, 33, 35], 3),
        hcRow(32000, [10, 13, 15, 18, 20, 23, 25], 3),
      ],
      usesHouseholdSize: true,
    },
  },
};

/* ---------- Helpers ---------- */

function getHouseholdCreditTable(
  filingStatus: FilingStatus,
  taxYear: number
): NYHouseholdCreditTable {
  const tables = NY_HOUSEHOLD_CREDIT_TABLES[taxYear];
  if (!tables) {
    throw new Error(`NY household credit table not available for tax year ${taxYear}`);
  }
  switch (filingStatus) {
    case "single":
      return tables.single;
    case "married_filing_separately":
      return tables.mfs;
    case "married_filing_jointly":
    case "qualifying_surviving_spouse":
    case "head_of_household":
      return tables.mfjQssHoh;
  }
}

function getHouseholdCreditHouseholdSize(
  filingStatus: FilingStatus,
  numberOfDependents: number
): number {
  switch (filingStatus) {
    case "single":
      return 1;
    case "married_filing_jointly":
      return 2 + numberOfDependents;
    case "married_filing_separately":
      return 2 + numberOfDependents;
    case "head_of_household":
    case "qualifying_surviving_spouse":
      return 1 + numberOfDependents;
  }
}

function lookupHouseholdCreditBase(
  federalAgi: Decimal,
  filingStatus: FilingStatus,
  numberOfDependents: number,
  table: NYHouseholdCreditTable
): Decimal {
  const householdSize = getHouseholdCreditHouseholdSize(filingStatus, numberOfDependents);
  for (const bracket of table.brackets) {
    if (federalAgi.lessThanOrEqualTo(bracket.agiCeiling)) {
      if (!table.usesHouseholdSize) {
        return bracket.credits[0] ?? ZERO;
      }

      const cappedHouseholdSize = Math.max(1, Math.min(householdSize, 7));
      const baseCredit = bracket.credits[cappedHouseholdSize - 1] ?? ZERO;
      if (householdSize <= 7) {
        return baseCredit;
      }
      return baseCredit.plus(bracket.incrementOverSeven.times(householdSize - 7));
    }
  }

  return ZERO;
}

/**
 * Compute the NY State household credit (IT-201 line 40).
 */
export function computeHouseholdCredit(params: {
  federalAgi: Decimal;
  filingStatus: FilingStatus;
  numberOfDependents: number;
  nyStateTax: Decimal;
  taxYear: number;
}): Decimal {
  const table = getHouseholdCreditTable(params.filingStatus, params.taxYear);
  const baseCredit = lookupHouseholdCreditBase(
    params.federalAgi,
    params.filingStatus,
    params.numberOfDependents,
    table
  );

  return min(baseCredit, params.nyStateTax);
}

/**
 * Compute the NY earned income credit (IT-201 line 65).
 * Regular NYS EIC is the rounded 30%-of-federal-EIC base reduced by the
 * allowable household credit. The supported noncustodial path continues to
 * use the existing 2.5x multiplier.
 */
export function computeNYEarnedIncomeCredit(params: {
  federalEic: Decimal;
  isNoncustodialParentEic: boolean;
  filingStatus?: FilingStatus;
  householdCreditAllowed?: Decimal;
  nyStateTax?: Decimal;
  residentCredit?: Decimal;
  accumulationDistributionCredit?: Decimal;
  jointFederalReturnForMfsAllocation?: boolean;
  line17AllocatedNYSEic?: Decimal | string | number;
}): Decimal {
  if (params.federalEic.lessThanOrEqualTo(ZERO)) return ZERO;

  if (params.isNoncustodialParentEic) {
    return roundDollar(params.federalEic.times("2.5"));
  }

  const combinedLine16 = computeNYIT215ResidentCredit({
    federalEic: params.federalEic,
    nyStateTax: params.nyStateTax,
    householdCredit: params.householdCreditAllowed,
    residentCredit: params.residentCredit,
    accumulationDistributionCredit: params.accumulationDistributionCredit,
  }).allowableNYSEarnedIncomeCredit;

  return allocateNYIT215MfsClaimedCredit({
    combinedAmount: combinedLine16,
    claimedAmount: params.line17AllocatedNYSEic,
    filingStatus: params.filingStatus ?? "single",
    jointFederalReturnForMfsAllocation: params.jointFederalReturnForMfsAllocation ?? false,
    fieldDescription: "NY IT-215 line 17 claimed allocation",
  });
}

/**
 * Compute the 2025 NY sales/use tax chart amount from IT-201-I.
 */
export function computeNYSalesUseTaxFromChart(params: {
  federalAgi: Decimal | string | number;
  monthsOfPermanentPlaceOfAbode?: number;
}): Decimal {
  const federalAgi = d(params.federalAgi);
  const monthsOfPermanentPlaceOfAbode = params.monthsOfPermanentPlaceOfAbode ?? 12;

  if (!Number.isInteger(monthsOfPermanentPlaceOfAbode)) {
    throw new Error("NY sales/use tax chart months must be a whole number from 0 to 12");
  }
  if (monthsOfPermanentPlaceOfAbode < 0 || monthsOfPermanentPlaceOfAbode > 12) {
    throw new Error("NY sales/use tax chart months must be between 0 and 12");
  }

  let fullYearAmount: Decimal;

  if (federalAgi.lessThanOrEqualTo(15000)) {
    fullYearAmount = new Decimal(3);
  } else if (federalAgi.lessThanOrEqualTo(30000)) {
    fullYearAmount = new Decimal(6);
  } else if (federalAgi.lessThanOrEqualTo(50000)) {
    fullYearAmount = new Decimal(10);
  } else if (federalAgi.lessThanOrEqualTo(75000)) {
    fullYearAmount = new Decimal(15);
  } else if (federalAgi.lessThanOrEqualTo(100000)) {
    fullYearAmount = new Decimal(18);
  } else if (federalAgi.lessThanOrEqualTo(150000)) {
    fullYearAmount = new Decimal(26);
  } else if (federalAgi.lessThanOrEqualTo(200000)) {
    fullYearAmount = new Decimal(34);
  } else {
    fullYearAmount = min(federalAgi.times("0.000175"), new Decimal(125));
  }

  if (monthsOfPermanentPlaceOfAbode === 12) {
    return roundDollar(fullYearAmount);
  }

  return roundDollar(fullYearAmount.times(monthsOfPermanentPlaceOfAbode).div(12));
}

/* ---------- Main computation ---------- */

export function calculateNYIT201Credits(
  input: NYIT201CreditsInput
): NYIT201CreditsResult {
  const nyAgi = d(input.nyAgi);
  const federalAgi = d(input.federalAgi ?? input.nyAgi);
  const nyStateTax = d(input.nyStateTax);
  const numberOfDependents = input.numberOfDependents ?? 0;
  const audit = new AuditTrail();

  // Line 40: Household credit
  const householdCredit = computeHouseholdCredit({
    federalAgi,
    filingStatus: input.filingStatus,
    numberOfDependents,
    nyStateTax,
    taxYear: input.taxYear,
  });
  audit.record("NY-IT201", "40", "NY State household credit", householdCredit,
    "Lookup table by federal AGI, filing status, and household-size column", {
      "Federal AGI": federalAgi.toString(),
      "Filing status": input.filingStatus,
      "Number of dependents": numberOfDependents.toString(),
      "NY State tax (line 39)": nyStateTax.toString(),
    });

  // Line 41: Resident credit (passthrough)
  const residentCredit = d(input.residentCredit);
  audit.record("NY-IT201", "41", "Resident credit", residentCredit,
    "From Form IT-112-R");

  // Line 42: Other NY State credits (passthrough)
  const otherNYStateCredits = d(input.otherNYStateCredits);
  const accumulationDistributionCredit = d(input.accumulationDistributionCredit);
  audit.record("NY-IT201", "42", "Other NY State credits", otherNYStateCredits,
    "From Form IT-201-ATT line 7");

  // Line 43: Total credits
  const totalNYStateCredits = sum(householdCredit, residentCredit, otherNYStateCredits);
  audit.record("NY-IT201", "43", "Total NY State credits", totalNYStateCredits,
    "Line 40 + Line 41 + Line 42", {
      "Household credit (line 40)": householdCredit.toString(),
      "Resident credit (line 41)": residentCredit.toString(),
      "Other credits (line 42)": otherNYStateCredits.toString(),
    });

  // Line 44: Net NY State tax
  const netNYStateTax = zeroFloor(nyStateTax.minus(totalNYStateCredits));
  audit.record("NY-IT201", "44", "Net NY State tax", netNYStateTax,
    "max(0, Line 39 - Line 43)", {
      "NY State tax (line 39)": nyStateTax.toString(),
      "Total credits (line 43)": totalNYStateCredits.toString(),
    });

  // Line 45: Other state taxes (passthrough)
  const otherStateTaxes = d(input.otherStateTaxes);
  audit.record("NY-IT201", "45", "Net other NY State taxes", otherStateTaxes,
    "From Form IT-201-ATT line 30");

  // Line 59: Sales/use tax (exact amount or chart lookup)
  let salesUseTax: Decimal;
  let salesUseTaxFormula: string;
  const salesUseTaxAuditInputs: Record<string, string> = {};

  if (input.salesUseTax !== undefined) {
    salesUseTax = d(input.salesUseTax);
    salesUseTaxFormula = "Exact sales/use tax amount";
  } else if (input.salesUseTaxChart) {
    const chartFederalAgi =
      input.salesUseTaxChart.federalAgi ?? input.federalAgi;
    if (chartFederalAgi === undefined) {
      throw new Error("NY IT-201 line 59 sales/use tax chart requires federal AGI");
    }
    salesUseTax = computeNYSalesUseTaxFromChart({
      federalAgi: chartFederalAgi,
      monthsOfPermanentPlaceOfAbode: input.salesUseTaxChart.monthsOfPermanentPlaceOfAbode,
    });
    salesUseTaxFormula = "2025 IT-201-I sales/use tax chart";
    salesUseTaxAuditInputs["Federal AGI"] = d(chartFederalAgi).toString();
    salesUseTaxAuditInputs["Months of NY abode"] = String(
      input.salesUseTaxChart.monthsOfPermanentPlaceOfAbode ?? 12
    );
  } else {
    salesUseTax = ZERO;
    salesUseTaxFormula = "No sales/use tax provided";
  }
  audit.record("NY-IT201", "59", "Sales or use tax", salesUseTax,
    salesUseTaxFormula, salesUseTaxAuditInputs);

  // Line 46: Total New York State taxes
  const totalNYStateTaxes = sum(netNYStateTax, otherStateTaxes);
  audit.record("NY-IT201", "46", "Total New York State taxes", totalNYStateTaxes,
    "Line 44 + Line 45", {
      "Net NY State tax (line 44)": netNYStateTax.toString(),
      "Other taxes (line 45)": otherStateTaxes.toString(),
    });

  // Line 63: Empire State child credit (refundable, from IT-213)
  const empireStateChildCredit = d(input.empireStateChildCredit);
  audit.record("NY-IT201", "63", "Empire State child credit", empireStateChildCredit,
    "From Form IT-213 line 5");

  // Line 65: NY Earned Income Credit (refundable)
  const federalEic = d(input.federalEic);
  const isNoncustodialParentEic = input.isNoncustodialParentEic ?? false;
  const nyEarnedIncomeCredit = computeNYEarnedIncomeCredit({
    federalEic,
    isNoncustodialParentEic,
    filingStatus: input.filingStatus,
    householdCreditAllowed: householdCredit,
    nyStateTax,
    residentCredit,
    accumulationDistributionCredit,
    jointFederalReturnForMfsAllocation: input.jointFederalReturnForMfsAllocation,
    line17AllocatedNYSEic: input.line17AllocatedNYSEic,
  });
  audit.record("NY-IT201", "65", "NY earned income credit", nyEarnedIncomeCredit,
    isNoncustodialParentEic
      ? "Federal EIC × 2.5 (noncustodial parent)"
      : "IT-215 resident line 16: tentative 30% NYS EIC minus the capped household-credit amount", {
      "Federal EIC": federalEic.toString(),
      "Household credit allowed": householdCredit.toString(),
      "Resident credit": residentCredit.toString(),
      "Accumulation distribution credit": accumulationDistributionCredit.toString(),
      "Noncustodial parent": isNoncustodialParentEic.toString(),
    });

  return {
    nyAgi,
    nyStateTax,
    householdCredit,
    residentCredit,
    otherNYStateCredits,
    totalNYStateCredits,
    netNYStateTax,
    otherStateTaxes,
    salesUseTax,
    totalNYStateTaxes,
    empireStateChildCredit,
    nyEarnedIncomeCredit,
    lines: audit.getLines(),
  };
}
