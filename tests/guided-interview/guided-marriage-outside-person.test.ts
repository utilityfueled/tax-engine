// Spec: spec/federal/marketplace-marriage-outside-person.yaml, intake.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedMarriageOutsidePersonState } from '../fixtures/guided-marriage-outside-person';

it('preserves actual outside child originals and relationship confirmation through the guide', () => {
  const state=guidedMarriageOutsidePersonState(), before=structuredClone(state);
  expect(validateSection(state,'adjustments').status).toBe('complete');
  const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result=calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance,result.form8962!.ptcAllowed,result.form8962!.excessAPTCRepayment].map(v=>v.toFixed())).toEqual(['6875','5192','808']);
  expect(input.form1095A[0].monthlyPremiums[0]).toMatchObject({enrolleePremium:'3000.03',slcsp:null,advancePremiumTaxCredit:'0'});
  expect(input.form7206!.plans![0].coveredPersons![1].childRelationshipSources).toMatchObject({sourceTaxYear:2025,sourceFactsConfirmed:true,relationshipStartDate:'1999-01-02'});
  const changed=structuredClone(state.sectionData.adjustments!);
  const relationship=(changed.healthInsuranceFacts!.plans[0].coveredPersons[1] as unknown as {childRelationshipSources:Record<string,unknown>}).childRelationshipSources;
  relationship.sourceReference='Another actual relationship record';
  const stale=updateSectionData(state,'adjustments',changed);
  expect((stale.sectionData.adjustments!.healthInsuranceFacts!.plans[0].coveredPersons[1] as unknown as {childRelationshipSources:Record<string,unknown>}).childRelationshipSources.sourceFactsConfirmed).toBeNull();
  expect(stale.sectionData.adjustments!.healthInsuranceFacts!.sourceFactsConfirmed).toBeNull();
  expect(stale.sectionData.credits!.premiumTaxCredit!.marriageSources!.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(stale)).toBeNull();
  for(const field of ['sourceTaxYear','accountHolder','ownerSsn','coveredIndividualSsn','childRelationship','relationshipStartDate']) {
    const unknown=structuredClone(state);
    (unknown.sectionData.adjustments!.healthInsuranceFacts!.plans[0].coveredPersons[1] as unknown as {childRelationshipSources:Record<string,unknown>}).childRelationshipSources[field]='';
    expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
  }
  expect(state).toEqual(before);
});
