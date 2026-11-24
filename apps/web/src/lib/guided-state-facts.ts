import Decimal from "decimal.js";
import type { StateEstimatedPaymentEntry, StateReturnData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount, isActualDate } from "./guided-required-facts";

export const stateWithholdingDocumentTypes = ["1099-R", "1099-INT", "1099-DIV", "1099-B", "1099-NEC", "1099-G", "1099-MISC", "W-2G"] as const;

export function sumAdditionalStateWithholding(data: StateReturnData | undefined): Decimal {
  return (data?.additionalStateWithholdingEntries ?? []).reduce((sum, entry) => sum.plus(parseGuidedCurrency(entry.amount)), new Decimal(0));
}

export function confirmedStateEstimatedPaymentYear(entry: StateEstimatedPaymentEntry): number | undefined {
  const application = entry.application;
  return application?.confirmed === true && /^[1-9]\d{3}$/.test(application.taxYear) ? Number(application.taxYear) : undefined;
}

/** A saved estimate can confirm one actual receipt, without adding a second payment. */
export function assertSavedStateEstimatesMatchReceipts(
  savedEstimates: ReadonlyArray<StateReturnData["stateEstimatedPayments"][number]>,
  receipts: ReadonlyArray<{ kind: string; date: string; amount: string }>,
  appliedYear?: number,
): void {
  const used = new Set<number>();
  for (const saved of savedEstimates) {
    const savedYear = confirmedStateEstimatedPaymentYear(saved);
    if (appliedYear !== undefined && savedYear !== undefined && savedYear !== appliedYear) continue;
    const amount = parseGuidedCurrency(saved.amount);
    const index = receipts.findIndex((actual, index) => actual.kind === "estimated"
      && !used.has(index) && actual.date === saved.date && new Decimal(actual.amount).eq(amount));
    if (index < 0) {
      throw new Error("Reconcile each saved state estimated payment with a distinct actual original receipt or explicitly remove the saved claim.");
    }
    used.add(index);
  }
}

export function usesDedicatedStatePaymentReceipts(state?: string | null): boolean {
  return state === "PA" || state === "OH";
}

export function stateEstimatedPaymentFactErrors(entries: StateEstimatedPaymentEntry[] | undefined, selectedState?: string | null, taxYear?: number | null): Record<string, string> {
  const errors: Record<string, string> = {};
  const usesDedicatedReceipts = usesDedicatedStatePaymentReceipts(selectedState);
  (entries ?? []).forEach((entry, index) => {
    const amount = amountError(entry.amount, "payment amount");
    if (amount) errors[`payment-${index}-amount`] = amount;
    if (!isActualDate(entry.date) || entry.date.startsWith("0000-")) errors[`payment-${index}-date`] = "Enter the actual payment date from the state record.";
    if (!entry.state || entry.state !== selectedState) errors[`payment-${index}-state`] = "Confirm the actual state paid. Payments for another state need that state's return.";
    if (usesDedicatedReceipts && !(selectedState === "OH" && taxYear === 2025 && entry.application !== undefined)) return;
    if (!/^[1-9]\d{3}$/.test(entry.application?.taxYear ?? "")) errors[`payment-${index}-application-year`] = "Enter the tax year shown on the state payment confirmation or account record.";
    if (entry.application?.confirmed !== true) errors[`payment-${index}-application-confirmation`] = "Confirm the tax year to which the state applied this payment.";
  });
  return errors;
}

export function statePaymentFactErrors(data: StateReturnData | undefined, taxYear?: number | null, selectedState?: string | null): Record<string, string> {
  if (!data) return {};
  const errors = stateEstimatedPaymentFactErrors(data.stateEstimatedPayments, selectedState, taxYear);
  (data.additionalStateWithholdingEntries ?? []).forEach((entry, index) => {
    if (!entry.payer.trim()) errors[`withholding-${index}-payer`] = "Enter the actual payer from the source form.";
    if (!(stateWithholdingDocumentTypes as readonly string[]).includes(entry.documentType)) errors[`withholding-${index}-source`] = "Choose the source form. W-2 withholding is already included from W-2 entries.";
    if (!entry.state || entry.state !== selectedState) errors[`withholding-${index}-state`] = "Confirm the source form's state. Withholding for another state needs that state's return.";
    if (!/^\d{4}$/.test(entry.taxYear) || (taxYear != null && Number(entry.taxYear) !== taxYear)) errors[`withholding-${index}-year`] = "Enter the source form's tax year, matching this return.";
    const error = amountError(entry.amount, "state withholding");
    if (error) errors[`withholding-${index}-amount`] = error;
  });
  if (hasEnteredAmount(data.additionalStateWithholding)) {
    const error = amountError(data.additionalStateWithholding, "saved additional withholding total");
    if (error) errors.additionalStateWithholding = error;
    else if (!Object.keys(errors).length && !sumAdditionalStateWithholding(data).eq(parseGuidedCurrency(data.additionalStateWithholding))) errors.additionalStateWithholding = "Identify the source forms and reconcile the saved additional state withholding total before calculating.";
  }
  return errors;
}
