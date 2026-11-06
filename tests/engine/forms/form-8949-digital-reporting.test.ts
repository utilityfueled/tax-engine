// Spec: spec/federal/form-8949-digital-reporting.yaml.
import { expect, it } from 'vitest';
import { calculateForm8949 } from '@/engine/forms/form-8949.js';
import { calculateScheduleD } from '@/engine/schedules/schedule-d.js';
import { getConstants } from '@/models/constants.js';
import { reportingCategoriesInput } from '../../fixtures/form-8949-reporting.js';

it('routes all twelve original reporting categories without losing cents', () => {
  const input = reportingCategoriesInput();
  const original = structuredClone(input);
  const result = calculateForm8949(input);
  for (const [box, part, expected] of [
    ['A', 'I', '20.05'], ['B', 'I', '-25.05'], ['C', 'I', '200.2'],
    ['G', 'I', '100.2'], ['H', 'I', '-100.1'], ['I', 'I', '100.1'],
    ['D', 'II', '200.05'], ['E', 'II', '-250.05'], ['F', 'II', '2000.2'],
    ['J', 'II', '1000.2'], ['K', 'II', '-1000.1'], ['L', 'II', '1000.1'],
  ]) {
    const line = result.lines.find(row => row.line === `Part ${part} Box ${box}`);
    expect(line?.value.toString(), box).toBe(expected);
    expect(line?.formula, box).toBe('1 transactions');
  }
  expect(result.totalShortTermGainLoss.toString()).toBe('295.4');
  expect(result.totalLongTermGainLoss.toString()).toBe('2950.4');
  const schedule = calculateScheduleD(input, 'single', getConstants(2025));
  expect(schedule.netShortTerm.toString()).toBe('295.4');
  expect(schedule.netLongTerm.toString()).toBe('2950.4');
  expect(schedule.netCapitalGainLoss.toString()).toBe('3245.8');
  expect(input).toEqual(original);
});

it('preserves actual broker reporting and rejects contradictory source categories', () => {
  const input = reportingCategoriesInput();
  const trade = input.form1099B[0].transactions[0];
  const only = (changes: Record<string, unknown>) => ({ ...input, form1099B: [{ broker: 'Original1099-B', transactions: [{ ...trade, ...changes }] }] });
  for (const sourceDocumentType of ['1099-b', undefined]) {
    const result = calculateForm8949(only({ digitalAsset: true, sourceDocumentType }));
    expect(result.shortTermBoxA.totalGainLoss.toString()).toBe('20.05');
  }
  for (const changes of [
    { sourceDocumentType: '1099-da', digitalAsset: false },
    { sourceDocumentType: 'not-reported', basisReportedToIRS: true },
    { sourceDocumentType: 'invented-document' },
  ]) expect(() => calculateForm8949(only(changes))).toThrow(/source|document|reported|digital/i);
});
