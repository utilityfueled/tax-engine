import { z } from 'zod';
import { MarketplaceOriginalPolicySchema } from './form-8962-shared-policy.js';

/** Actual source facts only. Missing membership, zero and confirmation remain unknown. */
export const MarketplaceCoverageFamilySchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allPolicySourcesIncluded: z.boolean().optional(),
  policies: z.array(z.object({ sourceId: z.string().optional(), original: MarketplaceOriginalPolicySchema.optional() })).optional(),
  persons: z.array(z.object({ personId: z.string().optional(), coveredIndividualSsn: z.string().optional() })).optional(),
  outsidePersonReturns: z.array(z.object({
    personId: z.string().optional(), sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(),
    returnStatus: z.enum(['draft', 'completed']).optional(), claimantName: z.string().optional(), claimantSsn: z.string().optional(),
    policySourceIds: z.array(z.string()).optional(), allPoliciesIncludedConfirmed: z.boolean().optional(),
    form8962Line24: z.string().optional(),
    cashPaymentSources: z.object({
      sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
      allPremiumPaymentsIncludedConfirmed: z.boolean().optional(), allOtherReturnTaxPaymentsIncludedConfirmed: z.boolean().optional(),
      premiumPayments: z.array(z.object({
        paymentSourceId: z.string().optional(), payer: z.enum(['owner_after_tax', 'business_paid_or_reimbursed']).optional(),
        datePaid: z.string().optional(), sourceReference: z.string().optional(), cashPaidToInsurer: z.string().optional(),
        reimbursements: z.array(z.object({ sourceId: z.string().optional(), dateReceived: z.string().optional(), amount: z.string().optional(), sourceReference: z.string().optional() })).optional(),
      })).optional(),
      otherReturnTaxPayments: z.array(z.object({ sourceId: z.string().optional(), datePaid: z.string().optional(), amount: z.string().optional(), sourceReference: z.string().optional() })).optional(),
    }).optional(),
  })).optional(),
  months: z.array(z.object({
    month: z.number().int().optional(), sourceReference: z.string().optional(), allCoveredPersonsIncludedConfirmed: z.boolean().optional(),
    personFacts: z.array(z.object({ personId: z.string().optional(), sourceReference: z.string().optional(),
      fullCoverageMonthConfirmed: z.boolean().optional(), otherMecEligible: z.boolean().optional() })).optional(),
    coverageFamilySlcsp: z.string().optional(), nonCoverageFamilySlcsp: z.string().optional(),
    coverageFamilySourceReference: z.string().optional(), nonCoverageFamilySourceReference: z.string().optional(),
    coverageFamilyMemberSsns: z.array(z.string()).optional(), nonCoverageFamilyMemberSsns: z.array(z.string()).optional(),
    allCoverageFamilyMembersIncludedConfirmed: z.boolean().optional(), allNonCoverageFamilyMembersIncludedConfirmed: z.boolean().optional(),
  })).optional(),
});
