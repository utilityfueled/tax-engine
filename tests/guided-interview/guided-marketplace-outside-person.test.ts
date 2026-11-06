// Spec: spec/federal/marketplace-outside-person-health.yaml, intake.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedMarketplaceOutsidePersonState } from '../fixtures/guided-marketplace-outside-person';

it('reaches actual outside child sources without overriding the family calculation', () => {
  for (const cash of [false, true]) {
    const state = guidedMarketplaceOutsidePersonState(cash), before = structuredClone(state);
    expect(healthInsuranceSourceErrors(state)).toEqual({});
    expect(validateSection(state, 'adjustments').status).toBe('complete');
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
    expect(result.schedule1!.seHealthInsurance.toFixed()).toBe(cash ? '6600' : '4200');
    expect(input.form7206!.persons!.find(row => row.personId === 'outside')!.attainedAgeAtYearEnd).toBe(26);
    expect(input.form1095A[0].monthlyPremiums[0].enrolleePremium).toBe('1875');
    expect(input.form7206!.plans![0].payments![0].personAmounts!.find(row => row.personId === 'outside')!.amountPaid).toBe('100');
    expect(input.form7206!.plans![0].coverageFamilySources!.outsidePersonReturns![0]).toMatchObject({
      returnStatus: 'completed', sourceTaxYear: 2025, form8962Line24: '0', policySourceIds: ['form1095A:0'],
    });
    const otherUnknown = structuredClone(state);
    otherUnknown.sectionData.adjustments!.healthInsuranceFacts!.plans[0].coverageFamilySources!.outsidePersonReturns![0].form8962Line24 = '';
    expect(healthInsuranceSourceErrors(otherUnknown)).not.toEqual({});
    const otherChanged = structuredClone(state.sectionData.adjustments!);
    otherChanged.healthInsuranceFacts!.plans[0].coverageFamilySources!.outsidePersonReturns![0].sourceReference = 'Different original completed return';
    const stale = updateSectionData(state, 'adjustments', otherChanged);
    expect(stale.sectionData.adjustments!.healthInsuranceFacts!.sourceFactsConfirmed).toBeNull();
    expect(stale.sectionData.adjustments!.healthInsuranceFacts!.plans[0].coverageFamilySources!.sourceFactsConfirmed).toBeNull();
    expect(state).toEqual(before);
    const changed = structuredClone(state.sectionData.adjustments!);
    changed.healthInsuranceFacts!.persons.find(row => row.personId === 'outside')!.attainedAgeAtYearEnd = '27';
    const revised = updateSectionData(state, 'adjustments', changed);
    expect(revised.sectionData.adjustments!.healthInsuranceFacts!.sourceFactsConfirmed).toBeNull();
    expect(validateSection(revised, 'adjustments').status).toBe('partial');
    const unknown = structuredClone(state);
    unknown.sectionData.adjustments!.healthInsuranceFacts!.persons.find(row => row.personId === 'outside')!.attainedAgeAtYearEnd = '';
    expect(healthInsuranceSourceErrors(unknown)).not.toEqual({});
  }
});
