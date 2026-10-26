// Spec: spec/federal/form-172-charitable-origin.yaml. Derived source controls.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { currentCharitableOriginInput } from '../fixtures/form-172-charitable-origin.js';
import { singleCategoryCharitableNolInput } from '../fixtures/charitable-single-category-nol.js';
import { capitalOriginInput } from '../fixtures/form-172-capital-origin.js';

function actual<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing fictional source or completed result');
  return value;
}

it('uses selected charitable deductions in separate regular and alternative origins', () => {
  const input = currentCharitableOriginInput(); const before = JSON.stringify(input);
  const result = calculateFederalTax(input), regular = actual(result.form172).regular, alternative = actual(result.form172).alternativeTax;
  expect([result.agi, result.scheduleA?.charitableTotal, result.deductionAmount, regular.partI[1], regular.partI[6],
    regular.partI[7], regular.partI[9], regular.netOperatingLoss, alternative.netOperatingLoss].map(value => value?.toFixed()))
    .toEqual(['10000', '6000', '26000', '-16000', '26000', '30000', '0', '16000', '0']);
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('14000');
  expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe('14000');
  expect(actual(result.form172).section1411OriginalLoss.toFixed()).toBe('0');
  expect(JSON.stringify(input)).toBe(before);
});

it('applies the nonbusiness limit without reducing undeducted charitable excess', () => {
  const input = currentCharitableOriginInput(); input.scheduleA = { medicalExpenses: '30000' };
  const result = calculateFederalTax(input), origin = actual(result.form172);
  for (const calculation of [origin.regular, origin.alternativeTax]) {
    expect([calculation.partI[1], calculation.partI[6], calculation.partI[7], calculation.partI[9], calculation.netOperatingLoss]
      .map(value => value.toFixed())).toEqual(['-25250', '35250', '30000', '5250', '20000']);
  }
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('14000');
  expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe('14000');
  input.donations = [];
  const comparison = calculateFederalTax(input);
  expect(comparison.form172?.regular.netOperatingLoss.toFixed()).toBe('19250');
});

it('preserves qualified current categories histories and negative-base carry', () => {
  for (const [category, deduction, origin, carry, carryCategory, medium] of [
    ['G', '6000', '16000', '14000', 'cash_60', 'cash'],
    ['A', '4000', '14000', '0', 'noncash_50', 'noncash'],
    ['B-cash', '3000', '13000', '17000', 'other_30', 'cash'],
    ['B-property', '3000', '13000', '17000', 'other_30', 'noncash'],
    ['C', '3000', '13000', '17000', 'capital_gain_30', 'noncash'],
    ['D', '2000', '12000', '18000', 'capital_gain_20', 'noncash'],
  ] as const) {
    const input = currentCharitableOriginInput(category), result = calculateFederalTax(input);
    expect([result.scheduleA?.charitableTotal, result.form172?.regular.netOperatingLoss, result.carryforwards.charitableContributions]
      .map(value => value?.toFixed())).toEqual([deduction, origin, carry]);
    expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('0');
    expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear, row.category, row.medium, row.amount.toFixed()]))
      .toEqual(carry === '0' ? [] : [[2025, carryCategory, medium, carry]]);
  }
  const negative = currentCharitableOriginInput('C'); actual(negative.scheduleC).expenses.otherExpenses = '100000';
  const result = calculateFederalTax(negative);
  expect(result.agi.toFixed()).toBe('-50000');
  expect(result.scheduleA?.charitableTotal.toFixed()).toBe('0');
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('20000');
  const incomplete = currentCharitableOriginInput(); actual(incomplete.netOperatingLoss?.alternativeTax).charitableCarryoverHistory = undefined;
  expect(() => calculateFederalTax(incomplete)).toThrow(/independent.*charit|charit.*histor/i);
});

it('retains independent current percentage carry and prior NOL replay precedence', () => {
  const input = currentCharitableOriginInput(), result = calculateFederalTax(input);
  expect(actual(input.netOperatingLoss?.alternativeTax).vintages).toEqual([]);
  expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('0');
  expect(result.carryforwards.amtCharitableContributionsByYear?.map(row => [row.taxYear, row.category, row.medium, row.amount.toFixed()]))
    .toEqual([[2025, 'cash_60', 'cash', '14000']]);
  actual(input.netOperatingLoss?.alternativeTax).charitableCarryoverHistory = undefined;
  expect(() => calculateFederalTax(input)).toThrow(/independent.*charit|charit.*histor/i);

  const old = singleCategoryCharitableNolInput('C');
  actual(old.netOperatingLoss?.alternativeTax).vintages = [
    { ...actual(old.netOperatingLoss?.vintages[0]), sourceId: 'Synthetic independent alternative old loss', section1411OriginalLoss: undefined },
  ];
  const priorResult = calculateFederalTax(old);
  old.form172 = { ...actual(currentCharitableOriginInput().form172), businessSources: [] };
  const withOrigin = calculateFederalTax(old);
  expect(withOrigin.form172?.regular.netOperatingLoss.toFixed()).toBe('0');
  expect(withOrigin.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('0');
  expect(withOrigin.carryforwards.charitableContributions.toFixed()).toBe('33360');
  expect(withOrigin.carryforwards.amtCharitableContributions?.toFixed()).toBe(priorResult.carryforwards.amtCharitableContributions?.toFixed());
  expect(withOrigin.carryforwards.charitableContributions.lt(actual(withOrigin.form172?.charitableSources).percentageCarryforward)).toBe(true);

  const alternative = singleCategoryCharitableNolInput('C', 2025, true);
  const capital = actual(capitalOriginInput().form172?.capitalSources);
  capital.transactions = []; capital.distributions = [];
  actual(capital.priorCapitalLosses).shortTermCapitalLoss = '-3000';
  alternative.form172 = { ...actual(currentCharitableOriginInput().form172), businessSources: [], capitalSources: capital };
  const independent = calculateFederalTax(alternative);
  expect(independent.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('0');
  expect(independent.form172?.charitableSources?.percentageCarryforward.toFixed()).toBe('30900');
  expect(independent.carryforwards.amtCharitableContributions?.toFixed()).toBe('30090');
});

it('uses the actual standard choice without inventing charitable excess', () => {
  const input = currentCharitableOriginInput(); input.deductionElection = 'standard';
  const result = calculateFederalTax(input);
  expect(result.deductionUsed).toBe('standard');
  expect([result.deductionAmount, result.form172?.regular.netOperatingLoss, result.form172?.alternativeTax.netOperatingLoss,
    result.form172?.charitableSources?.regularCurrentDeduction, result.form172?.charitableSources?.alternativeCurrentDeduction,
    result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['15750', '5750', '0', '0', '0', '14000', '14000']);
  input.donations[0].amount = '2000';
  const below = calculateFederalTax(input);
  expect(below.form172?.regular.netOperatingLoss.toFixed()).toBe('5750');
  expect(below.carryforwards.charitableContributions.toFixed()).toBe('0');
  expect(below.carryforwards.amtCharitableContributions?.toFixed()).toBe('0');
  input.donations[0].qualifiedOrganization = false;
  expect(calculateFederalTax(input).form172?.charitableSources?.qualifiedValue.toFixed()).toBe('0');
  const future = currentCharitableOriginInput('G', 2026);
  expect(() => calculateFederalTax(future)).toThrow(/2026|not.*qualified|not.*available|not.*complete/i);
});
