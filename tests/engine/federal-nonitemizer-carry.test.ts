// Spec: spec/federal/nonitemized-charitable-carryover.yaml. Draft constants only in this test.
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

it('separates actual nonitemizer carry from the itemized floor and standard entitlement', () => {
  for (const method of ['nonitemized', 'standard'] as const) {
    const input = nonitemizerCarryFixture(); input.deductionElection = method;
    if (method === 'standard' && input.standardDeductionFacts) input.standardDeductionFacts.spouseItemizes = false;
    const before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe(method);
    expect(result.deductionAmount.toFixed()).toBe(method === 'standard' ? '16100' : '0');
    expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe('1000');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe('3050');
    expect(result.carryforwards.charitableContributionsByYear?.map(row => [row.taxYear, row.category, row.amount.toFixed()]))
      .toEqual([[2026, 'cash_60', '3050']]);
    expect(result.scheduleA?.charitableTotal.toFixed()).toBe('0');
    expect(result.scheduleA?.charitableTreatment?.deduction.toFixed()).toBe('1000');
    expect(result.scheduleA?.charitableTreatment?.priorDeduction.toFixed()).toBe('0');
    expect(result.taxableIncome.toFixed()).toBe(method === 'standard' ? '0' : '9000');
    expect(result.allLines.filter(row => row.form === 'Charitable Carryover' && row.line === 'selected-deduction')).toHaveLength(1);
    expect(buildOhioResidentReturnInput(input, result).federalAgi.toFixed()).toBe('10000');
    expect(extractMetricsFromResult(result).taxableIncome).toBe(method === 'standard' ? '0' : '9000');
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('retains prior use without increasing the current cash deduction', () => {
  const input = nonitemizerCarryFixture('2000', [{ taxYear: 2025, amount: '5000' }]), before = JSON.stringify(input);
  expect(() => calculateFederalTax(input)).toThrow(/floor.*prior|prior.*floor/i);
  expect(JSON.stringify(input)).toBe(before);
  const onlyPrior = nonitemizerCarryFixture('0', [{ taxYear: 2025, amount: '5000' }]);
  onlyPrior.w2s[0].wages='0'; onlyPrior.w2s[0].federalWithheld='0';
  const priorResult = calculateFederalTax(onlyPrior);
  expect(priorResult.nonitemizerCharitableDeduction?.toFixed()).toBe('0');
  expect(priorResult.scheduleA?.charitableTreatment?.priorTreatedAsPaid.toFixed()).toBe('0');
  expect(priorResult.carryforwards.charitableContributionsByYear.map(row=>[row.taxYear,row.amount.toFixed()])).toEqual([[2025,'5000']]);
});

it('consumes the sole prior source without a current deduction or new vintage', () => {
  const input = nonitemizerCarryFixture('0', [{ taxYear: 2025, amount: '5000' }]);
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  const treatment = result.scheduleA?.charitableTreatment;
  if (!treatment) throw new Error('Missing actual sole-prior treatment');
  expect(result.scheduleA?.nonitemizedCharitableCarryover?.method).toBe('2026_nonitemized_ordinary_categories');
  expect(result.allLines.filter(row => row.form === 'Charitable Determined Floor' && row.line === 'cash_60')
    .map(row => [row.value.toFixed(), row.inputs['Prior floor disallowed']?.toString()])).toEqual([['4950', '50']]);
  expect(result.deductionUsed).toBe('nonitemized');
  expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe('0');
  expect(result.deductionAmount.toFixed()).toBe('0');
  expect([treatment.deduction, treatment.priorDeduction, treatment.priorTreatedAsPaid].map(value => value.toFixed()))
    .toEqual(['0', '0', '5000']);
  expect(treatment.detail.map(row => [row.taxYear, row.sourceId, row.category, row.medium,
    row.amountAvailable.toFixed(), row.treatedAsPaid?.toFixed(), row.amountUsed.toFixed(),
    row.amountRemaining.toFixed(), row.amountExpired.toFixed()]))
    .toEqual([[2025, 'actual-cash-2025', 'cash_60', 'cash', '5000', '5000', '0', '0', '0']]);
  expect(treatment.carryforwards).toEqual([]);
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
  expect(result.carryforwards.charitableContributionsByYear).toEqual([]);
  expect(result.taxableIncome.toFixed()).toBe('10000');
  expect(JSON.stringify(input)).toBe(before);
});

it('rejects unverified candidate carry and unsupported selection changes', () => {
  for (const method of ['standard', 'nonitemized', 'automatic'] as const) {
    const input = nonitemizerCarryFixture(); input.deductionElection = method; input.charitableCarryoverSources = undefined;
    if (method !== 'nonitemized' && input.standardDeductionFacts) input.standardDeductionFacts.spouseItemizes = false;
    expect(() => calculateFederalTax(input)).toThrow(/nonitemiz.*carry|carry.*nonitemiz/i);
  }
  for (const method of ['itemized', 'automatic'] as const) {
    const changed = nonitemizerCarryFixture('2000', [{ taxYear: 2025, amount: '5000' }]); changed.deductionElection = method;
    expect(() => calculateFederalTax(changed)).toThrow(/floor reaching an allowed prior contribution.*original-vintage/i);
  }
});
