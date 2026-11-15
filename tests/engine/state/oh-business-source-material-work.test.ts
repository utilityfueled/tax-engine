/** Spec: state/oh-source-material-equality.yaml#canonical-business-work-bound. */
import Decimal from 'decimal.js';
import { expect, it, vi } from 'vitest';

const work = vi.hoisted(() => ({ fullFederal: 0, fullInput: 0, calls: 0, bytes: 0 }));
vi.mock('@noble/hashes/sha2.js', async importOriginal => {
  const actual = await importOriginal<typeof import('@noble/hashes/sha2.js')>();
  const sha256 = Object.assign((data: Uint8Array) => {
    work.calls++;
    work.bytes += data.byteLength;
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(data));
      if (value && typeof value === 'object') {
        if ('allLines' in value && 'agi' in value && 'scheduleC' in value) work.fullFederal++;
        if ('taxpayer' in value && 'scheduleC' in value) work.fullInput++;
      }
    } catch { /* Other actual SHA inputs need not be JSON. */ }
    return actual.sha256(data);
  }, actual.sha256);
  return { ...actual, sha256 };
});

import { calculateFederalTax } from '@/engine/federal.js';
import { calculateOhioCanonicalBusinessSource, readOhioCanonicalBusinessSource } from '@/engine/state/oh-business-source.js';
import { canonicalOhioBusinessFixture } from '../../fixtures/oh-canonical-business-sources.js';

type Packet = ReturnType<typeof canonicalOhioBusinessFixture>;
function required<T>(value: T | undefined | null): T {
  if (value == null) throw new Error('Explicit source fixture required');
  return value;
}
function business(packet: Packet) { return required(packet.facts.businessSources.facts.businesses[0]); }
function reverseKeys(value: unknown): unknown {
  if (Decimal.isDecimal(value)) return value;
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
  return value;
}
function prepare(packet: Packet) {
  return calculateOhioCanonicalBusinessSource({ taxInput: packet.input, residencyFacts: packet.facts, federalResult: calculateFederalTax(packet.input) });
}

it('compares complete canonical business material without temporary full-source SHA256 work', () => {
  const packet = canonicalOhioBusinessFixture();
  const federal = calculateFederalTax(packet.input);
  const before = JSON.stringify(packet);
  Object.assign(work, { fullFederal: 0, fullInput: 0, calls: 0, bytes: 0 });
  const context = calculateOhioCanonicalBusinessSource({ taxInput: packet.input, residencyFacts: packet.facts, federalResult: federal });
  console.log('CANONICAL_BUSINESS_HASH_WORK', JSON.stringify(work));
  expect.soft(work.fullFederal).toBe(0);
  expect.soft(work.fullInput).toBe(0);
  // Captured unchanged-baseline compatibility commitment, not an independent tax oracle.
  expect(context.sourceCommitment).toBe('ce86d2cbc1f19c2a8beef3308180bf3631f4dbdc83fccbf8a1ca14b4c9bfad46');
  expect(readOhioCanonicalBusinessSource(context, packet.facts, federal.agi).federalAgi.eq(federal.agi)).toBe(true);
  expect(JSON.stringify(packet)).toBe(before);
});

const normalizations: Array<[string, (packet: Packet) => void]> = [
  ['object key order', packet => {
    packet.facts.originalFederalSources = reverseKeys(packet.facts.originalFederalSources) as typeof packet.facts.originalFederalSources;
    const row = business(packet);
    row.originalBusiness = reverseKeys(row.originalBusiness) as typeof row.originalBusiness;
  }],
  ['undefined object child', packet => { Object.assign(packet.facts.originalFederalSources, { absentSourceMetadata: undefined }); }],
  ['Decimal string', packet => {
    Object.assign(packet.input, { materialProbe: '1' });
    Object.assign(packet.facts.originalFederalSources, { materialProbe: new Decimal('1.000') });
  }],
  ['array undefined and null', packet => {
    Object.assign(packet.input, { materialProbe: [null] });
    Object.assign(packet.facts.originalFederalSources, { materialProbe: [undefined] });
  }],
  ['exact Unicode and lone surrogate', packet => {
    const name = 'Fictional Ω 😀 e\u0301 \ud800';
    required(packet.input.scheduleC).businessName = name;
    business(packet).originalBusiness.businessName = name;
    packet.facts.originalFederalSources = structuredClone(packet.input);
  }],
];
it.each(normalizations)('preserves canonical business normalization for %s', (_name, change) => {
  const packet = canonicalOhioBusinessFixture();
  change(packet);
  const before = JSON.stringify(packet);
  const context = prepare(packet);
  expect(context.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);
  expect(readOhioCanonicalBusinessSource(context, packet.facts, packet.expected.federalAGI).federalAgi.toFixed()).toBe(packet.expected.federalAGI);
  expect(JSON.stringify(packet)).toBe(before);
});

const contradictions: Array<[string, (packet: Packet) => void, boolean, string]> = [
  ['distinct surrogate', packet => {
    Object.assign(packet.input, { materialProbe: '\ud800' });
    Object.assign(packet.facts.originalFederalSources, { materialProbe: '\ud801' });
  }, false, 'current private federal original source snapshot is missing or changed'],
  ['replacement character', packet => {
    Object.assign(packet.input, { materialProbe: '\ud800' });
    Object.assign(packet.facts.originalFederalSources, { materialProbe: '\ufffd' });
  }, false, 'current private federal original source snapshot is missing or changed'],
  ['array order', packet => {
    Object.assign(packet.input, { materialProbe: ['a', 'b'] });
    Object.assign(packet.facts.originalFederalSources, { materialProbe: ['b', 'a'] });
  }, false, 'current private federal original source snapshot is missing or changed'],
  ['present null', packet => { Object.assign(packet.facts.originalFederalSources, { materialProbe: null }); }, false, 'current private federal original source snapshot is missing or changed'],
  ['same-money business identity', packet => { business(packet).originalBusiness.businessName = 'Changed actual business original'; }, false, 'current actual C original owner or residency does not reconcile'],
  ['nested federal audit', () => {}, true, 'current federal computation differs from source result'],
  ['original before federal', packet => { packet.facts.originalFederalSources.taxpayer = {}; }, true, 'current private federal original source snapshot is missing or changed'],
];
it.each(contradictions)('rejects changed canonical business material in original error order for %s', (_name, change, tamperFederal, message) => {
  const packet = canonicalOhioBusinessFixture();
  change(packet);
  const federal = calculateFederalTax(packet.input);
  if (tamperFederal) required(federal.allLines[0]).formula = 'Changed audit with unchanged monetary totals';
  const before = JSON.stringify({ packet, federal });
  expect(() => calculateOhioCanonicalBusinessSource({ taxInput: packet.input, residencyFacts: packet.facts, federalResult: federal })).toThrow(message);
  expect(JSON.stringify({ packet, federal })).toBe(before);
});

it('retains opaque canonical business commitments and isolated stored projections', () => {
  const packet = canonicalOhioBusinessFixture();
  const context = prepare(packet);
  const read = () => readOhioCanonicalBusinessSource(context, packet.facts, packet.expected.federalAGI);
  const expected = read();
  const returned = read();
  Object.assign(returned.worksheet, { changedReturnedProjection: true });
  expect(read()).toEqual(expected);
  expect(readOhioCanonicalBusinessSource(context, reverseKeys(packet.facts), packet.expected.federalAGI)).toEqual(expected);
  expect(() => readOhioCanonicalBusinessSource({ ...context }, packet.facts, packet.expected.federalAGI)).toThrow('current original context is missing stale or mismatched');
  business(packet).sourceReference += ' changed actual source';
  expect(read).toThrow('current original context is missing stale or mismatched');
});
