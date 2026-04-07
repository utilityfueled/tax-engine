/**
 * Partner/Shareholder Basis Schedule
 * Spec: spec/federal/partner-basis-schedule.yaml
 *
 * Computes the year-end adjusted basis for a partner's interest in a
 * partnership (IRC §705) or a shareholder's stock basis in an S corporation
 * (IRC §1367 / Form 7203).
 *
 * This is the FIRST tier of the three-tier loss limitation stack:
 *   1. Basis limitation (IRC §704(d) / §1366(d)) — this module
 *   2. At-risk limitation (IRC §465 / Form 6198)
 *   3. Passive activity limitation (IRC §469 / Form 8582)
 *
 * Ordering per IRS K-1 basis worksheet and Form 7203:
 *   1. Begin with prior-year adjusted basis
 *   2. ADD all income/gain items and tax-exempt income
 *   3. SUBTRACT distributions (excess → capital gain per §731/§1368)
 *   4. SUBTRACT nondeductible expenses (standard ordering)
 *   5. SUBTRACT losses/deductions (pro-rata if basis insufficient)
 *
 * S-corp §1367(a)(2)(B) election swaps steps 4 and 5.
 */

import Decimal from "decimal.js";
import type { ScheduleK1 } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);
const FORM = "Basis Schedule";

/** Per-category loss breakdown for pro-rata allocation and carryforward */
export interface LossCategory {
  key: string;
  description: string;
  total: Decimal;    // Current-year + prior suspended
  allowed: Decimal;  // Amount allowed against basis
  suspended: Decimal; // Carried forward
}

/** S-Corp debt basis result (Form 7203 Part II) */
export interface DebtBasisResult {
  beginningDebtBasis: Decimal;
  additionalLoans: Decimal;
  debtBasisBeforeAdjustments: Decimal;
  /** Debt basis restored from net income per IRC §1367(b)(2)(B) */
  restoration: Decimal;
  /** Excess stock losses applied to reduce debt basis per IRC §1367(b)(2)(A) */
  lossesAppliedToDebtBasis: Decimal;
  endingDebtBasis: Decimal;
  /** Cumulative debt basis reduction for next year's restoration tracking */
  debtBasisReductionCarryforward: Decimal;
}

export interface PartnerBasisScheduleResult {
  entityType: "partnership" | "s_corporation";

  // ── Increases ──
  beginningBasis: Decimal;
  totalIncomeItems: Decimal;
  basisBeforeDecreases: Decimal;

  // ── Distributions ──
  totalDistributions: Decimal;
  basisAfterDistributions: Decimal;
  /** Capital gain from distributions exceeding basis (IRC §731/§1368) */
  excessDistributionGain: Decimal;

  // ── Nondeductible expenses ──
  totalNondeductibleExpenses: Decimal;
  basisAfterNondeductible: Decimal;
  suspendedNondeductible: Decimal;

  // ── Losses ──
  totalLosses: Decimal;
  basisAvailableForLosses: Decimal;
  totalAllowedLosses: Decimal;
  totalSuspendedLosses: Decimal;
  /** Per-category breakdown of allowed and suspended losses */
  lossCategories: LossCategory[];

  // ── Ending basis ──
  endingBasis: Decimal;

  // ── S-Corp Debt Basis (Form 7203 Part II) ──
  /** Present only for S-corps when beginningDebtBasis is provided */
  debtBasis?: DebtBasisResult;

  // ── Carryforward summary ──
  /** Suspended losses by category for next year's priorSuspendedLosses input */
  suspendedLossCarryforward: {
    ordinary: Decimal;
    rental: Decimal;
    otherRental: Decimal;
    shortTermCapital: Decimal;
    longTermCapital: Decimal;
    section1231: Decimal;
    otherLoss: Decimal;
    section179: Decimal;
    charitable: Decimal;
    otherDeductions: Decimal;
    investmentInterest: Decimal;
    ebie: Decimal;
  };

  lines: CalculatedLine[];
}

export function calculatePartnerBasisSchedule(k1: ScheduleK1): PartnerBasisScheduleResult {
  const audit = new AuditTrail();
  const entityType = k1.entityType ?? "partnership";
  const entityLabel = entityType === "s_corporation" ? "S-Corp" : "Partnership";

  // ── Line 1: Beginning basis ──
  const beginningBasis = Decimal.max(ZERO, d(k1.beginningBasis));
  audit.record(FORM, "1", `${entityLabel} adjusted basis at beginning of year`, beginningBasis,
    "User-provided or carryforward from prior year (≥ 0)");

  // ── Income items (increases) ──
  // Each K-1 box can be positive (income) or negative (loss).
  // Only positive amounts increase basis; negative amounts go to the loss side.
  const incomeOrdinary = Decimal.max(ZERO, d(k1.ordinaryIncome));
  const incomeRental = Decimal.max(ZERO, d(k1.netRentalIncome));
  const incomeOtherRental = Decimal.max(ZERO, d(k1.otherNetRentalIncome));
  const incomeGuaranteed = Decimal.max(ZERO, d(k1.guaranteedPayments));
  const incomeInterest = Decimal.max(ZERO, d(k1.interestIncome));
  const incomeDividends = Decimal.max(ZERO, d(k1.ordinaryDividends));
  const incomeRoyalties = Decimal.max(ZERO, d(k1.royalties));
  const incomeSTCG = Decimal.max(ZERO, d(k1.netShortTermCapitalGain));
  const incomeLTCG = Decimal.max(ZERO, d(k1.netLongTermCapitalGain));
  const income1231 = Decimal.max(ZERO, d(k1.section1231Gain));
  const incomeOther = Decimal.max(ZERO, d(k1.otherIncome));
  const taxExemptInterest = Decimal.max(ZERO, d(k1.taxExemptInterest));
  const otherTaxExempt = Decimal.max(ZERO, d(k1.otherTaxExemptIncome));
  const totalTaxExempt = taxExemptInterest.plus(otherTaxExempt);

  const totalIncomeItems = incomeOrdinary
    .plus(incomeRental)
    .plus(incomeOtherRental)
    .plus(incomeGuaranteed)
    .plus(incomeInterest)
    .plus(incomeDividends)
    .plus(incomeRoyalties)
    .plus(incomeSTCG)
    .plus(incomeLTCG)
    .plus(income1231)
    .plus(incomeOther)
    .plus(totalTaxExempt);

  audit.record(FORM, "income", "Total income and gain items", totalIncomeItems,
    "Sum of positive Box 1-11 amounts + Box 18 tax-exempt income", {
      "Ordinary income": incomeOrdinary,
      "Rental income": incomeRental,
      "Other rental income": incomeOtherRental,
      "Guaranteed payments": incomeGuaranteed,
      "Interest income": incomeInterest,
      "Dividends": incomeDividends,
      "Royalties": incomeRoyalties,
      "Short-term capital gain": incomeSTCG,
      "Long-term capital gain": incomeLTCG,
      "Section 1231 gain": income1231,
      "Other income": incomeOther,
      "Tax-exempt income": totalTaxExempt,
    });

  const basisBeforeDecreases = beginningBasis.plus(totalIncomeItems);
  audit.record(FORM, "basis-before-decreases", "Adjusted basis before decreases",
    basisBeforeDecreases, "Line 1 + total income items", {
      "Beginning basis": beginningBasis,
      "Total income items": totalIncomeItems,
    });

  // ── Distributions (first decrease) ──
  const totalDistributions = Decimal.max(ZERO, d(k1.distributions));
  const excessDistributionGain = Decimal.max(ZERO, totalDistributions.minus(basisBeforeDecreases));
  const basisAfterDistributions = Decimal.max(ZERO, basisBeforeDecreases.minus(totalDistributions));

  audit.record(FORM, "distributions", "Total distributions (Box 19)", totalDistributions,
    "Cash and property distributions");
  audit.record(FORM, "basis-after-distributions", "Basis after distributions",
    basisAfterDistributions, "max(0, basis before decreases - distributions)", {
      "Basis before decreases": basisBeforeDecreases,
      "Distributions": totalDistributions,
    });
  if (excessDistributionGain.gt(ZERO)) {
    const gainRef = entityType === "s_corporation" ? "IRC §1368(b)(2)" : "IRC §731(a)(1)";
    audit.record(FORM, "excess-distribution-gain",
      `Capital gain from excess distributions (${gainRef})`,
      excessDistributionGain, `Distributions (${totalDistributions}) exceed basis (${basisBeforeDecreases})`, {
        "Distributions": totalDistributions,
        "Basis before distributions": basisBeforeDecreases,
      });
  }

  // ── Nondeductible expenses and losses ──
  // The ordering depends on entity type and election:
  //   Standard (both): nondeductible → losses
  //   S-corp with §1367(a)(2)(B) election: losses → nondeductible
  const totalNondeductibleExpenses = Decimal.max(ZERO, d(k1.nondeductibleExpenses));
  const useElectionOrdering = entityType === "s_corporation" && k1.election1367;

  // ── Build loss categories ──
  const priorSuspended = k1.priorSuspendedLosses;
  const lossCategories: LossCategory[] = buildLossCategories(k1, priorSuspended);
  const totalLosses = lossCategories.reduce((sum, c) => sum.plus(c.total), ZERO);

  let basisAfterNondeductible: Decimal;
  let suspendedNondeductible: Decimal;
  let basisAvailableForLosses: Decimal;
  let totalAllowedLosses: Decimal;
  let totalSuspendedLosses: Decimal;
  let endingBasis: Decimal;

  if (useElectionOrdering) {
    // §1367(a)(2)(B) election: losses BEFORE nondeductible expenses
    audit.record(FORM, "election", "IRC §1367(a)(2)(B) election active",
      new Decimal(1), "Losses reduce basis before nondeductible expenses");

    // Step 4 (swapped): Losses first
    basisAvailableForLosses = basisAfterDistributions;
    ({ totalAllowed: totalAllowedLosses, totalSuspended: totalSuspendedLosses } =
      allocateLossesProRata(lossCategories, basisAvailableForLosses, audit));

    const basisAfterLosses = basisAfterDistributions.minus(totalAllowedLosses);

    // Step 5 (swapped): Nondeductible expenses
    suspendedNondeductible = Decimal.max(ZERO, totalNondeductibleExpenses.minus(basisAfterLosses));
    basisAfterNondeductible = Decimal.max(ZERO, basisAfterLosses.minus(totalNondeductibleExpenses));
    endingBasis = basisAfterNondeductible;

    audit.record(FORM, "nondeductible", "Nondeductible expenses (Box 18C, after losses per election)",
      totalNondeductibleExpenses, "Applied after losses due to §1367(a)(2)(B) election");
  } else {
    // Standard ordering: nondeductible expenses BEFORE losses

    // Step 4: Nondeductible expenses
    suspendedNondeductible = Decimal.max(ZERO, totalNondeductibleExpenses.minus(basisAfterDistributions));
    basisAfterNondeductible = Decimal.max(ZERO, basisAfterDistributions.minus(totalNondeductibleExpenses));

    audit.record(FORM, "nondeductible", "Nondeductible expenses (Box 18C)",
      totalNondeductibleExpenses, "Reduces basis before losses");
    audit.record(FORM, "basis-after-nondeductible", "Basis after nondeductible expenses",
      basisAfterNondeductible, "max(0, basis after distributions - nondeductible expenses)", {
        "Basis after distributions": basisAfterDistributions,
        "Nondeductible expenses": totalNondeductibleExpenses,
      });

    // Step 5: Losses
    basisAvailableForLosses = basisAfterNondeductible;
    ({ totalAllowed: totalAllowedLosses, totalSuspended: totalSuspendedLosses } =
      allocateLossesProRata(lossCategories, basisAvailableForLosses, audit));

    endingBasis = basisAfterNondeductible.minus(totalAllowedLosses);
  }

  audit.record(FORM, "total-losses", "Total loss and deduction items", totalLosses,
    "Sum of current-year losses + prior suspended losses", {
      "Current-year + prior suspended total": totalLosses,
    });
  audit.record(FORM, "total-allowed", "Total losses allowed against basis",
    totalAllowedLosses, `min(${totalLosses}, ${basisAvailableForLosses})`, {
      "Total losses": totalLosses,
      "Basis available": basisAvailableForLosses,
    });
  if (totalSuspendedLosses.gt(ZERO)) {
    audit.record(FORM, "total-suspended", "Total losses suspended (IRC §704(d)/§1366(d))",
      totalSuspendedLosses, "Carry forward indefinitely", {
        "Total losses": totalLosses,
        "Allowed": totalAllowedLosses,
      });
  }

  audit.record(FORM, "ending-basis", `${entityLabel} adjusted basis at end of year`,
    endingBasis, "Basis after all decreases (≥ 0)", {
      "Beginning basis": beginningBasis,
      "Income items": totalIncomeItems,
      "Distributions": totalDistributions,
      "Nondeductible expenses": totalNondeductibleExpenses,
      "Allowed losses": totalAllowedLosses,
    });

  // ── S-Corp Debt Basis (Form 7203 Part II) ──
  // When an S-corp shareholder has direct loans to the S-corporation,
  // excess losses beyond stock basis can reduce debt basis (IRC §1367(b)(2)(A)).
  // In net-increase years, income first restores debt basis (IRC §1367(b)(2)(B)).
  let debtBasisResult: DebtBasisResult | undefined;

  if (entityType === "s_corporation" && k1.beginningDebtBasis !== undefined) {
    const beginningDebtBasis = Decimal.max(ZERO, d(k1.beginningDebtBasis));
    const additionalLoans = Decimal.max(ZERO, d(k1.additionalLoansToScorp));
    const priorDebtReduction = Decimal.max(ZERO, d(k1.priorDebtBasisReduction));
    const debtBasisBeforeAdjustments = beginningDebtBasis.plus(additionalLoans);

    audit.record(FORM, "debt-15", "S-Corp beginning debt basis (Form 7203 Part II Line 15)",
      beginningDebtBasis, "Adjusted basis of shareholder loans to S-corp at beginning of year");
    if (additionalLoans.gt(ZERO)) {
      audit.record(FORM, "debt-16", "Additional loans to S-Corp (Form 7203 Part II Line 16)",
        additionalLoans, "New direct loans made during the year");
    }
    audit.record(FORM, "debt-17", "Debt basis before adjustments (Form 7203 Part II Line 17)",
      debtBasisBeforeAdjustments, "Beginning debt + additional loans", {
        "Beginning debt": beginningDebtBasis,
        "Additional loans": additionalLoans,
      });

    // Net increase = max(0, ending stock basis (pre-restoration) - beginning stock basis)
    // Per Treas. Reg. §1.1367-2(c)(2), net increase = stock increases - stock reductions
    const netIncrease = Decimal.max(ZERO, endingBasis.minus(beginningBasis));

    let restoration = ZERO;
    let lossesAppliedToDebtBasis = ZERO;
    let endingDebtBasis: Decimal;
    let debtBasisReductionCarryforward: Decimal;

    if (totalSuspendedLosses.gt(ZERO) && debtBasisBeforeAdjustments.gt(ZERO)) {
      // Excess losses exist and debt basis is available → losses reduce debt basis
      // No restoration (net increase is zero or negative when there are suspended losses)
      lossesAppliedToDebtBasis = Decimal.min(totalSuspendedLosses, debtBasisBeforeAdjustments);

      if (lossesAppliedToDebtBasis.gt(ZERO)) {
        // Second-pass pro-rata allocation of debt-allowed losses across suspended categories
        allocateDebtBasisLosses(lossCategories, lossesAppliedToDebtBasis, audit);
        totalAllowedLosses = totalAllowedLosses.plus(lossesAppliedToDebtBasis);
        totalSuspendedLosses = totalSuspendedLosses.minus(lossesAppliedToDebtBasis);
      }

      endingDebtBasis = Decimal.max(ZERO, debtBasisBeforeAdjustments.minus(lossesAppliedToDebtBasis));
      debtBasisReductionCarryforward = priorDebtReduction.plus(lossesAppliedToDebtBasis);

      audit.record(FORM, "debt-20", "Losses applied to debt basis (IRC §1367(b)(2)(A))",
        lossesAppliedToDebtBasis, "Excess losses from stock basis reduce debt basis", {
          "Stock-suspended losses": totalSuspendedLosses.plus(lossesAppliedToDebtBasis),
          "Debt basis available": debtBasisBeforeAdjustments,
          "Applied to debt": lossesAppliedToDebtBasis,
        });
    } else if (netIncrease.gt(ZERO) && priorDebtReduction.gt(ZERO)) {
      // Net increase year with prior debt reduction → restore debt basis
      // Per Treas. Reg. §1.1367-1(g), net increase first restores debt basis,
      // then any excess increases stock basis
      restoration = Decimal.min(netIncrease, priorDebtReduction);
      endingBasis = endingBasis.minus(restoration); // Divert from stock to debt restoration
      endingDebtBasis = debtBasisBeforeAdjustments.plus(restoration);
      debtBasisReductionCarryforward = priorDebtReduction.minus(restoration);

      audit.record(FORM, "debt-18", "Debt basis restoration from net increase (IRC §1367(b)(2)(B))",
        restoration, `Net increase of ${netIncrease} restores ${restoration} of prior reduction`, {
          "Net increase (stock)": netIncrease,
          "Prior debt reduction": priorDebtReduction,
          "Restoration": restoration,
        });
      // Update the stock basis audit entry to reflect restoration
      audit.record(FORM, "ending-basis-adjusted",
        "S-Corp ending stock basis after debt restoration (Treas. Reg. §1.1367-1(g))",
        endingBasis, `Stock basis reduced by ${restoration} for debt restoration`, {
          "Pre-restoration stock basis": endingBasis.plus(restoration),
          "Restoration diverted to debt": restoration,
        });
    } else {
      // No excess losses and no restoration needed — debt basis unchanged
      endingDebtBasis = debtBasisBeforeAdjustments;
      debtBasisReductionCarryforward = priorDebtReduction;
    }

    audit.record(FORM, "debt-21", "S-Corp ending debt basis (Form 7203 Part II Line 21)",
      endingDebtBasis, "Debt basis at end of year", {
        "Before adjustments": debtBasisBeforeAdjustments,
        "Restoration": restoration,
        "Losses applied": lossesAppliedToDebtBasis,
      });

    debtBasisResult = {
      beginningDebtBasis,
      additionalLoans,
      debtBasisBeforeAdjustments,
      restoration,
      lossesAppliedToDebtBasis,
      endingDebtBasis,
      debtBasisReductionCarryforward,
    };
  }

  return {
    entityType,
    beginningBasis,
    totalIncomeItems,
    basisBeforeDecreases,
    totalDistributions,
    basisAfterDistributions,
    excessDistributionGain,
    totalNondeductibleExpenses,
    basisAfterNondeductible,
    suspendedNondeductible,
    totalLosses,
    basisAvailableForLosses,
    totalAllowedLosses,
    totalSuspendedLosses,
    lossCategories,
    endingBasis,
    debtBasis: debtBasisResult,
    suspendedLossCarryforward: {
      ordinary: findCategory(lossCategories, "ordinary").suspended,
      rental: findCategory(lossCategories, "rental").suspended,
      otherRental: findCategory(lossCategories, "otherRental").suspended,
      shortTermCapital: findCategory(lossCategories, "shortTermCapital").suspended,
      longTermCapital: findCategory(lossCategories, "longTermCapital").suspended,
      section1231: findCategory(lossCategories, "section1231").suspended,
      otherLoss: findCategory(lossCategories, "otherLoss").suspended,
      section179: findCategory(lossCategories, "section179").suspended,
      charitable: findCategory(lossCategories, "charitable").suspended,
      otherDeductions: findCategory(lossCategories, "otherDeductions").suspended,
      investmentInterest: findCategory(lossCategories, "investmentInterest").suspended,
      ebie: findCategory(lossCategories, "ebie").suspended,
    },
    lines: audit.getLines(),
  };
}

function findCategory(categories: LossCategory[], key: string): LossCategory {
  return categories.find(c => c.key === key) ?? { key, description: "", total: ZERO, allowed: ZERO, suspended: ZERO };
}

/** Build the loss category list from K-1 data and prior suspended losses. */
function buildLossCategories(
  k1: ScheduleK1,
  prior: ScheduleK1["priorSuspendedLosses"],
): LossCategory[] {
  // Extract current-year loss amounts (negative Box values become positive losses)
  const currentOrdinaryLoss = Decimal.max(ZERO, d(k1.ordinaryIncome).neg());
  const currentRentalLoss = Decimal.max(ZERO, d(k1.netRentalIncome).neg());
  const currentOtherRentalLoss = Decimal.max(ZERO, d(k1.otherNetRentalIncome).neg());
  const currentSTCL = Decimal.max(ZERO, d(k1.netShortTermCapitalGain).neg());
  const currentLTCL = Decimal.max(ZERO, d(k1.netLongTermCapitalGain).neg());
  const current1231Loss = Decimal.max(ZERO, d(k1.section1231Gain).neg());
  const currentOtherLoss = Decimal.max(ZERO, d(k1.otherIncome).neg());

  // Deduction items are always positive amounts that reduce basis
  const currentSection179 = Decimal.max(ZERO, d(k1.section179Deduction));
  const currentCharitable = Decimal.max(ZERO, d(k1.charitableCash))
    .plus(Decimal.max(ZERO, d(k1.charitableCapitalGain30)))
    .plus(Decimal.max(ZERO, d(k1.charitableCapitalGain20)));
  const currentOtherDeductions = Decimal.max(ZERO, d(k1.otherDeductions));
  const currentInvestmentInterest = Decimal.max(ZERO, d(k1.investmentInterestExpense));
  const currentEBIE = Decimal.max(ZERO, d(k1.excessBusinessInterest));

  // Add prior suspended amounts
  const priorOrdinary = d(prior?.ordinary);
  const priorRental = d(prior?.rental);
  const priorOtherRental = d(prior?.otherRental);
  const priorSTCL = d(prior?.shortTermCapital);
  const priorLTCL = d(prior?.longTermCapital);
  const prior1231 = d(prior?.section1231);
  const priorOtherLoss = d(prior?.otherLoss);
  const priorSection179 = d(prior?.section179);
  const priorCharitable = d(prior?.charitable);
  const priorOtherDeductions = d(prior?.otherDeductions);
  const priorInvestmentInterest = d(prior?.investmentInterest);
  const priorEBIE = d(prior?.ebie);

  return [
    { key: "ordinary", description: "Ordinary business loss (Box 1)", total: currentOrdinaryLoss.plus(priorOrdinary), allowed: ZERO, suspended: ZERO },
    { key: "rental", description: "Net rental real estate loss (Box 2)", total: currentRentalLoss.plus(priorRental), allowed: ZERO, suspended: ZERO },
    { key: "otherRental", description: "Other net rental loss (Box 3)", total: currentOtherRentalLoss.plus(priorOtherRental), allowed: ZERO, suspended: ZERO },
    { key: "shortTermCapital", description: "Short-term capital loss (Box 8)", total: currentSTCL.plus(priorSTCL), allowed: ZERO, suspended: ZERO },
    { key: "longTermCapital", description: "Long-term capital loss (Box 9a)", total: currentLTCL.plus(priorLTCL), allowed: ZERO, suspended: ZERO },
    { key: "section1231", description: "Section 1231 loss (Box 10)", total: current1231Loss.plus(prior1231), allowed: ZERO, suspended: ZERO },
    { key: "otherLoss", description: "Other loss (Box 11)", total: currentOtherLoss.plus(priorOtherLoss), allowed: ZERO, suspended: ZERO },
    { key: "section179", description: "Section 179 deduction (Box 12)", total: currentSection179.plus(priorSection179), allowed: ZERO, suspended: ZERO },
    { key: "charitable", description: "Charitable contributions (Box 13 A/B/C)", total: currentCharitable.plus(priorCharitable), allowed: ZERO, suspended: ZERO },
    { key: "otherDeductions", description: "Other deductions (Box 13 W)", total: currentOtherDeductions.plus(priorOtherDeductions), allowed: ZERO, suspended: ZERO },
    { key: "investmentInterest", description: "Investment interest expense (Box 13 D)", total: currentInvestmentInterest.plus(priorInvestmentInterest), allowed: ZERO, suspended: ZERO },
    { key: "ebie", description: "Excess business interest expense (Box 13 K)", total: currentEBIE.plus(priorEBIE), allowed: ZERO, suspended: ZERO },
  ];
}

/**
 * Allocate losses pro-rata across categories when total losses exceed available basis.
 * Per IRS K-1 basis worksheet Part II and Form 7203 Part III:
 *   Each category allowed = (category total / sum of all totals) × available basis
 * Rounding to nearest dollar with correction on the largest category.
 */
function allocateLossesProRata(
  categories: LossCategory[],
  availableBasis: Decimal,
  audit: AuditTrail,
): { totalAllowed: Decimal; totalSuspended: Decimal } {
  const totalLosses = categories.reduce((sum, c) => sum.plus(c.total), ZERO);

  if (totalLosses.lte(ZERO)) {
    // No losses — nothing to allocate
    for (const cat of categories) {
      cat.allowed = ZERO;
      cat.suspended = ZERO;
    }
    return { totalAllowed: ZERO, totalSuspended: ZERO };
  }

  if (totalLosses.lte(availableBasis)) {
    // All losses fit within basis — no pro-rata needed
    for (const cat of categories) {
      cat.allowed = cat.total;
      cat.suspended = ZERO;
    }
    return { totalAllowed: totalLosses, totalSuspended: ZERO };
  }

  // Pro-rata allocation: each category gets proportional share of available basis
  let allocatedSum = ZERO;
  let largestIdx = 0;
  let largestTotal = ZERO;

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    if (cat.total.gt(ZERO)) {
      // Round each category's allowed amount to nearest dollar
      cat.allowed = cat.total.div(totalLosses).times(availableBasis).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      allocatedSum = allocatedSum.plus(cat.allowed);
      if (cat.total.gt(largestTotal)) {
        largestTotal = cat.total;
        largestIdx = i;
      }
    }
  }

  // Correct rounding on the largest category
  const roundingDiff = allocatedSum.minus(availableBasis);
  if (!roundingDiff.isZero()) {
    categories[largestIdx].allowed = categories[largestIdx].allowed.minus(roundingDiff);
    allocatedSum = availableBasis;
  }

  // Compute suspended amounts
  let totalSuspended = ZERO;
  for (const cat of categories) {
    cat.suspended = cat.total.minus(cat.allowed);
    totalSuspended = totalSuspended.plus(cat.suspended);
  }

  // Record per-category audit lines
  for (const cat of categories) {
    if (cat.total.gt(ZERO)) {
      audit.record(FORM, `loss-${cat.key}-allowed`, `${cat.description} — allowed`,
        cat.allowed, `Pro-rata: ${cat.total} / ${totalLosses} × ${availableBasis}`, {
          "Category total": cat.total,
          "Total losses": totalLosses,
          "Available basis": availableBasis,
          "Suspended": cat.suspended,
        });
    }
  }

  return { totalAllowed: allocatedSum, totalSuspended };
}

/**
 * Second-pass allocation: distribute debt-basis-allowed losses across
 * categories that still have suspended amounts from the stock basis pass.
 * Uses the same proportional method with rounding correction.
 */
function allocateDebtBasisLosses(
  categories: LossCategory[],
  debtBasisAvailable: Decimal,
  audit: AuditTrail,
): void {
  const totalSuspended = categories.reduce((sum, c) => sum.plus(c.suspended), ZERO);
  if (totalSuspended.lte(ZERO) || debtBasisAvailable.lte(ZERO)) return;

  const allocatable = Decimal.min(totalSuspended, debtBasisAvailable);

  // Compute additional amounts per category
  const additionalAmounts: Decimal[] = new Array(categories.length).fill(ZERO);
  let allocatedSum = ZERO;
  let largestIdx = 0;
  let largestSuspended = ZERO;

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    if (cat.suspended.gt(ZERO)) {
      additionalAmounts[i] = cat.suspended.div(totalSuspended).times(allocatable)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      allocatedSum = allocatedSum.plus(additionalAmounts[i]);
      if (cat.suspended.gt(largestSuspended)) {
        largestSuspended = cat.suspended;
        largestIdx = i;
      }
    }
  }

  // Correct rounding on the largest category
  const diff = allocatedSum.minus(allocatable);
  if (!diff.isZero()) {
    additionalAmounts[largestIdx] = additionalAmounts[largestIdx].minus(diff);
  }

  // Apply additional amounts and record audit entries
  for (let i = 0; i < categories.length; i++) {
    const additional = additionalAmounts[i];
    if (additional.gt(ZERO)) {
      const cat = categories[i];
      audit.record(FORM, `debt-loss-${cat.key}`, `${cat.description} — additional allowed (debt basis)`,
        additional, `Debt pro-rata: ${cat.suspended} / ${totalSuspended} × ${allocatable}`, {
          "Category suspended (from stock)": cat.suspended,
          "Total suspended": totalSuspended,
          "Debt basis available": allocatable,
        });
      cat.allowed = cat.allowed.plus(additional);
      cat.suspended = cat.suspended.minus(additional);
    }
  }
}
