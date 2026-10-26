// Spec: spec/federal/marketplace-actual-cash-health.yaml, intake.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedMarketplaceActualCashState } from '../fixtures/guided-marketplace-actual-cash';

it('reaches actual cash independently of PartIV and retains unknowns and confirmation', () => {
  for (const shared of [false, true]) {
    const state = guidedMarketplaceActualCashState(shared), before = structuredClone(state);
    expect(healthInsuranceSourceErrors(state)).toEqual({});
    expect(validateSection(state, 'adjustments').status).toBe('complete');
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
    expect(input.form1095A[0].monthlyPremiums[0].enrolleePremium).toBe(shared ? '1875' : '1250');
    expect(input.form7206!.plans![0].payments![0].ownerOrBusinessPaid).toBe('450');
    expect(input.form7206!.plans![0].payments![0].otherPersonPaid).toBe(shared ? '1425' : '800');
    expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('5400');
    expect(result.marketplaceActualCashHealth!.months[0].actualSpecifiedCash.toFixed()).toBe('300');
    expect(state).toEqual(before);
    const source = structuredClone(state.sectionData.adjustments!);
    source.healthInsuranceFacts!.plans[0]!.payments[0]!.sourceId = 'Revised actual receipt';
    const changed = updateSectionData(state, 'adjustments', source);
    expect(changed.sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBeNull();
    expect(validateSection(changed, 'adjustments').status).toBe('partial');
    const unknown = structuredClone(state);
    unknown.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments[0]!.personAmounts[0]!.amountPaid = '';
    expect(healthInsuranceSourceErrors(unknown)).not.toEqual({});
    const credit = structuredClone(state); credit.sectionData['income-self-employment']!.manualGrossReceipts = '50000';
    // Source completeness alone is not proof of a zero final credit.
    expect(healthInsuranceSourceErrors(credit)).toEqual({});
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(credit)))).toThrow(/zero.*final.*credit|actual cash.*credit/i);
  }
});
