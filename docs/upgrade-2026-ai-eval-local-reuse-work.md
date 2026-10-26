# Evaluation report preparation and score reuse

## Change and boundary

A summary previously prepared the same frozen case once for each profile and
rescored the same parsed entry during profile grouping and critical-field
comparison. The summary now prepares each validated case once and reuses each
entry's score within that synchronous call. Both maps are discarded when the
call returns. A later call revalidates its complete corpus, review status,
provenance and changed observations. The standalone scorer is unchanged.

The one owned runtime file is `packages/engine/src/provider-model-eval.ts`,
SHA256 `cf3b0a58c697bf1304a48e21e29da2647201dbb126c424c2442538bc5132e9cf`.
This changes report computation, with no provider calls, tax arithmetic,
pricing, budgets, privacy controls or promotion decisions changed.

## Verification

The private candidate was rebased onto `39a8fe28`; the base runtime file was
byte-identical to the original diagnostic base `496f6444`. Root types and
scoped lint passed. The instrumented cohort containing the twelve previously
failing CI suites passed all 88 tests with one worker. Its process exited 1
because a selected cohort does not meet the unchanged full-project coverage
thresholds. This is a passing diagnostic test cohort, not a coverage pass or
resolution of the remote failures. The full check receipt is
`.local/upgrade-evidence/ci-performance-final-checks.json`, SHA256
`cadc8071a4c8357322d0ec773b6aad9c6fa91048800dd51c07dbbcb25db82adb`.
That private check included the separately reviewed PDF batching candidate.

A separate baseline/candidate differential compared every report field for
empty unreviewed input, 270 repeated synthetic comparisons, changed critical
payloads on the same input object, changed privacy/missing usage, changed
review status, and stale provenance. All reports and two rejection messages
matched; inputs remained unchanged and promotion stayed false. The receipt is
`provider-eval-local-reuse-differential.json`, SHA256
`bb11fd36bc48dbee3362fd11fde9bf8c13b57e65798fb2e9530b4ea59cd543c4`.
The first `tsx` CLI invocation could not create its sandbox IPC pipe; the
retained rerun used `node --import tsx` without changing the probe.

Independent agent review in a separate copy passed 35 tests in three files,
including three private cases, with two workers. Controls cover same-object
mutations, report mutation, missing escalation usage, failed-attempt cost,
preflight provenance, duplicate runs and corpus guards. The reviewed runtime
hash remained unchanged. Report `ai-eval-local-reuse-independent-review.json`
has SHA256 `f9a025a6a48f9540d1a770599dea4e2c293c14a3d976d9f8ff9f54a1e3fcfba8`.
Its first runner stopped before tests because the private copy lacked the
explicit pinned Python setting; the corrected environment and initial log are
retained. No assertion or product change followed that setup failure.

Local timings are diagnostic observations under concurrent work. They do not
establish a CI latency improvement. Final integrated unit, coverage and remote
checks remain required. This software review supplies no human review of the
240 cases, provider account evidence or model qualification.

Main integration onto `2511060a` passes all 32 provider-evaluation/application
tests in two files with one worker. The runtime blob matches the independently
reviewed hash; the health package and all unrelated paths are preserved. The
main log is `parent-ai-eval-local-reuse-main-tests.log`.
