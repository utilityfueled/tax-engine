// Spec: spec/federal/charitable-single-category-nol.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { d } from '@/utils/decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { singleCategoryCharitableNolInput } from '../fixtures/charitable-single-category-nol.js';

it('reproduces the published capital-property NOL carry difference', () => {
  const input = singleCategoryCharitableNolInput();
  input.w2s[0].wages = '50000'; input.donations[0].amount = '30000';
  const vintage = input.netOperatingLoss?.vintages?.[0];
  if (!vintage) throw new Error('Missing synthetic loss');
  Object.assign(vintage, { lossTaxYear: 2017, originalLoss: '50000', openingCarryforward: '50000',
    carrybackTreatment: 'waived', carrybackSourceReference: 'Synthetic actual waiver' });
  const result = calculateFederalTax(input);
  expect([result.nolDeduction, result.agi, result.deductionAmount, result.carryforwards.nolCarryforward,
    result.carryforwards.charitableContributions].map(value => value.toFixed())).toEqual(['50000', '0', '0', '15000', '15000']);
  expect(result.netOperatingLoss?.charitableCarryover?.counterfactualNolCarryforward.toFixed()).toBe('0');
  expect(result.carryforwards.charitableContributionsByYear.map(row => [row.category, row.medium, row.amount.toFixed()]))
    .toEqual([['capital_gain_30', 'noncash', '15000']]);
});

it('replays each single current category without converting its carry to public cash', () => {
  for (const [category, expectedCategory, medium, claim, tentative, nol, comparison, charity] of [
    ['A', 'noncash_50', 'noncash', '40000', '30000', '60000', '44000', '14000'],
    ['B-cash', 'other_30', 'cash', '56000', '46800', '44000', '30560', '33360'],
    ['B-property', 'other_30', 'noncash', '56000', '46800', '44000', '30560', '33360'],
    ['C', 'capital_gain_30', 'noncash', '56000', '46800', '44000', '30560', '33360'],
    ['D', 'capital_gain_20', 'noncash', '64000', '52800', '36000', '25760', '42560'],
  ] as const) {
    const input = singleCategoryCharitableNolInput(category); const original = JSON.stringify(input);
    const result = calculateFederalTax(input); const carry = result.netOperatingLoss?.charitableCarryover;
    expect([result.nolDeduction, carry?.tentativeCarryforward, result.carryforwards.nolCarryforward,
      carry?.counterfactualNolCarryforward, result.carryforwards.charitableContributions].map(value => value?.toFixed()))
      .toEqual([claim, tentative, nol, comparison, charity]);
    expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear, row.category, row.medium, row.amount.toFixed()]))
      .toEqual([[2025, expectedCategory, medium, charity]]);
    expect(result.carryforwards.amtCharitableContributionsByYear?.map(row => [row.category, row.medium, row.amount.toFixed()]))
      .toEqual([[expectedCategory, medium, tentative]]);
    expect(JSON.stringify(input)).toBe(original);
  }
});

it('keeps the property charity carry and current AMT claim independent', () => {
  const input = singleCategoryCharitableNolInput('C', 2025, true); const original = JSON.stringify(input);
  const result = calculateFederalTax(input); const amt = result.netOperatingLoss?.alternativeTax;
  const carry = result.netOperatingLoss?.alternativeCharitableCarryover;
  expect([result.agi, result.deductionAmount, result.carryforwards.charitableContributions,
    result.carryforwards.amtCharitableContributions].map(value => value?.toFixed())).toEqual(['97000', '29100', '30900', '30090']);
  expect([amt?.amtiBeforeAtnol, amt?.deduction, amt?.modifiedAmtiBeforeAtnol, amt?.absorbed, amt?.carryforward]
    .map(value => value?.toFixed())).toEqual(['67900', '61110', '70000', '63000', '37000']);
  expect([carry?.counterfactualNolCarryforward, carry?.reduction].map(value => value?.toFixed())).toEqual(['36190', '810']);
  expect(result.netOperatingLoss?.alternativeCharitableCounterfactual?.calculation.deduction.toFixed()).toBe('61110');
  expect(result.carryforwards.amtCharitableContributionsByYear?.map(row => [row.category, row.medium, row.amount.toFixed()]))
    .toEqual([['capital_gain_30', 'noncash', '30090']]);
  expect(JSON.stringify(input)).toBe(original);
});

it('reapplies the isolated property floor with a confirmed empty history', () => {
  const input = singleCategoryCharitableNolInput('C', 2026); const result = calculateFederalTax(input);
  const carry = result.netOperatingLoss?.charitableCarryover;
  expect([result.nolDeduction, result.agi, result.deductionAmount, carry?.tentativeCarryforward,
    result.carryforwards.nolCarryforward, carry?.counterfactualNolCarryforward,
    result.carryforwards.charitableContributions].map(value => value?.toFixed()))
    .toEqual(['56400', '43600', '12862', '47138', '43600', '29890', '33428']);
});

it('retains exact property receipts before rounding the completed alternative carry worksheet', () => {
  for (const [receipt, regular, alternative] of [['60000.49', '30900.49', '30090'], ['60000.50', '30900.5', '30091']]) {
    const input = singleCategoryCharitableNolInput('C', 2025, true); input.donations[0].amount = receipt;
    const result = calculateFederalTax(input);
    expect(result.netOperatingLoss?.alternativeCharitableCarryover?.sourceContributions.toFixed()).toBe(d(receipt).toFixed());
    expect(result.carryforwards.charitableContributions.toFixed()).toBe(regular);
    expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe(alternative);
    expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('61110');
    expect(input.donations[0].amount).toBe(receipt);
  }
});
