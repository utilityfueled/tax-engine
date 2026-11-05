/** Actual private two-owner calendars; no date/day/answer defaults to a fact. */
import {z} from 'zod';
import {PAResidencySourcesSchema} from './pa-residency.js';
export const PAMarriedResidencySourcesSchema=z.object({
 methodVersion:z.literal('pa-married-residency-sources-v1'),
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:z.boolean().nullable(),
 owners:z.array(z.object({
  accountHolder:z.enum(['','primary','spouse']),
  allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed:z.boolean().nullable(),
  originalTaxpayer:z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict(),
  residency:PAResidencySourcesSchema.shape.residency,
 }).strict()),
}).strict();
export type PAMarriedResidencySources=z.infer<typeof PAMarriedResidencySourcesSchema>;
