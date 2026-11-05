import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, writeFile, mkdir, readdir, lstat, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';
import { performance } from 'node:perf_hooks';
const auditedDirs = ['src', 'apps/web/src', 'apps/web/tests', 'tests/fixtures', 'packages/engine/src', 'packages/contracts/src'];
const auditedFiles = ['apps/web/playwright.config.ts', 'apps/web/package.json', 'packages/engine/package.json', 'packages/contracts/package.json', 'pnpm-lock.yaml'];
const scopes = ['filled-return', 'provider', 'business-expense-analysis', 'self-employment-income-analysis'];
const sourceDirs = ['src', 'apps/web/src', 'apps/web/tests', 'apps/web/public', 'apps/web/scripts', 'scripts', 'packages/contracts/src', 'packages/engine/src', 'tests', 'forms/blank', 'spec', 'sample-documents/downloads'];
const sourceFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'apps/web/package.json', 'apps/web/next.config.ts', 'apps/web/tsconfig.json', 'apps/web/playwright.config.ts', 'scripts/run-tests.mjs', 'scripts/run-browser-tests.mjs', 'scripts/browser-request-budgets.json', 'packages/contracts/package.json', 'packages/engine/package.json', '.github/workflows/web.yml'];
export function need(ok, label = 'Browser orchestration requires review') { if (!ok)
    throw Error(label); }
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function options(args) {
    const result = [];
    let utility = false;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        need(typeof a === 'string' && !/[\n\r\0]/u.test(a), 'Invalid CLI argument');
        if (a === '--list' || a === '--help' || a === '-h') {
            utility = true;
            result.push(a);
            continue;
        }
        if (!a.startsWith('-')) {
            result.push(a);
            continue;
        }
        const at = a.indexOf('='), flag = at < 0 ? a : a.slice(0, at), value = at < 0 ? args[++i] : a.slice(at + 1);
        need(['--grep', '--grep-invert', '--project', '--timeout', '--trace', '--retries', '--workers'].includes(flag) && typeof value === 'string', 'Unsupported browser option');
        if (flag === '--retries') {
            need(value === '0', 'Browser qualification requires zero retries');
            continue;
        }
        if (flag === '--workers') {
            need(value === '2', 'Browser qualification requires two workers');
            continue;
        }
        if (flag === '--timeout')
            need(/^\d+$/u.test(value) && Number(value) > 0 && Number(value) <= 90000, 'Deadline extension is not permitted');
        if (flag === '--trace')
            need(['off', 'on', 'retain-on-failure', 'on-first-retry'].includes(value), 'Unsupported trace mode');
        result.push(at < 0 ? flag : `${flag}=${value}`);
        if (at < 0)
            result.push(value);
    }
    return { args: [...result, '--workers=2', '--retries=0'], utility };
}
export function rowsFromReport(report) {
    need(report && Array.isArray(report.suites) && Array.isArray(report.errors) && !report.errors.length, 'Missing/global-error report');
    need(report.config?.workers === 2 && Array.isArray(report.config.projects) && report.config.projects.length === 1 && report.config.projects.every(p => p.retries === 0 && p.repeatEach === 1), 'Runner concurrency/retry changed');
    const rows = [];
    const walk = (suite, titles = []) => {
        const nested = titles.length ? [...titles, suite.title] : [suite.title];
        for (const spec of suite.specs ?? [])
            for (const test of spec.tests ?? []) {
                const file = spec.file.replaceAll('\\', '/'), full = [...nested.slice(1), spec.title];
                need(file && !path.posix.isAbsolute(file) && !file.split('/').includes('..') && full.every(t => typeof t === 'string' && t && !/[›>\r\n]/u.test(t)), 'Ambiguous relative test title');
                need(test.projectName === 'chromium' && Number.isInteger(test.timeout) && test.timeout > 0 && ['passed', 'skipped'].includes(test.expectedStatus), 'Unsupported case contract');
                rows.push({ key: JSON.stringify([test.projectName, file, full]), file, titles: full, project: test.projectName, id: spec.id, timeout: test.timeout, expectedStatus: test.expectedStatus, results: test.results ?? [] });
            }
        for (const child of suite.suites ?? [])
            walk(child, nested);
    };
    for (const suite of report.suites)
        walk(suite);
    need(rows.length > 0 && new Set(rows.map(r => r.key)).size === rows.length, 'Empty/duplicate collection');
    return rows;
}
export function exactUnion(groups, expected) {
    const keys = groups.flatMap(g => g.map(r => r.key)), all = new Set(expected.map(r => r.key));
    need(all.size === expected.length && keys.length === all.size && new Set(keys).size === keys.length && keys.every(k => all.has(k)), 'Case union differs');
}
export function auditCollection(rows, audit) {
    need(audit.version === 1 && audit.windowMs === 60000 && audit.maxRequests === 20, 'Protection audit changed');
    const overrides = { 'pa-married-native.spec.ts': 180000, 'pa-mi-native-history.spec.ts': 180000, 'pa-ordinary-care-native.spec.ts': 240000 };
    need(Object.entries(audit.files).every(([f, a]) => a.bodyTimeoutMs === overrides[f]), 'Runtime timeout audit changed');
    need(Object.entries(audit.files).every(([f, a]) => !a.skippedTitles.length || f === 'hosted-happy-paths.spec.ts') && Object.values(audit.files).reduce((n, a) => n + a.skippedTitles.length, 0) === 5, 'Original hosted skips changed');
    const counts = {};
    for (const r of rows) {
        const a = audit.files[r.file];
        need(a, 'Unaudited case');
        counts[r.file] = (counts[r.file] ?? 0) + 1;
        need(r.expectedStatus === (a.skippedTitles.some(t => equal(t, r.titles)) ? 'skipped' : 'passed'), 'Skip contract changed');
    }
    need(equal(Object.keys(counts).sort(), Object.keys(audit.files).sort()), 'New/removed case file requires review');
    for (const [f, a] of Object.entries(audit.files))
        need(counts[f] === a.caseCount && scopes.every(s => Number.isSafeInteger(a.bounds[s]) && a.bounds[s] >= 0 && a.bounds[s] <= 20), 'Case count/budget changed');
}
export function planBatches(rows, audit) {
    const files = new Map();
    for (const row of rows) {
        need(audit.files[row.file], 'Unaudited case');
        if (!files.has(row.file))
            files.set(row.file, []);
        files.get(row.file).push(row);
    }
    const result = [];
    let current = { rows: [], bounds: Object.fromEntries(scopes.map(s => [s, 0])) };
    for (const [file, group] of files) {
        const a = audit.files[file];
        const b = Object.fromEntries(scopes.map(s => { need(Number.isSafeInteger(a.bounds[s]) && a.bounds[s] >= 0, 'Invalid reviewed weight'); return [s, a.bounds[s] * group.length]; }));
        need(scopes.every(s => b[s] <= 20), 'File exceeds reviewed request window');
        if (scopes.some(s => current.bounds[s] + b[s] > 20)) {
            result.push(current);
            current = { rows: [], bounds: Object.fromEntries(scopes.map(s => [s, 0])) };
        }
        current.rows.push(...group);
        for (const s of scopes)
            current.bounds[s] += b[s];
    }
    if (current.rows.length)
        result.push(current);
    exactUnion(result.map(b => b.rows), rows);
    return result;
}
export const testList = rows => rows.map(r => `[${r.project}] › ${r.file} › ${r.titles.join(' › ')}`).join('\n') + '\n';
export function reconcile(report, expected, audit, exit) {
    need(exit === 0 || exit === 1, 'Unknown child exit');
    const got = rowsFromReport(report);
    exactUnion([got], expected);
    const byKey = new Map(expected.map(r => [r.key, r]));
    let failed = 0, skipped = 0;
    for (const r of got) {
        const old = byKey.get(r.key), timeout = audit.files[r.file].bodyTimeoutMs ?? old.timeout;
        need(r.id === old.id && r.expectedStatus === old.expectedStatus && r.timeout === timeout && r.results.length === 1, 'Case deadline/attempt contract changed');
        const one = r.results[0];
        need((one.retry ?? 0) === 0 && ['passed', 'failed', 'timedOut', 'skipped'].includes(one.status), 'Retry/interrupted outcome');
        if (old.expectedStatus === 'skipped') {
            need(one.status === 'skipped', 'Original skip changed');
            skipped++;
        }
        else if (one.status !== 'passed') {
            need(one.status === 'failed' || one.status === 'timedOut', 'New skip');
            failed++;
        }
    }
    need((exit === 0) === (failed === 0), 'Exit/result mismatch');
    return { rows: got, failed, skipped };
}
/** Process/clock collaborators permit offline tests; actual entry supplies only owned real operations. */
export async function runSchedule({ batches, expected, audit, io }) {
    let prior = io.now();
    const outcomes = [];
    let error = null;
    try {
        for (let i = 0; i < batches.length; i++) {
            await io.identity();
            need(io.alive(), 'Runtime unavailable');
            const elapsed = io.now().mono - prior.mono;
            if (elapsed < 61000)
                await io.sleep(61000 - elapsed);
            const start = io.now();
            need(start.mono - prior.mono >= 61000 && start.wall - prior.wall >= 61000, 'Natural window did not expire');
            await io.identity();
            need(io.alive(), 'Runtime unavailable');
            const child = await io.run(batches[i], i);
            prior = io.now();
            const result = reconcile(child.report, batches[i].rows, audit, child.exit);
            outcomes.push(result);
            await io.record({ batch: i + 1, start, close: prior, bounds: batches[i].bounds, result });
            await io.identity();
            need(io.alive(), 'Runtime unavailable');
        }
        exactUnion(outcomes.map(o => o.rows), expected);
    }
    catch (e) {
        error = e instanceof Error ? e.message : 'Unknown orchestration failure';
    }
    let cleanup;
    try {
        cleanup = await io.cleanup();
    }
    catch {
        cleanup = false;
    }
    return { status: !error && cleanup && outcomes.every(o => o.failed === 0) ? 'PASS' : 'FAIL', error, cleanup, batchesCompleted: outcomes.length, caseCount: outcomes.reduce((n, o) => n + o.rows.length, 0), failed: outcomes.reduce((n, o) => n + o.failed, 0), skipped: outcomes.reduce((n, o) => n + o.skipped, 0) };
}
async function walk(root, dir) {
    const result = [];
    for (const entry of (await readdir(path.join(root, dir), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name === '.DS_Store' || entry.name.endsWith('.pyc'))
            continue;
        const name = path.posix.join(dir, entry.name);
        need(!entry.isSymbolicLink(), 'Symlink in source scope');
        if (entry.isDirectory())
            result.push(...await walk(root, name));
        else {
            need(entry.isFile(), 'Nonregular source');
            result.push(name);
        }
    }
    return result;
}
export async function snapshot(root, dirs, files = []) {
    const names = [...new Set([...files, ...(await Promise.all(dirs.map(d => walk(root, d)))).flat()])].sort();
    const result = {};
    for (const name of names) {
        need(!path.isAbsolute(name) && !name.split('/').includes('..'), 'Invalid source scope');
        need((await lstat(path.join(root, name))).isFile() && !(await lstat(path.join(root, name))).isSymbolicLink(), 'Invalid source file');
        result[name] = sha(await readFile(path.join(root, name)));
    }
    return result;
}
export async function verifyAudit(root, audit) { need(equal(audit.sourceDirs, auditedDirs) && equal(audit.sourceFiles, auditedFiles), 'Audit closure changed'); need(equal(await snapshot(root, audit.sourceDirs, audit.sourceFiles), audit.sourceHashes), 'Changed/new source requires action-count review'); }
/** @returns {Record<string,string>} */
export function environment(parent) {
    const env = /** @type {Record<string,string>} */ ({});
    for (const k of ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'WINDIR', 'COMSPEC', 'LANG', 'LC_ALL', 'TERM', 'CI', 'GITHUB_ACTIONS', 'GITHUB_SHA', 'GITHUB_WORKSPACE', 'TAX_ENGINE_PDF_TEST_PYTHON'])
        if (parent[k] !== undefined)
            env[k] = parent[k];
    return { ...env, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production', TAX_ENGINE_DEPLOYMENT_MODE: 'self-host', PLAYWRIGHT_DISABLE_WEBSERVER: 'true' };
}
export async function noEnvFiles(root) {
    for (const dir of ['', 'apps/web'])
        for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
            try {
                await lstat(path.join(root, dir, name));
                throw Error('Implicit environment file prevents isolated browser run');
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
            }
        }
}
function launch(file, args, { cwd, env, log, stream = false }) {
    const child = spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', ioError = null;
    let pending = Promise.resolve();
    const collect = (kind, chunk) => {
        const text = String(chunk);
        if (stream)
            (kind === 'stdout' ? process.stdout : process.stderr).write(text);
        if (kind === 'stdout')
            stdout += text;
        else
            stderr += text;
        if (stdout.length + stderr.length > 64 * 1024 * 1024) {
            ioError = Error('Child output exceeded bound');
            child.kill('SIGTERM');
        }
        if (log)
            pending = pending.then(() => appendFile(`${log}.${kind}`, text)).catch(() => { ioError = Error('Child capture failed'); });
    };
    child.stdout.on('data', b => collect('stdout', b));
    child.stderr.on('data', b => collect('stderr', b));
    const closed = new Promise(resolve => { child.once('error', () => { ioError = Error('Child startup failed'); }); child.once('close', async (code, signal) => { await pending; resolve({ exit: code, signal, stdout, stderr, ioError }); }); });
    return { child, closed, output: () => stdout };
}
function requestStop(process) { if (process && !process.stopRequested) {
    process.stopRequested = true;
    process.child.kill('SIGTERM');
} }
async function stopOwned(process) {
    if (!process)
        return true;
    if ((process.child.exitCode !== null || process.child.signalCode !== null) && !process.stopRequested)
        return false;
    requestStop(process);
    const result = await Promise.race([process.closed, new Promise(resolve => { const timer = setTimeout(() => resolve(null), 30000); timer.unref(); })]);
    return Boolean(result && !result.ioError && (result.signal === 'SIGTERM' || result.exit === 143 || result.exit === 0));
}
async function freePort(port) { await new Promise((resolve, reject) => { const server = createServer(); server.once('error', () => reject(Error('Browser port already bound'))); server.listen(port, '127.0.0.1', () => server.close(resolve)); }); }
/** Separate documented mutable response data from this exact build's compiled identity. */
export function classifyBuild(all, appRoutes, prerender) {
    need(appRoutes && typeof appRoutes === 'object' && !Array.isArray(appRoutes) && prerender?.routes && typeof prerender.routes === 'object' && !Array.isArray(prerender.routes), 'Missing route-cache declarations');
    const allowed = [];
    for (const [owner, route] of Object.entries(appRoutes)) {
        need(typeof route === 'string' && route.startsWith('/') && !route.split('/').includes('..'), 'Invalid compiled route declaration');
        const declared = prerender.routes[route];
        if (!declared || route.includes('[')) continue;
        const kind = owner.endsWith('/page') && typeof declared.dataRoute === 'string' && declared.dataRoute.endsWith('.rsc') ? 'APP_PAGE' : owner.endsWith('/route') && declared.dataRoute === null ? 'APP_ROUTE' : null;
        if (!kind) continue;
        const normalized = /^\/index(\/|$)/u.test(route) ? `/index${route}` : route === '/' ? '/index' : route;
        need(path.posix.normalize(normalized) === normalized, 'Invalid normalized compiled route');
        allowed.push({ prefix: `apps/web/.next/server/route-cache/${kind}/${sha(owner)}/$${normalized}`, kind });
    }
    const immutable = {}, runtimeCache = {};
    for (const [name, hash] of Object.entries(all)) {
        if (!name.startsWith('apps/web/.next/server/route-cache/')) { immutable[name] = hash; continue; }
        const accepted = allowed.some(({prefix, kind}) => {
            if (kind === 'APP_ROUTE') return name === `${prefix}.body` || name === `${prefix}.meta`;
            if (['.html', '.meta', '.rsc'].some(ext => name === prefix + ext)) return true;
            if (!name.startsWith(prefix + '.segments/')) return false;
            const segment = name.slice((prefix + '.segments/').length);
            return /^[A-Za-z0-9_@().%/-]+\.segment\.rsc$/u.test(segment) && !segment.split('/').some(part => part === '.' || part === '..' || part === '');
        });
        need(accepted, 'Unknown runtime route-cache artifact');
        runtimeCache[name] = hash;
    }
    return { immutable, runtimeCache };
}
export async function buildSnapshot(root) {
    const base = path.join(root, 'apps/web/.next');
    const files = (await readdir(base, { withFileTypes: true })).filter(e => e.name === 'BUILD_ID' || e.name.endsWith('.json')).map(e => `apps/web/.next/${e.name}`);
    need(files.includes('apps/web/.next/BUILD_ID'), 'Missing production build');
    need(['app-path-routes-manifest.json', 'prerender-manifest.json'].every(name => files.includes(`apps/web/.next/${name}`)), 'Missing required cache declaration');
    const all = await snapshot(root, ['apps/web/.next/server', 'apps/web/.next/static'], files);
    return classifyBuild(all, JSON.parse(await readFile(path.join(base, 'app-path-routes-manifest.json'), 'utf8')), JSON.parse(await readFile(path.join(base, 'prerender-manifest.json'), 'utf8')));
}
export function containerProof(stdout, candidate, revision) {
    const fields = stdout.trim().split(/\s+/u);
    need(fields.length === 4 && /^[a-f0-9]{64}$/u.test(fields[0]) && fields[1] === candidate && fields[2] === 'true' && fields[3] === revision, 'Container identity changed');
    return fields;
}
export async function main(args, { root = fileURLToPath(new URL('../', import.meta.url)), parentEnv = process.env } = {}) {
    const parsed = options(args), app = path.join(root, 'apps/web'), cli = path.join(app, 'node_modules/@playwright/test/cli.js');
    await noEnvFiles(root);
    if (parsed.utility) {
        const run = launch(process.execPath, [cli, 'test', ...parsed.args], { cwd: app, env: environment(parentEnv) });
        const r = await run.closed;
        process.stdout.write(r.stdout);
        process.stderr.write(r.stderr);
        return r.ioError ? 1 : r.exit ?? 1;
    }
    const audit = JSON.parse(await readFile(path.join(root, 'scripts/browser-request-budgets.json'), 'utf8'));
    await verifyAudit(root, audit);
    need(!parentEnv.PLAYWRIGHT_USE_DEV_SERVER, 'Production browser suite requires production runtime');
    const external = parentEnv.PLAYWRIGHT_DISABLE_WEBSERVER === 'true';
    if (external)
        need(parentEnv.GITHUB_ACTIONS === 'true' && parentEnv.PLAYWRIGHT_BASE_URL === 'http://127.0.0.1:3109' && parentEnv.CANDIDATE_IMAGE_ID?.match(/^sha256:[a-f0-9]{64}$/u), 'External runtime must be exact job-owned container');
    else
        need(!parentEnv.PLAYWRIGHT_BASE_URL || parentEnv.PLAYWRIGHT_BASE_URL === 'http://127.0.0.1:3099', 'Managed browser URL changed');
    const env = { ...environment(parentEnv), PLAYWRIGHT_BASE_URL: external ? 'http://127.0.0.1:3109' : 'http://127.0.0.1:3099' };
    const out = path.join(app, 'test-results', `rate-window-${Date.now()}-${process.pid}`);
    await mkdir(path.dirname(out), { recursive: true });
    await mkdir(out);
    const save = (name, value) => writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    const collect = async (select, name, list) => {
        const run = launch(process.execPath, [cli, 'test', ...select, '--list', '--reporter=json', ...(list ? ['--test-list', list] : [])], { cwd: app, env, log: path.join(out, name) });
        const r = await run.closed;
        need(!r.ioError && !r.signal && r.exit === 0, 'Collection failed');
        return rowsFromReport(JSON.parse(r.stdout));
    };
    const fullArgs = parsed.args.filter(a => a === '--workers=2' || a === '--retries=0' || a.startsWith('--timeout='));
    // Separate --timeout value form is retained for unfiltered audit collection too.
    for (let i = 0; i < parsed.args.length; i++)
        if (parsed.args[i] === '--timeout')
            fullArgs.push('--timeout', parsed.args[i + 1]);
    const full = await collect(fullArgs, 'full-list');
    auditCollection(full, audit);
    const selected = await collect(parsed.args, 'selected-list');
    const fullKeys = new Set(full.map(r => r.key));
    need(selected.every(r => fullKeys.has(r.key)), 'Selected case absent from complete collection');
    const batches = planBatches(selected, audit);
    await save('plan.json', { selected: selected.map(r => ({ key: r.key, id: r.id, timeout: r.timeout, expectedStatus: r.expectedStatus })), batches: batches.map(b => ({ keys: b.rows.map(r => r.key), bounds: b.bounds })), external });
    for (let i = 0; i < batches.length; i++) {
        const list = path.join(out, `batch-${i + 1}.txt`);
        await writeFile(list, testList(batches[i].rows), { flag: 'wx' });
        batches[i].list = list;
        exactUnion([await collect(parsed.args, `batch-${i + 1}-list`, list)], batches[i].rows);
    }
    const before = await snapshot(root, sourceDirs, sourceFiles);
    let server = null, browser = null, building = null, interrupted = false, cleanupAttempted = false;
    let compiled = null, externalProof = null, buildObservation = 0;
    const cancellation = new AbortController();
    const abort = () => { interrupted = true; cancellation.abort(); requestStop(browser); requestStop(server); requestStop(building); };
    process.once('SIGINT', abort);
    process.once('SIGTERM', abort);
    try {
        if (!external) {
            await freePort(3099);
            const start = performance.now();
            building = launch(process.execPath, [path.join(app, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], { cwd: app, env, log: path.join(out, 'build'), stream: true });
            const buildDeadline = setTimeout(() => requestStop(building), Math.max(1, 180000 - (performance.now() - start)));
            const r = await building.closed;
            clearTimeout(buildDeadline);
            building = null;
            await save('build.json', { exit: r.exit, signal: r.signal });
            need(!r.ioError && !r.signal && r.exit === 0, 'Production build failed');
            need(equal(await snapshot(root, sourceDirs, sourceFiles), before), 'Source drift during build');
            compiled = await buildSnapshot(root);
            server = launch(process.execPath, [path.join(app, 'node_modules/next/dist/bin/next'), 'start', '--port', '3099'], { cwd: app, env, log: path.join(out, 'server'), stream: true });
            let ready = false;
            while (performance.now() - start < 180000 && !interrupted && server.child.exitCode === null) {
                if (/Ready in/u.test(server.output())) {
                    const response = await fetch(`${env.PLAYWRIGHT_BASE_URL}/api/health`, { signal: globalThis.AbortSignal.any([cancellation.signal, globalThis.AbortSignal.timeout(5000)]), redirect: 'error' });
                    if (response.ok) {
                        ready = true;
                        break;
                    }
                }
                await pause(100, null, { signal: cancellation.signal });
            }
            need(ready, 'Owned production server not ready');
        }
        const inspectExternal = async () => { const p = launch('docker', ['inspect', '--format', '{{.Id}} {{.Image}} {{.State.Running}} {{index .Config.Labels "org.opencontainers.image.revision"}}', 'tax-engine-browser-ci'], { cwd: root, env }); const r = await p.closed; need(!r.ioError && !r.signal && r.exit === 0, 'External container inspection failed'); return containerProof(r.stdout, parentEnv.CANDIDATE_IMAGE_ID, parentEnv.GITHUB_SHA); };
        if (external)
            externalProof = await inspectExternal();
        await save('source-build.json', { source: before, build: compiled, externalImageId: external ? parentEnv.CANDIDATE_IMAGE_ID : null, externalProof, ownedServerPid: server?.child.pid ?? null });
        const identity = async () => { need(!interrupted, 'Interrupted run'); await verifyAudit(root, audit); need(equal(await snapshot(root, sourceDirs, sourceFiles), before), 'Source drift'); if (!external) {
            const current = await buildSnapshot(root);
            const changed = [...new Set([...Object.keys(compiled.immutable), ...Object.keys(current.immutable)])].filter(name => compiled.immutable[name] !== current.immutable[name]);
            await save(`build-cache-observation-${++buildObservation}.json`, { runtimeCache: current.runtimeCache, changedImmutablePaths: changed, immutableFileCount: Object.keys(current.immutable).length });
            need(changed.length === 0, 'Build drift');
        }
        else
            need(equal(await inspectExternal(), externalProof), 'External container replaced'); };
        const summary = await runSchedule({ batches, expected: selected, audit, io: { now: () => ({ mono: performance.now(), wall: Date.now() }), sleep: ms => pause(ms, null, { signal: cancellation.signal }), identity,
                alive: () => !interrupted && (external || server?.child.exitCode === null && server?.child.signalCode === null), cleanup: async () => { cleanupAttempted = true; const ok = external || await stopOwned(server); await save('cleanup.json', { ownedServerPid: server?.child.pid ?? null, external, closed: ok }); return ok; },
                record: value => save(`batch-${value.batch}-receipt.json`, value), run: async (batch, i) => {
                    const report = path.join(out, `batch-${i + 1}.json`);
                    browser = launch(process.execPath, [cli, 'test', ...parsed.args, '--test-list', batch.list, '--output', path.join(out, `batch-${i + 1}-artifacts`), '--reporter=line,json'], { cwd: app, env: { ...env, PLAYWRIGHT_JSON_OUTPUT_FILE: report }, log: path.join(out, `batch-${i + 1}`), stream: true });
                    const r = await browser.closed;
                    browser = null;
                    await save(`batch-${i + 1}-exit.json`, { exit: r.exit, signal: r.signal, captureFailed: Boolean(r.ioError) });
                    need(!r.ioError && !r.signal, 'Unknown browser process outcome');
                    return { exit: r.exit, report: JSON.parse(await readFile(report, 'utf8')) };
                } } });
        await save('summary.json', summary);
        process.stdout.write(`Browser windows: ${summary.status}, ${summary.caseCount} cases, ${summary.failed} failures, ${summary.skipped} original skips. Evidence: ${path.relative(root, out)}\n`);
        return summary.status === 'PASS' ? 0 : 1;
    }
    catch (error) {
        await save('hold.json', { status: 'FAIL', reason: error instanceof Error ? error.message : 'Unknown runtime failure', interrupted });
        return 1;
    }
    finally {
        process.off('SIGINT', abort);
        process.off('SIGTERM', abort);
        if (browser)
            await stopOwned(browser);
        if (building)
            await stopOwned(building);
        if (server && !cleanupAttempted) {
            const ok = await stopOwned(server);
            await save('cleanup.json', { ownedServerPid: server.child.pid, external: false, closed: ok });
        }
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = await main(process.argv.slice(2));
    }
    catch {
        console.error('Browser orchestration failed before runtime; inspect the source audit and prerequisites.');
        process.exitCode = 1;
    }
}
