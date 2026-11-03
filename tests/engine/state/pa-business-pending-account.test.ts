// Spec: state/pa-business-pending-account.yaml account-proof/balances/contradictions/binding.
// New-module import is an intentional separate diagnostic until the approved genuine admission RED is reviewed.
import {describe,it,expect} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs';
import {calculatePABusinessPendingAccountSources} from '@/engine/state/pa-business-pending-account';
import {zeroBusinessPendingFixture} from '../../fixtures/pa-business-pending-account';
const replay=(f:ReturnType<typeof zeroBusinessPendingFixture>)=>calculatePABusinessPendingAccountSources(f.input,f.account,'2026-04-15');
describe('Source-backed NY pending zero-business account',()=>{
 it('pending account cash balances remain exact and outstanding',()=>{
  const f=zeroBusinessPendingFixture(),r=replay(f);
  expect(r.actualWithholding.toFixed()).toBe('0.2');expect(r.actualNetRemittances.toFixed()).toBe('0.2');expect(r.actualRefundsReceived.toFixed()).toBe('0');expect(r.outstandingOverpayment.toFixed()).toBe('0.2');expect(r.actualTaxLiability.toFixed()).toBe('0');expect(r.qualifiedSameIncome.toFixed()).toBe('0');expect(r.paCredit.toFixed()).toBe('0');expect(r.status).toBe('outstanding_overpayment');expect(r.filingEligible).toBe(false);
 });
 it.each(['unconfirmed','year','owner','source','beneficial_owner','account_credit','remittance','payer_recourse','payer_error','taxable_compensation','filed_original','full_history','agency_original','NY_residency','NY_source_absence']as const)('pending account requires actual source originals and account qualification: %s',kind=>{
  const f=zeroBusinessPendingFixture(),a=f.account,p=a.payments[0];
  if(kind==='unconfirmed')a.sourceFactsConfirmed=false;if(kind==='year')a.sourceTaxYear=2026;if(kind==='owner')a.accountSsn='900-00-0001';if(kind==='source')a.sourceReference='';if(kind==='beneficial_owner')p.taxpayerBeneficialOwnerConfirmed=false;if(kind==='account_credit')p.taxpayerAccountCreditConfirmed=false;if(kind==='remittance')p.actualPaymentToStateConfirmed=false;if(kind==='payer_recourse')p.noPayerRefundReimbursementOrRecourseConfirmed=false;if(kind==='payer_error')p.payerErrorExplanation='';if(kind==='taxable_compensation')p.notTaxableCompensationConfirmed=false;if(kind==='filed_original')a.filedReturn.returnId='';if(kind==='full_history')a.account.allPaymentsRefundsOffsetsTransfersAndWriteoffsReviewedConfirmed=false;if(kind==='agency_original')a.account.actualAgencyStatementConfirmed=false;if(kind==='NY_residency')a.filedReturn.fullYearNonNYResidentConfirmed=false;if(kind==='NY_source_absence')a.filedReturn.noNYBusinessOrOtherSourceIncomeConfirmed=false;
  expect(()=>replay(f)).toThrow(/pending|account|original|source|owner|NY|actual|complete|history|business/i);
 });
 it.each(['unknown_balance','wrong_paid','wrong_net','wrong_outstanding','unpaid','liability','reported_credit','form_refund','future_receipt','future_return','stale_account','received_refund','offset','writeoff','transfer','duplicate_payment','stale_original','different_AGI','other_NY_INT']as const)('pending account rejects contradictory cash or source records: %s',kind=>{
  const f=zeroBusinessPendingFixture(),a=f.account,p=a.payments[0];
  if(kind==='unknown_balance')a.account.overpaymentOutstandingReported='';if(kind==='wrong_paid')p.amount='0.19';if(kind==='wrong_net')a.account.netTaxPaymentsReported='0';if(kind==='wrong_outstanding')a.account.overpaymentOutstandingReported='0.19';if(kind==='unpaid')a.account.unpaidTaxReported='0.01';if(kind==='liability')a.filedReturn.finalTaxLiability='0.01';if(kind==='reported_credit')a.filedReturn.withholdingReported='0.20';if(kind==='form_refund')a.filedReturn.refundRequested='0.20';if(kind==='future_receipt')p.date='2026-04-16';if(kind==='future_return')a.filedReturn.filedOn='2026-04-16';if(kind==='stale_account')a.account.completeThroughDate='2026-04-14';
  if(kind==='received_refund')a.refunds.push({confirmationNumber:'Actual-received-refund',date:'2026-03-01',amount:'0.20',sourceReference:'Fictional actual received refund contradicts pending'});if(kind==='offset')a.offsets.push({confirmationNumber:'Actual-offset',date:'2026-03-01',amount:'0.20',sourceReference:'Fictional actual offset contradicts pending'});if(kind==='writeoff')a.writeoffs.push({confirmationNumber:'Actual-writeoff',date:'2026-03-01',amount:'0.20',sourceReference:'Fictional actual writeoff contradicts pending'});if(kind==='transfer')a.transfers.push({confirmationNumber:'Actual-transfer',date:'2026-03-01',amount:'0.20',sourceReference:'Fictional actual transfer contradicts pending'});
  if(kind==='duplicate_payment'){a.payments[0].amount='0.10';a.payments.push({...structuredClone(p),confirmationNumber:'  FICTIONAL-ny-nec-remittance-1  ',amount:'0.10'});}if(kind==='stale_original')f.input.form1099Nec[1].payer='Edited same-money payer';if(kind==='different_AGI')a.filedReturn.federalAdjustedGrossIncome='1';if(kind==='other_NY_INT')f.input.form1099Int.push({payer:'Actual other NY bank',payerTin:'12-3456789',accountHolder:'primary',interestIncome:'0',earlyWithdrawalPenalty:'0',usSavingsBondInterest:'0',federalWithheld:'0',foreignTaxPaid:'0',taxExemptInterest:'0',privateActivityBondInterest:'0',paDirectObligationInterest:'0',state:' ny ',stateWithheld:'0.01'});
  expect(()=>replay(f)).toThrow(/pending|account|original|source|owner|NY|actual|complete|history|business|payment|refund|liability/i);
 });
 it('pending account supports absent optional legacy retirement originals',()=>{
  const f=zeroBusinessPendingFixture();delete f.input.form1099R;expect(replay(f).actualNetRemittances.toFixed()).toBe('0.2');
 });
 it('pending account replay is immutable private and source bound',()=>{
  const f=zeroBusinessPendingFixture(),before=structuredClone(f),r=replay(f);expect(replay(f)).toEqual(r);expect(f).toEqual(before);expect(r.sourceCommitment).toMatch(/^[0-9a-f]{64}$/);
  f.account.account.sourceReference+=' actual replacement agency-statement document';expect(replay(f).sourceCommitment).not.toBe(r.sourceCommitment);
  expect(JSON.stringify(r)).not.toContain(f.input.taxpayer.primary.ssn);expect(JSON.stringify(r)).not.toContain('fictional-NY-zero-business-original-2025');
 });
});

const extraNY=[
 ['1099R',{form1099R:[{payer:'Actual other NY pension',grossDistribution:'0',taxableAmount:'0',distributionCode:'7',taxYear:2025,state:'NY',stateWithheld:'0.01'}]}],
 ['1099R alias',{form1099R:[{payer:'Actual other NY pension',grossDistribution:'0',taxableAmount:'0',distributionCode:'7',taxYear:2025,state:'NY',stateWithheld:'0',stateTaxWithheld:'0.01'}]}],
 ['1099G',{form1099G:[{payer:'Actual other NY government',unemploymentCompensation:'0',state:' ny ',stateWithheld:'0.01'}]}],
 ['1099K',{form1099K:[{pse:'Actual other NY processor',grossAmount:'0',state:'NY',stateWithheld:'0.01'}]}],
 ['W2G',{formW2G:[{payer:'Actual other NY wager payer',reportableWinnings:'0',typeOfWager:'lottery',state:'NY',stateWithheld:'0.01'}]}],
] as const;
it.each(extraNY)('pending account refuses omitted NY source family %s',(_name,extra)=>{
 const f=zeroBusinessPendingFixture();f.input=TaxYearInputSchema.parse({...f.input,...extra});
 expect(()=>replay(f)).toThrow(/actual|NY|withhold|source|account|pending/i);
});
it('pending account keeps actual100 digit cash and cents exact',()=>{
 const f=zeroBusinessPendingFixture(),whole='1'+'0'.repeat(100),exact=whole+'.20',original=structuredClone(f.input.form1099Nec[1]);
 original.payer='Separate actual zero-income NY original';original.payerTin='98-7654321';original.stateWithheld=whole;
 f.input.form1099Nec.push(original);
 f.account.payments.push({...structuredClone(f.account.payments[0]),originalIndex:2,original:structuredClone(original),confirmationNumber:'separate-actual-NY-payment',amount:whole});
 f.business.necOriginals.push({...structuredClone(f.business.necOriginals[1]),originalIndex:2,original:structuredClone(original),sourceReference:'Separate actual zero-income NY original'});
 Object.assign(f.account.account,{grossTaxPaymentsReported:exact,netTaxPaymentsReported:exact,overpaymentOutstandingReported:exact});
 const r=replay(f);expect(r.actualWithholding.toFixed(2)).toBe(exact);expect(r.actualNetRemittances.toFixed(2)).toBe(exact);expect(r.outstandingOverpayment.toFixed(2)).toBe(exact);expect(r.paCredit.toFixed()).toBe('0');expect(replay(f)).toEqual(r);
});
