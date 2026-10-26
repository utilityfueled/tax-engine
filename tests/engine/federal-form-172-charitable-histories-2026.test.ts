// Spec: form-172-charitable-histories.yaml; isolated draft constants do not change real gates.
import {expect,it,vi} from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{
  const original=await importOriginal<typeof import('@/models/constants.js')>();
  const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import {calculateFederalTax} from '@/engine/federal';
import {currentOriginCharitableHistoriesInput} from '../fixtures/form-172-charitable-histories';
it('retains determined current floor and independent original prior history in current loss',()=>{
  const input=currentOriginCharitableHistoriesInput(2026),result=calculateFederalTax(input);
  expect([result.agi,result.scheduleA?.charitableTotal,result.form172?.regular.netOperatingLoss,result.form172?.alternativeTax.netOperatingLoss,
    result.form6251?.amti,result.carryforwards.charitableContributions,result.carryforwards.amtCharitableContributions]
    .map(x=>x?.toFixed())).toEqual(['10000','3950','13950','0','6550','1050','1050']);
  expect(result.carryforwards.charitableContributionsByYear.map(x=>[x.taxYear,x.category,x.amount.toFixed()])).toEqual([[2026,'capital_gain_30','1050']]);
});
