/** Exact local arithmetic for admitted ordinary PA sources; no global configuration. */
import Decimal from 'decimal.js';
import type {CalculatedLine} from '@/models/outputs.js';
/** Full integer/scale span retains small residuals after arbitrary cancellation.
 * Count includes every represented source term; extra places cover chained sums,
 * four-place PA rates and carry. Numeric identifiers only overestimate the bound.
 */
export function ordinarySourcePrecision(...sources:unknown[]):number{
 let integers=1,scale=0,terms=0;
 function visit(value:unknown):void{
  if(Decimal.isDecimal(value)){if(value.isFinite())visit(value.toFixed());return;}
  if(typeof value==='string'&&/^-?\d+(\.\d+)?$/.test(value)){
   const [integer,fraction='']=value.replace(/^-/,'').split('.');integers=Math.max(integers,integer.replace(/^0+/,'').length);scale=Math.max(scale,fraction.length);terms+=1;
  }else if(Array.isArray(value)){for(const child of value)visit(child);}
  else if(value&&typeof value==='object'){for(const child of Object.values(value))visit(child);}
 }
 for(const source of sources)visit(source);
 return Math.max(100,integers+scale+String(terms+1).length+12);
}
/** Construction copies exact digits; it performs no precision-limited arithmetic. */
export function publicOrdinaryMoney(value:Decimal):Decimal{return new Decimal(value);}
export function publicOrdinaryLines(lines:CalculatedLine[]):CalculatedLine[]{return lines.map(line=>({...line,value:publicOrdinaryMoney(line.value),inputs:Object.fromEntries(Object.entries(line.inputs).map(([key,value])=>[key,typeof value==='string'?value:publicOrdinaryMoney(value)]))}));}
