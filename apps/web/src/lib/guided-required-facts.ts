import { resolveCharitableRecipient } from "@/utils/charitable-recipient";
import Decimal from "decimal.js";
import type { DeductionData, EstimatedPaymentEntry, PaymentData, FilingStatus } from "./guided-interview-flow";
import { parseGuidedCurrency, parseGuidedDisplayAmount } from "./guided-currency";
import { mortgageWorksheetFactErrors } from "./guided-mortgage-worksheet";

export function isActualDate(value: string | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Use the local calendar when comparing dates reported by the filer. */
export function currentLocalCivilDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function hasEnteredAmount(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/** A formatting-only edit keeps confirmation. Blank and an explicit zero are different facts. */
export function guidedAmountChanged(before: string | undefined, after: string | undefined): boolean {
  if (before === after) return false;
  return hasEnteredAmount(before) !== hasEnteredAmount(after)
    || !parseGuidedDisplayAmount(before).eq(parseGuidedDisplayAmount(after));
}

export const directItemizedAmountFields = [
  "medicalExpenses", "stateLocalTaxes", "realEstateTaxes", "personalPropertyTaxes", "gamblingLosses", "gamblingExpenses",
] as const;

export function deductionAmountYearErrors(data: DeductionData | undefined, taxYear?: number | null): Record<string, string> {
  if (!data) return {};
  const errors: Record<string, string> = {};
  const needsReview = (recordedYear?: number | null) => recordedYear !== undefined && (taxYear == null || recordedYear !== taxYear);
  if (hasEnteredAmount(data.gamblingWinnings) && needsReview(data.manualWinningsTaxYear)) {
    errors.manualWinningsTaxYear = "Confirm the manual gambling winnings for this return year.";
  }
  if (hasEnteredAmount(data.nonW2IncomeTaxesDeductedElsewhere) && needsReview(data.withholdingAllocationTaxYear)) {
    errors.withholdingAllocationTaxYear = "Confirm the withholding allocated to other schedules for this return year.";
  }
  if (data.method === "itemized" && directItemizedAmountFields.some(field => hasEnteredAmount(data[field]))
    && needsReview(data.directItemizedAmountsTaxYear)) {
    errors.directItemizedAmountsTaxYear = "Confirm the direct itemized amounts for this return year.";
  }
  return errors;
}

export function amountError(value: string | undefined, label: string): string | undefined {
  if (!hasEnteredAmount(value)) return `Enter the actual ${label}; enter 0 only if it is zero.`;
  try { if (parseGuidedCurrency(value).isNegative()) return `${label} cannot be negative.`; }
  catch { return `Enter a valid ${label}.`; }
  return undefined;
}

export function deductionFactErrors(data: DeductionData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, spouse?: unknown): Record<string, string> {
  if (!data) return {};
  const errors: Record<string, string> = {};
  if (hasEnteredAmount(data.nonW2IncomeTaxesDeductedElsewhere)) {
    const error = amountError(data.nonW2IncomeTaxesDeductedElsewhere, "non-W-2 withholding deducted elsewhere");
    if (error) errors.nonW2IncomeTaxesDeductedElsewhere = error;
  }
  const deductionFields = data.method === "itemized"
    ? ["medicalExpenses", "stateLocalTaxes", "realEstateTaxes", "personalPropertyTaxes", "mortgageInterest", "casualtyLosses", "otherItemized", "investmentInterestExpense", "gamblingLosses", "gamblingExpenses", "gamblingWinnings", "charitableContributions"] as const
    : ["gamblingWinnings", "charitableContributions"] as const;
  for (const field of deductionFields) {
    if (hasEnteredAmount(data[field])) {
      const error = amountError(data[field], "deduction or income amount");
      if (error) errors[field] = error;
    }
  }
  const hasPositiveAmount = (field: typeof deductionFields[number]) => hasEnteredAmount(data[field]) && !errors[field] && parseGuidedCurrency(data[field]).gt(0);
  if (data.method === "itemized") {
    if (hasPositiveAmount("casualtyLosses")) errors.casualtyLosses = "Casualty and theft losses need the event, property and reimbursement facts from Form 4684; this aggregate alone cannot be calculated.";
    if ((hasEnteredAmount(data.gamblingLosses) || hasEnteredAmount(data.gamblingExpenses)) && !hasEnteredAmount(data.gamblingWinnings)) errors.gamblingWinnings = "Enter actual gambling winnings, including an explicit zero, before claiming wagering losses or expenses.";
    if (hasEnteredAmount(data.otherItemized) && !errors.otherItemized && !errors.investmentInterestExpense && !errors.gamblingLosses && !errors.gamblingExpenses) {
      const classified = parseGuidedCurrency(data.investmentInterestExpense).plus(parseGuidedCurrency(data.gamblingLosses)).plus(parseGuidedCurrency(data.gamblingExpenses));
      if (!classified.eq(parseGuidedCurrency(data.otherItemized))) errors.otherItemized = "Classify and reconcile the saved other-deduction total as investment interest, wagering losses or wagering expenses. Other deductions need their supporting forms.";
    }
  }
  const mortgages = data.method === "itemized" ? data.mortgageEntries ?? [] : [];
  const donations = data.donationEntries ?? [];
  if (data.method === "itemized" && hasPositiveAmount("mortgageInterest") && !mortgages.length) errors.mortgages = "Enter the mortgage lender, principal and origination date for the saved mortgage interest.";
  if (hasPositiveAmount("charitableContributions") && !donations.length) errors.donations = "Enter donation recipient, type and date for the saved charitable contributions.";
  Object.assign(errors, mortgageWorksheetFactErrors(data, taxYear, filingStatus, spouse));
  donations.forEach((entry, index) => {
    if (!entry.organization.trim()) errors[`donation-${index}-organization`] = "Enter the actual donation recipient.";
    if (!["cash", "appreciated_stock", "property", "other"].includes(entry.type)) errors[`donation-${index}-type`] = "Choose the actual donation type.";
    const error = amountError(entry.amount, "donation amount");
    if (error) errors[`donation-${index}-amount`] = error;
    if (!isActualDate(entry.date) || (taxYear != null && !entry.date.startsWith(`${taxYear}-`))) errors[`donation-${index}-date`] = "Enter the actual donation date in the selected tax year.";
    if (typeof entry.qualifiedOrganization !== "boolean") errors[`donation-${index}-qualification`] = "Confirm the recipient's actual charitable qualification.";
    if (entry.qualifiedOrganization === false) return;
    let privateNonoperating = false;
    try { privateNonoperating = resolveCharitableRecipient(entry).privateNonoperating; }
    catch { errors[`donation-${index}-classification`] = "Confirm the actual recipient tax category; the saved foundation answer is ambiguous."; }
    if (taxYear === 2026 && data.method !== "itemized") {
      for (const field of ["qualifiedOrganization", "supportingOrganization", "donorAdvisedFund"] as const) {
        if (typeof entry[field] !== "boolean") errors[`donation-${index}-${field}`] = "Confirm the recipient's eligibility for the 2026 nonitemizer deduction.";
      }
    }
    if (entry.type && entry.type !== "cash") {
      const basisError = amountError(entry.costBasis, "donated property's cost basis");
      if (basisError) errors[`donation-${index}-basis`] = basisError;
      if (typeof entry.isLongTermCapitalGain !== "boolean") errors[`donation-${index}-capital-gain`] = "Confirm whether the donated property is long-term capital gain property.";
      if (privateNonoperating && entry.isLongTermCapitalGain && entry.type === "appreciated_stock"
        && typeof entry.qualifiedAppreciatedStock !== "boolean") errors[`donation-${index}-qualified-stock`] = "Confirm whether this private-foundation gift is qualified appreciated stock.";
    }
  });
  // Legacy totals remain evidence until the user reconciles them with details.
  for (const [field, entries, amountField] of [["mortgageInterest", mortgages, "mortgageInterest"], ["charitableContributions", donations, "amount"]] as const) {
    if (entries.length && hasEnteredAmount(data[field]) && !Object.keys(errors).length) {
      const total = entries.reduce((sum, entry) => sum.plus(parseGuidedCurrency((entry as unknown as Record<string, string>)[amountField])), new Decimal(0));
      if (!total.eq(parseGuidedCurrency(data[field]))) errors[field] = "The saved total and source entries differ; reconcile the amounts before calculating.";
    }
  }
  return errors;
}

export type FederalPaymentKind = "estimate" | "extension";

export function supportsFederalPaymentReceiptReferences(taxYear: number | null | undefined, kind: FederalPaymentKind): boolean {
  return taxYear === 2025 || (taxYear === 2026 && kind === "estimate");
}

export function federalPaymentDateNeedsApplication(date: string, taxYear?: number | null, kind?: FederalPaymentKind): boolean {
  if (taxYear == null || !isActualDate(date) || date.startsWith("0000-")) return false;
  const paidYear = Number(date.slice(0, 4));
  if (kind === "estimate") return paidYear !== taxYear || date.slice(5, 7) === "01";
  return paidYear !== taxYear && paidYear !== taxYear + 1;
}

export function paymentFactErrors(entries: EstimatedPaymentEntry[] | undefined, taxYear?: number | null, kind?: FederalPaymentKind): Record<string, string> {
  const errors: Record<string, string> = {};
  (entries ?? []).forEach((entry, index) => {
    const amount = amountError(entry.amount, "payment amount");
    if (amount) errors[`payment-${index}-amount`] = amount;
    if (!isActualDate(entry.date) || entry.date.startsWith("0000-")) errors[`payment-${index}-date`] = "Enter the actual payment date from the federal record.";
    if (entry.application !== undefined || federalPaymentDateNeedsApplication(entry.date, taxYear, kind)) {
      if (taxYear == null || entry.application?.taxYear !== String(taxYear)) {
        errors[`payment-${index}-application-year`] = "Enter this return's tax year as shown on the IRS payment confirmation or account record.";
      }
      if (entry.application?.confirmed !== true) {
        errors[`payment-${index}-application-confirmation`] = "Confirm that this federal payment was applied to the selected return year.";
      }
    }
  });
  return errors;
}

export function federalPaymentReceiptFactErrors(data: PaymentData, taxYear?: number | null): Record<string, string> {
  if (!supportsFederalPaymentReceiptReferences(taxYear, "estimate")) return {};
  const errors: Record<string, string> = {};
  const referenceFields = new Map<string, string>();
  const matchingPayments = new Map<string, { errorField: string; reference: string }[]>();

  function record(entries: EstimatedPaymentEntry[], prefix: string) {
    entries.forEach((entry, index) => {
      const errorField = `${prefix}payment-${index}-receipt-reference`;
      const reference = typeof entry.receiptReference === "string" ? entry.receiptReference.replace(/\s+/g, "").toUpperCase() : "";
      if (reference) {
        const previous = referenceFields.get(reference);
        if (previous) {
          const message = "This receipt reference is used by more than one federal payment. Reconcile the rows with the actual payment records.";
          errors[previous] = message;
          errors[errorField] = message;
        } else {
          referenceFields.set(reference, errorField);
        }
      }

      if (!isActualDate(entry.date) || entry.date.startsWith("0000-") || amountError(entry.amount, "payment amount")) return;
      const amount = parseGuidedCurrency(entry.amount);
      if (!amount.gt(0)) return;
      const key = `${entry.date}:${amount.toFixed()}`;
      const group = matchingPayments.get(key) ?? [];
      group.push({ errorField, reference });
      matchingPayments.set(key, group);
    });
  }

  record(data.estimatedPayments ?? [], "");
  if (supportsFederalPaymentReceiptReferences(taxYear, "extension")) record(data.extensionPayments ?? [], "extension-");
  for (const group of matchingPayments.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      if (!row.reference) errors[row.errorField] = "Enter a distinct actual receipt reference for each federal payment with the same date and amount.";
    }
  }
  return errors;
}

export function allPaymentFactErrors(data: PaymentData | undefined, taxYear?: number | null): Record<string, string> {
  if (!data) return {};
  const errors = paymentFactErrors(data.estimatedPayments, taxYear, "estimate");
  for (const [key, value] of Object.entries(paymentFactErrors(data.extensionPayments, taxYear, "extension"))) errors[`extension-${key}`] = value;
  Object.assign(errors, federalPaymentReceiptFactErrors(data, taxYear));
  (data.priorYearAppliedCredits ?? []).forEach((entry, index) => {
    const error = amountError(entry.amount, "applied refund amount");
    if (error) errors[`credit-${index}-amount`] = error;
    if (!/^\d{4}$/.test(entry.sourceTaxYear) || (taxYear != null && Number(entry.sourceTaxYear) !== taxYear - 1)) errors[`credit-${index}-year`] = "Enter the immediately preceding tax year from the return that applied this refund.";
  });
  if (hasEnteredAmount(data.otherPayments)) {
    const error = amountError(data.otherPayments, "saved other-payment total");
    if (error) errors.otherPayments = error;
    else if (!Object.keys(errors).length) {
      const classified = [...data.extensionPayments ?? [], ...data.priorYearAppliedCredits ?? []].reduce((total, entry) => total.plus(parseGuidedCurrency(entry.amount)), new Decimal(0));
      if (!classified.eq(parseGuidedCurrency(data.otherPayments))) errors.otherPayments = "Classify the saved other-payment total as extension payments or prior-year applied refunds. Other credits need their specific supporting forms.";
    }
  }
  return errors;
}

export { retirementFactErrors } from "./guided-retirement-facts";

export { educationFactErrors } from "./guided-education-facts";

export function assertKnownFacts(errors: Record<string, string>): void {
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);
}
