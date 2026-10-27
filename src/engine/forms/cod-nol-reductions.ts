/** Actual insolvency sources and after-tax108(b) NOL reductions.
 * Spec: spec/federal/cod-nol-reductions.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { Form982NolSources } from '@/models/cod-nol-sources.js';
import type { CalculatedLine } from '@/models/outputs.js';
import type { NetOperatingLossReturnResult } from './net-operating-loss-return.js';
import type { Form172ReturnResult } from './form-172-return.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, roundDollar, sum, zeroFloor } from '@/utils/decimal.js';

export interface CodNolVintageReduction {
  sourceId: string; lossTaxYear: number; originalLoss: Decimal;
  beforeReduction: Decimal; currentTaxUse: Decimal; modifiedAbsorption: Decimal; modifiedAvailableBeforeReduction: Decimal;
  attributeReduction: Decimal; expiredAfterReduction: Decimal; remainingCarryforward: Decimal;
  charitableComparison?: { modifiedAbsorption: Decimal; beforeReduction: Decimal; expiredAfterReduction: Decimal; remainingCarryforward: Decimal };
  section1411OriginalLoss?: Decimal; section1411RemainingCarryforward?: Decimal;
}
export interface CodNolLedgerReduction {
  beforeReduction: Decimal; carryforwardBeforeReduction: Decimal; reduction: Decimal;
  currentTaxUse: Decimal; modifiedAbsorption: Decimal; modifiedUseAdjustment: Decimal; modifiedAvailableBeforeReduction: Decimal;
  expiredAfterReduction: Decimal; carryforward: Decimal; vintages: CodNolVintageReduction[];
  charitableComparison?: { carryforwardBeforeReduction: Decimal; expiredAfterReduction: Decimal; carryforward: Decimal;
    nolDifferenceBeforeReduction: Decimal; nolDifferenceAfterReduction: Decimal };

}
export interface CodNolReductionResult {
  sourceFactsVerified: true; calculationComplete: boolean; sourceExcludedAmount: Decimal;
  reportedExcludedAmount: Decimal; insolvencyAmount: Decimal;
  regular?: CodNolLedgerReduction; alternativeTax?: CodNolLedgerReduction; lines: CalculatedLine[];
}
function actual(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error(`COD requires actual finite nonnegative ${label}`);
  return d(value);
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`COD requires actual ${label}`);
  return value.trim();
}
function name(value: string): string { return value.trim().replace(/\s+/g, ' ').toLowerCase(); }
function date(value: string | undefined, year: number): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) !== year
    || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('COD requires the actual current-year discharge date');
  return value;
}
function sourceTotal(rows: NonNullable<NonNullable<Form982NolSources['insolvency']>['assets']> | undefined, label: string): Decimal {
  if (!Array.isArray(rows)) throw new Error(`COD requires actual complete insolvency ${label}, including an explicit empty list when none`);
  const ids = new Set<string>();
  return sum(...rows.map(row => {
    const id = text(row.sourceId, `${label} source identity`);
    if (ids.has(id)) throw new Error(`COD duplicate insolvency ${label} source`);
    ids.add(id); text(row.description, `${label} description`); text(row.sourceReference, `${label} record`);
    return actual(row.amount, `${label} amount`);
  }));
}
function canonical(value: Decimal | undefined, label: string): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite() || value.lt(0) || !value.isInteger()) throw new Error(`COD requires complete canonical whole-dollar ${label}`);
  return value;
}

/** Precisely the actual records consumed; source-only callers need no fabricated return. */
export type CodNolSourceInput = Pick<TaxYearInput, 'form982NolSources' | 'netOperatingLoss' | 'form1099C' | 'form172'> & {
  taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus'> & {
    primary: Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn'>;
  };
  codExclusion?: Pick<NonNullable<TaxYearInput['codExclusion']>, 'bankruptcy' | 'insolvency' | 'electBasisReductionFirst'
    | 'qualifiedPrincipalResidence' | 'qualifiedFarmExclusion' | 'qualifiedRealPropertyBusinessExclusion'>;
};

export function calculateCodNolReduction(input: CodNolSourceInput, context?: {
  priorLoss: NetOperatingLossReturnResult; currentOrigin?: Form172ReturnResult;
}): CodNolReductionResult {
  const facts = input.form982NolSources, year = input.taxpayer.taxYear, joint = input.taxpayer.filingStatus === 'married_filing_jointly';
  if (!facts || ![2025, 2026].includes(year) || facts.sourceTaxYear !== year || facts.sourceFactsConfirmed !== true
    || facts.allDischargesIncluded !== true || !facts.sourceReference?.trim()) throw new Error('COD requires complete actual Form982 NOL source records and year');
  if (!input.netOperatingLoss) throw new Error('COD vintage attribute reduction requires complete independent regular and AMT NOL carry sources');
  if (joint || facts.communityPropertyApplies !== false) throw new Error('COD joint or community ownership needs its separate actual attribute allocation method');
  if (facts.title11Case !== false || facts.electBasisReductionFirst !== false || facts.otherExclusionsOrExceptionsApply !== false
    || facts.regularAndAlternativeExclusionSameConfirmed !== true) throw new Error('COD title11, unknown exclusions, basis-first or different AMT exclusions require their separate source method');
  const exclusion = input.codExclusion;
  if (!exclusion?.insolvency || exclusion.bankruptcy || exclusion.electBasisReductionFirst || exclusion.qualifiedPrincipalResidence
    || !d(exclusion.qualifiedFarmExclusion).isZero() || !d(exclusion.qualifiedRealPropertyBusinessExclusion).isZero()) {
    throw new Error('COD source route requires its actual insolvency-only exclusion and no conflicting legacy election');
  }
  if (!Array.isArray(facts.debts) || facts.debts.length === 0 || facts.debts.length !== input.form1099C.length) {
    throw new Error('COD requires each actual original statement exactly once');
  }
  const used = new Set<string>(), statements = new Set<string>(), accounts = new Set<string>(), days = new Set<string>();
  const primary = input.taxpayer.primary, primaryId = primary.ssn.replace(/-/g, '');
  const sourceAmounts = new Map<string, Decimal>();
  for (const debt of facts.debts) {
    const id = text(debt.sourceId, 'original statement source ID');
    const match = /^form1099C:(0|[1-9]\d*)$/.exec(id);
    const original = match ? input.form1099C[Number(match[1])] : undefined;
    const statement = text(debt.statementId, 'original statement identity');
    if (!original || used.has(id) || statements.has(statement)) throw new Error('COD original source is missing or duplicated');
    used.add(id); statements.add(statement);
    if (debt.sourceTaxYear !== year || debt.sourceFactsConfirmed !== true) throw new Error('COD original source year and confirmation must be actual');
    text(debt.sourceReference, 'original source record'); text(debt.creditorTin, 'original creditor TIN');
    if (!/^\d{2}-?\d{7}$/.test(debt.creditorTin ?? '')) throw new Error('COD requires original creditor TIN');
    const creditor = text(debt.creditor, 'original creditor'), account = text(debt.accountReference, 'original account');
    const day = date(debt.dischargeDate, year); days.add(day);
    const accountKey = `${debt.creditorTin?.replace(/-/g, '')}|${account}|${day}`;
    if (accounts.has(accountKey)) throw new Error('COD duplicate original debt event requires a separately reconciled corrected statement');
    accounts.add(accountKey);
    if (debt.accountHolder !== 'primary' || !/^\d{9}$/.test(primaryId) || debt.debtorSsnLast4 !== primaryId.slice(-4)
      || name(text(debt.debtorName, 'actual debtor name')) !== name(`${primary.firstName} ${primary.lastName}`)) throw new Error('COD actual source owner must match the continuing individual');
    if (debt.unsecuredPersonalDebtConfirmed !== true || debt.noPropertyTransferConfirmed !== true || debt.personallyLiable !== true
      || !/^[B-H]$/.test(debt.identifiableEventCode ?? '')) throw new Error('COD requires actual personal recourse debt without title11 or property disposition');
    const amount = actual(debt.amountDischarged, 'original Box2'), interest = actual(debt.interestIncluded, 'original Box3'), property = actual(debt.fmvOfProperty, 'original Box7');
    if (!amount.gt(0) || !interest.isZero() || !property.isZero()) throw new Error('COD interest, property or zero-debt source requires its separate exclusion method');
    if (creditor !== original.creditor.trim() || text(debt.debtDescription, 'original debt description') !== original.debtDescription?.trim()
      || debt.personallyLiable !== original.personallyLiable || debt.identifiableEventCode !== original.identifiableEventCode
      || !amount.eq(d(original.amountDischarged)) || !interest.eq(d(original.interestIncluded)) || !property.eq(d(original.fmvOfProperty))) {
      throw new Error('COD original statement amounts and facts must reconcile exactly');
    }
    sourceAmounts.set(id, amount);
  }
  const insolvency = facts.insolvency;
  if (days.size !== 1 || !insolvency || insolvency.sourceFactsConfirmed !== true || !insolvency.sourceReference?.trim()
    || insolvency.immediatelyBeforeDischargeConfirmed !== true || insolvency.allAssetsIncluded !== true
    || insolvency.exemptAndRetirementAssetsIncluded !== true || insolvency.allLiabilitiesIncluded !== true
    || !days.has(date(insolvency.asOfDate, year))) throw new Error('COD requires a complete actual immediately-before-discharge insolvency worksheet for the same event date');
  const assets = sourceTotal(insolvency.assets, 'assets'), liabilities = sourceTotal(insolvency.liabilities, 'liabilities');
  if (!assets.eq(d(exclusion.insolvency.totalAssets)) || !liabilities.eq(d(exclusion.insolvency.totalLiabilities))) throw new Error('COD actual insolvency sources must reconcile with the claimed exclusion worksheet');
  const linked = new Set<string>();
  for (const row of insolvency.liabilities ?? []) {
    if (row.dischargedDebtSourceId === undefined) continue;
    const amount = sourceAmounts.get(row.dischargedDebtSourceId);
    if (!amount || linked.has(row.dischargedDebtSourceId) || actual(row.amount, 'debt balance').lt(amount)) throw new Error('COD actual pre-discharge debt liability must reconcile without duplicate source allocation');
    linked.add(row.dischargedDebtSourceId);
  }
  if (linked.size !== sourceAmounts.size || insolvency.assets?.some(row => row.dischargedDebtSourceId !== undefined)) throw new Error('COD each discharged liability must bind its actual debt source');
  const sourceExcludedAmount = sum(...sourceAmounts.values()), insolvencyAmount = zeroFloor(liabilities.minus(assets));
  if (sourceExcludedAmount.gt(insolvencyAmount)) throw new Error('COD partially taxable discharge requires its separate regular and investment income classification method');
  const reportedExcludedAmount = roundDollar(sourceExcludedAmount), audit = new AuditTrail();
  audit.record('Form982 NOL Sources', 'insolvency', 'Actual immediately-before-discharge insolvency', insolvencyAmount,
    'Complete actual liabilities less all actual asset FMV, including exempt and retirement property', { Assets: assets, Liabilities: liabilities });
  audit.record('Form 982', '2', 'Discharged debt excluded under insolvency', reportedExcludedAmount,
    'Exact full exclusion reconciles to original personal debt and actual insolvency; round the aggregate once', { 'Original excluded debt': sourceExcludedAmount });
  const base: CodNolReductionResult = { sourceFactsVerified: true, calculationComplete: false, sourceExcludedAmount, reportedExcludedAmount, insolvencyAmount, lines: audit.getLines() };
  if (!context) return base;
  const { priorLoss: prior, currentOrigin } = context;
  if (currentOrigin && (!currentOrigin.currentExcessBusinessLoss.isZero() || !currentOrigin.alternativeExcessBusinessLoss.isZero())) {
    throw new Error('COD current EBL origin requires its separate attribute-character ordering method');
  }
  if (!prior.calculationComplete || prior.sourceFactsVerified !== true || prior.alternativeTax?.sourceFactsVerified !== true
    || Boolean(input.form172) !== Boolean(currentOrigin) || (currentOrigin && (currentOrigin.taxYear !== year || !currentOrigin.calculationComplete))) {
    throw new Error('COD requires completed canonical regular and alternative current-tax and original-loss contexts');
  }
  const ledger = (alternative: boolean): CodNolLedgerReduction => {
    const priorRows = alternative ? prior.alternativeTax.vintages : prior.vintages;
    const sources = alternative ? input.netOperatingLoss?.alternativeTax?.vintages : input.netOperatingLoss?.vintages;
    const priorCarry = canonical(alternative ? prior.alternativeTax.carryforward : prior.carryforward, 'aggregate prior carry');
    const comparison = alternative ? prior.alternativeCharitableCounterfactual?.calculation : prior.charitableCounterfactual?.calculation;
    const charity = alternative
      ? prior.determinedAlternativeCharitableCarryover ?? prior.priorAlternativeCharitableCarryover ?? prior.alternativeCharitableCarryover
      : prior.determinedCharitableCarryover ?? prior.priorCharitableCarryover ?? prior.charitableCarryover;
    if (!sources || sources.length !== priorRows.length || new Set(priorRows.map(row => row.sourceId)).size !== priorRows.length) {
      throw new Error('COD canonical loss vintages must match complete original histories');
    }
    if (charity && (!canonical(charity.nolCarryforward, 'charitable normal carry').eq(priorCarry)
      || (!comparison && !canonical(charity.counterfactualNolCarryforward, 'charitable comparison carry').eq(priorCarry)))) {
      throw new Error('COD charitable benefit requires its complete original comparison');
    }
    if (comparison && (!charity || !comparison.calculationComplete || !comparison.sourceFactsVerified
      || comparison.vintages.length !== priorRows.length || new Set(comparison.vintages.map(row => row.sourceId)).size !== priorRows.length
      || !canonical(comparison.deduction, 'comparison current deduction').eq(canonical(alternative ? prior.alternativeTax.deduction : prior.deduction, 'actual current deduction'))
      || !canonical(comparison.carryforward, 'comparison prior carry').eq(canonical(charity.counterfactualNolCarryforward, 'charitable comparison carry')))) {
      throw new Error('COD charitable comparison must preserve the actual current deduction and complete original loss vector');
    }
    const rows: Array<{ sourceId: string; lossTaxYear: number; originalLoss: Decimal; beforeReduction: Decimal;
      currentTaxUse: Decimal; modifiedAbsorption: Decimal; modifiedAvailableBeforeReduction: Decimal;
      comparison?: { modifiedAbsorption: Decimal; beforeReduction: Decimal }; section1411OriginalLoss?: Decimal }> = [];
    const currentLoss = currentOrigin ? canonical((alternative ? currentOrigin.alternativeTax : currentOrigin.regular).netOperatingLoss, 'current original loss') : d('0');
    if (currentOrigin) {
      rows.push({ sourceId: `current-origin:${year}`, lossTaxYear: year, originalLoss: currentLoss, beforeReduction: currentLoss,
        currentTaxUse: d('0'), modifiedAbsorption: d('0'), modifiedAvailableBeforeReduction: currentLoss,
        ...(comparison ? { comparison: { modifiedAbsorption: d('0'), beforeReduction: currentLoss } } : {}),
        ...(!alternative ? { section1411OriginalLoss: canonical(currentOrigin.investment.netOperatingLoss, 'current investment loss') } : {}) });
    }
    for (const row of [...priorRows].sort((a, b) => a.lossTaxYear - b.lossTaxYear)) {
      const source = sources.find(value => value.sourceId === row.sourceId);
      const closing = canonical(row.remainingCarryforward, 'remaining prior loss');
      const absorbed = canonical(row.absorbed, 'prior absorption'), expired = canonical(row.expired, 'prior expiry');
      const expiredBeforeYear = canonical(row.expiredBeforeYear, 'prior unavailable loss');
      const available = canonical(row.openingCarryforward, 'opening loss').minus(expiredBeforeYear);
      const claimed = canonical(row.deduction, 'current deduction');
      // An unrestricted pre2018 claim may exceed positive taxable income.
      // The current-tax108 pool and the modified172 residual are separate.
      const currentUse = !alternative && row.lossTaxYear < 2018
        ? Decimal.min(available, zeroFloor(prior.actualIncome.taxableIncome.minus(canonical(row.earlierClaimedNolDeductions, 'earlier current deductions'))))
        : claimed;
      const before = available.minus(currentUse), modifiedBefore = available.minus(absorbed);
      if (!source || source.lossTaxYear !== row.lossTaxYear || !actual(source.originalLoss, 'original loss').eq(row.originalLoss)
        || !actual(source.openingCarryforward, 'opening loss').eq(row.openingCarryforward)
        || before.lt(0) || modifiedBefore.lt(0) || !sum(absorbed, expired, closing).eq(row.openingCarryforward)
        || !modifiedBefore.eq(closing.plus(expired).minus(expiredBeforeYear))) {
        throw new Error('COD canonical opening, current use, absorption, expiry and closing loss must conserve each original vintage');
      }
      const other = comparison?.vintages.find(value => value.sourceId === row.sourceId);
      let compared: { modifiedAbsorption: Decimal; beforeReduction: Decimal } | undefined;
      if (comparison) {
        if (!other || other.lossTaxYear !== row.lossTaxYear || !canonical(other.originalLoss, 'comparison original loss').eq(row.originalLoss)
          || !canonical(other.openingCarryforward, 'comparison opening').eq(row.openingCarryforward)
          || !canonical(other.expiredBeforeYear, 'comparison unavailable loss').eq(expiredBeforeYear)
          || !canonical(other.deduction, 'comparison current deduction').eq(claimed)) {
          throw new Error('COD charitable comparison must bind the same original vintage and actual current deduction');
        }
        const otherAbsorbed = canonical(other.absorbed, 'comparison absorption'), otherBefore = available.minus(otherAbsorbed);
        const otherExpired = canonical(other.expired, 'comparison expiry'), otherClosing = canonical(other.remainingCarryforward, 'comparison remaining carry');
        if (otherBefore.lt(0) || !sum(otherAbsorbed, otherExpired, otherClosing).eq(row.openingCarryforward)
          || !otherBefore.eq(otherClosing.plus(otherExpired).minus(expiredBeforeYear))) {
          throw new Error('COD charitable comparison must conserve each original modified loss');
        }
        compared = { modifiedAbsorption: otherAbsorbed, beforeReduction: otherBefore };
      }
      rows.push({ sourceId: row.sourceId, lossTaxYear: row.lossTaxYear, originalLoss: row.originalLoss, beforeReduction: before,
        currentTaxUse: currentUse, modifiedAbsorption: absorbed, modifiedAvailableBeforeReduction: modifiedBefore,
        ...(compared ? { comparison: compared } : {}),
        ...(!alternative ? { section1411OriginalLoss: actual('section1411OriginalLoss' in source ? source.section1411OriginalLoss : undefined, 'original1411 loss') } : {}) });
    }
    const beforeReduction = sum(...rows.map(row => row.beforeReduction));
    const currentTaxUse = sum(...rows.map(row => row.currentTaxUse)), modifiedAbsorption = sum(...rows.map(row => row.modifiedAbsorption));
    const modifiedUseAdjustment = modifiedAbsorption.minus(currentTaxUse);
    const modifiedAvailableBeforeReduction = sum(...rows.map(row => row.modifiedAvailableBeforeReduction));
    const carryforwardBeforeReduction = priorCarry.plus(currentLoss);
    const expected = carryforwardBeforeReduction.plus(sum(...priorRows.map(row =>
      canonical(row.expired, 'prior expiry').minus(canonical(row.expiredBeforeYear, 'prior unavailable loss')))));
    if (!modifiedAvailableBeforeReduction.eq(expected) || !beforeReduction.minus(modifiedUseAdjustment).eq(expected)) {
      throw new Error('COD current-use and modified-loss aggregates must reconcile separately to their original vintages');
    }
    const comparisonCarryBefore = comparison ? canonical(comparison.carryforward, 'comparison carry').plus(currentLoss) : undefined;
    if (comparison && !sum(...rows.map(row => row.comparison?.beforeReduction ?? d('0'))).eq(
      canonical(comparison.carryforward, 'comparison carry').plus(currentLoss).plus(sum(...comparison.vintages.map(row =>
        canonical(row.expired, 'comparison expiry').minus(canonical(row.expiredBeforeYear, 'comparison unavailable loss'))))))) {
      throw new Error('COD charitable comparison aggregate does not reconcile with the complete original vector');
    }
    if (reportedExcludedAmount.gt(beforeReduction)) throw new Error('COD NOL is insufficient in an independent tax system; later-attribute reduction requires its separate actual worksheet');
    let remaining = reportedExcludedAmount;
    const vintages = rows.map((row): CodNolVintageReduction => {
      // The same determined108 vector must fit both modified vectors. No
      // invented exhaustion priority or post-COD charitable revival is used.
      const attributeReduction = Decimal.min(row.beforeReduction, remaining);
      if (attributeReduction.gt(row.modifiedAvailableBeforeReduction)) {
        throw new Error('COD modified-loss exhaustion requires its separate current-use and absorption composition method');
      }
      if (row.comparison && attributeReduction.gt(row.comparison.beforeReduction)) {
        throw new Error('COD charitable comparison exhaustion requires its separate after-tax composition method');
      }
      const afterReduction = row.modifiedAvailableBeforeReduction.minus(attributeReduction);
      const expires = row.lossTaxYear < 2018 && year === row.lossTaxYear + 20;
      const expiredAfterReduction = expires ? afterReduction : d('0'), remainingCarryforward = expires ? d('0') : afterReduction;
      const comparedAfter = row.comparison?.beforeReduction.minus(attributeReduction);
      const charitableComparison = row.comparison && comparedAfter !== undefined ? {
        ...row.comparison, expiredAfterReduction: expires ? comparedAfter : d('0'), remainingCarryforward: expires ? d('0') : comparedAfter,
      } : undefined;
      remaining = remaining.minus(attributeReduction);
      if (row.section1411OriginalLoss && row.section1411OriginalLoss.gt(row.originalLoss)) throw new Error('COD original1411 loss cannot exceed original regular loss');
      const section1411RemainingCarryforward = row.section1411OriginalLoss === undefined ? undefined
        : row.originalLoss.isZero() ? d('0') : remainingCarryforward.times(row.section1411OriginalLoss).div(row.originalLoss);
      audit.record(alternative ? 'Alternative COD NOL Worksheet' : 'Regular COD NOL Worksheet', row.sourceId, 'After-tax NOL attribute reduction', attributeReduction,
        'Current loss first, then oldest current-tax carryover; the same reduction fits the separate modified residual before expiry', {
          'Origin year': String(row.lossTaxYear), 'Original loss': row.originalLoss, 'Before reduction': row.beforeReduction,
          'Actual current-tax use': row.currentTaxUse, 'Modified absorption': row.modifiedAbsorption,
          'Modified available before reduction': row.modifiedAvailableBeforeReduction,
          'Expired after reduction': expiredAfterReduction, 'Remaining carry': remainingCarryforward,
          ...(charitableComparison ? { 'Comparison modified absorption': charitableComparison.modifiedAbsorption,
            'Comparison available before reduction': charitableComparison.beforeReduction,
            'Comparison expired after reduction': charitableComparison.expiredAfterReduction,
            'Comparison remaining carry': charitableComparison.remainingCarryforward } : {}),
          ...(section1411RemainingCarryforward === undefined ? {} : { 'Applicable remaining1411 carry': section1411RemainingCarryforward }),
        });
      return { sourceId: row.sourceId, lossTaxYear: row.lossTaxYear, originalLoss: row.originalLoss, beforeReduction: row.beforeReduction,
        currentTaxUse: row.currentTaxUse, modifiedAbsorption: row.modifiedAbsorption, modifiedAvailableBeforeReduction: row.modifiedAvailableBeforeReduction,
        attributeReduction, expiredAfterReduction, remainingCarryforward,
        ...(charitableComparison ? { charitableComparison } : {}),
        ...(row.section1411OriginalLoss === undefined ? {} : { section1411OriginalLoss: row.section1411OriginalLoss, section1411RemainingCarryforward }) };
    });
    if (!remaining.isZero()) throw new Error('COD original reduction is not conserved by its original vintage vector');
    const expiredAfterReduction = sum(...vintages.map(row => row.expiredAfterReduction));
    const carryforward = sum(...vintages.map(row => row.remainingCarryforward));
    let charitableComparison: CodNolLedgerReduction['charitableComparison'];
    if (comparisonCarryBefore !== undefined) {
      const comparedCarry = sum(...vintages.map(row => row.charitableComparison?.remainingCarryforward ?? d('0')));
      const comparedExpiry = sum(...vintages.map(row => row.charitableComparison?.expiredAfterReduction ?? d('0')));
      const beforeDifference = carryforwardBeforeReduction.minus(comparisonCarryBefore), afterDifference = carryforward.minus(comparedCarry);
      if (beforeDifference.lt(0) || !beforeDifference.eq(afterDifference)) {
        throw new Error('COD charitable comparison must preserve the existing original benefit with the same reduction vector');
      }
      charitableComparison = { carryforwardBeforeReduction: comparisonCarryBefore, expiredAfterReduction: comparedExpiry,
        carryforward: comparedCarry, nolDifferenceBeforeReduction: beforeDifference, nolDifferenceAfterReduction: afterDifference };
      audit.record(alternative ? 'Alternative COD NOL Worksheet' : 'Regular COD NOL Worksheet', 'charitable-comparison',
        'Original charitable NOL difference after the same COD reduction', afterDifference,
        'Each original normal and comparison modified loss supports the same actual reduction; their succeeding difference is conserved',
        { 'Before COD difference': beforeDifference, 'Normal succeeding carry': carryforward, 'Comparison succeeding carry': comparedCarry });
    }
    return { beforeReduction, carryforwardBeforeReduction, reduction: reportedExcludedAmount,
      currentTaxUse, modifiedAbsorption, modifiedUseAdjustment, modifiedAvailableBeforeReduction,
      expiredAfterReduction, carryforward, vintages, ...(charitableComparison ? { charitableComparison } : {}) };
  };
  const regular = ledger(false), alternativeTax = ledger(true);
  audit.record('Form 982', '6', 'Excluded debt applied to regular net operating losses', regular.reduction,
    'After current tax; current-year NOL first, then prior vintages in origin-year order', { 'Remaining regular NOL': regular.carryforward, 'Remaining alternative NOL': alternativeTax.carryforward });
  return { ...base, calculationComplete: true, regular, alternativeTax, lines: audit.getLines() };
}
