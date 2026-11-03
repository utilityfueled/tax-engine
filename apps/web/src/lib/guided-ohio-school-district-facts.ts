/** Spec: state/oh-sd-100-guided.yaml. Native drafts are private source records, never scalar overrides. */
import {calculateFederalTax} from '@/engine/federal';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter';
import {OhioSchoolDistrictFactsSchema,type OhioSchoolDistrictFacts} from '@/models/ohio-school-district';
import type {TaxYearInput} from '@/models/inputs';
import {buildGuidedOhioResidencyFacts,snapshotGuidedOhioOriginals,assertGuidedOhioOriginals,type OhioResidencyDraft} from './guided-ohio-residency-facts';
import {buildGuidedOhioPaymentFacts,type OhioPaymentDraft} from './guided-ohio-payment-facts';
type Confirmation=boolean|null;
interface SourceAddress{street:string;apt?:string;city:string;state:string;zip:string}
interface SourceIdentity{firstName:string;lastName:string;ssn:string;dateOfBirth:string}
export interface SchoolPeriodDraft{from:string;through:string;districtCode:string;sourceReference:string}
export interface SchoolLocalRowDraft{printedRow:number|null;sourceReference:string;classification:string;districtCode?:string;municipalityCode?:string}
export interface SchoolW2Draft{w2Index:number|null;sourceReference:string;box14SchoolDistrictReporting:{status:string;sourceReference:string};localRows:SchoolLocalRowDraft[]}
export interface SchoolReceiptOriginalDraft{accountName:string;accountSsn:string;taxYear:string;returnType:string;kind:string;date:string;amount:string;confirmationNumber:string}
export interface SchoolReceiptDraft{sourceId:string;sourceReference:string;accountHolder:string;taxYear:string;returnType:string;kind:string;date:string;amount:string;appliedToThisReturnConfirmed:Confirmation;original:SchoolReceiptOriginalDraft}
export interface SchoolPriorDraft{status:string;sourceReference:string;taxYear?:string;returnType?:string;districtCode?:string;accountName?:string;accountSsn?:string;filingStatus?:string;periodStart?:string;periodEnd?:string;returnKind?:string;filedDate?:string;filingExtension?:{kind:string};line8?:string;line19?:string;electedCreditCarryforward?:string}
export interface SchoolCarryDraft{status:string;sourceReference:string;accountHolder?:string;accountSsn?:string;electedAmount?:string;availableForThisReturn?:string;appliedToThisReturnConfirmed?:Confirmation}
export interface OhioSchoolDistrictDraft{
 taxYear:string;sourceReference:string;sourceFactsConfirmed:Confirmation;originalFederalSources?:Record<string,unknown>;
 owner:{accountHolder:string;originalTaxpayer:SourceIdentity};
 residence:{sourceReference:string;originalAddress:SourceAddress;periods:SchoolPeriodDraft[];lookup:{sourceReference:string;taxYear:string;lookupDate:string;originalAddress:SourceAddress;districtCode:string;districtName:string;officialResultMatchedConfirmed:Confirmation}};
 income:{sourceReference:string;ordinaryCompensationOnlyConfirmed:Confirmation;noSelfEmploymentIncomeConfirmed:Confirmation;allOtherIncomeSourcesCheckedConfirmed:Confirmation;noSpecialWageAdjustmentsConfirmed:Confirmation};
 w2Sources:SchoolW2Draft[];
 payments:{sourceReference:string;allCurrentAndPriorPaymentsIncludedConfirmed:Confirmation;withholdingTreatment:string;paymentRows:SchoolReceiptDraft[];
  account:{sourceReference:string;accountName:string;accountSsn:string;taxYear:string;returnType:string;asOfDate:string;completeAccountConfirmed:Confirmation;estimatedPaymentsCredited:string;priorCreditApplied:string};
  priorReturn:SchoolPriorDraft;priorCreditCarryforward:SchoolCarryDraft;remainingTaxPayment:{status:string;sourceReference:string;sourceFactsConfirmed:Confirmation};
  currentTiming:{kind:string;expectedDate?:string;filedDate?:string;asOfDate:string};filingExtension:{kind:string};paymentExtension:{kind:string};returnKind:string;specialMethod:string;refundDisposition:{sourceReference:string;outgoingCarryforward:string}};
}
const address=():SourceAddress=>({street:'',apt:'',city:'',state:'',zip:''});
export function emptySchoolPeriod():SchoolPeriodDraft{return{from:'',through:'',districtCode:'',sourceReference:''};}
export function emptySchoolLocalRow():SchoolLocalRowDraft{return{printedRow:null,sourceReference:'',classification:'',districtCode:'',municipalityCode:''};}
export function emptySchoolW2():SchoolW2Draft{return{w2Index:null,sourceReference:'',box14SchoolDistrictReporting:{status:'',sourceReference:''},localRows:[]};}
export function emptySchoolReceipt():SchoolReceiptDraft{return{sourceId:'',sourceReference:'',accountHolder:'',taxYear:'',returnType:'',kind:'',date:'',amount:'',appliedToThisReturnConfirmed:null,original:{accountName:'',accountSsn:'',taxYear:'',returnType:'',kind:'',date:'',amount:'',confirmationNumber:''}};}
export function emptyOhioSchoolDistrictDraft():OhioSchoolDistrictDraft{return{
 taxYear:'',sourceReference:'',sourceFactsConfirmed:null,owner:{accountHolder:'',originalTaxpayer:{firstName:'',lastName:'',ssn:'',dateOfBirth:''}},
 residence:{sourceReference:'',originalAddress:address(),periods:[],lookup:{sourceReference:'',taxYear:'',lookupDate:'',originalAddress:address(),districtCode:'',districtName:'',officialResultMatchedConfirmed:null}},
 income:{sourceReference:'',ordinaryCompensationOnlyConfirmed:null,noSelfEmploymentIncomeConfirmed:null,allOtherIncomeSourcesCheckedConfirmed:null,noSpecialWageAdjustmentsConfirmed:null},w2Sources:[],
 payments:{sourceReference:'',allCurrentAndPriorPaymentsIncludedConfirmed:null,withholdingTreatment:'',paymentRows:[],account:{sourceReference:'',accountName:'',accountSsn:'',taxYear:'',returnType:'',asOfDate:'',completeAccountConfirmed:null,estimatedPaymentsCredited:'',priorCreditApplied:''},priorReturn:{status:'',sourceReference:''},priorCreditCarryforward:{status:'',sourceReference:''},remainingTaxPayment:{status:'',sourceReference:'',sourceFactsConfirmed:null},currentTiming:{kind:'',expectedDate:'',filedDate:'',asOfDate:''},filingExtension:{kind:''},paymentExtension:{kind:''},returnKind:'',specialMethod:'',refundDisposition:{sourceReference:'',outgoingCarryforward:''}}
};}
function fail(message:string):never{throw Error(`Ohio school district sources: ${message}`);}
export function normalizeSchoolCurrency(value:string):string{if(typeof value!=='string')fail('an actual monetary source is missing');const v=value.trim();return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(v)?v.replaceAll(',',''):value;}
function year(value:string):number|string{if(typeof value!=='string')fail('an actual source year is missing');return /^\d{4}$/.test(value.trim())?Number(value.trim()):value;}
function actualAddress(value:SourceAddress){const{apt,...rest}=value;if(apt!==undefined&&typeof apt!=='string')fail('actual address details are incomplete');return{...rest,...(apt?.trim()?{apt}: {})};}
function hasReported(value:unknown):boolean{if(value==null||value==='')return false;if(Array.isArray(value))return value.some(hasReported);if(typeof value==='object')return Object.values(value).some(hasReported);return true;}
function checkDraftStructure(d:OhioSchoolDistrictDraft):void{
 const record=(value:unknown,path:string)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(`actual ${path} records are incomplete`);};
 const at=(path:string)=>{let value:unknown=d;for(const key of path.split('.')){record(value,path);value=Reflect.get(value as object,key);}record(value,path);};
 for(const path of ['owner','owner.originalTaxpayer','residence','residence.originalAddress','residence.lookup','residence.lookup.originalAddress','income','payments','payments.account','payments.priorReturn','payments.priorCreditCarryforward','payments.remainingTaxPayment','payments.currentTiming','payments.filingExtension','payments.paymentExtension','payments.refundDisposition'])at(path);
 if(!Array.isArray(d.residence.periods)||!Array.isArray(d.w2Sources)||!Array.isArray(d.payments.paymentRows))fail('actual source row lists are incomplete');
 for(const row of d.residence.periods)record(row,'residence period');
 for(const row of d.w2Sources){record(row,'W2 coverage');record(row.box14SchoolDistrictReporting,'W2 Box14');if(!Array.isArray(row.localRows))fail('actual printed local coverage is incomplete');for(const local of row.localRows)record(local,'local coverage');}
 for(const row of d.payments.paymentRows){record(row,'payment receipt');record(row.original,'original payment receipt');}
}
function originalPacket(d:OhioSchoolDistrictDraft):unknown{
 checkDraftStructure(d);
 const p=d.payments,prior=p.priorReturn,carry=p.priorCreditCarryforward,timing=p.currentTiming;
 const{status:_priorStatus,sourceReference:_priorReference,...priorDetails}=prior;
 const{status:_carryStatus,sourceReference:_carryReference,...carryDetails}=carry;
 if(prior.status==='no_return'&&hasReported(priorDetails))fail('retained filed prior-return details contradict no-return; review or explicitly remove those details');
 if(carry.status==='none'&&hasReported(carryDetails))fail('retained prior credit details contradict no-credit; review or explicitly remove those details');
 if(timing.kind==='expected'&&timing.filedDate?.trim()||timing.kind==='filed'&&timing.expectedDate?.trim())fail('retained actual filed and expected timing records conflict; reconcile the separate endpoint records');
 const raw={...structuredClone(d),taxYear:year(d.taxYear),residence:{...d.residence,originalAddress:actualAddress(d.residence.originalAddress),lookup:{...d.residence.lookup,taxYear:year(d.residence.lookup.taxYear),originalAddress:actualAddress(d.residence.lookup.originalAddress)}},
  w2Sources:d.w2Sources.map(row=>({...row,localRows:row.localRows.map(local=>({...local,...(!local.districtCode?.trim()?{districtCode:undefined}:{}),...(!local.municipalityCode?.trim()?{municipalityCode:undefined}:{})}))})),
  payments:{...p,paymentRows:p.paymentRows.map(row=>({...row,taxYear:year(row.taxYear),amount:normalizeSchoolCurrency(row.amount),original:{...row.original,taxYear:year(row.original.taxYear),amount:normalizeSchoolCurrency(row.original.amount)}})),account:{...p.account,taxYear:year(p.account.taxYear),estimatedPaymentsCredited:normalizeSchoolCurrency(p.account.estimatedPaymentsCredited),priorCreditApplied:normalizeSchoolCurrency(p.account.priorCreditApplied)},
   priorReturn:prior.status==='no_return'?{status:prior.status,sourceReference:prior.sourceReference}:{...prior,taxYear:year(prior.taxYear??''),line8:normalizeSchoolCurrency(prior.line8??''),line19:normalizeSchoolCurrency(prior.line19??''),electedCreditCarryforward:normalizeSchoolCurrency(prior.electedCreditCarryforward??'')},
   priorCreditCarryforward:carry.status==='none'?{status:carry.status,sourceReference:carry.sourceReference}:{...carry,electedAmount:normalizeSchoolCurrency(carry.electedAmount??''),availableForThisReturn:normalizeSchoolCurrency(carry.availableForThisReturn??'')},
   currentTiming:timing.kind==='filed'?{kind:timing.kind,filedDate:timing.filedDate,asOfDate:timing.asOfDate}:{kind:timing.kind,expectedDate:timing.expectedDate,asOfDate:timing.asOfDate},refundDisposition:{...p.refundDisposition,outgoingCarryforward:normalizeSchoolCurrency(p.refundDisposition.outgoingCarryforward)}}};
 return raw;
}
/** Pure read: neither retained snapshots nor any confirmation is refreshed here. */
export function buildGuidedOhioSchoolDistrictFacts(input:TaxYearInput,data:OhioSchoolDistrictDraft|undefined,residencyDraft:OhioResidencyDraft|undefined,paymentDraft:OhioPaymentDraft|undefined):OhioSchoolDistrictFacts{
 if(!data||data.sourceFactsConfirmed!==true)fail('complete and explicitly confirm the actual school district records after the last edit');
 assertGuidedOhioOriginals(input,data.originalFederalSources);
 const residency=buildGuidedOhioResidencyFacts(residencyDraft,input),payments=buildGuidedOhioPaymentFacts(paymentDraft,input);
 if(residency.schoolDistrictStatus!=='actual_district_sources_required')fail('retained school records conflict with the current no-district residency answer');
 const parsed=OhioSchoolDistrictFactsSchema.safeParse(originalPacket(data));
 if(!parsed.success)fail(`complete actual source facts; zero only when known (${parsed.error.issues.map(i=>i.path.join('.')).join('; ')})`);
 const current={...input,ohioResidency:residency,ohioPayments:payments,ohioSchoolDistrict:parsed.data};
 buildOhioResidentReturnInput(current,calculateFederalTax(input));
 return parsed.data;
}
/** Explicit user action is the only authority to capture current raw private originals. */
export function confirmGuidedOhioSchoolDistrictFacts(input:TaxYearInput,data:OhioSchoolDistrictDraft|undefined,residencyDraft:OhioResidencyDraft|undefined,paymentDraft:OhioPaymentDraft|undefined):OhioSchoolDistrictDraft{
 if(!data)fail('actual school district source draft is required');
 const candidate={...structuredClone(data),sourceFactsConfirmed:true,originalFederalSources:snapshotGuidedOhioOriginals(input)};
 buildGuidedOhioSchoolDistrictFacts(input,candidate,residencyDraft,paymentDraft);
 return candidate;
}
