import { z } from "zod";
const sourceAmount = z.string().regex(/^\d+(\.\d+)?$/).optional();
/** Documented finite two-adopter agreement; every unknown remains optional. */
const OtherAdopterAgreementSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  bothAdoptersAgreed: z.boolean().optional(), allAdoptersIncluded: z.boolean().optional(),
  taxpayerNameOnAgreement: z.string().optional(), taxpayerIdentifyingNumberLast4: z.string().optional(),
  otherAdopterName: z.string().optional(), otherAdopterIdentifyingNumber: z.string().optional(),
  childNameOnAgreement: z.string().optional(), childIdentifyingNumberLast4: z.string().optional(),
  taxpayerExclusionLimit: sourceAmount, otherAdopterExclusionLimit: sourceAmount,
  creditExpenseHistoryConfirmed: z.boolean().optional(),
  taxpayerQualifiedCreditExpenses: sourceAmount, otherAdopterQualifiedCreditExpenses: sourceAmount,
  taxpayerPriorCreditsClaimed: sourceAmount, otherAdopterPriorCreditsClaimed: sourceAmount,
  otherAdopterPriorExclusionLimitUsed: sourceAmount, otherAdopterCurrentBenefits: sourceAmount,
  allOtherAdopterBenefitsIncluded: z.boolean().optional(),
  records: z.array(z.object({
    sourceId: z.string().optional(), taxYear: z.number().int().optional(), employerName: z.string().optional(), employerEin: z.string().optional(),
    recipientName: z.string().optional(), recipientTaxpayerIdLast4: z.string().optional(),
    originalEmployerBenefits: sourceAmount, benefitsAllocatedToChild: sourceAmount,
    allocatedBenefitsIncludedInPriorIncome: z.boolean().optional(), employerPlanQualified: z.boolean().optional(),
  })).optional(),
});
/** Original foreign-adoption benefit history. Missing answers never become zero or yes. */
export const AdoptionPriorBenefitHistorySchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allPriorBenefitsIncluded: z.boolean().optional(), returnMembershipUnchangedConfirmed: z.boolean().optional(),
  childNameOnSource: z.string().optional(), childIdentifyingNumberLast4: z.string().optional(),
  otherAdopterReceivedBenefits: z.boolean().optional(),
  otherAdopterAgreement: OtherAdopterAgreementSchema.optional(),
  priorExclusionHistoryConfirmed: z.boolean().optional(), priorExclusionLimitUsed: sourceAmount,
  records: z.array(z.object({
    sourceId: z.string().optional(), taxYear: z.number().int().optional(),
    employerName: z.string().optional(), employerEin: z.string().optional(), accountHolder: z.enum(["primary", "spouse"]).optional(),
    recipientName: z.string().optional(), recipientTaxpayerIdLast4: z.string().optional(),
    originalEmployerBenefits: sourceAmount, benefitsAllocatedToChild: sourceAmount,
    allocatedBenefitsIncludedInPriorIncome: z.boolean().optional(), employerPlanQualified: z.boolean().optional(),
  })).optional(),
});
export type AdoptionPriorBenefitHistory = z.infer<typeof AdoptionPriorBenefitHistorySchema>;
