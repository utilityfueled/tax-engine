/** Spec: state/oh-source-material-equality.yaml. No PDF authoring or timing assertions. */
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return.js';
import { buildOhioPaymentSource } from '@/engine/state/oh-payment-source.js';
import { prepareOhioResidencyReview, resolveOhioResidencyReview, type PreparedOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { ohioPaymentFixture } from '../../fixtures/oh-payments.js';
import { reciprocalOhioWageFixture } from '../../fixtures/oh-reciprocal-wage-sources.js';
import { ohioResidentCreditFixture } from '../../fixtures/oh-resident-credit-sources.js';
import { businessPaperCases, businessPaperFixture } from '../../fixtures/oh-business-official-review.js';
import { julyCases, julyHeaderPacket } from '../../fixtures/oh-business-part-year-header.js';
import { schoolDistrictSourcesFixture } from '../../fixtures/oh-school-district-sources.js';
import { schoolDistrictPartYearFixture } from '../../fixtures/oh-school-district-part-year-sources.js';

function required<T>(value: T | undefined | null): T {
  if (value == null) throw new Error('Explicit source fixture required');
  return value;
}
const cases: Array<{ name: string; input: () => TaxYearInput; tax: string }> = [
  ...(['full_year_resident', 'part_year_resident', 'nonresident'] as const).map((status, i) => ({
    name: `ordinary-${status}`, input: () => ohioPaymentFixture(status), tax: required(['2323', '929', '465'][i]),
  })),
  { name: 'reciprocal-refund', input: () => reciprocalOhioWageFixture().input, tax: '0' },
  { name: 'reciprocal-known-zero', input: () => reciprocalOhioWageFixture('60000.50', '0').input, tax: '0' },
  { name: 'resident-credit', input: () => ohioResidentCreditFixture().input, tax: '1323' },
  ...businessPaperCases.map(c => ({ name: c.name, input: () => businessPaperFixture(c).input, tax: '0' })),
  ...julyCases.map(c => ({ name: c.name, input: () => julyHeaderPacket(c).withHeader, tax: '0' })),
  { name: 'school-full-year', input: () => schoolDistrictSourcesFixture(), tax: '1767' },
  { name: 'school-part-year', input: () => schoolDistrictPartYearFixture(), tax: '811' },
];
// Full-output baselines rebound only after exact1768448b→835e8972 comparison: HSA audit wording and explicit zero trace additions; all monetary/source commitments unchanged.
const baselineHashes: Readonly<Record<string, string>> = {
  "july100k": "8d7197cb45b55602a254a8bf8141b0f54acb546757b1b9dbe862b3f1a4f82de5",
  "july400k": "cbca7b397d196249895e59572545532d9a6afeadecc3829836aa7ab71aadb37a",
  "nr100k": "9c639a03f6abd3b2e4073cb280a2fe17bffc33286de76cae1c5c848fe443b65f",
  "nr400k": "f83bd40fe5705ef1af0538548e40b7fc4707baa53f5a49acb5766e33da976746",
  "ordinary-full_year_resident": "4658bcafaa0a8deefb5e1c36335d782047a78873462b6145d6af1486747187ad",
  "ordinary-nonresident": "8e316ba37bdc93f35eac54a6e5fe66f55c9120f86fbeaee307e5487d0202c319",
  "ordinary-part_year_resident": "fef243c296cd0c8510e0ae51d83b4894ff90c49f624672f3e490a448244f2b27",
  "py100k": "e14d7e93594b7e9b3792a92b77a32cc7f397d1b3cba8a7a7e489bdb8522e014f",
  "py400k": "a95f98d2d009a461e30ffd1c46b3f6d8757faa9c3d668aa509825de147c2d146",
  "reciprocal-known-zero": "da0ae7b99b0f49bdae24b9017218ce557d5b324fe7d1916c0090d1949b38f921",
  "reciprocal-refund": "70a2d29f243fcc98105462bfcf5fb946e6870cf05690d58d9d90c6c69e44dd68",
  "resident-credit": "a5e99ae662325993a2002925de694d0ef8c85762195cf0b364c3b05a864097c3",
  "school-full-year": "d4ee6456a5923ba194e126c9fc351f9b64970afc855fc698ece10762e27186c1",
  "school-part-year": "c40077d2dc4d5998439f992dccfc899b9ee7a79f3b5f7813f36cdbc049e3f471"
};
function fingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function calculation(input: TaxYearInput) {
  const federal = calculateFederalTax(input);
  const adapted = buildOhioResidentReturnInput(input, federal);
  const state = calculateOhioResidentReturn(adapted);
  const payment = buildOhioPaymentSource(input, input.ohioPayments);
  return { federal, adapted, state, payment };
}
it.each(cases.map(c => [c.name, c] as const))('preserves complete baseline output and commitments for %s', (name, c) => {
  const input = c.input(); const before = JSON.stringify(input); const actual = calculation(input);
  expect(actual.state.it1040.line10_taxAfterCredits.toString()).toBe(c.tax);
  expect(actual.payment.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(actual.state.lines)).toContain(actual.payment.sourceDigest);
  expect(JSON.stringify(input)).toBe(before);
  const hash = fingerprint(actual);
  expect(hash).toBe(required(baselineHashes[name]));
});
function captures(input: ReturnType<typeof ohioPaymentFixture>): Array<Record<string, unknown>> {
  return [required(input.ohioResidency.originalFederalSources), input.ohioPayments.originalFederalSources];
}
function reorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorder);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)]));
  return value;
}
it.each(['key-order', 'undefined-child', 'decimal-string', 'unicode-exact', 'array-undefined-null'] as const)('preserves actual source normalization for %s', kind => {
  const input = ohioPaymentFixture();
  if (kind === 'unicode-exact') {
    required(input.w2s?.[0]).employer.name = 'Fictional Ω 😀 e\u0301 \ud800 source';
    for (const capture of captures(input)) required((capture.w2s as Array<{ employer: { name: string } }>)[0]).employer.name = required(input.w2s?.[0]).employer.name;
  }
  if (kind === 'key-order') {
    input.ohioResidency.originalFederalSources = reorder(input.ohioResidency.originalFederalSources) as Record<string, unknown>;
    input.ohioPayments.originalFederalSources = reorder(input.ohioPayments.originalFederalSources) as Record<string, unknown>;
  }
  if (kind === 'undefined-child') for (const capture of captures(input)) capture.sourceMaterialAbsent = undefined;
  if (kind === 'decimal-string') for (const capture of captures(input)) required((capture.w2s as Array<Record<string, unknown>>)[0]).federalWithheld = new Decimal('0.000');
  if (kind === 'array-undefined-null') {
    // Isolated current-source metadata representation, not qualification of an extra income form.
    Object.assign(input, { materialProbe: [null] });
    for (const capture of captures(input)) capture.materialProbe = [undefined];
  }
  const before = JSON.stringify(input); const actual = calculation(input);
  expect(actual.state.it1040.line10_taxAfterCredits.toString()).toBe('2323');
  expect(JSON.stringify(input)).toBe(before);
});
it.each(['residency-missing', 'payment-missing', 'residency-identity', 'payment-identity', 'unicode-distinct', 'array-order', 'null-present', 'federal-audit'] as const)('rejects changed complete source material for %s', kind => {
  const input = ohioPaymentFixture(); const federal = calculateFederalTax(input);
  if (kind === 'residency-missing') delete input.ohioResidency.originalFederalSources;
  if (kind === 'payment-missing') delete (input.ohioPayments as unknown as Record<string, unknown>).originalFederalSources;
  if (kind === 'residency-identity') required((required(input.ohioResidency.originalFederalSources).w2s as Array<{ employer: { name: string } }>)[0]).employer.name = 'Same money different source';
  if (kind === 'payment-identity') required((input.ohioPayments.originalFederalSources.w2s as Array<{ employer: { name: string } }>)[0]).employer.name = 'Same money different source';
  if (kind === 'unicode-distinct') {
    required(input.w2s?.[0]).employer.name = 'Literal \ud800';
    for (const capture of captures(input)) required((capture.w2s as Array<{ employer: { name: string } }>)[0]).employer.name = 'Literal \ufffd';
  }
  if (kind === 'array-order') { Object.assign(input, { materialProbe: ['a', 'b'] }); for (const capture of captures(input)) capture.materialProbe = ['b', 'a']; }
  if (kind === 'null-present') for (const capture of captures(input)) capture.materialProbe = null;
  if (kind === 'federal-audit') Object.assign(required(federal.allLines[0]), { formula: 'Changed audit at identical AGI' });
  const before = JSON.stringify(input);
  expect(() => buildOhioResidentReturnInput(input, federal)).toThrow(/source|snapshot|stale|payment/i);
  expect(JSON.stringify(input)).toBe(before);
});
it('preserves prepared raw and redacted context integrity', () => {
  const input = ohioPaymentFixture(); const federal = calculateFederalTax(input); const before = JSON.stringify(input);
  const token = prepareOhioResidencyReview(input);
  expect(resolveOhioResidencyReview(input, federal, token)).toEqual(input);
  expect(resolveOhioResidencyReview(redactReviewIdentifiers(input), redactReviewIdentifiers(federal), token)).toEqual(input);
  expect(() => resolveOhioResidencyReview(input, federal, {} as PreparedOhioResidencyReview)).toThrow(/context/i);
  const changed = structuredClone(input); required(changed.w2s?.[0]).employer.name = 'Same cash new source';
  expect(() => resolveOhioResidencyReview(changed, federal, token)).toThrow(/originals/i);
  const changedFederal = calculateFederalTax(input); Object.assign(required(changedFederal.allLines[0]), { formula: 'Same total changed audit' });
  expect(() => resolveOhioResidencyReview(input, changedFederal, token)).toThrow(/calculation/i);
  expect(JSON.stringify(input)).toBe(before);
});
