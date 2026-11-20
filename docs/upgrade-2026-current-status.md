# Current 2026 upgrade status

The latest application revision is `cf43e9ea` on `main`. It validates the
claimant's birth date before deriving age for the refundable American
Opportunity Credit. Full local unit and coverage runs each passed 29,516
tests, with 88.36% branch coverage against the 85% threshold. Both targeted
education browser cases, all three type checks, both builds, full lint,
inventory, 9,672 spec references and exact Docker passed.
[Education evidence](upgrade-2026-progress.md#november-20-form-8863-claimant-birth-date).

All six exact GitHub CI jobs passed. Two saved RRTA PDF inspections timed out
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
| Hosted recovery | The exact protected Preview passed all nine synthetic workspace lifecycle checks and cleanup. Earlier Preview evidence covers recovery-email delivery, Stripe scheduled retry, and isolated 11-table migration, rollback and restore. Full current-source hosted recovery and billing qualification remain open. [Current Preview](upgrade-2026-progress.md#november-20-form-8863-claimant-birth-date) · [Stripe](upgrade-2026-stripe-scheduled-retry-20261114.md) · [Migration](upgrade-2026-progress.md#november-19-persistent-preview-migration-and-restore). |
| Self-host recovery | ARM64 image smoke, Compose recovery and cleanup passed at `0836c5fe`. Its strict browser suite reached 11 original deadlines. Both focused Ohio comparisons passed, with and without the container on Linux and with and without a locator change on macOS. [Runtime evidence](upgrade-2026-progress.md#november-20-ohio-browser-deadline-comparison). |
| Security and release | Cybersecurity work is deferred at the owner's direction. Independent security/privacy review and advisory disposition remain release criteria. Production automatic builds stay disabled. Filing and model promotion remain closed. [External actions](upgrade-2026-external-actions.md). |

Read the named `activeContinuation.nov20Form8863ClaimantBirthDate` and
`activeContinuation.nov20OhioBrowserDeadlineComparison` entries in the
[checkpoint](upgrade-2026-checkpoint.json) for exact runs and evidence paths.
Earlier verification remains in the [progress log](upgrade-2026-progress.md).
The [execution brief](upgrade-2026-execution-brief.md) defines completion.
