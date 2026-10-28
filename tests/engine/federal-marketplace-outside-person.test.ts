// Spec: spec/federal/marketplace-outside-person-health.yaml.
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { d, roundDollar, sum } from '@/utils/decimal.js';
import { marketplaceOutsidePersonInput } from '../fixtures/marketplace-outside-person.js';
import { sharedCoverageFamilyHealthInput } from '../fixtures/coverage-family-health.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

describe('actual outside-tax-family Marketplace health payments', () => {
  it('deducts actual outside child cash as nonspecified without changing family premiums', () => {
    const input = marketplaceOutsidePersonInput(), before = structuredClone(input);
    const result = calculateFederalTax(input), health = result.form7206!, coordinated = result.marketplaceHealthInsurance!;
    expect(roundDollar(health.businesses[0].medicalPremiums).toFixed()).toBe('6200');
    expect(roundDollar(health.businesses[0].specifiedPremiums).toFixed()).toBe('10000');
    expect(coordinated.step2Credit.toFixed()).toBe('12000');
    expect(coordinated.specifiedDeduction.toFixed(2)).toBe('-2000.00');
    expect(coordinated.nonspecifiedDeduction.toFixed(2)).toBe('6200.00');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('4200');
    expect(result.agi.toFixed()).toBe('32974');
    expect(health.grossSourcePremiums.toFixed()).toBe('22500');
    expect(health.paidSourcePremiums.toFixed()).toBe('16200');
    expect(sum(...health.coverageFamilyAllocations!.map(row => row.taxFamilyPremium)).toFixed()).toBe('15000');
    expect(result.allLines.find(row => row.form === 'QBI Source Deductions' && row.line === 'scheduleC')?.inputs['SE health insurance'].toString()).toBe('4200');
    expect(input).toEqual(before);
  });
  it('combines independently supported family cash with actual outside cash once', () => {
    const result = calculateFederalTax(marketplaceOutsidePersonInput(true));
    expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('6600');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('6600');
    expect(result.agi.toFixed()).toBe('278465');
    expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
    expect(result.form8962!.advancePTCTotal.toFixed()).toBe('0');
    expect(sum(...result.form7206!.coverageFamilyAllocations!.map(row => row.taxFamilyPremium)).toFixed()).toBe('15000');
  });
  it('retains actual outside qualification months and missing-source boundaries', () => {
    for (const relationship of ['child_under_27', 'other'] as const) {
      const input = marketplaceOutsidePersonInput();
      input.form7206!.persons!.find(person => person.personId === 'outside')!.attainedAgeAtYearEnd = 27;
      input.form7206!.plans![0].coveredPersons!.find(person => person.personId === 'outside')!.relationshipToOwner = relationship;
      const result = calculateFederalTax(input);
      expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('3000');
      expect(result.form7206!.paidSourcePremiums.toFixed()).toBe('16200');
    }
    const partial = marketplaceOutsidePersonInput(), plan = partial.form7206!.plans![0];
    // Coverage is full-year; actual owner-paid child cash starts in July.
    for (const payment of plan.payments!.filter(row => row.coverageMonth! < 7)) {
      payment.ownerOrBusinessPaid = '1250'; payment.otherPersonPaid = '625';
      payment.personAmounts!.find(person => person.personId === 'outside')!.amountPaid = '0';
    }
    expect(calculateFederalTax(partial).schedule1!.seHealthInsurance.toFixed()).toBe('3600');
    const unknown = marketplaceOutsidePersonInput();
    delete unknown.form7206!.persons!.find(person => person.personId === 'outside')!.attainedAgeAtYearEnd;
    expect(() => calculateFederalTax(unknown)).toThrow(/age|unknown|source/i);
    const wrong = marketplaceOutsidePersonInput();
    wrong.form7206!.persons!.find(person => person.personId === 'outside')!.name = 'Different Original Person';
    expect(() => calculateFederalTax(wrong)).toThrow(/person|name|source/i);
  });
  it('preserves exact outside cash and rejects a borrowed family premium pool', () => {
    const input = marketplaceOutsidePersonInput();
    for (const payment of input.form7206!.plans![0].payments!) {
      payment.ownerOrBusinessPaid = '1350.01'; payment.otherPersonPaid = '524.99';
      payment.personAmounts!.find(person => person.personId === 'outside')!.amountPaid = '100.01';
    }
    const result = calculateFederalTax(input);
    expect(result.marketplaceHealthInsurance!.nonspecifiedDeduction.toFixed(2)).toBe('6200.12');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('4200');
    input.form7206!.plans![0].payments!.reverse();
    expect(calculateFederalTax(input).agi.eq(result.agi)).toBe(true);
    const excess = marketplaceOutsidePersonInput(true), payment = excess.form7206!.plans![0].payments![0];
    payment.ownerOrBusinessPaid = '1075.01'; payment.otherPersonPaid = '799.99';
    payment.personAmounts!.find(person => person.personId === 'outside')!.amountPaid = '625.01';
    expect(() => calculateFederalTax(excess)).toThrow(/outside|pool|source|paid/i);
    expect(d(payment.ownerOrBusinessPaid).plus(payment.otherPersonPaid).toFixed()).toBe('1875');
  });
  it('preserves own business and employer limits without treating outside advances as cash', () => {
    const limited = marketplaceOutsidePersonInput(true);
    limited.scheduleC!.grossReceipts = '5000';
    limited.w2s = [{ ...simpleW2Fixture.w2s[0], accountHolder: 'spouse', wages: '300000', federalWithheld: '0', socialSecurityWages: '176100', socialSecurityWithheld: '10918.20', socialSecurityTips: '0', medicareWages: '300000', medicareWithheld: '4350' }];
    const capped = calculateFederalTax(limited);
    expect(capped.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('6600');
    expect(capped.schedule1!.seHealthInsurance.toFixed()).toBe('4646');
    const ineligible = marketplaceOutsidePersonInput(true);
    for (const month of ineligible.form7206!.plans![0].months!) Object.assign(month, { employerSubsidizedPlanEligible: true, employerCoverageEnrolled: false, employerOfferPtcException: 'unaffordable', employerOfferSourceReference: 'Actual unaffordable employer offer' });
    const excluded = calculateFederalTax(ineligible);
    expect(excluded.form7206!.paidSourcePremiums.toFixed()).toBe('6600');
    expect(excluded.schedule1!.seHealthInsurance.toFixed()).toBe('0');
    const advances = sharedCoverageFamilyHealthInput().input;
    advances.form7206!.persons!.find(person => person.personId === 'outside')!.attainedAgeAtYearEnd = 26;
    advances.form7206!.plans![0].coveredPersons!.find(person => person.personId === 'outside')!.relationshipToOwner = 'child_under_27';
    expect(() => calculateFederalTax(advances)).toThrow(/outside child return sources.*completed other-return Form8962/i);
  });
  it('requires the completed other return independently of zero advances', () => {
    for (const kind of ['missing', 'unknown-credit', 'positive-credit', 'draft'] as const) {
      const input = marketplaceOutsidePersonInput();
      const packet = input.form7206!.plans![0].coverageFamilySources!;
      if (kind === 'missing') delete packet.outsidePersonReturns;
      else if (kind === 'unknown-credit') delete packet.outsidePersonReturns![0].form8962Line24;
      else if (kind === 'positive-credit') packet.outsidePersonReturns![0].form8962Line24 = '0.01';
      else packet.outsidePersonReturns![0].returnStatus = 'draft';
      expect(() => calculateFederalTax(input), kind).toThrow(/outside.*return|outside.*credit/i);
    }
  });
  it('binds the zero-credit other return to its actual claimant and original policies', () => {
    for (const patch of [{ sourceTaxYear: 2024 }, { claimantSsn: '999-88-7777' }, { claimantName: 'Wrong Claimant' },
      { sourceReference: '' }, { policySourceIds: [] }, { policySourceIds: ['form1095A:01'] }, { allPoliciesIncludedConfirmed: false }]) {
      const input = marketplaceOutsidePersonInput();
      const packet = input.form7206!.plans![0].coverageFamilySources!;
      Object.assign(packet.outsidePersonReturns![0], patch);
      expect(() => calculateFederalTax(input)).toThrow(/outside.*return|outside.*claimant|outside.*polic/i);
    }
    const duplicated = marketplaceOutsidePersonInput();
    const packet = duplicated.form7206!.plans![0].coverageFamilySources!;
    packet.outsidePersonReturns!.push(structuredClone(packet.outsidePersonReturns![0]));
    expect(() => calculateFederalTax(duplicated)).toThrow(/outside.*return|duplicate/i);
  });

});
