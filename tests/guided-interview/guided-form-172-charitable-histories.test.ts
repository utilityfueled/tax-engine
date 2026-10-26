// Spec: form-172-charitable-histories.yaml actual-guide.
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { guidedCurrentOriginCharitableHistories } from '../fixtures/guided-form-172-charitable-histories';

it('reaches current loss with complete independent current and prior charity sources', () => {
  const state = guidedCurrentOriginCharitableHistories(), before = structuredClone(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
  expect([result.form172?.regular.netOperatingLoss, result.form172?.alternativeTax.netOperatingLoss,
    result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(x => x?.toFixed()))
    .toEqual(['14000', '0', '2000', '0']);
  expect(state).toEqual(before);
  const missing = structuredClone(state);
  if (!missing.sectionData.adjustments?.netOperatingLossSources?.alternativeTax) throw new Error('Missing fictional loss sources');
  missing.sectionData.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory = undefined;
  expect(validateSection(missing, 'adjustments').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  const changed = structuredClone(state.sectionData.deductions);
  if (!changed?.charitableCarryoverSources) throw new Error('Missing fictional original charity');
  changed.charitableCarryoverSources.sourceReference = 'Different actual prior statement';
  expect(updateSectionData(state, 'deductions', changed).sectionData.adjustments?.currentLossOrigin?.sourceFactsConfirmed).toBeNull();
});
