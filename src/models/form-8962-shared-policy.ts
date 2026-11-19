import { z } from 'zod';

// Source fields have no defaults: a blank original or absent agreement remains unknown.
const amount = z.string().regex(/^-?\d+(?:\.\d+)?$/).optional();
export const MarketplaceStatementStatusSchema = z.enum(['original', 'corrected', 'voided']);

export function assertMarketplaceStatementUsable(status: z.infer<typeof MarketplaceStatementStatusSchema> | undefined): void {
  if (status === 'voided') throw new Error('Remove the voided Form 1095-A and its superseded original.');
}

export function marketplacePolicyIdentity(marketplace: string, policyNumber: string): string {
  return JSON.stringify([marketplace.trim().toLowerCase(), policyNumber.trim()]);
}

export const MarketplaceCoveredIndividualSchema = z.object({
  name: z.string().optional(), ssn: z.string().optional(),
  firstMonth: z.number().int().optional(), lastMonth: z.number().int().optional(),
});
export const MarketplaceOriginalPolicySchema = z.object({
  taxYear: z.number().int().optional(), marketplace: z.string().optional(), policyNumber: z.string().optional(),
  statementStatus: MarketplaceStatementStatusSchema.optional(),
  recipientName: z.string().optional(), recipientSsn: z.string().optional(),
  coveredIndividuals: z.array(MarketplaceCoveredIndividualSchema).optional(),
  monthlyPremiums: z.array(z.object({ month: z.number().int().optional(),
    enrolleePremium: amount, slcsp: amount.nullable(), advancePremiumTaxCredit: amount })).optional(),
});
/** Pub974 WorksheetE originals; no computed allocation or assumed family defaults. */
export const Form8962MarriedThirdFamilySchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  noOtherAllocationsRequiredConfirmed: z.boolean().optional(), allAgreementsAndCoverageMonthsIncludedConfirmed: z.boolean().optional(),
  families: z.array(z.object({
    role: z.enum(['primary', 'spouse', 'third']).optional(), sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(),
    filingStatus: z.enum(['married_filing_separately', 'single', 'head_of_household']).optional(),
    taxpayerName: z.string().optional(), taxpayerSsn: z.string().optional(), allTaxFamilyMembersIncludedConfirmed: z.boolean().optional(),
    dependents: z.array(z.object({ name: z.string().optional(), ssn: z.string().optional() }).strict()).optional(),
  }).strict()).optional(),
  coverageFamilyAssignments: z.array(z.object({ ssn: z.string().optional(), family: z.enum(['primary', 'spouse']).optional() }).strict()).optional(),
  monthlySources: z.array(z.object({ month: z.number().int().optional(), primaryBenchmark: amount, spouseBenchmark: amount,
    primaryBenchmarkSourceReference: z.string().optional(), spouseBenchmarkSourceReference: z.string().optional(),
    primaryAgreementFraction: z.string().optional(), spouseAgreementFraction: z.string().optional(),
    primaryAgreementSourceReference: z.string().optional(), spouseAgreementSourceReference: z.string().optional(),
    primaryAgreementConfirmed: z.boolean().optional(), spouseAgreementConfirmed: z.boolean().optional(),
  }).strict()).optional(),
}).strict();
export const Form8962SharedPolicySchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(),
  sourceFactsConfirmed: z.boolean().optional(), allSharedPoliciesIncluded: z.boolean().optional(),
  primaryName: z.string().optional(), primarySsn: z.string().optional(), spouseName: z.string().optional(), spouseSsn: z.string().optional(),
  marriedThirdFamily: Form8962MarriedThirdFamilySchema.optional(),
  noAdvanceCoverageFamilies: z.object({
    sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    allBenchmarkMonthsIncluded: z.boolean().optional(),
    months: z.array(z.object({ month: z.number().int().optional(), families: z.array(z.object({
      taxpayerName: z.string().optional(), taxpayerSsn: z.string().optional(), sourceReference: z.string().optional(),
      allCoverageFamilyMembersIncludedConfirmed: z.boolean().optional(), allCoveragePoliciesIncludedConfirmed: z.boolean().optional(),
      groups: z.array(z.object({ sourceId: z.string().optional(), sourceReference: z.string().optional(), ratingArea: z.string().optional(),
        coveredIndividualSsns: z.array(z.string()).optional(), slcsp: amount, allCoveredPeopleShareRatingAreaConfirmed: z.boolean().optional(),
      })).optional(),
    })).optional() })).optional(),
  }).optional(),
  overlappingCoverage: z.object({
    sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    allBenchmarkMonthsIncluded: z.boolean().optional(),
    months: z.array(z.object({ month: z.number().int().optional(), groups: z.array(z.object({
      sourceId: z.string().optional(), sourceReference: z.string().optional(), ratingArea: z.string().optional(),
      allUnsharedCoverageFamilyMembersIncludedConfirmed: z.boolean().optional(), allCoveredPeopleShareRatingAreaConfirmed: z.boolean().optional(),
      policySourceIds: z.array(z.string()).optional(), coveredIndividualSsns: z.array(z.string()).optional(), slcsp: amount,
    })).optional() })).optional(),
  }).optional(),
  policies: z.array(z.object({
    sourceId: z.string().optional(), original: MarketplaceOriginalPolicySchema.optional(),
    otherTaxpayerName: z.string().optional(), otherTaxpayerSsn: z.string().optional(),
    situation: z.enum(['other_two_tax_families', 'divorce_during_year', 'married_separate', 'no_advance_credit', 'not_shared']).optional(),
    unsharedSourceReference: z.string().optional(), allCoveredPeopleInThisTaxFamilyConfirmed: z.boolean().optional(),
    noCurrentYearMarriageOrDivorceConfirmed: z.boolean().optional(), twoTaxFamiliesConfirmed: z.boolean().optional(),
    otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed: z.boolean().optional(),
    otherTaxpayerRelationshipSourceReference: z.string().optional(),
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
    separateReturn: z.object({
      sourceReference: z.string().optional(), marriedAtYearEndConfirmed: z.boolean().optional(), onlySpouseTaxFamiliesConfirmed: z.boolean().optional(),
      livingApartExceptionConfirmed: z.boolean().optional(), benchmarkAboveReportedReference: z.string().optional(),
      ownCoverageFamilySlcsp: z.array(z.object({ month: z.number().int().optional(), slcsp: amount })).optional(),
    }).optional(),
    monthlyAllocations: z.array(z.object({ month: z.number().int().optional(), fraction: z.string().optional() })).optional(),
  })).optional(),
});
