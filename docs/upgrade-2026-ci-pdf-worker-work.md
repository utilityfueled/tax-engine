# CI PDF worker scheduling

The public CI run for `b2e1dc9` failed the existing five-second deadlines in `form-8949-digital-reporting.test.ts` and `workspace-marriage-return.test.ts`;18,237other tests passed. The raw failed log and its digest remain in the checkpoint. This is an observed remote failure; the scheduling change below is not a claim that a replacement remote run has already passed.

The complete ordinary suite now uses one test worker in its own30-minute hosted job. The original `Tests and Coverage` job keeps the complete instrumented suite at one worker, its existing30-minute budget and always-uploaded coverage artifact. Both jobs retain the same pinned Node/pnpm/Python setup, frozen dependency install and separate disposable loopback-only PostgreSQL service. Separating the two suites avoids combining their sequential runtime into one job budget. No test is filtered or skipped, and the five-second per-test deadline, assertions, privacy checks and coverage thresholds are unchanged.

Independent agent review found no dropped setup, service, environment, check or artifact. A structural YAML comparison confirms the original coverage job differs only by moving the ordinary invocation into its new job; lint/types/spec/build remain identical. The five existing cases across both affected files pass locally with one worker and the pinned reader. Those local timings and the remote failure log are retained under local `ci-pdf-single-worker-targeted.log` and `ci-b2e1dc9-failed.log`. Exact current full-suite and completed remote evidence still follow; resource scheduling is not tax, hosting or release qualification.

## Complete-suite job budget — October 26

The [coverage job for fdfeedf](https://github.com/utilityfueled/tax-engine/actions/runs/40390607615/job/121810534650)
was canceled after exceeding its 30-minute job limit. GitHub's retained check
annotation explicitly states that cause; no coverage artifact or completed
coverage result was produced. The same run passed all 19,211 ordinary tests
in 1,267 files. Its partial instrumented log also reports 16 failed cases in
twelve suites. Those failures remain unresolved and are not explained away by
the job cancellation.

Only the complete coverage job's wall-clock budget increases to 60 minutes.
Unit tests retain their 30-minute job budget; both suites keep one worker.
The five-second test deadline, every test and assertion, coverage collection,
85% branch threshold and all other thresholds remain unchanged. The additional
budget permits a complete diagnostic result; it is not a coverage pass.

The canceled log, job metadata and annotations are retained under
`.local/upgrade-evidence/remote-fdfeedf-coverage-*`. Their digests and all sixteen
case names are recorded in `remote-fdfeedf-coverage-failure-summary.json`.
Independent agent review (`federal-ci-coverage-timeout-review.json`, SHA256
`cb1f65009553c94706699b114dd77caff1e97b1b91bbd7646112ad3d34eb46cf`)
confirms that parsed workflow semantics differ only at the coverage job budget
and that the test runner, package commands and Vitest configuration are unchanged.
The PDF and evaluation failures are separate internal work. Final complete
local and remote checks, with unchanged readiness gates, remain required.
