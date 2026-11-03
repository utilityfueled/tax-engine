/** Explicit private original facts. No missing answer/amount/year defaults to a fact. */
import { z } from 'zod';
const answer=z.boolean().nullable();
const original=z.record(z.string(),z.unknown()).optional();
const proof=z.object({sourceReference:z.string(),actualPaymentToPAConfirmed:answer,notRefundedByPayerConfirmed:answer}).strict();
const row=z.object({originalIndex:z.number().int().nullable(),sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 original,currentUncorrectedNonvoidOriginalConfirmed:answer,allOriginalBoxesKnownConfirmed:answer});
export const PAOrdinaryOIDSourcesSchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 owner:z.object({accountHolder:z.enum(['','primary','spouse']),originalTaxpayer:z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict().optional()}).strict(),
 oid:z.array(row.extend({personalInvestmentOnlyConfirmed:answer,notNomineeOrTrustConfirmed:answer,
  classification:z.enum(['','direct_us_treasury','ordinary_taxable']),
  instrument:z.object({sourceReference:z.string(),securityId:z.string(),issuerName:z.string(),issuedOn:z.string(),maturesOn:z.string(),directLegalOwnershipConfirmed:answer,
   usTreasuryDirectObligationConfirmed:answer,stripped:answer,guaranteedAgencyOnly:answer}).strict(),
  accruals:z.array(z.object({from:z.string(),through:z.string(),oid:z.string(),coupon:z.string(),sourceReference:z.string()}).strict()),
  withholdingConfirmation:proof,
 }).strict()),
 miscWithholding:z.array(row.extend({allIncomeBoxesKnownZeroConfirmed:answer,withholdingConfirmation:proof}).strict()),
}).strict();
export type PAOrdinaryOIDSources=z.infer<typeof PAOrdinaryOIDSourcesSchema>;
