import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGuidedNetOperatingLoss, updateNetOperatingLossSources } from '@/lib/guided-net-operating-loss';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedJointNolFixture } from '../fixtures/guided-net-operating-loss-joint-pools';

// Spec: net-operating-loss-joint-pools.yaml source-guide
it('preserves actual same-couple sources and invalidates their confirmation', () => {
  const state = guidedJointNolFixture(), before = structuredClone(state), data = state.sectionData.adjustments!.netOperatingLossSources!;
  expect(JSON.parse(readFileSync('tests/fixtures/guided-net-operating-loss-joint-pools-browser.json', 'utf8'))).toEqual(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
  expect(result.agi.toString()).toBe('45200'); expect(result.netOperatingLoss!.carryforward.toString()).toBe('30200');
  expect(input.netOperatingLoss!.vintages![1]!.filingUnitOrigin!.ownerPersonId).toBe('alex');
  expect(input.netOperatingLoss!.sameCoupleJointHistory!.years![0]!.taxYear).toBe(2021);
  const changed = updateNetOperatingLossSources(data, { sourceReference: 'Replaced original' });
  expect(changed.sameCoupleJointHistory!.sourceFactsConfirmed).toBeNull();
  expect(changed.alternativeTax!.sameCoupleJointHistory!.sourceFactsConfirmed).toBeNull();
  expect(changed.sameCoupleJointHistory!.years).toEqual(data.sameCoupleJointHistory!.years);
  const edit = updateSectionData(state, 'personal-info', { ...state.sectionData['personal-info']!, lastName: 'Different' });
  expect(edit.sectionData.adjustments!.netOperatingLossSources!.sameCoupleJointHistory!.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(edit)).toBeNull();
  for (const value of [false, null, undefined]) {
    const source = structuredClone(data); source.alternativeTax!.sameCoupleJointHistory!.years![0]!.marriedToEachOther = value;
    expect(() => buildGuidedNetOperatingLoss(source, 2025, 'mfj', state.sectionData['personal-info'])).toThrow();
    expect(source.alternativeTax!.sameCoupleJointHistory!.years![0]!.marriedToEachOther).toBe(value);
  }
  expect(state).toEqual(before);
});
