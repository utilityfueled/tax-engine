/** Pure review-only source composition. Spec: state/pa-ordinary-return.yaml. */
import Decimal from 'decimal.js';
import {z} from 'zod';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import type {TaxYearInput} from '@/models/inputs.js';
import {PAResidencySourcesSchema} from '@/models/pa-residency.js';
import type {CalculatedLine} from '@/models/outputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {AuditTrail} from '@/utils/audit.js';
import {zeroFloor} from '@/utils/decimal.js';
import {calculatePAOrdinaryReturnFacts,reconcilePAOrdinaryReturnDisposition,snapshotPAOrdinaryReturnOriginals} from './pa-ordinary-return-facts.js';
import {calculatePAResidencySources,type PAResidencySourcesResult} from './pa-residency-sources.js';
import {calculatePA40,type PA40Input,type PA40Result} from './pa-40.js';
import {calculateScheduleSP,type ScheduleSPResult} from './pa-schedule-sp.js';
import {calculateREV1630,type REV1630Result} from './pa-rev-1630.js';
import {calculatePAWorkingPennsylvaniansTaxCredit,type PAWorkingPennsylvaniansTaxCreditResult} from './pa-working-pennsylvanians-tax-credit.js';

const answer=z.boolean().nullable(),reference=z.string(),originals=z.array(z.record(z.string(),z.unknown()));
const CompletionSourcesSchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:reference,sourceFactsConfirmed:answer,
 originalFederalSources:z.record(z.string(),z.unknown()),owner:z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict(),
 otherStateTaxes:z.object({status:z.enum(['unknown','none_paid','actual_payments']),sourceReference:reference,allJurisdictionsAndPaymentsReviewedConfirmed:answer,jurisdictions:z.array(z.object({state:z.string(),sourceReference:reference,sourceTaxYear:z.number().int().nullable(),accountName:z.string(),accountSsn:z.string(),completeThroughDate:z.string(),taxPaid:z.string(),incomeTaxWithheld:z.string()}).strict())}).strict(),
 restrictedCredits:z.object({status:z.enum(['unknown','none_available','actual_awards']),sourceReference:reference,allAwardsTransfersCarryforwardsReviewedConfirmed:answer,originalAwards:originals,originalTransfers:originals,originalCarryforwards:originals}).strict(),
 care:z.object({status:z.enum(['unknown','no_qualifying_expenses','actual_expenses']),sourceReference:reference,allCarePaymentSourcesReviewedConfirmed:answer,allEmployerBenefitsIncludedConfirmed:answer,originalCarePayments:originals}).strict(),
 nrk1:z.object({status:z.enum(['unknown','none_received','actual_statements']),sourceReference:reference,allReceivedStatementsReviewedConfirmed:answer,originalStatements:originals}).strict(),
 local:z.object({status:z.enum(['unknown','separate_return_required']),sourceReference:reference,allResidentAndWorkJurisdictionsReviewedConfirmed:answer,jurisdictions:z.array(z.object({name:z.string(),sourceReference:reference,returnRequired:answer}).strict())}).strict(),
 lateFilingRelief:z.object({status:z.enum(['unknown','no_actual_relief_records','actual_relief']),sourceReference:reference,allActualReliefSourcesReviewedConfirmed:answer,originalAgencyRelief:originals}).strict(),
}).strict();
export type PAOrdinaryReturnCompletionSources=z.infer<typeof CompletionSourcesSchema>;
export interface PAOrdinaryReturnResult {
 taxYear:number;sourceCommitment:string;methodVersion:'pa-ordinary-return-v1';residencyStatus:PAResidencySourcesResult['residencyStatus'];filingChoice:'S'|'F';
 schoolDistrictCode:string;dependentChildren:number;timingStatus:'filed'|'expected';
 pa40:PA40Result;scheduleSP:ScheduleSPResult;rev1630:REV1630Result;workingCredit:PAWorkingPennsylvaniansTaxCreditResult;
 wptcProcessing:{stage:'department-processing-reference';credit:Decimal;creditAppliedToTaxDue:Decimal;remainingTaxDueBeforePenalties:Decimal;additionalOverpaymentBeforePenalties:Decimal};
 refundDisposition:{refund:Decimal;nextYearCredit:Decimal;donations:Array<{code:string;amount:Decimal}>};
 penaltyCode:'E'|'L'|'B'|null;localBoundary:{status:'separate_return_required';jurisdictions:Array<{name:string;sourceReference:string}>};
 readiness:{formStatus:'actual_2025_review_only'|'draft_2026_review_only';filingEligible:false;blockers:string[]};lines:CalculatedLine[];
}
const fail=(detail:string):never=>{throw new Error('PA ordinary return composition sources: '+detail);};
function ref(value:string):void{if(!value.trim())fail('complete actual source reference is missing');}
function money(value:unknown):Decimal{if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value))return fail('actual nonnegative source amount is unknown');const n=new Decimal(value);if(!n.isFinite())return fail('actual source amount is nonfinite');return n;}
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
const ssn=(value:string)=>value.replace(/\D/g,'');
const name=(value:string)=>value.trim().replace(/\s+/g,' ').toUpperCase();
function completeCreditSources(input:TaxYearInput,sources:PAOrdinaryReturnCompletionSources,asOf:string):void{
 const t=input.taxpayer.primary,y=input.taxpayer.taxYear;
 if(sources.sourceTaxYear!==y||sources.sourceFactsConfirmed!==true||stable(sources.owner)!==stable({firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}))fail('confirm complete actual owner/year sources');ref(sources.sourceReference);
 if(stable(sources.originalFederalSources)!==stable(snapshotPAOrdinaryReturnOriginals(input)))fail('completion original snapshot is stale; reconfirm actual original sources');
 const other=sources.otherStateTaxes;ref(other.sourceReference);
 if(other.status!=='none_paid'||other.allJurisdictionsAndPaymentsReviewedConfirmed!==true)fail('actual other-state credit eligibility/payment history is unknown or needs its successor');
 const states=new Set<string>();for(const row of other.jurisdictions){ref(row.sourceReference);if(!/^[A-Z]{2}$/.test(row.state)||row.state==='PA'||states.has(row.state)||row.sourceTaxYear!==y||ssn(row.accountSsn)!==ssn(t.ssn)||name(row.accountName)!==name(t.firstName+' '+t.lastName)||row.completeThroughDate!==asOf)fail('other-state credit original owner/year/history is incomplete');states.add(row.state);if(!money(row.taxPaid).isZero()||!money(row.incomeTaxWithheld).isZero())fail('actual positive other-state tax credit needs its source-aware successor');}
 const residency=PAResidencySourcesSchema.parse((input as TaxYearInput&{paResidencySources?:unknown}).paResidencySources);
 const actualOutsideStates=new Set([...residency.residency.domicilePeriods.map(p=>p.state),...input.w2s.map(w=>w.state),...input.form1099Int.map(b=>b.state)].filter((state):state is string=>typeof state==='string'&&state!==''&&state!=='PA'));
 const outsideWork=residency.wages.some(w=>w.payroll.some(p=>money(p.outsidePAServicesCompensation).gt(0)));
 if((outsideWork&&!states.size)||[...actualOutsideStates].some(state=>!states.has(state)))fail('actual outside-state jurisdiction payment history is missing or incomplete');
 // A supplied no-paid history cannot suppress actual retained withholding.
 for(const w of input.w2s)if(w.state&&w.state!=='PA'&&money(w.stateTaxWithheld).gt(0))fail('actual other-state withholding requires its credit successor');
 for(const b of input.form1099Int)if(b.state&&b.state!=='PA'&&money(b.stateWithheld).gt(0))fail('actual other-state bank withholding requires its credit successor');
 const oc=sources.restrictedCredits;ref(oc.sourceReference);if(oc.status!=='none_available'||oc.allAwardsTransfersCarryforwardsReviewedConfirmed!==true||oc.originalAwards.length||oc.originalTransfers.length||oc.originalCarryforwards.length)fail('restricted credit awards/transfers/carryforwards are unknown or need their actual successor');
 const care=sources.care;ref(care.sourceReference);if(care.status!=='no_qualifying_expenses'||care.allCarePaymentSourcesReviewedConfirmed!==true||care.allEmployerBenefitsIncludedConfirmed!==true||care.originalCarePayments.length||input.dependentCare!==undefined||input.dependentCareBenefits!==undefined||input.w2s.some(w=>!money(w.box10DependentCareBenefits).isZero()))fail('actual care credit/benefit sources are unknown or need their successor');
 const nrk=sources.nrk1;ref(nrk.sourceReference);if(nrk.status!=='none_received'||nrk.allReceivedStatementsReviewedConfirmed!==true||nrk.originalStatements.length)fail('actual NRK1 statement credit sources are unknown or need their successor');
 const local=sources.local;ref(local.sourceReference);if(local.status!=='separate_return_required'||local.allResidentAndWorkJurisdictionsReviewedConfirmed!==true||!local.jurisdictions.length)fail('actual complete local obligation sources are unknown');const localNames=new Set<string>();for(const row of local.jurisdictions){ref(row.name);ref(row.sourceReference);if(row.returnRequired!==true||localNames.has(name(row.name)))fail('actual local jurisdiction obligation is unknown or duplicate');localNames.add(name(row.name));}
 const relief=sources.lateFilingRelief;ref(relief.sourceReference);if(relief.status!=='no_actual_relief_records'||relief.allActualReliefSourcesReviewedConfirmed!==true||relief.originalAgencyRelief.length)fail('actual late-filing relief records require their separate source method');
}
export function calculatePAOrdinaryReturn(input:TaxYearInput,ordinaryRaw:unknown,completionRaw:unknown):PAOrdinaryReturnResult{
 const parsed=CompletionSourcesSchema.safeParse(completionRaw);if(!parsed.success)return fail('complete actual completion source shape is unknown or unsupported');const sources=parsed.data;
 const p=calculatePAOrdinaryReturnFacts(input,ordinaryRaw),year=p.taxYear;
 completeCreditSources(input,sources,p.timing.asOfDate);
 if(p.timing.date<`${year+1}-01-01`)return fail('an original annual filing cannot predate the end of its actual tax year');
 const income=calculatePAResidencySources(input,(input as TaxYearInput&{paResidencySources?:unknown}).paResidencySources);
 const federal=calculateFederalTax(input);
 if(federal.form2441?.credit.gt(0))return fail('actual positive federal care credit requires its PA source successor');
 const zero=new Decimal(0);
 // All other classes/adjustments have actual confirmed-none residency proof;
 // all additional credit zeros have complete eligibility sources checked above.
 const base:PA40Input={taxYear:year,compensation:income.compensation,interest:income.interest,unreimbursedExpenses:zero,dividends:zero,netBusinessIncome:zero,netGainOrLoss:zero,netRentalIncome:zero,estateTrustIncome:zero,gamblingIncome:zero,otherDeductions:zero,taxForgivenessEligibilityIncome:p.paTaxableIncome.plus(p.spNontaxableIncome),useTax:p.useTax,stateWithholding:p.paWithholding,creditFromPriorYear:p.priorCreditCarryforward,estimatedPayments:p.estimatedPayments,extensionPayment:p.extensionPayment,nonresidentTaxWithheld:zero,refundableCredits:zero,taxForgivenessCredit:zero,residentCredit:zero,otherCredits:zero,underpaymentPenalty:zero,lateFilingOrPaymentPenalty:zero,latePaymentInterest:zero};
 const beforeSP=calculatePA40(base);
 const scheduleSP=calculateScheduleSP({taxYear:year,filingCategory:'unmarried',dependents:p.spDependentChildren,paTaxableIncome:beforeSP.totalPATaxableIncome,nontaxableIncome:p.spNontaxableIncome,taxLiability:beforeSP.taxLiability,taxPaidToOtherStates:zero,isClaimedAsDependentOnAnotherFederalReturn:p.claimedAsDependent,claimingHouseholdQualifiesForTaxForgiveness:p.claimingHouseholdQualifies});
 const beforePenalties=calculatePA40({...base,taxForgivenessEligibilityIncome:scheduleSP.eligibilityIncome,taxForgivenessCredit:scheduleSP.taxForgivenessCredit});
 const quarters:[Decimal,Decimal,Decimal,Decimal]=[p.quarterlyEstimatedPayments[0].plus(p.priorCreditCarryforward),p.quarterlyEstimatedPayments[1],p.quarterlyEstimatedPayments[2],p.quarterlyEstimatedPayments[3]];
 // The admitted actual April15 extension receipt is later than the Q4 due date.
 const rev1630=calculateREV1630({taxYear:year,taxLiability:beforePenalties.taxLiability,withholdingAndCredits:beforePenalties.stateWithholding.plus(beforePenalties.nonresidentTaxWithheld).plus(beforePenalties.taxForgivenessCredit).plus(beforePenalties.residentCredit).plus(beforePenalties.otherCredits),quarterlyEstimatedPayments:quarters,priorYearPATaxableIncome:p.priorYearPATaxableIncome,priorYearTaxForgivenessCredit:p.priorYearTaxForgivenessCredit,priorYear100PercentForgiveness:p.priorYear100PercentForgiveness});
 if(rev1630.penaltyRequired&&rev1630.quarters.some((q,i)=>q.underpayment.gt(0)&&!q.exception1Met&&quarters.slice(i+1).some(n=>n.gt(0))))return fail('later actual payment can clear earlier underpayment; actual dated-payment successor required');
 const remaining=p.timing.remainingTaxPayment;
 if(beforePenalties.taxDue.gt(0)){
  if(!['actual_payment','expected_payment'].includes(remaining.status)||!money(remaining.amountAppliedToTax).eq(beforePenalties.taxDue))return fail('actual or expected remaining payment principal must equal fresh printed tax due');
 }else if(remaining.status!=='no_remaining_tax')return fail('zero fresh tax principal requires explicit no-remaining-tax source');
 // Every admitted positive principal is paid (or explicitly expected) April15.
 // Section352(a)'s $5 late-filing minimum survives timely payment of all tax.
 if(p.timing.date>`${year+1}-04-15`&&income.compensation.plus(income.interest).lte('33'))return fail('late voluntary or low-income return requires its actual filing-requirement successor');
 const latePenalty=p.timing.date>`${year+1}-04-15`?new Decimal(5):zero;
 const pa40=calculatePA40({...base,taxForgivenessEligibilityIncome:scheduleSP.eligibilityIncome,taxForgivenessCredit:scheduleSP.taxForgivenessCredit,underpaymentPenalty:rev1630.totalInterest,lateFilingOrPaymentPenalty:latePenalty});
 reconcilePAOrdinaryReturnDisposition(p,pa40.netOverpayment);
 const workingCredit=calculatePAWorkingPennsylvaniansTaxCredit({taxYear:year,paEarnedIncome:p.actualPAServiceCompensation,federalEarnedIncomeCredit:federal.earnedIncomeCredit,isClaimedAsDependentOnAnotherFederalReturn:p.claimedAsDependent});
 const applied=Decimal.min(workingCredit.credit,pa40.taxDue);
 const commitment=bytesToHex(sha256(new TextEncoder().encode(stable({version:'pa-ordinary-return-v1',ordinarySourceCommitment:p.sourceCommitment,completion:sources}))));
 const audit=new AuditTrail();audit.record('PA-Ordinary-Return','source','Complete ordinary source commitment',zero,'SHA256 binds unchanged canonical/PA originals and actual complete eligibility sources',{sourceCommitment:commitment});
 audit.merge(income.lines);audit.merge(p.lines);audit.merge(scheduleSP.lines);audit.merge(rev1630.lines);audit.merge(workingCredit.lines);audit.merge(pa40.lines);
 const blockers=['review-only-not-qualified-for-filing','separate-local-return-required',...(year===2026?['final-2026-forms-unqualified']:[]),...(workingCredit.credit.gt(0)?['filed-federal1040-copy-required-for-department-processing']:[])];
 return {taxYear:year,sourceCommitment:commitment,methodVersion:'pa-ordinary-return-v1',residencyStatus:income.residencyStatus,filingChoice:p.paFilingChoice,schoolDistrictCode:income.schoolDistrictCode,dependentChildren:p.spDependentChildren,timingStatus:p.timing.kind as 'filed'|'expected',pa40,scheduleSP,rev1630,workingCredit,wptcProcessing:{stage:'department-processing-reference',credit:workingCredit.credit,creditAppliedToTaxDue:applied,remainingTaxDueBeforePenalties:zeroFloor(pa40.taxDue.minus(applied)),additionalOverpaymentBeforePenalties:zeroFloor(workingCredit.credit.minus(pa40.taxDue))},refundDisposition:{refund:p.refundRequested,nextYearCredit:p.nextYearCreditRequested,donations:p.donations},penaltyCode:rev1630.totalInterest.gt(0)?latePenalty.gt(0)?'B':'E':latePenalty.gt(0)?'L':null,localBoundary:{status:'separate_return_required',jurisdictions:sources.local.jurisdictions.map(row=>({name:row.name,sourceReference:row.sourceReference}))},readiness:{formStatus:year===2026?'draft_2026_review_only':'actual_2025_review_only',filingEligible:false,blockers},lines:audit.getLines()};
}
