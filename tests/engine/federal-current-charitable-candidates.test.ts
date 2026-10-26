// Spec: spec/federal/current-charitable-candidates.yaml. Year gate is enabled only in this test.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { extractMetricsFromResult } from '@/lib/guided-preview-compute';
import { nonitemizerCarryFixture } from '../fixtures/nonitemizer-carry.js';

it('selects the correct carry after the final automatic or explicit deduction choice', () => {
  for (const [election, expectedMethod, expectedCarry] of [['automatic', 'standard', '3000'], ['itemized', 'itemized', '3050']] as const) {
    const input = nonitemizerCarryFixture(); input.deductionElection = election;
    if (!input.standardDeductionFacts) throw new Error('Missing actual eligibility');
    input.standardDeductionFacts.spouseItemizes = false;
    const before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe(expectedMethod);
    expect(result.scheduleA?.charitableTotal.toFixed()).toBe('5950');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe(expectedCarry);
    expect(result.scheduleA?.charitableTreatment?.carryforwards.map(row => row.amount.toFixed())).toEqual([expectedCarry]);
    expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe(expectedMethod === 'standard' ? '1000' : '0');
    expect(result.taxableIncome.toFixed()).toBe(expectedMethod === 'standard' ? '0' : '4050');
    expect(extractMetricsFromResult(result).taxableIncome).toBe(result.taxableIncome.toFixed());
    expect(buildOhioResidentReturnInput(input, result).federalAgi.toFixed()).toBe('10000');
    expect(JSON.stringify(input)).toBe(before);
  }
  const itemized = nonitemizerCarryFixture('90000'); itemized.deductionElection = 'automatic';
  itemized.w2s[0].wages = '100000'; itemized.w2s[0].federalWithheld = '40000';
  if (!itemized.standardDeductionFacts) throw new Error('Missing actual eligibility');
  itemized.standardDeductionFacts.spouseItemizes = false;
  const result = calculateFederalTax(itemized);
  expect(result.deductionUsed).toBe('itemized');
  expect(result.scheduleA?.charitableTotal.toFixed()).toBe('59500');
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('30500');
  itemized.standardDeductionFacts.spouseItemizes = true;
  expect(calculateFederalTax(itemized).deductionUsed).toBe('itemized');
});

it('preserves current source arithmetic and rejects an unimplemented prior floor method', () => {
  const actual = nonitemizerCarryFixture('9000.99'); actual.deductionElection = 'itemized';
  actual.w2s[0].wages = '10000.49';
  const withHistory = calculateFederalTax(actual);
  const sourceOnly = structuredClone(actual); sourceOnly.charitableCarryoverSources = undefined;
  const withoutHistory = calculateFederalTax(sourceOnly);
  expect(withHistory.scheduleA?.charitableTotal.toFixed()).toBe(withoutHistory.scheduleA?.charitableTotal.toFixed());
  expect(withHistory.carryforwards.charitableContributions.toFixed()).toBe(withoutHistory.carryforwards.charitableContributions.toFixed());
  const prior = nonitemizerCarryFixture('2000', [{ taxYear: 2025, amount: '5000' }]); prior.deductionElection = 'itemized';
  expect(() => calculateFederalTax(prior)).toThrow(/prior|floor|2026/i);
  const unknown = nonitemizerCarryFixture(); unknown.deductionElection = 'automatic'; unknown.charitableCarryoverSources = undefined;
  if (!unknown.standardDeductionFacts) throw new Error('Missing actual eligibility');
  unknown.standardDeductionFacts.spouseItemizes = false;
  expect(() => calculateFederalTax(unknown)).toThrow(/nonitemiz.*carry|carry.*nonitemiz/i);
});
