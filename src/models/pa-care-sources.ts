/** Actual private care originals. Draft unknowns are not factual defaults. */
import {z} from 'zod';
const answer=z.boolean().nullable();
export const PAOrdinaryCareSourcesSchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 originalDependentCare:z.record(z.string(),z.unknown()),
 payments:z.array(z.object({
  sourceReference:z.string(),providerIndex:z.number().int().nullable(),qualifyingPersonIndex:z.number().int().nullable(),
  paidOn:z.string(),serviceFrom:z.string(),serviceThrough:z.string(),amount:z.string(),
  originalAvailableConfirmed:answer,employmentRelatedConfirmed:answer,notClaimedOnAnotherReturnConfirmed:answer,
  originalReceipt:z.object({receiptNumber:z.string(),date:z.string(),amount:z.string(),providerName:z.string(),providerTin:z.string(),qualifyingPersonName:z.string(),qualifyingPersonTin:z.string()}).strict(),
 }).strict()),
}).strict();
export type PAOrdinaryCareSources=z.infer<typeof PAOrdinaryCareSourcesSchema>;
