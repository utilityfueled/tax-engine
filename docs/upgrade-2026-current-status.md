# Current 2026 upgrade status

The latest application revision is `074a4fa9` on `main`. It removes a duplicate
parse during incomplete Ohio entry. All 1,980 guided tests and six managed
desktop/mobile journeys passed. Exact local unit and coverage each passed
29,529 tests with 88.36% branch coverage. Native ARM64 image smoke and
Compose recovery passed, and the strict browser job is still running. All
six local browser backup and recovery cases passed.
[Ohio evidence](upgrade-2026-progress.md#november-20-incomplete-ohio-guided-validation) ·
[Exact CI](https://github.com/utilityfueled/tax-engine/actions/runs/44713489925) ·
[Exact browser jobs](https://github.com/utilityfueled/tax-engine/actions/runs/44713489750) ·
[Exact ARM64 run](https://github.com/utilityfueled/tax-engine/actions/runs/44714431758).

On prior application `d8a9f108`, Form 8863 holds
conflicting 2026 employment-valid SSN answers from the return household,
claimant or matched adult student. Its focused education and browser checks,
both builds, types, lint, inventory and 9,674 spec references passed. Exact
local unit and coverage each passed 29,525 tests with 88.36% branch coverage.
All six exact CI jobs, Docker and 650 managed browser cases passed. Five
original browser skips remained.
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
| Taxpayer facts and federal law | The latest [claimant DOB](upgrade-2026-progress.md#november-20-form-8863-claimant-birth-date) and [K-1 source-year](upgrade-2026-progress.md#november-20-future-year-schedule-k-1-originals) fixes passed. Qualified independent tax interpretations and expected outputs remain open. |
| State and form exports | PA and Ohio are selected for full-year residents, part-year residents and nonresidents. Applicable final 2026 annual materials and qualification of their maps, scenarios and federal/state transfers are still required. [Official sources](upgrade-2026-official-source-refresh-20261117-continuation.md). |
| AI routing and exact billing | The exact date/offset fix passed full checks. Cost and usage are tracked independently of retail credits. Independent labels, held-out assessment, repeated live qualification and selected Google project access remain open. [Pricing](upgrade-2026-progress.md#november-20-exact-ai-pricing-dates) · [Provider evidence](upgrade-2026-provider-catalog-20261117.md). |
| Hosted recovery | `cf43e9ea` and `074a4fa9` passed all 12 protected Preview education workspace checks, including save, reopen, deletion and both sign-outs. Earlier evidence covers email delivery, Stripe scheduled retry, and isolated 11-table migration, rollback and restore. Full current-source hosted recovery and billing qualification remain open. [Current Preview](upgrade-2026-progress.md#november-20-hosted-education-workspace-across-two-preview-revisions) · [Stripe](upgrade-2026-stripe-scheduled-retry-20261114.md) · [Migration](upgrade-2026-progress.md#november-19-persistent-preview-migration-and-restore). |
| Self-host recovery | ARM64 image smoke and Compose recovery passed at `074a4fa9`. Its strict suite was still running. Earlier `0836c5fe` reached 11 original deadlines and passed cleanup. Focused Ohio comparisons passed in both runtime modes on Linux. [Runtime evidence](upgrade-2026-progress.md#november-20-incomplete-ohio-guided-validation) · [Earlier comparison](upgrade-2026-progress.md#november-20-ohio-browser-deadline-comparison). |
| Security and release | Cybersecurity work is deferred at the owner's direction. Independent security/privacy review and advisory disposition remain release criteria. Production automatic builds stay disabled. Filing and model promotion remain closed. [External actions](upgrade-2026-external-actions.md). |

Read `activeContinuation.nov20OhioIncompleteGuidedValidation`,
`nov20HostedEducationCrossRevision` or `nov20Form8863HouseholdSsn` in the
[checkpoint](upgrade-2026-checkpoint.json) for exact runs and evidence paths.
Earlier verification remains in the [progress log](upgrade-2026-progress.md).
The [execution brief](upgrade-2026-execution-brief.md) defines completion.
