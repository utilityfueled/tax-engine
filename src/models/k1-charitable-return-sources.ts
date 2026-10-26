import { z } from 'zod';
import { K1CharitableBasisSourcesSchema } from './k1-charitable-basis-sources.js';
const amount = z.string().regex(/^\d+(\.\d+)?$/).optional();
/** Actual attachments only. No calculated allowance, recipient default, or inferred history. */
export const K1CharitableReturnSourcesSchema = z.object({
    sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    allK1CharitableSourcesIncluded: z.boolean().optional(),
    statements: z.array(z.object({
        k1SourceId: z.string().optional(), sameRegularAmtTreatmentConfirmed: z.boolean().optional(),
        basis: K1CharitableBasisSourcesSchema.optional(),
        receipts: z.array(z.object({
            basisSourceId: z.string().optional(), originalBox: z.enum(['12', '13']).optional(), originalCode: z.enum(['A', 'E', 'F']).optional(),
            recipientName: z.string().optional(), recipientCategory: z.enum(['fifty-percent', 'private-nonoperating', 'other-thirty-percent']).optional(),
            qualifiedOrganization: z.boolean().optional(), donorAdvisedFund: z.boolean().optional(), supportingOrganization: z.boolean().optional(),
            sourceReference: z.string().optional(), contributionDate: z.string().optional(),
            propertyType: z.enum(['appreciated_stock', 'other_property']).optional(), acquisitionDate: z.string().optional(),
            fairMarketValueShare: amount, qualifiedAppreciatedStock: z.boolean().optional(),
        })).optional(),
        atRisk: z.object({
            sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
            simplifiedMethodEligible: z.boolean().optional(), allActivityDeductionsIncluded: z.boolean().optional(),
            computation: z.enum(['first_year', 'subsequent_year']).optional(),
            adjustedBasisAtEffectiveDate: amount, priorYearAmountAtRisk: amount, currentYearIncreases: amount, currentYearDecreases: amount,
            priorLossHistory: z.object({ sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
                vintages: z.array(z.object({ taxYear: z.number().int().optional(), amount })).optional() }).optional(),
        }).optional(),
    })).optional(),
});
export type K1CharitableReturnSources = z.infer<typeof K1CharitableReturnSourcesSchema>;
