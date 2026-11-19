# Current 2026 upgrade status

Reviewed source through `b6bfc3b0` is on `main`. Automatic production builds are
disabled. The 2026 public release still needs qualification.

Resume with `activeContinuation.nov19TaxAndBrowserContinuation` in
[the checkpoint](upgrade-2026-checkpoint.json) and the first entries in
[the progress log](upgrade-2026-progress.md). Read the named package only.
Keep a single watcher for each run. After compaction, retain the source commit,
live run IDs, dirty owned files, next action and evidence paths.
The [execution brief](upgrade-2026-execution-brief.md) remains the complete scope.

| Package | Verified state and next action |
| --- | --- |
| Global checks | Frozen `49f79555` passed full unit and coverage with 29,187 passes and 75 skips each. Branch coverage was 87.88% against the unchanged 85% gate. All nine static checks passed. [Docker CI](https://github.com/utilityfueled/tax-engine/actions/runs/44478475856) passed. The later Form 1098 and Form 1099-R changes have targeted checks. Combined validation is pending. |
| Federal facts and PA/OH | Both states cover resident, part-year and nonresident targets. The recent federal changes require linked Form 1098 lender and account facts, original Form 1099-R checkbox facts, and territory deduction allocation. `4ae1b8e6` adds the source-bound Ohio resident A34 draft. Final forms and qualified independent tax review remain required. |
| Browser | Frozen `49f79555` passed 650 managed cases with five planned skips, zero failures and normal cleanup. Strict `f2311eef` produced 640 passes, ten Ohio 30-second timeouts and five planned skips. The equivalent managed local Ohio cases passed. [Strict CI](https://github.com/utilityfueled/tax-engine/actions/runs/44467417463/job/135368434182) · [Timing diagnostic](https://github.com/utilityfueled/tax-engine/actions/runs/44474753669). |
| SQLite | Investigation deferred. The historical sanitizer and ABI gates are open. Preserve the unrelated local changes. [Prior evidence](upgrade-2026-progress.md). |
| glibc | Investigation deferred. The paired-profile and release gates require their own exact evidence. [Prior ledger](upgrade-2026-glibc-ifunc-profile-20261117.md). |
| RRTA privacy | Original and compound candidates failed the unchanged 10% threshold; buffered-numeric composition failed its 2% incremental screen. No adoption or repeated negative run. The four-second privacy limit and independent parser remain. [Ledger](upgrade-2026-rrta-python-paired-20261117.md). |
| Hosted account and billing | Protected `49f79555` passed the PostgreSQL workspace lifecycle and sign-out. The prior workspace list matched after cleanup. One recovery email reached the authorized test mailbox for one accepted request. Current reset completion, reconciliation, outages and rollback remain open. Earlier billing on `c0760d2b` verified 1,000 cents issued, two one-cent settlements and 998 retained. [Signed billing ledger](upgrade-2026-signed-credit-provider-20261117.md). |
| AI evaluation | Known usage: 183 calls/$0.27285490; conservative reserved ceiling: $0.47348230. Independent labels, held-out review, repeated qualification and selected-provider evidence remain required. |
| Runtime security and recovery | ARM64 self-host proof on `c0760d2b` covered six recovery phases and 650 browser passes with five planned skips. The isolated `49f79555` build passed, then its ordinary rehearsal stopped at the initial Compose start with exit 125. Normal cleanup restored the default VM, routes and baseline resources. The first failure still needs diagnosis. Prior advisory gates remain open. [ARM64 evidence](upgrade-2026-arm64-c076-actual-20261117.md) · [Prior runtime ledger](upgrade-2026-postgres-minimal-runtime-20261118.md). |

[External actions](upgrade-2026-external-actions.md): qualified human tax and AI
reviews, independent security/privacy review and accountable advisory ownership,
selected Google access, and applicable final annual forms. No qualified human
has accepted the tax review. [Picomatch](upgrade-2026-picomatch-security-20261117.md)
remains unfixed. The [official-source refresh](upgrade-2026-official-source-refresh-20261117-continuation.md)
and [provider catalog](upgrade-2026-provider-catalog-20261117.md) are bounded
observations. Formal verification remains excluded.
