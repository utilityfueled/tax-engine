// Spec: spec/federal/shared-marketplace-health-other-allocations.yaml.
import { expect,it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { updateSectionData,validateSection } from '@/lib/guided-interview-flow';
import { guidedSharedMarketplaceHealthState } from '../fixtures/guided-shared-marketplace-health';
import { guidedSharedHealthOtherAllocationRecords } from '../fixtures/guided-shared-health-other-allocation-records';

function stateFor(method:'default'|'no-advance') {
  const state=guidedSharedMarketplaceHealthState(),records=guidedSharedHealthOtherAllocationRecords(method);
  state.sectionData.adjustments!.healthInsuranceFacts=records.health;state.sectionData.credits!.premiumTaxCredit=records.coverage;return state;
}
it('preserves default and no-advance source methods through the actual guide',()=>{
  for(const method of ['default','no-advance'] as const) {
    const state=stateFor(method),before=structuredClone(state);
    expect(healthInsuranceSourceErrors(state)).toEqual({});
    expect(validateSection(state,'adjustments').status).toBe('complete');expect(validateSection(state,'credits').status).toBe('complete');
    const input=buildTaxInputFromGuidedData(state);expect(input).not.toBeNull();
    const result=calculateFederalTax(TaxYearInputSchema.parse(input));
    expect([result.schedule1!.seHealthInsurance.toFixed(),result.agi.toFixed(),result.form8962!.ptcAllowed.toFixed()]).toEqual(method==='default'?['2340','44127','3480']:['1080','45387','9264']);
    expect(input!.form7206!.plans![0].payments![0].grossPremium).toBe(method==='default'?'1000':'1500');expect(state).toEqual(before);
    const coverage=structuredClone(state.sectionData.credits!.premiumTaxCredit!);
    if(method==='default')coverage.sharedPolicyAllocations!.policies[0]!.defaultAllocation!.enrollingTaxpayerSsn='';
    else coverage.sharedPolicyAllocations!.policies[0]!.noAdvanceAllocation!.monthlyBenchmarks[0]!.otherReturnSlcsp='';
    const changed=updateSectionData(state,'credits',{...state.sectionData.credits!,premiumTaxCredit:coverage});
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.sharedMarketplaceSources!.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments).toEqual(before.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments);
    const missing=stateFor(method);missing.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments[0]!.advancePremiumTaxCredit='';
    expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  }
});
