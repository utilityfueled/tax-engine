// Spec: spec/federal/guided-coverage-family-health.yaml.
import { expect, it } from 'vitest';
import { captureCoverageFamilyHealthSources } from '@/lib/guided-coverage-family-health';
import { marketplacePolicyOptions } from '@/lib/guided-marketplace-health-facts';
import { buildHealthInsuranceInput, healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedCoverageFamilyHealthState } from '../fixtures/guided-coverage-family-health';

it('copies original family records without inferring membership or benchmarks', () => {
  const state = guidedCoverageFamilyHealthState(), health = state.sectionData.adjustments!.healthInsuranceFacts!, policies = state.sectionData.credits!.premiumTaxCredit!.policies;
  policies[0]!.monthlyPremiums[0]!.enrolleePremium = '9007199254740993.01';
  const before = structuredClone(policies);
  const captured = captureCoverageFamilyHealthSources(health.plans[0]!.marketplacePolicySourceIds!, marketplacePolicyOptions(policies));
  expect(captured.sourceTaxYear).toBe('2025'); expect(captured.sourceFactsConfirmed).toBeNull(); expect(captured.allPolicySourcesIncluded).toBeNull();
  expect(captured.policies[0]!.original).toEqual(policies[0]);
  expect(captured.persons).toEqual([{ personId: '', coveredIndividualSsn: '123-45-6789' }, { personId: '', coveredIndividualSsn: '987-65-4321' }]);
  expect(captured.months[0]).toMatchObject({ month: '1', coverageFamilySlcsp: '', nonCoverageFamilySlcsp: '', sourceReference: '', allCoveredPersonsIncludedConfirmed: null, personFacts: [] });
  expect(captured.months[0]!.coverageFamilyMemberSsns).toEqual([]); expect(policies).toEqual(before);
  expect(() => captureCoverageFamilyHealthSources(['form1095A:01'], marketplacePolicyOptions(policies))).toThrow(/original|source/i);
});
it('transfers ordinary and shared family sources without replacing enrollment premiums', () => {
  for (const shared of [undefined, 'agreement', 'no_advance'] as const) {
    const state = guidedCoverageFamilyHealthState(shared), before = structuredClone(state);
    expect(healthInsuranceSourceErrors(state)).toEqual({});
    expect(validateSection(state, 'adjustments').status).toBe('complete'); expect(validateSection(state, 'credits').status).toBe('complete');
    const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    // Shared PartIV uses monthly $19 contribution (12 x $981); ordinary annual line11 uses $232.
    expect([result.schedule1?.seHealthInsurance.toFixed(), result.agi.toFixed(), result.form8962?.ptcAllowed.toFixed()]).toEqual(['3000', '34174', shared ? '11772' : '11768']);
    expect(result.form8962?.advancePTCTotal.toFixed()).toBe(shared === 'no_advance' ? '0' : '6000');
    expect(input?.form1095A[0]?.monthlyPremiums[0]?.enrolleePremium).toBe(shared === 'agreement' ? '2500' : shared === 'no_advance' ? '1875' : '1250');
    expect(input?.form7206?.plans?.[0]?.coverageFamilySources?.months?.[0]?.nonCoverageFamilySlcsp).toBe('500');
    expect(state).toEqual(before);
  }
});
it('retains exact facts and invalidates family confirmation after consumed edits', () => {
  const state = guidedCoverageFamilyHealthState(), family = state.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.coverageFamilySources!;
  family.months[0]!.coverageFamilySlcsp = '1,000.00000000000000000001';
  expect(buildHealthInsuranceInput(state.sectionData.adjustments!.healthInsuranceFacts, 'mfj', 2025)?.plans?.[0]?.coverageFamilySources?.months?.[0]?.coverageFamilySlcsp).toBe('1000.00000000000000000001');
  const original = guidedCoverageFamilyHealthState();
  for (const edit of ['personal', 'policy', 'family']) {
    let changed = structuredClone(original);
    if (edit === 'personal') changed = updateSectionData(changed, 'personal-info', { ...changed.sectionData['personal-info']!, firstName: 'Different' });
    else if (edit === 'policy') changed = updateSectionData(changed, 'credits', { ...changed.sectionData.credits!, premiumTaxCredit: { ...changed.sectionData.credits!.premiumTaxCredit!, sourceReference: 'Changed record' } });
    else { const data = structuredClone(changed.sectionData.adjustments!); data.healthInsuranceFacts!.plans[0]!.coverageFamilySources!.sourceReference = 'Changed eligibility'; changed = updateSectionData(changed, 'adjustments', data); }
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.coverageFamilySources!.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments).toEqual(original.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.payments);
  }
  for (const value of [null, false]) {
    const next = guidedCoverageFamilyHealthState(); next.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.coverageFamilySources!.months[0]!.personFacts[0]!.otherMecEligible = value;
    expect(buildHealthInsuranceInput(next.sectionData.adjustments!.healthInsuranceFacts, 'mfj', 2025)?.plans?.[0]?.coverageFamilySources?.months?.[0]?.personFacts?.[0]?.otherMecEligible).toBe(value ?? undefined);
    if (value === null) expect(healthInsuranceSourceErrors(next)).toHaveProperty('healthInsuranceMarketplace');
    else expect(healthInsuranceSourceErrors(next)).toEqual({});
  }
});
