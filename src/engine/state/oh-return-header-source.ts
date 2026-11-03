/** Spec: state/oh-return-header-sources.yaml. Factual cells only; no tax arithmetic or filing promotion. */
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import type {TaxYearInput} from '@/models/inputs.js';
import {OhioReturnHeaderSourcesSchema,OHIO_HEADER_2025_BOOKLET_SHA256} from '@/models/ohio-return-header-sources.js';
import {OhioResidencyFactsSchema} from '@/models/ohio-residency.js';
import {OhioPaymentFactsSchema} from '@/models/ohio-payments.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {buildOhioPaymentSource} from './oh-payment-source.js';
import {buildOhioResidentCreditSource} from './oh-resident-credit-source.js';
import {lookupOhioSchoolDistrictMetadata,lookupOhioSchoolDistrictNumberByName} from './oh-school-district-lookup.js';
function fail(message:string):never{throw Error(`Ohio actual return header sources: ${message}`);}
/** Same defined-field semantics as canonical Ohio validators, after native lossless original replay. */
function stable(value:unknown):unknown{
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,child])=>child!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>[key,stable(child)]));
 return value;
}
const encoded=(value:unknown)=>JSON.stringify(stable(value));
function same(a:unknown,b:unknown){return encoded(a)===encoded(b);}
function date(value:string):number{const n=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)return fail('valid actual document and residence dates are required');return n;}
export interface OhioReturnHeaderSourceResult{
 readonly methodVersion:'oh-2025-resident-header-v1';
 readonly header:{readonly schoolDistrictNumber:string;readonly ohioCounty:string;readonly residency:'resident'};
 readonly residentDays:number;
 /** Private binding; never include in public review/audit/provider payloads. */
 readonly sourceCommitment:string;
 readonly audit:ReadonlyArray<{readonly rule:string;readonly description:string;readonly status:'validated'}>;
}
export function calculateOhioReturnHeaderSource(input:TaxYearInput,raw:unknown):OhioReturnHeaderSourceResult{
 const parsed=OhioReturnHeaderSourcesSchema.safeParse(raw);if(!parsed.success)return fail('complete confirmed actual header originals are required');const source=parsed.data;
 const context=structuredClone(input);Reflect.deleteProperty(context,'ohioReturnHeaderSources');
 const currentFederal=Object.fromEntries(Object.entries(context).filter(([key])=>!['ohioResidency','ohioPayments','ohioSchoolDistrict'].includes(key)));
 const residency=OhioResidencyFactsSchema.safeParse(context.ohioResidency),payments=OhioPaymentFactsSchema.safeParse(context.ohioPayments);
 if(!residency.success||!payments.success)return fail('complete current independently confirmed domicile and payment sources are required');
 const facts=residency.data,paid=payments.data,person=context.taxpayer.primary,owner=facts.owners[0];
 if(context.taxpayer.taxYear!==2025||context.taxpayer.filingStatus!=='single'||context.taxpayer.spouse||facts.taxYear!==2025||paid.taxYear!==2025||facts.owners.length!==1||owner?.accountHolder!=='primary'||owner.status!=='full_year_resident'||source.owner.accountHolder!=='primary')return fail('this finite header method requires the actual 2025 single primary full-year Ohio resident');
 if(!person.dateOfBirth||!same(source.owner.originalTaxpayer,{firstName:person.firstName,lastName:person.lastName,ssn:person.ssn,dateOfBirth:person.dateOfBirth})||!/^\d{9}$/.test(person.ssn.replace(/[\s-]/g,'')))return fail('actual current owner identity and date of birth must match');
 if(date(person.dateOfBirth)>=date('2025-01-01'))return fail('actual current owner date of birth is inconsistent');
 if(!same(source.originalFederalSources,currentFederal)||!same(facts.originalFederalSources,currentFederal)||!same(paid.originalFederalSources,currentFederal)||!same(source.originalOhioResidencySources,facts)||!same(source.originalOhioPaymentSources,paid))return fail('retained complete federal, domicile or payment originals are stale');
 if(facts.schoolDistrictStatus!=='no_ohio_taxing_district_residency'||context.ohioSchoolDistrict||facts.businessSources||facts.reciprocalWageSources||facts.allFederalSourcesIncludedConfirmed!==true||facts.noBusinessIncomeConfirmed!==true)return fail('separate actual district or income method composition is required');
 if(context.w2s.length!==1||context.w2s[0]?.accountHolder!=='primary')return fail('this finite header method requires one actual primary ordinary W2');
 if(owner.periods.length!==1||owner.periods[0]?.from!=='2025-01-01'||owner.periods[0]?.to!=='2025-12-31'||owner.periods[0]?.domicileState!=='OH')return fail('complete actual full-year Ohio domicile originals are required');
 try{buildOhioPaymentSource(context,paid);if(facts.residentCreditSources)buildOhioResidentCreditSource(context,calculateFederalTax(context),facts);}catch{return fail('current complete payment and resident-credit source replay must be valid');}
 const periods=source.residence.periods,period=periods[0];
 if(periods.length!==1||!period||period.from!=='2025-01-01'||period.through!=='2025-12-31')return fail('this method requires one actual complete residential location for the full year');
 const residentDays=(date(period.through)-date(period.from))/86400000+1;if(residentDays!==365)return fail('the actual complete residential calendar must cover 2025');
 const address=source.residence.originalAddress,finder=source.finderOriginal,county=source.countyOriginal,list=source.officialInventoryOriginal;
 if(address.state!=='OH'||!same(address,finder.originalAddress)||!same(address,county.originalAddress))return fail('actual residential, queried Finder and county original addresses must agree');
 const asOf=date(source.asOfDate);if(asOf<date('2025-12-31')||date(finder.lookupDate)>asOf||date(county.recordDate)>asOf)return fail('actual header source dates exceed the stated review endpoint');
 if(finder.countyName.trim().toUpperCase()!=='FRANKLIN'||county.countyName.trim().toUpperCase()!=='FRANKLIN')return fail('actual county originals require the supported Franklin method; other reported counties remain unsupported');
 // Explicit official row evidence is required in addition to the taxing-rate index; null alone proves nothing.
 if(finder.districtCode!=='2503'||lookupOhioSchoolDistrictNumberByName(finder.districtName)!=='2503'||finder.schoolIncomeTax!=='none'||lookupOhioSchoolDistrictMetadata(2025,finder.districtCode)!==null)return fail('actual district originals require the separately supported non-taxing 2503 row');
 if(list.publication!=='ohio_2025_it1040_booklet'||list.publicationSha256!==OHIO_HEADER_2025_BOOKLET_SHA256||list.printedPage!==50||list.districtCode!=='2503'||lookupOhioSchoolDistrictNumberByName(list.districtName)!=='2503'||list.rateDisplay!=='-'||list.taxBaseDisplay!=='-')return fail('review the exact official 2025 district-list row matching the actual Finder original');
 return{methodVersion:'oh-2025-resident-header-v1',header:{schoolDistrictNumber:finder.districtCode,ohioCounty:county.countyName.trim().slice(0,4).toUpperCase(),residency:'resident'},residentDays,
 sourceCommitment:bytesToHex(sha256(new TextEncoder().encode(encoded({context,source})))),
 audit:[{rule:'actual-resident-header',description:'Current owner and complete full-year residential originals match the supported official district and county sources.',status:'validated'}]};
}
