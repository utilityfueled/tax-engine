/** Native documentary handoff only. Spec: spec/federal/guided-rrta-payroll.yaml. */
import {TaxYearInputSchema, type TaxYearInput} from '@/models/inputs';
import {RRTAPayrollSourcesSchema} from '@/models/rrta-payroll-sources';
import {calculateRRTAPayrollSources} from '@/engine/forms/rrta-payroll-sources';
import {getConstants} from '@/models/constants';
import type {GuidedFlowState} from './guided-interview-flow';
type Answer=boolean|null;
export interface GuidedRRTARow {
 sourceId:string;w2SourceId:string;owner:''|'primary'|'spouse';sourceTaxYear:string;sourceReference:string;
 sourceFactsConfirmed:Answer;ordinaryBox1EqualsMedicareCompensationConfirmed:Answer;nonRRTAPayrollBoxesKnownZeroConfirmed:Answer;noRailroadTipsConfirmed:Answer;
 tier1SocialSecurityCompensation:string;tier1MedicareCompensation:string;additionalMedicareTaxWithheld:string;
}
export interface GuidedRRTADraft {
 sourceTaxYear:string;sourceReference:string;sourceFactsConfirmed:Answer;
 allRRTASourcesIncludedConfirmed:Answer;noEmployeeRepresentativeCompensationConfirmed:Answer;noCorrectionsConfirmed:Answer;noOtherRRTATaxAdjustmentsConfirmed:Answer;noSelfEmploymentIncomeConfirmed:Answer;
 sources:GuidedRRTARow[];
 capturedOriginal?:{packet:NonNullable<TaxYearInput['rrtaPayrollSources']>;draftValues:string;parentValues:string};
}
export const emptyGuidedRRTARow=():GuidedRRTARow=>({sourceId:'',w2SourceId:'',owner:'',sourceTaxYear:'',sourceReference:'',sourceFactsConfirmed:null,ordinaryBox1EqualsMedicareCompensationConfirmed:null,nonRRTAPayrollBoxesKnownZeroConfirmed:null,noRailroadTipsConfirmed:null,tier1SocialSecurityCompensation:'',tier1MedicareCompensation:'',additionalMedicareTaxWithheld:''});
export const emptyGuidedRRTA=():GuidedRRTADraft=>({sourceTaxYear:'',sourceReference:'',sourceFactsConfirmed:null,allRRTASourcesIncludedConfirmed:null,noEmployeeRepresentativeCompensationConfirmed:null,noCorrectionsConfirmed:null,noOtherRRTATaxAdjustmentsConfirmed:null,noSelfEmploymentIncomeConfirmed:null,sources:[]});
function ordered(value:unknown):unknown{if(Array.isArray(value))return value.map(ordered);if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,ordered(v)]));return value;}
function exact(value:unknown){return JSON.stringify(ordered(value));}
export function rrtaDraftValues(draft:GuidedRRTADraft){const{capturedOriginal:_original,sourceFactsConfirmed:_confirmed,...facts}=draft;return exact(facts);}
export function rrtaParentValues(state:GuidedFlowState){const additional=state.sectionData['additional-deductions'];return exact({taxYear:state.taxYear,segmentation:state.segmentation,sectionData:{...state.sectionData,'additional-deductions':additional?{...additional,rrtaPayrollSources:undefined}:undefined}});}
export function updateGuidedRRTA(previous:GuidedRRTADraft,next:GuidedRRTADraft):GuidedRRTADraft{return rrtaDraftValues(previous)===rrtaDraftValues(next)?next:{...next,sourceFactsConfirmed:null};}
function sourcePacket(raw:unknown,draft:GuidedRRTADraft){
 const input=TaxYearInputSchema.parse(raw);
 if(input.taxpayer.taxYear!==2025||draft.sourceTaxYear!=='2025')throw Error('Native RRTA sources currently require the actual2025 return.');
 const tips=input.form4137?[input.form4137]:Object.values(input.form4137ByOwner??{}).filter(v=>v!==undefined);
 const {capturedOriginal:_saved,...facts}=draft;
 const packet=RRTAPayrollSourcesSchema.parse({...facts,methodVersion:'ordinary-w2-rrta-v1',sourceTaxYear:2025,sourceFactsConfirmed:true,originalTaxpayer:structuredClone(input.taxpayer),originalTipForms:tips.map(original=>({owner:original.accountHolder,original:structuredClone(original)})),sources:draft.sources.map(row=>{
  if(row.sourceTaxYear!=='2025'||!/^formW2:(0|[1-9][0-9]*)$/.test(row.w2SourceId))throw Error('Choose the actual2025 RRTA W2 source.');
  const index=Number(row.w2SourceId.slice(7));if(!Number.isSafeInteger(index)||!input.w2s[index])throw Error('Actual RRTA W2 source is missing.');
  return {...row,sourceTaxYear:2025,originalW2:structuredClone(input.w2s[index])};
 })});
 calculateRRTAPayrollSources({...input,rrtaPayrollSources:packet},getConstants(2025));return packet;
}
/** Only explicit capture calls this; it returns a draft and never a tax input. */
export function captureGuidedRRTA(raw:unknown,draft:GuidedRRTADraft,parentValues:string):GuidedRRTADraft{
 const packet=sourcePacket(raw,draft);return {...structuredClone(draft),sourceFactsConfirmed:null,capturedOriginal:{packet,draftValues:rrtaDraftValues(draft),parentValues}};
}
/** Real canonical proof and exact current originals are mandatory on every ordinary build. */
export function bindGuidedRRTA(raw:unknown,draft:GuidedRRTADraft,parentValues:string){
 const packet=sourcePacket(raw,draft),saved=draft.capturedOriginal;
 if(draft.sourceFactsConfirmed!==true||!saved||saved.draftValues!==rrtaDraftValues(draft)||saved.parentValues!==parentValues||exact(saved.packet)!==exact(packet))throw Error('Capture and confirm actual RRTA originals after the last source edit.');
 return packet;
}
