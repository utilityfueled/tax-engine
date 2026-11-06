/** Separate explicitly fictional current records and historical MI originals.
 * Never real agency evidence, inferred defaults, or a production read-time refresh.
 */
import {TaxYearInputSchema} from '@/models/inputs';
import {PAResidencySourcesSchema} from '@/models/pa-residency';
import {PAOrdinaryReturnFactsSchema} from '@/models/pa-ordinary-return-facts';
import {PAOrdinaryReturnCompletionSourcesSchema} from '@/models/pa-ordinary-return-completion';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import type {GuidedFlowState,PersonalInfoData,W2EntryData} from '@/lib/guided-interview-flow';
import {startCompleteInterview,completeW2Entry} from '../guided-interview/complete-facts';
import {actualGuidedPARoyaltySources} from './guided-pa-royalty-sources';
import {paRoyaltyTaxRefundFixture} from './pa-royalty-tax-refund-sources';

/** Exact existing desktop/mobile original cohort, moved here without changed values. */
export const royaltyBrowserPersonal={
 standardDeductionFacts:{primaryBlind:false,primaryCanBeClaimedAsDependent:false,primaryDeceased:false,dualStatusAlien:false,nonresidentAlien:false,shortTaxYear:false},
 firstName:'Jordan',lastName:'Example',ssn:'111-22-3333',dateOfBirth:'1990-06-15',usResidencyMonths:'12',stateResidency:'full-year',
 addressLine1:'123 Example St',addressLine2:'',city:'Austin',state:'PA',zip:'78701',dependentCount:'0',dependents:[],
} as const;
export const royaltyBrowserW2={employerName:'Fictional royalty employer',employerEin:'12-3456789',accountHolder:'primary',wages:'200000',federalWithheld:'0',
 socialSecurityWages:'176100',socialSecurityTips:'0',socialSecurityWithheld:'10918.20',medicareWages:'200000',medicareWithheld:'2900',
 box10DependentCareBenefits:'0',box12CodeW:'0',stateTaxReporting:'none'} as const;

export function rawGuidedPARoyaltyCohort(cohort:'workspace'|'browser'='workspace'):GuidedFlowState{
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages','royalties'],lifeEvents:[],stateCode:'PA'});
 if(cohort==='browser'){
  // Existing browser cohort supplies these precise personal/W2 records; no PA address is invented.
  state.sectionData['personal-info']=structuredClone(royaltyBrowserPersonal) as unknown as PersonalInfoData;
  state.sectionData['income-w2']={entries:[structuredClone(royaltyBrowserW2) as W2EntryData]};
 }else state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'200000'}]};
 state.sectionData['income-royalties']=actualGuidedPARoyaltySources();return state;
}

/** Finite current originals are constructed once from independently supplied fictional
 * evidence. This fixture function is never a product confirmation/read helper.
 */
export function guidedPARoyaltyComplete(cohort:'workspace'|'browser'='workspace',corrected=false){
 const state=rawGuidedPARoyaltyCohort(cohort),template=paRoyaltyTaxRefundFixture();
 const historicalData=actualGuidedPARoyaltySources(),sources=actualGuidedPARoyaltySources();
 if(corrected){
  sources.properties[0].expenses[0].amountPaid='149.25';
  sources.properties[0].paTreatment.expenses[0].amountPaid='149.25';
 }
 state.sectionData['income-royalties']=sources;
 const raw=buildTaxInputFromGuidedData(state);if(!raw)throw new Error('Fictional current guided federal originals are required');
 const input=TaxYearInputSchema.parse(raw),t=input.taxpayer.primary,w=input.w2s[0],misc=input.form1099Misc[0];
 if(!w||!misc||!input.royaltyPropertySources)throw new Error('Actual fictional current W2/MISC/property originals are required');
 const owner={firstName:t.firstName,lastName:t.lastName,ssn:t.ssn},accountOwner={accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn};
 const royaltySources={...structuredClone(template.royaltySources),owner:{accountHolder:'primary' as const,originalTaxpayer:owner},
  originalPropertySources:structuredClone(input.royaltyPropertySources),originals:[{...structuredClone(template.royaltySources.originals[0]),originalIndex:0,original:structuredClone(misc)}]};
 const residency=PAResidencySourcesSchema.parse({...structuredClone(template.residency),owner:{accountHolder:'primary' as const,originalTaxpayer:owner},royaltySources,
  sourceReference:'Fictional independently supplied complete Jordan PA domicile and payroll originals',
  residency:{...structuredClone(template.residency.residency),sourceReference:'Fictional Jordan actual PA full-year domicile, abode and presence ledger; mailing address separately retained'},
  wages:[{...structuredClone(template.residency.wages[0]),originalIndex:0,original:structuredClone(w),sourceReference:'Fictional actual retained Jordan W2 original',
   payroll:[{sourceReference:'Fictional actual Jordan PA physical-service payroll original',paidOn:'2025-12-31',serviceFrom:'2025-01-01',serviceThrough:'2025-12-31',grossCompensation:'200000',paServicesCompensation:'200000',outsidePAServicesCompensation:'0'}]}]});
 input.paResidencySources=residency;
 const facts=PAOrdinaryReturnFactsSchema.parse({...structuredClone(template.facts),owner:{accountHolder:'primary',originalTaxpayer:owner},originalFederalSources:snapshotPAOrdinaryReturnOriginals(input),
  payments:{...structuredClone(template.facts.payments),priorReturn:{status:'return',sourceReference:'Fictional Jordan actually filed2024 full-year zero-tax PA40 original',filedConfirmed:true,fullYearResidentConfirmed:true,
   original:{...accountOwner,taxYear:2024,returnType:'pa40',residency:'resident',filingStatus:'S',filedOn:'2025-03-01',taxableIncome:'0',taxForgivenessCredit:'0'}}},
  timing:{...structuredClone(template.facts.timing),remainingTaxPayment:{status:'expected_payment',date:'2026-04-15',amountAppliedToTax:corrected?'6475':'6478',sourceReference:corrected?'Fictional independently supplied corrected PA principal6475':'Fictional independently supplied original PA principal6478'}}});
 const accountIdentity={sourceTaxYear:2025,...accountOwner,state:'MI',sourceReference:'Fictional actual Jordan complete MI account original'};
 const settlement={...structuredClone(template.refund),owner,originalFederalSources:snapshotPAOrdinaryReturnOriginals(input),originalPAResidencySources:structuredClone(residency),originalPAFacts:structuredClone(facts),
  statements:template.refund.statements.map(row=>({...structuredClone(row),originalStatement:structuredClone(misc),withholdingOriginal:{...structuredClone(row.withholdingOriginal),...accountIdentity}})),
  filedReturn:{...structuredClone(template.refund.filedReturn),...accountIdentity},writtenClaim:{...structuredClone(template.refund.writtenClaim),...accountIdentity},agencyAward:{...structuredClone(template.refund.agencyAward),...accountIdentity},refund:{...structuredClone(template.refund.refund),...accountIdentity},account:{...structuredClone(template.refund.account),...accountIdentity}};
 const historicalRaw=buildTaxInputFromGuidedData(rawGuidedPARoyaltyCohort(cohort));
 if(!historicalRaw)throw new Error('Fictional actual historical federal originals required');
 const historicalOriginals=TaxYearInputSchema.parse(historicalRaw);
 const filedFederalHistory={originalFederalSources:snapshotPAOrdinaryReturnOriginals(historicalOriginals),sourceTaxYear:2025,sourceReference:'Fictional actual filed March1 MI1040, W, NR and contemporaneous federal1040/ScheduleE originals',sourceFactsConfirmed:true,
  owner,returnId:settlement.filedReturn.returnId,filedOn:'2026-03-01',filedFederalAGI:'211001',filedFederalRoyaltyNet:'11001',filedMichiganSourceIncome:'0',
  originalGuidedPropertySources:structuredClone(historicalData),originalCopyrightUse:structuredClone(settlement.statements[0].copyrightUse),allFiledOriginalIncomeAndExpenseSourcesReviewedConfirmed:true};
 const historicalExpenseCorrection={sourceTaxYear:2025,sourceReference:'Fictional separately supplied actual March15 copyright legal-expense correction reconciliation',sourceFactsConfirmed:true,
  owner,reviewedOn:'2026-03-15',returnId:settlement.filedReturn.returnId,originalFiledFederalAGI:'211001',currentFederalAGI:'210901',actualAdditionalExpense:'100',
  originalLegalReceipt:structuredClone(historicalData.properties[0].expenses[0]),correctedLegalReceipt:structuredClone(sources.properties[0].expenses[0]),
  originalCopyrightUse:structuredClone(settlement.statements[0].copyrightUse),currentCopyrightUse:structuredClone(settlement.statements[0].copyrightUse),
  allOriginalAndCorrectedIncomeExpensesAndUsesReviewedConfirmed:true,michiganTaxableIncomeEffect:'0',michiganTaxEffect:'0',
  amendmentReview:{sourceReference:'Fictional actual complete source review and no-MI-effect amendment determination March15',reviewedOn:'2026-03-15',allFederalAndMichiganAdjustmentsReviewedConfirmed:true,determination:'no_michigan_taxable_income_change',noMichiganAmendmentRequiredConfirmed:true},
  completeAccountAfterReview:structuredClone(settlement.account)};
 const refund={...settlement,filedFederalHistory,...(corrected?{historicalExpenseCorrection}:{})};
 const canonicalCompletion=PAOrdinaryReturnCompletionSourcesSchema.parse({...structuredClone(template.completion),owner,originalFederalSources:snapshotPAOrdinaryReturnOriginals(input),otherStateTaxes:{...structuredClone(template.completion.otherStateTaxes),
  jurisdictions:[{...accountIdentity,completeThroughDate:'2026-03-20',taxPaid:'0',incomeTaxWithheld:'80.20'}],refundedRoyaltySources:settlement}});
 const completion={...canonicalCompletion,otherStateTaxes:{...canonicalCompletion.otherStateTaxes,refundedRoyaltySources:refund}};
 const stateData={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:residency,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion};
 // Proposal documentary fields are a typed structural extension in this test-only fixture.
 // Existing strict canonical method is expected to expose the absent history successor.
 state.sectionData['state-return']=stateData;
 return {state,input,facts,completion,refund,filedFederalHistory,historicalExpenseCorrection,historicalData};
}

/** Existing reviewed B control: no proposal history extension, original unedited sources only. */
export function guidedPARoyaltyLegacyBControl(cohort:'workspace'|'browser'='workspace'){
 const f=guidedPARoyaltyComplete(cohort),{filedFederalHistory:_history,...originalB}=f.refund;
 const data=f.state.sectionData['state-return'];if(!data?.paOrdinaryReturnCompletionSources)throw new Error('Actual fictional complete packet required');
 data.paOrdinaryReturnCompletionSources.otherStateTaxes.refundedRoyaltySources=originalB;
 return f;
}
