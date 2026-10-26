import { emptyAdjustmentData, emptyDeductionData } from '@/lib/guided-interview-flow';
import { originalCharitableGuideSources } from './charitable-original-nol-sources';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';

export function guidedOriginalCharitableNolState() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['net-operating-loss'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '30000' }] };
  const { loss, charity } = originalCharitableGuideSources();
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: loss };
  state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', k1CharitableSources: charity };
  return state;
}
