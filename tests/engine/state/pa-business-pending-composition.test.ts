// Spec: state/pa-business-pending-account.yaml pending-admission/payment-v-liability/old-assertions.
// Existing production imports deliberately separate actual admission failures from missing new-module diagnostics.
import {describe,it,expect} from 'vitest';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {zeroBusinessPendingFixture} from '../../fixtures/pa-business-pending-account';
const replay=(f:ReturnType<typeof zeroBusinessPendingFixture>)=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
describe('Actual outstanding NY zero-business PA completion',()=>{
 it.each(['resident','part_year','nonresident']as const)('actual pending NY cents do not block a zero credit PA return for %s',status=>{
  const f=zeroBusinessPendingFixture(status),before=structuredClone(f);
  const income=calculatePAResidencySources(f.input,f.input.paResidencySources);expect(income.netBusinessIncome.toFixed()).toBe('0');expect(income.businessPAWithholding.toFixed()).toBe('0.1');
  const facts=calculatePAOrdinaryReturnFacts(f.input,f.facts);expect(facts.paWithholding.toFixed()).toBe('0.1');
  const r=replay(f);expect(r.pa40.netBusinessIncome.toFixed()).toBe('0');expect(r.pa40.taxLiability.toFixed()).toBe('0');expect(r.pa40.residentCredit.toFixed()).toBe('0');expect(r.pa40.stateWithholding.toFixed()).toBe('0');expect(r.readiness.filingEligible).toBe(false);
  // Distinct source cash facts remain recorded exactly; none is an actually received NY refund.
  expect(f.sources.otherStateTaxes.status).toBe('actual_payments');expect(f.sources.otherStateTaxes.jurisdictions.find(row=>row.state==='NY')?.taxPaid).toBe('0.20');expect(f.account.refunds).toEqual([]);expect(f.account.account.overpaymentOutstandingReported).toBe('0.20');expect(f).toEqual(before);
 });
 it('incomplete old business originals cannot silently gain a pending account',()=>{
  const f=zeroBusinessPendingFixture();delete f.business.pendingNYAccountSources;expect(()=>replay(f)).toThrow(/business|source|original|pending|payment|history/i);
 });
 it.each(['none_paid','net_paid_zero','withheld_zero','wrong_date','missing_NY']as const)('completion cash history cannot be replaced by zero liability: %s',kind=>{
  const f=zeroBusinessPendingFixture(),row=f.sources.otherStateTaxes.jurisdictions.find(row=>row.state==='NY');if(!row)throw Error('Explicit actual NY history required');
  if(kind==='none_paid')f.sources.otherStateTaxes.status='none_paid';if(kind==='net_paid_zero')row.taxPaid='0';if(kind==='withheld_zero')row.incomeTaxWithheld='0';if(kind==='wrong_date')row.completeThroughDate='2026-04-14';if(kind==='missing_NY')f.sources.otherStateTaxes.jurisdictions=[];
  expect(()=>replay(f)).toThrow(/history|pending|payment|source|original|complete|reconcile/i);
 });
});

it.each(['residentCreditSources','refundedDigitalSources'] as const)('pending business cannot hide a different supplied payment method %s',(key)=>{
 const f=zeroBusinessPendingFixture();Object.assign(f.sources.otherStateTaxes,{[key]:{sourceFactsConfirmed:true}});
 expect(()=>replay(f)).toThrow(/source|shape|unknown|method|mixed|unsupported/i);
});
