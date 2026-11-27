import {expect,test,vi} from 'vitest';
import Decimal from 'decimal.js';
import {calculateFederalTax,requiresOhioSchoolScheduleAPaymentProof} from '@/engine/federal';
import * as adapter from '@/engine/state/oh-input-adapter';
import {readConfirmedOhioSchoolHeaderMethod,readOhioSchoolAdapterMethod,withConfirmedOhioSchoolHeaderAdapter,withOhioSchoolAdapterInvocation} from '@/engine/state/oh-source-adapter-invocation';
import {schoolPyHeaderPacket} from '../fixtures/oh-school-district-part-year-official-review';
import {bindSchoolDistrictFixture,schoolDistrictEstimatedFixture} from '../fixtures/oh-school-district-sources';
const getter=Object.defineProperty({},'known',{enumerable:true,get:()=>1});
const hidden=Object.defineProperty({},'known',{enumerable:false,value:1});
const symbolKey={[Symbol('source')]:1};
class EmptySource{}
class SourceArray extends Array<unknown>{}
const extraArray=Object.assign([1],{source:'new'});
const values:[string,unknown][]=[['function',()=>1],['symbol',Symbol('source')],['NaN',NaN],['positive infinity',Infinity],['negative infinity',-Infinity],['Date',new Date('2025-01-01')],['Map',new Map()],['Set',new Set()],['class',new EmptySource()],['getter',getter],['hidden data',hidden],['symbol key',symbolKey],['array extra',extraArray],['sparse array',new Array(1)],['array undefined',[undefined]],['array subclass',new SourceArray(1)],['nonfinite Decimal',new Decimal(NaN)],['Decimal spoof',{toStringTag:'[object Decimal]',toString:()=> '1'}]];
test.each(values)('unsupported %s cannot consume a currently active complete proof',(_name,value)=>{
 const p=schoolPyHeaderPacket(),f=calculateFederalTax(p.canonical);
 withOhioSchoolAdapterInvocation(p.canonical,f,proof=>expect(readOhioSchoolAdapterMethod(p.canonical,{...f,boundary:value},proof)).toBeUndefined());
});
test.each([['null',null],['empty object',{}],['Decimal',new Decimal('1')]])('original stale-federal guard still rejects added %s data before any proof capture',(_name,value)=>{
 const p=schoolPyHeaderPacket(),f={...calculateFederalTax(p.canonical),boundary:value};let used=false;
 expect(()=>withOhioSchoolAdapterInvocation(p.canonical,f,()=>{used=true;})).toThrow('saved federal result is stale');expect(used).toBe(false);
});
test('actual Decimal field and a plain object with a matching decimal field remain distinct',()=>{
 const p=schoolPyHeaderPacket(),f=calculateFederalTax(p.canonical);
 withOhioSchoolAdapterInvocation(p.canonical,f,proof=>{
  expect(readOhioSchoolAdapterMethod(p.canonical,{...f,agi:{decimal:f.agi.toString()}} as unknown as typeof f,proof)).toBeUndefined();
  expect(readOhioSchoolAdapterMethod(p.canonical,{...f,agi:new Decimal(f.agi)},proof)).toBeDefined();
 });
});
test('exact current material preserves key-order equivalence, explicit zero and undefined object omission',()=>{
 const p=schoolPyHeaderPacket(),f=calculateFederalTax(p.canonical);
 withOhioSchoolAdapterInvocation(p.canonical,f,proof=>{
  expect(readOhioSchoolAdapterMethod(Object.fromEntries(Object.entries(p.canonical).reverse()) as typeof p.canonical,{...f,boundary:undefined},proof)).toBeDefined();
  expect(readOhioSchoolAdapterMethod(p.canonical,{...f,boundary:0},proof)).toBeUndefined();
  expect(readOhioSchoolAdapterMethod(p.canonical,{...f,boundary:false},proof)).toBeUndefined();
  expect(readOhioSchoolAdapterMethod(p.canonical,{...f,boundary:'\ud800'},proof)).toBeUndefined();
  expect(readOhioSchoolAdapterMethod(p.canonical,{...f,boundary:'\ufffd'},proof)).toBeUndefined();
 });
});
test('limits the confirmed header shortcut to current producer-owned originals', () => {
 const { canonical } = schoolPyHeaderPacket();
 const expectedMethod = { method: 'oh-2025-sd100-part-year-payroll-sources-v1' };
 const expired = withConfirmedOhioSchoolHeaderAdapter(canonical, proof => {
  expect(readConfirmedOhioSchoolHeaderMethod(structuredClone(canonical), proof)).toEqual(expectedMethod);
  const changed = structuredClone(canonical);
  changed.w2s[0].wages = '49999';
  expect(readConfirmedOhioSchoolHeaderMethod(changed, proof)).toBeUndefined();
  const addedOriginal = { ...canonical, additionalMaterial: null };
  expect(readConfirmedOhioSchoolHeaderMethod(addedOriginal, proof)).toBeUndefined();
  return proof;
 });
 expect(readConfirmedOhioSchoolHeaderMethod(canonical, expired)).toBeUndefined();
 const federal = calculateFederalTax(canonical);
 withOhioSchoolAdapterInvocation(canonical, federal, proof => {
  expect(readOhioSchoolAdapterMethod(canonical, federal, proof)).toEqual(expectedMethod);
  expect(readConfirmedOhioSchoolHeaderMethod(canonical, proof)).toBeUndefined();
 });
});
test('keeps next-calendar-year school payments on the independent federal path', () => {
 const current = schoolDistrictEstimatedFixture();
 const payments = current.ohioSchoolDistrict.payments;
 const january = payments.paymentRows.find(row => row.date === '2026-01-15');
 if (!january) throw new Error('Expected the fictional January school payment');
 payments.paymentRows = [{ ...january, amount: '400', original: { ...january.original, amount: '400' } }];
 payments.account.estimatedPaymentsCredited = '400';
 current.deductionElection = 'itemized';
 bindSchoolDistrictFixture(current);
 expect(requiresOhioSchoolScheduleAPaymentProof(current)).toBe(true);
 const federal = calculateFederalTax(current);
 withConfirmedOhioSchoolHeaderAdapter(current, proof => {
  expect(readOhioSchoolAdapterMethod(current, federal, proof)).toBeDefined();
  expect(readConfirmedOhioSchoolHeaderMethod(current, proof)).toBeUndefined();
 });
});
test('unsupported capture follows the actual adapter and leaves original fallback authority absent',()=>{
 const p=schoolPyHeaderPacket(),f={...calculateFederalTax(p.canonical),boundary:()=>1},spy=vi.spyOn(adapter,'buildOhioResidentReturnInput');
 try{withOhioSchoolAdapterInvocation(p.canonical,f,proof=>{expect(spy).toHaveBeenCalledTimes(1);expect(readOhioSchoolAdapterMethod(p.canonical,f,proof)).toBeUndefined();});}finally{vi.restoreAllMocks();}
});
test('cyclic read material is a fallback without throwing or mutating the caller',()=>{
 const p=schoolPyHeaderPacket(),f=calculateFederalTax(p.canonical),cyclic:{self?:unknown}={};cyclic.self=cyclic;
 withOhioSchoolAdapterInvocation(p.canonical,f,proof=>expect(readOhioSchoolAdapterMethod(p.canonical,{...f,boundary:cyclic},proof)).toBeUndefined());
 expect(cyclic.self).toBe(cyclic);
});
test('Decimal custom metadata and overridden methods cannot be erased by numeric normalization',()=>{
 const p=schoolPyHeaderPacket(),f=calculateFederalTax(p.canonical);
 withOhioSchoolAdapterInvocation(p.canonical,f,proof=>{
  for(const agi of [Object.assign(new Decimal(f.agi),{source:()=>1}),Object.assign(new Decimal(f.agi),{[Symbol('source')]:1}),Object.assign(new Decimal(f.agi),{toString:()=>f.agi.toString()})])expect(readOhioSchoolAdapterMethod(p.canonical,{...f,agi},proof)).toBeUndefined();
 });
});
test('unsupported Decimal constructor and digit accessors are rejected without invoking caller code',()=>{
 const p=schoolPyHeaderPacket(),f=calculateFederalTax(p.canonical);
 for(const part of ['constructor','digit'] as const){let calls=0;const agi=new Decimal(f.agi);
  if(part==='constructor')Object.defineProperty(agi,'constructor',{enumerable:true,get(){calls++;return Decimal;}});
  else{const digits=agi.d;if(!digits)throw Error('Finite actual Decimal digits required');const original=digits[0];Object.defineProperty(digits,'0',{enumerable:true,get(){calls++;return original;}});}
  withOhioSchoolAdapterInvocation(p.canonical,f,proof=>expect(readOhioSchoolAdapterMethod(p.canonical,{...f,agi},proof)).toBeUndefined());expect(calls).toBe(0);
 }
});
test.each(['extra','symbol','slice','sparse','subclass'] as const)('unsupported Decimal digits %s metadata is never numerically erased',part=>{
 const p=schoolPyHeaderPacket(),f=calculateFederalTax(p.canonical),agi=new Decimal(f.agi),digits=agi.d;if(!digits)throw Error('Finite actual Decimal digits required');
 if(part==='extra')Object.assign(digits,{source:()=>1});
 else if(part==='symbol')Object.assign(digits,{[Symbol('source')]:1});
 else if(part==='slice')Object.defineProperty(digits,'slice',{value:Array.prototype.slice});
 else if(part==='sparse')delete digits[0];
 else Object.setPrototypeOf(digits,new SourceArray());
 withOhioSchoolAdapterInvocation(p.canonical,f,proof=>expect(readOhioSchoolAdapterMethod(p.canonical,{...f,agi},proof)).toBeUndefined());
});
