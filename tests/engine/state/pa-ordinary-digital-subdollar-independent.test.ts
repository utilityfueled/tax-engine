// Spec: spec/state/pa-ordinary-digital-subdollar-independent.yaml.
// Additive independent control; original16 controls and original outcomes stay exact.
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculatePAOrdinaryDigitalSources} from '@/engine/state/pa-ordinary-digital-sources.js';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import type {PAOrdinaryDigitalSources} from '@/models/pa-ordinary-digital-sources.js';
import {paOrdinaryDigitalFixture,refreshDigitalFixtureOriginals} from '../../fixtures/pa-ordinary-digital-sources.js';

it('independent actual subdollar PA payments require proof before aggregation and print once',()=>{
 const f=paOrdinaryDigitalFixture();
 const a=f.input.form1099DA[0];
 Object.assign(a,{stateTaxReporting:'single',state:'PA',stateIdentificationNumber:'Fictional independent PA payer A',stateWithheld:'0.49'});
 const b=structuredClone(a);
 Object.assign(b,{sourceId:'Fictional independent subdollar original B',accountReference:'Fictional independent subdollar account B',stateIdentificationNumber:'Fictional independent PA payer B',stateWithheld:'0.02'});
 b.transactions[0].sourceId='Fictional independent subdollar disposition B';
 f.input.form1099DA.push(b);refreshDigitalFixtureOriginals(f);
 f.facts.timing.remainingTaxPayment.amountAppliedToTax='1535';
 const before=JSON.stringify(f),precision=Decimal.precision;
 for(const original of f.input.form1099DA){
  expect(new Decimal(original.stateWithheld??'NaN').gt(0)).toBe(true);
  expect(new Decimal(original.stateWithheld??'NaN').toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toFixed()).toBe('0');
 }
 const source=calculatePAOrdinaryDigitalSources(f.input,f.digital,{status:'resident'});
 expect(source.paWithholding.toFixed()).toBe('0.51');
 expect(source.stateWithholding.map(row=>[row.state,row.amount.toFixed()])).toEqual([['PA','0.49'],['PA','0.02']]);
 expect(calculatePAOrdinaryReturnFacts(f.input,f.facts).paWithholding.toFixed()).toBe('0.51');
 const r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
 expect(r.pa40.netGainOrLoss.toFixed()).toBe('41');
 expect(r.pa40.totalPATaxableIncome.toFixed()).toBe('50041');
 expect(r.pa40.taxLiability.toFixed()).toBe('1536');
 expect(r.pa40.stateWithholding.toFixed()).toBe('1');
 expect(r.pa40.taxDue.toFixed()).toBe('1535');
 expect(r.readiness.filingEligible).toBe(false);
 for(const index of [0,1])for(const field of ['actualPaymentToPAConfirmed','notRefundedByPayerConfirmed'] as const)for(const unproven of [null,false]){
  const raw:PAOrdinaryDigitalSources=structuredClone(f.digital);
  raw.statements[index][field]=unproven;
  expect(()=>calculatePAOrdinaryDigitalSources(f.input,raw,{status:'resident'})).toThrow(/remittance/);
 }
 expect(JSON.stringify(f)).toBe(before);
 expect(Decimal.precision).toBe(precision);
});
