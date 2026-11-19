# Current 2026 upgrade status

The latest reviewed tax change on `main` is `6e21266e`. Automatic production builds are
disabled. The 2026 public release still needs qualification.

Resume with `activeContinuation.nov19TaxAndBrowserContinuation` in
[the checkpoint](upgrade-2026-checkpoint.json) and the first entries in
[the progress log](upgrade-2026-progress.md). Read the named package only.
Keep a single watcher for each run. After compaction, retain the source commit,
live run IDs, dirty owned files, next action and evidence paths.
The [execution brief](upgrade-2026-execution-brief.md) remains the complete scope.

| Package | Verified state and next action |
| --- | --- |
| Global checks | Exact `e0cc9467` passed unit and coverage with 29,205 passes and 75 planned skips each, 87.88% branch coverage against the 85% gate, and all nine static checks. Full local and remote managed browser runs for that source each passed 650 cases with five planned skips. Its six matching remote CI jobs also passed. Exact `6e21266e` passed 29,286 tests in both unit and coverage, 88.26% branch coverage, all nine static checks, full local browser and the Docker CI build. Earlier `49f79555` also passed six [CI jobs](https://github.com/utilityfueled/tax-engine/actions/runs/44478475858) and [Docker CI](https://github.com/utilityfueled/tax-engine/actions/runs/44478475856). |
| Federal facts and PA/OH | Both states cover resident, part-year and nonresident targets. The recent federal changes require linked Form 1098 lender and account facts, original Form 1099-R checkbox facts, and territory deduction allocation. `4ae1b8e6` adds the source-bound Ohio resident A34 draft. Final forms and qualified independent tax review remain required. |
| Browser | Exact `6e21266e` passed 650 local managed cases with five planned skips. Its remote managed job hit two RRTA inspection deadlines and strict AMD64 hit eight Ohio deadlines. The original limits are in force. The retained `e0cc9467` ARM64 app passed 650 native cases with five skips and normal restoration. [Current remote Web](https://github.com/utilityfueled/tax-engine/actions/runs/44492030573). |
| SQLite | Investigation deferred. The historical sanitizer and ABI gates are open. Preserve the unrelated local changes. [Prior evidence](upgrade-2026-progress.md). |
| glibc | Investigation deferred. The paired-profile and release gates require their own exact evidence. [Prior ledger](upgrade-2026-glibc-ifunc-profile-20261117.md). |
| RRTA privacy | Original and compound candidates failed the unchanged 10% threshold; buffered-numeric composition failed its 2% incremental screen. No adoption or repeated negative run. The four-second privacy limit and independent parser remain. [Ledger](upgrade-2026-rrta-python-paired-20261117.md). |
| Hosted account and billing | Protected `e0cc9467` passed the PostgreSQL workspace lifecycle and sign-out. The prior list matched after cleanup. Protected `49f79555` delivered one recovery email for one accepted request. Current reset completion, reconciliation, outages and rollback remain open. Earlier billing on `c0760d2b` verified 1,000 cents issued, two one-cent settlements and 998 retained. [Signed billing ledger](upgrade-2026-signed-credit-provider-20261117.md). |
| AI evaluation | Known usage: 183 calls/$0.27285490; conservative reserved ceiling: $0.47348230. Independent labels, held-out review, repeated qualification and selected-provider evidence remain required. |
| Self-host recovery | Exact `e0cc9467` passed all six ordinary native ARM64 recovery phases against retained `49f79555`. Independent engineering review confirmed both images, stable data and normal VM restoration. The older `c0760d2b` ARM64 run also passed 650 native browser cases with five planned skips. Strict AMD64 and advisory qualification remain open. [Earlier ARM64 evidence](upgrade-2026-arm64-c076-actual-20261117.md). |

[External actions](upgrade-2026-external-actions.md): qualified human tax and AI
reviews, independent security/privacy review and accountable advisory ownership,
selected Google access, and applicable final annual forms. No qualified human
has accepted the tax review. [Picomatch](upgrade-2026-picomatch-security-20261117.md)
remains unfixed. The [official-source refresh](upgrade-2026-official-source-refresh-20261117-continuation.md)
and [provider catalog](upgrade-2026-provider-catalog-20261117.md) are bounded
observations. Formal verification remains excluded.
