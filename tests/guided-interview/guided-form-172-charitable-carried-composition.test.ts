// Spec: form-172-charitable-carried-composition.yaml actual-guide.
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { guidedCarriedCurrentCharitableHistories } from '../fixtures/guided-form-172-charitable-carried-composition';

it('reaches old and current loss composition from actual independent guided sources', () => {
  const state = guidedCarriedCurrentCharitableHistories(), before = structuredClone(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
  expect([result.netOperatingLoss?.carryforward, result.form172?.regular.netOperatingLoss, result.carryforwards.nolCarryforward,
    result.netOperatingLoss?.alternativeTax.deduction, result.carryforwards.alternativeTaxNolCarryforward]
    .map(value => value?.toFixed())).toEqual(['100000', '14000', '114000', '7650', '92350']);
  expect(state).toEqual(before);
  const missing = structuredClone(state);
  if (!missing.sectionData.adjustments?.netOperatingLossSources?.alternativeTax) throw new Error('Missing fictional source');
  missing.sectionData.adjustments.netOperatingLossSources.alternativeTax.vintages = undefined;
  expect(validateSection(missing, 'adjustments').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  const changed = structuredClone(state.sectionData.adjustments);
  const vintage = changed?.netOperatingLossSources?.vintages?.[0];
  if (!vintage) throw new Error('Missing fictional original old loss');
  vintage.sourceReference = 'Different actual filed source';
  expect(updateSectionData(state, 'adjustments', changed).sectionData.adjustments?.currentLossOrigin?.sourceFactsConfirmed).toBeNull();
});

it('retains actual debt sources beside old and current charitable histories', async () => {
  const { actualGuidedCodNol } = await import('../fixtures/guided-cod-nol');
  const state = guidedCarriedCurrentCharitableHistories();
  const adjustments = state.sectionData.adjustments;
  if (!adjustments?.currentLossOrigin) throw new Error('Missing fictional current sources');
  adjustments.currentLossOrigin.cancelledDebtIncluded = true;
  adjustments.codNolSources = actualGuidedCodNol('5000');
  const before = structuredClone(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  expect([result.carryforwards.nolCarryforward,result.carryforwards.alternativeTaxNolCarryforward].map(value => value?.toFixed()))
    .toEqual(['109000','87350']);
  expect(state).toEqual(before);
});
