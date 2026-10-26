import { expect, it } from 'vitest';
import { copyForm8862Household, updateForm8862Sources } from '@/lib/guided-form-8862';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actual, guidedForm8862 } from '../fixtures/guided-form-8862';
// Spec: spec/federal/guided-form-8862.yaml. All source records are fictional.
function credit(state: ReturnType<typeof guidedForm8862>) { return calculateFederalTax(TaxYearInputSchema.parse(actual(buildTaxInputFromGuidedData(state)))).earnedIncomeCredit.toFixed(); }
it('copies current originals without inventing form answers or child history', () => {
  const state = guidedForm8862(true), personal = actual(state.sectionData['personal-info']), before = structuredClone(personal);
  const copy = copyForm8862Household(personal, 'mfj', {});
  expect(copy.sourceTaxYear).toBeUndefined(); expect(copy.sourceFactsConfirmed).toBeNull(); expect(copy.filers).toHaveLength(2);
  expect(copy.filers?.[1]?.homeDays).toBeUndefined(); expect(copy.allCandidateChildrenIncluded).toBeNull(); expect(copy.children).toEqual([]);
  expect(personal).toEqual(before);
  actual(personal.spouse).ssn = '900-88-7777'; const replaced = copyForm8862Household(personal, 'mfj', actual(personal.eicRecertificationSources));
  expect(replaced.filers?.[1]?.homeDays).toBeUndefined(); expect(replaced.filers?.[1]?.originalTaxpayer?.ssn).toBe('900-88-7777');
  personal.dependentCount = ''; expect(copyForm8862Household(personal, 'mfj', {}).children).toBeUndefined();
});
it('forwards current recertification and actual self-only child sources through the full bridge', () => {
  const state = guidedForm8862(); expect(credit(state)).toBe('649'); const personal = actual(state.sectionData['personal-info']);
  expect(actual(buildTaxInputFromGuidedData(state)).eic?.recertificationSources?.filers?.[0]?.homeDays?.actualUnitedStatesDays).toBe(365);
  personal.dateOfBirth = '2003-02-01'; personal.dependentCount = '1';
  personal.dependents = [{ firstName: 'Alex', lastName: 'Example', ssn: '', dateOfBirth: '2015-06-01', relationship: 'child', monthsLivedWithYou: '12', qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false }];
  const copied = copyForm8862Household(personal, 'single', actual(personal.eicRecertificationSources));
  // A changed original date of birth cannot inherit the previous person's evidence.
  actual(copied.filers?.[0]).sourceReference = 'Fictional corrected original claimant record';
  copied.sourceFactsConfirmed = true; copied.allCandidateChildrenIncluded = true;
  const child = actual(copied.children?.[0]); Object.assign(child, { sourceReference: 'Fictional original child records',
    livedWithTaxpayerInUnitedStatesMoreThanHalfYear: true, specialResidencePeriodClaimed: false, marriedAtYearEnd: false, jointReturnFiled: false,
    validSsnIssuedByDueDate: false, allOtherEligibleClaimantsIncluded: true, otherEligibleClaimants: [], deathDate: null,
    homeDays: { sourceReference: 'Fictional child residence', actualUnitedStatesDays: '365', militaryOutsideUnitedStatesDays: '0', temporaryAbsences: [], allDaysIncludedAndDistinctConfirmed: true } });
  personal.eicRecertificationSources = copied;
  expect(credit(state)).toBe('649');
  const built = TaxYearInputSchema.parse(actual(buildTaxInputFromGuidedData(state)));
  expect(calculateFederalTax(built).scheduleEIC?.form8862?.qualifyingChildPresent).toBe(true);
  actual(personal.eicDisallowanceHistory?.filers?.[0]?.denials?.[0]).reason = 'qualifying_child_only';
  expect(credit(state)).toBe('649');
});
it('preserves unknown zero and stale originals through the confirmation cycle', () => {
  const state = guidedForm8862(true), personal = actual(state.sectionData['personal-info']), data = actual(personal.eicRecertificationSources);
  const first = actual(data.filers?.[0]), days = actual(first.homeDays); const before = structuredClone(state);
  days.actualUnitedStatesDays = ''; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  days.actualUnitedStatesDays = '0'; actual(personal.eicClaimantEligibility?.primaryChildless).mainHomeInUnitedStatesMoreThanHalfYear = false;
  expect(credit(state)).toBe('0');
  const changed = updateSectionData(before, 'personal-info', { ...actual(before.sectionData['personal-info']), eicRecertificationSources: updateForm8862Sources(actual(before.sectionData['personal-info']?.eicRecertificationSources), { sourceReference: 'Fictional changed actual current evidence' }) });
  const next = actual(changed.sectionData['personal-info']); expect(next.eicRecertificationSources?.sourceFactsConfirmed).toBeNull();
  expect(next.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull(); expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const checked = updateSectionData(changed, 'personal-info', { ...next,
    eicRecertificationSources: { ...next.eicRecertificationSources, sourceFactsConfirmed: true },
    eicClaimantEligibility: { ...next.eicClaimantEligibility, sourceFactsConfirmed: true },
    eicDisallowanceHistory: { ...next.eicDisallowanceHistory, sourceFactsConfirmed: true, filers: next.eicDisallowanceHistory?.filers?.map(row => ({ ...row, sourceFactsConfirmed: true })) } });
  expect(credit(checked)).toBe('649');
  const edited = updateSectionData(checked, 'personal-info', { ...actual(checked.sectionData['personal-info']), lastName: 'Replacement' });
  expect(edited.sectionData['personal-info']?.eicRecertificationSources?.sourceFactsConfirmed).toBeNull();
  actual(edited.sectionData['personal-info']?.eicRecertificationSources).sourceFactsConfirmed = true; expect(buildTaxInputFromGuidedData(edited)).toBeNull();
});
