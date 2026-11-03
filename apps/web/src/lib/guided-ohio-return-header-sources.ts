/** Spec: state/oh-return-header-sources.yaml. Explicit source capture; reading never confirms. */
import type {TaxYearInput} from '@/models/inputs';
import {OhioReturnHeaderSourcesSchema,type OhioReturnHeaderSources} from '@/models/ohio-return-header-sources';
import {calculateOhioReturnHeaderSource} from '@/engine/state/oh-return-header-source';
import {buildGuidedOhioResidencyFacts,type OhioResidencyDraft} from './guided-ohio-residency-facts';
import {buildGuidedOhioPaymentFacts,type OhioPaymentDraft} from './guided-ohio-payment-facts';
import {buildGuidedOhioResidentCreditSources} from './guided-ohio-resident-credit-sources';
type Entered<T>=T extends boolean?boolean|null:T extends number?string:T extends string?string:T extends Array<infer Row>?Entered<Row>[]:T extends object?{[Key in keyof T]:Entered<T[Key]>}:T;
export type OhioReturnHeaderDraft=Omit<Entered<OhioReturnHeaderSources>,'originalFederalSources'|'originalOhioResidencySources'|'originalOhioPaymentSources'>&{
 originalFederalSources?:Record<string,unknown>;
 originalOhioResidencySources?:Record<string,unknown>;
 originalOhioPaymentSources?:Record<string,unknown>;
 confirmedHeaderSources?:Record<string,unknown>;
};
const address=()=>({street:'',city:'',state:'',zip:''});
export function emptyOhioHeaderResidencePeriod():OhioReturnHeaderDraft['residence']['periods'][number]{return{from:'',through:'',sourceReference:''};}
export function emptyOhioReturnHeaderDraft():OhioReturnHeaderDraft{return{
 taxYear:'',sourceReference:'',asOfDate:'',sourceFactsConfirmed:null,
 owner:{accountHolder:'',originalTaxpayer:{firstName:'',lastName:'',ssn:'',dateOfBirth:''}},
 residence:{sourceReference:'',originalAddress:address(),periods:[],allOhioResidentialPeriodsIncludedConfirmed:null},
 finderOriginal:{sourceReference:'',taxYear:'',lookupDate:'',originalAddress:address(),districtCode:'',districtName:'',countyName:'',schoolIncomeTax:'',officialResultMatchedConfirmed:null},
 countyOriginal:{sourceReference:'',taxYear:'',recordDate:'',originalAddress:address(),countyName:''},
 officialInventoryOriginal:{sourceReference:'',taxYear:'',publication:'',publicationSha256:'',printedPage:'',districtCode:'',districtName:'',rateDisplay:'',taxBaseDisplay:'',officialRowReviewedConfirmed:null},
};}
function fail(message:string):never{throw Error(`Ohio actual return header sources: ${message}`);}
function stable(value:unknown):unknown{
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,child])=>child!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>[key,stable(child)]));
 return value;
}
function same(a:unknown,b:unknown){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
function year(value:string):number|string{return /^\d{4}$/.test(value)?Number(value):value;}
function enteredSource(data:OhioReturnHeaderDraft):OhioReturnHeaderSources{
 const{confirmedHeaderSources:_confirmed,...entered}=data;
 const parsed=OhioReturnHeaderSourcesSchema.safeParse({...entered,taxYear:year(data.taxYear),
  finderOriginal:{...data.finderOriginal,taxYear:year(data.finderOriginal.taxYear)},
  countyOriginal:{...data.countyOriginal,taxYear:year(data.countyOriginal.taxYear)},
  officialInventoryOriginal:{...data.officialInventoryOriginal,taxYear:year(data.officialInventoryOriginal.taxYear),printedPage:/^\d+$/.test(data.officialInventoryOriginal.printedPage)?Number(data.officialInventoryOriginal.printedPage):data.officialInventoryOriginal.printedPage},
 });
 if(!parsed.success)return fail('complete every actual header field and retain its explicit source confirmation');return parsed.data;
}
function currentContext(input:TaxYearInput,residency:OhioResidencyDraft|undefined,payments:OhioPaymentDraft|undefined){
 const original=structuredClone(input);Reflect.deleteProperty(original,'ohioReturnHeaderSources');
 if(input.ohioResidency?.residentCreditSources&&!residency?.residentCreditSources)return fail('retained canonical resident-credit originals require their current native child');
 if(input.ohioResidency?.businessSources&&!residency?.businessSources)return fail('retained canonical business sources cannot be dropped');
 if(input.ohioResidency?.reciprocalWageSources)return fail('retained reciprocal originals require their separate complete source composition');
 const parent=buildGuidedOhioResidencyFacts(residency,original),paid=buildGuidedOhioPaymentFacts(payments,original);
 const facts=residency?.residentCreditSources?buildGuidedOhioResidentCreditSources(original,residency.residentCreditSources,parent,paid):parent;
 const canonical={...original,ohioResidency:facts,ohioPayments:paid};
 const federal=Object.fromEntries(Object.entries(original).filter(([key])=>!['ohioResidency','ohioPayments','ohioSchoolDistrict'].includes(key)));
 return{canonical,federal,facts,paid};
}
/** Only this explicit user action captures current sources. Parent/payment/credit confirmations are never changed. */
export function confirmGuidedOhioReturnHeaderSources(input:TaxYearInput,data:OhioReturnHeaderDraft|undefined,residency:OhioResidencyDraft|undefined,payments:OhioPaymentDraft|undefined):OhioReturnHeaderDraft{
 if(!data)return fail('actual entered header records are required');
 const current=currentContext(input,residency,payments),candidate:OhioReturnHeaderDraft={...structuredClone(data),sourceFactsConfirmed:true,
  originalFederalSources:structuredClone(current.federal),originalOhioResidencySources:structuredClone(current.facts),originalOhioPaymentSources:structuredClone(current.paid)};
 const source=enteredSource(candidate);calculateOhioReturnHeaderSource(current.canonical,source);
 candidate.confirmedHeaderSources=structuredClone(source);
 return candidate;
}
/** Pure replay of entered records AND every retained actual dependency, including the complete native credit child. */
export function buildGuidedOhioReturnHeaderSources(input:TaxYearInput,data:OhioReturnHeaderDraft|undefined,residency:OhioResidencyDraft|undefined,payments:OhioPaymentDraft|undefined):OhioReturnHeaderSources{
 if(!data)return fail('actual header records and explicit confirmation are required');
 const current=currentContext(input,residency,payments),source=enteredSource(data),saved=OhioReturnHeaderSourcesSchema.safeParse(data.confirmedHeaderSources);
 if(!saved.success||!same(source,saved.data))return fail('actual header records differ from the separately confirmed originals; explicitly review them again');
 calculateOhioReturnHeaderSource(current.canonical,source);
 return source;
}
