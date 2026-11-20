# Current 2026 upgrade status

The latest application revision with a verified protected Preview is
`29988f04` on `main`. The guided
Pennsylvania preview avoids a duplicate calculation, and the progress rail
recenters when navigation changes. Two Pennsylvania and six mobile/Ohio
browser cases passed under the original 30-second limits. All six exact
local workspace recovery cases and all ten exact local Ohio strict cases
passed. The disabled 2026 Forms 7206 and
8829 candidates have independently checked PDF hashes and field geometry.
[Application evidence](upgrade-2026-progress.md#november-20-guided-progress-rail-on-ordinary-edits) ·
[Form evidence](upgrade-2026-progress.md#november-20-final-form-7206-and-form-8829-physical-candidates).

Exact local unit and coverage runs each passed 29,549 tests at 88.37%
branch coverage. Both builds, all three type checks, lint, 9,686 spec
references, and the regenerated inventory passed. The first exact CI
attempt passed five jobs. The unit job had one Pennsylvania PDF test reach
its five-second deadline. Test-only commit `3a1f8156` retained that deadline
and passed all 94 scoped PDF tests.
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
| Taxpayer facts and federal law | The latest [claimant DOB](upgrade-2026-progress.md#november-20-form-8863-claimant-birth-date) and [K-1 source-year](upgrade-2026-progress.md#november-20-future-year-schedule-k-1-originals) fixes passed. Qualified independent tax interpretations and expected outputs remain open. |
| State and form exports | PA and Ohio are selected for full-year residents, part-year residents and nonresidents. Final Schedule EIC, Form 7206 and Form 8829 blanks are pinned as disabled candidates. The current final Form 1040, annual instructions and Tax/EIC tables still print 2025. Qualification of the maps, scenarios and federal/state transfers remains open. [Official sources](upgrade-2026-official-source-refresh-20261117-continuation.md). |
| AI routing and exact billing | Forty-five tests against PostgreSQL include both sides of a UTC pricing rollover and exact provider cost independent of retail credits. Independent labels, held-out assessment, repeated live qualification and selected Google project access remain open. [Pricing evidence](upgrade-2026-progress.md#november-20-exact-postgresql-billing-at-the-utc-rollover) · [Provider evidence](upgrade-2026-provider-catalog-20261117.md). |
| Hosted recovery | `cf43e9ea` and `29988f04` passed all 12 protected Preview education workspace checks, including save, reopen, deletion and both sign-outs. Earlier evidence covers email delivery, Stripe scheduled retry, and isolated 11-table migration, rollback and restore. Full current-source hosted recovery and billing qualification remain open. [Current Preview](upgrade-2026-progress.md#november-20-exact-29988f04-local-and-protected-preview) · [Stripe](upgrade-2026-stripe-scheduled-retry-20261114.md) · [Migration](upgrade-2026-progress.md#november-19-persistent-preview-migration-and-restore). |
| Self-host recovery | Exact `29988f04` AMD64 and ARM64 passed image smoke, Compose recovery and cleanup. Full strict browser deadlines remain open on both architectures. Focused Ohio comparisons previously passed in both runtime modes on Linux. [Runtime evidence](upgrade-2026-progress.md#november-20-exact-29988f04-browser-results) · [Earlier comparison](upgrade-2026-progress.md#november-20-ohio-browser-deadline-comparison). |
| Security and release | Cybersecurity work is deferred at the owner's direction. Independent security/privacy review and advisory disposition remain release criteria. Production automatic builds stay disabled. Filing and model promotion remain closed. [External actions](upgrade-2026-external-actions.md). |

Read `activeContinuation.nov20AnnualCandidatesAndGuidedRehearsal`,
`nov20OhioIncompleteGuidedValidation` or `nov20HostedEducationCrossRevision` in the
[checkpoint](upgrade-2026-checkpoint.json) for exact runs and evidence paths.
Earlier verification remains in the [progress log](upgrade-2026-progress.md).
The [execution brief](upgrade-2026-execution-brief.md) defines completion.
