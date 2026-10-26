// Spec: spec/federal/form-8962-default-allocation.yaml. Synthetic source records.
import { expect, it } from 'vitest';
import { calculateForm8962SharedPolicy } from '@/engine/forms/form-8962-shared-policy.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { sharedPolicyFixture } from '../../fixtures/shared-policy.js';

function source(claiming = false) {
  const input = sharedPolicyFixture();
  const original = input.form1095A[0];
  original.coveredIndividuals!.push({ name: 'Alex Doe', ssn: '345-67-8901', firstMonth: 1, lastMonth: 12 });
  input.taxpayer.dependents = [{ firstName: 'Alex', lastName: 'Doe', ssn: '345-67-8901', dateOfBirth: '2000-02-02', relationship: 'child', monthsLivedWithYou: 12, qualifiesForCTC: false }];
  const packet = input.form8962!.sharedPolicyAllocations!, policy = packet.policies![0];
  policy.original = structuredClone(original); policy.agreementConfirmed = false;
  policy.agreementReference = undefined; policy.monthlyAllocations = undefined;
  policy.coveredFamilyAssignments!.push({ ssn: '345-67-8901', family: 'this_return' });
  const raw = { ...policy, defaultAllocation: { sourceReference: 'Actual enrollment application and no-agreement records', enrollingTaxpayerSsn: '123-45-6789', allCoveredPeopleEnrolledByTaxpayerConfirmed: true } };
  input.form8962!.taxFamilySize = 2;
  if (claiming) {
    input.taxpayer.primary = { ...input.taxpayer.primary, firstName: 'Robin', lastName: 'Other', ssn: '234-56-7890' };
    input.taxpayer.dependents = []; input.form8962!.taxFamilySize = 1;
    packet.primaryName = 'Robin Other'; packet.primarySsn = '234-56-7890';
    raw.otherTaxpayerName = 'Jane Doe'; raw.otherTaxpayerSsn = '123-45-6789';
    raw.coveredFamilyAssignments = raw.coveredFamilyAssignments!.map(row => ({ ...row, family: row.family === 'this_return' ? 'other_return' : 'this_return' }));
  }
  packet.policies = [raw];
  return TaxYearInputSchema.parse(input);
}
function policy(input: ReturnType<typeof source>) { return input.form8962!.sharedPolicyAllocations!.policies![0]; }
function synchronize(input: ReturnType<typeof source>) { policy(input).original = structuredClone(input.form1095A[0]); }

it('matches published no-agreement shares from either actual taxpayer role', () => {
  for (const claiming of [false, true]) {
    const input = source(claiming), original = input.form1095A[0];
    original.monthlyPremiums = [{ month: 1, enrolleePremium: '13000', slcsp: '12000', advancePremiumTaxCredit: '6345' }];
    original.coveredIndividuals = original.coveredIndividuals!.map(person => ({ ...person, lastMonth: 1 })); synchronize(input);
    const before = JSON.stringify(input), result = calculateForm8962SharedPolicy(input);
    expect(result.periods[0].fraction.toFixed(2)).toBe(claiming ? '0.33' : '0.67');
    expect(result.months.map(row => [row.premium.toFixed(), row.slcsp.toFixed(), row.advance.toFixed()])).toEqual(claiming ? [['4290','3960','2093.85']] : [['8710','8040','4251.15']]);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.lines.some(line => /default/i.test(line.description))).toBe(true);
  }
});

it('derives changing monthly counts and preserves complementary rounding at one of eight', () => {
  const input = source(), original = input.form1095A[0];
  original.monthlyPremiums = original.monthlyPremiums.slice(0,2);
  original.coveredIndividuals = original.coveredIndividuals!.map(person => ({ ...person, lastMonth: 2 }));
  original.coveredIndividuals.push({ name: 'Pat Other', ssn: '456-78-9012', firstMonth: 2, lastMonth: 2 });
  policy(input).coveredFamilyAssignments!.push({ ssn: '456-78-9012', family: 'other_return' }); synchronize(input);
  expect(calculateForm8962SharedPolicy(input).periods.map(row => [row.firstMonth,row.lastMonth,row.fraction.toFixed(2)])).toEqual([[1,1,'0.67'],[2,2,'0.50']]);
  const tie = source();
  for (let index=0; index<5; index++) {
    const id = `56789012${index}`;
    tie.taxpayer.dependents.push({ firstName: `Child${index}`, lastName: 'Doe', ssn: id, dateOfBirth: '2000-02-02', relationship: 'child', monthsLivedWithYou: 12, qualifiesForCTC: false });
    tie.form1095A[0].coveredIndividuals!.push({ name: `Child${index} Doe`, ssn: id, firstMonth: 1, lastMonth: 12 });
    policy(tie).coveredFamilyAssignments!.push({ ssn: id, family: 'this_return' });
  }
  tie.form8962!.taxFamilySize = 7; tie.form1095A[0].monthlyPremiums[0].enrolleePremium = '9007199254740993.01'; synchronize(tie);
  const allocation = calculateForm8962SharedPolicy(tie);
  expect(allocation.periods[0].fraction.toFixed(2)).toBe('0.87');
  expect(allocation.months[0].premium.eq(d('9007199254740993.01').times('.87'))).toBe(true);
});

it('requires actual no-agreement and enrollment facts without accepting a supplied fraction', () => {
  const mutations: Array<(input: ReturnType<typeof source>) => void> = [
    input => { policy(input).agreementConfirmed = undefined; },
    input => { policy(input).defaultAllocation = undefined; },
    input => { policy(input).defaultAllocation!.sourceReference = ''; },
    input => { policy(input).defaultAllocation!.enrollingTaxpayerSsn = '456-78-9012'; },
    input => { policy(input).defaultAllocation!.allCoveredPeopleEnrolledByTaxpayerConfirmed = undefined; },
    input => { policy(input).monthlyAllocations = [{ month: 1, fraction: '.50' }]; },
    input => { policy(input).agreementReference = 'Actual signed percentage agreement'; },
    input => { policy(input).agreementConfirmed = true; },
    input => { input.form1095A[0].monthlyPremiums[0].enrolleePremium = '1000.001'; },
  ];
  for (const mutate of mutations) { const input = source(); mutate(input); expect(() => calculateForm8962SharedPolicy(input)).toThrow(); }
});

it('uses actual default sources canonically and retains isolated year gates', () => {
  const input = source(true);
  input.form8962!.monthlyReconciliation = input.form8962!.monthlyReconciliation!.map(row => ({ ...row, enrolleePremium: '330', slcsp: '297', advancePremiumTaxCredit: '165' }));
  const result = calculateFederalTax(input);
  expect(result.form8962!.ptcAllowed.toFixed()).toBe('2976');
  expect(result.form8962!.advancePTCTotal.toFixed()).toBe('1980');
  expect(result.form8962!.netPTC.toFixed()).toBe('996');
  expect(result.form8962!.sharedPolicyAllocation!.periods[0].fraction.toFixed(2)).toBe('0.33');
  input.taxpayer.taxYear = 2026;
  expect(() => calculateFederalTax(input)).toThrow(/2026|readiness/);
});
