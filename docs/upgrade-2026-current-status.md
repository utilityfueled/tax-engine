# Current 2026 upgrade status

Reviewed source through `92ed89d1` is on `main`. Automatic production builds are
disabled. The 2026 public release still needs qualification.

Resume with `activeContinuation.nov19TaxAndBrowserContinuation` in
[the checkpoint](upgrade-2026-checkpoint.json) and the first entries in
[the progress log](upgrade-2026-progress.md). Read the named package only.
Keep a single watcher for each run. After compaction, retain the source commit,
live run IDs, dirty owned files, next action and evidence paths.
The [execution brief](upgrade-2026-execution-brief.md) remains the complete scope.

| Package | Verified state and next action |
| --- | --- |
| Global checks | Exact `e0cc9467` passed 29,205 unit tests with 75 planned skips. Its other combined checks are running. Earlier `49f79555` verification reported 87.88% branch coverage against the 85% gate, nine static passes, six [CI job passes](https://github.com/utilityfueled/tax-engine/actions/runs/44478475858) and a [Docker CI pass](https://github.com/utilityfueled/tax-engine/actions/runs/44478475856). |
| Federal facts and PA/OH | Both states cover resident, part-year and nonresident targets. The recent federal changes require linked Form 1098 lender and account facts, original Form 1099-R checkbox facts, and territory deduction allocation. `4ae1b8e6` adds the source-bound Ohio resident A34 draft. Final forms and qualified independent tax review remain required. |
| Browser | Frozen `49f79555` passed 650 managed cases with five planned skips, zero failures and normal cleanup. Strict `f2311eef` produced 640 passes, ten Ohio 30-second timeouts and five planned skips. Later strict `4ae1b8e6` had seven Ohio deadlines and a Help locator failure. Its matched remote managed job had two RRTA inspection deadlines and the same Help failure. The Help case was corrected in `49f79555`. [Strict diagnostic](https://github.com/utilityfueled/tax-engine/actions/runs/44474753669/job/135392477066) · [Remote matched browser job](https://github.com/utilityfueled/tax-engine/actions/runs/44474753669/job/135392477134). |
| SQLite | Investigation deferred. The historical sanitizer and ABI gates are open. Preserve the unrelated local changes. [Prior evidence](upgrade-2026-progress.md). |
| glibc | Investigation deferred. The paired-profile and release gates require their own exact evidence. [Prior ledger](upgrade-2026-glibc-ifunc-profile-20261117.md). |
| RRTA privacy | Original and compound candidates failed the unchanged 10% threshold; buffered-numeric composition failed its 2% incremental screen. No adoption or repeated negative run. The four-second privacy limit and independent parser remain. [Ledger](upgrade-2026-rrta-python-paired-20261117.md). |
| Hosted account and billing | Protected `49f79555` passed the PostgreSQL workspace lifecycle and sign-out. The prior workspace list matched after cleanup. One recovery email reached the authorized test mailbox for one accepted request. Current reset completion, reconciliation, outages and rollback remain open. Earlier billing on `c0760d2b` verified 1,000 cents issued, two one-cent settlements and 998 retained. [Signed billing ledger](upgrade-2026-signed-credit-provider-20261117.md). |
| AI evaluation | Known usage: 183 calls/$0.27285490; conservative reserved ceiling: $0.47348230. Independent labels, held-out review, repeated qualification and selected-provider evidence remain required. |
| Runtime security and recovery | The exact ARM64 `49f79555` image passed all six ordinary self-host recovery phases using the previously working local Compose connection. Normal cleanup restored the default VM and routes. The earlier Compose start failure is retained in the progress log. The older `c0760d2b` ARM64 run also passed 650 native browser cases with five planned skips. Current strict-platform and advisory gates remain open. [Prior ARM64 evidence](upgrade-2026-arm64-c076-actual-20261117.md). |

[External actions](upgrade-2026-external-actions.md): qualified human tax and AI
reviews, independent security/privacy review and accountable advisory ownership,
selected Google access, and applicable final annual forms. No qualified human
has accepted the tax review. [Picomatch](upgrade-2026-picomatch-security-20261117.md)
remains unfixed. The [official-source refresh](upgrade-2026-official-source-refresh-20261117-continuation.md)
and [provider catalog](upgrade-2026-provider-catalog-20261117.md) are bounded
observations. Formal verification remains excluded.
