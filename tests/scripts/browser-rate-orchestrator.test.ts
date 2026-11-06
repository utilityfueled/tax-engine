import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { options, rowsFromReport, auditCollection, planBatches, exactUnion, testList, reconcile, runSchedule, snapshot, verifyAudit, containerProof, environment, noEnvFiles } from '../../scripts/run-browser-tests.mjs';
type Rows = ReturnType<typeof rowsFromReport>;
type TestAudit = {version:number;windowMs:number;maxRequests:number;files:Record<string,{caseCount:number;bounds:Record<string,number>;skippedTitles:string[][];bodyTimeoutMs?:number}>};
const scopes = ['filled-return', 'provider', 'business-expense-analysis', 'self-employment-income-analysis'];
const bounds = (n = 0) => Object.fromEntries(scopes.map(s => [s, s === 'filled-return' ? n : 0]));
function report(files = ['one.spec.ts', 'two.spec.ts', 'three.spec.ts'], timeout = 90000) { return { errors: [], config: { workers: 2, projects: [{ retries: 0, repeatEach: 1 }] }, suites: files.map((file, i) => ({ title: file, file, specs: [{ id: `fresh-${i}`, file, title: `case${i}`, tests: [{ projectName: 'chromium', timeout, expectedStatus: 'passed', results: [] as Array<{status:string;retry:number}> }] }] })) }; }
function auditFor(rows:Rows, weight = 10):TestAudit { return { version: 1, windowMs: 60000, maxRequests: 20, files: Object.fromEntries(rows.map(r => [r.file, { caseCount: rows.filter(x => x.file === r.file).length, bounds: bounds(weight), skippedTitles: [] }])) }; }
function completed(rows:Rows, failed = false) { const r = report(rows.map(x => x.file), rows[0].timeout); for (let i = 0; i < rows.length; i++) {
    const sp = r.suites[i].specs[0];
    sp.id = rows[i].id;
    sp.title = rows[i].titles[0];
    sp.tests[0].expectedStatus = rows[i].expectedStatus;
    sp.tests[0].results = [{ status: rows[i].expectedStatus === 'skipped' ? 'skipped' : failed && i === 0 ? 'failed' : 'passed', retry: 0 }];
} return r; }
function fake(rows:Rows, audit:TestAudit) { let clock = 0; const events:unknown[][] = [];const batches = planBatches(rows, audit); const io = { now: () => ({ mono: clock, wall: clock }), sleep: async (ms:number) => { events.push(['wait', ms]); clock += ms; }, identity: async () => { }, alive: () => true, cleanup: async () => { events.push(['cleanup']); return true; }, record: async (x:{batch:number}) => events.push(['receipt', x.batch]), run: async (b:{rows:Rows}, i:number) => { events.push(['run', i]); clock += 10; return { exit: 0, report: completed(b.rows) }; } }; return { io, events, batches }; }
describe('browser-rate-window protocol', () => {
    it('keeps each protection scope at20 with exact dynamic union', () => { const rows = rowsFromReport(report()), a = auditFor(rows), b = planBatches(rows, a); expect(b.map(x => x.rows.length)).toEqual([2, 1]); exactUnion(b.map(x => x.rows), rows); expect(b.map(x => x.bounds['filled-return'])).toEqual([20, 10]); });
    it('keeps zero-weight cases and rejects a file above capacity', () => { const rows = rowsFromReport(report(['one.spec.ts', 'one.spec.ts', 'one.spec.ts'])), a = auditFor(rows, 0); expect(planBatches(rows, a)[0].rows).toHaveLength(3); a.files['one.spec.ts'].bounds = bounds(10); expect(() => planBatches(rows, a)).toThrow(/File exceeds/); });
    it('rejects missing/duplicate/extra membership rather than trusting total', () => { const rows = rowsFromReport(report()); for (const groups of [[rows.slice(1)], [[rows[0], rows[0], rows[2]]], [[...rows, { ...rows[0], key: 'extra' }]]])
        expect(() => exactUnion(groups, rows)).toThrow(); });
    it('uses relative full titles without opaque static IDs', () => { const rows = rowsFromReport(report(['native.spec.ts'])); expect(testList(rows)).toBe('[chromium] › native.spec.ts › case0\n'); expect(testList(rows)).not.toContain('fresh-'); });
    it('rejects prefix ambiguity and absolute paths from collection', () => { for (const value of ['bad › title', 'bad>title']) {
        const r = report();
        r.suites[0].specs[0].title = value;
        expect(() => rowsFromReport(r)).toThrow();
    } const r = report(['/absolute/private.spec.ts']); expect(() => rowsFromReport(r)).toThrow(); });
    it('preserves exact container deadline and trace; adds only strict retries/workers', () => { expect(options(['--retries=0', '--timeout=30000', '--trace=retain-on-failure']).args).toEqual(['--timeout=30000', '--trace=retain-on-failure', '--workers=2', '--retries=0']); expect(options(['--timeout', '30000']).args).toEqual(['--timeout', '30000', '--workers=2', '--retries=0']); });
    it.each(['--retries=1', '--timeout=0', '--timeout=90001', '--workers=1', '--repeat-each=2', '--shard=1/2', '--config=other.ts', '--test-list=old.txt', '--ui', '--debug', '--reporter=json', '--output=/tmp/elsewhere', '--last-failed'])('fails closed on execution override %s', flag => expect(() => options([flag])).toThrow());
    it('recognizes list/help utilities and preserves filters', () => { expect(options(['--list']).utility).toBe(true); expect(options(['--help']).utility).toBe(true); expect(options(['native.spec.ts', '--grep', 'case']).args.slice(0, 3)).toEqual(['native.spec.ts', '--grep', 'case']); });
    it('rejects global errors, retry config and repeat-each registration', () => { for (const change of [{ errors: [{ message: 'failure' }] }, { config: { workers: 2, projects: [{ retries: 1, repeatEach: 1 }] } }, { config: { workers: 2, projects: [{ retries: 0, repeatEach: 2 }] } }])
        expect(() => rowsFromReport({ ...report(), ...change })).toThrow(); });
    it('preserves original body deadline without replacing container30s base', () => { const rows = rowsFromReport(report(['pa-married-native.spec.ts'], 30000)), a = auditFor(rows), r = completed(rows); a.files[rows[0].file].bodyTimeoutMs = 180000; r.suites[0].specs[0].tests[0].timeout = 180000; expect(reconcile(r, rows, a, 0).failed).toBe(0); r.suites[0].specs[0].tests[0].timeout = 90000; expect(() => reconcile(r, rows, a, 0)).toThrow(/deadline/); });
    it('rejects retries, added skip, unknown exit and missing attempt', () => { const rows = rowsFromReport(report(['one.spec.ts'])), a = auditFor(rows); for (const mutate of [(r:ReturnType<typeof report>) => { r.suites[0].specs[0].tests[0].results[0].retry = 1; }, (r:ReturnType<typeof report>) => { r.suites[0].specs[0].tests[0].results[0].status = 'skipped'; }, (r:ReturnType<typeof report>) => { r.suites[0].specs[0].tests[0].results = []; }]) {
        const r = completed(rows);
        mutate(r);
        expect(() => reconcile(r, rows, a, 0)).toThrow();
    } expect(() => reconcile(completed(rows), rows, a, null)).toThrow(); });
    it('does not treat a count-only report or wrong exit as success', () => { const rows = rowsFromReport(report(['one.spec.ts'])), a = auditFor(rows); expect(() => reconcile(completed([{ ...rows[0], id: 'wrong-id' }]), rows, a, 0)).toThrow(); expect(() => reconcile(completed(rows, true), rows, a, 0)).toThrow(); });
    it('uses61s natural windows from prior close with unchanged single executions', async () => { const rows = rowsFromReport(report()), a = auditFor(rows), f = fake(rows, a); const summary = await runSchedule({ batches: f.batches, expected: rows, audit: a, io: f.io }); expect(summary.status).toBe('PASS'); expect(f.events).toEqual([['wait', 61000], ['run', 0], ['receipt', 1], ['wait', 61000], ['run', 1], ['receipt', 2], ['cleanup']]); });
    it('retains assertion failure and continues independent remaining batch without retry', async () => { const rows = rowsFromReport(report()), a = auditFor(rows), f = fake(rows, a); f.io.run = async (b, i) => { f.events.push(['run', i]); return { exit: i === 0 ? 1 : 0, report: completed(b.rows, i === 0) }; }; const r = await runSchedule({ batches: f.batches, expected: rows, audit: a, io: f.io }); expect(r).toMatchObject({ status: 'FAIL', caseCount: 3, batchesCompleted: 2, failed: 1 }); expect(f.events.filter(x => x[0] === 'run')).toEqual([['run', 0], ['run', 1]]); });
    it('stops unknown outcomes, wall-clock rollback, source drift and cleanup failure', async () => {
        const rows = rowsFromReport(report()), a = auditFor(rows);
        for (const failure of ['unknown', 'clock', 'source', 'cleanup']) {
            const f = fake(rows, a);
            if (failure === 'unknown')
                f.io.run = async () => { throw Error('unknown child'); };
            if (failure === 'clock')
                f.io.now = () => ({ mono: 100000, wall: 0 });
            if (failure === 'source')
                f.io.identity = async () => { throw Error('source drift'); };
            if (failure === 'cleanup')
                f.io.cleanup = async () => false;
            const r = await runSchedule({ batches: f.batches, expected: rows, audit: a, io: f.io });
            expect(r.status).toBe('FAIL');
            if (failure !== 'cleanup')
                expect(r.batchesCompleted).toBe(0);
        }
    });
    it('detects real changed and added source files without reading outside declared scope', async () => { const root = await mkdtemp(path.join(tmpdir(), 'browser-source-')); try {
        await mkdir(path.join(root, 'source'));
        await writeFile(path.join(root, 'source', 'one.ts'), 'first');
        const first = await snapshot(root, ['source']);
        await writeFile(path.join(root, 'source', 'one.ts'), 'changed');
        expect(await snapshot(root, ['source'])).not.toEqual(first);
        await writeFile(path.join(root, 'source', 'two.ts'), 'new');
        expect(Object.keys(await snapshot(root, ['source']))).toHaveLength(2);
        await expect(verifyAudit(root, { sourceDirs: [], sourceFiles: [], sourceHashes: {} })).rejects.toThrow(/closure/);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    } });
    it('binds full collection to explicit weights, original five hosted skips and reviewed runtime deadlines', () => {
        const r = report(['one.spec.ts', ...Array(5).fill('hosted-happy-paths.spec.ts')]);
        for (const s of r.suites.slice(1))
            s.specs[0].tests[0].expectedStatus = 'skipped';
        const rows = rowsFromReport(r), a = auditFor(rows);
        a.files['hosted-happy-paths.spec.ts'].skippedTitles = rows.filter(x => x.file === 'hosted-happy-paths.spec.ts').map(x => x.titles);
        auditCollection(rows, a);
        expect(() => auditCollection([...rows, { ...rows[0], file: 'new.spec.ts', key: 'new' }], a)).toThrow(/Unaudited/);
        expect(() => auditCollection(rows.slice(1), a)).toThrow();
        expect(() => auditCollection([{ ...rows[0], expectedStatus: 'skipped' }, ...rows.slice(1)], a)).toThrow(/Skip/);
        a.files['one.spec.ts'].bodyTimeoutMs = 180000;
        expect(() => auditCollection(rows, a)).toThrow(/timeout/);
    });
    it('retains only safe execution environment and selected Python', () => { const e = environment({ PATH: 'safe', TAX_ENGINE_PDF_TEST_PYTHON: 'selected-python', OPENAI_API_KEY: 'synthetic-sensitive', DATABASE_URL: 'synthetic-sensitive', NODE_OPTIONS: '--inspect', PLAYWRIGHT_BASE_URL: 'https://foreign.test' }); expect(e.TAX_ENGINE_PDF_TEST_PYTHON).toBe('selected-python'); expect(e.TAX_ENGINE_DEPLOYMENT_MODE).toBe('self-host'); for (const k of ['OPENAI_API_KEY', 'DATABASE_URL', 'NODE_OPTIONS', 'PLAYWRIGHT_BASE_URL'])
        expect(e).not.toHaveProperty(k); });
    it('binds only the same running job-owned container/image/revision and preserves no lifecycle capability', () => { const id = 'a'.repeat(64), image = 'sha256:' + 'b'.repeat(64), revision = 'c'.repeat(40); expect(containerProof(`${id} ${image} true ${revision}\n`, image, revision)).toEqual([id, image, 'true', revision]); for (const text of [`${id} ${image} false ${revision}`, `${id} sha256:${'d'.repeat(64)} true ${revision}`, `${id} ${image} true ${'e'.repeat(40)}`, 'malformed'])
        expect(() => containerProof(text, image, revision)).toThrow(); });
    it('rejects implicit environment-file existence without opening its contents', async () => { const root = await mkdtemp(path.join(tmpdir(), 'browser-env-')); try {
        await mkdir(path.join(root, 'apps', 'web'), { recursive: true });
        await writeFile(path.join(root, '.env.local'), 'synthetic value');
        await expect(noEnvFiles(root)).rejects.toThrow(/Implicit/);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    } });
    it('runs the actual package wrapper PDF probe before delegating browser flags without launching Python or browser', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'browser-wrapper-'));
        try {
            const trace = path.join(dir, 'trace.jsonl'), mock = path.join(dir, 'child.mjs'), runner = path.join(dir, 'runner.mjs'), hook = path.join(dir, 'hook.mjs');
            await writeFile(mock, `import{appendFileSync}from'node:fs';export function spawnSync(f,a){appendFileSync(process.env.TRACE,JSON.stringify({probe:a,file:f})+'\\n');return{status:0};}`);
            await writeFile(runner, `import{appendFileSync}from'node:fs';export async function main(a,o){appendFileSync(process.env.TRACE,JSON.stringify({browser:a,python:o?.parentEnv?.TAX_ENGINE_PDF_TEST_PYTHON})+'\\n');return 0;}`);
            await writeFile(hook, `import{registerHooks}from'node:module';registerHooks({resolve(s,c,n){if(s==='node:child_process')return{url:${JSON.stringify(new URL('file://' + mock).href)},shortCircuit:true};if(s==='./run-browser-tests.mjs')return{url:${JSON.stringify(new URL('file://' + runner).href)},shortCircuit:true};return n(s,c);}});`);
            const child = spawnSync(process.execPath, ['--import', hook, new URL('../../scripts/run-tests.mjs', import.meta.url).pathname, '--browser', '--timeout=30000', '--retries=0'], { env: { TRACE: trace }, encoding: 'utf8' });
            expect(child.status).toBe(0);
            const events = (await readFile(trace, 'utf8')).trim().split('\n').map(line=>JSON.parse(line));
            expect(events).toHaveLength(2);
            expect(events[0].probe).toEqual(['-c', "import pypdf; assert pypdf.__version__ == '6.10.0'"]);
            expect(events[1].browser).toEqual(['--timeout=30000', '--retries=0']);
            expect(events[1].python).toBe(events[0].file);
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
