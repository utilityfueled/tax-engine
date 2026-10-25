// Spec: spec/federal/schedule-d-source-binding.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async originalImport => {
  const original = await originalImport<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { syntheticScheduleDSpecialGainInput as input } from '../fixtures/schedule-d-special-gains.js';
it('uses the completed child source worksheets in regular and AMT capital rates', () => {
  for (const year of [2025, 2026]) {
    const source = input(year), before = JSON.stringify(source), result = calculateFederalTax(source);
    const line = (form: string, number: string) => result.allLines.find(entry => entry.form === form && entry.line === number)?.value.toFixed();
    expect(result.scheduleD.netLongTerm.toFixed()).toBe('4380');
    expect(result.scheduleD.netCapitalGainLoss.toFixed()).toBe('3380');
    expect(line('Sched D', '18')).toBe('0');
    expect(line('Sched D', '19')).toBe('1190');
    expect(line('Unrecaptured Section1250 Gain Worksheet', '17')).toBe('270');
    expect(line('Sched D Tax WS', '11')).toBe('1190');
    expect(line('Form 6251', '13')).toBe('2190');
    expect(line('Form 6251', '14')).toBe('1190');
    expect(line('Form 6251', '15')).toBe('3380');
    expect(JSON.stringify(source)).toBe(before);
    const privateAudit = JSON.stringify(result.allLines.filter(entry => /source binding|Worksheet/.test(entry.form)));
    expect(privateAudit).not.toContain('123-45-6789');
    expect(privateAudit).not.toContain('Actual capital source worksheet');
  }
});
it('keeps special worksheet lines blank when the printed gain condition fails', () => {
  const result = calculateFederalTax(input(2025, '-10000'));
  expect(result.scheduleD.netCapitalGainLoss.toFixed()).toBe('-5620');
  expect(result.allLines.find(entry => entry.form === 'Sched D' && entry.line === '18')).toBeUndefined();
  expect(result.allLines.find(entry => entry.form === 'Sched D' && entry.line === '19')).toBeUndefined();
});

it('rejects contradictory same-basis AMT sources rather than overriding actual gains', () => {
  const source = input(2025);
  source.amtCapitalGains = { sourceFactsConfirmed: true, sourceTaxYear: 2025, sourceReference: 'Conflicting AMT source', qualifiedDividends: '0', netCapitalGain: '3380', section1250Gain: '1460', collectiblesGain: '0' };
  expect(() => calculateFederalTax(source)).toThrow(/AMT.*conflict|same.basis/i);
});
