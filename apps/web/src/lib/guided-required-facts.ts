import Decimal from "decimal.js";
import type { CreditsData, DeductionData, EstimatedPaymentEntry, RetirementEntryData, FilingStatus, PaymentData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";

export function isActualDate(value: string | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function hasEnteredAmount(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function amountError(value: string | undefined, label: string): string | undefined {
  if (!hasEnteredAmount(value)) return `Enter the actual ${label}; enter 0 only if it is zero.`;
  try { if (parseGuidedCurrency(value).isNegative()) return `${label} cannot be negative.`; }
  catch { return `Enter a valid ${label}.`; }
  return undefined;
}

export function deductionFactErrors(data: DeductionData | undefined, taxYear?: number | null): Record<string, string> {
  if (!data) return {};
  const errors: Record<string, string> = {};
  const mortgages = data.method === "itemized" ? data.mortgageEntries ?? [] : [];
  const donations = data.donationEntries ?? [];
  if (data.method === "itemized" && hasEnteredAmount(data.mortgageInterest) && !parseGuidedCurrency(data.mortgageInterest).isZero() && !mortgages.length) errors.mortgages = "Enter the mortgage lender, principal and origination date for the saved mortgage interest.";
  if (hasEnteredAmount(data.charitableContributions) && !parseGuidedCurrency(data.charitableContributions).isZero() && !donations.length) errors.donations = "Enter donation recipient, type and date for the saved charitable contributions.";
  mortgages.forEach((entry, index) => {
    if (!entry.lender.trim()) errors[`mortgage-${index}-lender`] = "Enter the actual mortgage lender.";
    for (const [field, label] of [["mortgageInterest", "mortgage interest"], ["outstandingPrincipal", "mortgage principal"]] as const) {
      const error = amountError(entry[field], label);
      if (error) errors[`mortgage-${index}-${field}`] = error;
    }
    if (!isActualDate(entry.originationDate) || (taxYear != null && entry.originationDate > `${taxYear}-12-31`)) errors[`mortgage-${index}-date`] = "Enter the actual mortgage origination date, no later than the tax year.";
  });
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

export function educationFactErrors(data: CreditsData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null): Record<string, string> {
  const errors: Record<string, string> = {};
  let hasLifetimeLearningClaim = false;
  if (hasEnteredAmount(data?.education.llcExpenses)) {
    const error = amountError(data?.education.llcExpenses, "Lifetime Learning expenses");
    if (error) errors.llcExpenses = error;
    else hasLifetimeLearningClaim = parseGuidedCurrency(data?.education.llcExpenses).gt(0);
  }
  if (taxYear === 2026 && hasLifetimeLearningClaim) errors.llcStudent = "The saved Lifetime Learning total needs each student's identity and SSN eligibility. This entry cannot be calculated until those facts are supported.";
  (data?.education.aocStudents ?? []).forEach((student, index) => {
    if (!student.name.trim()) errors[`student-${index}-name`] = "Enter the actual student name.";
    const amount = amountError(student.qualifiedExpenses, "qualified education expenses");
    if (amount) errors[`student-${index}-amount`] = amount;
    if (!/^[0-4]$/.test(student.priorYearsClaimed)) errors[`student-${index}-history`] = "Confirm prior years AOTC was claimed (0–4; choose 4 for four or more).";
    if (student.requiresPriorYearsConfirmation) errors[`student-${index}-history`] = "Reconfirm prior AOTC claims from actual records; older versions prefilled zero.";
    for (const field of ["completedFirstFourYearsBeforeYear", "enrolledAtLeastHalfTime", "pursuingDegreeOrCredential", "felonyDrugConviction"] as const) {
      if (typeof student[field] !== "boolean") errors[`student-${index}-${field}`] = "Confirm all AOTC student eligibility facts before calculating.";
    }
    if (taxYear === 2026) {
      if (typeof student.studentSsnEligible !== "boolean") errors[`student-${index}-ssn`] = "Confirm the student's employment-valid SSN was issued by the return due date.";
      if (!/^\d{2}-?\d{7}$/.test(student.institutionEin ?? "")) errors[`student-${index}-ein`] = "Enter the institution EIN from Form 1098-T.";
    }
  });
  if (data?.education.aocStudents.length && typeof data.education.refundableAocEligible !== "boolean") errors.refundableAocEligible = "Confirm the taxpayer's refundable AOTC eligibility from the Form 8863 instructions.";
  if (data && taxYear === 2026 && (data.education.aocStudents.length || hasLifetimeLearningClaim)) {
    if (typeof data.education.primarySsnEligible !== "boolean") errors.primarySsnEligible = "Confirm the taxpayer's education-credit SSN eligibility.";
    if (filingStatus === "mfj" && typeof data.education.spouseSsnEligible !== "boolean") errors.spouseSsnEligible = "Confirm the spouse's education-credit SSN eligibility.";
  }
  return errors;
}

export function assertKnownFacts(errors: Record<string, string>): void {
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);
}
