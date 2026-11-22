import{stripVTControlCharacters}from'node:util';
import{failureClue}from'./failure-clues.mjs';
// Fixed metadata only; never returns input values or error text.
const MAX_INTERVALS=40000,MAX_ERRORS=16,MAX_MESSAGE=4096;
const kinds=['valid','negative','fractional','unsafe','nonfinite','nonnumeric','unknown'];
const own=(o,k)=>{if(!o||typeof o!=='object')return undefined;const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;};
const subtype=x=>typeof x!=='number'?'nonnumeric':!Number.isFinite(x)?'nonfinite':!Number.isInteger(x)?'fractional':!Number.isSafeInteger(x)?'unsafe':x<0?'negative':'valid';
export function fixedIntervalRejections(raw){
 const unavailable={scope:'bounded-interval-array',intervalCount:null,counts:null};
 try{const a=own(raw,'timeDeltas'),n=own(a,'length');if(!Array.isArray(a)||!Number.isSafeInteger(n)||n<0||n>MAX_INTERVALS)return unavailable;
  const counts=Object.fromEntries(kinds.map(k=>[k,0]));for(let i=0;i<n;i++){try{const d=Object.getOwnPropertyDescriptor(a,String(i));counts[d&&Object.hasOwn(d,'value')?subtype(d.value):'unknown']++;}catch{counts.unknown+=n-i;break;}}
  return{scope:'bounded-interval-array',intervalCount:n,counts};
 }catch{return unavailable;}
}
function fields(o,keys){if(!o||typeof o!=='object'||Array.isArray(o)||![Object.prototype,null].includes(Object.getPrototypeOf(o)))throw Error('invalid-fixed-metadata');const actual=Reflect.ownKeys(o);if(actual.length!==keys.length||!keys.every(k=>actual.includes(k)))throw Error('invalid-fixed-metadata');for(const k of keys){const d=Object.getOwnPropertyDescriptor(o,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw Error('invalid-fixed-metadata');}}
export function validateIntervalRejections(value){
 fields(value,['scope','intervalCount','counts']);if(own(value,'scope')!=='bounded-interval-array')throw Error('invalid-fixed-metadata');
 if(own(value,'intervalCount')===null&&own(value,'counts')===null)return{scope:'bounded-interval-array',intervalCount:null,counts:null};
 const n=own(value,'intervalCount');if(!Number.isSafeInteger(n)||n<0||n>MAX_INTERVALS)throw Error('invalid-fixed-metadata');const input=own(value,'counts');fields(input,kinds);let total=0;const counts={};for(const k of kinds){const x=own(input,k);if(!Number.isSafeInteger(x)||x<0||x>MAX_INTERVALS)throw Error('invalid-fixed-metadata');counts[k]=x;total+=x;}if(total!==n)throw Error('invalid-fixed-metadata');return{scope:'bounded-interval-array',intervalCount:n,counts};
}
function category(error){
 try{const name=own(error,'name'),message=own(error,'message');if(name!==undefined&&(typeof name!=='string'||name.length>64))return'other';if(message!==undefined&&(typeof message!=='string'||message.length>MAX_MESSAGE))return'other';if(name==='TimeoutError')return'timeout';if(typeof message!=='string')return'other';const text=stripVTControlCharacters(message);
  if(/^(?:Error: )?Test timeout of [0-9]+ms exceeded(?:\.|$)/u.test(text))return'timeout';
  if(/^(?:Error: )?(?:[A-Za-z]+\.[A-Za-z]+: )?Target page, context or browser has been closed(?:\n|$)/u.test(text))return'browserclosed';
  if(/^(?:Error: )?expect\(/u.test(text)||/^(?:AssertionError)(?::| \[)/u.test(text))return'assertion';return'other';
 }catch{return'other';}
}
function browserCategory(result){
 try{const status=own(result,'status');if(status==='passed'||status==='skipped')return null;if(status==='timedOut')return'timeout';if(status!=='failed')return'other';let errors=own(result,'errors'),error=own(result,'error');if(errors===undefined)errors=[];const count=own(errors,'length');if(!Array.isArray(errors)||!Number.isSafeInteger(count)||count<0||count>MAX_ERRORS)return'other';const all=[];for(let i=0;i<count;i++){const d=Object.getOwnPropertyDescriptor(errors,String(i));if(!d||!Object.hasOwn(d,'value'))return'other';all.push(d.value);}if(error!==undefined)all.push(error);if(!all.length||all.length>MAX_ERRORS)return'other';const categories=all.map(category);return categories.every(c=>c===categories[0])?categories[0]:'other';
 }catch{return'other';}
}
export function projectDiagnosticCases(rows,project){
 const fixed=project(rows),sources=new Map();if(!Array.isArray(fixed)||fixed.length!==rows.length)throw Error('invalid-fixed-metadata');return fixed.map((r,i)=>{const results=own(rows[i],'results'),result=Array.isArray(results)?own(results,'0'):undefined;return{...r,failureCategory:browserCategory(result),...(['failed','timedOut'].includes(r.status)?{failureClue:failureClue(result,sources)}:{})};});
}
