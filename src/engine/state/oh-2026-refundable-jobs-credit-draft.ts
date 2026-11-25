/** Ohio R.C. 5747.058(A). Spec: spec/state/oh-2026-refundable-jobs-credit-draft.yaml. */
import Decimal from "decimal.js";
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
const entityHolderSchema = z.strictObject({
  legalName: originalText,
  taxIdLast4: z.string().regex(/^\d{4}$/u),
});
const full2026EntityPeriod = z.strictObject({
  startDate: z.literal("2026-01-01"),
  endDate: z.literal("2026-12-31"),
});
const cents = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u);
// Each two-operand cross product may have up to 28 significant digits.
const AllocationDecimal = Decimal.clone({ precision: 28 });
const certificateFields = {
  issuer: z.literal("ohio_department_of_development"),
  taxYear: z.literal(2026),
  reference: originalText,
  issueDate: z.iso.date(),
  amount: cents,
  originalVerified: z.literal(true),
  currentAndUnrevokedConfirmed: z.literal(true),
  ordinaryNonMegaprojectConfirmed: z.literal(true),
};
const directCertificateFields = {
  ...certificateFields,
  returnType: z.literal("IT1040"),
  holder: holderSchema,
  directIndividualHolderConfirmed: z.literal(true),
};
const legacyAgreement = z.strictObject({
  reference: originalText,
  holder: holderSchema,
  originalVerified: z.literal(true),
  grantDate: z.iso.date(),
  firstTaxYear: z.int(),
  lastTaxYear: z.int(),
});
const sourceFields = {
  calendarYearReturnConfirmed: z.literal(true),
  asOfDate: z.iso.date(),
  noDisqualifyingRelocationConfirmed: z.literal(true),
};
const directSources = z.strictObject({
  ...sourceFields,
  certificate: z.discriminatedUnion("authority", [
    z.strictObject({ ...directCertificateFields, authority: z.literal("122.17(B)") }),
    z.strictObject({
      ...directCertificateFields, authority: z.literal("former 122.171(B)(2)"),
      agreementReference: originalText, agreement: legacyAgreement.extend({ recommendationDate: z.iso.date() }),
    }),
    z.strictObject({
      ...directCertificateFields, authority: z.literal("former 122.171(B)(3)"),
      agreementReference: originalText, agreement: legacyAgreement,
    }),
  ]),
});
const allocatedSources = z.strictObject({
  ...sourceFields,
  certificate: z.strictObject({
    ...certificateFields,
    authority: z.literal("122.17(B)"),
    entityPeriod: full2026EntityPeriod,
    awardReference: originalText,
    holder: entityHolderSchema,
  }),
  allocation: z.strictObject({
    annualElection: z.strictObject({
      taxYear: z.literal(2026),
      entityPeriod: full2026EntityPeriod,
      entity: entityHolderSchema,
      awardReference: originalText,
      reportReference: originalText,
      submittedOn: z.iso.date(),
      originalVerified: z.literal(true),
      qualifyingPassThroughEntityConfirmed: z.literal(true),
      electionOnSubmittedReportConfirmed: z.literal(true),
    }),
    ownerShare: z.strictObject({
      taxYear: z.literal(2026),
      entityPeriod: full2026EntityPeriod,
      entity: entityHolderSchema,
      certificateReference: originalText,
      claimant: holderSchema,
      reference: originalText,
      verified: z.literal(true),
      directOwnerConfirmed: z.literal(true),
      noDuplicateClaimConfirmed: z.literal(true),
      distributionBasis: z.literal("actual_income_or_profit_distributions"),
      claimantDistribution: cents,
      totalDistribution: cents,
      documentedCredit: cents,
    }),
  }),
});
const sourcesSchema = z.union([directSources, allocatedSources]);

export function calculateOhio2026RefundableJobsCreditDraft(
  input: Pick<TaxYearInput, "taxpayer" | "standardDeductionFacts">,
  rawSources: unknown,
) {
  const sources = sourcesSchema.safeParse(rawSources);
  if (!sources.success) throw new Error("Provide a complete verified Ohio 2026 jobs credit certificate and any applicable owner allocation evidence.");
  const packet = sources.data;
  const { certificate, asOfDate } = packet;
  const allocated = "allocation" in packet;
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
  const holder = allocated ? packet.allocation.ownerShare.claimant : packet.certificate.holder;
  if (!/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/u.test(taxId) || digits === "000000000" || !matchesPrimary(holder)) {
    throw new Error(allocated
      ? "Reconcile the allocated share with the actual taxpayer holder."
      : "Reconcile the certificate with the actual taxpayer holder.");
  }
  if (certificate.issueDate < "2027-01-01" || certificate.issueDate > asOfDate) {
    throw new Error("Reconcile the annual certificate issue date with the draft as-of date.");
  }
  if (allocated) {
    const { annualElection, ownerShare } = packet.allocation;
    const award = packet.certificate;
    const matchesEntity = (entity: z.infer<typeof entityHolderSchema>) => entity.legalName.toLowerCase() === award.holder.legalName.toLowerCase()
      && entity.taxIdLast4 === award.holder.taxIdLast4;
    if (!matchesEntity(annualElection.entity) || !matchesEntity(ownerShare.entity)
      || annualElection.awardReference !== award.awardReference || ownerShare.certificateReference !== award.reference
      || annualElection.submittedOn < "2027-01-01" || annualElection.submittedOn > "2027-03-01"
      || annualElection.submittedOn > award.issueDate) {
      throw new Error("Reconcile the owner allocation and submitted annual election with the same certified award.");
    }
    const certified = new AllocationDecimal(award.amount);
    const claimantDistribution = new AllocationDecimal(ownerShare.claimantDistribution);
    const totalDistribution = new AllocationDecimal(ownerShare.totalDistribution);
    const documentedCredit = new AllocationDecimal(ownerShare.documentedCredit);
    if (certified.lte(0) || claimantDistribution.lte(0) || claimantDistribution.gt(totalDistribution)
      || documentedCredit.lte(0) || !documentedCredit.times(totalDistribution).eq(certified.times(claimantDistribution))) {
      throw new Error("Reconcile the documented credit with the exact distribution share of the certified award.");
    }
  } else if (certificate.authority !== "122.17(B)") {
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
  const form = "Ohio 2026 refundable jobs credit draft";
  const refundableCredit = allocated
    ? audit.record(form, "elected-owner-share", "Elected share of certified job creation credit",
      d(packet.allocation.ownerShare.documentedCredit), "Use the documented share reconciled under R.C. 122.17(J).",
      { "Award authority": "122.17(J)", "Deemed payment date": deemedPaymentDate })
    : audit.record(form, "certified-credit",
      "Certified refundable jobs credit", d(certificate.amount), "Use the certificate amount under R.C. 5747.058(A).",
      { "Award authority": certificate.authority, "Deemed payment date": deemedPaymentDate });
  return {
    status: "incomplete_draft" as const,
    filingQualified: false as const,
    refundableCredit, deemedPaymentDate, lines: audit.getLines(),
  };
}
