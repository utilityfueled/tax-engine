import { guidedCarriedCurrentCharitableHistories } from './guided-form-172-charitable-carried-composition';
import { charitableCodGuidedSources } from './charitable-cod-guided-sources';

/** Complete fictional original-source interview; no deduction or closing carry input. */
export function guidedCharitableCodModifiedState() {
  const state = guidedCarriedCurrentCharitableHistories(), source = charitableCodGuidedSources();
  state.segmentation.lifeEvents = ['current-year-loss', 'cancelled-debt'];
  state.sectionData['income-w2'] = { entries: [source.w2] };
  state.sectionData['income-self-employment'] = source.business;
  state.sectionData['income-investments'] = { interestEntries: [source.interest], dividendEntries: [], brokerageEntries: [] };
  state.sectionData.deductions = { ...state.sectionData.deductions, ...source.deductions };
  state.sectionData.adjustments = { ...state.sectionData.adjustments, netOperatingLossSources: source.prior,
    currentLossOrigin: source.current, codNolSources: source.cod };
  state.sectionData.payments = source.payments;
  return state;
}
