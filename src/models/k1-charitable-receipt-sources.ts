import { z } from 'zod';
const amount = z.string().regex(/^\d+(\.\d+)?$/).optional();
/** Actual original gift facts, shared by current basis and historical465 sources. */
export const K1CharitableReceiptSourcesSchema = z.object({
    basisSourceId: z.string().optional(), originalBox: z.enum(['12', '13']).optional(), originalCode: z.enum(['A', 'E', 'F']).optional(),
    recipientName: z.string().optional(), recipientCategory: z.enum(['fifty-percent', 'private-nonoperating', 'other-thirty-percent']).optional(),
    qualifiedOrganization: z.boolean().optional(), donorAdvisedFund: z.boolean().optional(), supportingOrganization: z.boolean().optional(),
    sourceReference: z.string().optional(), contributionDate: z.string().optional(),
    propertyType: z.enum(['appreciated_stock', 'other_property']).optional(), acquisitionDate: z.string().optional(),
    fairMarketValueShare: amount, qualifiedAppreciatedStock: z.boolean().optional(),
});
export type K1CharitableReceiptSources = z.infer<typeof K1CharitableReceiptSourcesSchema>;
