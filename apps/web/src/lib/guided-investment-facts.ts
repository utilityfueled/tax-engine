import { qofDispositionFactErrors, type QofDispositionData } from "./guided-qof-facts";
import type { BrokerageEntryData, CapitalGainTransactionData, DividendEntryData, FilingStatus, InterestEntryData, StateReturnData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount, isActualDate } from "./guided-required-facts";
import { oidFactErrors, type OidEntryData } from "./guided-oid-facts";
import { buildGuidedPrivateActivityFacts, type PrivateActivitySourceData } from "./guided-private-activity-facts";
import { calculateForm6251BondSources } from "@/engine/forms/form-6251-bond-sources.js";
import { Form1099IntSchema, Form1099DivSchema } from "@/models/inputs.js";
import { childElectionFactErrors, type ChildElectionData } from "./guided-child-election-facts";

export interface InvestmentSourceData extends PrivateActivitySourceData {
  payerTin?: string;
  accountReference?: string;
  accountHolder?: "primary" | "spouse" | "joint" | "";
  stateTaxReporting?: "none" | "single" | "multiple" | "";
  state?: string;
  stateWithheld?: string;
}
export const interestSourceAmounts = [
  ["interestIncome", "Box 1 interest income"], ["earlyWithdrawalPenalty", "Box 2 early withdrawal penalty"], ["usSavingsBondInterest", "Box 3 Treasury and savings-bond interest"], ["federalWithheld", "Box 4 federal withholding"], ["foreignTaxPaid", "Box 6 foreign tax paid"], ["taxExemptInterest", "Box 8 tax-exempt interest"], ["privateActivityBondInterest", "Box 9 private-activity bond interest"], ["marketDiscount", "Box 10 market discount"], ["bondPremium", "Box 11 bond premium"], ["treasuryBondPremium", "Box 12 Treasury bond premium"], ["taxExemptBondPremium", "Box 13 tax-exempt bond premium"],
] as const;
export const dividendSourceAmounts = [
  ["ordinaryDividends", "Box 1a ordinary dividends"], ["qualifiedDividends", "Box 1b qualified dividends"], ["capitalGainDistributions", "Box 2a capital-gain distributions"], ["section1250Gain", "Box 2b unrecaptured section 1250 gain"], ["section1202Gain", "Box 2c section 1202 gain"], ["collectiblesGain", "Box 2d collectibles gain"], ["section897OrdinaryDividends", "Box 2e section 897 ordinary dividends"], ["section897CapitalGain", "Box 2f section 897 capital gain"], ["nondividendDistributions", "Box 3 nondividend distributions"], ["federalWithheld", "Box 4 federal withholding"], ["section199ADividends", "Box 5 section 199A dividends"], ["foreignTaxPaid", "Box 7 foreign tax paid"], ["exemptInterestDividends", "Box 12 exempt-interest dividends"], ["specifiedPrivateActivityBondInterest", "Box 13 private-activity bond dividends"],
] as const;
export type InvestmentData = { interestEntries: InterestEntryData[]; dividendEntries: DividendEntryData[]; brokerageEntries: BrokerageEntryData[]; oidEntries?: OidEntryData[]; childElections?: ChildElectionData[]; qofDispositionFacts?: QofDispositionData };

export function isStartedInvestment(entry: InvestmentSourceData | CapitalGainTransactionData): boolean {
  return Object.values(entry).some(value => typeof value === "string" && value.trim() !== "");
}

function sourceIdentityErrors(entry: InvestmentSourceData, prefix: string, filingStatus: FilingStatus | null | undefined, errors: Record<string, string>) {
  if (!["primary", "spouse"].includes(entry.accountHolder ?? "")) errors[`${prefix}-owner`] = "Identify the actual taxpayer owner. Joint accounts need separately established ownership allocations before this interview can calculate them.";
  if (entry.accountHolder === "spouse" && filingStatus !== "mfj") errors[`${prefix}-owner`] = "A spouse's income belongs on a joint return or their own return.";
  if (entry.stateTaxReporting === "single") {
    if (!/^[A-Z]{2}$/.test(entry.state?.trim().toUpperCase() ?? "")) errors[`${prefix}-state`] = "Enter the actual two-letter source state, not the mailing state.";
    const error = amountError(entry.stateWithheld, "state withholding");
    if (error) errors[`${prefix}-stateWithheld`] = error;
  } else if (entry.stateTaxReporting === "none") {
    if (entry.state?.trim() || (hasEnteredAmount(entry.stateWithheld) && (amountError(entry.stateWithheld, "state withholding") || !parseGuidedCurrency(entry.stateWithheld).isZero()))) errors[`${prefix}-state`] = "Reconcile the saved state amounts with the answer that no state section is reported.";
  } else errors[`${prefix}-state`] = entry.stateTaxReporting === "multiple" ? "Multiple-state source records need separate allocations; this entry cannot combine them." : "Confirm the source form's state reporting.";
}

function rejectUnsupportedAmount(value: string | undefined, key: string, message: string, errors: Record<string, string>) {
  if (hasEnteredAmount(value) && !errors[key] && !parseGuidedCurrency(value).isZero()) errors[key] = message;
}

export function investmentFactErrors(data: InvestmentData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, stateData?: StateReturnData, stateCode?: string | null): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data) return errors;
  Object.assign(errors, qofDispositionFactErrors(data.qofDispositionFacts, taxYear));
  Object.assign(errors, oidFactErrors(data.oidEntries, filingStatus, taxYear, stateCode, stateData));
  Object.assign(errors, childElectionFactErrors(data.childElections, taxYear));
  const preferenceSourceIds = new Set<string>();
  for (const [kind, entries] of [["interest", data.interestEntries], ["dividend", data.dividendEntries]] as const) {
    entries.forEach((entry, index) => {
      if (!isStartedInvestment(entry)) return;
      const prefix = `${kind}-${index}`;
      if (!entry.payer.trim()) errors[`${prefix}-payer`] = "Enter the actual payer name from the source record.";
      sourceIdentityErrors(entry, prefix, filingStatus, errors);
      const fields = kind === "interest" ? interestSourceAmounts : dividendSourceAmounts;
      const values = entry as unknown as Record<string, string | undefined>;
      for (const [field, label] of fields) { const error = amountError(values[field], label); if (error) errors[`${prefix}-${field}`] = error; }
      if (!errors[`${prefix}-foreignTaxPaid`] && parseGuidedCurrency(entry.foreignTaxPaid).gt(0) && !entry.foreignCountry?.trim()) errors[`${prefix}-foreignCountry`] = "Enter the actual foreign country or territory from the source record.";
      const unsupported = kind === "interest" ? ["marketDiscount", "bondPremium", "treasuryBondPremium", "taxExemptBondPremium"] : ["nondividendDistributions", "section1202Gain", "section897OrdinaryDividends", "section897CapitalGain"];
      for (const field of unsupported) rejectUnsupportedAmount(values[field], `${prefix}-${field}`, "This source amount needs its additional basis, bond or special-distribution worksheet; the guided calculation does not support it yet.", errors);
      const preferenceKey = kind === "interest" ? "privateActivityBondInterest" : "specifiedPrivateActivityBondInterest";
      const exemptKey = kind === "interest" ? "taxExemptInterest" : "exemptInterestDividends";
      if (!errors[`${prefix}-${preferenceKey}`] && !errors[`${prefix}-${exemptKey}`] && !errors[`${prefix}-owner`]) {
        try {
          const privateActivityBondFacts = buildGuidedPrivateActivityFacts(entry, values[preferenceKey], taxYear);
          if (privateActivityBondFacts) {
            const source = { payer: entry.payer, accountHolder: entry.accountHolder, privateActivityBondFacts,
              [preferenceKey]: parseGuidedCurrency(values[preferenceKey]).toFixed(), [exemptKey]: parseGuidedCurrency(values[exemptKey]).toFixed() };
            calculateForm6251BondSources(kind === "interest" ? [Form1099IntSchema.parse({ ...source, interestIncome: "0" })] : [],
              kind === "dividend" ? [Form1099DivSchema.parse({ ...source, ordinaryDividends: "0" })] : [], taxYear ?? 0,
              filingStatus === "mfj" ? "married_filing_jointly" : "single");
            if (preferenceSourceIds.has(privateActivityBondFacts.sourceId)) throw new Error("Duplicate bond preference source record; reconcile the original and corrected statements.");
            preferenceSourceIds.add(privateActivityBondFacts.sourceId);
          }
        } catch (error) { errors[`${prefix}-pab`] = error instanceof Error ? error.message : "Complete the actual bond preference source."; }
      }
      if (kind === "dividend") {
        for (const [part, whole] of [["qualifiedDividends", "ordinaryDividends"], ["section1250Gain", "capitalGainDistributions"], ["collectiblesGain", "capitalGainDistributions"]] as const) if (!errors[`${prefix}-${part}`] && !errors[`${prefix}-${whole}`] && parseGuidedCurrency(values[part]).gt(parseGuidedCurrency(values[whole]))) errors[`${prefix}-${part}`] = "This included distribution cannot exceed its actual source total.";
      }
    });
  }
  data.brokerageEntries.forEach((entry, index) => {
    if (!isStartedInvestment(entry) && !entry.transactions.some(isStartedInvestment)) return;
    const prefix = `brokerage-${index}`;
    if (!entry.broker.trim()) errors[`${prefix}-broker`] = "Enter the actual broker name.";
    sourceIdentityErrors(entry, prefix, filingStatus, errors);
    const withholdingError = amountError(entry.federalWithheld, "broker federal withholding");
    if (withholdingError) errors[`${prefix}-federalWithheld`] = withholdingError;
    rejectUnsupportedAmount(entry.federalWithheld, `${prefix}-federalWithheld`, "Broker federal withholding needs source payment routing that this guided calculation does not yet support.", errors);
    const started = entry.transactions.filter(isStartedInvestment);
    if (!started.length) errors[`${prefix}-transactions`] = "Enter the actual transaction records.";
    entry.transactions.forEach((transaction, row) => {
      if (!isStartedInvestment(transaction)) return;
      const tx = `${prefix}-${row}`;
      if (!transaction.description.trim()) errors[`${tx}-description`] = "Enter the actual property description.";
      if ((!isActualDate(transaction.dateAcquired) && !["VARIOUS", "INHERITED"].includes(transaction.dateAcquired)) || (isActualDate(transaction.dateAcquired) && transaction.dateAcquired > transaction.dateSold)) errors[`${tx}-acquired`] = "Enter an actual acquisition date before sale, or the source's VARIOUS or INHERITED designation.";
      if (!isActualDate(transaction.dateSold) || (taxYear != null && !transaction.dateSold.startsWith(`${taxYear}-`))) errors[`${tx}-sold`] = "Enter the actual sale date in the return year.";
      for (const field of ["proceeds", "costBasis", "washSaleDisallowed"] as const) { const error = amountError(transaction[field], field); if (error) errors[`${tx}-${field}`] = error; }
      if (!hasEnteredAmount(transaction.adjustments)) errors[`${tx}-adjustments`] = "Enter the actual other adjustment amount, including zero.";
      else { try { parseGuidedCurrency(transaction.adjustments); } catch { errors[`${tx}-adjustments`] = "Enter a valid adjustment amount."; } }
      rejectUnsupportedAmount(transaction.adjustments, `${tx}-adjustments`, "Other capital-sale adjustments require their actual Form 8949 codes and supporting worksheet; this guided path currently supports wash-sale adjustments only.", errors);
      if (!["short", "long"].includes(transaction.holdingPeriod)) errors[`${tx}-holdingPeriod`] = "Choose the actual source holding period.";
      for (const field of ["basisReportedToIRS", "digitalAsset", "washSale"] as const) if (typeof transaction[field] !== "boolean") errors[`${tx}-${field}`] = "Confirm this classification from the actual transaction record.";
      if (transaction.sourceClassificationConfirmed !== true) errors[`${tx}-classification`] = "Review and confirm the actual holding period, basis reporting, digital-asset and wash-sale classifications; saved defaults are not evidence.";
      if (transaction.washSale === false && !errors[`${tx}-washSaleDisallowed`] && !parseGuidedCurrency(transaction.washSaleDisallowed).isZero()) errors[`${tx}-washSaleDisallowed`] = "Reconcile the disallowed loss with the answer that this is not a wash sale.";
    });
  });
  const sources = [...data.interestEntries.map(entry => ({ ...entry, documentType: "1099-INT", payer: entry.payer })), ...data.dividendEntries.map(entry => ({ ...entry, documentType: "1099-DIV", payer: entry.payer })), ...data.brokerageEntries.map(entry => ({ ...entry, documentType: "1099-B", payer: entry.broker }))];
  for (const [index, extra] of (stateData?.additionalStateWithholdingEntries ?? []).entries()) if (sources.some(source => source.stateTaxReporting === "single" && source.state?.trim().toUpperCase() === extra.state && source.documentType === extra.documentType && source.payer.trim().toLowerCase() === extra.payer.trim().toLowerCase())) errors[`additional-withholding-${index}`] = "This payer and source form already has state withholding in investment income. Reconcile the duplicate entry before calculating.";
  return errors;
}
