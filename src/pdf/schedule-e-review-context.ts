/** Preserve actual royalty source validation across render-only redaction.
 * Spec: spec/federal/schedule-e-physical-review.yaml. */
import { createHash } from 'node:crypto';
import { calculateFederalTax } from '@/engine/federal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { redactReviewIdentifiers } from './redact-review-identifiers.js';
const brand=Symbol('prepared Schedule E source review');
export interface PreparedScheduleEReview { readonly [brand]: true }
const contexts=new WeakMap<PreparedScheduleEReview,{originalDigest:string;redactedDigest:string;calculationDigest:string}>();
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function calculationDigest(result:TaxReturnResult):string {
 return digest(redactReviewIdentifiers({taxYear:result.taxYear,filingStatus:result.filingStatus,agi:result.agi,
  scheduleE:result.scheduleE,form8582:result.form8582,schedule1:result.schedule1,form8960:result.form8960}));
}
/** Tokens stay within the request; no original identifiers are exposed by them. */
export function prepareScheduleEReview(input:TaxYearInput):PreparedScheduleEReview {
 if(!input.royaltyPropertySources)throw new Error('Schedule E original royalty property sources are required');
 const calculated=calculateFederalTax(input),token:PreparedScheduleEReview=Object.freeze({[brand]:true as const});
 contexts.set(token,{originalDigest:digest(input),redactedDigest:digest(redactReviewIdentifiers(input)),calculationDigest:calculationDigest(calculated)});
 return token;
}
export function assertScheduleEReview(input:TaxYearInput,result:TaxReturnResult,token?:PreparedScheduleEReview):void {
 const context=contexts.get(token??prepareScheduleEReview(input));
 if(!context)throw new Error('Schedule E requires an original prepared review context');
 const actual=digest(input);
 if(actual!==context.originalDigest&&actual!==context.redactedDigest)throw new Error('Schedule E original source facts are stale or conflicting');
 if(calculationDigest(result)!==context.calculationDigest)throw new Error('Schedule E retained source calculation does not reconcile');
}
