/** Independent literal synthetic annual sources; never production defaults. */
import {paOrdinaryReturnFixture} from './pa-ordinary-return.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
export function pa2026OrdinaryDraftFixture(status:'resident'|'part_year'|'nonresident'='resident'){
 const f=paOrdinaryReturnFixture(status,2026),w=f.input.w2s[0];
 delete f.input.eic;
 f.input.form1099Int=[];f.input.paResidencySources.interest=[];
 Object.assign(w,{wages:'75000',socialSecurityWages:'75000',socialSecurityWithheld:'4650',medicareWages:'75000',medicareWithheld:'1087.50',stateWages:status==='resident'?'75000':status==='part_year'?'39000':'9000',stateTaxWithheld:status==='resident'?'2303':status==='part_year'?'1197':'276'});
 f.input.paResidencySources.wages[0].payroll=status==='part_year'?[
 {sourceReference:'Fictional 2026 original pre-move payroll',paidOn:'2026-06-30',serviceFrom:'2026-01-01',serviceThrough:'2026-06-30',grossCompensation:'45000',paServicesCompensation:'9000',outsidePAServicesCompensation:'36000'},
 {sourceReference:'Fictional 2026 original post-move payroll',paidOn:'2026-12-31',serviceFrom:'2026-07-01',serviceThrough:'2026-12-31',grossCompensation:'30000',paServicesCompensation:'0',outsidePAServicesCompensation:'30000'},
 ]:[{sourceReference:'Fictional 2026 original annual payroll',paidOn:'2026-12-31',serviceFrom:'2026-01-01',serviceThrough:'2026-12-31',grossCompensation:'75000',paServicesCompensation:status==='resident'?'0':'9000',outsidePAServicesCompensation:status==='resident'?'75000':'66000'}];
 f.facts.timing.remainingTaxPayment={status:'no_remaining_tax',sourceReference:'Fictional actual fully covered tax account'};
 rebindPA2026Draft(f);return f;
}
export function rebindPA2026Draft(f:ReturnType<typeof paOrdinaryReturnFixture>){
 f.input.paResidencySources.wages.forEach(row=>{if(row.originalIndex!==null)row.original=structuredClone(f.input.w2s[row.originalIndex]);});
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
}
