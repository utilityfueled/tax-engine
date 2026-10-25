// Spec: spec/federal/foreign-tax-election.yaml.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { foreignTaxElectionFixture } from '../fixtures/foreign-tax-election.js';

describe('Canonical annual foreign tax election', () => {
  it('routes the deduction once to Schedule A and combines NIIT tax source cents', () => {
    for (const year of [2025, 2026]) {
      const result = calculateFederalTax(foreignTaxElectionFixture(year));
      const line = (number: string) => result.scheduleA.lines.filter(entry => entry.form === 'Sched A' && entry.line === number);
      // Source600.75-excluded0.25=600.50 ->601. Local tax22000 is unchanged.
      expect(line('6')).toHaveLength(1);
      expect(line('6')[0].value.toFixed()).toBe('601');
      expect(line('7')[0]?.value.toFixed()).toBe('22601');
      expect(result.scheduleA.totalItemized.toFixed()).toBe('22601');
      expect(result.foreignTaxCredit.toFixed()).toBe('0');
      expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('0');
      expect(result.allLines.some(entry => entry.form.startsWith('Form 1116'))).toBe(false);
      // Local allocations2000.25+500.25 plus foreign400.50=2901 exactly. Never round each source first to2902.
      expect(result.form8960.lines.find(entry => entry.line === '9b')?.value.toFixed()).toBe('2901');
      expect(result.form8960.netInvestmentIncome.toFixed()).toBe('27099');
      expect(result.niitTax.toFixed()).toBe('1030'); //27099*.038=1029.762.
      expect(result.allLines.filter(entry => entry.form === 'Foreign Tax Election WS' && entry.line === 'deduction')).toHaveLength(1);
    }
  });
  it('restores actual foreign taxes in the AMT tax add-back', () => {
    for (const year of [2025, 2026]) {
      const result = calculateFederalTax(foreignTaxElectionFixture(year));
      expect(result.allLines.find(entry => entry.form === 'Form 6251' && entry.line === '2a')?.value.toFixed()).toBe('22601');
    }
  });
  it('retains the annual election when the standard deduction is used', () => {
    const base = foreignTaxElectionFixture();
    const input = TaxYearInputSchema.parse({ ...base,
      w2s: [{ ...base.w2s[0], stateTaxWithheld: '0' }], scheduleA: undefined, form8960Sources: undefined });
    const result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe('standard');
    expect(result.foreignTaxCredit.toFixed()).toBe('0');
    expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('0');
    expect(result.form8960.lines.find(entry => entry.line === '9b')?.value.toFixed()).toBe('0');
    expect(result.niitTax.toFixed()).toBe('1140');
  });
});
