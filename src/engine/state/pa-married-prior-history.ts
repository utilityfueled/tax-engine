/** Spec: state/pa-married-prior-history.yaml. No assumed prior eligibility. */
import Decimal from 'decimal.js';
import type {TaxYearInput} from '@/models/inputs.js';
import {PAMarriedPriorHistorySchema} from '@/models/pa-married-prior-history.js';
import type {PAMarriedOrdinarySources} from '@/models/pa-married-ordinary-sources.js';
import {calculateScheduleSP} from './pa-schedule-sp.js';
import {ordinarySourcePrecision} from './pa-ordinary-source-precision.js';
import {roundDollar} from '@/utils/decimal.js';
type Owner='primary'|'spouse';
const fail=(detail:string):never=>{throw Error('PA married prior history: '+detail);};
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
const name=(value:string)=>value.trim().replace(/\s+/gu,' ').toUpperCase();
const tin=(value:string)=>value.replace(/[-\s]/gu,'');
function day(value:string):string{if(!/^\d{4}-\d{2}-\d{2}$/u.test(value))return fail('actual date unknown');const t=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==value)return fail('actual date impossible');return value;}
/** Only captured metadata is excluded; all actual entered household facts remain. */
export function snapshotPAMarriedPriorCurrentOriginals(input:TaxYearInput,sources:PAMarriedOrdinarySources):Record<string,unknown>{
 const household=structuredClone(sources) as unknown as Record<string,unknown>;
 delete household.priorYearHistory;delete household.sourceFactsConfirmed;delete household.originalFederalSources;
 for(const row of household.owners as Array<Record<string,unknown>>)delete row.originalTaxpayer;
 for(const row of household.wages as Array<Record<string,unknown>>){delete row.original;delete row.originalRecipientSsn;}
 return {input:structuredClone(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='paMarriedOrdinarySources'))),household};
}
/** Bind the entered prior document lexemes separately from current originals. */
export function snapshotPAMarriedPriorOriginals(input:TaxYearInput,sources:PAMarriedOrdinarySources):Record<string,unknown>{
 const prior=structuredClone(sources.priorYearHistory) as unknown as Record<string,unknown>|undefined;
 if(!prior)return fail('actual prior originals missing');delete prior.sourceFactsConfirmed;delete prior.capturedOriginals;
 return {current:snapshotPAMarriedPriorCurrentOriginals(input,sources),prior};
}
export interface PAMarriedPriorRelief {priorYear100PercentForgiveness:boolean;priorYearPATaxableIncome:Decimal;priorYearTaxForgivenessCredit:Decimal}
export function calculatePAMarriedPriorHistory(input:TaxYearInput,sources:PAMarriedOrdinarySources):Map<Owner,PAMarriedPriorRelief>{
 const parsed=PAMarriedPriorHistorySchema.safeParse(sources.priorYearHistory);if(!parsed.success)return fail('complete original history shape unknown');const history=parsed.data;
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,sources),rounding:Decimal.ROUND_HALF_UP});
 function amount(value:string,whole=true):Decimal{if(!/^\d+(?:\.\d+)?$/u.test(value))return fail('actual nonnegative amount unknown or malformed');const n=new Money(value);if(!n.isFinite()||whole&&!n.isInteger())return fail('actual printed whole-dollar source required');return n;}
 if(input.taxpayer.taxYear!==2025||sources.sourceTaxYear!==2025||sources.filingMode!=='M'||history.sourceTaxYear!==2024||history.sourceFactsConfirmed!==true||!history.sourceReference.trim()||input.taxpayer.filingStatus!=='married_filing_jointly'||!input.taxpayer.spouse||input.taxpayer.dependents.length||sources.dependentChildren?.length||sources.residencySources!==undefined||sources.care!==undefined||input.taxpayer.stateResidency!==undefined&&input.taxpayer.stateResidency!=='full-year')return fail('actual2025 separate M fullresident same-spouse no-dependent method required');
 if(stable(history.capturedOriginals)!==stable(snapshotPAMarriedPriorOriginals(input,sources)))return fail('current captured household facts changed; recapture and reconfirm');
 if(history.rows.length!==2)return fail('both prior original owners required');
 const people={primary:input.taxpayer.primary,spouse:input.taxpayer.spouse},rows=new Map<Owner,typeof history.rows[number]>(),references=new Set<string>(),asOf=day(sources.timing.asOfDate);
 for(const row of history.rows){
  const tag=row.accountHolder;if(tag!=='primary'&&tag!=='spouse'||rows.has(tag))return fail('unknown or duplicate prior owner');
  const current=people[tag],other=people[tag==='primary'?'spouse':'primary'],pa=row.originalPA40,sp=row.originalSP;
  const same=(v:{name:string;ssn:string},p:typeof current)=>/^\d{9}$/u.test(tin(v.ssn))&&tin(v.ssn)===tin(p.ssn)&&name(v.name)===name(p.firstName+' '+p.lastName);
  if(!row.sourceReference.trim()||references.has(name(row.sourceReference)))return fail('missing or duplicate prior source');references.add(name(row.sourceReference));
  if(!same(pa,current)||!same(sp,current)||!same(sp.spouse,other)||tin(pa.ssn)===tin(sp.spouse.ssn))return fail('original prior owner or same-spouse identity differs');
  const owner=sources.owners.filter(o=>o.accountHolder===tag);if(owner.length!==1||owner[0].payments.priorReturnStatus!=='actual_return'||!owner[0].payments.priorReturnSourceReference.trim()||owner[0].residency.domicileState!=='PA'||owner[0].residency.factsConfirmed!==true)return fail('actual current fullresident owner and retained prior-return status required');
  if(pa.taxYear!==2024||pa.returnType!=='PA-40'||pa.filingStatus!=='M'||pa.residency!=='resident'||pa.filedConfirmed!==true||day(pa.filedOn)<'2025-01-01'||pa.filedOn>asOf||sp.taxYear!==2024||sp.returnType!=='PA-40SP'||sp.filingCategory!=='married_separate'||day(sp.calendarFrom)!=='2024-01-01'||day(sp.calendarThrough)!=='2024-12-31')return fail('actual filed fullresident2024 separate originals and calendar required');
  for(const key of ['marriedAndLivedTogetherEntireYearConfirmed','bothAliveEntireYearConfirmed','neitherClaimedAsDependentConfirmed','noDependentChildrenConfirmed','allWorldwideSourcesCompleteConfirmed','noOtherStateTaxCreditConfirmed'] as const)if(sp[key]!==true)return fail('prior household eligibility or complete worldwide facts unknown');
  for(const column of [sp.taxpayerColumn,sp.spouseColumn])for(const [line,value] of Object.entries(column)){const n=amount(value);if(line!=='1'&&!n.isZero())return fail('positive prior SP2-10 needs its separate original method');}
  const income=amount(pa.taxableIncome),tax=amount(pa.taxLiability),credit=amount(pa.taxForgivenessCredit);
  if(!amount(sp.taxpayerColumn['1']).eq(income)||!roundDollar(income.times('0.0307')).eq(tax)||!amount(sp.line12).eq(tax)||!amount(sp.line13).isZero()||!amount(sp.line14).eq(tax)||!amount(sp.line16).eq(credit))return fail('original PA40 and SP printed amounts conflict');
  rows.set(tag,row);
 }
 const result=new Map<Owner,PAMarriedPriorRelief>();
 for(const [tag,row] of rows){const other=rows.get(tag==='primary'?'spouse':'primary');if(!other)return fail('other original spouse missing');const sp=row.originalSP;
  for(const [line,value] of Object.entries(sp.spouseColumn))if(!amount(value).eq(amount(other.originalSP.taxpayerColumn[line as keyof typeof sp.spouseColumn])))return fail('independently entered prior spouse columns disagree');
  const own=amount(sp.taxpayerColumn['1']),outside=amount(sp.spouseColumn['1']);
  const replay=calculateScheduleSP({taxYear:2024,filingCategory:'married',dependents:0,paTaxableIncome:own,nontaxableIncome:new Money(0),additionalEligibilityIncome:outside,taxLiability:amount(sp.line12),taxPaidToOtherStates:amount(sp.line13),isClaimedAsDependentOnAnotherFederalReturn:false});
  const printedDecimal=amount(sp.line15,false);if(!amount(sp.line11).eq(own.plus(outside))||!replay.eligibilityIncome.eq(amount(sp.line11))||printedDecimal.gt(1)||!printedDecimal.eq(replay.forgivenessPercentage.div(100))||!replay.taxForgivenessCredit.eq(amount(sp.line16)))return fail('actual prior SP11-16 do not match independently replayed eligibility');
  result.set(tag,{priorYear100PercentForgiveness:replay.forgivenessPercentage.eq(100),priorYearPATaxableIncome:own,priorYearTaxForgivenessCredit:amount(sp.line16)});
 }
 return result;
}
