// Spec: spec/federal/guided-eic-disallowance-history.yaml. Fictional actual records.
import { expect, it } from 'vitest';
import { buildGuidedEicDisallowanceHistory, copyEicHistoryHousehold, updateEicHistorySources, type EicDisallowanceHistoryData } from '@/lib/guided-eic-disallowance-history';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, type PersonalInfoData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';

function actual<T>(value: T | null | undefined): T { if (value == null) throw new Error('Missing fictional source'); return value; }
function source(joint = false) {
  const state = startCompleteInterview({ filingStatus: joint ? 'mfj' : 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  const personal = actual(state.sectionData['personal-info']);
  personal.eicClaimantEligibility = { sourceTaxYear: '2025', sourceReference: 'Fictional complete claimant records', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
    primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false },
    ...(joint ? { spouseNonresidentAlienDuringYear: false, spouseQualifyingChildOfAnotherTaxpayer: false,
      spouseChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false } } : {}) };
  const copied = copyEicHistoryHousehold(personal, joint ? 'mfj' : 'single', {});
  personal.eicDisallowanceHistory = { ...copied, sourceTaxYear: '2025', sourceReference: 'Fictional complete IRS and filed-return records',
    claimStatus: 'preparing', preparationAsOfDate: '2026-03-01', reviewedThroughDate: '2026-03-01', sourceFactsConfirmed: true,
    filers: copied.filers?.map(filer => ({ ...filer, sourceReference: `Fictional ${filer.owner} complete history`, sourceFactsConfirmed: true,
      allHistoryIncluded: true, denials: [], laterAllowances: [] })) };
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }] };
  return state;
}
function history(personal: PersonalInfoData): EicDisallowanceHistoryData { return actual(personal.eicDisallowanceHistory); }
function denial() {
  return { sourceId: 'fictional-denial', sourceReference: 'Fictional original assessment', taxYear: '2024', originalReturnFiledDate: '2025-03-15',
    noticeDate: '2025-09-01', assessmentDate: '2025-12-01', finalDeterminationDate: '2025-12-01', procedure: 'deficiency' as const,
    reason: 'income_only' as const, conduct: 'reckless' as const, appealPending: false,
    interveningReturnHistoryCompleteConfirmed: true, interveningOriginalReturns: [] };
}
function credit(state: ReturnType<typeof source>) {
  const input = TaxYearInputSchema.parse(actual(buildTaxInputFromGuidedData(state)));
  return calculateFederalTax(input).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed();
}
it('copies actual filer identities without inventing history or reassigning records', () => {
  const personal = structuredClone(completePersonalInfo), before = structuredClone(personal);
  const copied = copyEicHistoryHousehold(personal, 'mfj', {});
  expect(copied.sourceTaxYear).toBeUndefined(); expect(copied.filers).toHaveLength(2);
  expect(copied.filers?.[0]?.originalTaxpayer?.ssn).toBe('111-22-3333'); expect(copied.filers?.[1]?.denials).toBeUndefined();
  expect(copied.filers?.[0]?.allHistoryIncluded).toBeUndefined(); expect(copied.sourceFactsConfirmed).toBeNull(); expect(personal).toEqual(before);
  const state = source(true), saved = actual(state.sectionData['personal-info']);
  actual(history(saved).filers?.[1]).denials = [denial()];
  const unchanged = copyEicHistoryHousehold(saved, 'mfj', history(saved)); expect(unchanged.filers?.[1]?.denials).toHaveLength(1);
  actual(saved.spouse).ssn = '900-88-7777';
  const replaced = copyEicHistoryHousehold(saved, 'mfj', history(saved));
  expect(replaced.filers?.[1]?.originalTaxpayer?.ssn).toBe('900-88-7777'); expect(replaced.filers?.[1]?.denials).toBeUndefined();
  expect(history(saved).filers?.[1]?.denials).toHaveLength(1);
});
it('forwards actual separate histories and derives current bans without a credit override', () => {
  const state = source(true); expect(credit(state)).toBe('649'); const personal = actual(state.sectionData['personal-info']);
  actual(history(personal).filers?.[1]).denials = [denial()]; const before = structuredClone(state);
  const built = actual(buildGuidedEicDisallowanceHistory(personal, 'mfj', 2025));
  expect(built.result.barred).toBe(true); expect(built.source.filers?.[1]?.denials?.[0]?.taxYear).toBe(2024);
  expect(credit(state)).toBe('0'); expect(state).toEqual(before);
  const noBan = actual(history(personal).filers?.[1]?.denials?.[0]); noBan.conduct = 'none'; noBan.finalDeterminationDate = null;
  expect(actual(buildGuidedEicDisallowanceHistory(personal, 'mfj', 2025)).source.filers?.[1]?.denials?.[0]?.finalDeterminationDate).toBeNull();
  expect(() => credit(state)).toThrow(/actual.*8862|8862.*source/i);
});
it('preserves missing and known-negative history facts and rejects stale originals', () => {
  const legacy = structuredClone(completePersonalInfo); expect(buildGuidedEicDisallowanceHistory(legacy, 'single', 2025)).toBeUndefined();
  const state = source(), personal = actual(state.sectionData['personal-info']), packet = history(personal), filer = actual(packet.filers?.[0]);
  filer.denials = undefined; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  filer.denials = []; filer.allHistoryIncluded = false; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  filer.allHistoryIncluded = true; packet.sourceTaxYear = ''; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  packet.sourceTaxYear = '2025'; actual(filer.originalTaxpayer).ssn = '900-99-9999'; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  actual(filer.originalTaxpayer).ssn = personal.ssn; packet.filers = [filer, structuredClone(filer)]; expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
it('revokes edited history and household confirmations without cycling explicit reconfirmation', () => {
  const state = source(true), personal = actual(state.sectionData['personal-info']), packet = history(personal);
  const unrelatedHome = updateSectionData(state, 'personal-info', { ...personal, eicClaimantEligibility: { ...personal.eicClaimantEligibility,
    primaryChildless: { ...personal.eicClaimantEligibility?.primaryChildless, mainHomeInUnitedStatesMoreThanHalfYear: false } } });
  expect(unrelatedHome.sectionData['personal-info']?.eicDisallowanceHistory?.sourceFactsConfirmed).toBe(true);
  expect(unrelatedHome.sectionData['personal-info']?.eicDisallowanceHistory?.filers?.every(row => row.sourceFactsConfirmed === true)).toBe(true);
  const update = updateEicHistorySources(packet, { filers: packet.filers?.map((row, i) => i === 1 ? { ...row, denials: [denial()] } : row) });
  expect(update.sourceFactsConfirmed).toBeNull(); expect(update.filers?.every(row => row.sourceFactsConfirmed === null)).toBe(true);
  const changed = updateSectionData(state, 'personal-info', { ...personal, eicDisallowanceHistory: update });
  const next = actual(changed.sectionData['personal-info']); expect(next.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const ownerConfirmed = updateEicHistorySources(history(next), { filers: history(next).filers?.map(row => ({ ...row, sourceFactsConfirmed: true })) });
  const confirmed = updateSectionData(changed, 'personal-info', { ...next,
    eicDisallowanceHistory: { ...ownerConfirmed, sourceFactsConfirmed: true }, eicClaimantEligibility: { ...next.eicClaimantEligibility, sourceFactsConfirmed: true } });
  expect(credit(confirmed)).toBe('0');
  const identityEdit = updateSectionData(confirmed, 'personal-info', { ...actual(confirmed.sectionData['personal-info']), firstName: 'Changed' });
  expect(identityEdit.sectionData['personal-info']?.eicDisallowanceHistory?.sourceFactsConfirmed).toBeNull();
  expect(identityEdit.sectionData['personal-info']?.eicDisallowanceHistory?.filers?.every(row => row.sourceFactsConfirmed === null)).toBe(true);
});
