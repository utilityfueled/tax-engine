/**
 * Form 982 — Reduction of Tax Attributes Due to Discharge of Indebtedness.
 * Spec: spec/federal/form-982.yaml
 *
 * When a taxpayer excludes cancellation of debt income under IRC §108,
 * Form 982 Part II requires reducing tax attributes by the excluded amount
 * in the statutory order defined by IRC §108(b)(2).
 *
 * Special rules:
 *  - Qualified principal residence (§108(h)(1)): reduce only residence basis.
 *  - Qualified real property business (§108(c)(1)(A)): reduce only depreciable
 *    real property basis.
 *  - Qualified farm (§108(g)(2)): reduce depreciable property basis first,
 *    then general order.
 *  - §108(b)(5) election: reduce depreciable property basis first for
 *    bankruptcy/insolvency exclusions.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);
const ONE_THIRD = new Decimal(1).dividedBy(3);

/** Tax attributes available for reduction. */
export interface Form982Attributes {
  nolCarryforward: Decimal;
  generalBusinessCreditCarryforward: Decimal;
  minimumTaxCreditCarryforward: Decimal;
  capitalLossCarryforward: Decimal;
  aggregateBasisOfProperty: Decimal;
  passiveActivityLossCarryforward: Decimal;
  foreignTaxCreditCarryforward: Decimal;
  basisOfDepreciableProperty: Decimal;
  basisOfPrincipalResidence: Decimal;
  basisOfDepreciableRealProperty: Decimal;
}

export interface Form982Input {
  /** Excluded amount under IRC §108(a)(1)(A) — bankruptcy */
  bankruptcyExclusion: Decimal;
  /** Excluded amount under IRC §108(a)(1)(B) — insolvency */
  insolvencyExclusion: Decimal;
  /** Excluded amount under IRC §108(a)(1)(E) — qualified principal residence */
  qualifiedPrincipalResidenceExclusion: Decimal;
  /** Excluded amount under IRC §108(a)(1)(C) — qualified farm */
  qualifiedFarmExclusion: Decimal;
  /** Excluded amount under IRC §108(a)(1)(D) — qualified real property business */
  qualifiedRealPropertyBusinessExclusion: Decimal;
  /** §108(b)(5) election: reduce depreciable property basis first */
  electBasisReductionFirst: boolean;
  /** Current tax attributes available for reduction */
  attributes: Form982Attributes;
}

export interface Form982Result {
  /** Attributes after all reductions applied */
  reducedAttributes: Form982Attributes;
  /** Total amount of attribute reductions applied */
  totalReduction: Decimal;
  /** Excluded amount that could not be reduced (attributes exhausted) */
  unreducedExclusion: Decimal;
  lines: CalculatedLine[];
}

/**
 * Reduce a dollar-for-dollar attribute. Returns the reduction amount and
 * the new remaining excluded income.
 */
function reduceDollarForDollar(
  available: Decimal,
  remaining: Decimal
): { reduced: Decimal; newRemaining: Decimal; newAttribute: Decimal } {
  const reduced = Decimal.min(available, remaining);
  return {
    reduced,
    newRemaining: remaining.minus(reduced),
    newAttribute: available.minus(reduced),
  };
}

/**
 * Reduce a credit attribute at the one-third-per-dollar rate (§108(b)(3)(B)).
 * Each $1 of excluded income reduces the credit by $0.3333.
 * Returns the credit reduction and the excluded income consumed.
 */
function reduceCreditOneThird(
  creditAvailable: Decimal,
  remaining: Decimal
): { creditReduced: Decimal; incomeConsumed: Decimal; newCredit: Decimal; newRemaining: Decimal } {
  if (remaining.isZero() || creditAvailable.isZero()) {
    return {
      creditReduced: ZERO,
      incomeConsumed: ZERO,
      newCredit: creditAvailable,
      newRemaining: remaining,
    };
  }
  const maxCreditReduction = remaining.times(ONE_THIRD).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const creditReduced = Decimal.min(creditAvailable, maxCreditReduction);
  // Income consumed = credit reduced / (1/3) = credit reduced * 3
  const incomeConsumed = creditReduced.equals(creditAvailable)
    ? Decimal.min(remaining, creditAvailable.dividedBy(ONE_THIRD).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
    : remaining;
  return {
    creditReduced,
    incomeConsumed,
    newCredit: creditAvailable.minus(creditReduced),
    newRemaining: remaining.minus(incomeConsumed),
  };
}

/**
 * Apply the general reduction order (IRC §108(b)(2)) to attributes.
 * Mutates `attrs` in place and returns the total reduction applied.
 */
function applyGeneralReductionOrder(
  attrs: Form982Attributes,
  excludedAmount: Decimal,
  audit: AuditTrail
): { totalReduced: Decimal; unreduced: Decimal } {
  let remaining = excludedAmount;
  let totalReduced = ZERO;

  if (remaining.isZero()) return { totalReduced, unreduced: ZERO };

  // 1. NOL (§108(b)(2)(A)) — dollar-for-dollar
  {
    const r = reduceDollarForDollar(attrs.nolCarryforward, remaining);
    attrs.nolCarryforward = r.newAttribute;
    remaining = r.newRemaining;
    totalReduced = totalReduced.plus(r.reduced);
    audit.record("Form 982", "part2-line4", "NOL carryforward reduction",
      r.reduced, `Reduce NOL by $${r.reduced} (remaining: $${attrs.nolCarryforward})`);
  }

  // 2. General business credit (§108(b)(2)(B)) — 1/3 per dollar
  {
    const r = reduceCreditOneThird(attrs.generalBusinessCreditCarryforward, remaining);
    attrs.generalBusinessCreditCarryforward = r.newCredit;
    remaining = r.newRemaining;
    totalReduced = totalReduced.plus(r.creditReduced);
    audit.record("Form 982", "part2-line5", "General business credit carryover reduction",
      r.creditReduced, `Reduce GBC by $${r.creditReduced} at 1/3 rate (remaining: $${attrs.generalBusinessCreditCarryforward})`);
  }

  // 3. Minimum tax credit (§108(b)(2)(C)) — 1/3 per dollar
  {
    const r = reduceCreditOneThird(attrs.minimumTaxCreditCarryforward, remaining);
    attrs.minimumTaxCreditCarryforward = r.newCredit;
    remaining = r.newRemaining;
    totalReduced = totalReduced.plus(r.creditReduced);
    audit.record("Form 982", "part2-line6", "Minimum tax credit reduction",
      r.creditReduced, `Reduce MTC by $${r.creditReduced} at 1/3 rate (remaining: $${attrs.minimumTaxCreditCarryforward})`);
  }

  // 4. Capital loss (§108(b)(2)(D)) — dollar-for-dollar
  {
    const r = reduceDollarForDollar(attrs.capitalLossCarryforward, remaining);
    attrs.capitalLossCarryforward = r.newAttribute;
    remaining = r.newRemaining;
    totalReduced = totalReduced.plus(r.reduced);
    audit.record("Form 982", "part2-line7", "Capital loss carryforward reduction",
      r.reduced, `Reduce capital loss by $${r.reduced} (remaining: $${attrs.capitalLossCarryforward})`);
  }

  // 5. Basis of property (§108(b)(2)(E), §1017) — dollar-for-dollar
  {
    const r = reduceDollarForDollar(attrs.aggregateBasisOfProperty, remaining);
    attrs.aggregateBasisOfProperty = r.newAttribute;
    remaining = r.newRemaining;
    totalReduced = totalReduced.plus(r.reduced);
    audit.record("Form 982", "part2-line8", "Basis of property reduction (§1017)",
      r.reduced, `Reduce aggregate basis by $${r.reduced} (remaining: $${attrs.aggregateBasisOfProperty})`);
  }

  // 6. Passive activity loss and credit carryovers (§108(b)(2)(F)) — dollar-for-dollar
  {
    const r = reduceDollarForDollar(attrs.passiveActivityLossCarryforward, remaining);
    attrs.passiveActivityLossCarryforward = r.newAttribute;
    remaining = r.newRemaining;
    totalReduced = totalReduced.plus(r.reduced);
    audit.record("Form 982", "part2-line9", "Passive activity loss carryover reduction",
      r.reduced, `Reduce passive losses by $${r.reduced} (remaining: $${attrs.passiveActivityLossCarryforward})`);
  }

  // 7. Foreign tax credit carryovers (§108(b)(2)(G)) — 1/3 per dollar
  {
    const r = reduceCreditOneThird(attrs.foreignTaxCreditCarryforward, remaining);
    attrs.foreignTaxCreditCarryforward = r.newCredit;
    remaining = r.newRemaining;
    totalReduced = totalReduced.plus(r.creditReduced);
    audit.record("Form 982", "part2-line10", "Foreign tax credit carryover reduction",
      r.creditReduced, `Reduce FTC by $${r.creditReduced} at 1/3 rate (remaining: $${attrs.foreignTaxCreditCarryforward})`);
  }

  return { totalReduced, unreduced: remaining };
}

export function calculateForm982(input: Form982Input): Form982Result {
  const audit = new AuditTrail();
  const attrs: Form982Attributes = { ...input.attributes };
  let totalReduction = ZERO;
  let totalUnreduced = ZERO;

  // ── Qualified principal residence (§108(h)(1)) ─────────────────
  // Reduces ONLY the basis of the principal residence — no spillover.
  if (input.qualifiedPrincipalResidenceExclusion.greaterThan(ZERO)) {
    const r = reduceDollarForDollar(
      attrs.basisOfPrincipalResidence,
      input.qualifiedPrincipalResidenceExclusion
    );
    attrs.basisOfPrincipalResidence = r.newAttribute;
    totalReduction = totalReduction.plus(r.reduced);
    totalUnreduced = totalUnreduced.plus(r.newRemaining);
    audit.record("Form 982", "part2-qpr",
      "Qualified principal residence basis reduction (§108(h)(1))",
      r.reduced,
      `Reduce residence basis by $${r.reduced} (remaining basis: $${attrs.basisOfPrincipalResidence})`,
      { "Excluded amount": input.qualifiedPrincipalResidenceExclusion }
    );
  }

  // ── Qualified real property business (§108(c)(1)(A)) ───────────
  // Reduces ONLY the basis of depreciable real property — no spillover.
  if (input.qualifiedRealPropertyBusinessExclusion.greaterThan(ZERO)) {
    const r = reduceDollarForDollar(
      attrs.basisOfDepreciableRealProperty,
      input.qualifiedRealPropertyBusinessExclusion
    );
    attrs.basisOfDepreciableRealProperty = r.newAttribute;
    totalReduction = totalReduction.plus(r.reduced);
    totalUnreduced = totalUnreduced.plus(r.newRemaining);
    audit.record("Form 982", "part2-qrpb",
      "Qualified real property business basis reduction (§108(c)(1)(A))",
      r.reduced,
      `Reduce depreciable real property basis by $${r.reduced} (remaining: $${attrs.basisOfDepreciableRealProperty})`,
      { "Excluded amount": input.qualifiedRealPropertyBusinessExclusion }
    );
  }

  // ── Qualified farm (§108(g)(2)) ────────────────────────────────
  // Reduce depreciable property basis first, then general order for remainder.
  if (input.qualifiedFarmExclusion.greaterThan(ZERO)) {
    let farmRemaining = input.qualifiedFarmExclusion;
    // First: depreciable property basis
    const basisR = reduceDollarForDollar(attrs.basisOfDepreciableProperty, farmRemaining);
    attrs.basisOfDepreciableProperty = basisR.newAttribute;
    totalReduction = totalReduction.plus(basisR.reduced);
    farmRemaining = basisR.newRemaining;
    audit.record("Form 982", "part2-farm-basis",
      "Qualified farm basis reduction (§108(g)(2))",
      basisR.reduced,
      `Reduce depreciable property basis by $${basisR.reduced} (remaining: $${attrs.basisOfDepreciableProperty})`
    );
    // Then: general order for any remainder
    if (farmRemaining.greaterThan(ZERO)) {
      const gen = applyGeneralReductionOrder(attrs, farmRemaining, audit);
      totalReduction = totalReduction.plus(gen.totalReduced);
      totalUnreduced = totalUnreduced.plus(gen.unreduced);
    }
  }

  // ── Bankruptcy + insolvency (general reduction) ────────────────
  const generalExcluded = input.bankruptcyExclusion.plus(input.insolvencyExclusion);
  if (generalExcluded.greaterThan(ZERO)) {
    let genRemaining = generalExcluded;

    // §108(b)(5) election: reduce depreciable property basis first
    if (input.electBasisReductionFirst) {
      const basisR = reduceDollarForDollar(attrs.basisOfDepreciableProperty, genRemaining);
      attrs.basisOfDepreciableProperty = basisR.newAttribute;
      totalReduction = totalReduction.plus(basisR.reduced);
      genRemaining = basisR.newRemaining;
      audit.record("Form 982", "part2-108b5",
        "§108(b)(5) election — depreciable property basis reduced first",
        basisR.reduced,
        `Reduce depreciable basis by $${basisR.reduced} (remaining: $${attrs.basisOfDepreciableProperty})`
      );
    }

    // General order for remainder
    if (genRemaining.greaterThan(ZERO)) {
      const gen = applyGeneralReductionOrder(attrs, genRemaining, audit);
      totalReduction = totalReduction.plus(gen.totalReduced);
      totalUnreduced = totalUnreduced.plus(gen.unreduced);
    }
  }

  return {
    reducedAttributes: attrs,
    totalReduction,
    unreducedExclusion: totalUnreduced,
    lines: audit.getLines(),
  };
}
