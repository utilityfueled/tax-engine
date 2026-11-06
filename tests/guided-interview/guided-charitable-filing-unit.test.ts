// Spec: spec/federal/charitable-filing-unit-history.yaml guided-sources/guided-canonical.
import { expect, it } from 'vitest';
import { buildGuidedCharitableCarryover, updateCharitableCarryoverSources } from '@/lib/guided-charitable-carryover';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { validateSection, updateSectionData } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { completePersonalInfo } from './complete-facts';
import { guidedCharitableFilingUnitHistory, guidedCharitableFilingUnitWorkspace } from '../fixtures/guided-charitable-filing-unit';

it('preserves actual timeline sources and revokes both confirmations after edits', () => {
  const facts = guidedCharitableFilingUnitHistory(), before = JSON.stringify(facts);
  facts.vintages![0].openingCarryforward = '';
  const result = buildGuidedCharitableCarryover(facts, 2025, 'single', completePersonalInfo)!;
  expect(result.filingUnitHistory?.returns?.[0].taxYear).toBe(2022);
  expect(result.vintages?.[0].openingCarryforward).toBeUndefined();
  expect(result.membershipUnchangedConfirmed).toBe(false);
  expect(result.vintages?.[0].filingUnitOrigin?.separateComputations?.[0].originalExcess).toBe('12000');
  expect(result).not.toHaveProperty('deduction');
  const changed = updateCharitableCarryoverSources(facts, { sourceReference: 'Different actual filed source' });
  expect(changed.sourceFactsConfirmed).toBeNull(); expect(changed.filingUnitHistory?.sourceFactsConfirmed).toBeNull();
  const confirmed = updateCharitableCarryoverSources(changed, { filingUnitHistory: { ...changed.filingUnitHistory, sourceFactsConfirmed: true } });
  expect(confirmed.filingUnitHistory?.sourceFactsConfirmed).toBe(true); expect(confirmed.sourceFactsConfirmed).toBeNull();
  expect(JSON.stringify(guidedCharitableFilingUnitHistory())).toBe(before);
  const unknown = guidedCharitableFilingUnitHistory(); unknown.vintages![0].history![0].filingUnitUses![0].treatedAsPaid = '';
  expect(() => buildGuidedCharitableCarryover(unknown, 2025, 'single', completePersonalInfo)).toThrow(/actual|known zero/i);
});

it('passes actual guided ownership sources into the canonical deduction', () => {
  const state = guidedCharitableFilingUnitWorkspace(), original = JSON.stringify(state);
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(calculateFederalTax(input).scheduleA?.charitableTotal.toString()).toBe('6000');
  expect(computeGuidedPreview(state)).not.toBeNull(); expect(JSON.stringify(state)).toBe(original);
  const changed = updateSectionData(state, 'personal-info', { ...completePersonalInfo, lastName: 'Different actual identity' });
  expect(changed.sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.deductions?.charitableCarryoverSources?.filingUnitHistory?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
});

it('rejects a known household death conflict during source completion', () => {
  const state = guidedCharitableFilingUnitWorkspace();
  state.sectionData['personal-info']!.standardDeductionFacts!.primaryDeceased = true;
  state.sectionData['personal-info']!.standardDeductionFacts!.primaryDeathDate = '2025-03-10';
  expect(validateSection(state, 'deductions').status).not.toBe('complete');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
