// Spec: spec/state/pa-ordinary-digital-independent.yaml. Independent literal controls.
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculatePAOrdinaryDigitalSources} from '@/engine/state/pa-ordinary-digital-sources.js';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts.js';
import {Form1099DASchema} from '@/models/inputs.js';
import type {PAOrdinaryDigitalSources} from '@/models/pa-ordinary-digital-sources.js';
import {paOrdinaryDigitalFixture,refreshDigitalFixtureOriginals} from '../../fixtures/pa-ordinary-digital-sources.js';

const resident={status:'resident' as const};
function distinctSecond(f:ReturnType<typeof paOrdinaryDigitalFixture>){
 const form=structuredClone(f.input.form1099DA[0]);
 form.sourceId='Independent fictional second source';form.accountReference='Independent fictional second account';
 form.transactions[0].sourceId='Independent fictional second disposition';
 f.input.form1099DA.push(form);return form;
}
it('independent admitted cancellation survives the complete PA return',()=>{
 const f=paOrdinaryDigitalFixture(),h='1'+'0'.repeat(145),precision=Decimal.precision;
 Object.assign(f.input.form1099DA[0].transactions[0],{proceeds:h+'.51',costBasis:h+'.00',paCostBasis:h+'.00'});
 expect(Form1099DASchema.safeParse(f.input.form1099DA[0]).success).toBe(true);
 refreshDigitalFixtureOriginals(f);f.facts.timing.remainingTaxPayment.amountAppliedToTax='1535';
 const before=JSON.stringify(f),r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
 expect(r.scheduleD?.line12.toFixed()).toBe('1');expect(r.pa40.netGainOrLoss.toFixed()).toBe('1');
 expect(r.pa40.totalPATaxableIncome.toFixed()).toBe('50001');expect(r.pa40.taxLiability.toFixed()).toBe('1535');
 expect(r.scheduleSP.eligibilityIncome.toFixed()).toBe('50001');expect(r.pa40.taxLiability.constructor).toBe(Decimal);
 expect(Decimal.precision).toBe(precision);expect(JSON.stringify(f)).toBe(before);expect(r.readiness.filingEligible).toBe(false);
});
it('independent distinct originals net once before class reporting',()=>{
 const f=paOrdinaryDigitalFixture();distinctSecond(f);
 for(const form of f.input.form1099DA)Object.assign(form.transactions[0],{proceeds:'100.49',paCostBasis:'100.00'});
 refreshDigitalFixtureOriginals(f);f.facts.timing.remainingTaxPayment.amountAppliedToTax='1535';
 const raw=calculatePAResidencySources(f.input,f.residency),r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
 expect(raw.digitalSources?.rawGainOrLoss.toFixed()).toBe('0.98');expect(r.pa40.netGainOrLoss.toFixed()).toBe('1');
 expect(r.pa40.totalPATaxableIncome.toFixed()).toBe('50001');expect(r.scheduleSP.eligibilityIncome.toFixed()).toBe('50001');
});
it('independent signed capital net preserves class loss without a wage or SP offset',()=>{
 const f=paOrdinaryDigitalFixture(),b=distinctSecond(f);b.transactions[0].paCostBasis='200.49';
 refreshDigitalFixtureOriginals(f);f.facts.timing.remainingTaxPayment.amountAppliedToTax='1535';
 const raw=calculatePAResidencySources(f.input,f.residency),r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
 expect(raw.digitalSources?.rawGainOrLoss.toFixed()).toBe('-79.75');expect(r.pa40.netGainOrLoss.toFixed()).toBe('-80');
 expect(r.pa40.totalPATaxableIncome.toFixed()).toBe('50000');expect(r.scheduleSP.eligibilityIncome.toFixed()).toBe('50000');
 expect(r.pa40.taxLiability.toFixed()).toBe('1535');
});
it('independent no-state original needs no invented remittance or refund answer',()=>{
 const f=paOrdinaryDigitalFixture();const raw:PAOrdinaryDigitalSources=structuredClone(f.digital);
 raw.statements[0].actualPaymentToPAConfirmed=null;raw.statements[0].notRefundedByPayerConfirmed=null;
 const before=JSON.stringify({originals:f.input.form1099DA,raw});
 const r=calculatePAOrdinaryDigitalSources(f.input,raw,resident);
 expect(r.reportedGainOrLoss.toFixed()).toBe('20');expect(r.paWithholding.toFixed()).toBe('0');
 expect(r.stateWithholding).toEqual([]);expect(JSON.stringify({originals:f.input.form1099DA,raw})).toBe(before);
});
it('independent printed zero PA withholding needs no invented remittance or refund answer',()=>{
 const f=paOrdinaryDigitalFixture();Object.assign(f.input.form1099DA[0],{stateTaxReporting:'single',state:'PA',stateIdentificationNumber:'Fictional zero PA source',stateWithheld:'0'});
 refreshDigitalFixtureOriginals(f);const raw:PAOrdinaryDigitalSources=structuredClone(f.digital);
 raw.statements[0].actualPaymentToPAConfirmed=null;raw.statements[0].notRefundedByPayerConfirmed=null;
 const r=calculatePAOrdinaryDigitalSources(f.input,raw,resident);
 expect(r.paWithholding.toFixed()).toBe('0');expect(r.stateWithholding.map(x=>[x.state,x.amount.toFixed()])).toEqual([['PA','0']]);
});
it('independent positive PA payment needs both original remittance proofs',()=>{
 for(const [paid,notRefunded] of [[null,true],[true,null],[false,true],[true,false]] as const){
  const f=paOrdinaryDigitalFixture();Object.assign(f.input.form1099DA[0],{stateTaxReporting:'single',state:'PA',stateIdentificationNumber:'Fictional positive PA source',stateWithheld:'0.55'});
  refreshDigitalFixtureOriginals(f);const raw:PAOrdinaryDigitalSources=structuredClone(f.digital);
  raw.statements[0].actualPaymentToPAConfirmed=paid;raw.statements[0].notRefundedByPayerConfirmed=notRefunded;
  expect(()=>calculatePAOrdinaryDigitalSources(f.input,raw,resident)).toThrow(/remittance/);
 }
});
it('independent original state pair excludes federal and outside withholding from PA payments',()=>{
 const f=paOrdinaryDigitalFixture();Object.assign(f.input.form1099DA[0],{stateTaxReporting:'multiple',state:undefined,stateIdentificationNumber:undefined,stateWithheld:'1.00',federalWithheld:'900.25',stateWithholding:[{state:'PA',stateIdentificationNumber:'Fictional PA',stateWithheld:'0.55'},{state:'OH',stateIdentificationNumber:'Fictional OH',stateWithheld:'0.45'}]});
 refreshDigitalFixtureOriginals(f);const r=calculatePAOrdinaryReturnFacts(f.input,f.facts);
 expect(r.paWithholding.toFixed()).toBe('0.55');
 const helper=calculatePAOrdinaryDigitalSources(f.input,f.digital,resident);
 expect(helper.stateWithholding.map(x=>[x.state,x.amount.toFixed()])).toEqual([['PA','0.55'],['OH','0.45']]);
 expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/other-state digital/);
});
it('independent reordered distinct coverage works and omitted originals fail closed',()=>{
 const f=paOrdinaryDigitalFixture();distinctSecond(f);refreshDigitalFixtureOriginals(f);
 f.digital.statements.reverse();expect(calculatePAOrdinaryDigitalSources(f.input,f.digital,resident).rawGainOrLoss.toFixed()).toBe('40.5');
 f.digital.statements.pop();expect(()=>calculatePAOrdinaryDigitalSources(f.input,f.digital,resident)).toThrow(/every current original/);
});
it('independent unsupported costs and wash methods retain their original guard',()=>{
 for(const patch of [{sellingExpenses:'0.01',sellingCostsNotInProceedsConfirmed:true},{washSale:true,washSaleDisallowed:'0'}]){
  const f=paOrdinaryDigitalFixture();Object.assign(f.input.form1099DA[0].transactions[0],patch);refreshDigitalFixtureOriginals(f);
  expect(()=>calculatePAOrdinaryDigitalSources(f.input,f.digital,resident)).toThrow(/special adjustments/);
 }
});
it('independent complete-marker spoof cannot replace missing original source boxes',()=>{
 const f=paOrdinaryDigitalFixture();Object.assign(f.input.form1099DA[0].transactions[0],{sellingExpenses:undefined});
 f.input.form1099DA[0].transactions[0].sourceFactsComplete=true;refreshDigitalFixtureOriginals(f);
 expect(()=>calculatePAOrdinaryDigitalSources(f.input,f.digital,resident)).toThrow(/canonical original/);
});
it('independent equal-money stale snapshot and changed owner cannot be silently refreshed',()=>{
 const f=paOrdinaryDigitalFixture(),before=JSON.stringify(f.digital);
 f.input.form1099DA[0].accountReference='Independent changed equal-money original';
 expect(()=>calculatePAOrdinaryDigitalSources(f.input,f.digital,resident)).toThrow(/canonical original/);
 expect(JSON.stringify(f.digital)).toBe(before);
 f.input.form1099DA[0].accountHolder='spouse';refreshDigitalFixtureOriginals(f);
 expect(()=>calculatePAOrdinaryDigitalSources(f.input,f.digital,resident)).toThrow(/canonical original/);
});
it('independent original identifiers and private references stay out of public source audit',()=>{
 const f=paOrdinaryDigitalFixture(),r=calculatePAOrdinaryDigitalSources(f.input,f.digital,resident),output=JSON.stringify(r);
 for(const secret of [f.input.taxpayer.primary.ssn,f.input.form1099DA[0].accountReference,f.input.form1099DA[0].sourceId,f.digital.sourceReference,f.digital.statements[0].sourceReference,f.input.form1099DA[0].transactions[0].paBasisSourceReference]){
  expect(secret).toBeTruthy();expect(output).not.toContain(secret);
 }
 expect(r.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);
});
