/** Spec: state/oh-school-display-replay.yaml. */
import {test,expect,vi}from 'vitest';
import *as federal from '@/engine/federal';
import *as school from '@/engine/state/oh-sd-100-sources';
import {renderToStaticMarkup}from 'react-dom/server';
import {matchesGuidedOhioSchoolDisplayObservation}from '@/lib/guided-interview-flow';
import *as schoolFacts from '@/lib/guided-ohio-school-district-facts';
import {schoolDistrictDisplayConfirmed,OhioSchoolDistrictDetails}from '@/components/guided-interview/ohio-school-district-details';
import {emptyOhioReturnHeaderDraft}from '@/lib/guided-ohio-return-header-sources';
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

test.each([0,1]as const)('current school display reuses only completed same-render validation %s',(which)=>{
 const state=ohio(which),data=required(state.sectionData['state-return']);data.ohioReturnHeaderSources=emptyOhioReturnHeaderDraft();
 const before=structuredClone(state),f=vi.spyOn(federal,'calculateFederalTax'),sd=vi.spyOn(school,'buildOhioSchoolDistrictSource');
 try{
  const result=evaluateGuidedRender(state);
  expect({federal:f.mock.calls.length,school:sd.mock.calls.length}).toEqual({federal:4,school:1});
  expect(Object.getOwnPropertyDescriptor(result,'schoolDisplayObservation')).toMatchObject({enumerable:false,writable:false,configurable:false});
  expect(Reflect.get({...result},'schoolDisplayObservation')).toBeUndefined();
  expect(Reflect.get(structuredClone(result),'schoolDisplayObservation')).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain('schoolDisplayObservation');
  const props={originalInput:result.originalInput,data:data.ohioSchoolDistrict,ohioResidency:data.ohioResidency,ohioPayments:data.ohioPayments,taxYear:2025,onChange:()=>{},schoolDisplayObservation:Reflect.get(result,'schoolDisplayObservation')};
  vi.spyOn(Math,'random').mockReturnValue(0.125);
  const current=renderToStaticMarkup(<OhioSchoolDistrictDetails {...props}/>);
  expect(current).toContain('Actual school district sources explicitly confirmed.');
  expect({federal:f.mock.calls.length,school:sd.mock.calls.length}).toEqual({federal:4,school:1});
  const standalone=renderToStaticMarkup(<OhioSchoolDistrictDetails {...{...props,schoolDisplayObservation:undefined}}/>);
  expect(standalone).toBe(current);
  expect({federal:f.mock.calls.length,school:sd.mock.calls.length}).toEqual({federal:7,school:2});
  expect(state).toEqual(before);
 }finally{vi.restoreAllMocks();}
});

function displayFixture(which:0|1){const state=ohio(which),data=required(state.sectionData['state-return']);data.ohioReturnHeaderSources=emptyOhioReturnHeaderDraft();const evaluation=evaluateGuidedRender(state);return{state,data,evaluation,observation:evaluation.schoolDisplayObservation};}
test.each([0,1]as const)('foreign forged or mutated school display observations fall back %s',(which)=>{
 const cases=['missing','plain-forged','method-forged','prototype-forged','serialized','foreign-render','cloned-input','cloned-school','mutated-input','nested-input-replacement','mutated-school','mutated-residency','mutated-payments','metadata-change','accessor-change']as const;
 for(const variant of cases){
  const {data,evaluation,observation,state}=displayFixture(which);let input=evaluation.originalInput,schoolData=data.ohioSchoolDistrict,observed:unknown=observation;const residency=data.ohioResidency,payments=data.ohioPayments;
  expect(matchesGuidedOhioSchoolDisplayObservation(observed,input,schoolData,residency,payments)).toBe(true);
  if(variant==='missing')observed=undefined;
  if(variant==='plain-forged')observed={confirmed:true};
  if(variant==='method-forged')observed={matches:()=>true};
  if(variant==='prototype-forged')observed=Object.create(Object.getPrototypeOf(required(observation)));
  if(variant==='serialized')observed=JSON.parse(JSON.stringify(observation));
  if(variant==='foreign-render')observed=evaluateGuidedRender(state).schoolDisplayObservation;
  if(variant==='cloned-input')input=structuredClone(input);
  if(variant==='cloned-school')schoolData=structuredClone(schoolData);
  if(variant==='mutated-input')required(required(input).w2s[0]).wages='40001';
  if(variant==='nested-input-replacement')required(input).taxpayer=structuredClone(required(input).taxpayer);
  if(variant==='mutated-school')required(schoolData).sourceReference+='-edited';
  if(variant==='mutated-residency')required(residency).sourceReference+='-edited';
  if(variant==='mutated-payments')required(payments).sourceReference+='-edited';
  if(variant==='metadata-change')Object.defineProperty(required(schoolData),'extra',{value:0});
  let getterCalls=0;
  if(variant==='accessor-change')Object.defineProperty(required(schoolData),'extra',{get(){getterCalls++;return 0;}});
  expect(matchesGuidedOhioSchoolDisplayObservation(observed,input,schoolData,residency,payments),variant).toBe(false);
  expect(getterCalls).toBe(0);
  const full=vi.spyOn(schoolFacts,'buildGuidedOhioSchoolDistrictFacts');
  try{
   const current=schoolDistrictDisplayConfirmed(input,schoolData,residency,payments,observed);
   expect(full.mock.calls.length,variant).toBe(1);
   const standalone=schoolDistrictDisplayConfirmed(input,schoolData,residency,payments);
   expect(current,variant).toBe(standalone);
  }finally{full.mockRestore();}
 }
});
test.each([0,1]as const)('school display cannot retain unknown or stale source success %s',(which)=>{
 for(const variant of ['unknown-confirmation','unknown-payment','stale-federal']as const){
  const {state,data,evaluation,observation}=displayFixture(which),schoolData=required(data.ohioSchoolDistrict);
  if(variant==='unknown-confirmation')schoolData.sourceFactsConfirmed=null;
  if(variant==='unknown-payment')schoolData.payments.account.estimatedPaymentsCredited='';
  if(variant==='stale-federal')schoolData.originalFederalSources={...required(schoolData.originalFederalSources),changed:true};
  const next=evaluateGuidedRender(state);
  expect(next.schoolDisplayObservation).toBeUndefined();
  expect(matchesGuidedOhioSchoolDisplayObservation(observation,next.originalInput,schoolData,data.ohioResidency,data.ohioPayments)).toBe(false);
  expect(schoolDistrictDisplayConfirmed(next.originalInput,schoolData,data.ohioResidency,data.ohioPayments,observation)).toBe(false);
  expect(schoolDistrictDisplayConfirmed(evaluation.originalInput,schoolData,data.ohioResidency,data.ohioPayments,observation)).toBe(false);
 }
 const {data,evaluation,observation}=displayFixture(which);
 expect(required(data.ohioSchoolDistrict).payments.account.priorCreditApplied).toBe('0');
 expect(schoolDistrictDisplayConfirmed(evaluation.originalInput,data.ohioSchoolDistrict,data.ohioResidency,data.ohioPayments,observation)).toBe(true);
 const Constructor=Reflect.get(required(observation),'constructor');
 expect(Object.isFrozen(Constructor)).toBe(true);
 expect(Object.isFrozen(Constructor.prototype)).toBe(true);
 expect(Reflect.set(Constructor,'matches',()=>true)).toBe(false);
 expect(()=>Reflect.construct(Constructor,[Symbol('forged'),{}])).toThrow('Actual current display observation required');
});

test.each([0,1]as const)('unsupported actual school accessors keep original read behavior %s',(which)=>{
 for(const variant of ['school-slot','confirmation']as const){
  const {state,data}=displayFixture(which),schoolData=required(data.ohioSchoolDistrict);let reads=0;
  if(variant==='school-slot')Object.defineProperty(data,'ohioSchoolDistrict',{enumerable:true,configurable:true,get(){reads++;return schoolData;}});
  else Object.defineProperty(schoolData,'sourceFactsConfirmed',{enumerable:true,configurable:true,get(){reads++;return true;}});
  const result=evaluateGuidedRender(state);
  expect(reads).toBe(1);
  expect(result.schoolDisplayObservation).toBeUndefined();
  expect(result.preview.metrics?.state).toBeNull();
 }
});
