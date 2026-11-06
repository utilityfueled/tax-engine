// Spec: spec/federal/marketplace-shared-marriage-health.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8962MarriageSources } from '@/engine/forms/form-8962-marriage-sources.js';
import { calculateForm8962SharedPolicy } from '@/engine/forms/form-8962-shared-policy.js';
import { noAdvanceSharedMarriageInput, noAdvanceSharedMarriageHealthInput, sharedMarriageHealthInput, twoOwnerSharedMarriageHealthInput } from '../fixtures/marketplace-shared-marriage-health.js';

it('allocates actual agreement and default sources before marriage and health', () => {
  for (const method of ['agreement', 'default'] as const) {
    const input = sharedMarriageHealthInput(2025, method), before = structuredClone(input), result = calculateFederalTax(input);
    expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe('5662');
    expect([result.schedule1!.seHealthInsurance, result.agi, result.form8962!.ptcAllowed, result.form8962!.excessAPTCRepayment].map(value => value.toFixed())).toEqual(['6338','86597','5149','3251']);
    expect(result.allLines.filter(row => row.form === 'Pub974 QBI Allocation' && row.line === 'scheduleC').map(row => row.value.toFixed())).toEqual(['6338']);
    expect(input.form1095A[0].monthlyPremiums[0].enrolleePremium).toBe('2000');
    expect(input).toEqual(before);
  }
});
it('uses actual alternative family for a policy sent to the other taxpayer', () => {
  const input = sharedMarriageHealthInput(2025, 'agreement', true), source = calculateForm8962MarriageSources(input), result = calculateFederalTax(input);
  expect(source.families[0].months.map(row => row.premium.toFixed())).toEqual(Array(7).fill('1000'));
  expect(source.families[1].months).toEqual([]);
  expect([result.schedule1!.seHealthInsurance, result.form8962!.ptcAllowed].map(value => value.toFixed())).toEqual(['6338','5149']);
});
it('retains exact no-advance allocations and separate unshared marriage months', () => {
  const input = noAdvanceSharedMarriageInput(), before = structuredClone(input), allocated = calculateForm8962SharedPolicy(input), marriage = calculateForm8962MarriageSources(input);
  expect(allocated.periods[0].fraction.toFixed(2)).toBe('0.33');
  expect(allocated.months[0].premium.toFixed()).toBe('1000.01');
  expect(marriage.families[0].months.map(row => row.premium.toFixed())).toEqual(Array(6).fill('1000.01'));
  expect(marriage.families[1].months.map(row => row.premium.toFixed())).toEqual(['500']);
  expect(input.form1095A[0].monthlyPremiums[0].slcsp).toBeNull();
  expect(input).toEqual(before);
});
it('requires actual counterparty relationship facts for the marriage year', () => {
  for (const patch of [
    { otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed: undefined },
    { otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed: false },
    { otherTaxpayerRelationshipSourceReference: '' },
    { noCurrentYearMarriageOrDivorceConfirmed: true },
    { situation: 'divorce_during_year' },
  ]) {
    const input = sharedMarriageHealthInput(); Object.assign(input.form8962!.sharedPolicyAllocations!.policies![0], patch);
    expect(() => calculateFederalTax(input)).toThrow(/marriage|relationship|Situation|source/i);
  }
  expect(calculateFederalTax(sharedMarriageHealthInput()).schedule1!.seHealthInsurance.toFixed()).toBe('6338');
});
it('retains independent shared person and payment evidence', () => {
  for (const mutate of [
    (input: ReturnType<typeof sharedMarriageHealthInput>) => { input.form7206!.plans![0].payments![0].personAmounts![0].amountPaid = '300.01'; },
    (input: ReturnType<typeof sharedMarriageHealthInput>) => { input.form8962!.marriageSources!.benchmarks![0].coveredIndividualSsns!.push('234-56-7890'); },
    (input: ReturnType<typeof sharedMarriageHealthInput>) => { input.form1095A[0].coveredIndividuals![1].ssn = '333-44-5555'; },
  ]) { const input = sharedMarriageHealthInput(); mutate(input); expect(() => calculateFederalTax(input)).toThrow(); }
  expect(calculateFederalTax(sharedMarriageHealthInput()).form8962!.ptcAllowed.toFixed()).toBe('5149');
});
it('preserves separate owners with shared and unshared originals', () => {
  const input = twoOwnerSharedMarriageHealthInput(), before = structuredClone(input), result = calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance, result.agi, result.form8962!.ptcAllowed].map(value => value.toFixed())).toEqual(['7698', '85237', '8748']);
  expect(result.allLines.filter(row => row.form === 'Pub974 QBI Allocation').map(row => [row.line, row.value.toFixed(2)])).toEqual([['scheduleC', '5132.00'], ['scheduleF', '2566.00']]);
  expect(calculateForm8962MarriageSources(input).families.map(family => family.months[0].premium.toFixed())).toEqual(['1000', '500']);
  expect(input.form1095A.map(policy => policy.monthlyPremiums[0].enrolleePremium)).toEqual(['2000', '500']);
  expect(input).toEqual(before);
});
it('rejects an other-recipient policy spanning both alternative families', () => {
  const input = sharedMarriageHealthInput(2025, 'agreement', true), original = input.form1095A[0];
  input.form7206 = undefined; input.form8962!.selfEmployedHealthInsuranceCoordinationRequired = false;
  original.coveredIndividuals!.push({ name: 'Blair Example', ssn: input.taxpayer.spouse!.ssn, firstMonth: 1, lastMonth: 12 });
  input.form8962!.sharedPolicyAllocations!.policies![0].original = structuredClone(original);
  input.form8962!.sharedPolicyAllocations!.policies![0].coveredFamilyAssignments!.push({ ssn: input.taxpayer.spouse!.ssn, family: 'this_return' });
  input.form8962!.marriageSources!.policies![0].original = structuredClone(original);
  const before = structuredClone(input);
  expect(() => calculateForm8962MarriageSources(input)).toThrow(/single alternative-family premium group/);
  expect(input).toEqual(before);
});
it('requires exact original ordering and allocated joint benchmark reconciliation', () => {
  const reordered = twoOwnerSharedMarriageHealthInput(); reordered.form1095A.reverse();
  expect(() => calculateFederalTax(reordered)).toThrow(/original|source|conflict/i);
  const benchmark = sharedMarriageHealthInput(); benchmark.form8962!.monthlyReconciliation![0].slcsp = '800.01';
  expect(() => calculateFederalTax(benchmark)).toThrow(/benchmark|reconcil/i);
});
it('composes exact no-advance and later unshared actual health receipts', () => {
  const input = noAdvanceSharedMarriageHealthInput(), before = structuredClone(input), result = calculateFederalTax(input);
  expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe('5662');
  expect(result.marketplaceHealthInsurance!.businesses[0].netPremiumsAfterCredit.toFixed(2)).toBe('6338.06');
  expect([result.schedule1!.seHealthInsurance, result.agi, result.form8962!.ptcAllowed, result.form8962!.excessAPTCRepayment].map(value => value.toFixed())).toEqual(['6338', '86597', '5149', '851']);
  expect(calculateForm8962SharedPolicy(input).months[0].premium.toFixed()).toBe('1000.01');
  expect(input.form7206!.plans![0].payments![0].ownerOrBusinessPaid).toBe('1000.01');
  expect(input).toEqual(before);
});
