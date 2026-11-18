# Current 2026 upgrade status

The goal is active and unqualified. Reviewed source packages are pushed to `main`.
Automatic production builds are disabled. Production deployment, filing and model
promotion remain unauthorized.

Resume here. Read only `activeContinuation.liveRuns`, `nextActions` and the named
package needed next in [the checkpoint](upgrade-2026-checkpoint.json). Keep resume
reads below 2,000 tokens. Do not print the whole checkpoint or reload completed
investigations. One watcher owns each run; do not redispatch it.
On compaction, keep the resume summary below 2,000 tokens: current commit, live
run IDs and owners, dirty owned files, next action and evidence paths. Link
historical records instead of copying them.
The [execution brief](upgrade-2026-execution-brief.md) remains the complete scope.

| Package | Verified state and next action |
| --- | --- |
| Global checks | CI at `40df910c` passed all six jobs: 29,019 tests and 88.20% branch coverage. The 85% gate is unchanged. CI at `7f189699` also passed all six jobs; CI at `f9a3d1f7` also passed all six jobs; CI at `91dbc3a5` is active. |
| Federal facts and PA/OH | All three residency types remain in scope for both states. Source-bound cases pass; full enabled scenarios, independent expected outputs and applicable final 2026 forms remain required. |
| Strict browser | Web `44235730238` at `40df910c` failed: 648 passed, two failed, five skipped. Two part-year Ohio school cases reached the original 30-second deadline. No request/server/CPU cause is established. Web `44238476326` at `7f189699` failed 636/14/5: twelve 30-second deadlines and two four-second privacy deadlines. Web at `f9a3d1f7` failed 648/2/5 in both modes, at original privacy/school deadlines. Both `91dbc3a5` browser modes stopped before cases on one missing fixture pin; the [repair](upgrade-2026-browser-fixture-accounting-20261118.md) is committed, with actual browser results pending. Preserve stopped [timing investigations](upgrade-2026-original-entry-timing-20261117.md). |
| SQLite | One exact-source Linux full-pair run, `44235763098` at `40df910c`, is active. Reviewed [nested-FROM repair](upgrade-2026-sqlite-nested-rowid-20261118.md) `b0fef69c` passes focused controls and independent host checks. Package, CVE, sanitizer, ABI, GPG and final runtime gates remain. |
| glibc | Run `44227921612` failed six strict XPASS; candidate/CVE/allocator/ABI checks never ran. Exporter fix `1663f9e1` passes 54 Python and 10 Node controls. The [default-off mandatory-PASS profile](upgrade-2026-glibc-mandatory-pass-20261118.md) passes 108/54 Python and 51 Node controls plus independent reviews; fresh paired native run `44248166149` at `91dbc3a5` is active. No waiver or retroactive qualification. [Ledger](upgrade-2026-glibc-ifunc-profile-20261117.md). |
| RRTA privacy | Original and compound candidates failed the unchanged 10% threshold; buffered-numeric composition failed its 2% incremental screen. No adoption or repeated negative run. The four-second privacy limit and independent parser remain. [Ledger](upgrade-2026-rrta-python-paired-20261117.md). |
| Hosted billing | Signed-credit evidence: 1,000 cents issued, two one-cent settlements, 998 retained. Two real provider calls cost $0.0005246. Current isolated controls and cleanup pass; historical cleanup and public-sale qualification remain separate. [Ledger](upgrade-2026-signed-credit-provider-20261117.md). |
| AI evaluation | Known usage: 183 calls/$0.27285490; conservative reserved ceiling: $0.47348230. Independent labels, held-out review, repeated qualification and selected-provider evidence remain required. |
| Runtime security and recovery | [Raw-base removal run](upgrade-2026-postgres-minimal-runtime-20261118.md) `44238508493` passed independent package/ELF/scan review: packages 155→150, ELFs 1,042→1,038, SQLite provider/consumer 1→0. Eight active and one suppressed Critical findings remain. The [DB recovery stage](upgrade-2026-postgres-minimal-db-20261118.md) passed source controls; independent adoption review passed and native run `44243730083` at `f9a3d1f7` passed independent actual review of both init matrices, recovery and recorded cleanup. The [same-source composite](upgrade-2026-minimal-composite-20261118.md) is committed after split source reviews; native evidence is pending. Lower layers and final AMD64/ARM64 recovery/release remain open. |

[External actions](upgrade-2026-external-actions.md): qualified human tax and AI
reviews, independent security/privacy review and accountable advisory ownership,
selected Google access, and applicable final annual forms. No qualified human
has accepted the tax review. [Picomatch](upgrade-2026-picomatch-security-20261117.md)
remains unfixed. The [official-source refresh](upgrade-2026-official-source-refresh-20261117-continuation.md)
and [provider catalog](upgrade-2026-provider-catalog-20261117.md) are bounded
observations. Formal verification remains excluded.
