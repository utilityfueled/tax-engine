// Spec: state/pa-ordinary-oid-consumer-precision.yaml; literal source-first oracles.
import Decimal from 'decimal.js';
import {isDeepStrictEqual} from 'node:util';
import {describe,it,expect} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {PAResidencySourcesSchema} from '@/models/pa-residency.js';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources.js';
import {calculatePAScheduleA} from '@/engine/state/pa-schedule-a.js';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts.js';
import {refreshPAOIDOriginals,paOrdinaryOIDFixture} from '../../fixtures/pa-ordinary-oid-sources.js';
import {oidConsumerPrecisionFixture,oidHugeInteger,oidHugePlus} from '../../fixtures/pa-ordinary-oid-consumer-precision.js';
const run=(f:ReturnType<typeof oidConsumerPrecisionFixture>)=>calculatePAResidencySources(f.input,f.sources);
function checkPublic(value:unknown):void{if(Decimal.isDecimal(value)){expect(value.constructor).toBe(Decimal);return;}if(Array.isArray(value))for(const child of value)checkPublic(child);else if(value&&typeof value==='object')for(const child of Object.values(value))checkPublic(child);}
describe('actual OID consumer precision',()=>{
 it('preserves accepted dated OID source cents and printed lines for all three residencies',()=>{
  for(const [status,included,outside,reported] of [['resident',oidHugePlus('122.51'),'0',oidHugePlus('123')],['part_year','42.02',oidHugePlus('80.49'),'43'],['nonresident','0',oidHugePlus('122.51'),'0']]as const){
   const f=oidConsumerPrecisionFixture(status);expect(TaxYearInputSchema.safeParse(f.input).success).toBe(true);expect(PAResidencySourcesSchema.safeParse(f.sources).success).toBe(true);
   const r=run(f);expect.soft(r.interest.toFixed()).toBe(included);expect.soft(r.excludedNonPAInterest.toFixed()).toBe(outside);expect.soft(r.scheduleA.line1.toFixed()).toBe(oidHugePlus('123'));expect.soft(r.reportedInterest.toFixed()).toBe(reported);
  }
 });
 it('preserves printed Schedule A cancellation above fixed precision',()=>{
  const r=calculatePAScheduleA({taxYear:2025,federalInterestIncome:new Decimal(oidHugePlus('120.50')),usGovernmentInterest:new Decimal(oidHugeInteger+'.49')});
  expect.soft(r.line1.toFixed()).toBe(oidHugePlus('121'));expect.soft(r.line7.toFixed()).toBe(oidHugeInteger);expect.soft(r.line16.toFixed()).toBe('121');
 });
 it('preserves every accepted OID withholding cent through ordinary projection',()=>{
  const f=paOrdinaryOIDFixture();const withholding=f.input.form1099OID[0].stateWithholding?.[0];if(!withholding)throw Error('Explicit fictional actual original PA withholding row required');withholding.stateWithheld=oidHugeInteger+'.49';refreshPAOIDOriginals(f);
  const r=calculatePAOrdinaryReturnFacts(f.input,f.facts);expect(r.paWithholding.toFixed()).toBe(oidHugePlus('1539.69'));
 });
 it('preserves accepted Treasury and outside OID worldwide SP totals',()=>{
  const f=paOrdinaryOIDFixture();f.input.form1099OID[0].treasuryOID=oidHugeInteger+'.49';f.oidAndMiscSources.oid[0].accruals=[{from:'2025-01-01',through:'2025-12-31',oid:oidHugeInteger+'.49',coupon:'0',sourceReference:'Fictional complete actual Treasury accrual'}];
  f.facts.sp.categories['2']={status:'entries',sourceReference:'Fictional actual category2 records',entries:[{sourceReference:'Fictional actual separate category2 original',date:'2025-12-31',amount:'0.02',notElsewhereConfirmed:true}]};
  f.facts.sp.categories['3']={status:'entries',sourceReference:'Fictional actual category3 records',entries:[{sourceReference:'Fictional actual separate category3 original',date:'2025-12-31',amount:'0.51',notElsewhereConfirmed:true}]};refreshPAOIDOriginals(f);
  const r=calculatePAOrdinaryReturnFacts(f.input,f.facts);expect.soft(r.spOtherIncomeByLine['2'].toFixed()).toBe(oidHugePlus('1'));expect.soft(r.spOtherIncomeByLine['3'].toFixed()).toBe('1');expect.soft(r.spNontaxableIncome.toFixed()).toBe(oidHugePlus('2'));
  const p=oidConsumerPrecisionFixture('part_year');expect(calculatePAOrdinaryReturnFacts(p.input,p.facts).spOutsidePAIncome.toFixed()).toBe(oidHugePlus('24080'));
 });
 it('returns replay stable public Decimals and unchanged source originals',()=>{
  const f=oidConsumerPrecisionFixture(),before=structuredClone(f),config={precision:Decimal.precision,rounding:Decimal.rounding};const a=run(f),b=run(f);
  expect(isDeepStrictEqual(a,b)).toBe(true);checkPublic(a);const p=calculatePAOrdinaryReturnFacts(f.input,f.facts),q=calculatePAOrdinaryReturnFacts(f.input,f.facts);expect(isDeepStrictEqual(p,q)).toBe(true);checkPublic(p);expect(f).toEqual(before);expect({precision:Decimal.precision,rounding:Decimal.rounding}).toEqual(config);
 });
});
