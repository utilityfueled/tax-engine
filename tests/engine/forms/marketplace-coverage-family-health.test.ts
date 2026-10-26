import { describe, expect, it } from 'vitest';
import { calculateMarketplaceCoverageFamilyHealth } from '@/engine/forms/marketplace-coverage-family-health.js';
import { coverageFamilyHealthInput, sharedCoverageFamilyHealthInput } from '../../fixtures/coverage-family-health.js';
import { d, roundDollar, sum } from '@/utils/decimal.js';

describe('actual coverage-family health premium sources', () => {
  it('derives the published Gary Sue split and retains full original advances and premiums', () => {
    const { input } = coverageFamilyHealthInput(), before = structuredClone(input);
    const result = calculateMarketplaceCoverageFamilyHealth(input);
    expect(roundDollar(sum(...result!.map(row => row.specifiedPremium))).toFixed()).toBe('10000');
    expect(roundDollar(sum(...result!.map(row => row.nonspecifiedPremium))).toFixed()).toBe('5000');
    expect(sum(...result!.map(row => row.advancePremiumTaxCredit)).toFixed()).toBe('6000');
    expect(sum(...result!.map(row => row.taxFamilyPremium)).toFixed()).toBe('15000');
    expect(input).toEqual(before);
  });
  it('binds original policy identity and actual monthly coverage members without defaults', () => {
    for (const change of [
      (f: ReturnType<typeof coverageFamilyHealthInput>) => { f.coverageFamilySources.sourceFactsConfirmed = false; },
      (f: ReturnType<typeof coverageFamilyHealthInput>) => { f.input.form1095A[0].policyNumber = 'Same money different original'; },
      (f: ReturnType<typeof coverageFamilyHealthInput>) => { f.coverageFamilySources.months[0].personFacts.pop(); },
      (f: ReturnType<typeof coverageFamilyHealthInput>) => { f.coverageFamilySources.months[0].coverageFamilyMemberSsns.push('987-65-4321'); },
      (f: ReturnType<typeof coverageFamilyHealthInput>) => { f.input.taxpayer.spouse!.ssn = '222-33-4444'; },
    ]) { const fixture = coverageFamilyHealthInput(); change(fixture); expect(() => calculateMarketplaceCoverageFamilyHealth(fixture.input)).toThrow(); }
  });
  it('keeps known-zero noncoverage advances distinct from unknown and positive advances', () => {
    const missing = coverageFamilyHealthInput(); delete missing.input.form7206!.plans![0].payments![0].personAmounts![1].advancePremiumTaxCredit;
    expect(() => calculateMarketplaceCoverageFamilyHealth(missing.input)).toThrow(/advance|unknown/i);
    const positive = coverageFamilyHealthInput();
    positive.input.form7206!.plans![0].payments![0].personAmounts![0].advancePremiumTaxCredit = '499.99';
    positive.input.form7206!.plans![0].payments![0].personAmounts![1].advancePremiumTaxCredit = '0.01';
    expect(() => calculateMarketplaceCoverageFamilyHealth(positive.input)).toThrow(/noncoverage.*advance/i);
  });
  it('preserves changing coverage months and exact ratio amounts without changing originals', () => {
    const { input, coverageFamilySources } = coverageFamilyHealthInput();
    for (const month of coverageFamilySources.months.slice(0, 6)) {
      month.personFacts[1].otherMecEligible = false; month.coverageFamilySlcsp = '1500'; month.nonCoverageFamilySlcsp = '0';
      month.coverageFamilyMemberSsns.push('987-65-4321'); month.nonCoverageFamilyMemberSsns = [];
    }
    const row = input.form1095A[0].monthlyPremiums[6]; row.enrolleePremium = '1250.01';
    coverageFamilySources.policies[0].original.monthlyPremiums[6].enrolleePremium = '1250.01';
    input.form7206!.plans![0].payments![6].grossPremium = '1250.01'; input.form7206!.plans![0].payments![6].ownerOrBusinessPaid = '750.01';
    input.form7206!.plans![0].payments![6].personAmounts![0].amountPaid = '350.01';
    const before = structuredClone(input), result = calculateMarketplaceCoverageFamilyHealth(input)!;
    expect(result[0].specifiedPremium.toFixed()).toBe('1250');
    expect(result[6].specifiedPremium.eq(d('1250.01').times(2).div(3))).toBe(true);
    expect(sum(...result.map(entry => entry.specifiedPremium.plus(entry.nonspecifiedPremium))).toFixed()).toBe('15000.01');
    expect(input).toEqual(before);
  });
  it('splits only the actual tax family allocation of a shared original policy', () => {
    for (const noAdvance of [false, true]) {
      const { input } = sharedCoverageFamilyHealthInput(noAdvance), before = structuredClone(input);
      const result = calculateMarketplaceCoverageFamilyHealth(input)!;
      expect(roundDollar(sum(...result.map(row => row.specifiedPremium))).toFixed()).toBe('10000');
      expect(roundDollar(sum(...result.map(row => row.nonspecifiedPremium))).toFixed()).toBe('5000');
      expect(sum(...result.map(row => row.taxFamilyPremium)).toFixed()).toBe('15000');
      expect(sum(...result.map(row => row.advancePremiumTaxCredit)).toFixed()).toBe(noAdvance ? '0' : '6000');
      expect(input).toEqual(before);
    }
  });
  it('rejects conflicting cross-policy membership and invalid actual receipt dates', () => {
    const fixture = coverageFamilyHealthInput(), { input } = fixture;
    const original = structuredClone(input.form1095A[0]); original.policyNumber = 'Second actual policy';
    input.form1095A.push(original);
    const plan = structuredClone(input.form7206!.plans![0]); plan.planId = 'second'; plan.marketplacePolicySourceIds = ['form1095A:1'];
    plan.payments!.forEach(payment => { payment.sourceId = `second:${payment.sourceId}`; });
    plan.coverageFamilySources!.policies = [{ sourceId: 'form1095A:1', original: structuredClone(original) }];
    for (const row of plan.coverageFamilySources!.months!) {
      row.personFacts![1].otherMecEligible = false;
      row.coverageFamilyMemberSsns = ['123-45-6789', '987-65-4321']; row.nonCoverageFamilyMemberSsns = [];
      row.coverageFamilySlcsp = '1500'; row.nonCoverageFamilySlcsp = '0';
    }
    plan.allCoveredPersonsInCoverageFamilyConfirmed = true;
    input.form7206!.plans!.push(plan);
    expect(() => calculateMarketplaceCoverageFamilyHealth(input)).toThrow(/contradict|conflict/i);
    for (const date of ['2025-02-30', '2025-13-01', '2025-not-a-date']) {
      const invalid = coverageFamilyHealthInput(); invalid.input.form7206!.plans![0].payments![0].datePaid = date;
      expect(() => calculateMarketplaceCoverageFamilyHealth(invalid.input)).toThrow(/date/i);
    }
  });
});
