/** Deliberately authored fictional original facts, no production defaults or federal mocks. */
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
import {paMarriedDependentCareFixture,bindMarriedDependentCareFixture} from './pa-married-dependent-care.js';
import {paOrdinaryCareFixture} from './pa-ordinary-care-sources.js';
import {paCarePaperIdentityFixture} from './pa-care-paper-identity.js';
export const CARE_DISPLAY_CASES=['safe','provider-name-tin','provider-address-separator-tin','provider-name-source-case','provider-address-receipt-case','person-first-tin','person-last-source-case','person-first-receipt-case','household-city-provider-tin'] as const;
export type CareDisplayCase=typeof CARE_DISPLAY_CASES[number];
export function actualMarriedCarePaper(kind:CareDisplayCase='safe',options:Parameters<typeof paMarriedDependentCareFixture>[0]={},kinds?:Parameters<typeof paCarePaperIdentityFixture>[1],refundRequested?:string){
 const f=paMarriedDependentCareFixture(options),care=f.input.dependentCare,collection=f.sources.care,child=f.input.taxpayer.dependents[0];
 if(!care?.providers?.[0]||!care.qualifyingPersons?.[0]||!collection?.careSources||!child)throw Error('Actual fictional care originals required');
 const provider=care.providers[0],person=care.qualifyingPersons[0],receipt=collection.careSources.payments[0],metadata=collection.originalCarePayments[0];
 if(!provider.taxId||!metadata)throw Error('Actual original provider and document required');
 collection.careSources.sourceReference='PRIVATE-CARE+[SOURCE](A)?';receipt.originalReceipt.receiptNumber='PRIVATE-RECEIPT+[R](B)?';
 if(kind==='provider-name-tin')provider.name+=' '+provider.taxId;
 if(kind==='provider-address-separator-tin')provider.address+=' 98.(765).4321';
 if(kind==='provider-name-source-case')provider.name+=' '+collection.careSources.sourceReference.toLowerCase();
 if(kind==='provider-address-receipt-case')provider.address+=' '+receipt.originalReceipt.receiptNumber.toLowerCase();
 if(kind==='person-first-tin')child.firstName+=' '+child.ssn.replaceAll('-','');
 if(kind==='person-last-source-case')child.lastName+=' '+collection.careSources.sourceReference.toLowerCase();
 if(kind==='person-first-receipt-case')child.firstName+=' '+receipt.originalReceipt.receiptNumber.toLowerCase();
 if(kind==='household-city-provider-tin')f.input.taxpayer.address.city+=' '+provider.taxId;
 person.firstName=child.firstName;person.lastName=child.lastName;receipt.originalReceipt.providerName=provider.name;receipt.originalReceipt.qualifyingPersonName=person.firstName+' '+person.lastName;metadata.issuerName=provider.name;
 if(refundRequested!==undefined)f.sources.dispositions[0].refundRequested=refundRequested;
 bindMarriedDependentCareFixture(f);
 collection.careSources.paperIdentitySources=paCarePaperIdentityFixture(f.input,kinds??{providers:['fein'],persons:care.qualifyingPersons.map(()=>'ssn')});
 const input={...f.input,paMarriedOrdinarySources:f.sources},owned=calculatePAMarriedOrdinaryReturn(input,f.sources),result=calculateFederalTax(input);result.stateReturns={pennsylvania:owned};
 return {...f,input,result,owned};
}
export function actualSingleCarePaper(kind:CareDisplayCase='safe',documentary=true){
 const f=paOrdinaryCareFixture(),care=f.input.dependentCare,source=f.sources.care.careSources,child=f.input.taxpayer.dependents[0];
 if(!care?.providers?.[0]||!care.qualifyingPersons?.[0])throw Error('Actual single care originals required');
 source.sourceReference='PRIVATE-SINGLE-CARE+[S]?';source.payments[0].originalReceipt.receiptNumber='PRIVATE-SINGLE-RECEIPT+[R]?';
 if(kind==='provider-name-tin')care.providers[0].name+=' '+care.providers[0].taxId;
 if(kind==='provider-address-receipt-case')care.providers[0].address+=' '+source.payments[0].originalReceipt.receiptNumber.toLowerCase();
 if(kind==='person-first-receipt-case'){child.firstName+=' '+source.payments[0].originalReceipt.receiptNumber.toLowerCase();care.qualifyingPersons[0].firstName=child.firstName;}
 source.payments[0].originalReceipt.providerName=care.providers[0].name;source.payments[0].originalReceipt.qualifyingPersonName=care.qualifyingPersons[0].firstName+' '+care.qualifyingPersons[0].lastName;f.sources.care.originalCarePayments[0].issuerName=care.providers[0].name;
 f.facts.filing.dependentChildren[0].originalFederalDependent=structuredClone(child);source.originalDependentCare=structuredClone(care);
 if(documentary)source.paperIdentitySources=paCarePaperIdentityFixture(f.input,{providers:['fein'],persons:['ssn']});
 const input={...f.input,paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.sources};f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(input);
 const owned=calculatePAOrdinaryReturn(input,f.facts,f.sources),result=calculateFederalTax(input);result.stateReturns={pennsylvania:owned};return {...f,input,owned,result};
}
