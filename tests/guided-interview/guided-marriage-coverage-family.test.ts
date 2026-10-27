// Spec: spec/federal/marketplace-marriage-coverage-family.yaml.
import { expect,it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData,validateSection } from '@/lib/guided-interview-flow';
import { copyMarriageBenchmarkGroups } from '@/lib/guided-marriage-policy';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedMarriageCoverageFamilyState } from '../fixtures/guided-marriage-coverage-family';

it('forwards complete actual monthly coverage through marriage health and invalidates edits',()=>{
 for(const shared of [false,true]){
  const state=guidedMarriageCoverageFamilyState(shared),before=structuredClone(state);
  expect(validateSection(state,'adjustments')).toMatchObject({status:'complete'});
  const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)),result=calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance,result.agi,result.form8962!.ptcAllowed].map(value=>value.toFixed())).toEqual(['7855','85080','3853']);
  expect(input.form7206!.plans![0].coverageFamilySources!.months![0].personFacts![0].fullCoverageMonthConfirmed).toBe(false);
  const edited=structuredClone(state.sectionData.adjustments!);edited.healthInsuranceFacts!.plans[0].coverageFamilySources!.months[0].sourceReference='Corrected actual monthly source';
  const changed=updateSectionData(state,'adjustments',edited),health=changed.sectionData.adjustments!.healthInsuranceFacts!,ptc=changed.sectionData.credits!.premiumTaxCredit!;
  expect(health.sourceFactsConfirmed).toBeNull();expect(health.plans[0].coverageFamilySources!.sourceFactsConfirmed).toBeNull();expect(ptc.marriageSources!.sourceFactsConfirmed).toBeNull();
  health.sourceFactsConfirmed=true;ptc.sourceFactsConfirmed=true;expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  health.plans[0].coverageFamilySources!.sourceFactsConfirmed=true;if(health.plans[0].sharedMarketplaceSources)health.plans[0].sharedMarketplaceSources!.sourceFactsConfirmed=true;
  if(ptc.sharedPolicyAllocations)ptc.sharedPolicyAllocations.sourceFactsConfirmed=true;
  for(const row of ptc.marriageSources!.benchmarks)row.sourceFactsConfirmed=true;ptc.marriageSources!.sourceFactsConfirmed=true;
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(changed))).form8962!.ptcAllowed.toFixed()).toBe('3853');
  expect(state).toEqual(before);
 }
});
it('copies monthly eligible marriage groups without inventing amounts or eligibility',()=>{
 for(const shared of [false,true]){
  const state=guidedMarriageCoverageFamilyState(shared),ptc=state.sectionData.credits!.premiumTaxCredit!,health=state.sectionData.adjustments!.healthInsuranceFacts!,before=structuredClone(state);
  const copied=copyMarriageBenchmarkGroups(ptc,state.sectionData['personal-info'],'mfj',health);
  expect(copied.map(row=>row.month)).toEqual(['2','3','4','5','6','7']);
  expect(copied[0].coveredIndividualSsns).toEqual([]);expect(copied[1].coveredIndividualSsns).toEqual(['111-22-3333']);
  expect(copied.every(row=>row.slcsp===''&&row.sourceReference===''&&row.sourceFactsConfirmed===null)).toBe(true);
  expect(state).toEqual(before);
  for(const edit of [
   (x:typeof health)=>{x.plans[0].coverageFamilySources=undefined;},
   (x:typeof health)=>{x.plans[0].coverageFamilySources!.months[0].personFacts[0].otherMecEligible=null;},
   (x:typeof health)=>{x.plans[0].coverageFamilySources!.months.push(structuredClone(x.plans[0].coverageFamilySources!.months[0]));},
   (x:typeof health)=>{x.plans[0].coverageFamilySources!.policies[0].original.policyNumber='Changed original';},
   (x:typeof health)=>{x.plans[0].coverageFamilySources!.persons.push(structuredClone(x.plans[0].coverageFamilySources!.persons[0]));},
  ]){const bad=structuredClone(health);edit(bad);expect(()=>copyMarriageBenchmarkGroups(ptc,state.sectionData['personal-info'],'mfj',bad)).toThrow();}
 }
});
