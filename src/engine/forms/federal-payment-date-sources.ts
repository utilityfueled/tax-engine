/** Source validation for Form 1040 line 26 and Schedule 3 line 10. */
import { z } from "zod";
import type { TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";

const actualDate = z.iso.date().refine(date => !date.startsWith("0000-"));

export function assertFederalPaymentDates(input: Pick<TaxYearInput, "taxpayer" | "adjustments">): void {
  const year = input.taxpayer.taxYear;
  for (const payment of [...(input.adjustments?.estimatedTaxPayments ?? []), ...(input.adjustments?.extensionPayments ?? [])]) {
    if (payment.type !== "federal") continue;
    if (!actualDate.safeParse(payment.date).success) {
      throw new Error("Federal estimated or extension payment requires its actual calendar date.");
    }
    if (typeof payment.amount !== "string" || !/^\d+(?:\.\d+)?$/u.test(payment.amount) || !d(payment.amount).isFinite()) {
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
}
