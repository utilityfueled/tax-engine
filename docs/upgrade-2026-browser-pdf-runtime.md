# Browser PDF-reader prerequisite repair

The immutable `4aef633` browser run finished with 340 passes, five hosted-only
skips and two failures. Both failures were the desktop/mobile QSBS review
reader: the downloaded PDF had already returned successfully, but the test
selected system Python without `pypdf`. The original full run remains failed;
a focused rerun does not replace a final integrated browser run.

The root `pnpm test:web` command now uses the same pinned Python/pypdf preflight
as unit and coverage tests. It invokes the installed Playwright CLI from the web
workspace, forwards all test arguments and propagates the child exit status.
The two Web workflow jobs that run browser tests now install Python 3.13 and the
existing hash-pinned PDF test environment before execution. Assertions, deadlines,
retries and readiness controls are unchanged.

Both affected cases pass on the unchanged `4aef633` production server with the
explicit pinned runtime. They also pass through the new launcher with no Python
override, proving default resolution. The unchanged unit path passes 28 spec
validator cases. Scoped script lint passes with zero errors. A missing runtime
fails before browser launch and gives the existing setup instruction.

A separate agent reviewed the four-file implementation and independently checked
default resolution, test selection, argument/environment forwarding, web working
directory, missing-runtime failure and child exit propagation. No actionable
finding remained. Evidence is local synthetic software verification, not hosted
staging or final release qualification.

All evidence paths below are relative to `.local/upgrade-evidence/`.

| Evidence | SHA-256 |
| --- | --- |
| `full-browser-4aef633.log` | `50260e0911bdc90a7a961c577e70542cd7b7cede73b9aa3900dfe97f6a118010` |
| `browser-4aef633-pdf-prerequisite-rerun.log` | `3008d91b77dbde52bb02b27f1952580337cc46066a4a4eae175b6baa733f0d34` |
| `browser-pinned-reader-launcher.log` | `ef70d0c097309663042dca5dd9586152aa3e77fda1ffcec4cfd684ff555cc03c` |
| `browser-launcher-unit-path.log` | `4569224d4dad72cfe34d2a18e621182a79c7bef4de337bd8396912f57d322a75` |
| `browser-pinned-reader-lint.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `facts-review-browser-python-contract.log` | `06fa7e6222250b8c0519111cab482b91d7212d0c6e85331fe0dd2f3d2ece0e55` |
