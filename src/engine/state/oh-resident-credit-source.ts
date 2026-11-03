/** Spec: state/oh-resident-credit-sources.yaml. Source adapter, not a Virginia tax calculator. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { OhioResidentCreditSourcesSchema } from '@/models/ohio-resident-credit-sources.js';
import { ohioNrcCategories,type OhioResidencyFacts } from '@/models/ohio-residency.js';
import type { OhioResidentReturnInput } from './oh-return.js';
import type { OtherStateTaxEntry } from './oh-resident-credit.js';
import { buildOhioPaymentSource } from './oh-payment-source.js';
import { roundDollar } from '@/utils/decimal.js';
function stable(v:unknown):unknown {
 if(Decimal.isDecimal(v))return v.toString();if(Array.isArray(v))return v.map(stable);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([,child])=>child!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,child])=>[k,stable(child)]));return v;
}
const digest=(v:unknown)=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(v)))));
function fail(message:string):never{throw new Error(`Ohio actual resident-credit sources: ${message}`);}
function date(value:string):number {const n=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)fail('valid original source date required');return n;}
const normalize=(v:string)=>v.replace(/\s+/g,'').toUpperCase();
const tin=(v:string)=>v.replace(/[\s-]/g,'');
export interface OhioResidentCreditSourceContext {readonly methodId:'ohio-2025-va-resident-credit-v1';readonly sourceCommitment:string}
interface Stored {factsDigest:string;sourceCommitment:string;expected:Record<string,unknown>;rows:OtherStateTaxEntry[]}
const contexts=new WeakMap<OhioResidentCreditSourceContext,Stored>();
/** No public bind/rebind: all accepted projection values derive from current originals. */
export function readOhioResidentCreditSource(context:OhioResidentCreditSourceContext,facts:OhioResidencyFacts,projection?:OhioResidentReturnInput){
 const stored=contexts.get(context);if(!stored||digest(facts)!==stored.factsDigest||context.sourceCommitment!==stored.sourceCommitment)fail('actual current original context is missing stale or fabricated');
 if(projection){
  for(const [key,expected] of Object.entries(stored.expected))if(digest(Reflect.get(projection,key))!==digest(expected))fail(`current source-derived ${key} projection changed`);
  for(const [key,value] of Object.entries(projection)){
   if(key in stored.expected||key==='residencyResidentCreditSource'||value===undefined)continue;
   // This finite source inventory establishes no other adjustment/credit/cash.
   // It never authorizes a nonzero caller amount or a new structural source.
   if(typeof value!=='string'&&typeof value!=='number'&&!Decimal.isDecimal(value))fail(`separate actual ${key} source composition required`);
   let amount:Decimal;try{amount=new Decimal(value);}catch{return fail(`actual finite known-zero ${key} required`);}
   if(!amount.isFinite()||!amount.isZero())fail(`current known-zero ${key} source changed`);
  }
 }
 return {otherStateTaxes:stored.rows.map(row=>({...row})),sourceCommitment:stored.sourceCommitment};
}
export function buildOhioResidentCreditSource(input:TaxYearInput,result:TaxReturnResult,facts:OhioResidencyFacts):OhioResidentCreditSourceContext {
 const parsed=OhioResidentCreditSourcesSchema.safeParse(facts.residentCreditSources);if(!parsed.success)fail('complete current confirmed original records required');const source=parsed.data;
 const owner=facts.owners[0],person=input.taxpayer.primary,w2=input.w2s[0];
 if(input.taxpayer.taxYear!==2025||result.taxYear!==2025||facts.taxYear!==2025||input.taxpayer.filingStatus!=='single'||input.taxpayer.spouse||input.taxpayer.dependents.length||facts.owners.length!==1||owner?.accountHolder!=='primary'||owner.status!=='full_year_resident'||input.w2s.length!==1||!w2)fail('only actual2025 single primary full-year Ohio ordinary employee admitted');
 if(facts.businessSources||facts.reciprocalWageSources||input.ohioSchoolDistrict||facts.schoolDistrictStatus!=='no_ohio_taxing_district_residency'||facts.allFederalSourcesIncludedConfirmed!==true||facts.noBusinessIncomeConfirmed!==true)fail('complete separate nonbusiness/no-district inventory required');
 if(!person.dateOfBirth||date(person.dateOfBirth)>=date('2025-01-01')||date(person.dateOfBirth)<=date('1961-01-01'))fail('actual under65 original date of birth required');
 const identity={firstName:person.firstName,lastName:person.lastName,ssn:person.ssn};
 if(!/^\d{9}$/.test(tin(person.ssn))||digest(source.originalTaxpayer)!==digest(identity)||digest(source.originalW2)!==digest(w2)||w2.accountHolder!=='primary'||w2.taxYear!==2025||!/^\d{9}$/.test(tin(w2.employer.ein))||w2.militaryService)fail('current actual complete W2 year owner identity or ordinary employer differs');
 if(digest(calculateFederalTax(input))!==digest(result))fail('fresh canonical federal calculation required');
 if(owner.periods.length!==1||owner.periods[0]?.from!=='2025-01-01'||owner.periods[0]?.to!=='2025-12-31'||owner.periods[0]?.domicileState!=='OH'||(owner.stateAdditions?.length??0)||(owner.stateDeductions?.length??0))fail('complete actual Ohio domicile and no separate adjustment rows required');
 const otherArrays=['form1099Int','form1099Div','form1099B','form1099DA','form1099Nec','form1099Misc','form1099G','form1099OID','formW2G','form1099K','form1099C','form1099Q','form1099R','form1099SA','formSSA1099','formRRB1099','scheduleK1','scheduleK1Form1041','rentalProperties','homeSales','form6252','form8814','form8824','savingsBondRedemptions'] as const;
 if(otherArrays.some(key=>(input[key]?.length??0)>0)||input.scheduleC||input.scheduleF||input.netOperatingLoss||input.form172||input.cryptoIncome||input.form4797||input.form6781||input.form4137||input.form8919||input.socialSecurityLumpSumElection||input.royaltyPropertySources||input.adjustments)fail('retained other income or adjustment originals require separate composition even when zero');
 if(Object.entries(input).some(([key,value])=>/^(?:form|schedule)/.test(key)&&value!==undefined&&value!==null&&(!Array.isArray(value)||value.length>0)))fail('other retained form or schedule originals require separate source composition');
 const originalRows=calculateW2StateLocalSources(input,0,w2.stateLocalSources),oh=originalRows.stateRows.find(row=>row.state==='OH'),va=originalRows.stateRows.find(row=>row.state==='VA');
 if(originalRows.stateRows.length!==2||!oh||!va||originalRows.localRows.length||!oh.wages.eq(w2.wages))fail('complete actual OH/VA W2 rows and no local withholding required');
 for(const key of ['federalWithheld','socialSecurityWages','socialSecurityWithheld','medicareWages','medicareWithheld'] as const){const v=w2[key];if(v===undefined||!new Decimal(v).isFinite()||new Decimal(v).lt(0))fail('actual modeled original W2 boxes required');}
 for(const key of ['socialSecurityTips','allocatedTips','box10DependentCareBenefits','box12CodeW','box12CodeD','box12CodeE','box12CodeF','box12CodeG','box12CodeH','box12CodeS','box12CodeAA','box12CodeBB','box12CodeEE','box12CodeT'] as const){const v=w2[key];if(v===undefined||!new Decimal(v).isZero())fail('actual ordinary known-zero special W2 boxes required');}
 if(w2.box12CodeTP!==undefined||w2.box12CodeTT!==undefined||(w2.treasuryTippedOccupationCodes?.length??0)>0)fail('special compensation requires separate method');
 if(!result.agi.eq(w2.wages)||!result.totalIncome.eq(w2.wages)||!result.totalWages.eq(w2.wages)||!result.adjustmentsToIncome.isZero()||!result.earnedIncomeCredit.isZero())fail('complete ordinary current federal wage totals required');
 const D=Decimal.clone({precision:100});let wages=new D(0),virginia=new D(0),next=date('2025-01-01');const ids=new Set<string>(),refs=new Set<string>();
 for(const row of [...source.serviceRows].sort((a,b)=>a.servicePeriodFrom.localeCompare(b.servicePeriodFrom))){
  const from=date(row.servicePeriodFrom),to=date(row.servicePeriodTo),paid=date(row.paymentDate),id=normalize(row.sourceId),ref=normalize(row.sourceReference);
  if(ids.has(id)||refs.has(ref)||from!==next||to<from||to>date('2025-12-31')||paid<to||paid>date('2025-12-31')||tin(row.employerTin)!==tin(w2.employer.ein))fail('actual unique complete employer service periods and payment dates required');
  ids.add(id);refs.add(ref);next=to+86400000;wages=wages.plus(row.wages);if(row.serviceState==='VA')virginia=virginia.plus(row.wages);
 }
 if(next!==date('2026-01-01')||!wages.eq(w2.wages)||!virginia.eq(va.wages.toFixed()))fail('actual complete service payroll/W2 wage allocation differs');
 for(const category of ohioNrcCategories){const a=owner.amounts?.[category];if(!a||!new D(a.federalAmount).eq(category==='wages'?wages:0)||!new D(a.residentAmount).eq(category==='wages'?wages:0)||!new D(a.nonresidentOhioAmount).isZero())fail('same income must be fully included once in actual Ohio resident AGI; no NRC overlap');}
 const payments=buildOhioPaymentSource(input,input.ohioPayments);
 if(payments.datedPayments||payments.facts.paymentRows.length||!payments.estimatedPayments.isZero()||!payments.useTax.isZero()||!payments.creditCarryforward.isZero()||!payments.donations.isZero()||!payments.latePaymentInterest.isZero()||payments.facts.priorReturn.status!=='no_return'||payments.facts.priorCreditCarryforward.status!=='none')fail('first finite Ohio account method requires source-complete no other payments/credits');
 const entity=source.employerEntityOriginal;
 if(normalize(entity.employerName)!==normalize(w2.employer.name)||tin(entity.employerTin)!==tin(w2.employer.ein)||date(entity.documentDate)<date('2025-01-01')||date(entity.documentDate)>date(payments.asOfDate))fail('actual ordinary corporate employer original differs');
 const filed=source.filedReturn,account=source.completedAccount;
 for(const record of [filed,account])if(digest(record.originalTaxpayer)!==digest(identity))fail('actual filed return/account owner differs');
 if(filed.periodFrom!=='2025-01-01'||filed.periodTo!=='2025-12-31'||date(filed.filedDate)<date('2026-01-01')||date(filed.filedDate)>date(account.statementDate)||date(account.statementDate)>date(payments.asOfDate))fail('completed filed return/account chronology differs from current as-of');
 if(!new D(filed.federalAgi).eq(wages)||!new D(filed.incomeTaxedByVirginia).eq(virginia)||!new D(filed.withholding).eq(va.withheld.toFixed())||!new D(filed.incomeTaxBeforeCredits).minus(filed.nonrefundableCredits).eq(filed.netIncomeTax)||!new D(filed.netIncomeTax).eq(account.netIncomeTax))fail('actual same income net liability after credits and original W2 withholding do not reconcile');
 for(const record of [filed,account])for(const key of ['outgoingCredit','otherTaxes','penalties','interest'] as const)if(!new D(record[key]).isZero())fail('other actual account taxes/credits/penalties need separate composition');
 if(!new D(account.unpaidTax).isZero()||!new D(account.unappliedPayments).isZero())fail('actual paid complete account required; unsettled tax is not paid');
 let withheld=new D(0),estimated=new D(0),balance=new D(0),refund=new D(0);
 const receiptIds=new Set<string>(),receiptRefs=new Set<string>(),semantic=new Map<string,boolean>();
 const bankTraces=new Set<string>(),agencyPostings=new Set<string>();
 for(const [list,refundList] of [[account.payments,false],[account.refunds,true]] as const)for(const row of list){
  const id=normalize(row.sourceId),ref=normalize(row.sourceReference),day=date(row.date),meaning=digest({kind:row.kind,date:row.date,amount:new D(row.amount).toFixed()});
  if(digest(row.originalTaxpayer)!==digest(identity)||receiptIds.has(id)||receiptRefs.has(ref)||day<date('2025-01-01')||day>date(account.statementDate)||refundList!==(row.kind==='refund')||refundList&&day<date(filed.filedDate))fail('actual unique applied payment/refund originals owner chronology differs');
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
 const rows:OtherStateTaxEntry[]=[{stateCode:'VA',incomeType:'compensation',doubleTaxedIncome:tax.gt(0)?virginia.toFixed():'0',taxPaid:tax.toFixed()}];
 const {ohioResidency:_r,ohioPayments:_p,ohioSchoolDistrict:_s,ohioReturnHeaderSources:_h,...federalOriginal}=input;
 const expected:Record<string,unknown>={taxYear:2025,filingStatus:'single',federalAgi:roundDollar(result.agi),exemptions:1,residency:structuredClone(facts),residencySourceDigest:digest({input:federalOriginal,facts}),
  otherStateTaxes:rows,residentCredit:undefined,nonresidentCredit:undefined,schoolDistricts:[],isSenior:false,bothSpousesHaveQualifyingIncome:false,
  paymentSourceDigest:payments.sourceDigest,paymentMethodVersion:payments.methodVersion,paymentDatedSource:undefined,paymentTaxCoverage:payments.facts.remainingTaxPayment,paymentTiming:{kind:payments.timingKind,valuationDate:payments.valuationDate,asOfDate:payments.asOfDate},
  priorYearTaxLiability:payments.priorYearTaxLiability,priorYearTimelyFiled:payments.priorYearTimelyFiled,estimatedPaymentSchedule:payments.estimatedPaymentSchedule,computeUnderpaymentPenalty:true,ohioWithholding:roundDollar(oh.withheld)};
 const context:OhioResidentCreditSourceContext=Object.freeze({methodId:'ohio-2025-va-resident-credit-v1',sourceCommitment:digest({input,facts})});contexts.set(context,{factsDigest:digest(facts),sourceCommitment:context.sourceCommitment,expected,rows});return context;
}
