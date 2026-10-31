// Spec: spec/federal/form-2210-schedule-ai.yaml.
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateForm2210ScheduleAi } from '@/engine/forms/form-2210-schedule-ai.js';
import { calculateForm2210, type Form2210Input } from '@/engine/forms/form-2210.js';
import type { TaxYearInput } from '@/models/inputs.js';

type Facts = NonNullable<TaxYearInput['form2210']>;
const period = (adjustedGrossIncome: string, patch = {}) => ({ adjustedGrossIncome, itemizedDeductions: '0', qbiDeduction: '0', qualifiedDividends: '0', netCapitalGain: '0',
  netProfitFromSelfEmployment: '0', socialSecurityWages: '0', otherTaxes: '0', credits: '0', ...patch });
const rising = () => [period('30000'), period('60000'), period('120000'), period('200000')];
const context = (patch = {}) => ({ standardDeduction: new Decimal(15750), agi: new Decimal(200000), taxableIncome: new Decimal(184250), preferentialIncome: false, selfEmployedOwners: 0, specialTaxMethod: false, ...patch });
const run = (annualizedIncomePeriods: Facts['annualizedIncomePeriods'], patch: Partial<Parameters<typeof calculateForm2210ScheduleAi>[0]> = {}) => calculateForm2210ScheduleAi({
  taxYear: 2025, filingStatus: 'single', requiredAnnualPayment: new Decimal(33360), taxAfterRefundableCredits: new Decimal(37067), returnContext: context(), facts: { annualizedIncomePeriods }, ...patch });
const line = (result: ReturnType<typeof run>, name: string) => result.lines.find(row => row.line === name)?.value.toFixed();

describe('Form 2210 Schedule AI', () => {
  it('annualizes each column and limits installments', () => {
    const result = run(rising());
    expect(['13a', '13b', '13c', '13d'].map(name => line(result, name))).toEqual(['104250', '128250', '164250', '184250']);
    expect(['14a', '14b', '14c', '14d'].map(name => line(result, name))).toEqual(['17867', '23627', '32267', '37067']);
    expect(['21a', '21b', '21c', '21d'].map(name => line(result, name))).toEqual(['4020.075', '10632.15', '21780.225', '33360.3']);
    expect(result.installments.map(value => value.toFixed())).toEqual(['4020.075', '6612.075', '11148.075', '11579.775']);
    expect(Decimal.sum(...result.installments).toFixed()).toBe('33360');
  });

  it('uses the larger annualized itemized or standard deduction', () => {
    const itemizer = { returnContext: context({ itemizedDeductions: new Decimal(15750) }) };
    const last = [period('120000'), period('200000', { itemizedDeductions: '15750' })];
    expect(line(run([period('30000', { itemizedDeductions: '5000' }), period('60000'), ...last], itemizer), '8a')).toBe('20000');
    expect(line(run([period('30000', { itemizedDeductions: '3000' }), period('60000'), ...last], itemizer), '8a')).toBe('15750');
    expect(() => run([period('30000', { itemizedDeductions: '50000' }), ...rising().slice(1)])).toThrow(/only to a return that itemizes/);
  });

  it('annualizes self-employment tax around its limits', () => {
    const twoColumns = [period('30000', { netProfitFromSelfEmployment: '40000' }), period('60000', { netProfitFromSelfEmployment: '40000', socialSecurityWages: '50000' }), ...rising().slice(2)];
    expect(line(run(twoColumns), '36a')).toBe('22607.28');
    expect(line(run(twoColumns), '36b')).toBe('9527.424');
    expect(line(run([period('30000', { netProfitFromSelfEmployment: '433.13' }), ...rising().slice(1)]), '36a')).toBe('0');
    expect(line(run([period('30000', { netProfitFromSelfEmployment: '433.14' }), ...rising().slice(1)]), '36a')).toBe('244.80293148');
    const wages = period('200000', { netProfitFromSelfEmployment: '10000', socialSecurityWages: '176100' });
    expect(line(run([...rising().slice(0, 3), wages], { taxAfterRefundableCredits: new Decimal(37334.815) }), '36d')).toBe('267.815');
    const negative = run([period('-30000'), ...rising().slice(1)]);
    expect([line(negative, '3a'), line(negative, '13a'), line(negative, '27a')]).toEqual(['-120000', '0', '0']);
  });

  it('replaces regular installments in the dated penalty', () => {
    const base: Form2210Input = { currentYearTax: new Decimal(37067), incomeTaxAfterCredits: new Decimal(37067), withholding: new Decimal(0), estimatedPayments: new Decimal(33361),
      refundableCredits: new Decimal(0), filingStatus: 'single', taxYear: 2025, scheduleAiReturn: context(),
      payments: [{ date: '2026-01-15', amount: '33361', kind: 'estimated' }] };
    const facts: Facts = { calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false, withholdingMethod: 'equal-installments', priorYearTaxStatus: 'no-return' };
    const regular = calculateForm2210({ ...base, facts: { ...facts, calculationMethod: 'regular' } });
    expect(regular.exactPenalty.toDecimalPlaces(2).toFixed()).toBe('977.27');
    const annualized = calculateForm2210({ ...base, facts: { ...facts, calculationMethod: 'annualized', annualizedIncomePeriods: rising() } });
    expect(annualized.installments.map(row => row.required.toFixed())).toEqual(['4020.075', '6612.075', '11148.075', '11579.775']);
    expect(annualized.exactPenalty.toDecimalPlaces(2).toFixed()).toBe('744.22');
    expect(annualized.penalty.toFixed()).toBe('744');
    expect(annualized.requiresForm2210).toBe(true);
    expect(regular.requiresForm2210).toBe(false);
    expect(() => calculateForm2210({ ...base, scheduleAiReturn: undefined, facts: { ...facts, calculationMethod: 'annualized', annualizedIncomePeriods: rising() } })).toThrow(/completed return/);
    expect(() => calculateForm2210({ ...base, facts: { ...facts, calculationMethod: 'regular', annualizedIncomePeriods: rising() } })).toThrow(/conflicts/);
    expect(() => calculateForm2210({ ...base, facts: { ...facts, calculationMethod: 'annualized' } })).toThrow(/Schedule AI period facts/);
  });

  it('rejects missing facts and unresolved branches', () => {
    expect(() => run(rising().slice(0, 3))).toThrow(/four actual/);
    expect(() => run(undefined)).toThrow(/four actual/);
    for (const key of ['adjustedGrossIncome', 'itemizedDeductions', 'qbiDeduction', 'netProfitFromSelfEmployment', 'socialSecurityWages', 'otherTaxes', 'credits', 'qualifiedDividends', 'netCapitalGain'] as const) {
      for (const value of [undefined, '', ' ']) expect(() => run([period('30000', { [key]: value }), ...rising().slice(1)]), `${key}=${value}`).toThrow(/Schedule AI requires the actual/);
    }
    for (const key of ['qualifiedDividends', 'netCapitalGain']) expect(() => run([period('30000', { [key]: '1' }), ...rising().slice(1)])).toThrow(/separate period worksheet/);
    expect(() => run(rising(), { returnContext: context({ preferentialIncome: true }) })).toThrow(/separate period worksheet/);
    expect(() => run(rising(), { returnContext: context({ specialTaxMethod: true }) })).toThrow(/separate tax method/);
    expect(() => run(rising(), { returnContext: context({ selfEmployedOwners: 2 }) })).toThrow(/separate PartII/);
    expect(() => run(rising(), { returnContext: context({ agi: new Decimal(200001) }) })).toThrow(/reconcile to the completed return/);
    expect(() => run(rising(), { returnContext: context({ taxableIncome: new Decimal(180000) }) })).toThrow(/reconcile to the completed return/);
    expect(() => run(rising(), { taxAfterRefundableCredits: new Decimal(37068) })).toThrow(/reconcile to the completed return/);
    const joint = { filingStatus: 'married_filing_jointly' as const };
    expect(() => run(rising(), joint)).toThrow(/both spouses/);
    expect(() => run(rising(), { ...joint, facts: { annualizedIncomePeriods: rising(), bothSpousesSelfEmployed: true } })).toThrow(/separate PartII/);
    expect(run(rising(), { ...joint, taxAfterRefundableCredits: new Decimal(30363), facts: { annualizedIncomePeriods: rising(), bothSpousesSelfEmployed: false } }).installments).toHaveLength(4);
  });
});
