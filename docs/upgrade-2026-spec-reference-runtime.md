# Spec-reference validation runtime

The full coverage run at `76e3538` passed 18,158 tests but timed out while checking
all literal spec references. The existing five-second limit remains unchanged.
The AST visitor only traverses children, so it no longer asks TypeScript to
construct unused parent links. Every reference, literal-name assertion, source
file and coverage threshold remains checked.

The unchanged original check also times out in the isolated V8 diagnostic at
7.038 seconds. With parent links disabled, all six tests pass in 3.41 seconds.
Those focused diagnostic commands still fail the global coverage thresholds,
because running only the spec checks exercises none of the production sources;
they are timing evidence, not passing full coverage. A complete run is required.

Six alternating offline scans compare all 824 referenced source files and
13,327 literal names. Every discovered name set is identical. Three parent-link
runs take 497.61–576.68ms; the three child-only runs take 416.92–467.91ms. The
normal focused suite also passes all six tests. Local evidence is retained in
`.local/upgrade-evidence/spec-parser-benchmark.json`,
`spec-parser-original-coverage-diagnostic.log`,
`spec-parser-no-parent-coverage-diagnostic.log` and
`spec-parser-no-parent-tests.log`.

This is a test-runner efficiency correction, not a tax-law or readiness change.
The full failed coverage log remains retained as
`.local/upgrade-evidence/full-coverage-76e3538.log`.

Separate agent review verified both source hashes and the exact diff, including
unchanged traversal and literal predicates. Its six checks pass in 1.07 seconds
(1.57 seconds overall); `federal-spec-parser-review.log` retains the result.

Final integration after `f98f9ed` passes all 34 checks across the literal
reference and spec-validator suites. The reviewed test blob is unchanged.
