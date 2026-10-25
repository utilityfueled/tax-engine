import { TaxYearInputSchema } from "@/models/inputs.js";
import { actualNolInput } from "./net-operating-loss.js";

/** Explicit synthetic source records; production inputs never receive these defaults. */
export function currentOriginInput(loss = "100000", extra: Record<string, unknown> = {}) {
  const prior = actualNolInput("20000", { priorYear: {} });
  if (!prior.netOperatingLoss) throw new Error("Missing synthetic carry packet");
  prior.netOperatingLoss.vintages = [];
  return TaxYearInputSchema.parse({ ...prior,
    form1099Int: [{ payer: "Actual domestic bank", interestIncome: "5000", federalWithheld: "0" }],
    scheduleC: { businessName: "Actual active sole proprietorship", accountHolder: "primary", grossReceipts: "0",
      qbiMateriallyParticipated: true, allInvestmentAtRisk: true,
      expenses: { otherExpenses: loss }, otherExpenseDescription: "Actual completed current-year operating expenses" },
    form172: { sourceTaxYear: 2025, sourceReference: "Actual complete current income and expense sources",
      sourceFactsConfirmed: true, allCurrentYearSourcesIncluded: true,
      farmingLossIncluded: false, cancelledDebtIncluded: false, estateOrTrustLossIncluded: false,
      businessSources: [{ sourceId: "scheduleC", accountHolder: "primary", businessName: "Actual active sole proprietorship",
        sourceReference: "Actual participation and at-risk records", sourceFactsConfirmed: true,
        materiallyParticipated: true, allInvestmentAtRisk: true, financialTradingBusiness: false }],
      alternativeTax: { sourceReference: "Independent current-year alternative-tax source worksheet", sourceFactsConfirmed: true,
        currentYearAdjustmentsCompleteConfirmed: true, regularBasisAndLossLimitsSameAsAlternativeConfirmed: true,
        regularDepreciationSameAsAlternativeConfirmed: true },
    }, ...extra });
}
