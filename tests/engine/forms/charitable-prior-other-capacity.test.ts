// Spec: spec/federal/charitable-prior-other-capacity.yaml.
import {expect,it} from 'vitest';
import {calculateCharitableCarryover} from '@/engine/forms/charitable-carryover.js';
import {d} from '@/utils/decimal.js';
import {priorOtherCapacityFixture} from '../../fixtures/charitable-prior-other-capacity.js';
const context=(c='40000',b='0',itemizes=true)=>({contributionBase:d('100000'),itemizes,current:{cashPublic:d('0'),noncashPublic:d('0'),capitalGainPublic:d(c),cashPrivate:d(b),noncashPrivate:d('0'),capitalGainPrivate:d('0')}});
it('preserves the published current other and public capital property reservation',()=>{
 const input=priorOtherCapacityFixture('40000','30000');
 if(!input.charitableCarryoverSources)throw Error('Missing synthetic history');
 input.charitableCarryoverSources.vintages=[];
 const result=calculateCharitableCarryover(input,context('40000','30000'));
 expect(result.currentCash.toFixed()).toBe('10000');
 expect(result.currentNoncash.toFixed()).toBe('30000');
 expect(result.totalDeduction.toFixed()).toBe('40000');
 expect(result.carryforwards.map(row=>[row.taxYear,row.category,row.amount.toFixed()])).toEqual([[2025,'capital_gain_30','10000'],[2025,'other_30','20000']]);
});
it('retains actual current capital property in the prior other contribution ceiling',()=>{
 const input=priorOtherCapacityFixture(),before=JSON.stringify(input),result=calculateCharitableCarryover(input,context());
 expect(result.priorDeduction.toFixed()).toBe('10000');expect(result.currentNoncash.toFixed()).toBe('30000');expect(result.totalDeduction.toFixed()).toBe('40000');
 expect(result.carryforwards.map(row=>[row.taxYear,row.category,row.amount.toFixed()])).toEqual([[2024,'other_30','20000'],[2025,'capital_gain_30','10000']]);
 for(const [currentC,currentB,priorUse] of [['40000','5000','5000'],['20000','0','30000'],['20000.01','0','29999.99'],['30000.01','0','19999.99']] as const){
  expect(calculateCharitableCarryover(priorOtherCapacityFixture(currentC,currentB),context(currentC,currentB)).priorDeduction.toFixed()).toBe(priorUse);
 }
 expect(JSON.stringify(input)).toBe(before);
});
it('distinguishes current public property from prior property treated as paid',()=>{
 const input=priorOtherCapacityFixture('0','30000'),prior=input.charitableCarryoverSources?.vintages?.[0];if(!prior)throw Error('Missing synthetic history');
 Object.assign(prior,{category:'capital_gain_30',medium:'noncash',originalExcess:'40000',openingCarryforward:'40000'});
 const result=calculateCharitableCarryover(input,context('0','30000'));
 expect(result.priorDeduction.toFixed()).toBe('30000');expect(result.currentCash.toFixed()).toBe('20000');expect(result.totalDeduction.toFixed()).toBe('50000');
 expect(result.carryforwards.map(row=>[row.taxYear,row.category,row.amount.toFixed()])).toEqual([[2024,'capital_gain_30','10000'],[2025,'other_30','10000']]);
 const standard=calculateCharitableCarryover(priorOtherCapacityFixture(),context('40000','0',false));
 expect(standard.priorTreatedAsPaid.toFixed()).toBe('10000');expect(standard.priorDeduction.toFixed()).toBe('0');expect(standard.totalDeduction.toFixed()).toBe('0');
});
