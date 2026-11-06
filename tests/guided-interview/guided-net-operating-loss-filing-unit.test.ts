import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGuidedNetOperatingLoss, updateNetOperatingLossSources } from '@/lib/guided-net-operating-loss';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedChangedNolFixture } from '../fixtures/guided-net-operating-loss-filing-unit';

// Spec: net-operating-loss-filing-unit-history.yaml source-guide
it('preserves actual histories and invalidates confirmation after source edits', () => {
  const state = guidedChangedNolFixture(), original = structuredClone(state);
  expect(JSON.parse(readFileSync(new URL('../fixtures/guided-net-operating-loss-filing-unit-browser.json', import.meta.url), 'utf8'))).toEqual(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.netOperatingLoss?.filingUnitHistory?.returns).toHaveLength(7);
  expect(input?.netOperatingLoss?.vintages?.[0]?.history?.[1]?.filingUnitUses?.[0]?.owners?.[1]?.modifiedAbsorption).toBe('7000');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toString()).toBe('22600');
  expect(result.netOperatingLoss!.alternativeTax.deduction.toString()).toBe('20000');
  expect(state).toEqual(original);
  const source = state.sectionData.adjustments!.netOperatingLossSources!;
  const changed = updateNetOperatingLossSources(source, { sourceReference: 'Replaced actual worksheet' });
  expect(changed.filingUnitHistory?.sourceFactsConfirmed).toBeNull();
  expect(changed.alternativeTax?.filingUnitHistory?.sourceFactsConfirmed).toBeNull();
  expect(changed.vintages?.[0]?.history?.[0]?.filingUnitUses?.[0]?.sourceFactsConfirmed).toBeNull();
  const personEdit = updateSectionData(state, 'personal-info', { ...state.sectionData['personal-info']!, lastName: 'Changed' });
  expect(personEdit.sectionData.adjustments?.netOperatingLossSources?.sourceFactsConfirmed).toBeNull();
  expect(personEdit.sectionData.adjustments?.netOperatingLossSources?.filingUnitHistory?.sourceFactsConfirmed).toBeNull();
  expect(personEdit.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.filingUnitHistory?.sourceFactsConfirmed).toBeNull();
  expect(personEdit.sectionData.adjustments?.netOperatingLossSources?.vintages?.[0]?.history?.[0]?.filingUnitUses?.[0]?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(personEdit)).toBeNull();
});

// Spec: net-operating-loss-filing-unit-history.yaml actual-timeline
it('retains zero and false while refusing unknown or hidden ownership records', () => {
  const state = guidedChangedNolFixture(), data = state.sectionData.adjustments!.netOperatingLossSources!;
  const build = (source = data) => buildGuidedNetOperatingLoss(source, 2025, 'single', state.sectionData['personal-info']);
  expect(build()?.membershipUnchangedConfirmed).toBe(false);
  expect(build()?.vintages?.[0]?.history?.[2]?.nolUsed).toBe('0');
  for (const source of [
    { ...data, filingUnitHistory: undefined },
    { ...data, alternativeTax: { ...data.alternativeTax, filingUnitHistory: undefined } },
    { ...data, returnMembership: 'continuous_individual' as const, membershipUnchangedConfirmed: true },
  ]) expect(() => build(source)).toThrow();
  const missing = structuredClone(data); delete missing.vintages![0]!.history![0]!.filingUnitUses![0]!.owners![0]!.modifiedAbsorption;
  expect(() => build(missing)).toThrow();
});
