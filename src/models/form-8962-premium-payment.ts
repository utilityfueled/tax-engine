import Decimal from "decimal.js";
import type { Form8962Schema } from "./inputs.js";
import type { z } from "zod";

type CoverageMonth = NonNullable<z.infer<typeof Form8962Schema>["monthlyReconciliation"]>[number];

/** Validate a reconciled enrollment premium against the selected statement and actual payment facts. */
export function validateForm8962EnrollmentPremium(
  source: { premium: Decimal; advance: Decimal },
  eligiblePremium: Decimal,
  payment: CoverageMonth["zeroReportedPremiumPayment"],
  ordinaryEligibleMonth: boolean,
): boolean {
  const hasPaymentClaim = payment?.amountPaid !== undefined || payment?.paidByUnextendedReturnDueDate === true;
  if (!hasPaymentClaim && eligiblePremium.lte(source.premium)) return false;
  if (!source.premium.isZero()) {
    if (eligiblePremium.gt(source.premium)) throw new Error("Form 8962 eligible premium exceeds source enrollment premiums");
    throw new Error("Form 8962 payment correction requires an original enrollment premium of zero");
  }
  if (!ordinaryEligibleMonth) throw new Error("Form 8962 zero-reported premium payment requires one original policy and an eligible ordinary coverage month");
  if (payment?.paidByUnextendedReturnDueDate !== true || payment.amountPaid === undefined) {
    throw new Error("Form 8962 zero-reported premium requires the actual amount paid by the unextended return due date");
  }
  const amountPaid = new Decimal(payment.amountPaid);
  if (!amountPaid.isFinite() || !amountPaid.gt(0) || !amountPaid.plus(source.advance).eq(eligiblePremium)) {
    throw new Error("Form 8962 eligible premium must equal the actual taxpayer payment plus original advance credit");
  }
  return true;
}
