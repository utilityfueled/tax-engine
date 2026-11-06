/** Explicit extreme synthetic amounts and independent Decimal150 oracles, not application defaults. */
import {paOrdinaryResidencyFixture} from './pa-residency-sources';
export function paSourcePrecisionFixture(compensation:string,year=2025){
 const f=paOrdinaryResidencyFixture('resident',year),w=f.input.w2s[0],row=f.sources.wages[0];
 if(!w||!row||!row.payroll[0])throw Error('Explicit original fixture is incomplete');
 Object.assign(w,{wages:compensation,stateWages:compensation,socialSecurityWages:compensation,medicareWages:compensation,socialSecurityWithheld:'0',medicareWithheld:'0',stateTaxWithheld:'0'});
 Object.assign(row.payroll[0],{grossCompensation:compensation,paServicesCompensation:'0',outsidePAServicesCompensation:compensation});
 row.original=structuredClone(w);return f;
}
