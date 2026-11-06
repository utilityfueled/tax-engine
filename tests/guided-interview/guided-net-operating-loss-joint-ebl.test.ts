// Spec: net-operating-loss-joint-ebl.yaml actual-guide
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedJointEblNolFixture } from '../fixtures/guided-net-operating-loss-joint-ebl';

it('retains actual joint and qualified source histories through the bridge', () => {
  const state = guidedJointEblNolFixture(), before = structuredClone(state);
  expect(JSON.parse(readFileSync('tests/fixtures/guided-net-operating-loss-joint-ebl-browser.json', 'utf8'))).toEqual(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
  expect(input.netOperatingLoss!.vintages![0]!.originKind).toBe('excess_business_loss');
  expect(input.qbiLossSources!.excessBusinessLossHistories![0]!.originalNol!.history![0]!.nolUsed).toBe('10000');
  expect(result.agi.toString()).toBe('115000'); expect(result.carryforwards.qbiLossCarryforward.toString()).toBe('25000');
  expect(result.qbiEblNol!.vintages[0]!.qualifiedRemainingCarryforward!.toString()).toBe('0');
  const edited = updateSectionData(state, 'adjustments', { ...state.sectionData.adjustments!,
    k1LossSources: { ...state.sectionData.adjustments!.k1LossSources!, sourceReference: 'Replacement qualified original' } });
  expect(edited.sectionData.adjustments!.k1LossSources!.sourceFactsConfirmed).toBeNull();
  expect(edited.sectionData.adjustments!.netOperatingLossSources!.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();
  for (const value of ['', undefined]) {
    const unknown = structuredClone(state); unknown.sectionData.adjustments!.k1LossSources!.excessBusinessLossHistories![0]!.qualifiedOpeningCarryforward = value;
    expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
  }
  const falseSource = structuredClone(state); falseSource.sectionData.adjustments!.k1LossSources!.excessBusinessLossHistories![0]!.sourceFactsConfirmed = false;
  expect(buildTaxInputFromGuidedData(falseSource)).toBeNull();
  expect(state).toEqual(before);
});
