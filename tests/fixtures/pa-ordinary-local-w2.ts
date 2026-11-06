/** Fictional actual reported local rows; no inferred municipality, rate or liability. */
import {W2StateLocalSourcesSchema} from '@/models/w2-state-local.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
import {paOrdinaryReturnFixture} from './pa-ordinary-return.js';
export function refreshPAOrdinaryLocalW2(f:ReturnType<typeof paOrdinaryReturnFixture>){
 f.input.paResidencySources.wages.forEach(row=>{if(row.originalIndex===null)throw new Error('Fictional original index missing');row.original=structuredClone(f.input.w2s[row.originalIndex]);});
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
}
export function paOrdinaryLocalW2Fixture(status:'resident'|'part_year'|'nonresident'='resident',options:{multiple?:boolean;blank?:boolean;unused?:boolean;year?:number}={}){
 const f=paOrdinaryReturnFixture(status,options.year??2025),w=f.input.w2s[0],p=f.input.taxpayer.primary;
 const locality='Fictional Reported Work Municipality',second='Fictional Reported Residence Municipality';
 Object.assign(w,{localWages:options.unused||options.blank?'0':'50000',localTaxWithheld:options.unused||options.blank?'0':'500.25',localityName:options.unused||options.blank?'':locality});delete w.locality;
 const original=structuredClone(w);delete original.stateLocalSources;
 const rows=W2StateLocalSourcesSchema.parse({sourceTaxYear:f.input.taxpayer.taxYear,sourceReference:'Private original complete single W2 local source',sourceFactsConfirmed:true,owner:{accountHolder:'primary',originalTaxpayer:{firstName:p.firstName,lastName:p.lastName,ssn:p.ssn}},originalW2:original,currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,singleOriginalWithoutContinuationConfirmed:true,allOriginalPagesAndCopiesCheckedConfirmed:true,stateReporting:'single',localReporting:options.multiple?'multiple':'single',legacyScalarProjection:options.unused?'unused':'first_entered_rows',stateRows:[{printedRow:1,sourceReference:'Private original PA Box17 source',state:'PA',employerStateIDStatus:'reported',employerStateID:'Private original employer state account',wages:w.stateWages,withheld:w.stateTaxWithheld}],localRows:[{printedRow:1,sourceReference:'Private original local Box19 row1',localityNameStatus:options.blank?'blank_original':'reported',localityName:options.blank?'':locality,wages:options.blank?'0':'50000',withheld:options.blank?'0':'500.25'},...(options.multiple?[{printedRow:2,sourceReference:'Private original local Box19 row2',localityNameStatus:'reported',localityName:second,wages:'50000',withheld:'125.75'}]:[])]});
 if(options.unused){w.state='';w.stateWages='0';w.stateTaxWithheld='0';rows.originalW2=structuredClone(w);}
 w.stateLocalSources=rows;
 f.sources.local.jurisdictions=[{name:locality,sourceReference:'Private actual work separate-return obligation',returnRequired:true},{name:second,sourceReference:'Private actual residence separate-return obligation',returnRequired:true}];
 refreshPAOrdinaryLocalW2(f);return {...f,rows};
}
