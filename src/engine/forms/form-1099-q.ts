/**
 * Form 1099-Q — Payments From Qualified Education Programs
 * Spec: spec/federal/form-1099-q.yaml
 *
 * Computes the taxable earnings from 529 plan and Coverdell ESA
 * distributions that exceed the beneficiary's adjusted qualified
 * education expenses (AQEE), plus the 10% additional tax
 * (Form 5329 Part II) with penalty exceptions.
 *
 * IRC §529(c)(3)(A): Distributions from QTPs are excluded from
 * gross income to the extent they do not exceed adjusted QEE.
 * IRC §530(d)(2): Same treatment for Coverdell ESA distributions.
 *
 * Pub 970 Chapters 7-8 provide the worksheets.
 */

import Decimal from "decimal.js";
import type { Form1099Q, QualifiedEducationExpenseSummary } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);
const PENALTY_RATE = new Decimal("0.10");

export interface Form1099QResult {
  /** Total gross distributions (sum of Box 1) */
  grossDistribution: Decimal;
  /** Total earnings portion (sum of Box 2) */
  totalEarnings: Decimal;
  /** Total basis/contributions (sum of Box 3) */
  totalBasis: Decimal;
  /** Distributions excluded as trustee-to-trustee transfers */
  trusteeToTrusteeTransfers: Decimal;
  /** Taxable gross distributions (gross minus trustee-to-trustee) */
  taxableGrossDistribution: Decimal;
  /** Taxable earnings from taxable distributions */
  taxableDistributionEarnings: Decimal;
  /** Adjusted qualified education expenses */
  adjustedQEE: Decimal;
  /** Taxable earnings (income to report) */
  taxableEarnings: Decimal;
  /** Tax-free earnings allocable to QEE */
  taxFreeEarnings: Decimal;
  /** Penalty amount before exceptions */
  grossPenalty: Decimal;
  /** Total penalty exception amount */
  penaltyExceptionAmount: Decimal;
  /** Net 10% additional tax after exceptions */
  netPenalty: Decimal;
  /** Audit trail lines */
  lines: CalculatedLine[];
}

export function calculateForm1099Q(
  forms: Form1099Q[],
  qeeSummary?: QualifiedEducationExpenseSummary
): Form1099QResult {
  const audit = new AuditTrail();

  // ── Aggregate all 1099-Q forms ───────────────────────────────
  const trusteeToTrusteeTransfers = sum(
    ...forms
      .filter((f) => f.isTrusteeToTrustee)
      .map((f) => zeroFloor(d(f.grossDistribution)))
  );

  const taxableForms = forms.filter((f) => !f.isTrusteeToTrustee);
  const grossDistribution = sum(...forms.map((f) => zeroFloor(d(f.grossDistribution))));
  const taxableGrossDistribution = sum(...taxableForms.map((f) => zeroFloor(d(f.grossDistribution))));
  const totalEarnings = sum(...forms.map((f) => d(f.earnings)));
  const taxableDistributionEarnings = sum(...taxableForms.map((f) => d(f.earnings)));
  const totalBasis = sum(...forms.map((f) => zeroFloor(d(f.basis))));

  audit.record("Form 1099-Q", "gross-distribution",
    "Total gross distributions from all Form 1099-Q documents",
    grossDistribution, `Sum of ${forms.length} Form 1099-Q Box 1 amount(s)`, {
      "Number of 1099-Q forms": new Decimal(forms.length),
      "Trustee-to-trustee transfers excluded": trusteeToTrusteeTransfers,
      "Taxable gross distributions": taxableGrossDistribution,
    });

  audit.record("Form 1099-Q", "total-earnings",
    "Total earnings portion of distributions",
    totalEarnings, "Sum of Box 2 from each Form 1099-Q", {
      "Taxable distribution earnings": taxableDistributionEarnings,
    });

  audit.record("Form 1099-Q", "total-basis",
    "Total basis (contributions) portion of distributions",
    totalBasis, "Sum of Box 3 from each Form 1099-Q");

  // ── Adjusted Qualified Education Expenses ─────────────────────
  const rawQEE = zeroFloor(d(qeeSummary?.totalQualifiedExpenses));
  const taxFreeAssistance = zeroFloor(d(qeeSummary?.taxFreeEducationalAssistance));
  const amountsForCredits = zeroFloor(d(qeeSummary?.amountsUsedForEducationCredits));
  const adjustedQEE = Decimal.max(ZERO, rawQEE.minus(taxFreeAssistance).minus(amountsForCredits));

  audit.record("Form 1099-Q", "adjusted-qee",
    "Adjusted Qualified Education Expenses",
    adjustedQEE,
    "max(0, Total QEE - tax-free educational assistance - amounts used for AOTC/LLC)", {
      "Total qualified education expenses": rawQEE,
      "Tax-free educational assistance": taxFreeAssistance,
      "Amounts used for education credits": amountsForCredits,
    });

  // ── Taxable Earnings ──────────────────────────────────────────
  // Per Pub 970: if taxable distributions ≤ adjusted QEE, all earnings are tax-free.
  // Otherwise: taxable earnings = earnings × (excess / gross distribution)
  let taxableEarnings: Decimal;
  let taxFreeEarnings: Decimal;

  if (taxableGrossDistribution.isZero()) {
    // No taxable distributions at all
    taxableEarnings = ZERO;
    taxFreeEarnings = taxableDistributionEarnings;
  } else if (taxableGrossDistribution.lessThanOrEqualTo(adjustedQEE)) {
    // All distributions covered by QEE
    taxableEarnings = ZERO;
    taxFreeEarnings = taxableDistributionEarnings;
  } else if (taxableDistributionEarnings.lessThanOrEqualTo(ZERO)) {
    // No earnings (or negative earnings/loss) — nothing taxable
    taxableEarnings = ZERO;
    taxFreeEarnings = taxableDistributionEarnings;
  } else {
    // Excess distributions: prorate earnings
    const excess = taxableGrossDistribution.minus(adjustedQEE);
    const earningsRatio = excess.dividedBy(taxableGrossDistribution);
    taxableEarnings = taxableDistributionEarnings
      .times(earningsRatio)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    taxFreeEarnings = taxableDistributionEarnings.minus(taxableEarnings);
  }

  audit.record("Form 1099-Q", "taxable-earnings",
    "Taxable earnings from distributions exceeding adjusted QEE",
    taxableEarnings,
    taxableGrossDistribution.isZero()
      ? "No taxable distributions"
      : taxableGrossDistribution.lessThanOrEqualTo(adjustedQEE)
        ? "All distributions covered by adjusted qualified education expenses"
        : taxableDistributionEarnings.lessThanOrEqualTo(ZERO)
          ? "No positive earnings to tax"
          : "earnings × (excess distribution / gross distribution)", {
      "Taxable gross distribution": taxableGrossDistribution,
      "Adjusted QEE": adjustedQEE,
      "Excess over QEE": Decimal.max(ZERO, taxableGrossDistribution.minus(adjustedQEE)),
      "Taxable distribution earnings": taxableDistributionEarnings,
    });

  audit.record("Form 1099-Q", "tax-free-earnings",
    "Tax-free earnings allocable to qualified education expenses",
    taxFreeEarnings, "Total earnings - taxable earnings");

  // ── 10% Additional Tax (Form 5329 Part II) ─────────────────────
  const grossPenalty = taxableEarnings.times(PENALTY_RATE)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Penalty exceptions
  const deathOrDisability = qeeSummary?.penaltyExceptionDeath || qeeSummary?.penaltyExceptionDisability;
  const scholarshipException = zeroFloor(d(qeeSummary?.penaltyExceptionScholarshipAmount));
  const militaryException = zeroFloor(d(qeeSummary?.penaltyExceptionMilitaryAcademyAmount));

  let penaltyExceptionAmount: Decimal;
  if (deathOrDisability) {
    // Death or disability exempts ALL taxable earnings from penalty
    penaltyExceptionAmount = taxableEarnings;
  } else {
    // Scholarship and military exceptions reduce the amount subject to penalty
    // but cannot exceed taxable earnings
    penaltyExceptionAmount = Decimal.min(
      scholarshipException.plus(militaryException),
      taxableEarnings
    );
  }

  const earningsSubjectToPenalty = Decimal.max(ZERO, taxableEarnings.minus(penaltyExceptionAmount));
  const netPenalty = earningsSubjectToPenalty.times(PENALTY_RATE)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  audit.record("Form 1099-Q", "penalty-amount",
    "10% additional tax on taxable earnings (before exceptions)",
    grossPenalty, "taxable earnings × 10%", {
      "Taxable earnings": taxableEarnings,
    });

  audit.record("Form 1099-Q", "penalty-exception-amount",
    "Earnings exempt from the 10% additional tax due to exceptions",
    penaltyExceptionAmount,
    deathOrDisability
      ? "Death or disability — all taxable earnings exempt from penalty"
      : "Scholarship + military academy exceptions (capped at taxable earnings)", {
      "Death or disability": deathOrDisability ? "Yes" : "No",
      "Scholarship exception": scholarshipException,
      "Military academy exception": militaryException,
    });

  audit.record("Form 1099-Q", "net-penalty",
    "Net 10% additional tax after exceptions",
    netPenalty,
    "max(0, taxable earnings - penalty exceptions) × 10%", {
      "Earnings subject to penalty": earningsSubjectToPenalty,
    });

  return {
    grossDistribution,
    totalEarnings,
    totalBasis,
    trusteeToTrusteeTransfers,
    taxableGrossDistribution,
    taxableDistributionEarnings,
    adjustedQEE,
    taxableEarnings,
    taxFreeEarnings,
    grossPenalty,
    penaltyExceptionAmount,
    netPenalty,
    lines: audit.getLines(),
  };
}
