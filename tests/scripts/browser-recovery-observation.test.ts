import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'vitest';
import { recoveryBrowserObservation } from '../../scripts/browser-recovery-observation.mjs';
import { readArm64WorkerJobBudget, runArm64SchoolWorkerPair, selectArm64SchoolWindow, workerArguments } from '../../scripts/browser-cpu-diagnostics/arm64-school-worker-pair.mjs';

const sourceSha = 'a'.repeat(40);
const candidateImageId = `sha256:${'b'.repeat(64)}`;
const firstId = `${'1'.repeat(20)}-${'2'.repeat(20)}`;
const secondId = `${'3'.repeat(20)}-${'4'.repeat(20)}`;
const privateText = 'RAW_TEST_INPUT_MUST_STAY_PRIVATE';

test('uses the recorded native job start and rejects stale or late metadata', async () => {
    const started = Date.parse('2026-11-27T19:22:46Z');
    const env = { GITHUB_RUN_ID: '46014076098', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: sourceSha };
    const original = { id: 140634639448, run_id: 46014076098, run_attempt: 2, head_sha: sourceSha,
        name: 'recovery', status: 'in_progress', started_at: new Date(started).toISOString(), completed_at: null };
    const signal = new AbortController().signal;
    const read = (now: number, jobs = [original], total = jobs.length, runEnv = env) => readArm64WorkerJobBudget(runEnv, signal, {
        now: () => now,
        fetchResponse: async (url: string, request: RequestInit) => {
            assert.equal(url, 'https://api.github.com/repos/utilityfueled/tax-engine/actions/runs/46014076098/attempts/2/jobs?per_page=100');
            assert.equal(request.redirect, 'error');
            assert.equal(new Headers(request.headers).has('Authorization'), false);
            return Response.json({ total_count: total, jobs });
        },
    });
    const lastStart = started + 55 * 60_000;
    assert.equal(await read(lastStart), started + 90 * 60_000);
    await assert.rejects(read(lastStart + 1));
    // A marker set six minutes after the GitHub job starts would have admitted this late launch.
    await assert.rejects(read(started + 60 * 60_000));
    await assert.rejects(read(lastStart, [{ ...original, run_attempt: 1 }]));
    await assert.rejects(read(lastStart, [{ ...original, run_id: 46014076099 }]));
    await assert.rejects(read(lastStart, [{ ...original, head_sha: 'e'.repeat(40) }]));
    await assert.rejects(read(lastStart, [{ ...original, name: 'some other job' }]));
    await assert.rejects(read(lastStart, [{ ...original, started_at: new Date(lastStart + 1).toISOString() }]));
    await assert.rejects(read(lastStart, [{ ...original, status: 'completed' }]));
    await assert.rejects(read(lastStart, [original, { ...original, id: original.id + 1 }]));
    await assert.rejects(read(lastStart, [original], 2));
    await assert.rejects(read(lastStart, [original], 1, { ...env, GITHUB_RUN_ATTEMPT: '' }));
    await assert.rejects(readArm64WorkerJobBudget(env, signal, { fetchResponse: async () => new Response(null, { status: 503 }) }));
});

test('binds the worker comparison to the original audited school window', () => {
    const school = 'oh-school-district-part-year-native.spec.ts';
    const other = 'another-window-case.spec.ts';
    const rows = Array.from({ length: 131 }, (_, i) => ({
        id: `${i.toString(16).padStart(20, '0')}-${'1'.repeat(20)}`,
        file: i === 0 ? school : other,
        timeout: 30000,
        expectedStatus: 'passed',
    }));
    const audit = { files: { [school]: {}, [other]: { bodyTimeoutMs: 180000 } } };
    const batch = { rows, bounds: { 'filled-return': 4 } };
    const cases = rows.map((row, i) => ({ id: row.id, deadlineMs: i === 0 ? 30000 : 180000,
        status: i === 0 ? 'timedOut' : 'passed', failureClue: i === 0 ? { category: 'timeout' } : undefined }));
    const summary = { status: 'FAIL', cleanup: true, batchesCompleted: 8, caseCount: 138, failed: 1, skipped: 0 };
    const observation = { summary, batches: [...Array.from({ length: 7 }, (_, i) => ({ batch: i + 1, cases: [] })), { batch: 8, cases }] };
    const batches = [...Array.from({ length: 7 }, () => ({ rows: [{}], bounds: {} })), batch];
    const digest = createHash('sha256').update(cases.map(row => `${row.id}:${row.deadlineMs}\n`).join('')).digest('hex');
    assert.equal(selectArm64SchoolWindow(observation, batches, audit, digest), batch);
    assert.throws(() => selectArm64SchoolWindow(observation, batches, audit));
    assert.throws(() => selectArm64SchoolWindow({ ...observation, summary: { ...summary, cleanup: false } }, batches, audit, digest));
    assert.throws(() => selectArm64SchoolWindow(observation, batches, { files: { [school]: {}, [other]: {} } }, digest));
    assert.throws(() => selectArm64SchoolWindow(observation, [...batches.slice(0, 7), { ...batch, rows: rows.slice(1) }], audit, digest));
    assert.throws(() => selectArm64SchoolWindow(observation, [...batches.slice(0, 7), { ...batch, rows: [{ ...rows[0], id: secondId }, ...rows.slice(1)] }], audit, digest));
});

test('reconciles both worker legs after separate natural windows with unchanged case limits', async () => {
    const file = 'oh-school-district-part-year-native.spec.ts';
    const name = 'synthetic phase case';
    const row = { key: JSON.stringify(['chromium', file, [name]]), file, id: firstId, timeout: 30000, expectedStatus: 'passed' };
    const audit = { files: { [file]: { bodyTimeoutMs: 180000 } } };
    assert.deepEqual(workerArguments(1, '/tmp/list').slice(2), workerArguments(2, '/tmp/list').slice(2));
    assert.throws(() => workerArguments(3, '/tmp/list'));

    let clock = 0;
    const executions: number[][] = [];
    const run = (workers: number, reportedWorkers = workers) => {
        executions.push([workers, clock]);
        clock += 290;
        return { exit: 0, report: { config: { workers: reportedWorkers, projects: [{ retries: 0, repeatEach: 1 }] }, errors: [],
            suites: [{ title: file, specs: [{ file, title: name, id: firstId, tests: [{ projectName: 'chromium',
                timeout: 180000, expectedStatus: 'passed', results: [{ status: 'passed', duration: 290, retry: 0,
                    stdout: [{ text: privateText }] }] }] }] }] } };
    };
    const io = { now: () => ({ mono: clock, wall: clock }), sleep: (ms: number) => { clock += ms; },
        identity: () => {}, alive: () => true, cleanup: () => true, run };
    const batch = { rows: [row], bounds: { 'filled-return': 0 } };
    const legs = await runArm64SchoolWorkerPair(batch, audit, io);
    assert.deepEqual(executions, [[2, 61000], [1, 122290]]);
    assert.deepEqual(legs.map(leg => [leg.workers, leg.cases[0].deadlineMs]), [[2, 180000], [1, 180000]]);
    assert.equal(JSON.stringify(legs).includes(privateText), false);
    await assert.rejects(runArm64SchoolWorkerPair(batch, audit, { ...io, run: (workers: number) => run(workers, 2) }), /Incomplete/);
    await assert.rejects(runArm64SchoolWorkerPair(batch, audit, { ...io, cleanup: () => false }), /Incomplete/);
});

async function fixture(t: TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), 'recovery-browser-observation-'));
  t.onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value));
  const saveBoundReceipt = async (receipt: unknown) => {
    await save('batch-1-receipt.json', receipt);
    await save('batch-1-identity.json', {
      batch: 1, sourceSha, candidateImageId,
      receiptSha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),
    });
  };
  const row = (id: string, status: string) => ({
    id, timeout: 30000, file: privateText, titles: [privateText],
    results: [{
      status, retry: 0, duration: status === 'timedOut' ? 30007 : 110,
      stdout: [privateText], stderr: [privateText], attachments: [privateText],
      errors: [{ message: privateText, stack: privateText }],
    }],
  });
  const receipt = {
    batch: 1, start: { wall: 127000, mono: 9.2 }, close: { wall: 160000, mono: 33009.9 },
    result: { failed: 1, skipped: 0, rows: [row(firstId, 'passed'), row(secondId, 'timedOut')] },
  };
  const summary = { status: 'FAIL', cleanup: true, batchesCompleted: 1, caseCount: 2, failed: 1, skipped: 0, error: privateText };
  await save('source-build.json', {
    externalImageId: candidateImageId,
    externalProof: ['c'.repeat(64), candidateImageId, 'true', sourceSha],
    source: { hiddenSource: privateText },
  });
  await save('summary.json', summary);
  await saveBoundReceipt(receipt);
  const read = (overrides: { sourceSha?: string; candidateImageId?: string; expectedContainerId?: string } = {}) =>
    recoveryBrowserObservation({ directory, sourceSha, candidateImageId, ...overrides });
  return { read, save, saveBoundReceipt, summary, receipt, directory };
}

test('projects bound case timing without copying Playwright payloads', async t => {
  const { read, summary } = await fixture(t);
  const report = await read();
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(privateText), false);
  assert.equal(serialized.includes('127000'), false);
  assert.equal(report.qualification, 'DIAGNOSTIC_ONLY');
  assert.equal(report.sourceSha, sourceSha);
  assert.equal(report.candidateImageId, candidateImageId);
  assert.equal(report.summarySha256, createHash('sha256').update(JSON.stringify(summary)).digest('hex'));
  assert.equal(report.summary.status, 'FAIL');
  assert.equal(report.batches[0].durationMs, 33001);
  assert.deepEqual(report.batches[0].cases, [
    { id: firstId, status: 'passed', durationMs: 110, retry: 0, failureCategory: null, deadlineMs: 30000 },
    { id: secondId, status: 'timedOut', durationMs: 30007, retry: 0, failureCategory: 'timeout', failureClue: { category: 'timeout', location: null }, deadlineMs: 30000 },
  ]);
});

test('retains fixed school phases in a bound native recovery receipt', async t => {
  const { read, saveBoundReceipt, receipt } = await fixture(t);
  const [ordinary, school] = receipt.result.rows;
  const markedSchool = {
    ...school, file: 'oh-school-district-part-year-native.spec.ts', results: [{
      ...school.results[0], stdout: [
        { text: 'OH_SCHOOL_PY_PHASE school-entry begin 0\n' },
        { text: `ignored ${privateText}\n` },
        { text: 'OH_SCHOOL_PY_PHASE school-entry end 3480\n' },
        { text: 'OH_SCHOOL_PY_PHASE school-first-confirmation begin 0\n' },
      ],
    }],
  };
  await saveBoundReceipt({ ...receipt, result: { ...receipt.result, rows: [ordinary, markedSchool] } });
  const report = await read();
  assert.deepEqual(report.summary, { status: 'FAIL', cleanup: true, batchesCompleted: 1, caseCount: 2, failed: 1, skipped: 0 });
  assert.equal('schoolPhases' in report.batches[0].cases[0], false);
  assert.deepEqual(report.batches[0].cases[1].schoolPhases, {
    'school-entry': { status: 'completed', durationMs: 3480 },
    'school-first-confirmation': { status: 'started' },
    'header-entry': { status: 'unavailable' },
    'header-first-confirmation': { status: 'unavailable' },
    'review-download': { status: 'unavailable' },
  });
  assert.equal(JSON.stringify(report).includes(privateText), false);
});

test('rejects stale and incomplete receipts while preserving a reconciled partial failure', async t => {
  const { read, save, saveBoundReceipt, summary, receipt } = await fixture(t);
  await assert.rejects(read({ sourceSha: 'd'.repeat(40) }), /source or image/);
  await assert.rejects(read({ candidateImageId: `sha256:${'d'.repeat(64)}` }), /source or image/);
  await assert.rejects(read({ expectedContainerId: 'd'.repeat(64) }), /source or image/);
  await save('summary.json', { ...summary, batchesCompleted: 2 });
  await assert.rejects(read());
  await save('summary.json', { ...summary, caseCount: 3 });
  await assert.rejects(read(), /case counts/);
  await save('summary.json', summary);
  await saveBoundReceipt({ ...receipt, result: { ...receipt.result, rows: [receipt.result.rows[0], { ...receipt.result.rows[1], id: firstId }] } });
  await assert.rejects(read(), /duplicate recovery case/i);
  await saveBoundReceipt({ ...receipt, result: { ...receipt.result, rows: receipt.result.rows.map(row => ({ ...row, id: [firstId] })) } });
  await assert.rejects(read(), /case identifier/);
  await saveBoundReceipt({ ...receipt, result: { ...receipt.result, rows: receipt.result.rows.map(row => ({ ...row, results: { 0: row.results[0], length: 1 } })) } });
  await assert.rejects(read(), /case results/);
  await saveBoundReceipt(receipt);
  const report = await read({ expectedContainerId: 'c'.repeat(64) });
  assert.equal(report.summary.batchesCompleted, 1);
  assert.equal(report.summary.failed, 1);
});

test('requires a matching post-batch identity confirmation for every receipt', async t => {
  const { directory, read, save, saveBoundReceipt, receipt } = await fixture(t);
  await unlink(path.join(directory, 'batch-1-identity.json'));
  await assert.rejects(read(), /batch-1-identity/);
  await saveBoundReceipt(receipt);
  await save('batch-1-receipt.json', { ...receipt, close: { ...receipt.close, mono: 33010 } });
  await assert.rejects(read(), /batch identity/);
  await saveBoundReceipt(receipt);
  await save('batch-1-identity.json', {
    batch: 1, sourceSha, candidateImageId: `sha256:${'d'.repeat(64)}`,
    receiptSha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),
  });
  await assert.rejects(read(), /batch identity/);
  await saveBoundReceipt(receipt);
  assert.equal((await read()).summary.status, 'FAIL');
});
