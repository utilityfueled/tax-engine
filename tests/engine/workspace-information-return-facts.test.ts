// Spec: spec/federal/workspace-guided-year.yaml#information-return-sample-facts.
import {expect, it} from 'vitest';
import type {WorkspaceDocumentKind, SeededFactId, WorkspaceStructuredFactMachineValue} from '@tax-engine/contracts';
import {buildWorkspaceEngineInput} from '@tax-engine/engine';
import {answerWorkspaceInterviewQuestion, createWorkspaceRecord, getWorkspace, ingestFilesIntoWorkspace, saveWorkspaceSnapshot, syncGuidedFlowToWorkspace, WORKSPACE_STORAGE_KEY} from '../../apps/web/src/lib/workspace-storage';
import {qualifiedWorkspaceLoanContext, workspaceScenarioContext} from '../helpers/workspace-calculation-context';
import {workspaceTaxpayerFixture} from '../helpers/workspace-taxpayer';

const sources: {name:string; kind:WorkspaceDocumentKind; factId:SeededFactId; machineValue:WorkspaceStructuredFactMachineValue}[] = [
  {name:'f1098e.pdf',kind:'1098-e',factId:'student-loan-interest-review',machineValue:{entryKind:'1098-e-summary',lender:'Fictional actual loan statement',studentLoanInterestReceived:'2100',includesOriginationFeesOrCapitalizedInterest:true}},
  {name:'f1099r.pdf',kind:'1099-r',factId:'retirement-distribution-review',machineValue:{entryKind:'1099-r-summary',payer:'Fictional actual retirement statement',grossDistribution:'22000',taxableAmount:'18000',federalWithheld:'1200',distributionCode:'7',iraSepSimple:true}},
  {name:'ssa1099.pdf',kind:'ssa-1099',factId:'social-security-benefits-review',machineValue:{entryKind:'ssa-1099-summary',recipient:'Fictional actual benefits statement',netBenefits:'60000',federalWithheld:'1500'}},
];

function memoryStorage(): Storage {
  const values=new Map<string,string>();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);},clear:()=>values.clear(),key:index=>[...values.keys()][index]??null,get length(){return values.size;}};
}

it('keeps all three manual prompts without inventing source amounts on upload or reload',()=>{
  for(const source of sources){
    const uploaded=ingestFilesIntoWorkspace(createWorkspaceRecord(`blank-${source.kind}`),[{name:source.name,size:12}]);
    expect(uploaded.seededReturn.interviewQuestions).toEqual([expect.objectContaining({id:source.factId,status:'pending',answerText:null})]);
    expect(uploaded.structuredFacts.every(fact=>fact.machineValue===undefined)).toBe(true);
    const answered=answerWorkspaceInterviewQuestion(uploaded,source.factId,'The original statement still needs its actual amounts entered.');
    expect(answered.structuredFacts.every(fact=>fact.machineValue===undefined)).toBe(true);
    expect(answered.enginePreview).toBeNull();
    // Saved pre-fix summaries are rebuilt from originals, rather than trusted.
    const stale={...answered,structuredFacts:[...answered.structuredFacts,{id:'old-invented-fixture',factId:source.factId,label:'Old synthetic summary',kind:'fixture-derived' as const,value:'Historical synthetic value',sourceType:'official-fixture' as const,confidence:'high' as const,sourceDocumentIds:[answered.documents[0]!.id],questionId:null,updatedAt:answered.updatedAt,machineValue:source.machineValue}]};
    const storage=memoryStorage();
    const restored=saveWorkspaceSnapshot(storage,stale);
    const reopened=getWorkspace(storage,restored.id)!;
    // Seed the actual persisted app envelope before any save/hydration call.
    const rawStorage=memoryStorage();
    rawStorage.setItem(WORKSPACE_STORAGE_KEY,JSON.stringify({workspaces:{[stale.id]:stale}}));
    const rawBefore=JSON.parse(rawStorage.getItem(WORKSPACE_STORAGE_KEY)!);
    expect(rawBefore.workspaces[stale.id].structuredFacts.filter((fact:{machineValue?:unknown})=>fact.machineValue).map((fact:{machineValue:unknown})=>fact.machineValue)).toEqual([source.machineValue]);
    const directlyReopened=getWorkspace(rawStorage,stale.id)!;
    expect(directlyReopened.documents).toEqual(answered.documents.map(document=>({...document,blobStorageKey:null})));
    // A read rebuilds the returned record; the next ordinary save persists it.
    expect(JSON.parse(rawStorage.getItem(WORKSPACE_STORAGE_KEY)!).workspaces[stale.id].structuredFacts.some((fact:{machineValue?:unknown})=>fact.machineValue)).toBe(true);
    saveWorkspaceSnapshot(rawStorage,directlyReopened);
    expect(JSON.parse(rawStorage.getItem(WORKSPACE_STORAGE_KEY)!).workspaces[stale.id].structuredFacts.every((fact:{machineValue?:unknown})=>fact.machineValue===undefined)).toBe(true);
    const synced=syncGuidedFlowToWorkspace(stale,[],[]);
    for(const rebuilt of [restored,reopened,directlyReopened,synced]){
      expect(rebuilt.seededReturn.interviewQuestions).toEqual([expect.objectContaining({id:source.factId,status:'answered'})]);
      expect(rebuilt.structuredFacts.every(fact=>fact.machineValue===undefined)).toBe(true);
      expect(rebuilt.enginePreview).toBeNull();
    }
  }
});

// Spec: spec/federal/workspace-guided-year.yaml#information-return-actual-facts.
it('preserves genuine detected information-return amounts and the calculation context gate',()=>{
  for(const source of sources){
    const machineValue=structuredClone(source.machineValue);
    const workspace=ingestFilesIntoWorkspace(createWorkspaceRecord(`actual-${source.kind}`),[{name:'actual-source.pdf',size:12,detectedDocument:{kind:source.kind,taxYear:2025,coverage:'supported',label:'Actual source record',notes:'Explicit fictional source data for this regression',seededFactIds:[source.factId],detectedFacts:[{idSuffix:'actual-original',factId:source.factId,label:'Actual original amounts',value:'Independently supplied source amounts',confidence:'high',machineValue}]}}]);
    const answered=answerWorkspaceInterviewQuestion(workspace,source.factId,'Actual original facts separately supplied and reviewed.');
    const facts=answered.structuredFacts;
    expect(facts.filter(fact=>fact.machineValue).map(fact=>fact.machineValue)).toEqual([machineValue]);
    const restored=saveWorkspaceSnapshot(memoryStorage(),answered);
    expect(restored.structuredFacts.filter(fact=>fact.machineValue).map(fact=>fact.machineValue)).toEqual([machineValue]);
    const taxpayer=workspaceTaxpayerFixture();
    const context=source.kind==='1098-e'?qualifiedWorkspaceLoanContext(facts,taxpayer):workspaceScenarioContext(facts,taxpayer);
    expect(buildWorkspaceEngineInput(answered.documents,answered.returnSummary,facts,taxpayer)).toBeNull();
    expect(buildWorkspaceEngineInput(answered.documents,answered.returnSummary,facts,taxpayer,context)).not.toBeNull();
    const changed=structuredClone(facts); const actual=changed.find(fact=>fact.machineValue)!;
    actual.machineValue={...machineValue,...(source.kind==='1098-e'?{studentLoanInterestReceived:'2101'}:source.kind==='1099-r'?{grossDistribution:'22001'}:{netBenefits:'60001'})} as WorkspaceStructuredFactMachineValue;
    expect(buildWorkspaceEngineInput(answered.documents,answered.returnSummary,changed,taxpayer,context)).toBeNull();
    expect(source.machineValue).toEqual(machineValue);
  }
});
