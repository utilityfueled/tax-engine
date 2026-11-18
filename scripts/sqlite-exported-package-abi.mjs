// Independent diagnostics only; the caller retains original controller custody/cleanup.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { performance } from 'node:perf_hooks';
const inspector = fileURLToPath(new URL('./lib/inspect-sqlite-exported-package-abi.py', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
export function validateProjection(value, source) {
  assert.equal(value.source, source);
  assert.equal(typeof value.originalQualificationPassed, 'boolean');
  for (const [variant, version] of [['baseline', '3.40.1-2+deb12u2'], ['candidate', '3.40.1-2+deb12u2+vivalatax1']]) {
    const v = value[variant]; assert.equal(v.version, version); assert.equal(v.architecture, 'amd64');
    assert.equal(v.libraryPackage, 'libsqlite3-0'); assert.equal(v.debugPackage, 'libsqlite3-0-dbgsym');
    assert.equal(v.library, 'usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6');
    assert.match(v.buildId, /^[a-f0-9]{40}$/); assert.equal(v.debugBuildId, v.buildId);
    assert.equal(v.debug, `usr/lib/debug/.build-id/${v.buildId.slice(0,2)}/${v.buildId.slice(2)}.debug`);
    assert.equal(v.debuglinkCrcMatches, true); assert.equal(v.alternateDebugInfoRequired, false);
    for (const k of ['debugInfoBytes', 'debugAbbrevBytes']) assert.ok(Number.isSafeInteger(v[k]) && v[k] > 0);
    assert.deepEqual(v.soname, ['libsqlite3.so.0']); assert.deepEqual(v.needed, ['libm.so.6', 'libc.so.6']);
    for (const k of ['librarySha256', 'debugSha256']) assert.match(v[k], /^[a-f0-9]{64}$/);
  }
  return true;
}
export async function diagnose(config, { run, now = () => performance.now() }) {
  const result = { passed: false, genericAbiApproval: false, candidateReleaseQualified: false, riskAccepted: false, runtimeIntegrationExecuted: false, checks: [] };
  let stage = 'admission';
  try {
    assert.equal(typeof run, 'function');
    assert.match(config.source, /^[a-f0-9]{40}$/); assert.match(config.archiveSha256, /^[a-f0-9]{64}$/);
    assert.ok(isAbsolute(config.archive) && isAbsolute(config.work) && config.archive !== config.work);
    const start = now(); assert.ok(Number.isFinite(start) && Number.isFinite(config.deadlineMs));
    assert.ok(config.deadlineMs > start && config.deadlineMs - start <= 300000);
    const command = async (name, exe, args, limit) => {
      stage = name; const remaining = Math.floor(config.deadlineMs - now()); assert.ok(remaining > 0, 'No remaining diagnostic work time.');
      // Existing supervised callback MUST throw for nonzero/timeout/overflow/unclosed child.
      const stdout = await run(name, exe, args, Math.min(limit, remaining));
      assert.equal(typeof stdout, 'string'); assert.ok(Buffer.byteLength(stdout) <= 1048576);
      assert.ok(now() < config.deadlineMs, 'Diagnostic deadline expired.');
      result.checks.push({ step: name, stdoutSha256: digest(stdout), bytes: Buffer.byteLength(stdout), successfulSupervisedCallback: true }); return stdout;
    };
    const value = JSON.parse(await command('stage', 'python3', ['-I', '-B', inspector, config.archive, config.archiveSha256, config.source, config.work], 60000));
    validateProjection(value, config.source); result.inputs = value;
    const packages = await command('tool-packages', '/usr/bin/dpkg-query', ['-W', '-f=${Package}\t${Version}\t${Architecture}\n', 'abigail-tools', 'binutils'], 10000);
    assert.equal(packages, 'abigail-tools\t2.2-2\tamd64\nbinutils\t2.40-2\tamd64\n');
    const hashes = (await command('tool-binary-hashes', '/usr/bin/sha256sum', ['/usr/bin/readelf', '/usr/bin/abidiff', '/usr/bin/dpkg-query'], 10000)).trimEnd().split('\n');
    assert.equal(hashes.length, 3);
    result.toolBinarySha256 = {};
    for (const [index, path] of ['/usr/bin/readelf', '/usr/bin/abidiff', '/usr/bin/dpkg-query'].entries()) {
      const row = /^([a-f0-9]{64}) {2}(\/usr\/bin\/[a-z-]+)$/.exec(hashes[index]);
      assert.ok(row); assert.equal(row[2], path); result.toolBinarySha256[path] = row[1];
    }
    await command('readelf-version', '/usr/bin/readelf', ['--version'], 10000);
    await command('abidiff-version', '/usr/bin/abidiff', ['--version'], 10000);
    for (const variant of ['baseline', 'candidate']) {
      const library = join(config.work, variant, value[variant].library);
      for (const [name, args] of [['header', ['--file-header']], ['dynamic', ['--dynamic']], ['symbols', ['--dyn-syms', '--wide']], ['versions', ['--version-info', '--wide']], ['notes', ['--notes']]]) {
        await command(`${variant}-${name}`, '/usr/bin/readelf', [...args, library], 10000);
      }
    }
    await command('abidiff', '/usr/bin/abidiff', ['--fail-no-debug-info', '--no-default-suppression', '--debug-info-dir1', join(config.work, 'baseline/usr/lib/debug'), '--debug-info-dir2', join(config.work, 'candidate/usr/lib/debug'), join(config.work, 'baseline', value.baseline.library), join(config.work, 'candidate', value.candidate.library)], 120000);
    result.passed = true;
  } catch {
    result.failureStage = stage;
  }
  return result;
}
