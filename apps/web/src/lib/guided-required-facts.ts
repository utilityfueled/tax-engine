import Decimal from "decimal.js";
import type { DeductionData, EstimatedPaymentEntry, RetirementEntryData, PaymentData, FilingStatus } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { mortgageFactErrors } from "./guided-mortgage-facts";

export function isActualDate(value: string | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function hasEnteredAmount(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export function amountError(value: string | undefined, label: string): string | undefined {
  if (!hasEnteredAmount(value)) return `Enter the actual ${label}; enter 0 only if it is zero.`;
  try { if (parseGuidedCurrency(value).isNegative()) return `${label} cannot be negative.`; }
  catch { return `Enter a valid ${label}.`; }
  return undefined;
}

export function deductionFactErrors(data: DeductionData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null): Record<string, string> {
  if (!data) return {};
  const errors: Record<string, string> = {};
  if (hasEnteredAmount(data.nonW2IncomeTaxesDeductedElsewhere)) {
    const error = amountError(data.nonW2IncomeTaxesDeductedElsewhere, "non-W-2 withholding deducted elsewhere");
    if (error) errors.nonW2IncomeTaxesDeductedElsewhere = error;
  }
  const deductionFields = data.method === "itemized"
    ? ["medicalExpenses", "stateLocalTaxes", "realEstateTaxes", "personalPropertyTaxes", "mortgageInterest", "casualtyLosses", "otherItemized", "investmentInterestExpense", "gamblingLosses", "gamblingWinnings", "charitableContributions"] as const
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
    if (hasEnteredAmount(data.gamblingLosses) && !hasEnteredAmount(data.gamblingWinnings)) errors.gamblingWinnings = "Enter actual gambling winnings, including an explicit zero, before claiming wagering losses.";
    if (hasEnteredAmount(data.otherItemized) && !errors.otherItemized && !errors.investmentInterestExpense && !errors.gamblingLosses) {
      const classified = parseGuidedCurrency(data.investmentInterestExpense).plus(parseGuidedCurrency(data.gamblingLosses));
      if (!classified.eq(parseGuidedCurrency(data.otherItemized))) errors.otherItemized = "Classify and reconcile the saved other-deduction total as investment interest or wagering losses. Other deductions need their supporting forms.";
    }
  }
  const mortgages = data.method === "itemized" ? data.mortgageEntries ?? [] : [];
  const donations = data.donationEntries ?? [];
  if (data.method === "itemized" && hasPositiveAmount("mortgageInterest") && !mortgages.length) errors.mortgages = "Enter the mortgage lender, principal and origination date for the saved mortgage interest.";
  if (hasPositiveAmount("charitableContributions") && !donations.length) errors.donations = "Enter donation recipient, type and date for the saved charitable contributions.";
  Object.assign(errors, mortgageFactErrors(mortgages, taxYear, filingStatus));
  donations.forEach((entry, index) => {
    if (!entry.organization.trim()) errors[`donation-${index}-organization`] = "Enter the actual donation recipient.";
    if (!["cash", "appreciated_stock", "property", "other"].includes(entry.type)) errors[`donation-${index}-type`] = "Choose the actual donation type.";
    const error = amountError(entry.amount, "donation amount");
    if (error) errors[`donation-${index}-amount`] = error;
    if (!isActualDate(entry.date) || (taxYear != null && !entry.date.startsWith(`${taxYear}-`))) errors[`donation-${index}-date`] = "Enter the actual donation date in the selected tax year.";
    if (typeof entry.isPrivateFoundation !== "boolean") errors[`donation-${index}-classification`] = "Confirm the donation recipient's organization classification.";
    if (taxYear === 2026 && data.method === "standard") {
      for (const field of ["qualifiedOrganization", "supportingOrganization", "donorAdvisedFund"] as const) {
        if (typeof entry[field] !== "boolean") errors[`donation-${index}-${field}`] = "Confirm the recipient's eligibility for the 2026 nonitemizer deduction.";
      }
    }
    if (entry.type && entry.type !== "cash") {
      const basisError = amountError(entry.costBasis, "donated property's cost basis");
      if (basisError) errors[`donation-${index}-basis`] = basisError;
      if (typeof entry.isLongTermCapitalGain !== "boolean") errors[`donation-${index}-capital-gain`] = "Confirm whether the donated property is long-term capital gain property.";
      if (taxYear === 2026 && entry.isPrivateFoundation && entry.isLongTermCapitalGain
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

export function paymentFactErrors(entries: EstimatedPaymentEntry[] | undefined, taxYear?: number | null): Record<string, string> {
  const errors: Record<string, string> = {};
  (entries ?? []).forEach((entry, index) => {
    const amount = amountError(entry.amount, "payment amount");
    if (amount) errors[`payment-${index}-amount`] = amount;
    if (!isActualDate(entry.date) || (taxYear != null && ![taxYear, taxYear + 1].some((year) => entry.date.startsWith(`${year}-`)))) errors[`payment-${index}-date`] = "Enter the actual payment date in the tax year or following year.";
  });
  return errors;
}

export function allPaymentFactErrors(data: PaymentData | undefined, taxYear?: number | null): Record<string, string> {
  if (!data) return {};
  const errors = paymentFactErrors(data.estimatedPayments, taxYear);
  for (const [key, value] of Object.entries(paymentFactErrors(data.extensionPayments, taxYear))) errors[`extension-${key}`] = value;
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

export function retirementFactErrors(entries: RetirementEntryData[] | undefined, requireTaxableAmount = true): Record<string, string> {
  const errors: Record<string, string> = {};
  (entries ?? []).forEach((entry, index) => {
    if (![entry.payer, entry.grossDistribution, entry.taxableAmount, entry.federalWithheld, entry.distributionCode].some((value) => value?.trim())) return;
    if (!entry.payer.trim()) errors[`retirement-${index}-payer`] = "Enter the actual retirement payer.";
    if (!/^[1-9ABCDEFGHJKLMNPQRSTUWY][1-9ABCDEFGHJKLMNPQRSTUWY]?$/.test(entry.distributionCode)) errors[`retirement-${index}-code`] = "Enter the actual Form 1099-R box 7 distribution code.";
    if (entry.requiresCodeConfirmation) errors[`retirement-${index}-code`] = "Reconfirm the saved distribution code from the actual Form 1099-R; older versions prefilled code 7.";
    for (const field of ["grossDistribution", ...(requireTaxableAmount ? ["taxableAmount" as const] : [])] as const) {
      const error = amountError(entry[field], field === "taxableAmount" ? "taxable amount (unknown amounts require review)" : "gross distribution");
      if (error) errors[`retirement-${index}-${field}`] = error;
    }
    if (hasEnteredAmount(entry.taxableAmount) && hasEnteredAmount(entry.grossDistribution)) {
      try { if (parseGuidedCurrency(entry.taxableAmount).gt(parseGuidedCurrency(entry.grossDistribution))) errors[`retirement-${index}-taxableAmount`] = "Taxable amount cannot exceed gross distribution; review the source form."; } catch { /* Field error is reported above. */ }
    }
  });
  return errors;
}

export { educationFactErrors } from "./guided-education-facts";

export function assertKnownFacts(errors: Record<string, string>): void {
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);
}
