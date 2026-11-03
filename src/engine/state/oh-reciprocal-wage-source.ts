/** Spec: state/oh-reciprocal-wage-sources.yaml. Actual sources, never a deduction override. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import type { OhioResidentReturnInput } from './oh-return.js';
import type { OhioResidencyFacts } from '@/models/ohio-residency.js';
import { ohioNrcCategories } from '@/models/ohio-residency.js';
import { OhioReciprocalWageSourcesSchema } from '@/models/ohio-reciprocal-wage-sources.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import { calculateOhioITNRC } from './oh-it-nrc.js';
import { buildOhioPaymentSource } from './oh-payment-source.js';
function stable(value: unknown): unknown {
  if (Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  return value;
}
const digest = (v:unknown) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(v)))));
const identity = (v:string) => v.replace(/\s+/g,'').toUpperCase();
const tin = (v:string) => v.replace(/\D/g,'');
function fail(message:string):never {throw new Error(`Ohio actual reciprocal wage sources: ${message}`);}
function day(value:string):number {
  const n=Date.parse(value+'T00:00:00Z');
  if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)fail('actual valid source date required');
  return n;
}
/** Unforgeable local context; private originals stay in a WeakMap, not audit output. */
export interface OhioReciprocalWageContext {readonly methodId:'ohio-2025-pa-employee-reciprocity-v1';readonly sourceCommitment:string}
const paymentProjectionKeys = ['paymentSourceDigest','residencySourceDigest','paymentMethodVersion','paymentTiming','paymentTaxCoverage','paymentDatedSource','priorYearTaxLiability','priorYearTimelyFiled','estimatedPaymentSchedule','computeUnderpaymentPenalty'] as const;
const zeroCashKeys = ['useTax','refundableCredits','donations','creditCarryforward','latePaymentInterest','amendedPriorOverpayment','underpaymentPenalty','refundableHistoricPreservationCredit','refundableJobCreationCredit','passThroughEntityCredit','refundableMotionPictureCredit','filmTheaterCapitalImprovementCredit','ventureCapitalCredit','estimatedPayments'] as const;
interface Stored {factsDigest:string;federalAgi:string;withholding:string;derivedFacts:OhioResidencyFacts;paymentProjectionDigest:string}
const contexts=new WeakMap<OhioReciprocalWageContext,Stored>();
export function readOhioReciprocalWageSource(context:OhioReciprocalWageContext,facts:OhioResidencyFacts,federalAgi:Decimal|string|number,projection?:OhioResidentReturnInput){
  const stored=contexts.get(context);
  if(!stored||stored.factsDigest!==digest(facts)||!new Decimal(stored.federalAgi).eq(federalAgi))fail('actual original context is missing stale or mismatched');
  if(projection){
    const actual=Object.fromEntries(paymentProjectionKeys.map(key=>[key,projection[key]]));
    if(digest(actual)!==stored.paymentProjectionDigest)fail('actual finite payment identity chronology or method projection changed');
    for(const key of zeroCashKeys){
      const value=projection[key];
      // Absence is allowed only because this actual finite cohort independently
      // establishes zero/no claim; a supplied different cash amount never binds.
      if(value===undefined)continue;
      if(value===null||(!Decimal.isDecimal(value)&&typeof value!=='string'&&typeof value!=='number'))fail('actual known-zero finite cash projection required');
      let amount:Decimal;try{amount=new Decimal(value);}catch{return fail('actual known-zero finite cash projection required');}
      if(!amount.isFinite()||!amount.isZero())fail('actual finite cash projection differs from current original zero/no-claim facts');
    }
  }
  return {federalAgi:new Decimal(stored.federalAgi),deduction:new Decimal(stored.federalAgi),withholding:new Decimal(stored.withholding),nrcFacts:structuredClone(stored.derivedFacts)};
}
/** Finite primary single full-year PA employee method. Other cohorts remain guarded. */
export function calculateOhioReciprocalWageSource(input:TaxYearInput,result:TaxReturnResult,facts:OhioResidencyFacts):OhioReciprocalWageContext {
  const parsed=OhioReciprocalWageSourcesSchema.safeParse(facts.reciprocalWageSources);
  if(!parsed.success)fail('complete confirmed current ordinary employee originals required');
  const source=parsed.data,person=input.taxpayer.primary,owner=facts.owners[0],w2=input.w2s[0];
  if(input.taxpayer.taxYear!==2025||result.taxYear!==2025||facts.taxYear!==2025||input.taxpayer.filingStatus!=='single'||input.taxpayer.spouse||facts.owners.length!==1||owner?.accountHolder!=='primary'||owner.status!=='nonresident'||input.w2s.length!==1||!w2)fail('only current2025 single primary full-year PA employee admitted');
  if(facts.businessSources||facts.allFederalSourcesIncludedConfirmed!==true||facts.noBusinessIncomeConfirmed!==true)fail('complete nonbusiness income inventory required');
  if(source.sourceTaxYear!==2025||source.accountHolder!=='primary')fail('current2025 primary employee source required');
  if(digest(source.originalTaxpayer)!==digest({firstName:person.firstName,lastName:person.lastName,ssn:person.ssn})||digest(source.originalW2)!==digest(w2)||w2.accountHolder!=='primary'||w2.taxYear!==2025)fail('current actual full W2 owner year or identity differs');
  const actual=calculateW2StateLocalSources(input,0,w2.stateLocalSources);
  const ohio=actual.stateRows.find(row=>row.state==='OH'),pa=actual.stateRows.find(row=>row.state==='PA');
  // The original-row validator already requires finite nonnegative source strings.
  // PA cash remains separate; this finite method admits at most two significant decimal places.
  if(actual.stateRows.length!==2||!ohio||!pa||actual.localRows.length||pa.withheld.decimalPlaces()>2||!ohio.wages.eq(w2.wages)||!pa.wages.eq(w2.wages))fail('complete actual PA/OH wage rows and no local reporting required');
  const nonwageArrays=['form1099Int','form1099Div','form1099B','form1099DA','form1099Nec','form1099Misc','form1099G','form1099OID','formW2G','form1099K','form1099C','form1099Q','form1099R','form1099SA','formSSA1099','formRRB1099','scheduleK1','scheduleK1Form1041','rentalProperties','homeSales','form6252','form8814','form8824','savingsBondRedemptions'] as const;
  if(nonwageArrays.some(key=>(input[key]?.length??0)>0)||input.scheduleC||input.scheduleF||input.netOperatingLoss||input.form172||input.cryptoIncome||input.form4797||input.form6781||input.form4137||input.form8919||input.socialSecurityLumpSumElection||input.royaltyPropertySources||input.adjustments)fail('retained other income originals need their separate source composition even when zero or cancelling');
  if(Object.entries(input).some(([key,value])=>/^(?:form|schedule)/.test(key)&&value!==undefined&&value!==null&&(!Array.isArray(value)||value.length>0)))fail('other retained form or schedule originals require separate composition');
  if(w2.militaryService||!/^\d{9}$/.test(tin(w2.employer.ein)))fail('actual ordinary employer TIN and nonspecial services required');
  for(const key of ['federalWithheld','socialSecurityWages','socialSecurityWithheld','medicareWages','medicareWithheld'] as const){
    const value=w2[key];if(value===undefined||!new Decimal(value).isFinite()||new Decimal(value).isNegative())fail('actual modeled original W2 boxes including known zero are required');
  }
  for(const key of ['socialSecurityTips','allocatedTips','box10DependentCareBenefits','box12CodeW','box12CodeD','box12CodeE','box12CodeF','box12CodeG','box12CodeH','box12CodeS','box12CodeAA','box12CodeBB','box12CodeEE','box12CodeT'] as const){
    const value=w2[key];if(value===undefined||!new Decimal(value).isZero())fail('actual all-box known zero and ordinary compensation classification required');
  }
  if(w2.box12CodeTP!==undefined||w2.box12CodeTT!==undefined||(w2.treasuryTippedOccupationCodes?.length??0)>0)fail('special compensation needs its separate source method');
  if(!result.totalIncome.eq(w2.wages)||!result.totalWages.eq(w2.wages)||!result.agi.eq(w2.wages)||!result.adjustmentsToIncome.isZero())fail('actual complete federal wage and adjustment totals differ');
  const domicile=source.domicileOriginal,entity=source.employerEntityOriginal,services=source.serviceOriginal;
  const periods=owner.periods;
  if(domicile.sourceTaxYear!==2025||domicile.accountHolder!=='primary'||domicile.domicileState!=='PA'||services.sourceTaxYear!==2025||services.accountHolder!=='primary'||entity.sourceTaxYear!==2025||entity.entityType!=='c_corporation')fail('actual primary ordinary corporation and reciprocal domicile proof required');
  if(periods.length!==1||periods[0]?.from!=='2025-01-01'||periods[0]?.to!=='2025-12-31'||periods[0]?.domicileState!=='PA'||domicile.from!=='2025-01-01'||domicile.to!=='2025-12-31'||identity(domicile.name)!==identity(person.firstName+' '+person.lastName)||tin(domicile.ssn)!==tin(person.ssn))fail('complete actual current PA domicile originals differ');
  for(const original of [entity,services])if(original.from!=='2025-01-01'||original.to!=='2025-12-31'||tin(original.employerTin)!==tin(w2.employer.ein))fail('complete full-year employer identity and ordinary services required');
  if(identity(entity.employerName)!==identity(w2.employer.name))fail('current actual employer entity differs');
  const payments=buildOhioPaymentSource(input,input.ohioPayments);
  if(payments.facts.remainingTaxPayment.status!=='no_remaining_tax'||payments.facts.paymentRows.length||!payments.estimatedPayments.isZero()||!payments.useTax.isZero()||!payments.creditCarryforward.isZero()||!payments.donations.isZero()||!payments.latePaymentInterest.isZero())fail('actual zero remaining-tax and complete account/refund elections required');
  for(const original of [domicile,entity,services])if(day(original.documentDate)>day(payments.asOfDate)||day(original.documentDate)<day('2025-01-01'))fail('actual documentary evidence must exist by current as-of');
  const values=[w2.wages,ohio.withheld.toFixed(),services.totalCompensation,...source.payrollRows.flatMap(row=>[row.wages,row.ohioWithheld])];
  const integerDigits=Math.max(...values.map(v=>v.split('.')[0]?.length??1)),scale=Math.max(...values.map(v=>v.split('.')[1]?.length??0));
  const D=Decimal.clone({precision:Math.max(100,integerDigits+scale+String(source.payrollRows.length).length+32)});
  let wages=new D(0),withheld=new D(0),next=day('2025-01-01');const ids=new Set<string>(),documents=new Set<string>();
  for(const row of [...source.payrollRows].sort((a,b)=>a.servicePeriodFrom.localeCompare(b.servicePeriodFrom))){
    const id=identity(row.sourceId),document=identity(row.sourceReference);
    if(ids.has(id)||documents.has(document))fail('duplicated actual payroll identity');ids.add(id);documents.add(document);
    const from=day(row.servicePeriodFrom),to=day(row.servicePeriodTo),paid=day(row.paymentDate);
    if(row.sourceTaxYear!==2025||row.accountHolder!=='primary'||row.serviceState!=='OH')fail('actual payroll owner year and Ohio services required');
    if(from!==next||to<from||row.servicePeriodTo>'2025-12-31'||row.paymentDate<'2025-01-01'||row.paymentDate>'2025-12-31'||paid<from||paid<to||tin(row.employerTin)!==tin(w2.employer.ein))fail('actual unique payroll periods dates and employer must reconcile');
    next=to+86400000;wages=wages.plus(row.wages);withheld=withheld.plus(row.ohioWithheld);
  }
  if(next!==day('2026-01-01')||!wages.eq(w2.wages)||!wages.eq(services.totalCompensation)||!withheld.eq(ohio.withheld.toFixed()))fail('complete actual payroll wages and withholding do not reconcile original W2');
  for(const category of ohioNrcCategories){const amount=owner.amounts?.[category];if(!amount||!new D(amount.federalAmount).eq(category==='wages'?wages:0)||!new D(amount.residentAmount).isZero()||!new D(amount.nonresidentOhioAmount).eq(category==='wages'?wages:0))fail('actual raw owner income and Ohio services allocation differs');}
  if((owner.stateAdditions?.length??0)||(owner.stateDeductions?.length??0))fail('other actual state adjustment originals require separate classification');
  const reported=wages.toDecimalPlaces(0,D.ROUND_HALF_UP).toFixed(0),reportedWithholding=withheld.toDecimalPlaces(0,D.ROUND_HALF_UP).toFixed(0);
  // Check raw source allocations first. Only the local NRC view excludes the
  // compensation already deducted on official2025 ScheduleAdjustments line14.
  calculateOhioITNRC({taxYear:2025,filingStatus:'single',federalAgi:reported,ohioAgi:reported,taxRemainingBeforeResidencyCredits:'0',residencyFacts:facts});
  const derived=structuredClone(facts),derivedOwner=derived.owners[0];if(!derivedOwner?.amounts)fail('actual owner allocation required');
  derivedOwner.amounts.wages.nonresidentOhioAmount='0';
  calculateOhioITNRC({taxYear:2025,filingStatus:'single',federalAgi:reported,ohioAgi:'0',taxRemainingBeforeResidencyCredits:'0',residencyFacts:derived});
  const context:OhioReciprocalWageContext=Object.freeze({methodId:'ohio-2025-pa-employee-reciprocity-v1',sourceCommitment:digest({input,facts})});
  // Derive the accepted projection exclusively from already validated originals.
  // No caller-provided projection can bind/rebind or authorize a context.
  const {ohioResidency:_residency,ohioPayments:_payments,...federalOriginals}=input;
  const paymentProjection={
    paymentSourceDigest:payments.sourceDigest,residencySourceDigest:digest({input:federalOriginals,facts}),
    paymentMethodVersion:payments.methodVersion,
    paymentTiming:{kind:payments.timingKind,valuationDate:payments.valuationDate,asOfDate:payments.asOfDate},
    paymentTaxCoverage:payments.facts.remainingTaxPayment,paymentDatedSource:undefined,
    priorYearTaxLiability:payments.priorYearTaxLiability,priorYearTimelyFiled:payments.priorYearTimelyFiled,
    estimatedPaymentSchedule:payments.estimatedPaymentSchedule,computeUnderpaymentPenalty:true,
  };
  contexts.set(context,{factsDigest:digest(facts),federalAgi:reported,withholding:reportedWithholding,derivedFacts:derived,paymentProjectionDigest:digest(paymentProjection)});return context;
}
