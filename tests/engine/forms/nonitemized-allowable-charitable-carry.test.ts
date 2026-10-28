// Spec: spec/federal/nonitemized-allowable-charitable-carry.yaml.
import { expect, it } from 'vitest';
import { calculateCurrentCharitableCandidates } from '@/engine/forms/current-charitable-candidates.js';
import { calculateNonitemizedCharitableCarryover } from '@/engine/forms/nonitemized-charitable-carryover.js';
import { calculateNonitemizedCharitableCategories } from '@/engine/forms/nonitemized-charitable-categories.js';
import { currentCategoryFixture, currentCategoryContext } from '../../fixtures/current-charitable-categories.js';
import { nonitemizerCarryFixture } from '../../fixtures/nonitemizer-carry.js';
import { nonitemizedCategoryFixture } from '../../fixtures/nonitemized-charitable-categories.js';
import { sum } from '@/utils/decimal.js';
const total = (rows: { amount: Parameters<typeof sum>[number] }[]) => sum(...rows.map(row => row.amount)).toFixed();
it('uses one current allowable carry at every established category and exact cap', () => {
  for (const amounts of [
    ['70000','0','0','0','0'], ['0','60000','0','0','0'], ['0','0','40000','0','0'],
    ['0','0','0','40000','0'], ['0','0','0','0','30000'],
  ] as const) {
    const input = currentCategoryFixture(...amounts), before = JSON.stringify(input);
    const result = calculateCurrentCharitableCandidates(input, currentCategoryContext(...amounts));
    expect(total(result.itemized.carryforwards)).toBe('10500');
    expect(total(result.nonitemizedCarryforwards)).toBe('10500');
    expect(JSON.stringify(input)).toBe(before);
  }
  for (const [amount, carry] of [['20000','0'],['30000','0'],['30000.01','500.01']]) {
    const result = calculateCurrentCharitableCandidates(currentCategoryFixture('0','0','0',amount,'0'), currentCategoryContext('0','0','0',amount,'0'));
    expect(total(result.nonitemizedCarryforwards)).toBe(carry);
  }
});
it('keeps wrapper carry distinct from actual nonitemized deductions', () => {
  const cash = nonitemizerCarryFixture('70000');
  const result = calculateNonitemizedCharitableCarryover(cash, currentCategoryContext('70000','0','0','0','0'));
  expect(total(result.carryforwards)).toBe('10500'); expect(result.totalDeduction.toFixed()).toBe('0');
  const property = currentCategoryFixture('0','0','0','40000','0');
  const categories = calculateNonitemizedCharitableCategories(property, currentCategoryContext('0','0','0','40000','0'));
  expect(total(categories.carryforwards)).toBe('10500'); expect(categories.totalDeduction.toFixed()).toBe('0');
  property.charitableCarryoverSources = undefined;
  expect(() => calculateNonitemizedCharitableCategories(property, currentCategoryContext('0','0','0','40000','0'))).toThrow(/source|histor/i);
});
it('retains unaffected prior use while refusing unresolved prior floor attribution', () => {
  const input = nonitemizedCategoryFixture('10000','0','0','40000','10000',[{taxYear:2025,category:'cash_60',amount:'20000'}]);
  const result = calculateNonitemizedCharitableCategories(input, currentCategoryContext('10000','0','0','40000','10000'));
  expect(total(result.carryforwards)).toBe('20500');
  expect(result.detail.map(row => [row.taxYear,row.treatedAsPaid.toFixed(),row.amountUsed.toFixed()])).toEqual([[2025,'20000','0']]);
  const unresolved = nonitemizedCategoryFixture('0','0','0','10000','0',[{taxYear:2025,category:'capital_gain_30',amount:'5000'}]);
  expect(() => calculateNonitemizedCharitableCategories(unresolved,currentCategoryContext('0','0','0','10000','0'))).toThrow(/floor.*prior|prior.*floor/i);
});
