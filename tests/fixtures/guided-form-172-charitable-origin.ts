import { emptyAdjustmentData, emptyDeductionData } from '@/lib/guided-interview-flow';
import { guidedCurrentCharitableOriginals } from './guided-form-172-charitable-origin-sources';
import { completeInterestSource, completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';

/** Fictional original records only; no current deduction or calculated loss input. */
export function guidedCurrentCharitableOriginState() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'self-employment', 'investments'], lifeEvents: ['current-year-loss'], stateCode: null });
  const sources = guidedCurrentCharitableOriginals();
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, ...sources.w2 }] };
  state.sectionData['income-self-employment'] = sources.business;
  state.sectionData['income-investments'] = { interestEntries: [{ ...completeInterestSource, ...sources.interest }], dividendEntries: [], brokerageEntries: [] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: sources.prior, currentLossOrigin: sources.current };
  state.sectionData.deductions = { ...emptyDeductionData, ...sources.deductions };
  return state;
}
