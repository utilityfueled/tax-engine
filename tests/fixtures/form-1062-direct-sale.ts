import type { Form1062ScheduleAInput } from "@/engine/forms/form-1062-schedule-a.js";

// Synthetic direct sale using the gain printed in IRS TY2026 Form 1040 ATS scenario 13.
export const qualifiedFarmlandSale = {
  taxYear: 2026,
  transactionType: "direct_sale",
  saleDate: "2026-10-01",
  qualifyingFarmUseConfirmed: true,
  unitedStatesRealPropertyConfirmed: true,
  activeFarmerBuyerConfirmed: true,
  enforceableTenYearCovenantConfirmed: true,
  covenantIncluded: true,
  wholePropertyQualifies: true,
  allGainRecognizedThisYear: true,
  grossProceeds: "500000",
  sellingExpenses: "0",
  unadjustedBasis: "443484",
  adjustedBasis: "443484",
  independentlyReportedGain: "56516",
} satisfies Form1062ScheduleAInput;
