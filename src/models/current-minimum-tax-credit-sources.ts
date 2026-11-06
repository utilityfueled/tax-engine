import { z } from 'zod';

const signedAmount = z.string().regex(/^-?\d+(\.\d+)?$/).optional();
const reference = { sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional() };
const statement = {
  ...reference, sourceId: z.string().optional(), entityName: z.string().optional(), entityEin: z.string().optional(),
  accountHolder: z.enum(['primary', 'spouse']).optional(),
};

/** Actual original facts only. Unknown and unsupported inventories are retained,
 * never converted to empty or to an entered signed credit calculation. */
export const CurrentMinimumTaxCreditSourcesSchema = z.object({
  ...reference, taxpayerName: z.string().optional(), taxpayerIdLast4: z.string().optional(),
  filingStatus: z.enum(['single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household', 'qualifying_surviving_spouse']).optional(),
  allAdjustmentSourcesIncluded: z.boolean().optional(),
  filedForm2555: z.boolean().optional(), filedForm1040NR: z.boolean().optional(), capitalGainsRequired: z.boolean().optional(),
  unallowedQualifiedElectricVehicleCredit: signedAmount,
  k1Statements: z.array(z.object({ ...statement, depreciationAdjustment: signedAmount, dispositionAdjustment: signedAmount,
    depletionAdjustment: signedAmount, otherAdjustment: signedAmount,
    standaloneOriginal: z.object({ sourceReference: z.string().optional(), entityType: z.enum(['partnership', 's_corporation']).optional(),
      allOtherAmountsZeroConfirmed: z.boolean().optional(), domesticContinuingNonPtpConfirmed: z.boolean().optional(),
      isPassiveActivity: z.boolean().optional() }).optional(),
  })).optional(),
  trustStatements: z.array(z.object({ ...statement, adjustment: signedAmount, exclusionCodeJ: signedAmount })).optional(),
  minimumTaxCreditNolHistory: z.object({ ...reference, allCarryoversAndCarrybacksIncluded: z.boolean().optional(),
    carryoverSources: z.array(z.unknown()).optional(), carrybackSources: z.array(z.unknown()).optional() }).optional(),
  exclusionOnlyForeignHistory: z.object({ ...reference, allCurrentAndHistoricalSourcesIncluded: z.boolean().optional(),
    currentSources: z.array(z.unknown()).optional(), carryoverSources: z.array(z.unknown()).optional(), carrybackSources: z.array(z.unknown()).optional() }).optional(),
});
export type CurrentMinimumTaxCreditSources = z.infer<typeof CurrentMinimumTaxCreditSourcesSchema>;
