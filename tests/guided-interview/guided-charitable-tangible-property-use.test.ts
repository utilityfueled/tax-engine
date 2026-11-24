import { expect, it } from 'vitest';
import { buildDonationsInput } from '@/lib/guided-interview-bridge';
import { computeDeductionComparison, emptyDeductionData, emptyDonationEntry, type DeductionData, type DonationEntryData } from '@/lib/guided-interview-flow';
import { deductionFactErrors } from '@/lib/guided-required-facts';

it('requires and passes through verified donee use without changing original value or basis', () => {
  const entry: DonationEntryData = {
    ...emptyDonationEntry,
    organization: 'Example University',
    type: 'property',
    amount: '500',
    costBasis: '100',
    date: '2025-04-02',
    qualifiedOrganization: true,
    recipientCategory: 'fifty-percent',
    isLongTermCapitalGain: true,
  };
  const data: DeductionData = {
    ...emptyDeductionData,
    method: 'itemized',
    charitableContributions: '500',
    donationEntries: [entry],
  };
  const before = JSON.stringify(data);
  expect(deductionFactErrors(data, 2025)['donation-0-tangible-property-use']).toMatch(/actual donee use/i);
  expect(() => buildDonationsInput(data, 2025)).toThrow(/actual donee use/i);
  expect(() => computeDeductionComparison('single', data, 2025)).toThrow(/actual donee use/i);
  expect(JSON.stringify(data)).toBe(before);

  const source = {
    sourceReference: 'University sale confirmation, April 2',
    doneeUse: 'unrelated' as const,
    ordinaryWholeInterestConfirmed: true,
    noAdditionalValuationRuleConfirmed: true,
  };
  const complete = { ...data, donationEntries: [{ ...entry, tangiblePropertyUse: source }] };
  expect(deductionFactErrors(complete, 2025)).toEqual({});
  expect(computeDeductionComparison('single', complete, 2025).itemizedTotal).toBe('100');
  expect(buildDonationsInput(complete, 2025)).toEqual([expect.objectContaining({
    amount: '500',
    costBasis: '100',
    tangiblePropertyUse: source,
  })]);
});
