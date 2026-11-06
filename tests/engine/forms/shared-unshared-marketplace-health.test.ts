// Spec: spec/federal/shared-unshared-marketplace-health.yaml.
import { expect, it } from 'vitest';
import { calculateSharedMarketplaceHealthSources } from '@/engine/forms/shared-marketplace-health.js';
import { calculateForm8962SharedPolicy } from '@/engine/forms/form-8962-shared-policy.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { sharedUnsharedHealthInput } from '../../fixtures/shared-unshared-marketplace-health.js';

it('retains full unshared originals beside actual allocated health sources', () => {
  const input = sharedUnsharedHealthInput(), before = structuredClone(input);
  const allocated = calculateForm8962SharedPolicy(input);
  expect(allocated.periods).toHaveLength(1);
  expect(allocated.months.find(row => row.policyIndex === 1)!.unshared).toBe(true);
  const bound = [...calculateSharedMarketplaceHealthSources(input)!.values()][0];
  expect([...bound.months.values()].map(row => [row.premium.toFixed(), row.advance.toFixed()])).toEqual(Array.from({ length: 12 }, () => ['700', '350']));
  expect(input).toEqual(before);
  const ownOnly = sharedUnsharedHealthInput(), ownPlan = ownOnly.form7206!.plans![0];
  ownPlan.marketplacePolicySourceIds = ['form1095A:1'];
  ownPlan.coveredPersons = ownPlan.coveredPersons!.slice(0, 1);
  ownPlan.sharedMarketplaceSources!.persons = ownPlan.sharedMarketplaceSources!.persons!.slice(0, 1);
  ownPlan.payments!.forEach(payment => {
    payment.grossPremium = '200'; payment.ownerOrBusinessPaid = '150'; payment.otherPersonPaid = '0'; payment.advancePremiumTaxCredit = '50';
    payment.personAmounts = [{ ...payment.personAmounts![0], amountPaid: '150', advancePremiumTaxCredit: '50' }];
  });
  expect(() => calculateSharedMarketplaceHealthSources(ownOnly)).toThrow(/outside|family|source/i);
  for (const mutate of [
    (i: typeof input) => { i.form8962!.sharedPolicyAllocations!.policies![1].allCoveredPeopleInThisTaxFamilyConfirmed = undefined; },
    (i: typeof input) => { i.form1095A[1].coveredIndividuals![0].ssn = '234-56-7890'; i.form8962!.sharedPolicyAllocations!.policies![1].original = structuredClone(i.form1095A[1]); },
    (i: typeof input) => { i.form7206!.plans![0].payments![0].ownerOrBusinessPaid = '350.01'; i.form7206!.plans![0].payments![0].otherPersonPaid = '199.99'; i.form7206!.plans![0].payments![0].personAmounts![0].amountPaid = '350.01'; },
    (i: typeof input) => { i.form7206!.plans![0].marketplacePolicySourceIds!.push('form1095A:1'); },
  ]) { const bad = sharedUnsharedHealthInput(); mutate(bad); expect(() => calculateSharedMarketplaceHealthSources(bad)).toThrow(/source|family|household|person|duplicate|reconcile|allocation/i); }
});

it('requires the complete family benchmark for shared no-advance and unshared health sources', () => {
  const input = sharedUnsharedHealthInput('no-advance'), before = structuredClone(input);
  const bound = [...calculateSharedMarketplaceHealthSources(input)!.values()][0];
  expect(bound.months.get(1)!.premium.toFixed()).toBe('1200');
  const result = calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance.toFixed(), result.agi.toFixed(), result.form8962!.ptcAllowed.toFixed()]).toEqual(['3192', '43275', '9624']);
  expect(input).toEqual(before);
  input.form8962!.sharedPolicyAllocations!.noAdvanceCoverageFamilies = undefined;
  expect(() => calculateSharedMarketplaceHealthSources(input)).toThrow(/complete|family|benchmark|source/i);
});
