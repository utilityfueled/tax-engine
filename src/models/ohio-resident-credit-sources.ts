/** Spec: state/oh-resident-credit-sources.yaml. Actual ordinary Virginia originals. */
import { z } from 'zod';
const ref=z.string().trim().min(1);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money=z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/);
const person=z.object({firstName:ref,lastName:ref,ssn:ref}).strict();
const identity={taxYear:z.literal(2025),accountHolder:z.literal('primary'),originalTaxpayer:person};
// Actual ACH-credit originals, not an arbitrary provider/filing confirmation.
// Virginia Electronic Payment Guide Appendix B: mandatory numeric15 entry trace.
const transactionIdentity={...identity,sourceReference:ref,stateCode:z.literal('VA'),
 purpose:z.literal('individual_income_tax_balance'),taxPeriodEnd:z.literal('2025-12-31'),
 amount:money,achTraceNumber:z.string().regex(/^\d{15}$/)};
const transactionOriginals=z.object({
 kind:z.literal('settled_ach_credit'),
 bankTransferOriginal:z.object({...transactionIdentity,settlementDate:date,status:z.literal('settled')}).strict(),
 agencyPostingOriginal:z.object({...transactionIdentity,accountSourceReference:ref,postingDate:date,postingId:ref,status:z.literal('applied')}).strict(),
}).strict();
const receipt=z.object({...identity,sourceId:ref,sourceReference:ref,kind:z.enum(['withholding','estimated','balance','refund']),date,amount:money,transactionOriginals:transactionOriginals.optional()}).strict();
export const OhioResidentCreditSourcesSchema=z.object({
 sourceTaxYear:z.literal(2025),sourceReference:ref,sourceFactsConfirmed:z.literal(true),accountHolder:z.literal('primary'),originalTaxpayer:person,originalW2:z.record(z.string(),z.unknown()),
 allIncomeOriginalsIncludedConfirmed:z.literal(true),noOtherIncomeOrAdjustmentsConfirmed:z.literal(true),noSpecialCompensationConfirmed:z.literal(true),taxDeductedInFederalAgi:z.literal('none'),
 employerEntityOriginal:z.object({sourceId:ref,sourceReference:ref,sourceTaxYear:z.literal(2025),documentDate:date,employerName:ref,employerTin:ref,entityType:z.literal('c_corporation')}).strict(),
 serviceRows:z.array(z.object({sourceId:ref,sourceReference:ref,sourceTaxYear:z.literal(2025),accountHolder:z.literal('primary'),employerTin:ref,servicePeriodFrom:date,servicePeriodTo:date,paymentDate:date,serviceState:z.enum(['OH','VA']),wages:money}).strict()).min(1),
 filedReturn:z.object({...identity,sourceId:ref,sourceReference:ref,stateCode:z.literal('VA'),form:z.literal('763'),filingStatus:z.literal('single'),returnKind:z.literal('original'),periodFrom:date,periodTo:date,filedDate:date,
 federalAgi:money,incomeTaxedByVirginia:money,incomeTaxBeforeCredits:money,nonrefundableCredits:money,netIncomeTax:money,withholding:money,estimatedPayments:money,balancePayments:money,refund:money,outgoingCredit:money,otherTaxes:money,penalties:money,interest:money,completedReturnAndCreditWorksheetsReference:ref}).strict(),
 completedAccount:z.object({...identity,sourceId:ref,sourceReference:ref,stateCode:z.literal('VA'),statementDate:date,netIncomeTax:money,unpaidTax:money,unappliedPayments:money,outgoingCredit:money,otherTaxes:money,penalties:money,interest:money,
 allPaymentsAndRefundsIncludedConfirmed:z.literal(true),noPendingChangesOrRefundClaimsConfirmed:z.literal(true),payments:z.array(receipt),refunds:z.array(receipt)}).strict()
}).strict();
export type OhioResidentCreditSources=z.infer<typeof OhioResidentCreditSourcesSchema>;
