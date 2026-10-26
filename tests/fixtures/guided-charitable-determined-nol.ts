import { emptyDonationEntry } from '@/lib/guided-interview-flow';
import { priorCharitableNolInterview } from './guided-charitable-prior-nol';
import { determinedCharitableGuideSources } from './charitable-determined-nol-sources';
/** Actual fictional documents and independent histories; no current calculation inputs. */
export function determinedCharitableNolInterview() {
  const state=priorCharitableNolInterview('5000'),deductions=state.sectionData.deductions;
  if(!deductions || !state.sectionData.adjustments)throw new Error('Missing fictional original history');
  const {regular,loss,current}=determinedCharitableGuideSources();
  state.sectionData.adjustments.netOperatingLossSources=loss;
  deductions.charitableCarryoverSources=regular;deductions.charitableContributions='';
  deductions.donationEntries=[{...emptyDonationEntry,...current}];
  return state;
}
