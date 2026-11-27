import { resolveCharitableRecipient } from "@/utils/charitable-recipient";
import { CharitableTangiblePropertyUseSchema } from "@/models/inputs";
import {
  normalizeFederalPaymentReceiptReference,
  repeatedFederalAppliedCreditIndices,
  supportsFederalPaymentReceiptReferences,
} from "@/engine/forms/federal-payment-date-sources";
import { valueOrdinaryTangibleProperty } from "@/utils/charitable-current-receipts";
import { currentLocalCivilDate, isActualDate } from "@/utils/civil-date";
import { sumSourceMoney, sumSourceMoneyValues } from "@/utils/sum-source-money";
import Decimal from "decimal.js";
import type { DeductionData, DonationEntryData, EstimatedPaymentEntry, PaymentData, FilingStatus } from "./guided-interview-flow";
import { parseGuidedCurrency, parseGuidedDisplayAmount } from "./guided-currency";
import { mortgageWorksheetFactErrors } from "./guided-mortgage-worksheet";

export { currentLocalCivilDate, isActualDate, normalizeFederalPaymentReceiptReference, supportsFederalPaymentReceiptReferences };

export function hasEnteredAmount(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/** A formatting-only edit keeps confirmation. Blank and an explicit zero are different facts. */
export function guidedAmountChanged(before: string | undefined, after: string | undefined): boolean {
  if (before === after) return false;
  return hasEnteredAmount(before) !== hasEnteredAmount(after)
    || !parseGuidedDisplayAmount(before).eq(parseGuidedDisplayAmount(after));
}

export function invalidateEditedNoncashDonationDates(previous: DonationEntryData[] | undefined, next: DonationEntryData[]): DonationEntryData[] {
  if (!previous?.length || !next.length) return next;
  const sameGift = (original: DonationEntryData, gift: DonationEntryData) => original.type === gift.type
    && original.organization?.trim() === gift.organization?.trim()
    && !guidedAmountChanged(original.amount, gift.amount) && !guidedAmountChanged(original.costBasis, gift.costBasis);
  const sameDatedAnswers = (original: DonationEntryData, gift: DonationEntryData) => {
    const originalUse = original.tangiblePropertyUse;
    const giftUse = gift.tangiblePropertyUse;
    return original.isLongTermCapitalGain === gift.isLongTermCapitalGain
      && (original.qualifiedAppreciatedStock ?? null) === (gift.qualifiedAppreciatedStock ?? null)
      && originalUse?.sourceReference === giftUse?.sourceReference
      && originalUse?.doneeUse === giftUse?.doneeUse
      && originalUse?.ordinaryWholeInterestConfirmed === giftUse?.ordinaryWholeInterestConfirmed
      && originalUse?.noAdditionalValuationRuleConfirmed === giftUse?.noAdditionalValuationRuleConfirmed;
  };
  const unmatched = new Set(previous.keys());
  const retained = new Set<number>();
  const keepOriginal = (index: number, originalIndex: number) => {
    unmatched.delete(originalIndex);
    retained.add(index);
  };
  const giftCandidates = (gift: DonationEntryData) => [...unmatched].filter(candidate => sameGift(previous[candidate], gift));
  const differentActualDate = (original: DonationEntryData, gift: DonationEntryData) =>
    isActualDate(original.date) && original.date !== gift.date;

  next.forEach((gift, index) => {
    const originalIndex = [...unmatched].find(candidate => previous[candidate] === gift);
    if (originalIndex !== undefined) keepOriginal(index, originalIndex);
  });
  next.forEach((gift, index) => {
    if (retained.has(index)) return;
    const candidates = giftCandidates(gift);
    const otherDates = candidates.filter(candidate => differentActualDate(previous[candidate], gift));
    const originalIndex = candidates.find(candidate => previous[candidate].date === gift.date
      && (gift.type === "cash" || !otherDates.length || (sameDatedAnswers(previous[candidate], gift)
        && !otherDates.some(other => sameDatedAnswers(previous[other], gift)))));
    if (originalIndex !== undefined) keepOriginal(index, originalIndex);
  });

  return next.map((gift, index) => {
    if (retained.has(index) || !gift.type || gift.type === "cash") return gift;
    const candidates = giftCandidates(gift);
    const positionalOriginal = unmatched.has(index) ? previous[index] : undefined;
    const reviewDate = candidates.length
      ? candidates.some(candidate => differentActualDate(previous[candidate], gift))
      : positionalOriginal?.type && positionalOriginal.type !== "cash" && differentActualDate(positionalOriginal, gift);
    if (!reviewDate) return gift;

    return { ...gift, isLongTermCapitalGain: null,
      ...(gift.qualifiedAppreciatedStock !== undefined ? { qualifiedAppreciatedStock: null } : {}),
      ...(gift.tangiblePropertyUse !== undefined ? { tangiblePropertyUse: undefined } : {}),
    };
  });
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

export function guidedDonationValue(entry: DonationEntryData): Decimal {
  const amount = parseGuidedCurrency(entry.amount);
  if (requiresGuidedTangiblePropertyUse(entry)) {
    const use = readGuidedTangiblePropertyUse(entry);
    if (!use) throw new Error(tangiblePropertyUseError(entry));
    return valueOrdinaryTangibleProperty(amount, parseGuidedCurrency(entry.costBasis), use.doneeUse);
  }
  if (entry.type !== "cash" || entry.qualifiedOrganization === false || amount.isZero()) return amount;
  if (entry.cashAmountBasis === "net-contribution") {
    if (hasEnteredAmount(entry.cashBenefitValue) || entry.cashExcessGiftIntended != null) {
      throw new Error("Reconcile the gross-payment facts before using a net charitable contribution.");
    }
    return amount;
  }
  if (entry.cashAmountBasis !== "gross-payment") {
    throw new Error("Confirm whether the saved cash amount is a net charitable contribution or a gross payment.");
  }
  const benefitError = amountError(entry.cashBenefitValue, "fair market value of goods or services");
  if (benefitError) throw new Error(benefitError);
  const benefit = parseGuidedCurrency(entry.cashBenefitValue);
  if (benefit.isZero()) return amount;
  if (amount.lte(benefit)) return new Decimal(0);
  if (typeof entry.cashExcessGiftIntended !== "boolean") {
    throw new Error("Confirm whether you intended to contribute the amount above the value of the goods or services.");
  }
  return entry.cashExcessGiftIntended ? sumSourceMoney(amount, benefit.negated()) : new Decimal(0);
}

export function requiresGuidedTangiblePropertyUse(entry: DonationEntryData): boolean {
  return (entry.type === "property" || entry.type === "other") && entry.isLongTermCapitalGain === true
    && entry.qualifiedOrganization === true && entry.recipientCategory !== "private-nonoperating"
    && parseGuidedDisplayAmount(entry.amount).gt(0);
}

export function readGuidedTangiblePropertyUse(entry: DonationEntryData) {
  return requiresGuidedTangiblePropertyUse(entry) && entry.recipientCategory === "fifty-percent"
    ? CharitableTangiblePropertyUseSchema.safeParse(entry.tangiblePropertyUse).data : undefined;
}

function tangiblePropertyUseError(entry: DonationEntryData): string {
  return entry.recipientCategory === "fifty-percent"
    ? "Confirm actual donee use and the source facts for this ordinary tangible property gift."
    : "This capital property method requires an actual 50%-limit organization. Confirm the recipient's category from your records.";
}

export function deductionFactErrors(data: DeductionData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, spouse?: unknown, paidThroughDate?: string): Record<string, string> {
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
    if (!isActualDate(entry.date) || (taxYear != null && !entry.date.startsWith(`${taxYear}-`))) {
      errors[`donation-${index}-date`] = "Enter the actual donation date in the selected tax year.";
    } else if (taxYear === 2026 && paidThroughDate && entry.date > paidThroughDate && !error && parseGuidedCurrency(entry.amount).gt(0)) {
      errors[`donation-${index}-date`] = "Enter the date you already paid the donation. A future gift cannot be included.";
    }
    if (typeof entry.qualifiedOrganization !== "boolean") errors[`donation-${index}-qualification`] = "Confirm the recipient's actual charitable qualification.";
    if (entry.qualifiedOrganization === false) return;
    if (entry.type === "cash" && entry.qualifiedOrganization === true && !error) {
      try { guidedDonationValue(entry); }
      catch (cause) { errors[`donation-${index}-cash-basis`] = cause instanceof Error ? cause.message : "Confirm the actual cash contribution amount."; }
    }
    let privateNonoperating = false;
    try { privateNonoperating = resolveCharitableRecipient(entry).privateNonoperating; }
    catch { errors[`donation-${index}-classification`] = "Confirm the actual recipient tax category; the saved foundation answer is ambiguous."; }
    if (requiresGuidedTangiblePropertyUse(entry) && !readGuidedTangiblePropertyUse(entry)) {
      errors[`donation-${index}-tangible-property-use`] = tangiblePropertyUseError(entry);
    }
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
      const total = sumSourceMoney(...entries.map(entry => parseGuidedCurrency((entry as unknown as Record<string, string>)[amountField])));
      if (!total.eq(parseGuidedCurrency(data[field]))) errors[field] = "The saved total and source entries differ; reconcile the amounts before calculating.";
    }
  }
  return errors;
}

export type FederalPaymentKind = "estimate" | "extension";

export function federalPaymentDateNeedsApplication(date: string, taxYear?: number | null, kind?: FederalPaymentKind): boolean {
  if (taxYear == null || !isActualDate(date) || date.startsWith("0000-")) return false;
  const paidYear = Number(date.slice(0, 4));
  if (kind === "estimate") return paidYear !== taxYear || date.slice(5, 7) === "01";
  return paidYear !== taxYear && paidYear !== taxYear + 1;
}

export function paymentFactErrors(entries: EstimatedPaymentEntry[] | undefined, taxYear?: number | null, kind?: FederalPaymentKind): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!entries?.length) return errors;
  const paidThroughDate = currentLocalCivilDate();
  entries.forEach((entry, index) => {
    const amount = amountError(entry.amount, "payment amount");
    if (amount) errors[`payment-${index}-amount`] = amount;
    if (!isActualDate(entry.date) || entry.date.startsWith("0000-")) errors[`payment-${index}-date`] = "Enter the actual payment date from the federal record.";
    else if (entry.date > paidThroughDate) errors[`payment-${index}-date`] = "The payment date is in the future. Enter the date the payment was made.";
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

export function federalPaymentReceiptFacts(data: PaymentData | undefined, taxYear?: number | null) {
  const errors: Record<string, string> = {};
  const calculationReferences = { estimate: new Map<number, string>(), extension: new Map<number, string>() };
  if (!data || !supportsFederalPaymentReceiptReferences(taxYear)) return { errors, calculationReferences };
  const referenceFields = new Map<string, string>();
  const matchingPayments = new Map<string, { kind: FederalPaymentKind; index: number; errorField: string; reference: string }[]>();

  function record(entries: EstimatedPaymentEntry[], kind: FederalPaymentKind) {
    const prefix = kind === "extension" ? "extension-" : "";
    entries.forEach((entry, index) => {
      const errorField = `${prefix}payment-${index}-receipt-reference`;
      const reference = normalizeFederalPaymentReceiptReference(entry.receiptReference);
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
      group.push({ kind, index, errorField, reference });
      matchingPayments.set(key, group);
    });
  }

  record(data.estimatedPayments ?? [], "estimate");
  record(data.extensionPayments ?? [], "extension");
  for (const group of matchingPayments.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      if (!row.reference) errors[row.errorField] = "Enter a distinct actual receipt reference for each federal payment with the same date and amount.";
      else if (taxYear === 2026) calculationReferences[row.kind].set(row.index, `guided-${row.kind}-receipt-${row.index + 1}`);
    }
  }
  return { errors, calculationReferences };
}

export function allPaymentFacts(data: PaymentData | undefined, taxYear?: number | null) {
  const receiptFacts = federalPaymentReceiptFacts(data, taxYear);
  if (!data) return receiptFacts;
  const errors = paymentFactErrors(data.estimatedPayments, taxYear, "estimate");
  for (const [key, value] of Object.entries(paymentFactErrors(data.extensionPayments, taxYear, "extension"))) errors[`extension-${key}`] = value;
  Object.assign(errors, receiptFacts.errors);
  const credits = (data.priorYearAppliedCredits ?? []).map((entry, index) => {
    const error = amountError(entry.amount, "applied refund amount");
    const sourceTaxYear = Number(entry.sourceTaxYear);
    const validSourceYear = /^\d{4}$/.test(entry.sourceTaxYear) && (taxYear == null || sourceTaxYear === taxYear - 1);
    if (error) errors[`credit-${index}-amount`] = error;
    if (!validSourceYear) errors[`credit-${index}-year`] = "Enter the immediately preceding tax year from the return that applied this refund.";
    return taxYear === 2026 && !error && validSourceYear ? { sourceTaxYear, amount: parseGuidedCurrency(entry.amount) } : undefined;
  });
  if (taxYear === 2026) {
    for (const index of repeatedFederalAppliedCreditIndices(credits)) {
      errors[`credit-${index}-amount`] = `Applied refund #${index + 1} matches the amount in another row for the same prior-year federal return. Check the matching rows against that return.`;
    }
  }
  if (hasEnteredAmount(data.otherPayments)) {
    const error = amountError(data.otherPayments, "saved other-payment total");
    if (error) errors.otherPayments = error;
    else if (!Object.keys(errors).length) {
      const classified = sumSourceMoneyValues(
        [...data.extensionPayments ?? [], ...data.priorYearAppliedCredits ?? []].map(entry => parseGuidedCurrency(entry.amount)),
      );
      if (!classified.eq(parseGuidedCurrency(data.otherPayments))) errors.otherPayments = "Classify the saved other-payment total as extension payments or prior-year applied refunds. Other credits need their specific supporting forms.";
    }
  }
  return { errors, calculationReferences: receiptFacts.calculationReferences };
}

export function allPaymentFactErrors(data: PaymentData | undefined, taxYear?: number | null): Record<string, string> {
  return allPaymentFacts(data, taxYear).errors;
}

export { retirementFactErrors } from "./guided-retirement-facts";

export { educationFactErrors } from "./guided-education-facts";

export function assertKnownFacts(errors: Record<string, string>): void {
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);
}
