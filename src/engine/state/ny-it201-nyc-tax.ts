/**
 * New York IT-201 NYC Resident Tax Computation (Lines 47-54).
 * Implements the 2025 full-year NYC resident line flow through line 54.
 * Spec: spec/state/ny-it201-nyc-tax.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, min, zeroFloor } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export interface NYCTaxBracket {
  lowerBound: Decimal;
  upperBound: Decimal | null;
  baseTax: Decimal;
  rate: Decimal;
}

export type NYCBracketGroup = "mfj_qss" | "single_mfs" | "hoh";

export interface NYCHouseholdCreditBracket {
  /** Upper income limit (inclusive) */
  incomeCeiling: Decimal;
  /** Credit amount for single filers */
  credit?: Decimal;
  /** Credit amounts for household sizes 1 through 7 */
  creditsByHouseholdSize?: Decimal[];
  /** Increment to add for each household member over 7 */
  additionalPersonCredit?: Decimal;
}

export interface NYCHouseholdCreditTable {
  brackets: NYCHouseholdCreditBracket[];
}

export interface NYCTaxRateScheduleYear {
  brackets: Record<NYCBracketGroup, NYCTaxBracket[]>;
  householdCredit: {
    single: NYCHouseholdCreditTable;
    mfjQssHoh: NYCHouseholdCreditTable;
    mfs: NYCHouseholdCreditTable;
  };
  schoolTaxCredit: {
    amount: Decimal;
    incomeThresholdSingleMfsHoh: Decimal;
    incomeThresholdMfjQss: Decimal;
  };
}

export interface NYIT201NYCTaxInput {
  /** NYC taxable income supplied for IT-201 line 47 */
  nycTaxableIncome: Decimal | string | number;
  /** Federal adjusted gross income used by the official NYC household credit table */
  federalAgi: Decimal | string | number;
  filingStatus: FilingStatus;
  /** Number of dependents from IT-201 item H */
  numberOfDependents?: number;
  /** Whether taxpayer is a full-year NYC resident */
  isNYCResident: boolean;
  /** Whether taxpayer is a part-year NYC resident using Form IT-360.1 amounts */
  isPartYearNYCResident?: boolean;
  /** Whether the taxpayer can be claimed as a dependent on another federal return */
  canBeClaimedAsDependent?: boolean;
  /** Optional adjusted or combined federal AGI override for the NYC household credit table */
  nycHouseholdCreditFederalAgiOverride?: Decimal | string | number;
  /** Optional official household-size override for the NYC household credit table */
  nycHouseholdCreditHouseholdMembers?: number;
  taxYear: number;

  /** Line 50: Part-year NYC resident tax from Form IT-360.1 */
  partYearNYCTax?: Decimal | string | number;
  /** Line 51: Other NYC taxes from IT-201-ATT Part 3 line 34 or the mixed-residency worksheet path */
  otherNYCTaxes?: Decimal | string | number;
  /** Line 53: NYC nonrefundable credits from IT-201-ATT line 10 */
  otherNYCCredits?: Decimal | string | number;
}

export interface NYIT201NYCTaxResult {
  nycTaxableIncome: Decimal;
  bracketGroup: NYCBracketGroup;
  isNYCResident: boolean;

  /** Line 47a: NYC resident tax from rate schedule */
  nycResidentTax: Decimal;
  /** Line 48: NYC household credit */
  nycHouseholdCredit: Decimal;
  /** Line 50: Part-year NYC resident tax from Form IT-360.1 when provided */
  partYearNYCTax: Decimal;
  /** Line 51: Other NYC taxes */
  otherNYCTaxes: Decimal;
  /** Line 53: NYC nonrefundable credits */
  otherNYCCredits: Decimal;
  /** Compatibility alias for line 54 total NYC tax */
  netNYCTax: Decimal;
  /** Legacy compatibility field; the 2025 school tax credit is handled on IT-201 lines 69 and 69a */
  nycSchoolTaxCredit: Decimal;
  /** Line 54: Total NYC tax */
  totalNYCTax: Decimal;

  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);

function bracket(
  lowerBound: number,
  upperBound: number | null,
  baseTax: string,
  rate: string
): NYCTaxBracket {
  return {
    lowerBound: new Decimal(lowerBound),
    upperBound: upperBound === null ? null : new Decimal(upperBound),
    baseTax: new Decimal(baseTax),
    rate: new Decimal(rate),
  };
}

function singleHcBracket(incomeCeiling: number, credit: number): NYCHouseholdCreditBracket {
  return { incomeCeiling: new Decimal(incomeCeiling), credit: new Decimal(credit) };
}

function sizedHcBracket(
  incomeCeiling: number,
  creditsByHouseholdSize: number[],
  additionalPersonCredit: number
): NYCHouseholdCreditBracket {
  return {
    incomeCeiling: new Decimal(incomeCeiling),
    creditsByHouseholdSize: creditsByHouseholdSize.map((credit) => new Decimal(credit)),
    additionalPersonCredit: new Decimal(additionalPersonCredit),
  };
}

export const NYC_TAX_RATE_SCHEDULES: Record<number, NYCTaxRateScheduleYear> = {
  2025: {
    brackets: {
      single_mfs: [
        bracket(0, 12000, "0", "0.03078"),
        bracket(12000, 25000, "369.36", "0.03762"),
        bracket(25000, 50000, "858.42", "0.03819"),
        bracket(50000, null, "1813.17", "0.03876"),
      ],
      mfj_qss: [
        bracket(0, 21600, "0", "0.03078"),
        bracket(21600, 45000, "664.848", "0.03762"),
        bracket(45000, 90000, "1545.156", "0.03819"),
        bracket(90000, null, "3263.706", "0.03876"),
      ],
      hoh: [
        bracket(0, 14400, "0", "0.03078"),
        bracket(14400, 30000, "443.232", "0.03762"),
        bracket(30000, 60000, "1030.104", "0.03819"),
        bracket(60000, null, "2175.804", "0.03876"),
      ],
    },
    householdCredit: {
      single: {
        brackets: [
          singleHcBracket(10000, 15),
          singleHcBracket(12500, 10),
        ],
      },
      mfjQssHoh: {
        brackets: [
          sizedHcBracket(15000, [30, 60, 90, 120, 150, 180, 210], 30),
          sizedHcBracket(17500, [25, 50, 75, 100, 125, 150, 175], 25),
          sizedHcBracket(20000, [15, 30, 45, 60, 75, 90, 105], 15),
          sizedHcBracket(22500, [10, 20, 30, 40, 50, 60, 70], 10),
        ],
      },
      mfs: {
        brackets: [
          sizedHcBracket(15000, [15, 30, 45, 60, 75, 90, 105], 15),
          sizedHcBracket(17500, [13, 25, 38, 50, 63, 75, 88], 13),
          sizedHcBracket(20000, [8, 15, 23, 30, 38, 45, 53], 8),
          sizedHcBracket(22500, [5, 10, 15, 20, 25, 30, 35], 5),
        ],
      },
    },
    schoolTaxCredit: {
      amount: new Decimal(63),
      incomeThresholdSingleMfsHoh: new Decimal(250000),
      incomeThresholdMfjQss: new Decimal(500000),
    },
  },
};

/* ---------- Helpers ---------- */

export function getNYCBracketGroup(filingStatus: FilingStatus): NYCBracketGroup {
  switch (filingStatus) {
    case "married_filing_jointly":
    case "qualifying_surviving_spouse":
      return "mfj_qss";
    case "single":
    case "married_filing_separately":
      return "single_mfs";
    case "head_of_household":
      return "hoh";
  }
}

/**
 * Compute NYC tax from the rate schedule brackets.
 */
export function computeNYCRateScheduleTax(
  taxableIncome: Decimal,
  brackets: NYCTaxBracket[]
): Decimal {
  if (taxableIncome.lessThanOrEqualTo(ZERO)) return ZERO;

  const selected = brackets.find((b) => {
    const aboveLower = taxableIncome.greaterThan(b.lowerBound);
    const withinUpper = b.upperBound === null || taxableIncome.lessThanOrEqualTo(b.upperBound);
    return aboveLower && withinUpper;
  });

  if (!selected) {
    if (taxableIncome.equals(ZERO)) return ZERO;
    const atBoundary = brackets.find((b) => taxableIncome.equals(b.lowerBound));
    if (atBoundary) return atBoundary.baseTax;
    throw new Error(`No NYC tax bracket matched taxable income ${taxableIncome.toString()}`);
  }

  const excess = taxableIncome.minus(selected.lowerBound);
  return selected.baseTax.plus(excess.times(selected.rate));
}

/**
 * Compute NYC household credit (IT-201 line 49).
 */
export function computeNYCHouseholdCredit(params: {
  federalAgi: Decimal;
  filingStatus: FilingStatus;
  numberOfDependents: number;
  canBeClaimedAsDependent: boolean;
  householdCreditFederalAgiOverride?: Decimal;
  householdMembers?: number;
  nycTax: Decimal;
  taxYear: number;
}): Decimal {
  const constants = NYC_TAX_RATE_SCHEDULES[params.taxYear];
  if (!constants) return ZERO;
  if (params.canBeClaimedAsDependent || params.nycTax.lessThanOrEqualTo(ZERO)) return ZERO;

  const federalAgi =
    params.householdCreditFederalAgiOverride ?? params.federalAgi;
  const table =
    params.filingStatus === "single"
      ? constants.householdCredit.single
      : params.filingStatus === "married_filing_separately"
        ? constants.householdCredit.mfs
        : constants.householdCredit.mfjQssHoh;

  let baseCredit = ZERO;
  for (const b of table.brackets) {
    if (!federalAgi.lessThanOrEqualTo(b.incomeCeiling)) continue;

    if (b.credit) {
      baseCredit = b.credit;
      break;
    }

    const householdMembers = params.householdMembers ?? getNYCHouseholdCreditHouseholdMembers(
      params.filingStatus,
      params.numberOfDependents
    );
    if (!Number.isInteger(householdMembers) || householdMembers < 1) {
      throw new Error("NYC household credit household members must be a positive integer");
    }

    if (!b.creditsByHouseholdSize || !b.additionalPersonCredit) {
      throw new Error("NYC household credit table is missing household-size values");
    }

    if (householdMembers <= 7) {
      baseCredit = b.creditsByHouseholdSize[householdMembers - 1] ?? ZERO;
    } else {
      baseCredit = b.creditsByHouseholdSize[6].plus(
        b.additionalPersonCredit.times(householdMembers - 7)
      );
    }
      break;
  }

  if (baseCredit.equals(ZERO)) return ZERO;
  return min(baseCredit, params.nycTax);
}

function getNYCHouseholdCreditHouseholdMembers(
  filingStatus: FilingStatus,
  numberOfDependents: number
): number {
  switch (filingStatus) {
    case "married_filing_jointly":
      return numberOfDependents + 2;
    case "married_filing_separately":
      return numberOfDependents + 2;
    case "single":
    case "head_of_household":
    case "qualifying_surviving_spouse":
      return numberOfDependents + 1;
  }
}

/**
 * Compute NYC school tax credit (IT-201 line 52).
 */
export function computeNYCSchoolTaxCredit(params: {
  nycTaxableIncome: Decimal;
  filingStatus: FilingStatus;
  netNYCTax: Decimal;
  taxYear: number;
}): Decimal {
  const constants = NYC_TAX_RATE_SCHEDULES[params.taxYear];
  if (!constants) return ZERO;

  const bracketGroup = getNYCBracketGroup(params.filingStatus);
  const threshold =
    bracketGroup === "mfj_qss"
      ? constants.schoolTaxCredit.incomeThresholdMfjQss
      : constants.schoolTaxCredit.incomeThresholdSingleMfsHoh;

  if (params.nycTaxableIncome.greaterThan(threshold)) return ZERO;

  return min(constants.schoolTaxCredit.amount, params.netNYCTax);
}

/* ---------- Mixed-residency Line 51 worksheet ---------- */

export interface NYIT201NYCMixedResidencyLine51Input {
  /** NYC taxable income for the full-year city resident spouse as if separate federal returns were filed */
  residentSpouseNYCTaxableIncome: Decimal | string | number;
  /** Combined federal AGI from both spouses' returns, used by NYC household credit table 6 */
  combinedFederalAgi: Decimal | string | number;
  /**
   * Combined household members from both spouses' returns used by NYC household credit table 6.
   * Must be a whole number of at least 2 (one per spouse plus any shared dependents).
   */
  combinedHouseholdMembers: number;
  /** Optional part-year city resident spouse tax from Form IT-360.1 */
  partYearResidentSpouseTax?: Decimal | string | number;
  taxYear: number;
}

export interface NYIT201NYCMixedResidencyLine51Result {
  /** NYC resident tax on the full-year city resident spouse's separate-return taxable income */
  residentSpouseNYCResidentTax: Decimal;
  /** NYC household credit applicable to the resident spouse, capped at the resident spouse tax */
  residentSpouseNYCHouseholdCredit: Decimal;
  /** Part-year city resident spouse tax from Form IT-360.1, or zero if not supplied */
  partYearResidentSpouseTax: Decimal;
  /** IT-201 line 51 amount: max(0, residentSpouseTax - householdCredit) + partYearSpouseTax */
  line51OtherNYCTaxes: Decimal;
}

/**
 * Implements the IT-201 line 51 mixed-residency joint-return worksheet.
 *
 * Used when one spouse was a full-year NYC resident and the other was either a
 * full-year NYC nonresident or a part-year NYC resident.  The helper computes:
 *   1. NYC tax on the full-year city resident spouse's taxable income using the
 *      MFS (married-filing-separately) rate schedule.
 *   2. NYC household credit per the MFS table 6 combined-return rules.
 *   3. Optionally adds the part-year city resident spouse's Form IT-360.1 tax.
 */
export function calculateNYIT201NYCMixedResidencyLine51(
  input: NYIT201NYCMixedResidencyLine51Input
): NYIT201NYCMixedResidencyLine51Result {
  if (
    !Number.isInteger(input.combinedHouseholdMembers) ||
    input.combinedHouseholdMembers < 2
  ) {
    throw new Error(
      "NYC mixed-residency line 51 combined household members must be a whole number of at least 2"
    );
  }

  const constants = NYC_TAX_RATE_SCHEDULES[input.taxYear];
  if (!constants) {
    throw new Error(`NYC tax computation not available for tax year ${input.taxYear}`);
  }

  const residentSpouseNYCTaxableIncome = d(input.residentSpouseNYCTaxableIncome);
  const combinedFederalAgi = d(input.combinedFederalAgi);

  // Step 1: Compute the full-year city resident spouse's NYC tax using the MFS rate schedule.
  const mfsBrackets = constants.brackets["single_mfs"];
  const residentSpouseNYCResidentTax = roundDollar(
    computeNYCRateScheduleTax(residentSpouseNYCTaxableIncome, mfsBrackets)
  );

  // Step 2: NYC household credit from table 6 (MFS combined-return table).
  // The credit is looked up from the MFS table using the combined AGI and combined household members.
  const mfsTable = constants.householdCredit.mfs;
  let baseCredit = ZERO;
  for (const b of mfsTable.brackets) {
    if (!combinedFederalAgi.lessThanOrEqualTo(b.incomeCeiling)) continue;

    if (!b.creditsByHouseholdSize || !b.additionalPersonCredit) {
      throw new Error("NYC household credit table is missing household-size values");
    }

    const householdMembers = input.combinedHouseholdMembers;
    if (householdMembers <= 7) {
      baseCredit = b.creditsByHouseholdSize[householdMembers - 1] ?? ZERO;
    } else {
      baseCredit = b.creditsByHouseholdSize[6].plus(
        b.additionalPersonCredit.times(householdMembers - 7)
      );
    }
    break;
  }

  // Credit is capped at the resident spouse tax.
  const residentSpouseNYCHouseholdCredit = min(baseCredit, residentSpouseNYCResidentTax);

  // Step 3: Part-year city resident spouse tax from Form IT-360.1.
  const partYearResidentSpouseTax =
    input.partYearResidentSpouseTax !== undefined ? d(input.partYearResidentSpouseTax) : ZERO;

  // Line 51 = max(0, residentSpouseTax - householdCredit) + partYearSpouseTax
  const line51OtherNYCTaxes = zeroFloor(
    residentSpouseNYCResidentTax.minus(residentSpouseNYCHouseholdCredit)
  ).plus(partYearResidentSpouseTax);

  return {
    residentSpouseNYCResidentTax,
    residentSpouseNYCHouseholdCredit,
    partYearResidentSpouseTax,
    line51OtherNYCTaxes,
  };
}

/* ---------- Main computation ---------- */

export function calculateNYIT201NYCTax(
  input: NYIT201NYCTaxInput
): NYIT201NYCTaxResult {
  const constants = NYC_TAX_RATE_SCHEDULES[input.taxYear];
  if (!constants) {
    throw new Error(`NYC tax computation not available for tax year ${input.taxYear}`);
  }

  const nycTaxableIncome = d(input.nycTaxableIncome);
  const federalAgi = d(input.federalAgi);
  const bracketGroup = getNYCBracketGroup(input.filingStatus);
  const numberOfDependents = input.numberOfDependents ?? 0;
  const isPartYearNYCResident = input.isPartYearNYCResident ?? false;
  const audit = new AuditTrail();

  if (input.isNYCResident && isPartYearNYCResident) {
    throw new Error("NYC tax computation cannot mark both full-year and part-year NYC residency");
  }

  if (!input.isNYCResident && !isPartYearNYCResident) {
    audit.record("NY-IT201", "47", "NYC taxable income", ZERO, "Not a NYC resident");
    audit.record("NY-IT201", "47a", "NYC resident tax", ZERO, "Not a NYC resident");
    audit.record("NY-IT201", "48", "NYC household credit", ZERO, "Not a NYC resident");
    audit.record("NY-IT201", "50", "Part-year NYC resident tax", ZERO, "Not a NYC resident");
    audit.record("NY-IT201", "51", "Other NYC taxes", ZERO, "Not a NYC resident");
    audit.record("NY-IT201", "53", "NYC nonrefundable credits", ZERO, "Not a NYC resident");
    audit.record("NY-IT201", "54", "Total NYC tax", ZERO, "Not a NYC resident");
    return {
      nycTaxableIncome,
      bracketGroup,
      isNYCResident: false,
      nycResidentTax: ZERO,
      nycHouseholdCredit: ZERO,
      partYearNYCTax: ZERO,
      otherNYCTaxes: ZERO,
      otherNYCCredits: ZERO,
      netNYCTax: ZERO,
      nycSchoolTaxCredit: ZERO,
      totalNYCTax: ZERO,
      lines: audit.getLines(),
    };
  }

  let nycResidentTax = ZERO;
  let nycHouseholdCredit = ZERO;

  if (input.isNYCResident) {
    audit.record("NY-IT201", "47", "NYC taxable income", nycTaxableIncome,
      "Supplied NYC taxable income for the full-year resident path", {
        "NYC taxable income input": nycTaxableIncome.toString(),
      });

    const brackets = constants.brackets[bracketGroup];
    nycResidentTax = roundDollar(computeNYCRateScheduleTax(nycTaxableIncome, brackets));
    audit.record("NY-IT201", "47a", "NYC resident tax", nycResidentTax,
      "NYC tax rate schedule applied to NYC taxable income", {
        "Bracket group": bracketGroup,
        "Filing status": input.filingStatus,
        "NYC taxable income": nycTaxableIncome.toString(),
      });

    nycHouseholdCredit = computeNYCHouseholdCredit({
      federalAgi,
      filingStatus: input.filingStatus,
      numberOfDependents,
      canBeClaimedAsDependent: input.canBeClaimedAsDependent ?? false,
      householdCreditFederalAgiOverride: input.nycHouseholdCreditFederalAgiOverride
        ? d(input.nycHouseholdCreditFederalAgiOverride)
        : undefined,
      householdMembers: input.nycHouseholdCreditHouseholdMembers,
      nycTax: nycResidentTax,
      taxYear: input.taxYear,
    });
    audit.record("NY-IT201", "48", "NYC household credit", nycHouseholdCredit,
      "Lookup table by federal AGI and official NYC household size rules", {
        "Federal AGI": federalAgi.toString(),
        "Claimable as dependent": (input.canBeClaimedAsDependent ?? false) ? "yes" : "no",
        "Number of dependents": numberOfDependents.toString(),
        "NYC household credit federal AGI override": input.nycHouseholdCreditFederalAgiOverride
          ? d(input.nycHouseholdCreditFederalAgiOverride).toString()
          : "none",
        "NYC household members override": input.nycHouseholdCreditHouseholdMembers?.toString() ?? "none",
      });
  } else {
    audit.record("NY-IT201", "47", "NYC taxable income", ZERO,
      "Part-year NYC resident path uses Form IT-360.1 instead of IT-201 line 47");
    audit.record("NY-IT201", "47a", "NYC resident tax", ZERO,
      "Part-year NYC resident path uses Form IT-360.1 instead of IT-201 line 47a");
    audit.record("NY-IT201", "48", "NYC household credit", ZERO,
      "Part-year NYC resident path does not compute the full-year line 48 household credit here");
  }

  if (isPartYearNYCResident && input.partYearNYCTax === undefined) {
    throw new Error("NYC part-year resident tax input requires partYearNYCTax from Form IT-360.1");
  }

  const partYearNYCTax = isPartYearNYCResident ? d(input.partYearNYCTax) : ZERO;
  audit.record("NY-IT201", "50", "Part-year NYC resident tax", partYearNYCTax,
    isPartYearNYCResident
      ? "Supplied Form IT-360.1 tax amount for the part-year NYC resident path"
      : "No part-year NYC resident tax applies");

  // Line 51: Other NYC taxes (passthrough)
  const otherNYCTaxes = d(input.otherNYCTaxes);
  audit.record("NY-IT201", "51", "Other NYC taxes", otherNYCTaxes,
    "From Form IT-201-ATT Part 3 line 34 or the mixed-residency worksheet path");

  // Line 53: NYC nonrefundable credits (passthrough)
  const otherNYCCredits = d(input.otherNYCCredits);
  audit.record("NY-IT201", "53", "NYC nonrefundable credits", otherNYCCredits,
    "From Form IT-201-ATT line 10");

  // Line 54: Total NYC tax
  const totalNYCTax = zeroFloor(
    nycResidentTax
      .minus(nycHouseholdCredit)
      .plus(partYearNYCTax)
      .plus(otherNYCTaxes)
      .minus(otherNYCCredits)
  );
  audit.record("NY-IT201", "54", "Total NYC tax", totalNYCTax,
    "max(0, Line 47a - Line 48 + Line 50 + Line 51 - Line 53)", {
      "NYC resident tax (line 47a)": nycResidentTax.toString(),
      "NYC household credit (line 48)": nycHouseholdCredit.toString(),
      "Part-year NYC resident tax (line 50)": partYearNYCTax.toString(),
      "Other NYC taxes (line 51)": otherNYCTaxes.toString(),
      "NYC nonrefundable credits (line 53)": otherNYCCredits.toString(),
    });

  return {
    nycTaxableIncome,
    bracketGroup,
    isNYCResident: input.isNYCResident,
    nycResidentTax,
    nycHouseholdCredit,
    partYearNYCTax,
    otherNYCTaxes,
    otherNYCCredits,
    netNYCTax: totalNYCTax,
    nycSchoolTaxCredit: ZERO,
    totalNYCTax,
    lines: audit.getLines(),
  };
}
