// Spec: nonitemized-allowable-charitable-carry.yaml, guided-source-boundary.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { TaxYearInputSchema } from '@/models/inputs';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed';
import { calculateFederalTax } from '@/engine/federal';
import { calculateScheduleA } from '@/engine/schedules/schedule-a';
import { fillReturn } from '@/pdf/fill-return';
import { d } from '@/utils/decimal';
import { simpleW2Fixture } from '../fixtures/simple-w2';

it('binds the common carry to actual guided sources while keeping the year closed', async () => {
  const state = JSON.parse(readFileSync(new URL('../fixtures/nonitemized-allowable-carry-guide-original.json', import.meta.url), 'utf8')) as GuidedFlowState;
  const original = JSON.stringify(state);
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.charitableCarryoverSources?.vintages).toEqual([]);
  expect(input.donations[0].amount).toBe('70000.01');
  const schedule = calculateScheduleA(input, d('100000'), 'single', FEDERAL_2026_CONSTANTS);
  expect(schedule.charitableCarryforward.toFixed()).toBe('10500.01');
  expect(schedule.charitableTotal.toFixed()).toBe('0');
  expect(schedule.nonitemizerCharitableDeduction.toFixed()).toBe('1000');
  expect(computeGuidedPreview(state)).toBeNull();
  expect(() => calculateFederalTax(input)).toThrow(/not.*ready|incomplete|unavailable|not.*available/i);
  await expect(fillReturn(input, { ...calculateFederalTax(simpleW2Fixture), taxYear: 2026 },
    { outputDir: 'tmp/unsupported-allowable-carry', blankFormsDir: '/missing-allowable-carry' }))
    .rejects.toThrow(/2026.*unavailable|no.*2026|2026.*not/i);
  expect(JSON.stringify(state)).toBe(original);

  const deductions = state.sectionData.deductions;
  if (!deductions?.charitableCarryoverSources) throw new Error('Missing explicit synthetic history');
  const replacement = updateSectionData(state, 'deductions', { ...deductions,
    charitableCarryoverSources: { ...deductions.charitableCarryoverSources, sourceReference: 'Different actual same-money prior worksheet' } });
  expect(replacement.sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
  expect(validateSection(replacement, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(replacement)).toBeNull();
  const recorded = replacement.sectionData.deductions;
  if (!recorded?.charitableCarryoverSources) throw new Error('Missing edited synthetic source');
  const confirmed = updateSectionData(replacement, 'deductions', { ...recorded,
    charitableCarryoverSources: { ...recorded.charitableCarryoverSources, sourceFactsConfirmed: true } });
  expect(validateSection(confirmed, 'deductions').status).toBe('complete');
  const next = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(confirmed));
  expect(next.charitableCarryoverSources?.sourceReference).toBe('Different actual same-money prior worksheet');
  expect(calculateScheduleA(next, d('100000'), 'single', FEDERAL_2026_CONSTANTS).charitableCarryforward.toFixed()).toBe('10500.01');
  const missing = structuredClone(state);
  if (!missing.sectionData.deductions?.charitableCarryoverSources) throw new Error('Missing original fixture');
  missing.sectionData.deductions.charitableCarryoverSources.vintages = undefined;
  expect(validateSection(missing, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(missing)).toBeNull();
});
