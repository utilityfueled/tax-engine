// Spec: spec/federal/form-8962-shared-unshared.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8962SharedPolicy } from '@/engine/forms/form-8962-shared-policy.js';
import { sharedUnsharedFixture } from '../../fixtures/shared-unshared-policy.js';

it('combines actual shared and unshared policy months without another allocation', () => {
  const input = sharedUnsharedFixture(), result = calculateFederalTax(input), allocation = result.form8962?.sharedPolicyAllocation;
  expect(result.form8962?.ptcAllowed.toFixed()).toBe('6012');
  expect(result.form8962?.advancePTCTotal.toFixed()).toBe('3300');
  expect(result.form8962?.netPTC.toFixed()).toBe('2712');
  expect(allocation?.periods).toHaveLength(1);
  expect(allocation?.periods[0]).toMatchObject({ policyIndex: 0, firstMonth: 1, lastMonth: 6 });
  expect(allocation?.months).toHaveLength(12);
  expect(allocation?.months[6].premium.toFixed()).toBe('700');
  expect(allocation?.months[6].slcsp.toFixed()).toBe('650');
});

it('requires actual unshared classification evidence and complete source identity', () => {
  const input = sharedUnsharedFixture();
  expect(() => calculateForm8962SharedPolicy(input)).not.toThrow();
  for (const change of [
    (x: typeof input) => { Object.assign(x.form8962!.sharedPolicyAllocations!.policies![1], { unsharedSourceReference: '' }); },
    (x: typeof input) => { Object.assign(x.form8962!.sharedPolicyAllocations!.policies![1], { allCoveredPeopleInThisTaxFamilyConfirmed: undefined }); },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.policies![1].originalSlcspCorrectConfirmed = false; },
    (x: typeof input) => { x.form1095A[1].coveredIndividuals![0].ssn = '987-65-4321'; x.form8962!.sharedPolicyAllocations!.policies![1].original = structuredClone(x.form1095A[1]); },
    (x: typeof input) => { x.form1095A[1].recipientSsn = '234-56-7890'; x.form8962!.sharedPolicyAllocations!.policies![1].original = structuredClone(x.form1095A[1]); },
    (x: typeof input) => { x.form1095A[1].taxYear = 2024; x.form8962!.sharedPolicyAllocations!.policies![1].original = structuredClone(x.form1095A[1]); },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.policies![1].otherTaxpayerSsn = '234-56-7890'; },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.policies!.pop(); },
  ]) { const changed = structuredClone(input); change(changed); expect(() => calculateForm8962SharedPolicy(changed)).toThrow(); }
});

it('preserves exact original cents source order and immutability', () => {
  const input = sharedUnsharedFixture();
  input.form1095A[1].monthlyPremiums[0].enrolleePremium = '700.00000000000000000001';
  input.form8962!.sharedPolicyAllocations!.policies![1].original = structuredClone(input.form1095A[1]);
  const before = structuredClone(input), result = calculateForm8962SharedPolicy(input);
  expect(result.months[6].premium.toFixed()).toBe('700.00000000000000000001');
  input.form8962!.sharedPolicyAllocations!.policies!.reverse();
  const reordered = calculateForm8962SharedPolicy(input);
  expect(reordered.months.map(row => row.premium.toFixed())).toEqual(result.months.map(row => row.premium.toFixed()));
  input.form8962!.sharedPolicyAllocations!.policies!.reverse(); expect(input).toEqual(before);
  const changed = structuredClone(input); changed.form1095A.reverse(); expect(() => calculateForm8962SharedPolicy(changed)).toThrow(/snapshot|reconcile/i);
  changed.form1095A.reverse(); changed.form1095A[1].policyNumber = 'equal-money-replacement'; expect(() => calculateForm8962SharedPolicy(changed)).toThrow(/snapshot|reconcile/i);
});

it('retains overlapping benchmark and actual allocation boundaries', () => {
  const input = sharedUnsharedFixture(); expect(() => calculateForm8962SharedPolicy(input)).not.toThrow();
  const overlap = structuredClone(input); overlap.form1095A[1].coveredIndividuals![0].firstMonth = 6; overlap.form1095A[1].monthlyPremiums[0].month = 6;
  overlap.form8962!.sharedPolicyAllocations!.policies![1].original = structuredClone(overlap.form1095A[1]); expect(() => calculateForm8962SharedPolicy(overlap)).toThrow();
  const blank = structuredClone(input); blank.form1095A[1].monthlyPremiums[0].slcsp = null; blank.form8962!.sharedPolicyAllocations!.policies![1].original = structuredClone(blank.form1095A[1]); expect(() => calculateForm8962SharedPolicy(blank)).toThrow();
  const all = structuredClone(input); all.form1095A = [all.form1095A[1]]; all.form8962!.sharedPolicyAllocations!.policies = [all.form8962!.sharedPolicyAllocations!.policies![1]]; all.form8962!.sharedPolicyAllocations!.policies[0].sourceId = 'form1095A:0'; expect(() => calculateForm8962SharedPolicy(all)).toThrow(/shared|allocation/i);
  const noAdvance = structuredClone(input), policy = noAdvance.form8962!.sharedPolicyAllocations!.policies![0];
  noAdvance.form1095A[0].monthlyPremiums.forEach(row => { row.advancePremiumTaxCredit = '0'; row.slcsp = null; });
  policy.original = structuredClone(noAdvance.form1095A[0]); policy.situation = 'no_advance_credit'; delete policy.agreementConfirmed; delete policy.agreementReference; delete policy.monthlyAllocations;
  policy.noAdvanceAllocation = { sourceTaxYear: 2025, sourceReference: 'Actual both-family benchmark record', sourceFactsConfirmed: true, allCoveredPeopleInCoverageFamiliesConfirmed: true,
    monthlyBenchmarks: Array.from({ length: 6 }, (_, index) => ({ month: index + 1, thisReturnSlcsp: '1200', otherReturnSlcsp: '600', thisReturnSourceReference: 'Actual own benchmark', otherReturnSourceReference: 'Actual other benchmark', thisReturnCoveredIndividualSsns: ['123-45-6789'], otherReturnCoveredIndividualSsns: ['234-56-7890'] })) };
  const derived = calculateForm8962SharedPolicy(noAdvance); expect(derived.periods).toHaveLength(1); expect(derived.periods[0].method).toBe('no_advance_benchmark'); expect(derived.months[0].premium.toFixed(2)).toBe('666.67'); expect(derived.months[6].premium.toFixed()).toBe('700');
  noAdvance.form8962!.monthlyReconciliation!.forEach((row, index) => Object.assign(row, { enrolleePremium: derived.months[index].premium.toFixed(), slcsp: derived.months[index].slcsp.toFixed(), advancePremiumTaxCredit: derived.months[index].advance.toFixed() }));
  const calculated = calculateFederalTax(noAdvance); expect([calculated.form8962?.ptcAllowed.toFixed(), calculated.form8962?.advancePTCTotal.toFixed(), calculated.form8962?.netPTC.toFixed()]).toEqual(['7608', '1800', '5808']);
  input.form8962!.selfEmployedHealthInsuranceCoordinationRequired = true; expect(() => calculateForm8962SharedPolicy(input)).toThrow(/coordination/i);
});
