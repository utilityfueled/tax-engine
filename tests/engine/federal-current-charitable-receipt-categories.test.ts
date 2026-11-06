// Spec: spec/federal/current-charitable-receipt-categories.yaml. Draft constants only in this isolated test.
import {expect,it,vi} from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{const original=await importOriginal<typeof import('@/models/constants.js')>();const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};});
import {calculateFederalTax} from '@/engine/federal.js';
import {currentCategoryFixture} from '../fixtures/current-charitable-categories.js';
import {extractMetricsFromResult} from '@/lib/guided-preview-compute';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter.js';
it('selects the complete ordinary current category carry without changing source facts',()=>{
 for(const [election,used,carry] of [['automatic','standard','550'],['itemized','itemized','550'],['nonitemized','nonitemized','550']] as const){
  const input=currentCategoryFixture('1000','500','1000','2000','1500');input.deductionElection=election;
  if(!input.standardDeductionFacts)throw Error('Missing actual facts');input.standardDeductionFacts.spouseItemizes=election==='nonitemized';
  const before=JSON.stringify(input),r=calculateFederalTax(input);
  expect(r.deductionUsed).toBe(used);expect([r.scheduleA?.charitableCurrentCash,r.scheduleA?.charitableCurrentNoncash,r.scheduleA?.charitablePriorYearUsed,r.scheduleA?.charitableTotal].map(v=>v?.toFixed())).toEqual(['2000','3450','0','5450']);
  expect(r.carryforwards.charitableContributionsByYear.map(row=>[row.category,row.medium,row.amount.toFixed()])).toEqual([['capital_gain_20','noncash',carry]]);
  expect(r.nonitemizerCharitableDeduction?.toFixed()).toBe(used==='itemized'?'0':'1000');
  expect(extractMetricsFromResult(r).taxableIncome).toBe(r.taxableIncome.toFixed());expect(buildOhioResidentReturnInput(input,r).federalAgi.toFixed()).toBe('10000');
  if(used==='nonitemized'){expect(r.standardDeduction.toFixed()).toBe('0');expect(r.deductionAmount.toFixed()).toBe('0');}
  expect(JSON.stringify(input)).toBe(before);
 }
});
