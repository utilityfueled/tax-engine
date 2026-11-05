import Decimal from 'decimal.js';
import type {TaxYearInput} from '@/models/inputs';
import {PAOrdinaryCareSourcesSchema,type PAOrdinaryCareSources,type PACarePaperIdentitySources} from '@/models/pa-care-sources';
import {validatePACarePaperIdentitySources} from '@/engine/state/pa-care-paper-sources';
const fail=(message:string):never=>{throw new Error('PA care sources: '+message);};
function stable(v:unknown):string{if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+stable(x)).join(',')+'}';return JSON.stringify(v)??'null';}
/** Blank private draft; capture and confirmation are separate explicit actions. */
export function emptyGuidedPACareSources():PAOrdinaryCareSources{return {sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,originalDependentCare:{},payments:[]};}
export function emptyGuidedPACarePayment():PAOrdinaryCareSources['payments'][number]{return {sourceReference:'',providerIndex:null,qualifyingPersonIndex:null,paidOn:'',serviceFrom:'',serviceThrough:'',amount:'',originalAvailableConfirmed:null,employmentRelatedConfirmed:null,notClaimedOnAnotherReturnConfirmed:null,originalReceipt:{receiptNumber:'',date:'',amount:'',providerName:'',providerTin:'',qualifyingPersonName:'',qualifyingPersonTin:''}};}
/** Caller has reviewed current originals; this action never supplies a factual year or amount. */
export function captureGuidedPACareOriginals(input:TaxYearInput,data:PAOrdinaryCareSources,reviewed:boolean|null):PAOrdinaryCareSources{if(reviewed!==true||!input.dependentCare)return fail('review actual current federal care originals before capture');return {...data,sourceFactsConfirmed:null,originalDependentCare:structuredClone(input.dependentCare),...(data.paperIdentitySources?{paperIdentitySources:{...data.paperIdentitySources,sourceFactsConfirmed:null}}:{})};}
/** Source confirmation only; full return and credit qualification remain the engine's responsibility. */
export function buildGuidedPACareSources(input:TaxYearInput,raw:unknown):PAOrdinaryCareSources{
 const data=PAOrdinaryCareSourcesSchema.parse(raw);
 if(data.sourceFactsConfirmed!==true||data.sourceTaxYear!==input.taxpayer.taxYear||!data.sourceReference.trim())fail('confirm actual current year and collection source after the last edit');
 if(!input.dependentCare||stable(data.originalDependentCare)!==stable(input.dependentCare))return fail('retained actual federal care originals are missing or stale');
 if(!data.payments.length)fail('retain actual care payment originals');
 for(const row of data.payments){
  if(!row.sourceReference.trim()||row.providerIndex===null||row.providerIndex<0||row.qualifyingPersonIndex===null||row.qualifyingPersonIndex<0||row.originalAvailableConfirmed!==true||row.employmentRelatedConfirmed!==true||row.notClaimedOnAnotherReturnConfirmed!==true)return fail('complete and confirm every actual payment source');
  if(!input.dependentCare.providers?.[row.providerIndex]||!input.dependentCare.qualifyingPersons?.[row.qualifyingPersonIndex])fail('select actual current provider and qualifying person');
  for(const value of [row.paidOn,row.serviceFrom,row.serviceThrough,row.originalReceipt.date]){const d=new Date(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)fail('complete actual valid receipt and service dates');}
  for(const amount of [row.amount,row.originalReceipt.amount])if(!/^\d+(\.\d+)?$/.test(amount)||!new Decimal(amount).isFinite())fail('complete actual payment and receipt amounts; unknown is not zero');
  for(const value of Object.values(row.originalReceipt))if(!value.trim())fail('complete actual receipt identity and amount');
 }
 if(data.paperIdentitySources!==undefined)validatePACarePaperIdentitySources(input,data);
 return data;
}
export function confirmGuidedPACareSources(input:TaxYearInput,data:PAOrdinaryCareSources):PAOrdinaryCareSources{return buildGuidedPACareSources(input,{...data,sourceFactsConfirmed:true});}

/** Documentary identity entry is optional and begins without inferred facts. */
export function emptyGuidedPACarePaperIdentitySources():PACarePaperIdentitySources{return {sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,providers:[],qualifyingPersons:[]};}
export function emptyGuidedPACareProviderIdentity():PACarePaperIdentitySources['providers'][number]{return {providerIndex:null,sourceReference:'',originalAvailableConfirmed:null,identifierKind:'unknown',originalProvider:{}};}
export function emptyGuidedPACarePersonIdentity():PACarePaperIdentitySources['qualifyingPersons'][number]{return {qualifyingPersonIndex:null,originalDependentIndex:null,sourceReference:'',originalAvailableConfirmed:null,identifierKind:'unknown',originalQualifyingPerson:{},originalFederalDependent:{}};}

/** Explicit capture changes only selected retained originals and confirmation. */
export function captureGuidedPACarePaperIdentityOriginals(input:TaxYearInput,data:PAOrdinaryCareSources,reviewed:boolean|null):PAOrdinaryCareSources{
 const identity=data.paperIdentitySources;
 if(reviewed!==true||!identity||!identity.providers.length||!identity.qualifyingPersons.length)return fail('review actual documentary identity originals and select every original before capture');
 const providers=identity.providers.map(row=>{
  const index=row.providerIndex,original=index!==null&&index>=0?input.dependentCare?.providers?.[index]:undefined;
  if(!original)return fail('select the actual current documentary provider original');
  return {...row,originalProvider:structuredClone(original)};
 });
 const qualifyingPersons=identity.qualifyingPersons.map(row=>{
  const index=row.qualifyingPersonIndex,dependentIndex=row.originalDependentIndex;
  const person=index!==null&&index>=0?input.dependentCare?.qualifyingPersons?.[index]:undefined;
  const dependent=dependentIndex!==null&&dependentIndex>=0?input.taxpayer.dependents[dependentIndex]:undefined;
  if(!person||!dependent)return fail('select the actual current qualifying person and dependent originals');
  return {...row,originalQualifyingPerson:structuredClone(person),originalFederalDependent:structuredClone(dependent)};
 });
 return {...data,sourceFactsConfirmed:null,paperIdentitySources:{...identity,sourceFactsConfirmed:null,providers,qualifyingPersons}};
}

/** Documentary confirmation never confirms care eligibility or the household. */
export function confirmGuidedPACarePaperIdentitySources(input:TaxYearInput,data:PAOrdinaryCareSources):PAOrdinaryCareSources{
 if(!data.paperIdentitySources)return fail('complete actual documentary identity records first');
 const next={...data,sourceFactsConfirmed:null,paperIdentitySources:{...data.paperIdentitySources,sourceFactsConfirmed:true}};
 validatePACarePaperIdentitySources(input,next);
 return next;
}
