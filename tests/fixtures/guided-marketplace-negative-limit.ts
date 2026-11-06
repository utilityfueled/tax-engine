import { emptyAdjustmentData, emptyCreditsData } from '@/lib/guided-interview-flow';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';
import { guidedMarketplaceNegativeLimitRecords } from './guided-marketplace-negative-limit-records';

/** Complete fictional originals for two already-supported partnership selections. */
export function guidedMarketplaceNegativeLimitState() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['k1-loss-sources', 'self-employed-health-insurance'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '25000', socialSecurityWages: '25000', medicareWages: '25000', socialSecurityWithheld: '1550', medicareWithheld: '362.50' }] };
  const { health, coverage, k1 } = guidedMarketplaceNegativeLimitRecords();
  state.sectionData.adjustments = { ...emptyAdjustmentData, healthInsuranceFacts: health, k1LossSources: k1 };
  state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: coverage };
  return state;
}
