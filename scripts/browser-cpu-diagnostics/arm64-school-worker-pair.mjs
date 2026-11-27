import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import {
    auditCollection, containerProof, environment, need, noEnvFiles,
    planBatches, rowsFromReport, runSchedule, testList, verifyAudit,
} from '../run-browser-tests.mjs';
import { recoveryBrowserObservation } from '../browser-recovery-observation.mjs';
import { projectDiagnosticCases } from './fixed-metadata.mjs';
import { readPublicRunJob } from './full-batch.mjs';
import { command, preparePdfBrowserEnvironment, projectCaseResults } from './runner.mjs';
import { projectSchoolCasePhases } from './school-phases.mjs';

const origin = 'http://127.0.0.1:3109';
const school = 'oh-school-district-part-year-native.spec.ts';
const windowNumber = 8;
const caseCount = 131;
// Sorted ID and original body deadline pairs from native run 46014076098, artifact 15228734483.
const windowDigest = '2bb7371be0486a1416d99c48a571e166128d42cc4492c1cbf1d71186d287bcee';
const diagnosticMs = 29.5 * 60_000;
const jobMs = 90 * 60_000;
const cleanupReserveMs = 5.5 * 60_000;
const reportBytes = 64 * 1024 * 1024;

export function selectArm64SchoolWindow(observation, batches, audit, expectedDigest = windowDigest) {
    const { summary } = observation;
    need(summary.status === 'FAIL' && summary.cleanup && summary.batchesCompleted === batches.length
        && summary.caseCount === batches.reduce((sum, batch) => sum + batch.rows.length, 0), 'Incomplete original browser result');
    const batch = batches[windowNumber - 1];
    const original = observation.batches[windowNumber - 1];
    need(original?.batch === windowNumber && original.cases.length === caseCount && batch?.rows.length === caseCount,
        'Original school window changed');
    const byId = new Map(original.cases.map(result => [result.id, result]));
    const digest = createHash('sha256').update(original.cases.map(row => `${row.id}:${row.deadlineMs}\n`).sort().join('')).digest('hex');
    need(byId.size === caseCount && new Set(batch.rows.map(row => row.id)).size === caseCount && digest === expectedDigest
        && batch.rows.every(row => row.expectedStatus === 'passed' && row.timeout === 30_000
            && byId.get(row.id)?.deadlineMs === (audit.files[row.file]?.bodyTimeoutMs ?? row.timeout)), 'Original school case identities or deadlines changed');
    need(batch.rows.some(row => row.file === school && byId.get(row.id)?.failureClue?.category === 'timeout'), 'No school deadline in original result');
    return batch;
}

export function workerArguments(workers, list) {
    need(workers === 2 || workers === 1, 'Invalid worker count');
    return ['test', `--workers=${workers}`, '--retries=0', '--timeout=30000', '--project=chromium',
        '--trace=retain-on-failure', '--test-list', list];
}

export async function runArm64SchoolWorkerPair(batch, audit, io) {
    const legs = [];
    for (const workers of [2, 1]) {
        let receipt;
        const summary = await runSchedule({ batches: [batch], expected: batch.rows, audit, workers, io: {
            ...io,
            run: () => io.run(workers),
            record: ({ start, close, result }) => {
                receipt = { workers, wallMs: Math.round(close.mono - start.mono),
                    cases: projectDiagnosticCases(result.rows, projectCaseResults).map((row, index) => ({
                        ...row, deadlineMs: result.rows[index].timeout, ...projectSchoolCasePhases(result.rows[index]),
                    })) };
            },
        } });
        need(receipt && !summary.error && summary.cleanup && summary.caseCount === batch.rows.length, 'Incomplete worker comparison');
        legs.push({ ...receipt, failed: summary.failed, skipped: summary.skipped });
    }
    return legs;
}

export async function readArm64WorkerJobBudget(env, signal, { fetchResponse = globalThis.fetch, now = Date.now } = {}) {
    const attempt = env.GITHUB_RUN_ATTEMPT;
    need(/^[1-9]\d{0,5}$/u.test(attempt ?? ''), 'Missing Actions run attempt');
    const { job } = await readPublicRunJob(env, signal, { jobName: 'recovery', attempt, fetchResponse });
    need(job && Number.isSafeInteger(job.id) && job.id > 0 && String(job.run_id) === env.GITHUB_RUN_ID
        && String(job.run_attempt) === attempt && job.head_sha === env.GITHUB_SHA
        && job.status === 'in_progress' && job.completed_at === null, 'Unverified active ARM64 recovery job');
    const started = Date.parse(job.started_at);
    const checked = now();
    need(Number.isSafeInteger(started) && Number.isSafeInteger(checked) && started >= 0 && started <= checked,
        'Invalid recorded ARM64 job start');
    const deadline = started + jobMs;
    need(deadline - checked >= diagnosticMs + cleanupReserveMs, 'Insufficient time for optional browser comparison');
    return deadline;
}

async function main(summary, env = process.env, root = fileURLToPath(new URL('../../', import.meta.url))) {
    const { GITHUB_SHA: sourceSha, CANDIDATE_IMAGE_ID: candidateImageId, BROWSER_CONTAINER: expectedContainerId } = env;
    need(process.platform === 'linux' && process.arch === 'arm64' && env.GITHUB_ACTIONS === 'true'
        && env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_JOB === 'recovery'
        && env.GITHUB_REPOSITORY === 'utilityfueled/tax-engine' && env.GITHUB_REF === 'refs/heads/main'
        && env.TAX_BROWSER_ARM64_WORKER_PAIR === 'true' && /^[a-f0-9]{40}$/u.test(sourceSha ?? '')
        && /^sha256:[a-f0-9]{64}$/u.test(candidateImageId ?? '') && /^[a-f0-9]{64}$/u.test(expectedContainerId ?? ''), 'Unavailable native workflow');
    need(typeof summary === 'string' && path.basename(summary) === 'summary.json', 'Expected native summary');

    const controller = new AbortController();
    const { signal } = controller;
    const stop = () => controller.abort();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    let temporary, timer;
    try {
        const jobDeadline = await readArm64WorkerJobBudget(env, signal);
        const availableMs = jobDeadline - Date.now() - cleanupReserveMs;
        need(availableMs >= diagnosticMs, 'Insufficient time for optional browser comparison');
        timer = setTimeout(stop, diagnosticMs);
        await noEnvFiles(root);
        const observation = await recoveryBrowserObservation({ directory: path.dirname(summary), sourceSha, candidateImageId, expectedContainerId });
        const audit = JSON.parse(await readFile(path.join(root, 'scripts/browser-request-budgets.json'), 'utf8'));
        const identity = async () => {
            need(!signal.aborted, 'Diagnostic deadline reached');
            await verifyAudit(root, audit);
            const head = await command('git', ['rev-parse', 'HEAD'], { cwd: root, signal, timeout: 10_000 });
            const diff = await command('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: root, signal, timeout: 10_000 });
            const state = await command('docker', ['inspect', '--format', '{{.Id}} {{.Image}} {{.State.Running}} {{index .Config.Labels "org.opencontainers.image.revision"}}', expectedContainerId],
                { cwd: root, signal, timeout: 10_000 });
            need(head.exit === 0 && head.stdout.trim() === sourceSha && diff.exit === 0 && state.exit === 0
                && containerProof(state.stdout, candidateImageId, sourceSha)[0] === expectedContainerId, 'Diagnostic source or image changed');
        };
        await identity();
        temporary = await mkdtemp(path.join(env.RUNNER_TEMP, 'arm64-school-worker-pair-'));
        const app = path.join(root, 'apps/web');
        const cli = path.join(app, 'node_modules/@playwright/test/cli.js');
        const browserEnv = await preparePdfBrowserEnvironment(root, { ...environment(env),
            PLAYWRIGHT_BASE_URL: origin, TAX_BROWSER_SCHOOL_PHASES: '1' }, signal);
        need(browserEnv, 'Browser PDF prerequisite unavailable');
        const collected = await command(process.execPath, [cli, 'test', '--workers=2', '--retries=0', '--timeout=30000',
            '--project=chromium', '--list', '--reporter=json'], { cwd: app, env: browserEnv, signal, max: reportBytes });
        need(collected.exit === 0, 'Cannot recollect original browser cases');
        const rows = rowsFromReport(JSON.parse(collected.stdout));
        auditCollection(rows, audit);
        const batch = selectArm64SchoolWindow(observation, planBatches(rows, audit), audit);
        const list = path.join(temporary, 'window.txt');
        await writeFile(list, testList(batch.rows), { flag: 'wx', mode: 0o600 });
        const legs = await runArm64SchoolWorkerPair(batch, audit, {
            identity, alive: () => !signal.aborted, now: () => ({ mono: performance.now(), wall: Date.now() }),
            sleep: ms => pause(ms, null, { signal }), cleanup: () => !signal.aborted,
            run: async workers => {
                const report = path.join(temporary, `result-${workers}.json`);
                const result = await command(process.execPath, [cli, ...workerArguments(workers, list), '--reporter=json',
                    '--output', path.join(temporary, `artifacts-${workers}`)], {
                    cwd: app, signal, timeout: diagnosticMs, max: reportBytes, stopSignal: 'SIGINT', stopGraceMs: 8_000,
                    env: { ...browserEnv, PLAYWRIGHT_JSON_OUTPUT_FILE: report,
                        PLAYWRIGHT_LAST_RUN_OUTPUT_FILE: path.join(temporary, `last-run-${workers}.json`) },
                });
                const stat = await lstat(report);
                need(stat.isFile() && stat.size <= reportBytes, 'Invalid diagnostic report');
                return { exit: result.exit, report: JSON.parse(await readFile(report, 'utf8')) };
            },
        });
        return { qualification: 'NONQUALIFYING_DIAGNOSTIC', originalFailureSuperseded: false, sourceSha, candidateImageId,
            summarySha256: observation.summarySha256, originalBatch: windowNumber, caseDeadlineDigest: windowDigest,
            originalFailed: observation.summary.failed, configuredDeadlineMs: 30_000, retries: 0,
            limitation: 'The fixed run order and warmed container can affect timing.', legs };
    } finally {
        clearTimeout(timer);
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
        if (temporary) await rm(temporary, { recursive: true, force: true });
    }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    try {
        process.stdout.write(`${JSON.stringify(await main(process.argv[2]), null, 2)}\n`);
    } catch {
        process.stderr.write('Optional native browser comparison unavailable.\n');
        process.exitCode = 1;
    }
}
