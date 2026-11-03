// @vitest-environment jsdom
// Spec state/guided-pa-dividend-sources.yaml. Literal receipts and tax oracles precede product.
import React,{useState} from 'react';
import {expect,it} from 'vitest';
import {SectionStateReturn} from '@/components/guided-interview/section-state-return';
import * as flow from '@/lib/guided-interview-flow';
import {buildGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {paOrdinaryInvestmentFixture} from '../../fixtures/pa-ordinary-investment-sources';
import {startCompleteInterview} from '../../guided-interview/complete-facts';
import {mountGuidedPanel} from './guided-panel-dom';

const confirm='Confirm all actual PA source records after the last edit';
function required<T>(v:T|null|undefined):T{if(v==null)throw Error('Actual source missing');return v;}
async function panel(status:'resident'|'part_year'|'nonresident'='resident',existing=false){
 const f=paOrdinaryInvestmentFixture(status),original=structuredClone(f.input),state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages','investments'],lifeEvents:[],stateCode:'PA'});
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:existing?structuredClone(f.residency):{...structuredClone(f.residency),sourceFactsConfirmed:null,dividends:[]},paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.sources};let latest=state;
 function Harness(){const[s,set]=useState(state);const context=(()=>{try{return {...f.input,paResidencySources:buildGuidedPAResidencySources(f.input,s.sectionData['state-return']?.paResidencySources)};}catch{return null;}})();return <SectionStateReturn stateCode="PA" taxYear={2025} filingStatus="single" originalInput={f.input} ordinaryOriginalInput={context} data={s.sectionData['state-return']} guidedPreview={null} onDataChange={next=>{latest=flow.updateSectionData(s,'state-return',next);set(latest);}}/>;}
 const dom=await mountGuidedPanel(<Harness/>);return {f,original,dom,state:()=>latest,data:()=>required(latest.sectionData['state-return']?.paResidencySources)};
}
async function enterActual(dom:Awaited<ReturnType<typeof mountGuidedPanel>>){
 await dom.click('Add actual dividend source');await dom.change('Dividend 1 entered 1099-DIV original','0');await dom.change('Dividend 1 original tax year','2025');await dom.change('Dividend 1 original reference','Fictional complete original fund annual statement');
 for(const [i,date,ordinary,capital,ref]of [[1,'2025-03-31','1000','200','Fictional March dividend and fund distribution'],[2,'2025-09-30','1000','300','Fictional September dividend and fund distribution']]as const){
  await dom.click('Add actual dividend credit 1');await dom.change(`Dividend 1 credit ${i} record reference`,ref);await dom.change(`Dividend 1 credit ${i} actual date`,date);await dom.change(`Dividend 1 credit ${i} actual ordinary dividends`,ordinary);await dom.change(`Dividend 1 credit ${i} actual capital gain distributions`,capital);
 }
 for(const label of ['Ordinary personal investment dividends only','Capital gain distributions are from a regulated investment company','No other PA dividend adjustments in these actual records','Actual final original is uncorrected, nonvoid and not a duplicate','Every original box has been checked, including actual zero or blank boxes','Original facts checked'])await dom.change('Dividend 1: '+label,'true');
}
it.each([['resident','2500','1615'],['part_year','1300','839'],['nonresident','0','184']]as const)('actual PA dividend controls reach saved canonical composition in %s',async(status,dividends,tax)=>{
 const p=await panel(status);try{await enterActual(p.dom);expect(p.data().sourceFactsConfirmed).toBeNull();expect(p.data().dividends?.[0].original).toBeUndefined();await p.dom.click(confirm);expect(p.data().sourceFactsConfirmed).toBe(true);expect(p.data().dividends?.[0].original).toEqual(p.original.form1099Div[0]);
  await p.dom.click('Confirm all actual PA return sources after the last edit');await p.dom.click('Confirm actual PA completion sources after the last edit');
  flow.saveGuidedFlowState(window.localStorage,'pa-dividend-positive',p.state());const saved=required(flow.loadGuidedFlowState(window.localStorage,'pa-dividend-positive')),before=structuredClone(saved),canonical=buildGuidedStateOriginals(p.f.input,saved),r=calculatePAOrdinaryReturn(canonical,required(canonical.paOrdinaryReturnFacts),required(canonical.paOrdinaryReturnCompletionSources));
  expect(r.pa40.dividends.toFixed()).toBe(dividends);expect(r.pa40.taxLiability.toFixed()).toBe(tax);expect(r.readiness.filingEligible).toBe(false);expect(saved).toEqual(before);expect(p.f.input).toEqual(p.original);
  const navigated=flow.jumpToSection(saved,'state-return');expect(navigated.sectionData['state-return']?.paResidencySources).toEqual(p.data());
 }finally{await p.dom.dispose();window.localStorage.clear();}
});
it('actual PA dividend controls preserve unknown and knownzero drafts through reopening',async()=>{
 const p=await panel();try{await p.dom.click('Add actual dividend source');await p.dom.click('Add actual dividend credit 1');await p.dom.change('Dividend 1 credit 1 actual ordinary dividends','0');const before=structuredClone(p.data());expect(before.dividends?.[0]).toMatchObject({originalIndex:null,sourceTaxYear:null,sourceFactsConfirmed:null,ordinaryPersonalDividendIncomeConfirmed:null,credits:[{creditedOn:'',ordinaryDividends:'0',capitalGainDistributions:''}]});
  await p.dom.click(confirm);expect(p.data()).toEqual(before);expect(p.dom.container.querySelector('[role="status"]')?.textContent).not.toContain('confirmed after');
  flow.saveGuidedFlowState(window.localStorage,'pa-dividend-pending',p.state());const loaded=required(flow.loadGuidedFlowState(window.localStorage,'pa-dividend-pending'));expect(loaded.sectionData['state-return']?.paResidencySources).toEqual(before);expect(()=>buildGuidedPAResidencySources(p.f.input,before)).toThrow();
 }finally{await p.dom.dispose();window.localStorage.clear();}
});
it('actual PA dividend controls invalidate edited sources and reject stale originals',async()=>{
 const p=await panel('resident',true);try{const before=structuredClone(p.data());await p.dom.change('Dividend 1 credit 1 actual ordinary dividends','1000.01');expect(p.data().sourceFactsConfirmed).toBeNull();expect(p.data().dividends?.[0].sourceFactsConfirmed).toBeNull();expect(p.data().dividends?.[0].original).toEqual(before.dividends?.[0].original);expect(()=>buildGuidedPAResidencySources(p.f.input,p.data())).toThrow();
  await p.dom.change('Dividend 1 credit 1 actual ordinary dividends','1000');await p.dom.change('Dividend 1: Original facts checked','true');await p.dom.click(confirm);expect(p.data().sourceFactsConfirmed).toBe(true);const confirmed=structuredClone(p.data());p.f.input.form1099Div[0].payer='Equal-dollar changed actual fund';expect(()=>buildGuidedPAResidencySources(p.f.input,p.data())).toThrow(/original|source|stale/i);expect(p.data()).toEqual(confirmed);
 }finally{await p.dom.dispose();}
});
it('actual PA dividend controls remove only the selected source and credit',async()=>{
 const p=await panel('part_year',true);try{const before=structuredClone(p.data());await p.dom.click('Remove dividend 1 credit 1');expect(p.data().dividends?.[0].credits).toEqual([before.dividends?.[0].credits[1]]);expect(p.data().wages).toEqual(before.wages);expect(p.data().interest).toEqual(before.interest);await p.dom.click('Add actual dividend source');await p.dom.click('Remove dividend source 2');expect(p.data().dividends).toHaveLength(1);expect(p.data().dividends?.[0].credits).toEqual([before.dividends?.[0].credits[1]]);expect(p.data().sourceFactsConfirmed).toBeNull();
 }finally{await p.dom.dispose();}
});
