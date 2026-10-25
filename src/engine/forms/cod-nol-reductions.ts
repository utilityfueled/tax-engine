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
  beforeReduction: Decimal; attributeReduction: Decimal; expiredAfterReduction: Decimal; remainingCarryforward: Decimal;
  section1411OriginalLoss?: Decimal; section1411RemainingCarryforward?: Decimal;
}
export interface CodNolLedgerReduction {
  beforeReduction: Decimal; carryforwardBeforeReduction: Decimal; reduction: Decimal;
  expiredAfterReduction: Decimal; carryforward: Decimal; vintages: CodNolVintageReduction[];
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

export function calculateCodNolReduction(input: TaxYearInput, context?: {
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
    if (!sources || sources.length !== priorRows.length) throw new Error('COD canonical loss vintages must match complete original histories');
    const rows: Array<{ sourceId: string; lossTaxYear: number; originalLoss: Decimal; beforeReduction: Decimal; section1411OriginalLoss?: Decimal }> = [];
    if (currentOrigin) {
      const origin = alternative ? currentOrigin.alternativeTax : currentOrigin.regular;
      rows.push({ sourceId: `current-origin:${year}`, lossTaxYear: year,
        originalLoss: canonical(origin.netOperatingLoss, 'current original loss'), beforeReduction: canonical(origin.netOperatingLoss, 'current available loss'),
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
      // Keep that claim intact and identify only its current taxable-income use.
      const currentUse = !alternative && row.lossTaxYear < 2018
        ? Decimal.min(available, zeroFloor(prior.actualIncome.taxableIncome.minus(canonical(row.earlierClaimedNolDeductions, 'earlier current deductions'))))
        : claimed;
      if (!absorbed.eq(currentUse)) throw new Error('COD modified-income absorption differs from current taxable-income use and requires its separate coordination method');
      const before = available.minus(currentUse);
      if (!source || source.lossTaxYear !== row.lossTaxYear || !actual(source.originalLoss, 'original loss').eq(row.originalLoss)
        || !actual(source.openingCarryforward, 'opening loss').eq(row.openingCarryforward)
        || !sum(absorbed, expired, closing).eq(row.openingCarryforward)
        || !before.eq(closing.plus(expired).minus(expiredBeforeYear))) throw new Error('COD canonical opening, absorption, expiry and closing loss must conserve each original vintage');
      rows.push({ sourceId: row.sourceId, lossTaxYear: row.lossTaxYear, originalLoss: row.originalLoss, beforeReduction: before,
        ...(!alternative ? { section1411OriginalLoss: actual('section1411OriginalLoss' in source ? source.section1411OriginalLoss : undefined, 'original1411 loss') } : {}) });
    }
    const beforeReduction = sum(...rows.map(row => row.beforeReduction));
    const carryforwardBeforeReduction = canonical(alternative ? prior.alternativeTax.carryforward : prior.carryforward, 'aggregate prior carry')
      .plus(currentOrigin ? (alternative ? currentOrigin.alternativeTax : currentOrigin.regular).netOperatingLoss : d('0'));
    const expected = carryforwardBeforeReduction.plus(sum(...priorRows.map(row =>
      canonical(row.expired, 'prior expiry').minus(canonical(row.expiredBeforeYear, 'prior unavailable loss')))));
    if (!beforeReduction.eq(expected)) throw new Error('COD canonical aggregate loss does not reconcile to its vintages');
    if (reportedExcludedAmount.gt(beforeReduction)) throw new Error('COD NOL is insufficient in an independent tax system; later-attribute reduction requires its separate actual worksheet');
    let remaining = reportedExcludedAmount;
    const vintages = rows.map(row => {
      const attributeReduction = Decimal.min(row.beforeReduction, remaining), afterReduction = row.beforeReduction.minus(attributeReduction);
      const expires = row.lossTaxYear < 2018 && year === row.lossTaxYear + 20;
      const expiredAfterReduction = expires ? afterReduction : d('0'), remainingCarryforward = expires ? d('0') : afterReduction;
      remaining = remaining.minus(attributeReduction);
      if (row.section1411OriginalLoss && row.section1411OriginalLoss.gt(row.originalLoss)) throw new Error('COD original1411 loss cannot exceed original regular loss');
      const section1411RemainingCarryforward = row.section1411OriginalLoss === undefined ? undefined
        : row.originalLoss.isZero() ? d('0') : remainingCarryforward.times(row.section1411OriginalLoss).div(row.originalLoss);
      audit.record(alternative ? 'Alternative COD NOL Worksheet' : 'Regular COD NOL Worksheet', row.sourceId, 'After-tax NOL attribute reduction', attributeReduction,
        'Current loss first, then oldest carryover to this year before residual expiry; actual deduction and original loss remain unchanged', {
          'Origin year': String(row.lossTaxYear), 'Original loss': row.originalLoss, 'Before reduction': row.beforeReduction,
          'Expired after reduction': expiredAfterReduction, 'Remaining carry': remainingCarryforward,
          ...(section1411RemainingCarryforward === undefined ? {} : { 'Applicable remaining1411 carry': section1411RemainingCarryforward }),
        });
      return { ...row, attributeReduction, expiredAfterReduction, remainingCarryforward, ...(section1411RemainingCarryforward === undefined ? {} : { section1411RemainingCarryforward }) };
    });
    return { beforeReduction, carryforwardBeforeReduction, reduction: reportedExcludedAmount,
      expiredAfterReduction: sum(...vintages.map(row => row.expiredAfterReduction)), carryforward: sum(...vintages.map(row => row.remainingCarryforward)), vintages };
  };
  const regular = ledger(false), alternativeTax = ledger(true);
  audit.record('Form 982', '6', 'Excluded debt applied to regular net operating losses', regular.reduction,
    'After current tax; current-year NOL first, then prior vintages in origin-year order', { 'Remaining regular NOL': regular.carryforward, 'Remaining alternative NOL': alternativeTax.carryforward });
  return { ...base, calculationComplete: true, regular, alternativeTax, lines: audit.getLines() };
}
