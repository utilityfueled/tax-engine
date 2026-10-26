import { guidedMarketplaceHealthOwnersState } from "./guided-marketplace-health-owners";
import { guidedMarketplaceNonspecifiedStopRecords } from "./guided-marketplace-nonspecified-stop-records";

/** Complete fictional C and shareholder sources with a completed P/7206 stop. */
export function guidedMarketplaceNonspecifiedStopState() {
  const state = guidedMarketplaceHealthOwnersState();
  const business = state.sectionData["income-self-employment"], wages = state.sectionData["income-w2"]?.entries[0];
  const adjustments = state.sectionData.adjustments, credits = state.sectionData.credits;
  if (!business || !wages || !adjustments || !credits) throw new Error("Missing fictional source");
  business.manualGrossReceipts = "5000";
  wages.wages = "50000"; wages.socialSecurityWages = "47000"; wages.medicareWages = "47000";
  const records = guidedMarketplaceNonspecifiedStopRecords();
  adjustments.healthInsuranceFacts = records.health; credits.premiumTaxCredit = records.coverage;
  return state;
}
