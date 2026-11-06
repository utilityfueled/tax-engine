import { guidedMarketplaceFullRepaymentState } from './guided-marketplace-full-repayment';
import { marketplaceReportedRepaymentRecords } from './marketplace-reported-repayment-records';

export function guidedMarketplaceReportedRepaymentState(shared = false) {
  const state = guidedMarketplaceFullRepaymentState(shared), records = marketplaceReportedRepaymentRecords(shared);
  state.sectionData.adjustments!.healthInsuranceFacts = records.health;
  state.sectionData.credits!.premiumTaxCredit = records.coverage;
  return state;
}
