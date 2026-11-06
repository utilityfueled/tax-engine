/** Private web drafts for the unchanged reviewed MI copyright settlement/history method. */
import {z}from 'zod';
import type {TaxYearInput}from '@/models/inputs';
import {TaxYearInputSchema}from '@/models/inputs';
import type {GuidedFlowState}from './guided-interview-flow';
import {buildTaxInputFromGuidedData}from './guided-interview-bridge';
import {snapshotPAOrdinaryReturnOriginals}from '@/engine/state/pa-ordinary-return-facts';
import {GuidedPARoyaltyTaxRefundSourcesSchema,buildGuidedPARoyaltyTaxRefundSources,confirmGuidedPARoyaltyTaxRefundSources,type GuidedPARoyaltyTaxRefundSources}from './guided-pa-royalty-tax-refund-sources';
type History=NonNullable<GuidedPARoyaltyTaxRefundSources['filedFederalHistory']>;
type Correction=NonNullable<GuidedPARoyaltyTaxRefundSources['historicalExpenseCorrection']>;
type Statement=GuidedPARoyaltyTaxRefundSources['statements'][number];
export type MIRoyaltyReceiptDraft={sourceId:string;sourceReference:string;paidDate:string;amountPaid:string;category:string;ordinaryNecessaryForProperty:boolean|null;relatesOnlyToCurrentYear:boolean|null;capitalOrImprovement:boolean|null;personalOrOwnLabor:boolean|null;reimbursed:boolean|null};
export type GuidedPARoyaltyTaxRefundDraft=Omit<GuidedPARoyaltyTaxRefundSources,'filedFederalHistory'|'historicalExpenseCorrection'>&{
 filedFederalHistory:History;historicalExpenseCorrection:Omit<Correction,'originalLegalReceipt'|'correctedLegalReceipt'>&{originalLegalReceipt:Record<string,unknown>;correctedLegalReceipt:Record<string,unknown>};
 correctionStatus:'unknown'|'none'|'reported';
 filedOriginalSelection:{origin:'unknown'|'retained'|'separate_local_return';currentWorkspaceId:string;selectedWorkspaceId:string;selectedOriginalsReviewedConfirmed:boolean|null};
};
function draftSchema(){return GuidedPARoyaltyTaxRefundSourcesSchema.omit({filedFederalHistory:true,historicalExpenseCorrection:true}).extend({
 filedFederalHistory:GuidedPARoyaltyTaxRefundSourcesSchema.shape.filedFederalHistory.unwrap(),historicalExpenseCorrection:GuidedPARoyaltyTaxRefundSourcesSchema.shape.historicalExpenseCorrection.unwrap(),correctionStatus:z.enum(['unknown','none','reported']),filedOriginalSelection:z.object({origin:z.enum(['unknown','retained','separate_local_return']),currentWorkspaceId:z.string(),selectedWorkspaceId:z.string(),selectedOriginalsReviewedConfirmed:z.boolean().nullable()}).strict(),
}).strict();}
const fail=(message:string):never=>{throw Error('Actual MI source collection: '+message);};
const identity=()=>({sourceTaxYear:null,accountName:'',accountSsn:'',state:'',sourceReference:''});
const owner=()=>({firstName:'',lastName:'',ssn:''});
export const emptyMIRoyaltyCopyrightUse=():Statement['copyrightUse']=>({sourceReference:'',propertyId:'',publisherName:'',publicationOriginState:'',publicationFrom:'',publicationThrough:'',allPublicationUsesReviewedConfirmed:null,actualPublicationOriginConfirmed:null,nonbusinessCopyrightConfirmed:null,ownerCommercialDomicileState:'',michiganSourceGross:'',outsideMichiganGross:''});
export const emptyMIRoyaltyAccount=():GuidedPARoyaltyTaxRefundSources['account']=>({...identity(),completeThroughDate:'',allPaymentsRefundsTransfersOffsetsAndAdjustmentsReviewedConfirmed:null,noAmendmentAssessmentOrPendingAdjustmentConfirmed:null,netTaxPaymentsReported:'',unpaidTaxReported:'',overpaymentOutstandingReported:''});
export const emptyMIRoyaltyLegalReceipt=():MIRoyaltyReceiptDraft=>({sourceId:'',sourceReference:'',paidDate:'',amountPaid:'',category:'',ordinaryNecessaryForProperty:null,relatesOnlyToCurrentYear:null,capitalOrImprovement:null,personalOrOwnLabor:null,reimbursed:null});
export function emptyMIRoyaltyStatement():Statement{return{originalIndex:null,sourceReference:'',sourceFactsConfirmed:null,originalStatement:{},copyrightUse:emptyMIRoyaltyCopyrightUse(),withholdingOriginal:{...identity(),date:'',amount:'',confirmationNumber:'',actuallyRemittedConfirmed:null}};}
function emptyHistory():History{return{sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,owner:owner(),originalFederalSources:{},returnId:'',filedOn:'',filedFederalAGI:'',filedFederalRoyaltyNet:'',filedMichiganSourceIncome:'',originalGuidedPropertySources:{},originalCopyrightUse:emptyMIRoyaltyCopyrightUse(),allFiledOriginalIncomeAndExpenseSourcesReviewedConfirmed:null};}
function emptyCorrection():GuidedPARoyaltyTaxRefundDraft['historicalExpenseCorrection']{return{sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,owner:owner(),reviewedOn:'',returnId:'',originalFiledFederalAGI:'',currentFederalAGI:'',actualAdditionalExpense:'',originalLegalReceipt:emptyMIRoyaltyLegalReceipt(),correctedLegalReceipt:emptyMIRoyaltyLegalReceipt(),originalCopyrightUse:emptyMIRoyaltyCopyrightUse(),currentCopyrightUse:emptyMIRoyaltyCopyrightUse(),allOriginalAndCorrectedIncomeExpensesAndUsesReviewedConfirmed:null,michiganTaxableIncomeEffect:'',michiganTaxEffect:'',amendmentReview:{sourceReference:'',reviewedOn:'',allFederalAndMichiganAdjustmentsReviewedConfirmed:null,determination:'',noMichiganAmendmentRequiredConfirmed:null},completeAccountAfterReview:emptyMIRoyaltyAccount()};}
/** Every actual source fact starts unknown, including zero and absent correction. */
export function emptyGuidedPARoyaltyTaxRefundDraft():GuidedPARoyaltyTaxRefundDraft{return{
 sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,completeThroughDate:'',owner:owner(),originalFederalSources:{},originalPAResidencySources:{},originalPAFacts:{},allMIIncomeTaxOriginalsReviewedConfirmed:null,noOtherMIIncomeCreditsPaymentsOrAssessmentsConfirmed:null,statements:[],
 filedReturn:{...identity(),returnId:'',returnKind:'',filingStatus:'',residency:'',filedOn:'',completeReturnScheduleWAndNRConfirmed:null,allIncomeAndAdjustmentsReviewedConfirmed:null,finalTax:'',reportedWithholding:'',totalPayments:'',overpayment:'',refundRequested:'',michiganSourceIncome:'',noOtherPaymentsCreditsOffsetsOrTransfersConfirmed:null},
 writtenClaim:{...identity(),applicationId:'',submittedOn:'',amountRequested:'',fullOriginalPaymentDemandConfirmed:null,actuallySubmittedConfirmed:null},agencyAward:{...identity(),awardId:'',issuedOn:'',applicationId:'',originalReportedStateIncome:'',determinedMichiganSourceIncome:'',determinationReason:'',finalTaxDetermined:'',refundAwarded:'',printedReturnToExactAwardReconciledConfirmed:null,actualAgencyDeterminationConfirmed:null},refund:{...identity(),postedOn:'',receivedOn:'',amount:'',confirmationNumber:'',actuallyReceivedConfirmed:null},account:emptyMIRoyaltyAccount(),filedFederalHistory:emptyHistory(),historicalExpenseCorrection:emptyCorrection(),correctionStatus:'unknown',filedOriginalSelection:{origin:'unknown',currentWorkspaceId:'',selectedWorkspaceId:'',selectedOriginalsReviewedConfirmed:null},
};}
function stable(value:unknown):string{if(Array.isArray(value))return'['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return'{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
/** Existing imported C originals are retained exactly, without a new confirmation. */
export function draftGuidedPARoyaltyTaxRefundSources(raw:unknown):GuidedPARoyaltyTaxRefundDraft{const source=GuidedPARoyaltyTaxRefundSourcesSchema.parse(raw);return{...structuredClone(source),filedFederalHistory:source.filedFederalHistory?structuredClone(source.filedFederalHistory):emptyHistory(),historicalExpenseCorrection:source.historicalExpenseCorrection?structuredClone(source.historicalExpenseCorrection):emptyCorrection(),correctionStatus:source.historicalExpenseCorrection?'reported':source.filedFederalHistory?'none':'unknown',filedOriginalSelection:{origin:'retained',currentWorkspaceId:'',selectedWorkspaceId:'',selectedOriginalsReviewedConfirmed:null}};}
/** No source is discarded; the parent independently invalidates its own confirmation. */
export function updateGuidedPARoyaltyTaxRefundDraft(data:GuidedPARoyaltyTaxRefundDraft,patch:Partial<GuidedPARoyaltyTaxRefundDraft>):GuidedPARoyaltyTaxRefundDraft{return{...data,...patch,sourceFactsConfirmed:null};}
function deepFreeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;}
/** Explicit action only. No read may select, bind or refresh historical records. */
export function captureGuidedPARoyaltyFiledOriginals(draft:GuidedPARoyaltyTaxRefundDraft,choice:{currentWorkspaceId:string;selectedWorkspaceId:string;selectedState:GuidedFlowState|null;selectedOriginalsReviewedConfirmed:boolean|null}):GuidedPARoyaltyTaxRefundDraft{
 if(!choice.currentWorkspaceId.trim()||!choice.selectedWorkspaceId.trim()||choice.currentWorkspaceId===choice.selectedWorkspaceId)fail('known current workspace and a different actual historical return selection required');
 if(choice.selectedOriginalsReviewedConfirmed!==true||!choice.selectedState)return fail('review the actual selected historical original records before capture');
 const source=structuredClone(choice.selectedState),raw=buildTaxInputFromGuidedData(source),properties=source.sectionData['income-royalties'];if(!raw||!properties)return fail('complete independent historical original interview required');
 const original=TaxYearInputSchema.parse(raw);if(original.taxpayer.taxYear!==2025||original.taxpayer.filingStatus!=='single'||!original.royaltyPropertySources)fail('actual finite historical2025 single copyright originals required');
 const captured=deepFreeze(snapshotPAOrdinaryReturnOriginals(original)),guided=deepFreeze(structuredClone(properties));
 return{...draft,sourceFactsConfirmed:null,filedOriginalSelection:{origin:'separate_local_return',currentWorkspaceId:choice.currentWorkspaceId,selectedWorkspaceId:choice.selectedWorkspaceId,selectedOriginalsReviewedConfirmed:true},filedFederalHistory:{...draft.filedFederalHistory,sourceFactsConfirmed:null,originalFederalSources:captured,originalGuidedPropertySources:guided}};
}
function canonical(raw:unknown):GuidedPARoyaltyTaxRefundSources{
 const draft=draftSchema().parse(raw);
 if(draft.correctionStatus==='unknown')return fail('review whether actual historical correction records apply; unknown is not none');
 if(draft.correctionStatus==='none'&&stable(draft.historicalExpenseCorrection)!==stable(emptyCorrection()))return fail('reconcile retained actual correction records before choosing none; originals have not been erased');
 const selection=draft.filedOriginalSelection;
 if(selection.origin==='unknown')fail('independent actual filed originals must be explicitly selected or retained');
 if(selection.origin==='separate_local_return'&&(!selection.currentWorkspaceId.trim()||!selection.selectedWorkspaceId.trim()||selection.currentWorkspaceId===selection.selectedWorkspaceId||selection.selectedOriginalsReviewedConfirmed!==true))fail('actual separate historical original selection is unknown or changed');
 const{correctionStatus:_status,filedOriginalSelection:_selection,historicalExpenseCorrection,...source}=draft;
 return GuidedPARoyaltyTaxRefundSourcesSchema.parse({...source,...(draft.correctionStatus==='reported'?{historicalExpenseCorrection}:{})});
}
/** Explicit child confirmation; C validates every factual history/agency original. */
export function confirmGuidedPARoyaltyTaxRefundDraft(input:TaxYearInput,facts:unknown,draft:GuidedPARoyaltyTaxRefundDraft):{draft:GuidedPARoyaltyTaxRefundDraft;packet:GuidedPARoyaltyTaxRefundSources}{
 const t=input.taxpayer.primary;if(stable(draft.owner)!==stable({firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}))fail('select the actual current owner from the original records before confirmation');
 const source=canonical(draft),packet=confirmGuidedPARoyaltyTaxRefundSources(input,facts,source);
 const next={...draft,...structuredClone(packet),filedFederalHistory:packet.filedFederalHistory?structuredClone(packet.filedFederalHistory):draft.filedFederalHistory,historicalExpenseCorrection:packet.historicalExpenseCorrection?structuredClone(packet.historicalExpenseCorrection):draft.historicalExpenseCorrection};return{draft:next,packet};
}
/** Pending/stale drafts cannot silently vanish before strict canonical projection. */
export function assertGuidedPARoyaltyTaxRefundPair(input:TaxYearInput,facts:unknown,rawDraft:unknown,rawPacket:unknown):GuidedPARoyaltyTaxRefundDraft{
 const draft=draftSchema().parse(rawDraft),source=canonical(draft),packet=GuidedPARoyaltyTaxRefundSourcesSchema.parse(rawPacket);
 if(source.sourceFactsConfirmed!==true||packet.sourceFactsConfirmed!==true||stable(source)!==stable(packet))fail('confirm the exact actual MI draft and source packet after the last edit');
 buildGuidedPARoyaltyTaxRefundSources(input,facts,packet);return draft;
}
