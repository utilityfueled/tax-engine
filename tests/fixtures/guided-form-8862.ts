import { startCompleteInterview, completeW2Entry } from '../guided-interview/complete-facts';
import { fictionalGuidedEmptyEicHistory } from './guided-eic-history';
import { copyForm8862Household, type Form8862Data } from '../../apps/web/src/lib/guided-form-8862';
export function actual<T>(value: T | null | undefined): T { if (value == null) throw new Error('Incomplete fictional current form fixture'); return value; }
export function guidedForm8862(joint = false) {
  const state = startCompleteInterview({ filingStatus: joint ? 'mfj' : 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  const personal = actual(state.sectionData['personal-info']);
  personal.eicClaimantEligibility = { sourceTaxYear: '2025', sourceReference: 'Fictional current claimant records', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
    primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false },
    ...(joint ? { spouseNonresidentAlienDuringYear: false, spouseQualifyingChildOfAnotherTaxpayer: false,
      spouseChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false } } : {}) };
  personal.eicDisallowanceHistory = fictionalGuidedEmptyEicHistory(personal, joint ? 'mfj' : 'single', 2025);
  actual(personal.eicDisallowanceHistory.filers?.[0]).denials = [{ sourceId: 'actual-denial', sourceReference: 'Fictional actual IRS assessment', taxYear: '2024',
    originalReturnFiledDate: '2025-03-15', noticeDate: '2025-09-01', assessmentDate: '2025-12-01', finalDeterminationDate: null,
    reason: 'other', procedure: 'deficiency', conduct: 'none', appealPending: false }];
  const copied = copyForm8862Household(personal, joint ? 'mfj' : 'single', {});
  personal.eicRecertificationSources = { ...copied, sourceTaxYear: '2025', sourceReference: 'Fictional actual current Form8862 records', sourceFactsConfirmed: true,
    allCandidateChildrenIncluded: true, children: [], filers: copied.filers?.map(row => ({ ...row, sourceReference: `Fictional ${row.owner} residence record`,
      applicableYearStart: '2025-01-01', applicableYearEnd: '2025-12-31', homeDays: { sourceReference: 'Fictional complete residence ledger',
        actualUnitedStatesDays: '365', temporaryAbsences: [], militaryOutsideUnitedStatesDays: '0', allDaysIncludedAndDistinctConfirmed: true } })) } satisfies Form8862Data;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }] };
  return state;
}
