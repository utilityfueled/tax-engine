// Spec: spec/federal/marketplace-actual-paid-repayment.yaml.
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { d } from '@/utils/decimal.js';
import { actualPaidRepaymentInput, actualPaidRepaymentTwoOwners, actualPaidRepaymentMarriage } from '../fixtures/marketplace-actual-paid-repayment.js';
import { marriageOutsidePersonInput } from '../fixtures/marketplace-marriage-outside-person.js';

describe('actual owner cash and determined own-return advance repayment', () => {
  it('uses actual owner cash and only the fully repaid own-return advances', () => {
    for (const shared of [false, true]) {
      const input = actualPaidRepaymentInput(shared), before = structuredClone(input), result = calculateFederalTax(input);
      expect([result.schedule1!.seHealthInsurance.toFixed(), result.agi.toFixed()]).toEqual(['15600', '269465']);
      expect([result.form8962!.ptcAllowed.toFixed(), result.form8962!.advancePTCTotal.toFixed(), result.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['0', '12000', '12000']);
      expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('15600');
      expect(result.form7206!.grossSourcePremiums.toFixed()).toBe(shared ? '36000' : '18000');
      expect(result.marketplaceActualPaidRepaymentHealth!.exactSourceAdvances.toFixed()).toBe('12000');
      expect(result.marketplaceActualPaidRepaymentHealth!.originalPolicyAdvances.toFixed()).toBe(shared ? '24000' : '12000');
      expect(result.allLines.find(row => row.form === 'QBI Source Deductions' && row.line === 'scheduleC')?.inputs['SE health insurance'].toString()).toBe('15600');
      expect(input).toEqual(before);
    }
  });
  it('preserves separate owners and actual monthly health qualification', () => {
    const input = actualPaidRepaymentTwoOwners(), result = calculateFederalTax(input);
    expect(result.form7206!.businesses.map(row => [row.accountHolder, row.eligiblePremiums.toFixed(), row.deduction!.toFixed()])).toEqual([['primary', '15600', '15600'], ['spouse', '15600', '4646']]);
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('20246');
    const reversed = structuredClone(input); reversed.form7206!.plans!.reverse();
    expect(calculateFederalTax(reversed).agi.toFixed()).toBe(result.agi.toFixed());
    const excluded = actualPaidRepaymentInput();
    Object.assign(excluded.form7206!.plans![0].months![0], { employerSubsidizedPlanEligible: true, employerCoverageEnrolled: false, employerOfferPtcException: 'unaffordable', employerOfferSourceReference: 'Actual unaffordable employer offer' });
    expect(calculateFederalTax(excluded).schedule1!.seHealthInsurance.toFixed()).toBe('14300');
  });
  it('retains actual source cents and the single eligible reported payment boundary', () => {
    for (const [shared, cost, deduction, repayment] of [[false, '15605.88', '15606', '12006'], [true, '15600', '15600', '12000']] as const) {
      const result = calculateFederalTax(actualPaidRepaymentInput(shared, '1000.49'));
      expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe(cost);
      expect(result.schedule1!.seHealthInsurance.toFixed()).toBe(deduction);
      expect(result.form8962!.excessAPTCRepayment.toFixed()).toBe(repayment);
      expect(result.marketplaceActualPaidRepaymentHealth!.exactSourceAdvances.toFixed()).toBe('12005.88');
    }
    const tiny = calculateFederalTax(actualPaidRepaymentInput(true, '0.01'));
    expect([tiny.schedule1!.seHealthInsurance.toFixed(), tiny.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['3600', '0']);
    expect(tiny.marketplaceActualPaidRepaymentHealth!.unreportedAdvanceRemainder.toFixed()).toBe('0.12');
    const excluded = actualPaidRepaymentInput(true, '1000.49');
    Object.assign(excluded.form7206!.plans![0].months![0], { employerSubsidizedPlanEligible: true, employerCoverageEnrolled: false, employerOfferPtcException: 'unaffordable', employerOfferSourceReference: 'Actual unaffordable employer offer' });
    expect(() => calculateFederalTax(excluded)).toThrow(/single|fully eligible|qualified|reported.*payment/i);
  });
  it('reconciles actual marriage worksheets before accepting the payment proof', () => {
    for (const shared of [false, true]) {
      const input = actualPaidRepaymentMarriage(shared), before = structuredClone(input), result = calculateFederalTax(input);
      expect([result.schedule1!.seHealthInsurance.toFixed(), result.agi.toFixed()]).toEqual(['10800', '274265']);
      expect([result.form8962!.ptcAllowed.toFixed(), result.form8962!.advancePTCTotal.toFixed(), result.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['0', '7000', '7000']);
      expect(result.form8962!.marriageCalculation).toBeDefined();
      expect(result.marketplaceActualPaidRepaymentHealth!.originalPolicyAdvances.toFixed()).toBe(shared ? '14000' : '7000');
      expect(input).toEqual(before);
    }
    const missing = actualPaidRepaymentMarriage(); delete missing.form8962!.marriageSources!.marriageDate;
    expect(() => calculateFederalTax(missing)).toThrow(/marriage|date|source/i);
  });
  it('requires complete actual source and component payment bounds', () => {
    const unknown = actualPaidRepaymentInput(); delete unknown.form7206!.plans![0].payments![0].personAmounts![0].advancePremiumTaxCredit;
    expect(() => calculateFederalTax(unknown)).toThrow(/unknown|advance|source/i);
    const excess = actualPaidRepaymentInput();
    const paid = excess.form7206!.plans![0].payments![0];
    paid.ownerOrBusinessPaid = '451'; paid.otherPersonPaid = '49'; paid.personAmounts![0].amountPaid = '401';
    expect(() => calculateFederalTax(excess)).toThrow(/component|paid.*share|source/i);
    const stale = actualPaidRepaymentInput(true); stale.form1095A[0].policyNumber += '-changed';
    expect(() => calculateFederalTax(stale)).toThrow(/stale|source|original/i);
  });
  it('composes actual outside-child cash with separate own-return advances', () => {
    const input = marriageOutsidePersonInput(); input.scheduleC!.grossReceipts = '300000';
    for (const payment of input.form7206!.plans![0].payments!) if (payment.coverageMonth! <= 6) {
      payment.ownerOrBusinessPaid = '1000.01'; payment.otherPersonPaid = '2000.02';
      payment.personAmounts!.find(person => person.personId === 'primary')!.amountPaid = '900.01';
    }
    const before = structuredClone(input), result = calculateFederalTax(input);
    expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('12000.06');
    expect([result.schedule1!.seHealthInsurance.toFixed(), result.agi.toFixed(), result.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['12000', '273065', '6000']);
    expect(result.marketplaceActualPaidRepaymentHealth!.exactSourceAdvances.toFixed()).toBe('6000');
    expect(input).toEqual(before);
    input.form7206!.plans![0].coverageFamilySources!.outsidePersonReturns![0].form8962Line24 = '1';
    expect(() => calculateFederalTax(input)).toThrow(/other|outside|credit/i);
  });
  it('rejects a changed final credit repayment or duplicated audit', async () => {
    const low = actualPaidRepaymentInput(); low.scheduleC!.grossReceipts = '50000';
    expect(() => calculateFederalTax(low)).toThrow(/credit|repayment|paid.*share/i);
    const input = actualPaidRepaymentInput(), result = calculateFederalTax(input);
    const proofPath = '../../src/engine/forms/marketplace-actual-paid-repayment.js';
    const { calculateMarketplaceActualPaidRepayment } = await import(/* @vite-ignore */ proofPath);
    result.form8962!.excessAPTCRepayment = d('11999');
    expect(() => calculateMarketplaceActualPaidRepayment(input, result)).toThrow(/repayment/i);
    result.form8962!.excessAPTCRepayment = d('12000');
    result.form8962!.lines.push(result.form8962!.lines.find(row => row.line === '24' && row.form === 'Form 8962')!);
    expect(() => calculateMarketplaceActualPaidRepayment(input, result)).toThrow(/audit|unique/i);
  });
});
