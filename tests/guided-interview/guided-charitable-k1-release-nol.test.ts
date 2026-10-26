// Spec: spec/federal/charitable-k1-basis-release-nol.yaml guided.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { guidedCharitableK1ReleaseState } from '../fixtures/guided-charitable-k1-release-nol';

it('reaches released basis through actual collectors and preserves source invalidation', () => {
  const state = guidedCharitableK1ReleaseState(), before = JSON.stringify(state);
  expect(validateSection(state, 'deductions').status).toBe('complete');
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
  const basis = input.k1CharitableSources?.statements?.[0].basis;
  expect(basis?.currentContributions).toEqual([]);
  expect(basis?.priorBasisSuspensions?.[0]).toMatchObject({ originTaxYear: 2018, contributionShare: '180000', adjustedBasisShare: '80000', appreciationPreviouslyTakenIntoAccount: '100000' });
  expect(basis?.priorBasisSuspensions?.[0].basisUseHistory).toHaveLength(7);
  expect([result.nolDeduction,result.agi,result.scheduleA?.charitableTotal,result.carryforwards.charitableContributions,
    result.carryforwards.amtCharitableContributions].map(value => value?.toFixed())).toEqual(['56000','44000','13200','33360','46800']);
  expect(result.scheduleE?.partnerships[0].basisResult?.suspendedLossCarryforward.charitable.toFixed()).toBe('0');
  expect(input).not.toHaveProperty('charitableDeductionOverride'); expect(JSON.stringify(state)).toBe(before);
  const deductions = structuredClone(state.sectionData.deductions), history = deductions?.k1CharitableSources?.statements?.[0].basis?.priorBasisSuspensions?.[0].basisUseHistory;
  if (!deductions || !history) throw new Error('Missing fictional original history');
  history[1].basisAllowed = '0.01';
  const changed = updateSectionData(state, 'deductions', deductions);
  expect(changed.sectionData.deductions?.k1CharitableSources?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.deductions?.k1CharitableSources?.statements?.[0].basis?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const missing = guidedCharitableK1ReleaseState(), missingHistory = missing.sectionData.deductions?.k1CharitableSources?.statements?.[0].basis?.priorBasisSuspensions?.[0];
  if (!missingHistory) throw new Error('Missing fictional historical row'); missingHistory.basisUseHistory = undefined;
  expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  expect(validateSection(missing, 'deductions').status).not.toBe('complete');
  expect(missingHistory.basisUseHistory).toBeUndefined();
});
