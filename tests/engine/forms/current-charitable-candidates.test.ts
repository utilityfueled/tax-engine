// Spec: spec/federal/current-charitable-candidates.yaml.
import { expect, it } from 'vitest';
import { d } from '@/utils/decimal.js';
import { calculateCurrentCharitableCandidates } from '@/engine/forms/current-charitable-candidates.js';
import { nonitemizerCarryFixture } from '../../fixtures/nonitemizer-carry.js';

function context(cash: string, base = '10000') {
  return { contributionBase: d(base), current: { cashPublic: d(cash), noncashPublic: d('0'), capitalGainPublic: d('0'),
    cashPrivate: d('0'), noncashPrivate: d('0'), capitalGainPrivate: d('0') } };
}

it('retains both exact current cash carry candidates without prior attribution', () => {
  const input = nonitemizerCarryFixture('9000.99'), before = JSON.stringify(input);
  const result = calculateCurrentCharitableCandidates(input, context('9000.99', '10000.49'));
  expect(result.method).toBe('2026_current_public_cash_dual');
  expect(result.itemized.exactCashDeduction.toFixed()).toBe('5950.29155');
  expect(result.itemized.carryforwards.map(row => row.amount.toFixed())).toEqual(['3050.69845']);
  expect(result.nonitemizedCarryforwards.map(row => row.amount.toFixed())).toEqual(['3000.696']);
  expect(JSON.stringify(input)).toBe(before);
  for (const [cash, itemizedCarry, nonitemizedCarry] of [['6000', [], []], ['6000.01', ['50.01'], ['0.01']]] as const) {
    const boundary = calculateCurrentCharitableCandidates(nonitemizerCarryFixture(cash), context(cash));
    expect(boundary.itemized.carryforwards.map(row => row.amount.toFixed())).toEqual(itemizedCarry);
    expect(boundary.nonitemizedCarryforwards.map(row => row.amount.toFixed())).toEqual(nonitemizedCarry);
  }
});

it('requires actual empty prior history and original ordinary public cash sources', () => {
  const missing = nonitemizerCarryFixture(); missing.charitableCarryoverSources = undefined;
  expect(() => calculateCurrentCharitableCandidates(missing, context('9000'))).toThrow(/source|history/i);
  const prior = nonitemizerCarryFixture('9000', [{ taxYear: 2025, amount: '0.01' }]);
  expect(() => calculateCurrentCharitableCandidates(prior, context('9000'))).toThrow(/prior|empty/i);
  const identity = nonitemizerCarryFixture();
  if (!identity.charitableCarryoverSources) throw new Error('Missing synthetic history');
  identity.charitableCarryoverSources.primaryTaxpayerIdLast4 = '1111';
  expect(() => calculateCurrentCharitableCandidates(identity, context('9000'))).toThrow(/identity|taxpayer/i);
  const mixed = context('9000'); mixed.current.noncashPublic = d('1');
  expect(() => calculateCurrentCharitableCandidates(nonitemizerCarryFixture(), mixed)).toThrow(/cash|category/i);
  expect(() => calculateCurrentCharitableCandidates(nonitemizerCarryFixture(), context('9000.01'))).toThrow(/receipt|reconcile|source/i);
  const loss = nonitemizerCarryFixture(); loss.priorYear = { ...loss.priorYear, nolCarryforward: '0.01' };
  expect(() => calculateCurrentCharitableCandidates(loss, context('9000'))).toThrow(/NOL|loss/i);
});
