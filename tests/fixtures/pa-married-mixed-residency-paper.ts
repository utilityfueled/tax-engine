/** Literal fictional originals; never derived from candidate tax outputs. */
import {PAMarriedOrdinarySourcesSchema} from '@/models/pa-married-ordinary-sources.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return.js';
import {paMarriedMixedResidencyFixture} from './pa-married-residency-sources.js';
import {fictionalEmptyEicHistory} from './eic-disallowance.js';
import {marriedOriginals} from './pa-married-ordinary-return.js';
export function mixedPaperFixture(kind:'nonresident'|'part_year'='nonresident',positiveSP=false,reverseOwners=false,moveOut=false){
 const built=paMarriedMixedResidencyFixture(kind),input=built.input,sources=PAMarriedOrdinarySourcesSchema.parse(built.sources),residencySources=sources.residencySources;
 if(!residencySources)throw Error('Fictional detailed residency records required');
 if(positiveSP){
  const amounts=kind==='nonresident'?['1000','31','28']:['2200','68','61'];
  input.w2s.forEach((w,index)=>{const gross=index===0?'10000':'3001';w.wages=gross;w.socialSecurityWages=gross;w.medicareWages=gross;w.socialSecurityWithheld=index===0?'620':'186.06';w.medicareWithheld=index===0?'145':'43.51';w.stateWages=index===0?'10000':amounts[0];w.stateTaxWithheld=index===0?'307':amounts[1];});
  const first=sources.wages[0],second=sources.wages[1];
  if(!first||!second)throw Error('Fictional two original payroll documents required');
  first.payroll=[{sourceReference:'Fictional mixed resident actual payroll',paidOn:'2025-12-31',serviceFrom:'2025-01-01',serviceThrough:'2025-12-31',grossCompensation:'10000',paServicesCompensation:'10000',outsidePAServicesCompensation:'0'}];
  second.payroll=kind==='nonresident'?[{sourceReference:'Fictional mixed nonresident actual payroll',paidOn:'2025-12-31',serviceFrom:'2025-01-01',serviceThrough:'2025-12-31',grossCompensation:'3001',paServicesCompensation:'1000',outsidePAServicesCompensation:'2001'}]:[{sourceReference:'Fictional mixed firsthalf actual payroll',paidOn:'2025-06-30',serviceFrom:'2025-01-01',serviceThrough:'2025-06-30',grossCompensation:'1001',paServicesCompensation:'200',outsidePAServicesCompensation:'801'},{sourceReference:'Fictional mixed secondhalf actual payroll',paidOn:'2025-12-31',serviceFrom:'2025-07-01',serviceThrough:'2025-12-31',grossCompensation:'2000',paServicesCompensation:'1000',outsidePAServicesCompensation:'1000'}];
  sources.wages.forEach((row,index)=>{row.original=structuredClone(input.w2s[index]);});
  sources.dispositions.forEach(row=>{row.refundRequested=row.accountHolder==='primary'?'276':amounts[2];});
 }
 if(moveOut){
  if(kind!=='part_year'||positiveSP)throw Error('Fictional move-out source is a separate ordinary part-year case');
  const residency=residencySources.owners[1].residency;
  residency.domicilePeriods=[{state:'PA',from:'2025-01-01',through:'2025-06-30',daysInPA:150},{state:'FL',from:'2025-07-01',through:'2025-12-31',daysInPA:15}];
  residency.paPermanentAbodePeriods=[{from:'2025-01-01',through:'2025-06-30'}];residency.outsidePAPermanentAbodePeriods=[{from:'2025-07-01',through:'2025-12-31'}];residency.dec31PrincipalResidenceState='FL';residency.schoolDistrictCode='99999';residency.schoolDistrictName='Outside Pennsylvania';input.w2s[1].stateWages='21000';input.w2s[1].stateTaxWithheld='645';sources.wages[1].original=structuredClone(input.w2s[1]);
 }
 if(reverseOwners){
  const spouse=input.taxpayer.spouse;if(!spouse)throw Error('Fictional spouse required');[input.taxpayer.primary,input.taxpayer.spouse]=[spouse,input.taxpayer.primary];
  const flip=(tag:string|undefined)=>{if(tag!=='primary'&&tag!=='spouse')throw Error('Fictional actual owner required');return tag==='primary'?'spouse' as const:'primary' as const;};
  input.w2s.forEach(row=>{row.accountHolder=flip(row.accountHolder);});
  sources.owners.forEach(row=>{row.accountHolder=flip(row.accountHolder);});residencySources.owners.forEach(row=>{row.accountHolder=flip(row.accountHolder);});sources.wages.forEach((row,index)=>{row.accountHolder=flip(row.accountHolder);row.original=structuredClone(input.w2s[index]);});sources.dispositions.forEach(row=>{row.accountHolder=flip(row.accountHolder);});
  if(!input.eic)throw Error('Fictional actual EIC history required');input.eic.disallowanceSources=fictionalEmptyEicHistory(input.taxpayer);
 }
 sources.originalFederalSources=marriedOriginals(input);input.paMarriedOrdinarySources=sources;
 const married=calculatePAMarriedOrdinaryReturn(input,sources),federal=calculateFederalTax(input),result={...federal,stateReturns:{pennsylvania:married}};
 return {input,sources,married,federal,result};
}
