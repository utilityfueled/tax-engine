import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { validateProjection, diagnose } from '../../scripts/sqlite-exported-package-abi.mjs';
const spec = 'spec/federal/sqlite-exported-package-abi.yaml'; void spec;
const sha = 'a'.repeat(64), buildId = '12'.repeat(20);
test('bounds complete expanded metadata before tar parsing', () => {
  const parser = fileURLToPath(new URL('./sqlite-exported-package-abi-parser.py', import.meta.url));
  const out = spawnSync('python3', ['-I', '-B', parser, 'Controls.test_oversized_internal_pax_record_rejected_before_parsing'], { timeout: 5000, killSignal: 'SIGTERM', maxBuffer: 65536, encoding: 'utf8' });
  assert.equal(out.error, undefined); assert.equal(out.signal, null); assert.equal(out.status, 0, out.stderr);
});
const one = version => ({ version, architecture: 'amd64', libraryPackage: 'libsqlite3-0', debugPackage: 'libsqlite3-0-dbgsym', library: 'usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6', debug: `usr/lib/debug/.build-id/${buildId.slice(0,2)}/${buildId.slice(2)}.debug`, buildId, debugBuildId: buildId, debuglinkCrcMatches: true, debugInfoBytes: 12, debugAbbrevBytes: 4, alternateDebugInfoRequired: false, soname: ['libsqlite3.so.0'], needed: ['libm.so.6', 'libc.so.6'], librarySha256: sha, debugSha256: sha });
const projection = () => ({ source: 'b'.repeat(40), originalQualificationPassed: false, baseline: one('3.40.1-2+deb12u2'), candidate: one('3.40.1-2+deb12u2+vivalatax1') });
test('requires corresponding debug information and exact package identity', () => {
  assert.equal(validateProjection(projection(), 'b'.repeat(40)), true);
  for (const patch of [{ debugBuildId: 'ff'.repeat(20) }, { debuglinkCrcMatches: false }, { debugInfoBytes: 0 }, { debugAbbrevBytes: 0 }, { alternateDebugInfoRequired: true }, { architecture: 'arm64' }, { libraryPackage: 'foreign' }, { soname: ['foreign.so'] }, { needed: ['libc.so.6'] }, { debug: '../foreign' }]) {
    const value = projection(); Object.assign(value.candidate, patch); assert.throws(() => validateProjection(value, value.source));
  }
});
const config = { archive: '/input/actual.zip', archiveSha256: sha, source: 'b'.repeat(40), work: '/owned/new', deadlineMs: 300000 };
test('requires all bounded unsuppressed commands and retains failure', async () => {
  const seen = [];
  const run = async (step, exe, args, timeout) => { seen.push({ step, exe, args, timeout }); return step === 'stage' ? JSON.stringify(projection()) : step === 'tool-packages' ? 'abigail-tools\t2.2-2\tamd64\nbinutils\t2.40-2\tamd64\n' : step === 'tool-binary-hashes' ? args.map(path => sha+'  '+path+'\n').join('') : ''; };
  const result = await diagnose(config, { run, now: () => 0 });
  assert.equal(result.passed, true); assert.equal(result.genericAbiApproval, false); assert.equal(result.candidateReleaseQualified, false);
  const abi = seen.find(row => row.step === 'abidiff');
  assert.deepEqual(abi.args.slice(0,2), ['--fail-no-debug-info', '--no-default-suppression']);
  assert.equal(seen.filter(row => row.exe === '/usr/bin/readelf' && row.step !== 'readelf-version').length, 10);
  assert.ok(seen.every(row => row.timeout > 0 && row.timeout <= 120000));
  for (const failed of ['stage', 'baseline-dynamic', 'candidate-versions', 'abidiff']) {
    const out = await diagnose(config, { run: async (...args) => { if (args[0] === failed) throw new Error('owned child nonzero or uncertain'); return run(...args); }, now: () => 0 });
    assert.equal(out.passed, false); assert.equal(out.failureStage, failed); assert.equal(out.genericAbiApproval, false);
  }
  for (const badStep of ['tool-packages', 'tool-binary-hashes']) {
    const out = await diagnose(config, { run: async (...args) => args[0] === badStep ? 'foreign data' : run(...args), now: () => 0 });
    assert.equal(out.passed, false); assert.equal(out.failureStage, badStep);
  }
});
test('fails before dispatch without an adequate remaining deadline', async () => {
  let calls = 0;
  const out = await diagnose({ ...config, deadlineMs: 0 }, { run: async () => { calls++; }, now: () => 0 });
  assert.equal(out.passed, false); assert.equal(calls, 0);
});
