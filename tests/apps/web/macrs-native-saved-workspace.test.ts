// spec/federal/macrs-native-first-year-ordinary.yaml#saved-private
import {it,expect,vi} from 'vitest';
import {saveGuidedFlowState,loadGuidedFlowState,getGuidedFlowStorageKey} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {ensureWorkspace,getWorkspace} from '@/lib/workspace-storage';
import {exportWorkspaceRecovery,importWorkspaceRecovery} from '@/lib/workspace-recovery';
import {sanitizeWorkspaceForHostedStorage} from '@/lib/hosted-privacy';
import {macrsFixture} from '../../fixtures/macrs-native-first-year';
function storage():Storage{const v=new Map<string,string>();return{getItem:k=>v.get(k)??null,setItem:(k,x)=>{v.set(k,x);},removeItem:k=>{v.delete(k);},clear:()=>v.clear(),key:n=>[...v.keys()][n]??null,get length(){return v.size;}};}
it('preserves raw unknowns and actual zero in saved per-workspace facts',async()=>{
 const local=storage(),f=macrsFixture();ensureWorkspace(local,'one');ensureWorkspace(local,'unrelated');
 f.facts.macrsAssets!.rows![0].grossCostBasis='';f.facts.macrsAssets!.rows![0].bonusBusinessDeduction='0.00';f.facts.macrsAssets!.rows![0].noHistoryConfirmed=null;
 saveGuidedFlowState(local,'one',f.state);const reloaded=loadGuidedFlowState(local,'one')!;
 expect(reloaded.sectionData['income-self-employment']!.businessFacts!.macrsAssets).toEqual(f.facts.macrsAssets);expect(buildTaxInputFromGuidedData(reloaded)).toBeNull();
 expect(local.getItem(getGuidedFlowStorageKey('unrelated'))).toBeNull();
 const documents={read:vi.fn(async()=>null),write:vi.fn(async()=>{}),remove:vi.fn(async()=>{})};
 const archive=await exportWorkspaceRecovery(local,'one','synthetic-local-recovery',{documents});
 expect(await archive.text()).not.toContain('fictional-invoice-private-marker');expect(await archive.text()).not.toContain('grossCostBasis');
 const restored=await importWorkspaceRecovery(local,archive,'synthetic-local-recovery',{documents});
 expect(restored.workspaceId).not.toBe('one');expect(local.getItem(getGuidedFlowStorageKey(restored.workspaceId))).toBe(local.getItem(getGuidedFlowStorageKey('one')));
 expect(loadGuidedFlowState(local,restored.workspaceId)!.sectionData['income-self-employment']!.businessFacts!.macrsAssets!.rows![0].grossCostBasis).toBe('');
 const workspace={...getWorkspace(local,'one')!,macrsAssets:f.facts.macrsAssets,guidedFlowRaw:JSON.stringify(f.state)};
 const shell=sanitizeWorkspaceForHostedStorage(workspace);expect(JSON.stringify(shell)).not.toMatch(/fictional-invoice|grossCostBasis|originalAsset|macrsAssets|guidedFlowRaw/);
});
it('legacy saved facts remain absent rather than migrated to invented asset records',()=>{const local=storage(),f=macrsFixture();delete f.facts.macrsAssets;delete f.facts.depreciationMethod;saveGuidedFlowState(local,'legacy',f.state);const restored=loadGuidedFlowState(local,'legacy')!;expect(restored.sectionData['income-self-employment']!.businessFacts!.macrsAssets).toBeUndefined();expect(buildTaxInputFromGuidedData(restored)?.form4562).toBeUndefined();});
