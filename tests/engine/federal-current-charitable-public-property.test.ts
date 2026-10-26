// Spec: spec/federal/current-charitable-public-property.yaml. Draft constants are test-only.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { nonitemizerCarryFixture } from '../fixtures/nonitemizer-carry.js';

it('binds mixed current category carry to final selection without granting standard entitlement', () => {
  for (const [election, method, expectedCarry] of [
    ['automatic', 'standard', '2000'], ['itemized', 'itemized', '2050'], ['nonitemized', 'nonitemized', '2000'],
  ] as const) {
    const input = nonitemizerCarryFixture('4000'); input.deductionElection = election;
    if (!input.standardDeductionFacts) throw new Error('Missing actual synthetic eligibility');
    input.standardDeductionFacts.spouseItemizes = election === 'nonitemized';
    input.donations.push({ organization: 'Synthetic public property charity', type: 'property', amount: '5000', costBasis: '3000',
      dateOfDonation: '2026-06-01', qualifiedOrganization: true, isPrivateFoundation: false, isLongTermCapitalGain: false });
    const before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe(method);
    expect(result.scheduleA?.charitableTotal.toFixed()).toBe('4950');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe(expectedCarry);
    expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear, row.category, row.medium, row.amount.toFixed()]))
      .toEqual([[2026, 'noncash_50', 'noncash', expectedCarry]]);
    expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe(method === 'itemized' ? '0' : '1000');
    if (method === 'nonitemized') {
      expect(result.standardDeduction.toFixed()).toBe('0');
      expect(result.deductionAmount.toFixed()).toBe('0');
    }
    expect(JSON.stringify(input)).toBe(before);
    if (method === 'nonitemized') {
      input.donations[1].costBasis = '0';
      const zeroBasis = calculateFederalTax(input);
      expect(zeroBasis.scheduleA?.currentCharitableCandidates?.currentPropertyValue.toFixed()).toBe('0');
      expect(zeroBasis.carryforwards.charitableContributions.toFixed()).toBe('0');
      expect(zeroBasis.nonitemizerCharitableDeduction?.toFixed()).toBe('1000');
    }
  }
});
