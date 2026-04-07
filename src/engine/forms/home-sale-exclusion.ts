/**
 * IRC §121 — Exclusion of Gain from Sale of Principal Residence
 * Spec: spec/federal/home-sale-exclusion.yaml
 *
 * Computes the excludable gain (up to $250K/$500K) when a taxpayer
 * sells a principal residence meeting the ownership, use, and
 * frequency tests. Depreciation after May 6, 1997 is not excludable
 * and is taxed as unrecaptured Section 1250 gain.
 *
 * Loss on personal-use property is not deductible.
 */

import Decimal from "decimal.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import type { HomeSaleInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);
const TWO_YEARS_IN_DAYS = 730;

export interface HomeSaleResult {
  /** Line 1: Amount realized (sale price − selling expenses) */
  amountRealized: Decimal;
  /** Line 2: Adjusted basis */
  adjustedBasis: Decimal;
  /** Line 3: Gain or loss (amount realized − adjusted basis) */
  gainOrLoss: Decimal;
  /** Whether the sale resulted in a gain (true) or loss/breakeven (false) */
  hasGain: boolean;
  /** Whether the taxpayer meets all three eligibility tests for the full exclusion */
  meetsFullExclusionTests: boolean;
  /** Whether the taxpayer qualifies for a reduced exclusion under IRC §121(c) */
  qualifiesForReducedExclusion: boolean;
  /** Line 4: Maximum exclusion amount */
  maxExclusion: Decimal;
  /** Post-May-1997 depreciation (not excludable — unrecaptured Section 1250 gain) */
  depreciationRecapture: Decimal;
  /** Line 5: Excludable gain (after removing depreciation recapture) */
  excludableGain: Decimal;
  /** Line 6: Taxable gain (reported on Schedule D as long-term capital gain) */
  taxableGain: Decimal;
  /** Whether there is depreciation recapture to report separately */
  hasDepreciationRecapture: boolean;
  lines: CalculatedLine[];
}

export interface HomeSaleParams {
  sale: HomeSaleInput;
  filingStatus: FilingStatus;
  constants: YearConstants["homeSaleExclusion"];
}

export function calculateHomeSaleExclusion(params: HomeSaleParams): HomeSaleResult {
  const { sale, filingStatus, constants } = params;
  const audit = new AuditTrail();

  // ── Line 1: Amount realized ──────────────────────────────
  const salePrice = d(sale.salePrice);
  const sellingExpenses = d(sale.sellingExpenses);
  const amountRealized = roundDollar(salePrice.minus(sellingExpenses));
  audit.record("Home Sale", "1", "Amount realized", amountRealized,
    `Sale price $${salePrice} − selling expenses $${sellingExpenses}`);

  // ── Line 2: Adjusted basis ──────────────────────────────
  const purchasePrice = d(sale.purchasePrice);
  const improvements = d(sale.improvements);
  const depreciation = d(sale.depreciationAfterMay1997);
  const casualtyLoss = d(sale.casualtyLossDeductions);
  const otherAdjustments = d(sale.otherBasisAdjustments);
  const adjustedBasis = roundDollar(
    sum(purchasePrice, improvements, otherAdjustments)
      .minus(depreciation)
      .minus(casualtyLoss)
  );
  audit.record("Home Sale", "2", "Adjusted basis", adjustedBasis,
    `Purchase $${purchasePrice} + improvements $${improvements} + other $${otherAdjustments} − depreciation $${depreciation} − casualty $${casualtyLoss}`);

  // ── Line 3: Gain or loss ────────────────────────────────
  const gainOrLoss = roundDollar(amountRealized.minus(adjustedBasis));
  audit.record("Home Sale", "3", "Gain or loss", gainOrLoss,
    `$${amountRealized} − $${adjustedBasis}`);

  const hasGain = gainOrLoss.greaterThan(ZERO);

  // If loss or breakeven, no exclusion applies and nothing is reported
  if (!hasGain) {
    audit.record("Home Sale", "loss", "No deduction for personal-use property loss", ZERO,
      "IRC §165(c): loss on sale of personal-use property is not deductible");
    return {
      amountRealized,
      adjustedBasis,
      gainOrLoss,
      hasGain: false,
      meetsFullExclusionTests: false,
      qualifiesForReducedExclusion: false,
      maxExclusion: ZERO,
      depreciationRecapture: ZERO,
      excludableGain: ZERO,
      taxableGain: ZERO,
      hasDepreciationRecapture: false,
      lines: audit.getLines(),
    };
  }

  // ── Eligibility tests ───────────────────────────────────
  const daysOwned = sale.daysOwned;
  const daysUsed = sale.daysUsedAsResidence;
  const usedExclusion = sale.usedExclusionInPrior2Years;

  // IRC §121(d)(7): nursing home / incapacity exception
  // When incapable of self-care, days in a licensed care facility while owning count as use
  const facilityDays = sale.incapableOfSelfCare ? (sale.daysInLicensedCareFacilityWhileOwning ?? 0) : 0;
  const effectiveDaysUsed = daysUsed + facilityDays;

  // IRC §121(d)(9): military/Foreign Service/intelligence qualified extended duty suspension
  const extendedDutyDays = sale.qualifiedExtendedDutyDays ?? 0;

  const meetsOwnershipTest = daysOwned >= TWO_YEARS_IN_DAYS;
  const meetsUseTest = effectiveDaysUsed >= TWO_YEARS_IN_DAYS;
  const meetsFrequencyTest = !usedExclusion;

  const meetsFullExclusionTests = meetsOwnershipTest && meetsUseTest && meetsFrequencyTest;

  audit.record("Home Sale", "ownership", "Ownership test", new Decimal(meetsOwnershipTest ? 1 : 0),
    `${daysOwned} days owned ≥ 730 required: ${meetsOwnershipTest ? "PASS" : "FAIL"}`);

  if (facilityDays > 0) {
    audit.record("Home Sale", "use", "Use test (IRC §121(d)(7) incapacity exception)", new Decimal(meetsUseTest ? 1 : 0),
      `${daysUsed} days actual use + ${facilityDays} days in licensed care facility = ${effectiveDaysUsed} effective days ≥ 730 required: ${meetsUseTest ? "PASS" : "FAIL"}`);
  } else {
    audit.record("Home Sale", "use", "Use test", new Decimal(meetsUseTest ? 1 : 0),
      `${daysUsed} days used as residence ≥ 730 required: ${meetsUseTest ? "PASS" : "FAIL"}`);
  }

  if (extendedDutyDays > 0) {
    const extendedLookbackYears = Math.min(15, 5 + Math.round(extendedDutyDays / 365));
    audit.record("Home Sale", "military-suspension", "Qualified extended duty suspension (IRC §121(d)(9))",
      new Decimal(extendedDutyDays),
      `${extendedDutyDays} days of qualified official extended duty — lookback period extended to ~${extendedLookbackYears} years`);
  }

  audit.record("Home Sale", "frequency", "Frequency test", new Decimal(meetsFrequencyTest ? 1 : 0),
    meetsFrequencyTest
      ? "No prior exclusion used within 2 years: PASS"
      : "Exclusion used for another sale in prior 2 years: FAIL");

  // ── Line 4: Maximum exclusion ───────────────────────────
  let maxExclusion: Decimal;
  let qualifiesForReducedExclusion = false;

  if (meetsFullExclusionTests) {
    // Full exclusion
    if (filingStatus === "married_filing_jointly"
        && sale.bothSpousesMeetUseTest
        && sale.atLeastOneSpouseMeetsOwnershipTest) {
      maxExclusion = constants.maxExclusionMFJ;
      audit.record("Home Sale", "4", "Maximum exclusion (MFJ both qualify)", maxExclusion,
        "IRC §121(b)(2): MFJ with both spouses meeting use test and at least one meeting ownership test");
    } else {
      maxExclusion = constants.maxExclusionSingle;
      audit.record("Home Sale", "4", "Maximum exclusion", maxExclusion,
        filingStatus === "married_filing_jointly"
          ? "IRC §121(b)(1): MFJ but only one spouse qualifies — limited to $250,000"
          : `IRC §121(b)(1): ${filingStatus} filer`);
    }
  } else if (sale.qualifiesForReducedExclusion) {
    // Reduced exclusion under IRC §121(c)
    qualifiesForReducedExclusion = true;
    const baseMax = (filingStatus === "married_filing_jointly"
        && sale.bothSpousesMeetUseTest
        && sale.atLeastOneSpouseMeetsOwnershipTest)
      ? constants.maxExclusionMFJ
      : constants.maxExclusionSingle;

    // Prorate based on shorter of days owned or effective days used, divided by 730
    const shorterPeriod = Math.min(daysOwned, effectiveDaysUsed);
    const prorationFraction = new Decimal(shorterPeriod).dividedBy(TWO_YEARS_IN_DAYS);
    maxExclusion = roundDollar(baseMax.times(prorationFraction));

    audit.record("Home Sale", "4", "Maximum exclusion (reduced)", maxExclusion,
      `IRC §121(c): $${baseMax} × (${shorterPeriod} days / 730) = $${maxExclusion}`);
  } else {
    // Does not qualify for any exclusion
    maxExclusion = ZERO;
    audit.record("Home Sale", "4", "Maximum exclusion", maxExclusion,
      "Does not meet ownership/use/frequency tests and does not qualify for reduced exclusion");
  }

  // ── Depreciation recapture ──────────────────────────────
  // Post-May-6-1997 depreciation is not excludable (IRC §121(d)(6))
  // It is taxed as unrecaptured Section 1250 gain at a maximum 25% rate
  const depreciationRecapture = Decimal.min(depreciation, gainOrLoss);
  const hasDepreciationRecapture = depreciationRecapture.greaterThan(ZERO);

  if (hasDepreciationRecapture) {
    audit.record("Home Sale", "depreciation", "Depreciation recapture (unrecaptured §1250 gain)",
      depreciationRecapture,
      `Post-May-6-1997 depreciation $${depreciation} (capped at gain $${gainOrLoss}) — taxed at max 25% rate`);
  }

  // ── Line 5: Excludable gain ─────────────────────────────
  // Gain available for exclusion = total gain minus depreciation recapture
  const gainAvailableForExclusion = gainOrLoss.minus(depreciationRecapture);
  const excludableGain = roundDollar(Decimal.min(gainAvailableForExclusion, maxExclusion));
  audit.record("Home Sale", "5", "Excludable gain", excludableGain,
    `min(gain available $${gainAvailableForExclusion}, max exclusion $${maxExclusion})`);

  // ── Line 6: Taxable gain ────────────────────────────────
  // Taxable = total gain − excludable gain
  // This includes depreciation recapture + any gain exceeding the exclusion
  const taxableGain = roundDollar(Decimal.max(ZERO, gainOrLoss.minus(excludableGain)));
  audit.record("Home Sale", "6", "Taxable gain", taxableGain,
    `$${gainOrLoss} − $${excludableGain} → reported on Schedule D as LTCG`);

  return {
    amountRealized,
    adjustedBasis,
    gainOrLoss,
    hasGain: true,
    meetsFullExclusionTests,
    qualifiesForReducedExclusion,
    maxExclusion,
    depreciationRecapture,
    excludableGain,
    taxableGain,
    hasDepreciationRecapture,
    lines: audit.getLines(),
  };
}

/**
 * Aggregate multiple home sales and compute total taxable gain and depreciation recapture.
 * Multiple home sales in a single year are unusual but possible (e.g., sold one home, then
 * sold a second one — only one can use the exclusion per the frequency test).
 */
export interface HomeSaleAggregateResult {
  sales: HomeSaleResult[];
  totalTaxableGain: Decimal;
  totalDepreciationRecapture: Decimal;
  lines: CalculatedLine[];
}

export function calculateHomeSales(
  sales: HomeSaleInput[],
  filingStatus: FilingStatus,
  constants: YearConstants["homeSaleExclusion"]
): HomeSaleAggregateResult {
  const audit = new AuditTrail();
  const results: HomeSaleResult[] = [];

  for (const sale of sales) {
    const result = calculateHomeSaleExclusion({ sale, filingStatus, constants });
    results.push(result);
    audit.merge(result.lines);
  }

  const totalTaxableGain = results.reduce(
    (acc, r) => acc.plus(r.taxableGain), ZERO
  );
  const totalDepreciationRecapture = results.reduce(
    (acc, r) => acc.plus(r.depreciationRecapture), ZERO
  );

  if (sales.length > 0) {
    audit.record("Home Sale", "total", "Total taxable gain from home sales", totalTaxableGain,
      `${sales.length} sale(s)`);
  }

  return {
    sales: results,
    totalTaxableGain,
    totalDepreciationRecapture,
    lines: audit.getLines(),
  };
}
