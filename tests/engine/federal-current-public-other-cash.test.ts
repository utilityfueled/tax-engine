// Spec: spec/federal/current-public-other-cash.yaml. Draft constants are test-only.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { nonitemizerCarryFixture } from '../fixtures/nonitemizer-carry.js';
import { extractMetricsFromResult } from '@/lib/guided-preview-compute';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';

it('selects public and other-recipient cash carry after the actual deduction election', () => {
  for (const [election, method, carry] of [
    ['automatic', 'standard', '1000'], ['itemized', 'itemized', '1050'], ['nonitemized', 'nonitemized', '1000'],
  ] as const) {
    const input = nonitemizerCarryFixture('4000'); input.deductionElection = election;
    if (!input.standardDeductionFacts) throw new Error('Missing synthetic eligibility source');
    input.standardDeductionFacts.spouseItemizes = election === 'nonitemized';
    input.donations.push({ organization: 'Actual other qualified recipient', type: 'cash', amount: '3000',
      dateOfDonation: '2026-05-15', qualifiedOrganization: true, recipientCategory: 'other-thirty-percent',
      supportingOrganization: false, donorAdvisedFund: false });
    const before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe(method);
    expect(result.scheduleA?.charitableCurrentCash.toFixed()).toBe('5950');
    expect(result.scheduleA?.charitableCurrentNoncash.toFixed()).toBe('0');
    expect(result.scheduleA?.charitablePriorYearUsed.toFixed()).toBe('0');
    expect(result.scheduleA?.charitableTotal.toFixed()).toBe('5950');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe(carry);
    expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear, row.category, row.medium, row.amount.toFixed()]))
      .toEqual([[2026, 'other_30', 'cash', carry]]);
    expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe(method === 'itemized' ? '0' : '1000');
    expect(result.scheduleA?.charitableTreatment?.priorTreatedAsPaid.toFixed()).toBe('0');
    expect(extractMetricsFromResult(result).taxableIncome).toBe(result.taxableIncome.toFixed());
    expect(buildOhioResidentReturnInput(input, result).federalAgi.toFixed()).toBe('10000');
    if (method === 'nonitemized') {
      expect(result.standardDeduction.toFixed()).toBe('0');
      expect(result.deductionAmount.toFixed()).toBe('0');
      input.donations[0].qualifiedOrganization = false;
      const onlyOther = calculateFederalTax(input);
      expect(onlyOther.nonitemizerCharitableDeduction?.toFixed()).toBe('0');
      expect(onlyOther.carryforwards.charitableContributions.toFixed()).toBe('0');
      input.donations[0].qualifiedOrganization = true;
    }
    expect(JSON.stringify(input)).toBe(before);
  }
});
