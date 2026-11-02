/** Actual ordinary source review; opaque prepared tokens never originate from render facts. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {PAResidencySourcesSchema} from '@/models/pa-residency.js';
import {calculatePAOrdinaryReturn,type PAOrdinaryReturnResult} from '@/engine/state/pa-ordinary-return.js';
import {PAOrdinaryReturnFactsSchema} from '@/models/pa-ordinary-return-facts.js';
import {redactReviewIdentifiers} from './redact-review-identifiers.js';
const brand=Symbol('actual prepared PA ordinary return review');
export interface PreparedPAOrdinaryReturnReview {readonly [brand]:true}
interface Context {original:TaxYearInput;originalDigest:string;redactedDigest:string;expected:PAOrdinaryReturnResult}
const contexts=new WeakMap<PreparedPAOrdinaryReturnReview,Context>();
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(detail:string):never=>{throw new Error('PA ordinary PDF source review: '+detail);};
/** Use the existing canonical redaction contract, including private-key aliases and ssns arrays. */
function privateSourceTextRedactor(original:TaxYearInput):(text:string)=>string{
 const values=new Set<string>();
 const collect=(source:unknown,redacted:unknown):void=>{
  if(typeof source==='string'){if(source&&redacted==='')values.add(source);return;}
  if(!source||typeof source!=='object'||!redacted||typeof redacted!=='object')return;
  if(Array.isArray(source)&&Array.isArray(redacted)){source.forEach((item,index)=>collect(item,redacted[index]));return;}
  for(const [key,item]of Object.entries(source))collect(item,(redacted as Record<string,unknown>)[key]);
 };
 collect(original,redactReviewIdentifiers(original));
 const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const patterns=[...values].flatMap(value=>{
  const digits=value.replace(/\D/g,'');
  return /^[-.()\s\d]+$/.test(value)&&digits.length>=4?[escape(value),digits.split('').join('[-.()\\s]*')]:[escape(value)];
 }).sort((a,b)=>b.length-a.length);
 const pattern=patterns.length?new RegExp(patterns.join('|'),'g'):undefined;
 return text=>pattern?text.replace(pattern,'[REDACTED]'):text;
}

/** Structural routing only; source qualification always requires fresh original replay. */
export function isPAOrdinaryReturnResult(value:unknown):value is PAOrdinaryReturnResult{return !!value&&typeof value==='object'&&'methodVersion'in value&&value.methodVersion==='pa-ordinary-return-v1';}
export function preparePAOrdinaryReturnReview(input:TaxYearInput):PreparedPAOrdinaryReturnReview{
 if(input.taxpayer.taxYear!==2025)return fail('actual2025 ordinary PDF method only; final2026 mapping remains unavailable');
 if(!TaxYearInputSchema.safeParse(input).success)return fail('complete strict canonical actual originals are required');
 if(!input.paOrdinaryReturnFacts||!input.paOrdinaryReturnCompletionSources||!input.paResidencySources)return fail('complete actual ordinary completion and residency originals are required');
 const original=structuredClone(input),expected=calculatePAOrdinaryReturn(original,original.paOrdinaryReturnFacts,original.paOrdinaryReturnCompletionSources);
 if(expected.refundDisposition.donations.length>5)return fail('more than five original donation elections require their physical continuation method');
 const token:PreparedPAOrdinaryReturnReview=Object.freeze({[brand]:true as const});contexts.set(token,{original,expected,originalDigest:digest(original),redactedDigest:digest(redactReviewIdentifiers(original))});return token;
}
export interface PAOrdinaryReviewRenderFacts{
 filingStatus:'S'|'F';finalReturnReason:string;dependentChildren:number;
 residency:{status:'resident'|'part_year'|'nonresident';schoolCode:string;schoolDistrictName:string;from?:string;through?:string};
 requestedRefund:string;nextYearCredit:string;donations:Array<{code:string;amount:string}>;
}
export function assertPAOrdinaryReturnReview(input:TaxYearInput,result:TaxReturnResult,token?:PreparedPAOrdinaryReturnReview):PAOrdinaryReviewRenderFacts{
 const saved=result.stateReturns?.pennsylvania;if(!isPAOrdinaryReturnResult(saved))return fail('actual distinct ordinary result is required');
 if(input.taxpayer.taxYear!==2025||result.taxYear!==2025)return fail('actual source year or final mapping is unavailable');
 const prepared=token??preparePAOrdinaryReturnReview(input),context=contexts.get(prepared);if(!context)return fail('an original prepared context is required; fabricated or wrong tokens are invalid');
 const actual=digest(input);if(actual!==context.originalDigest&&actual!==context.redactedDigest)return fail('actual original sources changed after preparation');
 if(!isDeepStrictEqual(saved,context.expected))return fail('retained actual result does not reconcile with the complete original source calculation');
 const original=context.original,facts=PAOrdinaryReturnFactsSchema.parse(original.paOrdinaryReturnFacts),residency=PAResidencySourcesSchema.parse(original.paResidencySources),expected=context.expected;
 const redactSourceText=privateSourceTextRedactor(original);
 const period=expected.residencyStatus==='part_year'?residency.residency.domicilePeriods.find(p=>p.state==='PA'):undefined;
 return {filingStatus:expected.filingChoice,finalReturnReason:redactSourceText(facts.filing.finalReturnReason),dependentChildren:expected.dependentChildren,
 residency:{status:expected.residencyStatus,schoolCode:expected.schoolDistrictCode,schoolDistrictName:redactSourceText(residency.residency.schoolDistrictName),...(period?{from:period.from,through:period.through}:{})},
 requestedRefund:expected.refundDisposition.refund.toFixed(0),nextYearCredit:expected.refundDisposition.nextYearCredit.toFixed(0),donations:expected.refundDisposition.donations.map(row=>({code:row.code,amount:row.amount.toFixed(0)}))};
}
