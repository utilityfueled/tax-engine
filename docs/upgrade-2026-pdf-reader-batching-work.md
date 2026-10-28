# Completed-file PDF reader batching

The exact `183c1bbc` hosted coverage run timed out in twelve cases at the unchanged five-second deadline. A local run of those same twelve cases passed with and without coverage. That local result does not close the hosted failure.

This package changes only test infrastructure. The K-1 cash-distribution PDF case reads three completed files for each of its two original entity examples. It now invokes the same independent pinned pypdf parser once per entity, reducing six subprocess starts to two. File order, extraction expression, every original assertion, per-entity cleanup, ten-second subprocess bound, and five-second Vitest deadline remain unchanged. All 22 original lines containing assertions are byte-identical. Production code, source fixtures, coverage thresholds, and tax calculations are unchanged.

The new helper uses completed file paths as arguments and ignores stdin. It rejects missing or malformed later files without returning a partial earlier result, validates the returned page-group shape, and keeps the native bounded stdout buffer. Its use is deliberately limited to this small three-file group. Tests independently parse actual PDFs to cover file/page order, duplicate paths, spaces in paths, and missing or malformed files.

## Evidence

All evidence is retained under `.local/upgrade-evidence/`:

- `pdf-coverage-183c-exact-pair-comparison.json` (`e2f12d04b705720bc59f4c22ff1aa61388f2a2f87ef8a2deb476696ceea17187`) records twelve selected passes in each mode. Four unselected skipped cases were initially counted as executed by the evidence wrapper; the original receipts are retained and the comparison corrects that count from the raw reports.
- `pdf-coverage-183c-configuration-inspection.json` (`3af684c0600fdc484a7a66df09679529320057434f378ae3f5c3b59c371d1609`) records the existing one-worker CI commands, default isolation and deadline, and absence of configured heap telemetry. That absence does not establish full-suite heap behavior.
- `pdf-coverage-183c-cpu-profile-analysis.json` (`4c5ddb4de551f0160d092951fb3bb5a0fd53edfb64ad81c04ac9c7f42325e0e3`) attributes approximately 466 ms to parent waits for the six Python readers in both modes. Compression and parsing also contribute material cost. The observed field-lookup cost does not justify a broad mapping rewrite.
- `pdf-coverage-183c-workspace-profile-observations.json` (`5c3fcdb98053310d1766330f1caf3d4f4eca3b0d15f28f418434d5f1d4af6018`) separately profiles an actual two-packet workspace export. It does not reuse the direct K-1 case as evidence of workspace-only costs.
- `pdf-reader-batch-candidate-boundary.json` (`2861fb4e19c793adf199cbd59a938985f2b75e0e35b9a80a1abb6f7e4b8c16f2`) pins the initial three test-source files and unchanged assertions.
- `pdf-reader-batch-evaluation-v2/receipt.json` (`d7d3a883973d5d846a1177a1b8b6f29bf591cc014ed3746adb18873540d0fe6a`) records one opposing-order pair per mode, the complete target cohort, root types and scoped lint. Every baseline and candidate source hash was unchanged during execution.

The normal pair measured 1,224.25 ms before and 1,002.92 ms after (18.1% less test-body time). The reversed-order covered pair measured 1,997.56 ms before and 1,729.53 ms after (13.4% less). These are local samples, not a performance distribution or hosted reliability claim. Normal whole-command time was slightly slower for the candidate because it includes variable import/setup work. Both covered commands exited one solely because this small subset does not meet the unchanged global coverage thresholds; the selected tests passed.

The complete target cohort passed four tests across two files, including the original source-tampering case and two independent-reader controls. Root types and scoped lint passed. The first evaluation wrapper stopped before any Node execution because its SHA helper received a string rather than a Path. The original wrapper and failure receipt remain in `pdf-reader-batch-evaluation/`; only that evidence-path conversion was corrected.

CPU samples cover whole workers, including imports, setup, cleanup and parent waits; they do not measure child Python CPU. Stack categories overlap. Capture follows the [Vitest profiling instructions](https://v4.vitest.dev/guide/profiling-test-performance). No stress repetitions, runtime mapping changes, deadline changes, threshold changes or assertion removals were used. Independent source review and later integrated CI remain separate requirements before calling the timeout work complete.

Parent review independently compares all22 original assertion lines byte for
byte, verifies the patch and completed-file failure behavior, and applies all
four owned files exactly to `bf1e2f1b`. Main passes four tests in two files,
root type checking, and scoped lint with zero errors/three warnings. The main
check receipt SHA-256 is `816fe322315ae90336dde8fefa9d3d07e40e1cd49d60a88c8f4c05b6c7ab4502`.
No production tax/PDF code changed. The outstanding whole-suite CI coverage
timeouts are not claimed resolved by these local focused checks.
