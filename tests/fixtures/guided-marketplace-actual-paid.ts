import { guidedMarketplaceFullRepaymentState } from './guided-marketplace-full-repayment';
import { guidedMarriageCoverageFamilyState } from './guided-marriage-coverage-family';
import { marketplaceActualPaidRecords, marriageActualPaidRecords } from './marketplace-actual-paid-records';

export function guidedMarketplaceActualPaidState(shared = false, cents = false, marriage = false) {
  const state = marriage ? guidedMarriageCoverageFamilyState(shared) : guidedMarketplaceFullRepaymentState(shared);
  const records = marriage ? marriageActualPaidRecords(shared) : marketplaceActualPaidRecords(shared, cents);
  if ('personal' in records) state.sectionData['personal-info'] = records.personal;
  state.sectionData['income-self-employment']!.manualGrossReceipts = '300000';
  state.sectionData.adjustments!.healthInsuranceFacts = records.health;
  state.sectionData.credits!.premiumTaxCredit = records.coverage;
  return state;
}
