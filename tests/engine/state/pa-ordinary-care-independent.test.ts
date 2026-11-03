// Spec: spec/state/pa-ordinary-care-independent.yaml.
import {expect,it} from 'vitest';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {calculatePAOrdinaryCareSources} from '@/engine/state/pa-ordinary-care-sources';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {calculateFederalTax} from '@/engine/federal';
import {paOrdinaryCareFixture} from '../../fixtures/pa-ordinary-care-sources';
type F=ReturnType<typeof paOrdinaryCareFixture>;
function care(f:F){const c=f.input.dependentCare;if(!c?.providers?.length||!c.qualifyingPersons?.length)throw Error('Explicit actual fixture care originals required');return {c,providers:c.providers,persons:c.qualifyingPersons};}
// Explicitly authored new synthetic source variants. Never a production refresh.
function bind(f:F){f.sources.care.careSources.originalDependentCare=structuredClone(care(f).c);f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);}
function replay(f:F){return calculatePAOrdinaryCareSources(f.input,f.sources.care,calculatePAResidencySources(f.input,f.input.paResidencySources),calculateFederalTax(f.input),f.facts.timing.asOfDate);}
function amount(f:F,value:string){const{c,providers,persons}=care(f);c.expenses=value;providers[0].amountPaid=value;persons[0].qualifiedExpenses=value;const p=f.sources.care.careSources.payments[0];p.amount=value;p.originalReceipt.amount=value;}
function second(f:F,actual:boolean){
 const {c,persons}=care(f),child={...structuredClone(f.input.taxpayer.dependents[0]),firstName:'Second',ssn:'900-70-0313',dateOfBirth:'2021-04-03'};
 if(actual){f.input.taxpayer.dependents.push(child);f.facts.filing.dependentChildren.push({...structuredClone(f.facts.filing.dependentChildren[0]),originalIndex:1,originalFederalDependent:structuredClone(child),sourceReference:'Independent actual second child source'});}
 persons.push({...structuredClone(persons[0]),firstName:child.firstName,taxId:child.ssn,qualifiedExpenses:'0'});c.qualifyingIndividuals=2;
}
it('independent care600 is a refundable payment once with unchanged SP and REV liability',()=>{
 const f=paOrdinaryCareFixture(),before=structuredClone(f),r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
 expect(r.pa40.totalPATaxableIncome.toFixed()).toBe('100120');expect(r.pa40.taxLiability.toFixed()).toBe('3074');
 expect(r.pa40.stateWithholding.toFixed()).toBe('3074');expect(r.pa40.otherCredits.toFixed()).toBe('600');expect(r.pa40.refundableCredits.toFixed()).toBe('0');
 expect(r.pa40.lines.find(l=>l.line==='23')?.value.toFixed()).toBe('600');expect(r.pa40.netOverpayment.toFixed()).toBe('600');expect(r.refundDisposition.refund.toFixed()).toBe('600');
 expect(r.scheduleSP.eligibilityIncome.toFixed()).toBe('100120');expect(r.scheduleSP.taxForgivenessCredit.toFixed()).toBe('0');
 expect(r.rev1630.lines.find(l=>l.line==='1a')?.value.toFixed()).toBe('3074');expect(r.rev1630.lines.find(l=>l.line==='2')?.value.toFixed()).toBe('3674');
 expect(r.workingCredit.credit.toFixed()).toBe('0');expect(r.readiness.filingEligible).toBe(false);expect(r.localBoundary.status).toBe('separate_return_required');
 for(const secret of ['98-7654321','900-70-0312','Fictional care3000'])expect(JSON.stringify(r.lines)).not.toContain(secret);expect(f).toEqual(before);
});
it('independent actual fractional care receipt preserves cents before statutory cap',()=>{
 const f=paOrdinaryCareFixture();amount(f,'3000.49');bind(f);const before=structuredClone(f);
 expect(replay(f)?.credit.toFixed()).toBe('600');expect(f.sources.care.careSources.payments[0].originalReceipt.amount).toBe('3000.49');expect(f).toEqual(before);
});
it('independent second actual zero-expense qualifying person permits the two-person cap',()=>{
 const f=paOrdinaryCareFixture();second(f,true);amount(f,'6000');f.facts.disposition.refundRequested='1200';bind(f);
 const r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(r.scheduleDC?.credit.toFixed()).toBe('1200');expect(r.pa40.otherCredits.toFixed()).toBe('1200');expect(r.pa40.netOverpayment.toFixed()).toBe('1200');
});
it.each(['unsubstantiated-zero-person','unconfirmed-zero-person','duplicate-counted-person','provider-is-taxpayer','provider-is-dependent','renamed-same-receipt']as const)('independent care rejects contradictory actual identity or counted person %s',kind=>{
 const f=paOrdinaryCareFixture();
 if(kind==='unsubstantiated-zero-person'){second(f,false);amount(f,'6000');}
 if(kind==='unconfirmed-zero-person'){second(f,true);amount(f,'6000');care(f).persons[1].qualifyingPersonConfirmed=false;}
 if(kind==='duplicate-counted-person'){const {c,persons}=care(f);persons.push({...structuredClone(persons[0]),qualifiedExpenses:'0'});c.qualifyingIndividuals=2;amount(f,'6000');}
 if(kind==='provider-is-taxpayer'||kind==='provider-is-dependent'){
  const {providers}=care(f),person=kind==='provider-is-taxpayer'?f.input.taxpayer.primary:f.input.taxpayer.dependents[0],name=person.firstName+' '+person.lastName;
  providers[0].name=name;providers[0].taxId=person.ssn;const row=f.sources.care.careSources.payments[0];row.originalReceipt.providerName=name;row.originalReceipt.providerTin=person.ssn;f.sources.care.originalCarePayments[0].issuerName=name;
 }
 if(kind==='renamed-same-receipt'){
  amount(f,'2000');const {c,providers,persons}=care(f);providers.push({...structuredClone(providers[0]),name:'Alternate actual display of same payer'});c.expenses='4000';persons[0].qualifiedExpenses='4000';
  const row=structuredClone(f.sources.care.careSources.payments[0]);row.providerIndex=1;row.sourceReference='Independent second copy of same receipt';row.originalReceipt.providerName=providers[1].name;f.sources.care.careSources.payments.push(row);
  f.sources.care.originalCarePayments.push({...structuredClone(f.sources.care.originalCarePayments[0]),sourceReference:row.sourceReference,issuerName:providers[1].name});
 }
 bind(f);const before=structuredClone(f);expect(()=>replay(f)).toThrow();expect(f).toEqual(before);
});
it.each(['metadata-owner','future-payment','invalid-calendar-day','before-birth-service','reversed-service','no-original','same-money-stale-provider','unmatched-document','exact-cents-mismatch','2026-public']as const)('independent care preserves source date and original gates %s',kind=>{
 const f=paOrdinaryCareFixture(kind==='2026-public'?2026:2025),row=f.sources.care.careSources.payments[0];
 if(kind==='metadata-owner')f.sources.care.originalCarePayments[0].recipientTin='900-70-0399';
 if(kind==='future-payment'){f.facts.timing.asOfDate='2025-11-01';}
 if(kind==='invalid-calendar-day'){row.paidOn='2025-02-30';row.originalReceipt.date=row.paidOn;f.sources.care.originalCarePayments[0].recordDate=row.paidOn;}
 if(kind==='before-birth-service')row.serviceFrom='2019-12-31';
 if(kind==='reversed-service'){row.serviceFrom='2025-12-02';row.serviceThrough='2025-12-01';}
 if(kind==='no-original')row.originalAvailableConfirmed=false;
 if(kind==='same-money-stale-provider')care(f).providers[0].address='A different actual provider address';
 if(kind==='unmatched-document')f.sources.care.originalCarePayments[0].sourceReference='Independent different original';
 if(kind==='exact-cents-mismatch')row.originalReceipt.amount='3000.01';
 const before=structuredClone(f);
 if(kind==='2026-public')expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/2026.*rule pack.*incomplete/i);
 else expect(()=>replay(f)).toThrow();expect(f).toEqual(before);
});
