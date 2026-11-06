/** Spec: state/pa-2026-childless-eic-dependency.yaml; independent synthetic originals. */
import Decimal from 'decimal.js';
import type {PA2026EicChildInventory} from '@/models/pa-2026-eic-child-inventory.js';
import {PAOrdinaryReturnCompletionSourcesSchema} from '@/models/pa-ordinary-return-completion.js';
import {pa2026OrdinaryDraftFixture,rebindPA2026Draft} from './pa-2026-ordinary-draft.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
export function pa2026ChildlessEicFixture(status:'resident'|'part_year'|'nonresident'='resident',wages='50000',withheld=status==='resident'?'1535':status==='part_year'?'798':'184'){
 const f=pa2026OrdinaryDraftFixture(status),w=f.input.w2s[0],n=new Decimal(wages),t=f.input.taxpayer.primary;
 const taxable=status==='resident'?wages:status==='part_year'?'26000':'6000';
 Object.assign(w,{wages,socialSecurityWages:wages,socialSecurityWithheld:n.times('0.062').toDecimalPlaces(2).toFixed(),medicareWages:wages,medicareWithheld:n.times('0.0145').toDecimalPlaces(2).toFixed(),stateWages:taxable,stateTaxWithheld:withheld});
 f.input.paResidencySources.wages[0].payroll=status==='part_year'?[
 {sourceReference:'Fictional current pre-move payroll',paidOn:'2026-06-30',serviceFrom:'2026-01-01',serviceThrough:'2026-06-30',grossCompensation:n.minus('20000').toFixed(),paServicesCompensation:'6000',outsidePAServicesCompensation:n.minus('26000').toFixed()},
 {sourceReference:'Fictional current post-move payroll',paidOn:'2026-12-31',serviceFrom:'2026-07-01',serviceThrough:'2026-12-31',grossCompensation:'20000',paServicesCompensation:'0',outsidePAServicesCompensation:'20000'},
 ]:[{sourceReference:'Fictional complete annual payroll',paidOn:'2026-12-31',serviceFrom:'2026-01-01',serviceThrough:'2026-12-31',grossCompensation:wages,paServicesCompensation:status==='nonresident'?'6000':'0',outsidePAServicesCompensation:status==='nonresident'?n.minus('6000').toFixed():wages}];
 rebindPA2026Draft(f);
 const inventory:PA2026EicChildInventory={sourceTaxYear:2026,sourceReference:'Fictional complete actual household EIC-child review',sourceFactsConfirmed:true,allPotentialQualifyingChildrenReviewedConfirmed:true,noQualifyingEitcChildrenConfirmed:true,candidateChildren:[] as Array<Record<string,unknown>>,owner:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn},originalFederalSources:snapshotPAOrdinaryReturnOriginals(f.input),originalPAResidencySources:structuredClone(f.input.paResidencySources),capturedReview:{} as Record<string,unknown>};
 inventory.capturedReview={sourceTaxYear:inventory.sourceTaxYear,sourceReference:inventory.sourceReference,allPotentialQualifyingChildrenReviewedConfirmed:true,noQualifyingEitcChildrenConfirmed:true,candidateChildren:[]};
 return {...f,sources:{...PAOrdinaryReturnCompletionSourcesSchema.parse(f.sources),eitcChildInventory:inventory}};
}

export function rebindPA2026Childless(f:ReturnType<typeof pa2026ChildlessEicFixture>){
 f.input.paResidencySources.wages.forEach(row=>{if(row.originalIndex!==null)row.original=structuredClone(f.input.w2s[row.originalIndex]);});
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
}
