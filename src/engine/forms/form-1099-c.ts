/**
 * Form 1099-C — Cancellation of Debt income aggregation and exclusion.
 * Spec: spec/federal/form-1099-c.yaml
 *
 * Aggregates cancelled debt from all Form 1099-C documents, applies
 * IRC §108 exclusions (bankruptcy, insolvency, qualified principal
 * residence, qualified farm, qualified real property business), and
 * produces the taxable cancellation of debt amount for Schedule 1 Line 8c.
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { Form1099C, CodExclusion } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);

export interface Form1099CResult {
  /** Total cancelled debt from all 1099-C forms (sum of Box 2) */
  totalCancelledDebt: Decimal;
  /** Interest included in Box 2 amounts (sum of Box 3) */
  totalInterestIncluded: Decimal;
  /** Amount excluded under IRC §108(a)(1)(A) — bankruptcy */
  bankruptcyExclusion: Decimal;
  /** Amount excluded under IRC §108(a)(1)(B) — insolvency */
  insolvencyExclusion: Decimal;
  /** Amount excluded under IRC §108(a)(1)(E) — qualified principal residence */
  qualifiedPrincipalResidenceExclusion: Decimal;
  /** Amount excluded under IRC §108(a)(1)(C) — qualified farm */
  qualifiedFarmExclusion: Decimal;
  /** Amount excluded under IRC §108(a)(1)(D) — qualified real property business */
  qualifiedRealPropertyBusinessExclusion: Decimal;
  /** Total exclusions */
  totalExclusions: Decimal;
  /** Taxable COD income → Schedule 1 Line 8c */
  taxableCodIncome: Decimal;

  lines: CalculatedLine[];
}

export function calculateForm1099C(
  forms: Form1099C[],
  exclusion: CodExclusion | undefined,
  filingStatus: FilingStatus,
  constants: {
    qualifiedPrincipalResidenceExclusion: {
      maxExclusion: Decimal;
      maxExclusionMFS: Decimal;
    };
  }
): Form1099CResult {
  const audit = new AuditTrail();

  // ── Aggregate all 1099-C amounts ────────────────────────
  const totalCancelledDebt = sum(...forms.map((f) => d(f.amountDischarged)));
  const totalInterestIncluded = sum(...forms.map((f) => d(f.interestIncluded)));

  audit.record(
    "Form 1099-C",
    "total",
    "Total cancelled debt",
    totalCancelledDebt,
    forms.length > 1
      ? `Sum of ${forms.length} Form 1099-C Box 2 amounts`
      : forms.length === 1
        ? "Form 1099-C Box 2 amount"
        : "No Form 1099-C documents",
    {
      "Number of 1099-C forms": new Decimal(forms.length),
      "Interest included (Box 3)": totalInterestIncluded,
    }
  );

  if (totalCancelledDebt.isZero()) {
    return {
      totalCancelledDebt: ZERO,
      totalInterestIncluded,
      bankruptcyExclusion: ZERO,
      insolvencyExclusion: ZERO,
      qualifiedPrincipalResidenceExclusion: ZERO,
      qualifiedFarmExclusion: ZERO,
      qualifiedRealPropertyBusinessExclusion: ZERO,
      totalExclusions: ZERO,
      taxableCodIncome: ZERO,
      lines: audit.getLines(),
    };
  }

  let remaining = totalCancelledDebt;

  // ── Bankruptcy exclusion — IRC §108(a)(1)(A) ────────────
  // Bankruptcy takes priority; if applicable, the full amount is excluded.
  let bankruptcyExclusion = ZERO;
  if (exclusion?.bankruptcy) {
    bankruptcyExclusion = remaining;
    remaining = ZERO;
    audit.record(
      "Form 1099-C",
      "982-1a",
      "Bankruptcy exclusion (IRC §108(a)(1)(A))",
      bankruptcyExclusion,
      "Full COD amount excluded — debt discharged in title 11 bankruptcy case"
    );
  }

  // ── Insolvency exclusion — IRC §108(a)(1)(B) ───────────
  let insolvencyExclusion = ZERO;
  if (remaining.greaterThan(ZERO) && exclusion?.insolvency) {
    const liabilities = d(exclusion.insolvency.totalLiabilities);
    const assets = d(exclusion.insolvency.totalAssets);
    const insolvencyAmount = Decimal.max(ZERO, liabilities.minus(assets));
    insolvencyExclusion = Decimal.min(remaining, insolvencyAmount);
    remaining = remaining.minus(insolvencyExclusion);

    audit.record(
      "Form 1099-C",
      "982-1b",
      "Insolvency exclusion (IRC §108(a)(1)(B))",
      insolvencyExclusion,
      `min(remaining COD $${remaining.plus(insolvencyExclusion)}, insolvency amount $${insolvencyAmount})`,
      {
        "Total liabilities": liabilities,
        "Total assets (FMV)": assets,
        "Insolvency amount": insolvencyAmount,
      }
    );
  }

  // ── Qualified principal residence exclusion — IRC §108(a)(1)(E) ─
  let qualifiedPrincipalResidenceExclusion = ZERO;
  if (remaining.greaterThan(ZERO) && exclusion?.qualifiedPrincipalResidence) {
    const dischargedForResidence = d(
      exclusion.qualifiedPrincipalResidence.dischargedAmount
    );
    const cap =
      filingStatus === "married_filing_separately"
        ? constants.qualifiedPrincipalResidenceExclusion.maxExclusionMFS
        : constants.qualifiedPrincipalResidenceExclusion.maxExclusion;
    const cappedResidenceExclusion = Decimal.min(dischargedForResidence, cap);
    qualifiedPrincipalResidenceExclusion = Decimal.min(
      remaining,
      cappedResidenceExclusion
    );
    remaining = remaining.minus(qualifiedPrincipalResidenceExclusion);

    audit.record(
      "Form 1099-C",
      "982-1e",
      "Qualified principal residence indebtedness exclusion (IRC §108(a)(1)(E))",
      qualifiedPrincipalResidenceExclusion,
      `min(remaining COD, min(qualified residence discharged $${dischargedForResidence}, cap $${cap}))`,
      {
        "Discharged amount for residence": dischargedForResidence,
        "Maximum exclusion cap": cap,
        "Filing status": filingStatus,
      }
    );
  }

  // ── Qualified farm exclusion — IRC §108(a)(1)(C) ────────
  let qualifiedFarmExclusion = ZERO;
  if (remaining.greaterThan(ZERO) && exclusion?.qualifiedFarmExclusion) {
    qualifiedFarmExclusion = Decimal.min(
      remaining,
      d(exclusion.qualifiedFarmExclusion)
    );
    remaining = remaining.minus(qualifiedFarmExclusion);

    audit.record(
      "Form 1099-C",
      "982-1c",
      "Qualified farm indebtedness exclusion (IRC §108(a)(1)(C))",
      qualifiedFarmExclusion,
      "User-provided qualified farm exclusion amount"
    );
  }

  // ── Qualified real property business exclusion — IRC §108(a)(1)(D) ─
  let qualifiedRealPropertyBusinessExclusion = ZERO;
  if (
    remaining.greaterThan(ZERO) &&
    exclusion?.qualifiedRealPropertyBusinessExclusion
  ) {
    qualifiedRealPropertyBusinessExclusion = Decimal.min(
      remaining,
      d(exclusion.qualifiedRealPropertyBusinessExclusion)
    );

    audit.record(
      "Form 1099-C",
      "982-1d",
      "Qualified real property business indebtedness exclusion (IRC §108(a)(1)(D))",
      qualifiedRealPropertyBusinessExclusion,
      "User-provided qualified real property business exclusion amount"
    );
  }

  // ── Totals ──────────────────────────────────────────────
  const totalExclusions = sum(
    bankruptcyExclusion,
    insolvencyExclusion,
    qualifiedPrincipalResidenceExclusion,
    qualifiedFarmExclusion,
    qualifiedRealPropertyBusinessExclusion
  );
  const taxableCodIncome = Decimal.max(ZERO, totalCancelledDebt.minus(totalExclusions));

  audit.record(
    "Form 1099-C",
    "taxable",
    "Taxable cancellation of debt income → Schedule 1 Line 8c",
    taxableCodIncome,
    `Total COD $${totalCancelledDebt} - exclusions $${totalExclusions}`,
    {
      "Total cancelled debt": totalCancelledDebt,
      "Total exclusions": totalExclusions,
      "Bankruptcy exclusion": bankruptcyExclusion,
      "Insolvency exclusion": insolvencyExclusion,
      "Qualified principal residence exclusion": qualifiedPrincipalResidenceExclusion,
      "Qualified farm exclusion": qualifiedFarmExclusion,
      "Qualified real property business exclusion": qualifiedRealPropertyBusinessExclusion,
    }
  );

  return {
    totalCancelledDebt,
    totalInterestIncluded,
    bankruptcyExclusion,
    insolvencyExclusion,
    qualifiedPrincipalResidenceExclusion,
    qualifiedFarmExclusion,
    qualifiedRealPropertyBusinessExclusion,
    totalExclusions,
    taxableCodIncome,
    lines: audit.getLines(),
  };
}
