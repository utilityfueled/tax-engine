// @vitest-environment jsdom
/** Spec: state/pa-married-prior-history.yaml. Printed literals precede implementation. */
import React,{useState} from 'react';
import {expect,it,vi,afterEach} from 'vitest';
import {PAMarriedOrdinaryDetails} from '@/components/guided-interview/pa-married-ordinary-details';
import {mountGuidedPanel} from '../../apps/web/guided-panel-dom';
import {PAMarriedPriorHistorySchema} from '@/models/pa-married-prior-history.js';
import {PAMarriedOrdinarySourcesSchema} from '@/models/pa-married-ordinary-sources.js';
import {calculatePAReturn} from '@/engine/state/pa-orchestrator.js';
import {paMarriedOrdinaryFixture} from '../../fixtures/pa-married-ordinary-return.js';
import {calculatePAMarriedPriorHistory,snapshotPAMarriedPriorOriginals} from '@/engine/state/pa-married-prior-history.js';
import {captureGuidedPAMarriedPriorHistory,confirmGuidedPAMarriedPriorHistory,emptyGuidedPAMarriedPriorHistory,emptyGuidedPAMarriedPriorOwner,updateGuidedPAMarriedPriorHistory} from '@/lib/guided-pa-married-prior-history';
import {confirmGuidedPAMarriedOrdinarySources,buildGuidedPAMarriedOrdinarySources,updateGuidedPAMarriedOrdinarySources} from '@/lib/guided-pa-married-ordinary-sources';
afterEach(()=>vi.unstubAllGlobals());

function projection(input: unknown,sources: Record<string,unknown>){
 const household=structuredClone(sources);delete household.priorYearHistory;delete household.sourceFactsConfirmed;delete household.originalFederalSources;
 for(const row of household.owners as Array<Record<string,unknown>>)delete row.originalTaxpayer;
 for(const row of household.wages as Array<Record<string,unknown>>){delete row.original;delete row.originalRecipientSsn;}
 const prior=structuredClone(sources.priorYearHistory) as Record<string,unknown>;delete prior.sourceFactsConfirmed;delete prior.capturedOriginals;
 return {current:{input:structuredClone(input),household},prior};
}
function priorFixture(method:'SP'|'safe'='SP'){
 const raw=paMarriedOrdinaryFixture('M',['50000','30000'],method==='SP'?['0','0']:['924','616']);const f={input:raw.input,sources:PAMarriedOrdinarySourcesSchema.parse(raw.sources)};
 const income=method==='SP'?['8000','5000']:['30000','20000'],tax=method==='SP'?['246','154']:['921','614'];
 const spouse=f.input.taxpayer.spouse;if(!spouse)throw Error('Actual spouse required');const owners=[f.input.taxpayer.primary,spouse],tags=['primary','spouse'] as const;
 const identity=(i:number)=>({name:owners[i].firstName+' '+owners[i].lastName,ssn:owners[i].ssn});
 const column=(i:number)=>Object.fromEntries(Array.from({length:10},(_,n)=>[String(n+1),n===0?income[i]:'0']));
 const rows=tags.map((accountHolder,i)=>({accountHolder,sourceReference:'Actual prior '+accountHolder,originalPA40:{...identity(i),taxYear:2024,returnType:'PA-40',filingStatus:'M',residency:'resident',filedOn:'2025-03-01',filedConfirmed:true,taxableIncome:income[i],taxLiability:tax[i],taxForgivenessCredit:method==='SP'?tax[i]:'0'},originalSP:{...identity(i),spouse:identity(1-i),taxYear:2024,returnType:'PA-40SP',filingCategory:'married_separate',calendarFrom:'2024-01-01',calendarThrough:'2024-12-31',marriedAndLivedTogetherEntireYearConfirmed:true,bothAliveEntireYearConfirmed:true,neitherClaimedAsDependentConfirmed:true,noDependentChildrenConfirmed:true,allWorldwideSourcesCompleteConfirmed:true,noOtherStateTaxCreditConfirmed:true,taxpayerColumn:column(i),spouseColumn:column(1-i),line11:method==='SP'?'13000':'50000',line12:tax[i],line13:'0',line14:tax[i],line15:method==='SP'?'1':'0',line16:method==='SP'?tax[i]:'0'}}));
 f.sources.owners.forEach(o=>{o.payments.priorReturnStatus='actual_return';});
 f.sources.dispositions.forEach((d,i)=>{d.remainingPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:(method==='SP'?['1535','921']:['611','305'])[i],sourceReference:'Actual prospective current remaining '+i};});
 const history=PAMarriedPriorHistorySchema.parse({sourceTaxYear:2024,sourceReference:'Actual complete paired prior originals',sourceFactsConfirmed:true,rows,capturedOriginals:{}});
 Object.assign(f.sources,{priorYearHistory:history});history.capturedOriginals=projection(f.input,f.sources);
 Object.assign(f.input,{paMarriedOrdinarySources:structuredClone(f.sources)});
 return {...f,history};
}
it('PA married prior history applies actual prior100percent SP through public dispatch',()=>{
 const f=priorFixture(),r=calculatePAReturn(f.input);
 expect('returns' in r).toBe(true);if(!('returns'in r))throw Error('Actual separate returns missing');
 expect(r.returns.map(row=>row.pa40.taxDue.toFixed())).toEqual(['1535','921']);
 expect(r.returns.map(row=>row.rev1630.totalInterest.toFixed())).toEqual(['0','0']);
 expect(r.returns.map(row=>row.rev1630.exemptReason)).toEqual(['Prior year 100% Tax Forgiveness — exempt from penalty','Prior year 100% Tax Forgiveness — exempt from penalty']);
});
it('PA married prior history applies the actual quarterly prior-tax exception',()=>{
 const f=priorFixture('safe'),r=calculatePAReturn(f.input);if(!('returns'in r))throw Error('Actual separate returns missing');
 expect(r.returns.map(row=>row.pa40.taxDue.toFixed())).toEqual(['611','305']);
 expect(r.returns.map(row=>row.rev1630.totalInterest.toFixed())).toEqual(['0','0']);
 expect([...calculatePAMarriedPriorHistory(f.input,f.sources).values()].map(row=>row.priorYearPATaxableIncome.times('0.0307').toFixed(0))).toEqual(['921','614']);
 expect(r.returns.map(row=>row.rev1630.priorYearTaxAtCurrentRate?.toFixed())).toEqual(['921',undefined]);
 expect(r.returns[0].rev1630.quarters.every(q=>q.exception1Met)).toBe(true);
 expect(r.returns[1].rev1630.netTaxOwed.toFixed()).toBe('305');
 expect(r.returns[1].rev1630.exemptReason).toMatch(/338/);
 expect(r.returns.map(row=>row.rev1630.penaltyRequired)).toEqual([true,false]);
});
it.each(['missingZero','unknownPrior','wrongYear','unfiled','partYear','otherSpouse','duplicateOwner','duplicateSource','dependent','unknownComplete','positiveOther','positiveResidentCredit','wrongIncome','wrongCredit','wrongSpouseColumn','wrongPercent','wrongEligibility','fractionalPrinted','negativePrinted','malformedPrinted','unknownCapture','stalePriorReference','staleCurrentReference','staleCurrentElection','J','current2026','mixed'] as const)('PA married prior history rejects unknown and contradictory originals %s',kind=>{
 const f=priorFixture(),h=f.history,p=h.rows[0].originalPA40,s=h.rows[0].originalSP;
 if(kind==='missingZero')s.taxpayerColumn['2']='';if(kind==='unknownPrior')f.sources.owners[0].payments.priorReturnStatus='no_return';if(kind==='wrongYear')p.taxYear=2023;if(kind==='unfiled')p.filedConfirmed=false;if(kind==='partYear')p.residency='part_year';if(kind==='otherSpouse')s.spouse.ssn='900-77-8811';if(kind==='duplicateOwner')h.rows[1].accountHolder='primary';if(kind==='duplicateSource')h.rows[1].sourceReference=h.rows[0].sourceReference;
 if(kind==='dependent')s.neitherClaimedAsDependentConfirmed=false;if(kind==='unknownComplete')Object.assign(s,{allWorldwideSourcesCompleteConfirmed:null});if(kind==='positiveOther')s.taxpayerColumn['2']='1';if(kind==='positiveResidentCredit')s.line13='1';if(kind==='wrongIncome')p.taxableIncome='8001';if(kind==='wrongCredit')p.taxForgivenessCredit='245';if(kind==='wrongSpouseColumn')s.spouseColumn['1']='4999';if(kind==='wrongPercent')s.line15='0.9';if(kind==='wrongEligibility')s.line11='12999';if(kind==='fractionalPrinted')p.taxableIncome='8000.01';if(kind==='negativePrinted')p.taxableIncome='-1';if(kind==='malformedPrinted')p.taxableIncome='8,000';
 if(kind==='unknownCapture')h.capturedOriginals=undefined;if(kind==='stalePriorReference')h.rows[0].sourceReference='Different actual original equal cash';if(kind==='staleCurrentReference')f.sources.wages[0].sourceReference='Different equal cash payroll';if(kind==='staleCurrentElection')f.sources.dispositions[0].remainingPayment.sourceReference='Different remaining principal source';if(kind==='J')f.sources.filingMode='J';if(kind==='current2026')f.input.taxpayer.taxYear=2026;if(kind==='mixed')Object.assign(f.sources,{residencySources:{}});
 // Semantic invalidity tests explicitly recapture the documentary values. Stale
 // tests retain the old snapshot to exercise the currentness guard itself.
 if(!['unknownCapture','stalePriorReference','staleCurrentReference','staleCurrentElection'].includes(kind))h.capturedOriginals=snapshotPAMarriedPriorOriginals(f.input,f.sources);
 expect(()=>calculatePAMarriedPriorHistory(f.input,f.sources)).toThrow(/PA married prior history/);
});
it('PA married prior history captures and confirms sources without a parent cycle',()=>{
 const f=priorFixture();delete f.input.paMarriedOrdinarySources;
 const draft=updateGuidedPAMarriedPriorHistory(f.sources,{...f.history,sourceFactsConfirmed:null,capturedOriginals:undefined});
 expect(()=>confirmGuidedPAMarriedPriorHistory(f.input,draft)).toThrow(/capture/);
 const before=JSON.stringify(draft),captured=captureGuidedPAMarriedPriorHistory(f.input,draft),confirmed=confirmGuidedPAMarriedPriorHistory(f.input,captured);
 expect(JSON.stringify(draft)).toBe(before);expect(confirmed.sourceFactsConfirmed).toBeNull();expect(confirmed.priorYearHistory?.sourceFactsConfirmed).toBe(true);
 const parent=confirmGuidedPAMarriedOrdinarySources(f.input,confirmed);expect(buildGuidedPAMarriedOrdinarySources(f.input,parent)).toEqual(parent);
 const edited=updateGuidedPAMarriedOrdinarySources(parent,{sourceReference:'Different actual current household reference'});
 expect(edited.priorYearHistory?.sourceFactsConfirmed).toBeNull();expect(edited.sourceFactsConfirmed).toBeNull();expect(edited.priorYearHistory?.rows).toEqual(parent.priorYearHistory?.rows);
 expect(()=>confirmGuidedPAMarriedPriorHistory(f.input,edited)).toThrow(/changed/);
 const parentHistory=parent.priorYearHistory;if(!parentHistory)throw Error('Retain prior history');const childEdit=updateGuidedPAMarriedPriorHistory(parent,{...parentHistory,sourceReference:'Different equal-cash prior collection'});
 expect(childEdit.priorYearHistory?.capturedOriginals).toEqual(parent.priorYearHistory?.capturedOriginals);expect(()=>confirmGuidedPAMarriedPriorHistory(f.input,childEdit)).toThrow(/changed/);
 const recaptured=captureGuidedPAMarriedPriorHistory(f.input,childEdit),reconfirmed=confirmGuidedPAMarriedPriorHistory(f.input,recaptured);
 expect(confirmGuidedPAMarriedOrdinarySources(f.input,reconfirmed).priorYearHistory?.sourceFactsConfirmed).toBe(true);
 const detached=captureGuidedPAMarriedPriorHistory(f.input,draft);if(!detached.priorYearHistory)throw Error('Retain detached prior history');detached.priorYearHistory.rows[0].originalSP.taxpayerColumn['1']='1';expect(draft.priorYearHistory?.rows[0].originalSP.taxpayerColumn['1']).toBe('8000');
 const unknown=emptyGuidedPAMarriedPriorHistory(),owner=emptyGuidedPAMarriedPriorOwner('primary');expect(unknown.sourceTaxYear).toBeNull();expect(owner.originalPA40.filedConfirmed).toBeNull();expect(Object.values(owner.originalSP.taxpayerColumn)).toEqual(Array(10).fill(''));
});
it('PA married prior history preserves originals privacy and absent-history gates',()=>{
 const f=priorFixture(),before=JSON.stringify(f),r=calculatePAReturn(f.input);expect(JSON.stringify(f)).toBe(before);if(!('returns'in r))throw Error('Missing actual returns');
 for(const value of [f.history.sourceReference,...f.history.rows.flatMap(row=>[row.sourceReference,row.originalPA40.name,row.originalPA40.ssn])])expect(JSON.stringify(r.lines)).not.toContain(value);
 const old=paMarriedOrdinaryFixture('M');Object.assign(old.input,{paMarriedOrdinarySources:old.sources});const result=calculatePAReturn(old.input);if(!('returns'in result))throw Error('Missing old returns');expect(result.returns.map(row=>row.pa40.taxDue.toFixed())).toEqual(['0','0']);
 const unknown=priorFixture();delete unknown.sources.priorYearHistory;Object.assign(unknown.input,{paMarriedOrdinarySources:unknown.sources});expect(()=>calculatePAReturn(unknown.input)).toThrow(/prior.*(?:exemption|forgiveness|eligibility)/);
 const insufficient=priorFixture('safe');insufficient.input.w2s[0].stateTaxWithheld='920';insufficient.sources.wages[0].original=structuredClone(insufficient.input.w2s[0]);insufficient.sources.originalFederalSources=structuredClone(Object.fromEntries(Object.entries(insufficient.input).filter(([k])=>k!=='paMarriedOrdinarySources')));insufficient.history.capturedOriginals=snapshotPAMarriedPriorOriginals(insufficient.input,insufficient.sources);Object.assign(insufficient.input,{paMarriedOrdinarySources:insufficient.sources});expect(()=>calculatePAReturn(insufficient.input)).toThrow(/prior.*(?:exemption|forgiveness|eligibility)/);
});
it('PA married prior history enters actual native originals before explicit capture',async()=>{
 const f=priorFixture();delete f.input.paMarriedOrdinarySources;const expected=structuredClone(f.history),initial=PAMarriedOrdinarySourcesSchema.parse(f.sources);delete initial.priorYearHistory;initial.sourceFactsConfirmed=null;let latest=initial;
 function Harness(){const [data,setData]=useState(initial);return React.createElement(PAMarriedOrdinaryDetails,{originalInput:f.input,data,onChange:next=>{if(!next)throw Error('Retain household');latest=next;setData(next);}});}
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const p=await mountGuidedPanel(React.createElement(Harness));
 try{
  await p.click('Add actual prior married PA history');expect(latest.priorYearHistory).toEqual(emptyGuidedPAMarriedPriorHistory());
  await p.change('Prior PA history source tax year','2024');await p.change('Prior PA history collection reference',expected.sourceReference);
  for(const row of expected.rows){const prefix='Prior PA '+(row.accountHolder==='primary'?'taxpayer':'spouse');await p.click('Add actual '+(row.accountHolder==='primary'?'taxpayer':'spouse')+' prior PA originals');await p.change(prefix+' original document reference',row.sourceReference);
   for(const [key,value]of Object.entries(row.originalPA40))await p.change(prefix+' PA-40 '+(({name:'name',ssn:'SSN',taxYear:'tax year',returnType:'document type',filingStatus:'filing status',residency:'residency status',filedOn:'actual filing date',filedConfirmed:'actual filing confirmed',taxableIncome:'taxable income',taxLiability:'tax liability',taxForgivenessCredit:'Tax Forgiveness credit'} as Record<string,string>)[key]),String(value));
   for(const [key,value]of Object.entries(row.originalSP)){
    if(key==='spouse')for(const [field,v]of Object.entries(value as {name:string;ssn:string}))await p.change(prefix+' SP spouse '+(field==='ssn'?'SSN':'name'),String(v));
    else if(key==='taxpayerColumn'||key==='spouseColumn')for(const [line,v]of Object.entries(value as Record<string,string>))await p.change(prefix+' SP '+(key==='taxpayerColumn'?'taxpayer':'spouse')+' line '+line,v);
    else await p.change(prefix+' SP '+(({name:'name',ssn:'SSN',taxYear:'tax year',returnType:'document type',filingCategory:'filing category',calendarFrom:'tax year beginning',calendarThrough:'tax year ending',marriedAndLivedTogetherEntireYearConfirmed:'lived together all year',bothAliveEntireYearConfirmed:'both spouses alive all year',neitherClaimedAsDependentConfirmed:'neither spouse claimed as a dependent',noDependentChildrenConfirmed:'no dependent children',allWorldwideSourcesCompleteConfirmed:'all worldwide income sources reviewed',noOtherStateTaxCreditConfirmed:'no other state tax credit',line11:'line 11 eligibility income',line12:'line 12 PA tax liability',line13:'line 13 other state tax credit',line14:'line 14 tax after other state credit',line15:'line 15 forgiveness decimal',line16:'line 16 Tax Forgiveness credit'} as Record<string,string>)[key]),String(value));
   }
  }
  await p.click('Confirm actual prior PA history');expect(latest.priorYearHistory?.sourceFactsConfirmed).toBeNull();
  await p.click('Capture entered prior PA originals after the last edit');expect(latest.priorYearHistory?.capturedOriginals).toBeDefined();
  await p.click('Confirm actual prior PA history');expect(latest.priorYearHistory?.sourceFactsConfirmed).toBe(true);expect(latest.sourceFactsConfirmed).toBeNull();
  await p.click('Confirm actual married PA household sources after the last edit');expect(latest.sourceFactsConfirmed).toBe(true);
  const original=structuredClone(latest.priorYearHistory?.capturedOriginals);await p.change('Prior PA taxpayer original document reference','Changed actual same-cash reference');
  expect(latest.sourceFactsConfirmed).toBeNull();expect(latest.priorYearHistory?.sourceFactsConfirmed).toBeNull();expect(latest.priorYearHistory?.capturedOriginals).toEqual(original);
  await p.click('Confirm actual prior PA history');expect(latest.priorYearHistory?.sourceFactsConfirmed).toBeNull();
  expect(p.container.querySelector('textarea,input[type="hidden"]')).toBeNull();
 }finally{await p.dispose();}
});
