/** Explicit independently supplied fictional ordinary employee originals; never product defaults. */
import type {TaxYearInput} from '@/models/inputs';
import {TaxYearInputSchema} from '@/models/inputs';
import type {OhioResidencyFacts} from '@/models/ohio-residency';
import type {OhioPaymentFacts} from '@/models/ohio-payments';
import type {OhioReciprocalWageSources} from '@/models/ohio-reciprocal-wage-sources';
import {buildTaxInputFromGuidedData,buildGuidedW2SourceContext} from '@/lib/guided-interview-bridge';
import {confirmGuidedW2StateLocalSources} from '@/lib/guided-w2-state-local-facts';
import {buildGuidedOhioResidencyFacts,snapshotGuidedOhioOriginals,type OhioResidencyDraft} from '@/lib/guided-ohio-residency-facts';
import {buildGuidedOhioPaymentFacts,type OhioPaymentDraft} from '@/lib/guided-ohio-payment-facts';
import type {StateReturnData,W2EntryData} from '@/lib/guided-interview-flow';
import {startCompleteInterview,completeW2Entry} from '../guided-interview/complete-facts';
import {reciprocalOhioWageFixture} from './oh-reciprocal-wage-sources';
export function reciprocalRequired<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw Error('Independently supplied complete fictional reciprocal original required');return value;}
/** Proposed native source contract, frozen before product implementation. */
export type EnteredReciprocalDraft=Omit<OhioReciprocalWageSources,'sourceFactsConfirmed'>&{
 sourceFactsConfirmed:boolean|null;w2OriginalsCheckedConfirmed:boolean|null;
 originalFederalSources?:Record<string,unknown>;originalResidencySources?:OhioResidencyFacts;originalPaymentSources?:OhioPaymentFacts;
};
export type EnteredReciprocalStateData=StateReturnData&{ohioReciprocalWages:EnteredReciprocalDraft};
export function guidedReciprocalWageFixture(wages='60000.25',withholding='2000.60',ohioFirst=false){
 const core=reciprocalOhioWageFixture(wages,withholding,ohioFirst),w=reciprocalRequired(core.input.w2s[0]);
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:'OH'});
 const personal=reciprocalRequired(state.sectionData['personal-info']);
 Object.assign(personal,{firstName:'Casey',middleName:'',lastName:'Reciprocal',ssn:'900-70-0611',dateOfBirth:'1990-02-15',stateResidency:'nonresident',addressLine1:'611 Fictional Source Lane',addressLine2:'',city:'Pittsburgh',state:'PA',zip:'15201'});
 const entry:W2EntryData={...structuredClone(completeW2Entry),employerName:w.employer.name,employerEin:w.employer.ein,accountHolder:'primary',sourceTaxYear:'2025',wages,federalWithheld:'0',stateTaxReporting:'multiple',state:ohioFirst?'OH':'PA',stateWages:wages,stateWithheld:ohioFirst?withholding:'0',localWages:'0',localTaxWithheld:'0',localityName:'',stateLocalSources:structuredClone(reciprocalRequired(w.stateLocalSources))};
 const keys=['socialSecurityWages','socialSecurityTips','allocatedTips','socialSecurityWithheld','medicareWages','medicareWithheld','box10DependentCareBenefits','box12CodeW','box12CodeD','box12CodeE','box12CodeF','box12CodeG','box12CodeH','box12CodeS','box12CodeAA','box12CodeBB','box12CodeEE','box12CodeT']as const;
 Object.assign(entry,Object.fromEntries(keys.map(key=>[key,reciprocalRequired(w[key])])));
 state.sectionData['income-w2']={entries:[entry]};
 const context=reciprocalRequired(buildGuidedW2SourceContext(state));entry.stateLocalSources=confirmGuidedW2StateLocalSources(context,0,entry.stateLocalSources);
 const original=TaxYearInputSchema.parse(reciprocalRequired(buildTaxInputFromGuidedData(state))),originalW2=reciprocalRequired(original.w2s[0]);
 const{reciprocalWageSources:_reciprocal,...residencyOriginal}=core.facts;
 const residency:OhioResidencyDraft={...structuredClone(residencyOriginal),taxYear:'2025',originalFederalSources:snapshotGuidedOhioOriginals(original),owners:residencyOriginal.owners.map(owner=>({...structuredClone(owner),stateAdditions:[],stateDeductions:[]}))};
 const payments:OhioPaymentDraft={...structuredClone(core.payments),taxYear:'2025',originalFederalSources:snapshotGuidedOhioOriginals(original),specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'}};
 const baseResidency=buildGuidedOhioResidencyFacts(residency,original),basePayments=buildGuidedOhioPaymentFacts(payments,original);
 const source:OhioReciprocalWageSources={...structuredClone(core.facts.reciprocalWageSources),originalTaxpayer:{firstName:'Casey',lastName:'Reciprocal',ssn:'900-70-0611'},originalW2:structuredClone(originalW2)};
 const draft:EnteredReciprocalDraft={...structuredClone(source),sourceFactsConfirmed:true,w2OriginalsCheckedConfirmed:true,originalFederalSources:snapshotGuidedOhioOriginals(original),originalResidencySources:structuredClone(baseResidency),originalPaymentSources:structuredClone(basePayments)};
 const data:EnteredReciprocalStateData={stateEstimatedPayments:[],additionalStateWithholding:'',ohioResidency:residency,ohioPayments:payments,ohioReciprocalWages:draft};state.sectionData['state-return']=data;
 const canonical:TaxYearInput={...structuredClone(original),ohioResidency:{...structuredClone(baseResidency),reciprocalWageSources:structuredClone(source)},ohioPayments:structuredClone(basePayments)};
 return{state,data,original,canonical,source,draft,residency,payments};
}

/** Independently specified visible native label/value contract, not product field tables. */
export const reciprocalConfirmLabel='Confirm actual Ohio reciprocal wage originals after the last edit';
export function reciprocalNativeFields(f:ReturnType<typeof guidedReciprocalWageFixture>):Array<[string,string]>{
 const d=f.draft,rows:Array<[string,string]>=[['Ohio reciprocal source year','2025'],['Ohio reciprocal source reference',d.sourceReference],['Ohio reciprocal actual owner','primary'],['Ohio reciprocal original first name',d.originalTaxpayer.firstName],['Ohio reciprocal original last name',d.originalTaxpayer.lastName],['Ohio reciprocal original SSN',d.originalTaxpayer.ssn],['Ohio reciprocal selected W2 original','0'],['Ohio reciprocal current W2 originals checked','true'],['All actual reciprocal income originals included','true'],['No other actual income or adjustments','true'],['No special compensation or services','true']];
 const add=(prefix:string,record:Record<string,unknown>,fields:ReadonlyArray<readonly[string,string]>)=>{for(const[key,label]of fields)rows.push([prefix+' '+label,String(record[key])]);};
 add('Reciprocal domicile',d.domicileOriginal,[['sourceId','original ID'],['sourceTaxYear','actual year'],['accountHolder','actual owner'],['name','original name'],['ssn','original SSN'],['from','period begins'],['to','period ends'],['documentDate','document date'],['domicileState','actual state'],['completeYearDomicileConfirmed','complete year reviewed']]);
 add('Reciprocal employer',d.employerEntityOriginal,[['sourceId','original ID'],['sourceTaxYear','actual year'],['employerTin','original TIN'],['employerName','original name'],['entityType','actual entity type'],['from','period begins'],['to','period ends'],['documentDate','document date'],['notPassThroughOrPEOConfirmed','actual corporate employee classification reviewed']]);
 add('Reciprocal services',d.serviceOriginal,[['sourceId','original ID'],['sourceTaxYear','actual year'],['accountHolder','actual owner'],['employerTin','original employer TIN'],['from','period begins'],['to','period ends'],['documentDate','document date'],['allCompensationOrdinaryOhioEmployeeServicesConfirmed','all ordinary Ohio employee services reviewed'],['totalCompensation','actual total compensation']]);
 return rows;
}
export function reciprocalPayrollNativeFields(f:ReturnType<typeof guidedReciprocalWageFixture>,index:number):Array<[string,string]>{
 const row=reciprocalRequired(f.draft.payrollRows[index]),prefix=`Reciprocal payroll ${index+1} `;
 return([['sourceId','original ID'],['sourceReference','original reference'],['accountHolder','actual owner'],['sourceTaxYear','actual year'],['employerTin','original employer TIN'],['servicePeriodFrom','service period begins'],['servicePeriodTo','service period ends'],['paymentDate','actual paid date'],['serviceState','actual service state'],['wages','actual wages'],['ohioWithheld','actual Ohio withheld']]as const).map(([key,label])=>[prefix+label,String(row[key])]);
}
