/** Spec: state/oh-school-header-same-invocation.yaml. */
import {test,expect,vi}from 'vitest';
import *as federal from '@/engine/federal';
import *as school from '@/engine/state/oh-sd-100-sources';
import {evaluateGuidedRender}from '@/lib/guided-render-evaluation';
import *as bridge from '@/lib/guided-interview-bridge';
import {TaxYearInputSchema}from '@/models/inputs';
import {schoolPyHeaderPacket,schoolPyPaperCases}from '../fixtures/oh-school-district-part-year-official-review';
import {guidedSchoolDistrictFixture,enteredSchoolDraft}from '../fixtures/guided-oh-school-district-complete';
import {confirmGuidedW2StateLocalSources}from '@/lib/guided-w2-state-local-facts';
import {confirmGuidedOhioResidencyFacts}from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts}from '@/lib/guided-ohio-payment-facts';
import {confirmGuidedOhioSchoolDistrictFacts}from '@/lib/guided-ohio-school-district-facts';
import {confirmGuidedOhioReturnHeaderSources}from '@/lib/guided-ohio-return-header-sources';
function required<T,>(v:T|null|undefined):T{if(v==null)throw Error('Actual diagnostic fixture missing');return v;}

function ohio(which:0|1=0){
 const packet=schoolPyHeaderPacket(required(schoolPyPaperCases[which])),state=guidedSchoolDistrictFixture().state,w=required(packet.canonical.w2s[0]),person=packet.original.taxpayer.primary,address=packet.original.taxpayer.address;
 Object.assign(required(state.sectionData['personal-info']),{firstName:person.firstName,lastName:person.lastName,ssn:person.ssn,dateOfBirth:person.dateOfBirth,stateResidency:'part-year',addressLine1:address.street,addressLine2:address.apt??'',city:address.city,state:address.state,zip:address.zip});
 const entry=required(required(state.sectionData['income-w2']).entries[0]);Object.assign(entry,{employerName:w.employer.name,employerEin:w.employer.ein,wages:w.wages,federalWithheld:w.federalWithheld,socialSecurityWages:w.socialSecurityWages,socialSecurityWithheld:w.socialSecurityWithheld,medicareWages:w.medicareWages,medicareWithheld:w.medicareWithheld,stateTaxReporting:'multiple',state:'OH',stateWages:'40000',stateWithheld:'2000',localWages:'40000',localTaxWithheld:w.localTaxWithheld,localityName:w.localityName,stateLocalSources:structuredClone(required(w.stateLocalSources))});
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:''};entry.stateLocalSources=confirmGuidedW2StateLocalSources(required(bridge.buildGuidedW2SourceContext(state)),0,required(entry.stateLocalSources));
 const original=TaxYearInputSchema.parse(required(bridge.buildTaxInputFromGuidedData(state))),actual=packet.canonical;
 const residency=confirmGuidedOhioResidencyFacts(original,{...structuredClone(actual.ohioResidency),taxYear:'2025',sourceFactsConfirmed:null,owners:actual.ohioResidency.owners.map(o=>({...structuredClone(o),stateAdditions:[],stateDeductions:[]}))});
 const payments=confirmGuidedOhioPaymentFacts(original,{...structuredClone(actual.ohioPayments),taxYear:'2025',sourceFactsConfirmed:null,specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'}});
 const school=confirmGuidedOhioSchoolDistrictFacts(original,{...enteredSchoolDraft(actual.ohioSchoolDistrict),partYearWageSources:{...structuredClone(required(actual.ohioSchoolDistrict.partYearWageSources)),payrollOriginals:required(actual.ohioSchoolDistrict.partYearWageSources).payrollOriginals.map(row=>({...structuredClone(row),taxYear:String(row.taxYear)}))}},residency,payments);
 const h=structuredClone(packet.header),header=confirmGuidedOhioReturnHeaderSources(original,{...h,taxYear:'2025',sourceFactsConfirmed:null,originalFederalSources:undefined,originalOhioResidencySources:undefined,originalOhioPaymentSources:undefined,confirmedHeaderSources:undefined,finderOriginal:{...h.finderOriginal,taxYear:'2025'},countyOriginal:{...h.countyOriginal,taxYear:'2025'},officialInventoryOriginal:{...h.officialInventoryOriginal,taxYear:'2025',printedPage:'51'}},residency,payments,school);
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',ohioResidency:residency,ohioPayments:payments,ohioSchoolDistrict:school,ohioReturnHeaderSources:header};return state;
}


for(const which of [0,1]as const)test(`complete current school header replay ${which}`,()=>{
 const state=ohio(which),before=structuredClone(state),f=vi.spyOn(federal,'calculateFederalTax'),sd=vi.spyOn(school,'buildOhioSchoolDistrictSource');
 try{const result=evaluateGuidedRender(state);expect(result.preview.metrics?.state).toMatchObject({stateTax:'811',stateRefund:'1189',schoolDistrict:{tax:'500',refund:which===0?'100':'0'}});expect(state).toEqual(before);expect({federal:f.mock.calls.length,school:sd.mock.calls.length}).toEqual({federal:7,school:2});}finally{vi.restoreAllMocks();}
});
