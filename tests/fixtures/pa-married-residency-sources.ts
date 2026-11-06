/** Fictional actual documents fixed before calculation, never production defaults. */
import type {PAMarriedResidencySources} from '@/models/pa-married-residency-sources.js';
import {paMarriedOrdinaryFixture,marriedOriginals} from './pa-married-ordinary-return.js';
export function paMarriedMixedResidencyFixture(kind:'nonresident'|'part_year'='nonresident'){
 const {input,sources:base}=paMarriedOrdinaryFixture('M');
 const year=input.taxpayer.taxYear,start=year+'-01-01',end=year+'-12-31';
 const residencySources:PAMarriedResidencySources={methodVersion:'pa-married-residency-sources-v1',sourceTaxYear:year,sourceReference:'Fictional complete separate spouse calendar records',sourceFactsConfirmed:true,owners:(['primary','spouse'] as const).map(accountHolder=>{
  const person=accountHolder==='primary'?input.taxpayer.primary:input.taxpayer.spouse;if(!person)throw Error('Fictional actual spouse required');
  const part=accountHolder==='spouse'&&kind==='part_year',resident=accountHolder==='primary';
  return {accountHolder,allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed:true,originalTaxpayer:{firstName:person.firstName,lastName:person.lastName,ssn:person.ssn},residency:{status:resident?'resident':kind,sourceReference:'Fictional '+accountHolder+' actual calendar domicile abode and presence records',factsConfirmed:true,domicilePeriods:part?[{state:'FL',from:start,through:year+'-06-30',daysInPA:15},{state:'PA',from:year+'-07-01',through:end,daysInPA:150}]:[{state:resident?'PA':'FL',from:start,through:end,daysInPA:170}],paPermanentAbodePeriods:part?[{from:year+'-07-01',through:end}]:[{from:start,through:end}],outsidePAPermanentAbodePeriods:part?[{from:start,through:year+'-06-30'}]:[{from:start,through:end}],moveAbandonmentNewDomicileAndPresenceConfirmed:part,dec31PrincipalResidenceState:resident||part?'PA':'FL',schoolDistrictCode:resident||part?'02745':'99999',schoolDistrictName:resident||part?'Pittsburgh':'Outside Pennsylvania'}};
 })};
 const sources={...base,residencySources,owners:base.owners.map(owner=>({...owner,residency:{sourceReference:'Fictional legacy residency summary intentionally unconfirmed',factsConfirmed:false,domicileState:'',domicileFrom:'',domicileThrough:'',paAbodeFrom:'',paAbodeThrough:'',actualDaysInPA:null as number|null,dec31SchoolDistrictCode:'',dec31SchoolDistrictName:''}}))};
 const w=input.w2s[1],row=sources.wages[1];
 w.stateWages=kind==='part_year'?'18000':'12000';w.stateTaxWithheld=kind==='part_year'?'553':'368';
 row.payroll=kind==='part_year'?[{sourceReference:'Fictional actual first half nonresident cash payroll',paidOn:year+'-06-30',serviceFrom:start,serviceThrough:year+'-06-30',grossCompensation:'15000',paServicesCompensation:'3000',outsidePAServicesCompensation:'12000'},{sourceReference:'Fictional actual second half resident cash payroll',paidOn:end,serviceFrom:year+'-07-01',serviceThrough:end,grossCompensation:'15000',paServicesCompensation:'6000',outsidePAServicesCompensation:'9000'}]:[{sourceReference:'Fictional actual nonresident mixed services cash payroll',paidOn:end,serviceFrom:start,serviceThrough:end,grossCompensation:'30000',paServicesCompensation:'12000',outsidePAServicesCompensation:'18000'}];
 row.original=structuredClone(w);sources.originalFederalSources=marriedOriginals(input);
 return {input,sources};
}
