/** Spec: federal/oh-resident-credit-validation-cost.yaml; software parity, no new tax oracle. */
import Decimal from 'decimal.js';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return.js';
import { buildOhioPaymentSource } from '@/engine/state/oh-payment-source.js';
import { readOhioResidentCreditSource } from '@/engine/state/oh-resident-credit-source.js';
import { ohioResidentCreditFixture } from '../../fixtures/oh-resident-credit-sources.js';
import { ohioResidentCreditTransactionsFixture } from '../../fixtures/oh-resident-credit-transactions.js';
vi.mock('@noble/hashes/sha2.js', async original => {
  const actual = await original<typeof import('@noble/hashes/sha2.js')>();
  return { ...actual, sha256: vi.fn(actual.sha256) };
});
function required<T,>(value: T | undefined | null): T { if (value == null) throw Error('Actual complete fixture source required'); return value; }
function current() {
  const packet = ohioResidentCreditFixture(), federal = calculateFederalTax(packet.input);
  const projection = buildOhioResidentReturnInput(packet.input, federal);
  return { packet, projection, context: required(projection.residencyResidentCreditSource), facts: required(projection.residency) };
}
function observe(run: () => unknown) { try { return { value: run() }; } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; } }
function reorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorder);
  if (value !== null && typeof value === 'object' && !Decimal.isDecimal(value)) return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)]));
  return value;
}
// Independent predecessor equality oracle: retain its exact normalized bytes,
// including JSON escaping, undefined-to-empty TextEncoder input and Decimal.
function stable(value: unknown): unknown {
  if (Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
function oldDigest(value: unknown) { return createHash('sha256').update(new TextEncoder().encode(JSON.stringify(stable(value)))).digest('hex'); }
it('resident projection comparison retains only its stored facts digest', () => {
  const f = current(), before = JSON.stringify(f.packet), commitment = f.context.sourceCommitment;
  vi.mocked(sha256).mockClear();
  const result = readOhioResidentCreditSource(f.context, f.facts, f.projection);
  expect(sha256).toHaveBeenCalledTimes(1);
  expect(result.sourceCommitment).toBe(commitment);
  expect(JSON.stringify(f.packet)).toBe(before);
});
it('resident encoded field comparisons preserve original normalization and refusals', () => {
  const f = current();
  const accepted = [
    { ...f.projection, federalAgi: '100000' },
    { ...f.projection, federalAgi: new Decimal('100000.0000') },
    { ...f.projection, residency: reorder(f.facts) as typeof f.facts },
    { ...f.projection, residency: { ...f.facts, omittedChild: undefined } },
    { ...f.projection, otherStateTaxes: required(f.projection.otherStateTaxes).map(row => ({ ...row, taxPaid: new Decimal(row.taxPaid) })) },
  ];
  for (const projection of accepted) {
    for (const key of ['federalAgi', 'residency', 'otherStateTaxes']) expect(oldDigest(Reflect.get(projection, key))).toBe(oldDigest(Reflect.get(f.projection, key)));
    expect(observe(() => readOhioResidentCreditSource(f.context, f.facts, projection)).error).toBeUndefined();
  }
  // Each expected field is checked in the same original order, including the
  // actual undefined fields that cannot be silently converted to null/zero.
  const keys = ['taxYear', 'filingStatus', 'federalAgi', 'exemptions', 'residency', 'residencySourceDigest', 'otherStateTaxes', 'residentCredit', 'nonresidentCredit', 'schoolDistricts', 'isSenior', 'bothSpousesHaveQualifyingIncome', 'paymentSourceDigest', 'paymentMethodVersion', 'paymentDatedSource', 'paymentTaxCoverage', 'paymentTiming', 'priorYearTaxLiability', 'priorYearTimelyFiled', 'estimatedPaymentSchedule', 'computeUnderpaymentPenalty', 'ohioWithholding'];
  for (const key of keys) {
    const actual = { ...f.projection }; Reflect.set(actual, key, Reflect.get(f.projection, key) === undefined ? null : { contradictory: true });
    expect(oldDigest(Reflect.get(actual, key))).not.toBe(oldDigest(Reflect.get(f.projection, key)));
    expect(observe(() => readOhioResidentCreditSource(f.context, f.facts, actual)).error).toBe(`Ohio actual resident-credit sources: current source-derived ${key} projection changed`);
  }
  for (const sourceReference of ['\ud800', '\udfff', '😀', 'é', 'e\u0301', '\ufffd', '']) {
    const projection = { ...f.projection, residency: { ...f.facts, sourceReference } };
    expect(oldDigest(projection.residency)).not.toBe(oldDigest(f.facts));
    expect(observe(() => readOhioResidentCreditSource(f.context, f.facts, projection)).error).toContain('current source-derived residency projection changed');
  }
  // Complete matching UTF-8 and escaped-lone-surrogate originals stay accepted;
  // a distinct retained spelling must still fail the projection field check.
  for (const sourceReference of ['\ud800', '\udfff', '😀', 'é', 'e\u0301']) {
    const packet = ohioResidentCreditFixture(); packet.facts.sourceReference = sourceReference;
    const projection = buildOhioResidentReturnInput(packet.input, calculateFederalTax(packet.input));
    const context = required(projection.residencyResidentCreditSource), facts = required(projection.residency);
    expect(observe(() => readOhioResidentCreditSource(context, facts, projection)).error).toBeUndefined();
    const different = { ...projection, residency: { ...facts, sourceReference: sourceReference + 'different' } };
    expect(oldDigest(different.residency)).not.toBe(oldDigest(facts));
    expect(observe(() => readOhioResidentCreditSource(context, facts, different)).error).toContain('current source-derived residency projection changed');
  }
  for (const schoolDistricts of [[undefined], [null], [''], [0]]) {
    const projection = { ...f.projection }; Reflect.set(projection, 'schoolDistricts', schoolDistricts);
    expect(observe(() => readOhioResidentCreditSource(f.context, f.facts, projection)).error).toContain('current source-derived schoolDistricts projection changed');
  }
});
it('resident encoded comparison preserves first errors and immutable originals', () => {
  const f = current(), before = JSON.stringify(f.packet), projectionBefore = JSON.stringify(f.projection);
  const bad = { ...f.projection, taxYear: 2026, filingStatus: 'married_filing_jointly' as const, paymentSourceDigest: 'stale' };
  expect(observe(() => readOhioResidentCreditSource(f.context, { ...f.facts, sourceReference: 'stale' }, bad)).error).toContain('actual current original context is missing stale or fabricated');
  expect(observe(() => readOhioResidentCreditSource(f.context, f.facts, bad)).error).toContain('current source-derived taxYear projection changed');
  expect(observe(() => readOhioResidentCreditSource({ ...f.context }, f.facts, f.projection)).error).toContain('actual current original context is missing stale or fabricated');
  const rows = readOhioResidentCreditSource(f.context, f.facts, f.projection);
  required(rows.otherStateTaxes[0]).stateCode = 'XX';
  expect(required(readOhioResidentCreditSource(f.context, f.facts, f.projection).otherStateTaxes[0]).stateCode).toBe('VA');
  expect(JSON.stringify(f.packet)).toBe(before); expect(JSON.stringify(f.projection)).toBe(projectionBefore);
});
it('resident complete results and commitments retain predecessor byte fingerprints', () => {
  // Captured on unchanged82a51fac before implementation, not tax expected values.
  const cases = [
    { make: () => ohioResidentCreditFixture(), hash: 'a5e99ae662325993a2002925de694d0ef8c85762195cf0b364c3b05a864097c3', payment: 'd2aeaf3a084a69f91b8ce3620ed1e8de30295e17c32b5519596afb50f30eaa09', context: 'b63f2e873e5e39507d2a7ad930e821a9c8722215e145e9f4eceea47bdb60c6ec' },
    { make: () => ohioResidentCreditFixture('60000.50', '1000.50'), hash: '832589d9bd27d406e8615e363a341e5014db628028d73bc840be6cb8d4bac8d1', payment: 'fe3c1e0a24a4cf35218b54e432130ac7347d53a37a78d56ded42c541c43e367b', context: '5aad973ed1050e271b7a0a956d942f35ff5b1d358e2d1dd3b132edc41ae6d1a6' },
    { make: () => ohioResidentCreditTransactionsFixture(), hash: '1b38f632ebab1812a151b9a3fe2bcaf7f2c901d82e0cc1c86ebc4b41703144d6', payment: 'db3a90490f23d2f618ff2fbf80a69d8931b0584ed022d5bcb5e177272c4c3c05', context: 'feacd32c4437eae6a72009c1dd4023d588ff65ebc7ab9ab3712bb452cff8aabc' },
  ];
  for (const c of cases) {
    const p = c.make(), before = JSON.stringify(p), federal = calculateFederalTax(p.input), adapted = buildOhioResidentReturnInput(p.input, federal);
    const state = calculateOhioResidentReturn(adapted), payment = buildOhioPaymentSource(p.input, p.input.ohioPayments);
    expect(createHash('sha256').update(JSON.stringify({ federal, adapted, state, payment })).digest('hex')).toBe(c.hash);
    expect(payment.sourceDigest).toBe(c.payment); expect(required(adapted.residencyResidentCreditSource).sourceCommitment).toBe(c.context);
    expect(JSON.stringify(p)).toBe(before);
  }
});
