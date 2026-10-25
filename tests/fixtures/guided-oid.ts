import type { OidEntryData } from "../../apps/web/src/lib/guided-oid-facts";

export const actualOid: OidEntryData = {
  payer: "Synthetic bond broker", sourceId: "synthetic-obligation-a", accountHolder: "primary",
  taxYear: "2025", sourceFormRevision: "2024-01", sourceFactsConfirmed: true, recipientAmountsConfirmed: true,
  obligationType: "taxable", inflationIndexed: false, description: "Actual synthetic obligation A",
  originalIssueDiscount: "100.10", otherPeriodicInterest: "20.20", earlyWithdrawalPenalty: "0", federalWithheld: "0",
  marketDiscount: "0", acquisitionPremium: "0", treasuryOID: "0", investmentExpenses: "0", bondPremium: "0", taxExemptOID: "0",
  oidReportedNetOfAcquisitionPremium: false, interestReportedNetOfBondPremium: false,
  recipientAdjustmentsNeeded: false, usesBondPremiumWorksheet: false, stateTaxReporting: "none", stateWithholding: [],
};
