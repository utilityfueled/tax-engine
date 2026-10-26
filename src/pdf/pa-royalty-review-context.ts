/** Actual PA royalty sources remain validated before render-only redaction. */
import {createHash} from 'node:crypto';
import {calculatePAReturn} from '@/engine/state/pa-orchestrator.js';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {redactReviewIdentifiers} from './redact-review-identifiers.js';
const brand=Symbol('prepared PA royalty review');
export interface PreparedPARoyaltyReview {readonly [brand]:true}
const contexts=new WeakMap<PreparedPARoyaltyReview,{original:string;redacted:string;state:string}>();
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function stateDigest(result:NonNullable<TaxReturnResult['stateReturns']>['pennsylvania']):string{
 if(!result || !('scheduleE' in result) || !result.scheduleE)throw new Error('PA royalty state source calculation is missing');
 return digest(redactReviewIdentifiers({scheduleE:result.scheduleE,netRentalIncome:result.pa40.netRentalIncome}));
}
export function preparePARoyaltyReview(input:TaxYearInput):PreparedPARoyaltyReview{
 if(!input.royaltyPropertySources)throw new Error('PA royalty review requires original property sources');
 const token:PreparedPARoyaltyReview=Object.freeze({[brand]:true as const});
 try{
  const result=calculatePAReturn(input);
  contexts.set(token,{original:digest(input),redacted:digest(redactReviewIdentifiers(input)),state:stateDigest(result)});
 }catch(error){throw new Error(`PA royalty original source calculation is unavailable: ${error instanceof Error?error.message:'reconcile actual records'}`,{cause:error});}
 return token;
}
export function assertPARoyaltyReview(input:TaxYearInput,result:TaxReturnResult,token:PreparedPARoyaltyReview):void{
 const context=contexts.get(token);
 if(!context)throw new Error('PA royalty review requires an original prepared context');
 const actual=digest(input);
 if(actual!==context.original&&actual!==context.redacted)throw new Error('PA royalty original sources changed after preparation');
 if(stateDigest(result.stateReturns?.pennsylvania)!==context.state)throw new Error('PA royalty retained state calculation does not reconcile');
}
