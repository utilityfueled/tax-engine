import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, readdir, lstat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import { auditCollection, containerProof, environment, exactUnion, noEnvFiles, planBatches, reconcile, rowsFromReport, runSchedule, snapshot, testList, verifyAudit } from '../run-browser-tests.mjs';
import { collectionHash, diagnosticOutcome, rewriteImport, selectCases } from './selection.mjs';
import { LIMITS, ORIGIN, unavailable, validateInventory, publicChunkMetadata, sanitizeStoredRecord } from './profile.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const need = condition => { if (!condition) throw new Error('diagnostic-contract-unavailable'); };
const ID = /^[a-f0-9]{20}-[a-f0-9]{20}$/u;
const MAX_TOTAL_MS = 12 * 60 * 1000;
export function admission(env, platform = process.platform) {
  if (env.TAX_BROWSER_CPU_DIAGNOSTICS !== '1') return false;
  need(platform === 'linux' && env.GITHUB_ACTIONS === 'true' && env.TAX_BROWSER_CPU_ORIGINAL_OUTCOME === 'failure');
  need(/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA) && /^sha256:[a-f0-9]{64}$/u.test(env.CANDIDATE_IMAGE_ID) && env.PLAYWRIGHT_BASE_URL === ORIGIN);
  return true;
}
export function projectCaseResults(rows) {
  return rows.map(row => {
    const result = row.results?.[0];
    need(ID.test(row.id) && row.results.length === 1 && result.retry === 0 && ['passed', 'failed', 'timedOut', 'skipped'].includes(result.status) && Number.isFinite(result.duration) && result.duration >= 0);
    return { id: row.id, status: result.status, durationMs: result.duration, retry: 0 };
  });
}
async function readJson(file, max = LIMITS.bytes) {
  const stat = await lstat(file); need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= max);
  const bytes = await readFile(file); need(bytes.length <= max); return JSON.parse(bytes.toString('utf8'));
}

/** Only this process's finite child commands are stopped. Captured stderr is never forwarded or saved. */
export function command(file, args, { cwd, env, signal, timeout = 60000, max = LIMITS.bytes, spawnChild = spawn }) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('diagnostic-contract-unavailable')); return; }
    const child = spawnChild(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', seen = 0, bad = false, hardStop, forcedClose, settled = false;
    const finish = (exit, closedSignal) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(hardStop); clearTimeout(forcedClose); signal.removeEventListener('abort', stop);
      if (bad || closedSignal || !Number.isInteger(exit)) reject(new Error('diagnostic-contract-unavailable'));
      else resolve({ exit, stdout: output });
    };
    const stop = () => {
      if (bad || settled) return; bad = true; child.kill('SIGTERM');
      hardStop = setTimeout(() => {
        child.kill('SIGKILL');
        forcedClose = setTimeout(() => {
          // No close acknowledgment: do not report confirmed cleanup or wait forever.
          child.stdout.destroy(); child.stderr.destroy(); child.unref(); finish(null, 'cleanup-unconfirmed');
        }, 500);
      }, 2000);
    };
    const timer = setTimeout(stop, timeout); signal.addEventListener('abort', stop, { once: true });
    child.stdout.on('data', chunk => { seen += chunk.length; if (seen > max) stop(); else output += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { seen += chunk.length; if (seen > max) stop(); });
    child.on('error', stop);
    child.on('close', finish);
  });
}

async function originalQualification(root, directory, manifest, audit, image) {
  const base = path.join(root, 'apps/web/test-results');
  const candidates = directory ? [directory] : (await readdir(base)).filter(n => /^rate-window-\d+-\d+$/u.test(n));
  need(candidates.length <= 128);
  const found = [];
  for (const relative of candidates) {
    need(/^rate-window-\d+-\d+$/u.test(relative));
    const dir = path.join(base, relative);
    try {
      const summary = await readJson(path.join(dir, 'summary.json'));
      const source = await readJson(path.join(dir, 'source-build.json'));
      if (source.externalImageId !== image || summary.caseCount !== 592 || summary.status !== 'FAIL' || summary.failed < 1 || summary.skipped !== 5 || summary.error || !summary.cleanup) continue;
      const full = rowsFromReport(await readJson(path.join(dir, 'full-list.stdout')));
      selectCases(full, manifest, manifest.auditSha256); auditCollection(full, audit);
      const batches = planBatches(full, audit), rows = [];
      need(summary.batchesCompleted === batches.length);
      for (let i = 0; i < batches.length; i++) {
        const report = await readJson(path.join(dir, `batch-${i + 1}.json`));
        const exit = await readJson(path.join(dir, `batch-${i + 1}-exit.json`));
        need(!exit.signal && !exit.captureFailed);
        rows.push(...reconcile(report, batches[i].rows, audit, exit.exit).rows);
      }
      exactUnion([rows], full);
      const actual = projectCaseResults(rows);
      need(actual.filter(r => r.status === 'failed' || r.status === 'timedOut').length === summary.failed);
      need(JSON.stringify(await snapshot(root, [], Object.keys(source.source))) === JSON.stringify(source.source));
      found.push({ source, summary: { passed: 592 - summary.failed - 5, failed: summary.failed, skipped: 5 }, full });
    } catch { /* Ignore incomplete/unrelated original directories, never expose raw errors. */ }
  }
  need(found.length === 1); return found[0];
}

/** No filesystem/process action before explicit admission. Never creates or replaces the app/container. */
export async function main({ env = process.env, root = fileURLToPath(new URL('../../', import.meta.url)) } = {}) {
  if (!admission(env)) return 0;
  const out = path.join(root, 'artifacts/browser-cpu-diagnostics');
  await mkdir(path.dirname(out), { recursive: true }); await mkdir(out); // Refuse to overwrite earlier evidence.
  const save = async (name, record) => {
    need(/^[a-z0-9-]+\.json$/u.test(name)); const bytes = JSON.stringify(record, null, 2) + '\n';
    need(Buffer.byteLength(bytes) <= LIMITS.bytes); await writeFile(path.join(out, name), bytes, { flag: 'wx', mode: 0o600 });
  };
  const abort = new AbortController(), totalTimer = setTimeout(() => abort.abort(), MAX_TOTAL_MS);
  const interrupt = () => abort.abort(); process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  let temporary, exit = 1;
  try {
    await noEnvFiles(root);
    const manifest = await readJson(path.join(root, 'scripts/browser-cpu-diagnostics/cases.json'));
    const auditBytes = await readFile(path.join(root, 'scripts/browser-request-budgets.json')), audit = JSON.parse(auditBytes);
    need(sha(auditBytes) === manifest.auditSha256); await verifyAudit(root, audit);
    const targetFiles = [...new Set(manifest.targets.map(row => row.file))];
    need(targetFiles.length === 4 && Object.keys(manifest.targetSourceSha256).length === 4);
    for (const file of targetFiles) {
      const current = await readFile(path.join(root, 'apps/web/tests', file), 'utf8');
      const original = current.replace('../scripts/browser-cpu-diagnostics/fixture', '@playwright/test');
      need(rewriteImport(original, manifest.targetSourceSha256[file]) === current);
    }
    const childEnv = { ...environment(env), PLAYWRIGHT_BASE_URL: ORIGIN };
    const exec = (file, args, options = {}) => command(file, args, { cwd: root, env: childEnv, signal: abort.signal, ...options });
    const inspect = async () => {
      const result = await exec('docker', ['inspect', '--format', '{{.Id}} {{.Image}} {{.State.Running}} {{index .Config.Labels "org.opencontainers.image.revision"}}', 'tax-engine-browser-ci'], { timeout: 10000 });
      need(result.exit === 0); return containerProof(result.stdout, env.CANDIDATE_IMAGE_ID, env.GITHUB_SHA);
    };
    const imageProof = await inspect();
    const original = await originalQualification(root, env.TAX_BROWSER_CPU_QUALIFICATION_DIRECTORY, manifest, audit, env.CANDIDATE_IMAGE_ID);
    need(JSON.stringify(original.source.externalProof) === JSON.stringify(imageProof));
    const identity = async () => {
      need(!abort.signal.aborted); await verifyAudit(root, audit);
      need(JSON.stringify(await snapshot(root, [], Object.keys(original.source.source))) === JSON.stringify(original.source.source));
      need(JSON.stringify(await inspect()) === JSON.stringify(imageProof));
    };
    temporary = await mkdtemp(path.join(tmpdir(), 'tax-browser-cpu-'));
    const profileDirectory = path.join(temporary, 'profiles'); await mkdir(profileDirectory);
    const inventoryProgram = await readFile(path.join(root, 'scripts/browser-cpu-diagnostics/image-public-chunks.mjs'), 'utf8');
    const inventoryResult = await exec('docker', ['exec', 'tax-engine-browser-ci', 'node', '--input-type=module', '-e', inventoryProgram, '--', '--image-public-chunks'], { timeout: 15000, max: 2 * 1024 * 1024 });
    need(inventoryResult.exit === 0); const inventory = JSON.parse(inventoryResult.stdout); validateInventory(inventory);
    await identity();
    const inventoryFile = path.join(temporary, 'public-chunks.json'); await writeFile(inventoryFile, JSON.stringify(inventory), { flag: 'wx', mode: 0o600 });
    const app = path.join(root, 'apps/web'), cli = path.join(app, 'node_modules/@playwright/test/cli.js');
    const fixed = ['test', '--workers=2', '--retries=0', '--timeout=30000', '--project=chromium'];
    const profilerEnv = { ...childEnv, TAX_BROWSER_CPU_DIAGNOSTICS: '1', TAX_BROWSER_CPU_OUTPUT: profileDirectory, TAX_BROWSER_CPU_INVENTORY: inventoryFile };
    const collect = async (enabled, list) => {
      const result = await exec(process.execPath, [cli, ...fixed, '--list', '--reporter=json', ...(list ? ['--test-list', list] : [])], { cwd: app, env: enabled ? profilerEnv : childEnv });
      need(result.exit === 0); return rowsFromReport(JSON.parse(result.stdout));
    };
    const plain = await collect(false), instrumented = await collect(true);
    const selected = selectCases(plain, manifest, sha(auditBytes)); selectCases(instrumented, manifest, sha(auditBytes)); auditCollection(plain, audit);
    need(collectionHash(plain) === collectionHash(instrumented));
    const batches = planBatches(selected, audit);
    for (let i = 0; i < batches.length; i++) {
      batches[i].list = path.join(temporary, `batch-${i}.txt`); await writeFile(batches[i].list, testList(batches[i].rows));
      const resolved = await collect(true, batches[i].list); exactUnion([resolved], batches[i].rows);
      need(resolved.every(r => batches[i].rows.some(old => r.id === old.id && r.timeout === old.timeout && r.expectedStatus === old.expectedStatus)));
    }
    await save('plan.json', { qualification: 'NONQUALIFYING_DIAGNOSTIC', originalQualification: original.summary, historicalReference: manifest.originalOutcome, fullCollectionSha256: collectionHash(plain), fullCases: plain.length, selected: manifest.targets, workers: 2, retries: 0, timeoutMs: 30000,
      additionalProtectedRequestsByNaturalWindow: batches.map(b => b.bounds), initialNaturalWindowMs: 61000, totalDeadlineMs: MAX_TOTAL_MS, imageId: imageProof[1], revision: imageProof[3], inventorySha256: sha(inventoryResult.stdout), publicChunks: publicChunkMetadata(inventory), sourceMaps: 'deferred', limitation: 'Sampling adds overhead. V8 intervals are sampling wall weights, not process CPU accounting. No qualification result is superseded.' });
    const outcomes = [];
    const summary = await runSchedule({ batches, expected: selected, audit, io: {
      now: () => ({ mono: performance.now(), wall: Date.now() }), sleep: ms => pause(ms, null, { signal: abort.signal }), identity, alive: () => !abort.signal.aborted,
      cleanup: async () => true, // The existing workflow owns the container; this runner never stops it.
      record: async value => { const safe = projectCaseResults(value.result.rows); outcomes.push(...safe); await save(`batch-${value.batch}.json`, { cases: safe, bounds: value.bounds, start: value.start, close: value.close }); },
      run: async (batch, i) => {
        const reportFile = path.join(temporary, `result-${i}.json`);
        const result = await exec(process.execPath, [cli, ...fixed, '--test-list', batch.list, '--output', path.join(temporary, `test-artifacts-${i}`), '--reporter=json', '--trace=off'], {
          cwd: app, env: { ...profilerEnv, PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile, PLAYWRIGHT_LAST_RUN_OUTPUT_FILE: path.join(temporary, `last-run-${i}.json`) }, timeout: batch.rows.length * 30000 + 10000,
        });
        return { exit: result.exit, report: await readJson(reportFile) };
      },
    } });
    // Files here originate only from the whitelist-projecting fixture, never from raw CDP or PW reports.
    let unavailableCount = 0;
    for (const row of selected) {
      let record;
      try { record = sanitizeStoredRecord(await readJson(path.join(profileDirectory, `${row.id}.json`)), { origin: ORIGIN, inventory }); }
      catch { record = unavailable('profile-not-recovered'); }
      if (record.status !== 'available') unavailableCount++;
      await save(`profile-${row.id}.json`, record);
    }
    const result = diagnosticOutcome(original.summary, { cases: outcomes.length, failed: summary.failed, unavailable: unavailableCount, complete: summary.caseCount === 14 && !summary.error && summary.cleanup, outcomes });
    await save('result.json', result); exit = result.diagnostic.complete && summary.failed === 0 && unavailableCount === 0 ? 0 : 1;
  } catch {
    await save('unavailable.json', { qualification: 'NONQUALIFYING_DIAGNOSTIC', status: 'unavailable', code: 'diagnostic-infrastructure-unavailable', originalFailureSuperseded: false });
  } finally {
    clearTimeout(totalTimer); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
  return exit;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }, () => { process.stderr.write('Browser CPU diagnostic unavailable; original qualification unchanged.\n'); process.exitCode = 1; });
}
