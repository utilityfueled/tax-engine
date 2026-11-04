// @vitest-environment jsdom
/** Spec: federal/guided-render-analysis.yaml. Actual existing APIs and source outputs only. */
import React from 'react';
import {renderToString} from 'react-dom/server';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {GuidedFlowState} from '@/lib/guided-interview-flow';
const observed=vi.hoisted(()=>({completionReplays:0,loaded:null as GuidedFlowState|null}));
vi.mock('@/lib/guided-oh-reciprocal-wages',async importOriginal=>{
 const actual=await importOriginal<typeof import('@/lib/guided-oh-reciprocal-wages')>();
 return {...actual,buildGuidedOhioReciprocalWages(...args:Parameters<typeof actual.buildGuidedOhioReciprocalWages>){
  if((new Error().stack??'').includes('guidedOhioActualSourceErrors'))observed.completionReplays++;
  return actual.buildGuidedOhioReciprocalWages(...args);
 }};
});
vi.mock('@/lib/guided-interview-flow',async importOriginal=>{
 const actual=await importOriginal<typeof import('@/lib/guided-interview-flow')>();
 return {...actual,loadGuidedFlowState(...args:Parameters<typeof actual.loadGuidedFlowState>){
  const state=actual.loadGuidedFlowState(...args);observed.loaded=state;return state;
 }};
});
import * as flow from '@/lib/guided-interview-flow';
import {computeGuidedPreviewOutcome} from '@/lib/guided-preview-compute';
import {GuidedInterviewShell} from '@/components/guided-interview/guided-interview-shell';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {mountGuidedPanel} from './guided-panel-dom';
import {guidedReciprocalWageFixture,reciprocalRequired as required} from '../../fixtures/guided-oh-reciprocal-wages-complete';
function prepared(withholding='2000.60'){
 const f=guidedReciprocalWageFixture('60000.25',withholding),state=structuredClone(f.state),sections=flow.buildSectionRoute(state.segmentation);
 state.currentSectionIndex=sections.findIndex(x=>x.id==='state-return');state.completedSections=sections.map(x=>x.id);
 return {f,state,sections};
}
function seed(state:GuidedFlowState,id:string){const workspace=createWorkspaceRecord(id);workspace.returnSummary.targetTaxYear=2025;flow.saveGuidedFlowState(localStorage,id,state);return workspace;}
function stateStep(container:HTMLElement){return required([...container.querySelectorAll('button.guided-progress-step')].find(x=>x.textContent==='State Return'));}
let scroll:ReturnType<typeof Object.getOwnPropertyDescriptor>;
beforeEach(()=>{
 localStorage.clear();observed.completionReplays=0;observed.loaded=null;
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});scroll=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollTo');Object.defineProperty(HTMLElement.prototype,'scrollTo',{value:()=>{},configurable:true});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();if(scroll)Object.defineProperty(HTMLElement.prototype,'scrollTo',scroll);else Reflect.deleteProperty(HTMLElement.prototype,'scrollTo');localStorage.clear();});
it.each(['interview','complete','review','final-review']as const)('analyzes completion sources once in one actual whole shell render %s',view=>{
 const{state,sections}=prepared();state.phase=view==='complete'?'complete':'interview';
 if(view==='review'||view==='final-review')state.currentSectionIndex=sections.findIndex(x=>x.id===view);
 const before=structuredClone(state),workspace=seed(state,'actual-render-'+view);observed.completionReplays=0;
 const html=renderToString(<GuidedInterviewShell workspace={workspace} onExitGuided={()=>{}}/>);
 expect(html).toContain('guided-interview-shell');expect(html).toContain('$2,001');
 expect(state).toEqual(before);
 expect(observed.completionReplays).toBe(1);
});
it.each(['confirmed','zero','unknown','owner','year']as const)('preserves actual source status and preview boundary %s',kind=>{
 const{state}=prepared(kind==='zero'?'0':'2000.60');
 if(kind==='unknown')required(state.sectionData['state-return']?.ohioReciprocalWages).sourceFactsConfirmed=null;
 if(kind==='owner')required(state.sectionData['personal-info']).lastName='Different actual household';
 if(kind==='year')state.taxYear=2026;
 const before=structuredClone(state),status=flow.getVisitedSectionStatus(state,'state-return'),preview=computeGuidedPreviewOutcome(state),progress=flow.computeFlowProgress(state),completion=flow.summarizeFlowCompletion(state);
 expect(progress.totalSections).toBe(8);expect(progress.currentSection?.id).toBe('state-return');expect(completion.sections).toEqual(progress.sections);
 if(kind==='confirmed'||kind==='zero'){
  expect(status).toBe('complete');expect(completion.completedSections).toBe(8);expect(completion.needsReviewSections).toBe(0);
  expect(preview.metrics?.agi).toBe('60000.25');expect(preview.metrics?.state).toMatchObject({stateCode:'OH',stateTax:'0',stateRefund:kind==='zero'?'0':'2001',stateWithholding:kind==='zero'?'0':'2001'});
 }else{expect(status).toBe('needs-review');expect(preview.metrics?.state??null).toBeNull();expect(flow.validateSection(state,'state-return').allowSkip).toBe(false);}
 expect(state).toEqual(before);
});
it('revokes actual same-cash native source confirmation without changing originals',async()=>{
 const{state}=prepared(),original=structuredClone(required(state.sectionData['state-return']?.ohioReciprocalWages)),workspace=seed(state,'actual-native-edit');
 const dom=await mountGuidedPanel(<GuidedInterviewShell workspace={workspace} onExitGuided={()=>{}}/>);
 try{
  expect(stateStep(dom.container).classList.contains('guided-progress-step-done')).toBe(true);
  await dom.change('Ohio reciprocal source reference','Actual edited equal-money documentary reference');
  const saved=JSON.parse(required(localStorage.getItem(flow.getGuidedFlowStorageKey(workspace.id)))) as GuidedFlowState,draft=required(saved.sectionData['state-return']?.ohioReciprocalWages);
  expect(draft.sourceFactsConfirmed).toBeNull();expect(draft.originalW2).toEqual(original.originalW2);expect(draft.originalFederalSources).toEqual(original.originalFederalSources);expect(draft.payrollRows).toEqual(original.payrollRows);
  expect(stateStep(dom.container).classList.contains('guided-progress-step-needs-review')).toBe(true);
  expect(dom.container.textContent).toContain('Reciprocal wage sources require current explicit confirmation.');
 }finally{await dom.dispose();}
});
it('revalidates a same-reference current source mutation on the next root render',async()=>{
 const{state}=prepared('0'),workspace=seed(state,'actual-same-reference'),dom=await mountGuidedPanel(<GuidedInterviewShell workspace={workspace} onExitGuided={()=>{}}/>);
 try{
  expect(stateStep(dom.container).classList.contains('guided-progress-step-done')).toBe(true);
  const current=required(observed.loaded),draft=required(current.sectionData['state-return']?.ohioReciprocalWages),original=structuredClone(draft.originalW2);
  draft.sourceFactsConfirmed=null;observed.completionReplays=0;
  await dom.render(<GuidedInterviewShell workspace={{...workspace}} onExitGuided={()=>{}}/>);
  expect(observed.loaded).toBe(current);expect(draft.originalW2).toEqual(original);expect(draft.originalW2?.stateLocalSources?.stateRows?.find(row=>row.state==='OH')?.withheld).toBe('0');
  expect(stateStep(dom.container).classList.contains('guided-progress-step-needs-review')).toBe(true);
  expect(dom.container.textContent).toContain('Reciprocal wage sources require current explicit confirmation.');
  expect(observed.completionReplays).toBeGreaterThan(0);
 }finally{await dom.dispose();}
});
it('keeps actual workspace owner validation isolated on switch',async()=>{
 const a=prepared(),b=prepared();required(b.state.sectionData['personal-info']).lastName='A different actual household';
 const wa=seed(a.state,'actual-owner-a'),wb=seed(b.state,'actual-owner-b'),before=structuredClone(b.state),dom=await mountGuidedPanel(<GuidedInterviewShell workspace={wa} onExitGuided={()=>{}}/>);
 try{
  expect(stateStep(dom.container).classList.contains('guided-progress-step-done')).toBe(true);
  await dom.render(<GuidedInterviewShell workspace={wb} onExitGuided={()=>{}}/>);
  expect(stateStep(dom.container).classList.contains('guided-progress-step-needs-review')).toBe(true);expect(b.state).toEqual(before);
  await dom.render(<GuidedInterviewShell workspace={wa} onExitGuided={()=>{}}/>);
  expect(stateStep(dom.container).classList.contains('guided-progress-step-done')).toBe(true);
 }finally{await dom.dispose();}
});
