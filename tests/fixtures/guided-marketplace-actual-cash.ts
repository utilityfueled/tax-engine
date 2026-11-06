import { guidedCoverageFamilyHealthState } from './guided-coverage-family-health';
import { marketplaceActualCashRecords } from './marketplace-actual-cash-records';

export function guidedMarketplaceActualCashState(shared = false) {
  const state = guidedCoverageFamilyHealthState(shared ? 'no_advance' : undefined);
  const records = marketplaceActualCashRecords(shared);
  state.sectionData['income-self-employment']!.manualGrossReceipts = '300000';
  state.sectionData.adjustments!.healthInsuranceFacts = records.health;
  state.sectionData.credits!.premiumTaxCredit = records.coverage;
  return state;
}
