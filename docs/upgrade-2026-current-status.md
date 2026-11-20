# Current 2026 upgrade status

Federal calculation and standalone Schedule E now hold explicitly future
Schedule K-1 originals before using their amounts. Earlier headers can
cover a fiscal period ending in the return year and remain eligible for
the existing checks. The successor passed the generated inventory, all
9,670 spec references and three type checks.
[Schedule K-1 evidence](upgrade-2026-progress.md#november-20-future-year-schedule-k-1-originals).
Resume from `activeContinuation.nov20FutureScheduleK1Originals` in the
[checkpoint](upgrade-2026-checkpoint.json) for the current commit, run IDs and
required human review.

Form 1040 now rejects negative prior-return overpayment credits before totaling
federal payments. The exact application passed all 29,508 tests in both full
runs, with 88.35% branch coverage against the 85% gate. The full managed
Chromium run passed 650 cases with five planned hosted-only skips. The Docker
build passed.
[Applied overpayment evidence](upgrade-2026-progress.md#november-19-applied-federal-overpayment-credits).

The guided Schedule D worksheet now requires the immediately preceding
return's year and loss ownership for nonzero carryovers. Separate owner shares
reconcile exactly on a joint return, and a separate filer claims only their own
portion of a prior joint loss. The application passed 29,507 unit tests against
PostgreSQL 16.16. After a test-only selector correction, all six affected
desktop and mobile browser cases passed.
[Carryover ownership evidence](upgrade-2026-progress.md#november-19-prior-return-ownership-of-capital-loss-carryovers).

The 2025 federal return preserves unused capital loss for 2026 when taxable
income before the zero floor is negative, including losses at or below the
annual limit. Full-return audit amounts match the worksheet. The mixed-loss
fixture carries $2,400 long term and keeps the printed $3,000 deduction.
The corrected source passes all 29,505 unit tests, including the four
previously affected Ohio commitment files.
[Schedule D evidence](upgrade-2026-progress.md#november-19-capital-loss-carryover-at-or-below-the-annual-limit).

Local unit and coverage on `5cb12a91` passed 29,504 tests each, with 88.35%
branch coverage against the 85% gate. The unit rerun used the original
deadlines. All three type checks, both builds, the spec inventory and 9,665
spec references passed. ARM64 on `e07c84c3` passed smoke, Compose recovery
and cleanup. Ten strict browser cases reached the original deadline. The
latest AMD64 image passed smoke, recovery and cleanup and hit eight of those
same original deadlines.
The current managed Linux run also hit the original saved-PDF deadline in
the two native railroad retirement review cases. Both passed the isolated
macOS replay with the same deadline and normal cleanup.
[Full check and recovery evidence](upgrade-2026-progress.md#november-19-full-application-checks-and-arm64-recovery).

The 2025 Ohio part-year guided interview can collect dated receipts across
a move for one Form 1099-G. Desktop and mobile Chromium entered both
payments, confirmed and reopened the saved evidence, and continued the
interview. The 197 focused tests passed. The fixture allocates only the $600
received during Ohio residency to IT NRC line 12. A separate check read that
amount from the generated reference PDF. The full managed browser run passed
650 runnable cases with five original hosted-only skips and cleanup.
[Ohio payment schedule evidence](upgrade-2026-progress.md#november-19-ohio-unemployment-payments-across-a-move).

Standalone Schedules B and C now hold explicit wrong-year Forms 1099-INT,
1099-DIV and 1099-NEC. Standalone Schedule E checks explicit Form 1099-MISC royalty
years against a known return year. Schedule 1 applies the calendar-year rule to its wage,
interest, dividend, miscellaneous income, Social Security and railroad
retirement benefit sources. Matching and legacy
undated records retain their exact amounts. The fixes were pushed to `main`
after focused verification. [Statement-year evidence](upgrade-2026-progress.md#november-19-standalone-statement-calendar-years) ·
[Schedule E evidence](upgrade-2026-progress.md#november-19-schedule-e-royalty-statement-years).

All ten strict AMD64 browser deadline traces at `d23eabb0` show substantial
time entering ordinary Ohio facts. Several reached review or reload. The
traces do not establish a single slow calculation. No browser checks changed.
[Trace findings](upgrade-2026-progress.md#november-19-ohio-entry-timing-from-exact-linux-failures).

Hosted Gemini billing and evaluation now retain exact verified usage on
rejected responses. Unknown prices and inconsistent counts hold for
reconciliation. The fix passed 89 synthetic tests and independent review.
The generated inventory follow-up passed the exact local and GitHub spec
checks. Its unit and coverage runs each passed 29,493 tests with 88.35%
branch coverage. All six GitHub CI jobs and Docker passed. Both managed
browser runs passed 650 cases with five original hosted skips. The exact
protected Preview passed nine workspace checks.
Strict AMD64 passed smoke and recovery and reached ten browser deadlines.
[Gemini accounting evidence](upgrade-2026-progress.md#november-19-reported-gemini-rejection-usage).

The Ohio guided interview now collects actual dated unemployment proof for
the single-payment part-year case. It checks the statement and owner before
reopening or confirming the return. The saved fixture produced $1,000 on
IT NRC line 12 and a $1,396 credit. Desktop and mobile Chromium on exact
`d33e77d5` saved and reopened the $999 Ohio preview. Its unit and coverage
commands each passed 29,488 tests, with 88.35% branch coverage. Local and
GitHub managed browser runs passed 650 cases each. Strict AMD64 passed 646
with four original 30-second deadlines. Strict ARM64 passed 639 with eleven
original deadlines. Both images passed smoke and Compose recovery. A
full-year nonresident uses a complete out-of-state domicile timeline.
[Guided Ohio evidence](upgrade-2026-progress.md#november-19-guided-ohio-unemployment-payment-proof).

Exact `43956ac0` passed 650 runnable local browser cases. The earlier strict
AMD64 and ARM64 images passed smoke and recovery and still hit the original
browser deadlines in some Ohio and Pennsylvania journeys.
[Exact browser evidence](upgrade-2026-progress.md#november-19-exact-browser-and-recovery-results).

Schedule A now holds positive property tax sourced to an explicitly different
Form 1098 year. Both the actual 2025 return and the internal 2026 worksheet
reproduced the issue. The fix passed 198 focused tests and independent checks.
[Property-tax evidence](upgrade-2026-progress.md#november-19-schedule-a-property-tax-source-year).

The 2025 Ohio canonical return now reconciles one documented unemployment
payment for a part-year resident or full-year nonresident. Part-year
allocation follows the actual date and domicile. The 485 scoped tests include
the June 30 and July 1 boundary and a saved-source replay.
[Ohio evidence](upgrade-2026-progress.md#november-19-ohio-nonresident-and-part-year-unemployment).

The Child Tax Credit checks hold contradictory relationship answers in the
guided and direct calculation paths, including explicit parent and grandparent
labels in raw API returns. The `d52a596b` archive passed nine static and build
checks and 29,477 tests each in unit and coverage, with 88.33% branch coverage.
The raw label follow-up passed 201 focused tests.
The internal ordinary Form 8889 projection at `7fe1a426` uses the final IRS
blank for its verified HSA cohort.
[Child credit evidence](upgrade-2026-progress.md#november-19-child-tax-credit-relationship-checks) ·
[Form 8889 evidence](upgrade-2026-progress.md#november-19-ordinary-form-8889-review-projection).

The charitable election fix at `294b3fe8` preserves unknown nonitemizer-only
charity answers on explicitly itemized 2026 returns. GitHub unit and coverage
each passed 29,472 tests with 88.32% branch coverage. With the corrected source
hashes from `a65780e7`, the managed local browser run passed 650 cases with five
original hosted skips. Automatic production builds are disabled.
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

Read `activeContinuation.nov20CombinedQualification` for the preceding
combined CI, runtime and diagnostic evidence.
Read `activeContinuation.nov20CapitalLossCarryoverBelowLimit` for the newer
Schedule D correction and its exact verification runs.
Read `activeContinuation.nov20OhioUnemploymentPaymentSchedule` for the newest
Ohio work. Resume with `activeContinuation.nov20StatementAndBrowserContinuation` for
the latest application source, check runs and bounded trace findings. Earlier
packages are indexed by `latestGeminiRejectedUsageSettlement`,
`latestGuidedOhioUnemploymentPaymentProof`,
`latestBrowserRecoveryComparison`, `latestScheduleAPropertyTaxSourceYear`,
`latestOhioNonresidentUnemployment`,
`latestChildTaxCreditRawRelationship`, `latestChildTaxCreditRelationship`,
`latestForm8889OrdinaryProjection`,
`latestItemizedCharityElection` and `latestBrowserRequestAssertions` under
`activeContinuation.nov19TaxAndBrowserContinuation` in
[the checkpoint](upgrade-2026-checkpoint.json) and the first entries in
[the progress log](upgrade-2026-progress.md). Read the named package only.
Keep a single watcher for each run. After compaction, retain the source commit,
live run IDs, dirty owned files, next action and evidence paths.
The [execution brief](upgrade-2026-execution-brief.md) remains the complete scope.

| Package | Verified state and next action |
| --- | --- |
| Child Tax Credit facts | The guided interview and Schedule 8812 eligibility now hold CTC claims with explicit parent, grandparent or other qualifying-relative answers. Confirmed ODC and qualifying half-sibling cases pass, including actual 2025 Form 1040 line 19. The 2026 eligibility check passes. [Relationship evidence](upgrade-2026-progress.md#november-19-child-tax-credit-relationship-checks). |
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
| Self-host recovery | Linux ARM64 at `d33e77d5` passed smoke, six Compose recovery phases and cleanup. Its strict browser run passed 639 cases, with 11 original 30-second deadlines and five original skips. The Mac preflight found 560.76 GiB free with every Podman VM stopped. The reviewed Mac controller requires an already-running idle default VM to verify the original stores. [Exact ARM64 job](https://github.com/utilityfueled/tax-engine/actions/runs/44641897067/job/135989769132). |

Qualified human tax and AI reviews, applicable final annual forms, and final
hosted evidence remain open. No qualified human has accepted the tax review.
Cybersecurity work is deferred at the owner's direction. The existing release
gates still require independent security/privacy review and advisory
disposition. Gemini requires Google access if selected for qualification.
Formal verification remains excluded. [External actions](upgrade-2026-external-actions.md),
[official-source refresh](upgrade-2026-official-source-refresh-20261117-continuation.md),
[provider catalog](upgrade-2026-provider-catalog-20261117.md).
