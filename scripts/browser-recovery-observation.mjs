import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectDiagnosticCases } from './browser-cpu-diagnostics/fixed-metadata.mjs';
import { projectCaseResults } from './browser-cpu-diagnostics/runner.mjs';

const count = value => Number.isSafeInteger(value) && value >= 0;
const need = (valid, reason) => {
    if (!valid) throw new Error(reason);
};

async function readReceipt(directory, name) {
    const file = path.join(directory, name);
    const stat = await lstat(file);
    need(stat.isFile() && stat.size <= 8 * 1024 * 1024, 'Invalid recovery receipt');
    const bytes = await readFile(file);
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
}

export async function recoveryBrowserObservation({ directory, sourceSha, candidateImageId }) {
    need(typeof sourceSha === 'string' && /^[a-f0-9]{40}$/u.test(sourceSha)
        && typeof candidateImageId === 'string' && /^sha256:[a-f0-9]{64}$/u.test(candidateImageId), 'Invalid recovery source or image');
    const { value: binding } = await readReceipt(directory, 'source-build.json');
    const proof = binding.externalProof;
    need(binding.externalImageId === candidateImageId && Array.isArray(proof) && proof.length === 4
        && typeof proof[0] === 'string' && /^[a-f0-9]{64}$/u.test(proof[0]) && proof[1] === candidateImageId
        && proof[2] === 'true' && proof[3] === sourceSha, 'Mismatched recovery source or image');

    const { bytes: summaryBytes, value: rawSummary } = await readReceipt(directory, 'summary.json');
    const { status, cleanup, batchesCompleted, caseCount, failed, skipped } = rawSummary;
    need(['PASS', 'FAIL'].includes(status) && typeof cleanup === 'boolean'
        && [batchesCompleted, caseCount, failed, skipped].every(count)
        && batchesCompleted <= 32 && caseCount <= 2000, 'Invalid recovery browser summary');
    need(status !== 'PASS' || (cleanup && failed === 0 && caseCount > 0), 'Inconsistent recovery result');

    const batches = [];
    const ids = new Set();
    let observedFailures = 0;
    let observedSkips = 0;
    for (let number = 1; number <= batchesCompleted; number++) {
        const { value: receipt } = await readReceipt(directory, `batch-${number}-receipt.json`);
        const rows = receipt.result?.rows;
        const startedMs = receipt.start?.mono;
        const finishedMs = receipt.close?.mono;
        need(Number.isFinite(startedMs) && Number.isFinite(finishedMs)
            && startedMs >= 0 && finishedMs >= startedMs, 'Invalid recovery batch timing');
        const durationMs = Math.round(finishedMs - startedMs);
        need(receipt.batch === number && Array.isArray(rows) && rows.length > 0
            && ids.size + rows.length <= caseCount && count(durationMs), 'Invalid recovery batch or case counts');
        need(rows.every(row => typeof row?.id === 'string'), 'Invalid recovery case identifier');
        need(rows.every(row => Array.isArray(row.results)), 'Invalid recovery case results');
        const cases = projectDiagnosticCases(rows, projectCaseResults).map((result, index) => {
            const deadlineMs = rows[index].timeout;
            need(count(deadlineMs) && deadlineMs > 0, 'Invalid recovery case deadline');
            need(!ids.has(result.id), 'Duplicate recovery case');
            ids.add(result.id);
            return { ...result, deadlineMs };
        });
        const batchFailures = cases.filter(result => ['failed', 'timedOut'].includes(result.status)).length;
        const batchSkips = cases.filter(result => result.status === 'skipped').length;
        need(batchFailures === receipt.result.failed && batchSkips === receipt.result.skipped, 'Inconsistent recovery batch counts');
        observedFailures += batchFailures;
        observedSkips += batchSkips;
        batches.push({ batch: number, durationMs, cases });
    }
    need(ids.size === caseCount && observedFailures === failed && observedSkips === skipped, 'Inconsistent recovery case counts');
    return {
        qualification: 'DIAGNOSTIC_ONLY', sourceSha, candidateImageId,
        summarySha256: createHash('sha256').update(summaryBytes).digest('hex'),
        summary: { status, cleanup, batchesCompleted, caseCount, failed, skipped },
        batches,
    };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const [summary, sourceSha, candidateImageId] = process.argv.slice(2);
    try {
        need(typeof summary === 'string' && path.basename(summary) === 'summary.json', 'Expected recovery summary path');
        const result = await recoveryBrowserObservation({ directory: path.dirname(summary), sourceSha, candidateImageId });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch {
        process.stderr.write('Sanitized recovery browser observation unavailable.\n');
        process.exitCode = 1;
    }
}
