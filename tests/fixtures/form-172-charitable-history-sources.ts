import { guidedCurrentCharitableOriginals } from './guided-form-172-charitable-origin-sources';
import { priorCharitableGuideSources } from './charitable-prior-nol-sources';

/** Actual fictional source records shared with the production browser check. */
export function currentOriginCharitableHistorySources() {
  const sources = guidedCurrentCharitableOriginals(), prior = priorCharitableGuideSources('500');
  const regular = prior.regular.vintages?.[0], history = prior.loss.alternativeTax?.charitableCarryoverHistory;
  const summary = history?.priorRegularCarryovers?.[0];
  if (!sources.prior.alternativeTax || !regular || !history || !summary) throw new Error('Missing fictional independent source');
  regular.originalExcess = '5000'; regular.openingCarryforward = '5000'; summary.amount = '5000';
  sources.prior.alternativeTax.charitableCarryoverHistory = history;
  return { ...sources, deductions: { ...sources.deductions, charitableCarryoverSources: prior.regular,
    donationEntries: [{ organization: 'Fictional current-origin property recipient', type: 'property' as const, amount: '1000', costBasis: '1000',
      date: '2025-05-01', qualifiedOrganization: true, recipientCategory: 'fifty-percent' as const, isPrivateFoundation: false,
      isLongTermCapitalGain: false, supportingOrganization: false, donorAdvisedFund: false }] } };
}
