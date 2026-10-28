import { z } from 'zod';

const filedAmount = z.string().regex(/^\d+$/).optional();
/** Original filed computations and historical allocation worksheets, never a current allowance. */
export const NolFilingUnitOriginSchema = z.object({
  ownerPersonId: z.string().optional(),
  returnSourceId: z.string().optional(), originalReturnLoss: filedAmount,
  separateComputations: z.array(z.object({ personId: z.string().optional(), netOperatingLoss: filedAmount,
    sourceReference: z.string().optional() })).optional(),
});
/** Actual marital-year evidence. Separate filing alone does not identify a spouse. */
export const NolSameCoupleJointHistorySchema = z.object({
  sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allRelevantYearsIncluded: z.boolean().optional(),
  years: z.array(z.object({ taxYear: z.number().int().optional(), firstPersonId: z.string().optional(),
    secondPersonId: z.string().optional(), marriedToEachOther: z.boolean().optional(), sourceReference: z.string().optional() })).optional(),
});
export const NolFilingUnitUseSchema = z.object({
  returnSourceId: z.string().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allOriginOwnersIncluded: z.boolean().optional(), allOtherNolSourcesIncluded: z.boolean().optional(),
  claimedDeduction: filedAmount, modifiedAbsorption: filedAmount, attributeReduction: filedAmount,
  owners: z.array(z.object({ personId: z.string().optional(), claimedDeduction: filedAmount,
    modifiedAbsorption: filedAmount, attributeReduction: filedAmount })).optional(),
});
export type NolFilingUnitOrigin = z.infer<typeof NolFilingUnitOriginSchema>;
export type NolFilingUnitUse = z.infer<typeof NolFilingUnitUseSchema>;
export type NolSameCoupleJointHistory = z.infer<typeof NolSameCoupleJointHistorySchema>;
