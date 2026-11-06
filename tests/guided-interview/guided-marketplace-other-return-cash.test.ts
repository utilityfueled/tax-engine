// Spec: spec/federal/marketplace-other-return-cash.yaml, intake.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedMarketplaceOtherReturnCashState } from '../fixtures/guided-marketplace-other-return-cash';

it('retains actual other return cash sources and invalidates nested confirmations', () => {
  for (const [mode, deduction] of [['advance', '16800'], ['cash', '6600'], ['marriage', '6875']] as const) {
    const state = guidedMarketplaceOtherReturnCashState(mode), before = structuredClone(state);
    expect(healthInsuranceSourceErrors(state)).toEqual({});
    expect(validateSection(state, 'adjustments').status).toBe('complete');
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe(deduction);
    const source = input.form7206!.plans![0].coverageFamilySources!.outsidePersonReturns![0].cashPaymentSources!;
    expect(source).toMatchObject({ sourceTaxYear: 2025, sourceFactsConfirmed: true, allPremiumPaymentsIncludedConfirmed: true, allOtherReturnTaxPaymentsIncludedConfirmed: true });
    expect(source.premiumPayments![0]).toMatchObject({ cashPaidToInsurer: '100', reimbursements: [] });
    expect(source.otherReturnTaxPayments).toHaveLength(mode === 'advance' ? 1 : 0);
    const changed = structuredClone(state.sectionData.adjustments!);
    changed.healthInsuranceFacts!.plans[0].coverageFamilySources!.outsidePersonReturns![0].cashPaymentSources!.premiumPayments![0].sourceReference = 'Changed original insurer receipt';
    const revised = updateSectionData(state, 'adjustments', changed);
    const revisedHealth = revised.sectionData.adjustments!.healthInsuranceFacts!, family = revisedHealth.plans[0].coverageFamilySources!;
    expect([revisedHealth.sourceFactsConfirmed, family.sourceFactsConfirmed, family.outsidePersonReturns![0].cashPaymentSources!.sourceFactsConfirmed]).toEqual([null, null, null]);
    expect(validateSection(revised, 'adjustments').status).toBe('partial');
    for (const mutate of [(s: typeof state) => { s.sectionData.adjustments!.healthInsuranceFacts!.plans[0].coverageFamilySources!.outsidePersonReturns![0].cashPaymentSources!.premiumPayments![0].cashPaidToInsurer = ''; },
      (s: typeof state) => { s.sectionData.adjustments!.healthInsuranceFacts!.plans[0].coverageFamilySources!.outsidePersonReturns![0].cashPaymentSources!.otherReturnTaxPayments = undefined; }]) {
      const unknown = structuredClone(state); mutate(unknown); expect(healthInsuranceSourceErrors(unknown)).not.toEqual({});
    }
    expect(state).toEqual(before);
  }
});
