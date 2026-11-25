/** Ohio R.C. 5747.058(A). Spec: spec/state/oh-2026-refundable-jobs-credit-draft.yaml. */
import { z } from "zod";
import type { TaxYearInput } from "@/models/inputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

const originalText = z.string().trim().min(1).max(160);
const holderSchema = z.strictObject({
  firstName: originalText,
  lastName: originalText,
  taxIdLast4: z.string().regex(/^\d{4}$/u),
});
const certificateFields = {
  issuer: z.literal("ohio_department_of_development"),
  returnType: z.literal("IT1040"),
  taxYear: z.literal(2026),
  reference: originalText,
  holder: holderSchema,
  issueDate: z.iso.date(),
  amount: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u),
  originalVerified: z.literal(true),
  currentAndUnrevokedConfirmed: z.literal(true),
  directIndividualHolderConfirmed: z.literal(true),
  ordinaryNonMegaprojectConfirmed: z.literal(true),
};
const legacyAgreement = z.strictObject({
  reference: originalText,
  holder: holderSchema,
  originalVerified: z.literal(true),
  grantDate: z.iso.date(),
  firstTaxYear: z.int(),
  lastTaxYear: z.int(),
});
const sourcesSchema = z.strictObject({
  calendarYearReturnConfirmed: z.literal(true),
  asOfDate: z.iso.date(),
  noDisqualifyingRelocationConfirmed: z.literal(true),
  certificate: z.discriminatedUnion("authority", [
    z.strictObject({ ...certificateFields, authority: z.literal("122.17(B)") }),
    z.strictObject({
      ...certificateFields, authority: z.literal("former 122.171(B)(2)"),
      agreementReference: originalText, agreement: legacyAgreement.extend({ recommendationDate: z.iso.date() }),
    }),
    z.strictObject({
      ...certificateFields, authority: z.literal("former 122.171(B)(3)"),
      agreementReference: originalText, agreement: legacyAgreement,
    }),
  ]),
});

export function calculateOhio2026RefundableJobsCreditDraft(
  input: Pick<TaxYearInput, "taxpayer" | "standardDeductionFacts">,
  rawSources: unknown,
) {
  const sources = sourcesSchema.safeParse(rawSources);
  if (!sources.success) throw new Error("Provide a complete verified Ohio 2026 direct individual refundable jobs credit certificate.");
  const { certificate, asOfDate } = sources.data;
  const { taxpayer, standardDeductionFacts } = input;
  const { primary } = taxpayer;
  // The standard deduction facts supply the canonical short accounting-year flag.
  if (taxpayer.taxYear !== 2026 || taxpayer.filingStatus !== "single" || taxpayer.spouse
    || standardDeductionFacts?.shortTaxYear === true) {
    throw new Error("This Ohio credit draft requires a single 2026 calendar-year taxpayer.");
  }
  const taxId = primary.ssn.trim();
  const digits = taxId.replaceAll("-", "");
  const matchesPrimary = (holder: z.infer<typeof holderSchema>) => holder.firstName.toLowerCase() === primary.firstName.trim().toLowerCase()
    && holder.lastName.toLowerCase() === primary.lastName.trim().toLowerCase() && holder.taxIdLast4 === digits.slice(-4);
  if (!/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/u.test(taxId) || digits === "000000000" || !matchesPrimary(certificate.holder)) {
    throw new Error("Reconcile the certificate with the actual taxpayer holder.");
  }
  if (certificate.issueDate < "2027-01-01" || certificate.issueDate > asOfDate) {
    throw new Error("Reconcile the annual certificate issue date with the draft as-of date.");
  }
  if (certificate.authority !== "122.17(B)") {
    const { agreement } = certificate;
    if (agreement.reference !== certificate.agreementReference || !matchesPrimary(agreement.holder)
      || agreement.grantDate >= "2015-09-29" || agreement.firstTaxYear < Number(agreement.grantDate.slice(0, 4))
      || agreement.firstTaxYear > 2026 || agreement.lastTaxYear < 2026
      || agreement.lastTaxYear - agreement.firstTaxYear + 1 > 15) {
      throw new Error("Reconcile the original holder, reference and operative term of the legacy agreement.");
    }
    const datesQualify = certificate.authority === "former 122.171(B)(2)"
      ? certificate.agreement.recommendationDate < "2011-07-01" && certificate.agreement.recommendationDate <= agreement.grantDate
      : agreement.grantDate >= "2011-07-01" && agreement.grantDate < "2014-01-01";
    if (!datesQualify) throw new Error("Reconcile the actual legacy grant and recommendation dates with the refundable award authority.");
  }
  const deemedPaymentDate = "2026-01-01";
  const audit = new AuditTrail();
  const refundableCredit = audit.record("Ohio 2026 refundable jobs credit draft", "certified-credit",
    "Certified refundable jobs credit", d(certificate.amount), "Use the certificate amount under R.C. 5747.058(A).",
    { "Award authority": certificate.authority, "Deemed payment date": deemedPaymentDate });
  return {
    status: "incomplete_draft" as const,
    filingQualified: false as const,
    refundableCredit, deemedPaymentDate, lines: audit.getLines(),
  };
}
