/** Spec: state/oh-reciprocal-wages-guided.yaml. Source collection only; core arithmetic is unchanged. */
import type {TaxYearInput} from '@/models/inputs';
import {OhioReciprocalWageSourcesSchema,type OhioReciprocalWageSources} from '@/models/ohio-reciprocal-wage-sources';
import type {OhioResidencyFacts} from '@/models/ohio-residency';
import type {OhioPaymentFacts} from '@/models/ohio-payments';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {buildGuidedOhioResidencyFacts,assertGuidedOhioOriginals,snapshotGuidedOhioOriginals,type OhioResidencyDraft} from './guided-ohio-residency-facts';
import {buildGuidedOhioPaymentFacts,type OhioPaymentDraft} from './guided-ohio-payment-facts';
type Entered<T>={[K in keyof T]:T[K] extends boolean?boolean|null:T[K] extends number?number|null:T[K] extends string?string:T[K]};
export interface OhioReciprocalWagesDraft {
 sourceTaxYear:number|null;sourceReference:string;sourceFactsConfirmed:boolean|null;
 allIncomeOriginalsIncludedConfirmed:boolean|null;noOtherIncomeOrAdjustmentsConfirmed:boolean|null;noSpecialCompensationConfirmed:boolean|null;
 accountHolder:string;originalTaxpayer:OhioReciprocalWageSources['originalTaxpayer'];w2Index:number|null;originalW2?:Record<string,unknown>;w2OriginalsCheckedConfirmed:boolean|null;
 domicileOriginal:Entered<OhioReciprocalWageSources['domicileOriginal']>;
 employerEntityOriginal:Entered<OhioReciprocalWageSources['employerEntityOriginal']>;
 serviceOriginal:Entered<OhioReciprocalWageSources['serviceOriginal']>;
 payrollRows:Array<Entered<OhioReciprocalWageSources['payrollRows'][number]>>;
 originalFederalSources?:Record<string,unknown>;originalResidencySources?:OhioResidencyFacts;originalPaymentSources?:OhioPaymentFacts;
}
export function emptyGuidedOhioReciprocalWages():OhioReciprocalWagesDraft{return{
 sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,allIncomeOriginalsIncludedConfirmed:null,noOtherIncomeOrAdjustmentsConfirmed:null,noSpecialCompensationConfirmed:null,
 accountHolder:'',originalTaxpayer:{firstName:'',lastName:'',ssn:''},w2Index:null,w2OriginalsCheckedConfirmed:null,
 domicileOriginal:{sourceId:'',sourceTaxYear:null,accountHolder:'',name:'',ssn:'',from:'',to:'',documentDate:'',domicileState:'',completeYearDomicileConfirmed:null},
 employerEntityOriginal:{sourceId:'',sourceTaxYear:null,employerTin:'',employerName:'',entityType:'',from:'',to:'',documentDate:'',notPassThroughOrPEOConfirmed:null},
 serviceOriginal:{sourceId:'',sourceTaxYear:null,accountHolder:'',employerTin:'',from:'',to:'',documentDate:'',allCompensationOrdinaryOhioEmployeeServicesConfirmed:null,totalCompensation:''},payrollRows:[],
};}
export function emptyOhioReciprocalPayroll():OhioReciprocalWagesDraft['payrollRows'][number]{return{sourceId:'',sourceReference:'',accountHolder:'',sourceTaxYear:null,employerTin:'',servicePeriodFrom:'',servicePeriodTo:'',paymentDate:'',serviceState:'',wages:'',ohioWithheld:''};}
export function updateGuidedOhioReciprocalWages(draft:OhioReciprocalWagesDraft,patch:Partial<OhioReciprocalWagesDraft>):OhioReciprocalWagesDraft{return{...structuredClone(draft),...structuredClone(patch),sourceFactsConfirmed:null};}
/** Copy is an explicit original-selection action; independently entered documentary facts remain untouched. */
export function copySelectedGuidedOhioReciprocalW2(input:TaxYearInput,draft:OhioReciprocalWagesDraft):OhioReciprocalWagesDraft{
 if(draft.w2OriginalsCheckedConfirmed!==true||draft.w2Index===null||!Number.isInteger(draft.w2Index))throw Error('Explicitly select and check the actual current W2 original first.');
 const w2=input.w2s[draft.w2Index];if(!w2)throw Error('The selected current W2 original is unavailable.');
 return updateGuidedOhioReciprocalWages(draft,{originalW2:structuredClone(w2)});
}
function stable(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';
 return JSON.stringify(value)??'null';
}
function currentParents(input:TaxYearInput,residency:OhioResidencyDraft|undefined,payments:OhioPaymentDraft|undefined){return{residency:buildGuidedOhioResidencyFacts(residency,input),payments:buildGuidedOhioPaymentFacts(payments,input)};}
function canonical(draft:OhioReciprocalWagesDraft):OhioReciprocalWageSources{
 if(draft.w2OriginalsCheckedConfirmed!==true)throw Error('Explicitly check the actual current W2 original before confirming reciprocal sources.');
 // Exclude exactly the native binding metadata. Unexpected scalar/other keys must reach strict parsing.
 const{w2OriginalsCheckedConfirmed:_checked,originalFederalSources:_federal,originalResidencySources:_residency,originalPaymentSources:_payments,...source}=draft;
 return OhioReciprocalWageSourcesSchema.parse(source);
}
function validateFinite(input:TaxYearInput,source:OhioReciprocalWageSources,parents:ReturnType<typeof currentParents>):OhioResidencyFacts{
 if(parents.residency.reciprocalWageSources!==undefined&&stable(parents.residency.reciprocalWageSources)!==stable(source))throw Error('Reconcile reciprocal sources already retained within the actual residency originals.');
 const residency={...parents.residency,reciprocalWageSources:source};
 if(input.ohioResidency!==undefined&&stable(input.ohioResidency)!==stable(residency))throw Error('Reconcile the retained canonical Ohio residency originals before attaching different reciprocal sources.');
 if(input.ohioPayments!==undefined&&stable(input.ohioPayments)!==stable(parents.payments))throw Error('Reconcile the retained canonical Ohio payment originals before attaching different sources.');
 const bound={...input,ohioResidency:residency,ohioPayments:parents.payments};
 calculateOhioResidentReturnFromFederal({taxInput:bound,federalResult:calculateFederalTax(bound)});
 return residency;
}
/** Pure saved-source replay. Neither current originals nor the retained documentary record is rewritten. */
export function buildGuidedOhioReciprocalWages(input:TaxYearInput,draft:OhioReciprocalWagesDraft|undefined,residency:OhioResidencyDraft|undefined,payments:OhioPaymentDraft|undefined):OhioResidencyFacts{
 if(!draft)throw Error('Enter and explicitly confirm the actual reciprocal wage originals.');
 assertGuidedOhioOriginals(input,draft.originalFederalSources);const parents=currentParents(input,residency,payments);
 if(!draft.originalResidencySources||stable(draft.originalResidencySources)!==stable(parents.residency)||!draft.originalPaymentSources||stable(draft.originalPaymentSources)!==stable(parents.payments))throw Error('Actual reciprocal domicile or Ohio account sources are missing or stale; explicitly review the current originals.');
 return validateFinite(input,canonical(draft),parents);
}
/** Only this explicit review action may capture the currently reviewed parent/federal commitments. */
export function confirmGuidedOhioReciprocalWages(input:TaxYearInput,draft:OhioReciprocalWagesDraft,residency:OhioResidencyDraft|undefined,payments:OhioPaymentDraft|undefined):OhioReciprocalWagesDraft{
 const parents=currentParents(input,residency,payments),candidate={...structuredClone(draft),sourceFactsConfirmed:true,originalFederalSources:snapshotGuidedOhioOriginals(input),originalResidencySources:structuredClone(parents.residency),originalPaymentSources:structuredClone(parents.payments)};
 validateFinite(input,canonical(candidate),parents);return candidate;
}
