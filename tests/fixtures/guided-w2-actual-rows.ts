/** Explicit synthetic actual originals; literal sums are defined in the spec. */
import {startCompleteInterview,completeW2Entry} from '../guided-interview/complete-facts';
import {buildTaxInputFromGuidedData,buildW2Inputs} from '@/lib/guided-interview-bridge';
import type {W2EntryData} from '@/lib/guided-interview-flow';
import {w2StateLocalFixture} from './w2-state-local.js';
import type {W2StateLocalSources} from '@/models/w2-state-local.js';
export const actualBox12Zeros={box12CodeW:'0',box12CodeD:'0',box12CodeE:'0',box12CodeF:'0',box12CodeG:'0',box12CodeH:'0',box12CodeS:'0',box12CodeAA:'0',box12CodeBB:'0',box12CodeEE:'0',box12CodeT:'0'};
export type ActualW2Entry=W2EntryData&Partial<typeof actualBox12Zeros>&{stateLocalSources?:W2StateLocalSources;localWages?:string;localTaxWithheld?:string;localityName?:string};
export function guidedActualW2Fixture(){
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:'PA'});
 const entry:ActualW2Entry={...completeW2Entry,sourceTaxYear:'2025',accountHolder:'primary',wages:'50000',allocatedTips:'0',federalWithheld:'5000',socialSecurityWages:'50000',socialSecurityWithheld:'3100',medicareWages:'50000',medicareWithheld:'725',stateTaxReporting:'single',state:'PA',stateWages:'50000',stateWithheld:'1535',localWages:'50000',localTaxWithheld:'1875',localityName:'Philadelphia',...actualBox12Zeros};
 state.sectionData['income-w2']={entries:[entry]};const current=buildTaxInputFromGuidedData(state);if(!current)throw new Error('Complete original fixture must build before adding actual packet');
 const {sources}=w2StateLocalFixture();sources.owner.originalTaxpayer={firstName:current.taxpayer.primary.firstName,lastName:current.taxpayer.primary.lastName,ssn:current.taxpayer.primary.ssn};
 sources.originalW2={...buildW2Inputs([entry])[0],...actualBox12Zeros,localWages:'50000',localTaxWithheld:'1875',localityName:'Philadelphia'};
 entry.stateTaxReporting='multiple';entry.stateLocalSources=sources;return{state,entry,sources};
}
