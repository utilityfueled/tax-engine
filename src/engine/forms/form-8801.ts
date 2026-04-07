/**
 * Form 8801 — Credit for Prior Year Minimum Tax
 * Spec: spec/federal/form-8801.yaml
 *
 * Allows taxpayers who paid AMT in a prior year due to deferral items
 * (ISO exercises, depreciation, depletion, disposition adjustments) to
 * claim a nonrefundable credit in the current year, limited to the
 * excess of current-year regular tax over current-year TMT.
 *
 * Parts I, II, and III are implemented. Part III recomputes the
 * exclusion-only TMT using maximum capital gains rates when the prior
 * year had qualified dividends or net capital gains, producing a lower
 * TMT (and thus a higher credit) by applying 0%/15%/20%/25%/28%
 * capital gains rates to the preferential portion of the AMT base.
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

// ── Prior year (2024) capital gains rate thresholds (Rev. Proc. 2023-34) ─
const PRIOR_YEAR_CG_2024 = {
  zeroThreshold: {
    single: new Decimal(47025),
    married_filing_jointly: new Decimal(94050),
    married_filing_separately: new Decimal(47025),
    head_of_household: new Decimal(63000),
    qualifying_surviving_spouse: new Decimal(94050),
  } as Record<FilingStatus, Decimal>,
  fifteenThreshold: {
    single: new Decimal(518900),
    married_filing_jointly: new Decimal(583750),
    married_filing_separately: new Decimal(291850),
    head_of_household: new Decimal(551350),
    qualifying_surviving_spouse: new Decimal(583750),
  } as Record<FilingStatus, Decimal>,
};

// ── Prior year (2024) AMT constants (Rev. Proc. 2023-34) ──────────

const PRIOR_YEAR_AMT_2024 = {
  exemption: {
    single: new Decimal(85700),
    married_filing_jointly: new Decimal(133300),
    married_filing_separately: new Decimal(66650),
    head_of_household: new Decimal(85700),
    qualifying_surviving_spouse: new Decimal(133300),
  } as Record<FilingStatus, Decimal>,
  phaseOutThreshold: {
    single: new Decimal(609350),
    married_filing_jointly: new Decimal(1218700),
    married_filing_separately: new Decimal(609350),
    head_of_household: new Decimal(609350),
    qualifying_surviving_spouse: new Decimal(1218700),
  } as Record<FilingStatus, Decimal>,
  rate26Limit: {
    single: new Decimal(232600),
    married_filing_jointly: new Decimal(232600),
    married_filing_separately: new Decimal(116300),
    head_of_household: new Decimal(232600),
    qualifying_surviving_spouse: new Decimal(232600),
  } as Record<FilingStatus, Decimal>,
};

// ── Input/output interfaces ────────────────────────────────────────

export interface Form8801Input {
  /** Prior year filing status (for exemption, phase-out, and rate bracket lookup) */
  priorYearFilingStatus: FilingStatus;
  /** Prior year Form 1040 Line 15 — taxable income */
  priorYearTaxableIncome: Decimal;
  /** Sum of prior year Form 6251 adjustments that are exclusion items (SALT add-back, medical, private activity bonds, etc.) */
  priorYearExclusionItemAdjustments: Decimal;
  /** Prior year Form 6251 Line 11 — the actual AMT paid */
  priorYearAMT: Decimal;
  /** Prior year regular tax liability before credits */
  priorYearRegularTax: Decimal;
  /** Unused minimum tax credit carryforward from years before the prior year */
  unusedMinimumTaxCreditCarryforward?: Decimal;
  /** Current year Form 1040 Line 16 — regular tax before credits */
  currentYearRegularTaxBeforeCredits: Decimal;
  /** Current year Form 6251 Line 10 — tentative minimum tax */
  currentYearTMT: Decimal;
  // Part III inputs — prior year capital gains for maximum capital gains rate recomputation
  /** Prior year qualified dividends */
  priorYearQualifiedDividends?: Decimal;
  /** Prior year net long-term capital gain (zero-floored) */
  priorYearNetLTCG?: Decimal;
  /** Prior year unrecaptured section 1250 gain (25% max rate) */
  priorYearUnrecapturedSection1250Gain?: Decimal;
  /** Prior year collectibles/§1202 gain (28% max rate) */
  priorYearCollectiblesGain?: Decimal;
}

export interface Form8801Result {
  // Part I outputs
  exclusionOnlyAMTI: Decimal;         // Line 3
  exemption: Decimal;                  // Line 9
  amtBaseOnExclusions: Decimal;        // Line 10
  exclusionOnlyTMT: Decimal;           // Line 11
  netMinTaxOnExclusionItems: Decimal;  // Line 13

  // Part II outputs
  minTaxCreditFromPriorYear: Decimal;  // Line 16
  totalAvailableCredit: Decimal;       // Line 18
  currentYearLimitation: Decimal;      // Line 24
  creditAllowed: Decimal;              // Line 25 → Schedule 3 Line 6a
  carryforwardToNextYear: Decimal;     // Line 26

  lines: CalculatedLine[];
}

// ── Calculation ────────────────────────────────────────────────────

export function calculateForm8801(input: Form8801Input): Form8801Result {
  const audit = new AuditTrail();
  const py = PRIOR_YEAR_AMT_2024;
  const fs = input.priorYearFilingStatus;

  // ── Part I: Net Minimum Tax on Exclusion Items ───────────

  // Line 1: Exclusion item adjustments from prior year
  audit.record("Form 8801", "1", "Exclusion item adjustments from prior year Form 6251",
    input.priorYearExclusionItemAdjustments,
    "SALT add-back, medical, private activity bonds, standard deduction, other permanent AMT adjustments");

  // Line 3: Exclusion-only AMTI = prior year taxable income + exclusion items
  // This is the AMTI that would have resulted if only exclusion (permanent) items
  // were preferences — all deferral (timing) items are backed out.
  const exclusionOnlyAMTI = input.priorYearTaxableIncome
    .plus(input.priorYearExclusionItemAdjustments);
  audit.record("Form 8801", "3", "Exclusion-only AMTI", exclusionOnlyAMTI,
    "Prior year taxable income + exclusion item adjustments",
    {
      "Prior year taxable income": input.priorYearTaxableIncome,
      "Exclusion items": input.priorYearExclusionItemAdjustments,
    });

  // Lines 5-6: AMT exemption and phase-out threshold for prior year filing status
  const baseExemption = py.exemption[fs];
  const phaseOutThreshold = py.phaseOutThreshold[fs];

  // Line 7: Excess of exclusion-only AMTI over phase-out threshold
  const excessOverThreshold = zeroFloor(exclusionOnlyAMTI.minus(phaseOutThreshold));

  // Line 8: Exemption reduction at 25 cents per dollar over threshold
  const exemptionReduction = roundDollar(excessOverThreshold.times(new Decimal(0.25)));

  // Line 9: Allowed exemption
  const exemption = zeroFloor(baseExemption.minus(exemptionReduction));
  audit.record("Form 8801", "9", "AMT exemption on exclusion-only AMTI", exemption,
    `Base ${baseExemption} − reduction ${exemptionReduction} (${fs})`,
    {
      "Base exemption": baseExemption,
      "Phase-out threshold": phaseOutThreshold,
      "Excess over threshold": excessOverThreshold,
      "Reduction (25%)": exemptionReduction,
    });

  // Line 10: AMT base on exclusion items
  const amtBaseOnExclusions = zeroFloor(exclusionOnlyAMTI.minus(exemption));
  audit.record("Form 8801", "10", "AMT base on exclusion items", amtBaseOnExclusions,
    "max(0, exclusion-only AMTI − exemption)");

  // Line 11: TMT on exclusion items using 26%/28% rates with prior year breakpoint
  const rate26Limit = py.rate26Limit[fs];
  const flatTMT = computeAMTTax(amtBaseOnExclusions, rate26Limit);

  // ── Part III: Maximum Capital Gains Rate Recomputation ─────────
  // When the prior year had qualified dividends or net LTCG, recompute
  // the TMT using capital gains rates for the preferential portion.
  // Use the lesser of the flat TMT and the Part III TMT.
  const priorQD = input.priorYearQualifiedDividends ?? new Decimal(0);
  const priorLTCG = input.priorYearNetLTCG ?? new Decimal(0);
  const totalPreferentialAvailable = priorQD.plus(priorLTCG);

  let exclusionOnlyTMT: Decimal;

  if (totalPreferentialAvailable.greaterThan(0) && amtBaseOnExclusions.greaterThan(0)) {
    // Preferential portion = min(AMT base, qualified dividends + net LTCG)
    const preferential = min(amtBaseOnExclusions, totalPreferentialAvailable);
    const ordinaryPortion = amtBaseOnExclusions.minus(preferential);

    // Ordinary portion at 26%/28% AMT rates
    const ordinaryTMT = computeAMTTax(ordinaryPortion, rate26Limit);

    // Preferential portion at capital gains rates, stacked above ordinary
    const section1250 = input.priorYearUnrecapturedSection1250Gain ?? new Decimal(0);
    const collectibles = input.priorYearCollectiblesGain ?? new Decimal(0);
    const cgThresholds = PRIOR_YEAR_CG_2024;
    const zeroThreshold = cgThresholds.zeroThreshold[fs];
    const fifteenThreshold = cgThresholds.fifteenThreshold[fs];

    let prefTax = new Decimal(0);
    let remaining = preferential;
    let currentStack = ordinaryPortion;

    // 0% bracket
    if (currentStack.lessThan(zeroThreshold)) {
      const roomAtZero = zeroThreshold.minus(currentStack);
      const atZero = min(remaining, roomAtZero);
      remaining = remaining.minus(atZero);
      currentStack = currentStack.plus(atZero);
    }

    // 15% bracket
    if (remaining.greaterThan(0) && currentStack.lessThan(fifteenThreshold)) {
      const roomAtFifteen = fifteenThreshold.minus(currentStack);
      const atFifteen = min(remaining, roomAtFifteen);
      prefTax = prefTax.plus(atFifteen.times(d("0.15")));
      remaining = remaining.minus(atFifteen);
    }

    // Above 15%: 28% collectibles, then 25% §1250, then 20%
    if (remaining.greaterThan(0)) {
      const collectiblesPortion = min(collectibles, remaining);
      if (collectiblesPortion.greaterThan(0)) {
        prefTax = prefTax.plus(collectiblesPortion.times(d("0.28")));
        remaining = remaining.minus(collectiblesPortion);
      }

      const section1250Portion = min(section1250, remaining);
      if (section1250Portion.greaterThan(0)) {
        prefTax = prefTax.plus(section1250Portion.times(d("0.25")));
        remaining = remaining.minus(section1250Portion);
      }

      if (remaining.greaterThan(0)) {
        prefTax = prefTax.plus(remaining.times(d("0.20")));
      }
    }

    const partIIITMT = ordinaryTMT.plus(roundDollar(prefTax));

    // Use the lesser of the flat TMT and the Part III TMT
    exclusionOnlyTMT = min(flatTMT, partIIITMT);

    audit.record("Form 8801", "11", "Tentative minimum tax on exclusion items",
      exclusionOnlyTMT,
      exclusionOnlyTMT.equals(partIIITMT)
        ? "Part III capital gains rates produce lower TMT"
        : `26% on first ${rate26Limit}, 28% on remainder (Part III did not reduce)`,
      {
        "AMT base": amtBaseOnExclusions,
        "26% bracket limit": rate26Limit,
        "Flat TMT (26%/28%)": flatTMT,
        "Part III TMT (CG rates)": partIIITMT,
        "Preferential portion": preferential,
        "Ordinary portion": ordinaryPortion,
      });
  } else {
    exclusionOnlyTMT = flatTMT;
    audit.record("Form 8801", "11", "Tentative minimum tax on exclusion items",
      exclusionOnlyTMT,
      `26% on first ${rate26Limit}, 28% on remainder`,
      {
        "AMT base": amtBaseOnExclusions,
        "26% bracket limit": rate26Limit,
      });
  }

  // Line 12: Prior year regular tax
  audit.record("Form 8801", "12", "Prior year regular tax",
    input.priorYearRegularTax, "From prior year Form 1040 Line 16");

  // Line 13: Net minimum tax on exclusion items = max(0, TMT − regular tax)
  const netMinTaxOnExclusionItems = zeroFloor(
    exclusionOnlyTMT.minus(input.priorYearRegularTax)
  );
  audit.record("Form 8801", "13", "Net minimum tax on exclusion items",
    netMinTaxOnExclusionItems,
    "max(0, TMT on exclusion items − prior year regular tax)",
    {
      "TMT on exclusion items": exclusionOnlyTMT,
      "Prior year regular tax": input.priorYearRegularTax,
    });

  // ── Part II: Minimum Tax Credit and Carryforward ─────────

  // Line 14: Prior year AMT
  audit.record("Form 8801", "14", "Prior year AMT", input.priorYearAMT,
    "From prior year Form 6251 Line 11");

  // Line 15: Net minimum tax on exclusion items (copy of Line 13)
  audit.record("Form 8801", "15", "Net minimum tax on exclusion items",
    netMinTaxOnExclusionItems, "From Part I Line 13");

  // Line 16: Minimum tax credit from prior year = AMT attributable to deferral items
  const minTaxCreditFromPriorYear = zeroFloor(
    input.priorYearAMT.minus(netMinTaxOnExclusionItems)
  );
  audit.record("Form 8801", "16", "Minimum tax credit from prior year",
    minTaxCreditFromPriorYear,
    "max(0, prior year AMT − net min tax on exclusion items)",
    {
      "Prior year AMT": input.priorYearAMT,
      "Net min tax on exclusion items": netMinTaxOnExclusionItems,
    });

  // Line 17: Carryforward from earlier years
  const carryforward = input.unusedMinimumTaxCreditCarryforward ?? new Decimal(0);
  audit.record("Form 8801", "17", "Unused minimum tax credit carryforward",
    carryforward, "From prior Form 8801 Line 26");

  // Line 18: Total available credit
  const totalAvailableCredit = minTaxCreditFromPriorYear.plus(carryforward);
  audit.record("Form 8801", "18", "Total available minimum tax credit",
    totalAvailableCredit, "Line 16 + Line 17");

  // Line 22: Current year regular tax
  audit.record("Form 8801", "22", "Current year regular tax before credits",
    input.currentYearRegularTaxBeforeCredits, "From Form 1040 Line 16");

  // Line 23: Current year TMT
  audit.record("Form 8801", "23", "Current year tentative minimum tax",
    input.currentYearTMT, "From Form 6251 Line 10");

  // Line 24: Current year limitation = max(0, regular tax − TMT)
  const currentYearLimitation = zeroFloor(
    input.currentYearRegularTaxBeforeCredits.minus(input.currentYearTMT)
  );
  audit.record("Form 8801", "24", "Current year limitation",
    currentYearLimitation,
    "max(0, regular tax − TMT)",
    {
      "Regular tax": input.currentYearRegularTaxBeforeCredits,
      "TMT": input.currentYearTMT,
    });

  // Line 25: Credit allowed = min(total available, limitation)
  const creditAllowed = totalAvailableCredit.greaterThan(0)
    ? min(totalAvailableCredit, currentYearLimitation)
    : new Decimal(0);
  audit.record("Form 8801", "25", "Minimum tax credit allowed this year",
    creditAllowed,
    "min(total available, current year limitation) → Schedule 3 Line 6a",
    {
      "Total available": totalAvailableCredit,
      "Limitation": currentYearLimitation,
    });

  // Line 26: Carryforward to next year
  const carryforwardToNextYear = totalAvailableCredit.greaterThan(0)
    ? zeroFloor(totalAvailableCredit.minus(creditAllowed))
    : new Decimal(0);
  audit.record("Form 8801", "26", "Carryforward to next year",
    carryforwardToNextYear, "Total available − credit used");

  return {
    exclusionOnlyAMTI,
    exemption,
    amtBaseOnExclusions,
    exclusionOnlyTMT,
    netMinTaxOnExclusionItems,
    minTaxCreditFromPriorYear,
    totalAvailableCredit,
    currentYearLimitation,
    creditAllowed,
    carryforwardToNextYear,
    lines: audit.getLines(),
  };
}

/**
 * Compute AMT tax using 26%/28% rates with the given breakpoint.
 */
function computeAMTTax(amtBase: Decimal, rate26Limit: Decimal): Decimal {
  if (amtBase.lte(0)) return new Decimal(0);
  if (amtBase.lte(rate26Limit)) {
    return roundDollar(amtBase.times(new Decimal(0.26)));
  }
  const at26 = roundDollar(rate26Limit.times(new Decimal(0.26)));
  const at28 = roundDollar(amtBase.minus(rate26Limit).times(new Decimal(0.28)));
  return at26.plus(at28);
}
