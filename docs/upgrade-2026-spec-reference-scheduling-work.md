# Spec reference test scheduling

The immutable `67ce5a506742783050fb703f1aa5c34c6b0f5559` ordinary suite passes
18,265 tests in 1,083 files. Its full coverage run fails only the test that scans
all spec references: it takes 5,143 milliseconds against the unchanged
five-second test deadline. The other 18,264 tests pass. No passing coverage
percentage is claimed for that failed run. The retained log is
`.local/upgrade-evidence/full-coverage-67ce5a5.log`, SHA-256
`aa684206902277b85b88ca1db541a4dd4b0379d7d7bfdce0734beb08e14d8c9a`.

`tests/spec/validate-testrefs.test.ts` now runs the same reference validation as
one case per spec file. Each file retains every reference, the same AST parser
and shared parsed-name cache, and the same invalid-format, missing-file and
missing-test checks. The quote, comment, parameterized-name and minimum-spec
checks remain. This changes test scheduling and failure attribution; it does
not change source parsing, per-test deadlines, coverage thresholds or exclusions.

The focused command `pnpm test tests/spec/validate-testrefs.test.ts
--maxWorkers=1` passes all 447 cases in 1.13 seconds. Scoped lint has zero errors
and one existing non-null-assertion warning. A new complete coverage run must
still pass on the integrated source. No tax or release qualification follows
from this test-only repair.

Separate agent review verified the unchanged reference checks and exact candidate
SHA-256 `1af6d05eae93944d67b4f1c758bd81a6a245671f78e10736a57d60c7c8159d33`.
Its independent archive also passes all 447 cases. Three injected private specs
then fail for invalid reference format, a missing test file and a missing test
name, while the original 447 checks continue to pass. These negative controls
are review evidence, not committed extra specs. The local review manifest is
`/private/tmp/tax-release-prereq-review-UEk43F/spec-testrefs-independent-review.json`.
