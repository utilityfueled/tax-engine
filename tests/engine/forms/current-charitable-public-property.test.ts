// Spec: spec/federal/current-charitable-public-property.yaml.
import { expect, it } from 'vitest';
import { calculateCurrentCharitableCandidates } from '@/engine/forms/current-charitable-candidates.js';
import { d } from '@/utils/decimal.js';
import { nonitemizerCarryFixture } from '../../fixtures/nonitemizer-carry.js';

function source(cash = '40000', property = '30000', fmv = property) {
  const input = nonitemizerCarryFixture(cash);
  input.deductionElection = 'itemized';
  input.donations.push({ organization: 'Actual public property recipient', type: 'property', amount: fmv,
    costBasis: property, dateOfDonation: '2026-06-01', qualifiedOrganization: true,
    isPrivateFoundation: false, isLongTermCapitalGain: false });
  return input;
}
function context(cash: string, property: string, base = '100000') {
  return { contributionBase: d(base), current: { cashPublic: d(cash), noncashPublic: d(property), capitalGainPublic: d('0'),
    cashPrivate: d('0'), noncashPrivate: d('0'), capitalGainPrivate: d('0') } };
}
const balances = (rows: { category: string; amount: { toFixed(): string } }[]) => rows.map(row => [row.category, row.amount.toFixed()]);

it('resolves the enacted reciprocal public gift limits without a source priority election', () => {
  for (const [cash, property, expectedCash, expectedProperty, itemizedCarry, nonitemizedCarry] of [
    ['40000', '30000', '40000', '9500', [['noncash_50', '20500']], [['noncash_50', '20500']]],
    ['70000', '30000', '59500', '0', [['cash_60', '10500'], ['noncash_50', '30000']], [['cash_60', '10500'], ['noncash_50', '30000']]],
    ['10000', '20000', '10000', '19500', [], []],
    ['0', '70000', '0', '49500', [['noncash_50', '20500']], [['noncash_50', '20500']]],
  ] as const) {
    const input = source(cash, property), before = JSON.stringify(input);
    const result = calculateCurrentCharitableCandidates(input, context(cash, property));
    expect(result.itemized.exactCashDeduction.toFixed()).toBe(expectedCash);
    expect(result.itemized.exactNonCashDeduction.toFixed()).toBe(expectedProperty);
    expect(balances(result.itemized.carryforwards)).toEqual(itemizedCarry);
    expect(balances(result.nonitemizedCarryforwards)).toEqual(nonitemizedCarry);
    expect(result.itemized.allowedBeforeFloor.cash_60.lte(d('60000').minus(result.itemized.allowedBeforeFloor.noncash_50))).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  }
  const zeroBase = calculateCurrentCharitableCandidates(source('0.01', '0.02'), context('0.01', '0.02', '0'));
  expect(balances(zeroBase.itemized.carryforwards)).toEqual([['cash_60', '0.01'], ['noncash_50', '0.02']]);
  expect(balances(zeroBase.nonitemizedCarryforwards)).toEqual([['cash_60', '0.01'], ['noncash_50', '0.02']]);
});

it('requires exact original public property valuation and supported source character', () => {
  const original = source('40000', '30000', '50000');
  expect(calculateCurrentCharitableCandidates(original, context('40000', '30000')).itemized.exactNonCashDeduction.toFixed()).toBe('9500');
  for (const patch of [{ costBasis: undefined }, { costBasis: '-1' }, { isLongTermCapitalGain: undefined },
    { isLongTermCapitalGain: true }, { isPrivateFoundation: true }, { amount: '29999.99' }]) {
    const changed = structuredClone(original); Object.assign(changed.donations[1], patch);
    expect(() => calculateCurrentCharitableCandidates(changed, context('40000', '30000'))).toThrow();
  }
  expect(() => calculateCurrentCharitableCandidates(original, context('40000.01', '30000'))).toThrow(/reconcile|source|receipt/i);
  const prior = source(); prior.charitableCarryoverSources = nonitemizerCarryFixture('0', [{ taxYear: 2025, amount: '1' }]).charitableCarryoverSources;
  expect(() => calculateCurrentCharitableCandidates(prior, context('40000', '30000'))).toThrow(/prior|empty/i);
  const zeroProperty = source('1', '0');
  expect(calculateCurrentCharitableCandidates(zeroProperty, context('1', '0')).itemized.exactNonCashDeduction.toFixed()).toBe('0');
});
