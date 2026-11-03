/** Explicit fictional originals, no production defaults. Spec state/pa-resident-credit-root-integration.yaml. */
import {TaxYearInputSchema} from '@/models/inputs';
import type {StateReturnData,GuidedFlowState} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData,buildGuidedW2SourceContext} from '@/lib/guided-interview-bridge';
import {confirmGuidedW2StateLocalSources} from '@/lib/guided-w2-state-local-facts';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAResidentCreditSources} from '@/lib/guided-pa-resident-credit-sources';
import {confirmGuidedPAOrdinaryReturnCompletionSources,type GuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {guidedPAOrdinaryPanelFixture,required} from './guided-pa-ordinary-panels';
import {paGuidedResidentCreditFixture} from './pa-resident-credit-guided';
export function paResidentCreditRootFixture(status:'resident'|'part_year'|'nonresident'='resident',order:'PA_first'|'DE_first'='PA_first'){
 const panel=guidedPAOrdinaryPanelFixture(status),template=paGuidedResidentCreditFixture(status,order),state=panel.state,entry=required(state.sectionData['income-w2']?.entries[0]),w=required(template.input.w2s[0]);
 const originalRows=required(w.stateLocalSources);
 // Explicit complete fictitious W2 original: all unclaimed Box12 amounts known zero.
 Object.assign(entry,{state:w.state,stateWages:w.stateWages,stateWithheld:w.stateTaxWithheld,stateTaxReporting:originalRows.stateReporting,
  allocatedTips:'0',box12CodeD:'0',box12CodeE:'0',box12CodeF:'0',box12CodeG:'0',box12CodeH:'0',box12CodeS:'0',box12CodeAA:'0',box12CodeBB:'0',box12CodeEE:'0',box12CodeT:'0',box12CodeTP:'0',box12CodeTT:'0',treasuryTippedOccupationCodes:[]});
 entry.stateLocalSources={...originalRows,sourceFactsConfirmed:null};
 const confirmationContext=required(buildGuidedW2SourceContext(state));
 entry.stateLocalSources=confirmGuidedW2StateLocalSources(confirmationContext,0,entry.stateLocalSources);
 const federalOriginal=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state)));
 const residency=confirmGuidedPAResidencySources(federalOriginal,template.input.paResidencySources);
 const sourceInput={...federalOriginal,paResidencySources:residency};
 const expected=status==='resident'?'1535':status==='part_year'?'614':'0';
 const ordinaryDraft=structuredClone(template.facts);
 if(status!=='nonresident')ordinaryDraft.disposition={kind:'allocation',sourceReference:'Fictional actual complete refund election after G-L credit',refundRequested:expected,nextYearCreditRequested:'0',donations:[]};
 const facts=confirmGuidedPAOrdinaryReturnFacts(sourceInput,ordinaryDraft);
 const packet=status==='nonresident'?undefined:confirmGuidedPAResidentCreditSources(sourceInput,facts,{...template.packet,sourceFactsConfirmed:null});
 const jurisdictions=structuredClone(template.complete.otherStateTaxes.jurisdictions);
 if(status!=='nonresident')jurisdictions.unshift({state:'NY',sourceReference:'Fictional actual complete NY history knownzero',sourceTaxYear:2025,accountName:sourceInput.taxpayer.primary.firstName+' '+sourceInput.taxpayer.primary.lastName,accountSsn:sourceInput.taxpayer.primary.ssn,completeThroughDate:'2026-03-01',taxPaid:'0',incomeTaxWithheld:'0'});
 const completionDraft:GuidedPAOrdinaryReturnCompletionSources={...template.complete,sourceFactsConfirmed:null,otherStateTaxes:{...template.complete.otherStateTaxes,jurisdictions,...(packet?{residentCreditSources:packet,residentCreditDraft:structuredClone(packet)}:{})}};
 const completion=confirmGuidedPAOrdinaryReturnCompletionSources(sourceInput,completionDraft,facts);
 const data:StateReturnData&{paOrdinaryReturnCompletionSources:GuidedPAOrdinaryReturnCompletionSources}={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:residency,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion};
 state.sectionData['state-return']=data;
 return {state,data,federalOriginal,sourceInput,facts,completion,packet};
}
export function paResidentCreditRootData(state:GuidedFlowState){const d=required(state.sectionData['state-return']);return d as StateReturnData&{paOrdinaryReturnCompletionSources:GuidedPAOrdinaryReturnCompletionSources};}
