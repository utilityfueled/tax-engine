/** Spec: state/oh-2026-resident-credit-draft.yaml. Actual ordinary Virginia originals. */
import { z } from 'zod';
const ref=z.string().trim().min(1);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money=z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/);
const person=z.object({firstName:ref,lastName:ref,ssn:ref}).strict();
const identity={taxYear:z.literal(2026),accountHolder:z.literal('primary'),originalTaxpayer:person};
// Actual ACH-credit originals, not an arbitrary provider/filing confirmation.
// Virginia Electronic Payment Guide Appendix B: mandatory numeric15 entry trace.
const transactionIdentity={...identity,sourceReference:ref,stateCode:z.literal('VA'),
 purpose:z.literal('individual_income_tax_balance'),taxPeriodEnd:z.literal('2026-12-31'),
 amount:money,achTraceNumber:z.string().regex(/^\d{15}$/)};
const transactionOriginals=z.object({
 kind:z.literal('settled_ach_credit'),
 bankTransferOriginal:z.object({...transactionIdentity,settlementDate:date,status:z.literal('settled')}).strict(),
 agencyPostingOriginal:z.object({...transactionIdentity,accountSourceReference:ref,postingDate:date,postingId:ref,status:z.literal('applied')}).strict(),
}).strict();
const receipt=z.object({...identity,sourceId:ref,sourceReference:ref,kind:z.enum(['withholding','estimated','balance','refund']),date,amount:money,transactionOriginals:transactionOriginals.optional()}).strict();
export const Ohio2026ResidentCreditSourcesSchema=z.object({
 sourceTaxYear:z.literal(2026),sourceReference:ref,sourceFactsConfirmed:z.literal(true),accountHolder:z.literal('primary'),w2Index:z.literal(0),originalTaxpayer:person,originalW2:z.record(z.string(),z.unknown()),
 allIncomeOriginalsIncludedConfirmed:z.literal(true),noOtherIncomeOrAdjustmentsConfirmed:z.literal(true),noSpecialCompensationConfirmed:z.literal(true),taxDeductedInFederalAgi:z.literal('none'),
 employerEntityOriginal:z.object({sourceId:ref,sourceReference:ref,sourceTaxYear:z.literal(2026),documentDate:date,employerName:ref,employerTin:ref,entityType:z.literal('c_corporation')}).strict(),
 serviceRows:z.array(z.object({sourceId:ref,sourceReference:ref,sourceTaxYear:z.literal(2026),accountHolder:z.literal('primary'),employerTin:ref,servicePeriodFrom:date,servicePeriodTo:date,paymentDate:date,serviceState:z.enum(['OH','VA']),wages:money}).strict()).min(1).max(366),
 filedReturn:z.object({...identity,sourceId:ref,sourceReference:ref,stateCode:z.literal('VA'),form:z.literal('763'),filingStatus:z.literal('single'),returnKind:z.literal('original'),periodFrom:date,periodTo:date,filedDate:date,
 federalAgi:money,incomeTaxedByVirginia:money,incomeTaxBeforeCredits:money,nonrefundableCredits:money,netIncomeTax:money,withholding:money,estimatedPayments:money,balancePayments:money,refund:money,outgoingCredit:money,otherTaxes:money,penalties:money,interest:money,completedReturnAndCreditWorksheetsReference:ref}).strict(),
 completedAccount:z.object({...identity,sourceId:ref,sourceReference:ref,stateCode:z.literal('VA'),statementDate:date,netIncomeTax:money,unpaidTax:money,unappliedPayments:money,outgoingCredit:money,otherTaxes:money,penalties:money,interest:money,
 allPaymentsAndRefundsIncludedConfirmed:z.literal(true),noPendingChangesOrRefundClaimsConfirmed:z.literal(true),payments:z.array(receipt).max(1000),refunds:z.array(receipt).max(1000)}).strict()
}).strict();
export type Ohio2026ResidentCreditSources=z.infer<typeof Ohio2026ResidentCreditSourcesSchema>;
