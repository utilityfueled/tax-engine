// Spec: spec/federal/cod-ordinary-attribute-sources.yaml guided-originals/guided-boundary.
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGuidedCodNol, updateGuidedCodNol } from '@/lib/guided-cod-nol';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedCodOrdinaryAttributesState } from '../fixtures/guided-cod-ordinary-attributes';

it('forwards independent original ledgers and derives later reductions in the complete return', () => {
  const state = guidedCodOrdinaryAttributesState(), before = JSON.stringify(state), data = state.sectionData.adjustments!.codNolSources!;
  expect(JSON.parse(readFileSync('tests/fixtures/cod-ordinary-attributes-browser.json', 'utf8'))).toEqual(state);
  const source = buildGuidedCodNol(data, state);
  expect(source?.form982AttributeSources?.regular?.property?.immediatelyAfter?.money).toBe('600');
  expect(source?.form982AttributeSources?.alternativeTax?.records).toEqual([]);
  expect(source?.form982AttributeSources).not.toHaveProperty('reduction');
  const raw = buildTaxInputFromGuidedData(state); expect(raw).not.toBeNull();
  const input = TaxYearInputSchema.parse(raw), result = calculateFederalTax(input);
  expect(result.codAttributeReduction?.regular.property.attributeReduction.toFixed()).toBe('100');
  expect(result.codAttributeReduction?.regular.property.remainingBasis.toFixed()).toBe('5400');
  expect(result.codAttributeReduction?.regular.unreducedExclusion.toFixed()).toBe('1400');
  expect(JSON.stringify(state)).toBe(before);
});

it('retains unknowns and invalidates every changed original confirmation', () => {
  const state = guidedCodOrdinaryAttributesState(), original = state.sectionData.adjustments!.codNolSources!;
  for (const mutate of [
    (data: typeof original) => { data.attributeSources!.alternativeTax = undefined; },
    (data: typeof original) => { data.attributeSources!.regular!.property!.immediatelyAfter!.money = ''; },
    (data: typeof original) => { data.attributeSources!.currentMinimumTaxCredit!.sourceFactsConfirmed = null; },
  ]) {
    const data = structuredClone(original); mutate(data);
    expect(() => buildGuidedCodNol(data, state)).toThrow();
  }
  const attributes = structuredClone(original.attributeSources!);
  attributes.regular!.property!.followingYear!.properties![0]!.sourceReference = 'Different original basis record';
  const next = updateGuidedCodNol(original, { attributeSources: attributes });
  expect(next.sourceFactsConfirmed).toBeNull(); expect(next.attributeSources?.sourceFactsConfirmed).toBeNull();
  expect(next.attributeSources?.regular?.property?.followingYear?.sourceFactsConfirmed).toBeNull();
  expect(next.attributeSources?.regular?.property?.followingYear?.properties?.[0]?.sourceFactsConfirmed).toBeNull();
  expect(next.attributeSources?.alternativeTax?.records).toEqual([]);
  expect(() => buildGuidedCodNol(next, state)).toThrow();
});
