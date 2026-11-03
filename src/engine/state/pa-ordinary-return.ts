/** Pure review-only source composition. Spec: state/pa-ordinary-return.yaml. */
import Decimal from 'decimal.js';
import type { PAOrdinaryEmployeeSourcesResult } from "./pa-ordinary-employee-sources.js";
import {calculatePAResidentCreditSources,type PAResidentCreditSourcesResult} from './pa-resident-credit-sources.js';
import {calculatePADigitalTaxRefundSources} from './pa-digital-tax-refund-sources.js';
import {PAOrdinaryReturnCompletionSourcesSchema,type PAOrdinaryReturnCompletionSources} from '@/models/pa-ordinary-return-completion.js';
export type {PAOrdinaryReturnCompletionSources} from '@/models/pa-ordinary-return-completion.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {calculateW2StateLocalSources} from '@/engine/forms/w2-state-local.js';
import type {TaxYearInput} from '@/models/inputs.js';
import {PAResidencySourcesSchema} from '@/models/pa-residency.js';
import type {CalculatedLine} from '@/models/outputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {AuditTrail} from '@/utils/audit.js';
import {ordinarySourcePrecision,publicOrdinaryMoney} from './pa-ordinary-source-precision.js';
import {calculatePAOrdinaryReturnFacts,reconcilePAOrdinaryReturnDisposition,snapshotPAOrdinaryReturnOriginals} from './pa-ordinary-return-facts.js';
import {calculatePAResidencySources,type PAResidencySourcesResult} from './pa-residency-sources.js';
import type {PAScheduleAResult} from './pa-schedule-a.js';
import type {PAScheduleBResult} from './pa-schedule-b.js';
import type {PAScheduleCResult} from './pa-schedule-c.js';
import type {PAScheduleDResult} from './pa-schedule-d.js';
import {calculatePA40,type PA40Input,type PA40Result} from './pa-40.js';
import {calculateScheduleSP,type ScheduleSPResult} from './pa-schedule-sp.js';
import {calculateREV1630,type REV1630Result} from './pa-rev-1630.js';
import {calculatePAWorkingPennsylvaniansTaxCredit,type PAWorkingPennsylvaniansTaxCreditResult} from './pa-working-pennsylvanians-tax-credit.js';

export interface PAOrdinaryReturnResult {
 taxYear:number;sourceCommitment:string;methodVersion:'pa-ordinary-return-v1';residencyStatus:PAResidencySourcesResult['residencyStatus'];filingChoice:'S'|'F';
 schoolDistrictCode:string;dependentChildren:number;timingStatus:'filed'|'expected';
 employeeSources?:PAOrdinaryEmployeeSourcesResult;
 residentCreditSources?:PAResidentCreditSourcesResult;
 pa40:PA40Result;scheduleA:PAScheduleAResult;scheduleB:PAScheduleBResult;scheduleC?:PAScheduleCResult;scheduleD?:PAScheduleDResult;scheduleSP:ScheduleSPResult;rev1630:REV1630Result;workingCredit:PAWorkingPennsylvaniansTaxCreditResult;
 wptcProcessing:{stage:'department-processing-reference';credit:Decimal;creditAppliedToTaxDue:Decimal;remainingTaxDueBeforePenalties:Decimal;additionalOverpaymentBeforePenalties:Decimal};
 refundDisposition:{refund:Decimal;nextYearCredit:Decimal;donations:Array<{code:string;amount:Decimal}>};
 penaltyCode:'E'|'L'|'B'|null;localBoundary:{status:'separate_return_required';jurisdictions:Array<{name:string;sourceReference:string}>};
 readiness:{formStatus:'actual_2025_review_only'|'draft_2026_review_only';filingEligible:false;blockers:string[]};lines:CalculatedLine[];
}
const CreditMoney=Decimal.clone({precision:100,rounding:Decimal.ROUND_HALF_UP});
const fail=(detail:string):never=>{throw new Error('PA ordinary return composition sources: '+detail);};
function ref(value:string):void{if(!value.trim())fail('complete actual source reference is missing');}
function money(value:unknown):Decimal{if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value))return fail('actual nonnegative source amount is unknown');const n=new Decimal(value);if(!n.isFinite())return fail('actual source amount is nonfinite');return n;}
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
const ssn=(value:string)=>value.replace(/\D/g,'');
const name=(value:string)=>value.trim().replace(/\s+/g,' ').toUpperCase();
function completeCreditSources(input:TaxYearInput,sources:PAOrdinaryReturnCompletionSources,asOf:string,ordinaryRaw:unknown):PAResidentCreditSourcesResult|undefined{
 const t=input.taxpayer.primary,y=input.taxpayer.taxYear;
 if(sources.sourceTaxYear!==y||sources.sourceFactsConfirmed!==true||stable(sources.owner)!==stable({firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}))fail('confirm complete actual owner/year sources');ref(sources.sourceReference);
 if(stable(sources.originalFederalSources)!==stable(snapshotPAOrdinaryReturnOriginals(input)))fail('completion original snapshot is stale; reconfirm actual original sources');
 const other=sources.otherStateTaxes;ref(other.sourceReference);
 if(other.allJurisdictionsAndPaymentsReviewedConfirmed!==true||other.status==='unknown')fail('actual complete other-state credit eligibility/payment history is unknown');
 if(other.status==='none_paid'&&(other.residentCreditSources!==undefined||other.refundedDigitalSources!==undefined))fail('a no-paid history cannot suppress supplied actual resident-credit or refunded-digital originals');
 if(other.residentCreditSources!==undefined&&other.refundedDigitalSources!==undefined)fail('mixed resident-credit and refunded digital originals require their actual source successor');
 const refundedDigital=other.refundedDigitalSources===undefined?undefined:calculatePADigitalTaxRefundSources(input,ordinaryRaw,other.refundedDigitalSources);
 if(other.status==='actual_payments'&&!other.residentCreditSources&&!refundedDigital)fail('actual paid history requires complete original resident-credit or actual full-refund sources');
 const residentCredit=other.status==='actual_payments'&&other.residentCreditSources!==undefined?calculatePAResidentCreditSources(input,ordinaryRaw,other.residentCreditSources):undefined;
 if(residentCredit&&!residentCredit.perState.length)fail('empty actual credit claims cannot establish positive complete other-state payment history');
 const states=new Set<string>();for(const row of other.jurisdictions){ref(row.sourceReference);if(!/^[A-Z]{2}$/.test(row.state)||row.state==='PA'||states.has(row.state)||row.sourceTaxYear!==y||ssn(row.accountSsn)!==ssn(t.ssn)||name(row.accountName)!==name(t.firstName+' '+t.lastName)||row.completeThroughDate!==asOf)fail('other-state credit original owner/year/history is incomplete');states.add(row.state);const actual=residentCredit?.perState.find(claim=>claim.state===row.state);
  if(actual){
   const original=other.residentCreditSources?.claims.find(claim=>claim.state===row.state);if(!original)return fail('actual claimed state originals are missing');
   const withheld=original.payments.filter(payment=>payment.kind==='withholding').reduce((total,payment)=>total.plus(payment.amountAppliedToTax),new CreditMoney(0));
   if(!money(row.taxPaid).eq(actual.actualNetPayments)||!money(row.incomeTaxWithheld).eq(withheld))fail('complete other-state history does not reconcile actual net payments and withholding originals');
  }else if(refundedDigital&&row.state==='VA'){
   if(!money(row.taxPaid).eq(refundedDigital.actualNetTaxPaid)||!money(row.incomeTaxWithheld).eq(refundedDigital.actualVAWithholding))fail('complete VA history must reconcile exact original withholding and actually received full refund separately');
  }else if(!money(row.taxPaid).isZero()||!money(row.incomeTaxWithheld).isZero())fail('positive other-state history requires a matching source-qualified original return');
 }
 if(residentCredit?.perState.some(claim=>!states.has(claim.state)))fail('each actual claimed jurisdiction requires matching complete payment history');
 if(refundedDigital&&!states.has('VA'))fail('actual VA refunded digital originals require complete matching jurisdiction history');
 const residency=PAResidencySourcesSchema.parse((input as TaxYearInput&{paResidencySources?:unknown}).paResidencySources);
 const actualW2Rows=input.w2s.map((w,index)=>w.stateLocalSources===undefined?undefined:calculateW2StateLocalSources(input,index,w.stateLocalSources));
 const actualW2States=input.w2s.flatMap((w,index)=>actualW2Rows[index]?.stateRows.map(row=>row.state)??[w.state]);
 const actualOutsideStates=new Set([...residency.residency.domicilePeriods.map(p=>p.state),...actualW2States,...input.form1099Int.map(b=>b.state),...(residency.businesses??[]).flatMap(b=>b.allocation.locations.map(location=>location.state)),...input.form1099OID.flatMap(b=>(b.stateWithholding??[]).map(row=>row.state)),...input.form1099Misc.map(b=>b.state)].filter((state):state is string=>typeof state==='string'&&state!==''&&state!=='PA'));
 const outsideWork=residency.wages.some(w=>w.payroll.some(p=>money(p.outsidePAServicesCompensation).gt(0)));
 if((outsideWork&&!states.size)||[...actualOutsideStates].some(state=>!states.has(state)))fail('actual outside-state jurisdiction payment history is missing or incomplete');
 // A supplied no-paid history cannot suppress actual retained withholding.
 for(const [index,w] of input.w2s.entries()){
  const actualRows=actualW2Rows[index];
  if(actualRows!==undefined){
   if(actualRows.stateRows.some(row=>row.state!=='PA'&&row.withheld.gt(0)&&!residentCredit?.perState.some(claim=>claim.state===row.state)))fail('actual positive other-state withholding requires its source-qualified credit/refund successor');
   if(actualRows.localRows.some(row=>row.withheld.gt(0)))fail('actual local Box19 withholding requires its separate reconciliation successor');
  }else if(w.state&&w.state!=='PA'&&money(w.stateTaxWithheld).gt(0)&&!residentCredit?.perState.some(claim=>claim.state===w.state))fail('actual other-state withholding requires its source-qualified credit successor');
 }
 for(const b of input.form1099Int)if(b.state&&b.state!=='PA'&&money(b.stateWithheld).gt(0))fail('actual other-state bank withholding requires its credit successor');
 for(const b of input.form1099OID)for(const row of b.stateWithholding??[])if(row.state!=='PA'&&money(row.stateWithheld).gt(0))fail('actual other-state OID withholding requires its credit/refund successor');
 for(const b of input.form1099Misc)if(b.state&&b.state!=='PA'&&money(b.stateWithheld).gt(0))fail('actual other-state MISC withholding requires its credit/refund successor');
 for(const row of calculatePAResidencySources(input,(input as TaxYearInput&{paResidencySources?:unknown}).paResidencySources).digitalSources?.stateWithholding??[])if(row.state!=='PA'&&row.amount.gt(0)&&!(row.state==='VA'&&refundedDigital))fail('actual other-state digital withholding requires its credit/refund successor');
 const oc=sources.restrictedCredits;ref(oc.sourceReference);if(oc.status!=='none_available'||oc.allAwardsTransfersCarryforwardsReviewedConfirmed!==true||oc.originalAwards.length||oc.originalTransfers.length||oc.originalCarryforwards.length)fail('restricted credit awards/transfers/carryforwards are unknown or need their actual successor');
 const care=sources.care;ref(care.sourceReference);if(care.status!=='no_qualifying_expenses'||care.allCarePaymentSourcesReviewedConfirmed!==true||care.allEmployerBenefitsIncludedConfirmed!==true||care.originalCarePayments.length||input.dependentCare!==undefined||input.dependentCareBenefits!==undefined||input.w2s.some(w=>!money(w.box10DependentCareBenefits).isZero()))fail('actual care credit/benefit sources are unknown or need their successor');
 const nrk=sources.nrk1;ref(nrk.sourceReference);if(nrk.status!=='none_received'||nrk.allReceivedStatementsReviewedConfirmed!==true||nrk.originalStatements.length)fail('actual NRK1 statement credit sources are unknown or need their successor');
 const local=sources.local;ref(local.sourceReference);if(local.status!=='separate_return_required'||local.allResidentAndWorkJurisdictionsReviewedConfirmed!==true||!local.jurisdictions.length)fail('actual complete local obligation sources are unknown');const localNames=new Set<string>();for(const row of local.jurisdictions){ref(row.name);ref(row.sourceReference);if(row.returnRequired!==true||localNames.has(name(row.name)))fail('actual local jurisdiction obligation is unknown or duplicate');localNames.add(name(row.name));}
 const relief=sources.lateFilingRelief;ref(relief.sourceReference);if(relief.status!=='no_actual_relief_records'||relief.allActualReliefSourcesReviewedConfirmed!==true||relief.originalAgencyRelief.length)fail('actual late-filing relief records require their separate source method'); return residentCredit;
}
export function calculatePAOrdinaryReturn(input:TaxYearInput,ordinaryRaw:unknown,completionRaw:unknown):PAOrdinaryReturnResult{
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,ordinaryRaw,completionRaw),rounding:Decimal.ROUND_HALF_UP});
 const localMoney=(value:Decimal):Decimal=>new Money(value);
 const zeroFloor=(value:Decimal):Decimal=>publicOrdinaryMoney(Money.max(value,0));
 const parsed=PAOrdinaryReturnCompletionSourcesSchema.safeParse(completionRaw);if(!parsed.success)return fail('complete actual completion source shape is unknown or unsupported');const sources=parsed.data;
 const p=calculatePAOrdinaryReturnFacts(input,ordinaryRaw),year=p.taxYear;
 const residentCredit=completeCreditSources(input,sources,p.timing.asOfDate,ordinaryRaw);
 if(p.timing.date<`${year+1}-01-01`)return fail('an original annual filing cannot predate the end of its actual tax year');
 const income=calculatePAResidencySources(input,(input as TaxYearInput&{paResidencySources?:unknown}).paResidencySources);
 const federal=calculateFederalTax(input);
 if(federal.form2441?.credit.gt(0))return fail('actual positive federal care credit requires its PA source successor');
 const zero=new Decimal(0);
 // All other classes/adjustments have actual confirmed-none residency proof;
 // all additional credit zeros have complete eligibility sources checked above.
 const base:PA40Input={taxYear:year,compensation:income.compensation,interest:income.reportedInterest,unreimbursedExpenses:income.unreimbursedEmployeeExpenses,dividends:income.reportedDividends,netBusinessIncome:income.reportedBusinessIncome,netGainOrLoss:income.digitalSources?.reportedGainOrLoss??zero,netRentalIncome:zero,estateTrustIncome:zero,gamblingIncome:zero,otherDeductions:zero,taxForgivenessEligibilityIncome:publicOrdinaryMoney(localMoney(p.paTaxableIncome).plus(p.spNontaxableIncome)),useTax:p.useTax,stateWithholding:p.paWithholding,creditFromPriorYear:p.priorCreditCarryforward,estimatedPayments:p.estimatedPayments,extensionPayment:p.extensionPayment,nonresidentTaxWithheld:zero,refundableCredits:zero,taxForgivenessCredit:zero,residentCredit:residentCredit?.totalCredit??zero,otherCredits:zero,underpaymentPenalty:zero,lateFilingOrPaymentPenalty:zero,latePaymentInterest:zero};
 const beforeSP=calculatePA40(base);
 const scheduleSP=calculateScheduleSP({taxYear:year,filingCategory:'unmarried',dependents:p.spDependentChildren,paTaxableIncome:beforeSP.totalPATaxableIncome,nontaxableIncome:p.spNontaxableIncome,taxLiability:beforeSP.taxLiability,taxPaidToOtherStates:base.residentCredit,isClaimedAsDependentOnAnotherFederalReturn:p.claimedAsDependent,claimingHouseholdQualifiesForTaxForgiveness:p.claimingHouseholdQualifies});
 const beforePenalties=calculatePA40({...base,taxForgivenessEligibilityIncome:scheduleSP.eligibilityIncome,taxForgivenessCredit:scheduleSP.taxForgivenessCredit});
 const quarters:[Decimal,Decimal,Decimal,Decimal]=[publicOrdinaryMoney(localMoney(p.quarterlyEstimatedPayments[0]).plus(p.priorCreditCarryforward)),p.quarterlyEstimatedPayments[1],p.quarterlyEstimatedPayments[2],p.quarterlyEstimatedPayments[3]];
 // The admitted actual April15 extension receipt is later than the Q4 due date.
 const rev1630=calculateREV1630({taxYear:year,taxLiability:beforePenalties.taxLiability,withholdingAndCredits:publicOrdinaryMoney(localMoney(beforePenalties.stateWithholding).plus(beforePenalties.nonresidentTaxWithheld).plus(beforePenalties.taxForgivenessCredit).plus(beforePenalties.residentCredit).plus(beforePenalties.otherCredits)),quarterlyEstimatedPayments:quarters,priorYearPATaxableIncome:p.priorYearPATaxableIncome,priorYearTaxForgivenessCredit:p.priorYearTaxForgivenessCredit,priorYear100PercentForgiveness:p.priorYear100PercentForgiveness});
 if(p.hasNonendpointEstimatedPayment&&rev1630.penaltyRequired)return fail('actual nonendpoint estimate with underpayment requires its dated-payment successor method');
 if(rev1630.penaltyRequired&&rev1630.quarters.some((q,i)=>q.underpayment.gt(0)&&!q.exception1Met&&quarters.slice(i+1).some(n=>n.gt(0))))return fail('later actual payment can clear earlier underpayment; actual dated-payment successor required');
 const remaining=p.timing.remainingTaxPayment;
 if(beforePenalties.taxDue.gt(0)){
  if(!['actual_payment','expected_payment'].includes(remaining.status)||!money(remaining.amountAppliedToTax).eq(beforePenalties.taxDue))return fail('actual or expected remaining payment principal must equal fresh printed tax due');
 }else if(remaining.status!=='no_remaining_tax')return fail('zero fresh tax principal requires explicit no-remaining-tax source');
 // Every admitted positive principal is paid (or explicitly expected) April15.
 // Section352(a)'s $5 late-filing minimum survives timely payment of all tax.
 if(p.timing.date>`${year+1}-04-15`&&localMoney(income.compensation).plus(income.interest).lte('33'))return fail('late voluntary or low-income return requires its actual filing-requirement successor');
 const latePenalty=p.timing.date>`${year+1}-04-15`?new Decimal(5):zero;
 const pa40=calculatePA40({...base,taxForgivenessEligibilityIncome:scheduleSP.eligibilityIncome,taxForgivenessCredit:scheduleSP.taxForgivenessCredit,underpaymentPenalty:rev1630.totalInterest,lateFilingOrPaymentPenalty:latePenalty});
 reconcilePAOrdinaryReturnDisposition(p,pa40.netOverpayment);
 const workingCredit=calculatePAWorkingPennsylvaniansTaxCredit({taxYear:year,paEarnedIncome:publicOrdinaryMoney(localMoney(p.actualPAServiceCompensation).plus(income.actualPABusinessEarnedIncome)),federalEarnedIncomeCredit:federal.earnedIncomeCredit,isClaimedAsDependentOnAnotherFederalReturn:p.claimedAsDependent});
 const applied=Decimal.min(workingCredit.credit,pa40.taxDue);
 const commitment=bytesToHex(sha256(new TextEncoder().encode(stable({version:'pa-ordinary-return-v1',ordinarySourceCommitment:p.sourceCommitment,completion:sources}))));
 const audit=new AuditTrail();audit.record('PA-Ordinary-Return','source','Complete ordinary source commitment',zero,'SHA256 binds unchanged canonical/PA originals and actual complete eligibility sources',{sourceCommitment:commitment});
 if(residentCredit)audit.merge(residentCredit.lines);
 audit.merge(income.lines);audit.merge(p.lines);audit.merge(scheduleSP.lines);audit.merge(rev1630.lines);audit.merge(workingCredit.lines);audit.merge(pa40.lines);
 const blockers=['review-only-not-qualified-for-filing','separate-local-return-required',...(year===2026?['final-2026-forms-unqualified']:[]),...(workingCredit.credit.gt(0)?['filed-federal1040-copy-required-for-department-processing']:[])];
 return {taxYear:year,sourceCommitment:commitment,methodVersion:'pa-ordinary-return-v1',residencyStatus:income.residencyStatus,filingChoice:p.paFilingChoice,schoolDistrictCode:income.schoolDistrictCode,dependentChildren:p.spDependentChildren,timingStatus:p.timing.kind as 'filed'|'expected',...(income.employeeSources?{employeeSources:income.employeeSources}:{}),...(residentCredit?{residentCreditSources:residentCredit}:{}),pa40,scheduleA:income.scheduleA,scheduleB:income.scheduleB,...(income.scheduleC?{scheduleC:income.scheduleC}:{}),...(income.digitalSources?.scheduleD?{scheduleD:income.digitalSources.scheduleD}:{}),scheduleSP,rev1630,workingCredit,wptcProcessing:{stage:'department-processing-reference',credit:workingCredit.credit,creditAppliedToTaxDue:applied,remainingTaxDueBeforePenalties:zeroFloor(localMoney(pa40.taxDue).minus(applied)),additionalOverpaymentBeforePenalties:zeroFloor(localMoney(workingCredit.credit).minus(pa40.taxDue))},refundDisposition:{refund:p.refundRequested,nextYearCredit:p.nextYearCreditRequested,donations:p.donations},penaltyCode:rev1630.totalInterest.gt(0)?latePenalty.gt(0)?'B':'E':latePenalty.gt(0)?'L':null,localBoundary:{status:'separate_return_required',jurisdictions:sources.local.jurisdictions.map(row=>({name:row.name,sourceReference:row.sourceReference}))},readiness:{formStatus:year===2026?'draft_2026_review_only':'actual_2025_review_only',filingEligible:false,blockers},lines:audit.getLines()};
}
