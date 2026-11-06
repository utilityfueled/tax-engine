// Spec: spec/federal/marketplace-health-business-gross-sources.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { validateSection, updateSectionData } from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { guidedMarketplaceNegativeLimitState } from '../fixtures/guided-marketplace-negative-limit';

it('uses actual gross attachments through the existing two-partnership guide', () => {
  const state = guidedMarketplaceNegativeLimitState(), before = JSON.stringify(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const built = buildTaxInputFromGuidedData(state); expect(built).not.toBeNull();
  const input = TaxYearInputSchema.parse(built), result = calculateFederalTax(input);
  expect([result.schedule1?.seHealthInsurance.toFixed(), result.agi.toFixed(), result.form8962?.ptcAllowed.toFixed()]).toEqual(['4647', '43586', '3577']);
  expect(input.form7206?.partnershipGrossIncomeSources?.statements?.map(row => row.grossIncome)).toEqual(['10000', '40000']);
  expect(JSON.stringify(state)).toBe(before);
  const changed = structuredClone(state.sectionData.adjustments!);
  changed.healthInsuranceFacts!.partnershipGrossIncomeSources!.statements[0].grossIncome = '';
  const edited = updateSectionData(state, 'adjustments', changed);
  expect(edited.sectionData.adjustments?.healthInsuranceFacts?.partnershipGrossIncomeSources?.sourceFactsConfirmed).toBeNull();
  expect(validateSection(edited, 'adjustments').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();
  const stale = structuredClone(state);
  stale.sectionData.adjustments!.k1LossSources!.activities![0].entityEIN = '98-7654321';
  expect(validateSection(stale, 'adjustments').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(stale)).toBeNull();
});
