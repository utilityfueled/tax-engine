/** Independently authored fictional originals. Never application defaults or inferred settlement. */
import {Form1099BSchema,TaxYearInputSchema,type TaxYearInput} from '@/models/inputs';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import type {GuidedFlowState} from '@/lib/guided-interview-flow';
import {completeInterestSource,completeDividendSource,completeBrokerageSource,startCompleteInterview} from '../guided-interview/complete-facts';
import {paOrdinaryReturnFixture} from './pa-ordinary-return';

export type Residency='resident'|'part_year'|'nonresident';
export function incompleteInvestmentWithholdingState(){
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['investments'],lifeEvents:[],stateCode:null});
 if(!state.sectionData.deductions)throw Error('Existing fictional deductions missing');
 state.sectionData.deductions.nonW2IncomeTaxesDeductedElsewhere='0';state.segmentation.stateCode='PA';
 state.sectionData['income-investments']={interestEntries:[{...completeInterestSource,stateTaxReporting:'single',state:'PA',stateWithheld:'0.10'}],dividendEntries:[{...completeDividendSource,stateTaxReporting:'single',state:'PA',stateWithheld:'0.20'}],brokerageEntries:[{...completeBrokerageSource,stateTaxReporting:'single',state:'NY',stateWithheld:'400'}]};
 return state;
}
export function currentInvestmentOriginals(state=incompleteInvestmentWithholdingState()){
 const input=buildTaxInputFromGuidedData(state);if(!input)throw Error('Complete fictional raw investment originals required');return TaxYearInputSchema.parse(input);
}
/** Supplied independently as a fictional filed NY return, paid refund and current agency statement. */
export function unsupportedFiledReturnNYInvestmentAccount(input:TaxYearInput){
 const t=input.taxpayer.primary,owner={state:'NY',sourceTaxYear:2025,accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn};
 return {...owner,sourceReference:'Fictional complete NY refund packet with received bank credit',sourceFactsConfirmed:true,
  filedReturn:{...owner,sourceReference:'Fictional original filed IT203 all pages and schedules',returnId:'fictional-NY-original-2025-Jordan',returnType:'IT-203',returnKind:'original',filingStatus:'single',residency:'nonresident',filedOn:'2026-02-01',allIncomeClassesAndAdjustmentsReviewedConfirmed:true,allNonpaymentCreditsReviewedConfirmed:true,personalNonbusinessIntangiblesOnlyConfirmed:true,noOtherNYSourceIncomeConfirmed:true,federalIncome:'0',newYorkSourceIncome:'0',taxBeforeCredits:'0',nonpaymentCredits:'0',finalTaxLiability:'0',withholdingReported:'400',refundRequested:'400'},
  payments:[{...owner,sourceReference:'Fictional actual broker payment to NY account',confirmationNumber:'fictional-NY-broker-payment-400',date:'2025-12-31',form:'1099-B',originalIndex:0,original:structuredClone(input.form1099B[0]),amount:'400',actualPaymentToStateConfirmed:true}],
  refunds:[{...owner,sourceReference:'Fictional independent March1 bank credit of actual NY refund',confirmationNumber:'fictional-NY-received-refund-400',date:'2026-03-01',amount:'400',kind:'received_refund',actualReceiptConfirmed:true}],
  account:{...owner,sourceReference:'Fictional NY agency account complete through April15',completeThroughDate:'2026-04-15',allPaymentsRefundsTransfersOffsetsReviewedConfirmed:true,noAmendmentsAssessmentsOrOtherAdjustmentsConfirmed:true,noTransfersOrOffsetsConfirmed:true,netTaxPaymentsReported:'0',unpaidTaxReported:'0',overpaymentOutstandingReported:'0'},
 };
}
/** Explicit new fictional claim/certificate/receipt records, separate from unsupported V1 form credit. */
export function settledNYInvestmentAccount(input:TaxYearInput){
 const old=unsupportedFiledReturnNYInvestmentAccount(input),owner={state:old.state,sourceTaxYear:old.sourceTaxYear,accountName:old.accountName,accountSsn:old.accountSsn};
 const claimId='fictional-NY-written-erroneous-payment-claim-400',determinationId='fictional-NY-allowed-claim-certificate-400';
 return {...old,
  sourceReference:'Fictional actual separately allowed erroneous-income-tax-payment claim and received principal',
  filedReturn:{...old.filedReturn,sourceReference:'Fictional original filed IT203 all pages, no B credit or form refund claimed',withholdingReported:'0',refundRequested:'0'},
  erroneousPaymentClaim:{...owner,sourceReference:'Fictional actual signed written erroneous-income-tax-payment claim with remittance records',claimId,submittedOn:'2026-02-05',kind:'erroneous_income_tax_payment',returnId:old.filedReturn.returnId,amountClaimed:'400',paymentConfirmationNumbers:[old.payments[0].confirmationNumber],actualWrittenClaimSubmittedConfirmed:true,notClaimedAsReturnWithholdingConfirmed:true},
  agencyDetermination:{...owner,sourceReference:'Fictional actual agency notice allowing the separately written erroneous-payment claim',determinationId,claimId,returnId:old.filedReturn.returnId,issuedOn:'2026-02-20',disposition:'allowed_erroneous_income_tax_payment',actualAgencyDeterminationConfirmed:true,commissionerCertificateReference:'Fictional actual commissioner certificate for claim400',actualCommissionerCertificationConfirmed:true,comptrollerApprovalReference:'Fictional actual comptroller approval of certificate400',actualComptrollerApprovalConfirmed:true,principalPaymentAllowed:'400',principalOverpaymentAllowed:'400',refundPrincipalAuthorized:'400',taxLiabilityDetermined:'0'},
  refunds:old.refunds.map(receipt=>({...receipt,sourceReference:'Fictional actual March1 bank credit and agency advice allocating principal400 interest0',claimId,determinationId,principalAmount:'400',interestAmount:'0',actualPrincipalInterestAllocationConfirmed:true})),
 };
}
export function brokeragePacket(input:TaxYearInput,zeroOnly=false){
 const t=input.taxpayer.primary;
 return {sourceTaxYear:2025,sourceReference:'Fictional complete ordinary securities original and acquisition records',sourceFactsConfirmed:true,
  owner:{accountHolder:'primary',originalTaxpayer:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}},allOriginalStatementsIncludedConfirmed:true,noOtherCapitalAdjustmentsConfirmed:true,
  statements:input.form1099B.map((original,originalIndex)=>({originalIndex,sourceTaxYear:2025,sourceReference:'Fictional original brokerage annual statement '+originalIndex,sourceFactsConfirmed:true,currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,original:structuredClone(original),
   transactions:original.transactions.map((transaction,transactionIndex)=>({transactionIndex,sourceReference:'Fictional independently identified original brokerage position '+originalIndex+' '+transactionIndex,sourceFactsConfirmed:true,classification:zeroOnly?'zero_reported_position':'ordinary_security_sale',
    ordinaryPersonalInvestmentSecurityConfirmed:true,notBusinessOrOperatingCapitalConfirmed:true,noGiftInheritanceCompensationOrReorganizationConfirmed:true,noSpecialAdjustmentOrDeferredMethodConfirmed:true,
    securityId:'fictional-security-'+originalIndex+'-'+transactionIndex,originalTransaction:structuredClone(transaction),
    acquisitionSourceReference:zeroOnly?'Fictional broker administrative zero-position acquisition field explanation':'Fictional actual personal security acquisition invoice '+transactionIndex,
    proceedsSourceReference:zeroOnly?'Fictional broker signed zero-row explanation: no economic disposal or income; withholding remitted in error':'Fictional actual executed sale and cash settlement statement '+transactionIndex,
    paBasisSourceReference:zeroOnly?'Fictional broker explanation confirms zero informational basis':'Fictional independently kept PA adjusted basis ledger '+transactionIndex,
    grossProceeds:transaction.proceeds,saleExpenses:'0',paAdjustedBasis:transaction.costBasis,paidOn:transaction.dateSold,
    paBasisFactsConfirmed:true,allSaleExpensesIncludedConfirmed:true,noEconomicDisposalConfirmed:zeroOnly,allReportedAmountsKnownZeroConfirmed:zeroOnly,
   })),
  })),
  withholdingOriginals:[...input.form1099Int.map((original,originalIndex)=>({form:'1099-INT',originalIndex,original:structuredClone(original)})),...input.form1099Div.map((original,originalIndex)=>({form:'1099-DIV',originalIndex,original:structuredClone(original)})),...input.form1099B.map((original,originalIndex)=>({form:'1099-B',originalIndex,original:structuredClone(original)}))].map(row=>({...row,sourceTaxYear:2025,sourceReference:'Fictional remittance and no-payer-refund proof '+row.form+' '+row.originalIndex,sourceFactsConfirmed:true,state:row.original.state??'',amount:row.original.stateWithheld??'',actualPaymentToStateConfirmed:true,notRefundedByPayerConfirmed:true})),
  settledNYAccounts:[] as Array<ReturnType<typeof settledNYInvestmentAccount>>,
 };
}
export function rebindBrokerageFixture(f:ReturnType<typeof paOrdinaryBrokerageFixture>){
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
}
export function paOrdinaryBrokerageFixture(status:Residency='resident'){
 const f=paOrdinaryReturnFixture(status);
 f.input.form1099B=[Form1099BSchema.parse({broker:'Fictional actual securities broker',sourceId:'fictional-current-security-original',taxYear:2025,payerTin:'12-3456790',accountHolder:'primary',state:'PA',stateWithheld:'0',federalWithheld:'0',transactions:[{description:'Fictional personally purchased listed ordinary stock A',dateAcquired:'2024-01-02',dateSold:'2025-03-31',proceeds:'1000',costBasis:'400',adjustments:'0',holdingPeriod:'long',basisReportedToIRS:false,digitalAsset:false,washSale:false,washSaleDisallowed:'0',sourceDocumentType:'1099-b'},{description:'Fictional personally purchased listed ordinary stock B',dateAcquired:'2024-01-03',dateSold:'2025-09-30',proceeds:'800',costBasis:'400',adjustments:'0',holdingPeriod:'long',basisReportedToIRS:false,digitalAsset:false,washSale:false,washSaleDisallowed:'0',sourceDocumentType:'1099-b'}]})];
 const brokerage=brokeragePacket(f.input),residency=Object.assign(f.input.paResidencySources,{brokerageSources:brokerage});
 const due={resident:'30',part_year:'13',nonresident:'0'}[status];
 f.facts.timing.remainingTaxPayment=due==='0'?{status:'no_remaining_tax',sourceReference:'Fictional independently supplied actual complete principal history'}:{status:'expected_payment',date:'2026-04-15',amountAppliedToTax:due,sourceReference:'Fictional independently written April15 payment election'};
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 return {...f,brokerage,residency};
}
/** Explicit fixture-author confirmation; never executed by normal reads or defaults. */
export function confirmFictionalInvestmentStateSources(state:GuidedFlowState,actualBrokerState:'NY'|'PA'){
 const input=currentInvestmentOriginals(state),f=paOrdinaryReturnFixture('resident'),t=input.taxpayer.primary;
 const row=input.form1099B[0];if(row.state!==actualBrokerState||row.stateWithheld!=='400')throw Error('Actual stated fictional broker original differs');
 const brokerage=brokeragePacket(input,true);
 if(actualBrokerState==='NY')brokerage.settledNYAccounts=[settledNYInvestmentAccount(input)];
 const residency={...f.input.paResidencySources,owner:{accountHolder:'primary',originalTaxpayer:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}},wages:[],
  interest:input.form1099Int.map((original,originalIndex)=>({...f.input.paResidencySources.interest[0],originalIndex,sourceReference:'Fictional complete zero bank credits and current original',original:structuredClone(original),credits:[{sourceReference:'Fictional original December31 bank zero credit entry',creditedOn:'2025-12-31',amount:'0'}]})),
  dividends:input.form1099Div.map((original,originalIndex)=>({originalIndex,sourceTaxYear:2025,sourceReference:'Fictional original complete zero RIC distribution statement',sourceFactsConfirmed:true,original:structuredClone(original),ordinaryPersonalDividendIncomeConfirmed:true,capitalDistributionsFromRegulatedInvestmentCompanyConfirmed:true,noOtherPADividendAdjustmentsConfirmed:true,currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,credits:[{sourceReference:'Fictional complete original December31 zero distribution ledger',creditedOn:'2025-12-31',ordinaryDividends:'0',capitalGainDistributions:'0'}]})),brokerageSources:brokerage};
 const confirmed=confirmGuidedPAResidencySources(input,residency),current={...input,paResidencySources:confirmed};
 f.facts.owner={accountHolder:'primary',originalTaxpayer:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}};
 f.facts.timing={kind:'filed',date:'2026-04-15',asOfDate:'2026-04-15',filingExtension:'none',paymentExtension:'none',returnKind:'original',remainingTaxPayment:{status:'no_remaining_tax',sourceReference:'Fictional complete actual account and zero remaining principal source'}};
 f.facts.disposition=actualBrokerState==='NY'?{kind:'no_overpayment',sourceReference:'Fictional independently written zero PA overpayment election',refundRequested:'0',nextYearCreditRequested:'0',donations:[]}:{kind:'allocation',sourceReference:'Fictional independently written actual400PArefund election',refundRequested:'400',nextYearCreditRequested:'0',donations:[]};
 f.sources.owner={firstName:t.firstName,lastName:t.lastName,ssn:t.ssn};
 f.sources.otherStateTaxes.status=actualBrokerState==='NY'?'actual_payments':'none_paid';
 f.sources.otherStateTaxes.jurisdictions=actualBrokerState==='NY'?[{state:'NY',sourceReference:'Fictional received NY refund and complete current agency history',sourceTaxYear:2025,accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn,completeThroughDate:'2026-04-15',taxPaid:'0',incomeTaxWithheld:'400'}]:[];
 const facts=confirmGuidedPAOrdinaryReturnFacts(current,f.facts),completion=confirmGuidedPAOrdinaryReturnCompletionSources(current,f.sources);
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:confirmed,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion};
}
