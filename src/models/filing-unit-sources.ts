import { z } from 'zod';

/** Actual people and filed returns; no inferred marital or death history. */
export const FilingUnitHistorySchema = z.object({
  sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allRelevantReturnsIncluded: z.boolean().optional(), allRelevantCarryoversIncluded: z.boolean().optional(), currentReturnSourceId: z.string().optional(),
  persons: z.array(z.object({
    sourceId: z.string().optional(), name: z.string().optional(), taxpayerIdLast4: z.string().optional(),
    deathStatus: z.enum(['alive_through_return_year', 'deceased']).optional(), deathYear: z.number().int().optional(),
  })).optional(),
  returns: z.array(z.object({
    sourceId: z.string().optional(), taxYear: z.number().int().optional(),
    filingStatus: z.enum(['single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household', 'qualifying_surviving_spouse']).optional(),
    primaryPersonId: z.string().optional(), spousePersonId: z.string().optional(),
    finalReturnForDeceased: z.boolean().optional(), sourceReference: z.string().optional(),
  })).optional(),
});
export type FilingUnitHistory = z.infer<typeof FilingUnitHistorySchema>;
