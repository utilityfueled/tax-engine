// Spec: spec/federal/guided-eic-home-sources.yaml.
import { expect, it } from 'vitest';
import { fictionalGuidedEmptyEicHistory } from '../fixtures/guided-eic-history';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateEicReviewCheckboxes } from '@/pdf/eic-review-checkboxes';
import { completeDependent, completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';

function sourceState() {
  const state = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['personal-info'] = { ...structuredClone(completePersonalInfo), dependentCount: '1',
    dependents: [{ ...completeDependent, qualifiesForEIC: true }],
    eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'Actual home records', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, spouseNonresidentAlienDuringYear: false,
      primaryQualifyingChildOfAnotherTaxpayer: false, spouseQualifyingChildOfAnotherTaxpayer: false,
      primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false },
      spouseChildless: { mainHomeInUnitedStatesMoreThanHalfYear: false, countedMilitaryDutyOutsideUnitedStates: false } } };
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }] };
  const sourcePersonal = required(state.sectionData['personal-info']);
  sourcePersonal.eicDisallowanceHistory = fictionalGuidedEmptyEicHistory(sourcePersonal, 'mfj', 2025);
  return state;
}
function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Missing synthetic source'); return value; }

it('preserves actual childful home facts without applying childless restrictions', () => {
  const state = sourceState(); const before = JSON.stringify(state);
  const input = TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state)));
  expect(input.eic?.claimantEligibility?.spouseChildless?.mainHomeInUnitedStatesMoreThanHalfYear).toBe(false);
  // The published $10,000–10,050 one-child table row is $3,409.
  expect(calculateFederalTax(input).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed()).toBe('3409');
  expect(calculateEicReviewCheckboxes(input)).toEqual({ doNotClaimEic: false, mainHomeInUnitedStatesMoreThanHalfYear: false });
  expect(JSON.stringify(state)).toBe(before);
  const personal = required(state.sectionData['personal-info']);
  const facts = required(personal.eicClaimantEligibility);
  const edited = updateSectionData(state, 'personal-info', { ...personal,
    eicClaimantEligibility: { ...facts, spouseChildless: { ...facts.spouseChildless, mainHomeInUnitedStatesMoreThanHalfYear: null } } });
  expect(edited.sectionData['personal-info']?.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();
  const updated = required(edited.sectionData['personal-info']);
  const confirmed = updateSectionData(edited, 'personal-info', { ...updated, eicClaimantEligibility: { ...updated.eicClaimantEligibility, sourceFactsConfirmed: true } });
  const unknown = TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(confirmed)));
  expect(unknown.eic?.claimantEligibility?.spouseChildless?.mainHomeInUnitedStatesMoreThanHalfYear).toBeUndefined();
  expect(calculateEicReviewCheckboxes(unknown).mainHomeInUnitedStatesMoreThanHalfYear).toBeUndefined();
  expect(calculateFederalTax(unknown).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed()).toBe('3409');
  const legacy = sourceState(); const legacyFacts = required(required(legacy.sectionData['personal-info']).eicClaimantEligibility);
  delete legacyFacts.primaryChildless; delete legacyFacts.spouseChildless;
  expect(buildTaxInputFromGuidedData(legacy)?.eic?.claimantEligibility?.primaryChildless).toBeUndefined();
});

it('requires actual counted military evidence with a qualifying child', () => {
  const state = sourceState();
  const facts = required(required(state.sectionData['personal-info']).eicClaimantEligibility);
  facts.primaryChildless = { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: true };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  facts.primaryChildless.militaryDutySourceReference = 'Actual indefinite active duty order';
  facts.primaryChildless.extendedActiveDutyOrderOver90DaysOrIndefinite = false;
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  facts.primaryChildless.extendedActiveDutyOrderOver90DaysOrIndefinite = true;
  expect(buildTaxInputFromGuidedData(state)?.eic?.claimantEligibility?.primaryChildless?.militaryDutySourceReference).toBe('Actual indefinite active duty order');
});
