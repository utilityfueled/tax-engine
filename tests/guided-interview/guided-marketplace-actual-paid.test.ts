// Spec: spec/federal/marketplace-actual-paid-repayment.yaml, intake.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedMarketplaceActualPaidState } from '../fixtures/guided-marketplace-actual-paid';

it('retains actual payments separately from allocation and final repayment proof', () => {
  for (const marriage of [false, true]) {
    const state = guidedMarketplaceActualPaidState(true, false, marriage), before = structuredClone(state);
    expect(healthInsuranceSourceErrors(state)).toEqual({});
    expect(validateSection(state, 'adjustments').status).toBe('complete');
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
    expect(input.form1095A[0].monthlyPremiums[0].advancePremiumTaxCredit).toBe(marriage ? '1400' : '2000');
    expect(input.form7206!.plans![0].payments![0].ownerOrBusinessPaid).toBe(marriage ? '200' : '300');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe(marriage ? '10800' : '15600');
    expect(result.marketplaceActualPaidRepaymentHealth!.finalRepayment.toFixed()).toBe(marriage ? '7000' : '12000');
    expect(state).toEqual(before);
    const source = structuredClone(state.sectionData.adjustments!);
    source.healthInsuranceFacts!.plans[0]!.payments[0]!.sourceId = 'Revised actual payer receipt';
    const changed = updateSectionData(state, 'adjustments', source);
    expect(changed.sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBeNull();
    expect(validateSection(changed, 'adjustments').status).toBe('partial');
    const unknown = structuredClone(state); unknown.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments[0]!.personAmounts[0]!.advancePremiumTaxCredit = '';
    expect(healthInsuranceSourceErrors(unknown)).not.toEqual({});
    const low = structuredClone(state); low.sectionData['income-self-employment']!.manualGrossReceipts = '50000';
    expect(healthInsuranceSourceErrors(low)).toEqual({});
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(low)))).toThrow(/credit|repayment/i);
  }
});
