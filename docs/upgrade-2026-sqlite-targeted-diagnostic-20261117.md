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


## Actual diagnostic and observer-permission repair

Run `44158923668` on `c2210167` completed with a failed diagnostic-export
stage. All 82 recorded commands and normal cleanup passed, with no cleanup
errors or deadline overrun; these facts do not turn the diagnostic into a pass.
Original `join8-1010` still fails on view rowid, and the original OOM test still
fails. The instrumented observer did not run: its log reports permission denied
reading the root-owned `0600` Tcl source. Missing metadata correctly held the
controller. The original tests and their failures remain retained.

The separately authenticated baseline and DBPAGE diagnostic libraries both
link locally. Baseline DBPAGE is absent and synthetic `.recover` exits 1; the
single-flag DBPAGE build exposes the module and `.recover` exits 0. This is
bounded causal evidence about recovery support, not original full-suite,
security-candidate or runtime qualification.

The repair stages only the committed, nonsecret Tcl observer as read-only
`0444`, so Docker COPY preserves nonroot readability even under a private host
umask. The three other staged diagnostic inputs remain `0600`; content, hashes,
paths, original suites, runtime privileges, deadlines and normal cleanup are
unchanged. A real staging-filesystem test first fails, then all 11 focused
controls and scoped ESLint pass after the repair. The test verifies exact public
bytes, every staged mode under umask `077`, and exclusive-create refusal.
Saved original result, raw logs, RED and GREEN remain in
`.local/upgrade-evidence/nov17-sqlite-diagnostic-actual-44158923668/`.
Independent source/artifact review approves the narrow fix, with all 11 controls
and two additional file/symlink collision controls passing; no unrelated file
is chmodded or rewritten. Review SHA-256
`d0c38ff9bd3156f5b10a7059a48a3021729f7742bb6ce41ee3f145d8a726dd8f`.
A fresh actual diagnostic remains required.


## Corrected run and exact compile-option literals

The permission-corrected run `44165141626` emits the original OOM observer
metadata successfully and retains its failure; it reaches diagnostic export,
then the metadata validator rejects two genuine linked-core compile options:
`COMPILER=gcc-12.2.0` and `MAX_MMAP_SIZE=0x7fff0000`. Their lower-case compiler
and hexadecimal characters were absent from the initial synthetic fixtures.
The intended admission contract is to require those two keys to equal these
exact pinned toolchain values, while preserving the existing safe grammar for
other options and every source/library/inventory/loader/pairing guard. Other
compiler versions, mapped-memory values and arbitrary lower-case metadata must
remain denied. This diagnostic-only parser correction does not qualify the
original tests, security candidate, ABI or runtime.


The actual-record regression first fails, then all 12 focused tests and scoped
lint pass. Both saved baseline/DBPAGE core records and privacy-bounded OOM
metadata validate. Independent review passes 41 actual/adversarial controls,
reproduces the old parser rejection, and verifies the complete runner inverse
changes only these two exact-key predicates. Review SHA-256:
`4f2edad18b35577878eb00c76faab2a61a63fd53a79116da0c4a20a9a18dc329`.
The recorded remote attempt remains failed; a fresh actual successor is needed.
