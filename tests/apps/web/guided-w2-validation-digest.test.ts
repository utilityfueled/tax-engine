import { beforeEach, expect, it, vi } from 'vitest';
import type * as W2Module from '@/engine/forms/w2-state-local';
import type * as HashModule from '@noble/hashes/sha2.js';
import { buildGuidedW2SourceContext, buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { guidedActualW2Fixture } from '../../fixtures/guided-w2-actual-rows.js';
import { assertW2StateLocalSources, calculateW2StateLocalSources } from '@/engine/forms/w2-state-local';
import { sha256 } from '@noble/hashes/sha2.js';

vi.mock('@/engine/forms/w2-state-local', async (importOriginal) => {
  const actual = await importOriginal<typeof W2Module>();
  return {
    ...actual,
    calculateW2StateLocalSources: vi.fn(actual.calculateW2StateLocalSources),
    assertW2StateLocalSources: vi.fn(actual.assertW2StateLocalSources),
  };
});
vi.mock('@noble/hashes/sha2.js', async (importOriginal) => {
  const actual = await importOriginal<typeof HashModule>();
  return { ...actual, sha256: Object.assign(vi.fn((bytes: Uint8Array) => actual.sha256(bytes)), actual.sha256) };
});

// Spec: spec/federal/w2-state-local.yaml guide-confirmation.
beforeEach(() => vi.clearAllMocks());
it('guided W2 validation preserves exact sources without calculating a discarded digest', () => {
  const { state } = guidedActualW2Fixture();
  const original = structuredClone(state);
  vi.clearAllMocks();
  const result = buildTaxInputFromGuidedData(state);
  expect(result).not.toBeNull();
  expect(state).toEqual(original);
  expect(sha256).not.toHaveBeenCalled();
  expect(calculateW2StateLocalSources).not.toHaveBeenCalled();
  expect(assertW2StateLocalSources).toHaveBeenCalledTimes(1);
  const context = buildGuidedW2SourceContext(state);
  if (!context || !context.w2s[0]?.stateLocalSources) throw Error('Actual fixture source context required');
  const calculated = calculateW2StateLocalSources(context, 0, context.w2s[0].stateLocalSources);
  expect(calculated.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);
  expect(sha256).toHaveBeenCalledTimes(1);
  expect(calculated.federalWages.toString()).toBe('50000');
  expect(calculated.federalWithheld.toString()).toBe('5000');
  expect(calculated.totalStateWithheld.toString()).toBe('2535');
  expect(calculated.totalLocalWithheld.toString()).toBe('3125');
  expect(result?.w2s).toEqual(context.w2s);
  vi.mocked(assertW2StateLocalSources).mockImplementationOnce((input, index, sources) => {
    calculateW2StateLocalSources(input, index, sources);
  });
  expect(buildTaxInputFromGuidedData(state)).toEqual(result);
  expect(state).toEqual(original);
});

it('guided assertion replay preserves calculated validation failures for owner year rows and stale originals', () => {
  const mutations = [
    (f: ReturnType<typeof guidedActualW2Fixture>) => { f.sources.owner.originalTaxpayer.firstName = 'Different actual owner'; },
    (f: ReturnType<typeof guidedActualW2Fixture>) => { f.sources.sourceTaxYear = 2026; },
    (f: ReturnType<typeof guidedActualW2Fixture>) => { f.sources.stateRows[0].wages = ''; },
    (f: ReturnType<typeof guidedActualW2Fixture>) => { f.sources.stateRows[1].printedRow = f.sources.stateRows[0].printedRow; },
    (f: ReturnType<typeof guidedActualW2Fixture>) => { f.sources.localRows[1].printedRow = f.sources.localRows[0].printedRow; },
    (f: ReturnType<typeof guidedActualW2Fixture>) => { f.sources.sourceFactsConfirmed = false; },
    (f: ReturnType<typeof guidedActualW2Fixture>) => { f.sources.sourceReference = ''; },
    (f: ReturnType<typeof guidedActualW2Fixture>) => { f.entry.employerName = 'Changed actual employer'; },
  ];
  for (const mutate of mutations) {
    const f = guidedActualW2Fixture();
    mutate(f);
    const before = structuredClone(f.state);
    const context = buildGuidedW2SourceContext(f.state);
    if (!context || !context.w2s[0]?.stateLocalSources) throw Error('Actual negative source context required');
    const message = (run: () => unknown) => {
      try { run(); } catch (error) { return error instanceof Error ? error.message : 'non-error'; }
      throw Error('Contradictory original unexpectedly admitted');
    };
    expect(message(() => assertW2StateLocalSources(context, 0, context.w2s[0].stateLocalSources)))
      .toBe(message(() => calculateW2StateLocalSources(context, 0, context.w2s[0].stateLocalSources)));
    expect(buildTaxInputFromGuidedData(f.state)).toBeNull();
    expect(f.state).toEqual(before);
  }
});

it('guided W2 validation retains the existing packet-free historical input path', () => {
  const f = guidedActualW2Fixture();
  delete f.entry.stateLocalSources;
  f.entry.stateTaxReporting = 'single';
  const original = structuredClone(f.state);
  vi.clearAllMocks();
  const input = buildTaxInputFromGuidedData(f.state);
  expect(input).not.toBeNull();
  expect(input?.w2s[0]).not.toHaveProperty('stateLocalSources');
  expect(assertW2StateLocalSources).not.toHaveBeenCalled();
  expect(calculateW2StateLocalSources).not.toHaveBeenCalled();
  expect(sha256).not.toHaveBeenCalled();
  expect(f.state).toEqual(original);
});
