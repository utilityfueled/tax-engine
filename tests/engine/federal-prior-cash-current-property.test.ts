// Spec: spec/federal/prior-cash-current-property.yaml. Draft constants are test-only.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { nonitemizerCarryFixture } from '../fixtures/nonitemizer-carry.js';

it('selects the prior-cash current-property carry only after the actual deduction choice', () => {
  for (const [election, method, carry] of [
    ['automatic', 'standard', '1000'], ['itemized', 'itemized', '1050'], ['nonitemized', 'nonitemized', '1000'],
  ] as const) {
    const input = nonitemizerCarryFixture('1000', [{ taxYear: 2025, amount: '2000' }]);
    input.deductionElection = election;
    if (!input.standardDeductionFacts) throw new Error('Missing actual synthetic eligibility');
    input.standardDeductionFacts.spouseItemizes = method === 'nonitemized';
    input.donations.push({ organization: 'Synthetic public property charity', type: 'property', amount: '5000', costBasis: '3000',
      dateOfDonation: '2026-06-01', qualifiedOrganization: true, isPrivateFoundation: false, isLongTermCapitalGain: false });
    const before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe(method);
    expect([result.scheduleA?.charitableCurrentCash.toFixed(), result.scheduleA?.charitableCurrentNoncash.toFixed(),
      result.scheduleA?.charitablePriorYearUsed.toFixed(), result.scheduleA?.charitableTotal.toFixed()])
      .toEqual(method === 'nonitemized' ? ['0','0','0','0'] : ['1000','1950','2000','4950']);
    expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear, row.category, row.medium, row.amount.toFixed()]))
      .toEqual([[2026, 'noncash_50', 'noncash', carry]]);
    expect(result.scheduleA?.charitableTreatment?.priorTreatedAsPaid.toFixed()).toBe('2000');
    expect(result.scheduleA?.charitableTreatment?.priorDeduction.toFixed()).toBe(method === 'itemized' ? '2000' : '0');
    expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe(method === 'itemized' ? '0' : '1000');
    if (method === 'nonitemized') {
      expect(result.standardDeduction.toFixed()).toBe('0');
      expect(result.deductionAmount.toFixed()).toBe('0');
    }
    expect(JSON.stringify(input)).toBe(before);
  }
});
