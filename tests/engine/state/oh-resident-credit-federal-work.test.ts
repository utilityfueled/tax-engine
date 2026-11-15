/** Spec: federal/oh-resident-credit-validation-cost.yaml; no new tax oracle. */
import Decimal from 'decimal.js';
import { expect, it, vi } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentCreditSource, readOhioResidentCreditSource } from '@/engine/state/oh-resident-credit-source.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { ohioResidentCreditFixture } from '../../fixtures/oh-resident-credit-sources.js';

const work = vi.hoisted(() => ({ fullFederal: 0, allSha: 0, freshFederal: 0 }));
vi.mock('@noble/hashes/sha2.js', async original => {
  const actual = await original<typeof import('@noble/hashes/sha2.js')>();
  return { ...actual, sha256: Object.assign((bytes: Uint8Array) => {
    work.allSha++;
    try {
      const value = JSON.parse(new TextDecoder().decode(bytes));
      if (value && value.allLines && value.agi !== undefined && value.taxYear !== undefined) work.fullFederal++;
    } catch { /* Other actual SHA inputs need not be JSON. */ }
    return actual.sha256(bytes);
  }, actual.sha256) };
});
vi.mock('@/engine/federal.js', async original => {
  const actual = await original<typeof import('@/engine/federal.js')>();
  return { ...actual, calculateFederalTax: (...args: Parameters<typeof actual.calculateFederalTax>) => {
    work.freshFederal++;
    return actual.calculateFederalTax(...args);
  } };
});
function completeFixture() {
  const packet = ohioResidentCreditFixture(), facts = packet.input.ohioResidency;
  if (!facts) throw Error('Complete canonical fixture residency required');
  return { ...packet, facts };
}
function copy<T>(value: T, reverseKeys = false): T {
  if (Decimal.isDecimal(value)) return new Decimal(value) as T;
  if (Array.isArray(value)) return value.map(child => copy(child, reverseKeys)) as T;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (reverseKeys) entries.reverse();
    return Object.fromEntries(entries.map(([key, child]) => [key, copy(child, reverseKeys)])) as T;
  }
  return value;
}
function error(run: () => unknown): string | undefined {
  try { run(); } catch (reason) { return reason instanceof Error ? reason.message : String(reason); }
  return undefined;
}
it('resident source compares full fresh federal material without throwaway hashes', () => {
  const packet = completeFixture(), federal = calculateFederalTax(packet.input);
  const beforeInput = JSON.stringify(packet), beforeFederal = JSON.stringify(federal);
  work.fullFederal = work.allSha = work.freshFederal = 0;
  const context = buildOhioResidentCreditSource(packet.input, federal, packet.facts);
  expect(work.freshFederal).toBe(1);
  expect(work.fullFederal).toBe(0);
  // Captured unchanged8cc build:23actualSHA calls, including2full-federal calls.
  // The remaining21 include smaller identity/source/receipt/payment hashes.
  expect(work.allSha).toBe(21);
  expect(context.sourceCommitment).toBe('b63f2e873e5e39507d2a7ad930e821a9c8722215e145e9f4eceea47bdb60c6ec');
  expect(readOhioResidentCreditSource(context, packet.facts).sourceCommitment).toBe(context.sourceCommitment);
  expect(JSON.stringify(packet)).toBe(beforeInput);
  expect(JSON.stringify(federal)).toBe(beforeFederal);
});
it('resident fresh federal comparison preserves full material and first errors', () => {
  const packet = completeFixture(), federal = calculateFederalTax(packet.input);
  const beforeInput = JSON.stringify(packet), beforeFederal = JSON.stringify(federal);
  const build = (result: TaxReturnResult) => buildOhioResidentCreditSource(packet.input, result, packet.facts);
  const context = build(federal), normalized = copy(federal, true);
  Reflect.set(normalized, 'omittedChild', undefined);
  const firstLine = normalized.allLines[0];
  if (!firstLine) throw Error('Complete canonical federal audit line required');
  Reflect.set(firstLine, 'omittedChild', undefined);
  if (Decimal.isDecimal(firstLine.value)) Reflect.set(firstLine, 'value', firstLine.value.toString());
  // Original stable array mapping ignores non-index properties; keep that rule.
  Reflect.set(normalized.allLines, 'nonIndexProperty', 'not an array element');
  expect(build(normalized)).toEqual(context);
  expect(readOhioResidentCreditSource(build(normalized), packet.facts)).toEqual(readOhioResidentCreditSource(context, packet.facts));
  const stale = (mutate: (result: TaxReturnResult) => void) => {
    const result = copy(federal); mutate(result); const before = JSON.stringify(result);
    expect(error(() => build(result))).toBe('Ohio actual resident-credit sources: fresh canonical federal calculation required');
    expect(JSON.stringify(result)).toBe(before);
  };
  stale(result => { result.agi = result.agi.plus('0.01'); });
  stale(result => { Reflect.set(result, 'actualExtra', null); });
  stale(result => { Reflect.set(result.allLines[0], 'value', new Decimal('1')); });
  stale(result => { Reflect.set(result, 'actualExtra', ['first', 'second']); });
  for (const text of ['\ud800', '\udfff', '😀', 'é', 'e\u0301', '\ufffd']) stale(result => { Reflect.set(result, 'actualExtra', text); });
  // Stable material equality does not make a string AGI a usable Decimal result.
  const stringAgi = { ...federal, agi: federal.agi.toString() } as unknown as TaxReturnResult;
  expect(error(() => build(stringAgi))).toContain('agi.eq is not a function');
  const wrongYear = { ...federal, taxYear: 2026 };
  expect(error(() => build(wrongYear))).toBe('Ohio actual resident-credit sources: only actual2025 single primary full-year Ohio ordinary employee admitted');
  const wrongOwner = completeFixture(); wrongOwner.source.originalTaxpayer.firstName = 'Other';
  const beforeOwner = JSON.stringify(wrongOwner), badFederal = copy(federal); badFederal.agi = badFederal.agi.plus(1);
  expect(error(() => buildOhioResidentCreditSource(wrongOwner.input, badFederal, wrongOwner.facts))).toBe('Ohio actual resident-credit sources: current actual complete W2 year owner identity or ordinary employer differs');
  expect(JSON.stringify(wrongOwner)).toBe(beforeOwner);
  expect(JSON.stringify(packet)).toBe(beforeInput); expect(JSON.stringify(federal)).toBe(beforeFederal);
});
