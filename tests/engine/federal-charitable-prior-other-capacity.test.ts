// Spec: spec/federal/charitable-prior-other-capacity.yaml.
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal.js';
import {priorOtherCapacityFixture} from '../fixtures/charitable-prior-other-capacity.js';
it('uses the original prior other ceiling under final deduction selection',()=>{
 for(const election of ['itemized','standard'] as const){
  const input=priorOtherCapacityFixture();input.deductionElection=election;const before=JSON.stringify(input),result=calculateFederalTax(input);
  expect(result.deductionUsed).toBe(election);
  expect([result.scheduleA.charitableCurrentNoncash,result.scheduleA.charitablePriorYearUsed,result.scheduleA.charitableTotal].map(x=>x.toFixed())).toEqual(['30000','10000','40000']);
  expect(result.scheduleA.charitableTreatment?.priorTreatedAsPaid.toFixed()).toBe('10000');
  expect(result.scheduleA.charitableTreatment?.priorDeduction.toFixed()).toBe(election==='itemized'?'10000':'0');
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('30000');expect(JSON.stringify(input)).toBe(before);
 }
 for(const mutate of [(input:ReturnType<typeof priorOtherCapacityFixture>)=>{if(input.charitableCarryoverSources)input.charitableCarryoverSources.sourceFactsConfirmed=false;},
  (input:ReturnType<typeof priorOtherCapacityFixture>)=>{if(input.charitableCarryoverSources)input.charitableCarryoverSources.primaryTaxpayerIdLast4='0000';}]){
  const input=priorOtherCapacityFixture();mutate(input);expect(()=>calculateFederalTax(input)).toThrow(/source|identity|confirm/i);
 }
});
