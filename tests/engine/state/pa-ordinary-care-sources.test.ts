// Spec: spec/state/pa-ordinary-care-sources.yaml.
import {expect,it} from 'vitest';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
import {paOrdinaryCareFixture} from '../../fixtures/pa-ordinary-care-sources.js';
it('actual resident care originals reach refundable PA23 once',()=>{
 const f=paOrdinaryCareFixture(),before=structuredClone(f),r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
 expect(r.pa40.totalPATaxableIncome.toString()).toBe('100120');expect(r.pa40.taxLiability.toString()).toBe('3074');
 expect(r.pa40.stateWithholding.toString()).toBe('3074');expect(r.scheduleSP.taxForgivenessCredit.toString()).toBe('0');
 expect(r.pa40.refundableCredits.toString()).toBe('0');expect(r.pa40.otherCredits.toString()).toBe('600');expect(r.pa40.lines.find(line=>line.line==='23')?.value.toString()).toBe('600');expect(r.pa40.netOverpayment.toString()).toBe('600');expect(r.refundDisposition.refund.toString()).toBe('600');
 expect(r.rev1630.totalInterest.toString()).toBe('0');expect(r.workingCredit.credit.toString()).toBe('0');expect(f).toEqual(before);
 expect(r.readiness.filingEligible).toBe(false);expect(JSON.stringify(r.lines)).not.toContain('98-7654321');expect(JSON.stringify(r.lines)).not.toContain('Fictional original current care receipt');
});
it.each(['missing','unconfirmed','wrongYear','staleOriginal','unknownBenefits','positiveBenefits','deemed','priorCredit','wrongProvider','wrongPerson','wrongAmount','paidWrongYear','incurredWrongYear','unreviewed','notEmployment','otherClaim','duplicateReceipt','metadataMissing','personAmount','providerAmount','unknownEarned','nonresident'] as const)('actual care composition rejects source defect %s',kind=>{
 const f=paOrdinaryCareFixture(),c=f.sources.care.careSources,p=c.payments[0],care=f.input.dependentCare;if(!care)throw Error('Actual care fixture required');const providers=care.providers,persons=care.qualifyingPersons;if(!providers?.[0]||!persons?.[0])throw Error('Actual care provider/person fixture required');
 if(kind==='missing')Reflect.deleteProperty(f.sources.care,'careSources');if(kind==='unconfirmed')c.sourceFactsConfirmed=false;if(kind==='wrongYear')c.sourceTaxYear=2024;
 if(kind==='staleOriginal')c.originalDependentCare.expenses='3000.01';if(kind==='unknownBenefits')Reflect.deleteProperty(care,'receivedBenefits');if(kind==='positiveBenefits')f.input.w2s[0].box10DependentCareBenefits='1';if(kind==='deemed')care.usesDeemedIncome=true;if(kind==='priorCredit')care.priorYearExpenseCredit='1';
 if(kind==='wrongProvider')p.originalReceipt.providerTin='11-1111111';if(kind==='wrongPerson')p.originalReceipt.qualifyingPersonTin='900-70-0399';if(kind==='wrongAmount')p.amount='3000.01';if(kind==='paidWrongYear')p.paidOn='2024-12-15';if(kind==='incurredWrongYear')p.serviceFrom='2024-01-01';if(kind==='unreviewed')p.originalAvailableConfirmed=false;if(kind==='notEmployment')p.employmentRelatedConfirmed=false;if(kind==='otherClaim')p.notClaimedOnAnotherReturnConfirmed=false;if(kind==='duplicateReceipt')c.payments.push(structuredClone(p));if(kind==='metadataMissing')f.sources.care.originalCarePayments=[];if(kind==='personAmount')persons[0].qualifiedExpenses='3000.01';if(kind==='providerAmount')providers[0].amountPaid='3000.01';if(kind==='unknownEarned')Reflect.deleteProperty(care,'primaryEarnedIncome');if(kind==='nonresident')f.input.paResidencySources.residency.status='nonresident';
 // Explicitly review the changed fictional originals so unrelated stale guards
 // cannot stand in for the actual care validation under test.
 if(kind!=='staleOriginal')c.originalDependentCare=structuredClone(care);
 f.input.paResidencySources.wages[0].original=structuredClone(f.input.w2s[0]);
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/care|source|original|benefit|earned|resident/i);
});
it('actual care composition preserves public2026 rule pack denial',()=>{
 const f=paOrdinaryCareFixture(2026);expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/2026.*rule pack.*incomplete/i);
});
