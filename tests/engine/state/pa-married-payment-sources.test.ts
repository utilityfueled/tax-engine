/** Spec: spec/state/pa-married-payment-sources.yaml. */
import {describe,it,expect} from 'vitest';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return.js';
import {paMarriedPaymentsFixture} from '../../fixtures/pa-married-payments.js';
import {paMarriedOrdinaryFixture} from '../../fixtures/pa-married-ordinary-return.js';
function set(value:unknown,path:string,replacement:unknown){const keys=path.split('.');let row=value as Record<string,unknown>;for(const key of keys.slice(0,-1))row=row[key] as Record<string,unknown>;const last=keys.at(-1);if(last===undefined)throw new Error('Test mutation path required');row[last]=replacement;}
describe('actual separate-owner payment composition',()=>{
 it('PA married payments compose actual separate accounts with exact printed lines',()=>{
  const f=paMarriedPaymentsFixture(),r=calculatePAMarriedOrdinaryReturn(f.input,f.sources);
  expect(r.returns.map(v=>[v.pa40.creditFromPriorYear.toString(),v.pa40.estimatedPayments.toString(),v.pa40.extensionPayment.toString(),v.pa40.netOverpayment.toString()])).toEqual([['51','200','76','327'],['0','80','0','80']]);
  expect(r.returns.map(v=>v.pa40.taxLiability.toString())).toEqual(['1535','921']);expect(r.readiness.filingEligible).toBe(false);
 });
 it('PA married payments fund actual installments without inventing priorSP history',()=>{
  const f=paMarriedPaymentsFixture({primaryEstimates:['400','400','400','400'],primaryExtension:'0',priorCredit:'0',withholding:['0','921'],refunds:['65','80']});
  const r=calculatePAMarriedOrdinaryReturn(f.input,f.sources);expect(r.returns[0].rev1630.penaltyRequired).toBe(false);expect(r.returns[0].rev1630.quarters.map(q=>q.estimatedPayment.toString())).toEqual(['400','400','400','400']);expect(r.returns[0].pa40.netOverpayment.toString()).toBe('65');expect(f.sources.owners[0].payments.priorReturnStatus).toBe('no_return');
 });
 it.each([
  ['unknown-completeness','paymentSources.accounts.0.originalAccount.allPaymentsCompleteConfirmed',null],
  ['wrong-owner','paymentSources.accounts.0.originalAccount.accountSsn','900-70-0312'],
  ['wrong-name','paymentSources.accounts.0.originalAccount.accountName','Other Original'],
  ['wrong-year','paymentSources.accounts.0.originalAccount.taxYear',2024],
  ['joint-account','paymentSources.accounts.0.originalAccount.accountKind','joint'],
  ['wrong-form','paymentSources.accounts.0.originalAccount.returnType','PA-41'],
  ['offset-unknown','paymentSources.accounts.0.originalAccount.noTransfersOffsetsRefundsOrAdjustmentsConfirmed',null],
  ['stale-asof','paymentSources.accounts.0.originalAccount.asOfDate','2026-04-14'],
  ['receipt-missing','paymentSources.accounts.0.originalAccount.receipts',[]],
  ['changed-credit','paymentSources.accounts.0.originalAccount.availablePriorCredit','50.49'],
  ['late-credit','paymentSources.accounts.0.originalAccount.priorCreditAppliedOn','2025-04-16'],
  ['prior-joint','paymentSources.accounts.0.priorCredit.originalPriorReturn.filingStatus','J'],
  ['prior-owner','paymentSources.accounts.0.priorCredit.originalPriorReturn.accountSsn','900-70-0312'],
  ['prior-year','paymentSources.accounts.0.priorCredit.originalPriorReturn.taxYear',2023],
  ['unknown-election','paymentSources.accounts.0.priorCredit.originalPriorReturn.creditElected',''],
  ['prior-not-filed','paymentSources.accounts.0.priorCredit.originalPriorReturn.filedOn','2026-04-16'],
  ['unknown-receipt','paymentSources.accounts.0.receipts.0.original.amount',''],
  ['negative-receipt','paymentSources.accounts.0.receipts.0.original.amount','-1'],
  ['noncalendar','paymentSources.accounts.0.receipts.0.original.date','2025-02-30'],
  ['late-period','paymentSources.accounts.0.receipts.0.original.date','2025-04-16'],
  ['post-asof','paymentSources.accounts.0.receipts.0.original.date','2026-04-16'],
  ['unsupported-balance','paymentSources.accounts.0.receipts.0.original.kind','balance'],
  ['unknown-period','paymentSources.accounts.0.receipts.0.intendedInstallment',null],
  ['stale-status','owners.0.payments.estimatedPaymentsStatus','known_none'],
  ['dropped-retained','owners.0.payments.originalReceipts',[]],
  ['unknown-prior','owners.0.payments.priorReturnStatus',''],
  ['duplicate-owner','paymentSources.accounts.1.accountHolder','primary'],
  ['unknown-confirmation','paymentSources.accounts.0.receipts.0.original.confirmationNumber',''],
  ['extension-request-unknown','timing.filingExtension','none'],
  ['payment-extension','timing.paymentExtension','actual_extension'],
  ['late-original','timing.filingDate','2026-04-16'],
  ['wrong-refund','dispositions.0.refundRequested','328'],
 ] as const)('PA married payments reject incomplete or contradictory originals %s',(_label,path,value)=>{const f=paMarriedPaymentsFixture();set(f.sources,path,value);if(path.startsWith('paymentSources.accounts.0.receipts.')){const originals=f.sources.paymentSources.accounts[0].receipts.map(r=>structuredClone(r.original));f.sources.paymentSources.accounts[0].originalAccount.receipts=structuredClone(originals);f.sources.owners[0].payments.originalReceipts=structuredClone(originals);}expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow();});
 it('PA married payments reject duplicate originals even with different references',()=>{
  const f=paMarriedPaymentsFixture(),a=f.sources.paymentSources.accounts[0],copy=structuredClone(a.receipts[0]);copy.sourceReference='Different label only';a.receipts.push(copy);a.originalAccount.receipts.push(structuredClone(copy.original));f.sources.owners[0].payments.originalReceipts.push(structuredClone(copy.original));expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/duplicate/i);
 });
 it('PA married payments do not use April15 extension cash to cure missed installments',()=>{
  const f=paMarriedPaymentsFixture({primaryEstimates:[],primaryExtension:'1600',priorCredit:'0',withholding:['0','921'],refunds:['65','80']});expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/prior.*(?:exemption|forgiveness|eligibility)/i);
 });
 it('PA married payments retain explicit zero originals and sum cents before rounding',()=>{
  const f=paMarriedPaymentsFixture({primaryEstimates:['0','0'],primaryExtension:'0',priorCredit:'0',refunds:['0','80']});const r=calculatePAMarriedOrdinaryReturn(f.input,f.sources);expect(r.returns[0].pa40.estimatedPayments.toString()).toBe('0');expect(f.sources.owners[0].payments.estimatedPaymentsStatus).toBe('actual_receipts');expect(f.sources.owners[0].payments.originalReceipts).toHaveLength(2);
  const cents=paMarriedPaymentsFixture({primaryEstimates:['0.25','0.25'],primaryExtension:'0',priorCredit:'0',refunds:['1','80']});expect(calculatePAMarriedOrdinaryReturn(cents.input,cents.sources).returns[0].pa40.estimatedPayments.toString()).toBe('1');
 });
 it('PA married payments reject opposing separate-owner balances without a transfer source',()=>{
  const f=paMarriedPaymentsFixture({primaryEstimates:[],primaryExtension:'0',priorCredit:'0',withholding:['1500','921'],refunds:['0','80']});Object.assign(f.sources.dispositions[0].remainingPayment,{status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'35'});expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/opposing.*excess.*deficit/i);
 });
 it('PA married payments keep actual early timely receipts within their original period',()=>{
  const f=paMarriedPaymentsFixture();const a=f.sources.paymentSources.accounts[0];a.receipts[0].original.date='2025-02-01';a.originalAccount.receipts=structuredClone(a.receipts.map(r=>r.original));f.sources.owners[0].payments.originalReceipts=structuredClone(a.originalAccount.receipts);expect(calculatePAMarriedOrdinaryReturn(f.input,f.sources).returns[0].pa40.netOverpayment.toString()).toBe('327');
 });
 it('PA married payments reject unsupported prior filing after carryover application',()=>{
  const f=paMarriedPaymentsFixture();const prior=f.sources.paymentSources.accounts[0].priorCredit.originalPriorReturn;if(!prior)throw new Error('Fictional actual prior return missing');prior.filedOn='2025-04-16';expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/prior.*(?:file|filing|carryover|separate)/i);
 });
 it('PA married payments preserve source commitment privacy and original inputs',()=>{
  const f=paMarriedPaymentsFixture(),before=JSON.stringify(f),a=calculatePAMarriedOrdinaryReturn(f.input,f.sources);expect(JSON.stringify(f)).toBe(before);f.sources.paymentSources.accounts[0].receipts[0].sourceReference='Changed equal-cash documentary reference';const b=calculatePAMarriedOrdinaryReturn(f.input,f.sources);expect(b.sourceCommitment).not.toBe(a.sourceCommitment);const text=JSON.stringify(a.lines);for(const privateText of ['SYNTHETIC-','900-70','Avery','Morgan','Fictional'])expect(text).not.toContain(privateText);
 });
 it('PA married payments preserve legacy known-none and reject supplied unsupported methods',()=>{
  for(const mode of ['J','M'] as const){const f=paMarriedOrdinaryFixture(mode);expect(calculatePAMarriedOrdinaryReturn(f.input,f.sources).returns).toHaveLength(mode==='J'?1:2);}
  for(const change of ['joint','2026','missing-account','malformed'] as const){const f=paMarriedPaymentsFixture();if(change==='joint')f.sources.filingMode='J';if(change==='2026')f.input.taxpayer.taxYear=2026;if(change==='missing-account')f.sources.paymentSources.accounts.pop();if(change==='malformed')set(f.sources,'paymentSources',{});expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow();}
 });
});
