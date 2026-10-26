import { z } from 'zod';

// Persist drafts without manufacturing a no-history, no-ban or completed-form answer.
const identity = z.object({ firstName: z.string().optional(), lastName: z.string().optional(), ssn: z.string().optional() });
const denial = z.object({
  sourceId: z.string().optional(), sourceReference: z.string().optional(), taxYear: z.number().int().optional(),
  originalReturnFiledDate: z.string().optional(), noticeDate: z.string().optional(),
  assessmentDate: z.string().nullable().optional(), finalDeterminationDate: z.string().nullable().optional(),
  reason: z.enum(['math_or_clerical', 'qualifying_child_only', 'income_only', 'other', 'omitted_required_8862']).optional(),
  procedure: z.enum(['math_or_clerical', 'deficiency']).optional(),
  conduct: z.enum(['none', 'reckless', 'fraud']).optional(), appealPending: z.boolean().optional(),
  underlyingDenialSourceId: z.string().optional(),
  interveningReturnHistoryCompleteConfirmed: z.boolean().optional(),
  interveningOriginalReturns: z.array(z.object({ taxYear: z.number().int().optional(), filedDate: z.string().optional(), sourceReference: z.string().optional() })).optional(),
  banNotice: z.object({ sourceReference: z.string().optional(), noticeDate: z.string().optional(), firstEligibleTaxYear: z.number().int().optional() }).optional(),
});
const allowance = z.object({
  sourceId: z.string().optional(), sourceReference: z.string().optional(), taxYear: z.number().int().optional(),
  returnFiledDate: z.string().optional(), allowanceDate: z.string().optional(),
  demonstration: z.enum(['form8862', 'other_irs_required_documents']).optional(),
  resolvedDenialSourceIds: z.array(z.string()).optional(),
});
export const EicDisallowanceSourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  reviewedThroughDate: z.string().optional(), claimStatus: z.enum(['preparing', 'filed']).optional(),
  preparationAsOfDate: z.string().optional(), claimFilingDate: z.string().optional(),
  filers: z.array(z.object({
    owner: z.enum(['primary', 'spouse']).optional(), originalTaxpayer: identity.optional(),
    sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(), allHistoryIncluded: z.boolean().optional(),
    denials: z.array(denial).optional(), laterAllowances: z.array(allowance).optional(),
  })).optional(),
});
export type EicDisallowanceSources = z.infer<typeof EicDisallowanceSourcesSchema>;
