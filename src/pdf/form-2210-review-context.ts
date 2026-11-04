/** Original-only provenance for the bounded 2025 Schedule AI review.
 * Spec: form-2210-schedule-ai-physical-review.yaml. Never reconstruct an
 * original identity from a redacted display copy. No tax arithmetic lives here. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import {calculateFederalTax} from '@/engine/federal.js';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {redactReviewIdentifiers} from './redact-review-identifiers.js';

const preparedBrand=Symbol('original Form2210 review');
export interface PreparedForm2210Review {readonly [preparedBrand]:true}
const savedBrand=Symbol('actually saved Form2210 review');
export interface SavedForm2210Review {readonly [savedBrand]:true}
interface OriginalContext {original:TaxYearInput; originalDigest:string; redactedDigest:string; resultDigest:string}
const originals=new WeakMap<PreparedForm2210Review,OriginalContext>();
const saved=new WeakMap<SavedForm2210Review,{context:OriginalContext;path:string;byteHash:string}>();
function digest(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function resultDigest(result:TaxReturnResult):string{const{stateReturns:_state,...federal}=result;return digest(redactReviewIdentifiers(federal));}
function freeze<T>(value:T):T{if(value!==null&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
/** This is display provenance only, never a new taxpayer eligibility rule.
 * An original-less legacy direct mapper remains available without claiming
 * completion of the newly source-qualified physical worksheet. */
export function hasForm2210OriginalIdentity(input:TaxYearInput):boolean{
 const known=(value:string|undefined)=>typeof value==='string'&&/^\d{9}$/.test(value.replaceAll('-',''));
 return known(input.taxpayer.primary.ssn)&&(!input.taxpayer.spouse||known(input.taxpayer.spouse.ssn));
}
export function requiresForm2210ScheduleAiReview(input:TaxYearInput,result:TaxReturnResult):boolean{
 const row=result.form2210;
 return Array.isArray(result.allLines)&&result.agi!==undefined&&result.taxableIncome!==undefined&&result.totalTax!==undefined
  &&input.taxpayer.taxYear===2025&&result.taxYear===2025&&input.form2210?.calculationMethod==='annualized'
  &&row?.sourceFactsVerified===true&&row.requiresForm2210===true&&row.scheduleAi!==undefined&&!row.farmerMethod&&!row.waiver;
}
export function prepareForm2210Review(input:TaxYearInput):PreparedForm2210Review{
 if(!hasForm2210OriginalIdentity(input))throw new Error('Form2210 review requires complete actual original identity before display redaction');
 let calculation:TaxReturnResult;
 try{calculation=calculateFederalTax(input);}catch(error){throw new Error('Form 2210 current actual original sources cannot be reconciled',{cause:error});}
 if(!requiresForm2210ScheduleAiReview(input,calculation))throw new Error('Form2210 review requires the current original required annualized source method');
 const token:PreparedForm2210Review=Object.freeze({[preparedBrand]:true as const});
 originals.set(token,{original:freeze(structuredClone(input)),originalDigest:digest(input),redactedDigest:digest(redactReviewIdentifiers(input)),resultDigest:resultDigest(calculation)});return token;
}
function context(input:TaxYearInput,result:TaxReturnResult,token:PreparedForm2210Review):OriginalContext{
 const current=originals.get(token);
 if(!current)throw new Error('Form2210 review needs its original prepared context');
 const actual=digest(input);
 if(actual!==current.originalDigest&&actual!==current.redactedDigest)throw new Error('Form2210 review original sources are stale or conflicting');
 if(resultDigest(result)!==current.resultDigest)throw new Error('Form 2210 current actual sources and retained result do not match the original source calculation');
 if(!requiresForm2210ScheduleAiReview(current.original,result))throw new Error('Form2210 retained source method is not the current required annualized review');
 return current;
}
/** Fresh canonical computation occurred before original capture. Both complete
 * input digest and complete federal result are checked before any output I/O. */
export function form2210ReviewOriginalInput(input:TaxYearInput,result:TaxReturnResult,token:PreparedForm2210Review):TaxYearInput{return structuredClone(context(input,result,token).original);}
/** The trusted packet writer calls this only after its completed mapped PDF has
 * been successfully saved. Keep source commitments and actual byte hash private;
 * a path or a serialized boolean is never a saved-artifact proof. */
export async function recordSavedForm2210Review(input:TaxYearInput,result:TaxReturnResult,token:PreparedForm2210Review,path:string):Promise<SavedForm2210Review>{
 const source=context(input,result,token);
 if(basename(path)!=='f2210-filled.pdf')throw new Error('Form2210 saved review artifact has the wrong path');
 const bytes=await readFile(path);if(bytes.length===0)throw new Error('Form2210 saved review artifact is empty');
 const proof:SavedForm2210Review=Object.freeze({[savedBrand]:true as const});
 saved.set(proof,{context:source,path:resolve(path),byteHash:createHash('sha256').update(bytes).digest('hex')});return proof;
}
export function hasSavedForm2210Review(input:TaxYearInput,result:TaxReturnResult,includedForms:readonly string[],proof?:SavedForm2210Review):boolean{
 if(!proof)return false;const artifact=saved.get(proof);if(!artifact||!/^[a-f0-9]{64}$/.test(artifact.byteHash))return false;
 const actual=digest(input),source=artifact.context;
 return(actual===source.originalDigest||actual===source.redactedDigest)&&resultDigest(result)===source.resultDigest
  &&requiresForm2210ScheduleAiReview(source.original,result)
  &&includedForms.some(path=>path===basename(artifact.path)||resolve(path)===artifact.path);
}
