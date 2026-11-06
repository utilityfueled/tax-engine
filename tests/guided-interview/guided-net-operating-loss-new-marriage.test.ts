// Spec: spec/federal/net-operating-loss-new-marriage.yaml source-guide.
import { expect, it } from 'vitest';
import { buildGuidedNetOperatingLoss, updateNetOperatingLossSources } from '@/lib/guided-net-operating-loss';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedNewMarriageNolFixture } from '../fixtures/guided-net-operating-loss-new-marriage';
it('preserves actual new-marriage and owner source facts', () => {
  const state = guidedNewMarriageNolFixture(), before = structuredClone(state), data = state.sectionData.adjustments!.netOperatingLossSources!;
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
  expect(result.netOperatingLoss?.deduction.toFixed()).toBe('24250'); expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('25750');
  expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('20000'); expect(result.agi.toFixed()).toBe('75750');
  expect(input.netOperatingLoss?.newMarriageHistory?.years?.[0]?.marriedToEachOther).toBe(false);
  const changed = updateNetOperatingLossSources(data, { sourceReference: 'Actual replacement carry source' });
  expect(changed.currentOwnerSources?.sourceFactsConfirmed).toBeNull(); expect(changed.newMarriageHistory?.sourceFactsConfirmed).toBeNull();
  expect(changed.alternativeTax?.newMarriageHistory?.sourceFactsConfirmed).toBeNull(); expect(changed.newMarriageHistory?.years).toEqual(data.newMarriageHistory?.years);
  const personalEdit = updateSectionData(state, 'personal-info', { ...state.sectionData['personal-info']!, lastName: 'Changed' });
  expect(personalEdit.sectionData.adjustments?.netOperatingLossSources?.currentOwnerSources?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(personalEdit)).toBeNull();
  for (const value of [false, null, undefined]) {
    const source = structuredClone(data); source.currentOwnerSources!.sourceFactsConfirmed = value;
    expect(() => buildGuidedNetOperatingLoss(source, 2025, 'mfj', state.sectionData['personal-info'])).toThrow();
    expect(source.currentOwnerSources!.sourceFactsConfirmed).toBe(value);
  }
  expect(state).toEqual(before);
});
