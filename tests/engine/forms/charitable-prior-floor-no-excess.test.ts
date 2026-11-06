// Spec: spec/federal/charitable-prior-floor-no-excess.yaml. Literals independently derived from original sources.
import { expect, it } from 'vitest';
import { calculateCharitableDeterminedFloor as calculate } from '@/engine/forms/charitable-determined-floor.js';
import { calculateCharitableContributionWorksheet } from '@/engine/forms/charitable-contribution-worksheet.js';
import { d, sum } from '@/utils/decimal.js';
import { priorFloorNoExcessFixture as fixture, priorFloorNoExcessContext as context, priorFloorOriginal } from '../../fixtures/charitable-prior-floor-no-excess.js';
import { nonitemizedCategoryFixture, nonitemizedCategoryContext } from '../../fixtures/nonitemized-charitable-categories.js';

it('applies the floor to one fully consumed original without creating a new vintage', () => {
  const original = calculateCharitableContributionWorksheet({ taxYear: 2025,
    contributionBase: d(priorFloorOriginal.originalContributionBase), amounts: {
      cashPublic: d('0'), noncashPublic: d('0'), cashPrivate: d('0'), noncashPrivate: d('0'),
      capitalGainPublic: d(priorFloorOriginal.receipt.fairMarketValue), capitalGainPrivate: d('0'),
    } });
  expect(original.exactNonCashDeduction.toFixed()).toBe('30000');
  expect(sum(...original.carryforwards.map(row => row.amount)).toFixed()).toBe('5000');
  const input = fixture(), before = JSON.stringify(input), result = calculate(input, context());
  expect(result.method).toBe('2026_single_prior_floor_no_excess');
  expect([result.currentCash, result.currentNoncash, result.priorTreatedAsPaid, result.priorDeduction,
    result.totalDeduction, result.floorDisallowed].map(value => value.toFixed()))
    .toEqual(['10000', '0', '5000', '4500', '14500', '500']);
  expect(result.detail).toHaveLength(1);
  const row = result.detail[0];
  expect([row.sourceId, row.taxYear, row.category, row.medium]).toEqual(['public-stock-2025-original', 2025, 'capital_gain_30', 'noncash']);
  expect([row.amountAvailable, row.treatedAsPaid, row.amountUsed, row.amountRemaining, row.amountExpired].map(value => value.toFixed()))
    .toEqual(['5000', '5000', '4500', '0', '0']);
  expect(result.currentFloorByCategory.capital_gain_30.toFixed()).toBe('0');
  expect(result.carryforwards).toEqual([]); expect(result.nonitemizedCarryforwards).toEqual([]);
  expect(row.amountAvailable.eq(row.treatedAsPaid.plus(row.amountRemaining).plus(row.amountExpired))).toBe(true);
  expect(result.totalDeduction.plus(result.floorDisallowed).toFixed()).toBe('15000');
  expect(JSON.stringify(input)).toBe(before);
});

it('preserves the exact current-floor boundary without rounding or re-aging', () => {
  for (const [other, priorDeduction, total, currentFloor] of [
    ['499.99', '4999.99', '14999.99', '499.99'], ['500', '5000', '15000', '500'], ['500.01', '5000', '15000.01', '500'],
  ]) {
    const result = calculate(fixture(other), context(other));
    expect(result.priorDeduction.toFixed()).toBe(priorDeduction);
    expect(result.totalDeduction.toFixed()).toBe(total);
    expect(result.currentFloorByCategory.capital_gain_20.toFixed()).toBe(currentFloor);
    expect(result.priorTreatedAsPaid.toFixed()).toBe('5000');
    expect(result.floorDisallowed.toFixed()).toBe('500'); expect(result.carryforwards).toEqual([]);
    expect(result.method).toBe(other === '499.99' ? '2026_single_prior_floor_no_excess' : '2026_determined_current_category_floor');
  }
});

it('preserves actual annual consumption and original expiration independently', () => {
  const input = nonitemizedCategoryFixture('10000', '0', '0', '0', '0', [
    { taxYear: 2021, category: 'capital_gain_30', amount: '5000' },
    { taxYear: 2020, category: 'noncash_50', amount: '200' },
  ]);
  const prior = input.charitableCarryoverSources?.vintages?.[0];
  if (!prior?.history?.[0]) throw new Error('Missing actual annual source');
  prior.originalExcess = '7000'; prior.history[0].treatedAsPaid = '2000';
  prior.sourceReference = 'Fictional2021 original excess7000 and2022 filed use2000; actual zero2023-25';
  const before = JSON.stringify(input), result = calculate(input, context());
  const row = result.detail.find(value => value.taxYear === 2021);
  if (!row) throw new Error('Missing original2021 row');
  expect([row.amountAvailable, row.treatedAsPaid, row.amountUsed, row.amountRemaining, row.amountExpired].map(value => value.toFixed()))
    .toEqual(['5000', '5000', '4500', '0', '0']);
  expect(result.expired.toFixed()).toBe('200'); expect(result.carryforwards).toEqual([]);
  const reverse = structuredClone(input); reverse.donations.reverse(); reverse.charitableCarryoverSources?.vintages?.reverse();
  const reordered = calculate(reverse, context());
  expect({ ...reordered, sourceDigest: result.sourceDigest }).toEqual(result);
  expect(reordered.sourceDigest).not.toBe(result.sourceDigest);
  expect(JSON.stringify(input)).toBe(before);
});

it('retains unresolved allocation and incomplete-source guards', () => {
  for (const input of [
    nonitemizedCategoryFixture('10000', '0', '0', '1000', '0', [{ taxYear: 2025, category: 'capital_gain_30', amount: '5000' }]),
    nonitemizedCategoryFixture('10000', '0', '0', '0', '0', [{ taxYear: 2025, category: 'capital_gain_30', amount: '5000' }, { taxYear: 2024, category: 'capital_gain_30', amount: '100' }]),
    nonitemizedCategoryFixture('10000', '0', '40000', '0', '0', [{ taxYear: 2025, category: 'capital_gain_30', amount: '5000' }]),
    nonitemizedCategoryFixture('10000', '0', '0', '0', '0', [{ taxYear: 2025, category: 'capital_gain_30', amount: '40000' }]),
    nonitemizedCategoryFixture('10000', '0', '0', '0', '0', [{ taxYear: 2021, category: 'capital_gain_30', amount: '40000' }]),
  ]) {
    const c = nonitemizedCategoryContext('10000', '0', input.donations[2].amount, input.donations[3].amount, '0');
    expect(() => calculate(input, c)).toThrow(/floor.*prior|prior.*floor/i);
  }
  for (const change of [
    (input: ReturnType<typeof fixture>) => { input.charitableCarryoverSources = undefined; },
    (input: ReturnType<typeof fixture>) => { if (input.charitableCarryoverSources) input.charitableCarryoverSources.primaryTaxpayerIdLast4 = '9999'; },
    (input: ReturnType<typeof fixture>) => { if (input.charitableCarryoverSources) input.charitableCarryoverSources.sourceTaxYear = 2025; },
    (input: ReturnType<typeof fixture>) => { if (input.charitableCarryoverSources?.vintages?.[0]) input.charitableCarryoverSources.vintages[0].allHistoryIncluded = false; },
    (input: ReturnType<typeof fixture>) => { input.netOperatingLoss = {}; },
  ]) { const input = fixture(); change(input); expect(() => calculate(input, context())).toThrow(); }
});
