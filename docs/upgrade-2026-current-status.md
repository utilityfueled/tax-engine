# Current 2026 upgrade status

The latest reviewed tax packages bind income statement years, education claim
history and the original retirement distribution code.
Automatic production builds are disabled. The 2026 public release still needs
qualification.

Resume with `activeContinuation.nov19TaxAndBrowserContinuation` in
[the checkpoint](upgrade-2026-checkpoint.json) and the first entries in
[the progress log](upgrade-2026-progress.md). Read the named package only.
Keep a single watcher for each run. After compaction, retain the source commit,
live run IDs, dirty owned files, next action and evidence paths.
The [execution brief](upgrade-2026-execution-brief.md) remains the complete scope.

| Package | Verified state and next action |
| --- | --- |
| Global checks | Exact `5a4377f7` passed 29,295 tests in both unit and coverage, 88.27% branch coverage against the 85% gate, all nine static checks, and its Docker CI build. All six prior `6e21266e` CI jobs passed. [Current CI](https://github.com/utilityfueled/tax-engine/actions/runs/44513850774), [Current Docker CI](https://github.com/utilityfueled/tax-engine/actions/runs/44513850788). |
| Marketplace statements | The current package holds voided forms and duplicate policy statements. It carries confirmed correction status through ordinary, shared, marriage, and health coordination inputs. Unit and coverage each passed 29,295 tests with 88.27% branch coverage. Independent engineering review passed 67 tests, all nine static checks passed, and eight targeted browser cases passed on the local production build. [Implementation evidence](upgrade-2026-progress.md#november-19-form-1095-a-correction-and-void-handling). |
| IRA charitable distributions | The ordinary 2026 federal method reconciles the original statement and trustee transfer before applying the annual cap and the contribution adjustment per owner. The published example produces $2,500 excluded and $4,000 taxable. Unit and coverage each passed 29,332 tests with 88.28% branch coverage, and three targeted browser cases passed. Professional and state-method qualification remain open. [Implementation evidence](upgrade-2026-progress.md#november-19-ordinary-2026-ira-charitable-distributions). |
| Federal facts and PA/OH | Both states cover resident, part-year and nonresident targets. Federal calculation holds explicitly wrong-year W-2, W-2G and 1099-INT, DIV, MISC and NEC originals while preserving older undated records. Recent changes also require linked Form 1098 account facts, original Form 1099-R checkbox facts, and territory deduction allocation. `4ae1b8e6` adds the source-bound Ohio resident A34 draft. [Statement-year evidence](upgrade-2026-progress.md#november-19-federal-annual-income-statement-years). |
| Statement-year verification | Unit and coverage on `7ea62c3f` each exposed 17 failures. The follow-up `47c1fdaf` passed 272 focused tests and 29,380 tests each in unit and coverage, with 88.28% branches. Its local browser run continues. [Follow-up evidence](upgrade-2026-progress.md#november-19-annual-statement-diagnostic-follow-up). |
| Education claim history | The 2025 federal return requires actual prior AOTC years when the credit can still apply, carries unknown as unknown, and preserves the separate Lifetime Learning Credit. The exact patch passed 2,695 affected tests. The published 2026 Form 8863 already matches the disabled physical candidate. [Education evidence](upgrade-2026-progress.md#november-19-actual-american-opportunity-tax-credit-claim-history). |
| Retirement distribution code | A dated, positive 2025 Form 1099-R with an unchecked IRA/SEP/SIMPLE box now requires the actual Box 7 code. Confirmed Code 1 produces the expected $600 of additional tax, and the Code G rollover is still excluded. The isolated change passed 3,519 affected tests. [Retirement evidence](upgrade-2026-progress.md#november-19-actual-form-1099-r-box-7). |
| Retirement taxable amount | The bounded 2025 Code 1 and 7 cohort requires a supported worksheet when Box 2b is checked and Box 2a is missing. The documented example yields $4,800 taxable from $6,000 gross and preserves $125 withholding. The isolated change passed 3,529 affected tests. [Pension evidence](upgrade-2026-progress.md#november-19-form-1099-r-pension-taxable-amount-evidence). |
| Browser | `7ea62c3f` passed 650 local managed cases with five planned skips. The marketplace commit `5a4377f7` also passed 650 remote managed cases. Its strict AMD64 run recorded seven Ohio timeouts at the unchanged 30-second test limit. On `47c1fdaf`, remote managed setup stopped when the Ubuntu mirror timed out during Playwright installation, before test execution. [Marketplace Web run](https://github.com/utilityfueled/tax-engine/actions/runs/44513851004), [Follow-up Web run](https://github.com/utilityfueled/tax-engine/actions/runs/44520663325). |
| SQLite | Investigation deferred. The historical sanitizer and ABI gates are open. Preserve the unrelated local changes. [Prior evidence](upgrade-2026-progress.md). |
| glibc | Investigation deferred. The paired-profile and release gates require their own exact evidence. [Prior ledger](upgrade-2026-glibc-ifunc-profile-20261117.md). |
| RRTA privacy | Original and compound candidates failed the unchanged 10% threshold; buffered-numeric composition failed its 2% incremental screen. No adoption or repeated negative run. The four-second privacy limit and independent parser remain. [Ledger](upgrade-2026-rrta-python-paired-20261117.md). |
| Hosted account and billing | Protected `e0cc9467` passed the PostgreSQL workspace lifecycle and sign-out. The prior list matched after cleanup. Protected `49f79555` delivered one recovery email for one accepted request. Current reset completion, reconciliation, outages and rollback remain open. Earlier billing on `c0760d2b` verified 1,000 cents issued, two one-cent settlements and 998 retained. [Signed billing ledger](upgrade-2026-signed-credit-provider-20261117.md). |
| AI evaluation | Known usage: 183 calls/$0.27285490; conservative reserved ceiling: $0.47348230. Independent labels, held-out review, repeated qualification and selected-provider evidence remain required. |
| Self-host recovery | Exact `6e21266e` passed all six native ARM64 recovery phases against retained `e0cc9467`. The combined controller hit a duplicate receipt filename during cleanup. A separate independently reviewed cleanup restored the default VM and stopped the isolated VM normally. Strict AMD64 and advisory qualification remain open. [Recovery evidence](upgrade-2026-progress.md#november-19-combined-arm64-recovery-and-browser-evidence). |

Qualified human tax and AI reviews, applicable final annual forms, and final
hosted evidence remain open. No qualified human has accepted the tax review.
Cybersecurity work is deferred at the owner's direction. The existing release
gates still require independent security/privacy review and advisory
disposition. Gemini requires Google access if selected for qualification.
Formal verification remains excluded. [External actions](upgrade-2026-external-actions.md),
[official-source refresh](upgrade-2026-official-source-refresh-20261117-continuation.md),
[provider catalog](upgrade-2026-provider-catalog-20261117.md).
