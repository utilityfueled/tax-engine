// Spec: spec/federal/marketplace-reported-repayment-payment.yaml.
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { d } from '@/utils/decimal.js';
import { marketplaceFullRepaymentTwoOwners } from '../fixtures/marketplace-full-repayment.js';
import { marketplaceReportedRepaymentInput } from '../fixtures/marketplace-reported-repayment.js';
import { calculateMarketplaceReportedRepaymentPayment } from '@/engine/forms/marketplace-reported-repayment-payment.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

describe('actual paid cost with reported advance repayment', () => {
  it('uses actual reported repayment without treating source cents as paid', () => {
    for (const shared of [false, true]) {
      const input = marketplaceReportedRepaymentInput(shared), before = structuredClone(input), result = calculateFederalTax(input);
      expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
      expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe(shared ? '12000' : '12006');
      expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe(shared ? '17994.12' : '18000');
      expect(result.schedule1!.seHealthInsurance.toFixed()).toBe(shared ? '17994' : '18000');
      expect(result.agi.toFixed()).toBe(shared ? '267071' : '267065');
      expect(input).toEqual(before);
      const small = calculateFederalTax(marketplaceReportedRepaymentInput(shared, true));
      expect(small.form8962!.excessAPTCRepayment.toFixed()).toBe('0');
      expect(small.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('17999.88');
      expect(small.schedule1!.seHealthInsurance.toFixed()).toBe('18000');
    }
  });
  it('keeps the actual owner business limit after the source payment calculation', () => {
    const input = marketplaceReportedRepaymentInput(true); input.scheduleC!.grossReceipts = '5000';
    input.w2s = [{ ...simpleW2Fixture.w2s[0], employer: { name: 'Actual spouse employer', ein: '12-3456789' }, accountHolder: 'spouse', wages: '300000', federalWithheld: '0', socialSecurityWages: '176100', socialSecurityWithheld: '10918.20', socialSecurityTips: '0', medicareWages: '300000', medicareWithheld: '4350' }];
    const result = calculateFederalTax(input);
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('4646');
    expect(result.form7206!.businesses[0].earnedIncomeLimit!.toFixed()).toBe('4646');
    expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('12000');
  });
  it('requires one complete eligible payment source and determined component costs', () => {
    const unknown = marketplaceReportedRepaymentInput(); unknown.form7206!.plans![0].payments![0].personAmounts![1].advancePremiumTaxCredit = undefined;
    expect(() => calculateFederalTax(unknown)).toThrow(/unknown|source|advance/i);
    const mismatch = marketplaceReportedRepaymentInput();
    for (const row of mismatch.form7206!.plans![0].payments!) {
      row.personAmounts![0].amountPaid = '398.51'; row.personAmounts![1].amountPaid = '101';
    }
    expect(() => calculateFederalTax(mismatch)).toThrow(/component|payment|source|repay/i);
    const ineligible = marketplaceReportedRepaymentInput(); ineligible.form7206!.plans![0].months![0].employerSubsidizedPlanEligible = true;
    expect(() => calculateFederalTax(ineligible)).toThrow(/eligible|payment|source|repay/i);
    const two = marketplaceFullRepaymentTwoOwners();
    two.form1095A[0].monthlyPremiums[0].advancePremiumTaxCredit = '1000.49';
    expect(() => calculateFederalTax(two)).toThrow(/source|stale|repay/i);
  });
  it('requires the actual completed return and its unchanged payment proof', () => {
    const input = marketplaceReportedRepaymentInput(true);
    const actual = calculateFederalTax(input);
    expect(calculateMarketplaceReportedRepaymentPayment(input, actual).eligiblePremiums.toFixed()).toBe('17994.12');
    const credit = calculateFederalTax(input); credit.form8962!.ptcAllowed = d(1);
    expect(() => calculateMarketplaceReportedRepaymentPayment(input, credit)).toThrow(/zero credit/i);
    const partial = calculateFederalTax(input); partial.form8962!.excessAPTCRepayment = d(11999);
    expect(() => calculateMarketplaceReportedRepaymentPayment(input, partial)).toThrow(/repaid/i);
    const duplicate = calculateFederalTax(input); duplicate.form8962!.lines.push(duplicate.form8962!.lines.find(row => row.line === '29')!);
    expect(() => calculateMarketplaceReportedRepaymentPayment(input, duplicate)).toThrow(/audit/i);
    const cost = calculateFederalTax(input); cost.form7206!.businesses[0].eligiblePremiums = d(18000);
    expect(() => calculateMarketplaceReportedRepaymentPayment(input, cost)).toThrow(/paid cost/i);
  });
});
