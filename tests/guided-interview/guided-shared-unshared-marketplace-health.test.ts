// Spec: spec/federal/shared-unshared-marketplace-health.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { guidedSharedMarketplaceHealthState } from '../fixtures/guided-shared-marketplace-health';
import { guidedSharedUnsharedHealthRecords } from '../fixtures/guided-shared-unshared-health-records';

it('transfers both original policy kinds through the saved health guide', () => {
  for (const method of ['agreement', 'no-advance'] as const) {
    const state = guidedSharedMarketplaceHealthState(), records = guidedSharedUnsharedHealthRecords(method);
    state.sectionData.adjustments!.healthInsuranceFacts = records.health; state.sectionData.credits!.premiumTaxCredit = records.coverage;
    const before = structuredClone(state);
    expect(healthInsuranceSourceErrors(state)).toEqual({});
    expect(validateSection(state, 'adjustments').status).toBe('complete'); expect(validateSection(state, 'credits').status).toBe('complete');
    const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect([result.schedule1!.seHealthInsurance.toFixed(), result.agi.toFixed(), result.form8962!.ptcAllowed.toFixed()]).toEqual(method === 'agreement' ? ['2052', '44415', '5844'] : ['3192', '43275', '9624']);
    expect(input!.form1095A[1].monthlyPremiums[0].enrolleePremium).toBe('200');
    expect(input!.form7206!.plans![0].payments![0].grossPremium).toBe(method === 'agreement' ? '1200' : '1700');
    expect(input!.form8962!.sharedPolicyAllocations!.policies![1].monthlyAllocations).toEqual([]); expect(state).toEqual(before);
    const coverage = structuredClone(records.coverage); coverage.sharedPolicyAllocations!.policies[1]!.allCoveredPeopleInThisTaxFamilyConfirmed = null;
    const changed = updateSectionData(state, 'credits', { ...state.sectionData.credits!, premiumTaxCredit: coverage });
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.sharedMarketplaceSources!.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments).toEqual(before.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments);
    const blank = structuredClone(state); blank.sectionData.credits!.premiumTaxCredit!.policies[1]!.monthlyPremiums[0]!.advancePremiumTaxCredit = '';
    expect(buildTaxInputFromGuidedData(blank)).toBeNull();
  }
});
