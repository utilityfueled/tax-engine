/** Actual private personal distribution originals; blanks/nulls are drafts, never zeros. */
import {z} from 'zod';
const answer=z.boolean().nullable();
export const PAOrdinaryDividendSourceSchema=z.object({
 originalIndex:z.number().int().nullable(),sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 original:z.record(z.string(),z.unknown()).optional(),ordinaryPersonalDividendIncomeConfirmed:answer,
 capitalDistributionsFromRegulatedInvestmentCompanyConfirmed:answer,noOtherPADividendAdjustmentsConfirmed:answer,
 currentUncorrectedNonvoidOriginalConfirmed:answer,allOriginalBoxesKnownConfirmed:answer,
 credits:z.array(z.object({sourceReference:z.string(),creditedOn:z.string(),ordinaryDividends:z.string(),capitalGainDistributions:z.string()}).strict()),
}).strict();
export type PAOrdinaryDividendSource=z.infer<typeof PAOrdinaryDividendSourceSchema>;
