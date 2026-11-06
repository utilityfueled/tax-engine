/** Private complete current originals for the finite PA copyright class. */
import {z} from 'zod';
const answer=z.boolean().nullable();
export const PAOrdinaryRoyaltySourcesSchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 owner:z.object({accountHolder:z.enum(['','primary','spouse']),originalTaxpayer:z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict()}).strict(),
 originalPropertySources:z.record(z.string(),z.unknown()),
 originals:z.array(z.object({originalIndex:z.number().int().nonnegative(),sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,currentUncorrectedNonvoidOriginalConfirmed:answer,allOriginalBoxesKnownConfirmed:answer,royaltyOnlyIncomeConfirmed:answer,original:z.record(z.string(),z.unknown())}).strict()),
}).strict();
export type PAOrdinaryRoyaltySources=z.infer<typeof PAOrdinaryRoyaltySourcesSchema>;
