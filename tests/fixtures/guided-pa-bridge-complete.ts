/** Explicit fictional counterparts, never real user facts or application defaults.
 * Pension evidence is a proposed finite source method; no unsupported proof is
 * converted into an accepted packet by this fixture or by a read operation.
 */
import {TaxYearInputSchema}from '@/models/inputs';
import {PARetirementSourcesSchema}from '@/models/pa-retirement-sources';
import {PAResidencySourcesSchema}from '@/models/pa-residency';
import {PAOrdinaryReturnFactsSchema}from '@/models/pa-ordinary-return-facts';
import {PAOrdinaryReturnCompletionSourcesSchema}from '@/models/pa-ordinary-return-completion';
import {snapshotPAOrdinaryReturnOriginals}from '@/engine/state/pa-ordinary-return-facts';
import {buildTaxInputFromGuidedData}from '@/lib/guided-interview-bridge';
import {confirmGuidedW2StateLocalSources}from '@/lib/guided-w2-state-local-facts';
import {confirmGuidedPAResidencySources}from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts}from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAOrdinaryReturnCompletionSources}from '@/lib/guided-pa-ordinary-return-completion';
import type {StateReturnData}from '@/lib/guided-interview-flow';
import {completePersonalInfo,completeW2Entry,completeRetirementSource,startCompleteInterview}from '../guided-interview/complete-facts';
import {paOrdinaryReturnFixture}from './pa-ordinary-return';

export function guidedPABridgeComplete(data?:StateReturnData,options?:{itemized?:boolean}){
 const base=paOrdinaryReturnFixture(),pension=data?.additionalStateWithholding==='500',paidEstimates=(data?.stateEstimatedPayments.length??0)>0;
 if(paidEstimates&&JSON.stringify(data?.stateEstimatedPayments)!==JSON.stringify([{state:'PA',date:'2025-04-15',amount:'1000'},{state:'PA',date:'2025-06-15',amount:'1000'}]))throw new Error('This fictional source case has only its two explicitly stated actual receipts');
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:pension?['w2-wages','retirement']:['w2-wages'],lifeEvents:[],stateCode:'PA'});
 state.sectionData['personal-info']={...structuredClone(completePersonalInfo),firstName:'Jane',lastName:'Doe',dateOfBirth:pension?'1960-02-15':'1990-02-15',addressLine1:'42 Fictional PA Road',city:'Pittsburgh',state:'PA',zip:'15213',dependentCount:'0'};
 const entry={...completeW2Entry,sourceTaxYear:'2025',employerName:'Acme Corp',employerEin:'12-3456789',accountHolder:'primary' as const,wages:'60000',federalWithheld:'8000',socialSecurityWages:'60000',socialSecurityWithheld:'3720',socialSecurityTips:'0',allocatedTips:'0',medicareWages:'60000',medicareWithheld:'870',box10DependentCareBenefits:'0',box12CodeD:'0',box12CodeE:'0',box12CodeF:'0',box12CodeG:'0',box12CodeH:'0',box12CodeS:'0',box12CodeAA:'0',box12CodeBB:'0',box12CodeEE:'0',box12CodeT:'0',box12CodeW:'0',stateTaxReporting:'single' as const,state:'PA',stateWages:'60000',stateWithheld:'2000'};
 if(pension)state.sectionData.deductions={...state.sectionData.deductions,nonW2IncomeTaxesDeductedElsewhere:'0'};
 if(options?.itemized)state.sectionData.deductions={method:'itemized',medicalExpenses:'0',stateLocalTaxes:'0',nonW2IncomeTaxesDeductedElsewhere:'0',realEstateTaxes:'0',personalPropertyTaxes:'0',mortgageInterest:'0',mortgageEntries:[],charitableContributions:'0',donationEntries:[],casualtyLosses:'0',otherItemized:'0',investmentInterestExpense:'0',gamblingWinnings:'0',gamblingLosses:'0',gamblingExpenses:'0'};
 state.sectionData['income-w2']={entries:[entry]};
 let raw=buildTaxInputFromGuidedData(state);if(!raw)throw new Error('The explicit fictional complete federal W2 original must be constructible');
 const unconfirmed=TaxYearInputSchema.parse(raw),w2Proof=confirmGuidedW2StateLocalSources(unconfirmed,0,{sourceTaxYear:2025,sourceReference:'Fictional Jane Acme W2 all original pages',sourceFactsConfirmed:true,owner:{accountHolder:'primary'},currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,singleOriginalWithoutContinuationConfirmed:true,allOriginalPagesAndCopiesCheckedConfirmed:true,stateReporting:'single',localReporting:'none',legacyScalarProjection:'first_entered_rows',stateRows:[{printedRow:1,sourceReference:'Fictional Jane Acme original Boxes15-17',state:'PA',employerStateIDStatus:'reported',employerStateID:'Fictional-Acme-PA-employer-account',wages:'60000',withheld:'2000'}],localRows:[]});
 state.sectionData['income-w2']={entries:[{...entry,stateLocalSources:w2Proof}]};
 if(pension)state.sectionData['income-retirement']={entries:[{...completeRetirementSource,payer:'Example Pension',payerTin:'98-7654321',accountHolder:'primary',sourceTaxYear:'2025',accountReference:'Fictional-Jane-Example-Pension-2025',grossDistribution:'5000',taxableAmount:'5000',federalWithheld:'0',employeeContributions:'0',distributionCode:'7',isIraSepSimple:false,stateTaxReporting:'single',state:'PA',stateWithheld:'500',stateDistribution:'5000',localTaxReporting:'none'}]};
 // Construct actual canonical originals before adding the retained generic claim.
 // A subsequent read must reconcile that claim; it cannot count either twice.
 state.sectionData['state-return']={stateEstimatedPayments:structuredClone(data?.stateEstimatedPayments??[]),additionalStateWithholding:''};
 raw=buildTaxInputFromGuidedData(state);if(!raw)throw new Error('The fictional complete original forms must be constructible without a duplicate generic claim');
 const input=TaxYearInputSchema.parse(raw),w=input.w2s[0],t=input.taxpayer.primary;if(!w)throw new Error('Actual fictional Acme W2 missing');
 const residencyDraft=PAResidencySourcesSchema.parse({...base.input.paResidencySources,sourceReference:'Fictional Jane complete2025 domicile/payroll originals',owner:{accountHolder:'primary',originalTaxpayer:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}},residency:{...base.input.paResidencySources.residency,sourceReference:'Fictional Jane PA full-year domicile presence and Pittsburgh school district records'},wages:[{...base.input.paResidencySources.wages[0],originalIndex:0,sourceReference:'Fictional Jane current Acme cash wage original',original:structuredClone(w),payroll:[{sourceReference:'Fictional Jane Acme actual2025 full-year cash payroll',paidOn:'2025-12-31',serviceFrom:'2025-01-01',serviceThrough:'2025-12-31',grossCompensation:'60000',paServicesCompensation:'60000',outsidePAServicesCompensation:'0'}]}],interest:[]});
 const residency=pension?residencyDraft:confirmGuidedPAResidencySources(input,residencyDraft),current={...input,paResidencySources:residency};
 const receiptOwner={accountName:'Jane Doe',accountSsn:'111-22-3333',taxYear:2025,returnType:'pa40',kind:'estimated'};
 const factsDraft=PAOrdinaryReturnFactsSchema.parse({...base.facts,sourceReference:'Fictional Jane complete2025 filing payments and worldwide SP sources',owner:{accountHolder:'primary',originalTaxpayer:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}},originalFederalSources:snapshotPAOrdinaryReturnOriginals(current),payments:{...base.facts.payments,allPaymentsIncludedConfirmed:true,rows:paidEstimates?[{sourceReference:'Fictional actual Jane PA2025 April15 estimate receipt',intendedInstallment:1,original:{...receiptOwner,date:'2025-04-15',amount:'1000',confirmationNumber:'Fictional-Jane-PA2025-April15-1000'}},{sourceReference:'Fictional actual Jane PA2025 June15 estimate receipt',intendedInstallment:2,original:{...receiptOwner,date:'2025-06-15',amount:'1000',confirmationNumber:'Fictional-Jane-PA2025-June15-1000'}}]:[]},timing:{...base.facts.timing,asOfDate:'2026-03-01',remainingTaxPayment:{status:'no_remaining_tax',sourceReference:'Fictional actual PA principal1842 fully paid by Acme withholding2000'}},disposition:{kind:'allocation',sourceReference:'Fictional Jane separately stated full overpayment refund election, no donation or next-year credit',refundRequested:pension?'658':paidEstimates?'2158':'158',nextYearCreditRequested:'0',donations:[]}});
 const facts=pension||paidEstimates?factsDraft:confirmGuidedPAOrdinaryReturnFacts(current,factsDraft);
 const completionDraft=PAOrdinaryReturnCompletionSourcesSchema.parse({...base.sources,sourceReference:'Fictional Jane complete current other-state award care NRK1 local relief sources',sourceTaxYear:2025,sourceFactsConfirmed:true,originalFederalSources:snapshotPAOrdinaryReturnOriginals(current),owner:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn},otherStateTaxes:{status:'none_paid',sourceReference:'Fictional Jane all-jurisdiction zero income-tax payment and withholding account records',allJurisdictionsAndPaymentsReviewedConfirmed:true,jurisdictions:[{state:'NY',sourceReference:'Fictional Jane explicit complete NY account knownzero, not borrowed other-tax evidence',sourceTaxYear:2025,accountName:'Jane Doe',accountSsn:'111-22-3333',completeThroughDate:'2026-03-01',taxPaid:'0',incomeTaxWithheld:'0'}]}});
 const completion=pension||paidEstimates?completionDraft:confirmGuidedPAOrdinaryReturnCompletionSources(current,completionDraft,facts);
 state.sectionData['state-return']={...structuredClone(data??{stateEstimatedPayments:[],additionalStateWithholding:''}),paResidencySources:residency,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion};
 const original=input.form1099R[0];
 const pensionEvidence=pension?{sourceTaxYear:2025,sourceReference:'Fictional Jane actual complete Example Pension original and written plan/current administrator records',sourceFactsConfirmed:true,owner:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn,dateOfBirth:t.dateOfBirth},originalIndex:0,original:structuredClone(original),qualification:{planType:'employer_401a_defined_contribution',planIdentifier:'Fictional Example Pension written qualified employer plan',normalRetirementAge:65,actualRetirementDate:'2025-02-28',distributionDate:'2025-12-31',eligiblePlanConfirmed:true,writtenPlanConfirmed:true,separationOldAgeLongServiceBenefitsConfirmed:true,recurringOrLumpSumRetirementBenefitConfirmed:true,recurringLifetimePaymentsAvailableConfirmed:true,noPreretirementDistributionsExceptPermittedContributionsOrDisabilityConfirmed:true,retirementAgeAndServiceConditionsMetConfirmed:true,allEmployeeContributionsKnownConfirmed:true,paEmployeeContributions:'0',priorRecoveredContributions:'0',noRolloverOrConversionConfirmed:true,noAnnuityInsuranceOrInvestmentContractConfirmed:true,noDeathDisabilityOrSurvivorBenefitConfirmed:true,noESOPKSOPOrExcessContributionConfirmed:true,allOriginalBoxesKnownConfirmed:true,currentUncorrectedNonvoidOriginalConfirmed:true},withholding:{state:'PA',amount:'500',actuallyWithheldConfirmed:true,notRefundedTransferredOrCreditedElsewhereConfirmed:true,sourceReference:'Fictional Example Pension original PA Box14/15 and complete current payer/tax-account remittance records'}}:undefined;
 if(pensionEvidence)residency.retirementSources=fictionalRetirementPacket(pensionEvidence);
 return {state,input:current,facts,completion,pensionEvidence};
}

/** Separately explicit finite plan records, never inferred from Code7 or payer. */
export function guidedPARetirementSourceFixture(){
 const f=guidedPABridgeComplete({stateEstimatedPayments:[],additionalStateWithholding:'500',additionalStateWithholdingEntries:[{payer:'Example Pension',documentType:'1099-R',state:'PA',taxYear:'2025',amount:'500'}]});
 if(!f.pensionEvidence)throw Error('Explicit fictional pension source missing');
 const source=fictionalRetirementPacket(f.pensionEvidence);
 return {...f,source};
}

function fictionalRetirementPacket(evidence:{owner:{firstName:string;lastName:string;ssn:string;dateOfBirth?:string};qualification:{planIdentifier:string}&Record<string,unknown>}&Record<string,unknown>){
 const {planIdentifier,...qualification}=evidence.qualification;
 return PARetirementSourcesSchema.parse({sourceTaxYear:2025,sourceReference:'Fictional Jane complete current eligible employer retirement source packet',sourceFactsConfirmed:true,allOriginalRetirementStatementsIncludedConfirmed:true,
 owner:{accountHolder:'primary',originalTaxpayer:structuredClone(evidence.owner)},
 statements:[{...structuredClone(evidence),qualification:{...structuredClone(qualification),planSource:{sourceReference:planIdentifier},formerEmployer:{name:'Fictional Prior Manufacturing Company',ein:'23-4567890',sourceReference:'Fictional actual former employment records'},administrator:{sourceReference:'Fictional actual former employer administrator written401a criteria and current separation/service records'},formerEmployerDistinctFromCurrentEmploymentConfirmed:true,noReturnToServiceWithSponsoringEmployerConfirmed:true,noEarlyRetirementIncentiveConfirmed:true,noSelfEmploymentOrPartnerPlanConfirmed:true}}]});
}
