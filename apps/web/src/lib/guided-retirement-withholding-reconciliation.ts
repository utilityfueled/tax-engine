/** Existing actual retirement sources reconcile saved PA claims, never add money. */
import Decimal from 'decimal.js';
import type {StateReturnData}from './guided-interview-flow';
import {statePaymentFactErrors}from './guided-state-facts';
import {parseGuidedCurrency}from './guided-currency';
import {ordinarySourcePrecision}from '@/engine/state/pa-ordinary-source-precision';
export interface RetirementWithholdingOriginal{taxYear?:number;payer:string;payerTin?:string;accountReference?:string;accountHolder?:'primary'|'spouse';state?:string;stateWithheld?:string;stateTaxWithheld?:string;}
const normalized=(value:string)=>value.trim().replace(/\s+/g,' ').toUpperCase();
export function reconcileGuidedRetirementWithholding(originals:ReadonlyArray<RetirementWithholdingOriginal>,data:StateReturnData|undefined,year:number):{matchedOriginalIndices:number[];matchedAmount:Decimal}{
 const Money=Decimal.clone({precision:ordinarySourcePrecision(originals,data),rounding:Decimal.ROUND_HALF_UP}),rows=data?.additionalStateWithholdingEntries??[];
 const fail=(message:string):never=>{throw Error('Actual PA retirement withholding reconciliation: '+message);};
 if(Object.keys(statePaymentFactErrors(data,year,'PA')).length)return fail('saved claims require complete current source identity and amounts');
 if(!rows.length)return {matchedOriginalIndices:[],matchedAmount:new Decimal(0)};
 if(year!==2025||!data?.paResidencySources?.retirementSources||data.paResidencySources.retirementSources.sourceFactsConfirmed!==true)return fail('actual finite PA retirement source packet is required');
 const amount=(value:string|undefined):Decimal=>{if(value===undefined||!value.trim())return fail('actual original withholding is unknown');const n=new Money(parseGuidedCurrency(value));if(!n.isFinite()||n.lt(0))return fail('invalid actual original amount');return n;};
 let matched=new Money(0);const used=new Set<number>(),matchedOriginalIndices:number[]=[];
 for(const row of rows){
  if(row.documentType!=='1099-R'||row.state!=='PA'||row.taxYear!==String(year)||!row.payer.trim())return fail('only actual current PA retirement claims may reconcile');
  const claimed=amount(row.amount),candidates:number[]=[];
  originals.forEach((original,index)=>{
   if(normalized(original.payer)!==normalized(row.payer)||original.state!=='PA')return;
   if(original.taxYear!==year||original.accountHolder!=='primary'||!/^\d{9}$/.test(original.payerTin?.replace(/-/g,'')??'')||!original.accountReference?.trim())return fail('actual original owner/year/payer/account identity is unknown');
   if(original.stateWithheld===undefined&&original.stateTaxWithheld===undefined)return fail('actual original withholding is unknown');
   const first=original.stateWithheld===undefined?new Money(0):amount(original.stateWithheld),alias=original.stateTaxWithheld===undefined?new Money(0):amount(original.stateTaxWithheld);
   if(first.gt(0)&&alias.gt(0)&&!first.eq(alias))return fail('actual original withholding aliases conflict');
   const actual=first.gt(0)?first:alias;if(actual.eq(claimed))candidates.push(index);
  });
  if(candidates.length!==1||used.has(candidates[0]))return fail('saved claim is unmatched, ambiguous or already assigned to another claim');
  const index=candidates[0];used.add(index);matchedOriginalIndices.push(index);matched=matched.plus(claimed);
 }
 return {matchedOriginalIndices,matchedAmount:new Decimal(matched)};
}
