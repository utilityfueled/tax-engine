import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { validateSection } from '@/lib/guided-interview-flow';
import { guidedJointEblNolFixture } from '../fixtures/guided-net-operating-loss-joint-ebl';

// Spec: net-operating-loss-joint-ebl.yaml ordinary-prior-guide
it('requires and bridges the actual prior ordinary carry without a zero migration', () => {
  const state = guidedJointEblNolFixture(), data = state.sectionData.adjustments!, nol = data.netOperatingLossSources!;
  Object.assign(data.k1LossSources!, { priorQbiCarry: undefined });
  expect(validateSection(state, 'adjustments').status).not.toBe('complete');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  Object.assign(data.k1LossSources!, { priorQbiCarry: { sourceTaxYear: '2024', sourceReference: 'Actual prior ordinary QBI return',
    sourceFactsConfirmed: true, returnSourceId: 'joint2024', formKind: 'form_8995_line_16',
    primaryName: nol.primaryName, primaryTaxpayerIdLast4: nol.primaryTaxpayerIdLast4,
    spouseName: nol.spouseName, spouseTaxpayerIdLast4: nol.spouseTaxpayerIdLast4, lossCarryforward: '7,000' } });
  const original = buildTaxInputFromGuidedData(state);
  expect(original!.priorYear!.qbiLossCarryforward).toBe('7000');
  expect(calculateFederalTax(TaxYearInputSchema.parse(original)).carryforwards.qbiLossCarryforward.toFixed()).toBe('32000');
});
