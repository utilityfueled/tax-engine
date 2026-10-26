import { emptyAdjustmentData, emptyDeductionData } from '@/lib/guided-interview-flow';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';
import { priorCharitableGuideSources } from './charitable-prior-nol-sources';
export function priorCharitableNolInterview(alternative = '10000') {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['net-operating-loss'], stateCode: null });
  const { regular, loss } = priorCharitableGuideSources(alternative);
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '20000' }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: loss };
  state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', charitableContributions: '0', donationEntries: [],
    charitableCarryoverSources: regular };
  return state;
}
