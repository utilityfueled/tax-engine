import { guidedCurrentCharitableOriginState } from './guided-form-172-charitable-origin';
import { currentOriginCharitableHistorySources } from './form-172-charitable-history-sources';

/** Original fictional receipts and independent histories; no calculated allowance. */
export function guidedCurrentOriginCharitableHistories() {
  const state = guidedCurrentCharitableOriginState();
  const deductions = state.sectionData.deductions;
  const loss = state.sectionData.adjustments?.netOperatingLossSources;
  const sources = currentOriginCharitableHistorySources();
  if (!deductions || !loss?.alternativeTax) throw new Error('Missing fictional original history');
  Object.assign(deductions, sources.deductions);
  loss.alternativeTax.charitableCarryoverHistory = sources.prior.alternativeTax?.charitableCarryoverHistory;
  return state;
}
