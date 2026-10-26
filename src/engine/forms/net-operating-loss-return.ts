/** Canonical Section172 income-context orchestration. Spec: net-operating-loss-return.yaml. */
import Decimal from "decimal.js";
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
export interface NetOperatingLossReturnResult extends NetOperatingLossResult {
  calculationComplete: true;
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
  alternativeCharitableCounterfactual?: { income: Form6251IncomeResult; calculation: AlternativeTaxNolResult };
  charitableCounterfactual?: {
    income: NolIncomeContext;
    modifiedVintageIncome: Array<{ sourceId: string; retainedEarlierDeduction: Decimal; income: NolIncomeContext }>;
    calculation: NetOperatingLossResult;
  };
}

export function calculateNetOperatingLossReturn(input: TaxYearInput,
  computeIncome: (deduction: Decimal, modified: boolean, purpose: "current-limit" | "modified" | "final", charitableContributionLimit?: Decimal) => NolIncomeContext,
  computeAlternativeIncome: (deduction: Decimal, modified: boolean, charitableContributionLimit?: Decimal, actualRegularNol?: NetOperatingLossResult) => Form6251IncomeResult): NetOperatingLossReturnResult {
  const facts = input.netOperatingLoss;
  if (!facts) throw new Error("Actual NOL return computation requires the actual carry source packet");
  const currentOrigin = input.form172 ? calculateForm172Return(input) : undefined;
  if (input.foreignTaxElection?.deductionYearCarryover) {
    throw new Error("Actual NOL and foreign deduction-year carry require the coupled foreign-source hypothetical worksheet");
  }
  if (input.form8839?.children.some(child => d(child.employerBenefits).gt(0) || (child.isSpecialNeeds && child.employerPlanQualified))) {
    throw new Error("Actual NOL and adoption-benefit exclusions require the coupled source MAGI worksheet");
  }
  const params = { taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus, taxpayer: input.taxpayer, facts };
  const source = calculateNetOperatingLoss(params);
  if (input.priorYear?.nolCarryforward !== undefined && !d(input.priorYear.nolCarryforward).eq(source.availableCarryforward)) {
    throw new Error("Legacy NOL aggregate must reconcile with actual source vintages");
  }
  const eblCarry = sum(...source.vintages.filter(row => row.originKind === "excess_business_loss").map(row => row.openingCarryforward.minus(row.expiredBeforeYear)));
  if (input.priorYear?.excessBusinessLossNOL !== undefined && !d(input.priorYear.excessBusinessLossNOL).eq(eblCarry)) {
    throw new Error("Legacy EBL carry must reconcile with the actual EBL source vintages");
  }
  if (input.scheduleK1Form1041?.some(row => d(row.finalYearNOLCarryover).gt(0))) throw new Error("Estate NOL carry requires its actual vintage and origin binding");
  calculateQbiEblNol(input);
  const alternative = facts.alternativeTax;
  if (alternative?.sourceFactsConfirmed !== true || !alternative.sourceReference?.trim()
    || alternative.allCarryoversIncluded !== true || alternative.specialDisasterCarryIncluded !== false
    || alternative.currentYearAdjustmentsCompleteConfirmed !== true || alternative.regularBasisAndLossLimitsSameAsAlternativeConfirmed !== true
    || !Array.isArray(alternative.vintages)) {
    throw new Error("NOL requires the separate actual complete AMT carry history and special-loss classification");
  }
  const alternativeTaxSources = calculateNetOperatingLoss({ ...params, facts: { ...facts, ...alternative } });
  if (input.scheduleK1.some(row => !d(row.amtDepletion).isZero())) {
    throw new Error("ATNOL with depletion requires its refigured AMT taxable-income limitation worksheet");
  }
  if (input.scheduleK1.some(row => !d(row.amtDepreciationAdjustment).isZero() || !d(row.amtAdjustedGainOrLoss).isZero())) {
    throw new Error("Actual AMT basis differences contradict the confirmed same-basis NOL method");
  }
  const actualIncome = computeIncome(d("0"), false, "current-limit");
  const modifiedIncome = computeIncome(d("0"), true, "modified");
  if (!currentOrigin && (modifiedIncome.agi.lt(0) || actualIncome.currentExcessBusinessLoss.gt(0))) {
    throw new Error("Existing NOL carry with a potential current-year original loss requires its separate original-loss worksheet");
  }
  const bases = { taxableIncomeWithoutNolQbiAndSection250: actualIncome.taxableIncome,
    modifiedTaxableIncomeWithoutNolQbiAndSection250: modifiedIncome.taxableIncome };
  const claims = calculateNetOperatingLoss({ ...params, context: bases });
  const modifiedVintageIncome = claims.vintages.filter(row => row.openingCarryforward.gt(row.expiredBeforeYear)).map(row => {
    const retained = row.earlierModifiedNolDeductions;
    if (retained === undefined) throw new Error("Canonical NOL earlier-vintage amount is incomplete");
    return { sourceId: row.sourceId, retainedEarlierDeduction: retained, income: retained.isZero() ? modifiedIncome : computeIncome(retained, true, "modified") };
  });
  const result = calculateNetOperatingLoss({ ...params, context: { ...bases, carryoverContexts: modifiedVintageIncome.map(row => ({
    sourceId: row.sourceId, priorNolDeductions: row.retainedEarlierDeduction,
    modifiedTaxableIncomeBeforeTwentyPercentReduction: row.income.taxableIncome,
  })) } });
  if (!result.calculationComplete || result.deduction === undefined || result.carryforward === undefined
    || result.absorbed === undefined || result.expired === undefined) throw new Error("Actual NOL income and carry computations are incomplete");
  const finalIncome = computeIncome(result.deduction, false, "final");
  const actualRegularDeduction = result.deduction;
  let charitableCarryover: CharitableNolCarryoverResult | undefined;
  let charitableCounterfactual: NetOperatingLossReturnResult["charitableCounterfactual"];
  if (result.carryforward.gt(0) && finalIncome.charitableCarryforward.gt(0)
    && modifiedVintageIncome.some(row => row.income.charitableDeduction.gt(finalIncome.charitableDeduction))) {
    if (input.taxpayer.taxYear === 2026 && finalIncome.deductionUsed === "standard") {
      throw new Error("2026 standard-deduction charitable carry requires its separate170(p) and floor coordination method");
    }
    charitableCarryover = calculateCharitableNolCarryover({ input, tentativeCarryforward: finalIncome.charitableCarryforward,
      nolCarryforward: result.carryforward, alternativeTaxNolAvailable: alternativeTaxSources.availableCarryforward,
      computeCarryover: charitableContributionLimit => {
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
      } });
  }
  // Reg1.55-1(b): individual AMT income keeps the applicable regular-tax AGI
  // basis. Restore the actual regular deduction on6251line2e; never substitute
  // an alternative-tax deduction into regular AGI-dependent worksheets.
  const actualAlternativeIncome = computeAlternativeIncome(result.deduction, false, undefined, result);
  const modifiedAlternativeIncome = computeAlternativeIncome(result.deduction, true, undefined, result);
  const alternativeTax = calculateAlternativeTaxNol({ taxYear: input.taxpayer.taxYear, sources: alternativeTaxSources,
    amtiBeforeAtnol: actualAlternativeIncome.amti, modifiedAmtiBeforeAtnol: modifiedAlternativeIncome.amti });
  let alternativeCharitableCarryover: AlternativeCharitableNolCarryoverResult | undefined;
  let alternativeCharitableCounterfactual: NetOperatingLossReturnResult["alternativeCharitableCounterfactual"];
  const hasCharitableSources = input.donations.some(row => !d(row.amount).isZero())
    || input.scheduleK1.some(row => [row.charitableCash, row.charitableCapitalGain30, row.charitableCapitalGain20].some(value => !d(value).isZero()))
    || (input.cryptoIncome?.donations.length ?? 0) > 0 || finalIncome.charitableCarryforward.gt(0)
    || alternative.charitableCarryoverHistory !== undefined;
  if (alternativeTaxSources.availableCarryforward.gt(0) && hasCharitableSources) {
    if (input.taxpayer.taxYear === 2026 && finalIncome.deductionUsed === "standard") {
      throw new Error("2026 standard-deduction charitable carry requires its separate170(p) and floor coordination method");
    }
    alternativeCharitableCarryover = calculateAlternativeCharitableNolCarryover({ input,
      tentativeCarryforward: finalIncome.charitableCarryforward,
      alternativeTaxNolAvailable: alternativeTaxSources.availableCarryforward, nolCarryforward: alternativeTax.carryforward,
      computeCarryover: charitableContributionLimit => {
        // Only the modified absorption context removes excess gifts. The actual
        // regular NOLD and current AMTI/ATNOLD remain unchanged (Reg1.55-1(b)).
        const income = computeAlternativeIncome(actualRegularDeduction, true, charitableContributionLimit, result);
        const comparison = calculateAlternativeTaxNol({ taxYear: input.taxpayer.taxYear, sources: alternativeTaxSources,
          amtiBeforeAtnol: actualAlternativeIncome.amti, modifiedAmtiBeforeAtnol: income.amti });
        if (!comparison.deduction.eq(alternativeTax.deduction)) throw new Error("Alternative charitable comparison must preserve the actual current ATNOLD");
        alternativeCharitableCounterfactual = { income, calculation: comparison };
        return comparison.carryforward;
      } });
  }
  const audit = new AuditTrail();
  for (const [stage, context] of [["actual-limit", actualIncome], ["modified-limit", modifiedIncome]] as const) {
    audit.record("Section172 Canonical Income", stage, "Refigured income before172,199A and250", context.taxableIncome,
      "Recompute original income and AGI-dependent deductions for this statutory context", {
        AGI: context.agi, "IRA deduction": context.iraDeduction, "Taxable Social Security": context.socialSecurityBenefitsTaxable,
        "Allowed passive loss": context.allowedPassiveLoss, "Medical deduction": context.medicalDeduction,
        "Removed capital loss": context.capitalLossModification, "Restored1202 gain after loss netting": context.section1202Modification,
        "Removed senior deduction": context.seniorDeduction,
      });
  }
  const section1411Amounts = result.vintages.map(row => {
    const record = facts.vintages?.find(item => item.sourceId === row.sourceId);
    const value = record?.section1411OriginalLoss;
    if (value === undefined || !/^\d+$/.test(value) || !d(value).isFinite() || d(value).gt(row.originalLoss)
      || (row.lossTaxYear < 2013 && !d(value).isZero())) throw new Error("NOL requires each actual originating Section1411 loss, including known zero");
    const amount = (row.deduction ?? d("0")).times(d(value)).div(row.originalLoss);
    audit.record("Section1411 NOL Worksheet", row.sourceId, "Applicable portion of regular NOL deduction", amount,
      "Actual current regular deduction times fixed originating1411loss/originalNOL fraction; basis is the claimed deduction, not carry absorption",
      { "Original regular loss": row.originalLoss, "Original1411 loss": d(value), "Regular deduction": row.deduction ?? d("0") });
    return amount;
  });
  return { ...result, calculationComplete: true, deduction: result.deduction, absorbed: result.absorbed,
    expired: result.expired, carryforward: result.carryforward, actualIncome, modifiedIncome, finalIncome,
    modifiedVintageIncome, section1411Deduction: roundDollar(sum(...section1411Amounts)),
    alternativeTaxSources, alternativeTax, charitableCarryover, charitableCounterfactual,
    alternativeCharitableCarryover, alternativeCharitableCounterfactual,
    lines: [...result.lines, ...alternativeTax.lines, ...(charitableCarryover?.lines ?? []),
      ...(alternativeCharitableCarryover?.lines ?? []), ...audit.getLines()] };
}
