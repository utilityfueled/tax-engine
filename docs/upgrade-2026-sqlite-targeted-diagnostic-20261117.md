# Targeted SQLite failure diagnostic — November 17, 2026

The manual AMD64 diagnostic is implemented and locally checked. It has not been dispatched or run against a Docker daemon. It does not qualify a SQLite package, replace the original test suites, or accept a security risk.

The preceding nonroot investigation, GitHub Actions run `44047637765`, built the original Debian baseline successfully, then failed its original full test suite. Six explicit test failures preceded a fatal recovery-test error. The candidate, regression and sanitizer stages were not reached. The saved source analysis supports two build/expectation differences: Debian enables `SQLITE_ALLOW_ROWID_IN_VIEW`, and its default maximum-page-size patch changes the page-size expectation. The OOM case `recoverfault2-2-oom-transient.2330` and `join8-1010` remain unresolved. Missing DBPAGE support in the linked core is a hypothesis to measure, not a demonstrated cause of the recovery failure.

The diagnostic builds the authenticated, unpatched Debian SQLite baseline with the prior package inventory, then runs the unchanged `join8.test` and `recoverfault2.test` under the original nonroot test fixture. A separate OOM observer records only the exact case's statement classes, lengths and NULL-token booleans. That observer can affect later allocation behavior, so its output supplements the original run and cannot replace it.

The linked-core probe records the selected local shared library, source identity, compile options and DBPAGE module availability. The original CLI wrapper, ELF dependencies and loader initialization are retained. Stock or foreign library selection fails admission. A small synthetic `.recover` retains its real output and status. Only when the baseline local core confirms DBPAGE is absent does a separate source tree add `-DSQLITE_ENABLE_DBPAGE_VTAB`; every other compiler flag and its order must match after normalizing the two owned build paths. This alternate diagnostic build is not a runtime image.

The opt-in workflow is [sqlite-targeted-diagnostic-amd64.yml](../.github/workflows/sqlite-targeted-diagnostic-amd64.yml). It accepts an exact full default-branch source commit and uses the inherited source controller's source, engine, resource and cleanup guards. Its limits are 30 minutes for the job, 27 minutes for the controller including a three-minute cleanup reserve, 20 GiB initial disk space and a 2 GiB reserve. It preserves initial images, uses exact owned resources and normal cleanup, and uploads diagnostic evidence for three days. It does not push an image or alter engine privileges.

Adoption validation passed all ten focused controls, including real isolated Tcl and Python projection controls, both Node syntax checks, Bash syntax, Python AST parsing and scoped ESLint. The workflow, recipe and reference files match the independently reviewed source packet. Adoption changes are limited to test-location paths, an explicit Node `URL` import and removal of an unused destructured binding; the source lookup still runs unchanged.

Actual original tests and recovery commands may still fail. Their statuses remain evidence, and all original full-suite, candidate, regression, sanitizer and runtime qualification gates remain outstanding.


Source manifest `73efeb52e7ccb582b3ca6a446343a762aa62b742fd58a0bdf8846748b76001e0`;
independent source review
`e801c192cca6f06fc893ef391384d80bba4be3c247e612139ea483020d26847d`;
independent final adoption acknowledgment
`15566b56681ed29df0225f618ab1cad73459cdd63dd7f5b85281d670fe08146c`.
The workflow runs the same ten inert controls before the actual diagnostic.
