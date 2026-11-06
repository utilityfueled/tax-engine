/** Private original-bound actual PA capital classification; no inferred facts. */
import {z} from 'zod';
const answer=z.boolean().nullable();
export const PAOrdinaryDigitalSourcesSchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 allOriginalDigitalStatementsIncludedConfirmed:answer,noOtherCapitalAdjustmentsConfirmed:answer,
 statements:z.array(z.object({originalIndex:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
  original:z.record(z.string(),z.unknown()).optional(),actualPaymentToPAConfirmed:answer,notRefundedByPayerConfirmed:answer}).strict()),
}).strict();
export type PAOrdinaryDigitalSources=z.infer<typeof PAOrdinaryDigitalSourcesSchema>;
