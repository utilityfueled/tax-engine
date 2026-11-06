/** NEW explicitly FICTIONAL dated payroll/home records; spec before fixture.
 * Spec: state/oh-school-district-part-year-sources.yaml. No tax output authors any fact.
 */
import type {TaxYearInput} from '@/models/inputs.js';
import {schoolDistrictSourcesFixture,schoolW2,schoolW2Packet,bindSchoolDistrictFixture,type SchoolDistrictFixtureInput,type SchoolDistrictFixtureFacts} from './oh-school-district-sources.js';

type Address=TaxYearInput['taxpayer']['address'];
type Identity={firstName:string;lastName:string;ssn:string;dateOfBirth:string};
export interface PartYearSchoolPayrollOriginal {
 sourceReference:string;payrollId:string;w2Index:number;accountHolder:'primary';taxYear:number;
 originalTaxpayer:Identity;employer:{name:string;ein:string};paidOn:string;
 serviceFrom:string;serviceThrough:string;serviceState:string;noOhioServicesOutsideOhioConfirmed:boolean;
 grossWages:string;federalWithheld:string;
 stateRows:{state:string;wages:string;withheld:string}[];
 schoolReporting:{status:'reported';districtCode:string;wages:string;withheld:string}|{status:'none'};
}
export interface PartYearSchoolWageSources {
 method:'specific_payroll';sourceReference:string;allOriginalPayrollIncludedConfirmed:boolean;
 residenceOriginals:{sourceReference:string;from:string;through:string;domicileState:string;originalAddress:Address}[];
 payrollOriginals:PartYearSchoolPayrollOriginal[];
}
export type PartYearSchoolFacts=SchoolDistrictFixtureFacts&{partYearWageSources:PartYearSchoolWageSources};
export type PartYearSchoolInput=SchoolDistrictFixtureInput&{ohioSchoolDistrict:PartYearSchoolFacts};
export const partYearSchoolExpected=Object.freeze({
 annualGross:'60000',residentWages:'40000',outsideOhioWages:'20000',federalWithheld:'6000',
 ohioWithholding:'2000',schoolWithholding:'600',ohioDays:212,virginiaDays:153,ohioFactor:'0.5808',
 sd29:'40000',sd30:'0',sd31:'40000',sd32:'40000',sd33:'40000',sdTax:'500',sdRefund:'100',
 // Independent official source/Decimal oracle supplied before any candidate output.
 ohioExemption:'2150',ohioTaxableNonbusiness:'57850',ohioTaxBeforeCredits:'1217',
 nrcRatio:'0.3333',nonresidentCredit:'406',ohioTaxAfterCredits:'811',ohioRefund:'1189',
});
const ohioAddress:Address={street:'302 Fictional July District Lane',city:'Ashland',state:'OH',zip:'44805'};
const virginiaAddress:Address={street:'153 Fictional Virginia Service Lane',city:'Richmond',state:'VA',zip:'23219'};
/** Explicit NEW source authoring only. Never call on production read/confirmation. */
export function bindPartYearSchoolFixture(input:PartYearSchoolInput):void{bindSchoolDistrictFixture(input);}
export function schoolDistrictPartYearFixture(sdWithheld:'600'|'500'='600'):PartYearSchoolInput{
 const base=schoolDistrictSourcesFixture(sdWithheld);
 Object.assign(base.taxpayer.primary,{firstName:'Avery',lastName:'DistrictJuly',ssn:'900-74-0302',dateOfBirth:'1990-01-15'});
 base.taxpayer.address=structuredClone(virginiaAddress); // Mailing is NOT inferred Ohio residence.
 const person=base.taxpayer.primary;
 const identity:Identity={firstName:person.firstName,lastName:person.lastName,ssn:person.ssn,dateOfBirth:'1990-01-15'};
 const employer={name:'FICTIONAL-JULY-SD-EMPLOYER',ein:'91-7400302'};
 const w2=schoolW2(base);
 Object.assign(w2,{employer,wages:'60000',federalWithheld:'6000',socialSecurityWages:'60000',socialSecurityWithheld:'3720',medicareWages:'60000',medicareWithheld:'870',state:'OH',stateWages:'40000',stateTaxWithheld:'2000',localWages:'40000',localTaxWithheld:sdWithheld,localityName:'HILLSDALE LSD 0302'});
 const packet=schoolW2Packet(base);
 packet.sourceReference='PRIVATE-NEW-PY-ALL-W2-ORIGINALS';packet.owner.originalTaxpayer={firstName:person.firstName,lastName:person.lastName,ssn:person.ssn};packet.stateReporting='multiple';
 packet.stateRows=[{printedRow:1,sourceReference:'PRIVATE-NEW-PY-OH-STATE',state:'OH',employerStateIDStatus:'reported',employerStateID:'12345678',wages:'40000',withheld:'2000'},
  {printedRow:2,sourceReference:'PRIVATE-NEW-PY-VA-STATE',state:'VA',employerStateIDStatus:'blank_original',employerStateID:'',wages:'20000',withheld:'0'}];
 packet.localRows=[{printedRow:1,sourceReference:'PRIVATE-NEW-PY-SCHOOL-LOCAL',localityNameStatus:'reported',localityName:'HILLSDALE LSD 0302',wages:'40000',withheld:sdWithheld}];
 const owner=base.ohioResidency.owners[0];if(!owner)throw Error('New actual primary owner required');
 owner.status='part_year_resident';owner.sourceReference='PRIVATE-NEW-PY-DOMICILE-SERVICE-ORIGINALS';
 owner.periods=[{from:'2025-01-01',to:'2025-07-31',domicileState:'OH'},{from:'2025-08-01',to:'2025-12-31',domicileState:'VA'}];
 if(!owner.amounts)throw Error('New actual income classification required');
 Object.assign(owner.amounts.wages,{federalAmount:'60000',residentAmount:'40000',nonresidentOhioAmount:'0',sourceReference:'PRIVATE-NEW-RECEIPT-DATED-OH-VS-VA-SERVICES'});
 const facts=base.ohioSchoolDistrict;
 facts.sourceReference='PRIVATE-NEW-PY-SCHOOL-COMPLETE-SOURCES';facts.owner.originalTaxpayer=structuredClone(identity);
 facts.residence.originalAddress=structuredClone(ohioAddress);
 facts.residence.periods=[{from:'2025-01-01',through:'2025-07-31',districtCode:'0302',sourceReference:'PRIVATE-NEW-OH-ABODE-212-DAYS'},
  {from:'2025-08-01',through:'2025-12-31',districtCode:'9999',sourceReference:'PRIVATE-NEW-VA-ABODE-153-DAYS'}];
 facts.residence.lookup={sourceReference:'FICTIONAL-SUPPLIED-2025-HILLSDALE-LOOKUP-ORIGINAL',taxYear:2025,lookupDate:'2025-07-31',originalAddress:structuredClone(ohioAddress),districtCode:'0302',districtName:'Hillsdale LSD',officialResultMatchedConfirmed:true};
 facts.payments.account.accountName='Avery DistrictJuly';facts.payments.account.accountSsn=person.ssn;
 const partYearWageSources:PartYearSchoolWageSources={method:'specific_payroll',sourceReference:'PRIVATE-NEW-PY-PAYROLL-COMPLETE-ANNUAL-ORIGINALS',allOriginalPayrollIncludedConfirmed:true,
  residenceOriginals:[{sourceReference:'PRIVATE-NEW-OH-PHYSICAL-HOME-ORIGINAL',from:'2025-01-01',through:'2025-07-31',domicileState:'OH',originalAddress:structuredClone(ohioAddress)},
   {sourceReference:'PRIVATE-NEW-VA-PHYSICAL-HOME-ORIGINAL',from:'2025-08-01',through:'2025-12-31',domicileState:'VA',originalAddress:structuredClone(virginiaAddress)}],
  payrollOriginals:[{sourceReference:'PRIVATE-NEW-ALL-JUNE-PAYROLL-ORIGINAL',payrollId:'PY-PAYROLL-1',w2Index:0,accountHolder:'primary',taxYear:2025,originalTaxpayer:structuredClone(identity),employer:structuredClone(employer),paidOn:'2025-06-30',serviceFrom:'2025-01-01',serviceThrough:'2025-06-30',serviceState:'OH',noOhioServicesOutsideOhioConfirmed:true,grossWages:'40000',federalWithheld:'4000',stateRows:[{state:'OH',wages:'40000',withheld:'2000'}],schoolReporting:{status:'reported',districtCode:'0302',wages:'40000',withheld:sdWithheld}},
   {sourceReference:'PRIVATE-NEW-ALL-DECEMBER-PAYROLL-ORIGINAL',payrollId:'PY-PAYROLL-2',w2Index:0,accountHolder:'primary',taxYear:2025,originalTaxpayer:structuredClone(identity),employer:structuredClone(employer),paidOn:'2025-12-31',serviceFrom:'2025-08-01',serviceThrough:'2025-12-31',serviceState:'VA',noOhioServicesOutsideOhioConfirmed:true,grossWages:'20000',federalWithheld:'2000',stateRows:[{state:'VA',wages:'20000',withheld:'0'}],schoolReporting:{status:'none'}}]};
 const complete:PartYearSchoolInput={...base,ohioSchoolDistrict:{...facts,partYearWageSources}};
 bindPartYearSchoolFixture(complete);return complete;
}
/** Raw original supplied sources without three separately confirmed Ohio roots. */
export function rawPartYearSchoolOriginals(input:PartYearSchoolInput):TaxYearInput{
 const{ohioResidency:_r,ohioPayments:_p,ohioSchoolDistrict:_s,...original}=input;return structuredClone(original);
}
