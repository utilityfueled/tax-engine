// Spec: spec/federal/charitable-original-source-nol.yaml guided.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { validateSection, updateSectionData } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { guidedOriginalCharitableNolState } from '../../fixtures/guided-charitable-original-source-nol';

it('reaches the original K1 NOL method through existing actual source collectors', () => {
  const state = guidedOriginalCharitableNolState();
  const sources = state.sectionData.adjustments?.netOperatingLossSources;
  if (!sources?.alternativeTax?.charitableCarryoverHistory) throw new Error('Missing fictional histories');
  const history = sources.alternativeTax.charitableCarryoverHistory;
  sources.alternativeTax.charitableCarryoverHistory = undefined;
  expect(validateSection(state, 'adjustments').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  sources.alternativeTax.charitableCarryoverHistory = history;
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state);
  if (!input) throw new Error('Complete actual K1 and NOL sources must reach canonical input');
  expect(input.scheduleK1).toHaveLength(1);
  expect(input.scheduleK1[0]).toMatchObject({ charitableCapitalGain30: '80000.00', beginningBasis: '20000.00' });
  const before = JSON.stringify(input), result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect([result.nolDeduction, result.agi, result.carryforwards.charitableContributions,
    result.carryforwards.amtCharitableContributions].map(value => value?.toFixed())).toEqual(['56000', '44000', '33360', '46800']);
  expect(JSON.stringify(input)).toBe(before);
  const deductions = structuredClone(state.sectionData.deductions);
  if (!deductions?.k1CharitableSources?.statements?.[0]?.basis) throw new Error('Missing actual charity source');
  deductions.k1CharitableSources.statements[0].basis.sourceReference = 'Changed original basis evidence';
  const changed = updateSectionData(state, 'deductions', deductions);
  expect(changed.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.deductions?.k1CharitableSources?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
});
