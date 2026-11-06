/** New independently fictional complete2025 state sources; no actual user facts or application defaults. */
import {TaxYearInputSchema} from '@/models/inputs';
import {PAResidencySourcesSchema} from '@/models/pa-residency';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {confirmGuidedW2StateLocalSources} from '@/lib/guided-w2-state-local-facts';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts} from '@/lib/guided-ohio-payment-facts';
import {actualOid} from './guided-oid';
import {fictionalMiscOriginal} from './guided-zero-income-misc';
import {confirmZeroIncomeMiscSource} from '@/lib/guided-zero-income-misc-sources';
import {paOrdinaryReturnFixture} from './pa-ordinary-return';
import {paOrdinaryOIDFixture} from './pa-ordinary-oid-sources';
import {completePersonalInfo,completeW2Entry,startCompleteInterview} from '../guided-interview/complete-facts';

/** Deliberately retain the old incomplete facts; no canonical source confirmation. */
export function originalIncompleteTreasury(code:'PA'|'OH'){
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages','investments'],lifeEvents:[],stateCode:code});
 if(!state.sectionData['personal-info'])throw Error('Explicit fictional personal source required');state.sectionData['personal-info'].state=code;
 state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'60000',stateTaxReporting:'single',state:code,stateWages:'60000',stateWithheld:'2000'}]};
 const oid={...actualOid,obligationType:'treasury' as const,originalIssueDiscount:'0',otherPeriodicInterest:'0',treasuryOID:'1000'};
 if(code==='PA')oid.paFacts={sourceReference:'Actual synthetic PA worksheet',factsConfirmed:true,paTaxTreatment:'us_government',strippedBond:false,bondPremiumNettedOnStatement:'0',paBondPremiumAmortization:'0'};
 state.sectionData['income-investments']={interestEntries:[],dividendEntries:[],brokerageEntries:[],oidEntries:[oid]};return state;
}
export function completeTreasuryRouting(code:'PA'|'OH',withTreasury=true,withPayments=false){
 const state=originalIncompleteTreasury(code);
 state.sectionData['personal-info']={...structuredClone(completePersonalInfo),addressLine1:'42 Fictional source road',city:code==='PA'?'Pittsburgh':'Columbus',state:code,zip:code==='PA'?'15213':'43215'};
 const w2=state.sectionData['income-w2']?.entries[0];if(!w2)throw Error('Explicit fictional W2 original required');
 Object.assign(w2,{sourceTaxYear:'2025',socialSecurityWages:'60000',medicareWages:'60000',allocatedTips:'0',box12CodeD:'0',box12CodeE:'0',box12CodeF:'0',box12CodeG:'0',box12CodeH:'0',box12CodeS:'0',box12CodeAA:'0',box12CodeBB:'0',box12CodeEE:'0',box12CodeT:'0'});
 if(!withTreasury)state.sectionData['income-investments']={interestEntries:[],dividendEntries:[],brokerageEntries:[],oidEntries:[]};
 // Explicit fictional actual originals and original receipt precede all snapshots.
 if(withPayments){
  const oid=state.sectionData['income-investments']?.oidEntries?.[0];if(!oid)throw Error('Actual Treasury original required for payment fixture');
  oid.stateTaxReporting='single';oid.stateWithholding=[{state:code,statePayerId:'actual-id',stateWithheld:'0.10'}];
  const misc=confirmZeroIncomeMiscSource(fictionalMiscOriginal(code),2025,'single');
  state.sectionData['state-return']={zeroIncomeMiscSources:[misc],additionalStateWithholding:'0.20',additionalStateWithholdingEntries:[{payer:'Separate actual payer',documentType:'1099-MISC',state:code,taxYear:'2025',amount:'0.20'}],stateEstimatedPayments:[{state:code,date:'2025-04-15',amount:'0.30'}]};
  state.sectionData.deductions={...state.sectionData.deductions,method:'standard',medicalExpenses:'',stateLocalTaxes:'',realEstateTaxes:'',mortgageInterest:'',charitableContributions:'',casualtyLosses:'',otherItemized:'',nonW2IncomeTaxesDeductedElsewhere:'0'};
 }
 const raw=buildTaxInputFromGuidedData(state);if(!raw)throw Error('Explicit fictional Treasury federal source required');const base=TaxYearInputSchema.parse(raw);
 w2.stateLocalSources=confirmGuidedW2StateLocalSources(base,0,{sourceTaxYear:2025,sourceReference:'Fictional current complete W2 original allpages',sourceFactsConfirmed:true,owner:{accountHolder:'primary'},currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,singleOriginalWithoutContinuationConfirmed:true,allOriginalPagesAndCopiesCheckedConfirmed:true,stateReporting:'single',localReporting:'none',legacyScalarProjection:'first_entered_rows',stateRows:[{printedRow:1,sourceReference:'Fictional actual W2 Boxes15-17',state:code,employerStateIDStatus:'reported',employerStateID:'Fictional employer state identifier',wages:'60000',withheld:'2000'}],localRows:[]});
 const current=buildTaxInputFromGuidedData(state);if(!current)throw Error('Explicit fictional confirmed W2 original required');const input=TaxYearInputSchema.parse(current);
 if(code==='PA'){
  const template=paOrdinaryReturnFixture(),oidTemplate=paOrdinaryOIDFixture();
  const owner={accountHolder:'primary' as const,originalTaxpayer:{firstName:input.taxpayer.primary.firstName,lastName:input.taxpayer.primary.lastName,ssn:input.taxpayer.primary.ssn}};
  const oidAndMiscSources={...oidTemplate.oidAndMiscSources,sourceReference:'Fictional independently complete Treasury acquisition accrual and remittance records',owner,oid:withTreasury?[{...oidTemplate.oidAndMiscSources.oid[0],original:structuredClone(input.form1099OID[0]),withholdingConfirmation:{sourceReference:'Fictional complete original noPAwithholding receipt ledger',actualPaymentToPAConfirmed:withPayments,notRefundedByPayerConfirmed:true}}]:[],miscWithholding:withPayments?[{...oidTemplate.oidAndMiscSources.miscWithholding[0],original:structuredClone(input.form1099Misc[0]),withholdingConfirmation:{sourceReference:'Fictional actual same original payer remittance2026-01-15 asof2026-03-01 paid0.20 notrefunded',actualPaymentToPAConfirmed:true,notRefundedByPayerConfirmed:true}}]:[]};
  const residency=confirmGuidedPAResidencySources(input,PAResidencySourcesSchema.parse({...template.input.paResidencySources,owner,sourceReference:'Fictional full-year PA actual domicile service and original records',interest:[],oidAndMiscSources,wages:[{...template.input.paResidencySources.wages[0],original:structuredClone(input.w2s[0]),payroll:[{sourceReference:'Fictional current annual physical-PA payroll',paidOn:'2025-12-31',serviceFrom:'2025-01-01',serviceThrough:'2025-12-31',grossCompensation:'60000',paServicesCompensation:'60000',outsidePAServicesCompensation:'0'}]}]}));
  const contextual={...input,paResidencySources:residency};
  const facts=confirmGuidedPAOrdinaryReturnFacts(contextual,{...template.facts,payments:{...template.facts.payments,rows:withPayments?[{sourceReference:'Fictional actual distinct estimated receipt0.30',intendedInstallment:1,original:{accountName:input.taxpayer.primary.firstName+' '+input.taxpayer.primary.lastName,accountSsn:input.taxpayer.primary.ssn,taxYear:2025,returnType:'pa40',kind:'estimated',date:'2025-04-15',amount:'0.30',confirmationNumber:'Fictional-PA-estimate-0.30'}}]:[]},timing:{...template.facts.timing,asOfDate:'2026-03-01'},disposition:{kind:'allocation',sourceReference:'Fictional independently specified refund2000-1842',refundRequested:'158',nextYearCreditRequested:'0',donations:[]}});
  const completion=confirmGuidedPAOrdinaryReturnCompletionSources(contextual,{...template.sources,otherStateTaxes:{status:'none_paid',sourceReference:'Fictional complete all-PA services no otherstate payments',allJurisdictionsAndPaymentsReviewedConfirmed:true,jurisdictions:[]}},facts);
  state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',...state.sectionData['state-return'],paResidencySources:residency,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion};
 }else{
  const ohioResidency=confirmGuidedOhioResidencyFacts(input,{taxYear:'2025',sourceReference:'Fictional full-year Ohio domicile Treasury and wage originals',sourceFactsConfirmed:true,allFederalSourcesIncludedConfirmed:true,noBusinessIncomeConfirmed:true,schoolDistrictStatus:'no_ohio_taxing_district_residency',owners:[{accountHolder:'primary',status:'full_year_resident',sourceReference:'Fictional actual Ohio domicile and nontaxing school district records',periods:[{from:'2025-01-01',to:'2025-12-31',domicileState:'OH'}],stateAdditions:[],stateDeductions:[]}]});
  const ohioPayments=confirmGuidedOhioPaymentFacts(input,{taxYear:'2025',sourceReference:'Fictional actual Ohio current account and actual no otherpayments history',sourceFactsConfirmed:true,calendarYearConfirmed:true,allPaymentsIncludedConfirmed:true,paymentRows:withPayments?[{sourceId:'Fictional-OH-estimate-0.30',sourceReference:'Fictional actual original April15 estimate receipt0.30',accountHolder:'primary',taxYear:'2025',returnType:'it1040',kind:'estimated',date:'2025-04-15',amount:'0.30',appliedToThisReturnConfirmed:true,original:{accountName:input.taxpayer.primary.firstName+' '+input.taxpayer.primary.lastName,accountSsn:input.taxpayer.primary.ssn,taxYear:'2025',returnType:'it1040',kind:'estimated',date:'2025-04-15',amount:'0.30',confirmationNumber:'Fictional-OH-receipt-0.30'}}]:[],priorReturn:{status:'no_return',sourceReference:'Fictional Ohio complete account no previousreturn'},priorCreditCarryforward:{status:'none',sourceReference:'Fictional Ohio complete account no priorcredit'},remainingTaxPayment:{status:'no_remaining_tax',sourceReference:'Fictional withholding2000 covers independently stated1217 tax',sourceFactsConfirmed:true},currentTiming:{kind:'expected',expectedDate:'2026-04-15',asOfDate:'2026-04-01'},filingExtension:{kind:'none'},paymentExtension:{kind:'none'},returnKind:'original',specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'},balanceFacts:{sourceReference:'Fictional actual use-tax purchases and refund elections',useTax:'0',outgoingCarryforward:'0',donations:'0'}});
  state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',...state.sectionData['state-return'],ohioResidency,ohioPayments};
 }
 return{state,input};
}
