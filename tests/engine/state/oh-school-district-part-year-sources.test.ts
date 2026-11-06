// @vitest-environment jsdom
/** Spec: state/oh-school-district-part-year-sources.yaml.
 * Source literals frozen independently before candidate products or output.
 */
import {describe,it,expect} from 'vitest';
import {mkdtemp,readdir,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fillOhioSchoolDistrictOfficialReview} from '@/pdf/mappings/2025/fill-oh-school-district-official-review.js';
import {prepareOhioResidencyReview} from '@/engine/state/oh-residency-source.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import React,{useState} from 'react';
import * as schoolNative from '@/lib/guided-ohio-school-district-facts';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts} from '@/lib/guided-ohio-payment-facts';
import {OhioSchoolDistrictDetails} from '@/components/guided-interview/ohio-school-district-details';
import {mountGuidedPanel} from '../../apps/web/guided-panel-dom';
import {enteredSchoolDraft} from '../../fixtures/guided-oh-school-district-complete';

import Decimal from 'decimal.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateW2StateLocalSources} from '@/engine/forms/w2-state-local.js';
import {calculateOhioSD100} from '@/engine/state/oh-sd-100.js';
import {calculateOhioSDResidentIncome} from '@/engine/state/oh-sd-100-resident-income.js';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter.js';
import {calculateOhioResidentReturn} from '@/engine/state/oh-return.js';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {schoolDistrictSourcesFixture,schoolW2,addSchoolMunicipalRow} from '../../fixtures/oh-school-district-sources.js';
import {schoolDistrictPartYearFixture,rawPartYearSchoolOriginals,bindPartYearSchoolFixture,partYearSchoolExpected as expected,type PartYearSchoolInput} from '../../fixtures/oh-school-district-part-year-sources.js';

function canonical(input:PartYearSchoolInput){return calculateOhioResidentReturn(buildOhioResidentReturnInput(input,calculateFederalTax(input)));}
function required<T>(value:T|undefined|null):T{if(value==null)throw Error('Actual fictional source is missing');return value;}
function payroll(input:PartYearSchoolInput,index:number){return required(input.ohioSchoolDistrict.partYearWageSources.payrollOriginals[index]);}
function period(input:PartYearSchoolInput,index:number){return required(input.ohioSchoolDistrict.residence.periods[index]);}
function noMutation(input:PartYearSchoolInput){const before=structuredClone(input);const invoke=()=>canonical(input);expect(invoke).not.toThrow(TypeError);expect(invoke).toThrow();expect(input).toEqual(before);}

describe('OH PY SD independent source precondition',()=>{
 it('OH PY SD originals and existing resident worksheet independently reconcile',()=>{
  const input=schoolDistrictPartYearFixture(),before=structuredClone(input);
  const original=TaxYearInputSchema.parse(rawPartYearSchoolOriginals(input));
  const w2=schoolW2(input),source=required(w2.stateLocalSources),checked=calculateW2StateLocalSources(original,0,source);
  expect(calculateFederalTax(original).agi.toString()).toBe('60000');
  expect(checked.stateRows.map(row=>[row.state,row.withheld.toString()])).toEqual([['OH','2000'],['VA','0']]);
  expect(checked.localRows.map(row=>row.withheld.toString())).toEqual(['600']);
  expect(new Decimal(payroll(input,0).grossWages).plus(payroll(input,1).grossWages).toString()).toBe('60000');
  expect(new Decimal(payroll(input,0).federalWithheld).plus(payroll(input,1).federalWithheld).toString()).toBe('6000');
  expect(payroll(input,1).serviceState).toBe('VA');expect(payroll(input,1).noOhioServicesOutsideOhioConfirmed).toBe(true);
  const resident=calculateOhioSDResidentIncome({taxYear:2025,districtCode:'0302',filingStatus:'single',annualMAGI:'60000',
   residency:[{owner:'primary',periods:input.ohioSchoolDistrict.residence.periods.map(({from,through,districtCode})=>({from,through,districtCode}))}],
   wages:{owner:'primary',method:'specific',residentAmount:'40000',annual:{status:'known',amount:'60000'}},
   selfEmployment:{owner:'primary',method:'specific',residentAmount:'0',annual:{status:'known',amount:'0'}},magiComponents:[]});
  expect([resident.residentDays,resident.residencyFactor.toFixed(4)]).toEqual([212,'0.5808']);
  expect([resident.line29,resident.line30,resident.line31,resident.line32,resident.line33].map(v=>v.toString())).toEqual(['40000','0','40000','40000','40000']);
  expect(new Decimal('40000').times('0.0125').toString()).toBe('500');
  expect(input).toEqual(before);
 });
});

describe('OH PY SD existing API source method',()=>{
 it('OH PY SD canonical schema retains all actual part-year originals',()=>{
  const input=schoolDistrictPartYearFixture();expect(TaxYearInputSchema.parse(input).ohioSchoolDistrict).toEqual(input.ohioSchoolDistrict);
 });
 it('OH PY SD canonical uses actual dated wages without day proration',()=>{
  const input=schoolDistrictPartYearFixture(),before=structuredClone(input),result=canonical(input),source=required(result.schoolDistrictSource);
  expect([source.residentIncome.line29,source.residentIncome.line30,source.residentIncome.line31,source.residentIncome.line32,source.residentIncome.line33].map(v=>v.toString())).toEqual(['40000','0','40000','40000','40000']);
  expect(source.residentIncome.residentDays).toBe(212);expect(source.residentIncome.residencyFactor.toFixed(4)).toBe('0.5808');
  expect(source.residentIncome.line29.toString()).not.toBe(new Decimal('60000').times('0.5808').toDecimalPlaces(0).toString());
  expect([result.it1040.line4_exemptions,result.it1040.line7_taxableNonbusinessIncome,result.it1040.line8c_totalTax,required(result.nonresidentCreditResult).line20,result.it1040.line10_taxAfterCredits,result.it1040.line26_refund].map(v=>v.toString())).toEqual(['2150','57850','1217','406','811','1189']);
  expect(result.itsd2210?.line17_totalPenalty.toString()).toBe('0');expect(input).toEqual(before);
 });
 it('OH PY SD keeps Ohio and district cash separate',()=>{
  const result=canonical(schoolDistrictPartYearFixture()),sd=required(result.sd100);
  expect(result.it1040.line14_ohioWithholding.toString()).toBe('2000');
  expect([sd.line3_magi,sd.line7_earnedIncomeTax,sd.line8_totalTaxAfterCredits,sd.line9_underpaymentPenalty,sd.line10_totalLiability,sd.line11_sdWithholding,sd.line12_estimatedPayments,sd.line19_overpayment,sd.line20_creditCarryforward,sd.line21_refund].map(v=>v.toString())).toEqual(['60000','500','500','0','500','600','0','100','0','100']);
  expect(required(result.schoolDistrictSource).sdWithholding.toString()).toBe(expected.schoolWithholding);
 });
 it('OH PY SD retains a known exactly-covered zero balance',()=>{
  const result=canonical(schoolDistrictPartYearFixture('500')),sd=required(result.sd100);
  expect([sd.line11_sdWithholding,sd.line16_taxDue,sd.line19_overpayment,sd.line21_refund].map(v=>v.toString())).toEqual(['500','0','0','0']);
 });
 it('OH PY SD accepts actual payroll original order independently of dates',()=>{
  const input=schoolDistrictPartYearFixture();input.ohioSchoolDistrict.partYearWageSources.payrollOriginals.reverse();bindPartYearSchoolFixture(input);
  expect(required(canonical(input).sd100).line21_refund.toString()).toBe('100');
 });
 it('OH PY SD replays current original JSON without recapturing facts',()=>{
  const initial=schoolDistrictPartYearFixture(),input:PartYearSchoolInput=JSON.parse(JSON.stringify(initial)),before=JSON.stringify(input);
  expect(required(canonical(input).sd100).line21_refund.toString()).toBe('100');expect(JSON.stringify(input)).toBe(before);expect(input).toEqual(initial);
 });
 it('OH PY SD preserves the old full-year original source method',()=>{
  const old=schoolDistrictSourcesFixture(),before=structuredClone(old),result=calculateOhioResidentReturn(buildOhioResidentReturnInput(old,calculateFederalTax(old)));
  expect([required(result.sd100).line8_totalTaxAfterCredits,required(result.sd100).line21_refund].map(v=>v.toString())).toEqual(['1000','100']);expect(old).toEqual(before);
 });
});

type Mutation=(input:PartYearSchoolInput)=>void;
const denied:Array<[string,Mutation]>=[
 ['missing distinct payroll packet',i=>{Reflect.deleteProperty(i.ohioSchoolDistrict,'partYearWageSources');}],
 ['unknown complete payroll confirmation',i=>{i.ohioSchoolDistrict.partYearWageSources.allOriginalPayrollIncludedConfirmed=false;}],
 ['unsupported allocation method',i=>{Reflect.set(i.ohioSchoolDistrict.partYearWageSources,'method','prorated');}],
 ['missing current payroll record',i=>{i.ohioSchoolDistrict.partYearWageSources.payrollOriginals.pop();}],
 ['duplicate actual payroll ID',i=>{payroll(i,1).payrollId=payroll(i,0).payrollId;}],
 ['wrong source owner SSN',i=>{payroll(i,1).originalTaxpayer.ssn='900-74-9999';}],
 ['wrong actual employer EIN',i=>{payroll(i,1).employer.ein='91-7400999';}],
 ['wrong source year',i=>{payroll(i,1).taxYear=2024;}],
 ['wrong indexed W2',i=>{payroll(i,1).w2Index=1;}],
 ['unknown VA Ohio-service answer',i=>{Reflect.deleteProperty(payroll(i,1),'noOhioServicesOutsideOhioConfirmed');}],
 ['actual OH services while VA resident',i=>{payroll(i,1).noOhioServicesOutsideOhioConfirmed=false;}],
 ['service state contradicts actual home interval',i=>{payroll(i,1).serviceState='OH';}],
 ['services cross actual move',i=>{payroll(i,1).serviceFrom='2025-07-31';}],
 ['future services after payment',i=>{payroll(i,0).serviceThrough='2025-07-01';}],
 ['invalid actual paid date',i=>{payroll(i,1).paidOn='2025-02-30';}],
 ['paid outside source year',i=>{payroll(i,1).paidOn='2026-01-01';}],
 ['equal-cash payment crosses resident boundary',i=>{payroll(i,0).paidOn='2025-08-01';}],
 ['unknown actual gross',i=>{payroll(i,0).grossWages='';}],
 ['overprecision actual gross',i=>{payroll(i,0).grossWages='40000.001';}],
 ['negative actual gross',i=>{payroll(i,0).grossWages='-40000';}],
 ['current original annual wages mismatch',i=>{payroll(i,0).grossWages='39999';}],
 ['current original federal cash mismatch',i=>{payroll(i,0).federalWithheld='4001';}],
 ['district cash replaced with Ohio cash',i=>{const r=payroll(i,0).schoolReporting;if(r.status==='reported')r.withheld='2000';}],
 ['missing actual district reporting',i=>{payroll(i,0).schoolReporting={status:'none'};}],
 ['lookup bound to mailing not actual OH home',i=>{i.ohioSchoolDistrict.residence.lookup.originalAddress=structuredClone(i.taxpayer.address);}],
 ['wrong actual lookup year',i=>{i.ohioSchoolDistrict.residence.lookup.taxYear=2024;}],
 ['unknown actual lookup confirmation',i=>{Reflect.set(i.ohioSchoolDistrict.residence.lookup,'officialResultMatchedConfirmed',false);}],
 ['district calendar gap',i=>{period(i,1).from='2025-08-02';}],
 ['district calendar overlap',i=>{period(i,1).from='2025-07-31';}],
 ['outside Ohio given taxing Ohio district',i=>{period(i,1).districtCode='0302';}],
 ['physical home calendar contradicts parent',i=>{required(i.ohioSchoolDistrict.partYearWageSources.residenceOriginals[1]).from='2025-08-02';}],
 ['physical home state contradicts original',i=>{required(i.ohioSchoolDistrict.partYearWageSources.residenceOriginals[1]).domicileState='OH';}],
 ['parent resident wages differ despite equal annual gross',i=>{required(required(i.ohioResidency.owners[0]).amounts).wages.residentAmount='39999';}],
 ['parent nonresident Ohio wages not known none',i=>{required(required(i.ohioResidency.owners[0]).amounts).wages.nonresidentOhioAmount='1';}],
 ['full-year status cannot inherit PY payroll method',i=>{required(i.ohioResidency.owners[0]).status='full_year_resident';}],
 ['unsupported actual tax year',i=>{i.taxpayer.taxYear=2026;i.ohioSchoolDistrict.taxYear=2026;}],
];
describe('OH PY SD source guard controls',()=>{
 it.each(denied)('OH PY SD rejects changed or unsupported actual source %s',(_label,change)=>{
  const input=schoolDistrictPartYearFixture();change(input);bindPartYearSchoolFixture(input);noMutation(input);
 });
 it('OH PY SD rejects stale private current identity without recapturing originals',()=>{
  const input=schoolDistrictPartYearFixture();input.taxpayer.primary.ssn='900-74-0999';noMutation(input);
 });
 it('OH PY SD rejects stale current W2 with equal money',()=>{
  const input=schoolDistrictPartYearFixture();schoolW2(input).employer.name='FICTIONAL NEW SAME-CASH EMPLOYER';noMutation(input);
 });
 it('OH PY SD rejects stale parent original commitment without recapturing it',()=>{
  const input=schoolDistrictPartYearFixture();Reflect.set(input.ohioSchoolDistrict.originalFederalSources,'oldSource','changed');noMutation(input);
 });
});

function residentMagiCalculation(){
 const input=schoolDistrictPartYearFixture();
 const sources={taxYear:2025,districtCode:'0302',filingStatus:'single' as const,annualMAGI:'60000',
  residency:[{owner:'primary' as const,periods:input.ohioSchoolDistrict.residence.periods.map(({from,through,districtCode})=>({from,through,districtCode}))}],
  wages:{owner:'primary' as const,method:'specific' as const,residentAmount:'40000',annual:{status:'known' as const,amount:'60000'}},
  selfEmployment:{owner:'primary' as const,method:'specific' as const,residentAmount:'0',annual:{status:'known' as const,amount:'0'}},magiComponents:[]};
 return{taxYear:2025,ohioAgi:'60000',businessIncomeDeduction:'0',exemptionAmount:'2150',isSenior:false,
  districts:[{districtNumber:'0302',taxType:'earned_income' as const,rate:'0.0125',residencyFactor:'0.5808',wages:'40000',netSelfEmployment:'0',residentIncomeSources:sources}],sdWithholding:'600'};
}
describe('OH PY SD specific resident MAGI calculator boundary',()=>{
 it('OH PY SD calculator replays specific resident MAGI with the actual calendar factor',()=>{
  const input=residentMagiCalculation(),before=structuredClone(input),result=calculateOhioSD100(input);
  expect([result.line3_magi,result.line7_earnedIncomeTax,result.line21_refund].map(v=>v.toString())).toEqual(['60000','500','100']);
  expect(result.districtDetails[0]?.residencyFactor.toFixed(4)).toBe('0.5808');expect(input).toEqual(before);
 });
 it.each(['annualMAGI','district','year','factor','wages','selfEmployment','prorated'] as const)('OH PY SD calculator rejects conflicting replay %s',kind=>{
  const input=residentMagiCalculation(),d=required(input.districts[0]),s=d.residentIncomeSources;
  if(kind==='annualMAGI')s.annualMAGI='59999';
  if(kind==='district')s.districtCode='0001';
  if(kind==='year')s.taxYear=2026;
  if(kind==='factor')d.residencyFactor='1';
  if(kind==='wages')d.wages='39999';
  if(kind==='selfEmployment')d.netSelfEmployment='1';
  if(kind==='prorated')Reflect.set(s,'wages',{owner:'primary',method:'prorated',annualAmount:'60000',specificIdentification:'unavailable'});
  const before=structuredClone(input);expect(()=>calculateOhioSD100(input)).toThrow();expect(input).toEqual(before);
 });
});

function nativeSource(){
 const actual=schoolDistrictPartYearFixture(),original=TaxYearInputSchema.parse(rawPartYearSchoolOriginals(actual));
 const residency=confirmGuidedOhioResidencyFacts(original,{...structuredClone(actual.ohioResidency),taxYear:'2025',sourceFactsConfirmed:null,owners:actual.ohioResidency.owners.map(owner=>({...structuredClone(owner),stateAdditions:[],stateDeductions:[]}))});
 const payments=confirmGuidedOhioPaymentFacts(original,{...structuredClone(actual.ohioPayments),taxYear:'2025',sourceFactsConfirmed:null,specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'}});
 const draft={...enteredSchoolDraft(actual.ohioSchoolDistrict),partYearWageSources:{...structuredClone(actual.ohioSchoolDistrict.partYearWageSources),payrollOriginals:actual.ohioSchoolDistrict.partYearWageSources.payrollOriginals.map(row=>({...structuredClone(row),taxYear:String(row.taxYear)}))}};
 return{actual,original,residency,payments,draft};
}
function nativeConfirm(f:ReturnType<typeof nativeSource>,draft=f.draft){return schoolNative.confirmGuidedOhioSchoolDistrictFacts(f.original,draft,f.residency,f.payments);}
function nativeRead(f:ReturnType<typeof nativeSource>,draft:schoolNative.OhioSchoolDistrictDraft,input=f.original){return schoolNative.buildGuidedOhioSchoolDistrictFacts(input,draft,f.residency,f.payments);}
describe('OH PY SD native source lifecycle',()=>{
 it('OH PY SD native confirms complete current originals and rejects stale reads',()=>{
  const f=nativeSource(),before=structuredClone(f),confirmed=nativeConfirm(f),packet=nativeRead(f,confirmed);
  expect(packet).toEqual(f.actual.ohioSchoolDistrict);expect(confirmed.originalFederalSources).toEqual(f.original);expect(f).toEqual(before);
  const stale=structuredClone(f.original);required(stale.w2s[0]).employer.name='FICTIONAL SAME CASH NEW EMPLOYER';
  expect(()=>nativeRead(f,confirmed,stale)).toThrow();expect(confirmed.originalFederalSources).toEqual(f.original);expect(f).toEqual(before);
 });
 it('OH PY SD native JSON recovery never renews captures or confirmation',()=>{
  const f=nativeSource(),confirmed=nativeConfirm(f),saved=JSON.parse(JSON.stringify(confirmed)),before=JSON.stringify(saved);
  expect(nativeRead(f,saved)).toEqual(f.actual.ohioSchoolDistrict);expect(JSON.stringify(saved)).toBe(before);
  saved.sourceFactsConfirmed=null;expect(()=>nativeRead(f,saved)).toThrow();expect(saved.originalFederalSources).toEqual(f.original);
 });
 it('OH PY SD native grouped monetary spelling normalizes without editing private identities',()=>{
  const f=nativeSource(),row=required(f.draft.partYearWageSources.payrollOriginals[0]);row.grossWages='40,000.00';row.sourceReference='PRIVATE, LITERAL PAYROLL';const before=structuredClone(f);
  const packet=nativeRead(f,nativeConfirm(f)),entered=required(packet.partYearWageSources?.payrollOriginals[0]);
  expect(entered.grossWages).toBe('40000.00');expect(entered.sourceReference).toBe('PRIVATE, LITERAL PAYROLL');expect(f).toEqual(before);
 });
 it.each(['gross','known-none','year','home','source-confirmation'] as const)('OH PY SD native rejects unknown source without capture %s',kind=>{
  const f=nativeSource(),row=required(f.draft.partYearWageSources.payrollOriginals[1]);
  if(kind==='gross')row.grossWages='';if(kind==='known-none')Reflect.set(row,'noOhioServicesOutsideOhioConfirmed',null);
  if(kind==='year')row.taxYear='';if(kind==='home')required(f.draft.partYearWageSources.residenceOriginals[0]).originalAddress.street='';
  if(kind==='source-confirmation')Reflect.set(f.draft.partYearWageSources,'allOriginalPayrollIncludedConfirmed',null);
  const before=structuredClone(f);expect(()=>nativeConfirm(f)).toThrow();expect(f).toEqual(before);expect(f.draft.originalFederalSources).toBeUndefined();
 });
 it('OH PY SD native mounted blank records remain unknown until explicit action',async()=>{
  const f=nativeSource();let latest:schoolNative.OhioSchoolDistrictDraft|undefined=schoolNative.emptyOhioSchoolDistrictDraft();
  function Harness(){const[d,set]=useState(latest);return React.createElement(OhioSchoolDistrictDetails,{data:d,originalInput:f.original,ohioResidency:f.residency,ohioPayments:f.payments,taxYear:2025,onChange:next=>{latest=next;set(next);}});}
  const panel=await mountGuidedPanel(React.createElement(Harness));try{
   await panel.click('Add actual part-year school payroll sources');
   const packet=required(latest?.partYearWageSources);expect(packet.method).toBe('');expect(packet.allOriginalPayrollIncludedConfirmed).toBeNull();expect(packet.payrollOriginals).toEqual([]);expect(packet.residenceOriginals).toEqual([]);
   await panel.click('Add actual part-year school home original');await panel.click('Add actual part-year school payroll original');
   expect(required(latest?.partYearWageSources?.payrollOriginals[0])).toMatchObject({taxYear:'',paidOn:'',grossWages:'',federalWithheld:'',noOhioServicesOutsideOhioConfirmed:null,w2Index:null});
   expect(panel.control('Part-year payroll 1 gross wages').value).toBe('');
   await panel.change('Part-year payroll 1 gross wages','0');expect(required(latest?.partYearWageSources?.payrollOriginals[0]).grossWages).toBe('0');
   await panel.click('Confirm actual Ohio school district sources after the last edit');expect(latest?.sourceFactsConfirmed).toBeNull();expect(latest?.originalFederalSources).toBeUndefined();
  }finally{await panel.dispose();}
 });
 it('OH PY SD native mounted source edit invalidates and retains current originals',async()=>{
  const f=nativeSource();let latest:schoolNative.OhioSchoolDistrictDraft|undefined=nativeConfirm(f);const captured=structuredClone(latest.originalFederalSources);
  function Harness(){const[d,set]=useState(latest);return React.createElement(OhioSchoolDistrictDetails,{data:d,originalInput:f.original,ohioResidency:f.residency,ohioPayments:f.payments,taxYear:2025,onChange:next=>{latest=next;set(next);}});}
  const panel=await mountGuidedPanel(React.createElement(Harness));try{
   await panel.change('Part-year payroll 1 source reference','PRIVATE NEW CURRENT PAYROLL ORIGINAL');expect(latest?.sourceFactsConfirmed).toBeNull();expect(latest?.originalFederalSources).toEqual(captured);
   await panel.click('Confirm actual Ohio school district sources after the last edit');expect(latest?.sourceFactsConfirmed).toBe(true);expect(latest?.originalFederalSources).toEqual(captured);
   await panel.change('Part-year payroll 1 gross wages','');expect(latest?.sourceFactsConfirmed).toBeNull();expect(latest?.originalFederalSources).toEqual(captured);
   await panel.click('Confirm actual Ohio school district sources after the last edit');expect(latest?.sourceFactsConfirmed).toBeNull();expect(latest?.originalFederalSources).toEqual(captured);
  }finally{await panel.dispose();}
 });
});


describe('OH PY SD physical omission boundary',()=>{
 it('OH PY SD omits unqualified physical projection before any IO',async()=>{
  const input=schoolDistrictPartYearFixture(),federal=calculateFederalTax(input),context=prepareOhioResidencyReview(input,federal),safe=redactReviewIdentifiers(input),before=structuredClone(input);
  const root=await mkdtemp(join(tmpdir(),'oh-py-sd-no-template-')),templates=join(root,'forbidden-template-root'),output=join(root,'forbidden-output');
  try{expect(await readdir(root)).toEqual([]);await expect(access(templates)).rejects.toThrow();await expect(access(output)).rejects.toThrow();
   expect(await fillOhioSchoolDistrictOfficialReview(safe,federal,output,{},context,templates)).toEqual([]);
   expect(await readdir(root)).toEqual([]);await expect(access(templates)).rejects.toThrow();await expect(access(output)).rejects.toThrow();expect(input).toEqual(before);
  }finally{await rm(root,{recursive:true,force:true});}
 });
 it('OH PY SD physical omission still rejects stale actual originals before IO',async()=>{
  const input=schoolDistrictPartYearFixture(),federal=calculateFederalTax(input),context=prepareOhioResidencyReview(input,federal),safe=redactReviewIdentifiers(input);
  required(safe.ohioSchoolDistrict?.partYearWageSources?.payrollOriginals[0]).grossWages='39999';const before=structuredClone(safe);
  const root=await mkdtemp(join(tmpdir(),'oh-py-sd-stale-')),templates=join(root,'forbidden-template-root'),output=join(root,'forbidden-output');
  try{await expect(fillOhioSchoolDistrictOfficialReview(safe,federal,output,{},context,templates)).rejects.toThrow();
   expect(await readdir(root)).toEqual([]);await expect(access(templates)).rejects.toThrow();await expect(access(output)).rejects.toThrow();expect(safe).toEqual(before);
  }finally{await rm(root,{recursive:true,force:true});}
 });
});

it('OH PY SD rejects retained actual municipal originals outside its finite method',()=>{
 const input=schoolDistrictPartYearFixture();addSchoolMunicipalRow(input);
 const source=required(schoolW2(input).stateLocalSources),municipal=required(source.localRows.find(row=>row.localityName==='R0302'));municipal.wages='40000';bindPartYearSchoolFixture(input);
 expect(()=>calculateW2StateLocalSources(input,0,source)).not.toThrow();const before=structuredClone(input);
 expect(()=>canonical(input)).toThrow();expect(input).toEqual(before);
});
