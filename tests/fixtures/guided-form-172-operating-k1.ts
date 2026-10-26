import { emptyAdjustmentData, emptyDeductionData } from '@/lib/guided-interview-flow';
import { operatingK1GuideSources } from './form-172-operating-k1-guide-sources';
import { completeInterestSource, completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';
/** Fictional original facts; no calculated allowance/AGI/current loss input. */
export function guidedOperatingK1OriginState() {
  const sources = operatingK1GuideSources();
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'investments'], lifeEvents: ['current-year-loss', 'k1-loss-sources'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, ...sources.w2 }] };
  state.sectionData['income-investments'] = { interestEntries: [{ ...completeInterestSource, ...sources.interest }], dividendEntries: [], brokerageEntries: [] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: sources.prior, currentLossOrigin: sources.current, k1LossSources: sources.qualifiedLoss };
  state.sectionData.deductions = { ...emptyDeductionData, ...sources.deductions, donationEntries: [], k1CharitableSources: sources.charity };
  return state;
}
