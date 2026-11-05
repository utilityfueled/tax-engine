/** Original-bound PA household paper projection; never an owner federal return. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import Decimal from 'decimal.js';
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAMarriedOrdinaryReturn,type PAMarriedOrdinaryReturnProjection,type PAMarriedOrdinaryReturnResult} from '@/engine/state/pa-married-ordinary-return.js';
import {isPAMarriedOrdinaryReturnResult} from '@/engine/state/pa-return-result.js';
import {redactReviewIdentifiers} from './redact-review-identifiers.js';
import {assertPdfExportAllowed} from './export-policy.js';

const brand=Symbol('original PA married review');
export interface PreparedPAMarriedReturnReview{readonly [brand]:true}
interface Stored{original:TaxYearInput;originalDigest:string;redactedDigest:string;expected:PAMarriedOrdinaryReturnResult;federal:TaxReturnResult}
const contexts=new WeakMap<PreparedPAMarriedReturnReview,Stored>();
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(message:string):never{throw Error('PA married review source context: '+message);}
/** Ignore only independent Decimal constructor identities, retaining types,
 * values, complete keys and the distinction between absent and undefined. */
function comparable(value:unknown):unknown{
 if(value instanceof Decimal){if(!value.isFinite())fail('nonfinite actual result');return ['decimal',value.toString()];}
 if(value===null)return ['null'];
 if(Array.isArray(value))return ['array',value.map(comparable)];
 if(typeof value==='object'){
  if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)fail('unsupported actual result object');
  return ['object',Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,comparable(item)])];
 }
 if(typeof value==='function'||typeof value==='symbol')fail('unsupported actual result value');
 return [typeof value,value];
}
const sameActualResult=(a:unknown,b:unknown)=>isDeepStrictEqual(comparable(a),comparable(b));


/** Complete source facts are checked privately, before identifiers are removed. */
export function preparePAMarriedReturnReview(input:TaxYearInput):PreparedPAMarriedReturnReview{
 assertPdfExportAllowed(input.taxpayer.taxYear,input.taxpayer.taxYear);
 if(!TaxYearInputSchema.safeParse(input).success||!input.paMarriedOrdinarySources)fail('complete original canonical household packet is required');
 // Care needs its own identifier-kind and physical Schedule DC qualification.
 if(input.dependentCare!==undefined||input.dependentCareBenefits!==undefined||input.paMarriedOrdinarySources.care!==undefined)fail('actual care paper requires its separately reviewed projection successor');
 const original=structuredClone(input),expected=calculatePAMarriedOrdinaryReturn(original,original.paMarriedOrdinarySources);
 if(expected.returns.some(row=>row.scheduleSP.dependents!==original.taxpayer.dependents.length))fail('actual child count differs from original-bound Schedule SP');
 if(original.taxpayer.dependents.length>9&&expected.returns.some(row=>row.scheduleSP.taxForgivenessCredit.gt(0)))fail('more than nine claimed SP children require a reviewed continuation projection');
 const federal=calculateFederalTax(original);
 if(!expected.federal.earnedIncomeCredit.isZero()||expected.returns.some(row=>!row.workingCredit.credit.isZero()||!row.rev1630.totalInterest.isZero()||!row.pa40.refundableCredits.isZero()))fail('actual positive working credit or penalty needs its separately reviewed paper successor');
 const token=Object.freeze({[brand]:true as const});
 contexts.set(token,{original,expected,federal,originalDigest:digest(original),redactedDigest:digest(redactReviewIdentifiers(original))});return token;
}

/** Free-text redaction supplements the existing structured-identifier contract. */
function safeText(original:TaxYearInput):(value:string)=>string{
 const privateValues=new Set<string>();
 const collect=(value:unknown):void=>{
  if(!value||typeof value!=='object')return;
  for(const [key,item]of Object.entries(value)){
   if(typeof item==='string'&&item.trim()&&/(?:ssn|tin|ein|taxid|identifyingnumber|accountReference|sourceReference|confirmationNumber|returnId)$/i.test(key))privateValues.add(item);
   else collect(item);
  }
 };
 collect(original);
 const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const patterns=[...privateValues].flatMap(value=>{
  const digits=value.replace(/\D/g,'');
  return /^[-.()\s\d]+$/.test(value)&&digits.length>=4?[escape(value),digits.split('').join('[-.()\\s]*')]:[escape(value)];
 }).sort((a,b)=>b.length-a.length);
 const expression=patterns.length?new RegExp(patterns.join('|'),'gi'):undefined;
 return value=>expression?value.replace(expression,'[REDACTED]'):value;
}
export interface PAMarriedOwnedPaper{
 accountHolder:'joint'|'primary'|'spouse';taxpayer:TaxYearInput['taxpayer'];projection:PAMarriedOrdinaryReturnProjection;
 children:ReadonlyArray<{name:string;age:number;relationship:string}>;
 schoolName:string;spColumns:{A?:{compensation:string;gifts:string};B?:{compensation:string;gifts:string};C?:{compensation:string;gifts:string}};
}

/** No original recapture or source confirmation occurs on read. */
export function resolvePAMarriedReturnReview(input:TaxYearInput,result:TaxReturnResult,token:PreparedPAMarriedReturnReview):PAMarriedOwnedPaper[]{
 assertPdfExportAllowed(input.taxpayer.taxYear,result.taxYear);
 const saved=contexts.get(token);if(!saved)fail('actual original prepared context is required; fabricated or missing token');
 const actual=digest(input);if(actual!==saved.originalDigest&&actual!==saved.redactedDigest)fail('original household packet changed after preparation');
 if(!input.paMarriedOrdinarySources||!isPAMarriedOrdinaryReturnResult(result.stateReturns?.pennsylvania))fail('actual married packet and result are required');
 if(!sameActualResult(result.stateReturns.pennsylvania,saved.expected))fail('actual owned result differs from prepared originals');
 const {stateReturns:_actualStates,...actualFederal}=result,{stateReturns:_expectedStates,...expectedFederal}=saved.federal;
 if(!sameActualResult(actualFederal,expectedFederal))fail('actual unchanged federal household result differs from originals');
 // Replay from the retained private originals, rather than trusting caller scalars.
 const original=structuredClone(saved.original),sources=original.paMarriedOrdinarySources;
 if(!sources)fail('actual retained household packet is missing');
 const fresh=calculatePAMarriedOrdinaryReturn(original,sources);
 if(!sameActualResult(fresh,saved.expected))fail('retained original household replay differs');
 const text=safeText(original),redacted=redactReviewIdentifiers(original.taxpayer);
 const people={primary:redacted.primary,spouse:redacted.spouse};if(!people.spouse)fail('actual partner is required');
 const relationships:Record<string,string>={natural_child:'CHILD',adopted_child:'ADOPTED CHILD',stepchild:'STEPCHILD',grandchild:'GRANDCHILD',foster_child:'FOSTER CHILD'};
 const children=original.taxpayer.dependents.map((child,index)=>{
  const proof=sources.dependentChildren?.find(row=>row.originalIndex===index),relationship=proof?relationships[proof.relationship]:undefined;
  if(!relationship)fail('actual child relationship source is missing');
  return {name:text(child.firstName+' '+child.lastName),age:original.taxpayer.taxYear-Number(child.dateOfBirth.slice(0,4)),relationship};
 });
 const originalOwners=new Map(fresh.perOwner.map(row=>[row.accountHolder,row]));
 const owner=(tag:'primary'|'spouse')=>{const row=originalOwners.get(tag);if(!row)fail('actual original owner totals missing');return row;};
 const scrubPerson=(person:TaxYearInput['taxpayer']['primary'])=>({...person,firstName:text(person.firstName),lastName:text(person.lastName),...(person.occupation!==undefined?{occupation:text(person.occupation)}:{})});
 return fresh.returns.map(projection=>{
  const tag=projection.accountHolder,first=tag==='spouse'?people.spouse:people.primary,partner=tag==='spouse'?people.primary:people.spouse;
  if(!first||!partner)fail('actual claimant and partner identities required');
  const taxpayer={...redacted,dependents:redacted.dependents.map(child=>({...child,firstName:text(child.firstName),lastName:text(child.lastName)})),primary:scrubPerson(first),spouse:scrubPerson(partner),address:{...redacted.address,street:text(redacted.address.street),city:text(redacted.address.city),...(redacted.address.apt!==undefined?{apt:text(redacted.address.apt)}:{})}};
  const values=(which:'primary'|'spouse')=>({compensation:owner(which).reportedCompensation.toFixed(0),gifts:owner(which).spOtherIncome.toFixed(0)});
  const spColumns:PAMarriedOwnedPaper['spColumns']=tag==='joint'?{A:{compensation:projection.pa40.totalPATaxableIncome.toFixed(0),gifts:projection.scheduleSP.nontaxableIncome.toFixed(0)}}:
   {B:values(tag),C:values(tag==='primary'?'spouse':'primary')};
  return {accountHolder:tag,taxpayer,projection,children,schoolName:text(projection.schoolDistrictName),spColumns};
 });
}

/** Public federal companions cannot yet consume a separate sanitized display
 * projection without changing their source-token contract. Reject unsafe display
 * originals before any file/template IO; never rewrite canonical source facts. */
export function assertPAMarriedPublicDisplayPrivacy(input:TaxYearInput,result:TaxReturnResult,token:PreparedPAMarriedReturnReview):void{
 resolvePAMarriedReturnReview(input,result,token);
 const saved=contexts.get(token);if(!saved)fail('actual original prepared context is required');
 const original=saved.original,text=safeText(original),taxpayer=original.taxpayer;
 const person=(row:TaxYearInput['taxpayer']['primary'])=>[row.firstName,row.lastName,...(row.occupation!==undefined?[row.occupation]:[])];
 const display=[...person(taxpayer.primary),...(taxpayer.spouse?person(taxpayer.spouse):[]),...Object.values(taxpayer.address),...taxpayer.dependents.flatMap(child=>[child.firstName,child.lastName,child.relationship])];
 if(display.some(value=>typeof value==='string'&&text(value)!==value))fail('private original identifier in federal display requires a separately qualified display projection');
}
