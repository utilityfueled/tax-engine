// Spec: spec/federal/guided-mortgage-insurance-prepaid.yaml, saved-recovery
import { expect,it } from 'vitest';
import { exportWorkspaceRecovery,importWorkspaceRecovery,type RecoveryDocumentStore } from '@/lib/workspace-recovery';
import { ensureWorkspace } from '@/lib/workspace-storage';
import { getGuidedFlowStorageKey,initialFlowState } from '@/lib/guided-interview-flow';
import { buildGuidedMortgageInputs } from '@/lib/guided-mortgage-worksheet';
import { confirmedGuidedMortgagePrepaidFixture } from '../../fixtures/guided-mortgage-insurance-prepaid';
it('preserves source snapshots and unknowns through saved and recovery boundaries',async()=>{
  const values=new Map<string,string>();const local={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);},clear:()=>values.clear(),key:(i:number)=>[...values.keys()][i]??null,get length(){return values.size;}};
  const documents:RecoveryDocumentStore={read:async()=>null,write:async()=>{},remove:async()=>{}};
  ensureWorkspace(local,'fictional-prepaid-mortgage');
  const data=confirmedGuidedMortgagePrepaidFixture();
  const unknown=structuredClone(present(present(data.mortgageEntries)[0]));unknown.accountReference='fictional-unresolved-second';unknown.insurancePrepaid={prepaidPremiumPaid:'',mortgageSatisfied:null};unknown.sourceFactsConfirmed=null;
  // Unknown separate entry is deliberately retained, never turned into zero or a complete source.
  present(data.mortgageEntries).push(unknown);
  const state={...initialFlowState,taxYear:2026,sectionData:{deductions:data}};
  const raw=JSON.stringify(state);local.setItem(getGuidedFlowStorageKey('fictional-prepaid-mortgage'),raw);
  const saved=JSON.parse(present(local.getItem(getGuidedFlowStorageKey('fictional-prepaid-mortgage'))));
  expect(saved.sectionData.deductions).toEqual(data);
  const archive=await exportWorkspaceRecovery(local,'fictional-prepaid-mortgage','fictional-strong-recovery-password',{documents});
  expect(await archive.text()).not.toContain('fictional-private-prepaid-policy');
  const restored=await importWorkspaceRecovery(local,archive,'fictional-strong-recovery-password',{documents});
  expect(restored.workspaceId).not.toBe('fictional-prepaid-mortgage');
  const recovered=JSON.parse(present(local.getItem(getGuidedFlowStorageKey(restored.workspaceId))));
  expect(recovered).toEqual(state);expect(local.getItem(getGuidedFlowStorageKey('fictional-prepaid-mortgage'))).toBe(raw);
  expect(()=>buildGuidedMortgageInputs(recovered.sectionData.deductions,2026,'single')).toThrow();
  recovered.sectionData.deductions.mortgageEntries.pop();
  expect(buildGuidedMortgageInputs(recovered.sectionData.deductions,2026,'single').form1098[0].mortgageInsuranceQualification?.prepaidSources?.prepaidPremiumPaid).toBe('9240');
  expect(()=>buildGuidedMortgageInputs(recovered.sectionData.deductions,2025,'single')).toThrow();
});

/** Missing synthetic fixture facts fail the test instead of being cast away. */
function present<T>(value:T|null|undefined):T {if(value==null)throw new Error('Missing synthetic fixture fact');return value;}
