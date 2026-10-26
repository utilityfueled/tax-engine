import { z } from 'zod';
import { EicSeparatedSpouseSourcesSchema } from './eic-separated-spouse-sources.js';

// Draft source facts only. No checkbox, amount or eligibility defaults.
export const EicResidenceDaysSchema = z.object({
  sourceReference: z.string().optional(),
  actualUnitedStatesDays: z.number().int().min(0).max(366).optional(),
  temporaryAbsences: z.array(z.object({ sourceReference: z.string().optional(),
    reason: z.enum(['school', 'vacation', 'business', 'medical', 'military', 'juvenile_detention']).optional(),
    days: z.number().int().min(0).max(366).optional() })).optional(),
  militaryOutsideUnitedStatesDays: z.number().int().min(0).max(366).optional(),
  extendedActiveDuty: z.object({ sourceReference: z.string().optional(), orderedOver90DaysOrIndefinite: z.boolean().optional() }).optional(),
  allDaysIncludedAndDistinctConfirmed: z.boolean().optional(),
});
export const EicCurrentChildSourceSchema = EicSeparatedSpouseSourcesSchema.shape.children.unwrap().element.extend({
  deathDate: z.string().nullable().optional(),
  homeDays: EicResidenceDaysSchema.optional(),
  bornAndDeceasedRecord: z.object({
    sourceReference: z.string().optional(),
    recordType: z.enum(['birth_certificate', 'death_certificate', 'hospital_record']).optional(),
    showsLiveBirth: z.boolean().optional(),
    copyAvailableForReturnAttachment: z.boolean().optional(),
  }).optional(),
});
export const Form8862SourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  filers: z.array(z.object({ owner: z.enum(['primary', 'spouse']).optional(), sourceReference: z.string().optional(),
    originalTaxpayer: z.object({ firstName: z.string().optional(), lastName: z.string().optional(), ssn: z.string().optional(), dateOfBirth: z.string().optional() }).optional(),
    applicableYearStart: z.string().optional(), applicableYearEnd: z.string().optional(), homeDays: EicResidenceDaysSchema.optional() })).optional(),
  allCandidateChildrenIncluded: z.boolean().optional(),
  children: z.array(EicCurrentChildSourceSchema).optional(),
});
export type EicResidenceDays = z.infer<typeof EicResidenceDaysSchema>;
export type EicCurrentChildSource = z.infer<typeof EicCurrentChildSourceSchema>;
export type Form8862Sources = z.infer<typeof Form8862SourcesSchema>;
