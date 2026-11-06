import { emptyAdjustmentData, emptyCreditsData } from "@/lib/guided-interview-flow";
import { startCompleteInterview } from "../guided-interview/complete-facts";
import { marketplaceHealthSeparateOwnerRecords } from "./marketplace-health-separate-owners-records";

/** Actual fictional sources shared with the focused edit/reconfirm/download browser. */
export function guidedMarketplaceHealthSeparateOwnersState() {
  const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["w2-wages"], lifeEvents: ["self-employed-health-insurance"], stateCode: null });
  const records = marketplaceHealthSeparateOwnerRecords();
  state.sectionData["income-w2"] = records.wages;
  state.sectionData.adjustments = { ...emptyAdjustmentData, healthInsuranceFacts: records.health };
  state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: records.coverage };
  state.sectionData.payments = records.payments;
  return state;
}
