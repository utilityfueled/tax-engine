/** Spec: state/oh-canonical-business-guided.yaml. Native originals, not caller financial projections. */
import type {TaxYearInput} from '@/models/inputs';
import {OhioCanonicalBusinessSourcesSchema,type OhioCanonicalBusinessSources} from '@/models/ohio-canonical-business-sources';

type Entered<T> = T extends boolean ? boolean|null : T extends number ? string : T extends string ? string : T extends Array<infer Row> ? Entered<Row>[] : T extends object ? {[K in keyof T]:Entered<T[K]>} : T;
type Business = OhioCanonicalBusinessSources['facts']['businesses'][number];
type EnteredBusiness = Omit<Entered<Business>,'originalBusiness'> & {originalBusiness?:Record<string,unknown>};
export type OhioBusinessDraft = Omit<Entered<OhioCanonicalBusinessSources>,'facts'> & {
 facts:Omit<Entered<OhioCanonicalBusinessSources['facts']>,'businesses'> & {businesses:EnteredBusiness[]};
 /** Explicit private capture only. Neither snapshot is refreshed by a read. */
 originalFederalSources?:Record<string,unknown>;
 originalBusinessSourcePacket?:OhioCanonicalBusinessSources;
 originalBusinessUndefinedPaths?:Array<{businessIndex:number;path:Array<string|number>}>;
};
export function emptyOhioBusinessReceipt():OhioBusinessDraft['receiptOriginals'][number]{return{receiptId:'',sourceReference:'',grossReceipt:'',ohioBenefitReceipt:'',purchaserBenefitSitusingConfirmed:null,accountHolder:'',sourceTaxYear:'',date:'',originalDocumentId:'',currentUncorrectedNonvoidConfirmed:null};}
export function emptyOhioBusinessDeduction():OhioBusinessDraft['federalDeductionSources'][number]{return{deductionId:'',accountHolder:'',sourceTaxYear:'',deductionKind:'',sourceReference:'',original:{documentId:'',documentType:'',accountHolder:'',sourceTaxYear:'',amount:'',date:'',paidOrAccrued:'',sourceReference:'',allUnderlyingDeductionAccrualsIncludedConfirmed:null,description:''}};}
export function emptyOhioBusinessDraft():OhioBusinessDraft{
 const pair=()=>({ohio:'',everywhere:''});
 return{taxYear:'',sourceReference:'',sourceFactsConfirmed:null,allFederalDeductionSourcesIncludedConfirmed:null,receiptOriginals:[],federalDeductionSources:[],facts:{taxYear:'',sourceReference:'',sourceFactsConfirmed:null,allBusinessesIncludedConfirmed:null,noOtherBusinessIncomeOrAdjustmentsConfirmed:null,noFullYearResidentBusinessOwnersConfirmed:null,businesses:[{businessSourceId:'',accountHolder:'',ownerResidencyStatus:'',sourceTaxYear:'',sourceReference:'',sourceFactsConfirmed:null,ordinarySoleProprietorshipConfirmed:null,fullCalendarYearBusinessConfirmed:null,noLowerTierEntitiesConfirmed:null,noSpecialIndustryOrAlternativeAllocationConfirmed:null,noSpecialBusinessSaleConfirmed:null,noOhioDepreciationAdjustmentsConfirmed:null,noOtherBusinessIncomeOrAdjustmentsConfirmed:null,property:{sourceReference:'',originalCostAndStatutoryExclusionsConfirmed:null,ownedBeginning:pair(),ownedEnd:pair(),annualRent:pair(),annualSubrent:pair(),fullYearUnchangedRentalConfirmed:null},payroll:{...pair(),sourceReference:'',qualifyingEmployeeCompensationConfirmed:null,noResearchOrSpecialIndustryPayrollConfirmed:null},sales:{sourceReference:'',allReceiptsIncludedConfirmed:null,noDuplicateReceiptSourcesConfirmed:null,ordinaryServicesAndStatutoryExclusionsConfirmed:null,rows:[]}}]}};
}
function stable(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';
 return JSON.stringify(value)??'null';
}
/** Same three self-referential guide roots as existing Ohio native snapshots. */
function original(input:TaxYearInput):Record<string,unknown>{return structuredClone(Object.fromEntries(Object.entries(input).filter(([key])=>!['ohioResidency','ohioPayments','ohioSchoolDistrict'].includes(key))));}
const moneyKeys=new Set(['ohio','everywhere','grossReceipt','ohioBenefitReceipt','amount']);
function normalize(value:unknown,key=''):unknown{
 if(key==='originalBusiness')return structuredClone(value);
 if(Array.isArray(value))return value.map(v=>normalize(v));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,k)]));
 if(typeof value==='string'){
  if((key==='taxYear'||key==='sourceTaxYear')&&/^\d{4}$/.test(value))return Number(value);
  if(moneyKeys.has(key)&&/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value.trim()))return value.trim().replace(/,/g,'');
 }
 return value;
}
type UndefinedPath={businessIndex:number;path:Array<string|number>};
const unsafeKeys=new Set(['__proto__','prototype','constructor']);
function ownRecord(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
/** Record only authored own undefined leaves, never an inference from later current originals. */
function captureUndefinedPaths(data:{facts:{businesses:Array<{originalBusiness?:Record<string,unknown>}>}}):UndefinedPath[]{
 const found:UndefinedPath[]=[];
 function walk(value:unknown,businessIndex:number,path:Array<string|number>):void{
  if(value===null||typeof value!=='object')return;
  for(const key of Object.keys(value)){
   if(unsafeKeys.has(key))throw Error('Unsafe business original property cannot be captured.');
   const part=Array.isArray(value)?Number(key):key;const child=Reflect.get(value,key),next=[...path,part];
   if(child===undefined){if(Array.isArray(value))throw Error('Undefined array entries require a separate lossless source method.');found.push({businessIndex,path:next});}
   else walk(child,businessIndex,next);
  }
 }
 data.facts.businesses.forEach((row,i)=>walk(row.originalBusiness,i,[]));return found;
}
/** Restore only retained structural presence in a clone. Defined taxpayer facts are never overwritten. */
function restoreUndefinedPaths(packet:unknown,paths:unknown):unknown{
 if(!Array.isArray(paths))throw Error('Retained business serialization metadata is unknown; explicitly reconfirm actual originals.');
 const copy=structuredClone(packet);
 const facts=ownRecord(copy)?copy.facts:undefined,businesses=ownRecord(facts)?facts.businesses:undefined;
 if(!Array.isArray(businesses))throw Error('Retained business source structure is missing.');
 const seen=new Set<string>();
 for(const item of paths){
  if(!ownRecord(item)||Object.keys(item).some(k=>k!=='businessIndex'&&k!=='path')||typeof item.businessIndex!=='number'||!Number.isSafeInteger(item.businessIndex)||item.businessIndex<0||item.businessIndex>=businesses.length||!Array.isArray(item.path)||!item.path.length||item.path.length>64)throw Error('Malformed retained business serialization path.');
  const path=item.path;
  if(path.some(key=>typeof key==='string'?key.length===0||unsafeKeys.has(key):typeof key!=='number'||!Number.isSafeInteger(key)||key<0))throw Error('Unsafe retained business serialization path.');
  const identity=JSON.stringify([item.businessIndex,path]);if(seen.has(identity))throw Error('Duplicate retained business serialization path.');seen.add(identity);
  const row=businesses[item.businessIndex];let current:unknown=ownRecord(row)?row.originalBusiness:undefined;
  for(const key of path.slice(0,-1)){
   if(current===null||typeof current!=='object'||!Object.hasOwn(current,key)||(Array.isArray(current)?typeof key!=='number'||key>=current.length:typeof key!=='string'))throw Error('Retained business serialization parent is missing or out of bounds.');
   current=Reflect.get(current,key);
  }
  const key=path.at(-1);
  if(!ownRecord(current)||typeof key!=='string'||(Object.hasOwn(current,key)&&current[key]!==undefined))throw Error('Retained business serialization path cannot overwrite an actual source value.');
  Object.defineProperty(current,key,{value:undefined,writable:true,enumerable:true,configurable:true});
 }
 return copy;
}
function lossless(value:unknown):string{
 if(value===undefined)return '["undefined"]';
 if(Array.isArray(value))return '["array",'+JSON.stringify(value.map(lossless))+']';
 if(value!==null&&typeof value==='object')return '["object",'+JSON.stringify(Object.keys(value).sort().map(key=>[key,lossless(Reflect.get(value,key))]))+']';
 return JSON.stringify([typeof value,value]);
}
/** Exclude only the three declared web captures. Strict core schema rejects every other unknown key. */
function source(data:OhioBusinessDraft):OhioCanonicalBusinessSources{
 const{originalFederalSources:_federal,originalBusinessSourcePacket:_packet,originalBusinessUndefinedPaths:_paths,...entered}=data;
 const parsed=OhioCanonicalBusinessSourcesSchema.parse(restoreUndefinedPaths(normalize(entered),data.originalBusinessUndefinedPaths));
 const captured=captureUndefinedPaths(parsed).map(v=>JSON.stringify([v.businessIndex,v.path])).sort();
 const declared=(data.originalBusinessUndefinedPaths??[]).map(v=>JSON.stringify([v.businessIndex,v.path])).sort();
 if(JSON.stringify(captured)!==JSON.stringify(declared))throw Error('Retained business serialization metadata does not cover the actual authored undefined leaves.');
 return parsed;
}
export function buildGuidedOhioBusinessFacts(data:OhioBusinessDraft,input:TaxYearInput):OhioCanonicalBusinessSources{
 if(input.taxpayer.taxYear!==2025)throw Error('Actual native Ohio business sources currently require 2025.');
 if(!data.originalFederalSources||stable(data.originalFederalSources)!==stable(original(input)))throw Error('Actual Ohio business federal originals are missing or stale; explicitly reconfirm them.');
 const parsed=source(data);
 if(!data.originalBusinessSourcePacket||lossless(parsed)!==lossless(restoreUndefinedPaths(data.originalBusinessSourcePacket,data.originalBusinessUndefinedPaths)))throw Error('Actual Ohio business source originals are missing or stale; explicitly reconfirm the complete records.');
 if(parsed.taxYear!==input.taxpayer.taxYear||parsed.facts.taxYear!==input.taxpayer.taxYear)throw Error('Actual Ohio business source year must match this return.');
 if(parsed.facts.businesses.length!==1||!input.scheduleC||stable(parsed.facts.businesses[0]?.originalBusiness)!==stable(input.scheduleC))throw Error('Actual single current C business original must match the retained source records.');
 return parsed;
}
/** Capture is an explicit action. Full financial/timeline eligibility is replayed by the parent residency API. */
export function confirmGuidedOhioBusinessFacts(input:TaxYearInput,data:OhioBusinessDraft):OhioBusinessDraft{
 if(!input.scheduleC||data.facts.businesses.length!==1)throw Error('Enter one actual current C business and complete original source records.');
 const candidate=structuredClone(data);candidate.sourceFactsConfirmed=true;candidate.facts.sourceFactsConfirmed=true;
 const row=candidate.facts.businesses[0];if(!row)throw Error('Actual current business record is required.');
 row.sourceFactsConfirmed=true;row.originalBusiness=structuredClone(input.scheduleC) as Record<string,unknown>;
 candidate.originalFederalSources=original(input);candidate.originalBusinessUndefinedPaths=captureUndefinedPaths(candidate);candidate.originalBusinessSourcePacket=source(candidate);
 buildGuidedOhioBusinessFacts(candidate,input);return candidate;
}
/** Actual-data comparison excludes only explicit capture/confirmation headers, not factual classifications. */
export function ohioBusinessActualValues(data:OhioBusinessDraft|undefined):unknown{
 if(!data)return data;
 const{sourceFactsConfirmed:_confirmed,originalFederalSources:_original,originalBusinessSourcePacket:_packet,originalBusinessUndefinedPaths:_paths,...values}=data;
 const{sourceFactsConfirmed:_factsConfirmed,...facts}=values.facts;
 return{...values,facts:{...facts,businesses:facts.businesses.map(({sourceFactsConfirmed:_rowConfirmed,originalBusiness:_business,...row})=>row)}};
}
export function invalidateOhioBusiness(data:OhioBusinessDraft):OhioBusinessDraft{return{...data,sourceFactsConfirmed:null};}
