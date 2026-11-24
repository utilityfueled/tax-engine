import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'vitest';
import { recoveryBrowserObservation } from '../../scripts/browser-recovery-observation.mjs';

const sourceSha = 'a'.repeat(40);
const candidateImageId = `sha256:${'b'.repeat(64)}`;
const firstId = `${'1'.repeat(20)}-${'2'.repeat(20)}`;
const secondId = `${'3'.repeat(20)}-${'4'.repeat(20)}`;
const privateText = 'RAW_TEST_INPUT_MUST_STAY_PRIVATE';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), 'recovery-browser-observation-'));
  t.onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value));
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
  await save('batch-1-receipt.json', receipt);
  const read = (overrides: { sourceSha?: string; candidateImageId?: string } = {}) =>
    recoveryBrowserObservation({ directory, sourceSha, candidateImageId, ...overrides });
  return { read, save, summary, receipt };
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

test('rejects stale and incomplete receipts while preserving a reconciled partial failure', async t => {
  const { read, save, summary, receipt } = await fixture(t);
  await assert.rejects(read({ sourceSha: 'd'.repeat(40) }), /source or image/);
  await assert.rejects(read({ candidateImageId: `sha256:${'d'.repeat(64)}` }), /source or image/);
  await save('summary.json', { ...summary, batchesCompleted: 2 });
  await assert.rejects(read());
  await save('summary.json', { ...summary, caseCount: 3 });
  await assert.rejects(read(), /case counts/);
  await save('summary.json', summary);
  await save('batch-1-receipt.json', { ...receipt, result: { ...receipt.result, rows: [receipt.result.rows[0], { ...receipt.result.rows[1], id: firstId }] } });
  await assert.rejects(read(), /duplicate recovery case/i);
  await save('batch-1-receipt.json', { ...receipt, result: { ...receipt.result, rows: receipt.result.rows.map(row => ({ ...row, id: [firstId] })) } });
  await assert.rejects(read(), /case identifier/);
  await save('batch-1-receipt.json', { ...receipt, result: { ...receipt.result, rows: receipt.result.rows.map(row => ({ ...row, results: { 0: row.results[0], length: 1 } })) } });
  await assert.rejects(read(), /case results/);
  await save('batch-1-receipt.json', receipt);
  const report = await read();
  assert.equal(report.summary.batchesCompleted, 1);
  assert.equal(report.summary.failed, 1);
});
