import {bindGuidedRefundRecoveryInput} from "@/lib/guided-tax-refund-recoveries";
// @vitest-environment node
// Spec: spec/federal/guided-tax-refund-payment-years.yaml.
import sourceFixture from "../../fixtures/guided-tax-refund-payment-years.json";
import {expect,it} from "vitest";
import {saveGuidedFlowState,loadGuidedFlowState,updateSectionData,type GuidedFlowState} from "@/lib/guided-interview-flow";
import {buildTaxInputFromGuidedData,captureGuidedRefundRecoverySources} from "@/lib/guided-interview-bridge";
function storage(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);},clear:()=>values.clear(),key:(i:number)=>[...values.keys()][i]??null,get length(){return values.size;}};}
const localStorage=storage();
function required<T>(value:T|null|undefined):T{if(value==null)throw new Error("Missing synthetic source");return value;}
it("retains unknown zero and original snapshots through recovery",()=>{
 localStorage.clear();
 const state:GuidedFlowState=JSON.parse(JSON.stringify(sourceFixture));
 const data=required(state.sectionData["income-unemployment"]),collection=required(data.refundRecoveries);
 Object.assign(collection,captureGuidedRefundRecoverySources(state),{sourceFactsConfirmed:true});
 saveGuidedFlowState(localStorage,"refund-recovery",state);
 const saved=required(loadGuidedFlowState(localStorage,"refund-recovery"));expect(saved.sectionData["income-unemployment"]).toEqual(data);expect(captureGuidedRefundRecoverySources(saved)).toEqual({originalSources:collection.originalSources,originalDraft:collection.originalDraft});{const o=required(saved.sectionData["income-unemployment"]?.refundRecoveries?.originalSources);expect(()=>bindGuidedRefundRecoveryInput({taxpayer:o.taxpayer,form1099G:o.forms,adjustments:o.adjustments}, saved)).not.toThrow();}expect(buildTaxInputFromGuidedData(saved)).not.toBeNull();
 const original=structuredClone(collection.originalSources),changed=structuredClone(data);
 required(required(changed.entries)[0].refundPaymentBasis).payments=required(required(changed.entries)[0].refundPaymentBasis).payments?.map((payment,i)=>i===0?{...payment,amount:""}:payment);
 const next=updateSectionData(saved,"income-unemployment",changed);saveGuidedFlowState(localStorage,"refund-recovery",next);
 const restored=required(loadGuidedFlowState(localStorage,"refund-recovery")),restoredData=required(restored.sectionData["income-unemployment"]);
 expect(restoredData.entries?.[0].refundPaymentBasis?.payments?.[0].amount).toBe("");expect(restoredData.entries?.[0].priorYearRepaid).toBe("0");
 expect(restoredData.refundRecoveries?.sourceFactsConfirmed).toBeNull();expect(restoredData.refundRecoveries?.originalSources).toEqual(original);expect(buildTaxInputFromGuidedData(restored)).toBeNull();localStorage.clear();
});

import {exportWorkspaceRecovery,importWorkspaceRecovery,type RecoveryDocumentStore} from "@/lib/workspace-recovery";
import {ensureWorkspace} from "@/lib/workspace-storage";
it("encrypts and restores the complete actual collection into a separate workspace",async()=>{
 const store=storage();ensureWorkspace(store,"original-refund");
 const state:GuidedFlowState=JSON.parse(JSON.stringify(sourceFixture)),data=required(state.sectionData["income-unemployment"]),collection=required(data.refundRecoveries);
 Object.assign(collection,captureGuidedRefundRecoverySources(state),{sourceFactsConfirmed:true});saveGuidedFlowState(store,"original-refund",state);
 const documents:RecoveryDocumentStore={read:async()=>null,write:async()=>{},remove:async()=>{}};
 const archive=await exportWorkspaceRecovery(store,"original-refund","Synthetic refund backup password",{documents});
 expect(await archive.text()).not.toContain("111-22-3333");expect(await archive.text()).not.toContain("FixtureOnly");
 const restored=await importWorkspaceRecovery(store,archive,"Synthetic refund backup password",{documents}),flow=required(loadGuidedFlowState(store,restored.workspaceId));
 expect(restored.workspaceId).not.toBe("original-refund");expect(flow.sectionData["income-unemployment"]).toEqual(data);expect(buildTaxInputFromGuidedData(flow)).not.toBeNull();
});
