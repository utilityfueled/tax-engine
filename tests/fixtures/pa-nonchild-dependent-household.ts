/** New actual fictional family records, fixed before any household product implementation. */
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
import {paOrdinaryReturnFixture} from './pa-ordinary-return.js';
export function paNonchildHouseholdFixture(status:'resident'|'part_year'|'nonresident'='resident',year=2025){
 const base=paOrdinaryReturnFixture(status,year);const input=base.input;
 input.taxpayer.dependents=[
  {firstName:'Taylor',lastName:'Pennsylvania',ssn:'900-70-0322',relationship:'Son',dateOfBirth:'2000-01-01',monthsLivedWithYou:12,qualifiesForCTC:false,qualifiesForODC:true,qualifiesForEIC:false},
  {firstName:'Morgan',lastName:'Pennsylvania',ssn:'900-70-0333',relationship:'Parent',dateOfBirth:'1940-01-01',monthsLivedWithYou:0,qualifiesForCTC:false,qualifiesForODC:true,qualifiesForEIC:false},
  {firstName:'Casey',lastName:'Pennsylvania',ssn:'900-70-0344',relationship:'Parent',dateOfBirth:'1941-01-01',monthsLivedWithYou:0,qualifiesForCTC:false,qualifiesForODC:true,qualifiesForEIC:false},
 ];
 const child=input.taxpayer.dependents[0];if(!child)throw Error('Actual child original missing');
 const facts={...base.facts,filing:{...base.facts.filing,
  dependentChildren:[{sourceReference:'Fictional actual adult son relationship and current federalclaim original',factsConfirmed:true,originalIndex:0,originalFederalDependent:structuredClone(child),relationship:'natural_child',federalReturnClaimConfirmed:true,noOtherClaimByAgreementOrDecreeConfirmed:true}],
  otherFederalDependents:[1,2].map(originalIndex=>{const original=input.taxpayer.dependents[originalIndex];if(!original)throw Error('Actual parent original missing');return {sourceReference:'Fictional actual parent relationship and current federalclaim original '+originalIndex,factsConfirmed:true,originalIndex,originalFederalDependent:structuredClone(original),relationship:'parent',actualRelationshipDescription:'Actual parent of claimant; source records establish no child relationship',federalReturnClaimConfirmed:true,notAChildOfClaimantConfirmed:true};}),
 }};
 facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(input);const sources={...base.sources,originalFederalSources:snapshotPAOrdinaryReturnOriginals(input)};
 return {input,facts,sources};
}
