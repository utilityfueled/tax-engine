/** Independent actual FICTIONAL PA/OH row records; not inferred tax or provider evidence. */
import {reciprocalOhioWageFixture,reciprocalW2,explicitlyReplaceReciprocalW2,type ReciprocalOhioWagePacket} from './oh-reciprocal-wage-sources.js';
export interface SeparatePACase {name:string;wages:string;ohioWithheld:string;paWithheld:string;ohioFirst:boolean;reportedWages:string;reportedOhioWithheld:string}
export const separatePACases:SeparatePACase[]=[
 {name:'refund PA first',wages:'60000.25',ohioWithheld:'2000.60',paWithheld:'1842.01',ohioFirst:false,reportedWages:'60000',reportedOhioWithheld:'2001'},
 {name:'refund OH first',wages:'60000.25',ohioWithheld:'2000.60',paWithheld:'1842.01',ohioFirst:true,reportedWages:'60000',reportedOhioWithheld:'2001'},
 {name:'known-zero PA first',wages:'60000.50',ohioWithheld:'0.00',paWithheld:'1842.02',ohioFirst:false,reportedWages:'60001',reportedOhioWithheld:'0'},
 {name:'known-zero OH first',wages:'60000.50',ohioWithheld:'0.00',paWithheld:'1842.02',ohioFirst:true,reportedWages:'60001',reportedOhioWithheld:'0'},
];
export function separatePARequired<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw new Error('Actual separate PA source original required');return value;}
export function separatePARow(p:ReciprocalOhioWagePacket){return separatePARequired(separatePARequired(reciprocalW2(p).stateLocalSources).stateRows.find(row=>row.state==='PA'));}
/** Fixture authoring of independently supplied current original; never read-time product recapture. */
export function replaceActualPACash(p:ReciprocalOhioWagePacket,cash:string){
 separatePARow(p).withheld=cash;
 const w=reciprocalW2(p);
 if(w.state==='PA')w.stateTaxWithheld=cash;
 explicitlyReplaceReciprocalW2(p);
}
export function separatePAFixture(c:SeparatePACase){
 const p=reciprocalOhioWageFixture(c.wages,c.ohioWithheld,c.ohioFirst);
 replaceActualPACash(p,c.paWithheld);
 return p;
}
