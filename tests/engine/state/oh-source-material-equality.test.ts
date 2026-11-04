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
// Filled only from retained unchanged-baseline output, before either product edit.
const baselineHashes: Readonly<Record<string, string>> = {
  "july100k": "29dc43907bd7c0b55732a471f10b4fd9fb053bba05645932ff176c3aa789d79d",
  "july400k": "713f802d9cd2d156bf09cb2f79c9516120cd02c37b5c450b31376f4aa57a9ea4",
  "nr100k": "7d15d2c4905cb39111e2599396b7e66be12fcdd242ec7e641a37d7fe5c335ade",
  "nr400k": "259f667a6f386a489668f506b9621191494629dd208b2080b0bca7d87ebc1d2b",
  "ordinary-full_year_resident": "9aef01bbc0a230ca639db36f86a5170995f1068b388cdcd87ee643dca7a5a601",
  "ordinary-nonresident": "634b03ea4a3c308399abda5b3f9ad43dec07d44080ce589efd0388a82ce71926",
  "ordinary-part_year_resident": "136c802fa9ba666b85886e680f3fd2ab89992d865e4ec6eae6bb9f8ea1a38edc",
  "py100k": "3094c79120d0c5225dfe388327be4e16400f49908371e9341a3bc59cd8dd267f",
  "py400k": "35951059493b28ed8877fbef9212964eed73bb56f235a8864fc19149928d4ed0",
  "reciprocal-known-zero": "183b79b6ba6eb4ce4e369f6bd8c3a36903df43fc83bd346ce2109b9d2da7f51e",
  "reciprocal-refund": "50eb0dcee11bbcbf8703200047df45eff6c4e7aef5bb5ea33a2726275c9f8771",
  "resident-credit": "4398436c55b7822f8e253b4d987fe41b142da18acfb5e8f39d19d1f9da678830",
  "school-full-year": "61e3b092f3c5e662baedb5791b35b21baee031b501d1c4746f745060d9a24a44",
  "school-part-year": "8d142718c34e38e5af32fde1d479754d6555a2f6c7e31bf41fdbf92d9cd922a7"
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
