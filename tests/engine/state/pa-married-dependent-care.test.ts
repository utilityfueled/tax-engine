/** Spec: state/pa-married-dependent-care.yaml. Source-first oracles88f1b0fd; no federal mocks or year-gate bypass. */
import {expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return.js';
import {calculatePAMarriedDependentSources} from '@/engine/state/pa-married-dependent-care-sources.js';
import {calculateForm2441} from '@/engine/forms/form-2441.js';
import {calculateScheduleDC} from '@/engine/state/pa-schedule-dc.js';
import {paMarriedDependentCareFixture as fixture,bindMarriedDependentCareFixture as bind} from '../../fixtures/pa-married-dependent-care.js';
const run=(f:ReturnType<typeof fixture>)=>calculatePAMarriedOrdinaryReturn(f.input,f.sources);
it('binds complete actual married child originals',()=>{
 const f=fixture({care:false}),before=structuredClone(f),r=run(f);
 expect(r.returns[0].scheduleSP.dependents).toBe(1);expect(r.returns[0].pa40.taxLiability.toFixed()).toBe('3070');expect(r.readiness.filingEligible).toBe(false);expect(f).toEqual(before);
});
it.each([['22500','691','100','691','0'],['22501','691','90','622','69'],['22750','698','90','628','70'],['22751','698','80','558','140'],['24750','760','10','76','684'],['24751','760','0','0','760']])('preserves literal married child SP boundaries and owner rounding %s',(income,tax,pct,credit,withheld)=>{
 // An actual adult dependent child with these older parents has no qualifying
 // EIC child/childless-age claim; no false EIC election is used for the SP oracle.
 const f=fixture({care:false,adult:true,wages:[income,'0'],withholding:[withheld,'0']}),r=run(f).returns[0];
 expect(r.pa40.taxLiability.toFixed()).toBe(tax);expect(r.scheduleSP.forgivenessPercentage.toFixed()).toBe(pct);expect(r.scheduleSP.taxForgivenessCredit.toFixed()).toBe(credit);expect(r.pa40.netOverpayment.toFixed()).toBe('0');expect(r.pa40.taxDue.toFixed()).toBe('0');
});
it('uses the same actual child and joint income on both separate SP schedules',()=>{
 const f=fixture({mode:'M',care:false,adult:true,wages:['12000','10500'],withholding:['0','0']}),r=run(f);
 expect(r.federal.earnedIncomeCredit.toFixed()).toBe('0');expect(r.returns.map(v=>v.scheduleSP.dependents)).toEqual([1,1]);expect(r.returns.map(v=>v.scheduleSP.eligibilityIncome.toFixed())).toEqual(['22500','22500']);expect(r.returns.map(v=>v.scheduleSP.taxForgivenessCredit.toFixed())).toEqual(['368','322']);
});
it.each(['primary','spouse'] as const)('derives joint current care and reconciles actual %s payer',payer=>{
 const f=fixture({payer}),before=structuredClone(f),r=run(f).returns[0];
 expect(r.scheduleDC?.credit.toFixed()).toBe('600');expect(r.pa40.otherCredits.toFixed()).toBe('600');expect(r.pa40.refundableCredits.toFixed()).toBe('0');expect(r.pa40.netOverpayment.toFixed()).toBe('600');expect(r.refundDisposition.refund.toFixed()).toBe('600');expect(r.pa40.lines.find(l=>l.line==='23')?.value.toFixed()).toBe('600');expect(f).toEqual(before);
});
it('limits care using the actual lesser spouse earned income',()=>{
 const f=fixture({wages:['99000','1000'],withholding:['3039','31']}),r=run(f).returns[0];expect(r.scheduleDC?.credit.toFixed()).toBe('200');expect(r.pa40.netOverpayment.toFixed()).toBe('200');
});
it('supports a second actual zero-expense person and the two-person cap',()=>{
 const f=fixture({twoChildren:true,expenses:'7000'}),r=run(f).returns[0];expect(r.scheduleDC?.qualifyingPersons).toBe(2);expect(r.scheduleDC?.credit.toFixed()).toBe('1200');expect(r.pa40.netOverpayment.toFixed()).toBe('1200');
});
it('includes actual receipts from both spouse payers once and preserves raw cents before the cap',()=>{
 const f=fixture({expenses:'3000.49'}),care=f.sources.care,s=f.input.taxpayer.spouse;if(!care?.careSources||!s)throw Error('Actual both-owner source fixture required');
 const first=care.careSources.payments[0];first.amount='1500.25';first.originalReceipt.amount='1500.25';
 const second={...structuredClone(first),sourceReference:'Fictional separate spouse current receipt',amount:'1500.24',originalReceipt:{...structuredClone(first.originalReceipt),receiptNumber:'Fictional spouse separate receipt',amount:'1500.24'}};
 care.careSources.payments.push(second);care.payerAssignments.push({sourceReference:second.sourceReference,accountHolder:'spouse'});care.originalCarePayments.push({...structuredClone(care.originalCarePayments[0]),sourceReference:second.sourceReference,recipientName:s.firstName+' '+s.lastName,recipientTin:s.ssn});
 bind(f);const before=structuredClone(f),r=run(f).returns[0];expect(r.scheduleDC?.credit.toFixed()).toBe('600');expect(r.pa40.netOverpayment.toFixed()).toBe('600');expect(f).toEqual(before);expect(f.input.dependentCare?.expenses).toBe('3000.49');
});
it('keeps SP tax base and includes care once in REV line2 and actual disposition',()=>{
 const r=run(fixture()).returns[0];expect(r.scheduleSP.taxLiability.toFixed()).toBe('3070');expect(r.scheduleSP.taxForgivenessCredit.toFixed()).toBe('0');expect(r.rev1630.lines.find(l=>l.line==='1a')?.value.toFixed()).toBe('3070');expect(r.rev1630.lines.find(l=>l.line==='2')?.value.toFixed()).toBe('3670');expect(r.rev1630.totalInterest.toFixed()).toBe('0');
});
it.each(['omitted','duplicate','sameSsn','primarySsn','spouseSsn','unknownReview','knownNone','unknownClaim','adverseAgreement','nonchild','badBirth','staleChild'] as const)('rejects contradictory and unknown child coverage %s',kind=>{
 const f=fixture({care:false}),rows=f.sources.dependentChildren;if(!rows)throw Error('Actual child proofs required');
 if(kind==='omitted')rows.length=0;if(kind==='duplicate')rows.push(structuredClone(rows[0]));if(kind==='sameSsn'){f.input.taxpayer.dependents.push(structuredClone(f.input.taxpayer.dependents[0]));rows.push({...structuredClone(rows[0]),originalIndex:1});}
 if(kind==='primarySsn')f.input.taxpayer.dependents[0].ssn=f.input.taxpayer.primary.ssn;if(kind==='spouseSsn')f.input.taxpayer.dependents[0].ssn=f.input.taxpayer.spouse?.ssn??'';
 if(kind==='unknownReview')f.sources.allDependentSourcesReviewedConfirmed=null;if(kind==='knownNone')f.sources.coverage.allDependentSourcesKnownNoneConfirmed=true;if(kind==='unknownClaim')rows[0].federalReturnClaimConfirmed=null;if(kind==='adverseAgreement')rows[0].noOtherClaimByAgreementOrDecreeConfirmed=false;if(kind==='nonchild')f.input.taxpayer.dependents[0].relationship='parent';if(kind==='badBirth')f.input.taxpayer.dependents[0].dateOfBirth='2025-02-30';
 bind(f);if(kind==='staleChild')rows[0].originalFederalDependent={...rows[0].originalFederalDependent,firstName:'Different equal-money original'};
 expect(()=>run(f)).toThrow(/child|dependent|source|original|coverage/i);
});
it.each(['careKnownNone','unknownBenefits','positiveBenefits','deemed','priorCredit','combinedEarned','unknownPayer','wrongPayer','spouseProvider','duplicateReceipt','wrongAmount','missingMetadata','futureDate','wrongCount','wrongElection','M'] as const)('reconciles both actual payer identities and rejects ineligible care sources %s',kind=>{
 const f=fixture(),care=f.sources.care,c=f.input.dependentCare;if(!care?.careSources||!c?.providers?.length)throw Error('Actual care proof required');const p=care.careSources.payments[0];
 if(kind==='careKnownNone')f.sources.coverage.allCareExpensesAndEmployerBenefitsKnownNoneConfirmed=true;if(kind==='unknownBenefits')delete c.receivedBenefits;if(kind==='positiveBenefits'){f.input.w2s[0].box10DependentCareBenefits='1';}if(kind==='deemed')c.usesDeemedIncome=true;if(kind==='priorCredit')c.priorYearExpenseCredit='1';if(kind==='combinedEarned')c.spouseEarnedIncome='100000';if(kind==='unknownPayer')care.payerAssignments=[];if(kind==='wrongPayer')care.payerAssignments[0].accountHolder='spouse';
 if(kind==='spouseProvider'){const s=f.input.taxpayer.spouse;if(!s)throw Error('Actual spouse required');c.providers[0].taxId=s.ssn;p.originalReceipt.providerTin=s.ssn;}
 if(kind==='duplicateReceipt')care.careSources.payments.push({...structuredClone(p),sourceReference:'Different reference same physical receipt'});if(kind==='wrongAmount')p.originalReceipt.amount='3000.01';if(kind==='missingMetadata')care.originalCarePayments=[];if(kind==='futureDate')p.paidOn='2026-12-15';if(kind==='wrongCount')c.qualifyingIndividuals=2;if(kind==='wrongElection')f.sources.dispositions[0].refundRequested='601';if(kind==='M')f.sources.filingMode='M';bind(f);
 expect(()=>run(f)).toThrow(/care|benefit|source|original|earned|payer|refund|joint|successor/i);
});
it('invalidates stale household proofs without audit leakage',()=>{
 const f=fixture(),r=run(f),audit=JSON.stringify(r.lines);for(const secret of ['900-70-0311','900-70-0312','900-70-0313','98-7654321','Fictional current original married care receipt','Care Pennsylvania'])expect(audit).not.toContain(secret);
 f.sources.care!.payerAssignments[0].accountHolder='spouse';expect(()=>run(f)).toThrow(/payer|owner|metadata/i);
 const stale=fixture();stale.input.taxpayer.dependents[0].firstName='Changed';expect(()=>run(stale)).toThrow(/snapshot|original/i);
});
it('preserves public2026 unavailable rule-pack denial for complete married child and care sources',()=>{
 const f=fixture({year:2026});expect(()=>run(f)).toThrow(/2026.*rule pack.*incomplete/i);
});
it('keeps federal2026 enhancement separate from frozen PA credit',()=>{
 // Standalone real form calculations with explicit fictional worksheet sources,
 // not a fabricated full-federal result or bypass of its unavailable rule pack.
 const f=fixture({year:2026}),d=(s:string)=>new Decimal(s);
 expect(calculatePAMarriedDependentSources(f.input,f.sources)).toBe(1);
 const federal={taxYear:2026,filingStatus:'married_filing_jointly' as const,eligibilityConfirmed:true,earnedIncomeFactsVerified:true,careExpenses:d('3000'),qualifyingIndividuals:1,earnedIncome:d('60000'),spouseEarnedIncome:d('40000'),agi:d('100000'),excludedDependentCareBenefits:d('0'),priorYearExpenseCredit:d('0'),taxLiabilityLimit:d('10000')};
 const current=calculateForm2441(federal);expect(current.credit.toFixed()).toBe('1050');
 const pa=calculateScheduleDC({taxYear:2026,qualifyingPersons:1,paTaxableIncome:d('100000'),federalCredit:current.credit,source2022Conformity:{sourceTaxYear:2026,sourceReference:'Fictional standalone ordinary two-owner care worksheet',sourceFactsConfirmed:true,residentIndividualEligibilityConfirmed:true,eligibilityUnder2022Section21Confirmed:true,currentYearExpensesOnlyConfirmed:true,actualEarnedIncomeOnlyConfirmed:true,expensesNotClaimedOnAnotherReturnConfirmed:true,federal}});
 expect(pa.credit.toFixed()).toBe('600');expect(()=>run(f)).toThrow(/2026.*rule pack.*incomplete/i);
});
