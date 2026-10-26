// Spec: spec/federal/form-8960-royalty-sources.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { royaltyNiitFixture } from '../fixtures/niit-royalties.js';

const amounts=(r:ReturnType<typeof calculateFederalTax>, ids:string[])=>ids.map(id=>r.form8960.lines.find(row=>row.line===id)?.value.toFixed());
it('retains MISC and K1 royalties independently of ordinary activity character',()=>{
  for(const entityType of ['partnership','s_corporation']) for(const isPassiveActivity of [false,true]) {
    const input=royaltyNiitFixture([{entityType,isPassiveActivity,ordinaryIncome:'5000',royalties:'3000.25'}],'7000.75');
    const before=JSON.stringify(input),r=calculateFederalTax(input);
    expect(r.agi.toFixed()).toBe('215001');
    expect(amounts(r,['4a','4b','4c','12','17'])).toEqual(isPassiveActivity?['15001','0','15001','15001','570']:['15001','-5000','10001','10001','380']);
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('retains royalties separately from suspended and allowed passive losses',()=>{
  for(const entityType of ['partnership','s_corporation']) {
    const r=calculateFederalTax(royaltyNiitFixture([{entityType,isPassiveActivity:true,ordinaryIncome:'-10000',royalties:'12000'}]));
    expect(r.agi.toFixed()).toBe('212000');expect(r.form8582?.suspendedLoss.toFixed()).toBe('10000');
    expect(amounts(r,['4a','4b','4c','12','17'])).toEqual(['12000','0','12000','12000','456']);
  }
  const allowed=calculateFederalTax(royaltyNiitFixture([{ordinaryIncome:'6000',isPassiveActivity:true},{ordinaryIncome:'-2000',isPassiveActivity:true}],'10000'));
  expect(allowed.agi.toFixed()).toBe('214000');expect(allowed.form8582?.suspendedLoss.toFixed()).toBe('0');
  expect(amounts(allowed,['4c','12','17'])).toEqual(['14000','14000','532']);
});
it('keeps exact royalties and the MAGI boundary through final tax rounding',()=>{
  const boundary=calculateFederalTax(royaltyNiitFixture([],'0.01','199999.99'));
  expect(amounts(boundary,['4c','12','13','15','16','17'])).toEqual(['0.01','0.01','200000','0','0','0']);
  expect(boundary.form8960.requiresForm8960).toBe(false);
  const over=calculateFederalTax(royaltyNiitFixture([],'13.17','199999.99'));
  expect(amounts(over,['4c','12','13','15','16','17'])).toEqual(['13.17','13.17','200013.16','13.16','13.16','1']);
  expect(over.form8960.requiresForm8960).toBe(true);
});
