import { z } from 'zod';
import { K1CharitableBasisSourcesSchema } from './k1-charitable-basis-sources.js';
import { K1CashDistributionSourcesSchema } from './k1-cash-distribution-sources.js';
import { K1CharitableReceiptSourcesSchema } from './k1-charitable-receipt-sources.js';
import { K1PriorCharitableAtRiskHistorySchema } from './k1-prior-charitable-at-risk.js';
import { K1CapitalCharacterSourcesSchema } from './k1-capital-character-sources.js';
const amount = z.string().regex(/^\d+(\.\d+)?$/).optional();
/** Actual attachments only. No calculated allowance, recipient default, or inferred history. */
export const K1CharitableReturnSourcesSchema = z.object({
    sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    allK1CharitableSourcesIncluded: z.boolean().optional(),
    statements: z.array(z.object({
        k1SourceId: z.string().optional(), sameRegularAmtTreatmentConfirmed: z.boolean().optional(),
        basis: K1CharitableBasisSourcesSchema.optional(),
        cashDistribution: K1CashDistributionSourcesSchema.optional(),
        capitalCharacter: K1CapitalCharacterSourcesSchema.optional(),
        receipts: z.array(K1CharitableReceiptSourcesSchema).optional(),
        atRisk: z.object({
            sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
            simplifiedMethodEligible: z.boolean().optional(), allActivityDeductionsIncluded: z.boolean().optional(),
            computation: z.enum(['first_year', 'subsequent_year']).optional(),
            adjustedBasisAtEffectiveDate: amount, priorYearAmountAtRisk: amount, currentYearIncreases: amount, currentYearDecreases: amount,
            /** Original item/activity assignment, not a selected allowance or calculated fraction. */
            activityAllocation: z.object({
                sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
                allOriginalItemsBelongToActivityConfirmed: z.boolean().optional(),
                charitableSourceIds: z.array(z.string()).optional(),
            }).optional(),
            priorLossHistory: K1PriorCharitableAtRiskHistorySchema.optional(),
        }).optional(),
    })).optional(),
});
export type K1CharitableReturnSources = z.infer<typeof K1CharitableReturnSourcesSchema>;
