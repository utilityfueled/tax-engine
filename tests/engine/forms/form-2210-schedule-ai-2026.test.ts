// Spec: spec/federal/form-2210-schedule-ai.yaml isolated-2026.
// Draft constants exist only in this isolated module. Production gates stay closed.
import { expect, it, vi } from 'vitest';
import Decimal from 'decimal.js';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateForm2210ScheduleAi } from '@/engine/forms/form-2210-schedule-ai.js';

const period = (adjustedGrossIncome: string, patch = {}) => ({ adjustedGrossIncome, itemizedDeductions: '0', qbiDeduction: '0', qualifiedDividends: '0', netCapitalGain: '0',
  netProfitFromSelfEmployment: '0', socialSecurityWages: '0', otherTaxes: '0', credits: '0', ...patch });
const run = (socialSecurityWages: string) => {
  const periods = [period('30000'), period('60000'), period('120000'), period('200000', { netProfitFromSelfEmployment: '10000', socialSecurityWages })];
  const probe = (tax: Decimal) => calculateForm2210ScheduleAi({ taxYear: 2026, filingStatus: 'single', requiredAnnualPayment: new Decimal(30000), taxAfterRefundableCredits: tax,
    returnContext: { standardDeduction: new Decimal(16100), agi: new Decimal(200000), taxableIncome: new Decimal(183900), preferentialIncome: false, selfEmployedOwners: 0, specialTaxMethod: false },
    facts: { annualizedIncomePeriods: periods } });
  try { return probe(new Decimal(0)); } catch { /* the first probe finds line19d */ }
  for (let tax = 30000; tax < 45000; tax++) { try { return probe(new Decimal(tax)); } catch { /* keep searching */ } }
  throw new Error('No reconciling tax');
};

it('uses the 2026 wage base under isolated constants', () => {
  const value = (result: ReturnType<typeof run>) => result.lines.find(row => row.line === '36d')!.value.toFixed();
  expect(value(run('184500'))).toBe('267.815');
  expect(value(run('184499'))).toBe('267.939');
});
