/** Actual original entry only. Canonical household validator owns source binding and tax calculations. */
import {Form2210InvestmentHouseholdSchema} from '@/models/form-2210-investment-household';
import type {TaxYearInput} from '@/models/inputs';
import {parseGuidedCurrency}from './guided-currency';
type Household=NonNullable<NonNullable<NonNullable<TaxYearInput['form2210']>['investmentElectionSources']>['household']>;
type Draft<T>=T extends number?string:T extends boolean?boolean|null:T extends readonly (infer U)[]?Draft<U>[]:T extends object?{[K in keyof T]:Draft<T[K]>}:T;
export type EstimatedInvestmentHouseholdData=Draft<Household>;
export const HOUSEHOLD_TEXT=[['sourceTaxYear','Household original tax year'],['sourceReference','Household original source reference'],['marriageSourceReference','Marriage original source reference'],['spouseSourceReference','Spouse complete investment records reference'],['ownershipSourceReference','Separate-property ownership history reference']] as const;
export const HOUSEHOLD_FLAGS=[['jointReturnConfirmed','Actual joint return confirmed'],['marriedAtYearEndConfirmed','Married at year end from actual records'],['bothSpousesAliveAllYearConfirmed','Both spouses alive throughout the year'],['bothSpousesUsResidentsAllYearConfirmed','Both spouses US residents throughout the year'],['spouseInvestmentSourcesNoneConfirmed','Complete spouse originals show no investment sources'],['allInvestmentSourcesIncludedConfirmed','All household investment originals are included'],['primarySoleInvestmentOwnershipConfirmed','Primary alone owned all investment property'],['propertyNeverCommunityOwnedConfirmed','Original acquisition and ownership history shows no community property']] as const;
export const SPOUSE_AMOUNTS=[['spouseInvestmentIncome','Spouse actual investment income'],['spouseInvestmentInterestExpense','Spouse actual investment interest expense'],['spousePriorDisallowedInterest','Spouse actual prior disallowed interest'],['spouseOtherInvestmentExpenses','Spouse actual other investment expenses']] as const;
export const DIVIDEND_TEXT=[['sourceIndex','Actual dividend source index (zero based)'],['sourceTaxYear','Dividend original tax year'],['sourceReference','Dividend original source reference'],['payerName','Dividend original payer name'],['payerTin','Dividend original payer TIN'],['accountReference','Dividend original account reference']] as const;
export const DIVIDEND_AMOUNTS=[['ordinaryDividends','Ordinary dividends'],['qualifiedDividends','Qualified dividends'],['totalCapitalGainDistributions','Capital gain distributions']] as const;
const fail=():never=>{throw Error('Complete and reconfirm the actual joint household, both spouses and separately owned dividend originals.');};
export function buildEstimatedInvestmentHousehold(data:EstimatedInvestmentHouseholdData|undefined):Household|undefined{
 if(data===undefined)return undefined;
 // Retain unknown keys through strict parsing. Only declared original integer fields change representation.
 const integer=(v:unknown)=>typeof v==='string'&&/^(?:0|[1-9]\d*)$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):fail();
 const money=(raw:string|undefined)=>{if(typeof raw!=='string'||!raw.trim())return fail();const value=parseGuidedCurrency(raw);if(value.isNegative()||!value.isInteger())return fail();return value.toFixed();};
 const result=Form2210InvestmentHouseholdSchema.parse({...data,...Object.fromEntries(SPOUSE_AMOUNTS.map(([key])=>[key,money(data[key])])),sourceTaxYear:integer(data.sourceTaxYear),dividendSources:data.dividendSources?.map(row=>({...row,...Object.fromEntries(DIVIDEND_AMOUNTS.map(([key])=>[key,money(row[key])])),sourceTaxYear:integer(row.sourceTaxYear),sourceIndex:integer(row.sourceIndex)}))});
 const text=(v:string|undefined)=>typeof v==='string'&&v.trim().length>0;
 if(result.sourceTaxYear!==2025||result.sourceFactsConfirmed!==true||HOUSEHOLD_TEXT.some(([key])=>key!=='sourceTaxYear'&&!text(result[key]))||HOUSEHOLD_FLAGS.some(([key])=>result[key]!==true))return fail();
 const ssn=(v:string|undefined)=>typeof v==='string'&&/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/.test(v);
 const identity=(v:Household['primary'])=>!!v&&text(v.firstName)&&text(v.lastName)&&ssn(v.ssn);
 if(!identity(result.primary)||!identity(result.spouse)||result.primary?.ssn?.replace(/-/g,'')===result.spouse?.ssn?.replace(/-/g,''))return fail();
 for(const d of[result.primaryDomicile,result.spouseDomicile])if(!d||d.state!=='MA'||d.startDate!=='2025-01-01'||d.endDate!=='2025-12-31'||!text(d.sourceReference))return fail();
 for(const[key]of SPOUSE_AMOUNTS)if(!/^(?:0+)(?:\.0+)?$/.test(result[key]??''))return fail();
 if(!result.dividendSources?.length)return fail();
 const refs=new Set<string>();
 for(const[index,row]of result.dividendSources.entries()){
  if(row.sourceIndex!==index||row.sourceTaxYear!==2025||!identity(row.recipient)||row.accountHolder!=='primary'||row.otherReportedAmountsZeroConfirmed!==true||DIVIDEND_TEXT.some(([key])=>key!=='sourceIndex'&&key!=='sourceTaxYear'&&!text(row[key]))||!row.payerTin||!/^(?:\d{9}|\d{2}-\d{7})$/.test(row.payerTin)||DIVIDEND_AMOUNTS.some(([key])=>!/^\d+$/.test(row[key]??'')))return fail();
  const ref=row.sourceReference?.trim();if(!ref||refs.has(ref))return fail();refs.add(ref);
 }
 return result;
}
