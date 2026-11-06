import type { EducationDistributionData, EducationSourceRecord } from '@/lib/guided-education-distributions';
import { emptyCreditsData } from '@/lib/guided-interview-flow';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';
import { roomBoardPeriodFixture, roomBoardEsaPeriodFixture } from './education-room-board-periods';

export function requiredPeriodSource<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing explicit fictional period source');
  return value;
}
export function actualGuidedRoomBoardPeriod(esa = false) {
  const { input: original } = esa ? roomBoardEsaPeriodFixture() : roomBoardPeriodFixture();
  const facts = requiredPeriodSource(original.qualifiedEducationExpenses?.sourceFacts);
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  Object.assign(state.sectionData['personal-info'] ?? {}, original.taxpayer.primary);
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '50000', socialSecurityWages: '50000', medicareWages: '50000', federalWithheld: '20000' }] };
  const collections = Object.fromEntries(Object.entries(facts).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key,
    (value as Array<Record<string, unknown>>).map(row => Object.fromEntries(Object.entries(row).map(([field, item]) =>
      [field, typeof item === 'number' ? String(item) : item])) as EducationSourceRecord),
  ]));
  const data: EducationDistributionData = { ...collections, taxYear: '2025', sourceFactsConfirmed: true,
    allDistributionsReconciled: true, exceptionsDistinctFromCreditConfirmed: true,
    forms: (original.form1099Q ?? []).map(({ taxYear, transfer, ...fields }) => ({ fields: { ...fields, taxYear: String(taxYear) }, transfer: { kind: transfer?.kind } })) };
  state.sectionData.credits = { ...structuredClone(emptyCreditsData), educationDistributions: data };
  return { state, data, original };
}
