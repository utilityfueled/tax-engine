// Spec: spec/federal/nonitemized-charitable-carryover.yaml.
import { expect, it } from 'vitest';
import { calculateCharitableCategoryUse } from '@/engine/forms/charitable-category-use.js';
import { calculateNonitemizedCharitableCarryover } from '@/engine/forms/nonitemized-charitable-carryover.js';
import { d } from '@/utils/decimal.js';
import { nonitemizerCarryFixture } from '../../fixtures/nonitemizer-carry.js';

const context = (cash: string, base = '10000') => ({ contributionBase: d(base), current: {
  cashPublic: d(cash), noncashPublic: d('0'), capitalGainPublic: d('0'), cashPrivate: d('0'), noncashPrivate: d('0'), capitalGainPrivate: d('0'),
} });

it('preserves exact percentage excess separately from the current deduction cap', () => {
  const input = nonitemizerCarryFixture('9000.99'), before = JSON.stringify(input);
  const result = calculateNonitemizedCharitableCarryover(input, context('9000.99', '10000.49'));
  expect(result.percentageCapacity.toFixed()).toBe('6000.294');
  expect(result.currentWithinPercentageLimit.toFixed()).toBe('6000.294');
  expect(result.currentExcess.toFixed()).toBe('3000.696');
  expect(result.carryforwards.map(row => [row.taxYear, row.category, row.medium, row.amount.toFixed()]))
    .toEqual([[2026, 'cash_60', 'cash', '3050.69845']]);
  expect(result.totalDeduction.toFixed()).toBe('0');
  expect(JSON.stringify(input)).toBe(before);
  for (const [current, base, expected] of [['5999.99', '10000', '0'], ['6000', '10000', '0'], ['6000.01', '10000', '0.01'], ['0.01', '0', '0.01'], ['0', '-1', '0']]) {
    const boundary = calculateNonitemizedCharitableCarryover(nonitemizerCarryFixture(current), context(current, base));
    expect(boundary.currentExcess.toFixed()).toBe(expected);
  }
});

it('uses actual prior capacity without treating it as current deductible cash', () => {
  const input = nonitemizerCarryFixture('2000', [{ taxYear: 2025, amount: '5000' }]), before = JSON.stringify(input);
  const result = calculateCharitableCategoryUse(input, context('2000'));
  expect(() => calculateNonitemizedCharitableCarryover(input, context('2000'))).toThrow(/floor.*prior|prior.*floor/i);
  expect(result.priorTreatedAsPaid.toFixed()).toBe('4000');
  expect(result.detail.map(row => [row.sourceId, row.amountAvailable.toFixed(), row.treatedAsPaid.toFixed(), row.amountUsed.toFixed(), row.amountRemaining.toFixed()]))
    .toEqual([['actual-cash-2025', '5000', '4000', '0', '1000']]);
  expect(result.carryforwards[0].sourceId).toBe('actual-cash-2025');
  expect(result.carryforwards[0].taxYear).toBe(2025);
  expect(result.currentWithinPercentageLimit.cash_60.toFixed()).toBe('2000');
  expect(JSON.stringify(input)).toBe(before);
});

it('conserves FIFO use and expiration at the original fifth year', () => {
  const input = nonitemizerCarryFixture('5700', [{ taxYear: 2024, amount: '200' }, { taxYear: 2020, amount: '100' }, { taxYear: 2021, amount: '400' }]);
  const result = calculateCharitableCategoryUse(input, context('5700'));
  expect(() => calculateNonitemizedCharitableCarryover(input, context('5700'))).toThrow(/floor.*prior|prior.*floor/i);
  expect(result.detail.map(row => [row.taxYear, row.treatedAsPaid.toFixed(), row.amountExpired.toFixed(), row.amountRemaining.toFixed()]))
    .toEqual([[2020, '0', '100', '0'], [2021, '300', '100', '0'], [2024, '0', '0', '200']]);
  expect(result.priorTreatedAsPaid.toFixed()).toBe('300'); expect(result.expired.toFixed()).toBe('200');
  expect(result.carryforwards.map(row => [row.taxYear, row.amount.toFixed()])).toEqual([[2024, '200']]);
  const zeroFloor = calculateNonitemizedCharitableCarryover(input, context('5700', '0'));
  expect(zeroFloor.expired.toFixed()).toBe('500');
  expect(zeroFloor.carryforwards.map(row => [row.taxYear, row.amount.toFixed()])).toEqual([[2024, '200'], [2026, '5700']]);
});

it('preserves missing sources and rejects unimplemented category and loss methods', () => {
  for (const choice of ['automatic', 'itemized'] as const) {
    const input = nonitemizerCarryFixture(); input.deductionElection = choice;
    expect(() => calculateNonitemizedCharitableCarryover(input, context('9000'))).toThrow(/explicit|selection|nonitemiz/i);
  }
  const missing = nonitemizerCarryFixture(); missing.charitableCarryoverSources = undefined;
  expect(() => calculateNonitemizedCharitableCarryover(missing, context('9000'))).toThrow(/source history/i);
  const history = nonitemizerCarryFixture('0', [{ taxYear: 2025, amount: '100' }]);
  if (!history.charitableCarryoverSources?.vintages) throw new Error('Missing synthetic source');
  history.charitableCarryoverSources.vintages[0].category = 'other_30';
  expect(() => calculateNonitemizedCharitableCarryover(history, context('0'))).toThrow(/cash_60|public cash|categor/i);
  const falseConfirmation = nonitemizerCarryFixture();
  if (falseConfirmation.charitableCarryoverSources) falseConfirmation.charitableCarryoverSources.sourceFactsConfirmed = false;
  expect(() => calculateNonitemizedCharitableCarryover(falseConfirmation, context('9000'))).toThrow(/confirmed/i);
  const wrongIdentity = nonitemizerCarryFixture();
  if (wrongIdentity.charitableCarryoverSources) wrongIdentity.charitableCarryoverSources.primaryTaxpayerIdLast4 = '9999';
  expect(() => calculateNonitemizedCharitableCarryover(wrongIdentity, context('9000'))).toThrow(/identity/i);
  for (const field of ['noncashPublic', 'capitalGainPublic', 'cashPrivate', 'noncashPrivate', 'capitalGainPrivate'] as const) {
    const mixed = context('9000'); mixed.current[field] = d('0.01');
    expect(() => calculateNonitemizedCharitableCarryover(nonitemizerCarryFixture(), mixed)).toThrow(/public.cash|categor/i);
  }
  const loss = nonitemizerCarryFixture(); loss.netOperatingLoss = {};
  expect(() => calculateNonitemizedCharitableCarryover(loss, context('9000'))).toThrow(/NOL|loss/i);
  const old = nonitemizerCarryFixture(); old.taxpayer.taxYear = 2025;
  expect(() => calculateNonitemizedCharitableCarryover(old, context('9000'))).toThrow(/2026/i);
  expect(() => calculateNonitemizedCharitableCarryover(nonitemizerCarryFixture('8999.99'), context('9000'))).toThrow(/reconcile/i);
  expect(() => calculateNonitemizedCharitableCarryover(nonitemizerCarryFixture(), context('9000', 'NaN'))).toThrow(/finite/i);
});
