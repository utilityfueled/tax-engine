// Spec: spec/federal/shared-owner-marketplace-health.yaml.
import { expect, it } from 'vitest';
import { calculateSharedMarketplaceHealthSources } from '@/engine/forms/shared-marketplace-health.js';
import { sharedOwnerHealthInput } from '../../fixtures/shared-owner-marketplace-health.js';

it('binds each actual plan and original payment group separately', () => {
  for (const second of ['shared', 'household'] as const) {
    const input = sharedOwnerHealthInput(2025, second), before = structuredClone(input);
    const result = calculateSharedMarketplaceHealthSources(input)!;
    expect([...result].map(([id, row]) => [id, row.months.get(1)!.premium.toFixed(), row.months.get(1)!.advance.toFixed()]))
      .toEqual([['primary-medical', '500', '10'], ['spouse-medical', '250', '5']]);
    expect(input.form7206!.plans!.map(plan => plan.payments![0]!.grossPremium)).toEqual(['1000', second === 'shared' ? '500' : '250']);
    expect(input).toEqual(before);
  }
  const cents = sharedOwnerHealthInput();
  cents.form1095A[0]!.monthlyPremiums[0]!.enrolleePremium = '1000.02';
  cents.form8962!.sharedPolicyAllocations!.policies![0]!.original = structuredClone(cents.form1095A[0]!);
  cents.form8962!.monthlyReconciliation![0]!.enrolleePremium = '750.01';
  const payment = cents.form7206!.plans![0]!.payments![0]!;
  payment.grossPremium = '1000.02'; payment.ownerOrBusinessPaid = '490.01'; payment.otherPersonPaid = '490.01'; payment.personAmounts![0]!.amountPaid = '490.01';
  const before = structuredClone(cents);
  expect(calculateSharedMarketplaceHealthSources(cents)!.get('primary-medical')!.months.get(1)!.premium.toFixed()).toBe('500.01');
  expect(cents).toEqual(before);
});
it('rejects missing and balanced conflicting separate-plan sources', () => {
  expect(calculateSharedMarketplaceHealthSources(sharedOwnerHealthInput(2025, 'household'))!.size).toBe(2);
  for (const mutate of [
    (i: ReturnType<typeof sharedOwnerHealthInput>) => { i.form7206!.plans![1]!.sharedMarketplaceSources = undefined; },
    (i: ReturnType<typeof sharedOwnerHealthInput>) => { i.form7206!.plans![1]!.allCoveredPersonsInCoverageFamilyConfirmed = undefined; },
    (i: ReturnType<typeof sharedOwnerHealthInput>) => { i.form7206!.plans![1]!.allCoveredPersonsInCoverageFamilyConfirmed = false; },
    (i: ReturnType<typeof sharedOwnerHealthInput>) => { i.form7206!.plans![1]!.marketplacePolicySourceIds = ['form1095A:0']; },
    (i: ReturnType<typeof sharedOwnerHealthInput>) => { i.form7206!.plans![1]!.sharedMarketplaceSources!.persons![0]!.coveredIndividualSsn = i.taxpayer.primary.ssn; },
    (i: ReturnType<typeof sharedOwnerHealthInput>) => { i.form7206!.plans![0]!.payments![0]!.ownerOrBusinessPaid = '491'; i.form7206!.plans![0]!.payments![0]!.otherPersonPaid = '489'; i.form7206!.plans![0]!.payments![0]!.personAmounts![0]!.amountPaid = '491'; },
  ]) { const input = sharedOwnerHealthInput(2025, 'household'); mutate(input); const before = structuredClone(input);
    expect(() => calculateSharedMarketplaceHealthSources(input)).toThrow(/source|family|person|policy|paid|link/i); expect(input).toEqual(before); }
});
