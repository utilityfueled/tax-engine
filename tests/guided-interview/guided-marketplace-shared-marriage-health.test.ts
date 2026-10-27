// Spec: spec/federal/marketplace-shared-marriage-health.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { copyMarriageBenchmarkGroups } from '@/lib/guided-marriage-policy';
import { captureSharedPolicySources } from '@/lib/guided-shared-policy';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedSharedMarriageHealthState } from '../fixtures/guided-marketplace-shared-marriage-health';

it('preserves all original shared marriage sources through the guide', () => {
  const state = guidedSharedMarriageHealthState(), before = structuredClone(state);
  expect(validateSection(state, 'adjustments')).toMatchObject({status:'complete'});
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
  expect(input.form1095A[0].monthlyPremiums[0]).toMatchObject({enrolleePremium:'2000',slcsp:'1600',advancePremiumTaxCredit:'1400'});
  expect(input.form7206!.plans![0].payments![0]).toMatchObject({ownerOrBusinessPaid:'300',otherPersonPaid:'300'});
  expect([result.schedule1!.seHealthInsurance, result.form8962!.ptcAllowed].map(value => value.toFixed())).toEqual(['6338','5149']);
  const edited = structuredClone(state.sectionData.credits!);
  edited.premiumTaxCredit!.sharedPolicyAllocations!.policies[0].otherTaxpayerRelationshipSourceReference = '';
  const changed = updateSectionData(state, 'credits', edited);
  expect(changed.sectionData.credits!.premiumTaxCredit!.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.adjustments!.healthInsuranceFacts!.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  expect(state).toEqual(before);
});
it('copies own alternative groups from actual shared-family assignments', () => {
  const state = guidedSharedMarriageHealthState(true), coverage = state.sectionData.credits!.premiumTaxCredit!, before = structuredClone(state);
  const rows = copyMarriageBenchmarkGroups(coverage, state.sectionData['personal-info'], 'mfj');
  expect(rows).toHaveLength(7);
  expect(rows.every(row => row.owner === 'primary' && row.slcsp === '' && row.sourceFactsConfirmed === null && row.coveredIndividualSsns.join() === '111-22-3333')).toBe(true);
  const copied = captureSharedPolicySources(coverage, state.sectionData['personal-info'], 'mfj').policies[0];
  expect(copied.otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed).toBeNull();
  expect(copied.otherTaxpayerRelationshipSourceReference).toBe('');
  expect(copied.noCurrentYearMarriageOrDivorceConfirmed).toBeNull();
  expect(state).toEqual(before);
});
