/**
 * Earned Income Credit (EIC) — EIC Worksheet from Form 1040 Instructions.
 * Spec: spec/federal/schedule-eic.yaml
 *
 * Computes the Earned Income Credit per IRC §32 and Rev. Proc. 2024-40 §3.06
 * for tax year 2025. The credit phases in with earned income, plateaus at the
 * maximum, then phases out as the greater of earned income or AGI rises above
 * the phase-out threshold.
 *
 * Schedule EIC itself is the qualifying-child attachment. This module implements
 * the credit calculation (the EIC Worksheet in the 1040 instructions).
 */

import Decimal from "decimal.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);

export interface EicInput {
  filingStatus: FilingStatus;
  /** Number of qualifying EIC children (capped at 3 for rate lookup) */
  qualifyingChildren: number;
  /** Earned income: wages + net SE earnings − deductible half of SE tax */
  earnedIncome: Decimal;
  /** Adjusted gross income (Form 1040 Line 11) */
  agi: Decimal;
  /** Investment income for the disqualification test */
  investmentIncome: Decimal;
  /** Primary filer's age at end of tax year (needed for childless age test) */
  primaryAge: number;
  /** Whether the MFS filer qualifies for the separated-spouse exception */
  mfsEicEligible: boolean;
}

export interface EicResult {
  credit: Decimal;
  maxCredit: Decimal;
  phaseInCredit: Decimal;
  phaseOutReduction: Decimal;
  disqualified: boolean;
  disqualificationReason?: string;
  lines: CalculatedLine[];
}

export function calculateEic(input: EicInput, constants: YearConstants): EicResult {
  const audit = new AuditTrail();
  const eitc = constants.eitc;

  // Cap qualifying children at 3 for rate lookup
  const childKey = Math.min(input.qualifyingChildren, 3);

  // ── Disqualification checks ──────────────────────────────

  // MFS: cannot claim EIC unless the separated-spouse exception applies
  if (input.filingStatus === "married_filing_separately" && !input.mfsEicEligible) {
    return disqualified(audit, "MFS filers cannot claim EIC without the separated-spouse exception (IRC §32(d))");
  }

  // Earned income must be positive
  if (input.earnedIncome.lessThanOrEqualTo(ZERO)) {
    return disqualified(audit, "Earned income must be greater than $0");
  }

  // Investment income disqualification
  if (input.investmentIncome.greaterThan(eitc.investmentIncomeLimit)) {
    return disqualified(
      audit,
      `Investment income ($${input.investmentIncome}) exceeds $${eitc.investmentIncomeLimit} limit`,
    );
  }

  // Age requirement for childless filers: must be age 25–64 inclusive at end of tax year
  if (childKey === 0) {
    if (input.primaryAge < 25 || input.primaryAge > 64) {
      return disqualified(
        audit,
        `Childless filer must be age 25–64 (age ${input.primaryAge} at year end)`,
      );
    }
  }

  // ── Credit calculation ───────────────────────────────────

  const creditRate = eitc.creditRate[childKey];
  const phaseOutRate = eitc.phaseOutRate[childKey];
  const earnedIncomeAmount = eitc.earnedIncomeAmount[childKey];

  // Determine phase-out start based on filing status
  const isMfj = input.filingStatus === "married_filing_jointly" ||
                input.filingStatus === "qualifying_surviving_spouse";
  // MFS with exception uses single/HoH thresholds per IRS rules
  const phaseOutStart = isMfj
    ? eitc.phaseOutStartMFJ[childKey]
    : eitc.phaseOutStartSingleHoH[childKey];

  // Phase-in: credit_rate × min(earned_income, earned_income_amount)
  const phaseInCredit = creditRate.times(Decimal.min(input.earnedIncome, earnedIncomeAmount));

  // Phase-out: phase_out_rate × max(0, max(earned_income, agi) − phase_out_start)
  const phaseOutIncome = Decimal.max(input.earnedIncome, input.agi);
  const phaseOutExcess = Decimal.max(ZERO, phaseOutIncome.minus(phaseOutStart));
  const phaseOutReduction = phaseOutRate.times(phaseOutExcess);

  // Credit = max(0, floor(phase_in - phase_out_reduction))
  const rawCredit = phaseInCredit.minus(phaseOutReduction);
  const credit = Decimal.max(ZERO, rawCredit.floor());

  // Maximum credit for reference
  const maxCredit = creditRate.times(earnedIncomeAmount).floor();

  // ── Audit trail ──────────────────────────────────────────

  audit.record("EIC", "phaseIn", "Phase-in credit", phaseInCredit,
    `${creditRate.times(100)}% × min($${input.earnedIncome}, $${earnedIncomeAmount})`,
    {
      "Credit rate": creditRate,
      "Earned income": input.earnedIncome,
      "Earned income amount (phase-in ceiling)": earnedIncomeAmount,
    });

  audit.record("EIC", "phaseOut", "Phase-out reduction", phaseOutReduction,
    `${phaseOutRate.times(100)}% × max(0, max($${input.earnedIncome}, $${input.agi}) − $${phaseOutStart})`,
    {
      "Phase-out rate": phaseOutRate,
      "Earned income": input.earnedIncome,
      "AGI": input.agi,
      "Phase-out income (greater of earned/AGI)": phaseOutIncome,
      "Phase-out start": phaseOutStart,
      "Excess over phase-out start": phaseOutExcess,
    });

  audit.record("EIC", "27a", "Earned Income Credit", credit,
    `max(0, floor($${phaseInCredit} − $${phaseOutReduction}))`,
    {
      "Filing status": input.filingStatus,
      "Qualifying EIC children": input.qualifyingChildren.toString(),
      "Maximum credit": maxCredit,
      "Phase-in credit": phaseInCredit,
      "Phase-out reduction": phaseOutReduction,
      "Investment income": input.investmentIncome,
      "Investment income limit": eitc.investmentIncomeLimit,
    });

  return {
    credit,
    maxCredit,
    phaseInCredit,
    phaseOutReduction,
    disqualified: false,
    lines: audit.getLines(),
  };
}

function disqualified(audit: AuditTrail, reason: string): EicResult {
  audit.record("EIC", "27a", "Earned Income Credit", ZERO, `Disqualified: ${reason}`);
  return {
    credit: ZERO,
    maxCredit: ZERO,
    phaseInCredit: ZERO,
    phaseOutReduction: ZERO,
    disqualified: true,
    disqualificationReason: reason,
    lines: audit.getLines(),
  };
}
