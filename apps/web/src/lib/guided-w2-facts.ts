import type { FilingStatus, W2EntryData } from "./guided-interview-flow";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import { parseGuidedCurrency } from "./guided-currency";

export function isStartedW2(entry: W2EntryData): boolean {
  return Object.entries(entry).some(([key, value]) => key !== "aiSuggestedFields" && typeof value === "string" && value.trim() !== "");
}

export function w2FactErrors(entries: W2EntryData[] | undefined, filingStatus?: FilingStatus | null): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [index, entry] of (entries ?? []).entries()) {
    if (!isStartedW2(entry)) continue;
    const prefix = `w2-${index}`;
    if (!entry.employerName.trim()) errors[`${prefix}-employerName`] = "Enter the actual W-2 employer name.";
    if (!/^\d{2}-?\d{7}$/.test(entry.employerEin.trim())) errors[`${prefix}-employerEin`] = "Enter the actual employer EIN from Box b.";
    if (filingStatus === "mfj" && !["primary", "spouse"].includes(entry.accountHolder ?? "")) errors[`${prefix}-accountHolder`] = "Identify whose W-2 this is on the joint return.";
    if (entry.accountHolder === "spouse" && filingStatus && filingStatus !== "mfj") errors[`${prefix}-accountHolder`] = "A spouse's W-2 belongs on a joint return or their own return.";
    for (const [field, label] of [["wages", "Box 1 wages"], ["federalWithheld", "Box 2 withholding"], ["socialSecurityWages", "Box 3 Social Security wages"], ["socialSecurityWithheld", "Box 4 Social Security withholding"], ["medicareWages", "Box 5 Medicare wages"], ["medicareWithheld", "Box 6 Medicare withholding"], ["socialSecurityTips", "Box 7 Social Security tips"], ["box10DependentCareBenefits", "Box 10 dependent-care benefits"]] as const) {
      const error = amountError(entry[field], label);
      if (error) errors[`${prefix}-${field}`] = error;
    }
    if (hasEnteredAmount(entry.box12CodeW)) { const error = amountError(entry.box12CodeW, "Box 12 code W"); if (error) errors[`${prefix}-box12CodeW`] = error; }
    if (entry.stateTaxReporting === "single") {
      if (!/^[A-Z]{2}$/.test(entry.state?.trim().toUpperCase() ?? "")) errors[`${prefix}-state`] = "Enter the actual two-letter state from Box 15.";
      for (const [field, label] of [["stateWages", "Box 16 state wages"], ["stateWithheld", "Box 17 state withholding"]] as const) {
        const error = amountError(entry[field], label);
        if (error) errors[`${prefix}-${field}`] = error;
      }
    } else if (entry.stateTaxReporting === "none") {
      if (entry.state?.trim()) errors[`${prefix}-state`] = "Reconcile the recorded state with the answer that the W-2 has no state section.";
      for (const field of ["stateWages", "stateWithheld"] as const) {
        if (hasEnteredAmount(entry[field]) && (amountError(entry[field], "state amount") || !parseGuidedCurrency(entry[field]).isZero())) errors[`${prefix}-${field}`] = "Reconcile the recorded amount with the answer that the W-2 has no state section.";
      }
    } else {
      errors[`${prefix}-stateTaxReporting`] = entry.stateTaxReporting === "multiple"
        ? "Multiple-state W-2 allocation needs separate state records; this interview cannot collapse them into one state."
        : "Confirm whether the actual W-2 reports no state, one state or multiple states.";
    }
    for (const [field, suggestion] of Object.entries(entry.aiSuggestedFields ?? {})) {
      if (suggestion?.status === "pending-confirmation") errors[`${prefix}-${field}`] = `Confirm the source value for ${field} before calculating.`;
    }
  }
  return errors;
}
