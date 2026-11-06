/** Explicit entry/capture/confirmation. Spec: state/pa-married-prior-history.yaml. */
import type {TaxYearInput} from '@/models/inputs';
import {PAMarriedPriorHistorySchema,type PAMarriedPriorHistory} from '@/models/pa-married-prior-history';
import type {PAMarriedOrdinarySources} from '@/models/pa-married-ordinary-sources';
import {calculatePAMarriedPriorHistory,snapshotPAMarriedPriorOriginals} from '@/engine/state/pa-married-prior-history';
export function emptyGuidedPAMarriedPriorHistory():PAMarriedPriorHistory{return {sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,rows:[]};}
export function emptyGuidedPAMarriedPriorOwner(accountHolder:'primary'|'spouse'):PAMarriedPriorHistory['rows'][number]{
 const identity={name:'',ssn:''},column=()=>({'1':'','2':'','3':'','4':'','5':'','6':'','7':'','8':'','9':'','10':''});
 return {accountHolder,sourceReference:'',originalPA40:{...identity,taxYear:null,returnType:'',filingStatus:'',residency:'',filedOn:'',filedConfirmed:null,taxableIncome:'',taxLiability:'',taxForgivenessCredit:''},originalSP:{...identity,spouse:{...identity},taxYear:null,returnType:'',filingCategory:'',calendarFrom:'',calendarThrough:'',marriedAndLivedTogetherEntireYearConfirmed:null,bothAliveEntireYearConfirmed:null,neitherClaimedAsDependentConfirmed:null,noDependentChildrenConfirmed:null,allWorldwideSourcesCompleteConfirmed:null,noOtherStateTaxCreditConfirmed:null,taxpayerColumn:column(),spouseColumn:column(),line11:'',line12:'',line13:'',line14:'',line15:'',line16:''}};
}
export function updateGuidedPAMarriedPriorHistory(sources:PAMarriedOrdinarySources,history:PAMarriedPriorHistory):PAMarriedOrdinarySources{return {...sources,sourceFactsConfirmed:null,priorYearHistory:{...PAMarriedPriorHistorySchema.parse(history),sourceFactsConfirmed:null}};}
export function captureGuidedPAMarriedPriorHistory(input:TaxYearInput,sources:PAMarriedOrdinarySources):PAMarriedOrdinarySources{
 if(!sources.priorYearHistory)throw Error('Enter the actual prior originals first.');
 return updateGuidedPAMarriedPriorHistory(sources,{...structuredClone(sources.priorYearHistory),capturedOriginals:snapshotPAMarriedPriorOriginals(input,sources)});
}
export function confirmGuidedPAMarriedPriorHistory(input:TaxYearInput,sources:PAMarriedOrdinarySources):PAMarriedOrdinarySources{
 if(!sources.priorYearHistory)throw Error('Enter and explicitly capture the actual prior originals first.');
 const next={...sources,sourceFactsConfirmed:null,priorYearHistory:{...structuredClone(sources.priorYearHistory),sourceFactsConfirmed:true}};
 calculatePAMarriedPriorHistory(input,next);return next;
}
