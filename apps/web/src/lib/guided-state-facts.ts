import Decimal from "decimal.js";
import type { StateReturnData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount, paymentFactErrors } from "./guided-required-facts";

export const stateWithholdingDocumentTypes = ["1099-R", "1099-INT", "1099-DIV", "1099-B", "1099-NEC", "1099-G", "1099-MISC", "W-2G"] as const;

export function sumAdditionalStateWithholding(data: StateReturnData | undefined): Decimal {
  return (data?.additionalStateWithholdingEntries ?? []).reduce((sum, entry) => sum.plus(parseGuidedCurrency(entry.amount)), new Decimal(0));
}

export function statePaymentFactErrors(data: StateReturnData | undefined, taxYear?: number | null, selectedState?: string | null): Record<string, string> {
  if (!data) return {};
  const errors = paymentFactErrors(data.stateEstimatedPayments, taxYear);
  data.stateEstimatedPayments.forEach((entry, index) => {
    if (!entry.state || entry.state !== selectedState) errors[`payment-${index}-state`] = "Confirm the actual state paid. Payments for another state need that state's return.";
  });
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
