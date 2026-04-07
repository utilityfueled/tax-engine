/**
 * Pennsylvania Schedule OC — Other Credits
 * Spec: spec/state/pa-schedule-oc.yaml
 *
 * Computes PA tax credits other than Tax Forgiveness (Schedule SP) and
 * Resident Credit (Schedule G-L). Flows to PA-40 Line 21.
 *
 * Key credits:
 *   - PTE (Pass-Through Entity) Tax Credit — Act 151 of 2022
 *   - Employment Incentive Payment Credit
 *   - Neighborhood Assistance Program (NAP) Credit
 *   - Other PA credits (REAP, Jobs Creation, EITC, OSTC, etc.)
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { PA_CONSTANTS } from "@/engine/state/pa-40.js";

// ---------------------------------------------------------------------------
// Input interfaces
// ---------------------------------------------------------------------------

/** PTE (Pass-Through Entity) Tax Credit entry — one per electing entity */
export interface PTECreditEntry {
  /** Entity name (partnership, S-corp, or LLC) */
  entityName: string;
  /** Entity EIN */
  entityEIN: string;
  /** Taxpayer's allocable PA-source income from this entity */
  allocablePAIncome: Decimal;
  /** Taxpayer's share of PTE tax actually paid to PA by the entity */
  pteTaxPaid: Decimal;
}

/** Credit type for non-PTE credits */
export type PAOtherCreditType =
  | "employment_incentive"
  | "neighborhood_assistance"
  | "reap"
  | "jobs_creation"
  | "keystone_zone"
  | "eitc"
  | "ostc"
  | "other";

/** Non-PTE credit entry — pre-computed amount */
export interface PAOtherCreditEntry {
  /** Credit program type */
  creditType: PAOtherCreditType;
  /** Description or program name */
  description?: string;
  /** Pre-computed credit amount */
  amount: Decimal;
}

export interface ScheduleOCInput {
  taxYear: number;
  /** PTE tax credit entries (one per electing entity) */
  pteCredits?: PTECreditEntry[];
  /** Non-PTE credit entries */
  otherCredits?: PAOtherCreditEntry[];
}

// ---------------------------------------------------------------------------
// Output interfaces
// ---------------------------------------------------------------------------

/** Per-entity PTE credit result */
export interface PTECreditResult {
  entityName: string;
  entityEIN: string;
  allocablePAIncome: Decimal;
  pteTaxPaid: Decimal;
  /** PA tax on allocable income (allocablePAIncome × 3.07%) */
  paTaxOnAllocableIncome: Decimal;
  /** Credit = lesser of pteTaxPaid and paTaxOnAllocableIncome */
  credit: Decimal;
}

export interface ScheduleOCResult {
  /** Per-entity PTE credit results */
  pteResults: PTECreditResult[];
  /** Line 1: Total PTE credit */
  totalPTECredit: Decimal;
  /** Line 2: Employment Incentive Payment Credit */
  employmentIncentiveCredit: Decimal;
  /** Line 3: NAP Credit */
  napCredit: Decimal;
  /** Line 4: Other credits total */
  otherCreditsTotal: Decimal;
  /** Total: All Schedule OC credits → PA-40 Line 21 */
  totalOtherCredits: Decimal;
  /** Audit trail */
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateScheduleOC(input: ScheduleOCInput): ScheduleOCResult {
  const constants = PA_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`PA constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  // -------------------------------------------------------------------------
  // Line 1: PTE Tax Credit
  // -------------------------------------------------------------------------

  const pteResults: PTECreditResult[] = [];
  const pteEntries = input.pteCredits ?? [];

  for (const entry of pteEntries) {
    // PA tax on allocable income = income × 3.07%
    // Only compute on positive income — negative/zero income means $0 credit
    const paTaxOnAllocableIncome = entry.allocablePAIncome.isPositive()
      ? roundDollar(entry.allocablePAIncome.times(constants.taxRate))
      : new Decimal(0);

    // Credit = lesser of PTE tax paid and PA tax on allocable income
    const credit = Decimal.min(
      zeroFloor(entry.pteTaxPaid),
      paTaxOnAllocableIncome,
    );

    audit.record("PA-Schedule-OC", `1-${entry.entityEIN}`,
      `PTE credit for ${entry.entityName}`,
      credit,
      `Lesser of $${entry.pteTaxPaid} (PTE tax paid) and $${paTaxOnAllocableIncome} (PA tax on $${entry.allocablePAIncome} at ${constants.taxRate.times(100)}%)`);

    pteResults.push({
      entityName: entry.entityName,
      entityEIN: entry.entityEIN,
      allocablePAIncome: entry.allocablePAIncome,
      pteTaxPaid: entry.pteTaxPaid,
      paTaxOnAllocableIncome,
      credit,
    });
  }

  const totalPTECredit = sum(...pteResults.map((r) => r.credit));
  audit.record("PA-Schedule-OC", "1", "Total PTE tax credit", totalPTECredit,
    `Sum of PTE credits from ${pteEntries.length} entities`);

  // -------------------------------------------------------------------------
  // Lines 2–4: Non-PTE Credits
  // -------------------------------------------------------------------------

  const otherEntries = input.otherCredits ?? [];

  let employmentIncentiveCredit = new Decimal(0);
  let napCredit = new Decimal(0);
  let miscCredits = new Decimal(0);

  for (const entry of otherEntries) {
    const amount = zeroFloor(entry.amount);
    const desc = entry.description ?? entry.creditType;

    switch (entry.creditType) {
      case "employment_incentive":
        employmentIncentiveCredit = employmentIncentiveCredit.plus(amount);
        audit.record("PA-Schedule-OC", "2-detail",
          `Employment Incentive: ${desc}`, amount, "Pre-computed credit");
        break;
      case "neighborhood_assistance":
        napCredit = napCredit.plus(amount);
        audit.record("PA-Schedule-OC", "3-detail",
          `NAP Credit: ${desc}`, amount, "Pre-computed credit");
        break;
      default:
        miscCredits = miscCredits.plus(amount);
        audit.record("PA-Schedule-OC", `4-${entry.creditType}`,
          `Other credit: ${desc}`, amount, "Pre-computed credit");
        break;
    }
  }

  audit.record("PA-Schedule-OC", "2", "Employment Incentive Payment Credit",
    employmentIncentiveCredit, "Sum of employment incentive credits");
  audit.record("PA-Schedule-OC", "3", "Neighborhood Assistance Program Credit",
    napCredit, "Sum of NAP credits");
  audit.record("PA-Schedule-OC", "4", "Other PA tax credits",
    miscCredits, "Sum of other pre-computed PA credits");

  // -------------------------------------------------------------------------
  // Total
  // -------------------------------------------------------------------------

  const totalOtherCredits = sum(
    totalPTECredit,
    employmentIncentiveCredit,
    napCredit,
    miscCredits,
  );
  audit.record("PA-Schedule-OC", "total", "Total other credits (PA-40 Line 21)",
    totalOtherCredits, "Line 1 + Line 2 + Line 3 + Line 4");

  return {
    pteResults,
    totalPTECredit,
    employmentIncentiveCredit,
    napCredit,
    otherCreditsTotal: miscCredits,
    totalOtherCredits,
    lines: audit.getLines(),
  };
}
