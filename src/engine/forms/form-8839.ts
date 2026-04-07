/**
 * Form 8839 — Qualified Adoption Expenses
 * Spec: spec/federal/form-8839.yaml
 *
 * IRC §23: nonrefundable adoption credit per eligible child, subject to MAGI
 * phase-out. Unused credit carries forward for up to 5 years.
 * IRC §137: exclusion for employer-provided adoption benefits with the same
 * per-child maximum and MAGI phase-out. Benefits exceeding the exclusion are
 * taxable income.
 *
 * MFS filers cannot claim the credit (IRC §23(f)(1)) or the exclusion (IRC §137(d)).
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { Form8839Child } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

export interface Form8839Params {
  filingStatus: FilingStatus;
  agi: Decimal;
  children: Form8839Child[];
  foreignEarnedIncomeExclusion: Decimal;
  foreignHousingExclusion: Decimal;
  constants: {
    maxCreditPerChild: Decimal;
    phaseOutThreshold: Decimal;
    phaseOutRange: Decimal;
  };
}

export interface Form8839ChildResult {
  childName: string;
  isSpecialNeeds: boolean;
  /** Per-child tentative credit (Line 2 column f equivalent) */
  tentativeCredit: Decimal;
  /** Prior year credits already claimed for this child */
  priorYearCreditsClaimed: Decimal;
  /** Net credit for this child before phase-out */
  netCredit: Decimal;
  /** Per-child tentative employer exclusion */
  tentativeExclusion: Decimal;
  /** Prior year exclusions already claimed for this child */
  priorYearExclusionsClaimed: Decimal;
  /** Net exclusion for this child before phase-out */
  netExclusion: Decimal;
}

export interface Form8839Result {
  eligible: boolean;
  ineligibleReason?: string;

  // Part II: Adoption Credit
  maxCreditPerChild: Decimal;           // Line 1
  childResults: Form8839ChildResult[];
  totalTentativeCredit: Decimal;        // Line 3
  totalPriorYearCredits: Decimal;       // Line 4
  netTentativeCredit: Decimal;          // Line 5
  magi: Decimal;                        // Line 6
  phaseOutThreshold: Decimal;           // Line 7
  excessMagi: Decimal;                  // Line 8
  phaseOutFraction: Decimal;            // Line 9
  phaseOutReduction: Decimal;           // Line 10
  adoptionCredit: Decimal;              // Line 11

  // Part III: Employer-Provided Adoption Benefits
  totalEmployerBenefits: Decimal;
  totalTentativeExclusion: Decimal;
  totalPriorYearExclusions: Decimal;
  netTentativeExclusion: Decimal;
  exclusionPhaseOutReduction: Decimal;
  allowableExclusion: Decimal;
  taxableEmployerBenefits: Decimal;

  lines: CalculatedLine[];
}

export function calculateForm8839(params: Form8839Params): Form8839Result {
  const { filingStatus, agi, children, foreignEarnedIncomeExclusion, foreignHousingExclusion, constants } = params;
  const audit = new AuditTrail();

  // ── MFS ineligibility ──────────────────────────────────
  if (filingStatus === "married_filing_separately") {
    audit.record("Form 8839", "Part I", "Eligibility", ZERO, "MFS filers cannot claim adoption credit (IRC §23(f)(1)) or exclusion (IRC §137(d))");
    return {
      eligible: false,
      ineligibleReason: "Married filing separately cannot claim adoption credit or exclusion",
      maxCreditPerChild: constants.maxCreditPerChild,
      childResults: [],
      totalTentativeCredit: ZERO,
      totalPriorYearCredits: ZERO,
      netTentativeCredit: ZERO,
      magi: agi,
      phaseOutThreshold: constants.phaseOutThreshold,
      excessMagi: ZERO,
      phaseOutFraction: ZERO,
      phaseOutReduction: ZERO,
      adoptionCredit: ZERO,
      totalEmployerBenefits: ZERO,
      totalTentativeExclusion: ZERO,
      totalPriorYearExclusions: ZERO,
      netTentativeExclusion: ZERO,
      exclusionPhaseOutReduction: ZERO,
      allowableExclusion: ZERO,
      taxableEmployerBenefits: ZERO,
      lines: audit.getLines(),
    };
  }

  // ── Line 1: Maximum credit per child ───────────────────
  const maxCredit = constants.maxCreditPerChild;
  audit.record("Form 8839", "1", "Maximum adoption credit per child", maxCredit, `$${maxCredit} for tax year`);

  // ── Line 2: Per-child tentative credit and exclusion ───
  const childResults: Form8839ChildResult[] = children.map((child, i) => {
    const childLabel = child.childName || `Child ${i + 1}`;
    const expenses = d(child.qualifiedExpenses);
    const employerBenefits = d(child.employerBenefits);
    const priorCredits = d(child.priorYearCreditsClaimed);
    const priorExclusions = d(child.priorYearExclusionsClaimed);

    // Part II credit computation per child
    let tentativeCredit: Decimal;
    if (child.isSpecialNeeds && child.adoptionBecameFinal) {
      // Special needs + final adoption = full maximum credit regardless of expenses
      tentativeCredit = maxCredit;
      audit.record("Form 8839", `2-${childLabel}`, "Tentative credit (special needs, final)", tentativeCredit,
        `Special needs child with final adoption gets full $${maxCredit}`);
    } else if (child.isForeignAdoption && !child.adoptionBecameFinal) {
      // Foreign adoption expenses only count when adoption becomes final
      tentativeCredit = ZERO;
      audit.record("Form 8839", `2-${childLabel}`, "Tentative credit (foreign, not final)", tentativeCredit,
        "Foreign adoption expenses cannot be claimed until adoption becomes final");
    } else {
      tentativeCredit = Decimal.min(expenses, maxCredit);
      audit.record("Form 8839", `2-${childLabel}`, "Tentative credit", tentativeCredit,
        `min(expenses $${expenses}, max $${maxCredit})`);
    }

    const netCredit = Decimal.max(ZERO, tentativeCredit.minus(priorCredits));

    // Part III exclusion computation per child
    // Combined credit + exclusion per child cannot exceed the maximum (IRC §137)
    const remainingMaxForExclusion = Decimal.max(ZERO, maxCredit.minus(tentativeCredit));
    const tentativeExclusion = Decimal.min(employerBenefits, remainingMaxForExclusion);
    const netExclusion = Decimal.max(ZERO, tentativeExclusion.minus(priorExclusions));

    return {
      childName: childLabel,
      isSpecialNeeds: child.isSpecialNeeds,
      tentativeCredit,
      priorYearCreditsClaimed: priorCredits,
      netCredit,
      tentativeExclusion,
      priorYearExclusionsClaimed: priorExclusions,
      netExclusion,
    };
  });

  // ── Line 3: Total tentative credit ─────────────────────
  const totalTentativeCredit = sum(...childResults.map((c) => c.tentativeCredit));
  audit.record("Form 8839", "3", "Total tentative credit", totalTentativeCredit, `Sum of per-child tentative credits (${children.length} children)`);

  // ── Line 4: Prior year credits ─────────────────────────
  const totalPriorYearCredits = sum(...childResults.map((c) => c.priorYearCreditsClaimed));
  audit.record("Form 8839", "4", "Prior year credits claimed", totalPriorYearCredits, "Total credits already claimed in prior years");

  // ── Line 5: Net tentative credit ───────────────────────
  const netTentativeCredit = Decimal.max(ZERO, totalTentativeCredit.minus(totalPriorYearCredits));
  audit.record("Form 8839", "5", "Net tentative credit", netTentativeCredit, `max(0, ${totalTentativeCredit} - ${totalPriorYearCredits})`);

  // ── Line 6: Modified AGI ───────────────────────────────
  const magi = sum(agi, foreignEarnedIncomeExclusion, foreignHousingExclusion);
  audit.record("Form 8839", "6", "Modified AGI", magi,
    `AGI ${agi} + foreign exclusions ${foreignEarnedIncomeExclusion.plus(foreignHousingExclusion)}`);

  // ── Line 7: Phase-out threshold ────────────────────────
  const threshold = constants.phaseOutThreshold;
  audit.record("Form 8839", "7", "Phase-out threshold", threshold, `$${threshold}`);

  // ── Line 8: Excess MAGI ────────────────────────────────
  const excessMagi = Decimal.max(ZERO, magi.minus(threshold));
  audit.record("Form 8839", "8", "Excess MAGI", excessMagi, `max(0, ${magi} - ${threshold})`);

  // ── Line 9: Phase-out fraction ─────────────────────────
  const phaseOutRange = constants.phaseOutRange;
  const phaseOutFraction = Decimal.min(ONE, excessMagi.div(phaseOutRange))
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  audit.record("Form 8839", "9", "Phase-out fraction", phaseOutFraction,
    `min(1, ${excessMagi} / ${phaseOutRange}), rounded to 3 decimal places`);

  // ── Line 10: Phase-out reduction ───────────────────────
  const phaseOutReduction = roundDollar(netTentativeCredit.times(phaseOutFraction));
  audit.record("Form 8839", "10", "Phase-out reduction", phaseOutReduction,
    `${netTentativeCredit} × ${phaseOutFraction}`);

  // ── Line 11: Adoption credit ───────────────────────────
  const adoptionCredit = roundDollar(Decimal.max(ZERO, netTentativeCredit.minus(phaseOutReduction)));
  audit.record("Form 8839", "11", "Adoption credit", adoptionCredit,
    `${netTentativeCredit} - ${phaseOutReduction} → Schedule 3 Line 6c`);

  // ── Part III: Employer-Provided Adoption Benefits ──────
  const totalEmployerBenefits = sum(
    ...children.map((c) => d(c.employerBenefits))
  );
  const totalTentativeExclusion = sum(...childResults.map((c) => c.tentativeExclusion));
  const totalPriorYearExclusions = sum(...childResults.map((c) => c.priorYearExclusionsClaimed));
  const netTentativeExclusion = Decimal.max(ZERO, totalTentativeExclusion.minus(totalPriorYearExclusions));

  // Same phase-out applies to employer exclusion
  const exclusionPhaseOutReduction = roundDollar(netTentativeExclusion.times(phaseOutFraction));
  const allowableExclusion = roundDollar(Decimal.max(ZERO, netTentativeExclusion.minus(exclusionPhaseOutReduction)));
  const taxableEmployerBenefits = roundDollar(Decimal.max(ZERO, totalEmployerBenefits.minus(allowableExclusion)));

  if (totalEmployerBenefits.greaterThan(ZERO)) {
    audit.record("Form 8839", "Part III", "Total employer-provided benefits", totalEmployerBenefits, "W-2 Box 12 code T");
    audit.record("Form 8839", "Part III", "Allowable exclusion", allowableExclusion,
      `Net tentative exclusion ${netTentativeExclusion} × (1 - ${phaseOutFraction}) phase-out`);
    audit.record("Form 8839", "Part III", "Taxable employer benefits", taxableEmployerBenefits,
      `${totalEmployerBenefits} - ${allowableExclusion} → included in income`);
  }

  return {
    eligible: true,
    maxCreditPerChild: maxCredit,
    childResults,
    totalTentativeCredit,
    totalPriorYearCredits,
    netTentativeCredit,
    magi,
    phaseOutThreshold: threshold,
    excessMagi,
    phaseOutFraction,
    phaseOutReduction,
    adoptionCredit,
    totalEmployerBenefits,
    totalTentativeExclusion,
    totalPriorYearExclusions,
    netTentativeExclusion,
    exclusionPhaseOutReduction,
    allowableExclusion,
    taxableEmployerBenefits,
    lines: audit.getLines(),
  };
}
