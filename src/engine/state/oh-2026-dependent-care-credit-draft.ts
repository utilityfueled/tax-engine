/** R.C. 5747.054 statutory draft. Spec: spec/state/oh-2026-dependent-care-credit-draft.yaml. */
import { z } from "zod";
import { calculateForm2441 } from "@/engine/forms/form-2441.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

const reference = z.string().trim().min(1).max(160);
const yes = z.literal(true);
const cents = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u);
const currentYear = z.literal(2026);
const wageOriginal = z.strictObject({
  taxYear: currentYear,
  state: z.literal("OH"),
  sourceReference: reference,
  recipientReference: reference,
  box1Wages: cents,
  box10DependentCareBenefits: cents,
  originalVerified: yes,
  entireSeparateSection21EarnedIncomeConfirmed: yes,
});
const packetSchema = z.strictObject({
  jointReturn: z.strictObject({
    taxYear: currentYear,
    filingStatus: z.literal("married_filing_jointly"),
    reference,
    primaryReference: reference,
    spouseReference: reference,
    calendarYearConfirmed: yes,
    bothSpousesFullYearOhioDomicileConfirmed: yes,
    noOtherIncomeOrFederalOhioAgiAdjustmentsConfirmed: yes,
    noDependentCareBenefitsOrReimbursementsConfirmed: yes,
    noPriorYearCarePaymentsConfirmed: yes,
  }),
  primaryWageOriginal: wageOriginal,
  spouseWageOriginal: wageOriginal,
  child: z.strictObject({
    reference,
    jointReturnReference: reference,
    dateOfBirth: z.iso.date(),
    directSection152QualifyingChildConfirmed: yes,
    eligibleSection152A1DependentForJointUnitConfirmed: yes,
    livedWithBothSpousesAllYearConfirmed: yes,
    soleQualifyingPersonConfirmed: yes,
    requiredTaxpayerIdentificationVerified: yes,
  }),
  provider: z.strictObject({
    reference,
    licensedOhioCenterComplianceConfirmed: yes,
    unrelatedNonHouseholdProviderConfirmed: yes,
    nameAddressAndEinVerified: yes,
  }),
  carePayments: z.strictObject({
    sourceReference: reference,
    taxYear: currentYear,
    childReference: reference,
    providerReference: reference,
    payerReference: reference,
    amountPaid: cents,
    originalVerified: yes,
    incurredAndPaidIn2026Confirmed: yes,
    jointFilerBoreEligiblePaymentConfirmed: yes,
    bothSpousesWorkRelatedCareOnlyConfirmed: yes,
  }),
});

export function calculateOhio2026DependentCareCreditDraft(rawSources: unknown) {
  const parsed = packetSchema.safeParse(rawSources);
  if (!parsed.success) throw new Error("Provide complete verified Ohio 2026 joint wage, child, provider and care payment originals.");

  const { jointReturn, primaryWageOriginal, spouseWageOriginal, child, provider, carePayments } = parsed.data;
  const sourceReferences = [jointReturn.reference, primaryWageOriginal.sourceReference, spouseWageOriginal.sourceReference,
    child.reference, provider.reference, carePayments.sourceReference];
  if (new Set(sourceReferences).size !== sourceReferences.length || jointReturn.primaryReference === jointReturn.spouseReference
    || primaryWageOriginal.recipientReference !== jointReturn.primaryReference || spouseWageOriginal.recipientReference !== jointReturn.spouseReference
    || child.jointReturnReference !== jointReturn.reference || carePayments.childReference !== child.reference
    || carePayments.providerReference !== provider.reference
    || ![jointReturn.primaryReference, jointReturn.spouseReference].includes(carePayments.payerReference)) {
    throw new Error("Reconcile the wage, child, provider and payment originals with the same joint filing unit.");
  }
  if (child.dateOfBirth < "2014-01-01" || child.dateOfBirth > "2025-12-31") {
    throw new Error("The verified direct child must live in the joint household and be under 13 throughout 2026.");
  }
  const primaryEarnedIncome = d(primaryWageOriginal.box1Wages);
  const spouseEarnedIncome = d(spouseWageOriginal.box1Wages);
  const paidCare = d(carePayments.amountPaid);
  if (!d(primaryWageOriginal.box10DependentCareBenefits).isZero() || !d(spouseWageOriginal.box10DependentCareBenefits).isZero()
    || primaryEarnedIncome.lte(0) || spouseEarnedIncome.lte(0) || paidCare.lte(0)) {
    throw new Error("Require positive earned income for each spouse, actual paid care and verified zero dependent care benefits.");
  }

  const agi = primaryEarnedIncome.plus(spouseEarnedIncome);
  const federal = calculateForm2441({
    taxYear: jointReturn.taxYear, filingStatus: jointReturn.filingStatus, qualifyingIndividuals: 1,
    careExpenses: paidCare, agi, earnedIncome: primaryEarnedIncome, spouseEarnedIncome,
    eligibilityConfirmed: true, excludedDependentCareBenefits: d(0), priorYearExpenseCredit: d(0),
  });
  const ohioRate = agi.lt(20000) ? d(1) : agi.lt(40000) ? d("0.25") : d(0);
  const uncappedFederal = federal.earnedIncomeLimit.times(federal.creditPercentage);
  const audit = new AuditTrail();
  const form = "Ohio 2026 statutory dependent care credit draft";
  audit.record(form, "qualified-care-base", "Qualified care base before federal or Ohio tax limits", federal.earnedIncomeLimit,
    "Use the least of paid qualified care, the one-child limit and each spouse's earned income.",
    { "Federal AGI and Ohio MAGI": agi, "Paid care": paidCare,
      "Primary earned income": primaryEarnedIncome, "Spouse earned income": spouseEarnedIncome });
  const statutoryTentativeCredit = audit.record(form, "statutory-tentative-credit", "Tentative statutory interpretation under Ohio R.C. 5747.054",
    uncappedFederal.times(ohioRate), "Apply the Ohio rate to the section 21 amount before the federal section 26 limit or state tax and prior credits.",
    { "Federal section 21 rate": federal.creditPercentage, "Ohio statutory rate": ohioRate, "Federal section 21 amount": uncappedFederal });
  return {
    calculationStatus: "incomplete" as const,
    reviewStatus: "independent-review-pending" as const,
    filingQualified: false as const,
    statutoryTentativeCredit,
    lines: audit.getLines(),
  };
}
