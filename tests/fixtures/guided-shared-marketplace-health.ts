import { guidedMarketplaceHealthState } from './guided-marketplace-health';
import { guidedSharedMarketplaceHealthRecords } from './guided-shared-marketplace-health-records';
/** Fictional original records; no calculated deduction or credit is supplied. */
export function guidedSharedMarketplaceHealthState() {
  const state=guidedMarketplaceHealthState(),{health,coverage}=guidedSharedMarketplaceHealthRecords();
  state.sectionData.adjustments!.healthInsuranceFacts=health;
  state.sectionData.credits!.premiumTaxCredit=coverage;
  return state;
}
