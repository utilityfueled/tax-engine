/** New fictional original evidence. Never a production default or user-data inference. */
import Decimal from 'decimal.js';
import {TaxYearInputSchema} from '@/models/inputs';
import {PAResidencySourcesSchema} from '@/models/pa-residency';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {emptyNecEntry,emptyScheduleCExpenses,type GuidedFlowState} from '@/lib/guided-interview-flow';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {startCompleteInterview} from '../guided-interview/complete-facts';
import {zeroBusinessPendingFixture,fictionalPendingNYBusinessAccount} from './pa-business-pending-account';

/** Exact old positive source setup before the new, explicitly supplied records. */
export function incompleteGuidedZeroBusiness(){
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['self-employment'],lifeEvents:[],stateCode:null});
 const source={...emptyNecEntry,payerName:'Actual client',payerTin:'12-3456789',accountHolder:'primary' as const,nonemployeeCompensation:'0',federalWithheld:'0',stateTaxReporting:'single' as const,state:'PA',stateIncome:'0',stateWithheld:'0'};
 const expenses=Object.fromEntries(Object.keys(emptyScheduleCExpenses).map(key=>[key,'0']))as typeof emptyScheduleCExpenses;
 state.sectionData['income-self-employment']={necEntries:[{...source,stateWithheld:'0.10'},{...source,payerName:'Other client',state:'NY',stateWithheld:'0.20'}],manualGrossReceipts:'0',expenses,businessFacts:{accountHolder:'primary',activityDescription:'Independent design services',businessCode:'541430',accountingMethod:'cash',singleBusinessConfirmed:true,incomeReconciled:true,expensesReconciled:true,returnsAndAllowances:'0',costOfGoodsSold:'0',otherIncome:'0',contractLabor:'0',depreciation:'0',legalAndProfessional:'0',w2WagesPaid:'0',ubiaQualifiedProperty:'0',isSST:false,allInvestmentAtRisk:true,priorYearUnallowedLoss:'0',additionalWorksheetRequired:false},qbiMateriallyParticipated:true};
 const deductions=state.sectionData.deductions;if(!deductions)throw Error('Complete fictional deductions section required');deductions.nonW2IncomeTaxesDeductedElsewhere='0';state.segmentation.stateCode='PA';return state;
}
/** The two actual fictional originals separately state2025; never infer from state.taxYear. */
const fictionalOriginalYears=[{payer:'Actual client',payerTin:'12-3456789',accountHolder:'primary',sourceTaxYear:'2025',sourceReference:'Fictional actual current2025 Actual client original full all-box pages'},
 {payer:'Other client',payerTin:'12-3456789',accountHolder:'primary',sourceTaxYear:'2025',sourceReference:'Fictional actual current2025 Other client original full all-box pages'}] as const;
/** Explicit action supplying new complete source records, never called from a read. */
export function completeGuidedBusinessPA(state:GuidedFlowState,mode:'pending_ny'|'all_pa'):void{
 const businessData=state.sectionData['income-self-employment'];if(!businessData||businessData.necEntries.length!==2||state.taxYear!==2025||state.segmentation.filingStatus!=='single')throw Error('This explicit fictional source case has two2025 primary zero-income originals only');
 for(const [i,entry]of businessData.necEntries.entries()){
  const proof=fictionalOriginalYears[i];if(!proof||entry.payerName!==proof.payer||entry.payerTin!==proof.payerTin||entry.accountHolder!==proof.accountHolder||entry.state!==(i===1&&mode==='pending_ny'?'NY':'PA')||!new Decimal(entry.nonemployeeCompensation).isZero()||!new Decimal(entry.federalWithheld).isZero()||!new Decimal(entry.stateIncome).isZero()||!new Decimal(entry.stateWithheld).eq(i===0?'0.10':'0.20'))throw Error('Current originals do not match these independently supplied fictional records');
 }
 // New original-year evidence only. All original amount/payer/TIN/owner fields are retained.
 businessData.necEntries=businessData.necEntries.map((entry,i)=>({...entry,sourceTaxYear:fictionalOriginalYears[i].sourceTaxYear}));
 const raw=buildTaxInputFromGuidedData(state);if(!raw)throw Error('Actual current business federal original is incomplete');
 const input=TaxYearInputSchema.parse(raw),template=zeroBusinessPendingFixture('resident',false),t=input.taxpayer.primary;
 if(!input.scheduleC)throw Error('Actual current ScheduleC original required');
 const owner={accountHolder:'primary' as const,originalTaxpayer:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}};
 const business={...structuredClone(template.business),sourceReference:'Fictional Jordan full-year PA actual separate zero-income commercial books, bank statements, zero expense and noNY operation records',owner,originalScheduleC:structuredClone(input.scheduleC),necOriginals:input.form1099Nec.map((original,originalIndex)=>({originalIndex,sourceTaxYear:2025,sourceReference:fictionalOriginalYears[originalIndex].sourceReference+' plus original payer/remittance review',sourceFactsConfirmed:true,currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,original:structuredClone(original)})),...(mode==='pending_ny'?{pendingNYAccountSources:fictionalPendingNYBusinessAccount(input)}:{})};
 const draft=PAResidencySourcesSchema.parse({...template.input.paResidencySources,sourceReference:'Fictional Jordan complete PA domicile/abode/presence and noNY current source records',owner,wages:[],interest:[],businesses:[business]});
 // The normal explicit action receives bare current federal originals and the
 // separately supplied actual packet. Reads independently replay without refresh.
 const residency=confirmGuidedPAResidencySources(input,draft),current={...input,paResidencySources:residency};
 const facts=confirmGuidedPAOrdinaryReturnFacts(current,{...template.facts,sourceReference:'Fictional Jordan complete current zero-income filing/payment/eligibility records',owner,filing:{...template.facts.filing,sourceReference:'Fictional Jordan unmarried alive entire year dependency records'},timing:{...template.facts.timing,asOfDate:'2026-04-15',remainingTaxPayment:{status:'no_remaining_tax',sourceReference:'Fictional explicit complete zero PA principal, no unpaid remaining tax'}},disposition:{kind:'no_overpayment',sourceReference:'Fictional explicit no printed overpayment disposition; no cash refund inferred',refundRequested:'0',nextYearCreditRequested:'0',donations:[]}});
 const completion=confirmGuidedPAOrdinaryReturnCompletionSources(current,{...template.sources,sourceReference:'Fictional Jordan complete actual other-tax credit award care local and relief records',owner:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn},otherStateTaxes:{status:mode==='pending_ny'?'actual_payments':'none_paid',sourceReference:mode==='pending_ny'?'Fictional actual complete NY credited .20, no refunds and outstanding .20 agency original':'Separate fictional corrected allPA originals and complete actual noNYpayment account history',allJurisdictionsAndPaymentsReviewedConfirmed:true,jurisdictions:[{state:'NY',sourceReference:mode==='pending_ny'?'Fictional current April15 NY agency original paid .20/refund0/outstanding.20':'Fictional separate actual corrected-original current NY account with no remittances or refunds',sourceTaxYear:2025,accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn,completeThroughDate:'2026-04-15',taxPaid:mode==='pending_ny'?'0.20':'0',incomeTaxWithheld:mode==='pending_ny'?'0.20':'0'}]}},facts);
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:residency,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion};
}
