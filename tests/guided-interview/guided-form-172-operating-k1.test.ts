// Spec: spec/federal/form-172-operating-k1.yaml guided-operating-sources.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { guidedOperatingK1OriginState } from '../fixtures/guided-form-172-operating-k1';
import { requireOperatingSource as required } from '../fixtures/form-172-operating-k1';

it('builds actual operating K1 current origins without income overrides', () => {
  const state = guidedOperatingK1OriginState(), before = JSON.stringify(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.scheduleK1).toHaveLength(1);
  expect(input?.form172?.businessSources?.[0].sourceId).toBe('scheduleK1:0');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toFixed()).toBe('10000');
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('16000');
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('0');
  expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('40000');
  expect(JSON.stringify(state)).toBe(before);
  for (const field of ['allowedOrdinary', 'agi', 'originalLoss']) expect(input?.form172).not.toHaveProperty(field);
  const unknown = guidedOperatingK1OriginState(); required(required(required(unknown.sectionData.adjustments).currentLossOrigin).businessSources)[0].sourceFactsConfirmed = null;
  expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
  const changed = structuredClone(required(state.sectionData.adjustments));
  required(required(changed.currentLossOrigin).businessSources)[0].sourceReference = 'Actual changed participation evidence';
  const next = updateSectionData(state, 'adjustments', changed);
  expect(next.sectionData.adjustments?.currentLossOrigin?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(next)).toBeNull();
});
