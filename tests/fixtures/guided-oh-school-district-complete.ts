/** Spec: state/oh-sd-100-guided.yaml. Explicit FICTIONAL records, never inferred missing facts. */
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs';
import {buildTaxInputFromGuidedData,buildGuidedW2SourceContext} from '@/lib/guided-interview-bridge';
import {confirmGuidedW2StateLocalSources} from '@/lib/guided-w2-state-local-facts';
import type {StateReturnData} from '@/lib/guided-interview-flow';
import type {OhioSchoolDistrictFacts} from '@/models/ohio-school-district';
import {schoolDistrictSourcesFixture,schoolDistrictEstimatedFixture} from './oh-school-district-sources';
import {startCompleteInterview,completeW2Entry} from '../guided-interview/complete-facts';
export const sdConfirmLabel='Confirm actual Ohio school district sources after the last edit';
export function required<T>(value:T|undefined|null):T{if(value==null)throw Error('Actual fictional source record is missing');return value;}
export function rawOhioOriginals(input:TaxYearInput){const{ohioResidency:_r,ohioPayments:_p,ohioSchoolDistrict:_s,...raw}=input;return structuredClone(raw);}
export function enteredSchoolDraft(facts:OhioSchoolDistrictFacts){
 const p=facts.payments;
 return {...structuredClone(facts),taxYear:String(facts.taxYear),sourceFactsConfirmed:null as boolean|null,originalFederalSources:undefined as Record<string,unknown>|undefined,
  residence:{...structuredClone(facts.residence),lookup:{...structuredClone(facts.residence.lookup),taxYear:String(facts.residence.lookup.taxYear)}},
  payments:{...structuredClone(p),paymentRows:p.paymentRows.map(row=>({...structuredClone(row),taxYear:String(row.taxYear),original:{...structuredClone(row.original),taxYear:String(row.original.taxYear)}})),
   account:{...structuredClone(p.account),taxYear:String(p.account.taxYear)},
   priorReturn:p.priorReturn.status==='filed_return'?{...structuredClone(p.priorReturn),taxYear:String(p.priorReturn.taxYear)}:structuredClone(p.priorReturn)}};
}
export type EnteredSchoolDraft=ReturnType<typeof enteredSchoolDraft>;
export function attachSchoolDraft(data:StateReturnData,draft:EnteredSchoolDraft|undefined){Reflect.set(data,'ohioSchoolDistrict',draft);}
export function readSchoolDraft(data:StateReturnData):EnteredSchoolDraft{const draft:unknown=Reflect.get(data,'ohioSchoolDistrict');if(!draft||typeof draft!=='object')throw Error('Actual source draft absent');return draft as EnteredSchoolDraft;}
export function guidedSchoolDistrictFixture(mode:'withholding'|'estimates'|'election'='withholding'){
 const actual=mode==='estimates'?schoolDistrictEstimatedFixture():schoolDistrictSourcesFixture();
 if(mode==='election')actual.ohioSchoolDistrict.payments.refundDisposition.outgoingCarryforward='25';
 const w=required(actual.w2s[0]);
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:'OH'});
 Object.assign(required(state.sectionData['personal-info']),{firstName:'Avery',middleName:'',lastName:'School',ssn:'900-70-0302',dateOfBirth:'1990-01-15',stateResidency:'full-year',addressLine1:'302 Fictional District Lane',addressLine2:'',city:'Ashland',state:'OH',zip:'44805'});
 const entry={...completeW2Entry,employerName:w.employer.name,employerEin:w.employer.ein,accountHolder:'primary' as const,sourceTaxYear:'2025',wages:'80000',federalWithheld:'10000',socialSecurityWages:'80000',socialSecurityTips:'0',allocatedTips:'0',socialSecurityWithheld:'4960',medicareWages:'80000',medicareWithheld:'1160',box10DependentCareBenefits:'0',box12CodeW:'0',box12CodeD:'0',box12CodeE:'0',box12CodeF:'0',box12CodeG:'0',box12CodeH:'0',box12CodeS:'0',box12CodeAA:'0',box12CodeBB:'0',box12CodeEE:'0',box12CodeT:'0',stateTaxReporting:'single' as const,state:'OH',stateWages:'80000',stateWithheld:'3000',localWages:'80000',localTaxWithheld:mode==='estimates'?'600':'1100',localityName:required(w.localityName),stateLocalSources:structuredClone(required(w.stateLocalSources))};
 state.sectionData['income-w2']={entries:[entry]};
 const context=required(buildGuidedW2SourceContext(state));entry.stateLocalSources=confirmGuidedW2StateLocalSources(context,0,entry.stateLocalSources);
 const raw=required(buildTaxInputFromGuidedData(state)),original=TaxYearInputSchema.parse(raw);
 // Separately authored fictional Finder/identity records track this NEW fictional source,
 // never a production inference. No tax or refund result supplies these source facts.
 actual.ohioSchoolDistrict.residence.originalAddress=structuredClone(original.taxpayer.address);
 actual.ohioSchoolDistrict.residence.lookup.originalAddress=structuredClone(original.taxpayer.address);
 const data:StateReturnData={stateEstimatedPayments:[],additionalStateWithholding:'',
  ohioResidency:{...structuredClone(actual.ohioResidency),taxYear:'2025',allFederalSourcesIncludedConfirmed:true,noBusinessIncomeConfirmed:true,owners:actual.ohioResidency.owners.map(owner=>({...structuredClone(owner),stateAdditions:[],stateDeductions:[]})),originalFederalSources:rawOhioOriginals(original)},
  ohioPayments:{...structuredClone(actual.ohioPayments),taxYear:'2025',originalFederalSources:rawOhioOriginals(original),specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'}}};
 const facts:OhioSchoolDistrictFacts={...structuredClone(actual.ohioSchoolDistrict),originalFederalSources:rawOhioOriginals(original)};
 const draft=enteredSchoolDraft(facts);draft.sourceFactsConfirmed=true;draft.originalFederalSources=rawOhioOriginals(original);attachSchoolDraft(data,draft);state.sectionData['state-return']=data;
 const canonical=TaxYearInputSchema.parse({...original,ohioResidency:{...actual.ohioResidency,originalFederalSources:rawOhioOriginals(original)},ohioPayments:{...actual.ohioPayments,originalFederalSources:rawOhioOriginals(original)},ohioSchoolDistrict:facts});
 return{state,data,original,canonical,facts,draft};
}
/** Native labels/path/value contract. No provider or JSON payload is entered by the UI. */
export type NativeField=[string,Array<string|number>,string];
const incomeSourceLabels={"ordinaryCompensationOnlyConfirmed": "School income consists only of ordinary wages", "noSelfEmploymentIncomeConfirmed": "Actual school records contain no self-employment income", "allOtherIncomeSourcesCheckedConfirmed": "All actual income sources have been checked", "noSpecialWageAdjustmentsConfirmed": "Actual school wages need no special adjustments"};
const receiptSourceLabels={"sourceId": "record ID", "sourceReference": "source reference", "accountHolder": "account owner", "taxYear": "tax year", "returnType": "tax return type", "kind": "payment type", "date": "payment date", "amount": "payment amount", "accountName": "account holder name", "accountSsn": "account SSN", "confirmationNumber": "confirmation number"};
export function schoolNativeFields(f:ReturnType<typeof guidedSchoolDistrictFixture>):NativeField[]{
 const d=f.draft,p=d.payments,r=d.residence,w=required(d.w2Sources[0]),l=required(w.localRows[0]),o=d.owner.originalTaxpayer;
 return[
 ['School district source year',['taxYear'],'2025'],['School district source reference',['sourceReference'],d.sourceReference],
 ['School source owner',['owner','accountHolder'],'primary'],['School original first name',['owner','originalTaxpayer','firstName'],o.firstName],['School original last name',['owner','originalTaxpayer','lastName'],o.lastName],['School original SSN',['owner','originalTaxpayer','ssn'],o.ssn],['School original birth date',['owner','originalTaxpayer','dateOfBirth'],o.dateOfBirth],
 ['School residence source reference',['residence','sourceReference'],r.sourceReference],
 ...(['street','city','state','zip']as const).map(key=>[`School original address ${key}`,['residence','originalAddress',key],r.originalAddress[key]]as NativeField),
 ['School residence period 1 begins',['residence','periods',0,'from'],'2025-01-01'],['School residence period 1 ends',['residence','periods',0,'through'],'2025-12-31'],['School residence period 1 district code',['residence','periods',0,'districtCode'],'0302'],['School residence period 1 reference',['residence','periods',0,'sourceReference'],required(r.periods[0]).sourceReference],
 ['School Finder record reference',['residence','lookup','sourceReference'],r.lookup.sourceReference],['School Finder record year',['residence','lookup','taxYear'],'2025'],['School Finder lookup date',['residence','lookup','lookupDate'],r.lookup.lookupDate],
 ...(['street','city','state','zip']as const).map(key=>[`School Finder original address ${key}`,['residence','lookup','originalAddress',key],r.lookup.originalAddress[key]]as NativeField),
 ['School Finder district code',['residence','lookup','districtCode'],'0302'],['School Finder district name',['residence','lookup','districtName'],'Hillsdale LSD'],['Actual Finder record matches the stated address and year',['residence','lookup','officialResultMatchedConfirmed'],'true'],
 ['School income source reference',['income','sourceReference'],d.income.sourceReference],
 ...(['ordinaryCompensationOnlyConfirmed','noSelfEmploymentIncomeConfirmed','allOtherIncomeSourcesCheckedConfirmed','noSpecialWageAdjustmentsConfirmed']as const).map(key=>[incomeSourceLabels[key],['income',key],'true']as NativeField),
 ['School W2 source 1 current original',['w2Sources',0,'w2Index'],'0'],['School W2 source 1 reference',['w2Sources',0,'sourceReference'],w.sourceReference],['School W2 source 1 box14 status',['w2Sources',0,'box14SchoolDistrictReporting','status'],'none'],['School W2 source 1 box14 reference',['w2Sources',0,'box14SchoolDistrictReporting','sourceReference'],w.box14SchoolDistrictReporting.sourceReference],
 ['School W2 source 1 local row 1 printed position',['w2Sources',0,'localRows',0,'printedRow'],'1'],['School W2 source 1 local row 1 reference',['w2Sources',0,'localRows',0,'sourceReference'],l.sourceReference],['School W2 source 1 local row 1 classification',['w2Sources',0,'localRows',0,'classification'],'school_district'],['School W2 source 1 local row 1 district code',['w2Sources',0,'localRows',0,'districtCode'],'0302'],
 ['School payment source reference',['payments','sourceReference'],p.sourceReference],['All actual school payments and prior credits are covered',['payments','allCurrentAndPriorPaymentsIncludedConfirmed'],'true'],['School withholding timing method',['payments','withholdingTreatment'],'equal_quarters'],
 ['School account reference',['payments','account','sourceReference'],p.account.sourceReference],['School account holder name',['payments','account','accountName'],p.account.accountName],['School account SSN',['payments','account','accountSsn'],p.account.accountSsn],['School account tax year',['payments','account','taxYear'],'2025'],['School account return type',['payments','account','returnType'],'sd100'],['School account as of date',['payments','account','asOfDate'],p.account.asOfDate],['Actual school account is complete',['payments','account','completeAccountConfirmed'],'true'],['School account estimated payments credited',['payments','account','estimatedPaymentsCredited'],p.account.estimatedPaymentsCredited],['School account prior credit applied',['payments','account','priorCreditApplied'],'0'],
 ['School prior return history',['payments','priorReturn','status'],'no_return'],['School prior return reference',['payments','priorReturn','sourceReference'],p.priorReturn.sourceReference],['School prior credit status',['payments','priorCreditCarryforward','status'],'none'],['School prior credit reference',['payments','priorCreditCarryforward','sourceReference'],p.priorCreditCarryforward.sourceReference],
 ['School remaining tax payment status',['payments','remainingTaxPayment','status'],'no_remaining_tax'],['School remaining tax payment reference',['payments','remainingTaxPayment','sourceReference'],p.remainingTaxPayment.sourceReference],['Actual school remaining payment records checked',['payments','remainingTaxPayment','sourceFactsConfirmed'],'true'],
 ['School current filing timing',['payments','currentTiming','kind'],'expected'],['School current expected filing date',['payments','currentTiming','expectedDate'],'2026-04-15'],['School current timing as of date',['payments','currentTiming','asOfDate'],'2026-04-01'],['School filing extension status',['payments','filingExtension','kind'],'none'],['School payment extension status',['payments','paymentExtension','kind'],'none'],['School current return kind',['payments','returnKind'],'original'],['School current payment method',['payments','specialMethod'],'regular'],['School refund election reference',['payments','refundDisposition','sourceReference'],p.refundDisposition.sourceReference],['School outgoing carryforward election',['payments','refundDisposition','outgoingCarryforward'],p.refundDisposition.outgoingCarryforward],
 ];
}
export function schoolNativeReceiptFields(f:ReturnType<typeof guidedSchoolDistrictFixture>,index:number):NativeField[]{
 const row=required(f.draft.payments.paymentRows[index]),pre=`School receipt ${index+1} `,path=['payments','paymentRows',index];
 return[
  ...(['sourceId','sourceReference','accountHolder','taxYear','returnType','kind','date','amount']as const).map(key=>[pre+receiptSourceLabels[key],[...path,key],String(row[key])]as NativeField),
  [pre+'applied to this return',[...path,'appliedToThisReturnConfirmed'],'true'],
  ...(['accountName','accountSsn','taxYear','returnType','kind','date','amount','confirmationNumber']as const).map(key=>[pre+'original '+receiptSourceLabels[key],[...path,'original',key],String(row.original[key])]as NativeField),
 ];
}
export const schoolPriorNativeFields:NativeField[]=[
 ['School prior return year',['payments','priorReturn','taxYear'],'2024'],['School prior return type',['payments','priorReturn','returnType'],'sd100'],['School prior district code',['payments','priorReturn','districtCode'],'0302'],['School prior account name',['payments','priorReturn','accountName'],'Avery School'],['School prior account SSN',['payments','priorReturn','accountSsn'],'900-70-0302'],['School prior filing status',['payments','priorReturn','filingStatus'],'single'],['School prior period starts',['payments','priorReturn','periodStart'],'2024-01-01'],['School prior period ends',['payments','priorReturn','periodEnd'],'2024-12-31'],['School prior return kind',['payments','priorReturn','returnKind'],'original'],['School prior actual filing date',['payments','priorReturn','filedDate'],'2025-04-15'],['School prior filing extension',['payments','priorReturn','filingExtension','kind'],'none'],['School prior return tax liability (line 8)',['payments','priorReturn','line8'],'0'],['School prior return overpayment (line 19)',['payments','priorReturn','line19'],'0'],['School prior elected credit',['payments','priorReturn','electedCreditCarryforward'],'0'],
];
