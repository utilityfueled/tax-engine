import type { Form8862Input } from '@/engine/forms/form-8862.js';
import type { Form8862Sources } from '@/models/form-8862-sources.js';
import { simpleW2Fixture } from './simple-w2.js';
import { fictionalEmptyEicHistory } from './eic-disallowance.js';
// Spec: spec/federal/form-8862-eic.yaml. All identities and records are fictional.
export function known<T>(value: T | undefined): T { if (value === undefined) throw new Error('Incomplete fictional fixture'); return value; }
export function home(days = 365) {
  return { sourceReference: 'Fictional actual residence ledger', actualUnitedStatesDays: days,
    temporaryAbsences: [], militaryOutsideUnitedStatesDays: 0,
    allDaysIncludedAndDistinctConfirmed: true };
}
export function source(joint = false): Form8862Input {
  const input = structuredClone(simpleW2Fixture);
  input.taxpayer.primary = { ...input.taxpayer.primary, dateOfBirth: '1985-01-02',
    employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true };
  if (joint) { input.taxpayer.filingStatus = 'married_filing_jointly'; input.taxpayer.spouse = { ...input.taxpayer.primary, firstName: 'Jordan', ssn: '900-23-4567' }; }
  const childless = { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false };
  const history = fictionalEmptyEicHistory(input.taxpayer);
  known(known(history.filers)[0]).denials = [{ sourceId: 'denial', sourceReference: 'Fictional IRS assessment', taxYear: 2024,
    originalReturnFiledDate: '2025-03-15', noticeDate: '2025-09-01', assessmentDate: '2025-12-01',
    finalDeterminationDate: null, procedure: 'deficiency', reason: 'other', conduct: 'none', appealPending: false }];
  const owners = [{ owner: 'primary' as const, original: input.taxpayer.primary },
    ...(joint && input.taxpayer.spouse ? [{ owner: 'spouse' as const, original: input.taxpayer.spouse }] : [])];
  return { taxpayer: input.taxpayer, standardDeductionFacts: { ...input.standardDeductionFacts,
    primaryDeathDate: null, primaryCanBeClaimedAsDependent: false,
    ...(joint ? { spouseDeathDate: null, spouseCanBeClaimedAsDependent: false } : {}) },
    eic: { disallowanceSources: history, claimantEligibility: { sourceTaxYear: 2025, sourceReference: 'Fictional claimant sources',
      sourceFactsConfirmed: true, primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
      primaryChildless: childless, ...(joint ? { spouseNonresidentAlienDuringYear: false, spouseQualifyingChildOfAnotherTaxpayer: false,
        spouseChildless: { ...childless } } : {}) } },
    sources: { sourceTaxYear: 2025, sourceReference: 'Fictional current recertification records', sourceFactsConfirmed: true,
      allCandidateChildrenIncluded: true, children: [], filers: owners.map(({ owner, original }) => ({ owner,
        originalTaxpayer: { firstName: original.firstName, lastName: original.lastName, ssn: original.ssn, dateOfBirth: original.dateOfBirth },
        sourceReference: 'Fictional original filer record', applicableYearStart: '2025-01-01', applicableYearEnd: '2025-12-31', homeDays: home() })) } };
}
export function packet(input: Form8862Input): Form8862Sources { return known(input.sources); }
export function filer(input: Form8862Input, i = 0) { return known(known(packet(input).filers)[i]); }
export function denial(input: Form8862Input) { return known(known(known(known(input.eic?.disallowanceSources).filers)[0]).denials)[0]; }
export function child(input: Form8862Input, validSsn = true) {
  const row = { firstName: 'Alex', lastName: 'Example', ssn: validSsn ? '900-45-6789' : '', dateOfBirth: '2015-06-01',
    relationship: 'child', monthsLivedWithYou: 12, qualifiesForEIC: false, qualifiesForCTC: false, qualifiesForODC: false };
  input.taxpayer.dependents = [row];
  packet(input).children = [{ sourceId: 'dependent:0', sourceReference: 'Fictional original school and home record',
    original: { ...row }, livedWithTaxpayerInUnitedStatesMoreThanHalfYear: true, specialResidencePeriodClaimed: false,
    marriedAtYearEnd: false, jointReturnFiled: false, validSsnIssuedByDueDate: validSsn,
    allOtherEligibleClaimantsIncluded: true, otherEligibleClaimants: [], deathDate: null, homeDays: home() }];
  return known(known(packet(input).children)[0]);
}
