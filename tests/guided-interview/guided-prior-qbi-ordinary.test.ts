import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { validateSection } from '@/lib/guided-interview-flow';
import { buildGuidedK1Sources, updateK1LossSources } from '@/lib/guided-k1-qbi-sources';
import { guidedOrdinaryPriorQbiFixture } from '../fixtures/guided-prior-qbi-ordinary';

// Spec: qbi-prior-carry-sources.yaml actual-guide
it('bridges actual ordinary prior carry without an NOL history', () => {
  const state = guidedOrdinaryPriorQbiFixture(), before = structuredClone(state);
  expect(state.sectionData.adjustments?.netOperatingLossSources).toBeUndefined();
  expect(state.segmentation.lifeEvents).not.toContain('net-operating-loss');
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const original = buildTaxInputFromGuidedData(state)!;
  expect(original.priorYear!.qbiLossCarryforward).toBe('7000');
  expect(original.priorYear!.activeQbiLossCarryforward).toBeUndefined();
  expect(calculateFederalTax(TaxYearInputSchema.parse(original)).form8995!.qbiDeduction.toFixed()).toBe('18600');
  expect(state).toEqual(before);
  const absent = structuredClone(state); delete absent.sectionData.adjustments!.k1LossSources!.priorQbiCarry;
  expect(validateSection(absent, 'adjustments').status).not.toBe('complete');
  expect(buildTaxInputFromGuidedData(absent)).toBeNull();
  const priorOnly = structuredClone(state);
  priorOnly.sectionData.adjustments!.k1LossSources!.activities = [];
  delete priorOnly.sectionData.adjustments!.k1LossSources!.form461Classification;
  const withoutCurrent = buildTaxInputFromGuidedData(priorOnly)!;
  expect(withoutCurrent.netOperatingLoss).toBeUndefined(); expect(withoutCurrent.scheduleK1).toEqual([]);
  expect(calculateFederalTax(TaxYearInputSchema.parse(withoutCurrent)).carryforwards.qbiLossCarryforward.toFixed()).toBe('7000');
});
// Spec: qbi-prior-carry-sources.yaml confirmation
it('preserves unknown values and invalidates source edits and changed households', () => {
  const state = guidedOrdinaryPriorQbiFixture(), data = state.sectionData.adjustments!.k1LossSources!;
  expect(buildGuidedK1Sources(data, state)!.priorQbiCarry!.qbiLossCarryforward).toBe('7000');
  const changed = updateK1LossSources(data, { priorQbiCarry: { ...data.priorQbiCarry, lossCarryforward: '' } });
  expect(changed.priorQbiCarry!.sourceFactsConfirmed).toBeNull();
  expect(() => buildGuidedK1Sources(changed, state)).toThrow();
  const other = structuredClone(state); other.sectionData['personal-info']!.spouse!.lastName = 'Different';
  expect(buildTaxInputFromGuidedData(other)).toBeNull();
  const zero = guidedOrdinaryPriorQbiFixture('0');
  expect(buildGuidedK1Sources(zero.sectionData.adjustments!.k1LossSources, zero)!.priorQbiCarry!.qbiLossCarryforward).toBe('0');
});
