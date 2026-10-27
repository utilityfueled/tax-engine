import { z } from 'zod';

const signedAmount = z.string().regex(/^-?\d+(\.\d+)?$/).optional();
const nonnegativeAmount = z.string().regex(/^\d+(\.\d+)?$/).optional();
const character = z.enum(['portfolio', 'passive_activity']).optional();
const current = z.object({ originalAmount: signedAmount, character, sourceReference: z.string().optional() });
/** Copied original character and filed opening balances; no current allowance. */
export const K1CapitalCharacterSourcesSchema = z.object({
    sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    accountHolder: z.enum(['primary', 'spouse']).optional(), entityName: z.string().optional(), entityEIN: z.string().optional(),
    allCapitalItemsIncludedConfirmed: z.boolean().optional(), ordinaryCapitalTreatmentConfirmed: z.boolean().optional(),
    currentShortTerm: current.optional(), currentLongTerm: current.optional(),
    /** Actual attachment identifies this same activity, after applicable recharacterization. */
    samePassiveActivityConfirmed: z.boolean().optional(),
    priorAtRiskCapital: z.array(z.object({
        sourceId: z.string().optional(), character, sourceReference: z.string().optional(),
    })).optional(),
    priorPassiveCapital: z.object({
        sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
        sameOwnerAndActivityConfirmed: z.boolean().optional(), shortTermLoss: nonnegativeAmount, longTermLoss: nonnegativeAmount,
    }).optional(),
});
export type K1CapitalCharacterSources = z.infer<typeof K1CapitalCharacterSourcesSchema>;
