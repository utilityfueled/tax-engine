/** Independent fictional originals and literal oracles, before product. */
import {paOrdinaryReturnFixture} from './pa-ordinary-return.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
export function paOrdinaryCareFixture(year=2025){
 const f=paOrdinaryReturnFixture('resident',year),w=f.input.w2s[0];
 Object.assign(w,{wages:'100000',socialSecurityWages:'100000',socialSecurityWithheld:'6200',medicareWages:'100000',medicareWithheld:'1450',stateWages:'100000',stateTaxWithheld:'3074'});
 const wage=f.input.paResidencySources.wages[0];wage.original=structuredClone(w);Object.assign(wage.payroll[0],{grossCompensation:'100000',outsidePAServicesCompensation:'100000'});
 const child={firstName:'Care',lastName:'Pennsylvania',ssn:'900-70-0312',dateOfBirth:'2020-02-01',relationship:'child',monthsLivedWithYou:12,qualifiesForCTC:true,ctcSsnEligible:true,qualifiesForODC:false,qualifiesForEIC:false};
 f.input.taxpayer.dependents=[child];
 f.facts.filing.dependentChildren=[{originalIndex:0,sourceReference:'Fictional actual child and custody originals',factsConfirmed:true,federalReturnClaimConfirmed:true,noOtherClaimByAgreementOrDecreeConfirmed:true,relationship:'natural_child',originalFederalDependent:structuredClone(child)}];
 f.input.dependentCare={sourceFactsConfirmed:true,receivedBenefits:false,usesDeemedIncome:false,eligibilityConfirmed:true,priorYearExpenseCredit:'0',primaryEarnedIncome:'100000',excludedDependentCareBenefits:'0',expenses:'3000',qualifyingIndividuals:1,
  providers:[{name:'Fictional Care Center',address:'11 Fictional Care Way, Pittsburgh PA 15201',identifierType:'tin',taxId:'98-7654321',householdEmployee:false,amountPaid:'3000'}],
  qualifyingPersons:[{firstName:child.firstName,lastName:child.lastName,identifierType:'tax_id',taxId:child.ssn,over12Disabled:false,qualifyingPersonConfirmed:true,qualifiedExpenses:'3000'}]};
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 f.facts.disposition={kind:'allocation',sourceReference:'Fictional actual requested600 refund',refundRequested:'600',nextYearCreditRequested:'0',donations:[]};
 const sourceReference='Fictional original current care receipt';
 const careSources={sourceTaxYear:year,sourceReference:'Fictional actual care source collection',sourceFactsConfirmed:true,
  originalDependentCare:structuredClone(f.input.dependentCare),
  payments:[{sourceReference,providerIndex:0,qualifyingPersonIndex:0,paidOn:`${year}-12-15`,serviceFrom:`${year}-01-01`,serviceThrough:`${year}-12-01`,amount:'3000',originalAvailableConfirmed:true,employmentRelatedConfirmed:true,notClaimedOnAnotherReturnConfirmed:true,
   originalReceipt:{receiptNumber:'Fictional care3000',date:`${year}-12-15`,amount:'3000',providerName:'Fictional Care Center',providerTin:'98-7654321',qualifyingPersonName:'Care Pennsylvania',qualifyingPersonTin:child.ssn}}]};
 const care={...f.sources.care,status:'actual_expenses' as const,originalCarePayments:[{recordKind:'care_payment',sourceTaxYear:year,sourceReference,documentName:'Fictional current care receipt',issuerName:'Fictional Care Center',recipientName:'Avery Pennsylvania',recipientTin:f.input.taxpayer.primary.ssn,recordDate:`${year}-12-15`,originalAvailableConfirmed:true,methodStatus:'requires_source_method'}],careSources};
 return {...f,sources:{...f.sources,care}};
}
