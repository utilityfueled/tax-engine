import { z } from 'zod';
import { K1CharitableReceiptSourcesSchema } from './k1-charitable-receipt-sources.js';
const amount = z.string().regex(/^\d+(\.\d+)?$/).optional();
/** Historical filed sources only; no current-year calculated allowance. */
export const K1PriorCharitableAtRiskHistorySchema = z.object({
    sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    vintages: z.array(z.object({ taxYear: z.number().int().optional(), amount })).optional(),
    characterSources: z.object({
        sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
        sameOwnerAndActivityConfirmed: z.boolean().optional(),
        recipientName: z.string().optional(), recipientTaxpayerIdLast4: z.string().optional(),
        entityName: z.string().optional(), entityEIN: z.string().optional(),
        records: z.array(z.object({
            sourceId: z.string().optional(), taxYear: z.number().int().optional(), sourceReference: z.string().optional(),
            character: z.enum(['ordinary', 'short_term_capital', 'long_term_capital', 'charitable']).optional(),
            basisLimitationAlreadyAppliedConfirmed: z.boolean().optional(),
            originalPostBasisDeduction: amount, originalDisallowedAmount: amount,
            useHistory: z.array(z.object({ taxYear: z.number().int().optional(), amountAllowed: amount })).optional(),
            gift: z.object({
                basisSourceId: z.string().optional(), basisOriginTaxYear: z.number().int().optional(),
                category: z.enum(['cash_60', 'capital_gain_30', 'capital_gain_20']).optional(),
                contributionShare: amount, adjustedBasisShare: amount,
                receipt: K1CharitableReceiptSourcesSchema.optional(),
            }).optional(),
        })).optional(),
    }).optional(),
});
export type K1PriorCharitableAtRiskHistory = z.infer<typeof K1PriorCharitableAtRiskHistorySchema>;
