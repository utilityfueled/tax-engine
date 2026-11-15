// Fictional originals; canonical fixture function copied from eic-unassessed-petition.test.ts.
import type { EicDisallowanceInput } from '@/engine/forms/eic-disallowance-history';
import type { EicDisallowanceSources } from '@/models/eic-disallowance-sources';
import { completePersonalInfo, startCompleteInterview, completeW2Entry } from '../guided-interview/complete-facts';
import type { PersonalInfoData } from '@/lib/guided-interview-flow';
function actual<T,>(v: T | undefined): T { if (v === undefined) throw new Error('Incomplete fictional source'); return v; }
type Filer = NonNullable<EicDisallowanceSources['filers']>[number];
type Denial = NonNullable<Filer['denials']>[number];
function packet(v: EicDisallowanceInput) { return actual(v.sources); }
function filer(v: EicDisallowanceInput) { return actual(actual(packet(v).filers)[0]); }
function denial(v: EicDisallowanceInput) { return actual(actual(filer(v).denials)[0]); }
function proof(v: EicDisallowanceInput): Record<string, unknown> { return actual(Reflect.get(denial(v), 'unassessedTaxCourtPetition')); }
const primary = { firstName: 'Avery', lastName: 'Example', ssn: '900-12-3456' };
function fixture(year = 2025): EicDisallowanceInput {
  const prior = year - 1, current = year + 1, through = `${current}-03-01`;
  const pending = {
    sourceTaxYear: year, owner: 'primary', originalTaxpayerSsn: primary.ssn,
    sourceReference: 'Private complete petition evidence', sourceFactsConfirmed: true,
    denialSourceId: 'fictional-deficiency', denialSourceReference: 'Private original statutory notice',
    deniedTaxYear: prior, originalReturnFiledDate: `${year}-03-15`,
    deficiencyNoticeReference: 'Private original statutory notice', noticeDate: `${year}-09-01`,
    noticeLastPetitionDate: year === 2025 ? '2025-12-01' : '2026-11-30', noticeDeadlineConfirmed: true,
    docketReference: 'Private Tax Court docket', docketNumber: 'Fictional-12345',
    petitionReference: 'Private filed petition', petitionFiledDate: `${year}-11-20`,
    actualTaxCourtDeficiencyPetitionConfirmed: true, actualTimelyPetitionConfirmed: true,
    reviewedThroughDate: through, claimDate: through,
    accountTranscriptReference: 'Private original account transcript',
    courtEventHistoryReference: 'Private complete docket events',
    completeCourtAndAccountHistoryConfirmed: true,
    assessmentDate: null, finalDeterminationDate: null,
    decisionDate: null, dismissalDate: null, settlementDate: null, assessmentWaiverDate: null,
    terminationOrJeopardyAssessmentDate: null, bankruptcyCaseDate: null,
    paymentAssessmentDate: null, otherAssessmentExceptionDate: null,
  };
  const original: Denial = { sourceId: 'fictional-deficiency', sourceReference: 'Private original statutory notice',
    taxYear: prior, originalReturnFiledDate: `${year}-03-15`, noticeDate: `${year}-09-01`,
    assessmentDate: null, finalDeterminationDate: null, procedure: 'deficiency', reason: 'income_only',
    conduct: 'none', appealPending: true };
  Object.assign(original, { unassessedTaxCourtPetition: pending });
  return { taxpayer: { taxYear: year, filingStatus: 'single', primary: { ...primary } }, qualifyingChildPresent: false,
    sources: { sourceTaxYear: year, sourceReference: 'Private all original records', sourceFactsConfirmed: true,
      reviewedThroughDate: through, claimStatus: 'preparing', preparationAsOfDate: through,
      filers: [{ owner: 'primary', originalTaxpayer: { ...primary }, sourceReference: 'Private primary history',
        sourceFactsConfirmed: true, allHistoryIncluded: true, denials: [original], laterAllowances: [] }] } };
}

export function guidedEicPetitionFixture() {
  const canonical = fixture();
  const personal = structuredClone(completePersonalInfo);
  canonical.taxpayer.primary = { firstName: personal.firstName, lastName: personal.lastName, ssn: personal.ssn };
  Object.assign(actual(filer(canonical).originalTaxpayer), canonical.taxpayer.primary);
  proof(canonical).originalTaxpayerSsn = personal.ssn;
  function editable(value: unknown, key = ''): unknown {
    if (['sourceTaxYear', 'deniedTaxYear', 'taxYear'].includes(key) && typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(v => editable(v));
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,editable(v,k)]));
    return value;
  }
  personal.eicDisallowanceHistory = editable(canonical.sources) as PersonalInfoData['eicDisallowanceHistory'];
  return { personal, canonical };
}
export function guidedEicPetitionState() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  const { personal } = guidedEicPetitionFixture();
  personal.eicClaimantEligibility = { sourceTaxYear: '2025', sourceReference: 'Fictional current claimant originals', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
    primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false } };
  state.sectionData['personal-info'] = personal;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', federalWithheld: '0', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }] };
  return state;
}
// Exact visible entries from the fictional original packet; no packet injection.
export const petitionVisibleEntries: readonly (readonly [string,string])[] = [
 ['original petitioner owner','primary'],['current return tax year','2025'],['denied return tax year','2024'],['original petitioner SSN','111-22-3333'],
 ['complete proof source reference','Private complete petition evidence'],['linked original denial ID','fictional-deficiency'],['linked denial reference','Private original statutory notice'],
 ['statutory deficiency notice reference','Private original statutory notice'],['court docket source reference','Private Tax Court docket'],['actual court docket number','Fictional-12345'],['filed petition source reference','Private filed petition'],['account transcript reference','Private original account transcript'],['complete court event history reference','Private complete docket events'],
 ['original return filing date','2025-03-15'],['original notice date','2025-09-01'],['last petition date printed on actual notice','2025-12-01'],['actual petition filing date','2025-11-20'],['actual claim or preparation date','2026-03-01'],['original records reviewed through date','2026-03-01'],
 ...['assessment','final determination','court decision','dismissal','settlement','assessment waiver','termination or jeopardy assessment','bankruptcy case','payment assessment','other assessment exception'].map(label=>[`${label} original status`,'none'] as const),
 ...['printed notice deadline checked against original','actual Tax Court deficiency petition confirmed','actual timely filing confirmed from originals','complete court and account history through review date confirmed'].map(label=>[label,'true'] as const),
];
export const historyVisibleEntries: readonly (readonly [string,string])[] = [
 ['EIC history source tax year','2025'],['EIC history source reference','Private all original records'],['Current EIC claim status','preparing'],['EIC history reviewed through','2026-03-01'],['EIC preparation as of','2026-03-01'],['Primary filer: history source reference','Private primary history'],
 ['Primary filer denial 1: original denial ID','fictional-deficiency'],['Primary filer denial 1: source reference','Private original statutory notice'],['Primary filer denial 1: denied return tax year','2024'],['Primary filer denial 1: original return filing date','2025-03-15'],['Primary filer denial 1: IRS notice date','2025-09-01'],['Primary filer denial 1: assessment status','not-occurred'],['Primary filer denial 1: final determination status','not-occurred'],['Primary filer denial 1: actual denial reason','income_only'],['Primary filer denial 1: actual IRS procedure','deficiency'],['Primary filer denial 1: final conduct determination','none'],['Primary filer denial 1: pending appeal','true'],
];
export const historyConfirmationEntries: readonly (readonly [string,string])[] = [
 ['Primary filer: all EIC history included','true'],['Primary filer denial 1 petition: proof checked after the last edit','true'],['Primary filer: history checked after the last edit','true'],['EIC history checked after the last edit','true'],['EIC claimant sources checked after the last edit','true'],
];
