// Spec: spec/federal/guided-shared-marketplace-health.yaml.
import { expect, it } from 'vitest';
import { buildHealthInsuranceInput, healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedSharedMarketplaceHealthState } from '../fixtures/guided-shared-marketplace-health';

it('transfers actual shared health sources once without replacing originals', () => {
  const state = guidedSharedMarketplaceHealthState(), before = structuredClone(state);
  expect(healthInsuranceSourceErrors(state)).toEqual({});
  expect(validateSection(state,'adjustments').status).toBe('complete');
  expect(validateSection(state,'credits').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect([result.schedule1?.seHealthInsurance.toFixed(),result.agi.toFixed(),result.form8962?.ptcAllowed.toFixed(),result.form8962?.excessAPTCRepayment.toFixed()]).toEqual(['2340','44127','3480','120']);
  expect(input?.form7206?.plans?.[0]?.payments?.[0]).toMatchObject({grossPremium:'1000',ownerOrBusinessPaid:'200',otherPersonPaid:'200',advancePremiumTaxCredit:'600'});
  expect(input?.form7206?.plans?.[0]?.sharedMarketplaceSources?.persons?.[1]?.coveredIndividualSsn).toBe('444-55-6666');
  expect(state).toEqual(before);
});
it('retains unknown false and exact shared payment facts', () => {
  for (const value of [null,false]) {
    const state=guidedSharedMarketplaceHealthState(); state.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.sharedMarketplaceSources!.allThisReturnPersonsInCoverageFamilyConfirmed=value;
    expect(buildHealthInsuranceInput(state.sectionData.adjustments!.healthInsuranceFacts,'single',2025)?.plans?.[0]?.sharedMarketplaceSources?.allThisReturnPersonsInCoverageFamilyConfirmed).toBe(value ?? undefined);
    expect(healthInsuranceSourceErrors(state)).toHaveProperty('healthInsuranceMarketplace'); expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  for (const mutate of [
    (state:ReturnType<typeof guidedSharedMarketplaceHealthState>) => { state.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.sharedMarketplaceSources!.persons[0]!.coveredIndividualSsn='444-55-6666'; },
    (state:ReturnType<typeof guidedSharedMarketplaceHealthState>) => { state.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.sharedMarketplaceSources!.sourceTaxYear='2024'; },
    (state:ReturnType<typeof guidedSharedMarketplaceHealthState>) => { const p=state.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments[0]!; p.ownerOrBusinessPaid=p.personAmounts[0]!.amountPaid='201';p.otherPersonPaid='199'; },
  ]) { const state=guidedSharedMarketplaceHealthState();mutate(state);expect(healthInsuranceSourceErrors(state)).toHaveProperty('healthInsuranceMarketplace'); }
  const state=guidedSharedMarketplaceHealthState(), payment=state.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments[0]!;
  payment.grossPremium='9007199254741593.01';payment.ownerOrBusinessPaid=payment.personAmounts[0]!.amountPaid='9007199254740793.01';
  const normalized=buildHealthInsuranceInput(state.sectionData.adjustments!.healthInsuranceFacts,'single',2025)!;
  expect(normalized.plans?.[0]?.payments?.[0]?.grossPremium).toBe('9007199254741593.01');
  expect(normalized.plans?.[0]?.payments?.[0]?.personAmounts?.[1]?.amountPaid).toBe('0');
});
it('invalidates nested shared health confirmation after consumed source edits', () => {
  const original=guidedSharedMarketplaceHealthState();
  const variants=[
    updateSectionData(original,'personal-info',{...original.sectionData['personal-info']!,firstName:'Changed'}),
    updateSectionData(original,'credits',{...original.sectionData.credits!,premiumTaxCredit:{...original.sectionData.credits!.premiumTaxCredit!,sourceReference:'Replaced record'}}),
    updateSectionData(original,'adjustments',{...original.sectionData.adjustments!,healthInsuranceFacts:{...original.sectionData.adjustments!.healthInsuranceFacts!,sourceReference:'Replaced health record'}}),
  ];
  for(const changed of variants){
    const health=changed.sectionData.adjustments!.healthInsuranceFacts!;
    expect(health.sourceFactsConfirmed).toBeNull();expect(health.plans[0]!.sharedMarketplaceSources!.sourceFactsConfirmed).toBeNull();
    expect(health.plans[0]!.sharedMarketplaceSources!.persons).toEqual(original.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.sharedMarketplaceSources!.persons);
    const confirmed=updateSectionData(changed,'adjustments',{...changed.sectionData.adjustments!,healthInsuranceFacts:{...health,sourceFactsConfirmed:true}});
    expect(confirmed.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.sharedMarketplaceSources!.sourceFactsConfirmed).toBeNull();
  }
});
