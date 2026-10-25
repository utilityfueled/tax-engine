import type { DependentCareData, FilingStatus } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";

export function careFactErrors(data: DependentCareData | undefined, filingStatus?: FilingStatus | null): Record<string, string> {
  if (!data || !Object.values(data).some((value) => typeof value === "boolean" || (typeof value === "string" && value.trim() !== ""))) return {};
  const errors: Record<string, string> = {};
  const expenseError = amountError(data.expenses, "dependent-care expenses");
  if (expenseError) errors.careExpenses = expenseError;
  if (expenseError || parseGuidedCurrency(data.expenses).isZero()) return errors;
  if (filingStatus === "mfs") errors.careFilingStatus = "A separate-return care claim needs the Form 2441 separated-spouse exception facts; this guided branch is not yet supported.";
  if (!/^\d+$/.test(data.qualifyingIndividuals) || Number(data.qualifyingIndividuals) < 1 || Number(data.qualifyingIndividuals) > 20) errors.careIndividuals = "Enter the actual number of qualifying individuals who received care.";
  for (const field of ["primaryEarnedIncome", "excludedDependentCareBenefits", ...(filingStatus === "mfj" ? ["spouseEarnedIncome" as const] : [])] as const) {
    const error = amountError(data[field], field === "excludedDependentCareBenefits" ? "excluded dependent-care benefits from Form 2441 Part III" : "earned income from Form 2441 line 4 or 5");
    if (error) errors[`care-${field}`] = error;
  }
  if (filingStatus !== "mfj" && hasEnteredAmount(data.spouseEarnedIncome)) {
    const error = amountError(data.spouseEarnedIncome, "spouse earned income");
    if (error) errors.careSpouseIncome = error;
  }
  if (typeof data.eligibilityConfirmed !== "boolean") errors.careEligibility = "Confirm the qualifying-person, work-related care and eligible-provider requirements from Form 2441.";
  return errors;
}
