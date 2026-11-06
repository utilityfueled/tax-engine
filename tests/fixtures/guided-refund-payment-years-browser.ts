/** Spec: spec/federal/guided-refund-payment-years-browser.yaml. Fictional originals only. */
import sources from './guided-tax-refund-payment-years.json' with { type: 'json' };
import { buildSectionRoute, type GuidedFlowState } from '../../apps/web/src/lib/guided-interview-flow';
import { refundHistoryAmounts, refundHistoryExclusions } from '../../apps/web/src/lib/guided-tax-refund-recoveries';
function required<T>(v:T|null|undefined):T{if(v==null)throw Error('Missing literal fictional original');return v;}
export const refundBrowserReplacementReference='REFUND-PAYMENT-BROWSER-PRIVATE-same-cash-replacement';
export function refundPaymentBrowserFixture(){
 const full=JSON.parse(JSON.stringify(sources)) as GuidedFlowState;
 const target=required(full.sectionData['income-unemployment']),statement=required(target.entries?.[0]),basis=required(statement.refundPaymentBasis),collection=required(target.refundRecoveries),year=required(collection.years?.[0]);
 const initial=structuredClone(full);delete initial.sectionData['income-unemployment'];
 const route=buildSectionRoute(initial.segmentation),index=route.findIndex(section=>section.id==='income-unemployment');if(index<0)throw Error('Actual native section missing');
 initial.phase='interview';initial.currentSectionIndex=index;initial.completedSections=route.slice(0,index).map(section=>section.id);
 if(initial.sectionData['income-unemployment']!==undefined)throw Error('Setup must omit all target originals');
 if(collection.originalSources!==undefined||collection.originalDraft!==undefined)throw Error('Fixture answers must not contain captured results');
 return{initial,statement,basis,collection,year};
}
/** All answers are typed after the sole unrelated setup; none is injected into browser state. */
export function refundStatementAnswers():ReadonlyArray<readonly[string,string]>{
 const {statement:s}=refundPaymentBrowserFixture();return [
 ['Actual government payer',required(s.payer)],['Government payer TIN',required(s.payerTin)],['Government statement reference (local label or last four account digits)',required(s.accountReference)],['Government statement calendar year','2025'],['Actual Form 1099-G revision','2024-03'],['Actual government-payment recipient','primary'],['Last four digits of the government-payment recipient ID','3333'],['Actual payment program','other-government'],['Do these payments actually belong to this recipient?','true'],
 ['Unemployment compensation (1099-G Box 1)','0'],['Federal tax withheld (1099-G Box 4)','0'],['State or local tax refund, credit or offset (Box 2)','400'],['RTAA payments (Box 5)','0'],['Taxable grants (Box 6)','0'],['Agriculture payments (Box 7)','0'],['Market gain (Box 9)','0'],["Actual repayment this year of this year's unemployment benefits",'0'],['Actual repayment this year of earlier-year benefits','0'],['Actual unrecovered nondeductible program contributions before these benefits','0'],['Actual tax year of the Box 2 refund, when any','2024'],['Is Box 8 checked for a trade or business refund?','false'],['Government source state reporting','none'],['Is another government-payment taxability or repayment worksheet still needed?','false'],
 ];
}
export function refundHistoryAnswers():ReadonlyArray<readonly[string,string]>{
 const{year:y}=refundPaymentBrowserFixture();return[
 ['Actual historical deduction year','2024'],['Historical return original reference',required(y.sourceReference)],['Historical return filing status','single'],['Historical primary taxpayer SSN',required(y.priorYearPrimarySsn)],['Historical return itemized deductions','true'],['Historical state tax election','income'],
 ...refundHistoryAmounts.map(([key,label])=>[label,required(y[key])]as const),...refundHistoryExclusions.map(([,label])=>[label,'false']as const),
 ];
}
const markers=new Set<string>([refundBrowserReplacementReference,'originalSources','originalDraft','refundPaymentBasis']);
function originalMarkers(value:unknown):void{
 if(Array.isArray(value)){value.forEach(originalMarkers);return;}
 if(value===null||typeof value!=='object')return;
 for(const[key,item]of Object.entries(value)){
  if(typeof item==='string'&&item.length&&['sourceReference','accountReference','ssn','priorYearPrimarySsn','employerEin','payerTin','addressLine1'].includes(key)){
   markers.add(item);if(/\d{2,3}-\d{2,7}(?:-\d{4})?/u.test(item))markers.add(item.replace(/\D/gu,''));
  }else originalMarkers(item);
 }
}
originalMarkers(sources);
export const refundPaymentBrowserPrivateMarkers=Object.freeze([...markers]);
export function refundPaymentBrowserContainsPrivate(value:string):boolean{
 const surfaces=[value];try{surfaces.push(decodeURIComponent(value));}catch{/* Literal surface remains checked. */}
 return surfaces.some(surface=>refundPaymentBrowserPrivateMarkers.some(marker=>surface.includes(marker)));
}
