// @vitest-environment jsdom
/** Spec state/pa-resident-credit-root-integration.yaml. Literal source and Decimal oracles frozen before product edits. */
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import * as flow from '@/lib/guided-interview-flow';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {PAOrdinaryReturnCompletionSourcesSchema} from '@/models/pa-ordinary-return-completion';
import {SectionStateReturn} from '@/components/guided-interview/section-state-return';
import {emptyPAResidentCreditClaim,emptyPAResidentCreditPayment} from '@/lib/guided-pa-resident-credit-sources';
import {paResidentCreditRootFixture,paResidentCreditRootData} from '../../fixtures/pa-resident-credit-root-integration';
import {required} from '../../fixtures/guided-pa-ordinary-panels';
import {mountGuidedPanel} from './guided-panel-dom';
const statuses=['resident','part_year','nonresident']as const;
it.each(statuses)('actual saved PA credit navigation is complete without mutating originals: %s',status=>{
 const f=paResidentCreditRootFixture(status),before=structuredClone(f.state),source=required(flow.buildGuidedPAOrdinarySourceInput(f.state));
 expect(source.paOrdinaryReturnFacts).toBeUndefined();expect(f.data.paOrdinaryReturnFacts?.sourceFactsConfirmed).toBe(true);
 expect(flow.validateSection(f.state,'state-return').status).toBe('complete');expect(f.state).toEqual(before);
});
it.each([['resident','1539','1535','4','1535'],['part_year','799','614','185','614'],['nonresident','184','0','184','0']]as const)('actual canonical PA credit preserves literal tax credit refund for all residencies: %s',(status,tax,credit,net,refund)=>{
 for(const order of ['PA_first','DE_first']as const){const f=paResidentCreditRootFixture(status,order),before=structuredClone(f.state),canonical=buildGuidedStateOriginals(f.federalOriginal,f.state),facts=required(canonical.paOrdinaryReturnFacts),completion=required(canonical.paOrdinaryReturnCompletionSources),r=calculatePAOrdinaryReturn(canonical,facts,completion);
  expect(PAOrdinaryReturnCompletionSourcesSchema.safeParse(completion).success).toBe(true);expect(Reflect.has(completion.otherStateTaxes,'residentCreditDraft')).toBe(false);expect(completion.otherStateTaxes.residentCreditSources).toEqual(f.packet);
  expect(r.pa40.taxLiability.toFixed()).toBe(tax);expect(r.pa40.residentCredit.toFixed()).toBe(credit);expect(r.pa40.netTaxLiability.toFixed()).toBe(net);expect(r.pa40.totalPayments.toFixed()).toBe(tax);expect(r.pa40.netOverpayment.toFixed()).toBe(refund);expect(r.refundDisposition.refund.toFixed()).toBe(refund);expect(r.readiness.filingEligible).toBe(false);expect(f.state).toEqual(before);
 }
});
it.each(['resident','part_year']as const)('whole PA state panel explicitly confirms actual credit and completion sources: %s',async status=>{
 const f=paResidentCreditRootFixture(status);const c=f.data.paOrdinaryReturnCompletionSources;c.sourceFactsConfirmed=null;const draft=required(c.otherStateTaxes.residentCreditDraft);draft.sourceFactsConfirmed=null;let latest=f.state;
 function Harness(){const[state,setState]=useState(f.state);return <SectionStateReturn stateCode="PA" taxYear={2025} filingStatus="single" originalInput={f.federalOriginal} ordinaryOriginalInput={flow.buildGuidedPAOrdinarySourceInput(state)} data={state.sectionData['state-return']} guidedPreview={null} onDataChange={next=>{latest=flow.updateSectionData(state,'state-return',next);setState(latest);}}/>;}
 const dom=await mountGuidedPanel(<Harness/>);try{expect(flow.buildGuidedPAOrdinarySourceInput(latest)?.paOrdinaryReturnFacts).toBeUndefined();await dom.click('Confirm actual PA resident-credit originals after the last edit');const saved=paResidentCreditRootData(latest).paOrdinaryReturnCompletionSources;
  expect(saved.otherStateTaxes.residentCreditDraft?.sourceFactsConfirmed).toBe(true);expect(saved.otherStateTaxes.residentCreditSources?.sourceFactsConfirmed).toBe(true);expect(saved.sourceFactsConfirmed).toBeNull();
  await dom.click('Confirm actual PA completion sources after the last edit');expect(paResidentCreditRootData(latest).paOrdinaryReturnCompletionSources.sourceFactsConfirmed).toBe(true);expect(flow.validateSection(latest,'state-return').status).toBe('complete');
  flow.saveGuidedFlowState(window.localStorage,'pa-credit-root-buttons',latest);const loaded=required(flow.loadGuidedFlowState(window.localStorage,'pa-credit-root-buttons'));expect(paResidentCreditRootData(loaded).paOrdinaryReturnCompletionSources.otherStateTaxes.residentCreditDraft).toEqual(paResidentCreditRootData(latest).paOrdinaryReturnCompletionSources.otherStateTaxes.residentCreditSources);
 }finally{await dom.dispose();window.localStorage.clear();}
});
it('whole PA state panel retains unknown private draft through saved reopening',async()=>{
 const f=paResidentCreditRootFixture(),data=f.data.paOrdinaryReturnCompletionSources,draft=required(data.otherStateTaxes.residentCreditDraft);data.sourceFactsConfirmed=null;draft.sourceFactsConfirmed=null;const claim=emptyPAResidentCreditClaim(),payment=emptyPAResidentCreditPayment();payment.amountAppliedToTax='0';claim.payments=[payment];draft.claims.push(claim);
 flow.saveGuidedFlowState(window.localStorage,'pa-credit-root-pending',f.state);const savedText=required(window.localStorage.getItem(flow.getGuidedFlowStorageKey('pa-credit-root-pending'))),loaded=required(flow.loadGuidedFlowState(window.localStorage,'pa-credit-root-pending')),before=structuredClone(loaded);let changes=0;
 const dom=await mountGuidedPanel(<SectionStateReturn stateCode="PA" taxYear={2025} originalInput={f.federalOriginal} ordinaryOriginalInput={flow.buildGuidedPAOrdinarySourceInput(loaded)} data={loaded.sectionData['state-return']} guidedPreview={null} onDataChange={()=>{changes++;}}/>);try{
  const retained=required(paResidentCreditRootData(loaded).paOrdinaryReturnCompletionSources.otherStateTaxes.residentCreditDraft),unknown=required(retained.claims[1]);expect(unknown.state).toBe('');expect(unknown.payments[0]?.kind).toBe('');expect(unknown.payments[0]?.w2Index).toBeNull();expect(unknown.payments[0]?.amountAppliedToTax).toBe('0');expect(retained.sourceFactsConfirmed).toBeNull();expect(savedText).toContain('residentCreditDraft');expect(savedText).toContain('originalFederalSources');expect(changes).toBe(0);expect(flow.validateSection(loaded,'state-return').status).toBe('partial');expect(()=>buildGuidedStateOriginals(f.federalOriginal,loaded)).toThrow();expect(loaded).toEqual(before);expect(dom.container.querySelector('textarea')).toBeNull();
 }finally{await dom.dispose();window.localStorage.clear();}
});
it('whole PA panel source edit clears nested and outer confirmation but retains originals',async()=>{
 const f=paResidentCreditRootFixture(),before=structuredClone(f.completion);let latest=f.state;
 function Harness(){const[state,setState]=useState(f.state);return <SectionStateReturn stateCode="PA" taxYear={2025} originalInput={f.federalOriginal} ordinaryOriginalInput={flow.buildGuidedPAOrdinarySourceInput(state)} data={state.sectionData['state-return']} guidedPreview={null} onDataChange={next=>{latest=flow.updateSectionData(state,'state-return',next);setState(latest);}}/>;}
 const dom=await mountGuidedPanel(<Harness/>);try{await dom.change('PA resident-credit original source reference','Changed actual retained original reference');const c=paResidentCreditRootData(latest).paOrdinaryReturnCompletionSources;expect(c.sourceFactsConfirmed).toBeNull();expect(c.otherStateTaxes.residentCreditDraft?.sourceFactsConfirmed).toBeNull();expect(c.otherStateTaxes.residentCreditSources?.sourceFactsConfirmed).toBeNull();expect(c.otherStateTaxes.residentCreditDraft?.originalFederalSources).toEqual(before.otherStateTaxes.residentCreditDraft?.originalFederalSources);expect(c.otherStateTaxes.residentCreditSources?.claims).toEqual(before.otherStateTaxes.residentCreditSources?.claims);expect(flow.validateSection(latest,'state-return').status).toBe('partial');expect(()=>buildGuidedStateOriginals(f.federalOriginal,latest)).toThrow();}finally{await dom.dispose();}
});
it.each(['pending','unequal','zero','missing-facts','stale-original']as const)('actual canonical PA credit rejects edited pending originals while retaining all records: %s',kind=>{
 const f=paResidentCreditRootFixture(),data=f.data.paOrdinaryReturnCompletionSources,draft=required(data.otherStateTaxes.residentCreditDraft);
 if(kind==='pending')draft.sourceFactsConfirmed=null;if(kind==='unequal')draft.sourceReference+=' unequal';if(kind==='zero'){const p=required(required(draft.claims[0]).payments[0]);p.amountAppliedToTax='0';draft.sourceFactsConfirmed=null;}if(kind==='missing-facts')delete f.data.paOrdinaryReturnFacts;if(kind==='stale-original')f.federalOriginal.w2s[0].employer.name+=' actual changed original';
 const before=structuredClone(f.state),inputBefore=structuredClone(f.federalOriginal);expect(()=>buildGuidedStateOriginals(f.federalOriginal,f.state)).toThrow();expect(f.state).toEqual(before);expect(f.federalOriginal).toEqual(inputBefore);if(kind!=='stale-original')expect(flow.validateSection(f.state,'state-return').status).toBe('partial');
});
