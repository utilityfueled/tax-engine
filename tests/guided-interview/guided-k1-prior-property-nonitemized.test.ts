import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGuidedK1CharitableSources } from '@/lib/guided-k1-charitable-sources';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { guidedPriorPropertyState } from '../fixtures/guided-k1-prior-property-nonitemized';
import { priorPropertyNonitemizedInput } from '../fixtures/k1-prior-property-nonitemized';
import { releaseFixtureSource as required } from '../fixtures/charitable-k1-basis-release-nol';

it('forwards explicit nonitemization and preserves the complete original property histories', () => {
  // Spec: K1 Prior Property Nonitemized 2026, guided-originals.
  expect(JSON.parse(readFileSync(new URL('../fixtures/k1-prior-property-guide-original.json', import.meta.url), 'utf8')))
    .toEqual(guidedPriorPropertyState());
  for (const method of ['basis', 'risk', 'both'] as const) {
    const state = guidedPriorPropertyState(method), before = JSON.stringify(state);
    const built = required(buildGuidedK1CharitableSources(state));
    const input = TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state)));
    expect(input.deductionElection).toBe('standard');
    expect(input.w2s[0].federalWithheld).toBe(priorPropertyNonitemizedInput({ method }).w2s[0].federalWithheld);
    expect(input.k1CharitableSources).toEqual(built.k1CharitableSources);
    expect(input.charitableCarryoverSources?.vintages).toEqual([]);
    if (method !== 'risk') expect(input.k1CharitableSources?.statements?.[0].basis?.priorBasisSuspensions?.[0].originTaxYear).toBe(2018);
    if (method !== 'basis') expect(input.k1CharitableSources?.statements?.[0].atRisk?.priorLossHistory?.characterSources?.records?.[0].gift?.basisOriginTaxYear).toBe(2024);
    expect(() => calculateFederalTax(input)).toThrow(/2026.*incomplete|2026.*unavailable/);
    expect(JSON.stringify(state)).toBe(before);
    const deductions = required(state.sectionData.deductions);
    const changed = updateSectionData(state, 'deductions', { ...deductions, method: 'itemized' });
    expect(changed.sectionData.deductions?.k1CharitableSources?.sourceFactsConfirmed).toBeNull();
    const automatic = structuredClone(state); required(automatic.sectionData.deductions).method = 'automatic';
    expect(() => buildGuidedK1CharitableSources(automatic)).toThrow(/prior.*floor/);
  }
});
