// Spec: spec/federal/charitable-full-prior-floor-independent.yaml.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateCharitableDeterminedFloor } from '@/engine/forms/charitable-determined-floor.js';
import { nonitemizedCategoryFixture, nonitemizedCategoryContext } from '../../fixtures/nonitemized-charitable-categories.js';

it('preserves the fractional-cent floor boundary without assigning a partial vintage', () => {
  const original = () => nonitemizedCategoryFixture('0', '0', '0', '0', '0', [
    { taxYear: 2024, category: 'capital_gain_30', amount: '200' },
    { taxYear: 2025, category: 'capital_gain_30', amount: '300' },
  ]);
  const context = (base: string) => ({ ...nonitemizedCategoryContext('0', '0', '0', '0', '0'), contributionBase: new Decimal(base) });
  const result = calculateCharitableDeterminedFloor(original(), context('100000.20'));
  expect(result.priorTreatedAsPaid.toFixed()).toBe('500');
  expect(result.floorDisallowed.toFixed()).toBe('500');
  expect(result.detail.map(row => row.amountUsed.toFixed())).toEqual(['0', '0']);
  expect(result.carryforwards).toEqual([]);
  expect(result.nonitemizedCarryforwards).toEqual([]);
  expect(() => calculateCharitableDeterminedFloor(original(), context('99999.80'))).toThrow(/floor.*prior|prior.*floor/i);
});
