// Spec: spec/federal/nonitemized-charitable-election.yaml.
// Test-only draft constants; actual year/export gates remain closed.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { d } from '@/utils/decimal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { extractMetricsFromResult } from '@/lib/guided-preview-compute';
import { nonitemizedCharityFixture } from '../fixtures/nonitemized-charity.js';

it('claims only actual current eligible cash when the standard deduction is unavailable', () => {
  const input = nonitemizedCharityFixture(), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.deductionUsed).toBe('nonitemized');
  expect(result.standardDeduction.toFixed()).toBe('0');
  expect(result.deductionAmount.toFixed()).toBe('0');
  expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe('1000');
  expect(result.allLines.find(row => row.form === '1040' && row.line === '14')?.value.toFixed()).toBe('1000');
  expect(result.agi.toFixed()).toBe('75000'); expect(result.taxableIncome.toFixed()).toBe('74000');
  expect(result.allLines.filter(row => row.form === '1040' && row.line === '12').map(row => row.value.toFixed())).toEqual(['0']);
  expect(result.allLines.find(row => row.form === '1040' && row.line === 'nonitemizer-charity')?.description).not.toMatch(/with standard/i);
  expect(extractMetricsFromResult(result).taxableIncome).toBe('74000');
  const ohio = buildOhioResidentReturnInput(input, result);
  expect(ohio.federalAgi.toFixed()).toBe('75000');
  expect(JSON.stringify(input)).toBe(before);
  for (const field of ['supportingOrganization', 'donorAdvisedFund', 'qualifiedOrganization'] as const) {
    const changed = nonitemizedCharityFixture(); changed.donations[0][field] = field === 'qualifiedOrganization' ? false : true;
    expect(calculateFederalTax(changed).nonitemizerCharitableDeduction?.toFixed()).toBe('0');
  }
  const itemized = nonitemizedCharityFixture(); itemized.deductionElection = 'itemized';
  expect(calculateFederalTax(itemized).nonitemizerCharitableDeduction?.toFixed()).toBe('0');
  expect(calculateFederalTax(itemized).deductionAmount.toFixed()).toBe('1125');
});

it('preserves historical elections source facts and unsupported carry methods', () => {
  const unknown = nonitemizedCharityFixture(); unknown.standardDeductionFacts = undefined;
  expect(() => calculateFederalTax(unknown)).toThrow(/standard.*facts/i);
  const omitted = nonitemizedCharityFixture(); omitted.donations[0].supportingOrganization = undefined;
  expect(() => calculateFederalTax(omitted)).toThrow(/qualification.*unknown/i);
  const eligible = nonitemizedCharityFixture(); if (eligible.standardDeductionFacts) eligible.standardDeductionFacts.spouseItemizes = false;
  expect(() => calculateFederalTax(eligible)).toThrow(/unavailable|ineligible/i);
  const past = nonitemizedCharityFixture(); past.taxpayer.taxYear = 2025; past.donations[0].dateOfDonation = '2025-05-15';
  expect(() => calculateFederalTax(past)).toThrow(/2026/i);
  const missingHistory = nonitemizedCharityFixture(); missingHistory.priorYear = { charitableCarryforward: '1' };
  expect(() => calculateFederalTax(missingHistory)).toThrow(/source history/i);
  const loss = nonitemizedCharityFixture(); loss.netOperatingLoss = {};
  expect(() => calculateFederalTax(loss)).toThrow(/nonitemized.*NOL|NOL.*nonitemized/i);
  const excess = nonitemizedCharityFixture(); excess.w2s[0].wages = '1000';
  expect(calculateScheduleA(excess, d('1000'), 'married_filing_separately', FEDERAL_2026_CONSTANTS)
    .nonitemizerCharitableDeduction.toFixed()).toBe('600');
  const original = JSON.stringify(excess);
  expect(() => calculateFederalTax(excess)).toThrow(/nonitemized.*carry|carry.*nonitemized/i);
  expect(JSON.stringify(excess)).toBe(original);
});
