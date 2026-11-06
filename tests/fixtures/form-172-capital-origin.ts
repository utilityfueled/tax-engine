import { TaxYearInputSchema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { currentOriginInput } from "./form-172-origin.js";

/** Explicit synthetic original statements and completed classification records. */
export function capitalOriginInput(gain = "100.49", loss = "100.50") {
  const input = currentOriginInput();
  const transactions = [
    { description: "Ordinary investment A", dateAcquired: "2025-01-02", dateSold: "2025-06-03",
      proceeds: d("1000").plus(gain).toFixed(), costBasis: "1000", adjustments: "0", holdingPeriod: "short",
      basisReportedToIRS: true, washSale: false, washSaleDisallowed: "0", digitalAsset: false },
    { description: "Ordinary investment B", dateAcquired: "2024-01-02", dateSold: "2025-06-03",
      proceeds: d("1000").minus(loss).toFixed(), costBasis: "1000", adjustments: "0", holdingPeriod: "long",
      basisReportedToIRS: true, washSale: false, washSaleDisallowed: "0", digitalAsset: false },
  ];
  return TaxYearInputSchema.parse({ ...input,
    form1099B: [{ broker: "Original broker", sourceId: "original-statement-1", taxYear: 2025,
      accountHolder: "primary", accountReference: "ORIGINAL-ACCOUNT", federalWithheld: "0", transactions }],
    form172: { ...input.form172, capitalSources: {
      sourceTaxYear: 2025, sourceReference: "Original complete capital source ledger", sourceFactsConfirmed: true,
      allCapitalSourcesIncluded: true,
      transactions: transactions.map((transaction, index) => ({ sourceId: `form1099B:0:transaction:${index}`,
        sourceTaxYear: 2025, sourceReference: "Original ordinary investment statement", accountHolder: "primary",
        statementSourceId: "original-statement-1", payerName: "Original broker", accountReference: "ORIGINAL-ACCOUNT",
        nonbusinessInvestmentConfirmed: true, capitalCharacter: "ordinary_investment", transaction })), distributions: [],
      priorCapitalLosses: { sourceTaxYear: 2024, sourceReference: "Completed prior capital carry worksheet",
        sourceFactsConfirmed: true, allCarryoversIncluded: true, sameReturnMembershipConfirmed: true,
        nonbusinessInvestmentConfirmed: true, shortTermCapitalLoss: "0", longTermCapitalLoss: "0" },
      alternativeTax: { sourceReference: "Independent completed AMT capital worksheet", sourceFactsConfirmed: true,
        currentBasisAndAdjustmentsSameConfirmed: true, priorCapitalLossesSameConfirmed: true },
    } },
  });
}
