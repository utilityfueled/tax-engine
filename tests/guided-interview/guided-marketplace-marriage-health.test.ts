// Spec: spec/federal/marketplace-marriage-health.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedMarketplaceMarriageHealthState } from '../fixtures/guided-marketplace-marriage-health';

it('composes actual marriage and health sources through the unmocked guide',()=>{
  const state=guidedMarketplaceMarriageHealthState(), before=structuredClone(state);
  expect(validateSection(state,'adjustments')).toMatchObject({status:'complete'});
  expect(validateSection(state,'credits')).toMatchObject({status:'complete'});
  const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result=calculateFederalTax(input);
  expect(input.form8962?.taxpayerModifiedAGI).toBeUndefined();
  expect(input.form7206?.plans?.[0].payments?.[0].personAmounts?.[0]).toMatchObject({amountPaid:'300',advancePremiumTaxCredit:'700'});
  expect([result.schedule1?.seHealthInsurance.toFixed(),result.agi.toFixed(),result.form8962?.ptcAllowed.toFixed()]).toEqual(['6338','86597','5149']);
  expect(state).toEqual(before);
});
it('rejects contradictory marriage health people at the guided boundary',()=>{
  const state=guidedMarketplaceMarriageHealthState(), ptc=state.sectionData.credits!.premiumTaxCredit!, original=ptc.policies[0];
  original.recipientName='Blair Example'; original.recipientSsn='444-55-6666';
  original.coveredIndividuals=[{name:'Blair Example',ssn:'444-55-6666',firstMonth:'1',lastMonth:'12'}];
  ptc.marriageSources!.policies[0].original=structuredClone(original);
  ptc.marriageSources!.benchmarks=ptc.marriageSources!.benchmarks.map(row=>({...row,owner:'spouse',coveredIndividualSsns:['444-55-6666']}));
  expect(healthInsuranceSourceErrors(state)).toHaveProperty('healthInsuranceMarketplace');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  const unknown=guidedMarketplaceMarriageHealthState();
  unknown.sectionData.adjustments!.healthInsuranceFacts!.plans[0].payments[0].personAmounts[0].advancePremiumTaxCredit='';
  expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
});
it('requires both actual source packets to be reconfirmed after edits',()=>{
  const state=guidedMarketplaceMarriageHealthState(), edited=structuredClone(state.sectionData.adjustments!);
  edited.healthInsuranceFacts!.plans[0].payments[0].sourceId='Corrected actual receipt reference';
  const changed=updateSectionData(state,'adjustments',edited), health=changed.sectionData.adjustments!.healthInsuranceFacts!, ptc=changed.sectionData.credits!.premiumTaxCredit!;
  expect(health.sourceFactsConfirmed).toBeNull(); expect(ptc.sourceFactsConfirmed).toBeNull();
  expect(ptc.marriageSources!.sourceFactsConfirmed).toBeNull();
  health.sourceFactsConfirmed=true;
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  for(const row of ptc.marriageSources!.benchmarks)row.sourceFactsConfirmed=true;
  ptc.marriageSources!.sourceFactsConfirmed=true;ptc.sourceFactsConfirmed=true;
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(changed))).form8962!.ptcAllowed.toFixed()).toBe('5149');
});
