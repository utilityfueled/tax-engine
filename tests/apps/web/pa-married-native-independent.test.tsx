// @vitest-environment jsdom
/** Independent controls frozen before candidate outputs. Spec: spec/state/pa-married-native-independent.yaml. */
import React, {useState} from 'react';
import {expect, it} from 'vitest';
import {calculatePAReturn} from '@/index';
import {isPAMarriedOrdinaryReturnResult, assertNoPAMarriedPaperExport} from '@/engine/state/pa-return-result';
import type {PAMarriedOrdinarySources} from '@/models/pa-married-ordinary-sources';
import {TaxYearInputSchema} from '@/models/inputs';
import {PAMarriedOrdinaryDetails} from '@/components/guided-interview/pa-married-ordinary-details';
import {RefundTicker, type RefundTickerPreviewData} from '@/components/refund-ticker';
import type {WorkspaceEnginePreview} from '@tax-engine/contracts';
import {buildTaxInputFromGuidedData, isSeparateStatePreview} from '@/lib/guided-interview-bridge';
import {updateSectionData} from '@/lib/guided-interview-flow';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {reconcileWorkspaceGuidedState} from '@/lib/workspace-guided-state';
import {computeGuidedPreviewOutcome} from '@/lib/guided-preview-compute';
import {buildGuidedPAMarriedOrdinarySources, confirmGuidedPAMarriedOrdinarySources} from '@/lib/guided-pa-married-ordinary-sources';
import {paMarriedNativePublicFixture} from '../../fixtures/pa-married-native-public';
import {guidedPAMarriedNativeFixture} from '../../fixtures/guided-pa-married-native';
import {mountGuidedPanel} from './guided-panel-dom';
function need<T>(value:T|null|undefined):T {if(value===null||value===undefined)throw new Error('Independent actual fixture record required');return value;}
function rejected(action:()=>unknown){let error:unknown;try{action();}catch(e){error=e;}expect(error).toBeInstanceOf(Error);expect(error).not.toBeInstanceOf(TypeError);}
const boundaryCases=[
 ['249','J','13250','90',['359']],['249','M','13250','90',['276','83']],
 ['250','J','13251','80',['319']],['250','M','13251','80',['246','74']],
 ['2250','J','15251','0',['0']],['2250','M','15251','0',['0','0']],
] as const;
function actualGift(gift:string,mode:'J'|'M',refunds:readonly string[]){
 const f=paMarriedNativePublicFixture(mode,'shared-sp');
 const category=f.sources.owners[0].sp.categories['5'];
 category.status='entries';category.sourceReference='Independent fictional external donor bank and gift records';
 category.entries=[{sourceReference:'Independent fictional gift transfer 2025-11-30',date:'2025-11-30',amount:gift,original:{kind:'outside_household_gift',date:'2025-11-30',amount:gift,donorName:'Independent fictional external donor',recipientSsn:f.input.taxpayer.primary.ssn,donorInHousehold:false},notElsewhereConfirmed:true}];
 for(const [index,disposition]of f.sources.dispositions.entries())disposition.refundRequested=need(refunds[index]);
 return f;
}
it.each(boundaryCases)('Independent actual gift %s mode %s uses common Table2 without owner cash aggregation',(gift,mode,income,pct,refunds)=>{
 const f=actualGift(gift,mode,refunds),before=JSON.stringify(f.input),sourceBefore=JSON.stringify(f.sources);
 const packet=confirmGuidedPAMarriedOrdinarySources(f.input,f.sources),r=calculatePAReturn({...f.input,paMarriedOrdinarySources:packet});
 if(!isPAMarriedOrdinaryReturnResult(r))throw new Error('Actual public married result required');
 expect(r.returns.map(v=>v.scheduleSP.eligibilityIncome.toString())).toEqual(refunds.map(()=>income));
 expect(r.returns.map(v=>v.scheduleSP.forgivenessPercentage.toString())).toEqual(refunds.map(()=>pct));
 expect(r.returns.map(v=>v.pa40.taxLiability.toString())).toEqual(mode==='J'?['399']:['307','92']);
 expect(r.returns.map(v=>v.scheduleSP.taxForgivenessCredit.toString())).toEqual(refunds);
 expect(r.returns.map(v=>v.pa40.netOverpayment.toString())).toEqual(refunds);
 expect(r.returns.map(v=>v.refundDisposition.refund.toString())).toEqual(refunds);
 expect(r.federal.filingStatus).toBe('married_filing_jointly');expect(r.federal.earnedIncomeCredit.toString()).toBe('0');
 expect(r).not.toHaveProperty('pa40');expect(r).not.toHaveProperty('refund');expect(r.readiness.filingEligible).toBe(false);
 expect(JSON.stringify(f.input)).toBe(before);expect(JSON.stringify(f.sources)).toBe(sourceBefore);
});
const giftFailures:[string,(d:PAMarriedOrdinarySources)=>void][]=[
 ['unknown donor household',d=>{d.owners[0].sp.categories['5'].entries[0].original.donorInHousehold=null;}],
 ['donor within own household',d=>{d.owners[0].sp.categories['5'].entries[0].original.donorInHousehold=true;}],
 ['different actual recipient',d=>{d.owners[0].sp.categories['5'].entries[0].original.recipientSsn='900-70-0499';}],
 ['original amount disagreement',d=>{d.owners[0].sp.categories['5'].entries[0].original.amount='248';}],
 ['original date disagreement',d=>{d.owners[0].sp.categories['5'].entries[0].original.date='2025-11-29';}],
 ['unknown other-category exclusion',d=>{d.owners[0].sp.categories['5'].entries[0].notElsewhereConfirmed=null;}],
 ['known-none while original retained',d=>{d.owners[0].sp.categories['5'].status='known_none';}],
 ['missing original gift classification',d=>{d.owners[0].sp.categories['5'].entries[0].original.kind='';}],
];
it.each(giftFailures)('Independent actual gift rejects %s',(_label,edit)=>{const f=actualGift('249','M',['276','83']);edit(f.sources);const before=JSON.stringify(f);rejected(()=>confirmGuidedPAMarriedOrdinarySources(f.input,f.sources));expect(JSON.stringify(f)).toBe(before);});
const originalFailures:[string,(f:ReturnType<typeof paMarriedNativePublicFixture>)=>void][]=[
 ['spouse date of birth',f=>{need(f.input.taxpayer.spouse).dateOfBirth='1952-06-03';}],
 ['same-dollar payer identity',f=>{f.input.w2s[1].employer.ein='99-7654321';}],
 ['same-dollar owner source year',f=>{f.input.w2s[1].taxYear=2026;}],
];
it.each(originalFailures)('Independent current source reads reject %s without refresh',(_label,edit)=>{const f=paMarriedNativePublicFixture(),packet=confirmGuidedPAMarriedOrdinarySources(f.input,f.sources),before=JSON.stringify(packet);edit(f);rejected(()=>buildGuidedPAMarriedOrdinarySources(f.input,packet));expect(JSON.stringify(packet)).toBe(before);});
it('Independent actual individual support liability permits M but forbids J',()=>{const m=paMarriedNativePublicFixture('M');m.sources.owners[1].individualSupportDhsLiability=true;const packet=confirmGuidedPAMarriedOrdinarySources(m.input,m.sources);expect(buildGuidedPAMarriedOrdinarySources(m.input,packet).filingMode).toBe('M');const j=paMarriedNativePublicFixture('J');j.sources.owners[1].individualSupportDhsLiability=true;rejected(()=>confirmGuidedPAMarriedOrdinarySources(j.input,j.sources));});
it('Independent actual two owners cannot collapse to one identity',()=>{const f=paMarriedNativePublicFixture();need(f.input.taxpayer.spouse).ssn=f.input.taxpayer.primary.ssn;rejected(()=>confirmGuidedPAMarriedOrdinarySources(f.input,f.sources));});
it('Independent private saved pending gift remains unknown with both original owners',()=>{const f=actualGift('249','M',['276','83']);const packet=confirmGuidedPAMarriedOrdinarySources(f.input,f.sources);packet.sourceFactsConfirmed=null;packet.owners[0].sp.categories['5'].entries[0].amount='';const saved=JSON.parse(JSON.stringify(packet));expect(saved.originalFederalSources.taxpayer).toEqual(f.input.taxpayer);expect(saved.owners[0].sp.categories['5'].entries[0].original.amount).toBe('249');rejected(()=>buildGuidedPAMarriedOrdinarySources(f.input,saved));expect(saved.sourceFactsConfirmed).toBeNull();expect(saved.owners[0].sp.categories['5'].entries[0].amount).toBe('');});
it('Independent mounted added owner rows have no inferred identity or zero facts',async()=>{const f=paMarriedNativePublicFixture();let latest:PAMarriedOrdinarySources|undefined;function Harness(){const[data,set]=useState<PAMarriedOrdinarySources>();return <PAMarriedOrdinaryDetails originalInput={f.input} data={data} onChange={next=>{latest=next;set(next);}}/>;}const dom=await mountGuidedPanel(<Harness/>);try{await dom.click('Add married Pennsylvania household sources');await dom.click('Add primary actual household sources');await dom.click('Add spouse actual household sources');const d=need(latest);expect(d.sourceTaxYear).toBeNull();expect(d.filingMode).toBe('');expect(d.originalFederalSources).toEqual({});for(const owner of d.owners){expect(owner.originalTaxpayer).toEqual({firstName:'',lastName:'',ssn:''});expect(owner.residency.actualDaysInPA).toBeNull();expect(owner.sp.categories['5'].status).toBe('');expect(owner.payments.priorReturnStatus).toBe('');expect(owner.marriedAndLivedTogetherEntireYearConfirmed).toBeNull();}expect(d.wages).toEqual([]);expect(d.dispositions).toEqual([]);expect(dom.container.querySelector('textarea,input[type="hidden"]')).toBeNull();}finally{await dom.dispose();}});
it('Independent mounted source edit invalidates gift proof without rewriting original household',async()=>{const f=actualGift('249','M',['276','83']);let latest=confirmGuidedPAMarriedOrdinarySources(f.input,f.sources);const old=JSON.stringify(latest.originalFederalSources);function Harness(){const[data,set]=useState(latest);return <PAMarriedOrdinaryDetails originalInput={f.input} data={data} onChange={next=>{latest=need(next);set(next);}}/>;}const dom=await mountGuidedPanel(<Harness/>);try{await dom.change('Primary SP 5 original 1 amount','250');expect(latest.sourceFactsConfirmed).toBeNull();expect(latest.owners[0].sp.categories['5'].entries[0].original.amount).toBe('249');expect(JSON.stringify(latest.originalFederalSources)).toBe(old);await dom.click('Confirm actual married PA household sources after the last edit');expect(latest.sourceFactsConfirmed).toBeNull();expect(dom.container.querySelector('[role="status"]')?.textContent).toMatch(/original|gift|SP|source/i);expect(dom.container.textContent).not.toContain(f.input.taxpayer.primary.ssn);}finally{await dom.dispose();}});
function currentGuided(){const f=guidedPAMarriedNativeFixture('M','shared-sp');need(f.state.sectionData['income-w2']).entries[0].federalWithheld='400';const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(f.state));need(f.state.sectionData['state-return']).paMarriedOrdinarySources=confirmGuidedPAMarriedOrdinarySources(input,f.sources);return f;}
function fallback(state:ReturnType<typeof currentGuided>['state']):RefundTickerPreviewData {const out=computeGuidedPreviewOutcome(state);expect(out.blockedBy).toBeNull();const metrics=need(out.metrics);expect(metrics.refund).toBe('400');const{state:stateMetrics,...federal}=metrics;return{taxYear:2025,filingStatus:'married_filing_jointly',metrics:federal,separateStateReturns:isSeparateStatePreview(stateMetrics)?stateMetrics:undefined,stateMetrics:stateMetrics&&!isSeparateStatePreview(stateMetrics)?{stateCode:stateMetrics.stateCode,stateTax:stateMetrics.stateTax,totalPayments:stateMetrics.stateWithholding,refund:stateMetrics.stateRefund,amountOwed:stateMetrics.stateAmountOwed}:undefined};}
function older(current:RefundTickerPreviewData):WorkspaceEnginePreview{return{mode:'engine-recompute',title:'Independently authored old scalar account',taxYear:2025,filingStatus:'married_filing_jointly',sourceDocumentIds:[],sourceFixtureIds:[],assumptions:[],highlightedLines:[],metrics:{...current.metrics,refund:'1000',amountOwed:'0'},stateMetrics:{stateCode:'PA',stateTax:'0',totalPayments:'5000',refund:'5000',amountOwed:'0'}};}
it('Independent actual flow source edit invalidates current M and retains private proof',()=>{const f=currentGuided(),prior=need(f.state.sectionData['state-return']),proof=JSON.stringify(need(prior.paMarriedOrdinarySources).originalFederalSources);const next=updateSectionData(f.state,'state-return',{...prior,paMarriedOrdinarySources:{...need(prior.paMarriedOrdinarySources),sourceReference:'Independently changed actual household reference'}});expect(next.sectionData['state-return']?.paMarriedOrdinarySources?.sourceFactsConfirmed).toBeNull();expect(JSON.stringify(next.sectionData['state-return']?.paMarriedOrdinarySources?.originalFederalSources)).toBe(proof);const preview=fallback(next);expect(preview.separateStateReturns).toBeUndefined();expect(preview.stateMetrics).toBeUndefined();});
it('Independent ready current M retains federal cash and separately owned results',async()=>{const f=currentGuided(),current=fallback(f.state);expect(current.separateStateReturns?.returns.map(v=>v.stateRefund)).toEqual(['276','83']);const dom=await mountGuidedPanel(<RefundTicker enginePreview={older(current)} fallbackPreview={current}/>);try{expect(dom.container.querySelector('.guided-ticker-value-hero')?.textContent).toBe('$400');expect(dom.container.querySelector('[aria-label="Primary PA return"]')?.textContent).toContain('$276');expect(dom.container.querySelector('[aria-label="Spouse PA return"]')?.textContent).toContain('$83');expect(dom.container.textContent).not.toContain('$6,000');}finally{await dom.dispose();}});
it('Independent pending M source edit never resurrects old aggregate cash',async()=>{const f=currentGuided(),old=older(fallback(f.state)),prior=need(f.state.sectionData['state-return']);const pending=updateSectionData(f.state,'state-return',{...prior,paMarriedOrdinarySources:{...need(prior.paMarriedOrdinarySources),sourceReference:'Actual source edited requires reconfirmation'}});const current=fallback(pending);expect(current.separateStateReturns).toBeUndefined();const saved=createWorkspaceRecord('independent-pending-married');saved.enginePreview=old;const reconciled=reconcileWorkspaceGuidedState(saved,pending);expect(reconciled.enginePreview).toBeNull();const dom=await mountGuidedPanel(<RefundTicker enginePreview={reconciled.enginePreview} fallbackPreview={current} computing={false}/>);try{expect(dom.container.querySelector('.guided-ticker-value-hero')?.textContent).toBe('$400');expect(dom.container.textContent).not.toContain('$6,000');expect(dom.container.querySelector('[aria-label="Primary PA return"]')).toBeNull();}finally{await dom.dispose();}});
it.each(['input-only','result-only','stripped-result']as const)('Independent paper guard rejects %s without generating files',kind=>{const f=paMarriedNativePublicFixture(),input={...f.input,paMarriedOrdinarySources:f.sources},r=calculatePAReturn(input);if(kind==='input-only')rejected(()=>assertNoPAMarriedPaperExport(input));else if(kind==='result-only')rejected(()=>assertNoPAMarriedPaperExport({},r));else rejected(()=>assertNoPAMarriedPaperExport(input,{}));});
it('Independent public source snapshot cannot hide a conflicting retained single packet',()=>{const f=paMarriedNativePublicFixture();Object.assign(f.input,{paOrdinaryReturnCompletionSources:{sourceReference:'Independently retained conflicting actual packet'}});rejected(()=>confirmGuidedPAMarriedOrdinarySources(f.input,f.sources));expect(f.input).toHaveProperty('paOrdinaryReturnCompletionSources');});

it('Independent actual workspace read clears old aggregate before current ready M reaches ticker',async()=>{const f=currentGuided(),current=fallback(f.state),saved=createWorkspaceRecord('independent-ready-married');saved.enginePreview=older(current);const sourceBefore=JSON.stringify(f.state),savedBefore=JSON.stringify(saved);const reconciled=reconcileWorkspaceGuidedState(saved,f.state);expect(reconciled.enginePreview).toBeNull();const dom=await mountGuidedPanel(<RefundTicker enginePreview={reconciled.enginePreview} fallbackPreview={current}/>);try{expect(dom.container.querySelector('.guided-ticker-value-hero')?.textContent).toBe('$400');expect(dom.container.querySelector('[aria-label="Primary PA return"]')?.textContent).toContain('$276');expect(dom.container.querySelector('[aria-label="Spouse PA return"]')?.textContent).toContain('$83');expect(JSON.stringify(f.state)).toBe(sourceBefore);expect(JSON.stringify(saved)).toBe(savedBefore);}finally{await dom.dispose();}});
