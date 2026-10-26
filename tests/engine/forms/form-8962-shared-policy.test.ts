// Spec: spec/federal/form-8962-shared-policy.yaml.
import { expect, it } from 'vitest';
import { calculateForm8962SharedPolicy } from '@/engine/forms/form-8962-shared-policy.js';
import { sharedPolicyFixture } from '../../fixtures/shared-policy.js';
import { d, sum } from '@/utils/decimal.js';

it('matches published Joe Alice allocation totals without changing original sources', () => {
  const input = sharedPolicyFixture();
  const source = input.form1095A[0], allocation = input.form8962!.sharedPolicyAllocations!.policies![0];
  source.monthlyPremiums = [{ month: 1, enrolleePremium: '13000', slcsp: '12000', advancePremiumTaxCredit: '6345' }];
  source.coveredIndividuals = source.coveredIndividuals!.map(person => ({ ...person, firstMonth: 1, lastMonth: 1 }));
  allocation.original = structuredClone(source); allocation.monthlyAllocations = [{ month: 1, fraction: '.80' }];
  const before = JSON.stringify(input), result = calculateForm8962SharedPolicy(input);
  expect(result.months.map(row => [row.premium.toFixed(), row.slcsp.toFixed(), row.advance.toFixed()])).toEqual([['10400', '9600', '5076']]);
  expect(JSON.stringify(input)).toBe(before);
  allocation.monthlyAllocations[0].fraction = '0.20';
  expect(calculateForm8962SharedPolicy(input).months.map(row => [row.premium.toFixed(), row.slcsp.toFixed(), row.advance.toFixed()])).toEqual([['2600', '2400', '1269']]);
});

it('binds original source identity year households and every covered enrollee', () => {
  const mutations: Array<(input: ReturnType<typeof sharedPolicyFixture>) => void> = [
    input => { input.form8962!.sharedPolicyAllocations!.sourceFactsConfirmed = undefined; },
    input => { input.form8962!.sharedPolicyAllocations!.sourceTaxYear = 2024; },
    input => { input.form8962!.sharedPolicyAllocations!.primarySsn = '345-67-8901'; },
    input => { input.form1095A[0].policyNumber = 'REPLACED'; },
    input => { input.form1095A[0].recipientSsn = '345-67-8901'; },
    input => { input.form1095A[0].coveredIndividuals![0].name = 'Different person'; },
    input => { input.form8962!.sharedPolicyAllocations!.policies![0].otherTaxpayerSsn = '123-45-6789'; },
    input => { input.form8962!.sharedPolicyAllocations!.policies![0].coveredFamilyAssignments!.pop(); },
    input => { input.form8962!.sharedPolicyAllocations!.policies![0].coveredFamilyAssignments![1].family = 'this_return'; },
    input => { input.form8962!.sharedPolicyAllocations!.policies![0].coveredFamilyAssignments!.push({ ssn: '123-45-6789', family: 'this_return' }); },
    input => { input.form8962!.taxFamilySize = 2; },
    input => { input.standardDeductionFacts!.primaryCanBeClaimedAsDependent = undefined; },
    input => { input.form1095A[0].monthlyPremiums[0].enrolleePremium = '1000.01'; input.form1095A[0].monthlyPremiums[1].enrolleePremium = '999.99'; },
  ];
  for (const mutate of mutations) { const input = sharedPolicyFixture(); mutate(input); expect(() => calculateForm8962SharedPolicy(input)).toThrow(); }
});

it('preserves zero full and varying agreements with exact cents and explicit method gates', () => {
  const input = sharedPolicyFixture(), policy = input.form8962!.sharedPolicyAllocations!.policies![0];
  policy.monthlyAllocations = policy.monthlyAllocations!.map(row => ({ ...row, fraction: row.month! < 5 ? '0' : row.month! < 9 ? '1' : '0.33' }));
  input.form1095A[0].monthlyPremiums[8].enrolleePremium = '9007199254740993.01'; policy.original = structuredClone(input.form1095A[0]);
  const result = calculateForm8962SharedPolicy(input);
  expect(result.periods.map(row => [row.firstMonth, row.lastMonth, row.fraction.toFixed()])).toEqual([[1, 4, '0'], [5, 8, '1'], [9, 12, '0.33']]);
  expect(result.months[0].premium.isZero()).toBe(true); expect(result.months[4].premium.toFixed()).toBe('1000');
  expect(result.months[8].premium.toFixed()).toBe('2972375754064527.6933');
  expect(sum(...result.months.map(row => row.advance)).eq(d('2660'))).toBe(true);
  const mutations: Array<(input: ReturnType<typeof sharedPolicyFixture>) => void> = [
    i => { i.form8962!.sharedPolicyAllocations!.policies![0].agreementConfirmed = false; },
    i => { i.form8962!.sharedPolicyAllocations!.policies![0].originalSlcspCorrectConfirmed = undefined; },
    i => { i.form8962!.sharedPolicyAllocations!.policies![0].noCurrentYearMarriageOrDivorceConfirmed = false; },
    i => { i.form8962!.sharedPolicyAllocations!.policies![0].monthlyAllocations![0].fraction = '0.333'; },
    i => { i.form8962!.sharedPolicyAllocations!.policies![0].monthlyAllocations!.pop(); },
    i => { i.form8962!.qsehraAffected = true; },
    i => { i.form8962!.selfEmployedHealthInsuranceCoordinationRequired = undefined; },
    i => { i.form1095A[0].monthlyPremiums = i.form1095A[0].monthlyPremiums.map(row => ({ ...row, advancePremiumTaxCredit: '0' })); i.form8962!.sharedPolicyAllocations!.policies![0].original = structuredClone(i.form1095A[0]); },
  ];
  for (const mutate of mutations) { const changed = sharedPolicyFixture(); mutate(changed); expect(() => calculateForm8962SharedPolicy(changed)).toThrow(); }
});
