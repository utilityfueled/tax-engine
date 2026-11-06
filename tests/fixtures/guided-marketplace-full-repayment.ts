import { guidedCoverageFamilyHealthState } from './guided-coverage-family-health';
import { marketplaceFullRepaymentRecords } from './marketplace-full-repayment-records';

export function guidedMarketplaceFullRepaymentState(shared = false) {
  const state = guidedCoverageFamilyHealthState(shared ? 'agreement' : undefined);
  const records = marketplaceFullRepaymentRecords(shared);
  state.sectionData['income-self-employment']!.manualGrossReceipts = '300000';
  state.sectionData.adjustments!.healthInsuranceFacts = records.health;
  state.sectionData.credits!.premiumTaxCredit = records.coverage;
  return state;
}
