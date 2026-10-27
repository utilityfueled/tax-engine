/** Actual ownership history, not a current deduction. Reg1.170A-10(d)(4). */
import Decimal from 'decimal.js';
import type { CharitableCarryoverSources } from '@/models/charitable-carryover-sources.js';
import type { FilingUnitHistory } from '@/models/filing-unit-sources.js';
import { validateCharitableFilingUnitTimeline } from '@/utils/charitable-filing-unit-timeline.js';
import type { CharitableSourceValidationInput } from './charitable-carryover-source-validation.js';

type Vintage = NonNullable<CharitableCarryoverSources['vintages']>[number];
export interface CharitableSourceRatio { numerator: string; denominator: string }
export interface CharitableFilingUnitResult {
  sourceId: string;
  contributionYear: number;
  openingBalance: CharitableSourceRatio;
  excludedBalance: CharitableSourceRatio;
  steps: Array<{
    taxYear: number; returnSourceId?: string; personIds: string[];
    action: 'original' | 'first_split' | 'outside_current_history' | 'filed_use' | 'current_pool';
    opening: CharitableSourceRatio; treatedAsPaid: string; nolReduction: string; closing: CharitableSourceRatio;
  }>;
}
interface Ratio { numerator: Decimal; denominator: Decimal }
interface Pool { personIds: string[]; balance: Ratio; initialJoint: boolean }
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Charitable filing history requires actual ${label}`);
  if (value !== value.trim()) throw new Error(`Charitable filing history ${label} must not have ambiguous outer spaces`);
  return value;
}
function rawAmount(value: string | undefined, label: string): string {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value) || !new Decimal(value).isFinite()) {
    throw new Error(`Charitable filing history requires actual nonnegative ${label}, including known zero`);
  }
  return value;
}

/** Source ratios stay exact through splits and filed use. The original packet
 * remains immutable; the current calculation obtains its own Decimal projection. */
export function calculateCharitableFilingUnitHistory(input: {
  taxpayer: CharitableSourceValidationInput['taxpayer']; timeline: FilingUnitHistory | undefined; vintage: Vintage;
}): CharitableFilingUnitResult {
  const { taxpayer, timeline, vintage } = input;
  const { returns, byPersonYear, current } = validateCharitableFilingUnitTimeline(taxpayer, timeline);
  const sourceId = text(vintage.sourceId, 'vintage identity'), originYear = vintage.contributionYear;
  if (!Number.isInteger(originYear) || originYear === undefined || originYear < 1900 || originYear >= taxpayer.taxYear) {
    throw new Error('Charitable filing history requires an actual prior contribution year');
  }
  if (!Array.isArray(vintage.history) || vintage.history.length !== taxpayer.taxYear - originYear - 1
    || vintage.allHistoryIncluded !== true || vintage.adjustedThroughTaxYear !== taxpayer.taxYear - 1) {
    throw new Error('Charitable filing history requires every actual intervening year');
  }
  const history = [...vintage.history].sort((a, b) => (a.taxYear ?? 0) - (b.taxYear ?? 0));
  history.forEach((entry, index) => {
    if (entry.taxYear !== originYear + index + 1 || !Array.isArray(entry.filingUnitUses)) {
      throw new Error('Charitable filing history requires each actual year and its filed unit use once');
    }
    text(entry.sourceReference, 'intervening source reference');
  });
  // Every arithmetic input is a finite source decimal. Extra precision bounds
  // all cross products; no global Decimal configuration or dollar rounding.
  const money = [rawAmount(vintage.originalExcess, 'original excess'), rawAmount(vintage.originNolReduction, 'origin reduction'),
    ...(vintage.filingUnitOrigin?.separateComputations ?? []).flatMap(row => [rawAmount(row.originalExcess, 'separate excess'), rawAmount(row.originNolReduction, 'separate origin reduction')]),
    ...history.flatMap(row => [rawAmount(row.treatedAsPaid, 'history treated-paid amount'), rawAmount(row.nolReduction, 'history reduction'),
      ...row.filingUnitUses!.flatMap(use => [rawAmount(use.treatedAsPaid, 'filed treated-paid amount'), rawAmount(use.nolReduction, 'filed reduction')])]),
  ];
  const digits = Math.max(1, ...money.map(value => value.replace('.', '').length));
  const D = Decimal.clone({ precision: Math.max(80, digits * (8 * history.length + 16) + 32), rounding: Decimal.ROUND_HALF_UP });
  const ratio = (numerator: Decimal.Value, denominator: Decimal.Value = 1): Ratio => {
    let n = new D(numerator), den = new D(denominator);
    if (!n.isFinite() || !den.isFinite() || den.lte(0)) throw new Error('Charitable filing history requires finite source ratios');
    const scale = new D(10).pow(Math.max(n.decimalPlaces(), den.decimalPlaces()));
    n = n.times(scale); den = den.times(scale);
    let a = n.abs(), b = den;
    while (!b.isZero()) { const remainder = a.mod(b); a = b; b = remainder; }
    if (!a.isZero()) { n = n.divToInt(a); den = den.divToInt(a); }
    return { numerator: n, denominator: den };
  };
  const add = (a: Ratio, b: Ratio): Ratio => ratio(a.numerator.times(b.denominator).plus(b.numerator.times(a.denominator)), a.denominator.times(b.denominator));
  const subtract = (a: Ratio, value: Decimal): Ratio => ratio(a.numerator.minus(value.times(a.denominator)), a.denominator);
  const serialize = (value: Ratio): CharitableSourceRatio => ({ numerator: value.numerator.toFixed(), denominator: value.denominator.toFixed() });
  const zero = ratio(0);
  const origin = returns.get(text(vintage.filingUnitOrigin?.returnSourceId, 'original return identity'));
  if (!origin || origin.taxYear !== originYear || !origin.members.some(id => current.members.includes(id))
    && ![...returns.values()].some(unit => unit.taxYear > originYear && unit.taxYear < taxpayer.taxYear
      && unit.members.some(id => origin.members.includes(id)) && unit.members.some(id => current.members.includes(id)))) {
    throw new Error('Charitable filing history original return must feed an actual current owner or relevant historical joint pool');
  }
  const separate = new Map<string, Decimal>();
  for (const computation of vintage.filingUnitOrigin?.separateComputations ?? []) {
    const personId = text(computation.personId, 'separate computation person');
    if (origin.members.length !== 2 || !origin.members.includes(personId) || separate.has(personId)
      || computation.ordinaryPercentageMethodConfirmed !== true) throw new Error('Charitable separate original computations must match each original spouse and actual method');
    text(computation.sourceReference, 'original separate computation reference');
    const net = new D(rawAmount(computation.originalExcess, 'separate excess')).minus(rawAmount(computation.originNolReduction, 'separate origin reduction'));
    if (net.lt(0)) throw new Error('Charitable separate original reduction exceeds its excess');
    separate.set(personId, net);
  }
  if (separate.size !== 0 && separate.size !== 2) throw new Error('Charitable allocation requires both original separate computations');
  const historyUses = new Map<number, Map<string, { used: Decimal; reduction: Decimal }>>();
  for (const entry of history) {
    const uses = new Map<string, { used: Decimal; reduction: Decimal }>();
    let totalUse = new D(0), totalReduction = new D(0);
    for (const source of entry.filingUnitUses!) {
      const id = text(source.returnSourceId, 'history return identity'), unit = returns.get(id);
      text(source.sourceReference, 'actual filed use reference');
      if (!unit || unit.taxYear !== entry.taxYear || !unit.members.some(person => origin.members.includes(person)) || uses.has(id)) {
        throw new Error('Charitable filed use must identify each relevant original return exactly once');
      }
      const used = new D(rawAmount(source.treatedAsPaid, 'filed treated-paid amount')), reduction = new D(rawAmount(source.nolReduction, 'filed reduction'));
      uses.set(id, { used, reduction }); totalUse = totalUse.plus(used); totalReduction = totalReduction.plus(reduction);
    }
    if (!totalUse.eq(rawAmount(entry.treatedAsPaid, 'total treated-paid amount')) || !totalReduction.eq(rawAmount(entry.nolReduction, 'total NOL reduction'))) {
      throw new Error('Charitable filed unit uses must reconcile exactly to the actual annual history');
    }
    historyUses.set(entry.taxYear!, uses);
  }
  // Work backwards so a former spouse's later unrelated years are not invented.
  // Their source years become necessary again if they feed a later shared pool.
  const required = new Map<number, Set<string>>();
  let needed = new Set(origin.members.filter(id => current.members.includes(id)));
  for (let year = taxpayer.taxYear; year > originYear; year--) {
    for (const id of historyUses.get(year)?.keys() ?? []) {
      for (const person of returns.get(id)!.members) if (origin.members.includes(person)) needed.add(person);
    }
    const complete = new Set(needed);
    for (const person of complete) {
      const unit = byPersonYear.get(`${person}:${year}`);
      if (!unit) throw new Error(`Charitable filing history is missing a relevant actual return for ${year}`);
      for (const other of unit.members) if (origin.members.includes(other)) complete.add(other);
    }
    required.set(year, complete); needed = new Set(complete);
  }
  const initial = new D(rawAmount(vintage.originalExcess, 'original excess')).minus(rawAmount(vintage.originNolReduction, 'original NOL reduction'));
  if (initial.lt(0)) throw new Error('Charitable original reduction exceeds original excess');
  let pools: Pool[] = [{ personIds: [...origin.members].sort(), balance: ratio(initial), initialJoint: origin.members.length === 2 }];
  let excluded = zero;
  const steps: CharitableFilingUnitResult['steps'] = [{ taxYear: originYear, returnSourceId: origin.sourceId, personIds: [...origin.members].sort(),
    action: 'original', opening: serialize(ratio(initial)), treatedAsPaid: '0', nolReduction: '0', closing: serialize(ratio(initial)) }];
  for (let year = originYear + 1; year <= taxpayer.taxYear; year++) {
    const neededNow = required.get(year)!;
    const next: Pool[] = [];
    for (const pool of pools) {
      const relevant = pool.personIds.filter(id => neededNow.has(id));
      const units = new Set(relevant.map(id => byPersonYear.get(`${id}:${year}`)!.sourceId));
      const splitNeeded = relevant.length !== pool.personIds.length || units.size > 1;
      if (splitNeeded && pool.personIds.length > 1 && !pool.balance.numerator.isZero()) {
        if (!pool.initialJoint) throw new Error('Charitable partial joint use requires its separate recurrent owner-attribution method');
        if (separate.size !== 2) throw new Error('Charitable first separate year requires both actual original separate computations');
        const total = [...separate.values()].reduce((sum, value) => sum.plus(value), new D(0));
        if (total.lte(0)) throw new Error('Charitable positive joint excess requires positive original separate excesses');
        for (const personId of pool.personIds) {
          const balance = ratio(pool.balance.numerator.times(separate.get(personId)!), pool.balance.denominator.times(total));
          steps.push({ taxYear: year, personIds: [personId], action: 'first_split', opening: serialize(pool.balance), treatedAsPaid: '0', nolReduction: '0', closing: serialize(balance) });
          next.push({ personIds: [personId], balance, initialJoint: false });
        }
      } else next.push(pool);
    }
    pools = [];
    for (const pool of next) {
      const relevant = pool.personIds.filter(id => neededNow.has(id));
      if (relevant.length === 0) {
        excluded = add(excluded, pool.balance);
        steps.push({ taxYear: year, personIds: pool.personIds, action: 'outside_current_history', opening: serialize(pool.balance), treatedAsPaid: '0', nolReduction: '0', closing: serialize(zero) });
      } else pools.push({ ...pool, personIds: relevant });
    }
    const groups = new Map<string, Pool[]>();
    for (const pool of pools) {
      const id = byPersonYear.get(`${pool.personIds[0]}:${year}`)!.sourceId;
      groups.set(id, [...(groups.get(id) ?? []), pool]);
    }
    pools = [];
    for (const [returnSourceId, group] of groups) {
      const opening = group.reduce((sum, pool) => add(sum, pool.balance), zero), personIds = [...new Set(group.flatMap(pool => pool.personIds))].sort();
      if (year === taxpayer.taxYear) {
        if (returnSourceId !== current.sourceId) throw new Error('Charitable current opening includes a different filing unit');
        pools.push(...group); steps.push({ taxYear: year, returnSourceId, personIds, action: 'current_pool', opening: serialize(opening), treatedAsPaid: '0', nolReduction: '0', closing: serialize(opening) });
        continue;
      }
      const use = historyUses.get(year)!.get(returnSourceId);
      if (!use) throw new Error('Charitable filing history requires actual use including explicit zero for every relevant unit');
      const totalUse = use.used.plus(use.reduction), closing = subtract(opening, totalUse);
      if (closing.numerator.lt(0)) throw new Error('Charitable actual filed use exceeds the owned available balance');
      steps.push({ taxYear: year, returnSourceId, personIds, action: 'filed_use', opening: serialize(opening), treatedAsPaid: use.used.toFixed(), nolReduction: use.reduction.toFixed(), closing: serialize(closing) });
      if (totalUse.isZero()) pools.push(...group);
      else pools.push({ personIds, balance: closing, initialJoint: group.length === 1 && group[0].initialJoint });
    }
  }
  const opening = pools.reduce((sum, pool) => add(sum, pool.balance), zero);
  if (vintage.openingCarryforward !== undefined && !opening.numerator.eq(new D(rawAmount(vintage.openingCarryforward, 'recorded opening')).times(opening.denominator))) {
    throw new Error('Charitable recorded opening must reconcile exactly to derived filing history; it cannot override an ownership ratio');
  }
  return { sourceId, contributionYear: originYear, openingBalance: serialize(opening), excludedBalance: serialize(excluded), steps };
}
