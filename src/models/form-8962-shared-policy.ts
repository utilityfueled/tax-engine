import { z } from 'zod';

// Source fields have no defaults: a blank original or absent agreement remains unknown.
const amount = z.string().regex(/^-?\d+(?:\.\d+)?$/).optional();
export const MarketplaceCoveredIndividualSchema = z.object({
  name: z.string().optional(), ssn: z.string().optional(),
  firstMonth: z.number().int().optional(), lastMonth: z.number().int().optional(),
});
const originalPolicy = z.object({
  taxYear: z.number().int().optional(), marketplace: z.string().optional(), policyNumber: z.string().optional(),
  recipientName: z.string().optional(), recipientSsn: z.string().optional(),
  coveredIndividuals: z.array(MarketplaceCoveredIndividualSchema).optional(),
  monthlyPremiums: z.array(z.object({ month: z.number().int().optional(),
    enrolleePremium: amount, slcsp: amount.nullable(), advancePremiumTaxCredit: amount })).optional(),
});
export const Form8962SharedPolicySchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(),
  sourceFactsConfirmed: z.boolean().optional(), allSharedPoliciesIncluded: z.boolean().optional(),
  primaryName: z.string().optional(), primarySsn: z.string().optional(), spouseName: z.string().optional(), spouseSsn: z.string().optional(),
  policies: z.array(z.object({
    sourceId: z.string().optional(), original: originalPolicy.optional(),
    otherTaxpayerName: z.string().optional(), otherTaxpayerSsn: z.string().optional(),
    situation: z.enum(['other_two_tax_families', 'divorce_during_year', 'married_separate', 'no_advance_credit']).optional(),
    noCurrentYearMarriageOrDivorceConfirmed: z.boolean().optional(), twoTaxFamiliesConfirmed: z.boolean().optional(),
    allCoveredPeopleAssignedConfirmed: z.boolean().optional(), originalSlcspCorrectConfirmed: z.boolean().optional(),
    coveredFamilyAssignments: z.array(z.object({ ssn: z.string().optional(), family: z.enum(['this_return', 'other_return']).optional() })).optional(),
    agreementConfirmed: z.boolean().optional(), agreementReference: z.string().optional(),
    defaultAllocation: z.object({
      sourceReference: z.string().optional(), enrollingTaxpayerSsn: z.string().optional(),
      allCoveredPeopleEnrolledByTaxpayerConfirmed: z.boolean().optional(),
    }).optional(),
    noAdvanceAllocation: z.object({
      sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
      allCoveredPeopleInCoverageFamiliesConfirmed: z.boolean().optional(),
      monthlyBenchmarks: z.array(z.object({
        month: z.number().int().optional(), thisReturnSlcsp: amount, otherReturnSlcsp: amount,
        thisReturnSourceReference: z.string().optional(), otherReturnSourceReference: z.string().optional(),
        thisReturnCoveredIndividualSsns: z.array(z.string()).optional(), otherReturnCoveredIndividualSsns: z.array(z.string()).optional(),
      })).optional(),
    }).optional(),
    monthlyAllocations: z.array(z.object({ month: z.number().int().optional(), fraction: z.string().optional() })).optional(),
  })).optional(),
});
