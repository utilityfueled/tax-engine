/** New complete fictional sources, pinned before composer outputs. Never production defaults. */
import { PAOrdinaryReturnFactsSchema } from '@/models/pa-ordinary-return-facts.js';
import { snapshotPAOrdinaryReturnOriginals } from '@/engine/state/pa-ordinary-return-facts.js';
import { paOrdinaryReturnFactsFixture } from './pa-ordinary-return-facts.js';
import { paReciprocityFixture } from './pa-reciprocity.js';
import { fictionalEmptyEicHistory } from './eic-disallowance.js';
import type { TaxYearInput } from '@/models/inputs.js';
function completion(input:TaxYearInput,asOfDate:string){
 const t=input.taxpayer.primary;
 return {sourceTaxYear:input.taxpayer.taxYear,sourceReference:'Fictional complete current ordinary eligibility records',sourceFactsConfirmed:true,
  originalFederalSources:snapshotPAOrdinaryReturnOriginals(input),owner:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn},
  otherStateTaxes:{status:'none_paid',sourceReference:'Fictional complete other-state payment records',allJurisdictionsAndPaymentsReviewedConfirmed:true,
   jurisdictions:[{state:'NY',sourceReference:'Fictional signed complete NY payment history',sourceTaxYear:input.taxpayer.taxYear,accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn,completeThroughDate:asOfDate,taxPaid:'0',incomeTaxWithheld:'0'}]},
  restrictedCredits:{status:'none_available',sourceReference:'Fictional complete award transfer and carryforward records',allAwardsTransfersCarryforwardsReviewedConfirmed:true,originalAwards:[] as Array<Record<string,unknown>>,originalTransfers:[] as Array<Record<string,unknown>>,originalCarryforwards:[] as Array<Record<string,unknown>>},
  care:{status:'no_qualifying_expenses',sourceReference:'Fictional complete care payment and employer-benefit records',allCarePaymentSourcesReviewedConfirmed:true,allEmployerBenefitsIncludedConfirmed:true,originalCarePayments:[] as Array<Record<string,unknown>>},
  nrk1:{status:'none_received',sourceReference:'Fictional complete partnership and trust statement records',allReceivedStatementsReviewedConfirmed:true,originalStatements:[] as Array<Record<string,unknown>>},
  local:{status:'separate_return_required',sourceReference:'Fictional local residence and work obligation sources',allResidentAndWorkJurisdictionsReviewedConfirmed:true,jurisdictions:[{name:'Fictional PA local taxing jurisdiction',sourceReference:'Fictional municipal residence and work obligation record',returnRequired:true}]},
  lateFilingRelief:{status:'no_actual_relief_records',sourceReference:'Fictional filing and agency correspondence records',allActualReliefSourcesReviewedConfirmed:true,originalAgencyRelief:[] as Array<Record<string,unknown>>},
 };
}
export function paOrdinaryReturnFixture(status:'resident'|'part_year'|'nonresident'='resident',year=2025){
 const f=paOrdinaryReturnFactsFixture(status,year);const facts=PAOrdinaryReturnFactsSchema.parse({...f.facts,timing:{...f.facts.timing,remainingTaxPayment:{status:'no_remaining_tax',sourceReference:'Fictional withholding pays complete principal'}}});
 return {input:f.input,facts,sources:completion(f.input,facts.timing.asOfDate)};
}
/** Independently stated new W2/payroll and actual employer exception originals. */
export function paOrdinaryReturnReciprocalFixture(){
 const f=paReciprocityFixture();const t=f.input.taxpayer.primary;t.employmentValidSsnIssuedByDueDate=true;t.tinIssuedByDueDate=true;
 const w=f.input.w2s[0];Object.assign(w,{wages:'10000',federalWithheld:'0',socialSecurityWages:'10000',socialSecurityWithheld:'620',medicareWages:'10000',medicareWithheld:'145',stateWages:'10000',stateTaxWithheld:'0'});
 const payroll=f.residencySources.wages[0].payroll[0];Object.assign(payroll,{grossCompensation:'10000',paServicesCompensation:'10000',outsidePAServicesCompensation:'0'});f.residencySources.wages[0].original=structuredClone(w);f.reciprocalSources.segments[0].actualPayroll=structuredClone(payroll);f.reciprocalSources.originals[0].originalW2=structuredClone(w);f.reciprocalSources.originals[0].actualPAWithheld='0';
 const childless={mainHomeInUnitedStatesMoreThanHalfYear:true,countedMilitaryDutyOutsideUnitedStates:false};f.input.eic={primaryIsFullTimeStudent:false,claimantEligibility:{sourceTaxYear:2025,sourceReference:'Fictional complete federal claimant records',sourceFactsConfirmed:true,primaryNonresidentAlienDuringYear:false,primaryQualifyingChildOfAnotherTaxpayer:false,primaryChildless:childless},disallowanceSources:fictionalEmptyEicHistory(f.input.taxpayer)};
 const input=Object.assign(f.input,{paResidencySources:f.residencySources,paReciprocitySources:f.reciprocalSources});const basic=paOrdinaryReturnFixture('nonresident');
 const facts=PAOrdinaryReturnFactsSchema.parse({...basic.facts,originalFederalSources:snapshotPAOrdinaryReturnOriginals(input),timing:{...basic.facts.timing,asOfDate:'2026-03-01'}});
 const sources=completion(input,facts.timing.asOfDate);sources.otherStateTaxes.jurisdictions[0].state='OH';return {input,facts,sources};
}
/** New fixture original with actual withholding0 and April15 extension receipt1539. */
export function paOrdinaryReturnExtensionFixture(year=2025){
 const f=paOrdinaryReturnFixture('resident',year);f.input.w2s[0].stateTaxWithheld='0';f.input.paResidencySources.wages[0].original=structuredClone(f.input.w2s[0]);f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.facts.timing.asOfDate=`${year+1}-04-15`;
 f.facts.payments.rows=[{sourceReference:'Fictional actual April15 extension receipt',intendedInstallment:null,original:{accountName:'Avery Pennsylvania',accountSsn:f.input.taxpayer.primary.ssn,taxYear:year,returnType:'pa40',kind:'extension',date:`${year+1}-04-15`,amount:'1539',confirmationNumber:'Fictional-extension-1539'}}];f.sources=completion(f.input,f.facts.timing.asOfDate);return f;
}
/** New original tax withholding produces exact printed overpayment1000 before penalties. */
export function paOrdinaryReturnRefundFixture(late=false){
 const f=paOrdinaryReturnFixture();f.input.w2s[0].stateTaxWithheld='2539';f.input.paResidencySources.wages[0].original=structuredClone(f.input.w2s[0]);f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 if(late)f.facts.timing.date='2026-04-16';f.facts.disposition={kind:'allocation',sourceReference:'Fictional explicit exact printed refund allocation',refundRequested:late?'695':'700',nextYearCreditRequested:'200',donations:[{code:'A',amount:'100'}]};f.sources=completion(f.input,f.facts.timing.asOfDate);return f;
}
