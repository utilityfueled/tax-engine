/** Spec: state/pa-ordinary-return.yaml. All expected amounts pinned before product. */
import {it,expect} from 'vitest';
import {calculatePA2026OrdinaryDraft,calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {paOrdinaryReturnFixture,paOrdinaryReturnReciprocalFixture,paOrdinaryReturnExtensionFixture,paOrdinaryReturnRefundFixture} from '../../fixtures/pa-ordinary-return.js';
import {pa2026OrdinaryDraftFixture,rebindPA2026Draft} from '../../fixtures/pa-2026-ordinary-draft.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
import {ScheduleK1Schema, type TaxYearInput} from '@/models/inputs.js';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context.js';

function partnershipNrk1Fixture() {
 const f = paOrdinaryReturnFixture('nonresident');
 const taxpayer = f.input.taxpayer.primary;
 f.input.deductionElection = 'standard';
 const federal = ScheduleK1Schema.parse({
  taxYear: 2025, accountHolder: 'primary', partnershipName: 'Fictional Keystone Partners',
  partnershipEIN: '00-1234567', ordinaryIncome: '10000', isPassiveActivity: true, selfEmploymentEarnings: '0',
 });
 f.input.scheduleK1 = [federal];
 const nrk1Source = {
  sourceTaxYear: 2025, sourceReference: 'Fictional actual partnership statement',
  sourceFactsConfirmed: true, originalFederalK1: structuredClone(federal),
  issuerName: federal.partnershipName, issuerEin: federal.partnershipEIN, issuerCity: 'Pittsburgh', issuerState: 'PA', issuerZip: '15219',
  recipientFirstName: taxpayer.firstName, recipientLastName: taxpayer.lastName, recipientSsn: taxpayer.ssn,
  ownerType: 'I', entityType: 'P', limitedPartner: true, calendarYear: true, amended: false, final: false,
  includedOnConsolidatedReturn: false, eligibleIndividualClaimConfirmed: true,
  allOtherReportableLinesZeroOrBlankConfirmed: true, whollyPennsylvaniaAndNoFederalStateDifferenceConfirmed: true,
  businessIncome: '10000', nonresidentWithholding: '307',
 };
 const input = {...f.input, paResidencySources: {...f.input.paResidencySources, nrk1Source}};
 f.facts.originalFederalSources = snapshotPAOrdinaryReturnOriginals(input);
 f.sources.originalFederalSources = snapshotPAOrdinaryReturnOriginals(input);
 f.sources.nrk1.status = 'actual_statements';
 return {...f, input, nrk1Source};
}

it('PA ordinary nonresident composes an original partnership NRK-1 once', () => {
 const {input, facts, sources, nrk1Source} = partnershipNrk1Fixture();
 const result = calculatePAOrdinaryReturn(input, facts, sources);
 expect(result.pa40.netBusinessIncome.toFixed()).toBe('10000');
 expect(result.pa40.totalPATaxableIncome.toFixed()).toBe('16000');
 expect(result.pa40.taxLiability.toFixed()).toBe('491');
 expect(result.pa40.stateWithholding.toFixed()).toBe('184');
 expect(result.pa40.nonresidentTaxWithheld.toFixed()).toBe('307');
 expect(result.pa40.taxDue.toFixed()).toBe('0');
 expect(result.scheduleSP.eligibilityIncome.toFixed()).toBe('60120');
 expect(result.workingCredit.paEarnedIncome.toFixed()).toBe('6000');
 expect(result.readiness.filingEligible).toBe(false);
 expect(result.readiness.blockers).toContain('original-pa-nrk1-attachment-required');
 expect(JSON.stringify(result.lines)).not.toContain(nrk1Source.issuerEin);
 expect(() => preparePAOrdinaryReturnReview({...input, paOrdinaryReturnFacts: facts, paOrdinaryReturnCompletionSources: sources} as Parameters<typeof preparePAOrdinaryReturnReview>[0])).toThrow(/NRK-1.*attachment/i);

 nrk1Source.nonresidentWithholding = '0';
 facts.timing.remainingTaxPayment = {
  status: 'expected_payment', date: '2026-04-15', amountAppliedToTax: '307',
  sourceReference: 'Fictional exact outstanding tax',
 };
 expect(calculatePAOrdinaryReturn(input, facts, sources).pa40.nonresidentTaxWithheld.toFixed()).toBe('0');
});

it('PA ordinary nonresident holds incomplete or conflicting NRK-1 sources', () => {
 for (const edit of [
  ({nrk1Source}: ReturnType<typeof partnershipNrk1Fixture>) => { nrk1Source.includedOnConsolidatedReturn = true; },
  ({nrk1Source}: ReturnType<typeof partnershipNrk1Fixture>) => { nrk1Source.issuerEin = '00-7654321'; },
  ({nrk1Source}: ReturnType<typeof partnershipNrk1Fixture>) => { nrk1Source.allOtherReportableLinesZeroOrBlankConfirmed = false; },
  ({nrk1Source}: ReturnType<typeof partnershipNrk1Fixture>) => { nrk1Source.nonresidentWithholding = ''; },
  ({input, facts}: ReturnType<typeof partnershipNrk1Fixture>) => {
   input.scheduleK1.push({...input.scheduleK1[0], partnershipEIN: '00-7654321'});
   facts.originalFederalSources = snapshotPAOrdinaryReturnOriginals(input);
  },
  ({sources}: ReturnType<typeof partnershipNrk1Fixture>) => { sources.nrk1.status = 'none_received'; },
 ]) {
  const f = partnershipNrk1Fixture();
  edit(f);
  expect(() => calculatePAOrdinaryReturn(f.input, f.facts, f.sources)).toThrow(/NRK-1/i);
 }
});

it('PA ordinary nonresident holds a federal partnership Box 13 deduction', () => {
 for (const edit of [
  (input: TaxYearInput) => { input.scheduleK1[0].otherDeductions = '250'; },
  (input: TaxYearInput) => { input.scheduleK1[0].otherCredits = '10'; },
  (input: TaxYearInput) => { input.scheduleK1[0].distributions = '100'; },
  (input: TaxYearInput) => { input.scheduleK1[0].priorSuspendedLosses = { ordinary: '500' }; },
  (input: TaxYearInput) => { input.qbiLossSources = { activities: [{ atRisk: { priorSuspendedLoss: '300' } }] }; },
 ]) {
  const {input, facts, sources, nrk1Source} = partnershipNrk1Fixture();
  edit(input);
  nrk1Source.originalFederalK1 = structuredClone(input.scheduleK1[0]);
  facts.originalFederalSources = snapshotPAOrdinaryReturnOriginals(input);
  sources.originalFederalSources = snapshotPAOrdinaryReturnOriginals(input);
  expect(() => calculatePAOrdinaryReturn(input, facts, sources)).toThrow(/NRK-1.*other retained partnership/i);
 }
});
it('PA ordinary return composes all three actual residency bases',()=>{
 for(const [status,paIncome,compensation,interest] of [['resident','50120','50000','120'],['part_year','26040','26000','40'],['nonresident','6000','6000','0']] as const){const f=paOrdinaryReturnFixture(status);const p=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(p.residencyStatus).toBe(status);expect(p.pa40.totalPATaxableIncome.toString()).toBe(paIncome);expect(p.pa40.compensation.toString()).toBe(compensation);expect(p.pa40.interest.toString()).toBe(interest);expect(p.pa40.taxDue.toString()).toBe('0');expect(p.pa40.netOverpayment.toString()).toBe('0');}
});
it('PA ordinary return retains worldwide SP rather than PA-only eligibility',()=>{
 const f=paOrdinaryReturnFixture('nonresident');const p=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(p.scheduleSP.eligibilityIncome.toString()).toBe('50120');expect(p.scheduleSP.taxForgivenessCredit.toString()).toBe('0');expect(p.pa40.taxLiability.toString()).toBe('184');
});
it.each(['otherStateTaxes','restrictedCredits','care','nrk1'] as const)('PA ordinary return guards unknown or positive unsupported credit sources %s',category=>{
 const f=paOrdinaryReturnFixture();const raw=structuredClone(f.sources);Object.assign(raw[category],{status:'unknown'});expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,raw)).toThrow(/credit|source|unknown|care|statement/i);
 if(category==='otherStateTaxes')raw.otherStateTaxes={...f.sources.otherStateTaxes,jurisdictions:[{...f.sources.otherStateTaxes.jurisdictions[0],taxPaid:'50'}]};
 if(category==='restrictedCredits')raw.restrictedCredits={...f.sources.restrictedCredits,originalAwards:[{awardId:'actual-positive-award'}]};
 if(category==='care')raw.care={...f.sources.care,originalCarePayments:[{receiptId:'actual-positive-care-payment'}]};
 if(category==='nrk1')raw.nrk1={...f.sources.nrk1,originalStatements:[{statementId:'actual-received-NRK1'}]};
 expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,raw)).toThrow(/credit|source|care|statement|successor/i);
});
it('PA ordinary return derives WPTC from fresh federal EIC independently of reciprocity',()=>{
 const f=paOrdinaryReturnReciprocalFixture();const p=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(p.pa40.compensation.toString()).toBe('0');expect(p.workingCredit.paEarnedIncome.toString()).toBe('10000');expect(p.workingCredit.federalEarnedIncomeCredit.toString()).toBe('649');expect(p.workingCredit.credit.toString()).toBe('65');expect(p.pa40.refundableCredits.toString()).toBe('0');expect(p.pa40.netOverpayment.toString()).toBe('0');expect(p.wptcProcessing.stage).toBe('department-processing-reference');expect(p.wptcProcessing.additionalOverpaymentBeforePenalties.toString()).toBe('65');expect(p.refundDisposition.refund.toString()).toBe('0');
});
it('PA ordinary return includes actual use tax and reconciles payment principal',()=>{
 const f=paOrdinaryReturnFixture();f.facts.useTax={status:'itemized',sourceReference:'Fictional original purchase records',locality:'remainder_of_pa',classificationConfirmed:true,purchases:[{sourceReference:'Fictional taxable goods receipt',date:'2025-05-01',kind:'goods',taxableAmount:'100',allowableTaxPaid:'2',original:{date:'2025-05-01',amount:'100',taxPaid:'2',receiptNumber:'Fictional-goods100'}}]};
 expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/principal|remaining|payment/i);
 f.facts.timing.remainingTaxPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'4',sourceReference:'Fictional planned exact use tax payment'};expect(calculatePAOrdinaryReturn(f.input,f.facts,f.sources).pa40.useTax.toString()).toBe('4');f.facts.timing.remainingTaxPayment.amountAppliedToTax='3';expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/principal|payment/i);
});
it('PA ordinary return keeps April15 extension out of Q4 and preserves prior-source distinction',()=>{
 const f=paOrdinaryReturnExtensionFixture();const p=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(p.pa40.extensionPayment.toString()).toBe('1539');expect(p.rev1630.quarters.map(q=>q.estimatedPayment.toString())).toEqual(['0','0','0','0']);expect(p.rev1630.totalInterest.toString()).toBe('64');expect(p.pa40.totalAmountDue.toString()).toBe('64');expect(p.penaltyCode).toBe('E');
 f.facts.payments.priorReturn={status:'return',sourceReference:'Fictional actual prior filed full-year zero return',filedConfirmed:true,fullYearResidentConfirmed:true,original:{accountName:'Avery Pennsylvania',accountSsn:f.input.taxpayer.primary.ssn,taxYear:2024,returnType:'pa40',residency:'resident',filingStatus:'S',filedOn:'2025-03-01',taxableIncome:'0',taxForgivenessCredit:'0'}};
 expect(calculatePAOrdinaryReturn(f.input,f.facts,f.sources).rev1630.totalInterest.toString()).toBe('0');
});
it('PA ordinary return applies late-filing minimum despite timely paid tax',()=>{
 const f=paOrdinaryReturnRefundFixture(true);const p=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(p.pa40.lateFilingOrPaymentPenalty.toString()).toBe('5');expect(p.pa40.latePaymentInterest.toString()).toBe('0');expect(p.pa40.netOverpayment.toString()).toBe('995');expect(p.penaltyCode).toBe('L');expect(p.timingStatus).toBe('expected');
 f.facts.timing.kind='filed';f.facts.timing.asOfDate='2026-04-16';f.sources.otherStateTaxes.jurisdictions[0].completeThroughDate='2026-04-16';expect(calculatePAOrdinaryReturn(f.input,f.facts,f.sources).timingStatus).toBe('filed');
});
it('PA ordinary return reconciles exact final refund allocation',()=>{
 const f=paOrdinaryReturnRefundFixture();const p=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(p.refundDisposition.refund.toString()).toBe('700');expect(p.refundDisposition.nextYearCredit.toString()).toBe('200');expect(p.refundDisposition.donations[0].amount.toString()).toBe('100');f.facts.disposition.refundRequested='701';expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/allocation|overpayment/i);
});
it('PA ordinary return preserves explicit separate local obligations',()=>{
 const f=paOrdinaryReturnFixture();const p=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(p.localBoundary.status).toBe('separate_return_required');expect(p.readiness.blockers).toContain('separate-local-return-required');f.sources.local.status='unknown';expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/local|source/i);
});
it('PA ordinary return binds sources and leaves originals unchanged',()=>{
 const f=paOrdinaryReturnFixture();const before=JSON.stringify(f);const p=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(JSON.stringify(f)).toBe(before);expect(p.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);const audit=JSON.stringify(p.lines);for(const secret of [f.input.taxpayer.primary.ssn,'Avery','Fictional complete'])expect(audit).not.toContain(secret);f.sources.local.jurisdictions[0].sourceReference='Different actual reviewed municipal record';expect(calculatePAOrdinaryReturn(f.input,f.facts,f.sources).sourceCommitment).not.toBe(p.sourceCommitment);f.input.taxpayer.primary.firstName='Edited';expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/source|original|owner/i);
});
function pa2025ExtensionWithFundedInstallments(){
 const f=paOrdinaryReturnExtensionFixture();
 const extension=f.facts.payments.rows[0];
 Object.assign(extension.original,{date:'2026-02-12',amount:'139'});
 const dates=['2025-04-15','2025-06-16','2025-09-15','2026-01-15'];
 for(const [index,date] of dates.entries()){
  f.facts.payments.rows.push({sourceReference:`Fictional estimate ${index+1}`,intendedInstallment:index+1,original:{...extension.original,kind:'estimated',date,amount:'350',confirmationNumber:`Fictional-estimate-${index+1}`}});
 }
 return f;
}
it('PA ordinary return reports an early extension separately with adequate installments',()=>{
 const f=pa2025ExtensionWithFundedInstallments();
 const result=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
 expect(result.pa40.estimatedPayments.toString()).toBe('1400');
 expect(result.pa40.extensionPayment.toString()).toBe('139');
 expect(result.pa40.totalAmountDue.toString()).toBe('0');
 expect(result.rev1630.quarters.map(q=>q.estimatedPayment.toString())).toEqual(['350','350','350','350']);
 expect(result.rev1630.penaltyRequired).toBe(false);
 expect(result.readiness.filingEligible).toBe(false);
});
it('PA ordinary return rejects one confirmation classified as both an estimate and an extension',()=>{
 const f=pa2025ExtensionWithFundedInstallments();
 const quarterFour=f.facts.payments.rows[4].original;
 f.facts.payments.rows[0].original={...quarterFour,kind:'extension',confirmationNumber:` ${quarterFour.confirmationNumber.toUpperCase()} `};
 f.facts.disposition={kind:'allocation',sourceReference:'Fictional duplicate-derived refund election',refundRequested:'211',nextYearCreditRequested:'0',donations:[]};
 expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/duplicate actual payment receipt/i);
});
function pa2026ExtensionReviewFixture(status:'resident'|'part_year'|'nonresident'='resident'){
 const f=pa2026OrdinaryDraftFixture(status);
 const template=paOrdinaryReturnExtensionFixture(2026).facts.payments.rows[0];
 f.facts.timing.asOfDate='2027-04-15';
 f.sources.otherStateTaxes.jurisdictions[0].completeThroughDate='2027-04-15';
 f.facts.payments.rows=['2027-01-01','2027-04-15'].map((date,index)=>({...template,original:{...template.original,date,amount:'6.25',confirmationNumber:`Fictional-extension-${index+1}`}}));
 f.facts.disposition={kind:'allocation',sourceReference:'Fictional refund election',refundRequested:'13',nextYearCreditRequested:'0',donations:[]};
 return f;
}
it.each(['resident','part_year','nonresident'] as const)('PA2026 draft reports early extension receipts with independently sufficient withholding in %s',status=>{
 const f=pa2026ExtensionReviewFixture(status);
 const result=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);
 expect(result.pa.pa40.extensionPayment.toString()).toBe('13');
 expect(result.pa.pa40.estimatedPayments.toString()).toBe('0');
 expect(result.pa.pa40.netOverpayment.toString()).toBe('13');
 expect(result.pa.rev1630.penaltyRequired).toBe(false);
 expect(result.pa.rev1630.quarters.map(q=>q.estimatedPayment.toString())).toEqual(['0','0','0','0']);
 expect(result.readiness).toMatchObject({filingEligible:false,fullFederalCalculated:false});
});
it('PA2026 draft still requires withholding to cover the complete tax independently of extension cash',()=>{
 const f=pa2026ExtensionReviewFixture();
 f.input.w2s[0].stateTaxWithheld='2290';
 rebindPA2026Draft(f);
 expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow(/withholding.*cover fresh PA tax/i);
});
it('PA2026 draft still rejects quarterly estimates and an unreconciled extension refund',()=>{
 const f=pa2026ExtensionReviewFixture();
 f.facts.disposition.refundRequested='12';
 expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow(/allocation.*reconcile/i);
 const row=f.facts.payments.rows[0];
 row.intendedInstallment=4;
 row.original.kind='estimated';
 expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow(/prepayments.*separate methods/i);
});
it('PA ordinary return requires a dated method for an early extension and missed installments',()=>{
 const f=paOrdinaryReturnExtensionFixture();
 f.facts.payments.rows[0].original.date='2026-02-12';
 expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/early extension.*dated/i);
});
it.each(['2025-12-31','2026-04-16'])('PA ordinary return rejects an out-of-window extension receipt dated %s',date=>{
 const f=paOrdinaryReturnExtensionFixture();
 f.facts.timing.kind='filed';
 f.facts.timing.asOfDate='2026-04-20';
 f.sources.otherStateTaxes.jurisdictions[0].completeThroughDate='2026-04-20';
 f.facts.payments.rows[0].original.date=date;
 expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/extension payment.*original kind/i);
});
it('PA ordinary return retains draft2026 and actual source guards',()=>{
 const f=paOrdinaryReturnFixture('resident',2026);expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/2026.*rule pack.*incomplete/i);const positive=paOrdinaryReturnExtensionFixture(2026);expect(()=>calculatePAOrdinaryReturn(positive.input,positive.facts,positive.sources)).toThrow(/2026.*rule pack.*incomplete/i);
 Object.assign(f.input.w2s[0],{stateLocalSources:{sourceFactsConfirmed:true}});f.input.paResidencySources.wages[0].original=structuredClone(f.input.w2s[0]);f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/state.local.*successor/i);
});

it.each(['missingOwner','wrongYear','staleCompletionOriginals','incompletePaymentHistory','unknownLocal','actualRelief','scalarOverride'])('PA ordinary return rejects incomplete completion source %s',kind=>{
 const f=paOrdinaryReturnFixture();const raw:Record<string,unknown>=structuredClone(f.sources);
 if(kind==='missingOwner')delete raw.owner;if(kind==='wrongYear')raw.sourceTaxYear=2024;if(kind==='staleCompletionOriginals')raw.originalFederalSources={};
 if(kind==='incompletePaymentHistory')Object.assign(raw.otherStateTaxes as object,{allJurisdictionsAndPaymentsReviewedConfirmed:null});
 if(kind==='unknownLocal')Object.assign(raw.local as object,{allResidentAndWorkJurisdictionsReviewedConfirmed:null});
 if(kind==='actualRelief')Object.assign(raw.lateFilingRelief as object,{originalAgencyRelief:[{notice:'Actual granted relief'}]});if(kind==='scalarOverride')raw.latePenalty='0';expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,raw)).toThrow(/source|owner|year|original|history|local|relief|shape/i);
});
it('PA ordinary return guards later payments against earlier actual underpayment',()=>{
 const f=paOrdinaryReturnExtensionFixture();f.facts.payments.rows.push({sourceReference:'Fictional later partial catchup estimate',intendedInstallment:2,original:{accountName:'Avery Pennsylvania',accountSsn:f.input.taxpayer.primary.ssn,taxYear:2025,returnType:'pa40',kind:'estimated',date:'2025-06-16',amount:'100',confirmationNumber:'Fictional-catchup100'}});
 // Existing extension receipt now overpays100: actual explicit allocation is100.
 f.facts.disposition={kind:'allocation',sourceReference:'Fictional exact100 electedrefund',refundRequested:'100',nextYearCreditRequested:'0',donations:[]};
 expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/dated|earlier|underpayment|successor/i);
});

it('PA ordinary return guards late voluntary reciprocal-only returns',()=>{
 const f=paOrdinaryReturnReciprocalFixture();f.facts.timing.date='2026-04-16';expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/voluntary|filing.requirement|successor/i);
});
it('PA ordinary return requires actual outside-state payment history',()=>{
 const f=paOrdinaryReturnFixture('nonresident');f.sources.otherStateTaxes.jurisdictions=[];expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/jurisdiction|history|source/i);
});
