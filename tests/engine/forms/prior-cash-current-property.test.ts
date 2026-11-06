// Spec: spec/federal/prior-cash-current-property.yaml.
import { expect, it } from 'vitest';
import { calculatePriorCashCurrentProperty } from '@/engine/forms/prior-cash-current-property.js';
import { d } from '@/utils/decimal.js';
import { nonitemizerCarryFixture } from '../../fixtures/nonitemizer-carry.js';

function source(cash = '10000', property = '30000', entries = [{ taxYear: 2025, amount: '20000' }]) {
  const input = nonitemizerCarryFixture(cash, entries);
  input.deductionElection = 'itemized';
  input.donations.push({ organization: 'Actual public property recipient', type: 'property', amount: property,
    costBasis: property, dateOfDonation: '2026-06-01', qualifiedOrganization: true,
    isPrivateFoundation: false, isLongTermCapitalGain: false });
  return input;
}
function context(cash: string, property: string, base = '100000') {
  return { contributionBase: d(base), current: { cashPublic: d(cash), noncashPublic: d(property), capitalGainPublic: d('0'),
    cashPrivate: d('0'), noncashPrivate: d('0'), capitalGainPrivate: d('0') } };
}
const balances = (rows: { taxYear: number; category: string; amount: { toFixed(): string } }[]) => rows.map(row => [row.taxYear, row.category, row.amount.toFixed()]);

it('keeps the current property floor separate from original prior cash usage', () => {
  const input = source(), before = JSON.stringify(input);
  const result = calculatePriorCashCurrentProperty(input, context('10000', '30000'));
  expect([result.currentCash, result.currentNoncash, result.priorDeduction, result.totalDeduction].map(value => value.toFixed()))
    .toEqual(['10000', '19500', '20000', '49500']);
  expect(balances(result.carryforwards)).toEqual([[2026, 'noncash_50', '10500']]);
  expect(balances(result.nonitemizedCarryforwards)).toEqual([[2026, 'noncash_50', '10500']]);
  expect(result.detail.map(row => [row.taxYear, row.treatedAsPaid.toFixed(), row.amountRemaining.toFixed()])).toEqual([[2025, '20000', '0']]);
  expect(JSON.stringify(input)).toBe(before);
  const noExcess = calculatePriorCashCurrentProperty(source('0', '500', [{ taxYear: 2025, amount: '1' }]), context('0', '500'));
  expect(noExcess.totalDeduction.toFixed()).toBe('1');
  expect(noExcess.carryforwards).toEqual([]);
  expect(noExcess.nonitemizedCarryforwards).toEqual([]);
});

it('requires the whole floor to have an actual current property source', () => {
  const exact = source('0', '5000', [{ taxYear: 2025, amount: '49500' }]);
  const result = calculatePriorCashCurrentProperty(exact, context('0', '5000'));
  expect(result.currentNoncash.toFixed()).toBe('0');
  expect(balances(result.carryforwards)).toEqual([[2026, 'noncash_50', '5000']]);
  expect(balances(result.nonitemizedCarryforwards)).toEqual([[2026, 'noncash_50', '5000']]);
  expect(() => calculatePriorCashCurrentProperty(source('0', '5000', [{ taxYear: 2025, amount: '49500.01' }]), context('0', '5000')))
    .toThrow(/floor.*current.*property|current.*property.*floor/i);
  for (const mutate of [
    (input: typeof exact) => { if (input.charitableCarryoverSources) input.charitableCarryoverSources.primaryTaxpayerIdLast4 = '9999'; },
    (input: typeof exact) => { if (input.charitableCarryoverSources) input.charitableCarryoverSources.sourceFactsConfirmed = undefined; },
    (input: typeof exact) => { const prior = input.charitableCarryoverSources?.vintages?.[0]; if (prior) { prior.category = 'noncash_50'; prior.medium = 'noncash'; } },
    (input: typeof exact) => { input.donations[1].costBasis = undefined; },
    (input: typeof exact) => { input.donations[1].isLongTermCapitalGain = true; },
    (input: typeof exact) => { input.donations[1].amount = '4999.99'; },
    (input: typeof exact) => { input.priorYear = { ...input.priorYear, nolCarryforward: '1' }; },
  ]) {
    const changed = structuredClone(exact); mutate(changed);
    expect(() => calculatePriorCashCurrentProperty(changed, context('0', '5000'))).toThrow();
  }
});

it('conserves original cash vintages through the zero-base and expiration boundaries', () => {
  const input = source('0.01', '0.02', [{ taxYear: 2025, amount: '0.05' }, { taxYear: 2020, amount: '0.03' }, { taxYear: 2021, amount: '0.04' }]);
  const before = JSON.stringify(input), result = calculatePriorCashCurrentProperty(input, context('.01', '.02', '0'));
  expect(result.expired.toFixed()).toBe('0.07');
  expect(result.priorTreatedAsPaid.toFixed()).toBe('0');
  expect(balances(result.carryforwards)).toEqual([[2025, 'cash_60', '0.05'], [2026, 'cash_60', '0.01'], [2026, 'noncash_50', '0.02']]);
  expect(balances(result.nonitemizedCarryforwards)).toEqual(balances(result.carryforwards));
  expect(result.detail.map(row => [row.taxYear, row.amountExpired.toFixed()])).toEqual([[2020, '0.03'], [2021, '0.04'], [2025, '0']]);
  const reversed = structuredClone(input); reversed.charitableCarryoverSources?.vintages?.reverse();
  expect(balances(calculatePriorCashCurrentProperty(reversed, context('.01', '.02', '0')).carryforwards)).toEqual(balances(result.carryforwards));
  expect(JSON.stringify(input)).toBe(before);
});
