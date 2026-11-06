import { z } from "zod";
import { FilingUnitHistorySchema } from './filing-unit-sources.js';
const sourceAmount = z.string().regex(/^\d+(\.\d+)?$/).optional();
/** Actual filed charitable history. Omission never creates a category, amount or confirmation. */
export const CharitableCarryoverSourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allCarryoversIncluded: z.boolean().optional(), calendarYearTaxpayer: z.boolean().optional(),
  returnMembership: z.enum(["continuous_individual", "same_spouses_joint", "changed_filing_unit"]).optional(), membershipUnchangedConfirmed: z.boolean().optional(),
  filingUnitHistory: FilingUnitHistorySchema.optional(),
  primaryName: z.string().optional(), primaryTaxpayerIdLast4: z.string().optional(),
  spouseName: z.string().optional(), spouseTaxpayerIdLast4: z.string().optional(),
  vintages: z.array(z.object({
    sourceId: z.string().optional(), contributionYear: z.number().int().optional(), sourceReference: z.string().optional(),
    category: z.enum(["cash_60", "noncash_50", "capital_gain_30", "other_30", "capital_gain_20", "conservation_50", "conservation_100", "qualified_cash_100"]).optional(),
    medium: z.enum(["cash", "noncash"]).optional(), originalExcess: sourceAmount, originNolReduction: sourceAmount,
    openingCarryforward: sourceAmount, adjustedThroughTaxYear: z.number().int().optional(), allHistoryIncluded: z.boolean().optional(),
    ordinaryPercentageMethodConfirmed: z.boolean().optional(),
    filingUnitOrigin: z.object({
      returnSourceId: z.string().optional(),
      separateComputations: z.array(z.object({
        personId: z.string().optional(), originalExcess: sourceAmount, originNolReduction: sourceAmount,
        sourceReference: z.string().optional(), ordinaryPercentageMethodConfirmed: z.boolean().optional(),
      })).optional(),
    }).optional(),
    history: z.array(z.object({ taxYear: z.number().int().optional(), treatedAsPaid: sourceAmount,
      nolReduction: sourceAmount, sourceReference: z.string().optional(),
      filingUnitUses: z.array(z.object({ returnSourceId: z.string().optional(), treatedAsPaid: sourceAmount,
        nolReduction: sourceAmount, sourceReference: z.string().optional() })).optional(),
    })).optional(),
  })).optional(),
});
export type CharitableCarryoverSources = z.infer<typeof CharitableCarryoverSourcesSchema>;
