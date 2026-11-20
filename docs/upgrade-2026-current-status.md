# Current 2026 upgrade status

Application `8486eca8` reads a separated Box 1a amount on the December
2026 Form 1099-NEC Copy B when the printed layout and the field position
agree. The rendered IRS page with a synthetic amount returned exactly
$3,210.09. Blank, contradictory and rotated controls preserved manual
review. The adjacent-column control yielded only the Box 1a suggestion.
Both the populated and blank official pages passed upload and reopen in
the local production browser build.
Ninety-seven focused tests, all eight static checks and 9,717 spec references
passed. Both complete local suites passed 29,589 tests at 88.45% branch
coverage. The audit hash refresh `3663cf3e` and diagnostic digest refresh
`f1e6f6a8` restored all 35 timing-contract checks. The exact
`f1e6f6a8` protected test-mode Preview passed all 12 synthetic lifecycle
checks. The complete managed macOS and Linux browser runs each passed
650 cases with five original skips. All six exact GitHub CI checks
passed. Strict AMD64 passed Compose recovery and ran 637 successful
browser cases, with eleven Ohio deadlines, two RRTA saved-PDF inspection
timeouts and five original skips. Strict ARM64 passed image smoke,
Compose recovery and cleanup, with 640 browser passes, ten Ohio
deadlines and five original skips. Both strict browser gates remain
open.
[Copy B evidence](upgrade-2026-progress.md#november-20-printed-1099-nec-copy-b).

Application `8201d316` passed 29,588 tests in both exact local suites at
88.45% branch coverage. All six exact GitHub CI jobs, both builds, all
three type checks, lint, spec references, the inventory, 37 education
browser cases, and 12 protected
test-mode Preview lifecycle checks passed. The exact macOS managed suite
passed 650 cases with five original skips. Managed Linux passed 648 with
two RRTA saved-PDF inspection timeouts and five original skips. Strict
AMD64 passed image smoke and Compose recovery and recorded 648 browser
passes, two Ohio school deadlines and five original skips. Strict ARM64
passed image smoke, Compose recovery and cleanup, with 642 browser
passes, eight Ohio deadlines and five original skips.
[Form 8863 evidence](upgrade-2026-progress.md#november-20-form-8863-adult-student-tin-reconciliation) ·
[Exact CI](https://github.com/utilityfueled/tax-engine/actions/runs/44765989343).

The IRS archived blank Form 1095-A now contributes only the manual review
prompt under its historical 2025 filename alias. A browser run on the earlier
revision reproduced synthetic premiums on that blank. Saved workspace facts
are rebuilt from their original documents. Reopening a return clears the fake
amounts from the live view. The next normal save clears them from the stored
record. The review prompt and any saved response are retained.
[Marketplace evidence](upgrade-2026-progress.md#november-20-marketplace-filename-and-saved-workspaces).

Registry filenames now provide document labels and review prompts. The
workspace gets financial values from supported detected sources and manual
input. Independent replay cleared stale synthetic values from eight legacy
aliases. The combined upload corrections passed 63 guided, workspace and
recovery browser cases on Node 26.13.1.
[Information return evidence](upgrade-2026-progress.md#november-20-dividend-government-oid-and-hsa-filename-facts).

An exact unit run on the information-return revision exposed seven failures
in the Ohio School browser test harness. The repair in `96a9179f` passed
29,579 tests in both the exact unit and coverage runs on Node 26.13.1.
Branch coverage was 88.45%, and all eight static checks passed. The
earlier application passed 650 managed macOS browser cases with five
original skips. The protected test-mode Preview passed all 12
cross-revision lifecycle checks. The original unit failures remain in the
evidence.
[Ohio School harness](upgrade-2026-progress.md#november-20-ohio-school-snapshot-harness) ·
[Annual availability recheck](upgrade-2026-official-source-refresh-20261117-continuation.md#november-20-annual-availability-recheck).

The exact `c3d87e32` managed macOS browser run passed 650 cases with five
original skips. Its unit and coverage runs each passed 29,559 tests at
88.37% branch coverage. A separate test-only Ohio School District change
passed four local cases at the existing 30-second deadline. Strict Linux
qualification remains open. A separate Ohio app change passed 14 local
browser cases covering reciprocal wages, business, resident credit, and
School District returns at the same deadline.
[Ohio school evidence](upgrade-2026-progress.md#november-20-ohio-school-mutation-controls).
[Ohio app evidence](upgrade-2026-progress.md#november-20-ohio-draft-comparison).

The latest application revision with a verified protected Preview is
`012e6ee1` on `main`. Exact unit and coverage runs each passed 29,556
tests at 88.37% branch coverage. All six exact GitHub CI jobs, both builds,
all three type checks, lint, 9,693 spec references, the inventory, Docker and eight
scoped browser cases passed. The protected test-mode Preview passed
all 12 workspace lifecycle checks. The complete managed browser suites
passed 650 cases each on macOS and Linux. The strict Linux browser runs
reached ten Ohio deadlines on AMD64 and nine on ARM64.
[Exact application and Preview evidence](upgrade-2026-progress.md#november-20-exact-012e6ee1-local-verification).

On previous application `29988f04`, local unit and coverage runs each
passed 29,549 tests at 88.37% branch coverage. The first exact CI
attempt passed five jobs. The unit job had one Pennsylvania PDF test reach
its five-second deadline. The unchanged unit-job retry passed, bringing
the exact run to six successful jobs. Test-only commit `3a1f8156`
retained that deadline and passed all 94 scoped PDF tests.
[CI](https://github.com/utilityfueled/tax-engine/actions/runs/44725543701) ·
[Web and AMD64](https://github.com/utilityfueled/tax-engine/actions/runs/44725543747) ·
[ARM64](https://github.com/utilityfueled/tax-engine/actions/runs/44725578957).

The full managed browser job passed 648 cases, skipped five, and hit the
four-second saved-PDF inspector deadline on both RRTA cases. Strict AMD64
passed 640 cases with ten Ohio deadlines. Strict ARM64 passed 641 cases
with eight Ohio deadlines and one Pennsylvania desktop deadline. Both
strict jobs retained five skips and passed their Compose recovery and
cleanup steps.
[Exact runtime evidence](upgrade-2026-progress.md#november-20-exact-29988f04-browser-results).

Prior `074a4fa9` passed all six CI jobs, 650 managed browser cases, and six
local recovery cases. Both strict Linux images passed their recovery steps.
Eight AMD64 and eleven ARM64 browser cases reached the existing deadlines.
[Prior exact browser and recovery evidence](upgrade-2026-progress.md#november-20-incomplete-ohio-guided-validation).

On prior application `d8a9f108`, Form 8863 holds
conflicting 2026 employment-valid SSN answers from the return household,
claimant or matched adult student. Its focused education and browser checks,
both builds, types, lint, inventory and 9,674 spec references passed. Exact
local unit and coverage each passed 29,525 tests with 88.36% branch coverage.
All six exact CI jobs, Docker and 650 managed browser cases passed. Strict
AMD64 passed Compose recovery and archive import with ten Ohio browser
deadlines. Both browser jobs preserved the five original skips.
[Reconciliation evidence](upgrade-2026-progress.md#november-20-form-8863-claimant-and-student-ssn-reconciliation) ·
[Exact CI](https://github.com/utilityfueled/tax-engine/actions/runs/44711171955) ·
[Exact browser jobs](https://github.com/utilityfueled/tax-engine/actions/runs/44711171830).

On prior application `cf43e9ea`, all six exact GitHub CI jobs passed. Two saved RRTA PDF inspections timed out
in the full managed browser suite. Both passed an exact scoped macOS replay.
Strict AMD64 passed smoke, Compose recovery, archive import and cleanup, with
eight original Ohio browser deadlines.
The focused Ohio comparison passed all ten cases in each runtime on the same
AMD64 runner.
[CI](https://github.com/utilityfueled/tax-engine/actions/runs/44700308280) ·
[Web](https://github.com/utilityfueled/tax-engine/actions/runs/44700308191) ·
[Ohio comparison](https://github.com/utilityfueled/tax-engine/actions/runs/44699380902).

| Package | Current evidence and remaining criterion |
| --- | --- |
| Taxpayer facts and federal law | The latest [adult student TIN reconciliation](upgrade-2026-progress.md#november-20-form-8863-adult-student-tin-reconciliation), [claimant DOB](upgrade-2026-progress.md#november-20-form-8863-claimant-birth-date) and [K-1 source-year](upgrade-2026-progress.md#november-20-future-year-schedule-k-1-originals) fixes passed. Qualified independent tax interpretations and expected outputs remain open. |
| State and form exports | PA and Ohio are selected for full-year residents, part-year residents and nonresidents. Final Schedule EIC, Form 7206 and Form 8829 blanks are pinned as disabled candidates. The current final Form 1040, annual instructions and Tax/EIC tables still print 2025. Qualification of the maps, scenarios and federal/state transfers remains open. [Official sources](upgrade-2026-official-source-refresh-20261117-continuation.md). |
| AI routing and exact billing | Forty-five tests against PostgreSQL include both sides of a UTC pricing rollover and exact provider cost independent of retail credits. Independent labels, held-out assessment, repeated live qualification and selected Google project access remain open. [Pricing evidence](upgrade-2026-progress.md#november-20-exact-postgresql-billing-at-the-utc-rollover) · [Provider evidence](upgrade-2026-provider-catalog-20261117.md). |
| Hosted recovery | Current `f1e6f6a8` passed all 12 protected Preview workspace lifecycle checks, including save, reopen, deletion and both sign-outs. Earlier evidence covers email delivery, Stripe scheduled retry, and isolated 11-table migration, rollback and restore. Full current-source hosted billing qualification remains open. [Current Preview](upgrade-2026-progress.md#november-20-printed-1099-nec-copy-b) · [Stripe](upgrade-2026-stripe-scheduled-retry-20261114.md) · [Migration](upgrade-2026-progress.md#november-19-persistent-preview-migration-and-restore). |
| Self-host recovery | Current strict AMD64 passed Compose recovery, with 637 browser passes, eleven Ohio deadlines, two saved-PDF inspection timeouts and five original skips. Current strict ARM64 passed image smoke, Compose recovery and cleanup, with 640 browser passes, ten Ohio deadlines and five original skips. The managed macOS and Linux suites each passed 650 browser cases. Strict Linux runtime qualification remains open. [Strict AMD64](https://github.com/utilityfueled/tax-engine/actions/runs/44779201726/job/136437051827) · [Strict ARM64](https://github.com/utilityfueled/tax-engine/actions/runs/44781102129/job/136455005435). |
| Security and release | Cybersecurity work is deferred at the owner's direction. Independent security/privacy review and advisory disposition remain release criteria. Production automatic builds stay disabled. Filing and model promotion remain closed. [External actions](upgrade-2026-external-actions.md). |

Read `activeContinuation.nov20ScheduleEicExactVerification`,
`nov20AnnualCandidatesAndGuidedRehearsal`,
`nov20OhioIncompleteGuidedValidation` or `nov20HostedEducationCrossRevision` in the
[checkpoint](upgrade-2026-checkpoint.json) for exact runs and evidence paths.
Earlier verification remains in the [progress log](upgrade-2026-progress.md).
The [execution brief](upgrade-2026-execution-brief.md) defines completion.
