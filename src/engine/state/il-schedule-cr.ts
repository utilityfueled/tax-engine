/**
 * Illinois Schedule CR — Credit for Tax Paid to Other States
 * Spec: spec/state/il-schedule-cr.yaml
 *
 * Computes the credit for Illinois residents who paid income tax to other states.
 * Credit = min(tax paid to other state, IL tax attributable to non-IL income).
 * IL tax attributable = (non-IL base income / total base income) × IL income tax.
 *
 * Reciprocal agreements with IA, KY, MI, WI cover wages/salaries only;
 * non-wage income from those states is still eligible for Schedule CR.
 */

import Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { sum } from "@/utils/decimal.js";

const RECIPROCAL_STATES = new Set(["IA", "IOWA", "KY", "KENTUCKY", "MI", "MICHIGAN", "WI", "WISCONSIN"]);

export interface ScheduleCRTaxEntry {
  /** State or locality where the tax was imposed. */
  jurisdiction: string;
  /** Actual tax liability attributable to the entry. */
  taxPaid: Decimal;
  /** Wages are subject to reciprocal-agreement filtering; other income is not. */
  incomeType: "wages" | "other";
  /** Local tax in a reciprocal state remains creditable. Defaults to state-level income tax. */
  taxingAuthority?: "state" | "local";
  /** Dual-resident cases remain creditable even for reciprocal-state wage tax. */
  dualResident?: boolean;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ScheduleCRInput {
  taxYear: number;

  /**
   * Column A, Line 42 — Total base income (should equal IL-1040 Line 9).
   * Sum of all income items minus adjustments, plus IL additions, minus IL subtractions.
   */
  totalBaseIncome: Decimal;

  /**
   * Column B, Line 42 — Non-Illinois portion of base income.
   * Income earned in or sourced to other states while an IL resident.
   */
  nonIllinoisBaseIncome: Decimal;

  /**
   * Line 51 — Total income tax paid to other states.
   * Must be actual tax liability from other states' returns, not withholding.
   */
  taxPaidToOtherStates: Decimal;

  /**
   * Optional detailed tax breakdown used to derive Line 51.
   * When provided, the engine applies Illinois reciprocal-state filtering.
   */
  taxEntries?: ScheduleCRTaxEntry[];
}

/** Extended input used internally — includes values from IL-1040 computation */
export interface ScheduleCRComputedInput extends ScheduleCRInput {
  /** IL-1040, Line 14 — Illinois income tax */
  ilIncomeTax: Decimal;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface ScheduleCRResult {
  /** Line 42a: Column A total base income */
  totalBaseIncome: Decimal;
  /** Line 42b: Column B non-IL base income */
  nonIllinoisBaseIncome: Decimal;
  /** Line 43/50: Schedule CR decimal (ratio, 4 decimal places, capped at 1.0) */
  crDecimal: Decimal;
  /** Line 51: Tax paid to other states */
  taxPaidToOtherStates: Decimal;
  /** Line 52: IL income tax */
  ilIncomeTax: Decimal;
  /** Line 53: IL tax attributable to non-IL income */
  ilTaxOnNonIlIncome: Decimal;
  /** Line 54/55: Credit amount (flows to IL-1040, Line 15) */
  credit: Decimal;
  /** Audit trail */
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateScheduleCR(input: ScheduleCRComputedInput): ScheduleCRResult {
  const audit = new AuditTrail();
  const FORM = "Schedule CR";

  const normalizedTaxEntries = input.taxEntries?.map((entry, index) => {
    if (entry.taxPaid.lt(0)) {
      throw new Error(`Schedule CR tax entry ${index + 1} tax paid cannot be negative`);
    }

    return {
      ...entry,
      taxingAuthority: entry.taxingAuthority ?? "state",
      dualResident: entry.dualResident ?? false,
    };
  });

  // Line 42: Base income totals
  const line42a = audit.record(FORM, "42a", "Column A — Total base income",
    input.totalBaseIncome, "IL-1040, Line 9", { totalBaseIncome: input.totalBaseIncome });

  const line42b = audit.record(FORM, "42b", "Column B — Non-Illinois base income",
    input.nonIllinoisBaseIncome, "Income earned in other states", { nonIllinoisBaseIncome: input.nonIllinoisBaseIncome });

  // Line 43: Schedule CR decimal = Column B / Column A, capped at 1.0, 4 decimal places
  let crDecimal: Decimal;
  if (line42a.isZero() || line42a.isNegative()) {
    crDecimal = new Decimal(0);
  } else {
    const rawDecimal = line42b.dividedBy(line42a);
    crDecimal = Decimal.min(rawDecimal, new Decimal(1)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  }
  const line43 = audit.record(FORM, "43", "Schedule CR decimal",
    crDecimal, "min(Column B ÷ Column A, 1.0) to 4 decimal places", { line42a, line42b });

  // Line 50: Final decimal (same as Line 43 for full-year residents)
  const line50 = audit.record(FORM, "50", "Final decimal (full-year resident)",
    line43, "Line 43 for full-year residents", { line43 });

  const creditableTaxEntries = normalizedTaxEntries?.filter((entry) => {
    const normalizedJurisdiction = entry.jurisdiction.trim().toUpperCase();
    const isReciprocalState = RECIPROCAL_STATES.has(normalizedJurisdiction);
    const isReciprocalStateWageTax =
      isReciprocalState
      && entry.incomeType === "wages"
      && entry.taxingAuthority !== "local"
      && !entry.dualResident;

    return !isReciprocalStateWageTax;
  });

  const line51Amount = creditableTaxEntries
    ? sum(...creditableTaxEntries.map((entry) => entry.taxPaid))
    : input.taxPaidToOtherStates;

  // Line 51: Tax paid to other states
  const line51 = audit.record(FORM, "51", "Total income tax paid to other states",
    line51Amount,
    creditableTaxEntries
      ? "Sum of detailed tax entries after reciprocal-state filtering"
      : "Actual tax liability from other states' returns",
    creditableTaxEntries
      ? {
          providedTaxEntryCount: new Decimal(normalizedTaxEntries?.length ?? 0),
          creditableTaxEntryCount: new Decimal(creditableTaxEntries.length),
          excludedReciprocalWageTax: sum(
            ...(normalizedTaxEntries ?? [])
              .filter((entry) => !creditableTaxEntries.includes(entry))
              .map((entry) => entry.taxPaid),
          ),
        }
      : { taxPaidToOtherStates: input.taxPaidToOtherStates },
  );

  // Line 52: IL income tax
  const line52 = audit.record(FORM, "52", "Illinois income tax from IL-1040, Line 14",
    input.ilIncomeTax, "IL-1040, Line 14", { ilIncomeTax: input.ilIncomeTax });

  // Line 53: IL tax attributable to non-IL income = decimal × IL tax
  const line53 = audit.record(FORM, "53", "IL tax attributable to non-IL income",
    line50.times(line52).toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    "Line 50 × Line 52", { line50, line52 });

  // Line 54: Credit = min(tax paid, IL tax attributable)
  const line54 = audit.record(FORM, "54", "Credit for tax paid to other states",
    Decimal.min(line51, line53), "min(Line 51, Line 53)", { line51, line53 });

  // Line 55: Same as Line 54, flows to IL-1040 Line 15
  const line55 = audit.record(FORM, "55", "Credit to IL-1040, Line 15",
    line54, "Line 54 → IL-1040, Line 15", { line54 });

  return {
    totalBaseIncome: line42a,
    nonIllinoisBaseIncome: line42b,
    crDecimal: line43,
    taxPaidToOtherStates: line51,
    ilIncomeTax: line52,
    ilTaxOnNonIlIncome: line53,
    credit: line55,
    lines: audit.getLines(),
  };
}
