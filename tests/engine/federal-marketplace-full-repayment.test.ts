// Spec: spec/federal/marketplace-full-advance-repayment.yaml.
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateMarketplaceFullAdvanceRepayment } from '@/engine/forms/marketplace-full-advance-repayment.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { d, sum } from '@/utils/decimal.js';
import { marketplaceFullRepaymentInput, marketplaceFullRepaymentTwoOwners } from '../fixtures/marketplace-full-repayment.js';

describe('actual fully repaid Marketplace advances', () => {
  it('accepts only actual zero final credit and full original repayment after the ordinary deduction', () => {
    for (const shared of [false, true]) {
      const input = marketplaceFullRepaymentInput(shared), before = structuredClone(input);
      const result = calculateFederalTax(input);
      expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
      expect(result.form8962!.advancePTCTotal.toFixed()).toBe('12000');
      expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('12000');
      expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('18000');
      expect(result.form7206!.businesses[0].medicalPremiums.toFixed()).toBe('18000');
      expect(sum(...result.form7206!.sourceRecords.filter(row => row.personId === 'spouse').map(row => row.advancePremiumTaxCredit)).toFixed()).toBe('4800');
      expect(result.allLines.find(row => row.form === 'QBI Source Deductions' && row.line === 'scheduleC')?.inputs['SE health insurance'].toString()).toBe('18000');
      expect(input).toEqual(before);
    }
  });
  it('keeps actual positive noncoverage advances separate from unknown or contradictory sources', () => {
    const source = marketplaceFullRepaymentInput();
    const unknown = structuredClone(source); unknown.form7206!.plans![0].payments![0].personAmounts![1].advancePremiumTaxCredit = undefined;
    expect(() => calculateFederalTax(unknown)).toThrow(/unknown|source|advance/i);
    const mismatch = structuredClone(source); mismatch.form7206!.plans![0].payments![0].personAmounts![1].advancePremiumTaxCredit = '399.99';
    expect(() => calculateFederalTax(mismatch)).toThrow(/reconcile|source|advance/i);
    const missing = structuredClone(source); missing.form7206!.plans![0].coverageFamilySources!.months![0].personFacts![1].otherMecEligible = undefined;
    expect(() => calculateFederalTax(missing)).toThrow(/MEC|source|unknown/i);
  });
  it('rejects a positive final credit or a partially repaid advance after ordinary refiguring', () => {
    const positive = marketplaceFullRepaymentInput(); positive.scheduleC!.grossReceipts = '100000';
    expect(() => calculateFederalTax(positive)).toThrow(/full.*repay|noncoverage.*advance/i);
    const partial = marketplaceFullRepaymentInput(); partial.scheduleC!.grossReceipts = '10000';
    expect(() => calculateFederalTax(partial)).toThrow(/full.*repay|noncoverage.*advance/i);
  });
  it('retains actual own business income limits without borrowing spouse earnings', () => {
    const input = marketplaceFullRepaymentInput(); input.scheduleC!.grossReceipts = '5000';
    input.w2s = [{ ...simpleW2Fixture.w2s[0], employer: { name: 'Actual spouse employer', ein: '12-3456789' }, accountHolder: 'spouse', wages: '300000', federalWithheld: '0', socialSecurityWages: '176100', socialSecurityWithheld: '10918.20', socialSecurityTips: '0', medicareWages: '300000', medicareWithheld: '4350' }];
    const result = calculateFederalTax(input);
    expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
    expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('12000');
    expect(result.form7206!.businesses[0].earnedIncomeLimit!.toFixed(2)).toBe('4646.00');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('4646');
    expect(d(result.schedule1!.seHealthInsurance).lt(18000)).toBe(true);
  });
  it('retains source cents independently of annual and monthly repayment reporting', () => {
    for (const shared of [false, true]) {
      const input = marketplaceFullRepaymentInput(shared), original = input.form1095A[0], plan = input.form7206!.plans![0];
      for (const row of original.monthlyPremiums) { row.enrolleePremium = shared ? '3000.98' : '1500.49'; row.advancePremiumTaxCredit = shared ? '2000.98' : '1000.49'; }
      plan.coverageFamilySources!.policies![0].original = structuredClone(original);
      if (shared) input.form8962!.sharedPolicyAllocations!.policies![0].original = structuredClone(original);
      for (const row of input.form8962!.monthlyReconciliation!) { row.enrolleePremium = '1500.49'; row.advancePremiumTaxCredit = '1000.49'; }
      for (const row of plan.payments!) {
        row.grossPremium = shared ? '3000.98' : '1500.49'; row.advancePremiumTaxCredit = shared ? '2000.98' : '1000.49';
        row.personAmounts![0].advancePremiumTaxCredit = '600.49';
        if (shared) row.personAmounts![2].advancePremiumTaxCredit = '1000.49';
      }
      // Rounded equality alone is not proof that the source cents were repaid.
      expect(() => calculateFederalTax(input)).toThrow(/full.*repay|source.*advance|component costs/i);
      for (const row of original.monthlyPremiums) row.advancePremiumTaxCredit = shared ? (row.month <= 6 ? '2000.02' : '1999.98') : (row.month <= 6 ? '1000.01' : '999.99');
      plan.coverageFamilySources!.policies![0].original = structuredClone(original);
      if (shared) input.form8962!.sharedPolicyAllocations!.policies![0].original = structuredClone(original);
      for (const row of input.form8962!.monthlyReconciliation!) row.advancePremiumTaxCredit = row.month <= 6 ? '1000.01' : '999.99';
      for (const row of plan.payments!) {
        const early = row.coverageMonth! <= 6;
        row.advancePremiumTaxCredit = shared ? (early ? '2000.02' : '1999.98') : (early ? '1000.01' : '999.99');
        row.ownerOrBusinessPaid = early ? '500.48' : '500.50'; row.otherPersonPaid = shared ? row.ownerOrBusinessPaid : '0';
        row.personAmounts![0].amountPaid = early ? '400.48' : '400.50'; row.personAmounts![0].advancePremiumTaxCredit = early ? '600.01' : '599.99';
        if (shared) row.personAmounts![2].advancePremiumTaxCredit = early ? '1000.01' : '999.99';
      }
      const result = calculateFederalTax(input), proof = result.marketplaceFullRepaymentHealth!;
      expect(proof.exactSourceAdvances.toFixed()).toBe('12000');
      expect(proof.finalRepayment.toFixed()).toBe('12000');
      expect(result.form8962!.calculationMethod).toBe(shared ? 'monthly' : 'annual');
      expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('18005.88');
      expect(proof.deduction.toFixed()).toBe('18006');
    }
    const small = marketplaceFullRepaymentInput(), plan = small.form7206!.plans![0];
    for (const row of small.form1095A[0].monthlyPremiums) row.advancePremiumTaxCredit = '0.01';
    plan.coverageFamilySources!.policies![0].original = structuredClone(small.form1095A[0]);
    for (const row of small.form8962!.monthlyReconciliation!) row.advancePremiumTaxCredit = '0.01';
    for (const row of plan.payments!) {
      row.ownerOrBusinessPaid = '1499.99'; row.advancePremiumTaxCredit = '0.01';
      Object.assign(row.personAmounts![0], { amountPaid: '1000', advancePremiumTaxCredit: '0' });
      Object.assign(row.personAmounts![1], { amountPaid: '499.99', advancePremiumTaxCredit: '0.01' });
    }
    const actualPaid = calculateFederalTax(small);
    expect(actualPaid.marketplaceReportedRepaymentHealth!.unreportedAdvanceRemainder.toFixed()).toBe('0.12');
    expect(actualPaid.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('17999.88');
    expect(() => calculateMarketplaceFullAdvanceRepayment(small, actualPaid)).toThrow(/full.*repay|source.*advance/i);
  });
  it('keeps separate owner plans and health qualification after full repayment', () => {
    const input = marketplaceFullRepaymentTwoOwners(), before = structuredClone(input);
    const result = calculateFederalTax(input);
    expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe('24000');
    expect(result.form7206!.businesses.map(row => [row.accountHolder, row.deduction!.toFixed()])).toEqual([['primary', '18000'], ['spouse', '4646']]);
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('22646');
    const reversed = structuredClone(input); reversed.form7206!.plans!.reverse();
    const reordered = calculateFederalTax(reversed);
    expect([reordered.agi.toFixed(), reordered.schedule1!.seHealthInsurance.toFixed(), reordered.form8962!.excessAPTCRepayment.toFixed()])
      .toEqual([result.agi.toFixed(), '22646', '24000']);
    const ineligible = marketplaceFullRepaymentInput();
    for (const row of ineligible.form7206!.plans![0].months!) Object.assign(row, { employerSubsidizedPlanEligible: true, employerCoverageEnrolled: false, employerOfferPtcException: 'unaffordable', employerOfferSourceReference: 'Actual unaffordable employer offer' });
    const noHealth = calculateFederalTax(ineligible);
    expect([noHealth.schedule1!.seHealthInsurance.toFixed(), noHealth.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['0', '12000']);
    expect(input).toEqual(before);
  });
});
