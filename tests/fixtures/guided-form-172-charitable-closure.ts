import { guidedCurrentCharitableOriginState } from './guided-form-172-charitable-origin';
import { currentOriginCryptoGift } from './guided-form-172-charitable-closure-sources';
import { originalCharitableGuideSources } from './charitable-original-nol-sources';
import { priorCharitableGuideSources } from './charitable-prior-nol-sources';

export function guidedCharitableClosureState(kind: 'crypto' | 'k1' | 'prior' = 'crypto') {
  const state = guidedCurrentCharitableOriginState();
  const deductions = state.sectionData.deductions;
  const loss = state.sectionData.adjustments?.netOperatingLossSources;
  if (!deductions || !loss?.alternativeTax) throw Error('Missing fictional current sources');
  deductions.donationEntries = []; deductions.charitableContributions = '0';
  if (kind === 'crypto') deductions.cryptoDonations = [currentOriginCryptoGift()];
  else if (kind === 'k1') deductions.k1CharitableSources = originalCharitableGuideSources().charity;
  else {
    const prior = priorCharitableGuideSources('1000');
    deductions.charitableCarryoverSources = prior.regular;
    loss.alternativeTax.charitableCarryoverHistory = prior.loss.alternativeTax?.charitableCarryoverHistory;
  }
  return state;
}
