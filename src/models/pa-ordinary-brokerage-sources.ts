/** Actual ordinary personally owned securities and separately documented remittances. */
import {z} from 'zod';
import {PAInvestmentWithholdingAccountSchema} from './pa-investment-withholding-account.js';
const answer=z.boolean().nullable(),year=z.number().int().nullable(),index=z.number().int().nullable();
const original=z.record(z.string(),z.unknown()).optional();
export const PAOrdinaryBrokerageSourcesSchema=z.object({
 sourceTaxYear:year,sourceReference:z.string(),sourceFactsConfirmed:answer,
 owner:z.object({accountHolder:z.enum(['','primary','spouse']),originalTaxpayer:z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict().optional()}).strict(),
 allOriginalStatementsIncludedConfirmed:answer,noOtherCapitalAdjustmentsConfirmed:answer,
 statements:z.array(z.object({originalIndex:index,sourceTaxYear:year,sourceReference:z.string(),sourceFactsConfirmed:answer,currentUncorrectedNonvoidOriginalConfirmed:answer,allOriginalBoxesKnownConfirmed:answer,original,
  transactions:z.array(z.object({transactionIndex:index,sourceReference:z.string(),sourceFactsConfirmed:answer,classification:z.enum(['','ordinary_security_sale','zero_reported_position']),ordinaryPersonalInvestmentSecurityConfirmed:answer,notBusinessOrOperatingCapitalConfirmed:answer,noGiftInheritanceCompensationOrReorganizationConfirmed:answer,noSpecialAdjustmentOrDeferredMethodConfirmed:answer,securityId:z.string(),originalTransaction:original,acquisitionSourceReference:z.string(),proceedsSourceReference:z.string(),paBasisSourceReference:z.string(),grossProceeds:z.string(),saleExpenses:z.string(),paAdjustedBasis:z.string(),paidOn:z.string(),paBasisFactsConfirmed:answer,allSaleExpensesIncludedConfirmed:answer,noEconomicDisposalConfirmed:answer,allReportedAmountsKnownZeroConfirmed:answer}).strict()),
 }).strict()),
 withholdingOriginals:z.array(z.object({form:z.enum(['1099-INT','1099-DIV','1099-B']),originalIndex:index,original,sourceTaxYear:year,sourceReference:z.string(),sourceFactsConfirmed:answer,state:z.string(),amount:z.string(),actualPaymentToStateConfirmed:answer,notRefundedByPayerConfirmed:answer}).strict()),
 settledNYAccounts:z.array(PAInvestmentWithholdingAccountSchema),
}).strict();
export type PAOrdinaryBrokerageSources=z.infer<typeof PAOrdinaryBrokerageSourcesSchema>;
