/** Actual later-attribute reduction. Spec: cod-ordinary-attribute-sources.yaml. */
import Decimal from 'decimal.js';
import type { CodAttributeKind, CodAttributeLedgerSources } from '@/models/cod-attribute-sources.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';
import { sumSourceMoneyRatios, type SourceMoneyRatio } from '@/utils/sum-source-money-ratios.js';

export interface CodAttributeReductionRecord {
  sourceId: string; kind: CodAttributeKind; originTaxYear: number;
  term?: 'short' | 'long'; activityName?: string; creditKind?: string; foreignCategory?: 'general' | 'passive';
  originalAmount: Decimal; opening: Decimal; currentUse: Decimal; carrybackUse: Decimal;
  originalAmountMeaning: 'original_year_closing_carry' | 'current_year_before_use';
  beforeReduction: Decimal; carryforwardBeforeReduction: Decimal;
  incomeApplied: Decimal; attributeReduction: Decimal; reductionRatio: SourceMoneyRatio;
  remainingRatio: SourceMoneyRatio; expiredAfterReduction: Decimal; remaining: Decimal;
}
export interface CodPropertyReductionRecord {
  propertyId: string; category: 'other_business' | 'inventory' | 'personal'; adjustedBasis: Decimal;
  incomeApplied: Decimal; attributeReduction: Decimal; reductionRatio: SourceMoneyRatio;
  remainingRatio: SourceMoneyRatio; remainingBasis: Decimal;
}
export interface CodAttributeReductionLedger {
  sourceFactsVerified: true; remainingExclusionBeforeReduction: Decimal; incomeApplied: Decimal; unreducedExclusion: Decimal;
  records: CodAttributeReductionRecord[];
  stages: Array<{ kind: CodAttributeKind | 'basis' | 'passive'; incomeApplied: Decimal; attributeReduction: Decimal }>;
  property: { immediatelyAfterBasis: Decimal; immediatelyAfterMoney: Decimal; immediatelyAfterLiabilities: Decimal;
    basisCap: Decimal; nextYearBasis: Decimal; attributeReduction: Decimal; remainingBasis: Decimal; properties: CodPropertyReductionRecord[] };
}
export interface CodAttributeReductionResult {
  sourceFactsVerified: true; regular: CodAttributeReductionLedger; alternativeTax: CodAttributeReductionLedger;
}

const zero = () => new Decimal(0);
const add = (...values: Decimal[]) => sumSourceMoney(...values);
const subtract = (a: Decimal, b: Decimal) => add(a, b.negated());
const triple = (value: Decimal) => add(value, value, value);
const ratio = (amount: Decimal, denominator = new Decimal(1)): SourceMoneyRatio => ({ amount, denominator });
const quotient = (value: SourceMoneyRatio) => sumSourceMoneyRatios([value]);
function actual(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value)) throw new Error(`COD requires actual ${label}`);
  const result = new Decimal(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`COD requires finite nonnegative ${label}`);
  return result;
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`COD requires actual ${label}`);
  return value.trim();
}
function day(value: string | undefined, label: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error(`COD requires actual ${label} date`);
  return value;
}
function unique(ids: Set<string>, value: string | undefined, label: string): string {
  const id = text(value, `${label} identity`);
  if (ids.has(id)) throw new Error(`COD duplicate ${label} source`);
  ids.add(id); return id;
}
const isCredit = (kind: CodAttributeKind) => kind !== 'capital_loss' && kind !== 'passive_loss';

/** Source-only pure ledger; the caller separately reconciles current uses to the canonical return. */
export function calculateCodAttributeReductions(input: {
  taxYear: number; dischargeDate: string; remainingExclusion: Decimal; sources: CodAttributeLedgerSources | undefined;
}): CodAttributeReductionLedger {
  const { taxYear, sources } = input;
  if (!Number.isInteger(taxYear) || !day(input.dischargeDate, 'discharge').startsWith(`${taxYear}-`)
    || !Decimal.isDecimal(input.remainingExclusion) || !input.remainingExclusion.isFinite() || input.remainingExclusion.lt(0)) {
    throw new Error('COD later attributes require the actual year, event and nonnegative remaining exclusion');
  }
  if (!sources || sources.sourceFactsConfirmed !== true || sources.allAttributesIncluded !== true || !Array.isArray(sources.records)) {
    throw new Error('COD requires confirmed complete actual attribute sources, including empty lists');
  }
  text(sources.sourceReference, 'attribute worksheet reference');
  const ids = new Set<string>();
  const records: CodAttributeReductionRecord[] = sources.records.map(source => {
    const sourceId = unique(ids, source.sourceId, 'attribute');
    if (!source.kind || !['general_business_credit', 'minimum_tax_credit', 'capital_loss', 'passive_loss', 'passive_credit', 'foreign_tax_credit'].includes(source.kind)
      || !Number.isInteger(source.originTaxYear) || source.originTaxYear! < 1900 || source.originTaxYear! > taxYear
      || source.sourceFactsConfirmed !== true || source.allHistoryIncluded !== true || !Array.isArray(source.history)) {
      throw new Error('COD requires actual confirmed attribute kind, original year and complete history');
    }
    const kind = source.kind, originTaxYear = source.originTaxYear!;
    const originalAmountMeaning = originTaxYear === taxYear ? 'current_year_before_use' : 'original_year_closing_carry';
    if (source.originalAmountMeaning !== originalAmountMeaning) {
      throw new Error('COD original amount meaning must identify the filed original-year closing carry or the current amount before use');
    }
    text(source.sourceReference, 'original attribute reference'); text(source.currentYearUseSourceReference, 'current use/carryback worksheet');
    if (kind === 'capital_loss' && source.term !== 'short' && source.term !== 'long') throw new Error('COD capital source requires its actual term');
    if (kind === 'passive_loss' || kind === 'passive_credit') text(source.activityName, 'passive activity');
    if (kind === 'general_business_credit' || kind === 'passive_credit') text(source.creditKind, 'credit kind');
    if (kind === 'foreign_tax_credit' && source.foreignCategory !== 'general' && source.foreignCategory !== 'passive') throw new Error('COD foreign credit requires its actual category');
    const originalAmount = actual(source.originalAmount, 'original attribute amount');
    const lifetime = kind === 'general_business_credit' ? 20 : kind === 'foreign_tax_credit' ? 10 : undefined;
    const expiryYear = lifetime === undefined ? undefined : originTaxYear + lifetime;
    let opening = originalAmount;
    const years = new Set<number>();
    for (const row of [...source.history].sort((a, b) => (a.taxYear ?? 0) - (b.taxYear ?? 0))) {
      const year = row.taxYear;
      if (!Number.isInteger(year) || year! <= originTaxYear || year! >= taxYear || years.has(year!)) throw new Error('COD attribute history has a missing, duplicate or conflicting year');
      years.add(year!); text(row.sourceReference, 'filed attribute history reference');
      const used = actual(row.used, 'historical use'), reduced = actual(row.reduced, 'historical reduction');
      const expired = actual(row.expired, 'historical expiry');
      if (expiryYear !== undefined && year! > expiryYear && opening.gt(0)) {
        throw new Error('COD attribute history carries a positive opening beyond its statutory expiry');
      }
      const beforeExpiry = subtract(opening, add(used, reduced));
      if ((expired.gt(0) && year !== expiryYear) || (year === expiryYear && !expired.eq(beforeExpiry))) {
        throw new Error('COD historical expiry must consume only the unused balance in its original statutory year');
      }
      opening = subtract(beforeExpiry, expired);
      if (opening.lt(0)) throw new Error('COD original attribute history exceeds its actual source');
    }
    for (let year = originTaxYear + 1; year < taxYear; year += 1) {
      if (!years.has(year)) throw new Error('COD attribute history must include every intervening filed year, including zero use');
    }
    if (expiryYear !== undefined && expiryYear < taxYear && opening.gt(0)) {
      throw new Error('COD expired opening cannot be consumed by a later current use');
    }
    const currentUse = actual(source.currentYearUse, 'current attribute use');
    const carrybackUse = actual(source.currentYearCarryback, 'actual current carryback');
    const expired = actual(source.currentYearExpired, 'normal current expiry');
    if (carrybackUse.gt(0) && (originTaxYear !== taxYear || (kind !== 'general_business_credit' && kind !== 'foreign_tax_credit'))) {
      throw new Error('COD current carryback must belong to an actual current credit origin');
    }
    const beforeReduction = subtract(opening, add(currentUse, carrybackUse));
    if (beforeReduction.lt(0)) throw new Error('COD current use and carryback exceed the original available attribute');
    if (expired.gt(0) && (expiryYear !== taxYear || !expired.eq(beforeReduction))) {
      throw new Error('COD attribute expiry must match the original statutory year');
    }
    if (expiryYear === taxYear && !expired.eq(beforeReduction)) {
      throw new Error('COD final-year attribute expiry must be retained separately from its reduction pool');
    }
    return { sourceId, kind, originTaxYear, term: source.term, activityName: source.activityName?.trim(), creditKind: source.creditKind?.trim(),
      foreignCategory: source.foreignCategory, originalAmount, originalAmountMeaning, opening, currentUse, carrybackUse, beforeReduction,
      carryforwardBeforeReduction: subtract(beforeReduction, expired), incomeApplied: zero(), attributeReduction: zero(),
      reductionRatio: ratio(zero()), remainingRatio: ratio(beforeReduction), expiredAfterReduction: expired,
      remaining: subtract(beforeReduction, expired) };
  });

  const after = sources.property?.immediatelyAfter, next = sources.property?.followingYear;
  if (!after || !next || after.sourceFactsConfirmed !== true || next.sourceFactsConfirmed !== true
    || after.allPropertyAndMoneyIncluded !== true || after.allLiabilitiesIncluded !== true || next.allPropertyIncluded !== true
    || !Array.isArray(after.properties) || !Array.isArray(after.liabilities) || !Array.isArray(next.properties) || !Array.isArray(next.dispositions)
    || day(after.asOfDate, 'immediately-after snapshot') !== input.dischargeDate
    || day(next.asOfDate, 'following-year snapshot') !== `${taxYear + 1}-01-01`) {
    throw new Error('COD requires complete actual property records at both dates, including explicit empty inventories');
  }
  text(after.sourceReference, 'immediately-after snapshot reference'); text(next.sourceReference, 'following-year snapshot reference');
  const readProperties = (rows: NonNullable<typeof after.properties>, date: string) => {
    const propertyIds = new Set<string>();
    return rows.map(source => {
      const propertyId = unique(propertyIds, source.propertyId, 'property');
      text(source.description, 'property description'); text(source.sourceReference, 'original property basis reference');
      if (source.sourceFactsConfirmed !== true || source.securedDischargedDebt !== false
        || !source.category || !['other_business', 'inventory', 'personal'].includes(source.category)
        || day(source.acquiredDate, 'property acquisition') > date) throw new Error('COD property requires actual basis/category/date and the established unsecured-debt facts');
      return { source, propertyId, category: source.category, adjustedBasis: actual(source.adjustedBasis, 'property adjusted basis') };
    });
  };
  const afterProperties = readProperties(after.properties, input.dischargeDate), nextProperties = readProperties(next.properties, next.asOfDate!);
  const liabilityIds = new Set<string>();
  const immediatelyAfterLiabilities = add(...after.liabilities.map(source => {
    unique(liabilityIds, source.sourceId, 'immediately-after liability'); text(source.sourceReference, 'immediately-after liability reference');
    return actual(source.amount, 'immediately-after liability');
  }));
  for (const row of nextProperties) {
    const previous = afterProperties.find(value => value.propertyId === row.propertyId);
    if ((!previous && row.source.acquiredDate! <= input.dischargeDate)
      || (previous && previous.source.acquiredDate !== row.source.acquiredDate)) {
      throw new Error('COD property acquisition must reconcile between the original snapshots');
    }
    if (!previous || !previous.adjustedBasis.eq(row.adjustedBasis) || previous.category !== row.category) {
      text(row.source.priorSnapshotChangeReference, 'property change between original snapshots');
    }
  }
  const dispositionIds = new Set<string>();
  for (const row of next.dispositions) {
    const id = unique(dispositionIds, row.propertyId, 'property disposition');
    const date = day(row.disposedDate, 'property disposition');
    if (row.sourceFactsConfirmed !== true || date <= input.dischargeDate || date >= next.asOfDate!
      || !afterProperties.some(value => value.propertyId === id) || nextProperties.some(value => value.propertyId === id)) {
      throw new Error('COD property disposition must reconcile the two actual inventories and intervening dates');
    }
    text(row.sourceReference, 'property disposition reference');
  }
  if (afterProperties.some(row => !nextProperties.some(value => value.propertyId === row.propertyId) && !dispositionIds.has(row.propertyId))) {
    throw new Error('COD removed property requires its actual intervening disposition source');
  }
  const immediatelyAfterBasis = add(...afterProperties.map(row => row.adjustedBasis));
  const immediatelyAfterMoney = actual(after.money, 'immediately-after money');
  const basisCap = Decimal.max(0, subtract(add(immediatelyAfterBasis, immediatelyAfterMoney), immediatelyAfterLiabilities));
  const nextYearBasis = add(...nextProperties.map(row => row.adjustedBasis));
  let remaining = new Decimal(input.remainingExclusion);
  const stages: CodAttributeReductionLedger['stages'] = [];
  const applyRecord = (row: CodAttributeReductionRecord, incomeApplied: Decimal) => {
    const denominator = new Decimal(isCredit(row.kind) ? 3 : 1);
    const numerator = isCredit(row.kind) ? triple(row.beforeReduction) : row.beforeReduction;
    row.incomeApplied = incomeApplied;
    row.reductionRatio = ratio(incomeApplied, denominator);
    row.attributeReduction = quotient(row.reductionRatio);
    row.remainingRatio = ratio(subtract(numerator, incomeApplied), denominator);
    const unexpired = quotient(row.remainingRatio);
    row.expiredAfterReduction = row.expiredAfterReduction.gt(0) ? unexpired : zero();
    row.remaining = row.expiredAfterReduction.gt(0) ? zero() : unexpired;
    remaining = subtract(remaining, incomeApplied);
  };
  const applyStage = (kind: CodAttributeKind | 'passive', selected: CodAttributeReductionRecord[], priority: (row: CodAttributeReductionRecord) => number) => {
    const before = remaining;
    const groups = new Map<number, CodAttributeReductionRecord[]>();
    for (const row of selected) {
      const rank = priority(row); groups.set(rank, [...(groups.get(rank) ?? []), row]);
    }
    for (const rank of [...groups.keys()].sort((a, b) => a - b)) {
      const group = groups.get(rank)!;
      const positive = group.filter(row => row.beforeReduction.gt(0));
      const capacity = add(...positive.map(row => isCredit(row.kind) ? triple(row.beforeReduction) : row.beforeReduction));
      if (remaining.gt(0) && remaining.lt(capacity) && positive.length > 1) {
        throw new Error(`COD ${kind} competing same-priority source allocation requires its established method`);
      }
      for (const row of group) applyRecord(row, Decimal.min(remaining, isCredit(row.kind) ? triple(row.beforeReduction) : row.beforeReduction));
    }
    stages.push({ kind, incomeApplied: subtract(before, remaining), attributeReduction: sumSourceMoneyRatios(selected.map(row => row.reductionRatio)) });
  };
  applyStage('general_business_credit', records.filter(row => row.kind === 'general_business_credit'), row => row.originTaxYear);
  applyStage('minimum_tax_credit', records.filter(row => row.kind === 'minimum_tax_credit'), () => 0);
  applyStage('capital_loss', records.filter(row => row.kind === 'capital_loss'), row => row.originTaxYear === taxYear ? 0 : row.originTaxYear);
  const basisReduction = Decimal.min(remaining, basisCap, nextYearBasis);
  let unallocatedBasis = basisReduction;
  const propertyRows: CodPropertyReductionRecord[] = nextProperties.map(row => ({ propertyId: row.propertyId, category: row.category,
    adjustedBasis: row.adjustedBasis, incomeApplied: zero(), attributeReduction: zero(), reductionRatio: ratio(zero()),
    remainingRatio: ratio(row.adjustedBasis), remainingBasis: row.adjustedBasis }));
  for (const category of ['other_business', 'inventory', 'personal'] as const) {
    const group = propertyRows.filter(row => row.category === category), total = add(...group.map(row => row.adjustedBasis));
    const applied = Decimal.min(total, unallocatedBasis);
    for (const row of group) {
      if (total.isZero()) continue;
      row.reductionRatio = { amount: applied, numerator: row.adjustedBasis, denominator: total };
      row.attributeReduction = quotient(row.reductionRatio); row.incomeApplied = row.attributeReduction;
      row.remainingRatio = { amount: subtract(total, applied), numerator: row.adjustedBasis, denominator: total };
      row.remainingBasis = quotient(row.remainingRatio);
    }
    unallocatedBasis = subtract(unallocatedBasis, applied);
  }
  if (!unallocatedBasis.isZero()) throw new Error('COD property reduction is not conserved by its original categories');
  remaining = subtract(remaining, basisReduction);
  stages.push({ kind: 'basis', incomeApplied: basisReduction, attributeReduction: basisReduction });
  applyStage('passive', records.filter(row => row.kind === 'passive_loss' || row.kind === 'passive_credit'), () => 0);
  applyStage('foreign_tax_credit', records.filter(row => row.kind === 'foreign_tax_credit'), row => row.originTaxYear);
  return { sourceFactsVerified: true, remainingExclusionBeforeReduction: new Decimal(input.remainingExclusion),
    incomeApplied: subtract(input.remainingExclusion, remaining), unreducedExclusion: remaining, records, stages,
    property: { immediatelyAfterBasis, immediatelyAfterMoney, immediatelyAfterLiabilities, basisCap, nextYearBasis,
      attributeReduction: basisReduction, remainingBasis: subtract(nextYearBasis, basisReduction), properties: propertyRows } };
}
