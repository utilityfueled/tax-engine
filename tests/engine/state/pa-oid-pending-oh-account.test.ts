// Spec: spec/state/pa-oid-pending-oh-account.yaml.
import {describe,it,expect} from 'vitest';
import Decimal from 'decimal.js';
import {emptyGuidedPAOIDPendingOHAccount,confirmGuidedPAOIDPendingOHAccount,buildGuidedPAOIDPendingOHAccount,updateGuidedPAOIDPendingOHAccount} from '@/lib/guided-pa-oid-pending-oh-account';
import {calculatePAOIDPendingOHAccount} from '@/engine/state/pa-oid-pending-oh-account';
import {originalOIDPendingCompleteFixture} from '../../fixtures/guided-pa-oid-original-complete';

describe('actual pending Ohio OID account',()=>{
 it('keeps actual pending Ohio cash separate from zero liability and zero PA credit',()=>{
  const f=originalOIDPendingCompleteFixture(),r=calculatePAOIDPendingOHAccount(f.input,f.account,'2026-04-15');
  expect(r.actualWithholding.toFixed(2)).toBe('0.20');expect(r.actualNetRemittances.toFixed(2)).toBe('0.20');expect(r.outstandingOverpayment.toFixed(2)).toBe('0.20');expect(r.actualRefundsReceived.toFixed()).toBe('0');expect(r.actualTaxLiability.toFixed()).toBe('0');expect(r.paCredit.toFixed()).toBe('0');expect(r.filingEligible).toBe(false);
 });
 it.each(['unknown','year','owner','historyMissing','historyRawSamePrinted','reportedAGI','OHdomicile','paymentMissing','duplicatePayment','falseCredit','futurePayment','staleAsOf','refund','offset','transfer','writeoff','outstanding','liability','formRefund'] as const)('rejects incomplete or contradictory pending account %s',kind=>{
  const f=originalOIDPendingCompleteFixture(),p=f.account;
  if(kind==='unknown')p.sourceFactsConfirmed=false;if(kind==='year')p.sourceTaxYear=2026;if(kind==='owner')p.accountSsn='999-99-9999';
  if(kind==='historyMissing')p.filedReturn.originalFederalSources={};if(kind==='historyRawSamePrinted'){const o=structuredClone(f.input.form1099OID[0]);o.otherPeriodicInterest='20.21';p.filedReturn.originalFederalSources={...p.filedReturn.originalFederalSources,form1099OID:[o]};}
  if(kind==='reportedAGI')p.filedReturn.reportedFederalAdjustedGrossIncome='121';if(kind==='OHdomicile'){const residency=f.input.paResidencySources;if(!residency)throw Error('Actual source fixture residency required');residency.residency.domicilePeriods[0].state='OH';}
  if(kind==='paymentMissing')p.payments=[];if(kind==='duplicatePayment')p.payments.push(structuredClone(p.payments[0]));if(kind==='falseCredit')p.payments[0].taxpayerAccountCreditConfirmed=false;if(kind==='futurePayment')p.payments[0].date='2026-01-01';if(kind==='staleAsOf')p.account.completeThroughDate='2026-04-14';
  if(kind==='refund')p.refunds.push({confirmationNumber:'refund',date:'2026-03-01',amount:'.20',sourceReference:'Actual refund'});if(kind==='offset')p.offsets.push({confirmationNumber:'offset',date:'2026-03-01',amount:'.20',sourceReference:'Actual offset'});if(kind==='transfer')p.transfers.push({confirmationNumber:'transfer',date:'2026-03-01',amount:'.20',sourceReference:'Actual transfer'});if(kind==='writeoff')p.writeoffs.push({confirmationNumber:'writeoff',date:'2026-03-01',amount:'.20',sourceReference:'Actual writeoff'});
  if(kind==='outstanding')p.account.overpaymentOutstandingReported='0';if(kind==='liability')p.filedReturn.finalTaxLiability='1';if(kind==='formRefund')p.filedReturn.refundRequested='.20';expect(()=>calculatePAOIDPendingOHAccount(f.input,p,'2026-04-15')).toThrow();
 });
 it.each(['form1099Int','form1099Div','form1099B','form1099Nec','form1099Misc','form1099G','form1099K','formW2G','form1099R','w2s','form1099DA'] as const)('rejects an omitted actual Ohio withholding family %s',family=>{
  const f=originalOIDPendingCompleteFixture();Reflect.set(f.input,family,[{state:' oh ',stateWithheld:'0.10',stateTaxWithheld:'0.10',stateTaxWithholding:'0.10'}]);expect(()=>calculatePAOIDPendingOHAccount(f.input,f.account,'2026-04-15')).toThrow();
 });
 it('binds complete private original sources without rounding or mutating them',()=>{
  const f=originalOIDPendingCompleteFixture(),before=JSON.stringify(f),precision=Decimal.precision,r=calculatePAOIDPendingOHAccount(f.input,f.account,'2026-04-15');
  expect(r.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(r)).not.toContain('111-22-3333');expect(JSON.stringify(r)).not.toContain('fictional-Jordan');expect(JSON.stringify(f)).toBe(before);expect(Decimal.precision).toBe(precision);
  const altered=structuredClone(f.account);altered.sourceReference+=' distinct actual reference';expect(calculatePAOIDPendingOHAccount(f.input,altered,'2026-04-15').sourceCommitment).not.toBe(r.sourceCommitment);
 });
 it('pending account confirmation is explicit and reading cannot refresh historical sources',()=>{
  const f=originalOIDPendingCompleteFixture();expect(emptyGuidedPAOIDPendingOHAccount().sourceTaxYear).toBeNull();
  const unknown={...structuredClone(f.account),sourceFactsConfirmed:null};expect(()=>buildGuidedPAOIDPendingOHAccount(f.input,unknown,'2026-04-15')).toThrow();
  const confirmed=confirmGuidedPAOIDPendingOHAccount(f.input,unknown,'2026-04-15'),before=JSON.stringify(confirmed);
  expect(buildGuidedPAOIDPendingOHAccount(f.input,confirmed,'2026-04-15')).toEqual(confirmed);expect(JSON.stringify(confirmed)).toBe(before);
  expect(updateGuidedPAOIDPendingOHAccount(confirmed,{sourceReference:'changed reference'}).sourceFactsConfirmed).toBeNull();
  const changed=structuredClone(f.input);changed.form1099OID[0].otherPeriodicInterest='20.21';expect(()=>confirmGuidedPAOIDPendingOHAccount(changed,confirmed,'2026-04-15')).toThrow();
 });

});
