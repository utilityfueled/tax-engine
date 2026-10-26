// Spec: spec/federal/eic-childless-sources.yaml. Synthetic actual sources.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { completeDependent, completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';

function required<T>(value: T | undefined | null): T { if (value == null) throw new Error('Missing synthetic source'); return value; }
const childless = { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false, qualifyingChildOfAnotherTaxpayer: false };
it('binds both childless claimant sources through the actual guide', () => {
  const state = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['personal-info'] = { ...structuredClone(completePersonalInfo),
    eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'Actual two-filer EIC source records', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, spouseNonresidentAlienDuringYear: false,
      primaryChildless: { ...childless }, spouseChildless: { ...childless } } };
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }] };
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.eic?.claimantEligibility?.spouseChildless?.countedMilitaryDutyOutsideUnitedStates).toBe(false);
  expect(calculateFederalTax(input).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed()).toBe('649');
  const personal = required(state.sectionData['personal-info']);
  const changed = updateSectionData(state, 'personal-info', { ...personal, eicClaimantEligibility: { ...personal.eicClaimantEligibility,
    spouseChildless: { ...childless, mainHomeInUnitedStatesMoreThanHalfYear: false } } });
  const changedPersonal = required(changed.sectionData['personal-info']);
  expect(changedPersonal.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const reconfirmed = updateSectionData(changed, 'personal-info', { ...changedPersonal,
    eicClaimantEligibility: { ...changedPersonal.eicClaimantEligibility, sourceFactsConfirmed: true } });
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reconfirmed))).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed()).toBe('0');
  const unknown = structuredClone(state); required(required(unknown.sectionData['personal-info']).eicClaimantEligibility).spouseChildless = { ...childless, mainHomeInUnitedStatesMoreThanHalfYear: null };
  expect(buildTaxInputFromGuidedData(unknown)).toBeNull(); expect(computeGuidedPreview(unknown)).toBeNull();
  const dependencyEdit = updateSectionData(state, 'personal-info', { ...personal,
    standardDeductionFacts: { ...personal.standardDeductionFacts, spouseCanBeClaimedAsDependent: true } });
  expect(dependencyEdit.sectionData['personal-info']?.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
});

it('preserves general claimant answers with an EIC qualifying child', () => {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['personal-info'] = { ...structuredClone(completePersonalInfo), dateOfBirth: '2007-01-15',
    dependentCount: '1', dependents: [{ ...completeDependent, dateOfBirth: '2023-01-15', qualifiesForEIC: true }],
    eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'Actual Rule10 records', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: true } };
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }] };
  const input = buildTaxInputFromGuidedData(state);
  expect(input).not.toBeNull();
  expect(input?.eic?.claimantEligibility?.primaryQualifyingChildOfAnotherTaxpayer).toBe(true);
  expect(calculateFederalTax(TaxYearInputSchema.parse(input)).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed()).toBe('0');
  const facts = required(required(state.sectionData['personal-info']).eicClaimantEligibility);
  facts.primaryQualifyingChildOfAnotherTaxpayer = false;
  expect(buildTaxInputFromGuidedData(state)?.eic?.claimantEligibility?.primaryQualifyingChildOfAnotherTaxpayer).toBe(false);
  // An actual earlier source spelling is retained, but clearing the new question
  // must remain unknown rather than restoring that old answer in the converter.
  facts.primaryChildless = { qualifyingChildOfAnotherTaxpayer: false };
  facts.primaryQualifyingChildOfAnotherTaxpayer = null;
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  facts.primaryQualifyingChildOfAnotherTaxpayer = true;
  expect(buildTaxInputFromGuidedData(state)).toBeNull(); // contradictory originals
  facts.primaryQualifyingChildOfAnotherTaxpayer = undefined;
  expect(buildTaxInputFromGuidedData(state)?.eic?.claimantEligibility?.primaryChildless?.qualifyingChildOfAnotherTaxpayer).toBe(false);
});
