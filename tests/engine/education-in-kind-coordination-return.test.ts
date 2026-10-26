// Spec: spec/federal/form-1099-q-in-kind-coordination.yaml.
import {expect,it,vi} from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{const original=await importOriginal<typeof import('@/models/constants.js')>();const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};});
import {calculateFederalTax} from '@/engine/federal.js';
import {inKindCoordinationFixture} from '../fixtures/education-in-kind-coordination.js';
it('routes actual shared tuition earnings and exceptions once',async()=>{
 for(const year of [2025,2026]){
  const input=inKindCoordinationFixture(year),before=JSON.stringify(input),r=calculateFederalTax(input);
  expect([r.agi,r.form1099Q?.taxableEarnings,r.form1099Q?.penaltyExceptionAmount,r.form1099Q?.netPenalty].map(v=>v?.toFixed())).toEqual(['50800','800','200','60']);
  expect(JSON.stringify(input)).toBe(before);input.form1099Q[1].recipientOwner='other';input.form1099Q[1].recipientId='false-other';expect(()=>calculateFederalTax(input)).toThrow(/recipient|beneficiary/i);
 }
 const unknown=inKindCoordinationFixture(2025);unknown.educationExpenses={aocStudents:[],llcExpenses:'0'};expect(()=>calculateFederalTax(unknown)).toThrow(/credit|student|education/i);
 const original=await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');expect(()=>original.getConstants(2026)).toThrow(/2026/);
});
