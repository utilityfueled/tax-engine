// Spec: spec/federal/shared-marketplace-health.yaml.
import { expect, it } from 'vitest';
import { calculateForm7206 } from '@/engine/forms/form-7206.js';
import { calculateMarketplaceHealthPremiums } from '@/engine/forms/marketplace-health-premiums.js';
import { calculateForm8962SharedPolicy } from '@/engine/forms/form-8962-shared-policy.js';
import { calculateForm8962 } from '@/engine/forms/form-8962.js';
import { d } from '@/utils/decimal.js';
import { sharedMarketplaceHealthInput } from '../../fixtures/shared-marketplace-health.js';

function calculate(input = sharedMarketplaceHealthInput()) {
  const health = calculateForm7206({ taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus, facts: input.form7206!, marketplaceHandling: 'separate-specified-premiums',
    businesses: [{ sourceId: 'scheduleC', accountHolder: 'primary', kind: 'self_employed', netIncome: d(50000), ownerPositiveBusinessIncome: d(50000), ownerDeductibleSelfEmploymentTax: d(3533), attributableRetirementDeduction: d(0), attributableForeignExclusion: d(0) }] });
  return { health, ledger: calculateMarketplaceHealthPremiums({ input, healthInsurance: health }) };
}
it('permits source allocation first without certifying a completed health method', () => {
  const input = sharedMarketplaceHealthInput();
  expect(calculateForm8962SharedPolicy(input).months[0].premium.toFixed()).toBe('500');
  expect(() => calculateForm8962({ taxYear: 2025, filingStatus: 'single', form1095A: input.form1095A,
    facts: { ...input.form8962, taxpayerModifiedAGI: '44127' }, allocationHousehold: input })).toThrow(/completed selfEmployedHealthInsuranceCoordinationRequired/);
  input.form8962!.selfEmployedHealthInsuranceCoordinationRequired = undefined;
  expect(() => calculateForm8962SharedPolicy(input)).toThrow(/health|coordination/);
});
it('derives shared specified premiums after allocation while retaining full paid sources', () => {
  const input = sharedMarketplaceHealthInput(), before = structuredClone(input), { health, ledger } = calculate(input);
  expect(health.grossSourcePremiums.toFixed()).toBe('12000'); expect(health.paidSourcePremiums.toFixed()).toBe('2400');
  expect(ledger.groups[0].specifiedPremiums.toFixed()).toBe('6000');
  expect(ledger.groups[0].months.map(row => [row.specifiedPremium.toFixed(), row.sourcePremium.toFixed(), row.advancePremiumTaxCredit.toFixed()])).toEqual(Array.from({ length: 12 }, () => ['500','500','300']));
  expect(input).toEqual(before);
});
it('rejects unknown duplicated and contradictory shared health identities', () => {
  expect(calculate().ledger.groups[0].specifiedPremiums.toFixed()).toBe('6000');
  for (const mutate of [
    (i: ReturnType<typeof sharedMarketplaceHealthInput>) => { i.form7206!.plans![0].sharedMarketplaceSources = undefined; },
    (i: ReturnType<typeof sharedMarketplaceHealthInput>) => { i.form7206!.plans![0].sharedMarketplaceSources!.sourceFactsConfirmed = undefined; },
    (i: ReturnType<typeof sharedMarketplaceHealthInput>) => { i.form7206!.plans![0].sharedMarketplaceSources!.sourceTaxYear = 2024; },
    (i: ReturnType<typeof sharedMarketplaceHealthInput>) => { i.form7206!.plans![0].sharedMarketplaceSources!.persons![1].coveredIndividualSsn = '123456789'; },
    (i: ReturnType<typeof sharedMarketplaceHealthInput>) => { i.form7206!.persons![1].name = 'Different Other'; },
    (i: ReturnType<typeof sharedMarketplaceHealthInput>) => { i.form7206!.plans![0].coveredPersons![1].relationshipToOwner = 'child_under_27'; i.form7206!.persons![1].attainedAgeAtYearEnd = 24; },
  ]) { const bad = sharedMarketplaceHealthInput(); mutate(bad); expect(() => calculate(bad)).toThrow(/source|person|family|identity|year|link|coverage/i); }
});
it('rejects an inferred paid share or transferred outside-family advance', () => {
  expect(calculate().ledger.groups[0].specifiedPremiums.toFixed()).toBe('6000');
  for (const mutate of [
    (p: NonNullable<NonNullable<ReturnType<typeof sharedMarketplaceHealthInput>['form7206']>['plans']>[number]) => { p.payments![0].ownerOrBusinessPaid = '201'; p.payments![0].otherPersonPaid = '199'; p.payments![0].personAmounts![0].amountPaid = '201'; },
    (p: NonNullable<NonNullable<ReturnType<typeof sharedMarketplaceHealthInput>['form7206']>['plans']>[number]) => { p.payments![0].personAmounts![0].advancePremiumTaxCredit = '301'; p.payments![0].personAmounts![1].advancePremiumTaxCredit = '299'; },
    (p: NonNullable<NonNullable<ReturnType<typeof sharedMarketplaceHealthInput>['form7206']>['plans']>[number]) => { p.payments![0].personAmounts![0].amountPaid = '199'; p.payments![0].personAmounts![1].amountPaid = '1'; },
    (p: NonNullable<NonNullable<ReturnType<typeof sharedMarketplaceHealthInput>['form7206']>['plans']>[number]) => { p.payments![0].otherPersonPaid = undefined; },
  ]) { const bad = sharedMarketplaceHealthInput(); mutate(bad.form7206!.plans![0]); expect(() => calculate(bad)).toThrow(/source|paid|payment|reconcile|family|advance/i); }
});
it('preserves cents actual zero and source order without residual allocation', () => {
  const input = sharedMarketplaceHealthInput(), row = input.form1095A[0].monthlyPremiums[0];
  row.enrolleePremium = '1000.02'; row.advancePremiumTaxCredit = '600.02';
  input.form8962!.sharedPolicyAllocations!.policies![0].original = structuredClone(input.form1095A[0]);
  input.form8962!.monthlyReconciliation![0].enrolleePremium = '500.01'; input.form8962!.monthlyReconciliation![0].advancePremiumTaxCredit = '300.01';
  const paid = input.form7206!.plans![0].payments![0]; paid.grossPremium = '1000.02'; paid.advancePremiumTaxCredit = '600.02'; paid.personAmounts![0].advancePremiumTaxCredit = '300.01'; paid.personAmounts![1].advancePremiumTaxCredit = '300.01';
  expect(calculate(input).ledger.groups[0].specifiedPremiums.toFixed()).toBe('6000.01');
  input.form7206!.plans![0].payments!.reverse(); input.form7206!.plans![0].sharedMarketplaceSources!.persons!.reverse();
  expect(calculate(input).ledger.groups[0].specifiedPremiums.toFixed()).toBe('6000.01');
  const zero = sharedMarketplaceHealthInput();
  for (const month of zero.form8962!.sharedPolicyAllocations!.policies![0].monthlyAllocations!) month.fraction = '0';
  for (const month of zero.form8962!.monthlyReconciliation!) { month.enrolleePremium = '0'; month.slcsp = '0'; month.advancePremiumTaxCredit = '0'; }
  for (const p of zero.form7206!.plans![0].payments!) { p.ownerOrBusinessPaid = '0'; p.otherPersonPaid = '400'; p.personAmounts![0].amountPaid = '0'; p.personAmounts![0].advancePremiumTaxCredit = '0'; p.personAmounts![1].advancePremiumTaxCredit = '600'; }
  expect(calculate(zero).ledger.groups[0].specifiedPremiums.toFixed()).toBe('0');
});
