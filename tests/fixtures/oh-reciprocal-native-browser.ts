/** Spec: spec/state/oh-reciprocal-native-browser.yaml. Independent literal originals; no tax-product monetary oracle. */
import {guidedReciprocalWageFixture} from './guided-oh-reciprocal-wages-complete';
export function requiredReciprocalBrowser<T>(value:T|null|undefined):T{if(value===undefined||value===null)throw Error('Actual fictional reciprocal browser source required');return value;}
export const reciprocalBrowserCases=[
 {id:'refund',wages:'60000.25',withholding:'2000.60',ohioFirst:false,lastWage:'5000.03',monthlyWh:'166.72',lastWh:'166.68',reportedWages:'60000',reportedWithholding:'2001',incomeDisplay:'$60,000',paymentDisplay:'$2,001',resultLabel:'State Refund',resultDisplay:'$2,001'},
 {id:'known-zero',wages:'60000.50',withholding:'0.00',ohioFirst:true,lastWage:'5000.28',monthlyWh:'0.00',lastWh:'0.00',reportedWages:'60001',reportedWithholding:'0',incomeDisplay:'$60,001',paymentDisplay:'$0',resultLabel:'State Result',resultDisplay:'—'},
]as const;
export type ReciprocalBrowserCase=typeof reciprocalBrowserCases[number];
export const reciprocalBrowserConfirm='Confirm actual Ohio reciprocal wage originals after the last edit';
export const reciprocalBrowserReference='PRIVATE-RECIP-BROWSER-2025';
export const reciprocalBrowserOriginalId='PRIVATE-RECIP-BROWSER-PAYROLL-01';
export const reciprocalBrowserRevisedId='PRIVATE-RECIP-BROWSER-PAYROLL-01-REPLACEMENT';
// Actual 2025 calendar, independently supplied before any candidate output.
const periods=[['2025-01-01','2025-01-31'],['2025-02-01','2025-02-28'],['2025-03-01','2025-03-31'],['2025-04-01','2025-04-30'],['2025-05-01','2025-05-31'],['2025-06-01','2025-06-30'],['2025-07-01','2025-07-31'],['2025-08-01','2025-08-31'],['2025-09-01','2025-09-30'],['2025-10-01','2025-10-31'],['2025-11-01','2025-11-30'],['2025-12-01','2025-12-31']]as const;
export function reciprocalNativeBrowserFixture(c:ReciprocalBrowserCase){
 // This established complete fixture supplies only unrelated current federal/W2,
 // domicile/allocation and IT account originals. Its reciprocal proof is discarded.
 const f=guidedReciprocalWageFixture(c.wages,c.withholding,c.ohioFirst),state=structuredClone(f.state),data=requiredReciprocalBrowser(state.sectionData['state-return']);delete data.ohioReciprocalWages;
 const originals={
  sourceTaxYear:2025,sourceReference:reciprocalBrowserReference,accountHolder:'primary',originalTaxpayer:{firstName:'Casey',lastName:'Reciprocal',ssn:'900-70-0611'},
  domicileOriginal:{sourceId:'PRIVATE-RECIP-BROWSER-DOMICILE',sourceTaxYear:2025,accountHolder:'primary',name:'Casey Reciprocal',ssn:'900-70-0611',domicileState:'PA',from:'2025-01-01',to:'2025-12-31',documentDate:'2026-01-15',completeYearDomicileConfirmed:true},
  employerEntityOriginal:{sourceId:'PRIVATE-RECIP-BROWSER-EMPLOYER',sourceTaxYear:2025,employerTin:'90-7000611',employerName:'Fictional Ordinary Employer Corporation',entityType:'c_corporation',from:'2025-01-01',to:'2025-12-31',documentDate:'2026-01-15',notPassThroughOrPEOConfirmed:true},
  serviceOriginal:{sourceId:'PRIVATE-RECIP-BROWSER-SERVICES',sourceTaxYear:2025,accountHolder:'primary',employerTin:'90-7000611',from:'2025-01-01',to:'2025-12-31',documentDate:'2026-01-15',allCompensationOrdinaryOhioEmployeeServicesConfirmed:true,totalCompensation:c.wages},
  payrollRows:periods.map(([from,to],i)=>({sourceId:`PRIVATE-RECIP-BROWSER-PAYROLL-${String(i+1).padStart(2,'0')}`,sourceReference:`PRIVATE-RECIP-BROWSER-STUB-${String(i+1).padStart(2,'0')}`,accountHolder:'primary',sourceTaxYear:2025,employerTin:'90-7000611',servicePeriodFrom:from,servicePeriodTo:to,paymentDate:to,serviceState:'OH',wages:i===11?c.lastWage:'5000.02',ohioWithheld:i===11?c.lastWh:c.monthlyWh})),
 };
 return{state,originals,input:f.original,originalW2:requiredReciprocalBrowser(f.original.w2s[0]),unrelatedResidency:structuredClone(f.residency),unrelatedPayments:structuredClone(f.payments),capturedResidency:structuredClone(f.draft.originalResidencySources),capturedPayments:structuredClone(f.draft.originalPaymentSources)};
}
export function reciprocalBrowserDocumentFields(c:ReciprocalBrowserCase):Array<[string,string]>{return[
 ['Ohio reciprocal source year','2025'],['Ohio reciprocal source reference',reciprocalBrowserReference],['Ohio reciprocal actual owner','primary'],['Ohio reciprocal original first name','Casey'],['Ohio reciprocal original last name','Reciprocal'],['Ohio reciprocal original SSN','900-70-0611'],
 ['All actual reciprocal income originals included','true'],['No other actual income or adjustments','true'],['No special compensation or services','true'],
 ['Reciprocal domicile original ID','PRIVATE-RECIP-BROWSER-DOMICILE'],['Reciprocal domicile actual year','2025'],['Reciprocal domicile actual owner','primary'],['Reciprocal domicile original name','Casey Reciprocal'],['Reciprocal domicile original SSN','900-70-0611'],['Reciprocal domicile actual state','PA'],['Reciprocal domicile period begins','2025-01-01'],['Reciprocal domicile period ends','2025-12-31'],['Reciprocal domicile document date','2026-01-15'],['Reciprocal domicile complete year reviewed','true'],
 ['Reciprocal employer original ID','PRIVATE-RECIP-BROWSER-EMPLOYER'],['Reciprocal employer actual year','2025'],['Reciprocal employer original TIN','90-7000611'],['Reciprocal employer original name','Fictional Ordinary Employer Corporation'],['Reciprocal employer actual entity type','c_corporation'],['Reciprocal employer period begins','2025-01-01'],['Reciprocal employer period ends','2025-12-31'],['Reciprocal employer document date','2026-01-15'],['Reciprocal employer actual corporate employee classification reviewed','true'],
 ['Reciprocal services original ID','PRIVATE-RECIP-BROWSER-SERVICES'],['Reciprocal services actual year','2025'],['Reciprocal services actual owner','primary'],['Reciprocal services original employer TIN','90-7000611'],['Reciprocal services period begins','2025-01-01'],['Reciprocal services period ends','2025-12-31'],['Reciprocal services document date','2026-01-15'],['Reciprocal services actual total compensation',c.wages],['Reciprocal services all ordinary Ohio employee services reviewed','true'],
 ];}
export function reciprocalBrowserPayrollFields(c:ReciprocalBrowserCase,index:number):Array<[string,string]>{
 const[from,to]=requiredReciprocalBrowser(periods[index]),n=String(index+1).padStart(2,'0'),prefix=`Reciprocal payroll ${index+1} `;
 return([['original ID',`PRIVATE-RECIP-BROWSER-PAYROLL-${n}`],['original reference',`PRIVATE-RECIP-BROWSER-STUB-${n}`],['actual owner','primary'],['actual year','2025'],['original employer TIN','90-7000611'],['service period begins',from],['service period ends',to],['actual paid date',to],['actual service state','OH'],['actual wages',index===11?c.lastWage:'5000.02'],['actual Ohio withheld',index===11?c.lastWh:c.monthlyWh]]as Array<[string,string]>).map(([label,value])=>[prefix+label,value]);
}
