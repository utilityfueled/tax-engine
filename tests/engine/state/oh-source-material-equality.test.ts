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
// Compared with 5a8384ec. Only unanswered Schedule B Part III facts and their prior audit rows changed.
const baselineHashes: Readonly<Record<string, string>> = {
  "july100k": "2ea86d5f9b28116fb9a2da29ca35dfc8d8f4946bb9e4470c170a1b4c36c1651b",
  "july400k": "fedf32f0d1de8b98534d9fe75ec8e6c8a97cd2585df50defa16b19d1afc729b1",
  "nr100k": "6c918cf6df45088f39d569293291d4b193276f9d799c0a015ff49957f350fd05",
  "nr400k": "74cd81cfa92cbbc4f5f0f2da55835d1b2cdcdd462264d4fdcaa699a51aa8a94b",
  "ordinary-full_year_resident": "6af458f9aa6bc70ca36e1985065fc3f670786543f798864f4e9497bc9d8cb1dc",
  "ordinary-nonresident": "c6d1fec08cea72c0fbb4cc99479a2ac32df4309e58a3eba904d54c6d186601e6",
  "ordinary-part_year_resident": "8b49a2ecff73e096dd31364684c624fba2242c47a94ee9643f28a5d2b4f34867",
  "py100k": "d12e31c8fa3182122c78ef5b6d4ca797303e8a9f426d9b5c3fc31dc5f97b98f3",
  "py400k": "28ef2931cb74bf1519c3be1dc878c4aa83961aca389e86d011f22c4ac8cd3d70",
  "reciprocal-known-zero": "6862ca5ca573a530464cbac2091d1f1dc40bc11a37a9603b83585a078c6a66e8",
  "reciprocal-refund": "6c3cf5dd5f72187d2ef0607465cefb6f42a385056be3fad143291149b2816a17",
  "resident-credit": "1fd4f25ed4c2c19fa924d434f1110cba2af463d981264c7ca1c9160fa3d56cef",
  "school-full-year": "ff3685e83859f4ad9f27de0304caa240c510d13ff551c32ee3943dd14338cc23",
  "school-part-year": "64d77ca3eecae11bb20059155bcb793bfa90866790a2c4a053897bc2bf243229"
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
