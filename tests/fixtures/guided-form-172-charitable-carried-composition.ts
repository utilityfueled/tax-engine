import { guidedCurrentOriginCharitableHistories } from './guided-form-172-charitable-histories';
import { carriedCurrentCharitableSources } from './form-172-charitable-carried-sources';

/** Complete fictional old sources; no current calculated loss or allowance. */
export function guidedCarriedCurrentCharitableHistories() {
  const state = guidedCurrentOriginCharitableHistories();
  const loss = state.sectionData.adjustments?.netOperatingLossSources;
  const sources = carriedCurrentCharitableSources();
  if (!loss?.alternativeTax) throw new Error('Missing fictional original old loss');
  loss.vintages = sources.prior.vintages;
  loss.alternativeTax.vintages = sources.prior.alternativeTax?.vintages;
  return state;
}
