// Spec: spec/federal/current-charitable-receipt-categories.yaml.
import {expect,it} from 'vitest';
import {calculateCurrentCharitableCandidates} from '@/engine/forms/current-charitable-candidates.js';
import {currentCategoryFixture,currentCategoryContext} from '../../fixtures/current-charitable-categories.js';
import {d} from '@/utils/decimal.js';
const carry=(rows:{category:string;medium?:string;amount:{toFixed():string}}[])=>rows.map(row=>[row.category,row.medium,row.amount.toFixed()]);
it('conserves the current five category allowances and final carry candidates',()=>{
 for(const [g,a,b,c,other,total,cash,noncash,itemized,nonitemized] of [
  ['10000','5000','10000','20000','15000','54500','20000','34500',[['capital_gain_20','noncash','5500']],[['capital_gain_20','noncash','5500']]],
  ['40000','10000','30000','20000','10000','59500','49500','10000',[['capital_gain_30','noncash','20000'],['other_30','cash','20500'],['capital_gain_20','noncash','10000']],[['capital_gain_30','noncash','20000'],['other_30','cash','20500'],['capital_gain_20','noncash','10000']]],
  ['0','40000','10000','5000','5000','49500','5000','44500',[['capital_gain_30','noncash','500'],['other_30','cash','5000'],['capital_gain_20','noncash','5000']],[['capital_gain_30','noncash','500'],['other_30','cash','5000'],['capital_gain_20','noncash','5000']]],
 ] as const){
  const input=currentCategoryFixture(g,a,b,c,other),before=JSON.stringify(input);
  const r=calculateCurrentCharitableCandidates(input,currentCategoryContext(g,a,b,c,other));
  expect(r.itemized.totalDeduction.toFixed()).toBe(total);expect(r.itemized.exactCashDeduction.toFixed()).toBe(cash);expect(r.itemized.exactNonCashDeduction.toFixed()).toBe(noncash);
  expect(carry(r.itemized.carryforwards)).toEqual(itemized);expect(carry(r.nonitemizedCarryforwards)).toEqual(nonitemized);expect(JSON.stringify(input)).toBe(before);
 }
});
it('binds exact original stock and ordinary property valuation without invented categories',()=>{
 for(const [recipient,qualified,value,carryValue] of [['private-nonoperating',true,'50000','30500'],['private-nonoperating',false,'10000','0'],['other-thirty-percent',undefined,'50000','30500']] as const){
  const input=currentCategoryFixture('0','0','0','0','50000');Object.assign(input.donations[4],{recipientCategory:recipient,qualifiedAppreciatedStock:qualified,costBasis:'10000'});
  const r=calculateCurrentCharitableCandidates(input,currentCategoryContext('0','0','0','0',value));
  expect(r.itemized.carryforwards.reduce((n,row)=>n.plus(row.amount),d('0')).toFixed()).toBe(carryValue);
 }
 const ordinary=currentCategoryFixture('40000','0','0','0','0');
 ordinary.donations[2]={...ordinary.donations[2],type:'property',amount:'50000',costBasis:'30000',isLongTermCapitalGain:false};
 const ordinaryContext=currentCategoryContext('40000','0','0','0','0');ordinaryContext.current.noncashPrivate=d('30000');
 const r=calculateCurrentCharitableCandidates(ordinary,ordinaryContext);expect(carry(r.itemized.carryforwards)).toEqual([['other_30','noncash','10500']]);expect(carry(r.nonitemizedCarryforwards)).toEqual([['other_30','noncash','10500']]);
 for(const mutate of [
  (i:ReturnType<typeof currentCategoryFixture>)=>{i.donations[4].recipientCategory=undefined;},
  (i:ReturnType<typeof currentCategoryFixture>)=>{i.donations[4].recipientCategory='private-nonoperating';i.donations[4].qualifiedAppreciatedStock=undefined;},
  (i:ReturnType<typeof currentCategoryFixture>)=>{i.donations[1].costBasis=undefined;},
  (i:ReturnType<typeof currentCategoryFixture>)=>{i.donations[3].isLongTermCapitalGain=undefined;},
  (i:ReturnType<typeof currentCategoryFixture>)=>{i.donations[3].type='property';},
  (i:ReturnType<typeof currentCategoryFixture>)=>{i.donations[3].amount='19999.99';},
  (i:ReturnType<typeof currentCategoryFixture>)=>{i.charitableCarryoverSources=undefined;},
  (i:ReturnType<typeof currentCategoryFixture>)=>{i.priorYear={...i.priorYear,nolCarryforward:'1'};},
 ]){const input=currentCategoryFixture();mutate(input);expect(()=>calculateCurrentCharitableCandidates(input,currentCategoryContext())).toThrow();}
});
it('keeps media and exact current receipt values distinct from unsupported partial allocation',()=>{
 const input=currentCategoryFixture('10000','5000','100','20000','10000');
 input.donations.push({organization:'Actual other ordinary property',type:'property',amount:'200',costBasis:'200',isLongTermCapitalGain:false,dateOfDonation:'2026-05-01',qualifiedOrganization:true,recipientCategory:'other-thirty-percent'});
 const ctx=currentCategoryContext('10000','5000','100','20000','10000');ctx.current.noncashPrivate=d('200');
 const full=calculateCurrentCharitableCandidates(input,ctx);expect(full.itemized.exactCashDeduction.toFixed()).toBe('10100');expect(full.itemized.exactNonCashDeduction.toFixed()).toBe('34700');expect(full.itemized.carryforwards).toEqual([]);
 const reversed={...input,donations:[...input.donations].reverse()};expect(calculateCurrentCharitableCandidates(reversed,ctx)).toEqual(full);
 const zero=currentCategoryFixture('60000','0','100','0','0');zero.donations.push({...input.donations[5]});const zctx=currentCategoryContext('60000','0','100','0','0');zctx.current.noncashPrivate=d('200');
 expect(carry(calculateCurrentCharitableCandidates(zero,zctx).itemized.carryforwards)).toEqual([['cash_60','cash','500'],['other_30','cash','100'],['other_30','noncash','200']]);
 const partial=currentCategoryFixture('0','0','100','0','0');partial.donations.push({...input.donations[5]});const pctx=currentCategoryContext('0','0','100','0','0','10000');pctx.current.noncashPrivate=d('200');expect(()=>calculateCurrentCharitableCandidates(partial,pctx)).toThrow(/partial.*cash\/noncash|allocation method/i);
 const cents=currentCategoryFixture('4000.11','1000.01','3000.99','0','0');const cctx=currentCategoryContext('4000.11','1000.01','3000.99','0','0','10000.49');
 const exact=calculateCurrentCharitableCandidates(cents,cctx);expect(exact.itemized.allowedBeforeFloor.other_30.toFixed()).toBe('1000.174');expect(exact.itemized.allowedAfterFloor.other_30.toFixed()).toBe('950.17155');expect(carry(exact.nonitemizedCarryforwards)).toEqual([['other_30','cash','2050.81845']]);
});
