/** Actual private care originals. Draft unknowns are not factual defaults. */
import {z} from 'zod';
const answer=z.boolean().nullable();
const original=z.record(z.string(),z.unknown());
/** PA documentary facts supplement, never reinterpret, generic federal TINs. */
export const PACarePaperIdentitySourcesSchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 providers:z.array(z.object({
  providerIndex:z.number().int().nullable(),sourceReference:z.string(),originalAvailableConfirmed:answer,
  identifierKind:z.enum(['unknown','ssn','fein','itin']),originalProvider:original,
 }).strict()).max(50),
 qualifyingPersons:z.array(z.object({
  qualifyingPersonIndex:z.number().int().nullable(),originalDependentIndex:z.number().int().nullable(),
  sourceReference:z.string(),originalAvailableConfirmed:answer,identifierKind:z.enum(['unknown','ssn','itin','atin']),
  originalQualifyingPerson:original,originalFederalDependent:original,
 }).strict()).max(20),
}).strict();
export type PACarePaperIdentitySources=z.infer<typeof PACarePaperIdentitySourcesSchema>;
export const PAOrdinaryCareSourcesSchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 originalDependentCare:z.record(z.string(),z.unknown()),
 paperIdentitySources:PACarePaperIdentitySourcesSchema.optional(),
 payments:z.array(z.object({
  sourceReference:z.string(),providerIndex:z.number().int().nullable(),qualifyingPersonIndex:z.number().int().nullable(),
  paidOn:z.string(),serviceFrom:z.string(),serviceThrough:z.string(),amount:z.string(),
  originalAvailableConfirmed:answer,employmentRelatedConfirmed:answer,notClaimedOnAnotherReturnConfirmed:answer,
  originalReceipt:z.object({receiptNumber:z.string(),date:z.string(),amount:z.string(),providerName:z.string(),providerTin:z.string(),qualifyingPersonName:z.string(),qualifyingPersonTin:z.string()}).strict(),
 }).strict()),
}).strict();
export type PAOrdinaryCareSources=z.infer<typeof PAOrdinaryCareSourcesSchema>;
