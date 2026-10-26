import { z } from 'zod';
import { MarketplaceCoveredIndividualSchema } from './form-8962-shared-policy.js';

// Original facts have no defaults. Missing identity, consent or money is unknown.
const amount = z.string().regex(/^-?\d+(?:\.\d+)?$/).optional();
const owner = z.enum(['primary', 'spouse']);
export const Form8962MarriageSourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(),
  sourceFactsConfirmed: z.boolean().optional(), allPoliciesIncluded: z.boolean().optional(),
  primaryName: z.string().optional(), primarySsn: z.string().optional(),
  spouseName: z.string().optional(), spouseSsn: z.string().optional(),
  marriageDate: z.string().optional(), primaryUnmarriedOnJanuary1: z.boolean().optional(),
  spouseUnmarriedOnJanuary1: z.boolean().optional(), marriedToEachOtherOnDecember31: z.boolean().optional(),
  allDependentAssignmentsIncluded: z.boolean().optional(),
  dependents: z.array(z.object({
    name: z.string().optional(), ssn: z.string().optional(), alternativeFamilyOwner: owner.optional(),
    qualifiesForPrimary: z.boolean().optional(), qualifiesForSpouse: z.boolean().optional(), sourceReference: z.string().optional(),
  })).optional(),
  policies: z.array(z.object({
    sourceId: z.string().optional(), sourceReference: z.string().optional(),
    fullMonthCoverageConfirmed: z.boolean().optional(), allCoveredIndividualsEligibleForPtcConfirmed: z.boolean().optional(),
    original: z.object({
      taxYear: z.number().int().optional(), marketplace: z.string().optional(), policyNumber: z.string().optional(),
      recipientName: z.string().optional(), recipientSsn: z.string().optional(),
      coveredIndividuals: z.array(MarketplaceCoveredIndividualSchema).optional(),
      monthlyPremiums: z.array(z.object({month: z.number().int().optional(), enrolleePremium: amount, slcsp: amount, advancePremiumTaxCredit: amount})).optional(),
    }).optional(),
  })).optional(),
  benchmarks: z.array(z.object({
    owner: owner.optional(), month: z.number().int().optional(), slcsp: amount,
    sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    coveredIndividualSsns: z.array(z.string()).optional(),
  })).optional(),
});
