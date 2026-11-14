// Spec: spec/federal/form-2210-special-gains-independent.yaml.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateForm2210ScheduleAi, type Form2210ScheduleAiInput } from '@/engine/forms/form-2210-schedule-ai.js';

function original(): Form2210ScheduleAiInput {
  const source = [
    ['60000', '300', '3000', '-500', '1000'],
    ['100000', '500', '5000', '0', '1250'],
    ['160000', '800', '8000', '800', '2000'],
    ['240000', '1200', '12000', '2000', '4000'],
  ];
  return {
    taxYear: 2025, filingStatus: 'single', requiredAnnualPayment: new Decimal('40000'), taxAfterRefundableCredits: new Decimal('47239'),
    returnContext: {
      standardDeduction: new Decimal('15750'), agi: new Decimal('240000'), taxableIncome: new Decimal('224250'),
      preferentialIncome: true, selfEmployedOwners: 0, specialTaxMethod: false,
      specialRatePreferentialIncome: { qualifiedDividends: new Decimal('1200'), netCapitalGain: new Decimal('12000'), rate28GainLoss: new Decimal('2000'), unrecaptured1250BeforeLosses: new Decimal('4000') },
    },
    facts: { specialRatePeriodsConfirmed: true, annualizedIncomePeriods: source.map(row => ({
      adjustedGrossIncome: row[0]!, qualifiedDividends: row[1]!, netCapitalGain: row[2]!, rate28GainLoss: row[3]!, unrecaptured1250BeforeLosses: row[4]!,
      itemizedDeductions: '0', qbiDeduction: '0', netProfitFromSelfEmployment: '0', socialSecurityWages: '0', otherTaxes: '0', credits: '0',
    })) },
  };
}

it('matches independently derived 2025 period tax rather than its own engine oracle', () => {
  const result = calculateForm2210ScheduleAi(original());
  expect(['a', 'b', 'c', 'd'].map(column => result.lines.find(row => row.line === `14${column}`)?.value.toFixed())).toEqual(['46779', '46879', '47035', '47239']);
  expect(result.lines.find(row => row.line === '14-section1250-gain-a')?.value.toFixed()).toBe('2000');
  expect(result.lines.find(row => row.line === '14-collectibles-gain-a')?.value.toFixed()).toBe('0');
});

it('binds signed special components separately and preserves unknown versus zero', () => {
  const changed = original();
  Object.assign(changed.facts.annualizedIncomePeriods![3]!, { rate28GainLoss: '2001', unrecaptured1250BeforeLosses: '3999' });
  expect(() => calculateForm2210ScheduleAi(changed)).toThrow(/each reconcile/);
  const missing = original();
  delete missing.facts.annualizedIncomePeriods![1]!.rate28GainLoss;
  expect(() => calculateForm2210ScheduleAi(missing)).toThrow(/actual/);
});
