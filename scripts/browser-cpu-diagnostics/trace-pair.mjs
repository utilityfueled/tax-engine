import { runSchedule } from '../run-browser-tests.mjs';
import { projectDiagnosticCases } from './fixed-metadata.mjs';
import { projectCaseResults } from './runner.mjs';
import { projectSchoolCasePhases } from './school-phases.mjs';

export const TRACE_PAIR_MS = 18 * 60 * 1000;
const modes = ['retain-on-failure', 'off'];
const diagnostic = { qualification: 'NONQUALIFYING_DIAGNOSTIC', originalFailureSuperseded: false };

export function selectTraceWindow(batches, originalCases, sampledIds) {
  const timeouts = new Set(originalCases.filter(row => sampledIds.has(row.id) && row.failureCategory === 'timeout').map(row => row.id));
  return [7, 6].find(number => batches[number - 1].rows.some(row => timeouts.has(row.id)));
}

export async function runTracePair({ batch, audit, io, save, binding }) {
  const legs = [];
  for (const trace of modes) {
    let receipt, executionMs;
    const summary = await runSchedule({ batches: [batch], expected: batch.rows, audit, io: {
      ...io,
      run: async () => {
        const result = await io.run(trace);
        executionMs = result.executionMs;
        if (!Number.isFinite(executionMs) || executionMs < 0) throw Error('missing-trace-execution-time');
        return result;
      },
      record: ({ start, close, result }) => {
        const cases = projectDiagnosticCases(result.rows, projectCaseResults)
          .map((row, index) => ({ ...row, ...projectSchoolCasePhases(result.rows[index]) }));
        receipt = { trace, start, close, wallMs: close.mono - start.mono, executionMs, cases };
      },
    } });
    let incompleteReason;
    if (summary.error) incompleteReason = 'schedule-or-result-verification-failed';
    else if (!summary.cleanup) incompleteReason = 'cleanup-failed';
    else if (summary.caseCount !== batch.rows.length) incompleteReason = 'case-count-mismatch';
    const complete = !incompleteReason;
    const leg = complete
      ? { ...receipt, complete, passed: summary.caseCount - summary.failed - summary.skipped, failed: summary.failed, skipped: summary.skipped }
      : { trace, complete, incompleteReason, ...(receipt ? { cases: receipt.cases } : {}) };
    legs.push(leg);
    await save(trace === 'off' ? 'trace-off.json' : 'trace-retained.json', { ...binding, ...diagnostic, ...leg });
    if (!complete) break;
  }
  const complete = legs.length === modes.length && legs.every(leg => leg.complete);
  await save('result.json', {
    ...binding,
    ...diagnostic,
    complete,
    executionOrder: modes,
    limitation: 'The fixed run order and cache state can affect timing.',
    legs,
  });
  return complete;
}
