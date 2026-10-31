/** Canonical Section172 income-context orchestration. Spec: net-operating-loss-return.yaml. */
import Decimal from "decimal.js";
import { nolFilingUnitSourceDigest } from "@/utils/nol-filing-unit-source-digest.js";
import { assertNolFilingUnitAgreement } from "@/utils/nol-filing-unit-timeline.js";
import type { CharitableNolContributionLimit } from "@/utils/charitable-nol-source.js";
import { hasOriginalCharitableNolSources, readCurrentCharitableSourceForNol } from "@/utils/charitable-nol-source.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";
import { calculateNetOperatingLoss, type NetOperatingLossResult } from "./net-operating-loss.js";
import { calculateAlternativeTaxNol, type AlternativeTaxNolResult } from "./alternative-tax-net-operating-loss.js";
import type { Form6251IncomeResult } from "./form-6251.js";
import { calculateCharitableNolCarryover, type CharitableNolCarryoverResult } from "./charitable-net-operating-loss.js";
import { calculateAlternativeCharitableNolCarryover, type AlternativeCharitableNolCarryoverResult } from "./alternative-charitable-net-operating-loss.js";
import { calculateForm172Return } from "./form-172-return.js";
import { calculateQbiEblNol } from "./qbi-ebl-nol.js";
import { createPriorCharitableNolLimit, hasPriorCharitableNolSources, readPriorCharitableNolSources } from "@/utils/charitable-prior-nol-source.js";
import { calculatePriorCharitableNolCarryover, type PriorCharitableNolCarryoverResult } from "./charitable-prior-net-operating-loss.js";
import { createCharitableNolOriginLimit, usesDeterminedCharitableNolOrigins } from "@/utils/charitable-nol-origins.js";
import { calculateDeterminedCharitableNol, type DeterminedCharitableNolResult } from "./charitable-determined-nol.js";
import { hasCompleteEmptyForeignNolSources } from "./empty-nol-foreign-sources.js";
import { readCurrentMinimumTaxCreditSources } from "@/utils/current-minimum-tax-credit-source.js";

export interface NolIncomeContext {
  agi: Decimal;
  taxableIncome: Decimal;
  iraDeduction: Decimal;
  socialSecurityBenefitsTaxable: Decimal;
  allowedPassiveLoss: Decimal;
  medicalDeduction: Decimal;
  charitableDeduction: Decimal;
  charitableCarryforward: Decimal;
  deductionUsed: "standard" | "itemized" | "nonitemized";
  currentExcessBusinessLoss: Decimal;
  seniorDeduction: Decimal;
  capitalLossModification: Decimal;
  section1202Modification: Decimal;
  lines: CalculatedLine[];
}
/** Internal canonical result, including the actual regular199A deduction. */
export interface NolAlternativeIncomeContext extends Form6251IncomeResult { qbiDeduction: Decimal }
export interface NetOperatingLossReturnResult extends NetOperatingLossResult {
  calculationComplete: true;
  /** Original source binding for changed membership; never a current amount override. */
  filingUnitSourceDigest?: string;
  deduction: Decimal;
  absorbed: Decimal;
  expired: Decimal;
  carryforward: Decimal;
  actualIncome: NolIncomeContext;
  modifiedIncome: NolIncomeContext;
  finalIncome: NolIncomeContext;
  modifiedVintageIncome: Array<{ sourceId: string; retainedEarlierDeduction: Decimal; income: NolIncomeContext }>;
  section1411Deduction: Decimal;
  alternativeTaxSources: NetOperatingLossResult;
  alternativeTax: AlternativeTaxNolResult;
  charitableCarryover?: CharitableNolCarryoverResult;
  alternativeCharitableCarryover?: AlternativeCharitableNolCarryoverResult;
  priorCharitableCarryover?: PriorCharitableNolCarryoverResult;
  priorAlternativeCharitableCarryover?: PriorCharitableNolCarryoverResult;
  determinedCharitableCarryover?: DeterminedCharitableNolResult;
  determinedAlternativeCharitableCarryover?: DeterminedCharitableNolResult;
  priorCharitableAlternativeAdjustment?: {
    regularLedgerIncome: NolAlternativeIncomeContext; independentIncome: NolAlternativeIncomeContext; amount: Decimal;
  };
  alternativeCharitableCounterfactual?: { income: Form6251IncomeResult; calculation: AlternativeTaxNolResult };
  charitableCounterfactual?: {
    income: NolIncomeContext;
    modifiedVintageIncome: Array<{ sourceId: string; retainedEarlierDeduction: Decimal; income: NolIncomeContext }>;
    calculation: NetOperatingLossResult;
  };
}

export function calculateNetOperatingLossReturn(input: TaxYearInput,
  computeIncome: (deduction: Decimal, modified: boolean, purpose: "current-limit" | "modified" | "final", charitableContributionLimit?: CharitableNolContributionLimit) => NolIncomeContext,
  computeAlternativeIncome: (deduction: Decimal, modified: boolean, charitableContributionLimit?: CharitableNolContributionLimit,
    actualRegularNol?: NetOperatingLossResult, actualRegularDeductionMethod?: NolIncomeContext["deductionUsed"],
    actualRegularQbiDeduction?: Decimal) => NolAlternativeIncomeContext): NetOperatingLossReturnResult {
  const facts = input.netOperatingLoss;
  if (!facts) throw new Error("Actual NOL return computation requires the actual carry source packet");
  // Source completeness cannot depend on whether a small gift creates an
  // excess. Replays always retain the original K1 basis and crypto receipts.
  const determinedOrigins = usesDeterminedCharitableNolOrigins(input);
  const regularOriginLimit = determinedOrigins ? createCharitableNolOriginLimit(input, "regular") : undefined;
  const originalCharitableSource = !determinedOrigins && hasOriginalCharitableNolSources(input) ? readCurrentCharitableSourceForNol(input) : undefined;
  const priorCharitableSources = !determinedOrigins && hasPriorCharitableNolSources(input) ? readPriorCharitableNolSources(input) : undefined;
  const currentOrigin = input.form172 ? calculateForm172Return(input) : undefined;
  if (input.foreignTaxElection?.deductionYearCarryover && !hasCompleteEmptyForeignNolSources(input)) {
    throw new Error("Actual NOL and foreign deduction-year carry require the coupled foreign-source hypothetical worksheet");
  }
  if (input.form8839?.children.some(child => d(child.employerBenefits).gt(0) || (child.isSpecialNeeds && child.employerPlanQualified))) {
    throw new Error("Actual NOL and adoption-benefit exclusions require the coupled source MAGI worksheet");
  }
  const params = { taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus, taxpayer: input.taxpayer, standardDeductionFacts: input.standardDeductionFacts, facts };
  const source = calculateNetOperatingLoss(params);
  if (input.priorYear?.nolCarryforward !== undefined && !d(input.priorYear.nolCarryforward).eq(source.availableCarryforward)) {
    throw new Error("Legacy NOL aggregate must reconcile with actual source vintages");
  }
  const eblCarry = sum(...source.vintages.flatMap(row => row.jointPool
    ? row.jointPool.components.filter(part => part.originKind === 'excess_business_loss').map(part => part.openingCarryforward.minus(part.expiredBeforeYear))
    : row.originKind === 'excess_business_loss' ? [row.openingCarryforward.minus(row.expiredBeforeYear)] : []));
  if (input.priorYear?.excessBusinessLossNOL !== undefined && !d(input.priorYear.excessBusinessLossNOL).eq(eblCarry)) {
    throw new Error("Legacy EBL carry must reconcile with the actual EBL source vintages");
  }
  if (input.scheduleK1Form1041?.some(row => d(row.finalYearNOLCarryover).gt(0))) throw new Error("Estate NOL carry requires its actual vintage and origin binding");
  calculateQbiEblNol(input);
  const alternative = facts.alternativeTax;
  // A current MTC adjustment is not an NOL carry-basis amount. Only actual
  // empty original inventories can use this exception; exhausted and expired
  // originals still retain their existing source/basis method. Source-level
  // current adjustments and MTCNOL/MTFTCE histories are independently checked.
  const emptyCurrentMtcHistories = Boolean(readCurrentMinimumTaxCreditSources(input, input))
    && facts.vintages?.length === 0 && alternative?.vintages?.length === 0 && !currentOrigin;
  if (alternative?.sourceFactsConfirmed !== true || !alternative.sourceReference?.trim()
    || alternative.allCarryoversIncluded !== true || alternative.specialDisasterCarryIncluded !== false
    || alternative.currentYearAdjustmentsCompleteConfirmed !== true
    || (emptyCurrentMtcHistories
      ? typeof alternative.regularBasisAndLossLimitsSameAsAlternativeConfirmed !== 'boolean'
      : alternative.regularBasisAndLossLimitsSameAsAlternativeConfirmed !== true)
    || !Array.isArray(alternative.vintages)) {
    throw new Error("NOL requires the separate actual complete AMT carry history and special-loss classification");
  }
  const alternativeTaxSources = calculateNetOperatingLoss({ ...params, facts: { ...facts, ...alternative,
    filingUnitHistory: alternative.filingUnitHistory, sameCoupleJointHistory: alternative.sameCoupleJointHistory } });
  if (facts.returnMembership === "changed_membership") assertNolFilingUnitAgreement(input.taxpayer, facts.filingUnitHistory, alternative.filingUnitHistory, input.standardDeductionFacts);
  if (!emptyCurrentMtcHistories && input.scheduleK1.some(row => !d(row.amtDepletion).isZero())) {
    throw new Error("ATNOL with depletion requires its refigured AMT taxable-income limitation worksheet");
  }
  if (!emptyCurrentMtcHistories && input.scheduleK1.some(row => !d(row.amtDepreciationAdjustment).isZero() || !d(row.amtAdjustedGainOrLoss).isZero())) {
    throw new Error("Actual AMT basis differences contradict the confirmed same-basis NOL method");
  }
  const actualIncome = computeIncome(d("0"), false, "current-limit", regularOriginLimit);
  const modifiedIncome = computeIncome(d("0"), true, "modified", regularOriginLimit);
  if (input.foreignTaxElection?.deductionYearCarryover
    && (actualIncome.currentExcessBusinessLoss.gt(0) || actualIncome.agi.lt(0) || modifiedIncome.agi.lt(0))) {
    throw new Error("Foreign deduction-year empty-history composition cannot contain a current loss");
  }
  if (!currentOrigin && (modifiedIncome.agi.lt(0) || actualIncome.currentExcessBusinessLoss.gt(0))) {
    throw new Error("Existing NOL carry with a potential current-year original loss requires its separate original-loss worksheet");
  }
  const bases = { taxableIncomeWithoutNolQbiAndSection250: actualIncome.taxableIncome,
    modifiedTaxableIncomeWithoutNolQbiAndSection250: modifiedIncome.taxableIncome };
  const claims = calculateNetOperatingLoss({ ...params, context: bases });
  const modifiedVintageIncome = claims.vintages.filter(row => row.openingCarryforward.gt(row.expiredBeforeYear)).map(row => {
    const retained = row.earlierModifiedNolDeductions;
    if (retained === undefined) throw new Error("Canonical NOL earlier-vintage amount is incomplete");
    return { sourceId: row.sourceId, retainedEarlierDeduction: retained, income: retained.isZero() ? modifiedIncome : computeIncome(retained, true, "modified", regularOriginLimit) };
  });
  const result = calculateNetOperatingLoss({ ...params, context: { ...bases, carryoverContexts: modifiedVintageIncome.map(row => ({
    sourceId: row.sourceId, priorNolDeductions: row.retainedEarlierDeduction,
    modifiedTaxableIncomeBeforeTwentyPercentReduction: row.income.taxableIncome,
  })) } });
  if (!result.calculationComplete || result.deduction === undefined || result.carryforward === undefined
    || result.absorbed === undefined || result.expired === undefined) throw new Error("Actual NOL income and carry computations are incomplete");
  const finalIncome = computeIncome(result.deduction, false, "final", regularOriginLimit);
  const actualRegularDeduction = result.deduction;
  let charitableCarryover: CharitableNolCarryoverResult | undefined;
  let priorCharitableCarryover: PriorCharitableNolCarryoverResult | undefined;
  let determinedCharitableCarryover: DeterminedCharitableNolResult | undefined;
  let charitableCounterfactual: NetOperatingLossReturnResult["charitableCounterfactual"];
  const computeCharitableComparison = (charitableContributionLimit: CharitableNolContributionLimit): Decimal => {
    const counterfactual = computeIncome(d("0"), true, "modified", charitableContributionLimit);
    const counterfactualBases = { ...bases, modifiedTaxableIncomeWithoutNolQbiAndSection250: counterfactual.taxableIncome };
    const counterfactualClaims = calculateNetOperatingLoss({ ...params, context: counterfactualBases });
    const modifiedContexts = counterfactualClaims.vintages.filter(row => row.openingCarryforward.gt(row.expiredBeforeYear)).map(row => {
      const retained = row.earlierModifiedNolDeductions;
      if (retained === undefined) throw new Error("Charitable NOL counterfactual earlier-vintage amount is incomplete");
      const income = retained.isZero() ? counterfactual : computeIncome(retained, true, "modified", charitableContributionLimit);
      return { sourceId: row.sourceId, retainedEarlierDeduction: retained, income };
    });
    const contexts = modifiedContexts.map(row => ({ sourceId: row.sourceId, priorNolDeductions: row.retainedEarlierDeduction,
      modifiedTaxableIncomeBeforeTwentyPercentReduction: row.income.taxableIncome }));
    const comparison = calculateNetOperatingLoss({ ...params, context: { ...counterfactualBases, carryoverContexts: contexts } });
    if (!comparison.calculationComplete || comparison.carryforward === undefined) throw new Error("Charitable NOL counterfactual carry is incomplete");
    charitableCounterfactual = { income: counterfactual, modifiedVintageIncome: modifiedContexts, calculation: comparison };
    return comparison.carryforward;
  };
  if (determinedOrigins) {
    determinedCharitableCarryover = calculateDeterminedCharitableNol({ input, ledger: "regular", normalContributionBase: finalIncome.agi,
      normalDeductionUsed: finalIncome.deductionUsed, nolCarryforward: result.carryforward, computeCarryover: computeCharitableComparison });
    if (finalIncome.deductionUsed === "itemized" && !determinedCharitableCarryover.normalReportedDeduction.eq(finalIncome.charitableDeduction)) {
      throw new Error("Determined charitable normal use must reconcile the actual selected ScheduleA deduction");
    }
  } else if (priorCharitableSources) {
    priorCharitableCarryover = calculatePriorCharitableNolCarryover({ input, ledger: "regular", normalContributionBase: finalIncome.agi,
      normalDeductionUsed: finalIncome.deductionUsed, nolCarryforward: result.carryforward, computeCarryover: computeCharitableComparison });
    if (!roundDollar(priorCharitableCarryover.normalTreatedAsPaid).eq(finalIncome.charitableDeduction)) {
      throw new Error("Prior charitable normal-year use must reconcile with the actual ScheduleA candidate");
    }
  } else if (result.carryforward.gt(0) && finalIncome.charitableCarryforward.gt(0)
    && modifiedVintageIncome.some(row => row.income.charitableDeduction.gt(finalIncome.charitableDeduction))) {
    if (input.taxpayer.taxYear === 2026 && finalIncome.deductionUsed === "standard") {
      throw new Error("2026 standard-deduction charitable carry requires its separate170(p) and floor coordination method");
    }
    charitableCarryover = calculateCharitableNolCarryover({ input, tentativeCarryforward: finalIncome.charitableCarryforward,
      nolCarryforward: result.carryforward, alternativeTaxNolAvailable: alternativeTaxSources.availableCarryforward,
      computeCarryover: computeCharitableComparison });
  }
  // Reg1.55-1(b): individual AMT income keeps the applicable regular-tax AGI
  // basis. Restore the actual regular deduction on6251line2e; never substitute
  // an alternative-tax deduction into regular AGI-dependent worksheets.
  const actualRegularDeductionMethod = priorCharitableSources || determinedOrigins ? finalIncome.deductionUsed : undefined;
  const alternativePriorSourceLimit = determinedOrigins ? createCharitableNolOriginLimit(input, "alternative") : priorCharitableSources
    ? createPriorCharitableNolLimit(input, "alternative", priorCharitableSources.alternative[0]?.amount ?? d("0")) : undefined;
  const regularLedgerIncome = priorCharitableSources || determinedOrigins
    ? computeAlternativeIncome(result.deduction, false, undefined, result, actualRegularDeductionMethod) : undefined;
  const actualAlternativeIncome = computeAlternativeIncome(result.deduction, false, alternativePriorSourceLimit, result,
    actualRegularDeductionMethod, regularLedgerIncome?.qbiDeduction);
  const modifiedAlternativeIncome = computeAlternativeIncome(result.deduction, true, alternativePriorSourceLimit, result, actualRegularDeductionMethod);
  if (emptyCurrentMtcHistories && (actualAlternativeIncome.amti.lt(0) || modifiedAlternativeIncome.amti.lt(0))) {
    throw new Error("Current MTC empty NOL histories require the actual current original-loss worksheet for negative actual or modified AMTI");
  }
  // The separate opening changes this year's AMT deduction even with known-zero
  // ATNOL. Retain the regular choice and actual199A deduction (1.199A-1(e)(5)),
  // then carry the source-derived signed AMTI difference to final6251line3.
  const priorCharitableAlternativeAdjustment = regularLedgerIncome ? {
    regularLedgerIncome, independentIncome: actualAlternativeIncome, amount: actualAlternativeIncome.amti.minus(regularLedgerIncome.amti),
  } : undefined;
  const alternativeTax = calculateAlternativeTaxNol({ taxYear: input.taxpayer.taxYear, sources: alternativeTaxSources,
    amtiBeforeAtnol: actualAlternativeIncome.amti, modifiedAmtiBeforeAtnol: modifiedAlternativeIncome.amti });
  let alternativeCharitableCarryover: AlternativeCharitableNolCarryoverResult | undefined;
  let priorAlternativeCharitableCarryover: PriorCharitableNolCarryoverResult | undefined;
  let determinedAlternativeCharitableCarryover: DeterminedCharitableNolResult | undefined;
  let alternativeCharitableCounterfactual: NetOperatingLossReturnResult["alternativeCharitableCounterfactual"];
  const hasCharitableSources = input.donations.some(row => !d(row.amount).isZero())
    || input.scheduleK1.some(row => [row.charitableCash, row.charitableCapitalGain30, row.charitableCapitalGain20].some(value => !d(value).isZero()))
    || (input.cryptoIncome?.donations.length ?? 0) > 0 || finalIncome.charitableCarryforward.gt(0)
    || alternative.charitableCarryoverHistory !== undefined;
  const computeAlternativeCharitableComparison = (charitableContributionLimit: CharitableNolContributionLimit): Decimal => {
    const income = computeAlternativeIncome(actualRegularDeduction, true, charitableContributionLimit, result, actualRegularDeductionMethod);
    const comparison = calculateAlternativeTaxNol({ taxYear: input.taxpayer.taxYear, sources: alternativeTaxSources,
      amtiBeforeAtnol: actualAlternativeIncome.amti, modifiedAmtiBeforeAtnol: income.amti });
    if (!comparison.deduction.eq(alternativeTax.deduction)) throw new Error("Alternative charitable comparison must preserve the actual current ATNOLD");
    alternativeCharitableCounterfactual = { income, calculation: comparison };
    return comparison.carryforward;
  };
  if (determinedOrigins) {
    determinedAlternativeCharitableCarryover = calculateDeterminedCharitableNol({ input, ledger: "alternative", normalContributionBase: finalIncome.agi,
      normalDeductionUsed: finalIncome.deductionUsed, nolCarryforward: alternativeTax.carryforward,
      computeCarryover: computeAlternativeCharitableComparison });
  } else if (priorCharitableSources) {
    priorAlternativeCharitableCarryover = calculatePriorCharitableNolCarryover({ input, ledger: "alternative", normalContributionBase: finalIncome.agi,
      normalDeductionUsed: finalIncome.deductionUsed, nolCarryforward: alternativeTax.carryforward,
      computeCarryover: computeAlternativeCharitableComparison });
  } else if (alternativeTaxSources.availableCarryforward.gt(0) && hasCharitableSources) {
    if (input.taxpayer.taxYear === 2026 && finalIncome.deductionUsed === "standard") {
      throw new Error("2026 standard-deduction charitable carry requires its separate170(p) and floor coordination method");
    }
    alternativeCharitableCarryover = calculateAlternativeCharitableNolCarryover({ input,
      tentativeCarryforward: finalIncome.charitableCarryforward,
      alternativeTaxNolAvailable: alternativeTaxSources.availableCarryforward, nolCarryforward: alternativeTax.carryforward,
      computeCarryover: computeAlternativeCharitableComparison });
  }
  // Completed108 composition is checked only after current tax and both
  // original modified/comparison vectors exist. It must preserve this
  // original charitable benefit; no hypothetical current deduction is used.
  const audit = new AuditTrail();
  if (originalCharitableSource) audit.record("Section170 Original NOL Sources", "qualified-current",
    "Original qualified K1 and digital-asset contribution value", originalCharitableSource.amount,
    "Validated current source category and medium after original valuation and entity basis; receipts remain unchanged in each internal NOL comparison");
  if (priorCharitableAlternativeAdjustment) audit.record("Prior Charitable NOL Carry", "alternative:current-adjustment",
    "Independent prior charity current AMT adjustment", priorCharitableAlternativeAdjustment.amount,
    "Actual independent AMT opening at applicable regular AGI, retaining regular deduction choice and199A amount",
    { "AMTI with regular charity ledger": priorCharitableAlternativeAdjustment.regularLedgerIncome.amti,
      "AMTI with independent charity ledger": priorCharitableAlternativeAdjustment.independentIncome.amti,
      "Actual regular199A retained": priorCharitableAlternativeAdjustment.regularLedgerIncome.qbiDeduction });
  for (const [stage, context] of [["actual-limit", actualIncome], ["modified-limit", modifiedIncome]] as const) {
    audit.record("Section172 Canonical Income", stage, "Refigured income before172,199A and250", context.taxableIncome,
      "Recompute original income and AGI-dependent deductions for this statutory context", {
        AGI: context.agi, "IRA deduction": context.iraDeduction, "Taxable Social Security": context.socialSecurityBenefitsTaxable,
        "Allowed passive loss": context.allowedPassiveLoss, "Medical deduction": context.medicalDeduction,
        "Removed capital loss": context.capitalLossModification, "Restored1202 gain after loss netting": context.section1202Modification,
        "Removed senior deduction": context.seniorDeduction,
      });
  }
  const exactRatios: Array<{ numerator: Decimal; denominator: Decimal }> = [];
  const Exact = Decimal.clone({ precision: Math.max(80, JSON.stringify(facts.vintages).length * 2 + 32) });
  const section1411Amounts = result.vintages.map(row => {
    if (row.jointPool) {
      const parts = row.jointPool.components.map(component => {
        const value = facts.vintages?.find(item => item.sourceId === component.sourceId)?.section1411OriginalLoss;
        if (value === undefined || !/^\d+$/.test(value) || !d(value).isFinite() || d(value).gt(component.originalLoss)
          || row.lossTaxYear < 2013 && !d(value).isZero()) throw new Error('NOL requires each actual originating Section1411 loss, including known zero');
        return { original: new Exact(component.originalLoss.toFixed()), investment: new Exact(value),
          available: new Exact(component.openingCarryforward.minus(component.expiredBeforeYear).toFixed()) };
      });
      const active = parts.filter(part => part.available.gt(0)), claimed = new Exact((row.deduction ?? d('0')).toFixed());
      const available = active.reduce((total, part) => total.plus(part.available), new Exact(0));
      const ratios: typeof exactRatios = [];
      if (claimed.gt(0)) {
        if (claimed.eq(available)) {
          for (const part of active) ratios.push({ numerator: part.available.times(part.investment), denominator: part.original });
        } else {
          const first = active[0]!;
          if (active.some(part => !part.investment.times(first.original).eq(first.investment.times(part.original)))) {
            throw new Error('NOL partially used joint pool with different original Section1411 fractions requires its component attribution method');
          }
          ratios.push({ numerator: claimed.times(first.investment), denominator: first.original });
        }
      }
      exactRatios.push(...ratios);
      const amount = new Decimal(ratios.reduce((total, ratio) => total.plus(ratio.numerator.div(ratio.denominator)), new Exact(0)).toFixed());
      audit.record('Section1411 NOL Worksheet', row.sourceId, 'Applicable portion of joint NOL deduction', amount,
        'Actual original component fractions; zero use, equal active fractions, or full pool consumption determines the amount without owner priority',
        { 'Original owner components': String(parts.length), 'Regular joint deduction': row.deduction ?? d('0'),
          'Available joint carry': new Decimal(available.toFixed()) });
      return amount;
    }
    const record = facts.vintages?.find(item => item.sourceId === row.sourceId);
    const value = record?.section1411OriginalLoss;
    if (value === undefined || !/^\d+$/.test(value) || !d(value).isFinite() || d(value).gt(row.originalLoss)
      || (row.lossTaxYear < 2013 && !d(value).isZero())) throw new Error("NOL requires each actual originating Section1411 loss, including known zero");
    const amount = row.originalLoss.isZero() ? d("0") : (row.deduction ?? d("0")).times(d(value)).div(row.originalLoss);
    if (!row.originalLoss.isZero()) exactRatios.push({ numerator: new Exact((row.deduction ?? d('0')).toFixed()).times(value), denominator: new Exact(row.originalLoss.toFixed()) });
    audit.record("Section1411 NOL Worksheet", row.sourceId, "Applicable portion of regular NOL deduction", amount,
      "Actual current regular deduction times fixed originating1411loss/originalNOL fraction; basis is the claimed deduction, not carry absorption",
      { "Original regular loss": row.originalLoss, "Original1411 loss": d(value), "Regular deduction": row.deduction ?? d("0") });
    return amount;
  });
  // A pooled method retains the exact component fractions through the final
  // line round; independently rounded owner amounts are not a source allocation.
  let exactNumerator = new Exact(0), exactDenominator = new Exact(1);
  for (const ratio of exactRatios) {
    exactNumerator = exactNumerator.times(ratio.denominator).plus(ratio.numerator.times(exactDenominator));
    exactDenominator = exactDenominator.times(ratio.denominator);
  }
  const section1411Deduction = result.vintages.some(row => row.jointPool)
    ? new Decimal(exactNumerator.times(2).plus(exactDenominator).divToInt(exactDenominator.times(2)).toFixed())
    : roundDollar(sum(...section1411Amounts));
  return { ...result, calculationComplete: true,
    ...(facts.returnMembership === "changed_membership" ? { filingUnitSourceDigest: nolFilingUnitSourceDigest(input) } : {}), deduction: result.deduction, absorbed: result.absorbed,
    expired: result.expired, carryforward: result.carryforward, actualIncome, modifiedIncome, finalIncome,
    modifiedVintageIncome, section1411Deduction,
    alternativeTaxSources, alternativeTax, charitableCarryover, charitableCounterfactual,
    alternativeCharitableCarryover, alternativeCharitableCounterfactual,
    priorCharitableCarryover, priorAlternativeCharitableCarryover, priorCharitableAlternativeAdjustment,
    determinedCharitableCarryover, determinedAlternativeCharitableCarryover,
    lines: [...result.lines, ...alternativeTax.lines, ...(charitableCarryover?.lines ?? []),
      ...(alternativeCharitableCarryover?.lines ?? []), ...(priorCharitableCarryover?.lines ?? []),
      ...(determinedCharitableCarryover?.lines ?? []), ...(determinedAlternativeCharitableCarryover?.lines ?? []),
      ...(priorAlternativeCharitableCarryover?.lines ?? []), ...audit.getLines()] };
}
