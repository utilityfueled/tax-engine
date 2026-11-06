import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, summarizeProfile, withProfile, validateInventory, publicChunkMetadata } from '../../scripts/browser-cpu-diagnostics/profile.mjs';
import { diagnosticOutcome, rewriteImport, selectCases, verifyOverlayCollection } from '../../scripts/browser-cpu-diagnostics/selection.mjs';

const origin = 'http://127.0.0.1:3109';
const chunk = '/_next/static/chunks/1234-abcdef.js';
const chunkHash = 'a'.repeat(64);
const inventory = { [chunk]: { sha256: chunkHash, bytes: 1200 } };
const realManifest = JSON.parse(readFileSync(new URL('../../scripts/browser-cpu-diagnostics/cases.json', import.meta.url), 'utf8'));
const fullCases = [...realManifest.targets, ...Array.from({ length: 578 }, (_, i) => ({ id: `unit-${i}`, file: 'independent-collection.spec.ts', titles: [`literal case ${i}`], project: 'chromium', timeout: 30000, expectedStatus: i < 5 ? 'skipped' : 'passed' }))];
const fullDigest = createHash('sha256').update(JSON.stringify([...fullCases].sort((a,b) => a.id.localeCompare(b.id)))).digest('hex');
const manifest = { ...realManifest, fullCases, fullCollectionSha256: fullDigest };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const frame = (id: number, functionName: string, url = '', children: number[] = []) => ({ id, callFrame: { functionName, url, scriptId: `${id}`, lineNumber: url ? 3 : -1, columnNumber: url ? 17 : -1 }, children });
const profile = () => ({ startTime: 10000, endTime: 18000, nodes: [frame(1, '(root)', '', [2, 3, 4, 5, 6]), frame(2, '(idle)'), frame(3, 'private_name_MUST_NOT_ESCAPE', `${origin}${chunk}`), frame(4, '(program)'), frame(5, '(garbage collector)'), frame(6, 'unknown')], samples: [3, 3, 2, 4, 5], timeDeltas: [1000, 2000, 1000, 500, 1500] });
const options = () => ({ origin, inventory });
const fakeSession = (raw = profile()) => ({ send: vi.fn(async (method: string) => method === 'Profiler.stop' ? { profile: raw } : {}), detach: vi.fn(async () => {}) });
const collect = (session = fakeSession()) => {
  const save = vi.fn(async (_record: unknown) => {});
  const use = vi.fn(async () => {});
  return { session, save, use, args: { enabled: true, origin, inventory, createSession: vi.fn(async () => session), use, save } };
};
afterEach(() => vi.useRealTimers());

describe('Optional-Browser-CPU-Diagnostics', () => {
  it('remains inert unless explicitly enabled', async () => {
    for (const enabled of [undefined, false, 'true', 1]) {
      const c = collect(); await withProfile({ ...c.args, enabled });
      expect(c.args.createSession).not.toHaveBeenCalled(); expect(c.save).not.toHaveBeenCalled(); expect(c.use).toHaveBeenCalledTimes(1);
    }
  });
  it('accounts sampling wall weights and idle separately', () => {
    const result = summarizeProfile(profile(), options());
    expect(result.status).toBe('available');
    expect(result.timing).toEqual({ kind: 'sampling-wall-intervals-not-process-cpu', profileSpanUs: 8000, sampledIntervalUs: 6000, unsampledTailUs: 2000 });
    expect(result.categories).toEqual({ publicJavaScript: { samples: 2, intervalWeightUs: 3000 }, idle: { samples: 1, intervalWeightUs: 1000 }, program: { samples: 1, intervalWeightUs: 500 }, garbageCollector: { samples: 1, intervalWeightUs: 1500 }, other: { samples: 0, intervalWeightUs: 0 } });
    expect(result.locations).toEqual([{ sha256: chunkHash, line: 4, column: 18, samples: 2, intervalWeightUs: 3000 }]);
    expect(result.samples).toEqual([3, 3, 2, 4, 5]); expect(result.timeDeltas).toEqual([1000, 2000, 1000, 500, 1500]);
    expect(JSON.stringify(result)).not.toMatch(/private_name|scriptId|functionName|startTime|endTime|cpuTime|exactCpu|_next|http:/);
  });
  it('drops private frames and maps only pinned public code', () => {
    const forbidden = [`https://example.test${chunk}`, `${origin}${chunk}?workspace=private`, `${origin}${chunk}#private`, 'data:text/javascript,private', 'blob:http://127.0.0.1:3109/private', `${origin}/returns/private-id`, 'http://user:secret@127.0.0.1:3109'+chunk, `${origin}/_next/static/chunks/not-in-inventory.js`];
    for (const url of forbidden) {
      const raw = profile(); raw.nodes[2].callFrame.url = url;
      Object.assign(raw.nodes[2], { deoptReason: 'secret', positionTicks: [{ name: 'secret' }] });
      const result = summarizeProfile(raw, options());
      expect(result.status).toBe('available'); expect(result.categories.other).toEqual({ samples: 2, intervalWeightUs: 3000 }); expect(result.locations).toEqual([]);
      expect(JSON.stringify(result)).not.toMatch(/private|secret|workspace|example|not-in-inventory|deoptReason|positionTicks/);
    }
  });
  it('refuses corrupt or absent sample evidence instead of reporting zero activity', () => {
    for (const mutate of [
      (p: ReturnType<typeof profile>) => { p.samples = [999]; p.timeDeltas = [1000]; },
      (p: ReturnType<typeof profile>) => { p.timeDeltas = [1]; },
      (p: ReturnType<typeof profile>) => { p.timeDeltas[0] = -1; },
      (p: ReturnType<typeof profile>) => { p.endTime = 9000; },
      (p: ReturnType<typeof profile>) => { p.timeDeltas[0] = 9000; },
      (p: ReturnType<typeof profile>) => { p.nodes[2].id = 2; },
      (p: ReturnType<typeof profile>) => { p.nodes[2].children = [1]; },
      (p: ReturnType<typeof profile>) => { p.nodes[0].children.push(999); },
    ]) { const raw = profile(); mutate(raw); expect(summarizeProfile(raw, options())).toEqual({ version: 1, qualification: 'NONQUALIFYING_DIAGNOSTIC', status: 'unavailable', code: 'invalid-profile' }); }
    expect(summarizeProfile({ ...profile(), samples: undefined }, options()).status).toBe('unavailable');
  });
  it('rejects finite profile bounds before serialization and never persists raw nodes', () => {
    expect(summarizeProfile({ ...profile(), samples: new Array(LIMITS.samples + 1).fill(3), timeDeltas: new Array(LIMITS.samples + 1).fill(1) }, options()).code).toBe('profile-limit');
    expect(summarizeProfile({ ...profile(), nodes: new Array(LIMITS.nodes + 1).fill(profile().nodes[0]) }, options()).code).toBe('profile-limit');
    const raw = profile(); raw.nodes[2].callFrame.functionName = 'SECRET'.repeat(LIMITS.bytes);
    expect(summarizeProfile(raw, options()).code).toBe('profile-limit');
  });
  it('bounds collection and always detaches without replacing a test failure', async () => {
    const c = collect(); const bodyFailure = new Error('original assertion failure'); c.use.mockRejectedValueOnce(bodyFailure);
    await expect(withProfile(c.args)).rejects.toBe(bodyFailure);
    expect(c.session.send.mock.calls.map(c => c[0])).toEqual(['Profiler.enable', 'Profiler.setSamplingInterval', 'Profiler.start', 'Profiler.stop', 'Profiler.disable']);
    expect(c.session.send).toHaveBeenCalledWith('Profiler.setSamplingInterval', { interval: 1000 });
    expect(c.session.detach).toHaveBeenCalledTimes(1); expect(c.save).toHaveBeenCalledTimes(1);
    expect(c.save.mock.calls[0][0]).toMatchObject({ status: 'available' });
  });
  it('records fixed unavailability and runs the body when CDP is unsupported', async () => {
    const c = collect(); c.args.createSession.mockRejectedValueOnce(new Error('secret-credential-address'));
    await withProfile(c.args);
    expect(c.use).toHaveBeenCalledTimes(1); expect(c.save).toHaveBeenCalledWith({ version: 1, qualification: 'NONQUALIFYING_DIAGNOSTIC', status: 'unavailable', code: 'profiler-unavailable' });
  });
  it('detaches a session that arrives after the bounded setup deadline', async () => {
    vi.useFakeTimers(); const c = collect();
    c.args.createSession.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(c.session), 1500)));
    const running = withProfile(c.args); await vi.advanceTimersByTimeAsync(1001); await running; await vi.advanceTimersByTimeAsync(500);
    expect(c.use).toHaveBeenCalledTimes(1); expect(c.session.detach).toHaveBeenCalledTimes(1); expect(c.session.send).not.toHaveBeenCalled();
    expect(c.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'profiler-unavailable' }));
  });
  it('bounds an unresponsive stop and still disables and detaches', async () => {
    vi.useFakeTimers(); const c = collect();
    c.session.send.mockImplementation(async method => method === 'Profiler.stop' ? new Promise(() => {}) : {});
    const running = withProfile(c.args); await vi.advanceTimersByTimeAsync(1001); await running;
    expect(c.session.detach).toHaveBeenCalledTimes(1); expect(c.session.send).toHaveBeenCalledWith('Profiler.disable');
    expect(c.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'profiler-unavailable' }));
  });
  it('stops at the finite recording cap without cancelling or extending the body', async () => {
    vi.useFakeTimers(); const c = collect(); let finish: () => void = () => {}; c.use.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const running = withProfile(c.args); await vi.advanceTimersByTimeAsync(30001);
    expect(c.session.send).toHaveBeenCalledWith('Profiler.stop'); expect(c.session.detach).toHaveBeenCalledTimes(1); expect(c.save).not.toHaveBeenCalled();
    finish(); await running; expect(c.save).toHaveBeenCalledTimes(1); expect(c.session.send.mock.calls.filter(c => c[0] === 'Profiler.stop')).toHaveLength(1);
  });
  it('does not contact arbitrary origins or save exception text', async () => {
    const c = collect(); await withProfile({ ...c.args, origin: 'https://customer.example/secret' });
    expect(c.args.createSession).not.toHaveBeenCalled(); expect(c.use).toHaveBeenCalledTimes(1);
    expect(c.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid-target' }));
  });
  it('rejects changed identity selection deadline or audit', () => {
    expect(selectCases(manifest.fullCases, manifest, manifest.auditSha256)).toEqual(manifest.targets);
    for (const mutate of [
      (rows: typeof manifest.fullCases) => { rows[0].id += 'x'; },
      (rows: typeof manifest.fullCases) => { rows[0].titles[0] += 'changed'; },
      (rows: typeof manifest.fullCases) => { rows[0].timeout += 1; },
      (rows: typeof manifest.fullCases) => { rows.push(rows[0]); },
      (rows: typeof manifest.fullCases) => { rows.pop(); },
    ]) { const rows = structuredClone(manifest.fullCases); mutate(rows); expect(() => selectCases(rows, manifest, manifest.auditSha256)).toThrow(); }
    expect(() => selectCases(manifest.fullCases, manifest, 'b'.repeat(64))).toThrow();
    expect(() => selectCases(manifest.fullCases, { ...manifest, targets: manifest.targets.slice(1) }, manifest.auditSha256)).toThrow();
  });
  it('permits only the pinned import-only overlay', () => {
    const original = "import { test, expect, type Page } from '@playwright/test';\nconst fact = '100.01';\ntest('unchanged', async ({page}) => { await page.fill('#actual', fact); expect(fact).toBe('100.01'); });\n";
    const expected = original.replace("'@playwright/test'", "'../scripts/browser-cpu-diagnostics/fixture'");
    expect(rewriteImport(original, sha(original))).toBe(expected);
    expect(() => rewriteImport(original, '0'.repeat(64))).toThrow();
    expect(() => rewriteImport(original + "import * as second from '@playwright/test';", sha(original + "import * as second from '@playwright/test';"))).toThrow();
    const rows = structuredClone(manifest.fullCases); rows[0].id += 'different'; expect(() => verifyOverlayCollection(manifest.fullCases, rows)).toThrow();
  });
  it('keeps original failure separate from diagnostic outcome', () => {
    const result = diagnosticOutcome(manifest.originalOutcome, { failed: 0, cases: 14, unavailable: 2 });
    expect(result).toEqual({ qualification: 'NONQUALIFYING_DIAGNOSTIC', originalQualification: { passed: 573, failed: 14, skipped: 5 }, diagnostic: { failed: 0, cases: 14, unavailable: 2 }, originalFailureSuperseded: false });
  });
});

import { admission, projectCaseResults, main } from '../../scripts/browser-cpu-diagnostics/runner.mjs';
import { environment, planBatches, exactUnion } from '../../scripts/run-browser-tests.mjs';

describe('Optional-Browser-CPU-Diagnostics CI boundary', () => {
  it('requires original failure and the exact Linux job-owned runtime before diagnostic work', async () => {
    const env = { TAX_BROWSER_CPU_DIAGNOSTICS: '1', TAX_BROWSER_CPU_ORIGINAL_OUTCOME: 'failure', GITHUB_ACTIONS: 'true', GITHUB_SHA: 'a'.repeat(40), CANDIDATE_IMAGE_ID: 'sha256:'+'b'.repeat(64), PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3109' };
    expect(admission(env, 'linux')).toBe(true);
    for (const change of [{ GITHUB_ACTIONS: 'false' }, { TAX_BROWSER_CPU_ORIGINAL_OUTCOME: 'success' }, { CANDIDATE_IMAGE_ID: 'unknown' }, { PLAYWRIGHT_BASE_URL: 'http://example.test' }, { GITHUB_SHA: '' }]) expect(() => admission({ ...env, ...change }, 'linux')).toThrow();
    expect(() => admission(env, 'darwin')).toThrow();
    expect(admission({}, 'darwin')).toBe(false);
    await expect(main({ env: {}, root: '/this-path-must-never-be-read' })).resolves.toBe(0);
  });
  it('projects outcomes without error messages attachments or test-local data', () => {
    const row = { id: realManifest.targets[0].id, results: [{ status: 'timedOut', duration: 30001, retry: 0, error: { message: 'secret' }, attachments: [{ path: '/private/secret.pdf' }], stdout: ['secret'] }] };
    expect(projectCaseResults([row])).toEqual([{ id: row.id, status: 'timedOut', durationMs: 30001, retry: 0 }]);
    expect(() => projectCaseResults([{ ...row, results: [{ status: 'passed', retry: 1, duration: 1 }] }])).toThrow();
  });
  it('keeps the existing qualification environment profiler inert', () => {
    const env = environment({ TAX_BROWSER_CPU_DIAGNOSTICS: '1', TAX_BROWSER_CPU_OUTPUT: '/private', OPENAI_API_KEY: 'secret', DATABASE_URL: 'secret' });
    expect(env).not.toHaveProperty('TAX_BROWSER_CPU_DIAGNOSTICS'); expect(JSON.stringify(env)).not.toMatch(/secret|\/private/);
    for (const [file, expected] of Object.entries(realManifest.targetSourceSha256)) {
      const current = readFileSync(new URL(`../../apps/web/tests/${file}`, import.meta.url), 'utf8');
      const restored = current.replace('../scripts/browser-cpu-diagnostics/fixture', '@playwright/test');
      expect(sha(restored)).toBe(expected);
    }
  });
});

import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inventoryPublicChunks } from '../../scripts/browser-cpu-diagnostics/image-public-chunks.mjs';
describe('Optional-Browser-CPU-Diagnostics accepted bounds', () => {
  it('rejects an overlong accepted span rather than cropping a late response', () => {
    const raw = profile(); raw.endTime = raw.startTime + 30000001;
    expect(summarizeProfile(raw, options()).code).toBe('profile-limit');
  });
  it('inventories only bounded public JavaScript bytes and rejects symlink escapes', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cpu-public-chunks-test-'));
    try {
      mkdirSync(path.join(dir, 'chunks')); writeFileSync(path.join(dir, 'chunks/a.js'), 'synthetic public JS'); writeFileSync(path.join(dir, 'chunks/a.js.map'), 'private source map ignored');
      expect(inventoryPublicChunks(dir)).toEqual({ '/_next/static/chunks/a.js': { sha256: sha('synthetic public JS'), bytes: 19 } });
      symlinkSync(path.join(dir, 'chunks/a.js'), path.join(dir, 'chunks/leak.js'));
      expect(() => inventoryPublicChunks(dir)).toThrow('public-inventory-unavailable');
      rmSync(path.join(dir, 'chunks/leak.js')); writeFileSync(path.join(dir, 'chunks/private?query.js'), 'no');
      expect(() => inventoryPublicChunks(dir)).toThrow('public-inventory-unavailable');
      rmSync(path.join(dir, 'chunks/private?query.js')); truncateSync(path.join(dir, 'chunks/a.js'), 32 * 1024 * 1024 + 1);
      expect(() => inventoryPublicChunks(dir)).toThrow('public-inventory-unavailable');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { command } from '../../scripts/browser-cpu-diagnostics/runner.mjs';
it('settles an unresponsive owned child without waiting indefinitely for close', async () => {
  vi.useFakeTimers();
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(), unref: vi.fn() });
  let settled = false;
  const pending = command('owned-fake-node', [], { cwd: '/', env: {}, signal: new AbortController().signal, timeout: 1000, spawnChild: () => child }).catch(() => { settled = true; });
  try { await vi.advanceTimersByTimeAsync(3501); expect(settled).toBe(true); expect(child.kill).toHaveBeenCalledWith('SIGTERM'); expect(child.kill).toHaveBeenCalledWith('SIGKILL'); }
  finally { child.emit('close', null, 'SIGKILL'); await pending; }
});

import { sanitizeStoredRecord } from '../../scripts/browser-cpu-diagnostics/profile.mjs';
it('rejects private additions in transient records before the upload projection', () => {
  const good = summarizeProfile(profile(), options());
  expect(sanitizeStoredRecord(good, options())).toEqual(good);
  const altered = structuredClone(good); Object.assign(altered.nodes[2], { functionName: 'private' });
  expect(sanitizeStoredRecord(altered, options())).toEqual({ version: 1, qualification: 'NONQUALIFYING_DIAGNOSTIC', status: 'unavailable', code: 'invalid-artifact' });
  expect(sanitizeStoredRecord({ status: 'unavailable', error: 'secret' }, options()).code).toBe('invalid-artifact');
});

it('keeps prototype-like native names and unsafe source coordinates in other', () => {
  for (const name of ['constructor', 'toString', '__proto__']) {
    const raw = profile(); raw.nodes[2].callFrame.url = ''; raw.nodes[2].callFrame.functionName = name;
    const result = summarizeProfile(raw, options());
    expect(result.status).toBe('available'); expect(result.categories.other).toEqual({ samples: 2, intervalWeightUs: 3000 });
    expect(JSON.stringify(result)).not.toContain(name);
  }
  const raw = profile(); raw.nodes[2].callFrame.lineNumber = Number.MAX_SAFE_INTEGER;
  expect(summarizeProfile(raw, options()).categories.other.samples).toBe(2);
});

it('preserves validated scheduler row keys through exact selected batches', () => {
  const actualRows = manifest.fullCases.map((row: typeof realManifest.targets[number]) => ({ ...row, key: JSON.stringify([row.project, row.file, row.titles]), results: [] }));
  const selected = selectCases(actualRows, manifest, manifest.auditSha256);
  expect(selected[0].key).toBe(actualRows[0].key);
  const audit = JSON.parse(readFileSync(new URL('../../scripts/browser-request-budgets.json', import.meta.url), 'utf8'));
  const batches = planBatches(selected, audit);
  expect(() => exactUnion(batches.map(b => b.rows), selected)).not.toThrow();
  expect(batches.flatMap(b => b.rows).map(r => r.id)).toEqual(manifest.targets.map(r => r.id));
});

// Spec: Optional-Browser-CPU-Diagnostics public-code-only.
it('rejects extra or non-data inventory fields without invoking accessors', () => {
  let calls = 0;
  const value = () => ({ sha256: chunkHash, bytes: 1200 });
  const extra = { ...value(), privateField: 'must-never-persist' };
  const inherited = Object.assign(Object.create({ privateField: 'must-never-persist' }), value());
  const hidden = Object.defineProperty(value(), 'privateField', { value: 'must-never-persist' });
  const accessor = Object.defineProperty(value(), 'sha256', { enumerable: true, get: () => { calls++; return chunkHash; } });
  const symbol = Object.assign(value(), { [Symbol('private')]: 'must-never-persist' });
  const polluted = JSON.parse('{"sha256":"' + chunkHash + '","bytes":1200,"__proto__":{"private":true}}');
  const coercedHash = { sha256: { privateField: 'must-never-persist', toString: () => { calls++; return chunkHash; } }, bytes: 1200 };
  const arrayHash = { sha256: [chunkHash], bytes: 1200 };
  for (const entry of [extra, inherited, hidden, accessor, symbol, polluted, coercedHash, arrayHash]) {
    expect(() => validateInventory({ [chunk]: entry })).toThrow('invalid-inventory');
    expect(() => publicChunkMetadata({ [chunk]: entry })).toThrow('invalid-inventory');
  }
  const inheritedInventory = Object.create({ [chunk]: value() });
  const accessedInventory = Object.defineProperty({}, chunk, { enumerable: true, get: () => { calls++; return value(); } });
  const hiddenInventory = Object.defineProperty({}, chunk, { value: value() });
  for (const records of [inheritedInventory, accessedInventory, hiddenInventory]) expect(() => validateInventory(records)).toThrow('invalid-inventory');
  expect(calls).toBe(0);
  expect(() => validateInventory({ [chunk]: value() })).not.toThrow();
  expect(publicChunkMetadata({ [chunk]: value() })).toEqual([{ sha256: chunkHash, bytes: 1200 }]);
});
