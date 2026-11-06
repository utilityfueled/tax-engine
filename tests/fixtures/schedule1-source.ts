import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";

export function completeInput(extra: Record<string, unknown> = {}) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], federalWithheld: "50000", accountHolder: "primary", socialSecurityTips: "0" }], ...extra });
}
export function schedule1SourceInput() {
  return completeInput({
    scheduleC: { accountHolder: "primary", grossReceipts: "10000" },
    scheduleF: { accountHolder: "primary", salesOfProductsRaised: "2000" },
    form1099Misc: [{ payer: "Synthetic source", royalties: "3000", otherIncome: "400" }],
    form1099Div: [{ payer: "Synthetic fund", ordinaryDividends: "0", totalCapitalGainDistributions: "5000" }],
    form1099Q: [{ accountType: "529", grossDistribution: "1000", earnings: "200", basis: "800", isTrusteeToTrustee: false }],
    qualifiedEducationExpenses: { totalQualifiedExpenses: "0" },
    cryptoIncome: { airdropIncome: [{ asset: "TEST", source: "airdrop", dateReceived: "2025-03-01", quantity: "1", fairMarketValuePerUnit: "100" }] },
    scheduleK1Form1041: [{ estateTrustName: "Synthetic estate", estateTrustEIN: "11-1111111", isFinalK1: true, finalYearSection67eDeductions: "700" }],
  });
}
