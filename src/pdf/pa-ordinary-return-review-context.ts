/** Actual ordinary source review; opaque prepared tokens never originate from render facts. */
import Decimal from 'decimal.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {projectPACareOwnedPaper,assertPACarePublicDisplayPrivacy,type PACareOwnedPaper} from './pa-care-review-facts.js';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {PAResidencySourcesSchema} from '@/models/pa-residency.js';
import {calculatePAOrdinaryReturn,type PAOrdinaryReturnResult} from '@/engine/state/pa-ordinary-return.js';
import {PAOrdinaryReturnFactsSchema} from '@/models/pa-ordinary-return-facts.js';
import {ordinarySourcePrecision} from '@/engine/state/pa-ordinary-source-precision.js';
import {redactReviewIdentifiers} from './redact-review-identifiers.js';
const brand=Symbol('actual prepared PA ordinary return review');
export interface PreparedPAOrdinaryReturnReview {readonly [brand]:true}
interface Context {original:TaxYearInput;originalDigest:string;redactedDigest:string;expected:PAOrdinaryReturnResult;care?:PACareOwnedPaper;federal?:TaxReturnResult;residentCredit?:PAOrdinaryResidentCreditRenderFacts;scheduleD?:PAOrdinaryScheduleDRenderFacts}
const contexts=new WeakMap<PreparedPAOrdinaryReturnReview,Context>();
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(detail:string):never=>{throw new Error('PA ordinary PDF source review: '+detail);};
/** Use the existing canonical redaction contract, including private-key aliases and ssns arrays. */
function privateSourceTextRedactor(original:TaxYearInput,additionalPrivateValues:readonly string[]=[]):(text:string)=>string{
 const values=new Set<string>(additionalPrivateValues.filter(value=>value.trim()));
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

export interface PAOrdinaryResidentCreditStateRenderFacts{
 state:string;paCompensation:string;otherCompensation:string;taxDue:string;netTaxPaid:string;
 paidBound:string;adjustment:string;adjustedPaid:string;paTax:string;credit:string;
 employers:Array<{name:string;compensation:string}>;
}
export interface PAOrdinaryResidentCreditRenderFacts{claimantName:string;totalCredit:string;states:PAOrdinaryResidentCreditStateRenderFacts[]}
const PaperMoney=Decimal.clone({precision:100,rounding:Decimal.ROUND_HALF_UP});
/** Paper projection is not another credit calculator. All monetary values are replayed source results. */
function actualResidentCreditPaper(original:TaxYearInput,expected:PAOrdinaryReturnResult):PAOrdinaryResidentCreditRenderFacts|undefined{
 const result=expected.residentCreditSources;
 if(!result){if(expected.pa40.residentCredit.gt(0))return fail('actual resident credit source result is missing');return;}
 if(!result.totalCredit.eq(expected.pa40.residentCredit))return fail('actual resident credit total differs from PA40line22');
 const total=result.perState.reduce((sum,row)=>sum.plus(row.credit),new PaperMoney(0));
 if(!total.eq(result.totalCredit))return fail('per-state printed credit sum needs an actual paper allocation successor');
 if(!result.totalCredit.gt(0))return;
 const sources=original.paOrdinaryReturnCompletionSources?.otherStateTaxes.residentCreditSources;
 if(!sources)return fail('actual complete resident-credit originals are required');
 const residency=PAResidencySourcesSchema.parse(original.paResidencySources),privateValues:string[]=[];
 const collectPrivate=(value:unknown):void=>{if(!value||typeof value!=='object')return;for(const[key,item]of Object.entries(value)){if(typeof item==='string'&&/^(?:ein|employerStateID|sourceReference|confirmationNumber|returnId)$/i.test(key))privateValues.push(item);else collectPrivate(item);}};
 collectPrivate(original);const redact=privateSourceTextRedactor(original,privateValues);
 const states=result.perState.filter(row=>row.credit.gt(0)).map(row=>{
  const claim=sources.claims.find(claim=>claim.state===row.state);if(!claim)return fail('actual claimed state originals are missing');
  const employers=new Map<string,{name:string;amount:Decimal}>();
  for(const wage of claim.wages){const w2=original.w2s[wage.w2Index],payroll=residency.wages.find(item=>item.originalIndex===wage.w2Index)?.payroll[wage.payrollIndex];
   if(!w2||!payroll||!w2.employer.name.trim())return fail('actual original employer name and payroll are required for SectionII');
   const key=JSON.stringify([w2.employer.ein,w2.employer.name]),prior=employers.get(key),amount=new PaperMoney(payroll.grossCompensation);
   employers.set(key,{name:redact(w2.employer.name),amount:prior?prior.amount.plus(amount):amount});
  }
  const rows=[...employers.values()].map(item=>({name:item.name,compensation:item.amount.toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toFixed(0)}));
  const printedSum=rows.reduce((sum,item)=>sum.plus(item.compensation),new PaperMoney(0));
  if(!printedSum.eq(row.reportedEligibleCompensation))return fail('printed employer source sum requires its actual paper rounding successor');
  if(!row.taxAdjustment.eq(0))return fail('actual adjusted-tax paper method is not implemented for this finite ordinary slice');
  return {state:row.state,paCompensation:expected.pa40.compensation.toFixed(0),otherCompensation:row.reportedEligibleCompensation.toFixed(0),taxDue:row.taxLiabilityAfterCredits.toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toFixed(0),netTaxPaid:row.reportedNetPayments.toFixed(0),paidBound:row.paidLiabilityBound.toFixed(0),adjustment:'0',adjustedPaid:row.paidLiabilityBound.toFixed(0),paTax:row.paTaxOnEligibleCompensation.toFixed(0),credit:row.credit.toFixed(0),employers:rows};
 });
 return {claimantName:redact(original.taxpayer.primary.firstName+' '+original.taxpayer.primary.lastName),totalCredit:result.totalCredit.toFixed(0),states};
}

/** Original-bound paper facts, never a caller tax or source override. */
export interface PAOrdinaryScheduleDRowRenderFacts{description:string;dateAcquired:string;dateSold:string;proceeds:string;basis:string;gain:string;loss:boolean}
export interface PAOrdinaryScheduleDRenderFacts{claimantName:string;total:string;rows:PAOrdinaryScheduleDRowRenderFacts[]}
function actualDigitalPaper(original:TaxYearInput,expected:PAOrdinaryReturnResult):PAOrdinaryScheduleDRenderFacts|undefined{
 const schedule=expected.scheduleD;if(!schedule)return;
 if(!original.paResidencySources?.digitalSources||!original.form1099DA.length||!schedule.digitalAssetQuestionYes)return fail('actual digital paper originals and source result are missing');
 if(!schedule.line12.eq(expected.pa40.netGainOrLoss))return fail('actual ScheduleD total differs from PA40line5');
 const privateValues:string[]=[];
 const collect=(value:unknown):void=>{if(!value||typeof value!=='object')return;for(const[key,item]of Object.entries(value)){if(typeof item==='string'&&/^(?:sourceId|sourceReference|basisSourceReference|paBasisSourceReference|legalSourceReference|useSourceReference|deductionSourceReference|relationshipSourceReference|propertySourceReference|receiptNumber|stateIdentificationNumber|brokerTin|payerTin|accountReference|confirmationNumber|ssn|ein|employerStateID|returnId|applicationId|awardId)$/i.test(key))privateValues.push(item);else collect(item);}};
 collect(original);const redact=privateSourceTextRedactor(original,privateValues),Money=Decimal.clone({precision:ordinarySourcePrecision(original.form1099DA),rounding:Decimal.ROUND_HALF_UP});
 const printed=(value:Decimal):string=>{const rounded=value.toDecimalPlaces(0,Decimal.ROUND_HALF_UP);return rounded.isZero()?'0':rounded.toFixed(0);};
 const date=(value:string):string=>{if(value==='VARIOUS')return value;const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match||!Number.isFinite(new Date(value+'T00:00:00Z').getTime())||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)return fail('actual paper acquisition and sale dates are unsupported');return match[2]+'/'+match[3]+'/'+match[1].slice(-2);};
 let total=new Money(0);const rows=original.form1099DA.flatMap(form=>form.transactions.map(transaction=>{
  if(transaction.paCostBasis===undefined)return fail('actual PA paper basis is missing');
  const proceeds=printed(new Money(transaction.proceeds)),basis=printed(new Money(transaction.paCostBasis)),gain=printed(new Money(transaction.proceeds).minus(transaction.paCostBasis));
  if(!new Money(proceeds).minus(basis).eq(gain))return fail('printed paper columns need their actual rounding successor');
  total=total.plus(gain);return {description:redact((transaction.quantity??'')+' '+transaction.digitalAssetName).trim(),dateAcquired:date(transaction.dateAcquired),dateSold:date(transaction.dateSold),proceeds,basis,gain,loss:new Money(gain).lt(0)};
 }));
 if(!total.eq(schedule.line12))return fail('printed paper row sum needs its actual rounding successor');
 return {claimantName:redact(original.taxpayer.primary.firstName+' '+original.taxpayer.primary.lastName),total:printed(total),rows};
}

/** Structural routing only; source qualification always requires fresh original replay. */
export function isPAOrdinaryReturnResult(value:unknown):value is PAOrdinaryReturnResult{return !!value&&typeof value==='object'&&'methodVersion'in value&&value.methodVersion==='pa-ordinary-return-v1';}
export function preparePAOrdinaryReturnReview(input:TaxYearInput):PreparedPAOrdinaryReturnReview{
 if(input.taxpayer.taxYear!==2025)return fail('actual2025 ordinary PDF method only; final2026 mapping remains unavailable');
 if(!TaxYearInputSchema.safeParse(input).success)return fail('complete strict canonical actual originals are required');
 if(!input.paOrdinaryReturnFacts||!input.paOrdinaryReturnCompletionSources||!input.paResidencySources)return fail('complete actual ordinary completion and residency originals are required');
 const original=structuredClone(input),expected=calculatePAOrdinaryReturn(original,original.paOrdinaryReturnFacts,original.paOrdinaryReturnCompletionSources);
 if(expected.refundDisposition.donations.length>5)return fail('more than five original donation elections require their physical continuation method');
 const residentCredit=actualResidentCreditPaper(original,expected),scheduleD=actualDigitalPaper(original,expected);
 const source=original.paOrdinaryReturnCompletionSources?.care.careSources;
 const federal=expected.scheduleDC?calculateFederalTax(original):undefined;
 const care=source&&source.paperIdentitySources&&federal&&expected.scheduleDC?projectPACareOwnedPaper(original,source,expected.scheduleDC,federal):undefined;
 if(source?.paperIdentitySources&&!care)fail('actual care paper requires supported complete care source credit');
 const token:PreparedPAOrdinaryReturnReview=Object.freeze({[brand]:true as const});contexts.set(token,{original,expected,...(care?{care}:{}),...(federal?{federal}:{}),...(residentCredit?{residentCredit}:{}),...(scheduleD?{scheduleD}:{}),originalDigest:digest(original),redactedDigest:digest(redactReviewIdentifiers(original))});return token;
}
export interface PAOrdinaryReviewRenderFacts{
 care?:PACareOwnedPaper;filingStatus:'S'|'F';finalReturnReason:string;dependentChildren:number;residentCredit?:PAOrdinaryResidentCreditRenderFacts;scheduleD?:PAOrdinaryScheduleDRenderFacts;
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
 let care:PACareOwnedPaper|undefined;
 if(context.federal){
  const {stateReturns:_callerStates,...callerFederal}=result,{stateReturns:_savedStates,...savedFederal}=context.federal??{};
  if(!isDeepStrictEqual(callerFederal,savedFederal))fail('actual federal result differs from original care result');
  const fresh=calculatePAOrdinaryReturn(original,original.paOrdinaryReturnFacts,original.paOrdinaryReturnCompletionSources),freshFederal=calculateFederalTax(original),source=original.paOrdinaryReturnCompletionSources?.care.careSources;
  if(!source||!fresh.scheduleDC||!isDeepStrictEqual(fresh,expected)||!isDeepStrictEqual(freshFederal,context.federal))return fail('retained original care replay differs');
  assertPACarePublicDisplayPrivacy(original);
  if(source.paperIdentitySources)care=projectPACareOwnedPaper(original,source,fresh.scheduleDC,freshFederal);
 }
 const redactSourceText=privateSourceTextRedactor(original);
 const period=expected.residencyStatus==='part_year'?residency.residency.domicilePeriods.find(p=>p.state==='PA'):undefined;
 return {...(care?{care}:{}),...(context.residentCredit?{residentCredit:structuredClone(context.residentCredit)}:{}),...(context.scheduleD?{scheduleD:structuredClone(context.scheduleD)}:{}),filingStatus:expected.filingChoice,finalReturnReason:redactSourceText(facts.filing.finalReturnReason),dependentChildren:expected.dependentChildren,
 residency:{status:expected.residencyStatus,schoolCode:expected.schoolDistrictCode,schoolDistrictName:redactSourceText(residency.residency.schoolDistrictName),...(period?{from:period.from,through:period.through}:{})},
 requestedRefund:expected.refundDisposition.refund.toFixed(0),nextYearCredit:expected.refundDisposition.nextYearCredit.toFixed(0),donations:expected.refundDisposition.donations.map(row=>({code:row.code,amount:row.amount.toFixed(0)}))};
}
