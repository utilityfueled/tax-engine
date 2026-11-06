/** Explicit fictional actual originals for distinct PA ordinary PDF transport. */
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
import {PAOrdinaryReturnFactsSchema} from '@/models/pa-ordinary-return-facts.js';
import type {TaxYearInput} from '@/models/inputs.js';
import {paOrdinaryReturnFixture,paOrdinaryReturnRefundFixture,paOrdinaryReturnReciprocalFixture} from './pa-ordinary-return.js';
export function paOrdinaryPdfFixture(kind:'resident'|'part_year'|'nonresident'|'refund'|'late'|'working'|'final_children'='resident'){
 const base=kind==='refund'||kind==='late'?paOrdinaryReturnRefundFixture(kind==='late'):kind==='working'?paOrdinaryReturnReciprocalFixture():paOrdinaryReturnFixture(kind==='part_year'||kind==='nonresident'?kind:'resident');
 if(kind==='final_children'){
  base.input.taxpayer.dependents=[{firstName:'Taylor',lastName:'Pennsylvania',ssn:'900-70-0322',relationship:'Son',dateOfBirth:'2000-01-01',monthsLivedWithYou:12,qualifiesForCTC:false,qualifiesForODC:true,qualifiesForEIC:false}];
  base.facts=PAOrdinaryReturnFactsSchema.parse({...base.facts,filing:{...base.facts.filing,choice:'F',finalReturnReason:'Fictional permanently stopped PA-source income after2025',noPATaxableIncomeNextYearConfirmed:true,dependentChildren:[{sourceReference:'Fictional actual adult child federal claim original',factsConfirmed:true,originalIndex:0,originalFederalDependent:structuredClone(base.input.taxpayer.dependents[0]),relationship:'natural_child',federalReturnClaimConfirmed:true,noOtherClaimByAgreementOrDecreeConfirmed:true}]}});
 }
 const input=Object.assign(base.input,{paOrdinaryReturnFacts:base.facts,paOrdinaryReturnCompletionSources:base.sources});
 // Explicit fixture reconfirmation only, before computing or preparing any result.
 base.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(input);base.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(input);
 const ordinary=calculatePAOrdinaryReturn(input,base.facts,base.sources),result=calculateFederalTax(input);result.stateReturns={pennsylvania:ordinary};
 return {input:input as TaxYearInput,facts:base.facts,sources:base.sources,ordinary,result};
}
