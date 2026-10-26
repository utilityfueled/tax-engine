import { z } from 'zod';
import { MarketplaceOriginalPolicySchema } from './form-8962-shared-policy.js';

/** Actual source facts only. Missing membership, zero and confirmation remain unknown. */
export const MarketplaceCoverageFamilySchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allPolicySourcesIncluded: z.boolean().optional(),
  policies: z.array(z.object({ sourceId: z.string().optional(), original: MarketplaceOriginalPolicySchema.optional() })).optional(),
  persons: z.array(z.object({ personId: z.string().optional(), coveredIndividualSsn: z.string().optional() })).optional(),
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
