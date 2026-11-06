/** Spec: state/pa-ordinary-return.yaml. All expected amounts pinned before product. */
import {it,expect} from 'vitest';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {paOrdinaryReturnFixture,paOrdinaryReturnReciprocalFixture,paOrdinaryReturnExtensionFixture,paOrdinaryReturnRefundFixture} from '../../fixtures/pa-ordinary-return.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
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
