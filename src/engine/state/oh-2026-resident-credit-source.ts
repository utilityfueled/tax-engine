/** Spec: state/oh-2026-resident-credit-draft.yaml. Never computes a Virginia return. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { Ohio2026VaResidentCreditSourcesSchema } from '@/models/ohio-2026-return-draft.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import { ohioNrcCategories } from '@/models/ohio-residency.js';
function stable(v: unknown): unknown {
 if (Decimal.isDecimal(v)) return v.toString();
 if (Array.isArray(v)) return v.map(stable);
 if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, c]) => c !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k,c]) => [k,stable(c)]));
 return v;
}
const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(v)))));
function fail(message:string):never{throw new Error(`Ohio2026 paid resident-credit sources: ${message}`);}
function date(value:string):number {const n=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)fail('valid original source date required');return n;}
const normalize=(v:string)=>v.replace(/\s+/g,'').toUpperCase();
const tin=(v:string)=>v.replace(/[\s-]/g,'');
export interface Ohio2026ResidentCreditSourceContext { readonly methodId:'oh-2026-va-resident-credit-employee-draft-v1';readonly sourceCommitment:string }
interface Projection { income:string; taxPaid:string }
const contexts=new WeakMap<Ohio2026ResidentCreditSourceContext,{currentDigest:string;projection:Projection}>();
export function readOhio2026ResidentCreditSource(context:Ohio2026ResidentCreditSourceContext,input:TaxYearInput,raw:unknown):Projection {
 const stored=contexts.get(context);if(!stored||stored.currentDigest!==digest({input,raw}))fail('current original context is missing stale or forged');return {...stored.projection};
}
export function calculateOhio2026ResidentCreditSource(input:TaxYearInput,raw:unknown):Ohio2026ResidentCreditSourceContext {
 const parsed=Ohio2026VaResidentCreditSourcesSchema.safeParse(raw);if(!parsed.success)fail('complete confirmed current originals required');
 const source=parsed.data.residentCreditSources, facts=input.ohioResidency, person=input.taxpayer.primary,w2=input.w2s[0],owner=facts?.owners[0];
 if(input.taxpayer.taxYear!==2026||input.taxpayer.filingStatus!=='single'||input.taxpayer.spouse||input.taxpayer.dependents.length||facts?.taxYear!==2026||facts.owners.length!==1||owner?.accountHolder!=='primary'||owner.status!=='full_year_resident'||input.w2s.length!==1||!w2)fail('single current full-year Ohio ordinary employee required');
 if(facts.businessSources||facts.reciprocalWageSources||facts.residentCreditSources||input.ohioSchoolDistrict||facts.schoolDistrictStatus!=='no_ohio_taxing_district_residency'||facts.allFederalSourcesIncludedConfirmed!==true||facts.noBusinessIncomeConfirmed!==true)fail('separate reciprocal business school or old source method required');
 const identity={firstName:person.firstName,lastName:person.lastName,ssn:person.ssn};
 if(!/^\d{9}$/.test(tin(person.ssn))||digest(source.originalTaxpayer)!==digest(identity)||digest(source.originalW2)!==digest(w2)||w2.accountHolder!=='primary'||w2.taxYear!==2026||!/^\d{9}$/.test(tin(w2.employer.ein)))fail('current complete original owner/W2 identity differs');
 if(owner.periods.length!==1||owner.periods[0]?.from!=='2026-01-01'||owner.periods[0]?.to!=='2026-12-31'||owner.periods[0]?.domicileState!=='OH'||(owner.stateAdditions?.length??0)||(owner.stateDeductions?.length??0))fail('complete actual Ohio domicile without adjustments required');
 const originalRows=calculateW2StateLocalSources(input,0,w2.stateLocalSources),oh=originalRows.stateRows.find(row=>row.state==='OH'),va=originalRows.stateRows.find(row=>row.state==='VA');
 if(originalRows.stateRows.length!==2||!oh||!va||originalRows.localRows.length||!oh.wages.eq(w2.wages))fail('exact actual OH/VA original state rows required');
 const common=parsed.data.employmentOriginals;
 const commonRows=common[0]?.serviceRows.map(row=>({id:row.sourceId,ref:row.sourceReference,from:row.from,to:row.to,paid:row.paymentDate,state:row.serviceState,wages:new Decimal(row.wages).toFixed()})).sort((a,b)=>a.from.localeCompare(b.from));
 const specializedRows=source.serviceRows.map(row=>({id:row.sourceId,ref:row.sourceReference,from:row.servicePeriodFrom,to:row.servicePeriodTo,paid:row.paymentDate,state:row.serviceState,wages:new Decimal(row.wages).toFixed()})).sort((a,b)=>a.from.localeCompare(b.from));
 if(common.length!==1||common[0]?.w2Index!==0||digest(commonRows)!==digest(specializedRows))fail('common and specialized original payroll differ');
 const asOf=input.ohioPayments?.currentTiming.asOfDate;if(!asOf)fail('actual current payment as-of required');date(asOf);
 const D=Decimal.clone({precision:100});let wages=new D(0),virginia=new D(0),next=date('2026-01-01');const ids=new Set<string>(),refs=new Set<string>();
 for(const row of [...source.serviceRows].sort((a,b)=>a.servicePeriodFrom.localeCompare(b.servicePeriodFrom))){
  const from=date(row.servicePeriodFrom),to=date(row.servicePeriodTo),paid=date(row.paymentDate),id=normalize(row.sourceId),ref=normalize(row.sourceReference);
  if(ids.has(id)||refs.has(ref)||from!==next||to<from||to>date('2026-12-31')||paid<to||paid>date('2026-12-31')||tin(row.employerTin)!==tin(w2.employer.ein))fail('actual unique complete employer service periods and payment dates required');
  ids.add(id);refs.add(ref);next=to+86400000;wages=wages.plus(row.wages);if(row.serviceState==='VA')virginia=virginia.plus(row.wages);
 }
 if(next!==date('2027-01-01')||!wages.eq(w2.wages)||!virginia.eq(va.wages.toFixed()))fail('actual complete service payroll/W2 wage allocation differs');
 for(const category of ohioNrcCategories){const a=owner.amounts?.[category];if(!a||!new D(a.federalAmount).eq(category==='wages'?wages:0)||!new D(a.residentAmount).eq(category==='wages'?wages:0)||!new D(a.nonresidentOhioAmount).isZero())fail('same income must be fully included once in actual Ohio resident AGI; no NRC overlap');}
 const payments={asOfDate:asOf};
 const entity=source.employerEntityOriginal;
 if(normalize(entity.employerName)!==normalize(w2.employer.name)||tin(entity.employerTin)!==tin(w2.employer.ein)||date(entity.documentDate)<date('2026-01-01')||date(entity.documentDate)>date(payments.asOfDate))fail('actual ordinary corporate employer original differs');
 const filed=source.filedReturn,account=source.completedAccount;
 for(const record of [filed,account])if(digest(record.originalTaxpayer)!==digest(identity))fail('actual filed return/account owner differs');
 if(filed.periodFrom!=='2026-01-01'||filed.periodTo!=='2026-12-31'||date(filed.filedDate)<date('2027-01-01')||date(filed.filedDate)>date(account.statementDate)||date(account.statementDate)>date(payments.asOfDate))fail('completed filed return/account chronology differs from current as-of');
 if(!new D(filed.federalAgi).eq(wages)||!new D(filed.incomeTaxedByVirginia).eq(virginia)||!new D(filed.withholding).eq(va.withheld.toFixed())||!new D(filed.incomeTaxBeforeCredits).minus(filed.nonrefundableCredits).eq(filed.netIncomeTax)||!new D(filed.netIncomeTax).eq(account.netIncomeTax))fail('actual same income net liability after credits and original W2 withholding do not reconcile');
 for(const record of [filed,account])for(const key of ['outgoingCredit','otherTaxes','penalties','interest'] as const)if(!new D(record[key]).isZero())fail('other actual account taxes/credits/penalties need separate composition');
 if(!new D(account.unpaidTax).isZero()||!new D(account.unappliedPayments).isZero())fail('actual paid complete account required; unsettled tax is not paid');
 let withheld=new D(0),estimated=new D(0),balance=new D(0),refund=new D(0);
 const receiptIds=new Set<string>(),receiptRefs=new Set<string>(),semantic=new Map<string,boolean>();
 const bankTraces=new Set<string>(),agencyPostings=new Set<string>();
 for(const [list,refundList] of [[account.payments,false],[account.refunds,true]] as const)for(const row of list){
  const id=normalize(row.sourceId),ref=normalize(row.sourceReference),day=date(row.date),meaning=digest({kind:row.kind,date:row.date,amount:new D(row.amount).toFixed()});
  if(digest(row.originalTaxpayer)!==digest(identity)||receiptIds.has(id)||receiptRefs.has(ref)||day<date('2026-01-01')||day>date(account.statementDate)||refundList!==(row.kind==='refund')||refundList&&day<date(filed.filedDate))fail('actual unique applied payment/refund originals owner chronology differs');
  const originals=row.transactionOriginals;
  if(originals){
   if(refundList||row.kind!=='balance')fail('settled ACH-credit balance originals cannot establish withholding estimates or refunds');
   const bank=originals.bankTransferOriginal,posting=originals.agencyPostingOriginal;
   if(digest(bank.originalTaxpayer)!==digest(identity)||digest(posting.originalTaxpayer)!==digest(identity)
      ||!new D(bank.amount).gt(0)||!new D(bank.amount).eq(row.amount)||!new D(posting.amount).eq(row.amount)
      ||date(bank.settlementDate)!==day||date(posting.postingDate)<day||date(posting.postingDate)>date(account.statementDate)
      ||posting.accountSourceReference!==account.sourceReference||posting.achTraceNumber!==bank.achTraceNumber)
    fail('actual settled bank and applied agency transaction originals do not reconcile');
   const postingId=normalize(posting.postingId);
   if(bankTraces.has(bank.achTraceNumber)||agencyPostings.has(postingId))fail('an actual bank trace or agency posting cannot establish two payments');
   bankTraces.add(bank.achTraceNumber);agencyPostings.add(postingId);
  }
  if(semantic.has(meaning)&&(!semantic.get(meaning)||!originals))fail('indistinguishable receipt rows require distinct actual bank and agency transaction originals');
  receiptIds.add(id);receiptRefs.add(ref);semantic.set(meaning,Boolean(originals));
  if(row.kind==='withholding')withheld=withheld.plus(row.amount);else if(row.kind==='estimated')estimated=estimated.plus(row.amount);else if(row.kind==='balance')balance=balance.plus(row.amount);else refund=refund.plus(row.amount);
 }
 if(!withheld.eq(filed.withholding)||!estimated.eq(filed.estimatedPayments)||!balance.eq(filed.balancePayments)||!refund.eq(filed.refund)||!withheld.plus(estimated).plus(balance).minus(refund).eq(account.netIncomeTax))fail('completed account net applied payments/refunds do not equal actual net income tax');
 const tax=new D(account.netIncomeTax);if(tax.gt(0)&&!virginia.gt(0))fail('actual positive paid tax requires the same eligible positive income');
 const currentDigest=digest({input,raw});
 const context:Ohio2026ResidentCreditSourceContext=Object.freeze({methodId:'oh-2026-va-resident-credit-employee-draft-v1',sourceCommitment:currentDigest});
 contexts.set(context,{currentDigest,projection:{income:tax.gt(0)?virginia.toFixed():'0',taxPaid:tax.toFixed()}});return context;
}
