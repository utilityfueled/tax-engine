// Spec: spec/federal/current-charitable-crypto-handoff.yaml. Future constants isolated to this test.
import {expect,it,vi} from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{const original=await importOriginal<typeof import('@/models/constants.js')>();const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};});
import {calculateFederalTax} from '@/engine/federal.js';
import {currentCryptoFixture} from '../fixtures/current-charitable-crypto.js';
import {d} from '@/utils/decimal.js';
it('selects verified crypto carry with the actual deduction method',()=>{
 for(const [election,carry] of [['itemized','5500'],['standard','5000'],['nonitemized','5000']] as const){
  const input=currentCryptoFixture();input.deductionElection=election;if(!input.standardDeductionFacts)throw Error('Missing source');input.standardDeductionFacts.spouseItemizes=election==='nonitemized';const before=JSON.stringify(input),r=calculateFederalTax(input);
  expect(r.deductionUsed).toBe(election);expect(r.agi.toFixed()).toBe('100000');expect(r.cryptoDonations?.totalDeduction.toFixed()).toBe('40000');expect(r.scheduleA?.charitableTotal.toFixed()).toBe('54500');
  expect(r.carryforwards.charitableContributionsByYear.map(row=>[row.category,row.medium,row.amount.toFixed()])).toEqual([['capital_gain_20','noncash',carry]]);
  expect(r.nonitemizerCharitableDeduction?.toFixed()).toBe(election==='itemized'?'0':'1000');if(election==='nonitemized')expect(r.standardDeduction.toFixed()).toBe('0');expect(JSON.stringify(input)).toBe(before);
 }
});

function expectCryptoOnly(sourceIndex:number, amount:string, basis:string, itemized:string, category:string, percentageCarry:string) {
 for(const election of ['standard','nonitemized','itemized'] as const) {
  const input=currentCryptoFixture();
  if(!input.cryptoIncome || !input.standardDeductionFacts)throw Error('Missing source');
  const original=input.cryptoIncome.donations[sourceIndex];
  input.donations=[];
  input.cryptoIncome.donations=[{...original,fairMarketValueAtDonation:amount,costBasis:basis,
   ...(sourceIndex===0?{recipientCategory:'other-thirty-percent' as const}:{})}];
  input.deductionElection=election;
  input.standardDeductionFacts.spouseItemizes=election==='nonitemized';
  const before=JSON.stringify(input),result=calculateFederalTax(input);
  expect(result.deductionUsed).toBe(election);
  expect(result.scheduleA?.charitableTotal.toFixed()).toBe(itemized);
  expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe('0');
  const carry=result.carryforwards.charitableContributionsByYear;
  if(percentageCarry==='0')expect(carry).toEqual([]);
  else {
   expect(carry).toHaveLength(1);
   expect(carry[0].category).toBe(category);expect(carry[0].medium).toBe('noncash');
   expect(carry[0].amount.toFixed()).toBe(election==='itemized'?d(percentageCarry).plus('500').toFixed():percentageCarry);
  }
  if(election==='nonitemized')expect(result.standardDeduction.toFixed()).toBe('0');
  expect(JSON.stringify(input)).toBe(before);
 }
}
it('routes crypto-only public capital gifts through actual current candidates',()=>{
 expectCryptoOnly(1,'20000','1000','19500','capital_gain_30','0');
 expectCryptoOnly(1,'50000','1000','29500','capital_gain_30','20000');
});
it('routes crypto-only other capital gifts through actual current candidates',()=>{
 expectCryptoOnly(2,'15000','1000','14500','capital_gain_20','0');
 expectCryptoOnly(2,'50000','1000','19500','capital_gain_20','30000');
});
it('routes crypto-only other ordinary gifts through actual current candidates',()=>{
 expectCryptoOnly(0,'8000','5000','4500','other_30','0');
 expectCryptoOnly(0,'50000','40000','29500','other_30','10000');
});
