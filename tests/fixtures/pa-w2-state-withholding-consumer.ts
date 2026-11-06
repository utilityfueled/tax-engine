/** Explicit fictional complete originals; source amounts fixed before output. */
import type {W2StateLocalSources} from '@/models/w2-state-local.js';
import {paOrdinaryReturnFixture,paOrdinaryReturnReciprocalFixture} from './pa-ordinary-return.js';
type Ordinary=ReturnType<typeof paOrdinaryReturnFixture>;type Reciprocal=ReturnType<typeof paOrdinaryReturnReciprocalFixture>;
export type PAW2ConsumerFixture=Ordinary|Reciprocal;
export function paConsumerPacket(f:PAW2ConsumerFixture){const p=f.input.w2s[0].stateLocalSources;if(!p)throw Error('Actual fictional PA W2 packet required');return p;}
function attach(f:PAW2ConsumerFixture,otherWH='0'){
 const w=f.input.w2s[0],t=f.input.taxpayer.primary;
 const packet:W2StateLocalSources={sourceTaxYear:f.input.taxpayer.taxYear,sourceReference:'Fictional private complete multistate W2',sourceFactsConfirmed:true,owner:{accountHolder:'primary',originalTaxpayer:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}},originalW2:structuredClone(w),currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,singleOriginalWithoutContinuationConfirmed:true,allOriginalPagesAndCopiesCheckedConfirmed:true,stateReporting:'multiple',localReporting:'none',legacyScalarProjection:'first_entered_rows',stateRows:[{printedRow:1,sourceReference:'Fictional actual PA original row',state:'PA',employerStateIDStatus:'reported',employerStateID:'Fictional actual private PA employer ID',wages:w.stateWages??'0',withheld:w.stateTaxWithheld??'0'},{printedRow:2,sourceReference:'Fictional actual OH original row',state:'OH',employerStateIDStatus:'reported',employerStateID:'Fictional actual private OH employer ID',wages:w.wages,withheld:otherWH}],localRows:[]};
 w.stateLocalSources=packet;
 if(!f.sources.otherStateTaxes.jurisdictions.some(x=>x.state==='OH'))f.sources.otherStateTaxes.jurisdictions.push({state:'OH',sourceReference:'Fictional complete actual OH no-tax payment history',sourceTaxYear:f.input.taxpayer.taxYear,accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn,completeThroughDate:f.facts.timing.asOfDate,taxPaid:'0',incomeTaxWithheld:'0'});
 rebindPAConsumer(f);return f;
}
export function rebindPAConsumer(f:PAW2ConsumerFixture){
 const w=f.input.w2s[0],p=paConsumerPacket(f),{stateLocalSources:_p,...original}=w;p.originalW2=structuredClone(original);f.input.paResidencySources.wages[0].original=structuredClone(w);
 if('paReciprocitySources' in f.input){const proof=f.input.paReciprocitySources;proof.originals[0].originalW2=structuredClone(w);proof.originals[0].zeroOrOneStateRowOnActualOriginalConfirmed=p.stateRows.length<=1;}
 const {paResidencySources:_r,...withoutResidency}=f.input;const originalFederal=Object.fromEntries(Object.entries(withoutResidency).filter(([key])=>!['paReciprocitySources','paOrdinaryReturnFacts'].includes(key)));f.facts.originalFederalSources=structuredClone(originalFederal);f.sources.originalFederalSources=structuredClone(originalFederal);
}
export function paActualW2ConsumerFixture(status:'resident'|'part_year'|'nonresident'='resident',otherWH='0',year=2025){const f=paOrdinaryReturnFixture(status,year);attach(f,otherWH);return f;}
export function paActualReciprocalW2ConsumerFixture(){const f=paOrdinaryReturnReciprocalFixture();attach(f);return f;}
export function paConsumerOHFirst(f:PAW2ConsumerFixture){const p=paConsumerPacket(f);p.stateRows.reverse();p.stateRows.forEach((r,i)=>r.printedRow=i+1);const row=p.stateRows[0];Object.assign(f.input.w2s[0],{state:row.state,stateWages:row.wages,stateTaxWithheld:row.withheld});rebindPAConsumer(f);}
export function paConsumerUnusedScalars(f:PAW2ConsumerFixture){const w=f.input.w2s[0];for(const key of ['state','stateWages','stateTaxWithheld','localWages','localTaxWithheld','localityName','locality'] as const)delete w[key];paConsumerPacket(f).legacyScalarProjection='unused';rebindPAConsumer(f);}
