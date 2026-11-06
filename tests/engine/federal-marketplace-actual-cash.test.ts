// Spec: spec/federal/marketplace-actual-cash-health.yaml.
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateMarketplaceActualCashHealth } from '@/engine/forms/marketplace-actual-cash-health.js';
import { d, sum } from '@/utils/decimal.js';
import { marketplaceActualCashInput, marketplaceActualCashTwoOwners } from '../fixtures/marketplace-actual-cash.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

describe('actual Marketplace cash independent of allocated premiums', () => {
  it('deducts actual cash once while preserving independently allocated policy amounts', () => {
    for (const shared of [false, true]) {
      const input = marketplaceActualCashInput(shared), before = structuredClone(input);
      const result = calculateFederalTax(input);
      expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('5400');
      expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('5400');
      expect(result.form7206!.paidSourcePremiums.toFixed()).toBe('5400');
      expect(result.form7206!.grossSourcePremiums.toFixed()).toBe(shared ? '22500' : '15000');
      expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
      expect(result.form8962!.advancePTCTotal.toFixed()).toBe('0');
      expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('0');
      expect(result.agi.toFixed()).toBe('279665');
      expect(result.allLines.find(row => row.form === 'QBI Source Deductions' && row.line === 'scheduleC')?.inputs['SE health insurance'].toString()).toBe('5400');
      expect(sum(...result.form7206!.coverageFamilyAllocations!.map(row => row.taxFamilyPremium)).toFixed()).toBe('15000');
      expect(input).toEqual(before);
    }
  });
  it('requires exact component bounds and complete independent payment sources', () => {
    const excess = marketplaceActualCashInput(), payment = excess.form7206!.plans![0].payments![0];
    Object.assign(payment, { ownerOrBusinessPaid: '983.34', otherPersonPaid: '266.66' });
    payment.personAmounts![0].amountPaid = '833.34';
    expect(() => calculateFederalTax(excess)).toThrow(/actual.*cash|component|paid.*share/i);
    const unknown = marketplaceActualCashInput(); unknown.form1095A[0].monthlyPremiums[0].advancePremiumTaxCredit = undefined;
    expect(() => calculateFederalTax(unknown)).toThrow(/unknown|source|advance/i);
    const duplicate = marketplaceActualCashInput(); duplicate.form7206!.plans![0].payments![0].personAmounts!.push(structuredClone(duplicate.form7206!.plans![0].payments![0].personAmounts![0]));
    expect(() => calculateFederalTax(duplicate)).toThrow(/duplicate|source|person/i);
    const wrong = marketplaceActualCashInput(); wrong.form7206!.plans![0].payments![0].otherPersonPaid = '799.99';
    expect(() => calculateFederalTax(wrong)).toThrow(/reconcile|conserve|source/i);
  });
  it('rejects a positive final credit without substituting the allocated premium for cash', () => {
    const input = marketplaceActualCashInput(); input.scheduleC!.grossReceipts = '50000';
    expect(() => calculateFederalTax(input)).toThrow(/actual.*cash.*(credit|method)|zero.*final.*credit/i);
  });
  it('preserves separate owners partial coverage and actual health qualifications', () => {
    const input = marketplaceActualCashTwoOwners(), before = structuredClone(input);
    const result = calculateFederalTax(input);
    expect(result.form7206!.businesses.map(row => [row.accountHolder, row.deduction!.toFixed()])).toEqual([['primary', '5400'], ['spouse', '4646']]);
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('10046');
    const reversed = structuredClone(input); reversed.form7206!.plans!.reverse();
    const reordered = calculateFederalTax(reversed);
    expect([reordered.agi.toFixed(), reordered.schedule1!.seHealthInsurance.toFixed(), reordered.form8962!.ptcAllowed.toFixed()]).toEqual([result.agi.toFixed(), '10046', '0']);
    expect(input).toEqual(before);
    const partial = marketplaceActualCashInput(), plan = partial.form7206!.plans![0];
    partial.form1095A[0].monthlyPremiums = partial.form1095A[0].monthlyPremiums.filter(row => row.month >= 7);
    for (const person of partial.form1095A[0].coveredIndividuals!) person.firstMonth = 7;
    plan.coverageFamilySources!.policies![0].original = structuredClone(partial.form1095A[0]);
    plan.coverageFamilySources!.months = plan.coverageFamilySources!.months!.filter(row => row.month! >= 7);
    plan.payments = plan.payments!.filter(row => row.coverageMonth! >= 7); plan.months = plan.months!.filter(row => row.month! >= 7);
    partial.form8962!.monthlyReconciliation = partial.form8962!.monthlyReconciliation!.filter(row => row.month >= 7);
    const half = calculateFederalTax(partial);
    expect([half.form7206!.paidSourcePremiums.toFixed(), half.schedule1!.seHealthInsurance.toFixed(), half.agi.toFixed()]).toEqual(['2700', '2700', '282365']);
    const ineligible = marketplaceActualCashInput();
    for (const row of ineligible.form7206!.plans![0].months!) Object.assign(row, { employerSubsidizedPlanEligible: true, employerCoverageEnrolled: false, employerOfferPtcException: 'unaffordable', employerOfferSourceReference: 'Actual unaffordable employer offer' });
    const noHealth = calculateFederalTax(ineligible);
    expect([noHealth.schedule1!.seHealthInsurance.toFixed(), noHealth.form8962!.ptcAllowed.toFixed()]).toEqual(['0', '0']);
  });
  it('rejects changed and duplicated completed credit proof', () => {
    const input = marketplaceActualCashInput(), result = calculateFederalTax(input);
    const zero = result.form8962!.ptcAllowed;
    result.form8962!.ptcAllowed = d('0.01');
    expect(() => calculateMarketplaceActualCashHealth(input, result)).toThrow(/zero final credit/);
    result.form8962!.ptcAllowed = zero;
    result.form8962!.lines.push(result.form8962!.lines.find(row => row.form === 'Form 8962' && row.line === '24')!);
    expect(() => calculateMarketplaceActualCashHealth(input, result)).toThrow(/unique.*audit/);
    const missing = marketplaceActualCashInput(); delete missing.form7206!.plans![0].payments![0].personAmounts![0].advancePremiumTaxCredit;
    expect(() => calculateFederalTax(missing)).toThrow(/unknown|source|advance/i);
  });
  it('retains each actual own business limit and source cents', () => {
    const input = marketplaceActualCashInput(); input.scheduleC!.grossReceipts = '5000';
    input.w2s = [{ ...simpleW2Fixture.w2s[0], accountHolder: 'spouse', wages: '300000', federalWithheld: '0', socialSecurityWages: '176100', socialSecurityWithheld: '10918.20', socialSecurityTips: '0', medicareWages: '300000', medicareWithheld: '4350' }];
    const result = calculateFederalTax(input);
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('4646');
    expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('5400');
    const cents = marketplaceActualCashInput();
    for (const row of cents.form7206!.plans![0].payments!) {
      row.ownerOrBusinessPaid = '450.01'; row.otherPersonPaid = '799.99'; row.personAmounts![0].amountPaid = '300.01';
    }
    const exact = calculateFederalTax(cents);
    expect(exact.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('5400.12');
    expect(exact.schedule1!.seHealthInsurance.toFixed()).toBe('5400');
  });
});
