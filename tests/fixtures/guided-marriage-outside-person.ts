import { guidedMarketplaceMarriageHealthState } from './guided-marketplace-marriage-health';
import { marriageOutsidePersonRecords } from './marketplace-marriage-outside-person-records';
export function guidedMarriageOutsidePersonState() {
  const state=guidedMarketplaceMarriageHealthState(), records=marriageOutsidePersonRecords();
  state.sectionData['personal-info']=records.personal;
  state.sectionData.credits!.premiumTaxCredit=records.coverage;
  state.sectionData.adjustments!.healthInsuranceFacts=records.health;
  return state;
}
