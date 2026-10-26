// Spec: spec/federal/form-172-charitable-origin.yaml guided-current-sources.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { validateSection, updateSectionData } from '@/lib/guided-interview-flow';
import { guidedCurrentCharitableOriginState } from '../fixtures/guided-form-172-charitable-origin';

function actual<T>(value: T | undefined | null): T {
  if (value == null) throw new Error('Missing fictional current-origin record');
  return value;
}

it('reaches current charitable origins and requires independent known-empty histories', () => {
  const state = guidedCurrentCharitableOriginState(), original = JSON.stringify(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = TaxYearInputSchema.parse(actual(buildTaxInputFromGuidedData(state))), result = calculateFederalTax(input);
  expect(input.donations[0].amount).toBe('20000.49');
  expect([result.agi, result.form172?.regular.netOperatingLoss, result.form172?.alternativeTax.netOperatingLoss,
    result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['10000', '16000', '0', '14000.49', '14000.49']);
  expect(computeGuidedPreview(state)).not.toBeNull();
  expect(JSON.stringify(state)).toBe(original);
  const missing = structuredClone(state);
  actual(missing.sectionData.adjustments?.netOperatingLossSources?.alternativeTax).charitableCarryoverHistory = undefined;
  expect(validateSection(missing, 'adjustments').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  const unknown = structuredClone(state);
  actual(unknown.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory).priorAlternativeCarryovers = undefined;
  expect(validateSection(unknown, 'adjustments').status).toBe('partial');
  const deductions = structuredClone(actual(state.sectionData.deductions));
  actual(deductions.donationEntries)[0].amount = '20,001.49';
  const edited = updateSectionData(state, 'deductions', deductions);
  expect(edited.sectionData.adjustments?.currentLossOrigin?.sourceFactsConfirmed).toBeNull();
  expect(edited.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.sourceFactsConfirmed).toBeNull();
});
