import Decimal from "decimal.js";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import type { FilingStatus, PersonalInfoData, StateReturnData, UnemploymentData } from "./guided-interview-flow";

export interface UnemploymentEntryData {
  sourceTaxYear?: string;
  sourceFormRevision?: string;
  payer?: string;
  payerTin?: string;
  accountReference?: string;
  accountHolder?: "primary" | "spouse" | "";
  recipientTaxIdLast4?: string;
  programType?: "government-unemployment" | "employer-supplemental" | "private-or-union" | "other-government" | "";
  compensation: string;
  federalWithheld: string;
  stateOrLocalTaxRefund?: string;
  refundTaxYear?: string;
  rtaaPayments?: string;
  taxableGrants?: string;
  agriculturePayments?: string;
  marketGain?: string;
  familyLeaveBenefits?: string;
  tradeOrBusinessRefund?: boolean | null;
  currentYearRepaid?: string;
  priorYearRepaid?: string;
  unrecoveredAfterTaxContributions?: string;
  actualReceiptConfirmed?: boolean | null;
  additionalWorksheetRequired?: boolean | null;
  sourceFactsConfirmed?: boolean | null;
  stateTaxReporting?: "none" | "single" | "multiple" | "";
  state?: string;
  statePayerId?: string;
  stateWithheld?: string;
}
export interface UnemploymentSourceData { entries?: UnemploymentEntryData[]; }
export const emptyUnemploymentEntry: UnemploymentEntryData = { compensation: "", federalWithheld: "" };
export const governmentOtherAmounts = [
  ["stateOrLocalTaxRefund", "State or local tax refund, credit or offset (Box 2)"],
  ["rtaaPayments", "RTAA payments (Box 5)"],
  ["taxableGrants", "Taxable grants (Box 6)"],
  ["agriculturePayments", "Agriculture payments (Box 7)"],
  ["marketGain", "Market gain (Box 9)"],
  ["currentYearRepaid", "Actual repayment this year of this year's unemployment benefits"],
  ["priorYearRepaid", "Actual repayment this year of earlier-year benefits"],
  ["unrecoveredAfterTaxContributions", "Actual unrecovered nondeductible program contributions before these benefits"],
] as const;
export function isStartedUnemployment(entry: UnemploymentEntryData): boolean {
  return Object.values(entry).some(value => typeof value === "string" ? value.trim() !== "" : typeof value === "boolean");
}
export function unemploymentEntries(data: UnemploymentData | undefined): UnemploymentEntryData[] {
  if (!data) return [];
  if (data.entries?.some(isStartedUnemployment)) return data.entries;
  return hasEnteredAmount(data.compensation) || hasEnteredAmount(data.federalWithheld) ? [{ compensation: data.compensation, federalWithheld: data.federalWithheld }] : data.entries ?? [];
}
export function governmentSourceTotal(entries: UnemploymentEntryData[], field: "compensation" | "federalWithheld"): Decimal | null {
  const sources = entries.filter(isStartedUnemployment);
  if (sources.some(entry => !["primary", "spouse"].includes(entry.accountHolder ?? "") || amountError(entry[field], field))) return null;
  return sources.reduce((sum, entry) => sum.plus(parseGuidedCurrency(entry[field])), new Decimal(0));
}
export function withUnemploymentEntries(data: UnemploymentData, entries: UnemploymentEntryData[]): UnemploymentData {
  const started = entries.some(isStartedUnemployment);
  return { ...data, entries, compensation: started ? governmentSourceTotal(entries, "compensation")?.toFixed() ?? "" : "", federalWithheld: started ? governmentSourceTotal(entries, "federalWithheld")?.toFixed() ?? "" : "" };
}
export function unemploymentFactErrors(data: UnemploymentData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, personalInfo?: PersonalInfoData, stateData?: StateReturnData): Record<string, string> {
  const errors: Record<string, string> = {};
  const entries = unemploymentEntries(data).filter(isStartedUnemployment);
  const sourceKeys = new Set<string>();
  entries.forEach((entry, index) => {
    const fail = (field: string, message: string) => { errors[`government-${index}-${field}`] = message; };
    if (!entry.payer?.trim()) fail("payer", "Enter the actual government payer from the source.");
    if (!/^\d{9}$/.test(entry.payerTin?.replace(/-/g, "") ?? "")) fail("payer-tin", "Enter the actual nine-digit payer TIN.");
    if (!entry.accountReference?.trim()) fail("reference", "Enter a local statement reference to distinguish corrected or duplicate records.");
    if (!["2025", "2026"].includes(entry.sourceTaxYear ?? "") || (taxYear != null && entry.sourceTaxYear !== String(taxYear))) fail("year", "Confirm the source calendar year matches this return.");
    if (!["2024-03", "2026-12"].includes(entry.sourceFormRevision ?? "") || (entry.sourceTaxYear === "2025" && entry.sourceFormRevision === "2026-12")) fail("revision", "Confirm the actual form revision. The 2026 revision must not be used for an earlier source year.");
    if (!["primary", "spouse"].includes(entry.accountHolder ?? "")) fail("owner", "Confirm the actual recipient of these government payments.");
    if (filingStatus && filingStatus !== "mfj" && entry.accountHolder === "spouse") fail("owner", "A spouse's payments require a joint return or their separate return.");
    const person = entry.accountHolder === "primary" ? personalInfo : entry.accountHolder === "spouse" ? personalInfo?.spouse : undefined;
    if (!/^\d{4}$/.test(entry.recipientTaxIdLast4 ?? "") || (person && entry.recipientTaxIdLast4 !== person.ssn.replace(/-/g, "").slice(-4))) fail("recipient", "Confirm the actual recipient ID matches the selected taxpayer or spouse.");
    const key = `${entry.payerTin?.replace(/-/g, "")}|${entry.accountHolder}|${entry.accountReference?.trim().toLowerCase()}|${entry.sourceTaxYear}`;
    if (sourceKeys.has(key)) fail("duplicate", "Reconcile duplicate or corrected government statements before calculation.");
    sourceKeys.add(key);
    if (entry.programType !== "government-unemployment") fail("program", "Confirm ordinary government unemployment. Employer, private/union and other government programs need their distinct source treatment.");
    if (entry.actualReceiptConfirmed !== true) fail("actual-receipt", "Confirm these are actual benefits belonging to this recipient. An incorrect or identity-theft source must be resolved, not treated as received income.");
    for (const [field, label] of [["compensation", "unemployment compensation in Box 1"], ["federalWithheld", "federal withholding in Box 4"], ...governmentOtherAmounts] as const) {
      const error = amountError(entry[field], label); if (error) fail(field, error);
    }
    for (const [field] of governmentOtherAmounts) if (!amountError(entry[field], field) && parseGuidedCurrency(entry[field]).gt(0)) fail(field, "This actual source amount is saved. Its separate tax-benefit, payment classification, repayment or contribution worksheet must be implemented before this ordinary route can calculate.");
    if (entry.sourceTaxYear === "2026" || entry.sourceFormRevision === "2026-12" || hasEnteredAmount(entry.familyLeaveBenefits)) {
      const error = amountError(entry.familyLeaveBenefits, "actual family leave benefits (2026 Box 10)");
      if (error) fail("family-leave", error);
      else if (parseGuidedCurrency(entry.familyLeaveBenefits).gt(0)) fail("family-leave", "Family leave benefits require their actual program classification and separate federal calculation; retain the original amount for review.");
    }
    if (entry.tradeOrBusinessRefund !== false) fail("business-refund", "Confirm the actual Box 8 checkbox. Business refund treatment requires its separate source worksheet.");
    if ((hasEnteredAmount(entry.refundTaxYear) || (!amountError(entry.stateOrLocalTaxRefund, "refund") && parseGuidedCurrency(entry.stateOrLocalTaxRefund).gt(0))) && (!/^\d{4}$/.test(entry.refundTaxYear ?? "") || Number(entry.refundTaxYear) < 1900 || Number(entry.refundTaxYear) > Number(entry.sourceTaxYear))) fail("refund-year", "Enter the actual tax year to which the refund belongs; do not infer it from the payment year.");
    if (entry.stateTaxReporting === "single") {
      if (!/^[A-Z]{2}$/.test(entry.state?.trim().toUpperCase() ?? "")) fail("state", "Enter the actual source state.");
      const error = amountError(entry.stateWithheld, "source state withholding"); if (error) fail("state-withheld", error);
    } else if (entry.stateTaxReporting === "none") {
      if (entry.state?.trim() || entry.statePayerId?.trim() || (hasEnteredAmount(entry.stateWithheld) && (amountError(entry.stateWithheld, "state withholding") || !parseGuidedCurrency(entry.stateWithheld).isZero()))) fail("state-reporting", "Reconcile saved state facts with the answer that no state section was reported.");
    } else fail("state-reporting", entry.stateTaxReporting === "multiple" ? "Multiple source states need their separate allocation records; do not combine them into one state." : "Confirm actual source state reporting.");
    if (entry.stateTaxReporting === "single" && stateData?.additionalStateWithholdingEntries?.some(other => other.documentType === "1099-G" && other.payer.trim().toLowerCase() === entry.payer?.trim().toLowerCase() && other.state?.toUpperCase() === entry.state?.toUpperCase() && other.taxYear === entry.sourceTaxYear)) fail("duplicate-withholding", "This source is also entered as additional state withholding. Reconcile it before counting the same payment twice.");
    if (entry.additionalWorksheetRequired !== false) fail("additional-worksheet", "Confirm whether taxability, repayments, contribution history or another government-payment worksheet is still needed.");
    if (entry.sourceFactsConfirmed !== true) fail("confirmation", "Confirm this government-payment source after its last edit.");
  });
  for (const field of ["compensation", "federalWithheld"] as const) {
    if (!data?.entries || !hasEnteredAmount(data[field])) continue;
    const total = governmentSourceTotal(entries, field);
    if (amountError(data[field], field) || total === null || !total.eq(parseGuidedCurrency(data[field]))) errors[`government-total-${field}`] = "Reconcile the saved total with the actual government-payment source records.";
  }
  return errors;
}
