// Spec: spec/state/pa-oid-consumer-independent.yaml; literal Python Decimal1000 oracles frozen before runtime.
import Decimal from 'decimal.js';
import {isDeepStrictEqual} from 'node:util';
import {describe,it,expect} from 'vitest';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources.js';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts.js';
import {calculatePAScheduleA} from '@/engine/state/pa-schedule-a.js';
import {calculateScheduleSP} from '@/engine/state/pa-schedule-sp.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {ordinarySourcePrecision} from '@/engine/state/pa-ordinary-source-precision.js';
import {paOrdinaryOIDFixture,refreshPAOIDOriginals} from '../../fixtures/pa-ordinary-oid-sources.js';
const literal={"B": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", "pre": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.48", "original": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000029.52", "residentRaw": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000149.52", "partOutside": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080.48", "nonOutside": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000149.52", "residentReported": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000150", "residentBase": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000050150", "tax": "3070000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001540", "due": "3070000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "withholding": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001539.68", "refund": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001", "sp2": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030", "spTotal": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000031", "spSubtract": "100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.07"};
type Status='resident'|'part_year'|'nonresident';
function fixture(status:Status='resident',kind:'taxable'|'treasury'='taxable'){
 const f=paOrdinaryOIDFixture(status,kind);const original=f.input.form1099OID[0];
 if(kind==='taxable')original.originalIssueDiscount=literal.original;else original.treasuryOID=literal.original;
 f.oidAndMiscSources.oid[0].accruals=[{from:'2025-01-01',through:'2025-06-30',oid:literal.pre,coupon:'0',sourceReference:'Independent actual first dated accrual'},{from:'2025-07-01',through:'2025-12-31',oid:'29.04',coupon:'0',sourceReference:'Independent actual second dated accrual'}];
 return refreshPAOIDOriginals(f);
}
function publicValues(value:unknown):void{if(Decimal.isDecimal(value)){expect(value.constructor).toBe(Decimal);return;}if(Array.isArray(value))for(const child of value)publicValues(child);else if(value&&typeof value==='object')for(const child of Object.values(value))publicValues(child);}
describe('independent complete OID precision consumers',()=>{
 it.each([
  ['resident',literal.residentRaw,'0',literal.residentReported],
  ['part_year','69.04',literal.partOutside,'70'],
  ['nonresident','0',literal.nonOutside,'0'],
 ] as const)('keeps actual %s dates raw cents and printed ScheduleA', (status,inside,outside,printed)=>{
  const f=fixture(status);const a=calculatePAResidencySources(f.input,f.sources);
  expect(a.interest.toFixed()).toBe(inside);expect(a.excludedNonPAInterest.toFixed()).toBe(outside);expect(a.reportedInterest.toFixed()).toBe(printed);expect(a.scheduleA.line1.toFixed()).toBe(literal.residentReported);
 });
 it.each([['.48','.52','32'],['.52','.48','34']])('retains cancellation %s against %s',(federal,government,residual)=>{
  const federalAmount=(BigInt(literal.B)+33n).toString()+federal;
  const a=calculatePAScheduleA({taxYear:2025,federalInterestIncome:new Decimal(federalAmount),usGovernmentInterest:new Decimal(literal.B+government)});
  expect(a.line16.toFixed()).toBe(residual);publicValues(a);
 });
 it.each([['resident','0'],['part_year','24080'],['nonresident','44120']] as const)('retains actual Treasury worldwide SP in %s',(status,outside)=>{
  const f=fixture(status,'treasury');f.facts.sp.categories['2']={status:'entries',sourceReference:'Actual independent source category2',entries:[{sourceReference:'Distinct actual tax-exempt income',date:'2025-12-31',amount:'0.01',notElsewhereConfirmed:true}]};
  f.facts.sp.categories['3']={status:'entries',sourceReference:'Actual independent source category3',entries:[{sourceReference:'Distinct actual nontaxable income',date:'2025-12-31',amount:'0.52',notElsewhereConfirmed:true}]};
  const a=calculatePAOrdinaryReturnFacts(f.input,f.facts);expect(a.spOtherIncomeByLine['2'].toFixed()).toBe(literal.sp2);expect(a.spOtherIncomeByLine['3'].toFixed()).toBe('1');expect(a.spOutsidePAIncome.toFixed()).toBe(outside);
  expect(a.spNontaxableIncome.toFixed()).toBe((BigInt(literal.spTotal)+BigInt(outside)).toString());
 });
 it('retains actual source withholding cents before printed line once',()=>{
  const f=paOrdinaryOIDFixture();const row=f.input.form1099OID[0].stateWithholding?.[0];if(!row)throw Error('Missing actual source fixture');row.stateWithheld=literal.pre;refreshPAOIDOriginals(f);
  expect(calculatePAOrdinaryReturnFacts(f.input,f.facts).paWithholding.toFixed()).toBe(literal.withholding);
 });
 it('retains subcent known original amounts without early rounding',()=>{
  const f=paOrdinaryOIDFixture('resident','taxable');f.input.form1099OID[0].originalIssueDiscount='0.00000000000000000000000000000000000000000000000049';f.oidAndMiscSources.oid[0].accruals=[{from:'2025-01-01',through:'2025-12-31',oid:f.input.form1099OID[0].originalIssueDiscount,coupon:'0',sourceReference:'Actual explicitly fictional very small source'}];refreshPAOIDOriginals(f);
  const a=calculatePAResidencySources(f.input,f.sources);expect(a.interest.toFixed()).toBe('120.00000000000000000000000000000000000000000000000049');expect(a.reportedInterest.toFixed()).toBe('120');
 });
 it('retains low principal digits in full composer and department-processing helper',()=>{
  const f=fixture();f.facts.timing.remainingTaxPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:literal.due,sourceReference:'Independent actual expected tax payment from Decimal1000 trace'};
  const a=calculatePAOrdinaryReturn(f.input,f.facts,f.completion);expect.soft(a.pa40.totalPATaxableIncome.toFixed()).toBe(literal.residentBase);expect.soft(a.pa40.taxLiability.toFixed()).toBe(literal.tax);expect.soft(a.pa40.taxDue.toFixed()).toBe(literal.due);expect.soft(a.wptcProcessing.remainingTaxDueBeforePenalties.toFixed()).toBe(literal.due);expect(a.readiness.filingEligible).toBe(false);
 });
 it('reconciles actual huge withholding overpayment without losing refund low digit',()=>{
  const f=paOrdinaryOIDFixture();const row=f.input.form1099OID[0].stateWithholding?.[0];if(!row)throw Error('Missing actual source fixture');row.stateWithheld=literal.pre;refreshPAOIDOriginals(f);
  f.facts.disposition={kind:'allocation',sourceReference:'Actual fictional explicit full refund election',refundRequested:literal.refund,nextYearCreditRequested:'0',donations:[]};
  const a=calculatePAOrdinaryReturn(f.input,f.facts,f.completion);expect(a.pa40.netOverpayment.toFixed()).toBe(literal.refund);expect(a.refundDisposition.refund.toFixed()).toBe(literal.refund);expect(a.readiness.filingEligible).toBe(false);
 });
 it('keeps ScheduleSP exact tax subtraction with long tax and fractional credit',()=>{
  const a=calculateScheduleSP({taxYear:2025,filingCategory:'unmarried',dependents:0,paTaxableIncome:new Decimal(literal.B),nontaxableIncome:new Decimal('.49'),taxLiability:new Decimal(literal.B+'.59'),taxPaidToOtherStates:new Decimal('.52')});
  expect(a.taxLiabilityAfterOtherStateTaxes.toFixed()).toBe(literal.spSubtract);publicValues(a);
 });
 it('derives enough local digits from negative Decimal cancellation without mutating globals',()=>{
  const before={precision:Decimal.precision,rounding:Decimal.rounding};const p=ordinarySourcePrecision({huge:new Decimal('-'+literal.B+'.48'),tiny:new Decimal('0.00000000000000000049')});expect(p).toBeGreaterThan(187);expect({precision:Decimal.precision,rounding:Decimal.rounding}).toEqual(before);
 });
 it('keeps original canonical identity private and replay stable public Decimals',()=>{
  const f=fixture('part_year');const original=structuredClone(f);const a=calculatePAResidencySources(f.input,f.sources),b=calculatePAResidencySources(f.input,f.sources);const p=calculatePAOrdinaryReturnFacts(f.input,f.facts),q=calculatePAOrdinaryReturnFacts(f.input,f.facts);expect(isDeepStrictEqual(a,b)).toBe(true);expect(isDeepStrictEqual(p,q)).toBe(true);publicValues(a);publicValues(p);expect(f).toEqual(original);
  const audit=JSON.stringify([...a.lines,...p.lines]);for(const privateValue of ['900-70-0311','900700311','12-3456789','private-source-account'])expect(audit).not.toContain(privateValue);
 });
 it('rejects changed OID originals rather than repairing a stale source proof',()=>{
  const f=fixture();f.input.form1099OID[0].payer='Different actual original payer';expect(()=>calculatePAOrdinaryReturnFacts(f.input,f.facts)).toThrow(/original|source/i);
 });
});
