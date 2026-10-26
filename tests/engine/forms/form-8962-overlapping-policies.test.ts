// Spec: spec/federal/form-8962-overlapping-policies.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8962SharedPolicy } from '@/engine/forms/form-8962-shared-policy.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { overlappingPolicyFixture } from '../../fixtures/overlapping-policy.js';

it('combines overlapping Situation4 rows before monthly rounding', () => {
  const input = overlappingPolicyFixture(), before = structuredClone(input), allocation = calculateForm8962SharedPolicy(input);
  expect(allocation.months).toHaveLength(2); expect(allocation.periods).toHaveLength(2);
  expect(allocation.householdMonths.map(row => [row.month, row.premium.toFixed(), row.slcsp.toFixed(), row.advance.toFixed(), row.policyIndexes])).toEqual([[1, '300.0175', '340.0175', '60.0175', [0, 1]]]);
  const result = calculateFederalTax(input).form8962!;
  expect([result.ptcAllowed.toFixed(), result.advancePTCTotal.toFixed(), result.netPTC.toFixed()]).toEqual(['300', '60', '240']);
  expect(input).toEqual(before);
  const defaults = structuredClone(input), policy = defaults.form8962!.sharedPolicyAllocations!.policies![1];
  policy.agreementConfirmed = false; delete policy.agreementReference; delete policy.monthlyAllocations;
  policy.defaultAllocation = { sourceReference: 'Actual common enrollment source', enrollingTaxpayerSsn: '123-45-6789', allCoveredPeopleEnrolledByTaxpayerConfirmed: true };
  expect(calculateForm8962SharedPolicy(defaults).householdMonths[0].premium.toFixed()).toBe('300.0175');
});

it('uses one actual benchmark per unshared coverage group', () => {
  for (const [kind, slcsp, credit, net] of [['same_group', '750', '750', '500'], ['different_groups', '1250', '1250', '1000']] as const) {
    const input = TaxYearInputSchema.parse(overlappingPolicyFixture(kind)), allocation = calculateForm8962SharedPolicy(input);
    expect(allocation.months).toHaveLength(3); expect(allocation.periods).toHaveLength(1);
    expect(allocation.householdMonths.map(row => [row.premium.toFixed(), row.slcsp.toFixed(), row.advance.toFixed()])).toEqual([['1450', slcsp, '250']]);
    const result = calculateFederalTax(input).form8962!;
    expect([result.ptcAllowed.toFixed(), result.advancePTCTotal.toFixed(), result.netPTC.toFixed()]).toEqual([credit, '250', net]);
  }
  const one = overlappingPolicyFixture('same_group');
  one.form1095A.pop(); one.form8962!.sharedPolicyAllocations!.policies!.pop(); delete one.form8962!.sharedPolicyAllocations!.overlappingCoverage;
  expect(calculateForm8962SharedPolicy(one).householdMonths[0].slcsp.toFixed()).toBe('750');
});

it('rejects missing stale and contradictory benchmark group sources', () => {
  const input = overlappingPolicyFixture('same_group');
  expect(() => calculateForm8962SharedPolicy(input)).not.toThrow();
  for (const change of [
    (x: typeof input) => { delete x.form8962!.sharedPolicyAllocations!.overlappingCoverage; },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.overlappingCoverage!.sourceFactsConfirmed = undefined; },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.overlappingCoverage!.sourceTaxYear = 2024; },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.overlappingCoverage!.months![0].groups![0].ratingArea = ''; },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.overlappingCoverage!.months![0].groups![0].slcsp = '450.01'; },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.overlappingCoverage!.months![0].groups![0].policySourceIds = ['form1095A:1', 'form1095A:1']; },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.overlappingCoverage!.months![0].groups![0].coveredIndividualSsns = ['123-45-6789']; },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.overlappingCoverage!.months![0].month = 2; },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.overlappingCoverage!.months!.push(structuredClone(x.form8962!.sharedPolicyAllocations!.overlappingCoverage!.months![0])); },
    (x: typeof input) => { x.form1095A[1].policyNumber = 'equal-money-replacement'; },
  ]) { const changed = structuredClone(input); change(changed); expect(() => calculateForm8962SharedPolicy(changed)).toThrow(); }
  const duplicateArea = overlappingPolicyFixture('different_groups');
  duplicateArea.form8962!.sharedPolicyAllocations!.overlappingCoverage!.months![0].groups![1].ratingArea = 'WA-area-1';
  expect(() => calculateForm8962SharedPolicy(duplicateArea)).toThrow(/rating area|group/i);
});

it('preserves source order and the separate overlapping Situation3 boundary', () => {
  const input = overlappingPolicyFixture('different_groups'), before = structuredClone(input), baseline = calculateForm8962SharedPolicy(input);
  input.form8962!.sharedPolicyAllocations!.policies!.reverse();
  input.form8962!.sharedPolicyAllocations!.overlappingCoverage!.months![0].groups!.reverse();
  expect(calculateForm8962SharedPolicy(input)).toEqual(baseline);
  input.form8962!.sharedPolicyAllocations!.policies!.reverse(); input.form8962!.sharedPolicyAllocations!.overlappingCoverage!.months![0].groups!.reverse();
  expect(input).toEqual(before);
  const noAdvance = overlappingPolicyFixture(), policy = noAdvance.form8962!.sharedPolicyAllocations!.policies![0];
  noAdvance.form1095A[0].monthlyPremiums[0].advancePremiumTaxCredit = '0'; noAdvance.form1095A[0].monthlyPremiums[0].slcsp = null;
  policy.original = structuredClone(noAdvance.form1095A[0]); policy.situation = 'no_advance_credit';
  delete policy.agreementConfirmed; delete policy.agreementReference; delete policy.monthlyAllocations;
  policy.noAdvanceAllocation = { sourceTaxYear: 2025, sourceReference: 'Actual family benchmarks', sourceFactsConfirmed: true, allCoveredPeopleInCoverageFamiliesConfirmed: true,
    monthlyBenchmarks: [{ month: 1, thisReturnSlcsp: '600', otherReturnSlcsp: '300', thisReturnSourceReference: 'Actual own benchmark', otherReturnSourceReference: 'Actual other benchmark', thisReturnCoveredIndividualSsns: ['123-45-6789'], otherReturnCoveredIndividualSsns: ['234-56-7890'] }] };
  expect(() => calculateForm8962SharedPolicy(noAdvance)).toThrow(/overlapping Situation3|overlapping.*no-advance/i);
});
