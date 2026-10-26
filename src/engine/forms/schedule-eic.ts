/**
 * Earned Income Credit (EIC) — EIC Worksheet from Form 1040 Instructions.
 * Spec: spec/federal/schedule-eic.yaml
 *
 * Uses the final2025 Pub596 table and worksheet, retaining the statutory
 * IRC32(a) intermediates. Isolated2026 uses its own indexed statutory values
 * while the final table and public readiness remain unqualified.
 *
 * Schedule EIC itself is the qualifying-child attachment. This module implements
 * the credit calculation (the EIC Worksheet in the 1040 instructions).
 */

import Decimal from "decimal.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { roundDollar } from "@/utils/decimal.js";
import { calculateEicCreditTable } from "./eic-credit-table.js";
import { calculateEicClaimantEligibility, type EicClaimantInput } from "./eic-claimant-eligibility.js";
import { calculateEicDisallowanceHistory, type EicDisallowanceInput } from "./eic-disallowance-history.js";

const ZERO = new Decimal(0);

export interface EicInput {
  filingStatus: FilingStatus;
  /** Number of qualifying EIC children (capped at 3 for rate lookup) */
  qualifyingChildren: number;
  /** Actual child qualification before the SSN amount test; canonical source-derived. */
  qualifyingChildPresent?: boolean;
  /** Earned income: wages + net SE earnings − deductible half of SE tax */
  earnedIncome: Decimal;
  /** Adjusted gross income (Form 1040 Line 11) */
  agi: Decimal;
  /** Investment income for the disqualification test */
  investmentIncome: Decimal;
  /** Historical standalone fallback; canonical returns supply actual claimant sources. */
  primaryAge?: number;
  claimantInput?: EicClaimantInput;
  /** Actual history and independently established child presence, never amount-count inference. */
  disallowanceInput?: EicDisallowanceInput;
  /** Whether the MFS filer qualifies for the separated-spouse exception */
  mfsEicEligible: boolean;
  /** Source-established marriage on a nonjoint return, including actual married HOH. */
  marriedNonjoint?: boolean;
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
  const childless = !(input.qualifyingChildPresent ?? childKey > 0);
  if (input.qualifyingChildPresent === false && childKey > 0) throw new Error('EIC counted children conflict with actual qualifying-child absence');

  if (input.claimantInput && (input.claimantInput.taxpayer.taxYear !== constants.taxYear || input.claimantInput.taxpayer.filingStatus !== input.filingStatus)) throw new Error("EIC claimant year and filing status must match the calculation");
  if (input.disallowanceInput && (input.disallowanceInput.taxpayer.taxYear !== constants.taxYear || input.disallowanceInput.taxpayer.filingStatus !== input.filingStatus)) throw new Error('EIC history year and filing status must match the calculation');
  if (input.disallowanceInput?.qualifyingChildPresent !== undefined
    && input.disallowanceInput.qualifyingChildPresent !== input.qualifyingChildPresent) {
    throw new Error('EIC history actual-child presence must match the calculation actual-child source answer');
  }
  const history = input.disallowanceInput ? calculateEicDisallowanceHistory({
    ...input.disallowanceInput, qualifyingChildPresent: input.qualifyingChildPresent,
  }) : undefined;
  if (history) audit.merge(history.lines);
  // Supplied sources must reconcile even when income rules produce no credit.
  // With no packet, determine whether any credit is possible before requiring
  // unrelated claimant facts; a zero amount does not verify those facts.
  let claimant = input.claimantInput?.eic?.claimantEligibility !== undefined
    ? calculateEicClaimantEligibility(input.claimantInput, childless) : undefined;
  if (claimant) audit.merge(claimant.lines);
  if (history?.barred) return disqualified(audit, 'Actual final IRS determination bars EIC for this tax year (IRC32(k))');
  if (claimant?.disqualificationReason) return disqualified(audit, claimant.disqualificationReason);

  // ── Disqualification checks ──────────────────────────────

  // MFS: cannot claim EIC unless the separated-spouse exception applies
  if ((input.filingStatus === "married_filing_separately" || input.marriedNonjoint === true) && !input.mfsEicEligible) {
    return disqualified(audit, "Married nonjoint filers cannot claim EIC without the separated-spouse exception (IRC §32(d))");
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

  // ── Credit calculation ───────────────────────────────────

  const creditRate = eitc.creditRate[childKey];
  const phaseOutRate = eitc.phaseOutRate[childKey];
  const earnedIncomeAmount = eitc.earnedIncomeAmount[childKey];

  // Determine phase-out start based on filing status
  const isMfj = input.filingStatus === "married_filing_jointly";
  // QSS and MFS with the exception use nonjoint thresholds (Pub596 Rule1).
  const phaseOutStart = isMfj
    ? eitc.phaseOutStartMFJ[childKey]
    : eitc.phaseOutStartSingleHoH[childKey];

  // Phase-in: credit_rate × min(earned_income, earned_income_amount)
  const phaseInCredit = creditRate.times(Decimal.min(input.earnedIncome, earnedIncomeAmount));

  // Phase-out: phase_out_rate × max(0, max(earned_income, agi) − phase_out_start)
  const phaseOutIncome = Decimal.max(input.earnedIncome, input.agi);
  const phaseOutExcess = Decimal.max(ZERO, phaseOutIncome.minus(phaseOutStart));
  const phaseOutReduction = phaseOutRate.times(phaseOutExcess);

  // IRC32(a)(2) limits phase-in by the MAXIMUM less phaseout. A low-earned,
  // higher-AGI return must not subtract phaseout from its smaller phase-in.
  // Final2025 uses the actual published table; isolated2026 uses the corrected
  // statutory formula until that year's own final table is qualified.
  const rawMaximum = creditRate.times(earnedIncomeAmount);
  const rawCredit = Decimal.max(ZERO, Decimal.min(phaseInCredit, rawMaximum.minus(phaseOutReduction)));
  let credit = roundDollar(rawCredit);
  if (constants.taxYear === 2025) {
    const earned = calculateEicCreditTable({ income: input.earnedIncome, filingStatus: input.filingStatus, qualifyingChildren: input.qualifyingChildren, lookup: "earned" }, constants);
    const agi = calculateEicCreditTable({ income: phaseOutIncome, filingStatus: input.filingStatus, qualifyingChildren: input.qualifyingChildren, lookup: "agi" }, constants);
    credit = Decimal.min(earned.credit, agi.credit);
    audit.merge(earned.lines);
    audit.merge(agi.lines);
  }

  if (credit.greaterThan(ZERO)) {
    if (!claimant && input.claimantInput) {
      claimant = calculateEicClaimantEligibility(input.claimantInput, childless);
      audit.merge(claimant.lines);
      if (claimant.disqualificationReason) return disqualified(audit, claimant.disqualificationReason);
    }
    if (childless) {
      if (!claimant && (input.primaryAge === undefined || !Number.isFinite(input.primaryAge))) throw new Error("Historical EIC calculation requires a known age or actual claimant sources");
      if (claimant ? !claimant.childlessAgeEligible : (input.primaryAge ?? 0) < 25 || (input.primaryAge ?? 0) > 64) {
        return disqualified(
          audit,
          claimant ? "Childless claimant age test is not met by either relevant filer at year end or actual death (Pub596 Rule11)" : `Childless filer must be age 25–64 (age ${input.primaryAge} at year end)`,
        );
      }
    }
    const historyRequired = constants.taxYear === 2026 || input.claimantInput?.eic?.claimantEligibility !== undefined;
    if (!history?.sourceFactsComplete && historyRequired) throw new Error('EIC actual complete denial and allowance history is unknown for this positive source-confirmed claim');
    if (history?.form8862Required) throw new Error('EIC requires actual current Form8862 sources; a completed checkbox does not establish recertification');
    if (input.disallowanceInput && !history?.sourceFactsComplete) {
      audit.record('EIC', 'disallowanceHistoryUnverified', 'Historical EIC denial history remains unverified', ZERO,
        'No actual history supplied; this result does not establish no prior denial or Form8862 qualification');
    }
  }

  // Maximum credit for reference
  const maxCredit = roundDollar(rawMaximum);

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
    constants.taxYear === 2025 ? "Smaller of the final2025 earned-income and applicable AGI table amounts"
      : `Isolated statutory result: roundDollar(max(0,min($${phaseInCredit},$${rawMaximum} − $${phaseOutReduction}))); final table unqualified`,
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
