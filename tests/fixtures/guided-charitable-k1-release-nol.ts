import { guidedOriginalCharitableNolState } from './guided-charitable-original-source-nol';
import { releasedCharitableGuideSources } from './charitable-k1-release-guide-sources';

export function guidedCharitableK1ReleaseState() {
  const state = guidedOriginalCharitableNolState(), { loss, charity } = releasedCharitableGuideSources();
  if (!state.sectionData.adjustments || !state.sectionData.deductions) throw new Error('Missing fictional source sections');
  state.sectionData.adjustments.netOperatingLossSources = loss;
  state.sectionData.deductions.k1CharitableSources = charity;
  return state;
}
