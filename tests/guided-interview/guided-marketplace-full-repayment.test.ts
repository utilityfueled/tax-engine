// Spec: spec/federal/marketplace-full-advance-repayment.yaml, intake.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedMarketplaceFullRepaymentState } from '../fixtures/guided-marketplace-full-repayment';

it('preserves actual full-repayment sources without an entered credit or repayment', () => {
  for (const shared of [false, true]) {
    const state = guidedMarketplaceFullRepaymentState(shared), before = structuredClone(state);
    expect(healthInsuranceSourceErrors(state)).toEqual({});
    expect(validateSection(state, 'adjustments').status).toBe('complete');
    const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect([result.schedule1!.seHealthInsurance.toFixed(), result.form8962!.ptcAllowed.toFixed(), result.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['18000', '0', '12000']);
    expect(input?.form7206?.plans?.[0]?.payments?.[0]?.personAmounts?.[1]?.advancePremiumTaxCredit).toBe('400');
    expect(input?.form1095A[0]?.monthlyPremiums[0]?.enrolleePremium).toBe(shared ? '3000' : '1500');
    expect(state).toEqual(before);
    const data = structuredClone(state.sectionData.adjustments!);
    data.healthInsuranceFacts!.plans[0]!.coverageFamilySources!.sourceReference = 'Revised actual employer evidence';
    const changed = updateSectionData(state, 'adjustments', data);
    expect(changed.sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData.adjustments?.healthInsuranceFacts?.plans[0]?.coverageFamilySources?.sourceFactsConfirmed).toBeNull();
    expect(validateSection(changed, 'adjustments').status).toBe('partial');
    const unknown = structuredClone(state); unknown.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments[0]!.personAmounts[1]!.advancePremiumTaxCredit = '';
    expect(healthInsuranceSourceErrors(unknown)).not.toEqual({});
    const credit = structuredClone(state); credit.sectionData['income-self-employment']!.manualGrossReceipts = '100000';
    expect(healthInsuranceSourceErrors(credit)).toEqual({});
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(credit)))).toThrow(/full.*repay|noncoverage.*advance/i);
  }
});
