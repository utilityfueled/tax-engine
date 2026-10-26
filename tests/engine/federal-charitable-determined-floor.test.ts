// Spec: spec/federal/charitable-determined-floor.yaml. Test-only draft constant substitution.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original=await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS }=await import('@/models/federal-2026-indexed.js');
  return {...original,getConstants:(year:number)=>year===2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year)};
});
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateSelectedCharitableCarryover } from '@/engine/forms/selected-charitable-carryover.js';
import { nonitemizedCategoryFixture as fixture } from '../fixtures/nonitemized-charitable-categories.js';

it('selects determined floor carry after the actual deduction choice',()=>{
  for(const [election,method,carry] of [['itemized','itemized','2050'],['automatic','standard','2000'],['nonitemized','nonitemized','2000']] as const){
    const i=fixture('1000','0','0','4000','1000',[{taxYear:2025,category:'cash_60',amount:'2000'}]);
    i.w2s[0].wages='10000';i.w2s[0].federalWithheld='1000';i.deductionElection=election;
    if(!i.standardDeductionFacts)throw Error('Missing synthetic entitlement');i.standardDeductionFacts.spouseItemizes=method==='nonitemized';
    const before=JSON.stringify(i),r=calculateFederalTax(i),a=r.scheduleA;
    if(!a)throw Error('Missing ScheduleA candidate');
    expect(r.deductionUsed).toBe(method);expect(r.carryforwards.charitableContributions.toFixed()).toBe(carry);
    expect([a.charitableCurrentCash,a.charitableCurrentNoncash,a.charitablePriorYearUsed,a.charitableTotal].map(x=>x.toFixed()))
      .toEqual(method==='nonitemized'?['0','0','0','0']:['1000','2950','2000','5950']);
    expect(a.charitableTreatment?.priorTreatedAsPaid.toFixed()).toBe('2000');
    expect(a.charitableTreatment?.priorDeduction.toFixed()).toBe(method==='itemized'?'2000':'0');
    expect(r.nonitemizerCharitableDeduction?.toFixed()).toBe(method==='itemized'?'0':'1000');
    if(method==='nonitemized')expect([r.standardDeduction,r.deductionAmount].map(x=>x.toFixed())).toEqual(['0','0']);
    else {
      expect(a.determinedCharitableFloor?.sourceDigest).toBe(a.charitableSourceDigest);
      expect(()=>calculateSelectedCharitableCarryover({taxYear:2026,deductionMethod:method,scheduleA:{...a,determinedCharitableFloor:undefined}})).toThrow(/method|source/i);
      if(!a.determinedCharitableFloor)throw Error('Missing derived actual floor');
      expect(()=>calculateSelectedCharitableCarryover({taxYear:2026,deductionMethod:method,scheduleA:{...a,
        determinedCharitableFloor:{...a.determinedCharitableFloor,sourceDigest:'stale'}}})).toThrow(/method|source/i);
    }
    expect(JSON.stringify(i)).toBe(before);
  }
});
