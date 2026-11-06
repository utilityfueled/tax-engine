/** Separately authored FICTIONAL original residence/Finder/county records, not geography verification. */
import {guidedResidentCreditFixture} from './guided-oh-resident-credit-complete';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
export const headerBookletSha256 = '931b21e7484ba96e561cf2346d8a7d2a8005bd990724b5903c9a90acede5f50e';
export const ohioHeaderLabels = {
 add:'Add actual Ohio resident return header sources',confirm:'Confirm actual Ohio resident return header sources',
 taxYear:'Header source tax year',source:'Header source record reference',asOf:'Header source as of date',owner:'Header account owner',
 firstName:'Header original first name',lastName:'Header original last name',ssn:'Header original SSN',birth:'Header original date of birth',
 residenceSource:'Residence original reference',periodSource:'Actual residence period original reference',from:'Actual residence from',through:'Actual residence through',complete:'All actual Ohio residential periods included',
 street:'Actual residential street',city:'Actual residential city',state:'Actual residential state',zip:'Actual residential ZIP',
 finderSource:'Finder original reference',finderYear:'Finder original tax year',finderDate:'Finder original lookup date',
 finderStreet:'Finder queried residential street',finderCity:'Finder queried residential city',finderState:'Finder queried residential state',finderZip:'Finder queried residential ZIP',
 district:'Actual school district number',districtName:'Actual school district name',finderCounty:'County shown in Finder original',classification:'School income tax shown in actual original',finderMatched:'I reviewed the actual official Finder result',
 countySource:'County original reference',countyYear:'County original tax year',countyDate:'County original record date',countyName:'Actual county name',countyStreet:'County original residential street',countyCity:'County original residential city',countyState:'County original residential state',countyZip:'County original residential ZIP',
 inventoryPublication:'Actual official district list publication',inventorySource:'Official district list original reference',inventoryYear:'Official district list tax year',inventoryPage:'Official district list printed page',inventoryCode:'District number in official list',inventoryName:'District name in official list',inventoryRate:'Rate shown in official district list',inventoryBase:'Tax base shown in official district list',inventoryReviewed:'I reviewed the actual official district list row',
} as const;
export function ohioReturnHeaderFixture(){
 const native=guidedResidentCreditFixture('ordinary');
 // Replay the existing current native sources in normal production order; no header helper exists yet.
 const input=buildGuidedStateOriginals(native.input,native.state);
 if(!input.ohioResidency?.residentCreditSources||!input.ohioPayments)throw Error('Complete existing native residency/payment/credit source replay is required');
 const packet={input,facts:input.ohioResidency,source:input.ohioResidency.residentCreditSources,payments:input.ohioPayments};
 const {ohioResidency:_r,ohioPayments:_p,ohioSchoolDistrict:_s,...original}=packet.input;
 // The new documents explicitly assert this separate residential location; mailing412 is not a geolocation source.
 const address={street:'825 FICTIONAL ACTUAL RESIDENCE LANE',city:'Columbus',state:'OH',zip:'43215'};
 const identity={firstName:'Robin',lastName:'ResidentCredit',ssn:'900-71-0412',dateOfBirth:'1990-01-15'};
 const header={taxYear:2025,sourceReference:'PRIVATE-FICTIONAL-RESIDENT-HEADER-2025',asOfDate:'2026-04-01',sourceFactsConfirmed:true,
  owner:{accountHolder:'primary',originalTaxpayer:identity},originalFederalSources:structuredClone(original),originalOhioResidencySources:structuredClone(packet.facts),originalOhioPaymentSources:structuredClone(packet.payments),
  residence:{sourceReference:'PRIVATE-FICTIONAL-COMPLETE-RESIDENTIAL-LEDGER',originalAddress:structuredClone(address),periods:[{from:'2025-01-01',through:'2025-12-31',sourceReference:'PRIVATE-FICTIONAL-ACTUAL-RESIDENCE-365'}],allOhioResidentialPeriodsIncludedConfirmed:true},
  finderOriginal:{sourceReference:'PRIVATE-FICTIONAL-RETAINED-FINDER-ORIGINAL',taxYear:2025,lookupDate:'2026-03-20',originalAddress:structuredClone(address),districtCode:'2503',districtName:'Columbus CSD',countyName:'Franklin',schoolIncomeTax:'none',officialResultMatchedConfirmed:true},
  countyOriginal:{sourceReference:'PRIVATE-FICTIONAL-COUNTY-RECORD',taxYear:2025,recordDate:'2026-01-15',originalAddress:structuredClone(address),countyName:'Franklin'},
  officialInventoryOriginal:{sourceReference:'PRIVATE-FICTIONAL-RETAINED-2025-BOOKLET-ROW',taxYear:2025,publication:'ohio_2025_it1040_booklet',publicationSha256:headerBookletSha256,printedPage:50,districtCode:'2503',districtName:'Columbus CSD',rateDisplay:'-',taxBaseDisplay:'-',officialRowReviewedConfirmed:true},
 };
 return {...packet,native,original,header};
}
export function enteredOhioHeaderDraft(){
 const f=ohioReturnHeaderFixture(),h=structuredClone(f.header);
 return{...h,taxYear:'2025',sourceFactsConfirmed:null as boolean|null,
  originalFederalSources:undefined as Record<string,unknown>|undefined,originalOhioResidencySources:undefined as Record<string,unknown>|undefined,originalOhioPaymentSources:undefined as Record<string,unknown>|undefined,confirmedHeaderSources:undefined as Record<string,unknown>|undefined,
  finderOriginal:{...h.finderOriginal,taxYear:'2025'},countyOriginal:{...h.countyOriginal,taxYear:'2025'},officialInventoryOriginal:{...h.officialInventoryOriginal,taxYear:'2025',printedPage:'50'}};
}
export function currentHeaderDraft(){const f=ohioReturnHeaderFixture(),d=enteredOhioHeaderDraft();d.sourceFactsConfirmed=true;d.originalFederalSources=structuredClone(f.original);d.originalOhioResidencySources=structuredClone(f.facts);d.originalOhioPaymentSources=structuredClone(f.payments);d.confirmedHeaderSources=structuredClone(f.header);return d;}
export function requiredHeader<T>(v:T|null|undefined):T{if(v==null)throw Error('Explicit fictional header source is required');return v;}
/** Native values are separately entered documentary facts; no post-add packet injection. */
export function ohioHeaderNativeFields(){const f=ohioReturnHeaderFixture(),h=f.header,L=ohioHeaderLabels;return[
 [L.taxYear,'2025'],[L.source,h.sourceReference],[L.asOf,h.asOfDate],[L.owner,'primary'],[L.firstName,'Robin'],[L.lastName,'ResidentCredit'],[L.ssn,'900-71-0412'],[L.birth,'1990-01-15'],
 [L.residenceSource,h.residence.sourceReference],[L.periodSource,'PRIVATE-FICTIONAL-ACTUAL-RESIDENCE-365'],[L.from,'2025-01-01'],[L.through,'2025-12-31'],[L.complete,'true'],[L.street,h.residence.originalAddress.street],[L.city,'Columbus'],[L.state,'OH'],[L.zip,'43215'],
 [L.finderSource,h.finderOriginal.sourceReference],[L.finderYear,'2025'],[L.finderDate,'2026-03-20'],[L.finderStreet,h.finderOriginal.originalAddress.street],[L.finderCity,'Columbus'],[L.finderState,'OH'],[L.finderZip,'43215'],[L.district,'2503'],[L.districtName,'Columbus CSD'],[L.finderCounty,'Franklin'],[L.classification,'none'],[L.finderMatched,'true'],
 [L.countySource,h.countyOriginal.sourceReference],[L.countyYear,'2025'],[L.countyDate,'2026-01-15'],[L.countyName,'Franklin'],[L.countyStreet,h.countyOriginal.originalAddress.street],[L.countyCity,'Columbus'],[L.countyState,'OH'],[L.countyZip,'43215'],
 [L.inventoryPublication,'ohio_2025_it1040_booklet'],[L.inventorySource,h.officialInventoryOriginal.sourceReference],[L.inventoryYear,'2025'],[L.inventoryPage,'50'],[L.inventoryCode,'2503'],[L.inventoryName,'Columbus CSD'],[L.inventoryRate,'-'],[L.inventoryBase,'-'],[L.inventoryReviewed,'true'],
 ] as const;}

/** Explicit current independent parent sources, not captured or refreshed by reading the header. */
export function ohioNavigationHeaderParent(){return structuredClone(ohioReturnHeaderFixture().native.residency);}
export function ohioNavigationHeaderPayments(){return structuredClone(ohioReturnHeaderFixture().native.payments);}
