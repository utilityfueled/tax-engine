/** Separate documentary paper evidence; no tax calculation or trusted client token.
 * Spec: spec/federal/guided-rrta-review-paper.yaml. */
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs';
import type {RRTAPayrollPaperSources} from '@/pdf/rrta-payroll-review-context';
import type {GuidedFlowState} from './guided-interview-flow';
import {buildTaxInputFromGuidedData} from './guided-interview-bridge';
import {buildGuidedStateOriginals} from './guided-state-engine-inputs';
import {rrtaDraftValues,rrtaParentValues,rrtaPaperDraftValues} from './guided-rrta-payroll-sources';
export interface GuidedRRTAPaperDraft{
 sourceTaxYear:string;sourceReference:string;
 noOrdinaryUncollectedMedicareCodesBOrNConfirmed:boolean|null;
 sourceFactsConfirmed:boolean|null;
 capturedOriginal?:{input:TaxYearInput;draftValues:string;parentValues:string};
}
export const emptyGuidedRRTAPaper=():GuidedRRTAPaperDraft=>({sourceTaxYear:'',sourceReference:'',noOrdinaryUncollectedMedicareCodesBOrNConfirmed:null,sourceFactsConfirmed:null});
function stable(value:unknown):unknown{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));return value;}
function exact(value:unknown){return JSON.stringify(stable(value));}
export function updateGuidedRRTAPaper(previous:GuidedRRTAPaperDraft,next:GuidedRRTAPaperDraft){return rrtaPaperDraftValues(previous)===rrtaPaperDraftValues(next)?next:{...next,sourceFactsConfirmed:null};}
function originals(state:GuidedFlowState){
 const input=TaxYearInputSchema.parse(buildGuidedStateOriginals(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)),state));
 if(input.taxpayer.taxYear!==2025||!input.rrtaPayrollSources)throw Error('Paper review requires current confirmed actual2025 railroad originals.');
 return input;
}
function parents(state:GuidedFlowState){const rrta=state.sectionData['additional-deductions']?.rrtaPayrollSources;if(!rrta)throw Error('Actual railroad originals are missing.');return exact({payroll:rrtaDraftValues(rrta),parents:rrtaParentValues(state)});}
function facts(draft:GuidedRRTAPaperDraft){if(draft.sourceTaxYear!=='2025'||!draft.sourceReference.trim()||draft.noOrdinaryUncollectedMedicareCodesBOrNConfirmed!==true)throw Error('Check actual2025 paper originals and explicitly establish no ordinary Box12 B/N Medicare adjustments.');}
/** Capture actual bridge originals only; confirmation is a separate user action. */
export function captureGuidedRRTAPaper(state:GuidedFlowState,draft:GuidedRRTAPaperDraft):GuidedRRTAPaperDraft{
 facts(draft);const input=originals(state);return {...structuredClone(draft),sourceFactsConfirmed:null,capturedOriginal:{input:structuredClone(input),draftValues:rrtaPaperDraftValues(draft),parentValues:parents(state)}};
}
/** Derive the existing paper API's actual originals; never mint or deserialize its token. */
export function readGuidedRRTAPaperSources(raw:TaxYearInput,state:GuidedFlowState|null|undefined):RRTAPayrollPaperSources{
 const draft=state?.sectionData['additional-deductions']?.rrtaPayrollSources?.paperSources;
 if(!state||!draft)throw Error('Capture and confirm the actual railroad paper originals before review.');facts(draft);
 const current=originals(state),saved=draft.capturedOriginal;
 if(draft.sourceFactsConfirmed!==true||!saved||saved.draftValues!==rrtaPaperDraftValues(draft)||saved.parentValues!==parents(state)||exact(saved.input)!==exact(current)||exact(TaxYearInputSchema.parse(raw))!==exact(current))throw Error('Railroad paper originals changed; capture and confirm after the last source edit.');
 return {sourceTaxYear:2025,sourceReference:draft.sourceReference,noOrdinaryUncollectedMedicareCodesBOrNConfirmed:true,originalW2s:structuredClone(current.w2s)};
}
