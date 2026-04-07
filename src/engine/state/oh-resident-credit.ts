/**
 * Ohio Resident Credit — Credit for Taxes Paid to Another State.
 * Spec: spec/state/oh-resident-credit.yaml
 *
 * Computes the Ohio resident credit for full-year Ohio residents who paid
 * income tax to another state on income also included in Ohio AGI. The credit
 * prevents double taxation and flows to Schedule of Credits, line 39.
 *
 * Per-state credit = lesser of:
 *   (a) Tax actually paid to that state (net of credits)
 *   (b) Ohio tax × (double-taxed income ÷ Ohio AGI)
 *
 * Compensation earned in reciprocity states (IN, KY, MI, PA, WV) is excluded.
 * Total credit across all states is capped at the Ohio tax still available for
 * the resident credit after earlier nonrefundable credits.
 *
 * R.C. 5747.05(B).
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

const OHIO_RECIPROCITY_STATES = new Set(["IN", "KY", "MI", "PA", "WV"]);
const OHIO_RESIDENT_CREDIT_VALID_JURISDICTIONS = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export type OhioResidentCreditIncomeType = "compensation" | "other";

/** Tax information for a single other state. */
export interface OtherStateTaxEntry {
  /** Two-letter state abbreviation (e.g., "KY", "PA", "IN"). */
  stateCode: string;
  /** Whether the double-taxed income is compensation or some other income type. */
  incomeType?: OhioResidentCreditIncomeType;
  /** Income included in both Ohio AGI and taxed by this state. */
  doubleTaxedIncome: Decimal | string | number;
  /** State income tax paid to this state, net of credits received from that state. */
  taxPaid: Decimal | string | number;
}

export interface OhioResidentCreditInput {
  /** Ohio AGI from IT 1040 line 3. */
  ohioAgi: Decimal | string | number;
  /** Ohio tax still available for the resident credit after earlier nonrefundable credits. */
  ohioTaxBeforeCredits: Decimal | string | number;
  /** Tax information for each other state where income was also taxed. */
  otherStates: OtherStateTaxEntry[];
}

/** Per-state detail in the result. */
export interface OtherStateCreditDetail {
  stateCode: string;
  doubleTaxedIncome: Decimal;
  apportionmentFraction: Decimal;
  ohioTaxOnOtherStateIncome: Decimal;
  taxPaidToOtherState: Decimal;
  credit: Decimal;
}

export interface OhioResidentCreditResult {
  ohioAgi: Decimal;
  ohioTaxBeforeCredits: Decimal;
  stateDetails: OtherStateCreditDetail[];
  totalResidentCredit: Decimal;
  lines: CalculatedLine[];
}

function normalizeStateCode(stateCode: string): string {
  const normalized = stateCode.trim().toUpperCase();

  if (normalized === "OH") {
    throw new Error(
      "Ohio resident credit applies only to another U.S. state or DC; OH is not a valid resident-credit jurisdiction"
    );
  }

  if (!OHIO_RESIDENT_CREDIT_VALID_JURISDICTIONS.has(normalized)) {
    throw new Error(
      `Ohio resident credit applies only to another U.S. state or DC; received ${stateCode}`
    );
  }

  return normalized;
}

function resolveIncomeType(entry: OtherStateTaxEntry, stateCode: string): OhioResidentCreditIncomeType {
  if (entry.incomeType) {
    return entry.incomeType;
  }

  if (OHIO_RECIPROCITY_STATES.has(stateCode)) {
    throw new Error(
      `Ohio resident credit entry for ${stateCode} must specify incomeType because reciprocity excludes compensation income`
    );
  }

  return "other";
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateOhioResidentCredit(
  input: OhioResidentCreditInput,
): OhioResidentCreditResult {
  const audit = new AuditTrail();

  const ohioAgi = d(input.ohioAgi);
  const ohioTax = d(input.ohioTaxBeforeCredits);

  audit.record(
    "OH-RESIDENT-CREDIT", "W2",
    "Ohio adjusted gross income",
    ohioAgi,
    "IT 1040, line 3",
  );

  audit.record(
    "OH-RESIDENT-CREDIT", "W4",
    "Ohio tax available for the resident credit",
    ohioTax,
    "Ohio tax remaining after earlier nonrefundable credits",
  );

  // No credit if Ohio AGI is zero or negative (cannot apportion)
  if (ohioAgi.lessThanOrEqualTo(0) || ohioTax.lessThanOrEqualTo(0)) {
    audit.record(
      "OH-RESIDENT-CREDIT", "Total",
      "Total resident credit",
      new Decimal(0),
      ohioAgi.lessThanOrEqualTo(0)
        ? "$0 — Ohio AGI is zero or negative, cannot compute apportionment"
        : "$0 — Ohio tax before credits is zero",
    );

    return {
      ohioAgi,
      ohioTaxBeforeCredits: ohioTax,
      stateDetails: [],
      totalResidentCredit: new Decimal(0),
      lines: audit.getLines(),
    };
  }

  const stateDetails: OtherStateCreditDetail[] = [];

  for (const entry of input.otherStates) {
    const stateCode = normalizeStateCode(entry.stateCode);
    const incomeType = resolveIncomeType(entry, stateCode);
    const excludedCompensation =
      incomeType === "compensation" && OHIO_RECIPROCITY_STATES.has(stateCode);
    const doubleTaxedIncome = excludedCompensation
      ? new Decimal(0)
      : zeroFloor(d(entry.doubleTaxedIncome));
    const taxPaid = zeroFloor(d(entry.taxPaid));
    const prefix = stateCode;

    // W1 — Double-taxed income
    audit.record(
      "OH-RESIDENT-CREDIT", `${prefix}/W1`,
      `Income taxed by both Ohio and ${stateCode}`,
      doubleTaxedIncome,
      excludedCompensation
        ? `Compensation earned in ${stateCode} is excluded because Ohio has a reciprocity agreement with that state`
        : "Double-taxed income for this state",
    );

    // W3 — Apportionment fraction (capped at 1.0)
    const rawFraction = doubleTaxedIncome.dividedBy(ohioAgi);
    const fraction = rawFraction.greaterThan(1)
      ? new Decimal(1)
      : rawFraction;
    audit.record(
      "OH-RESIDENT-CREDIT", `${prefix}/W3`,
      `Apportionment fraction (${stateCode})`,
      fraction,
      "min(1.0, W1 ÷ W2)",
      { "W1": doubleTaxedIncome, "W2": ohioAgi },
    );

    // W5 — Ohio tax attributable to other-state income
    const ohioTaxPortion = roundDollar(fraction.times(ohioTax));
    audit.record(
      "OH-RESIDENT-CREDIT", `${prefix}/W5`,
      `Ohio tax on ${stateCode} income`,
      ohioTaxPortion,
      "round(W3 × W4)",
      { "W3": fraction, "W4": ohioTax },
    );

    // W6 — Tax paid to other state
    audit.record(
      "OH-RESIDENT-CREDIT", `${prefix}/W6`,
      `Tax paid to ${stateCode}`,
      taxPaid,
      "Net state income tax paid to other state",
    );

    // W7 — Credit for this state = lesser of W5 and W6
    const credit = min(ohioTaxPortion, taxPaid);
    audit.record(
      "OH-RESIDENT-CREDIT", `${prefix}/W7`,
      `Resident credit for ${stateCode}`,
      credit,
      excludedCompensation ? "$0 because reciprocity-state compensation is not eligible" : "min(W5, W6)",
      { "W5 (Ohio portion)": ohioTaxPortion, "W6 (tax paid)": taxPaid },
    );

    stateDetails.push({
      stateCode,
      doubleTaxedIncome,
      apportionmentFraction: fraction,
      ohioTaxOnOtherStateIncome: ohioTaxPortion,
      taxPaidToOtherState: taxPaid,
      credit,
    });
  }

  // Total — sum of per-state credits, capped at the tax available for the resident credit
  const rawTotal = stateDetails.reduce(
    (acc, sd) => acc.plus(sd.credit),
    new Decimal(0),
  );
  const totalCredit = min(rawTotal, ohioTax);

  audit.record(
    "OH-RESIDENT-CREDIT", "Total",
    "Total resident credit",
    totalCredit,
    "min(sum of per-state credits, tax remaining for the resident credit)",
    {
      "Sum of per-state credits": rawTotal,
      "Ohio tax cap": ohioTax,
    },
  );

  return {
    ohioAgi,
    ohioTaxBeforeCredits: ohioTax,
    stateDetails,
    totalResidentCredit: totalCredit,
    lines: audit.getLines(),
  };
}
