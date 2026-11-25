/** Spec: state/oh-school-header-same-invocation.yaml. Active synchronous scope only. */
import Decimal from 'decimal.js';
import {calculateFederalTax} from '@/engine/federal.js';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import {buildOhioResidentReturnInput} from './oh-input-adapter.js';
import {exactOhioSchoolArithmetic} from './oh-sd-100-sources.js';
const brand=Symbol('completed current Ohio school adapter');
export interface OhioSourceAdapterInvocation{readonly [brand]:true}
const active=new WeakMap<OhioSourceAdapterInvocation,{material:string;method:string|undefined}>();

/** The pending render owns an isolated, plain canonical record for this adapter call. */
function immutableSchoolInput(input: TaxYearInput): TaxYearInput | undefined {
  const copies = new Map<object, object>();
  const pending = new Set<object>();

  function copy(value: unknown): unknown {
    if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))) return value;
    if (typeof value !== 'object' || pending.has(value)) throw Error('Unsupported current federal input');
    const existing = copies.get(value);
    if (existing) return existing;

    const array = Array.isArray(value);
    const expectedPrototype = array ? Array.prototype : Object.prototype;
    const keys = Reflect.ownKeys(value);
    if (Object.getPrototypeOf(value) !== expectedPrototype || keys.some(key => typeof key !== 'string')) {
      throw Error('Unsupported current federal input');
    }
    if (array && keys.length !== value.length + 1) throw Error('Unsupported current federal array');

    const output = array ? [] : {};
    pending.add(value);
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw Error('Unsupported current federal field');
      }
      if (array && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)
        || Number(key) >= value.length || descriptor.value === undefined)) {
        throw Error('Unsupported current federal array entry');
      }
      Object.defineProperty(output, key, { value: copy(descriptor.value), enumerable: true });
    }
    pending.delete(value);
    copies.set(value, output);
    return Object.freeze(output);
  }

  try {
    return copy(input) as TaxYearInput;
  } catch {
    return undefined;
  }
}

/** Only the synchronous adapter receives this pair. Its result never reaches the proof consumer. */
class CurrentFederalCalculation {
  readonly #input: TaxYearInput;
  readonly #result: TaxReturnResult;
  readonly #origin: 'pending-header' | 'schedule-a';

  constructor(input: TaxYearInput, result: TaxReturnResult, origin: 'pending-header' | 'schedule-a') {
    this.#input = input;
    this.#result = result;
    this.#origin = origin;
  }

  static forInput(input: TaxYearInput, candidate: CurrentFederalCalculation | undefined): TaxReturnResult | undefined {
    if (typeof candidate === 'object' && candidate !== null && #input in candidate && candidate.#input === input) {
      return candidate.#result;
    }
    return undefined;
  }

  static ownsPendingResult(input: TaxYearInput, result: TaxReturnResult, candidate: CurrentFederalCalculation | undefined): boolean {
    return typeof candidate === 'object' && candidate !== null && #input in candidate
      && candidate.#origin === 'pending-header' && candidate.#input === input && candidate.#result === result;
  }
}
export type OhioCurrentFederalCalculation = CurrentFederalCalculation;
export function readOhioCurrentFederalCalculation(
  input: TaxYearInput, candidate: OhioCurrentFederalCalculation | undefined,
): TaxReturnResult | undefined {
  return CurrentFederalCalculation.forInput(input, candidate);
}

export function ownsOhioPendingFederalResult(
  input: TaxYearInput, result: TaxReturnResult, candidate: OhioCurrentFederalCalculation | undefined,
): boolean {
  return CurrentFederalCalculation.ownsPendingResult(input, result, candidate);
}

/** Spec: state/oh-sd-100-federal-schedule-a.yaml. A calculation supplies its own preliminary result. */
export function verifyOhioSchoolScheduleAPayments(
  input: TaxYearInput, calculatePreliminary: (input: TaxYearInput) => TaxReturnResult,
) {
  const current = immutableSchoolInput(input);
  if (!current) throw Error('Ohio school district tax deductions require complete plain current originals.');
  const beforeSchoolDeduction = calculatePreliminary(current);
  const adapted = buildOhioResidentReturnInput(current, beforeSchoolDeduction, undefined,
    new CurrentFederalCalculation(current, beforeSchoolDeduction, 'schedule-a'));
  if (!adapted.schoolDistrictSource || !current.ohioSchoolDistrict) {
    throw Error('Ohio school district tax deductions require reconciled current payment sources.');
  }
  const schedule = adapted.schoolDistrictSource.estimatedPaymentSchedule;
  // The adapter already validated the account amount using the school schema's trimmed decimal format.
  const priorCredit = current.ohioSchoolDistrict.payments.account.priorCreditApplied.trim();
  const Exact = exactOhioSchoolArithmetic([priorCredit, ...schedule.map(row => new Decimal(row.amount).toFixed())]);
  const appliedPriorCredit = new Exact(priorCredit);
  const inCashYear = schedule
    .reduce((total, row) => row.date.startsWith('2025-') ? total.plus(row.amount) : total, new Exact(0));
  // The verified schedule includes the applied credit at its 2025 endpoint.
  const payments = Object.freeze({
    estimatedPrincipal: inCashYear.minus(appliedPriorCredit).toFixed(),
    appliedPriorCredit: appliedPriorCredit.toFixed(),
  });
  return { current, payments, adapted, beforeSchoolDeduction };
}
function arrayData(value:unknown[]):unknown[]{
 if(Object.getPrototypeOf(value)!==Array.prototype||Object.getOwnPropertySymbols(value).length||Object.getOwnPropertyNames(value).length!==value.length+1)throw Error('Unsupported source proof array');
 return Array.from({length:value.length},(_,index)=>{
  const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
  if(!descriptor||!('value' in descriptor)||!descriptor.enumerable)throw Error('Unsupported source proof array entry');
  return descriptor.value;
 });
}
function stable(value:unknown):unknown{
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return Object.is(value,-0)?['negative-zero']:value;
 if(typeof value!=='object'||value===null)throw Error('Unsupported source proof material');
 if(Object.getOwnPropertySymbols(value).length)throw Error('Unsupported source proof symbol key');
 if(Object.getPrototypeOf(value)===Decimal.prototype&&value instanceof Decimal){
  if(Object.getOwnPropertyNames(value).length!==4)throw Error('Unsupported source proof Decimal metadata');
  const c=Object.getOwnPropertyDescriptor(value,'constructor'),s=Object.getOwnPropertyDescriptor(value,'s'),e=Object.getOwnPropertyDescriptor(value,'e'),d=Object.getOwnPropertyDescriptor(value,'d');
  if(!c||!('value' in c)||!c.enumerable||c.value!==Decimal||!s||!('value' in s)||!s.enumerable||(s.value!==1&&s.value!==-1)||!e||!('value' in e)||!e.enumerable||!Number.isSafeInteger(e.value)||!d||!('value' in d)||!d.enumerable||!Array.isArray(d.value))throw Error('Unsupported source proof Decimal');
  const digits:unknown[]=d.value;
  if(Object.getPrototypeOf(digits)!==Array.prototype||Object.getOwnPropertySymbols(digits).length||!digits.length||Object.getOwnPropertyNames(digits).length!==digits.length+1)throw Error('Unsupported source proof Decimal digits');
  for(let index=0;index<digits.length;index++){
   const entry=Object.getOwnPropertyDescriptor(digits,String(index));
   if(!entry||!('value' in entry)||!entry.enumerable||typeof entry.value!=='number'||!Number.isSafeInteger(entry.value)||entry.value<0||entry.value>=10000000)throw Error('Unsupported source proof Decimal digits');
  }
  return ['decimal',Decimal.prototype.toString.call(value)];
 }
 if(Array.isArray(value))return ['array',arrayData(value).map(stable)];
 if(Object.getPrototypeOf(value)!==Object.prototype)throw Error('Unsupported source proof object');
 return ['object',Object.getOwnPropertyNames(value).sort((a,b)=>a.localeCompare(b)).flatMap(key=>{
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor||!('value' in descriptor)||!descriptor.enumerable)throw Error('Unsupported source proof object entry');
  return descriptor.value===undefined?[]:[[key,stable(descriptor.value)]];
 })];
}
const material=(input:TaxYearInput,federal:TaxReturnResult)=>JSON.stringify(stable({input,federal}));
/** Calls the actual full adapter; no caller-supplied adapter result or mutable result escapes. */
export function withOhioSchoolAdapterInvocation<T>(input:TaxYearInput,federal:TaxReturnResult,use:(proof:OhioSourceAdapterInvocation)=>T):T{
 return withCompletedSchoolAdapter(input,federal,use);
}

/** Run the real adapter before exposing its existing proof, with no supplied federal result. */
export function withPendingOhioSchoolAdapterInvocation<T>(input: TaxYearInput, use: (proof: OhioSourceAdapterInvocation) => T): T {
  const immutable = immutableSchoolInput(input);
  const current = immutable ?? input;
  const federal = calculateFederalTax(current);
  const currentFederal = immutable ? new CurrentFederalCalculation(immutable, federal, 'pending-header') : undefined;
  return withCompletedSchoolAdapter(current, federal, use, currentFederal);
}

function withCompletedSchoolAdapter<T>(
  input: TaxYearInput, federal: TaxReturnResult, use: (proof: OhioSourceAdapterInvocation) => T,
  currentFederal?: OhioCurrentFederalCalculation,
): T {
 const adapted=buildOhioResidentReturnInput(input,federal,undefined,currentFederal);
 const proof=Object.freeze({[brand]:true as const});
 // Unsupported serialization cannot introduce an earlier error or authorize reuse.
 try{active.set(proof,{material:material(input,federal),method:adapted.schoolDistrictSource?.methodVersion});}catch{/* Original header validation remains the fallback. */}
 try{return use(proof);}finally{active.delete(proof);}
}
/** Missing/forged/expired/changed proof falls back to the original full validation at its original position. */
export function readOhioSchoolAdapterMethod(input:TaxYearInput,federal:TaxReturnResult,proof:OhioSourceAdapterInvocation|undefined):{method:string|undefined}|undefined{
 const current=proof&&active.get(proof);
 if(!current)return undefined;
 try{if(current.material!==material(input,federal))return undefined;}catch{return undefined;}
 return {method:current.method};
}
