/** Spec: state/oh-sd-100-remaining-balance.yaml. Independent literal cash/return oracles. */
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return.js';
import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs.js';
import { schoolBalanceFixture } from '../../fixtures/oh-sd-100-remaining-balance.js';
import { schoolDistrictSourcesFixture, schoolDistrictEstimatedFixture, bindSchoolDistrictFixture, schoolW2, schoolW2Packet, type SchoolDistrictFixtureInput } from '../../fixtures/oh-school-district-sources.js';

function actual(input: TaxYearInput) {
  const parsed = TaxYearInputSchema.parse(input);
  return calculateOhioResidentReturn(buildOhioResidentReturnInput(parsed, calculateFederalTax(parsed)));
}
function set(input: TaxYearInput, path: string, value: unknown) {
  let object: unknown = input.ohioSchoolDistrict;
  const keys = path.split('.'), last = keys.pop();
  for (const key of keys) {
    if (!object || typeof object !== 'object') throw new Error(`Missing fixture object ${key}`);
    object = (object as Record<string, unknown>)[key];
  }
  if (!object || typeof object !== 'object' || !last) throw new Error('Missing fixture target');
  if (value === undefined) delete (object as Record<string, unknown>)[last];
  else (object as Record<string, unknown>)[last] = value;
}
function setWithholding(input: TaxYearInput, amount: string) {
  const fixture = input as SchoolDistrictFixtureInput;
  const row=schoolW2Packet(fixture).localRows[0];
  if (!row) throw new Error('W2 school original absent');
  row.withheld=amount;
  schoolW2(fixture).localTaxWithheld=amount;
  bindSchoolDistrictFixture(fixture);
}

describe('actual SD100 remaining principal', () => {
  it('reports the same100 return balance for unpaid expected and actually settled sources', () => {
    for (const status of ['unpaid', 'expected_payment', 'actual_payment'] as const) {
      const result = actual(schoolBalanceFixture(status));
      expect(result.sd100?.line8_totalTaxAfterCredits.toString()).toBe('1000');
      expect(result.sd100?.line11_sdWithholding.toString()).toBe('900');
      expect(result.sd100?.line12_estimatedPayments.toString()).toBe('0');
      expect(result.sd100?.line16_taxDue.toString()).toBe('100');
      expect(result.sd100?.line17_latePaymentInterest.toString()).toBe('0');
      expect(result.sd100?.line18_totalAmountDue.toString()).toBe('100');
      expect(result.sd100?.line21_refund.toString()).toBe('0');
      const proof = result.schoolDistrictSource?.remainingTaxPayment;
      expect(proof?.status).toBe(status);
      expect(proof?.balanceOnReturn.toString()).toBe('100');
      expect(proof?.actualPaymentApplied.toString()).toBe(status === 'actual_payment' ? '100' : '0');
      expect(proof?.outstandingTaxBalance.toString()).toBe(status === 'actual_payment' ? '0' : '100');
    }
  });
  it('rejects incomplete contradictory or late balance originals', () => {
    const mutations: Array<[string, unknown]> = [
      ['payments.account.currentOriginalReturnPaymentCredited', undefined],
      ['payments.account.currentOriginalReturnPaymentCredited', ''],
      ['payments.account.currentOriginalReturnPaymentCredited', '99'],
      ['payments.remainingTaxPayment.amountAppliedToTax', '99'],
      ['payments.remainingTaxPayment.original.amount', '101'],
      ['payments.remainingTaxPayment.original.accountSsn', '999-88-7777'],
      ['payments.remainingTaxPayment.original.accountName', 'Another Person'],
      ['payments.remainingTaxPayment.original.taxYear', 2026],
      ['payments.remainingTaxPayment.original.returnType', 'it1040'],
      ['payments.remainingTaxPayment.original.districtCode', '0001'],
      ['payments.remainingTaxPayment.original.kind', 'estimated'],
      ['payments.remainingTaxPayment.original.confirmationNumber', ''],
      ['payments.remainingTaxPayment.currentOriginalReturnConfirmed', false],
      ['payments.remainingTaxPayment.sourceFactsConfirmed', false],
      ['payments.account.completeAccountConfirmed', false],
      ['payments.account.taxYear', 2026],
      ['payments.account.accountSsn', '999-88-7777'],
      ['payments.account.asOfDate', '2026-04-17'],
      ['payments.remainingTaxPayment.original.date', '2026-04-14'],
      ['payments.remainingTaxPayment.date', '2026-04-14'],
      ['payments.remainingTaxPayment.date', '2026-02-30'],
      ['payments.currentTiming', { kind: 'expected', expectedDate: '2026-04-15', asOfDate: '2026-04-16' }],
      ['payments.currentTiming.filedDate', '2026-04-16'],
    ];
    for (const [path, value] of mutations) {
      const input = schoolBalanceFixture('actual_payment'); set(input, path, value);
      expect(() => actual(input)).toThrow();
    }
    const earlyReceipt=schoolBalanceFixture('actual_payment');
    set(earlyReceipt,'payments.remainingTaxPayment.date','2026-04-14');
    set(earlyReceipt,'payments.remainingTaxPayment.original.date','2026-04-14');
    expect(()=>actual(earlyReceipt)).toThrow(/current-original/i);
    for (const status of ['unpaid', 'expected_payment'] as const) {
      const input = schoolBalanceFixture(status); set(input,'payments.account.currentOriginalReturnPaymentCredited','100');
      expect(() => actual(input)).toThrow();
    }
    for (const date of ['2026-04-16', '2026-03-31', '2026-02-30']) {
      const input = schoolBalanceFixture('expected_payment'); set(input,'payments.remainingTaxPayment.date',date);
      expect(() => actual(input)).toThrow();
    }
    const overdue = schoolBalanceFixture('unpaid'); set(overdue,'payments.currentTiming',{kind:'filed',filedDate:'2026-04-15',asOfDate:'2026-04-16'}); set(overdue,'payments.account.asOfDate','2026-04-16');
    expect(() => actual(overdue)).toThrow();
    const noRemaining = schoolDistrictSourcesFixture(); set(noRemaining,'payments.account.currentOriginalReturnPaymentCredited','100');
    expect(() => actual(noRemaining)).toThrow();
  });
  it('rejects reuse of an IT1040 or SD estimated-payment confirmation', () => {
    const input = schoolBalanceFixture('actual_payment');
    if (!input.ohioPayments) throw new Error('IT originals absent');
    input.ohioPayments.currentTiming = {kind:'filed',filedDate:'2026-04-15',asOfDate:'2026-04-16'};
    input.ohioPayments.remainingTaxPayment = {status:'actual_payment',sourceReference:'Fictional IT payment',sourceFactsConfirmed:true,date:'2026-04-15',amountAppliedToTax:'100',accountHolder:'primary', original:{accountName:'Avery School',accountSsn:input.taxpayer.primary.ssn,taxYear:2025,returnType:'it1040',kind:'balance',date:'2026-04-15',amount:'100',confirmationNumber:'FICTIONAL-SD-BALANCE-2025'}};
    expect(() => actual(input)).toThrow(/reus|duplicate/i);
    const estimated = schoolDistrictEstimatedFixture(); setWithholding(estimated,'500');
    const first = estimated.ohioSchoolDistrict.payments.paymentRows[0];
    if (!first) throw new Error('Estimated original absent');
    set(estimated,'payments.remainingTaxPayment',{status:'actual_payment',sourceReference:'Current original payment',sourceFactsConfirmed:true,date:'2026-04-15',amountAppliedToTax:'100',currentOriginalReturnConfirmed:true,
      original:{...first.original,kind:'balance',districtCode:'0302',date:'2026-04-15',amount:'100',confirmationNumber:first.original.confirmationNumber.toLowerCase()}});
    set(estimated,'payments.account.currentOriginalReturnPaymentCredited','100');
    set(estimated,'payments.currentTiming',{kind:'filed',filedDate:'2026-04-15',asOfDate:'2026-04-15'}); set(estimated,'payments.account.asOfDate','2026-04-15');
    expect(() => actual(estimated)).toThrow(/reus|duplicate/i);
  });
  it('preserves source replay quarter penalty and year gates', () => {
    const input = schoolBalanceFixture('unpaid');
    const adapted = buildOhioResidentReturnInput(input, calculateFederalTax(input));
    expect(() => calculateOhioResidentReturn({...adapted, sdWithholding: new Decimal(899)})).toThrow(/remaining|contradict/i);
    expect(() => actual(schoolDistrictSourcesFixture('900'))).toThrow(/remaining/i);
    const quarter = schoolBalanceFixture('unpaid');
    setWithholding(quarter,'0');
    expect(() => actual(quarter)).toThrow(/quarter|penalty/i);
    // Statutory withholding exemption is inclusive: liability minus WH500
    // is exempt,501 without timely installments still requires its own method.
    const exempt = schoolBalanceFixture('unpaid'); setWithholding(exempt,'500');
    expect(actual(exempt).sd100?.line16_taxDue.toString()).toBe('500');
    const nonexempt = schoolBalanceFixture('unpaid'); setWithholding(nonexempt,'499');
    expect(() => actual(nonexempt)).toThrow(/quarter|penalty/i);
    const next = schoolBalanceFixture('unpaid'); next.taxpayer.taxYear=2026;set(next,'taxYear',2026);
    expect(() => actual(next)).toThrow();
  });
  it('keeps originals private immutable and independent from IT1040 tax', () => {
    const input = schoolBalanceFixture('actual_payment'), before=structuredClone(input);
    const result = actual(input), baseline=actual(schoolDistrictSourcesFixture());
    expect(result.it1040.line10_taxAfterCredits.toString()).toBe(baseline.it1040.line10_taxAfterCredits.toString());
    expect(result.it1040.line26_refund.toString()).toBe(baseline.it1040.line26_refund.toString());
    const audit=JSON.stringify(result.lines);
    expect(audit).not.toContain('FICTIONAL-SD-BALANCE-2025');
    expect(audit).not.toContain('Fictional completed current-original');
    expect(audit).not.toContain(input.taxpayer.primary.ssn);
    expect(input).toEqual(before);
  });
});
