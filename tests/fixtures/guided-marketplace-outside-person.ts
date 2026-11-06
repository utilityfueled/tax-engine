import { guidedCoverageFamilyHealthState } from './guided-coverage-family-health';
import { marketplaceOutsidePersonRecords } from './marketplace-outside-person-records';
export function guidedMarketplaceOutsidePersonState(actualFamilyCash = false) {
  const state = guidedCoverageFamilyHealthState('no_advance'), records = marketplaceOutsidePersonRecords(actualFamilyCash);
  state.sectionData['income-self-employment']!.manualGrossReceipts = actualFamilyCash ? '300000' : '40000';
  state.sectionData.adjustments!.healthInsuranceFacts = records.health;
  state.sectionData.credits!.premiumTaxCredit = records.coverage;
  return state;
}
