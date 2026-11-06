// Spec: spec/federal/marketplace-reported-repayment-payment.yaml, intake.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedMarketplaceReportedRepaymentState } from '../fixtures/guided-marketplace-reported-repayment';

it('preserves source cents through actual guided payment records', () => {
  for (const shared of [false, true]) {
    const state = guidedMarketplaceReportedRepaymentState(shared), before = structuredClone(state);
    expect(healthInsuranceSourceErrors(state)).toEqual({});
    expect(validateSection(state, 'adjustments').status).toBe('complete');
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
    expect(input.form1095A[0].monthlyPremiums[0].advancePremiumTaxCredit).toBe(shared ? '2000.98' : '1000.49');
    expect(input.form7206!.plans![0].payments![0].personAmounts![0].amountPaid).toBe('399.51');
    expect(result.marketplaceReportedRepaymentHealth!.actualCash.toFixed()).toBe('5994.12');
    expect(result.marketplaceReportedRepaymentHealth!.unreportedAdvanceRemainder.toFixed()).toBe(shared ? '5.88' : '0');
    expect(result.marketplaceReportedRepaymentHealth!.reportingExcess.toFixed()).toBe(shared ? '0' : '0.12');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe(shared ? '17994' : '18000');
    expect(state).toEqual(before);
    const data = structuredClone(state.sectionData.adjustments!);
    data.healthInsuranceFacts!.plans[0]!.payments[0]!.sourceId = 'Revised original receipt';
    const changed = updateSectionData(state, 'adjustments', data);
    expect(changed.sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBeNull();
    expect(validateSection(changed, 'adjustments').status).toBe('partial');
    const unknown = structuredClone(state);
    unknown.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments[0]!.personAmounts[1]!.advancePremiumTaxCredit = '';
    expect(healthInsuranceSourceErrors(unknown)).not.toEqual({});
    const positive = structuredClone(state); positive.sectionData['income-self-employment']!.manualGrossReceipts = '100000';
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(positive)))).toThrow(/zero credit|repay/i);
  }
});
