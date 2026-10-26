import { z } from 'zod';

// Actual records only. Every omission remains unknown until source validation.
const identity = z.object({ firstName: z.string().optional(), lastName: z.string().optional(),
  ssn: z.string().optional(), dateOfBirth: z.string().optional() });
export const EicSeparatedSpouseSourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(),
  sourceReference: z.string().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  taxpayer: identity.optional(),
  applicableYearStart: z.string().optional(),
  applicableYearEnd: z.string().optional(),
  marriedAtYearEnd: z.boolean().optional(),
  principalHomesApartLastSixMonths: z.boolean().optional(),
  legallySeparatedUnderStateLaw: z.boolean().optional(),
  differentHouseholdsAtYearEnd: z.boolean().optional(),
  separationInstrument: z.object({
    kind: z.enum(['written-separation-agreement', 'decree-of-separate-maintenance']).optional(),
    state: z.string().optional(), effectiveDate: z.string().optional(), sourceReference: z.string().optional(),
  }).optional(),
  allCandidateChildrenIncluded: z.boolean().optional(),
  children: z.array(z.object({
    sourceId: z.string().optional(), sourceReference: z.string().optional(),
    original: identity.extend({ relationship: z.string().optional(), monthsLivedWithYou: z.number().int().min(0).max(12).optional() }).optional(),
    livedWithTaxpayerInUnitedStatesMoreThanHalfYear: z.boolean().optional(),
    specialResidencePeriodClaimed: z.boolean().optional(),
    marriedAtYearEnd: z.boolean().optional(), jointReturnFiled: z.boolean().optional(), jointReturnRefundOnly: z.boolean().optional(),
    fullTimeStudentForFiveMonths: z.boolean().optional(), permanentlyAndTotallyDisabled: z.boolean().optional(),
    authorizedFosterPlacement: z.boolean().optional(),
    validSsnIssuedByDueDate: z.boolean().optional(),
    allOtherEligibleClaimantsIncluded: z.boolean().optional(),
    otherEligibleClaimants: z.array(z.object({ name: z.string().optional(), sourceReference: z.string().optional(), claimsAnyChildTaxBenefit: z.boolean().optional() })).optional(),
  })).optional(),
});

export type EicSeparatedSpouseSources = z.infer<typeof EicSeparatedSpouseSourcesSchema>;
