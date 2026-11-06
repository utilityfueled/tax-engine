import { guidedMarketplaceMarriageHealthState } from './guided-marketplace-marriage-health';
import { sharedMarriageHealthRecords } from './marketplace-shared-marriage-health-records';
export function guidedSharedMarriageHealthState(otherRecipient = false) {
  const state = guidedMarketplaceMarriageHealthState(), records = sharedMarriageHealthRecords(otherRecipient);
  state.sectionData['personal-info'] = records.personal;
  state.sectionData.credits!.premiumTaxCredit = records.coverage;
  state.sectionData.adjustments!.healthInsuranceFacts = records.health;
  return state;
}
