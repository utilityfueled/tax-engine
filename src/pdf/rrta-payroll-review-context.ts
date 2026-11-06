/** Original-bound historical review display. Spec: spec/federal/rrta-payroll-review-paper.yaml. */
import {isDeepStrictEqual} from 'node:util';
import {calculateFederalTax} from '@/engine/federal.js';
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {assertPdfExportAllowed} from './export-policy.js';
import {redactReviewIdentifiers} from './redact-review-identifiers.js';
const brand=Symbol('original RRTA review');
export interface PreparedRRTAPayrollReview{readonly [brand]:true}
/** Caller-supplied documentary absence; never inferred from unmodeled W2 codes. */
export interface RRTAPayrollPaperSources{
 sourceTaxYear:number;sourceReference:string;
 noOrdinaryUncollectedMedicareCodesBOrNConfirmed:boolean;
 originalW2s:readonly unknown[];
}
interface Context{original:TaxYearInput;render:TaxYearInput;result:TaxReturnResult;paperSources:RRTAPayrollPaperSources}
const contexts=new WeakMap<PreparedRRTAPayrollReview,Context>();
function fail(message:string):never{throw Error('RRTA review '+message);}
export function requiresRRTAPayrollReview(input:TaxYearInput,result:TaxReturnResult):boolean{
 return input.rrtaPayrollSources!==undefined||result.form8959?.lines.some(row=>['14','15','16','17','23'].includes(row.line))===true;
}
/** Never infer original identity by reconstructing a redacted display packet. */
export function prepareRRTAPayrollReview(input:TaxYearInput,paperSources?:RRTAPayrollPaperSources):PreparedRRTAPayrollReview{
 assertPdfExportAllowed(input.taxpayer.taxYear,input.taxpayer.taxYear);
 if(!paperSources||Object.keys(paperSources).sort().join('|')!==['sourceTaxYear','sourceReference','noOrdinaryUncollectedMedicareCodesBOrNConfirmed','originalW2s'].sort().join('|')||paperSources.sourceTaxYear!==2025||typeof paperSources.sourceReference!=='string'||!paperSources.sourceReference.trim()||paperSources.noOrdinaryUncollectedMedicareCodesBOrNConfirmed!==true||!isDeepStrictEqual(paperSources.originalW2s,input.w2s))fail('paper withholding requires actual ordinary Box12B/N absence evidence and exact original W2s');
 if(!TaxYearInputSchema.safeParse(input).success||!input.rrtaPayrollSources)fail('requires complete actual original payroll sources');
 for(const person of [input.taxpayer.primary,...(input.taxpayer.spouse?[input.taxpayer.spouse]:[])])if(!/^\d{9}$/.test(person.ssn.replaceAll('-','')))fail('requires complete actual original household identity');
 const original=structuredClone(input),result=calculateFederalTax(original);
 if(!result.form8959||!requiresRRTAPayrollReview(original,result))fail('requires the supported actual railroad source calculation');
 const token:PreparedRRTAPayrollReview=Object.freeze({[brand]:true as const});
 contexts.set(token,{original,render:redactReviewIdentifiers(original),result,paperSources:structuredClone(paperSources)});return token;
}
function resolve(input:TaxYearInput,result:TaxReturnResult,token?:PreparedRRTAPayrollReview):Context{
 assertPdfExportAllowed(input.taxpayer.taxYear,result.taxYear);
 const saved=token&&contexts.get(token);if(!saved)fail('PDF mapping is unavailable without its actual original prepared context');
 if(!isDeepStrictEqual(input,saved.render))fail('render input differs from the exact original-bound redacted copy');
 if(!isDeepStrictEqual(result,saved.result))fail('retained complete federal result differs from actual originals');
 const fresh=calculateFederalTax(structuredClone(saved.original));
 if(!isDeepStrictEqual(fresh,saved.result))fail('fresh complete original federal replay differs');
 const scrub=safeText(saved.original,saved.paperSources);
 // Headers/address are used by every companion. Reject source identifiers
 // embedded in free text before any mapper can emit the unmodified text.
 const check=(value:unknown):void=>{if(typeof value==='string'&&scrub(value)!==value)fail('private identity or source reference is embedded in public household display');if(value&&typeof value==='object')for(const item of Object.values(value))check(item);};
 const taxpayer=redactReviewIdentifiers(input.taxpayer);check(taxpayer);
 return saved;
}
function safeText(original:TaxYearInput,paperSources:RRTAPayrollPaperSources):(value:string)=>string{
 const values=new Set<string>();
 const collect=(value:unknown):void=>{if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(typeof item==='string'&&item.trim()&&/(?:ssn|tin|ein|taxid|identifyingnumber|accountReference|sourceId|sourceReference|reportingSourceReference)$/i.test(key))values.add(item);else collect(item);}};collect(original);collect(paperSources);
 const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const patterns=[...values].flatMap(value=>{const digits=value.replace(/\D/g,'');return /^[-.()\s\d]+$/.test(value)&&digits.length>=4?[escape(value),digits.split('').join('[-.()\\s]*')]:[escape(value)];}).sort((a,b)=>b.length-a.length);
 const expression=patterns.length?new RegExp(patterns.join('|'),'gi'):undefined;
 return value=>expression?value.replace(expression,'[REDACTED]'):value;
}
/** For source assertions only; never return this private copy as a public artifact. */
export function rrtaPayrollReviewOriginalInput(input:TaxYearInput,result:TaxReturnResult,token?:PreparedRRTAPayrollReview):TaxYearInput{return structuredClone(resolve(input,result,token).original);}
/** Display-only copy after original validation. No recapture or tax recomputation from it. */
export function rrtaPayrollReviewDisplayInput(input:TaxYearInput,result:TaxReturnResult,token?:PreparedRRTAPayrollReview):TaxYearInput{
 const saved=resolve(input,result,token),scrub=safeText(saved.original,saved.paperSources);
 const walk=(value:unknown):unknown=>typeof value==='string'?scrub(value):Array.isArray(value)?value.map(walk):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,walk(item)])):value;
 const display=walk(saved.render) as TaxYearInput;
 for(const source of [display.form4137,...Object.values(display.form4137ByOwner??{})])for(const employer of source?.sourceFacts?.employers??[])employer.employerEin='';
 return display;
}
