# Current 2026 upgrade status

The latest tax package, `294b3fe8`, preserves unknown nonitemizer-only charity
answers on explicitly itemized 2026 returns. GitHub unit and coverage each
passed 29,472 tests with 88.32% branch coverage. The browser source hashes have
been corrected after a preflight failure. Automatic production builds are
disabled. The 2026 public release still needs qualification.
[Charitable election evidence](upgrade-2026-progress.md#november-19-explicit-itemization-and-charitable-recipient-answers).

The guided recovery commit, `fa718e69`, checks that a local guided edit
saved before switching to advanced mode. The regression restores the corrected
$43,000 AGI from encrypted backup. A separate regression covers a rejected
restart. The exact app passed 29,471 tests each in unit and coverage, nine
static and build checks, 650 local browser cases, and the protected Preview
workspace lifecycle.
[Guided save and reset evidence](upgrade-2026-progress.md#november-19-local-guided-save-and-reset-recovery).

The current browser tests at `7459c23d` use synchronous request
assertions in two lifecycle files. All four affected cases passed locally
with the same 30-second deadline. Strict AMD64 passed all four affected
cases and recorded four Ohio deadlines elsewhere in the suite.
[Trace and test evidence](upgrade-2026-progress.md#november-19-browser-request-checks-and-trace-overhead).

Resume with `latestItemizedCharityElection`, `latestBrowserRequestAssertions`
and `latestLocalGuidedRecovery` under
`activeContinuation.nov19TaxAndBrowserContinuation` in
[the checkpoint](upgrade-2026-checkpoint.json) and the first entries in
[the progress log](upgrade-2026-progress.md). Read the named package only.
Keep a single watcher for each run. After compaction, retain the source commit,
live run IDs, dirty owned files, next action and evidence paths.
The [execution brief](upgrade-2026-execution-brief.md) remains the complete scope.

| Package | Verified state and next action |
| --- | --- |
| Form 8889 | The internal 2026 projection uses the pinned final blank for verified stable full-year coverage and ordinary HSA contributions and distributions. It passed 153 affected tests and independent engineering review. Public exports require final applicable instructions, parent-return transfer verification and qualified human review. [Projection evidence](upgrade-2026-progress.md#november-19-ordinary-form-8889-review-projection). |
| Global checks | Exact `7459c23d` passed all six CI jobs, including 29,471 tests each in unit and coverage, and 88.32% branch coverage against 85%. The Docker workflow passed. [CI](https://github.com/utilityfueled/tax-engine/actions/runs/44607164094) · [Docker](https://github.com/utilityfueled/tax-engine/actions/runs/44607163920). |
| Marketplace statements | Form 8962 holds explicitly wrong coverage years, voided forms and duplicate policy statements. Same-year correction status is carried through ordinary, shared, marriage, and health coordination inputs. The new coverage-year check passed 372 affected tests and 63 independent tests. Exact `3265ae7a` passed local unit and coverage (29,445 tests each, 88.28% branches) and local managed browser (650 passes and five planned skips). [Coverage-year evidence](upgrade-2026-progress.md#november-19-marketplace-coverage-year-binding) · [Correction and void evidence](upgrade-2026-progress.md#november-19-form-1095-a-correction-and-void-handling). |
| Form 1099-OID | Exact `3530f94f` holds wrong reporting years in the ordinary 2025 return. Matching and undated historical statements retain their taxable interest and withholding. The affected run passed 411 tests across 29 suites and the independent scoped run passed six checks. [Reporting-year evidence](upgrade-2026-progress.md#november-19-form-1099-oid-reporting-year-binding). |
| Form 1099-SA | Federal and standalone Schedule 1 block an explicitly wrong distribution year before adding HSA amounts. Matching and undated HSA statements and existing non-HSA boundaries retain their treatment. Exact `473fe088` passed 938 affected tests and independent engineering review. [Distribution-year evidence](upgrade-2026-progress.md#november-19-form-1099-sa-distribution-year-binding). |
| Form 1099-B | Exact `7f55ca05` requires reconciliation for wrong-year or invalid original brokerage dates, including compact and whitespace-delimited date text. It preserves undated legacy rows and genuine summary labels. 393 affected tests passed. [Date-format evidence](upgrade-2026-progress.md#november-19-brokerage-date-format-reconciliation) · [Legacy correction](upgrade-2026-progress.md#november-19-legacy-pennsylvania-broker-compatibility). |
| Form 1099-C | Contradictory statement years require actual discharge reconciliation. Existing verified residence-debt and NOL paths were preserved. Standalone Schedule 1 uses the verified residence-debt exclusion, consistent with the federal return. Exact `6766f450` passed 1,174 affected tests and ten independent controls. [Discharge-year evidence](upgrade-2026-progress.md#november-19-form-1099-c-actual-cancellation-year-reconciliation). |
| IRA charitable distributions | The ordinary 2026 federal method reconciles the original statement and trustee transfer before applying the annual cap and the contribution adjustment per owner. The published example produces $2,500 excluded and $4,000 taxable. Unit and coverage each passed 29,332 tests with 88.28% branch coverage, and three targeted browser cases passed. Professional and state-method qualification remain open. [Implementation evidence](upgrade-2026-progress.md#november-19-ordinary-2026-ira-charitable-distributions). |
| Federal facts and PA/OH | PA and Ohio target full-year resident, part-year resident and nonresident returns. Annual qualification remains open. Federal calculation holds explicitly wrong-year W-2, W-2G and 1099-INT, DIV, MISC and NEC originals while preserving older undated records. Recent changes also require linked Form 1098 account facts, original Form 1099-R checkbox facts, and territory deduction allocation. `4ae1b8e6` adds the source-bound Ohio resident A34 draft. [Statement-year evidence](upgrade-2026-progress.md#november-19-federal-annual-income-statement-years). |
| Statement-year verification | Unit and coverage on `7ea62c3f` each exposed 17 failures. The follow-up `47c1fdaf` passed 272 focused tests and 29,380 tests each in unit and coverage, with 88.28% branches. Its local managed browser run recorded one PDF-inspection subprocess failure. [Follow-up evidence](upgrade-2026-progress.md#november-19-annual-statement-diagnostic-follow-up). |
| Form 1099-K | An explicitly wrong-year statement holds the ordinary return. Matching and undated statements preserve withholding and gross reconciliation. Exact `89aacbe9` passed 29,419 tests each in unit and coverage with 88.28% branch coverage. [Form 1099-K evidence](upgrade-2026-progress.md#november-19-form-1099-k-calendar-year-binding). |
| SSA and railroad retirement | The federal engine holds known wrong payment years and preserves benefits and withholding for matching or undated records. Exact `272d52f5` passed 29,435 tests each in unit and coverage with 88.28% branch coverage. The managed browser run passed 650 cases, with five planned skips. [Payment-year evidence](upgrade-2026-progress.md#november-19-ssa-and-railroad-retirement-payment-years). |
| Form 1098-E | The engine holds explicitly wrong-year student-loan interest statements. Exact `11c62705` passed 29,439 tests each in unit and coverage with 88.28% branch coverage. The local and GitHub managed browser runs each passed 650 cases, with five planned skips. [Form 1098-E evidence](upgrade-2026-progress.md#november-19-form-1098-e-calendar-year-binding). |
| Education claim history | The 2025 federal return requires actual prior AOTC years when the credit can still apply, carries unknown as unknown, and preserves the separate Lifetime Learning Credit. The exact patch passed 2,695 affected tests. The published 2026 Form 8863 already matches the disabled physical candidate. [Education evidence](upgrade-2026-progress.md#november-19-actual-american-opportunity-tax-credit-claim-history). |
| Retirement distribution code | A dated, positive 2025 Form 1099-R with an unchecked IRA/SEP/SIMPLE box now requires the actual Box 7 code. Confirmed Code 1 produces the expected $600 of additional tax, and the Code G rollover is still excluded. The isolated change passed 3,519 affected tests. [Retirement evidence](upgrade-2026-progress.md#november-19-actual-form-1099-r-box-7). |
| Retirement taxable amount | The bounded 2025 Code 1 and 7 cohort requires a supported worksheet when Box 2b is checked and Box 2a is missing. The documented example yields $4,800 taxable from $6,000 gross and preserves $125 withholding. The isolated change passed 3,529 affected tests. [Pension evidence](upgrade-2026-progress.md#november-19-form-1099-r-pension-taxable-amount-evidence). |
| Managed browser | Exact `7459c23d` passed 650 cases with five original skips. The exact app `fa718e69` passed the same counts locally and in GitHub Actions. [Exact GitHub job](https://github.com/utilityfueled/tax-engine/actions/runs/44607163698/job/135853820256). |
| Strict AMD64 browser | Exact `7459c23d` passed 646 cases with five original skips and four Ohio deadlines at 30 seconds. Image smoke, six Compose recovery phases, independent archive import, and container removal passed. [Exact container job](https://github.com/utilityfueled/tax-engine/actions/runs/44607163698/job/135853820864). |
| Browser subprocess | The local `47c1fdaf` job recorded one stalled QSBS PDF inspection. After the correction in `c0219541`, both scoped cases passed, and the local and GitHub managed runs each passed 650 cases with five planned skips and zero failures. [Subprocess evidence](upgrade-2026-progress.md#november-19-qsbs-browser-pdf-subprocess) · [GitHub managed job](https://github.com/utilityfueled/tax-engine/actions/runs/44527370975/job/135571394417). |
| SQLite | Investigation deferred. The historical sanitizer and ABI gates are open. Preserve the unrelated local changes. [Prior evidence](upgrade-2026-progress.md). |
| glibc | Investigation deferred. The paired-profile and release gates require their own exact evidence. [Prior ledger](upgrade-2026-glibc-ifunc-profile-20261117.md). |
| RRTA privacy | Original and compound candidates failed the unchanged 10% threshold; buffered-numeric composition failed its 2% incremental screen. No adoption or repeated negative run. The four-second privacy limit and independent parser remain. [Ledger](upgrade-2026-rrta-python-paired-20261117.md). |
| Hosted account and billing | Protected exact `7f55ca05` passed nine workspace checks and one recovery-email delivery. Test billing was active and no production alias was assigned. Earlier isolated billing on `c0760d2b` verified 1,000 cents issued, two one-cent settlements and 998 retained. Earlier `9b6202e7` recorded a 503 during outage and automatic retry to 200 with one receipt. The exact sole Preview PostgreSQL attachment passed an isolated 11-table migration, rollback, restore and cleanup rehearsal. Current and previous protected builds passed a cross-version workspace save and readback with cleanup. Current password reset completion, app-level billing reconciliation, outages and deployment rollback remain open. [Schema recovery](upgrade-2026-progress.md#november-19-persistent-preview-migration-and-restore). [Exact Preview](upgrade-2026-progress.md#november-19-brokerage-date-format-reconciliation) · [Signed billing](upgrade-2026-signed-credit-provider-20261117.md) · [Earlier Stripe retry](upgrade-2026-stripe-scheduled-retry-20261114.md). |
| AI evaluation | Known usage: 183 calls/$0.27285490; conservative reserved ceiling: $0.47348230. Independent labels, held-out review, repeated qualification and selected-provider evidence remain required. |
| Self-host recovery | The exact `7459c23d` native Linux ARM64 image passed smoke, six Compose recovery phases and container cleanup. Strict browser testing passed 640 cases with five original skips and ten 30-second deadlines. The Mac preflight stopped before boot at 492.10 GiB free against 512 GiB required. [Exact ARM64 job](https://github.com/utilityfueled/tax-engine/actions/runs/44607264786/job/135857870145). |

Qualified human tax and AI reviews, applicable final annual forms, and final
hosted evidence remain open. No qualified human has accepted the tax review.
Cybersecurity work is deferred at the owner's direction. The existing release
gates still require independent security/privacy review and advisory
disposition. Gemini requires Google access if selected for qualification.
Formal verification remains excluded. [External actions](upgrade-2026-external-actions.md),
[official-source refresh](upgrade-2026-official-source-refresh-20261117-continuation.md),
[provider catalog](upgrade-2026-provider-catalog-20261117.md).
