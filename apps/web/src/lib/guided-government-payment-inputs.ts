import { Form1099GSchema } from "@/models/inputs";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import type { UnemploymentEntryData } from "./guided-unemployment-facts";

function money(value: string | undefined, label: string): string | undefined {
  if (value === undefined || !hasEnteredAmount(value)) return undefined;
  const error = amountError(value, label); if (error) throw new Error(error);
  parseGuidedCurrency(value); // Validate with Decimal, preserving the entered cent precision.
  return value.trim().replace(/,/g, "");
}

/** Source conversion only. The caller validates ownership and canonical worksheets. */
export function buildGovernmentPaymentSourceRecords(entries: UnemploymentEntryData[]) {
  return entries.map((entry, index) => Form1099GSchema.parse({
    // Result-local audit IDs are distinct from actual statement identity below.
    // Rows are rebuilt with each calculation; no taxpayer ID enters the audit key.
    sourceId: `government-source-${index + 1}`,
    accountReference: entry.accountReference?.trim(), payer: entry.payer?.trim(), payerTin: entry.payerTin?.trim(),
    accountHolder: entry.accountHolder || undefined, taxYear: Number(entry.sourceTaxYear), sourceFormRevision: entry.sourceFormRevision,
    programType: entry.programType || undefined, actualReceiptConfirmed: entry.actualReceiptConfirmed ?? undefined,
    additionalWorksheetRequired: entry.additionalWorksheetRequired ?? undefined, sourceFactsConfirmed: entry.sourceFactsConfirmed ?? undefined,
    unemploymentCompensation: money(entry.compensation, "Box 1 unemployment"), federalWithheld: money(entry.federalWithheld, "Box 4 withholding"),
    stateOrLocalTaxRefund: money(entry.stateOrLocalTaxRefund, "Box 2 refund"),
    ...(entry.refundTaxYear?.trim() ? { refundTaxYear: Number(entry.refundTaxYear) } : {}),
    ...(entry.refundExpenseTaxYear?.trim() ? { refundExpenseTaxYear: Number(entry.refundExpenseTaxYear) } : {}),
    rtaaPayments: money(entry.rtaaPayments, "Box 5 RTAA"), taxableGrants: money(entry.taxableGrants, "Box 6 taxable grants"),
    grantIncomeCategory: entry.grantIncomeCategory || undefined, agriculturePayments: money(entry.agriculturePayments, "Box 7 agriculture"),
    tradeOrBusinessRefund: entry.tradeOrBusinessRefund ?? undefined, marketGain: money(entry.marketGain, "Box 9 market gain"),
    familyLeaveBenefits: money(entry.familyLeaveBenefits, "Box 10 family leave"), familyLeaveProgramType: entry.familyLeaveProgramType || undefined,
    currentYearRepaid: money(entry.currentYearRepaid, "current-year repayment"), priorYearRepaid: money(entry.priorYearRepaid, "earlier-year repayment"),
    unemploymentReceivedBeforeRepayment: money(entry.unemploymentReceivedBeforeRepayment, "actual receipts before repayment"),
    box1IncludesCurrentYearRepayment: entry.box1IncludesCurrentYearRepayment ?? undefined, repaymentSourceReference: entry.repaymentSourceReference?.trim() || undefined,
    unrecoveredAfterTaxContributions: money(entry.unrecoveredAfterTaxContributions, "available nondeductible contributions"),
    contributionProgramId: entry.contributionProgramId?.trim() || undefined, contributionHistoryReference: entry.contributionHistoryReference?.trim() || undefined,
    contributionBalanceReconciled: entry.contributionBalanceReconciled ?? undefined, allProgramPaymentsIncluded: entry.allProgramPaymentsIncluded ?? undefined,
    stateTaxReporting: entry.stateTaxReporting || undefined,
    ...(entry.stateTaxReporting === "single" ? { state: entry.state?.trim().toUpperCase(), statePayerId: entry.statePayerId?.trim() || undefined, stateWithheld: money(entry.stateWithheld, "source state withholding") } : { stateWithheld: entry.stateTaxReporting === "none" ? "0" : undefined }),
  }));
}
