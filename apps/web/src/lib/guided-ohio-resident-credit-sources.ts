/** Spec: state/oh-resident-credit-native.yaml. Actual originals; no tax scalar or calculation override. */
import type {TaxYearInput} from '@/models/inputs';
import {OhioResidentCreditSourcesSchema,type OhioResidentCreditSources} from '@/models/ohio-resident-credit-sources';
import {ohioNrcCategories,type OhioResidencyFacts} from '@/models/ohio-residency';
import type {OhioPaymentFacts} from '@/models/ohio-payments';
import {calculateFederalTax} from '@/engine/federal';
import {buildOhioResidentCreditSource} from '@/engine/state/oh-resident-credit-source';
import {assertGuidedOhioOriginals,snapshotGuidedOhioOriginals,buildGuidedOhioResidencyFacts,type OhioResidencyDraft} from './guided-ohio-residency-facts';
import {buildGuidedOhioPaymentFacts,type OhioPaymentDraft} from './guided-ohio-payment-facts';

type Entered<T> = T extends boolean ? boolean|null : T extends number ? string : T extends string ? string : T extends Array<infer Row> ? Entered<Row>[] : T extends object ? {[Key in keyof T]:Entered<T[Key]>} : T;
type Account = Entered<OhioResidentCreditSources['completedAccount']>;
export type OhioResidentCreditDraft = Omit<Entered<OhioResidentCreditSources>,'originalW2'|'completedAccount'> & {
 completedAccount:Omit<Account,'payments'|'refunds'> & {payments:Account['payments']|null;refunds:Account['refunds']|null};
 paymentsReviewed:boolean|null;refundsReviewed:boolean|null;
 originalW2?:Record<string,unknown>;
 originalFederalSources?:Record<string,unknown>;
 originalResidentCreditSourcePacket?:OhioResidentCreditSources;
 originalW2UndefinedPaths?:Array<Array<string|number>>;
};
type Receipt=Account['payments'][number];
export function emptyOhioResidentCreditService():OhioResidentCreditDraft['serviceRows'][number]{return{sourceId:'',sourceReference:'',sourceTaxYear:'',accountHolder:'',employerTin:'',servicePeriodFrom:'',servicePeriodTo:'',paymentDate:'',serviceState:'',wages:''};}
function person(){return{firstName:'',lastName:'',ssn:''};}
function identity(){return{taxYear:'',accountHolder:'',originalTaxpayer:person()};}
export function emptyOhioResidentCreditReceipt():Receipt{return{...identity(),sourceId:'',sourceReference:'',kind:'',date:'',amount:''};}
export function emptyOhioResidentCreditTransaction():NonNullable<Receipt['transactionOriginals']>{
 const common=()=>({...identity(),sourceReference:'',stateCode:'',purpose:'',taxPeriodEnd:'',amount:'',achTraceNumber:''});
 return{kind:'',bankTransferOriginal:{...common(),settlementDate:'',status:''},agencyPostingOriginal:{...common(),accountSourceReference:'',postingDate:'',postingId:'',status:''}};
}
export function emptyOhioResidentCreditDraft():OhioResidentCreditDraft{return{
 sourceTaxYear:'',sourceReference:'',sourceFactsConfirmed:null,accountHolder:'',originalTaxpayer:person(),allIncomeOriginalsIncludedConfirmed:null,noOtherIncomeOrAdjustmentsConfirmed:null,noSpecialCompensationConfirmed:null,taxDeductedInFederalAgi:'',
 employerEntityOriginal:{sourceId:'',sourceReference:'',sourceTaxYear:'',documentDate:'',employerName:'',employerTin:'',entityType:''},serviceRows:[],
 filedReturn:{...identity(),sourceId:'',sourceReference:'',stateCode:'',form:'',filingStatus:'',returnKind:'',periodFrom:'',periodTo:'',filedDate:'',federalAgi:'',incomeTaxedByVirginia:'',incomeTaxBeforeCredits:'',nonrefundableCredits:'',netIncomeTax:'',withholding:'',estimatedPayments:'',balancePayments:'',refund:'',outgoingCredit:'',otherTaxes:'',penalties:'',interest:'',completedReturnAndCreditWorksheetsReference:''},
 completedAccount:{...identity(),sourceId:'',sourceReference:'',stateCode:'',statementDate:'',netIncomeTax:'',unpaidTax:'',unappliedPayments:'',outgoingCredit:'',otherTaxes:'',penalties:'',interest:'',allPaymentsAndRefundsIncludedConfirmed:null,noPendingChangesOrRefundClaimsConfirmed:null,payments:null,refunds:null},paymentsReviewed:null,refundsReviewed:null,
};}
const unsafeKeys=new Set(['__proto__','prototype','constructor']);
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function captureUndefined(value:unknown,path:Array<string|number>=[]):Array<Array<string|number>>{
 if(!value||typeof value!=='object')return[];
 const found:Array<Array<string|number>>=[];
 for(const key of Object.keys(value)){
  if(unsafeKeys.has(key))throw Error('Unsafe original W2 property cannot be captured.');
  const part=Array.isArray(value)?Number(key):key,child=Reflect.get(value,key),next=[...path,part];
  if(child===undefined){if(Array.isArray(value))throw Error('Undefined W2 array entries require a separate lossless method.');found.push(next);}else found.push(...captureUndefined(child,next));
 }
 return found;
}
/** Restore only explicitly captured missing own undefined leaves, never later taxpayer facts. */
function restoreW2(value:unknown,paths:unknown):Record<string,unknown>{
 if(!record(value)||!Array.isArray(paths))throw Error('Retained actual W2 and its serialization metadata are required; explicitly reconfirm sources.');
 const copy=structuredClone(value),seen=new Set<string>();
 for(const path of paths){
  if(!Array.isArray(path)||!path.length||path.length>64||path.some(key=>typeof key==='string'?key.length===0||unsafeKeys.has(key):typeof key!=='number'||!Number.isSafeInteger(key)||key<0))throw Error('Unsafe or malformed retained W2 serialization path.');
  const id=JSON.stringify(path);if(seen.has(id))throw Error('Duplicate retained W2 serialization path.');seen.add(id);
  let current:unknown=copy;
  for(const key of path.slice(0,-1)){
   if(!current||typeof current!=='object'||!Object.hasOwn(current,key)||(Array.isArray(current)?typeof key!=='number'||key>=current.length:typeof key!=='string'))throw Error('Retained W2 parent is missing or out of bounds.');
   current=Reflect.get(current,key);
  }
  const key=path.at(-1);
  if(!record(current)||typeof key!=='string'||(Object.hasOwn(current,key)&&current[key]!==undefined))throw Error('Retained W2 metadata cannot overwrite an actual source value.');
  Object.defineProperty(current,key,{value:undefined,writable:true,enumerable:true,configurable:true});
 }
 const actual=captureUndefined(copy).map(path=>JSON.stringify(path)).sort();
 if(JSON.stringify(actual)!==JSON.stringify([...seen].sort()))throw Error('Retained W2 metadata does not cover its actual authored undefined leaves.');
 return copy;
}
function lossless(value:unknown):string{
 if(value===undefined)return '["undefined"]';
 if(Array.isArray(value))return '["array",'+JSON.stringify(value.map(lossless))+']';
 if(value&&typeof value==='object')return '["object",'+JSON.stringify(Object.keys(value).sort().map(key=>[key,lossless(Reflect.get(value,key))]))+']';
 return JSON.stringify([typeof value,value]);
}
const moneyKeys=new Set(['wages','federalAgi','incomeTaxedByVirginia','incomeTaxBeforeCredits','nonrefundableCredits','netIncomeTax','withholding','estimatedPayments','balancePayments','refund','outgoingCredit','otherTaxes','penalties','interest','unpaidTax','unappliedPayments','amount']);
function normalize(value:unknown,key=''):unknown{
 if(key==='originalW2')return structuredClone(value);
 if(Array.isArray(value))return value.map(child=>normalize(child));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,child])=>[k,normalize(child,k)]));
 if(typeof value==='string'){
  if((key==='sourceTaxYear'||key==='taxYear')&&/^\d{4}$/.test(value))return Number(value);
  if(moneyKeys.has(key)&&/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value.trim()))return value.trim().replaceAll(',','');
 }
 return value;
}
function source(data:OhioResidentCreditDraft):OhioResidentCreditSources{
 if(data.paymentsReviewed!==true||data.refundsReviewed!==true)throw Error('Explicitly review the complete actual Virginia payment and received-refund lists; unknown is not empty.');
 const{originalFederalSources:_f,originalResidentCreditSourcePacket:_p,originalW2UndefinedPaths:_u,paymentsReviewed:_payments,refundsReviewed:_refunds,...values}=data;
 return OhioResidentCreditSourcesSchema.parse({...recordValue(normalize(values)),originalW2:restoreW2(values.originalW2,data.originalW2UndefinedPaths)});
}
function recordValue(value:unknown):Record<string,unknown>{if(!record(value))throw Error('Actual Virginia source record is required.');return value;}
/** Pure replay. Neither reading nor validation captures a new W2, receipt, owner or year. */
export function buildGuidedOhioResidentCreditSources(input:TaxYearInput,data:OhioResidentCreditDraft|undefined,residency:OhioResidencyFacts,payments:OhioPaymentFacts):OhioResidencyFacts{
 if(!data)throw Error('Retained actual Ohio resident-credit originals require the native packet and reconfirmation.');
 if(input.taxpayer.taxYear!==2025)throw Error('The actual Ohio resident-credit native method currently requires 2025.');
 assertGuidedOhioOriginals(input,data.originalFederalSources);
 const current=source(data),saved=data.originalResidentCreditSourcePacket;
 if(!saved||lossless(current)!==lossless({...saved,originalW2:restoreW2(saved.originalW2,data.originalW2UndefinedPaths)}))throw Error('Actual Virginia source originals are missing or stale; explicitly reconfirm the complete records.');
 const w2=input.w2s[0];if(!w2)throw Error('The actual current ordinary W2 is required.');
 // These rows derive only from the explicitly confirmed complete ordinary source inventory.
 // The canonical adapter independently checks every row and rejects any other retained source.
 const amounts=Object.fromEntries(ohioNrcCategories.map(category=>[category,{federalAmount:category==='wages'?w2.wages:'0',residentAmount:category==='wages'?w2.wages:'0',nonresidentOhioAmount:'0',sourceReference:current.sourceReference}])) as NonNullable<OhioResidencyFacts['owners'][number]['amounts']>;
 const facts:OhioResidencyFacts={...structuredClone(residency),residentCreditSources:current,owners:residency.owners.map(owner=>owner.accountHolder==='primary'?{...structuredClone(owner),amounts}:structuredClone(owner))};
 const canonical={...input,ohioResidency:facts,ohioPayments:payments};
 buildOhioResidentCreditSource(canonical,calculateFederalTax(canonical),facts);
 return facts;
}
/** Explicit user action is the only place current selected W2 originals may be captured. */
export function confirmGuidedOhioResidentCreditSources(input:TaxYearInput,data:OhioResidentCreditDraft,residency:OhioResidencyDraft|undefined,payments:OhioPaymentDraft|undefined):OhioResidentCreditDraft{
 const parent=buildGuidedOhioResidencyFacts(residency,input),paid=buildGuidedOhioPaymentFacts(payments,input),w2=input.w2s[0];
 if(!w2)throw Error('Select and review the actual current W2 original before confirming the Virginia sources.');
 const candidate=structuredClone(data);candidate.sourceFactsConfirmed=true;candidate.originalW2=structuredClone(w2) as Record<string,unknown>;
 candidate.originalFederalSources=snapshotGuidedOhioOriginals(input);candidate.originalW2UndefinedPaths=captureUndefined(candidate.originalW2);candidate.originalResidentCreditSourcePacket=source(candidate);
 buildGuidedOhioResidentCreditSources(input,candidate,parent,paid);return candidate;
}
/** Automatic capture headers do not count as changed source facts; actual list reviews do. */
export function ohioResidentCreditActualValues(data:OhioResidentCreditDraft|undefined):unknown{
 if(!data)return data;
 const{sourceFactsConfirmed:_c,originalW2:_w,originalFederalSources:_f,originalResidentCreditSourcePacket:_p,originalW2UndefinedPaths:_u,...actual}=data;
 return actual;
}
export function invalidateOhioResidentCredit(data:OhioResidentCreditDraft):OhioResidentCreditDraft{return{...data,sourceFactsConfirmed:null};}
