// Spec: spec/federal/k1-form461-classification.yaml.
import { expect, it } from 'vitest';
import { calculateForm8582, type Form8582NonRentalInput } from '@/engine/forms/form-8582.js';
import { d } from '@/utils/decimal.js';

function source(): Form8582NonRentalInput {
  return { scope:'ordinary_nonrental_part_i', filingStatus:'single', activities:[
    {name:'Actual loss',income:d(0),loss:d(-30000),isRentalRealEstate:false,isActiveParticipant:false},
    {name:'Actual income',income:d(15000),loss:d(0),isRentalRealEstate:false,isActiveParticipant:false},
  ],priorYearSuspendedLosses:[{name:'Actual loss',amount:d(20000)}] };
}
it('calculates ordinary nonrental Part I without inventing MAGI',()=>{
  const input=source(),before=JSON.stringify(input),result=calculateForm8582(input);
  expect(result.allowedLoss.toFixed()).toBe('15000');expect(result.suspendedLoss.toFixed()).toBe('35000');
  expect('modifiedAgi' in result).toBe(false);expect(result.lines.some(line=>line.line==='6')).toBe(false);
  for(const magi of ['0','200000','-900000']) {
    const {scope: _scope,...facts}=input;
    const {modifiedAgi:_magi,...complete}=calculateForm8582({...facts,agi:d(magi)});
    expect(result).toEqual(complete);
  }
  expect(JSON.stringify(input)).toBe(before);
});
it('rejects every rental PTP and unexplained prior source in the no-MAGI path',()=>{
  for(const changes of [{isRentalRealEstate:true},{isActiveParticipant:true},{isPubliclyTradedPartnership:true},
    {ptpFullyDisposedInTaxableTransaction:true},{ptpDispositionGainOrLoss:d(0)}]) {
    const input=source();Object.assign(input.activities[0],changes);
    expect(()=>calculateForm8582(input)).toThrow(/nonrental|ordinary|Part I/i);
  }
  const missing=source();missing.priorYearSuspendedLosses=[{name:'Unrepresented source',amount:d(0)}];
  expect(()=>calculateForm8582(missing)).toThrow(/source|identity/i);
  expect(()=>calculateForm8582({...source(),agi:d(0)} as Form8582NonRentalInput)).toThrow(/AGI|scope/i);
});
