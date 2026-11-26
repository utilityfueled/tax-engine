/** Source validation for Form 1040 line 26 and Schedule 3 line 10. */
import type Decimal from "decimal.js";
import { z } from "zod";
import type { TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";

const actualDate = z.iso.date().refine(date => !date.startsWith("0000-"));

function isActualPaymentAmount(amount: string): boolean {
  return typeof amount === "string" && /^\d+(?:\.\d+)?$/u.test(amount) && d(amount).isFinite();
}

/** Find ambiguous applied credits after source-year and amount validation. */
export function repeatedFederalAppliedCreditIndices(
  credits: readonly ({ sourceTaxYear: number; amount: Decimal } | undefined)[],
): number[] {
  const firstByYearAndAmount = new Map<string, number>();
  const repeated = new Set<number>();
  credits.forEach((credit, index) => {
    if (!credit?.amount.gt(0)) return;
    const key = `${credit.sourceTaxYear}:${credit.amount.toFixed()}`;
    const first = firstByYearAndAmount.get(key);
    if (first === undefined) {
      firstByYearAndAmount.set(key, index);
    } else {
      repeated.add(first);
      repeated.add(index);
    }
  });
  return [...repeated];
}

export function assertPriorReturnCreditSource(
  amount: Decimal,
  priorYearTaxStatus: NonNullable<TaxYearInput["form2210"]>["priorYearTaxStatus"],
  hasSingleTaxpayer: boolean,
): void {
  if (hasSingleTaxpayer && priorYearTaxStatus === "no-return" && amount.gt(0)) {
    throw new Error("A positive prior-return credit conflicts with the reported absence of a prior return. Reconcile the credit and prior-return history.");
  }
}

export function assertFederalPaymentSources(input: Pick<TaxYearInput, "taxpayer" | "adjustments" | "form2210">): void {
  const year = input.taxpayer.taxYear;
  for (const payment of [...(input.adjustments?.estimatedTaxPayments ?? []), ...(input.adjustments?.extensionPayments ?? [])]) {
    if (payment.type !== "federal") continue;
    if (!actualDate.safeParse(payment.date).success) {
      throw new Error("Federal estimated or extension payment requires its actual calendar date.");
    }
    if (!isActualPaymentAmount(payment.amount)) {
      throw new Error("Federal estimated or extension payment requires a confirmed nonnegative amount.");
    }
    if (payment.application !== undefined) {
      if (payment.application?.taxYear !== year || payment.application.confirmed !== true) {
        throw new Error("Federal payment application must be confirmed for this return's tax year.");
      }
    } else {
      const paidYear = Number(payment.date.slice(0, 4));
      if (paidYear !== year && paidYear !== year + 1) {
        throw new Error("Federal payment outside the return year and following year requires its confirmed tax-year application.");
      }
    }
  }
  const appliedCredits: { sourceTaxYear: number; amount: Decimal }[] = [];
  for (const credit of input.adjustments?.priorYearAppliedCredits ?? []) {
    if (credit.type !== "federal") continue;
    if (credit.sourceTaxYear !== year - 1) {
      throw new Error("Federal prior-return applied credit has an invalid source year.");
    }
    if (!isActualPaymentAmount(credit.amount)) {
      throw new Error("Federal prior-return applied credit requires a confirmed nonnegative amount.");
    }
    const amount = d(credit.amount);
    // An ownerless credit on a joint return may come from a spouse's separate prior return.
    assertPriorReturnCreditSource(amount, input.form2210?.priorYearTaxStatus, input.taxpayer.filingStatus !== "married_filing_jointly");
    appliedCredits.push({ sourceTaxYear: credit.sourceTaxYear, amount });
  }
  if (year === 2026 && repeatedFederalAppliedCreditIndices(appliedCredits).length) {
    throw new Error("More than one entry matches the same prior-year federal applied credit. Reconcile the actual prior-return credit before calculating.");
  }
}
