// Spec: spec/federal/eic-claimant-eligibility.yaml. Synthetic actual source answers.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';

function required<T>(value: T | null | undefined): T { if (value == null) throw new Error("Missing synthetic source"); return value; }
function fixture() {
  const childless = { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false, qualifyingChildOfAnotherTaxpayer: false };
  const state = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['personal-info'] = {
    ...structuredClone(completePersonalInfo), dateOfBirth: '2002-02-01',
    spouse: { ...required(completePersonalInfo.spouse), dateOfBirth: '1998-02-01' },
    eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'Actual claimant records', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, spouseNonresidentAlienDuringYear: false, primaryChildless: { ...childless }, spouseChildless: { ...childless } },
  };
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }] };
  return state;
}
it('forwards actual claimant facts and invalidates edited confirmations', () => {
  const state = fixture(), before = JSON.stringify(state);
  expect(validateSection(state, 'personal-info').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.eic?.claimantEligibility?.primaryNonresidentAlienDuringYear).toBe(false);
  expect(input.eic?.claimantEligibility?.spouseNonresidentAlienDuringYear).toBe(false);
  expect(input.taxpayer.spouse?.employmentValidSsnIssuedByDueDate).toBe(true);
  const result = calculateFederalTax(input);
  expect(result.allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed()).toBe('649');
  expect(computeGuidedPreview(state)).not.toBeNull(); expect(JSON.stringify(state)).toBe(before);
  const personal = required(state.sectionData['personal-info']);
  const changed = updateSectionData(state, 'personal-info', { ...personal, spouse: { ...required(personal.spouse), dateOfBirth: '1960-01-01' } });
  expect(changed.sectionData['personal-info']?.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const reconfirmed = updateSectionData(changed, 'personal-info', { ...required(changed.sectionData['personal-info']), eicClaimantEligibility: { ...personal.eicClaimantEligibility, sourceFactsConfirmed: true } });
  expect(reconfirmed.sectionData['personal-info']?.eicClaimantEligibility?.sourceFactsConfirmed).toBe(true);
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reconfirmed))).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed()).toBe('0');
});
it('keeps actual claimant unknowns distinct from false and historical omissions', () => {
  const unknown = fixture(); required(required(unknown.sectionData['personal-info']).spouse).employmentValidSsnIssuedByDueDate = null;
  expect(buildTaxInputFromGuidedData(unknown)).toBeNull(); expect(computeGuidedPreview(unknown)).toBeNull();
  required(required(unknown.sectionData['personal-info']).spouse).employmentValidSsnIssuedByDueDate = false;
  const known = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(unknown));
  expect(known.taxpayer.spouse?.employmentValidSsnIssuedByDueDate).toBe(false);
  expect(calculateFederalTax(known).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed()).toBe('0');
  const legacy = fixture(); delete required(legacy.sectionData['personal-info']).eicClaimantEligibility;
  delete required(required(legacy.sectionData['personal-info']).spouse).employmentValidSsnIssuedByDueDate;
  expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(legacy)).eic).toBeUndefined();
  const wrongYear = fixture(); required(required(wrongYear.sectionData['personal-info']).eicClaimantEligibility).sourceTaxYear = '2026';
  expect(buildTaxInputFromGuidedData(wrongYear)).toBeNull();
});
