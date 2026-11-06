# Bounded PDF parse and save batches

## Change and boundary

The existing PDF template/output loader now uses pdf-lib's `ParseSpeeds.Medium`
and output saving uses `objectsPerTick: 500`. Installed pdf-lib 1.17.1 defines
Medium as 500 parsed objects per yield; the earlier defaults were 100 for
parsing and 50 for saving. Both paths retain finite yield points. This is an
object-count scheduling choice, not a wall-clock latency guarantee.

The one owned runtime file is `src/pdf/pdf-utils.ts`, SHA256
`5124564f4682d06ac48f499b7e03970b92023394c4f4511c995071e699a7455e`.
Field mappings, serialization and appearance defaults, whole-dollar rules,
redaction, review notices, readiness guards and invalid-input handling are
unchanged. This helper handles the application's existing template/output
flow; it does not add a raw upload or provider path. The dependency version,
per-test deadlines, worker policy and coverage collection remain unchanged.

## Verification

The private candidate was rebased onto `39a8fe28`, whose base helper was
byte-identical to the original diagnostic base `496f6444`. All 88 tests in the
twelve previously failing CI suites pass under coverage instrumentation with
one worker. That selected run exits 1 for the unchanged full-project coverage
thresholds and does not establish a coverage pass. The remaining PDF cohort
passes 1,269 tests in 196 files; root types and scoped lint pass. The check
receipt is `.local/upgrade-evidence/ci-performance-final-checks.json`, SHA256
`cadc8071a4c8357322d0ec773b6aad9c6fa91048800dd51c07dbbcb25db82adb`.
These private checks included the separately reviewed evaluation-report reuse.

A fixed-date differential applied synthetic field writes and the existing
review notices to Forms 1040, Schedule A, 8962, 7206, 8995, 6251 and 8949. All
seven whole PDF files, spanning 686 fields, are byte-identical before and after
the scheduling change. The receipt is
`pdf-bounded-batching-byte-comparison/checks.json`, SHA256
`1c06d09ed6ff6bf26ef94f218d9765527b526664bac666ad7614583f45471f5b`.

Independent agent review passed 53 tests in three files, including three
private cases, with one worker. A 552-field, six-page synthetic packet with
more than 500 indirect objects and a flattened Form 8962 were byte-identical
to the baseline. Controls cover original fields, page bounds, checkboxes,
review notices, input immutability, redaction before appearance generation,
invalid-input warning restoration and the pre-I/O 2026 guard. The author hash
remained unchanged. Report `pdf-bounded-batching-independent-review.json` has
SHA256 `17c07b61abca04a7465d9cb678ae81f15a1eabd07f8245b56d3a3f8aae82745d`.

The reviewer's first synthetic privacy fixture generated a sensitive appearance
before clearing its field. Both byte-identical versions retained that old
unreferenced appearance. The retained failing probe was corrected to use the
application's existing redact-before-render boundary; no product change was
needed. This establishes only the tested boundary, not general absence of PII.

Local packet profiles showed less scheduling overhead, but do not establish
that the remote CI failures are resolved or guarantee browser responsiveness.
Final integrated coverage, browser and runtime/recovery evidence is still
required. These controls qualify no new form revision or filing scenario.

Main integration onto `6d015f1d` passes five tests in three files covering the
utility and the newly delivered health source/PDF/workspace consumers, with
one worker. The runtime blob matches the independently reviewed hash. The
main log is `parent-pdf-bounded-batching-main-tests.log`; the preceding health
and AI packages and all unrelated files are preserved.
