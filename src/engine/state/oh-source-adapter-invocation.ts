/** Spec: state/oh-school-header-same-invocation.yaml. Active synchronous scope only. */
import Decimal from 'decimal.js';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {buildOhioResidentReturnInput} from './oh-input-adapter.js';
const brand=Symbol('completed current Ohio school adapter');
export interface OhioSourceAdapterInvocation{readonly [brand]:true}
const active=new WeakMap<OhioSourceAdapterInvocation,{material:string;method:string|undefined}>();
function arrayData(value:unknown[]):unknown[]{
 if(Object.getPrototypeOf(value)!==Array.prototype||Object.getOwnPropertySymbols(value).length||Object.getOwnPropertyNames(value).length!==value.length+1)throw Error('Unsupported source proof array');
 return Array.from({length:value.length},(_,index)=>{
  const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
  if(!descriptor||!('value' in descriptor)||!descriptor.enumerable)throw Error('Unsupported source proof array entry');
  return descriptor.value;
 });
}
function stable(value:unknown):unknown{
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return Object.is(value,-0)?['negative-zero']:value;
 if(typeof value!=='object'||value===null)throw Error('Unsupported source proof material');
 if(Object.getOwnPropertySymbols(value).length)throw Error('Unsupported source proof symbol key');
 if(Object.getPrototypeOf(value)===Decimal.prototype&&value instanceof Decimal){
  if(Object.getOwnPropertyNames(value).length!==4)throw Error('Unsupported source proof Decimal metadata');
  const c=Object.getOwnPropertyDescriptor(value,'constructor'),s=Object.getOwnPropertyDescriptor(value,'s'),e=Object.getOwnPropertyDescriptor(value,'e'),d=Object.getOwnPropertyDescriptor(value,'d');
  if(!c||!('value' in c)||!c.enumerable||c.value!==Decimal||!s||!('value' in s)||!s.enumerable||(s.value!==1&&s.value!==-1)||!e||!('value' in e)||!e.enumerable||!Number.isSafeInteger(e.value)||!d||!('value' in d)||!d.enumerable||!Array.isArray(d.value))throw Error('Unsupported source proof Decimal');
  const digits:unknown[]=d.value;
  if(Object.getPrototypeOf(digits)!==Array.prototype||Object.getOwnPropertySymbols(digits).length||!digits.length||Object.getOwnPropertyNames(digits).length!==digits.length+1)throw Error('Unsupported source proof Decimal digits');
  for(let index=0;index<digits.length;index++){
   const entry=Object.getOwnPropertyDescriptor(digits,String(index));
   if(!entry||!('value' in entry)||!entry.enumerable||typeof entry.value!=='number'||!Number.isSafeInteger(entry.value)||entry.value<0||entry.value>=10000000)throw Error('Unsupported source proof Decimal digits');
  }
  return ['decimal',Decimal.prototype.toString.call(value)];
 }
 if(Array.isArray(value))return ['array',arrayData(value).map(stable)];
 if(Object.getPrototypeOf(value)!==Object.prototype)throw Error('Unsupported source proof object');
 return ['object',Object.getOwnPropertyNames(value).sort((a,b)=>a.localeCompare(b)).flatMap(key=>{
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor||!('value' in descriptor)||!descriptor.enumerable)throw Error('Unsupported source proof object entry');
  return descriptor.value===undefined?[]:[[key,stable(descriptor.value)]];
 })];
}
const material=(input:TaxYearInput,federal:TaxReturnResult)=>JSON.stringify(stable({input,federal}));
/** Calls the actual full adapter; no caller-supplied adapter result or mutable result escapes. */
export function withOhioSchoolAdapterInvocation<T>(input:TaxYearInput,federal:TaxReturnResult,use:(proof:OhioSourceAdapterInvocation)=>T):T{
 const adapted=buildOhioResidentReturnInput(input,federal),proof=Object.freeze({[brand]:true as const});
 // Unsupported serialization cannot introduce an earlier error or authorize reuse.
 try{active.set(proof,{material:material(input,federal),method:adapted.schoolDistrictSource?.methodVersion});}catch{/* Original header validation remains the fallback. */}
 try{return use(proof);}finally{active.delete(proof);}
}
/** Missing/forged/expired/changed proof falls back to the original full validation at its original position. */
export function readOhioSchoolAdapterMethod(input:TaxYearInput,federal:TaxReturnResult,proof:OhioSourceAdapterInvocation|undefined):{method:string|undefined}|undefined{
 const current=proof&&active.get(proof);
 if(!current)return undefined;
 try{if(current.material!==material(input,federal))return undefined;}catch{return undefined;}
 return {method:current.method};
}
