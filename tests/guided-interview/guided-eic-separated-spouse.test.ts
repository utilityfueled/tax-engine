// Spec: spec/federal/guided-eic-separated-spouse.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { copyEicSeparatedHousehold } from '@/lib/guided-eic-separated-spouse';
import { completeDependent, completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';

function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Missing synthetic source'); return value; }
function sourceState(validSsn = true) {
  const state = startCompleteInterview({ filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  const child = { ...completeDependent, qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false };
  const personal = { ...structuredClone(completePersonalInfo), dateOfBirth: '2003-02-15', dependentCount: '1', dependents: [child],
    eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'Actual claimant records', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
      primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: false, countedMilitaryDutyOutsideUnitedStates: false } },
    eicSeparatedSpouseSources: { sourceTaxYear: '2025', sourceReference: 'Actual separation records', sourceFactsConfirmed: true,
      taxpayer: { firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333', dateOfBirth: '2003-02-15' },
      applicableYearStart: '2025-01-01', applicableYearEnd: '2025-12-31', marriedAtYearEnd: true,
      principalHomesApartLastSixMonths: true, allCandidateChildrenIncluded: true,
      children: [{ sourceId: 'dependent:0', sourceReference: 'Actual child home records',
        original: { firstName: child.firstName, lastName: child.lastName, ssn: child.ssn, dateOfBirth: child.dateOfBirth, relationship: child.relationship, monthsLivedWithYou: child.monthsLivedWithYou },
        livedWithTaxpayerInUnitedStatesMoreThanHalfYear: true, specialResidencePeriodClaimed: false,
        marriedAtYearEnd: false, jointReturnFiled: false, validSsnIssuedByDueDate: validSsn,
        allOtherEligibleClaimantsIncluded: true, otherEligibleClaimants: [] }] } };
  state.sectionData['personal-info'] = personal;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }] };
  return state;
}
function credit(state: ReturnType<typeof sourceState>) {
  const input = TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state)));
  return calculateFederalTax(input).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed();
}
it('derives guided Rule3 eligibility and separate actual-child and SSN-counted routes', () => {
  const state = sourceState(); const before = JSON.stringify(state);
  expect(credit(state)).toBe('3409');
  expect(credit(sourceState(false))).toBe('649');
  const older = sourceState(false); const person = required(older.sectionData['personal-info']);
  person.dateOfBirth = '1950-02-15'; required(required(person.eicSeparatedSpouseSources).taxpayer).dateOfBirth = person.dateOfBirth;
  expect(credit(older)).toBe('649');
  const legal = sourceState(); const facts = required(required(legal.sectionData['personal-info']).eicSeparatedSpouseSources);
  facts.principalHomesApartLastSixMonths = null; facts.legallySeparatedUnderStateLaw = true; facts.differentHouseholdsAtYearEnd = true;
  facts.separationInstrument = { kind: 'written-separation-agreement', state: 'OH', effectiveDate: '2025-11-01', sourceReference: 'Actual qualifying state-law instrument' };
  expect(credit(legal)).toBe('3409');
  expect(JSON.stringify(state)).toBe(before);
});

it('rejects unknown or stale separation and child records without inventing source facts', () => {
  const state = sourceState(); const person = required(state.sectionData['personal-info']); const facts = required(person.eicSeparatedSpouseSources);
  facts.principalHomesApartLastSixMonths = null; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  facts.principalHomesApartLastSixMonths = false; facts.legallySeparatedUnderStateLaw = false;
  expect(credit(state)).toBe('0');
  facts.principalHomesApartLastSixMonths = true;
  required(required(facts.children)[0]).otherEligibleClaimants = undefined; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  required(required(facts.children)[0]).otherEligibleClaimants = [];
  facts.sourceTaxYear = '2024'; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  facts.sourceTaxYear = '2025'; person.middleName = 'Quinn'; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  required(facts.taxpayer).firstName = 'Jordan Q'; expect(credit(state)).toBe('3409');
  required(required(facts.children)[0]).validSsnIssuedByDueDate = null; expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it('preserves a confirmed actual blank child identifier only in the EIC self-only route', () => {
  const state = sourceState(false); const person = required(state.sectionData['personal-info']);
  const child = required(required(person.dependents)[0]); const facts = required(person.eicSeparatedSpouseSources);
  const row = required(required(facts.children)[0]); child.ssn = ''; required(row.original).ssn = '';
  expect(credit(state)).toBe('649');
  expect(buildTaxInputFromGuidedData(state)?.taxpayer.dependents?.[0]?.ssn).toBe('');
  row.validSsnIssuedByDueDate = null; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  row.validSsnIssuedByDueDate = false; facts.sourceFactsConfirmed = null; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  facts.sourceFactsConfirmed = true; child.qualifiesForODC = true; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  child.qualifiesForODC = false; child.qualifiesForCTC = true; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  child.qualifiesForCTC = false; child.firstName = 'Replaced'; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  person.eicSeparatedSpouseSources = undefined; expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it('copies only actual household source fields and revokes nested confirmations', () => {
  const state = sourceState(); const person = required(state.sectionData['personal-info']); const before = JSON.stringify(person);
  const copied = copyEicSeparatedHousehold(person, {});
  expect(copied).toEqual({ taxpayer: { firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333', dateOfBirth: '2003-02-15' },
    sourceFactsConfirmed: null, allCandidateChildrenIncluded: null, children: [{ sourceId: 'dependent:0', original: {
      firstName: 'Alex', lastName: 'Example', ssn: '333-44-5555', dateOfBirth: '2015-06-01', relationship: 'child', monthsLivedWithYou: '12' } }] });
  expect(JSON.stringify(person)).toBe(before);
  const facts = required(person.eicSeparatedSpouseSources); const rows = required(facts.children);
  const edited = updateSectionData(state, 'personal-info', { ...person, eicSeparatedSpouseSources: { ...facts,
    children: rows.map(row => ({ ...row, otherEligibleClaimants: [{ name: 'Other parent', sourceReference: 'Actual no-claim source', claimsAnyChildTaxBenefit: false }] })) } });
  expect(edited.sectionData['personal-info']?.eicSeparatedSpouseSources?.sourceFactsConfirmed).toBeNull();
  expect(edited.sectionData['personal-info']?.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();
  const current = required(edited.sectionData['personal-info']);
  const confirmed = updateSectionData(edited, 'personal-info', { ...current,
    eicClaimantEligibility: { ...current.eicClaimantEligibility, sourceFactsConfirmed: true },
    eicSeparatedSpouseSources: { ...current.eicSeparatedSpouseSources, sourceFactsConfirmed: true } });
  expect(credit(confirmed)).toBe('3409');
  const absent = sourceState(); required(absent.sectionData['personal-info']).eicSeparatedSpouseSources = undefined;
  expect(buildTaxInputFromGuidedData(absent)?.eic?.separatedSpouseSources).toBeUndefined();
  expect(credit(absent)).toBe('0');
});
