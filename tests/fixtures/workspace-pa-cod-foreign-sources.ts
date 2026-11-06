/** NEW fictional Jane source supplements, authored independently of outputs.
 * These were not established by the original federal-only fixture or a real user.
 * No money, timing, disposition or source eligibility is inferred from withholding.
 */
import {guidedCodEmptyNolForeignState}from './guided-cod-empty-nol-foreign';
import {buildTaxInputFromGuidedData}from '@/lib/guided-interview-bridge';
import {TaxYearInputSchema}from '@/models/inputs';
import {PAResidencySourcesSchema}from '@/models/pa-residency';
import {PAOrdinaryReturnFactsSchema}from '@/models/pa-ordinary-return-facts';
import {PAOrdinaryReturnCompletionSourcesSchema}from '@/models/pa-ordinary-return-completion';
import {confirmGuidedPAResidencySources}from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts}from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAOrdinaryReturnCompletionSources}from '@/lib/guided-pa-ordinary-return-completion';
import {snapshotPAOrdinaryReturnOriginals}from '@/engine/state/pa-ordinary-return-facts';
function present<T>(v:T|null|undefined):T{if(v===undefined||v===null)throw Error('Missing explicitly authored fictional Jane original');return v;}
/** Exact old incomplete PA setup retained for a negative admission control. */
export function incompleteWorkspacePACodForeignState(){
 const state=guidedCodEmptyNolForeignState('deduction');state.segmentation.stateCode='PA';
 Object.assign(present(state.sectionData['personal-info']),{state:'PA',city:'Pittsburgh',zip:'15222',stateResidency:'full-year'});
 const wage=present(present(state.sectionData['income-w2']).entries[0]);
 Object.assign(wage,{stateTaxReporting:'single',state:'PA',stateWages:wage.wages,stateWithheld:'4000'});
 return state;
}
/** Complete new source records are explicit synthetic documents, not a claim that
 * a prior missing packet already contained these facts or that a return was filed. */
export function completeWorkspacePACodForeignState(){
 const state=incompleteWorkspacePACodForeignState(),input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
 const primary=input.taxpayer.primary,owner={firstName:primary.firstName,lastName:primary.lastName,ssn:primary.ssn};
 const originalDebt=present(input.form1099C[0]),debt=present(present(present(input.form982NolSources).debts)[0]);
 const source=(description:string)=>'NEW fictional Jane original: '+description;
 const residency=confirmGuidedPAResidencySources(input,PAResidencySourcesSchema.parse({
  sourceTaxYear:2025,sourceReference:source('complete 2025 PA domicile/payroll/bank and debt source binder'),sourceFactsConfirmed:null,
  owner:{accountHolder:'primary',originalTaxpayer:owner},
  residency:{status:'resident',sourceReference:source('January1–December31 PA domicile, permanent home,350 presence days and15 temporary travel days'),factsConfirmed:true,
   domicilePeriods:[{from:'2025-01-01',through:'2025-12-31',state:'PA',daysInPA:350}],paPermanentAbodePeriods:[{from:'2025-01-01',through:'2025-12-31'}],outsidePAPermanentAbodePeriods:[],moveAbandonmentNewDomicileAndPresenceConfirmed:false,dec31PrincipalResidenceState:'PA',schoolDistrictCode:'02745',schoolDistrictName:'Pittsburgh'},
  wages:[{originalIndex:0,sourceTaxYear:2025,sourceReference:source('current primary ordinary W2 and complete uncorrected box/payroll records'),sourceFactsConfirmed:true,original:structuredClone(input.w2s[0]),ordinaryCashCompensationOnlyConfirmed:true,noPAFederalCompensationDifferencesConfirmed:true,currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,
   payroll:[{sourceReference:source('annual payroll:95000ordinary PA services paidDecember31'),paidOn:'2025-12-31',serviceFrom:'2025-01-01',serviceThrough:'2025-12-31',grossCompensation:'95000',paServicesCompensation:'95000',outsidePAServicesCompensation:'0'}]}],
  interest:[{originalIndex:0,sourceTaxYear:2025,sourceReference:source('current personal bank statement and complete credited-interest ledger'),sourceFactsConfirmed:true,original:structuredClone(input.form1099Int[0]),ordinaryPersonalBankInterestConfirmed:true,currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,
   credits:[{creditedOn:'2025-03-31',amount:'3000',sourceReference:source('March31 gross ordinary interest credit3000')},{creditedOn:'2025-09-30',amount:'2000',sourceReference:source('September30 gross ordinary interest credit2000')}]}],
  personalDebtDischarges:[{originalIndex:0,sourceTaxYear:2025,sourceReference:source('current creditor original and complete personal loan use/discharge records'),sourceFactsConfirmed:true,owner,original:structuredClone(originalDebt),
   statement:{statementId:present(debt.statementId),creditorTin:present(debt.creditorTin),accountReference:present(debt.accountReference),dischargedOn:'2025-10-01',eventCode:'F',originalTaxYear:2025,sourceReference:source('October1 signed creditor complete legal cancellation agreement'),principalCancelled:'300',interestCancelled:'0',feesCancelled:'0'},
   qualification:{useSourceReference:source('complete consumer living expense proceeds ledger'),legalSourceReference:source('legal discharge and no residual guaranty agreement'),deductionSourceReference:source('current/prior PA returns and expense/basis ledger show no deduction offset or basis'),relationshipSourceReference:source('creditor relationship records show no employment or service consideration'),propertySourceReference:source('complete loan agreement/title-security review: no collateral of any kind and no property or cash transferred'),
    noCollateralOfAnyKindConfirmed:true,legallyDischargedConfirmed:true,noResidualGuarantyPaymentConfirmed:true,allCancelledChargesIncludedConfirmed:true,purelyPersonalLivingUseConfirmed:true,noBusinessRentalInvestmentUseOrSecurityConfirmed:true,noCurrentOrPriorPADeductionOffsetOrBasisConfirmed:true,noEmploymentOrServiceConsiderationConfirmed:true,noPropertyTransferConfirmed:true,noCashPropertyOrNewBorrowingAtDischargeConfirmed:true}}],
  foreignBankTaxSources:[{originalIndex:0,sourceTaxYear:2025,sourceReference:source('ordinary personal bank original and complete Canadian USD paid-tax records'),sourceFactsConfirmed:true,owner,original:structuredClone(input.form1099Int[0]),originalTaxYear:2025,foreignCountry:'Canada',jurisdictionKind:'foreign_country',ordinaryPersonalInterestOnlyConfirmed:true,allForeignTaxReceiptsIncludedConfirmed:true,
   payments:[{sourceReference:source('September15 Canadian USD100 tax receipt; separate from bank interest credit dates'),receiptNumber:'NEW-JANE-CANADA-USD100',paidOn:'2025-09-15',currency:'USD',amount:'100',country:'Canada'}]}],
  otherPAIncomeClassesConfirmedNone:true,otherPAAdjustmentsConfirmedNone:true,
 }));
 const bound={...input,paResidencySources:residency};
 const category=(label:string)=>({status:'known_none' as const,sourceReference:source('complete worldwide '+label+' source review; none received'),entries:[]});
 const facts=confirmGuidedPAOrdinaryReturnFacts(bound,PAOrdinaryReturnFactsSchema.parse({
  sourceTaxYear:2025,sourceReference:source('complete actual filing/household/worldwide/payment and account binder'),sourceFactsConfirmed:null,originalFederalSources:snapshotPAOrdinaryReturnOriginals(bound),owner:{accountHolder:'primary',originalTaxpayer:owner},
  filing:{choice:'S',maritalStatus:'unmarried',aliveEntireYear:true,finalReturnReason:'',noPATaxableIncomeNextYearConfirmed:false,claimedAsDependentOnAnotherReturn:false,dependentChildren:[],otherFederalDependents:[],sourceReference:source('2025 marital/vital/dependency records: unmarried alive full year not claimed, no dependents'),factsConfirmed:true},
  payments:{allPaymentsIncludedConfirmed:true,rows:[],priorReturn:{status:'no_return',sourceReference:source('2024 Washington domicile/no PA-source income and no PA return filing record')},priorCredit:{status:'none',sourceReference:source('prior/current PA account histories show no prior-year credit election, reversal or carryover')}},
  timing:{kind:'filed',date:'2026-04-15',asOfDate:'2026-04-15',filingExtension:'none',paymentExtension:'none',returnKind:'original',remainingTaxPayment:{status:'no_remaining_tax',sourceReference:source('April15 agency account/payment records show no unpaid principal or additional tax-payment receipt; separate from calculated outputs')}},
  useTax:{status:'none',sourceReference:source('complete consumer purchase and tax-paid receipt review: no untaxed taxable purchases')},
  sp:{categories:{'2':category('nontaxable interest/dividend/gain'),'3':category('alimony'),'4':category('insurance/inheritance'),'5':category('gifts/awards/prizes'),'7':category('military'),'8':category('residence-sale gain'),'9':category('educational assistance'),'10':category('other cash/benefits; noncash personal COD is separately excluded')},allWorldwideSourcesCompleteConfirmed:true},
  // Separate written election is a source fact. The literal930 is independently checked, never filled from calculated overpayment.
  disposition:{kind:'allocation',sourceReference:source('signed election requests refund930, next-year credit0 and no donations'),refundRequested:'930',nextYearCreditRequested:'0',donations:[]},
 }));
 const completion=confirmGuidedPAOrdinaryReturnCompletionSources(bound,PAOrdinaryReturnCompletionSourcesSchema.parse({
  sourceTaxYear:2025,sourceReference:source('complete US other-state/credit/care/K1/local and agency-relief records'),sourceFactsConfirmed:null,originalFederalSources:snapshotPAOrdinaryReturnOriginals(bound),owner,
  otherStateTaxes:{status:'none_paid',sourceReference:source('all US other-state account/payroll histories reviewed: none paid; Canada100 is separately recorded foreign tax, not a PA resident credit'),allJurisdictionsAndPaymentsReviewedConfirmed:true,jurisdictions:[]},
  restrictedCredits:{status:'none_available',sourceReference:source('complete award/transfer/carry records: no restricted credits'),allAwardsTransfersCarryforwardsReviewedConfirmed:true,originalAwards:[],originalTransfers:[],originalCarryforwards:[]},
  care:{status:'no_qualifying_expenses',sourceReference:source('complete care/employer benefit records: no qualifying expenses or benefits'),allCarePaymentSourcesReviewedConfirmed:true,allEmployerBenefitsIncludedConfirmed:true,originalCarePayments:[]},
  nrk1:{status:'none_received',sourceReference:source('complete partnership/trust mail and account review: no NRK1'),allReceivedStatementsReviewedConfirmed:true,originalStatements:[]},
  local:{status:'separate_return_required',sourceReference:source('Pittsburgh residence/work local-return obligation records'),allResidentAndWorkJurisdictionsReviewedConfirmed:true,jurisdictions:[{name:'Pittsburgh local earned income tax',sourceReference:source('Pittsburgh resident/work local filing obligation notice'),returnRequired:true}]},
  lateFilingRelief:{status:'no_actual_relief_records',sourceReference:source('complete filing/agency correspondence: no relief records'),allActualReliefSourcesReviewedConfirmed:true,originalAgencyRelief:[]},
 }),facts);
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:residency,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion};
 return state;
}
